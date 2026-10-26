import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Percent, RefreshCw, CalendarDays, X } from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { formatLocalYmd } from '../../../utils/dateLocal';
import { formatReportDateCell } from '../../../utils/dateLocale';
import {
    filterCommissionLinesForHistory,
    type CommissionReportLine,
} from '../../../utils/commissionReportLines';
import { ReportYmdDatePicker } from '../../shared/ReportDateRangePresets';
import { ReportKpiStrip } from '../../reports/shared/ReportKpiStrip';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { CommissionStaffPieChart } from './CommissionStaffPieChart';

const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

type CommissionReportData = Awaited<ReturnType<typeof beautyService.getCommissionReport>>;
type HistoryRow = NonNullable<CommissionReportData>['history_rows'][number];

export function CommissionReport() {
    const { tm } = useLanguage();
    const [startYmd, setStartYmd] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return formatLocalYmd(d);
    });
    const [endYmd, setEndYmd] = useState(() => formatLocalYmd(new Date()));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<CommissionReportData | null>(null);
    const [detail, setDetail] = useState<HistoryRow | null>(null);
    const [lines, setLines] = useState<CommissionReportLine[]>([]);
    const [lineLoading, setLineLoading] = useState(false);
    const [lineError, setLineError] = useState<string | null>(null);
    const [selectedSpecialistId, setSelectedSpecialistId] = useState<string | null>(null);
    const lineReq = useRef(0);

    const closeDetail = () => {
        lineReq.current += 1;
        setDetail(null);
        setLines([]);
        setLineError(null);
        setLineLoading(false);
    };

    const load = async () => {
        closeDetail();
        setSelectedSpecialistId(null);
        setLoading(true);
        setError(null);
        try {
            const res = await beautyService.getCommissionReport(startYmd, endYmd, { includeDeposit: true });
            setData(res);
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openHistoryLines = async (row: HistoryRow) => {
        const day = String(row.date_ymd ?? '').trim().slice(0, 10);
        const id = String(row.specialist_id ?? '').trim();
        if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
        const token = lineReq.current + 1;
        lineReq.current = token;
        setDetail({ ...row, date_ymd: day, specialist_id: id });
        setLines([]);
        setLineError(null);
        setLineLoading(true);
        try {
            const res = await beautyService.getCommissionReportLines(day, day, id);
            if (token !== lineReq.current) return;
            const list = Array.isArray(res) ? res : [];
            setLines(filterCommissionLinesForHistory(list, day, id));
        } catch (e: unknown) {
            if (token !== lineReq.current) return;
            const message = e instanceof Error ? e.message : String(e);
            setLineError(message);
            setLines([]);
        } finally {
            if (token === lineReq.current) setLineLoading(false);
        }
    };

    const toggleSpecialist = (specialistId: string) => {
        const id = String(specialistId ?? '').trim();
        if (!id) return;
        setSelectedSpecialistId((prev) => (prev === id ? null : id));
    };

    const totals = useMemo(() => data?.totals ?? {
        service_revenue: 0,
        service_commission: 0,
        product_revenue: 0,
        product_commission: 0,
        total_revenue: 0,
        total_commission: 0,
        total_transactions: 0,
    }, [data]);

    const staffRows = data?.rows ?? [];
    const historyRows = data?.history_rows ?? [];
    const visibleHistory = useMemo(
        () => (
            selectedSpecialistId
                ? historyRows.filter((row) => row.specialist_id === selectedSpecialistId)
                : historyRows
        ),
        [historyRows, selectedSpecialistId],
    );

    const historyColumns = useMemo<ReportColumnTableCol<HistoryRow>[]>(
        () => [
            {
                key: 'date_ymd',
                header: tm('date'),
                type: 'date',
                size: 120,
                cell: (r) => (
                    <span className="font-semibold text-gray-700">{formatReportDateCell(r.date_ymd)}</span>
                ),
            },
            {
                key: 'name',
                header: tm('bStaffName'),
                size: 200,
                cell: (r) => (
                    <span
                        data-testid={`commission-history-${r.date_ymd}-${r.specialist_id}`}
                        className="font-bold text-gray-900"
                    >
                        {r.name}
                    </span>
                ),
            },
            {
                key: 'service_commission',
                header: tm('bServiceCommissionTotal'),
                type: 'number',
                align: 'right',
                size: 140,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => <span className="font-semibold text-purple-700">{fmt(r.service_commission)}</span>,
            },
            {
                key: 'product_commission',
                header: tm('bProductCommissionTotal'),
                type: 'number',
                align: 'right',
                size: 140,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => <span className="font-semibold text-emerald-700">{fmt(r.product_commission)}</span>,
            },
            {
                key: 'total_commission',
                header: tm('bTotalCommission'),
                type: 'number',
                align: 'right',
                size: 140,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => <span className="font-black text-gray-900">{fmt(r.total_commission)}</span>,
            },
        ],
        [tm],
    );

    const lineColumns = useMemo<ReportColumnTableCol<CommissionReportLine>[]>(
        () => [
            {
                key: 'date_ymd',
                header: tm('date'),
                type: 'date',
                size: 120,
                cell: (r) => (
                    <span className="font-semibold text-gray-700">{formatReportDateCell(r.date_ymd)}</span>
                ),
            },
            {
                key: 'customer_or_fiche',
                header: tm('bCommissionLineCustomerOrFiche'),
                size: 180,
                cell: (r) => <span className="font-semibold text-gray-800">{r.customer_or_fiche}</span>,
            },
            {
                key: 'item_name',
                header: tm('bCommissionLineItem'),
                size: 200,
                cell: (r) => <span className="font-bold text-gray-900">{r.item_name}</span>,
            },
            {
                key: 'kind',
                header: tm('bCommissionLineKind'),
                size: 110,
                cell: (r) => (
                    <span className={r.kind === 'product' ? 'font-semibold text-emerald-700' : 'font-semibold text-purple-700'}>
                        {r.kind === 'product' ? tm('bCommissionLineKindProduct') : tm('bCommissionLineKindService')}
                    </span>
                ),
            },
            {
                key: 'revenue',
                header: tm('bCommissionLineRevenue'),
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => <span className="font-semibold text-gray-700">{fmt(r.revenue)}</span>,
            },
            {
                key: 'commission_rate',
                header: tm('bCommissionLineRate'),
                type: 'number',
                align: 'right',
                size: 120,
                cell: (r) => <span className="font-semibold text-gray-700">%{r.commission_rate.toFixed(2)}</span>,
            },
            {
                key: 'commission_amount',
                header: tm('bCommissionLineAmount'),
                type: 'number',
                align: 'right',
                size: 130,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => <span className="font-black text-gray-900">{fmt(r.commission_amount)}</span>,
            },
        ],
        [tm],
    );

    const detailTitle = detail
        ? tm('bCommissionLineDetailTitle').replace('{name}', detail.name)
        : tm('bCommissionReportTitle');
    const detailSubtitle = detail
        ? tm('bCommissionLineDetailSubtitle').replace('{date}', formatReportDateCell(detail.date_ymd))
        : '';

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-full">
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                            <Percent size={22} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900">{tm('bCommissionReportTitle')}</h2>
                            <p className="text-xs font-semibold text-gray-500">{tm('bCommissionReportSubtitle')}</p>
                        </div>
                    </div>
                    <div className="flex items-end gap-2 flex-wrap">
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('date')}</span>
                            <ReportYmdDatePicker value={startYmd} onChange={setStartYmd} className="min-w-[9.5rem]" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{tm('bToDate')}</span>
                            <ReportYmdDatePicker value={endYmd} onChange={setEndYmd} className="min-w-[9.5rem]" />
                        </label>
                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading}
                            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-extrabold flex items-center gap-2"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            {loading ? tm('bLoading') : tm('bRunReport')}
                        </button>
                    </div>
                </div>
            </div>

            <div data-testid="commission-kpis">
                <ReportKpiStrip
                    columns={3}
                    items={[
                        {
                            key: 'svc',
                            label: tm('bServiceCommissionTotal'),
                            value: <span data-testid="commission-kpi-service">{fmt(totals.service_commission)}</span>,
                            valueClassName: 'text-purple-700',
                            hint: `${tm('bServiceRevenueTotal')}: ${fmt(totals.service_revenue)}`,
                        },
                        {
                            key: 'prd',
                            label: tm('bProductCommissionTotal'),
                            value: <span data-testid="commission-kpi-product">{fmt(totals.product_commission)}</span>,
                            valueClassName: 'text-emerald-700',
                            hint: `${tm('bProductRevenueTotal')}: ${fmt(totals.product_revenue)}`,
                        },
                        {
                            key: 'tot',
                            label: tm('bTotalCommission'),
                            value: <span data-testid="commission-kpi-total">{fmt(totals.total_commission)}</span>,
                            hint: `${tm('bTransactionCount')}: ${totals.total_transactions}`,
                        },
                    ]}
                />
            </div>

            <div
                data-testid="commission-history-panel"
                className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden"
            >
                <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2 text-gray-900 font-black">
                    <CalendarDays size={16} className="text-purple-600" />
                    {tm('bCommissionHistoryTitle')}
                </div>
                {error ? (
                    <div className="p-6 text-sm font-semibold text-red-600">{error}</div>
                ) : historyRows.length === 0 && !loading ? (
                    <div className="p-10 text-center text-gray-400 text-sm font-bold">{tm('bNoCommissionHistory')}</div>
                ) : (
                    <div className="p-2">
                        <ReportColumnTable
                            data={visibleHistory}
                            columns={historyColumns}
                            height={480}
                            footerLabel={tm('rprTotal') || 'Toplam'}
                            storageNamespace="beauty-commission-history"
                            onRowClick={(row) => {
                                void openHistoryLines(row);
                            }}
                        />
                    </div>
                )}
            </div>

            {data && !error ? (
                <div
                    data-testid="commission-pie-panel"
                    className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4"
                >
                    <CommissionStaffPieChart
                        rows={staffRows}
                        totalCommission={totals.total_commission}
                        title={tm('bCommissionPieTitle')}
                        centerLabel={tm('bTotalCommission')}
                        selectedId={selectedSpecialistId}
                        onToggle={toggleSpecialist}
                    />
                </div>
            ) : null}

            {detail ? (
                <PercentBodyModal onClose={closeDetail} size="wide" ariaLabel={detailTitle}>
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white shrink-0 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h2 data-testid="commission-line-title" className="text-lg font-black truncate">
                                {detailTitle}
                            </h2>
                            <p data-testid="commission-line-subtitle" className="text-xs font-semibold text-white/80 mt-1">
                                {detailSubtitle}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={closeDetail}
                            className="shrink-0 w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
                            aria-label={tm('close')}
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <PercentBodyModalScrollBody className="p-4 bg-white">
                        {lineLoading ? (
                            <p className="py-12 text-center text-sm font-bold text-gray-400">{tm('bCommissionLineLoading')}</p>
                        ) : lineError ? (
                            <p className="py-12 text-center text-sm font-semibold text-red-600">{lineError}</p>
                        ) : lines.length === 0 ? (
                            <p data-testid="commission-line-empty" className="py-12 text-center text-sm font-bold text-gray-400">
                                {tm('bCommissionLineEmpty')}
                            </p>
                        ) : (
                            <div className="min-h-[320px]" data-testid="commission-line-grid">
                                <ReportColumnTable
                                    data={lines}
                                    columns={lineColumns}
                                    height={420}
                                    footerLabel={tm('rprTotal') || 'Toplam'}
                                    storageNamespace="beauty-commission-lines"
                                />
                            </div>
                        )}
                    </PercentBodyModalScrollBody>
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
                        <button
                            type="button"
                            onClick={closeDetail}
                            className="px-5 py-2.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100"
                        >
                            {tm('close')}
                        </button>
                    </div>
                </PercentBodyModal>
            ) : null}
        </div>
    );
}
