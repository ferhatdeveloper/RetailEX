import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, X } from 'lucide-react';
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

    if (!open || !customerId || typeof document === 'undefined') return null;

    const headerTitle =
        variant === 'appointment_completed' ? tm('bAppointmentCompletedTitle') : tm('bSurveyStandaloneTitle');
    const headerSubtitle =
        variant === 'appointment_completed'
            ? (appointmentSubtitle ?? '')
            : [customerName, appointmentSubtitle].filter(Boolean).join(' — ');

    return createPortal(
        <div className="fixed inset-0 z-[100000] flex flex-col bg-white min-h-0 overflow-hidden animate-in fade-in duration-200">
            <div className="bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-5 text-white shrink-0 sm:px-8">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
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
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-12 h-12 rounded-2xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors shrink-0"
                        aria-label={tm('close')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 sm:p-8">
                <div className="mx-auto w-full max-w-3xl">
                    <p className="text-sm font-bold text-slate-700 mb-6">
                        {activeSurvey && surveyQuestions.length ? tm('bSurveyFillDynamic') : tm('bFeedbackOptional')}
                    </p>

                    {activeSurvey && surveyQuestions.length > 0
                        ? surveyQuestions.map((q, index) => {
                              const label = questionLabel(q, language);
                              if (q.question_type === 'rating') {
                                  const max = Math.min(10, Math.max(2, q.scale_max || 5));
                                  const cur = (dynAnswers[q.id] as number) ?? max;
                                  return (
                                      <div key={q.id} className="mb-6 pb-6 border-b border-slate-100 last:border-0">
                                          <p className="text-sm font-semibold text-slate-700 mb-3">
                                              <span className="text-slate-400 mr-2">{index + 1}.</span>
                                              {label || '—'}
                                          </p>
                                          <div className="flex flex-wrap gap-2">
                                              {Array.from({ length: max }, (_, i) => i + 1).map(star => (
                                                  <button
                                                      key={star}
                                                      type="button"
                                                      onClick={() => setDynAnswers(r => ({ ...r, [q.id]: star }))}
                                                      className={`w-11 h-11 rounded-xl border-none cursor-pointer text-sm font-extrabold transition-all ${
                                                          star <= cur
                                                              ? 'bg-amber-400 text-white shadow-md'
                                                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                                      }`}
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
                                      <div key={q.id} className="mb-6 pb-6 border-b border-slate-100 last:border-0">
                                          <p className="text-sm font-semibold text-slate-700 mb-3">
                                              <span className="text-slate-400 mr-2">{index + 1}.</span>
                                              {label || '—'}
                                          </p>
                                          <textarea
                                              value={(dynAnswers[q.id] as string) ?? ''}
                                              onChange={e => setDynAnswers(r => ({ ...r, [q.id]: e.target.value }))}
                                              rows={3}
                                              className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 outline-none text-slate-800 font-medium resize-none"
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
                                              onClick={() => setDynAnswers(r => ({ ...r, [q.id]: true }))}
                                              className={`flex-1 h-12 rounded-2xl text-sm font-bold cursor-pointer transition-colors ${
                                                  yn === true
                                                      ? 'border-2 border-emerald-600 bg-emerald-50 text-emerald-800'
                                                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                              }`}
                                          >
                                              {tm('bSurveyYes')}
                                          </button>
                                          <button
                                              type="button"
                                              onClick={() => setDynAnswers(r => ({ ...r, [q.id]: false }))}
                                              className={`flex-1 h-12 rounded-2xl text-sm font-bold cursor-pointer transition-colors ${
                                                  yn === false
                                                      ? 'border-2 border-red-600 bg-red-50 text-red-800'
                                                      : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                                              }`}
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
                              <div key={key} className="mb-6">
                                  <p className="text-sm font-semibold text-slate-700 mb-3">{label}</p>
                                  <div className="flex gap-2">
                                      {[1, 2, 3, 4, 5].map(star => (
                                          <button
                                              key={star}
                                              type="button"
                                              onClick={() => setFeedbackRatings(r => ({ ...r, [key]: star }))}
                                              className={`w-12 h-12 rounded-xl border-none cursor-pointer text-lg font-extrabold transition-all ${
                                                  star <= feedbackRatings[key]
                                                      ? 'bg-amber-400 text-white'
                                                      : 'bg-slate-100 text-slate-400'
                                              }`}
                                          >
                                              ★
                                          </button>
                                      ))}
                                  </div>
                              </div>
                          ))}

                    <div className="mt-4">
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            {tm('bFeedbackComment')}
                        </label>
                        <textarea
                            value={feedbackComment}
                            onChange={e => setFeedbackComment(e.target.value)}
                            placeholder={tm('bFeedbackComment')}
                            rows={4}
                            className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-400 outline-none text-slate-800 font-medium resize-none"
                        />
                    </div>
                </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-3 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98] transition-colors"
                >
                    {tm('bFeedbackSkip')}
                </button>
                <button
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={feedbackSaving}
                    className="flex-[2] px-4 py-3 rounded-2xl bg-emerald-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-emerald-200/50 hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98] transition-colors"
                >
                    {feedbackSaving ? tm('bSaving') : tm('bSaveFeedback')}
                </button>
            </div>
        </div>,
        document.body
    );
}
