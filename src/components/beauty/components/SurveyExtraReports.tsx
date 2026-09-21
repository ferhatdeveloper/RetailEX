import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    LineChart, MessageSquare, Star, ThumbsUp, TrendingUp, Users, Scissors, AlertTriangle,
} from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatLocalYmd } from '../../../utils/dateLocal';
import { formatReportDateCell } from '../../../utils/dateLocale';
import type {
    BeautySurveyBreakdownRow,
    BeautySurveyCommentsReport,
    BeautySurveyNpsReport,
    BeautySurveyServiceReport,
    BeautySurveyStaffReport,
    BeautySurveyTrendReport,
} from '../../../types/beauty';
import { SurveyReportToolbar } from './SurveyReportToolbar';
import { ReportKpiStrip } from '../../reports/shared/ReportKpiStrip';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';
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
    storageNamespace,
}: {
    rows: BeautySurveyBreakdownRow[];
    nameHeaderKey: string;
    secondaryHeaderKey: string;
    storageNamespace: string;
}) {
    const { tm } = useLanguage();

    const columns = useMemo<ReportColumnTableCol<BeautySurveyBreakdownRow>[]>(
        () => [
            {
                key: 'name',
                header: tm(nameHeaderKey),
                size: 200,
                cell: (r) => <span className="font-semibold text-gray-800">{r.name}</span>,
            },
            {
                key: 'response_count',
                header: tm('bSurveyReportAnswers'),
                type: 'number',
                align: 'right',
                size: 100,
                footerSum: true,
            },
            {
                key: 'avg_overall_rating',
                header: tm('bSurveyReportAvgRating'),
                type: 'number',
                align: 'right',
                size: 110,
                cell: (r) => (
                    <span className="font-bold text-amber-700 tabular-nums">{r.avg_overall_rating.toFixed(1)}★</span>
                ),
            },
            {
                key: 'avg_staff_rating',
                header: tm(secondaryHeaderKey),
                type: 'number',
                align: 'right',
                size: 110,
                cell: (r) => (
                    <span className="text-gray-600 tabular-nums">
                        {r.avg_staff_rating != null ? `${r.avg_staff_rating.toFixed(1)}★` : '—'}
                    </span>
                ),
            },
            {
                key: 'would_recommend_pct',
                header: tm('bSurveyReportRecommend'),
                type: 'number',
                align: 'right',
                size: 110,
                cell: (r) => <span className="font-bold text-emerald-700 tabular-nums">%{r.would_recommend_pct}</span>,
            },
            {
                key: 'low_score_count',
                header: tm('bSurveyReportLowScore'),
                type: 'number',
                align: 'right',
                size: 100,
                footerSum: true,
                cell: (r) => <span className="font-bold text-red-600 tabular-nums">{r.low_score_count}</span>,
            },
        ],
        [tm, nameHeaderKey, secondaryHeaderKey],
    );

    if (rows.length === 0) {
        return (
            <p className="text-sm text-gray-500 py-8 text-center">{tm('bSurveyReportNoData')}</p>
        );
    }

    return (
        <ReportColumnTable
            data={rows}
            columns={columns}
            height={420}
            storageNamespace={storageNamespace}
        />
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
                iconClassName="bg-blue-100 text-blue-700"
                buttonClassName="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
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
            <ReportKpiStrip
                columns={3}
                items={[
                    {
                        key: 'resp',
                        label: tm('bSurveyReportResponses'),
                        value: data?.summary.response_count ?? 0,
                        valueClassName: 'text-blue-700',
                    },
                    {
                        key: 'avg',
                        label: tm('bSurveyReportAvgRating'),
                        value: `${data?.summary.avg_overall_rating?.toFixed(1) ?? '0.0'}★`,
                        valueClassName: 'text-amber-600',
                    },
                    {
                        key: 'rec',
                        label: tm('bSurveyReportRecommend'),
                        value: `%${data?.summary.would_recommend_pct ?? 0}`,
                        valueClassName: 'text-emerald-700',
                    },
                ]}
            />
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
                iconClassName="bg-indigo-100 text-indigo-700"
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
                    storageNamespace="beauty-survey-staff-breakdown"
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
                    storageNamespace="beauty-survey-service-breakdown"
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
            <ReportKpiStrip
                columns={4}
                items={[
                    {
                        key: 'nps',
                        label: tm('bSurveyNpsScore'),
                        value: s?.nps_score ?? 0,
                        valueClassName:
                            (s?.nps_score ?? 0) >= 50
                                ? 'text-emerald-600 text-base'
                                : (s?.nps_score ?? 0) >= 0
                                  ? 'text-amber-600 text-base'
                                  : 'text-red-600 text-base',
                        hint: tm('bSurveyNpsScoreHint'),
                    },
                    {
                        key: 'prom',
                        label: tm('bSurveyNpsPromoters'),
                        value: s?.promoter_count ?? 0,
                        valueClassName: 'text-emerald-700',
                        hint: `%${s?.promoter_pct ?? 0} · 5★`,
                    },
                    {
                        key: 'pass',
                        label: tm('bSurveyNpsPassives'),
                        value: s?.passive_count ?? 0,
                        valueClassName: 'text-amber-700',
                        hint: `%${s?.passive_pct ?? 0} · 4★`,
                    },
                    {
                        key: 'det',
                        label: tm('bSurveyNpsDetractors'),
                        value: s?.detractor_count ?? 0,
                        valueClassName: 'text-red-700',
                        hint: `%${s?.detractor_pct ?? 0} · 1–3★`,
                    },
                ]}
            />
            <ReportKpiStrip
                columns={3}
                items={[
                    {
                        key: 'resp',
                        label: tm('bSurveyReportResponses'),
                        value: s?.response_count ?? 0,
                    },
                    {
                        key: 'avg',
                        label: tm('bSurveyReportAvgRating'),
                        value: (
                            <span className="inline-flex items-center gap-1">
                                <Star size={14} className="fill-amber-400 text-amber-400 shrink-0" />
                                {s?.avg_overall_rating?.toFixed(1) ?? '0.0'}
                            </span>
                        ),
                        valueClassName: 'text-amber-600',
                    },
                    {
                        key: 'rec',
                        label: tm('bSurveyReportRecommend'),
                        value: `%${s?.would_recommend_pct ?? 0}`,
                        valueClassName: 'text-emerald-700',
                    },
                ]}
            />
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

    const formatDateTime = (iso: string) => formatReportDateCell(iso);

    const commentRows = data?.rows ?? [];

    const commentColumns = useMemo<ReportColumnTableCol<(typeof commentRows)[number]>[]>(
        () => [
            {
                key: 'overall_rating',
                header: tm('bSurveyReportScore'),
                type: 'number',
                size: 100,
                cell: (r) => {
                    const star = Math.min(5, Math.max(1, Math.round(r.overall_rating)));
                    return (
                        <span
                            className={cn(
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-black',
                                starBadgeClass(star),
                            )}
                        >
                            {star}★
                            {r.would_recommend ? ' ✓' : ''}
                        </span>
                    );
                },
            },
            {
                key: 'created_at',
                header: tm('date'),
                type: 'date',
                size: 120,
                cell: (r) => <span className="text-gray-600">{formatDateTime(r.created_at)}</span>,
            },
            {
                key: 'customer_name',
                header: tm('customer'),
                size: 160,
                cell: (r) => <span className="font-medium">{r.customer_name}</span>,
            },
            {
                key: 'specialist_name',
                header: tm('bSurveyReportLegacyStaff'),
                size: 140,
                cell: (r) => r.specialist_name ?? '—',
            },
            {
                key: 'service_name',
                header: tm('bSurveyReportLegacyService'),
                size: 160,
                cell: (r) => r.service_name ?? '—',
            },
            {
                key: 'comment',
                header: tm('bSurveyReportComment'),
                size: 280,
                cell: (r) =>
                    r.comment ? (
                        <span className="text-gray-700">{r.comment}</span>
                    ) : (
                        <span className="text-gray-400 italic">{tm('bSurveyCommentsNoText')}</span>
                    ),
            },
        ],
        [tm],
    );

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
            <ReportKpiStrip
                columns={3}
                items={[
                    {
                        key: 'with',
                        label: tm('bSurveyCommentsWithText'),
                        value: data?.summary.total_with_comment ?? 0,
                        valueClassName: 'text-orange-700',
                    },
                    {
                        key: 'low',
                        label: (
                            <span className="inline-flex items-center gap-1">
                                <AlertTriangle size={10} />
                                {tm('bSurveyReportLowScore')}
                            </span>
                        ),
                        value: data?.summary.low_score_count ?? 0,
                        valueClassName: 'text-red-700',
                    },
                    {
                        key: 'avg',
                        label: tm('bSurveyCommentsAvgRating'),
                        value:
                            data?.summary.avg_rating_comments != null
                                ? `${data.summary.avg_rating_comments}★`
                                : '—',
                        valueClassName: 'text-amber-600',
                    },
                ]}
            />
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden">
                <h3 className="text-sm font-black text-gray-800 mb-4">{tm('bSurveyCommentsListTitle')}</h3>
                {commentRows.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">{tm('bSurveyReportNoData')}</p>
                ) : (
                    <ReportColumnTable
                        data={commentRows}
                        columns={commentColumns}
                        height={520}
                        storageNamespace="beauty-survey-comments"
                    />
                )}
            </div>
        </div>
    );
}
