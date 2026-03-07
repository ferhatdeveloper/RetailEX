import React from 'react';
import { X, UtensilsCrossed, CheckCircle, Info } from 'lucide-react';
import { cn } from '../../ui/utils';

interface RestaurantSplitBillModalProps {
    cart: any[];
    selectedItems: number[];
    onToggleItem: (idx: number) => void;
    onClose: () => void;
    onConfirm: () => void;
    fmt: (num: number) => string;
}

export function RestaurantSplitBillModal({
    cart,
    selectedItems,
    onToggleItem,
    onClose,
    onConfirm,
    fmt
}: RestaurantSplitBillModalProps) {
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Indigo Gradient */}
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-8 py-8 text-white flex justify-between items-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="relative z-10 flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                            <UtensilsCrossed className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight">Adisyon Parçala</h3>
                            <p className="text-[10px] text-indigo-100 font-bold uppercase tracking-widest mt-0.5">Yeni adisyona taşınacak ürünleri seçin</p>
                        </div>
                    </div>

                    <div className="relative z-10 bg-white/10 px-5 py-3 rounded-2xl border border-white/20 backdrop-blur-sm shadow-xl flex flex-col items-end">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">SEÇİLEN</span>
                        <span className="text-xl font-black leading-none mt-1">{selectedItems.length} ÜRÜN</span>
                    </div>
                </div>

                <div className="p-8 space-y-6 flex-1 flex flex-col min-h-0">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-indigo-600 shadow-sm">
                            <Info className="w-4 h-4" />
                        </div>
                        <p className="text-[11px] font-bold text-indigo-700 leading-tight uppercase tracking-wider">
                            Sadece mutfağa gönderilmiş ve kaydedilmiş ürünler parçalanabilir.
                        </p>
                    </div>

                    <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
                        {cart.map((item, idx) => (
                            <button
                                key={idx}
                                onClick={() => onToggleItem(idx)}
                                className={cn(
                                    "w-full flex items-center justify-between p-5 rounded-[24px] border-2 transition-all active:scale-[0.98] group",
                                    selectedItems.includes(idx)
                                        ? "bg-indigo-50 border-indigo-500 shadow-lg shadow-indigo-500/5"
                                        : "bg-slate-50 border-transparent hover:border-indigo-200 hover:bg-white"
                                )}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shadow-sm",
                                        selectedItems.includes(idx) ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200"
                                    )}>
                                        {selectedItems.includes(idx) && <CheckCircle className="w-4 h-4" />}
                                    </div>
                                    <div className="text-left">
                                        <div className="font-black text-[15px] text-slate-800 uppercase leading-none">{item.product.name}</div>
                                        <div className="text-[11px] font-bold text-slate-400 mt-1 uppercase tracking-tight">×{item.quantity} ADET</div>
                                    </div>
                                </div>
                                <div className="font-black text-indigo-600 text-lg tabular-nums">
                                    {fmt(item.subtotal || 0)}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] transition-all hover:bg-slate-100 active:scale-95 shadow-sm"
                    >
                        VAZGEÇ
                    </button>
                    <button
                        disabled={selectedItems.length === 0}
                        onClick={onConfirm}
                        className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase text-[12px] transition-all shadow-xl shadow-indigo-200 disabled:opacity-50 disabled:shadow-none active:scale-95 flex items-center justify-center gap-2"
                    >
                        <CheckCircle className="w-5 h-5" /> SEÇİLENLERİ AYIR
                    </button>
                </div>
            </div>
        </div>
    );
}
