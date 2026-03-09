import React from 'react';
import {
    FileText,
    Printer,
    X,
    TrendingUp,
    PieChart,
    Users,
    Clock,
    Banknote,
    CreditCard,
    Ticket,
    ChevronRight
} from 'lucide-react';
import { cn } from '../../ui/utils';

interface ZReportData {
    date: string;
    openedAt: string;
    closedAt: string;
    staffName: string;
    openingCash: number;
    salesByCategory: { category: string; amount: number; count: number }[];
    paymentsByType: { type: string; amount: number; count: number }[];
    voids: { reason: string; amount: number; count: number }[];
    complements: { amount: number; count: number };
    totalSales: number;
    netCash: number;
}

interface RestaurantZReportProps {
    data: ZReportData;
    onClose: () => void;
    onPrint?: () => void;
}

export const RestaurantZReport: React.FC<RestaurantZReportProps> = ({ data, onClose, onPrint }) => {
    const fmt = (num: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'IQD' }).format(num);

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 pt-8 pb-6 shrink-0 relative overflow-hidden">
                    {/* Decorative Background Pattern */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                                <FileText className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tight">Z-RAPORU</h2>
                                <p className="text-[10px] font-black text-white/70 uppercase tracking-widest mt-0.5">Günlük Kasa Özeti</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">AÇILIŞ</p>
                            <p className="text-sm font-bold">{new Date(data.openedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">KAPANIŞ</p>
                            <p className="text-sm font-bold">{new Date(data.closedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">SORUMLU</p>
                            <p className="text-sm font-bold truncate">{data.staffName}</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-8 space-y-8">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-200">
                            <p className="text-[10px] font-black opacity-80 uppercase tracking-widest mb-2">TOPLAM SATIŞ</p>
                            <h3 className="text-3xl font-black">{fmt(data.totalSales)}</h3>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl shadow-emerald-200">
                            <p className="text-[10px] font-black opacity-80 uppercase tracking-widest mb-2">NET NAKİT</p>
                            <h3 className="text-3xl font-black">{fmt(data.netCash)}</h3>
                        </div>
                    </div>

                    {/* Category Sales */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <PieChart className="w-4 h-4 text-blue-500" />
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Kategori Bazlı Satışlar</h4>
                        </div>
                        <div className="bg-slate-50 rounded-[32px] p-2 space-y-1">
                            {data.salesByCategory.map((cat, i) => (
                                <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-[10px] font-black text-slate-500">
                                            {cat.count}
                                        </div>
                                        <span className="text-sm font-bold text-slate-700">{cat.category}</span>
                                    </div>
                                    <span className="font-black text-slate-900">{fmt(cat.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Payment Types */}
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <Banknote className="w-4 h-4 text-emerald-500" />
                            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Ödeme Tipleri</h4>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {data.paymentsByType.map((pt, i) => (
                                <div key={i} className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col items-center text-center">
                                    {pt.type === 'NAKİT' && <Banknote className="w-5 h-5 text-emerald-500 mb-2" />}
                                    {pt.type === 'KREDI KARTI' && <CreditCard className="w-5 h-5 text-blue-500 mb-2" />}
                                    {pt.type === 'YEMEK CEKI' && <Ticket className="w-5 h-5 text-purple-500 mb-2" />}
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{pt.type}</p>
                                    <p className="text-sm font-black text-slate-900">{fmt(pt.amount)}</p>
                                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">{pt.count} işlem</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Voids & Complements */}
                    <div className="grid grid-cols-2 gap-6">
                        <section>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 text-red-500">İptaller (Voids)</h4>
                            <div className="bg-red-50 rounded-2xl p-4 space-y-2 border border-red-100">
                                {data.voids.map((v, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-red-700">{v.reason}</span>
                                        <span className="font-black text-red-900">{fmt(v.amount)}</span>
                                    </div>
                                ))}
                                {data.voids.length === 0 && <p className="text-[10px] text-red-400 font-bold italic">İptal işlemi bulunmuyor</p>}
                            </div>
                        </section>
                        <section>
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1 text-slate-500">İkramlar</h4>
                            <div className="bg-slate-100 rounded-2xl p-4 flex justify-between items-center border border-slate-200">
                                <span className="text-xs font-bold text-slate-600">{data.complements.count} Ürün</span>
                                <span className="text-xs font-black text-slate-900">{fmt(data.complements.amount)}</span>
                            </div>
                        </section>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-8 bg-slate-50 border-t flex gap-4 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 px-8 py-4 bg-white border border-slate-200 text-slate-600 rounded-2xl font-black uppercase text-xs hover:bg-slate-100 transition-all"
                    >
                        KAPAT
                    </button>
                    <button
                        onClick={onPrint}
                        className="flex-1 px-8 py-4 bg-[#0f172a] text-white rounded-2xl font-black uppercase text-xs flex items-center justify-center gap-2 hover:bg-[#1e293b] transition-all shadow-xl shadow-slate-300 active:scale-95"
                    >
                        <Printer className="w-4 h-4" />
                        RAPORU YAZDIR
                    </button>
                </div>
            </div>
        </div>
    );
};
