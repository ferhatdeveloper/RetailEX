import React, { useEffect, useState } from 'react';
import { ChefHat, Clock, CheckCircle, Bell, Utensils, ArrowLeft, Filter, RefreshCw } from 'lucide-react';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { cn } from '@/components/ui/utils';
import { KitchenOrder, OrderItem } from '../types';

interface SyncOrderItem extends OrderItem {
    startAt?: string;
    estimatedReadyAt?: string;
    preparationTime?: number;
}

interface SyncKitchenOrder extends Omit<KitchenOrder, 'items'> {
    items: SyncOrderItem[];
    estimatedReadyAt?: string;
}

interface KitchenDisplayProps {
    onBack?: () => void;
}

export function KitchenDisplay({ onBack }: KitchenDisplayProps) {
    const { kitchenOrders, loadKitchenOrders, markAsReady, markAsServed } = useRestaurantStore();
    const [filter, setFilter] = useState<'all' | 'new' | 'cooking' | 'ready'>('all');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        loadKitchenOrders().finally(() => setLoading(false));
        const interval = setInterval(() => loadKitchenOrders(), 5000); // 5s auto-refresh
        return () => clearInterval(interval);
    }, []);

    const filteredOrders = kitchenOrders.filter(o =>
        filter === 'all' ? true : o.status === filter
    );

    return (
        <div className="flex flex-col h-full bg-[#f8f9fa] animate-in fade-in duration-300 overflow-hidden">
            {/* Header — butonlar görünür, sağ blok taşmayacak */}
            <div className="border-b px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 z-20 shrink-0 shadow-2xl min-h-[72px]"
                style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}>
                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-shrink-0">
                    <button onClick={onBack}
                        className="flex items-center gap-2 px-4 py-2.5 sm:px-6 sm:py-3 bg-white text-blue-600 hover:bg-white/95 rounded-xl sm:rounded-2xl transition-all active:scale-95 border-2 border-white font-black uppercase text-[11px] sm:text-[12px] shrink-0 shadow-lg">
                        <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>Geri</span>
                    </button>
                    <button
                        onClick={() => { setLoading(true); loadKitchenOrders().finally(() => setLoading(false)); }}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 bg-white text-blue-600 hover:bg-white/95 rounded-xl sm:rounded-2xl transition-all active:scale-95 border-2 border-white font-black uppercase text-[11px] sm:text-[12px] shrink-0 shadow-lg disabled:opacity-60"
                        title="Mutfak siparişlerini yenile"
                    >
                        <RefreshCw className={cn("w-4 h-4 sm:w-5 sm:h-5", loading && "animate-spin")} />
                        <span>Yenile</span>
                    </button>
                    <div className="flex items-center gap-3 ml-2 sm:ml-4 min-w-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white/20 rounded-xl flex items-center justify-center border border-white/30 shrink-0">
                            <ChefHat className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base sm:text-xl font-black italic tracking-tighter text-white uppercase leading-none truncate">Mutfak Ekranı (KDS)</h2>
                            <p className="text-[9px] sm:text-[10px] text-white/70 font-bold uppercase tracking-widest mt-0.5">Kitchen Display System</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-6 shrink-0">
                    {/* Status Filters */}
                    <div className="flex items-center gap-1.5 sm:gap-2 bg-white/15 p-1.5 rounded-xl sm:rounded-2xl border border-white/20">
                        <FilterButton active={filter === 'all'} label="TÜMÜ" onClick={() => setFilter('all')} />
                        <FilterButton active={filter === 'new'} label="YENİ" onClick={() => setFilter('new')} activeColor="bg-blue-500" />
                        <FilterButton active={filter === 'cooking'} label="PİŞİYOR" onClick={() => setFilter('cooking')} activeColor="bg-amber-500" />
                        <FilterButton active={filter === 'ready'} label="HAZIR" onClick={() => setFilter('ready')} activeColor="bg-emerald-500" />
                    </div>

                    {/* Yoğunluk göstergesi */}
                    <div className="flex items-center gap-2 px-4 py-2 sm:px-6 sm:py-2.5 bg-white/20 rounded-xl sm:rounded-2xl border border-white/20">
                        <p className="text-[9px] font-black text-white/80 uppercase tracking-widest leading-none whitespace-nowrap">Yoğunluk</p>
                        <span className={cn(
                            "text-xs sm:text-sm font-black uppercase tracking-tighter whitespace-nowrap",
                            kitchenOrders.length > 15 ? "text-red-200" : kitchenOrders.length > 8 ? "text-amber-200" : "text-emerald-200"
                        )}>
                            {kitchenOrders.length > 15 ? "YÜKSEK" : kitchenOrders.length > 8 ? "ORTA" : "DÜŞÜK"}
                        </span>
                        <div className="flex gap-1">
                            <div className={cn("w-1.5 h-3 rounded-full", kitchenOrders.length > 0 ? "bg-emerald-300" : "bg-white/30")} />
                            <div className={cn("w-1.5 h-3 rounded-full", kitchenOrders.length > 8 ? "bg-amber-300" : "bg-white/30")} />
                            <div className={cn("w-1.5 h-3 rounded-full", kitchenOrders.length > 15 ? "bg-red-300" : "bg-white/30")} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Grid Area */}
            <div className="flex-1 overflow-auto p-6 scrollbar-hide">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                    {filteredOrders.map((order) => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            onReady={() => markAsReady(order.id)}
                            onServed={() => markAsServed(order.id)}
                        />
                    ))}
                    {filteredOrders.length === 0 && (
                        <div className="col-span-full h-[60vh] flex flex-col items-center justify-center text-slate-400 animate-in fade-in zoom-in-95 duration-500">
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-xl mb-6 border border-slate-100">
                                <Utensils className="w-12 h-12 text-slate-300" />
                            </div>
                            <h2 className="text-xl font-black uppercase tracking-[0.2em] italic text-slate-300">Bekleyen Sipariş Yok</h2>
                            <p className="text-slate-400 font-bold mt-2">Mutfak şu an sakin görünüyor.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function OrderCard({ order, onReady, onServed }: { order: KitchenOrder, onReady: () => void, onServed: () => void }) {
    const isLate = order.elapsed > 15;

    return (
        <div className={cn(
            "bg-white rounded-[2.5rem] overflow-hidden border-2 transition-all duration-300 flex flex-col shadow-sm group",
            order.status === 'ready' ? "border-emerald-500/30 shadow-emerald-500/5 bg-emerald-50/10" : "border-slate-100 hover:border-blue-500/30 hover:shadow-2xl hover:shadow-blue-500/10",
            isLate && order.status !== 'ready' && "border-red-500/40 shadow-xl shadow-red-500/5 animate-pulse"
        )}>
            {/* Card Header */}
            <div className={cn(
                "px-6 py-5 flex items-center justify-between border-b transition-colors",
                order.status === 'ready' ? "bg-emerald-500/10 border-emerald-500/10" : "bg-slate-50/70 border-slate-100 group-hover:bg-blue-50/30"
            )}>
                <div className="flex flex-col">
                    <span className="text-2xl font-black tracking-tighter italic text-slate-800 uppercase leading-none">Masa {order.tableName}</span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">{order.waiter}</span>
                </div>
                <div className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 font-black text-[12px] tabular-nums shadow-sm",
                    isLate && order.status !== 'ready'
                        ? "border-red-500/20 bg-red-50 text-red-500"
                        : "border-slate-200 bg-white text-slate-600"
                )}>
                    <Clock className="w-4 h-4" />
                    <span>{order.elapsed} dk</span>
                </div>
            </div>

            {/* Items List */}
            <div className="flex-1 p-6 space-y-5">
                {order.items.map((item: any, idx) => {
                    const startAt = item.start_at || item.startAt;
                    const shouldStartAt = startAt ? new Date(startAt).getTime() : 0;
                    const now = new Date().getTime();
                    const waitMs = shouldStartAt - now;
                    const isTime = waitMs <= 0;
                    const waitMin = Math.ceil(waitMs / 60000);

                    return (
                        <div key={idx} className="flex flex-col gap-1 pr-1 border-l-4 border-slate-100 pl-4 py-1 transition-colors hover:border-blue-500/20">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm shadow-lg shadow-blue-500/20">
                                        {item.quantity}
                                    </span>
                                    <div className="flex flex-col">
                                        <span className="font-black text-slate-800 text-[15px] leading-snug uppercase tracking-tight">{item.name}</span>
                                        {item.preparation_time && (
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                                                ⏱️ {item.preparation_time} dk hazırlık
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {item.status === 'ready' ? (
                                    <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                                        <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                                    </div>
                                ) : (
                                    !isTime && order.status === 'new' && (
                                        <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-1.5 animate-pulse">
                                            <Clock className="w-3 h-3 text-amber-500" />
                                            <span className="text-[9px] font-black text-amber-500">BEKLE: {waitMin} dk</span>
                                        </div>
                                    )
                                )}
                            </div>

                            {!isTime && order.status === 'new' && (
                                <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500 animate-in slide-in-from-left duration-1000" style={{ width: '40%' }} />
                                </div>
                            )}

                            {isTime && item.status !== 'ready' && order.status !== 'ready' && (
                                <button
                                    type="button"
                                    onClick={onReady}
                                    className="mt-2 w-full sm:w-auto flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[11px] sm:text-[12px] uppercase tracking-widest shadow-lg shadow-blue-500/30 border-2 border-blue-500 transition-all active:scale-95"
                                >
                                    <Utensils className="w-4 h-4 shrink-0" />
                                    PİŞİRMEYE BAŞLA!
                                </button>
                            )}

                            {item.notes && (
                                <div className="text-[11px] font-black text-amber-600 uppercase italic tracking-tighter mt-1 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 inline-block w-fit">
                                    📢 {item.notes}
                                </div>
                            )}
                            {item.course && (
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">
                                    {item.course}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 group-hover:bg-white transition-colors">
                {order.status === 'ready' ? (
                    <button
                        onClick={onServed}
                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[20px] font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20"
                    >
                        <Bell className="w-4 h-4" /> SERVİS EDİLDİ
                    </button>
                ) : (
                    <button
                        onClick={onReady}
                        className="w-full py-4 bg-slate-900 hover:bg-black text-white rounded-[20px] font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center justify-center gap-3 shadow-xl"
                    >
                        <ChefHat className="w-4 h-4" /> MUTFAK HAZIR
                    </button>
                )}
            </div>
        </div>
    );
}

function FilterButton({ active, label, onClick, activeColor = "bg-blue-600" }: { active: boolean, label: string, onClick: () => void, activeColor?: string }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                active
                    ? cn(activeColor, "text-white shadow-lg")
                    : "text-white/80 hover:text-white hover:bg-white/10 border border-white/20"
            )}
        >
            {label}
        </button>
    );
}
