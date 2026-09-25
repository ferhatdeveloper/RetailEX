import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Switch,
  Alert,
  ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { BeautySurveyRespondSheet } from '../components/BeautySurveyRespondSheet';
import {
  createSatisfactionQuestion,
  createSatisfactionSurvey,
  deleteSatisfactionQuestion,
  deleteSatisfactionSurvey,
  fetchCompletedAppointmentsForDay,
  fetchSatisfactionQuestions,
  fetchSatisfactionSurveys,
  fetchSurveyResultsSummary,
  getFeedbackAppointmentIds,
  updateSatisfactionQuestion,
  updateSatisfactionSurvey,
  type BeautySatisfactionQuestion,
  type BeautySatisfactionSurvey,
  type SurveyResultsSummary,
} from '../api/beautySurveyApi';
import type { BeautyAppointment } from '../api/beautyApi';
import { formatLocalYmd } from '../components/BeautyCalendarPanel';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { clinicColorsForMode, CLINIC } from '../theme/clinicTokens';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'pending' | 'surveys' | 'results';
type Props = NativeStackScreenProps<MainStackParamList, 'BeautySurvey'>;

function todayYmd(): string {
  return formatLocalYmd(new Date());
}

function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalYmd(d);
}

function qTypeLabel(t: string): string {
  if (t === 'rating') return 'Puan';
  if (t === 'text') return 'Metin';
  if (t === 'yes_no') return 'Evet/Hayır';
  return t;
}

function questionLabel(q: BeautySatisfactionQuestion): string {
  const j = q.labels_json || {};
  return j.tr || j.en || j.ar || j.ku || 'Soru';
}

export function BeautySurveyScreen(_props: Props) {
  const { colors, darkMode } = useThemeStore();
  const clinic = useMemo(() => clinicColorsForMode(darkMode, colors), [darkMode, colors]);
  const orgEpoch = useOrgEpoch();

  const [tab, setTab] = useState<Tab>('pending');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Bekleyen
  const [pendingDate, setPendingDate] = useState(todayYmd);
  const [pending, setPending] = useState<BeautyAppointment[]>([]);
  const [respondTarget, setRespondTarget] = useState<BeautyAppointment | null>(null);

  // Anketler
  const [surveys, setSurveys] = useState<BeautySatisfactionSurvey[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editActive, setEditActive] = useState(false);
  const [questions, setQuestions] = useState<BeautySatisfactionQuestion[]>([]);
  const [savingSurvey, setSavingSurvey] = useState(false);
  const [newQLabel, setNewQLabel] = useState('');

  // Sonuçlar
  const [startYmd, setStartYmd] = useState(() => daysAgoYmd(30));
  const [endYmd, setEndYmd] = useState(todayYmd);
  const [summary, setSummary] = useState<SurveyResultsSummary | null>(null);

  const loadPending = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const apts = await fetchCompletedAppointmentsForDay(pendingDate);
      const fbIds = await getFeedbackAppointmentIds(apts.map((a) => a.id));
      setPending(apts.filter((a) => !fbIds.has(a.id)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [pendingDate, orgEpoch]);

  const loadSurveys = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await fetchSatisfactionSurveys();
      setSurveys(list);
      if (selectedId) {
        const still = list.find((s) => s.id === selectedId);
        if (still) {
          setEditName(still.name);
          setEditActive(still.is_active);
          setQuestions(await fetchSatisfactionQuestions(still.id));
        } else {
          setSelectedId(null);
          setQuestions([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSurveys([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId, orgEpoch]);

  const loadResults = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setSummary(await fetchSurveyResultsSummary(startYmd, endYmd));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [startYmd, endYmd, orgEpoch]);

  useEffect(() => {
    if (tab === 'pending') void loadPending();
    else if (tab === 'surveys') void loadSurveys();
    else void loadResults();
  }, [tab, loadPending, loadSurveys, loadResults]);

  const selectSurvey = async (s: BeautySatisfactionSurvey) => {
    setSelectedId(s.id);
    setEditName(s.name);
    setEditActive(s.is_active);
    setLoading(true);
    try {
      setQuestions(await fetchSatisfactionQuestions(s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSurvey = async () => {
    setSavingSurvey(true);
    setError(null);
    try {
      const id = await createSatisfactionSurvey({
        name: `Anket ${surveys.length + 1}`,
        is_active: surveys.length === 0,
        sort_order: surveys.length,
      });
      await loadSurveys();
      const list = await fetchSatisfactionSurveys();
      const created = list.find((s) => s.id === id);
      if (created) await selectSurvey(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSurvey(false);
    }
  };

  const handleSaveSurvey = async () => {
    if (!selectedId) return;
    setSavingSurvey(true);
    setError(null);
    try {
      await updateSatisfactionSurvey(selectedId, {
        name: editName.trim() || 'Anket',
        is_active: editActive,
      });
      await loadSurveys();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSurvey(false);
    }
  };

  const handleDeleteSurvey = () => {
    if (!selectedId) return;
    Alert.alert('Anketi sil', 'Bu anket ve soruları silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteSatisfactionSurvey(selectedId);
              setSelectedId(null);
              setQuestions([]);
              await loadSurveys();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          })();
        },
      },
    ]);
  };

  const handleAddQuestion = async (type: 'rating' | 'text' | 'yes_no') => {
    if (!selectedId) return;
    const label = newQLabel.trim() || (type === 'rating' ? 'Puan' : type === 'text' ? 'Yorum' : 'Öneri');
    setSavingSurvey(true);
    try {
      await createSatisfactionQuestion({
        survey_id: selectedId,
        question_type: type,
        scale_max: 5,
        is_required: true,
        sort_order: questions.length,
        labels_json: { tr: label },
      });
      setNewQLabel('');
      setQuestions(await fetchSatisfactionQuestions(selectedId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingSurvey(false);
    }
  };

  const handleSaveQuestion = async (q: BeautySatisfactionQuestion) => {
    try {
      await updateSatisfactionQuestion(q.id, {
        labels_json: q.labels_json,
        question_type: q.question_type,
        scale_max: q.scale_max,
        is_required: q.is_required,
        sort_order: q.sort_order,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteQuestion = (id: string) => {
    Alert.alert('Soruyu sil', 'Bu soru silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteSatisfactionQuestion(id);
              if (selectedId) setQuestions(await fetchSatisfactionQuestions(selectedId));
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            }
          })();
        },
      },
    ]);
  };

  const refresh = () => {
    if (tab === 'pending') void loadPending();
    else if (tab === 'surveys') void loadSurveys();
    else void loadResults();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Memnuniyet anketi" subtitle="Bekleyen · Anketler · Sonuçlar" />
      <SegmentTabBar
        value={tab}
        onChange={setTab}
        items={[
          { id: 'pending', label: 'Bekleyen' },
          { id: 'surveys', label: 'Anketler' },
          { id: 'results', label: 'Sonuçlar' },
        ]}
      />
      {error ? <ErrorBanner message={error} onRetry={refresh} /> : null}

      {tab === 'pending' ? (
        <View style={styles.flex}>
          <View style={styles.padH}>
            <FormField
              label="Tarih (YYYY-MM-DD)"
              value={pendingDate}
              onChangeText={setPendingDate}
              placeholder="2026-09-25"
            />
            <PrimaryButton
              label="Listele"
              onPress={() => void loadPending()}
              style={{ backgroundColor: CLINIC.violet, marginBottom: 8 }}
            />
          </View>
          {loading && pending.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={CLINIC.violet} />
          ) : (
            <FlatList
              data={pending}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl refreshing={loading} onRefresh={() => void loadPending()} />
              }
              ListEmptyComponent={
                <EmptyState message="Bu günde anket bekleyen tamamlanmış randevu yok" />
              }
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    if (!item.client_id) {
                      Alert.alert(
                        'Müşteri yok',
                        'Bu randevuya bağlı cari kaydı yok; anket doldurulamaz.',
                      );
                      return;
                    }
                    setRespondTarget(item);
                  }}
                  style={[
                    styles.card,
                    { backgroundColor: clinic.surface, borderColor: clinic.border },
                  ]}
                >
                  <Text style={[styles.cardTitle, { color: clinic.textPrimary }]} numberOfLines={1}>
                    {item.customer_name || 'Müşteri'}
                  </Text>
                  <Text style={{ color: clinic.textSub, fontSize: 12 }}>
                    {[item.appointment_time, item.service_name].filter(Boolean).join(' · ') ||
                      'Tamamlandı'}
                  </Text>
                  <Text style={{ color: CLINIC.violet, fontSize: 11, fontWeight: '700', marginTop: 6 }}>
                    Anket doldur →
                  </Text>
                </Pressable>
              )}
            />
          )}
        </View>
      ) : null}

      {tab === 'surveys' ? (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void loadSurveys()} />
          }
        >
          <PrimaryButton
            label="Yeni anket"
            onPress={() => void handleCreateSurvey()}
            loading={savingSurvey}
            style={{ backgroundColor: CLINIC.violet, marginBottom: 8 }}
          />
          {surveys.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => void selectSurvey(s)}
              style={[
                styles.card,
                {
                  backgroundColor:
                    selectedId === s.id ? clinic.violetLight : clinic.surface,
                  borderColor: selectedId === s.id ? CLINIC.violet : clinic.border,
                },
              ]}
            >
              <View style={styles.rowBetween}>
                <Text style={[styles.cardTitle, { color: clinic.textPrimary, flex: 1 }]}>
                  {s.name}
                </Text>
                {s.is_active ? (
                  <View style={[styles.badge, { backgroundColor: palette.green600 }]}>
                    <Text style={styles.badgeText}>Aktif</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}

          {selectedId ? (
            <View
              style={[
                styles.editor,
                { backgroundColor: clinic.violetSurface, borderColor: clinic.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: clinic.textSub }]}>Anket düzenle</Text>
              <FormField label="Ad" value={editName} onChangeText={setEditName} />
              <View style={styles.rowBetween}>
                <Text style={{ color: clinic.textPrimary, fontWeight: '600' }}>Aktif anket</Text>
                <Switch
                  value={editActive}
                  onValueChange={setEditActive}
                  trackColor={{ true: CLINIC.violet, false: clinic.border }}
                />
              </View>
              <View style={styles.rowGap}>
                <PrimaryButton
                  label="Kaydet"
                  onPress={() => void handleSaveSurvey()}
                  loading={savingSurvey}
                  style={{ flex: 1, backgroundColor: CLINIC.violet }}
                />
                <PrimaryButton
                  label="Sil"
                  variant="ghost"
                  onPress={handleDeleteSurvey}
                  style={{ flex: 1 }}
                />
              </View>

              <Text style={[styles.sectionTitle, { color: clinic.textSub, marginTop: 12 }]}>
                Sorular
              </Text>
              {questions.map((q) => (
                <View
                  key={q.id}
                  style={[styles.qCard, { backgroundColor: clinic.surface, borderColor: clinic.border }]}
                >
                  <FormField
                    label={`${qTypeLabel(String(q.question_type))} (TR)`}
                    value={questionLabel(q)}
                    onChangeText={(t) => {
                      setQuestions((prev) =>
                        prev.map((x) =>
                          x.id === q.id
                            ? { ...x, labels_json: { ...x.labels_json, tr: t } }
                            : x,
                        ),
                      );
                    }}
                  />
                  <View style={styles.rowGap}>
                    <PrimaryButton
                      label="Kaydet"
                      onPress={() => void handleSaveQuestion(q)}
                      style={{ flex: 1, backgroundColor: palette.green600 }}
                    />
                    <PrimaryButton
                      label="Sil"
                      variant="ghost"
                      onPress={() => handleDeleteQuestion(q.id)}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              ))}

              <FormField
                label="Yeni soru metni (TR)"
                value={newQLabel}
                onChangeText={setNewQLabel}
                placeholder="Örn. Genel memnuniyet"
              />
              <View style={styles.rowGap}>
                <PrimaryButton
                  label="+ Puan"
                  onPress={() => void handleAddQuestion('rating')}
                  style={{ flex: 1, backgroundColor: CLINIC.violet }}
                />
                <PrimaryButton
                  label="+ Metin"
                  onPress={() => void handleAddQuestion('text')}
                  style={{ flex: 1, backgroundColor: CLINIC.violet }}
                />
                <PrimaryButton
                  label="+ E/H"
                  onPress={() => void handleAddQuestion('yes_no')}
                  style={{ flex: 1, backgroundColor: CLINIC.violet }}
                />
              </View>
            </View>
          ) : (
            <EmptyState message="Düzenlemek için bir anket seçin" />
          )}
        </ScrollView>
      ) : null}

      {tab === 'results' ? (
        <View style={styles.flex}>
          <View style={styles.padH}>
            <FormField label="Başlangıç" value={startYmd} onChangeText={setStartYmd} />
            <FormField label="Bitiş" value={endYmd} onChangeText={setEndYmd} />
            <PrimaryButton
              label="Sonuçları getir"
              onPress={() => void loadResults()}
              style={{ backgroundColor: CLINIC.violet, marginBottom: 8 }}
            />
          </View>
          {loading && !summary ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={CLINIC.violet} />
          ) : (
            <FlatList
              data={summary?.responses ?? []}
              keyExtractor={(item) => item.id}
              refreshControl={
                <RefreshControl refreshing={loading} onRefresh={() => void loadResults()} />
              }
              ListHeaderComponent={
                summary ? (
                  <View style={styles.summaryRow}>
                    <View
                      style={[
                        styles.summaryCard,
                        { backgroundColor: clinic.violetSurface, borderColor: clinic.border },
                      ]}
                    >
                      <Text style={styles.summaryVal}>{summary.response_count}</Text>
                      <Text style={[styles.summaryLbl, { color: clinic.textSub }]}>Yanıt</Text>
                    </View>
                    <View
                      style={[
                        styles.summaryCard,
                        { backgroundColor: clinic.violetSurface, borderColor: clinic.border },
                      ]}
                    >
                      <Text style={styles.summaryVal}>{summary.avg_overall}</Text>
                      <Text style={[styles.summaryLbl, { color: clinic.textSub }]}>Ort. puan</Text>
                    </View>
                    <View
                      style={[
                        styles.summaryCard,
                        { backgroundColor: clinic.violetSurface, borderColor: clinic.border },
                      ]}
                    >
                      <Text style={styles.summaryVal}>%{summary.recommend_pct}</Text>
                      <Text style={[styles.summaryLbl, { color: clinic.textSub }]}>Öneri</Text>
                    </View>
                  </View>
                ) : null
              }
              ListEmptyComponent={<EmptyState message="Bu aralıkta yanıt yok" />}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.card,
                    { backgroundColor: clinic.surface, borderColor: clinic.border },
                  ]}
                >
                  <View style={styles.rowBetween}>
                    <Text style={[styles.cardTitle, { color: clinic.textPrimary, flex: 1 }]}>
                      {item.customer_name}
                    </Text>
                    <Text style={{ color: CLINIC.violet, fontWeight: '800' }}>
                      {item.overall_rating}★
                    </Text>
                  </View>
                  <Text style={{ color: clinic.textSub, fontSize: 11 }}>
                    {[
                      item.created_at?.slice(0, 16)?.replace('T', ' '),
                      item.would_recommend ? 'Önerir' : 'Önermez',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {item.comment ? (
                    <Text style={{ color: clinic.textPrimary, fontSize: 12, marginTop: 6 }} numberOfLines={3}>
                      {item.comment}
                    </Text>
                  ) : null}
                </View>
              )}
            />
          )}
        </View>
      ) : null}

      <BeautySurveyRespondSheet
        visible={!!respondTarget}
        onClose={() => setRespondTarget(null)}
        onSaved={() => void loadPending()}
        customerId={respondTarget?.client_id || ''}
        customerName={respondTarget?.customer_name}
        appointmentId={respondTarget?.id}
        appointmentSubtitle={
          respondTarget
            ? `${respondTarget.customer_name || 'Müşteri'} — ${respondTarget.appointment_time || ''}`
            : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  padH: { paddingHorizontal: 12 },
  list: { padding: 12, gap: 8, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowGap: { flexDirection: 'row', gap: 8, marginTop: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  editor: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8, gap: 8 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  qCard: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  summaryVal: { fontSize: 20, fontWeight: '800', color: CLINIC.violet },
  summaryLbl: { fontSize: 10, fontWeight: '600', marginTop: 2 },
});
