import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import type { Language } from '../../../locales/translations';
import type {
    BeautySatisfactionQuestion,
    BeautySatisfactionSurvey,
    BeautySurveyAnswer,
} from '../../../types/beauty';

export type BeautyFeedbackSurveyVariant = 'appointment_completed' | 'standalone';

export type BeautyFeedbackSurveyModalProps = {
    open: boolean;
    onClose: () => void;
    onSaved?: () => void;
    customerId: string;
    customerName?: string;
    appointmentId?: string | null;
    /** Randevu tamamlandı modunda: müşteri — hizmet */
    appointmentSubtitle?: string | null;
    variant: BeautyFeedbackSurveyVariant;
};

function questionLabel(q: BeautySatisfactionQuestion, lang: Language) {
    const j = q.labels_json || {};
    return j[lang] || j.tr || j.en || j.ar || j.ku || '';
}

export function BeautyFeedbackSurveyModal({
    open,
    onClose,
    onSaved,
    customerId,
    customerName,
    appointmentId,
    appointmentSubtitle,
    variant,
}: BeautyFeedbackSurveyModalProps) {
    const { tm, language } = useLanguage();
    const [feedbackRatings, setFeedbackRatings] = useState({ service: 5, staff: 5, overall: 5 });
    const [feedbackComment, setFeedbackComment] = useState('');
    const [feedbackSaving, setFeedbackSaving] = useState(false);
    const [activeSurvey, setActiveSurvey] = useState<BeautySatisfactionSurvey | null>(null);
    const [surveyQuestions, setSurveyQuestions] = useState<BeautySatisfactionQuestion[]>([]);
    const [dynAnswers, setDynAnswers] = useState<Record<string, number | string | boolean>>({});

    useEffect(() => {
        if (!open || !customerId) {
            setActiveSurvey(null);
            setSurveyQuestions([]);
            setDynAnswers({});
            return;
        }
        let cancelled = false;
        void beautyService.getActiveSatisfactionSurveyWithQuestions().then(({ survey, questions }) => {
            if (cancelled) return;
            setActiveSurvey(survey);
            setSurveyQuestions(questions);
            const init: Record<string, number | string | boolean> = {};
            for (const q of questions) {
                if (q.question_type === 'rating') {
                    init[q.id] = Math.min(5, q.scale_max || 5);
                } else if (q.question_type === 'text') {
                    init[q.id] = '';
                } else {
                    init[q.id] = true;
                }
            }
            setDynAnswers(init);
        }).catch(() => {
            if (!cancelled) {
                setActiveSurvey(null);
                setSurveyQuestions([]);
                setDynAnswers({});
            }
        });
        return () => {
            cancelled = true;
        };
    }, [open, customerId]);

    useEffect(() => {
        if (!open) {
            setFeedbackRatings({ service: 5, staff: 5, overall: 5 });
            setFeedbackComment('');
        }
    }, [open]);

    const handleSubmit = useCallback(async () => {
        if (!customerId) return;
        setFeedbackSaving(true);
        try {
            let payload: Parameters<typeof beautyService.addFeedback>[0];
            if (activeSurvey && surveyQuestions.length > 0) {
                const answers: BeautySurveyAnswer[] = [];
                for (const q of surveyQuestions) {
                    const v = dynAnswers[q.id];
                    const label_snapshot = questionLabel(q, language);
                    if (q.question_type === 'rating') {
                        const rating = typeof v === 'number' ? v : Math.min(5, q.scale_max || 5);
                        answers.push({ question_id: q.id, rating, label_snapshot });
                    } else if (q.question_type === 'text') {
                        answers.push({
                            question_id: q.id,
                            text: typeof v === 'string' ? v : '',
                            label_snapshot,
                        });
                    } else {
                        answers.push({
                            question_id: q.id,
                            yes_no: typeof v === 'boolean' ? v : true,
                            label_snapshot,
                        });
                    }
                }
                const ratingVals = surveyQuestions
                    .filter(q => q.question_type === 'rating')
                    .map(q => dynAnswers[q.id] as number)
                    .filter(v => typeof v === 'number');
                const avg = ratingVals.length
                    ? Math.round(ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length)
                    : 5;
                const r1 = ratingVals[0] ?? avg;
                const r2 = ratingVals[1] ?? avg;
                const r3 = ratingVals[2] ?? avg;
                payload = {
                    appointment_id: appointmentId ?? undefined,
                    customer_id: customerId,
                    service_rating: r1,
                    staff_rating: r2,
                    cleanliness_rating: r3,
                    overall_rating: avg,
                    comment: feedbackComment || null,
                    would_recommend: avg >= 4,
                    survey_id: activeSurvey.id,
                    survey_answers: answers,
                };
            } else {
                payload = {
                    appointment_id: appointmentId ?? undefined,
                    customer_id: customerId,
                    service_rating: feedbackRatings.service,
                    staff_rating: feedbackRatings.staff,
                    cleanliness_rating: 5,
                    overall_rating: feedbackRatings.overall,
                    comment: feedbackComment || null,
                    would_recommend: feedbackRatings.overall >= 4,
                };
            }
            await beautyService.addFeedback(payload);
            onSaved?.();
        } catch (e) {
            logger.crudError('BeautyFeedbackSurveyModal', 'saveFeedback', e);
        } finally {
            setFeedbackSaving(false);
            onClose();
        }
    }, [
        customerId,
        appointmentId,
        activeSurvey,
        surveyQuestions,
        dynAnswers,
        language,
        feedbackComment,
        feedbackRatings,
        onClose,
        onSaved,
    ]);

    if (!open || !customerId) return null;

    const headerTitle =
        variant === 'appointment_completed' ? tm('bAppointmentCompletedTitle') : tm('bSurveyStandaloneTitle');
    const headerSubtitle =
        variant === 'appointment_completed'
            ? (appointmentSubtitle ?? '')
            : [customerName, appointmentSubtitle].filter(Boolean).join(' — ');

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.45)',
                zIndex: 90,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
            }}
        >
            <div
                style={{
                    background: '#fff',
                    borderRadius: 14,
                    width: '100%',
                    maxWidth: activeSurvey && surveyQuestions.length ? 520 : 400,
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                }}
            >
                <div
                    style={{
                        padding: '16px 20px',
                        background: '#f0fdf4',
                        borderBottom: '1px solid #bbf7d0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                    }}
                >
                    <CheckCircle2 size={20} color="#059669" />
                    <div>
                        <p style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{headerTitle}</p>
                        {headerSubtitle ? (
                            <p style={{ fontSize: 11, color: '#6b7280' }}>{headerSubtitle}</p>
                        ) : null}
                    </div>
                </div>
                <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
                        {activeSurvey && surveyQuestions.length ? tm('bSurveyFillDynamic') : tm('bFeedbackOptional')}
                    </p>
                    {activeSurvey && surveyQuestions.length > 0
                        ? surveyQuestions.map(q => {
                              const label = questionLabel(q, language);
                              if (q.question_type === 'rating') {
                                  const max = Math.min(10, Math.max(2, q.scale_max || 5));
                                  const cur = (dynAnswers[q.id] as number) ?? max;
                                  return (
                                      <div key={q.id} style={{ marginBottom: 12 }}>
                                          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                                              {label || '—'}
                                          </p>
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                              {Array.from({ length: max }, (_, i) => i + 1).map(star => (
                                                  <button
                                                      key={star}
                                                      type="button"
                                                      onClick={() => setDynAnswers(r => ({ ...r, [q.id]: star }))}
                                                      style={{
                                                          width: 30,
                                                          height: 30,
                                                          borderRadius: 6,
                                                          border: 'none',
                                                          cursor: 'pointer',
                                                          background: star <= cur ? '#fbbf24' : '#f3f4f6',
                                                          color: star <= cur ? '#fff' : '#9ca3af',
                                                          fontSize: 12,
                                                          fontWeight: 800,
                                                          transition: 'all 0.1s',
                                                      }}
                                                  >
                                                      {star}
                                                  </button>
                                              ))}
                                          </div>
                                      </div>
                                  );
                              }
                              if (q.question_type === 'text') {
                                  return (
                                      <div key={q.id} style={{ marginBottom: 12 }}>
                                          <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                                              {label || '—'}
                                          </p>
                                          <textarea
                                              value={(dynAnswers[q.id] as string) ?? ''}
                                              onChange={e => setDynAnswers(r => ({ ...r, [q.id]: e.target.value }))}
                                              rows={2}
                                              style={{
                                                  width: '100%',
                                                  border: '1px solid #e5e7eb',
                                                  borderRadius: 6,
                                                  padding: '8px 10px',
                                                  fontSize: 12,
                                                  resize: 'none',
                                                  outline: 'none',
                                                  boxSizing: 'border-box',
                                              }}
                                          />
                                      </div>
                                  );
                              }
                              const yn = dynAnswers[q.id] as boolean;
                              return (
                                  <div key={q.id} style={{ marginBottom: 12 }}>
                                      <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                                          {label || '—'}
                                      </p>
                                      <div style={{ display: 'flex', gap: 8 }}>
                                          <button
                                              type="button"
                                              onClick={() => setDynAnswers(r => ({ ...r, [q.id]: true }))}
                                              style={{
                                                  flex: 1,
                                                  height: 34,
                                                  borderRadius: 6,
                                                  border: yn === true ? '2px solid #059669' : '1px solid #e5e7eb',
                                                  background: yn === true ? '#ecfdf5' : '#f9fafb',
                                                  fontSize: 12,
                                                  fontWeight: 700,
                                                  cursor: 'pointer',
                                                  color: '#374151',
                                              }}
                                          >
                                              {tm('bSurveyYes')}
                                          </button>
                                          <button
                                              type="button"
                                              onClick={() => setDynAnswers(r => ({ ...r, [q.id]: false }))}
                                              style={{
                                                  flex: 1,
                                                  height: 34,
                                                  borderRadius: 6,
                                                  border: yn === false ? '2px solid #dc2626' : '1px solid #e5e7eb',
                                                  background: yn === false ? '#fef2f2' : '#f9fafb',
                                                  fontSize: 12,
                                                  fontWeight: 700,
                                                  cursor: 'pointer',
                                                  color: '#374151',
                                              }}
                                          >
                                              {tm('bSurveyNo')}
                                          </button>
                                      </div>
                                  </div>
                              );
                          })
                        : (
                              [
                                  { key: 'service' as const, label: tm('bFeedbackService') },
                                  { key: 'staff' as const, label: tm('bFeedbackSpecialist') },
                                  { key: 'overall' as const, label: tm('bFeedbackGeneral') },
                              ] as const
                          ).map(({ key, label }) => (
                              <div key={key} style={{ marginBottom: 12 }}>
                                  <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{label}</p>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                      {[1, 2, 3, 4, 5].map(star => (
                                          <button
                                              key={star}
                                              type="button"
                                              onClick={() => setFeedbackRatings(r => ({ ...r, [key]: star }))}
                                              style={{
                                                  width: 32,
                                                  height: 32,
                                                  borderRadius: 6,
                                                  border: 'none',
                                                  cursor: 'pointer',
                                                  background: star <= feedbackRatings[key] ? '#fbbf24' : '#f3f4f6',
                                                  color: star <= feedbackRatings[key] ? '#fff' : '#9ca3af',
                                                  fontSize: 14,
                                                  fontWeight: 800,
                                                  transition: 'all 0.1s',
                                              }}
                                          >
                                              ★
                                          </button>
                                      ))}
                                  </div>
                              </div>
                          ))}
                    <textarea
                        value={feedbackComment}
                        onChange={e => setFeedbackComment(e.target.value)}
                        placeholder={tm('bFeedbackComment')}
                        rows={2}
                        style={{
                            width: '100%',
                            border: '1px solid #e5e7eb',
                            borderRadius: 6,
                            padding: '8px 10px',
                            fontSize: 12,
                            resize: 'none',
                            outline: 'none',
                            boxSizing: 'border-box',
                            marginTop: 8,
                        }}
                    />
                </div>
                <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            flex: 1,
                            height: 38,
                            borderRadius: 6,
                            border: '1px solid #e5e7eb',
                            background: '#f9fafb',
                            color: '#6b7280',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        {tm('bFeedbackSkip')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={feedbackSaving}
                        style={{
                            flex: 2,
                            height: 38,
                            borderRadius: 6,
                            border: 'none',
                            background: '#059669',
                            color: '#fff',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                        }}
                    >
                        {feedbackSaving ? tm('bSaving') : tm('bSaveFeedback')}
                    </button>
                </div>
            </div>
        </div>
    );
}
