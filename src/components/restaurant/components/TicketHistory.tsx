import React, { useState, useEffect, useMemo } from 'react';
import {
    Search,
    Printer,
    Info,
    Filter,
    ArrowUpDown,
    Calendar,
    ChevronRight,
    Download,
    Mail,
    FileText,
    History,
    ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import { RestaurantService } from '../../../services/restaurant';

interface TicketHistoryProps {
    onClose?: () => void;
}

interface Ticket {
    id: string;
    orderNo: string;
    customer: string;
    table: string;
    openTime: string;
    closeTime: string;
    waiter: string;
    total: number;
}

function fmt(dateStr: string | null | undefined) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('tr-TR');
}

export function TicketHistory({ onClose }: TicketHistoryProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilter, setShowFilter] = useState(false);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(false);

    const loadTickets = async () => {
        setLoading(true);
        try {
            const rows = await RestaurantService.getOrderHistory({
                status: 'closed',
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
                limit: 200,
            });
            setTickets(rows.map((r: any) => ({
                id: r.id,
                orderNo: r.order_no ?? `#${r.id.slice(0, 8)}`,
                customer: r.customer_name ?? 'Peşin Satış',
                table: r.table_number ?? '—',
                openTime: fmt(r.opened_at),
                closeTime: fmt(r.closed_at),
                waiter: r.waiter ?? '—',
                total: Number(r.total_amount ?? 0),
            })));
        } catch (err) {
            console.error('[TicketHistory] load error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadTickets(); }, []);

    const filtered = useMemo(() => {
        if (!searchQuery.trim()) return tickets;
        const q = searchQuery.toLowerCase();
        return tickets.filter(t =>
            t.orderNo.toLowerCase().includes(q) ||
            t.customer.toLowerCase().includes(q) ||
            t.table.toLowerCase().includes(q) ||
            t.waiter.toLowerCase().includes(q)
        );
    }, [tickets, searchQuery]);

    return (
        <div className="flex flex-col h-full bg-slate-100/50 relative overflow-hidden animate-in fade-in duration-300">
            {/* Standardized Premium Appbar */}
            <div
                className="border-b px-6 py-4 flex items-center justify-between z-20 shrink-0 gap-8 shadow-2xl"
                style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}
            >
                <div className="flex items-center gap-4 flex-1">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2.5 px-6 py-3 bg-white/15 hover:bg-white/25 text-white rounded-2xl transition-all active:scale-95 border border-white/20 font-black uppercase text-[12px] group shrink-0 shadow-inner"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span>Geri</span>
                    </button>
                    <div className="flex items-center gap-4 ml-4">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                            <History className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black italic tracking-tighter text-white uppercase leading-none">Geçmiş Adisyonlar</h2>
                            <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-1">Ticket & Sales History</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <ToolbarIcon icon={<Mail className="w-5 h-5" />} />
                    <ToolbarIcon icon={<FileText className="w-5 h-5" />} />
                    <ToolbarIcon icon={<Download className="w-5 h-5" />} />
                </div>
            </div>

            {/* Toolbar (Image 3) */}
            <div className="bg-white border-b border-slate-200 p-4 flex flex-col gap-4 shrink-0 shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="relative flex-1 max-w-xl group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors font-bold" />
                        <input
                            type="text"
                            placeholder="Adisyon, müşteri veya masa ara..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-12 pr-4 text-xs font-bold focus:ring-4 focus:ring-blue-500/5 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-inner"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        <button
                            onClick={() => setShowFilter(!showFilter)}
                            className={cn(
                                "flex items-center gap-2 px-5 py-3 rounded-2xl transition-all border font-black uppercase text-[10px] tracking-widest shadow-lg",
                                showFilter
                                    ? "bg-blue-600 text-white border-blue-700 active:scale-95"
                                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                            )}
                        >
                            <Filter className="w-4 h-4" />
                            <span>FİLTRE{showFilter ? 'Yİ KAPAT' : 'LE'}</span>
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sütun gruplama için sürükleyip bırakın</p>
                    <div className="flex items-center gap-4">
                        {loading && <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest animate-pulse">Yükleniyor...</span>}
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Toplam Kayıt: {filtered.length}</span>
                    </div>
                </div>
            </div>

            {/* List Table (Image 3) */}
            <div className="flex-1 overflow-auto bg-white custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                        <tr>
                            <th className="p-4 w-12"></th>
                            <th className="p-4 w-12 text-center"><ArrowUpDown className="w-3.5 h-3.5 text-blue-600" /></th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-20">ID</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Müşteri</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Masa</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Açılış</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Kapanış</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Garson</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Kişi</th>
                            <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-8">Tutar</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filtered.length === 0 && !loading && (
                            <tr>
                                <td colSpan={9} className="p-12 text-center text-[11px] font-black text-slate-300 uppercase tracking-widest">
                                    Kayıt bulunamadı
                                </td>
                            </tr>
                        )}
                        {filtered.map((t) => (
                            <tr key={t.id} className="hover:bg-blue-50/40 transition-all group cursor-pointer">
                                <td className="p-4">
                                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-white group-hover:border-blue-200 transition-colors">
                                        <Info className="w-4 h-4 text-orange-500" />
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50/50 flex items-center justify-center border border-blue-100 group-hover:bg-blue-600 group-hover:border-blue-700 transition-colors">
                                        <Printer className="w-4 h-4 text-blue-600 group-hover:text-white" />
                                    </div>
                                </td>
                                <td className="p-4 text-[12px] font-black text-slate-400">{t.orderNo}</td>
                                <td className="p-4 text-[12px] font-black text-slate-700 uppercase">{t.customer}</td>
                                <td className="p-4 text-[12px] font-black text-blue-600 uppercase">
                                    <span className="bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">{t.table}</span>
                                </td>
                                <td className="p-4 text-[11px] font-bold text-slate-400">{t.openTime}</td>
                                <td className="p-4 text-[11px] font-bold text-slate-400">{t.closeTime}</td>
                                <td className="p-4 text-[11px] font-black text-slate-500 uppercase">{t.waiter}</td>
                                <td className="p-4 text-[14px] font-black text-slate-900 text-right pr-8">
                                    {t.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-slate-100 p-3 flex justify-between items-center shrink-0 px-6 shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">RetailEX Platform Engine</span>
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[10px] font-black text-slate-400 uppercase">Sistem Aktif</span>
                    </div>
                </div>
            </div>

            {/* Filter Panel (Solid Flat Style) */}
            {showFilter && (
                <div className="absolute top-0 right-0 w-80 h-full bg-white z-30 border-l border-slate-200 animate-in slide-in-from-right duration-300 shadow-2xl">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                                <Filter className="w-4 h-4 text-blue-600" />
                            </div>
                            <h3 className="text-sm font-black uppercase text-slate-700 tracking-tight">Filtreleme</h3>
                        </div>
                        <button onClick={() => setShowFilter(false)} className="text-[10px] font-black text-blue-600 border-b border-blue-600/30 hover:text-blue-800 transition-colors uppercase">Kapat</button>
                    </div>
                    <div className="p-8 space-y-8">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Başlangıç Tarihi</label>
                            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl hover:border-blue-400 transition-all">
                                <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                                <input
                                    type="date"
                                    className="flex-1 bg-transparent text-xs font-black text-slate-700 outline-none"
                                    value={fromDate}
                                    onChange={e => setFromDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Bitiş Tarihi</label>
                            <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl hover:border-blue-400 transition-all">
                                <Calendar className="w-4 h-4 text-red-500 shrink-0" />
                                <input
                                    type="date"
                                    className="flex-1 bg-transparent text-xs font-black text-slate-700 outline-none"
                                    value={toDate}
                                    onChange={e => setToDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="pt-10">
                            <Button
                                onClick={() => { loadTickets(); setShowFilter(false); }}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-[0.2em] h-14 rounded-2xl shadow-xl shadow-blue-200 active:scale-95 transition-all"
                            >
                                Uygula
                            </Button>
                            <p className="text-center text-[9px] font-bold text-slate-300 mt-4 uppercase">Tarih seçip uygulayın</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ToolbarIcon({ icon }: { icon: React.ReactNode }) {
    return (
        <button className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20 text-white hover:bg-white/20 transition-all active:scale-95 shadow-lg">
            {icon}
        </button>
    );
}


