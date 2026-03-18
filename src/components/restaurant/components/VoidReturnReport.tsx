import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trash2, RotateCcw, Calendar, FileText, RefreshCw } from 'lucide-react';
import { cn } from '../../ui/utils';
import { RestaurantService } from '../../../services/restaurant';
import { formatMoneyAmount } from '../../../utils/formatMoney';

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

function fmtDate(d: string | null | undefined) {
    if (!d) return '—';
    return new Date(d).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

type Tab = 'void' | 'return';

export function VoidReturnReport({ onBack }: VoidReturnReportProps) {
    const [tab, setTab] = useState<Tab>('void');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [voids, setVoids] = useState<VoidRow[]>([]);
    const [returns, setReturns] = useState<ReturnRow[]>([]);
    const [loading, setLoading] = useState(true);

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
                        <ArrowLeft className="w-4 h-4" /> Geri
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                            <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">İptal ve İade Raporu</h2>
                            <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">Kayıt altına alınan iptal nedenleri</p>
                        </div>
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/20 disabled:opacity-50"
                >
                    <RefreshCw className={cn('w-5 h-5', loading && 'animate-spin')} />
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
                        <Trash2 className="w-4 h-4 inline mr-2" /> İptaller ({voids.length})
                    </button>
                    <button
                        onClick={() => setTab('return')}
                        className={cn(
                            'px-4 py-2 rounded-xl text-sm font-black uppercase border',
                            tab === 'return' ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-slate-100 border-slate-200 text-slate-600'
                        )}
                    >
                        <RotateCcw className="w-4 h-4 inline mr-2" /> İadeler ({returns.length})
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
                        <>Toplam iptal: <span className="text-red-600">{formatMoneyAmount(totalVoidAmount, { minFrac: 0, maxFrac: 2 })}</span></>
                    ) : (
                        <>Toplam iade: <span className="text-blue-600">{formatMoneyAmount(totalReturnAmount, { minFrac: 0, maxFrac: 2 })}</span></>
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
                            <p className="font-bold uppercase tracking-wider">Seçilen tarih aralığında iptal kaydı yok</p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Tarih</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Fiş No</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Masa</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Ürün</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">İptal nedeni</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Stok iade</th>
                                        <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Tutar</th>
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
                                                    <span className="text-emerald-700 font-bold" title="Mutfağa gitmeden iptal — stok iade edildi">Evet</span>
                                                ) : (
                                                    <span className="text-slate-500 font-medium" title="Mutfakta üretildikten sonra iptal — stok iade edilmedi">Hayır</span>
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
                        <p className="font-bold uppercase tracking-wider">Seçilen tarih aralığında iade kaydı yok</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Tarih</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">İade No / Orijinal Fiş</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Ürün</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">İade nedeni</th>
                                    <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Tutar</th>
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
