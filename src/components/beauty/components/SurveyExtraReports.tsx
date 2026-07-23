import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    LineChart, MessageSquare, Star, ThumbsUp, TrendingUp, Users, Scissors, AlertTriangle,
} from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatLocalYmd } from '../../../utils/dateLocal';
import type {
    BeautySurveyBreakdownRow,
    BeautySurveyCommentsReport,
    BeautySurveyNpsReport,
    BeautySurveyServiceReport,
    BeautySurveyStaffReport,
    BeautySurveyTrendReport,
} from '../../../types/beauty';
import { SurveyReportToolbar } from './SurveyReportToolbar';
import { cn } from '../../ui/utils';

function useSurveyDateRange() {
    const [startYmd, setStartYmd] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return formatLocalYmd(d);
    });
    const [endYmd, setEndYmd] = useState(() => formatLocalYmd(new Date()));
    return { startYmd, setStartYmd, endYmd, setEndYmd };
}

export type BeautySurveyReportEmbedProps = {
    startYmd?: string;
    endYmd?: string;
    /** Raporlar modülünde üst tarih çubuğu ile gömülü */
    embedded?: boolean;
    /** Üst çubuk «Yenile» ile zorla yeniden yükleme */
    reloadKey?: number;
};

function useSurveyReportDates(embed?: BeautySurveyReportEmbedProps) {
    const internal = useSurveyDateRange();
    return {
        startYmd: embed?.startYmd ?? internal.startYmd,
        endYmd: embed?.endYmd ?? internal.endYmd,
        setStartYmd: embed?.embedded ? () => {} : internal.setStartYmd,
        setEndYmd: embed?.embedded ? () => {} : internal.setEndYmd,
        hideDateRange: Boolean(embed?.embedded),
        reloadKey: embed?.reloadKey ?? 0,
    };
}

function starBadgeClass(star: number): string {
    if (star >= 5) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (star >= 4) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (star >= 3) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-red-100 text-red-800 border-red-200';
}

function BreakdownTable({
    rows,
    nameHeaderKey,
    secondaryHeaderKey,
}: {
    rows: BeautySurveyBreakdownRow[];
    nameHeaderKey: string;
    secondaryHeaderKey: string;
}) {
    const { tm } = useLanguage();

    if (rows.length === 0) {
        return (
            <p className="text-sm text-gray-500 py-8 text-center">{tm('bSurveyReportNoData')}</p>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-gray-100 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">
                        <th className="py-2 px-3">{tm(nameHeaderKey)}</th>
                        <th className="py-2 px-3 text-right">{tm('bSurveyReportAnswers')}</th>
                        <th className="py-2 px-3 text-right">{tm('bSurveyReportAvgRating')}</th>
                        <th className="py-2 px-3 text-right">{tm(secondaryHeaderKey)}</th>
                        <th className="py-2 px-3 text-right">{tm('bSurveyReportRecommend')}</th>
                        <th className="py-2 px-3 text-right">{tm('bSurveyReportLowScore')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-violet-50/30">
                            <td className="py-2.5 px-3 font-semibold text-gray-800">{r.name}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-bold">{r.response_count}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-bold text-amber-700">
                                {r.avg_overall_rating.toFixed(1)}★
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-gray-600">
                                {r.avg_staff_rating != null ? `${r.avg_staff_rating.toFixed(1)}★` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-bold text-emerald-700">
                                %{r.would_recommend_pct}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-bold text-red-600">
                                {r.low_score_count}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function SurveyTrendReport(embed?: BeautySurveyReportEmbedProps) {
    const { tm } = useLanguage();
    const { startYmd, endYmd, setStartYmd, setEndYmd, hideDateRange, reloadKey } = useSurveyReportDates(embed);
    const [surveyId, setSurveyId] = useState('all');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BeautySurveyTrendReport | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await beautyService.getSurveyTrendReport(startYmd, endYmd, {
                surveyId: surveyId === 'all' ? null : surveyId,
            }));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [startYmd, endYmd, surveyId, reloadKey]);

    useEffect(() => {
        void load();
    }, [load]);

    const maxResponses = useMemo(
        () => Math.max(1, ...(data?.points ?? []).map((p) => p.response_count)),
        [data?.points],
    );

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-full">
            <SurveyReportToolbar
                titleKey="bSurveyTrendReportTitle"
                subtitleKey="bSurveyTrendReportSubtitle"
                icon={<TrendingUp size={22} />}
                iconClassName="bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-accent,#1FA8A0)]"
                buttonClassName="bg-[var(--asin-accent,#1FA8A0)] hover:bg-[#178f88] disabled:opacity-40"
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
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase">{tm('bSurveyReportResponses')}</p>
                    <p className="text-2xl font-black text-blue-700 mt-2">{data?.summary.response_count ?? 0}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase">{tm('bSurveyReportAvgRating')}</p>
                    <p className="text-2xl font-black text-amber-600 mt-2">{data?.summary.avg_overall_rating?.toFixed(1) ?? '0.0'}★</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase">{tm('bSurveyReportRecommend')}</p>
                    <p className="text-2xl font-black text-emerald-700 mt-2">%{data?.summary.would_recommend_pct ?? 0}</p>
                </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <h3 className="text-sm font-black text-gray-800 mb-4 flex items-center gap-2">
                    <LineChart size={16} />
                    {tm('bSurveyTrendChartTitle')}
                </h3>
                {(data?.points ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">{tm('bSurveyReportNoData')}</p>
                ) : (
                    <div className="space-y-3">
                        {(data?.points ?? []).map((p) => (
                            <div key={p.day_key} className="rounded-xl border border-gray-100 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
                                    <span className="font-bold text-gray-700">{p.day_key}</span>
                                    <span className="text-gray-500 tabular-nums">
                                        {p.response_count} {tm('bSurveyReportAnswers')} · Ø {p.avg_overall_rating.toFixed(1)}★ · %{p.would_recommend_pct} {tm('bSurveyReportRecommendShort')}
                                    </span>
                                </div>
                                <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-blue-500 transition-all"
                                        style={{ width: `${Math.round((p.response_count / maxResponses) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    {tm('bSurveyReportResponseRate')}: %{p.response_rate_pct} ({p.completed_appointments} {tm('bSurveyReportCompletedAppts')})
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function SurveyStaffReport(embed?: BeautySurveyReportEmbedProps) {
    const { tm } = useLanguage();
    const { startYmd, endYmd, setStartYmd, setEndYmd, hideDateRange, reloadKey } = useSurveyReportDates(embed);
    const [surveyId, setSurveyId] = useState('all');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BeautySurveyStaffReport | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await beautyService.getSurveyStaffReport(startYmd, endYmd, {
                surveyId: surveyId === 'all' ? null : surveyId,
            }));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [startYmd, endYmd, surveyId, reloadKey]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-full">
            <SurveyReportToolbar
                titleKey="bSurveyStaffReportTitle"
                subtitleKey="bSurveyStaffReportSubtitle"
                icon={<Users size={22} />}
                iconClassName="bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-primary,#0E2433)]"
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
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <h3 className="text-sm font-black text-gray-800 mb-4">{tm('bSurveyStaffReportTable')}</h3>
                <BreakdownTable
                    rows={data?.rows ?? []}
                    nameHeaderKey="bSurveyReportLegacyStaff"
                    secondaryHeaderKey="bSurveyReportLegacyStaff"
                />
            </div>
        </div>
    );
}

export function SurveyServiceReport(embed?: BeautySurveyReportEmbedProps) {
    const { tm } = useLanguage();
    const { startYmd, endYmd, setStartYmd, setEndYmd, hideDateRange, reloadKey } = useSurveyReportDates(embed);
    const [surveyId, setSurveyId] = useState('all');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BeautySurveyServiceReport | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await beautyService.getSurveyServiceReport(startYmd, endYmd, {
                surveyId: surveyId === 'all' ? null : surveyId,
            }));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [startYmd, endYmd, surveyId, reloadKey]);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-full">
            <SurveyReportToolbar
                titleKey="bSurveyServiceReportTitle"
                subtitleKey="bSurveyServiceReportSubtitle"
                icon={<Scissors size={22} />}
                iconClassName="bg-pink-100 text-pink-700"
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
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                <h3 className="text-sm font-black text-gray-800 mb-4">{tm('bSurveyServiceReportTable')}</h3>
                <BreakdownTable
                    rows={data?.rows ?? []}
                    nameHeaderKey="bSurveyReportLegacyService"
                    secondaryHeaderKey="bSurveyReportLegacyService"
                />
            </div>
        </div>
    );
}

export function SurveyNpsReport(embed?: BeautySurveyReportEmbedProps) {
    const { tm } = useLanguage();
    const { startYmd, endYmd, setStartYmd, setEndYmd, hideDateRange, reloadKey } = useSurveyReportDates(embed);
    const [surveyId, setSurveyId] = useState('all');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BeautySurveyNpsReport | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await beautyService.getSurveyNpsReport(startYmd, endYmd, {
                surveyId: surveyId === 'all' ? null : surveyId,
            }));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [startYmd, endYmd, surveyId, reloadKey]);

    useEffect(() => {
        void load();
    }, [load]);

    const s = data?.summary;

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-full">
            <SurveyReportToolbar
                titleKey="bSurveyNpsReportTitle"
                subtitleKey="bSurveyNpsReportSubtitle"
                icon={<ThumbsUp size={22} />}
                iconClassName="bg-emerald-100 text-emerald-700"
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
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm md:col-span-1">
                    <p className="text-[10px] font-black text-gray-400 uppercase">{tm('bSurveyNpsScore')}</p>
                    <p className={cn(
                        'text-4xl font-black mt-2 tabular-nums',
                        (s?.nps_score ?? 0) >= 50 ? 'text-emerald-600' : (s?.nps_score ?? 0) >= 0 ? 'text-amber-600' : 'text-red-600',
                    )}>
                        {s?.nps_score ?? 0}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{tm('bSurveyNpsScoreHint')}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-emerald-600 uppercase">{tm('bSurveyNpsPromoters')}</p>
                    <p className="text-2xl font-black text-emerald-700 mt-2">{s?.promoter_count ?? 0}</p>
                    <p className="text-xs text-gray-500">%{s?.promoter_pct ?? 0} · 5★</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-amber-600 uppercase">{tm('bSurveyNpsPassives')}</p>
                    <p className="text-2xl font-black text-amber-700 mt-2">{s?.passive_count ?? 0}</p>
                    <p className="text-xs text-gray-500">%{s?.passive_pct ?? 0} · 4★</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-red-600 uppercase">{tm('bSurveyNpsDetractors')}</p>
                    <p className="text-2xl font-black text-red-700 mt-2">{s?.detractor_count ?? 0}</p>
                    <p className="text-xs text-gray-500">%{s?.detractor_pct ?? 0} · 1–3★</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase">{tm('bSurveyReportResponses')}</p>
                    <p className="text-2xl font-black text-gray-800 mt-2">{s?.response_count ?? 0}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase">{tm('bSurveyReportAvgRating')}</p>
                    <p className="text-2xl font-black text-amber-600 mt-2 flex items-center gap-1">
                        <Star size={18} className="fill-amber-400 text-amber-400" />
                        {s?.avg_overall_rating?.toFixed(1) ?? '0.0'}
                    </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase">{tm('bSurveyReportRecommend')}</p>
                    <p className="text-2xl font-black text-emerald-700 mt-2">%{s?.would_recommend_pct ?? 0}</p>
                </div>
            </div>
        </div>
    );
}

export function SurveyCommentsReport(embed?: BeautySurveyReportEmbedProps) {
    const { tm } = useLanguage();
    const { startYmd, endYmd, setStartYmd, setEndYmd, hideDateRange, reloadKey } = useSurveyReportDates(embed);
    const [surveyId, setSurveyId] = useState('all');
    const [maxRating, setMaxRating] = useState('3');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<BeautySurveyCommentsReport | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await beautyService.getSurveyCommentsReport(startYmd, endYmd, {
                surveyId: surveyId === 'all' ? null : surveyId,
                maxRating: Number(maxRating),
            }));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [startYmd, endYmd, surveyId, maxRating, reloadKey]);

    useEffect(() => {
        void load();
    }, [load]);

    const formatDateTime = (iso: string) => {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
        return d.toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
        });
    };

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-full">
            <SurveyReportToolbar
                titleKey="bSurveyCommentsReportTitle"
                subtitleKey="bSurveyCommentsReportSubtitle"
                icon={<MessageSquare size={22} />}
                iconClassName="bg-orange-100 text-orange-700"
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
                extraFilters={(
                    <label className="flex flex-col gap-1 min-w-[120px]">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('bSurveyCommentsMaxRating')}</span>
                        <select
                            value={maxRating}
                            onChange={(e) => setMaxRating(e.target.value)}
                            className="h-10 border border-gray-200 rounded-xl px-3 text-xs font-bold text-gray-700 bg-white"
                        >
                            {[1, 2, 3, 4, 5].map((n) => (
                                <option key={n} value={String(n)}>{n}★ {tm('bSurveyCommentsAndBelow')}</option>
                            ))}
                        </select>
                    </label>
                )}
            />
            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase">{tm('bSurveyCommentsWithText')}</p>
                    <p className="text-2xl font-black text-orange-700 mt-2">{data?.summary.total_with_comment ?? 0}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {tm('bSurveyReportLowScore')}
                    </p>
                    <p className="text-2xl font-black text-red-700 mt-2">{data?.summary.low_score_count ?? 0}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase">{tm('bSurveyCommentsAvgRating')}</p>
                    <p className="text-2xl font-black text-amber-600 mt-2">
                        {data?.summary.avg_rating_comments != null ? `${data.summary.avg_rating_comments}★` : '—'}
                    </p>
                </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden">
                <h3 className="text-sm font-black text-gray-800 mb-4">{tm('bSurveyCommentsListTitle')}</h3>
                {(data?.rows ?? []).length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">{tm('bSurveyReportNoData')}</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b border-gray-100 text-left text-[10px] font-black uppercase tracking-wider text-gray-400">
                                    <th className="py-2 px-3">{tm('bSurveyReportScore')}</th>
                                    <th className="py-2 px-3">{tm('date')}</th>
                                    <th className="py-2 px-3">{tm('customer')}</th>
                                    <th className="py-2 px-3">{tm('bSurveyReportLegacyStaff')}</th>
                                    <th className="py-2 px-3">{tm('bSurveyReportLegacyService')}</th>
                                    <th className="py-2 px-3">{tm('bSurveyReportComment')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data?.rows ?? []).map((r) => {
                                    const star = Math.min(5, Math.max(1, Math.round(r.overall_rating)));
                                    return (
                                        <tr key={r.id} className="border-b border-gray-50 hover:bg-orange-50/30 align-top">
                                            <td className="py-2.5 px-3">
                                                <span className={cn(
                                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-black',
                                                    starBadgeClass(star),
                                                )}>
                                                    {star}★
                                                    {r.would_recommend ? ' ✓' : ''}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3 whitespace-nowrap text-gray-600">{formatDateTime(r.created_at)}</td>
                                            <td className="py-2.5 px-3 font-medium">{r.customer_name}</td>
                                            <td className="py-2.5 px-3 text-gray-600">{r.specialist_name ?? '—'}</td>
                                            <td className="py-2.5 px-3 text-gray-600">{r.service_name ?? '—'}</td>
                                            <td className="py-2.5 px-3 text-gray-700 max-w-md">
                                                {r.comment || <span className="text-gray-400 italic">{tm('bSurveyCommentsNoText')}</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
