import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarRange, Package, RefreshCw } from 'lucide-react';
import { cn } from '../../ui/utils';
import { RestaurantService } from '../../../services/restaurant';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { useLanguage } from '../../../contexts/LanguageContext';

interface RestaurantProductQtyReportProps {
    onBack?: () => void;
}

export function RestaurantProductQtyReport({ onBack }: RestaurantProductQtyReportProps) {
    const { tm } = useLanguage();
    const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const monthStart = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }, []);

    const [fromDate, setFromDate] = useState(monthStart);
    const [toDate, setToDate] = useState(today);
    const [rows, setRows] = useState<
        Array<{ productId: string | null; productName: string; quantity: number; revenue: number }>
    >([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await RestaurantService.getProductSalesByClosedDateRange(fromDate, toDate);
            setRows(Array.isArray(data) ? data : []);
        } catch (e: unknown) {
            console.error('[RestaurantProductQtyReport]', e);
            setRows([]);
            setError(e instanceof Error ? e.message : tm('resProductLoadError'));
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate, tm]);

    useEffect(() => {
        void load();
    }, [load]);

    const totals = useMemo(() => {
        const q = rows.reduce((s, r) => s + r.quantity, 0);
        const rev = rows.reduce((s, r) => s + r.revenue, 0);
        return { q, rev };
    }, [rows]);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div
                className="border-b px-6 py-4 flex items-center justify-between z-20 shrink-0 shadow-lg"
                style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}
            >
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={onBack}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl font-black uppercase text-[11px] border border-white/20"
                    >
                        <ArrowLeft className="w-4 h-4" /> {tm('goBack')}
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                            <Package className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">
                                {tm('resProductQtyReportTitle')}
                            </h2>
                            <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">
                                {tm('resProductQtyReportSubtitle')}
                            </p>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 disabled:opacity-50"
                    title={tm('refresh')}
                >
                    <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
                </button>
            </div>

            <div className="p-4 md:p-6 flex flex-wrap items-end gap-4 border-b border-slate-200 bg-white">
                <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-1">
                        <CalendarRange className="w-3.5 h-3.5" />
                        {tm('dateFrom')}
                    </span>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[160px]"
                    />
                </label>
                <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                    <span>{tm('dateTo')}</span>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[160px]"
                    />
                </label>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6">
                {error && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {error}
                    </div>
                )}
                {loading ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
                        <RefreshCw className="w-10 h-10 animate-spin text-blue-500" />
                        <span>{tm('loading')}</span>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="text-center py-24 text-slate-500 text-sm">{tm('resProductNoData')}</div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-5xl mx-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-100 text-left text-xs font-black uppercase tracking-wide text-slate-600">
                                    <th className="px-4 py-3">#</th>
                                    <th className="px-4 py-3">{tm('resProductColProduct')}</th>
                                    <th className="px-4 py-3 text-right">{tm('resProductColQty')}</th>
                                    <th className="px-4 py-3 text-right">{tm('resProductColRevenue')}</th>
                                    <th className="px-4 py-3 text-right">{tm('resProductColAvgPrice')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map((r, i) => {
                                    const avg = r.quantity > 0 ? r.revenue / r.quantity : 0;
                                    return (
                                        <tr key={`${r.productId ?? 'x'}-${r.productName}-${i}`} className="hover:bg-slate-50/80">
                                            <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{i + 1}</td>
                                            <td className="px-4 py-2.5 font-semibold text-slate-800">{r.productName}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">
                                                {r.quantity.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-800">
                                                {formatMoneyAmount(r.revenue)}
                                            </td>
                                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                                                {formatMoneyAmount(avg)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-blue-50/80 font-black text-slate-800">
                                    <td className="px-4 py-3" colSpan={2}>
                                        {tm('totalUppercase')}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">
                                        {totals.q.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums">{formatMoneyAmount(totals.rev)}</td>
                                    <td className="px-4 py-3 text-right text-slate-500 text-xs font-bold">—</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
