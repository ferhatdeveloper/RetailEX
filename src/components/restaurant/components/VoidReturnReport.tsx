import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Trash2, RotateCcw, Calendar, FileText, RefreshCw } from 'lucide-react';
import { cn } from '../../ui/utils';
import { RestaurantService } from '../../../services/restaurant';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { useLanguage } from '../../../contexts/LanguageContext';
import { moduleTranslations } from '../../../locales/module-translations';

interface VoidReturnReportProps {
    onBack?: () => void;
}

interface VoidRow {
    itemId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    voidReason: string;
    /** İptal anındaki kalem durumu: pending = mutfağa gitmedi (stok iade edildi), cooking/ready/served = mutfakta üretildi (stok iade yok) */
    itemStatus: string;
    orderNo: string;
    openedAt: string | null;
    closedAt: string | null;
    waiter: string | null;
    tableNumber: string;
}

interface ReturnRow {
    id: string;
    returnNumber: string;
    originalReceipt: string | null;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    returnReason: string;
    staffName: string | null;
    createdAt: string;
}

type Tab = 'void' | 'return';

export function VoidReturnReport({ onBack }: VoidReturnReportProps) {
    const { language, tm: globalTm } = useLanguage();
    const tm = useCallback(
        (key: string) => moduleTranslations[key]?.[language] || globalTm(key),
        [language, globalTm]
    );
    const dateLocale =
        language === 'en' ? 'en-US' : language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ku-IQ' : 'tr-TR';

    const fmtDate = (d: string | null | undefined) => {
        if (!d) return '—';
        return new Date(d).toLocaleString(dateLocale, { dateStyle: 'short', timeStyle: 'short' });
    };

    const [tab, setTab] = useState<Tab>('void');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [voids, setVoids] = useState<VoidRow[]>([]);
    const [returns, setReturns] = useState<ReturnRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const [voidRows, returnRows] = await Promise.all([
                RestaurantService.getVoidReport({
                    fromDate: fromDate || undefined,
                    toDate: toDate || undefined,
                    limit: 500,
                }),
                RestaurantService.getReturnReport({
                    fromDate: fromDate || undefined,
                    toDate: toDate || undefined,
                    limit: 500,
                }),
            ]);
            setVoids(voidRows as VoidRow[]);
            setReturns(returnRows as ReturnRow[]);
        } catch (e) {
            console.error('[VoidReturnReport] load error:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);
    useEffect(() => { load(); }, [fromDate, toDate]);

    const totalVoidAmount = voids.reduce((s, v) => s + v.subtotal, 0);
    const totalReturnAmount = returns.reduce((s, r) => s + r.totalAmount, 0);

    const handleDeleteCurrentTab = async () => {
        if (deleting || loading) return;

        const isVoidTab = tab === 'void';
        const rowCount = isVoidTab ? voids.length : returns.length;
        if (rowCount === 0) {
            window.alert(isVoidTab ? tm('resVoidAlertNoVoidToDelete') : tm('resVoidAlertNoReturnToDelete'));
            return;
        }

        const rangeSuffix =
            fromDate || toDate
                ? tm('resVoidDateFilterSuffix')
                      .replace('{from}', fromDate || '…')
                      .replace('{to}', toDate || '…')
                : '';
        const ok = window.confirm(
            (isVoidTab ? tm('resVoidConfirmDeleteVoids') : tm('resVoidConfirmDeleteReturns')).replace(
                '{range}',
                rangeSuffix
            )
        );
        if (!ok) return;

        try {
            setDeleting(true);
            const params = {
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
            };
            const deleted = isVoidTab
                ? await RestaurantService.deleteVoidReportEntries(params)
                : await RestaurantService.deleteReturnReportEntries(params);
            await load();
            window.alert(tm('resVoidAlertDeletedCount').replace('{n}', String(deleted)));
        } catch (e) {
            console.error('[VoidReturnReport] delete error:', e);
            window.alert(tm('resVoidAlertDeleteError'));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div
                className="border-b px-6 py-4 flex items-center justify-between z-20 shrink-0 shadow-lg"
                style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}
            >
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white/15 hover:bg-white/25 text-white rounded-xl font-black uppercase text-[11px] border border-white/20"
                    >
                        <ArrowLeft className="w-4 h-4" /> {tm('goBack')}
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                            <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">{tm('resVoidReportTitle')}</h2>
                            <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">{tm('resVoidReportSubtitle')}</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading || deleting}
                    className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 disabled:opacity-50"
                    title={tm('refresh')}
                >
                    <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
                </button>
                <button
                    onClick={handleDeleteCurrentTab}
                    disabled={loading || deleting}
                    className="ml-2 px-4 py-2.5 bg-red-500/90 hover:bg-red-500 text-white rounded-xl font-black uppercase text-[11px] border border-red-300/40 disabled:opacity-50"
                    title={tab === 'void' ? tm('resVoidDeleteVoidsTitle') : tm('resVoidDeleteReturnsTitle')}
                >
                    <Trash2 className="w-4 h-4 inline mr-2" />
                    {deleting
                        ? tm('resVoidDeleting')
                        : tab === 'void'
                          ? tm('resVoidDeleteVoidsBtn')
                          : tm('resVoidDeleteReturnsBtn')}
                </button>
            </div>

            <div className="p-4 border-b bg-white/80 flex flex-wrap items-center gap-4">
                <div className="flex gap-2">
                    <button
                        onClick={() => setTab('void')}
                        className={cn(
                            'px-4 py-2 rounded-xl text-sm font-black uppercase border',
                            tab === 'void' ? 'bg-red-100 border-red-300 text-red-800' : 'bg-slate-100 border-slate-200 text-slate-600'
                        )}
                    >
                        <Trash2 className="w-4 h-4 inline mr-2" /> {tm('resVoidTabVoids')} ({voids.length})
                    </button>
                    <button
                        onClick={() => setTab('return')}
                        className={cn(
                            'px-4 py-2 rounded-xl text-sm font-black uppercase border',
                            tab === 'return' ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-slate-100 border-slate-200 text-slate-600'
                        )}
                    >
                        <RotateCcw className="w-4 h-4 inline mr-2" /> {tm('resVoidTabReturns')} ({returns.length})
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium"
                    />
                    <span className="text-slate-400">–</span>
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium"
                    />
                </div>
                <div className="text-sm font-black text-slate-600">
                    {tab === 'void' ? (
                        <>
                            {tm('resVoidTotalVoidLabel')}:{' '}
                            <span className="text-red-600">{formatMoneyAmount(totalVoidAmount, { minFrac: 0, maxFrac: 2 })}</span>
                        </>
                    ) : (
                        <>
                            {tm('resVoidTotalReturnLabel')}:{' '}
                            <span className="text-blue-600">{formatMoneyAmount(totalReturnAmount, { minFrac: 0, maxFrac: 2 })}</span>
                        </>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin" />
                    </div>
                ) : tab === 'void' ? (
                    voids.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                            <Trash2 className="w-16 h-16 mb-4 opacity-30" />
                            <p className="font-bold uppercase tracking-wider">{tm('resVoidNoVoidsInRange')}</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColDate')}</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColOrderNo')}</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColTable')}</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColProduct')}</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColVoidReason')}</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColStockReturn')}</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">{tm('resVoidColAmount')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {voids.map((v) => {
                                        const wasPending = (v.itemStatus || 'pending') === 'pending';
                                        return (
                                        <tr key={v.itemId} className="border-b border-slate-100 hover:bg-red-50/30">
                                            <td className="px-4 py-3 text-xs font-medium text-slate-700">{fmtDate(v.closedAt ?? v.openedAt)}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-800">{v.orderNo}</td>
                                            <td className="px-4 py-3 text-xs text-slate-600">{v.tableNumber}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-800">{v.productName} × {v.quantity}</td>
                                            <td className="px-4 py-3 text-xs text-red-700 font-medium">{v.voidReason}</td>
                                            <td className="px-4 py-3 text-xs">
                                                {wasPending ? (
                                                    <span className="text-emerald-700 font-bold" title={tm('resVoidStockYesHint')}>
                                                        {tm('resVoidStockYes')}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-500 font-medium" title={tm('resVoidStockNoHint')}>
                                                        {tm('resVoidStockNo')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-black text-right text-slate-800">{formatMoneyAmount(v.subtotal)}</td>
                                        </tr>
                                    );})}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : returns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                        <RotateCcw className="w-16 h-16 mb-4 opacity-30" />
                        <p className="font-bold uppercase tracking-wider">{tm('resVoidNoReturnsInRange')}</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColDate')}</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColReturnOriginal')}</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColProduct')}</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">{tm('resVoidColReturnReason')}</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">{tm('resVoidColAmount')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {returns.map((r) => (
                                    <tr key={r.id} className="border-b border-slate-100 hover:bg-blue-50/30">
                                        <td className="px-4 py-3 text-xs font-medium text-slate-700">{fmtDate(r.createdAt)}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-slate-800">{r.returnNumber} {r.originalReceipt && ` / ${r.originalReceipt}`}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-slate-800">{r.productName} × {r.quantity}</td>
                                        <td className="px-4 py-3 text-xs text-blue-700 font-medium">{r.returnReason}</td>
                                        <td className="px-4 py-3 text-xs font-black text-right text-slate-800">{formatMoneyAmount(r.totalAmount)}</td>
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
