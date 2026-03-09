import React from 'react';
import { X, ChefHat, CheckCircle, Info, Clock, Utensils } from 'lucide-react';
import { cn } from '../../ui/utils';

type KitchenStatus = 'pending' | 'cooking' | 'ready' | 'served';

interface RestaurantKitchenConfirmModalProps {
    cart: any[];
    table?: any;
    plates: string[];
    platePalette: { bg: string; text: string; border: string }[];
    onClose: () => void;
    onConfirm: () => void;
    fmt: (num: number) => string;
}

const STATUS_CONFIG: Record<KitchenStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    pending: { label: 'Bekliyor', color: '#b45309', bg: '#fef3c7', icon: <Clock className="w-3 h-3" /> },
    cooking: { label: 'Mutfakta', color: '#ea580c', bg: '#ffedd5', icon: <ChefHat className="w-3 h-3" /> },
    ready: { label: 'Hazır', color: '#16a34a', bg: '#dcfce7', icon: <CheckCircle className="w-3 h-3" /> },
    served: { label: 'Servis Edildi', color: '#7c3aed', bg: '#f5f3ff', icon: <Utensils className="w-3 h-3" /> },
};

export function RestaurantKitchenConfirmModal({
    cart,
    table,
    plates,
    platePalette,
    onClose,
    onConfirm,
    fmt
}: RestaurantKitchenConfirmModalProps) {
    // Sadece henüz gönderilmemiş (pending) satırlar
    const pendingItems = cart.filter(item => !item.kitchenStatus || item.kitchenStatus === 'pending');
    const sentItems = cart.filter(item => item.kitchenStatus && item.kitchenStatus !== 'pending');
    const pendingCount = pendingItems.reduce((s: number, i: any) => s + i.quantity, 0);

    const renderRow = (item: any, i: number, dimmed = false) => {
        const plate = item.plate as string | undefined;
        const pIdx = plate ? plates.indexOf(plate) : -1;
        const pal = pIdx >= 0 ? platePalette[pIdx % platePalette.length] : null;
        const ks: KitchenStatus = item.kitchenStatus || 'pending';
        const sc = STATUS_CONFIG[ks];

        return (
            <div
                key={i}
                className={cn(
                    "flex items-center justify-between text-[13px] bg-white p-3 rounded-xl border transition-colors",
                    dimmed ? "border-slate-100 opacity-50" : "border-slate-100 hover:border-emerald-200"
                )}
            >
                <div className="flex-1 min-w-0 flex items-center gap-2">
                    {pal && (
                        <span
                            style={{ backgroundColor: pal.bg, color: pal.text, borderColor: pal.border }}
                            className="px-2 py-0.5 rounded-lg border text-[10px] font-black shrink-0 shadow-sm"
                        >
                            {plate}
                        </span>
                    )}
                    <span className={cn("font-bold truncate", dimmed ? "text-slate-400 line-through" : "text-slate-700")}>
                        {item.product.name}
                    </span>
                    {item.note && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded-md font-black">NOT</span>}
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                    {/* Durum badge */}
                    <span
                        style={{ backgroundColor: sc.bg, color: sc.color }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase"
                    >
                        {sc.icon}
                        {sc.label}
                    </span>
                    <span className="font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">
                        ×{item.quantity}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-8 flex items-center justify-between text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                            <ChefHat className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight leading-none">Mutfağa Gönder</h3>
                            <p className="text-[10px] text-white/70 font-black uppercase tracking-widest mt-1.5">
                                {table ? `Masa ${table.number}` : 'YENİ SİPARİŞ'}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-4">
                    {/* Özet */}
                    {pendingCount > 0 ? (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-emerald-600 shadow-sm">
                                <Info className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold text-emerald-700 leading-tight uppercase tracking-wider">
                                {pendingCount} yeni ürün mutfağa gönderilecek.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-amber-600 shadow-sm">
                                <ChefHat className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold text-amber-700 leading-tight uppercase tracking-wider">
                                Tüm ürünler zaten mutfağa gönderildi.
                            </p>
                        </div>
                    )}

                    {/* Satır listesi */}
                    <div className="bg-slate-50 border-2 border-slate-100 rounded-[24px] p-4 max-h-[260px] overflow-auto space-y-2">
                        {/* Bekleyen satırlar */}
                        {pendingItems.map((item, i) => renderRow(item, i, false))}
                        {/* Zaten gönderilmiş satırlar — soluk */}
                        {sentItems.map((item, i) => renderRow(item, pendingItems.length + i, true))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] hover:bg-slate-100 transition-all active:scale-95 shadow-sm"
                    >
                        İPTAL
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={pendingCount === 0}
                        className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[12px] flex items-center justify-center gap-2 shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChefHat className="w-5 h-5" />
                        GÖNDER {pendingCount > 0 && `(${pendingCount})`}
                    </button>
                </div>
            </div>
        </div>
    );
}
