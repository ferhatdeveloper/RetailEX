import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, RefreshCw, Star, ThumbsUp, Users } from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatLocalYmd } from '../../../utils/dateLocal';
import type { BeautySurveyResultsReport } from '../../../types/beauty';

export function SurveyResultsReport() {
    const { tm, language } = useLanguage();
    const [startYmd, setStartYmd] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return formatLocalYmd(d);
    });
    const [endYmd, setEndYmd] = useState(() => formatLocalYmd(new Date()));
    const [surveyId, setSurveyId] = useState<string>('all');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BeautySurveyResultsReport | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await beautyService.getSurveyResultsReport(startYmd, endYmd, {
                surveyId: surveyId === 'all' ? null : surveyId,
                lang: language,
            });
            setData(res);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const summary = data?.summary;
    const questionStats = data?.question_stats ?? [];
    const responses = data?.responses ?? [];

    const formatDateTime = (iso: string) => {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
        return d.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const ratingDistribution = useMemo(() => {
        const buckets = [0, 0, 0, 0, 0];
        for (const r of responses) {
            const idx = Math.min(5, Math.max(1, Math.round(r.overall_rating))) - 1;
            buckets[idx] += 1;
        }
        return buckets;
    }, [responses]);

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-full">
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center">
                            <ClipboardList size={22} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900">{tm('bSurveyReportTitle')}</h2>
                            <p className="text-xs font-semibold text-gray-500">{tm('bSurveyReportSubtitle')}</p>
                        </div>
                    </div>
                    <div className="flex items-end gap-2 flex-wrap">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('date')}</span>
                            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white">
                                <CalendarDays size={14} className="text-violet-600" />
                                <input
                                    type="date"
                                    value={startYmd}
                                    onChange={(e) => setStartYmd(e.target.value)}
                                    className="text-xs font-bold text-gray-700 outline-none bg-transparent"
                                />
                            </div>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('bToDate')}</span>
                            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white">
                                <CalendarDays size={14} className="text-violet-600" />
                                <input
                                    type="date"
                                    value={endYmd}
                                    onChange={(e) => setEndYmd(e.target.value)}
                                    className="text-xs font-bold text-gray-700 outline-none bg-transparent"
                                />
                            </div>
                        </label>
                        <label className="flex flex-col gap-1 min-w-[180px]">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('bSurveyReportFilter')}</span>
                            <select
                                value={surveyId}
                                onChange={(e) => setSurveyId(e.target.value)}
                                className="h-10 border border-gray-200 rounded-xl px-3 text-xs font-bold text-gray-700 bg-white"
                            >
                                <option value="all">{tm('bSurveyReportAllSurveys')}</option>
                                {(data?.survey_options ?? []).map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading}
                            className="h-10 px-4 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-xs font-extrabold flex items-center gap-2"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            {loading ? tm('bLoading') : tm('bRunReport')}
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em]">{tm('bSurveyReportResponses')}</p>
                    <p className="text-2xl font-black text-violet-700 mt-2">{summary?.response_count ?? 0}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {tm('bSurveyReportCompletedAppts')}: {summary?.completed_appointments ?? 0}
                    </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em]">{tm('bSurveyReportAvgRating')}</p>
                    <p className="text-2xl font-black text-amber-600 mt-2 flex items-center gap-1">
                        <Star size={20} className="fill-amber-400 text-amber-400" />
                        {summary?.avg_overall_rating?.toFixed(1) ?? '0.0'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{tm('bSurveyReportOverallHint')}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em]">{tm('bSurveyReportRecommend')}</p>
                    <p className="text-2xl font-black text-emerald-700 mt-2 flex items-center gap-1">
                        <ThumbsUp size={20} />
                        %{summary?.would_recommend_pct ?? 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        {summary?.would_recommend_count ?? 0} / {summary?.response_count ?? 0}
                    </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em]">{tm('bSurveyReportResponseRate')}</p>
                    <p className="text-2xl font-black text-blue-700 mt-2">%{summary?.response_rate_pct ?? 0}</p>
                    <p className="text-xs text-gray-500 mt-1">{tm('bSurveyReportResponseRateHint')}</p>
                </div>
            </div>

            {(summary?.legacy_avg_service != null ||
                summary?.legacy_avg_staff != null ||
                summary?.legacy_avg_cleanliness != null) && (
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3">{tm('bSurveyReportLegacyBlock')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                            <span className="text-gray-500">{tm('bSurveyReportLegacyService')}</span>
                            <strong className="ml-2">{summary?.legacy_avg_service?.toFixed(1)}</strong>
                        </div>
                        <div>
                            <span className="text-gray-500">{tm('bSurveyReportLegacyStaff')}</span>
                            <strong className="ml-2">{summary?.legacy_avg_staff?.toFixed(1)}</strong>
                        </div>
                        <div>
                            <span className="text-gray-500">{tm('bSurveyReportLegacyClean')}</span>
                            <strong className="ml-2">{summary?.legacy_avg_cleanliness?.toFixed(1)}</strong>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden">
                    <h3 className="text-sm font-black text-gray-800 mb-4">{tm('bSurveyReportByQuestion')}</h3>
                    {questionStats.length === 0 ? (
                        <p className="text-sm text-gray-500 py-6 text-center">{tm('bSurveyReportNoQuestions')}</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-gray-100 text-left text-gray-500">
                                        <th className="py-2 pr-3 font-bold">{tm('bSurveyReportQuestion')}</th>
                                        <th className="py-2 px-2 font-bold">{tm('bSurveyReportType')}</th>
                                        <th className="py-2 px-2 font-bold text-right">{tm('bSurveyReportAnswers')}</th>
                                        <th className="py-2 pl-2 font-bold text-right">{tm('bSurveyReportResult')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {questionStats.map((q) => (
                                        <tr key={q.question_id} className="border-b border-gray-50 hover:bg-gray-50/80">
                                            <td className="py-2.5 pr-3 font-medium text-gray-800 max-w-xs">{q.label}</td>
                                            <td className="py-2.5 px-2 text-gray-500">
                                                {q.question_type === 'yes_no'
                                                    ? tm('bSurveyTypeYesNo')
                                                    : q.question_type === 'text'
                                                      ? tm('bSurveyTypeText')
                                                      : tm('bSurveyTypeRating')}
                                            </td>
                                            <td className="py-2.5 px-2 text-right tabular-nums">{q.response_count}</td>
                                            <td className="py-2.5 pl-2 text-right">
                                                {q.avg_rating != null && (
                                                    <span className="font-bold text-amber-700">
                                                        {q.avg_rating} / {q.scale_max}
                                                    </span>
                                                )}
                                                {q.yes_pct != null && (
                                                    <span className="font-bold text-emerald-700">%{q.yes_pct} {tm('bSurveyReportYes')}</span>
                                                )}
                                                {q.question_type === 'text' && q.text_samples.length > 0 && (
                                                    <span className="text-gray-600 italic block mt-0.5 truncate max-w-[220px] ml-auto">
                                                        «{q.text_samples[0]}»
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <h3 className="text-sm font-black text-gray-800 mb-4">{tm('bSurveyReportRatingDist')}</h3>
                    <div className="space-y-2">
                        {ratingDistribution.map((count, idx) => {
                            const star = idx + 1;
                            const pct =
                                responses.length > 0 ? Math.round((count / responses.length) * 100) : 0;
                            return (
                                <div key={star} className="flex items-center gap-2 text-xs">
                                    <span className="w-8 font-bold text-gray-600">{star}★</span>
                                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                                        <div
                                            className="h-full bg-amber-400 rounded-full transition-all"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="w-10 text-right tabular-nums text-gray-500">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <Users size={16} className="text-violet-600" />
                    <h3 className="text-sm font-black text-gray-800">{tm('bSurveyReportDetailList')}</h3>
                    <span className="text-xs text-gray-400">({responses.length})</span>
                </div>
                {responses.length === 0 ? (
                    <p className="text-sm text-gray-500 py-10 text-center">{tm('bSurveyReportNoData')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-gray-50 text-left text-gray-500 border-b border-gray-100">
                                    <th className="py-3 px-4 font-bold">{tm('date')}</th>
                                    <th className="py-3 px-4 font-bold">{tm('customer')}</th>
                                    <th className="py-3 px-4 font-bold">{tm('bSurveyReportApptDate')}</th>
                                    <th className="py-3 px-4 font-bold">{tm('bSurveyName')}</th>
                                    <th className="py-3 px-4 font-bold text-right">{tm('bSurveyReportScore')}</th>
                                    <th className="py-3 px-4 font-bold">{tm('bSurveyReportComment')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {responses.map((r) => (
                                    <tr key={r.id} className="border-b border-gray-50 hover:bg-violet-50/30">
                                        <td className="py-2.5 px-4 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                                        <td className="py-2.5 px-4 font-medium text-gray-800">{r.customer_name}</td>
                                        <td className="py-2.5 px-4">{r.appointment_date ?? '—'}</td>
                                        <td className="py-2.5 px-4 text-gray-600">{r.survey_name ?? '—'}</td>
                                        <td className="py-2.5 px-4 text-right font-bold text-amber-700 tabular-nums">
                                            {r.overall_rating.toFixed(1)}
                                            {r.would_recommend ? ' ✓' : ''}
                                        </td>
                                        <td className="py-2.5 px-4 text-gray-600 max-w-xs truncate">
                                            {r.comment ?? (r.survey_answers.length ? tm('bSurveyReportHasAnswers') : '—')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
