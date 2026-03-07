import React from 'react';
import { X, BookmarkCheck, BookmarkPlus, RotateCcw, Trash2, Info } from 'lucide-react';
import { cn } from '../../ui/utils';

interface ParkedOrder {
    id: string;
    time: string;
    tableNum?: string;
    waiter?: string;
    customer?: any;
    items: any[];
}

interface RestaurantParkedOrdersModalProps {
    orders: ParkedOrder[];
    onClose: () => void;
    onResume: (order: ParkedOrder) => void;
    onDelete: (id: string) => void;
    fmt: (num: number) => string;
}

export function RestaurantParkedOrdersModal({
    orders,
    onClose,
    onResume,
    onDelete,
    fmt
}: RestaurantParkedOrdersModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Gradient */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 pt-8 pb-6 shrink-0 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center justify-between mb-6 relative z-10 text-white">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                                <BookmarkCheck className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight">Bekleyen Siparişler</h3>
                                <p className="text-[10px] text-white/70 font-black uppercase tracking-widest mt-0.5">
                                    {orders.length} AKTİF BEKLEYEN
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-all active:scale-90"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Session Info Style Bar */}
                <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                        <Info className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        Park edilmiş siparişleri geri yükleyebilir veya silebilirsiniz.
                    </p>
                </div>

                <div className="flex-1 overflow-auto p-6 space-y-4">
                    {orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-300">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                <BookmarkPlus className="w-10 h-10 opacity-20" />
                            </div>
                            <p className="text-[13px] font-black uppercase tracking-widest text-slate-400">Bekleyen sipariş bulunmuyor</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {orders.map(p => (
                                <div key={p.id} className="bg-white border border-slate-200 rounded-[24px] p-5 hover:border-blue-300 transition-all hover:shadow-lg hover:shadow-blue-500/5 group flex flex-col">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-[12px] font-black text-slate-400">#{p.id.slice(-6)}</span>
                                                {p.tableNum && (
                                                    <span className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-black uppercase tracking-tighter shadow-md shadow-blue-200">
                                                        Masa {p.tableNum}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[11px] text-slate-500 font-bold space-y-0.5 pt-1 uppercase tracking-tight">
                                                <div className="flex items-center gap-1.5"><span className="opacity-40">Saat:</span> {p.time}</div>
                                                {p.waiter && <div className="flex items-center gap-1.5"><span className="opacity-40">Personel:</span> {p.waiter}</div>}
                                                {p.customer && <div className="flex items-center gap-1.5"><span className="opacity-40">Müşteri:</span> {p.customer.name}</div>}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-slate-400 font-black uppercase mb-1 tracking-widest">TOPLAM</div>
                                            <div className="text-[20px] font-black text-slate-900 leading-none">
                                                {fmt(p.items.reduce((s, i) => s + (i.subtotal ?? 0), 0))}
                                            </div>
                                            <div className="text-[10px] text-blue-600 font-bold mt-1 uppercase tracking-tight">{p.items.length} KALEM</div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-4 mb-5 max-h-24 overflow-auto space-y-2 border border-slate-100 flex-1">
                                        {p.items.map((item, i) => (
                                            <div key={i} className="flex justify-between text-[11px] items-center">
                                                <span className="truncate flex-1 font-bold text-slate-600">{item.product.name}</span>
                                                <span className="ml-3 font-black text-slate-900 bg-white px-1.5 rounded-md border border-slate-200">×{item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onResume(p)}
                                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200 group-active:scale-95"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" /> Geri Yükle
                                        </button>
                                        <button
                                            onClick={() => { if (confirm(`${p.id} silinsin mi?`)) onDelete(p.id); }}
                                            className="w-12 h-12 flex items-center justify-center border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-xl transition-all active:scale-90"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer with consistent style */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-8 py-3.5 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] hover:bg-slate-100 transition-all active:scale-95"
                    >
                        Kapat
                    </button>
                </div>
            </div>
        </div>
    );
}
