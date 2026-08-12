import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { InlineLanguageSwitcher } from '../../shared/InlineLanguageSwitcher';
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

type RatingScaleProps = {
    value: number;
    max: number;
    onChange: (value: number) => void;
    ariaLabelPrefix: string;
};

/** Tailwind preflight (transparent textarea) + touch cihazlarda üst katman touchAction engelini aş */
const SURVEY_TEXTAREA_PROPS = {
    className:
        'w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 outline-none text-slate-800 font-medium resize-none bg-white',
    style: {
        touchAction: 'auto' as const,
        WebkitUserSelect: 'text' as const,
        userSelect: 'text' as const,
        backgroundColor: '#ffffff',
        color: '#0f172a',
        position: 'relative' as const,
        zIndex: 3,
    },
    onPointerDown: (e: React.PointerEvent<HTMLTextAreaElement>) => e.stopPropagation(),
    onClick: (e: React.MouseEvent<HTMLTextAreaElement>) => e.stopPropagation(),
};

/** Tailwind preflight button reset (transparent bg + color:inherit) ile uyumlu, dokunmatik dostu puan seçici */
function RatingScale({ value, max, onChange, ariaLabelPrefix }: RatingScaleProps) {
    return (
        <div className="flex flex-wrap gap-2.5" style={{ touchAction: 'manipulation' }}>
            {Array.from({ length: max }, (_, i) => i + 1).map(star => {
                const selected = star <= value;
                return (
                    <button
                        key={star}
                        type="button"
                        aria-pressed={selected}
                        aria-label={`${ariaLabelPrefix} ${star}`}
                        onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onChange(star);
                        }}
                        onPointerDown={e => e.stopPropagation()}
                        style={{
                            width: 52,
                            height: 52,
                            minWidth: 52,
                            minHeight: 52,
                            borderRadius: 14,
                            border: selected ? '2px solid #b45309' : '2px solid #94a3b8',
                            backgroundColor: selected ? '#fbbf24' : '#ffffff',
                            color: '#0f172a',
                            fontSize: 20,
                            fontWeight: 800,
                            lineHeight: 1,
                            cursor: 'pointer',
                            touchAction: 'manipulation',
                            WebkitTapHighlightColor: 'transparent',
                            boxShadow: selected ? '0 4px 12px rgba(245, 158, 11, 0.35)' : '0 1px 3px rgba(15, 23, 42, 0.08)',
                            position: 'relative',
                            zIndex: 2,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                        className="transition-transform active:scale-95 select-none"
                    >
                        {star}
                    </button>
                );
            })}
        </div>
    );
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
    const [questionsLoading, setQuestionsLoading] = useState(false);

    useEffect(() => {
        if (!open || !customerId) {
            setActiveSurvey(null);
            setSurveyQuestions([]);
            setDynAnswers({});
            setQuestionsLoading(false);
            return;
        }
        let cancelled = false;
        setQuestionsLoading(true);
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
            setQuestionsLoading(false);
        }).catch(() => {
            if (!cancelled) {
                setActiveSurvey(null);
                setSurveyQuestions([]);
                setDynAnswers({});
                setQuestionsLoading(false);
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

    useEffect(() => {
        if (!open || typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('beauty-survey-overlay-open'));
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.dispatchEvent(new CustomEvent('beauty-survey-overlay-close'));
            document.body.style.overflow = prevOverflow;
        };
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
                    comment: feedbackComment || undefined,
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
                    comment: feedbackComment || undefined,
                    would_recommend: feedbackRatings.overall >= 4,
                };
            }
            if (appointmentId) {
                await beautyService.upsertFeedbackForAppointment({
                    ...payload,
                    appointment_id: appointmentId,
                    customer_id: customerId,
                });
            } else {
                await beautyService.addFeedback(payload);
            }
            toast.success(tm('bSurveySavedToProfile'));
            onSaved?.();
            onClose();
        } catch (e) {
            logger.crudError('BeautyFeedbackSurveyModal', 'saveFeedback', e);
            toast.error(tm('bSurveySaveFailed'));
        } finally {
            setFeedbackSaving(false);
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
        tm,
    ]);

    if (!open || !customerId || typeof document === 'undefined') return null;

    const headerTitle =
        variant === 'appointment_completed' ? tm('bAppointmentCompletedTitle') : tm('bSurveyStandaloneTitle');
    const headerSubtitle =
        variant === 'appointment_completed'
            ? (appointmentSubtitle ?? '')
            : [customerName, appointmentSubtitle].filter(Boolean).join(' — ');

    const isRtl = language === 'ar' || language === 'ku';

    return createPortal(
        <div
            className="fixed inset-0 z-[2147483646] flex flex-col bg-white min-h-0 overflow-hidden"
            style={{
                color: '#0f172a',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100dvh',
                maxWidth: '100vw',
            }}
            dir={isRtl ? 'rtl' : 'ltr'}
            role="dialog"
            aria-modal="true"
        >
            <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-5 text-white shrink-0 sm:px-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <CheckCircle2 className="w-6 h-6 shrink-0" />
                        <div className="min-w-0">
                            <h2 className="text-xl font-black uppercase tracking-tight truncate">{headerTitle}</h2>
                            {headerSubtitle ? (
                                <p className="text-emerald-100 text-xs font-semibold uppercase tracking-wider mt-0.5 opacity-90 truncate">
                                    {headerSubtitle}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <InlineLanguageSwitcher variant="onColor" />
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                            aria-label={tm('close')}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 sm:p-8 pb-28 relative z-[1]">
                <div className="mx-auto w-full max-w-3xl">
                    <p className="text-sm font-bold mb-6" style={{ color: '#334155' }}>
                        {questionsLoading
                            ? tm('loading')
                            : activeSurvey && surveyQuestions.length
                              ? tm('bSurveyFillDynamic')
                              : tm('bFeedbackOptional')}
                    </p>

                    {questionsLoading ? (
                        <p className="text-sm" style={{ color: '#64748b' }}>
                            {tm('loading')}
                        </p>
                    ) : null}

                    {!questionsLoading && activeSurvey && surveyQuestions.length > 0
                        ? surveyQuestions.map((q, index) => {
                              const label = questionLabel(q, language);
                              if (q.question_type === 'rating') {
                                  const max = Math.min(10, Math.max(2, q.scale_max || 5));
                                  const cur = typeof dynAnswers[q.id] === 'number'
                                      ? (dynAnswers[q.id] as number)
                                      : Math.min(5, max);
                                  return (
                                      <div key={q.id} className="mb-6 pb-6 border-b border-slate-100 last:border-0">
                                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                              <p className="text-sm font-semibold" style={{ color: '#334155' }}>
                                                  <span style={{ color: '#94a3b8' }} className="mr-2">{index + 1}.</span>
                                                  {label || '—'}
                                              </p>
                                              <span
                                                  className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg"
                                                  style={{ backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}
                                              >
                                                  {tm('bSurveySelectedScore')}: {cur}/{max}
                                              </span>
                                          </div>
                                          <RatingScale
                                              value={cur}
                                              max={max}
                                              ariaLabelPrefix={label || tm('bSurveyTypeRating')}
                                              onChange={star => setDynAnswers(r => ({ ...r, [q.id]: star }))}
                                          />
                                      </div>
                                  );
                              }
                              if (q.question_type === 'text') {
                                  return (
                                      <div key={q.id} className="mb-6 pb-6 border-b border-slate-100 last:border-0">
                                          <p className="text-sm font-semibold text-slate-700 mb-3">
                                              <span className="text-slate-400 mr-2">{index + 1}.</span>
                                              {label || '—'}
                                          </p>
                                          <textarea
                                              {...SURVEY_TEXTAREA_PROPS}
                                              value={(dynAnswers[q.id] as string) ?? ''}
                                              onChange={e => setDynAnswers(r => ({ ...r, [q.id]: e.target.value }))}
                                              rows={3}
                                              dir={isRtl ? 'rtl' : 'ltr'}
                                              autoComplete="off"
                                              spellCheck
                                          />
                                      </div>
                                  );
                              }
                              const yn = dynAnswers[q.id] as boolean;
                              return (
                                  <div key={q.id} className="mb-6 pb-6 border-b border-slate-100 last:border-0">
                                      <p className="text-sm font-semibold text-slate-700 mb-3">
                                          <span className="text-slate-400 mr-2">{index + 1}.</span>
                                          {label || '—'}
                                      </p>
                                      <div className="flex gap-3">
                                          <button
                                              type="button"
                                              onClick={e => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  setDynAnswers(r => ({ ...r, [q.id]: true }));
                                              }}
                                              style={{
                                                  flex: 1,
                                                  height: 48,
                                                  borderRadius: 16,
                                                  fontSize: 14,
                                                  fontWeight: 700,
                                                  cursor: 'pointer',
                                                  border: yn === true ? '2px solid #059669' : '1px solid #cbd5e1',
                                                  backgroundColor: yn === true ? '#ecfdf5' : '#f8fafc',
                                                  color: yn === true ? '#065f46' : '#475569',
                                              }}
                                          >
                                              {tm('bSurveyYes')}
                                          </button>
                                          <button
                                              type="button"
                                              onClick={e => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  setDynAnswers(r => ({ ...r, [q.id]: false }));
                                              }}
                                              style={{
                                                  flex: 1,
                                                  height: 48,
                                                  borderRadius: 16,
                                                  fontSize: 14,
                                                  fontWeight: 700,
                                                  cursor: 'pointer',
                                                  border: yn === false ? '2px solid #dc2626' : '1px solid #cbd5e1',
                                                  backgroundColor: yn === false ? '#fef2f2' : '#f8fafc',
                                                  color: yn === false ? '#991b1b' : '#475569',
                                              }}
                                          >
                                              {tm('bSurveyNo')}
                                          </button>
                                      </div>
                                  </div>
                              );
                          })
                        : !questionsLoading ? (
                              [
                                  { key: 'service' as const, label: tm('bFeedbackService') },
                                  { key: 'staff' as const, label: tm('bFeedbackSpecialist') },
                                  { key: 'overall' as const, label: tm('bFeedbackGeneral') },
                              ] as const
                          ).map(({ key, label }) => (
                              <div key={key} className="mb-6">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                      <p className="text-sm font-semibold" style={{ color: '#334155' }}>{label}</p>
                                      <span
                                          className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg"
                                          style={{ backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}
                                      >
                                          {tm('bSurveySelectedScore')}: {feedbackRatings[key]}/5
                                      </span>
                                  </div>
                                  <RatingScale
                                      value={feedbackRatings[key]}
                                      max={5}
                                      ariaLabelPrefix={label}
                                      onChange={star => setFeedbackRatings(r => ({ ...r, [key]: star }))}
                                  />
                              </div>
                          )) : null}

                    <div className="mt-4">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            {tm('bFeedbackComment')}
                        </label>
                        <textarea
                            {...SURVEY_TEXTAREA_PROPS}
                            value={feedbackComment}
                            onChange={e => setFeedbackComment(e.target.value)}
                            placeholder={tm('bFeedbackComment')}
                            rows={4}
                            dir={isRtl ? 'rtl' : 'ltr'}
                            autoComplete="off"
                            spellCheck
                        />
                    </div>
                </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0 relative z-[2]">
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        flex: 1,
                        padding: '12px 16px',
                        borderRadius: 16,
                        border: '2px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#475569',
                        fontWeight: 700,
                        fontSize: 13,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: 'pointer',
                    }}
                >
                    {tm('bFeedbackSkip')}
                </button>
                <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={feedbackSaving || questionsLoading}
                    style={{
                        flex: 2,
                        padding: '12px 16px',
                        borderRadius: 16,
                        border: 'none',
                        backgroundColor: feedbackSaving || questionsLoading ? '#86efac' : '#059669',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: 13,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        cursor: feedbackSaving || questionsLoading ? 'not-allowed' : 'pointer',
                        boxShadow: '0 8px 20px rgba(5, 150, 105, 0.25)',
                    }}
                >
                    {feedbackSaving ? tm('bSaving') : tm('bSaveFeedback')}
                </button>
            </div>
        </div>,
        document.body
    );
}
