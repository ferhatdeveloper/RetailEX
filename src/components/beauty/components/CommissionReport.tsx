import React, { useEffect, useMemo, useState } from 'react';
import { Percent, RefreshCw, CalendarDays, Users } from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { formatLocalYmd } from '../../../utils/dateLocal';

const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

type CommissionReportData = Awaited<ReturnType<typeof beautyService.getCommissionReport>>;

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
    const [historyStaffId, setHistoryStaffId] = useState<string>('all');

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

    const historyRows = useMemo(() => {
        const rows = data?.history_rows ?? [];
        if (historyStaffId === 'all') return rows;
        return rows.filter((r) => r.specialist_id === historyStaffId);
    }, [data?.history_rows, historyStaffId]);

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
                            <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white">
                                <CalendarDays size={14} className="text-emerald-600" />
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
                                <CalendarDays size={14} className="text-emerald-600" />
                                <input
                                    type="date"
                                    value={endYmd}
                                    onChange={(e) => setEndYmd(e.target.value)}
                                    className="text-xs font-bold text-gray-700 outline-none bg-transparent"
                                />
                            </div>
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em]">{tm('bServiceCommissionTotal')}</p>
                    <p className="text-2xl font-black text-purple-700 mt-2">{fmt(totals.service_commission)}</p>
                    <p className="text-xs text-gray-500 mt-1">{tm('bServiceRevenueTotal')}: {fmt(totals.service_revenue)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em]">{tm('bProductCommissionTotal')}</p>
                    <p className="text-2xl font-black text-emerald-700 mt-2">{fmt(totals.product_commission)}</p>
                    <p className="text-xs text-gray-500 mt-1">{tm('bProductRevenueTotal')}: {fmt(totals.product_revenue)}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em]">{tm('bTotalCommission')}</p>
                    <p className="text-2xl font-black text-gray-900 mt-2">{fmt(totals.total_commission)}</p>
                    <p className="text-xs text-gray-500 mt-1">{tm('bTransactionCount')}: {totals.total_transactions}</p>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-900 font-black">
                        <Users size={16} className="text-emerald-600" />
                        {tm('bCommissionReportByStaff')}
                    </div>
                </div>
                {error ? (
                    <div className="p-6 text-sm font-semibold text-red-600">{error}</div>
                ) : (data?.rows?.length ?? 0) === 0 ? (
                    <div className="p-10 text-center text-gray-400 text-sm font-bold">{tm('bNoStaffData')}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[1100px]">
                            <thead className="bg-gray-50/70">
                                <tr>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bStaffName')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bServiceRevenueTotal')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bServiceCommissionTotal')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bServiceCommissionRate')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bProductRevenueTotal')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bProductCommissionTotal')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bProductCommissionRate')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bTotalCommission')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data!.rows.map((r) => (
                                    <tr key={`${r.specialist_id}-${r.name}`} className="hover:bg-gray-50/50">
                                        <td className="px-6 py-4 font-bold text-gray-900">{r.name}</td>
                                        <td className="px-6 py-4 font-semibold text-gray-700">{fmt(r.service_revenue)}</td>
                                        <td className="px-6 py-4 font-semibold text-purple-700">{fmt(r.service_commission)}</td>
                                        <td className="px-6 py-4 font-semibold text-purple-700">%{r.service_rate_effective.toFixed(2)}</td>
                                        <td className="px-6 py-4 font-semibold text-gray-700">{fmt(r.product_revenue)}</td>
                                        <td className="px-6 py-4 font-semibold text-emerald-700">{fmt(r.product_commission)}</td>
                                        <td className="px-6 py-4 font-semibold text-emerald-700">%{r.product_rate_effective.toFixed(2)}</td>
                                        <td className="px-6 py-4 font-black text-gray-900">{fmt(r.total_commission)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-gray-900 font-black">
                        <CalendarDays size={16} className="text-purple-600" />
                        {tm('bCommissionHistoryTitle')}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500">{tm('bStaffName')}</span>
                        <select
                            value={historyStaffId}
                            onChange={(e) => setHistoryStaffId(e.target.value)}
                            className="h-9 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white"
                        >
                            <option value="all">{tm('bAll')}</option>
                            {(data?.rows ?? []).map((r) => (
                                <option key={r.specialist_id} value={r.specialist_id}>{r.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                {error ? (
                    <div className="p-6 text-sm font-semibold text-red-600">{error}</div>
                ) : historyRows.length === 0 ? (
                    <div className="p-10 text-center text-gray-400 text-sm font-bold">{tm('bNoCommissionHistory')}</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[760px]">
                            <thead className="bg-gray-50/70">
                                <tr>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('date')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bStaffName')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bServiceCommissionTotal')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bProductCommissionTotal')}</th>
                                    <th className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.16em]">{tm('bTotalCommission')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {historyRows.map((r, idx) => (
                                    <tr key={`${r.date_ymd}-${r.specialist_id}-${idx}`} className="hover:bg-gray-50/50">
                                        <td className="px-6 py-4 font-semibold text-gray-700">{r.date_ymd}</td>
                                        <td className="px-6 py-4 font-bold text-gray-900">{r.name}</td>
                                        <td className="px-6 py-4 font-semibold text-purple-700">{fmt(r.service_commission)}</td>
                                        <td className="px-6 py-4 font-semibold text-emerald-700">{fmt(r.product_commission)}</td>
                                        <td className="px-6 py-4 font-black text-gray-900">{fmt(r.total_commission)}</td>
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

