import React, { useEffect, useMemo, useState } from 'react';
import { Percent, RefreshCw, CalendarDays, Users } from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { formatLocalYmd } from '../../../utils/dateLocal';
import { formatReportDateCell } from '../../../utils/dateLocale';
import { ReportYmdDatePicker } from '../../shared/ReportDateRangePresets';
import { ReportKpiStrip } from '../../reports/shared/ReportKpiStrip';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';

const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

type CommissionReportData = Awaited<ReturnType<typeof beautyService.getCommissionReport>>;
type StaffRow = NonNullable<CommissionReportData>['rows'][number];
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

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await beautyService.getCommissionReport(startYmd, endYmd);
            setData(res);
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const staffColumns = useMemo<ReportColumnTableCol<StaffRow>[]>(
        () => [
            {
                key: 'name',
                header: tm('bStaffName'),
                size: 200,
                cell: (r) => <span className="font-bold text-gray-900">{r.name}</span>,
            },
            {
                key: 'service_revenue',
                header: tm('bServiceRevenueTotal'),
                type: 'number',
                align: 'right',
                size: 140,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => <span className="font-semibold text-gray-700">{fmt(r.service_revenue)}</span>,
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
                key: 'service_rate_effective',
                header: tm('bServiceCommissionRate'),
                type: 'number',
                align: 'right',
                size: 120,
                cell: (r) => (
                    <span className="font-semibold text-purple-700">%{r.service_rate_effective.toFixed(2)}</span>
                ),
            },
            {
                key: 'product_revenue',
                header: tm('bProductRevenueTotal'),
                type: 'number',
                align: 'right',
                size: 140,
                footerSum: true,
                footerFormat: (n) => fmt(n),
                cell: (r) => <span className="font-semibold text-gray-700">{fmt(r.product_revenue)}</span>,
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
                key: 'product_rate_effective',
                header: tm('bProductCommissionRate'),
                type: 'number',
                align: 'right',
                size: 120,
                cell: (r) => (
                    <span className="font-semibold text-emerald-700">%{r.product_rate_effective.toFixed(2)}</span>
                ),
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
                cell: (r) => <span className="font-bold text-gray-900">{r.name}</span>,
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

            <ReportKpiStrip
                columns={3}
                items={[
                    {
                        key: 'svc',
                        label: tm('bServiceCommissionTotal'),
                        value: fmt(totals.service_commission),
                        valueClassName: 'text-purple-700',
                        hint: `${tm('bServiceRevenueTotal')}: ${fmt(totals.service_revenue)}`,
                    },
                    {
                        key: 'prd',
                        label: tm('bProductCommissionTotal'),
                        value: fmt(totals.product_commission),
                        valueClassName: 'text-emerald-700',
                        hint: `${tm('bProductRevenueTotal')}: ${fmt(totals.product_revenue)}`,
                    },
                    {
                        key: 'tot',
                        label: tm('bTotalCommission'),
                        value: fmt(totals.total_commission),
                        hint: `${tm('bTransactionCount')}: ${totals.total_transactions}`,
                    },
                ]}
            />

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-900 font-black">
                        <Users size={16} className="text-emerald-600" />
                        {tm('bCommissionReportByStaff')}
                    </div>
                </div>
                {error ? (
                    <div className="p-6 text-sm font-semibold text-red-600">{error}</div>
                ) : staffRows.length === 0 && !loading ? (
                    <div className="p-10 text-center text-gray-400 text-sm font-bold">{tm('bNoStaffData')}</div>
                ) : (
                    <div className="p-2">
                        <ReportColumnTable
                            data={staffRows}
                            columns={staffColumns}
                            height={420}
                            footerLabel={tm('rprTotal') || 'Toplam'}
                            storageNamespace="beauty-commission-staff"
                        />
                    </div>
                )}
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
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
                            data={historyRows}
                            columns={historyColumns}
                            height={480}
                            footerLabel={tm('rprTotal') || 'Toplam'}
                            storageNamespace="beauty-commission-history"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
