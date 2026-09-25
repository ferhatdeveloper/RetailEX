import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { PercentBodySheet } from './PercentBodySheet';
import { PrimaryButton } from './PrimaryButton';
import { FormField } from './FormField';
import { ErrorBanner } from './ScreenChrome';
import {
  addFeedback,
  getActiveSatisfactionSurveyWithQuestions,
  upsertFeedbackForAppointment,
  type BeautySatisfactionQuestion,
  type BeautySatisfactionSurvey,
  type BeautySurveyAnswer,
} from '../api/beautySurveyApi';
import { useThemeStore } from '../store/themeStore';
import { clinicColorsForMode, CLINIC } from '../theme/clinicTokens';
import { palette } from '../theme/colors';

export type BeautySurveyRespondSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  customerId: string;
  customerName?: string | null;
  appointmentId?: string | null;
  appointmentSubtitle?: string | null;
};

function questionLabel(q: BeautySatisfactionQuestion): string {
  const j = q.labels_json || {};
  return j.tr || j.en || j.ar || j.ku || 'Soru';
}

function RatingButtons({
  value,
  max,
  onChange,
  accent,
  border,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  accent: string;
  border: string;
}) {
  return (
    <View style={styles.ratingRow}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const on = n <= value;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={[
              styles.ratingBtn,
              {
                backgroundColor: on ? '#fbbf24' : '#fff',
                borderColor: on ? '#b45309' : border,
              },
            ]}
          >
            <Text style={[styles.ratingBtnText, { color: CLINIC.textPrimary }]}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BeautySurveyRespondSheet({
  visible,
  onClose,
  onSaved,
  customerId,
  customerName,
  appointmentId,
  appointmentSubtitle,
}: BeautySurveyRespondSheetProps) {
  const { colors, darkMode } = useThemeStore();
  const clinic = useMemo(() => clinicColorsForMode(darkMode, colors), [darkMode, colors]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [survey, setSurvey] = useState<BeautySatisfactionSurvey | null>(null);
  const [questions, setQuestions] = useState<BeautySatisfactionQuestion[]>([]);
  const [dynAnswers, setDynAnswers] = useState<Record<string, number | string | boolean>>({});
  const [legacy, setLegacy] = useState({ service: 5, staff: 5, overall: 5 });
  const [comment, setComment] = useState('');
  const [wouldRecommend, setWouldRecommend] = useState(true);

  const load = useCallback(async () => {
    if (!visible || !customerId) return;
    setLoading(true);
    setError(null);
    setComment('');
    setWouldRecommend(true);
    setLegacy({ service: 5, staff: 5, overall: 5 });
    try {
      const { survey: s, questions: qs } = await getActiveSatisfactionSurveyWithQuestions();
      setSurvey(s);
      setQuestions(qs);
      const init: Record<string, number | string | boolean> = {};
      for (const q of qs) {
        if (q.question_type === 'rating') init[q.id] = Math.min(5, q.scale_max || 5);
        else if (q.question_type === 'text') init[q.id] = '';
        else init[q.id] = true;
      }
      setDynAnswers(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSurvey(null);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [visible, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildAnswers = (): BeautySurveyAnswer[] => {
    return questions.map((q) => {
      const v = dynAnswers[q.id];
      const snap = questionLabel(q);
      if (q.question_type === 'rating') {
        return { question_id: q.id, rating: Number(v) || 0, label_snapshot: snap };
      }
      if (q.question_type === 'text') {
        return { question_id: q.id, text: String(v ?? ''), label_snapshot: snap };
      }
      return { question_id: q.id, yes_no: Boolean(v), label_snapshot: snap };
    });
  };

  const validate = (): string | null => {
    for (const q of questions) {
      if (!q.is_required) continue;
      const v = dynAnswers[q.id];
      if (q.question_type === 'text' && !String(v ?? '').trim()) {
        return `Zorunlu soru: ${questionLabel(q)}`;
      }
      if (q.question_type === 'rating' && !(Number(v) > 0)) {
        return `Zorunlu soru: ${questionLabel(q)}`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!customerId) {
      setError('Müşteri gerekli');
      return;
    }
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const hasDyn = questions.length > 0;
      const answers = hasDyn ? buildAnswers() : null;
      let overall = legacy.overall;
      let service = legacy.service;
      let staff = legacy.staff;
      let recommend = wouldRecommend;

      if (hasDyn) {
        const ratingQs = questions.filter((q) => q.question_type === 'rating');
        if (ratingQs.length) {
          const sum = ratingQs.reduce((s, q) => s + (Number(dynAnswers[q.id]) || 0), 0);
          overall = Math.round(sum / ratingQs.length);
          service = Number(dynAnswers[ratingQs[0].id]) || overall;
          staff =
            ratingQs.length > 1
              ? Number(dynAnswers[ratingQs[1].id]) || overall
              : overall;
        }
        const yn = questions.find((q) => q.question_type === 'yes_no');
        if (yn) recommend = Boolean(dynAnswers[yn.id]);
      }

      const payload = {
        customer_id: customerId,
        appointment_id: appointmentId || null,
        service_rating: service,
        staff_rating: staff,
        cleanliness_rating: overall,
        overall_rating: overall,
        comment: comment.trim() || null,
        would_recommend: recommend,
        survey_id: survey?.id ?? null,
        survey_answers: answers,
      };

      if (appointmentId) {
        await upsertFeedbackForAppointment({
          ...payload,
          appointment_id: appointmentId,
          customer_id: customerId,
        });
      } else {
        await addFeedback(payload);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const subtitle =
    appointmentSubtitle ||
    [customerName, survey?.name].filter(Boolean).join(' · ') ||
    'Memnuniyet anketi';

  return (
    <PercentBodySheet
      visible={visible}
      onClose={onClose}
      title="Memnuniyet anketi"
      subtitle={subtitle}
      size="list"
      footer={
        <>
          <PrimaryButton label="İptal" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <PrimaryButton
            label="Kaydet"
            onPress={() => void handleSave()}
            loading={saving}
            disabled={loading || !customerId}
            style={{ flex: 2, backgroundColor: CLINIC.violet }}
          />
        </>
      }
    >
      {error ? <ErrorBanner message={error} onRetry={() => setError(null)} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginVertical: 24 }} color={CLINIC.violet} />
      ) : (
        <View style={styles.body}>
          {questions.length > 0 ? (
            questions.map((q) => (
              <View
                key={q.id}
                style={[
                  styles.qCard,
                  { backgroundColor: clinic.violetSurface, borderColor: clinic.border },
                ]}
              >
                <Text style={[styles.qLabel, { color: clinic.textPrimary }]}>
                  {questionLabel(q)}
                  {q.is_required ? ' *' : ''}
                </Text>
                {q.question_type === 'rating' ? (
                  <RatingButtons
                    value={Number(dynAnswers[q.id]) || 0}
                    max={q.scale_max || 5}
                    onChange={(n) => setDynAnswers((prev) => ({ ...prev, [q.id]: n }))}
                    accent={CLINIC.violet}
                    border={clinic.border}
                  />
                ) : null}
                {q.question_type === 'yes_no' ? (
                  <View style={styles.ynRow}>
                    {[
                      { v: true, label: 'Evet' },
                      { v: false, label: 'Hayır' },
                    ].map((opt) => {
                      const on = Boolean(dynAnswers[q.id]) === opt.v;
                      return (
                        <Pressable
                          key={opt.label}
                          onPress={() => setDynAnswers((prev) => ({ ...prev, [q.id]: opt.v }))}
                          style={[
                            styles.ynBtn,
                            {
                              backgroundColor: on ? palette.green600 : clinic.surface,
                              borderColor: on ? palette.green600 : clinic.border,
                            },
                          ]}
                        >
                          <Text style={{ color: on ? '#fff' : clinic.textPrimary, fontWeight: '700' }}>
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                {q.question_type === 'text' ? (
                  <TextInput
                    value={String(dynAnswers[q.id] ?? '')}
                    onChangeText={(t) => setDynAnswers((prev) => ({ ...prev, [q.id]: t }))}
                    multiline
                    numberOfLines={3}
                    placeholder="Yanıtınız…"
                    placeholderTextColor={clinic.textMuted}
                    style={[
                      styles.textArea,
                      {
                        color: clinic.textPrimary,
                        borderColor: clinic.border,
                        backgroundColor: clinic.surface,
                      },
                    ]}
                  />
                ) : null}
              </View>
            ))
          ) : (
            <View style={styles.legacyBlock}>
              <Text style={[styles.legacyTitle, { color: clinic.textSub }]}>
                Aktif anket yok — klasik puanlama
              </Text>
              {(
                [
                  ['service', 'Hizmet'],
                  ['staff', 'Personel'],
                  ['overall', 'Genel'],
                ] as const
              ).map(([key, label]) => (
                <View key={key} style={{ marginBottom: 12 }}>
                  <Text style={[styles.qLabel, { color: clinic.textPrimary }]}>{label}</Text>
                  <RatingButtons
                    value={legacy[key]}
                    max={5}
                    onChange={(n) => setLegacy((prev) => ({ ...prev, [key]: n }))}
                    accent={CLINIC.violet}
                    border={clinic.border}
                  />
                </View>
              ))}
              <Text style={[styles.qLabel, { color: clinic.textPrimary }]}>Önerir misiniz?</Text>
              <View style={styles.ynRow}>
                {[
                  { v: true, label: 'Evet' },
                  { v: false, label: 'Hayır' },
                ].map((opt) => {
                  const on = wouldRecommend === opt.v;
                  return (
                    <Pressable
                      key={opt.label}
                      onPress={() => setWouldRecommend(opt.v)}
                      style={[
                        styles.ynBtn,
                        {
                          backgroundColor: on ? palette.green600 : clinic.surface,
                          borderColor: on ? palette.green600 : clinic.border,
                        },
                      ]}
                    >
                      <Text style={{ color: on ? '#fff' : clinic.textPrimary, fontWeight: '700' }}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <FormField
            label="Yorum (isteğe bağlı)"
            value={comment}
            onChangeText={setComment}
            placeholder="Görüşleriniz…"
          />
        </View>
      )}
    </PercentBodySheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, paddingBottom: 8 },
  qCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  qLabel: { fontSize: 13, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ratingBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBtnText: { fontSize: 16, fontWeight: '800' },
  ynRow: { flexDirection: 'row', gap: 8 },
  ynBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  legacyBlock: { gap: 4 },
  legacyTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
});
