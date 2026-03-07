import React from 'react';
import { X, ChefHat, CheckCircle, Info } from 'lucide-react';
import { cn } from '../../ui/utils';

interface RestaurantKitchenConfirmModalProps {
    cart: any[];
    table?: any;
    plates: string[];
    platePalette: { bg: string; text: string; border: string }[];
    onClose: () => void;
    onConfirm: () => void;
    fmt: (num: number) => string;
}

export function RestaurantKitchenConfirmModal({
    cart,
    table,
    plates,
    platePalette,
    onClose,
    onConfirm,
    fmt
}: RestaurantKitchenConfirmModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Green Gradient */}
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-8 flex items-center justify-between text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                            <ChefHat className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight leading-none">Mutfağa Gönder</h3>
                            <p className="text-[10px] text-white/70 font-black uppercase tracking-widest mt-1.5 tracking-widest">
                                {table ? `Masa ${table.number}` : 'YENİ SİPARİŞ'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-emerald-600 shadow-sm">
                            <Info className="w-4 h-4" />
                        </div>
                        <p className="text-[11px] font-bold text-emerald-700 leading-tight uppercase tracking-wider">
                            {cart.reduce((s, i) => s + i.quantity, 0)} ürün hazırlık için yönlendirilecek.
                        </p>
                    </div>

                    <div className="bg-slate-50 border-2 border-slate-100 rounded-[24px] p-5 max-h-[240px] overflow-auto space-y-2.5">
                        {cart.map((item, i) => {
                            const plate = (item as any).plate as string | undefined;
                            const pIdx = plate ? plates.indexOf(plate) : -1;
                            const pal = pIdx >= 0 ? platePalette[pIdx % platePalette.length] : null;

                            return (
                                <div key={i} className="flex items-center justify-between text-[13px] bg-white p-3 rounded-xl border border-slate-100 hover:border-emerald-200 transition-colors">
                                    <div className="flex-1 min-w-0 flex items-center gap-2">
                                        {pal && (
                                            <span
                                                style={{ backgroundColor: pal.bg, color: pal.text, borderColor: pal.border }}
                                                className="px-2 py-0.5 rounded-lg border text-[10px] font-black shrink-0 shadow-sm"
                                            >
                                                {plate}
                                            </span>
                                        )}
                                        <span className="text-slate-700 font-bold truncate">{item.product.name}</span>
                                        {(item as any).note && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded-md font-black">NOT</span>}
                                    </div>
                                    <span className="ml-3 font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 shrink-0">
                                        ×{item.quantity}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] hover:bg-slate-100 transition-all active:scale-95 shadow-sm"
                    >
                        İPTAL
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[12px] flex items-center justify-center gap-2 shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all"
                    >
                        <ChefHat className="w-5 h-5" /> GÖNDER
                    </button>
                </div>
            </div>
        </div>
    );
}
