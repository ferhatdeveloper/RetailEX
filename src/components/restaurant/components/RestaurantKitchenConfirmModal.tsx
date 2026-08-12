import React, { useMemo } from 'react';
import { ChefHat, CheckCircle, Info, Clock, Utensils } from 'lucide-react';
import { cn } from '../../ui/utils';
import { useRestaurantModuleTm } from '../hooks/useRestaurantModuleTm';

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

export function RestaurantKitchenConfirmModal({
    cart,
    table,
    plates,
    platePalette,
    onClose,
    onConfirm,
    fmt
}: RestaurantKitchenConfirmModalProps) {
    const tm = useRestaurantModuleTm();

    const statusConfig = useMemo(
        (): Record<KitchenStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> => ({
            pending: {
                label: tm('resKitchenLineStatusPending'),
                color: '#b45309',
                bg: '#fef3c7',
                icon: <Clock className="w-3 h-3" />,
            },
            cooking: {
                label: tm('resKitchenLineStatusCooking'),
                color: '#ea580c',
                bg: '#ffedd5',
                icon: <ChefHat className="w-3 h-3" />,
            },
            ready: {
                label: tm('resKitchenLineStatusReady'),
                color: '#16a34a',
                bg: '#dcfce7',
                icon: <CheckCircle className="w-3 h-3" />,
            },
            served: {
                label: tm('resKitchenLineStatusServed'),
                color: '#7c3aed',
                bg: '#f5f3ff',
                icon: <Utensils className="w-3 h-3" />,
            },
        }),
        [tm]
    );
    // Sadece henüz gönderilmemiş (pending) satırlar
    const pendingItems = cart.filter(item => !item.kitchenStatus || item.kitchenStatus === 'pending');
    const sentItems = cart.filter(item => item.kitchenStatus && item.kitchenStatus !== 'pending');
    const pendingCount = pendingItems.reduce((s: number, i: any) => s + i.quantity, 0);

    const renderRow = (item: any, i: number, dimmed = false) => {
        const plate = item.plate as string | undefined;
        const pIdx = plate ? plates.indexOf(plate) : -1;
        const pal = pIdx >= 0 ? platePalette[pIdx % platePalette.length] : null;
        const ks: KitchenStatus = item.kitchenStatus || 'pending';
        const sc = statusConfig[ks];

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
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300"
            style={{ zIndex: 2147483647, isolation: 'isolate', transform: 'translateZ(0)' }}
        >
            <div
                className="bg-white rounded-[32px] w-full max-w-sm max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col relative"
                style={{ zIndex: 10 }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 flex items-center justify-between text-white relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                            <ChefHat className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black uppercase tracking-tight leading-none">{tm('resKitchenConfirmTitle')}</h3>
                            <p className="text-[10px] text-white/70 font-black uppercase tracking-widest mt-1.5">
                                {table
                                    ? tm('resKitchenConfirmSubtitleTable').replace('{n}', String(table.number))
                                    : tm('resKitchenConfirmSubtitleNewOrder')}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col p-6 overflow-hidden">
                    {/* Özet */}
                    {pendingCount > 0 ? (
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center gap-3 shrink-0">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-emerald-600 shadow-sm">
                                <Info className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold text-emerald-700 leading-tight uppercase tracking-wider">
                                {tm('resKitchenConfirmPendingSummary').replace('{n}', String(pendingCount))}
                            </p>
                        </div>
                    ) : (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 flex items-center gap-3 shrink-0">
                            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-amber-600 shadow-sm">
                                <ChefHat className="w-4 h-4" />
                            </div>
                            <p className="text-[11px] font-bold text-amber-700 leading-tight uppercase tracking-wider">
                                {tm('resKitchenConfirmAllSent')}
                            </p>
                        </div>
                    )}

                    {/* Satır listesi — ekrana sığar, taşarsa scroll */}
                    <div className="flex-1 min-h-0 mt-4 flex flex-col overflow-hidden">
                        <div className="bg-slate-50 border-2 border-slate-100 rounded-[24px] flex-1 min-h-0 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                            {/* Bekleyen satırlar */}
                            {pendingItems.map((item, i) => renderRow(item, i, false))}
                            {/* Zaten gönderilmiş satırlar — soluk */}
                            {sentItems.map((item, i) => renderRow(item, pendingItems.length + i, true))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] hover:bg-slate-100 transition-all active:scale-95 shadow-sm"
                    >
                        {tm('resKitchenConfirmCancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={pendingCount === 0}
                        className="flex-1 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[12px] flex items-center justify-center gap-2 shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChefHat className="w-5 h-5" />
                        {tm('resKitchenConfirmSend')}
                        {pendingCount > 0 && ` (${pendingCount})`}
                    </button>
                </div>
            </div>
        </div>
    );
}
