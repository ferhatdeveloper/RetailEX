import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Star, ThumbsUp, Users } from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatLocalYmd } from '../../../utils/dateLocal';
import type { BeautySurveyResponseRow, BeautySurveyResultsReport } from '../../../types/beauty';
import { SurveyReportToolbar } from './SurveyReportToolbar';
import type { BeautySurveyReportEmbedProps } from './SurveyExtraReports';
import {
    SurveyRatingRespondentsModal,
    filterSurveyResponsesForDrillDown,
    type SurveyRatingDrillDown,
} from './SurveyRatingRespondentsModal';
import { cn } from '../../ui/utils';

type RatingFilter = 'all' | '1' | '2' | '3' | '4' | '5';

function ratingStar(value: number): number {
    return Math.min(5, Math.max(1, Math.round(value)));
}

function starBadgeClass(star: number): string {
    if (star >= 5) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (star >= 4) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (star >= 3) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-red-100 text-red-800 border-red-200';
}

function formatAnswerRating(ans: { rating?: number; text?: string; yes_no?: boolean; label_snapshot?: string }) {
    if (typeof ans.rating === 'number') return `${ans.rating}★`;
    if (typeof ans.yes_no === 'boolean') return ans.yes_no ? '✓' : '✗';
    if (ans.text?.trim()) return ans.text.trim();
    return '—';
}

export function SurveyResultsReport(embed?: BeautySurveyReportEmbedProps) {
    const { tm, language } = useLanguage();
    const [internalStart, setInternalStart] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return formatLocalYmd(d);
    });
    const [internalEnd, setInternalEnd] = useState(() => formatLocalYmd(new Date()));
    const startYmd = embed?.startYmd ?? internalStart;
    const endYmd = embed?.endYmd ?? internalEnd;
    const setStartYmd = embed?.embedded ? () => {} : setInternalStart;
    const setEndYmd = embed?.embedded ? () => {} : setInternalEnd;
    const hideDateRange = Boolean(embed?.embedded);
    const reloadKey = embed?.reloadKey ?? 0;
    const [surveyId, setSurveyId] = useState<string>('all');
    const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [starDrillDown, setStarDrillDown] = useState<SurveyRatingDrillDown | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BeautySurveyResultsReport | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await beautyService.getSurveyResultsReport(startYmd, endYmd, {
                surveyId: surveyId === 'all' ? null : surveyId,
                lang: language,
            });
            setData(res);
            setRatingFilter('all');
            setExpandedId(null);
            setStarDrillDown(null);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [startYmd, endYmd, surveyId, language, reloadKey]);

    useEffect(() => {
        void load();
    }, [load]);

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
            buckets[ratingStar(r.overall_rating) - 1] += 1;
        }
        return buckets;
    }, [responses]);

    const filteredResponses = useMemo(() => {
        if (ratingFilter === 'all') return responses;
        const star = Number(ratingFilter);
        return responses.filter((r) => ratingStar(r.overall_rating) === star);
    }, [responses, ratingFilter]);

    const drillDownRows = useMemo(() => {
        if (!starDrillDown) return [];
        return filterSurveyResponsesForDrillDown(responses, starDrillDown).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
    }, [responses, starDrillDown]);

    const openStarDrillDown = useCallback((drill: SurveyRatingDrillDown) => {
        setStarDrillDown(drill);
        setRatingFilter(String(drill.star) as RatingFilter);
    }, []);

    const groupedByRating = useMemo(() => {
        const stars = ratingFilter === 'all' ? ([5, 4, 3, 2, 1] as const) : ([Number(ratingFilter)] as const);
        return stars
            .map((star) => ({
                star,
                items: filteredResponses
                    .filter((r) => ratingStar(r.overall_rating) === star)
                    .sort(
                        (a, b) =>
                            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                    ),
            }))
            .filter((g) => g.items.length > 0);
    }, [filteredResponses, ratingFilter]);

    const renderResponseRow = (r: BeautySurveyResponseRow) => {
        const star = ratingStar(r.overall_rating);
        const expanded = expandedId === r.id;
        const ratingAnswers = r.survey_answers.filter((a) => typeof a.rating === 'number');

        return (
            <React.Fragment key={r.id}>
                <tr
                    className={cn(
                        'border-b border-gray-50 hover:bg-violet-50/30 cursor-pointer',
                        expanded && 'bg-violet-50/40',
                    )}
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                >
                    <td className="py-2.5 px-3 w-8">
                        {r.survey_answers.length > 0 ? (
                            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                        ) : null}
                    </td>
                    <td className="py-2.5 px-3">
                        <span
                            className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-black tabular-nums',
                                starBadgeClass(star),
                            )}
                        >
                            <Star size={11} className="fill-current" />
                            {star}
                        </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="py-2.5 px-3 font-medium text-gray-800">{r.customer_name}</td>
                    <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{r.customer_phone ?? '—'}</td>
                    <td className="py-2.5 px-3 text-gray-600">{r.service_name ?? '—'}</td>
                    <td className="py-2.5 px-3 text-gray-600">{r.specialist_name ?? '—'}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                        {[r.appointment_date, r.appointment_time].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600">{r.survey_name ?? '—'}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-amber-700 tabular-nums">
                        {r.overall_rating.toFixed(1)}
                        {r.would_recommend ? ' ✓' : ''}
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 max-w-xs truncate">
                        {r.comment ?? (ratingAnswers.length ? tm('bSurveyReportHasAnswers') : '—')}
                    </td>
                </tr>
                {expanded && r.survey_answers.length > 0 && (
                    <tr className="bg-gray-50/80">
                        <td colSpan={11} className="px-4 py-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                                {r.survey_answers.map((ans, idx) => (
                                    <div
                                        key={`${r.id}-${ans.question_id}-${idx}`}
                                        className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                                    >
                                        <span className="text-gray-600 leading-snug">
                                            {ans.label_snapshot ?? ans.question_id.slice(0, 8)}
                                        </span>
                                        <span className="font-bold text-violet-700 shrink-0 tabular-nums">
                                            {formatAnswerRating(ans)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </td>
                    </tr>
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-full">
            <SurveyReportToolbar
                titleKey="bSurveyReportTitle"
                subtitleKey="bSurveyReportSubtitle"
                icon={<ClipboardList size={22} />}
                startYmd={startYmd}
                endYmd={endYmd}
                onStartChange={setStartYmd}
                onEndChange={setEndYmd}
                surveyId={surveyId}
                onSurveyChange={setSurveyId}
                surveyOptions={data?.survey_options ?? []}
                loading={loading}
                onRun={() => void load()}
                hideDateRange={hideDateRange}
            />

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

            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                        <h3 className="text-sm font-black text-gray-800">{tm('bSurveyReportRatingDist')}</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">{tm('bSurveyReportClickStarHint')}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {(['all', '5', '4', '3', '2', '1'] as RatingFilter[]).map((key) => {
                            const active = ratingFilter === key;
                            const count =
                                key === 'all'
                                    ? responses.length
                                    : ratingDistribution[Number(key) - 1] ?? 0;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => {
                                        if (key === 'all') {
                                            setRatingFilter('all');
                                            setStarDrillDown(null);
                                        } else {
                                            openStarDrillDown({ star: Number(key) });
                                        }
                                    }}
                                    className={cn(
                                        'px-3 py-1.5 rounded-full text-xs font-bold border transition-colors',
                                        active
                                            ? 'bg-violet-600 text-white border-violet-600'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300',
                                    )}
                                >
                                    {key === 'all'
                                        ? `${tm('bSurveyReportRatingAll')} (${count})`
                                        : `${key}★ (${count})`}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="space-y-2">
                    {ratingDistribution.map((count, idx) => {
                        const star = idx + 1;
                        const pct = responses.length > 0 ? Math.round((count / responses.length) * 100) : 0;
                        const active = ratingFilter === String(star);
                        return (
                            <button
                                key={star}
                                type="button"
                                disabled={count === 0}
                                onClick={() => {
                                    if (count === 0) return;
                                    openStarDrillDown({ star });
                                }}
                                className={cn(
                                    'w-full flex items-center gap-2 text-xs rounded-lg px-2 py-1 transition-colors text-left',
                                    active ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-gray-50',
                                    count === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                                )}
                            >
                                <span className="w-8 font-bold text-gray-600">{star}★</span>
                                <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                        className={cn(
                                            'h-full rounded-full transition-all',
                                            star >= 4 ? 'bg-emerald-400' : star === 3 ? 'bg-amber-400' : 'bg-red-400',
                                        )}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <span className="w-14 text-right tabular-nums text-gray-600 font-semibold">
                                    {count} ({pct}%)
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-1 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden">
                    <h3 className="text-sm font-black text-gray-800 mb-4">{tm('bSurveyReportByQuestion')}</h3>
                    {questionStats.length === 0 ? (
                        <p className="text-sm text-gray-500 py-6 text-center">{tm('bSurveyReportNoQuestions')}</p>
                    ) : (
                        <div className="overflow-x-auto space-y-4">
                            {questionStats.map((q) => (
                                <div
                                    key={q.question_id}
                                    className="rounded-xl border border-gray-100 p-3 hover:bg-gray-50/50"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                                        <p className="font-medium text-gray-800 text-sm">{q.label}</p>
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                            <span>
                                                {q.question_type === 'yes_no'
                                                    ? tm('bSurveyTypeYesNo')
                                                    : q.question_type === 'text'
                                                      ? tm('bSurveyTypeText')
                                                      : tm('bSurveyTypeRating')}
                                            </span>
                                            <span className="font-bold tabular-nums">{q.response_count} {tm('bSurveyReportAnswers')}</span>
                                            {q.avg_rating != null && (
                                                <span className="font-bold text-amber-700">
                                                    Ø {q.avg_rating}/{q.scale_max}
                                                </span>
                                            )}
                                            {q.yes_pct != null && (
                                                <span className="font-bold text-emerald-700">%{q.yes_pct}</span>
                                            )}
                                        </div>
                                    </div>
                                    {q.rating_breakdown && q.rating_breakdown.some((n) => n > 0) && (
                                        <div className="space-y-1">
                                            {[...q.rating_breakdown].reverse().map((cnt, revIdx) => {
                                                const star = q.rating_breakdown!.length - revIdx;
                                                const pct =
                                                    q.response_count > 0
                                                        ? Math.round((cnt / q.response_count) * 100)
                                                        : 0;
                                                return (
                                                    <button
                                                        key={star}
                                                        type="button"
                                                        disabled={cnt === 0}
                                                        onClick={() => {
                                                            if (cnt === 0) return;
                                                            openStarDrillDown({
                                                                star,
                                                                questionId: q.question_id,
                                                                questionLabel: q.label,
                                                            });
                                                        }}
                                                        className={cn(
                                                            'w-full flex items-center gap-2 text-[11px] rounded-md px-1 py-0.5 text-left transition-colors',
                                                            cnt > 0
                                                                ? 'hover:bg-violet-50 cursor-pointer'
                                                                : 'opacity-40 cursor-not-allowed',
                                                        )}
                                                    >
                                                        <span className="w-6 font-bold text-gray-500">{star}★</span>
                                                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                                            <div
                                                                className="h-full bg-violet-400 rounded-full"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="w-12 text-right tabular-nums text-gray-500 font-semibold">
                                                            {cnt}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {q.question_type === 'text' && q.text_samples.length > 0 && (
                                        <p className="text-xs text-gray-500 italic mt-2">«{q.text_samples[0]}»</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <Users size={16} className="text-violet-600" />
                    <h3 className="text-sm font-black text-gray-800">{tm('bSurveyReportByRatingList')}</h3>
                    <span className="text-xs text-gray-400">
                        ({filteredResponses.length}
                        {ratingFilter !== 'all' ? ` / ${responses.length}` : ''})
                    </span>
                </div>
                {groupedByRating.length === 0 ? (
                    <p className="text-sm text-gray-500 py-10 text-center">{tm('bSurveyReportNoData')}</p>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {groupedByRating.map((group) => (
                            <div key={group.star}>
                                <div
                                    className={cn(
                                        'px-5 py-3 flex items-center gap-2 border-b border-gray-50',
                                        starBadgeClass(group.star),
                                    )}
                                >
                                    <Star size={14} className="fill-current" />
                                    <span className="text-sm font-black">
                                        {tm('bSurveyReportRatingGroup')
                                            .replace('{star}', String(group.star))
                                            .replace('{count}', String(group.items.length))}
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-gray-50/80 text-left text-gray-500 border-b border-gray-100">
                                                <th className="py-2 px-3 w-8" />
                                                <th className="py-2 px-3 font-bold">{tm('bSurveyReportScore')}</th>
                                                <th className="py-2 px-3 font-bold">{tm('date')}</th>
                                                <th className="py-2 px-3 font-bold">{tm('customer')}</th>
                                                <th className="py-2 px-3 font-bold">{tm('bSurveyReportCustomerPhone')}</th>
                                                <th className="py-2 px-3 font-bold">{tm('bSurveyReportLastService')}</th>
                                                <th className="py-2 px-3 font-bold">{tm('bSurveyReportLegacyStaff')}</th>
                                                <th className="py-2 px-3 font-bold">{tm('bSurveyReportApptDate')}</th>
                                                <th className="py-2 px-3 font-bold">{tm('bSurveyName')}</th>
                                                <th className="py-2 px-3 font-bold text-right">{tm('bSurveyReportAvgRating')}</th>
                                                <th className="py-2 px-3 font-bold">{tm('bSurveyReportComment')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>{group.items.map(renderResponseRow)}</tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <SurveyRatingRespondentsModal
                drill={starDrillDown}
                rows={drillDownRows}
                onClose={() => setStarDrillDown(null)}
            />
        </div>
    );
}
