import React, { useState, useEffect, useCallback } from 'react';
import {
    ShoppingBag, Timer, Phone, CheckCircle2, Search,
    ChevronRight, PackageCheck, Plus, ArrowLeft, RefreshCw, X, Coffee, AlertCircle
} from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { Badge } from '@/components/ui/badge';
import { RestaurantService } from '../../../services/restaurant';
import { formatMoneyAmount } from '../../../utils/formatMoney';

type TakeawayStatus = 'pending' | 'preparing' | 'ready' | 'picked_up';

interface TakeawayOrder {
    id: string;
    orderNo: string;
    customerName: string;
    phone: string;
    takeawayStatus: TakeawayStatus;
    total: number;
    startTime: string;
    itemCount: number;
}

interface NewOrderForm {
    customerName: string;
    phone: string;
}

interface TakeawayManagementProps {
    onBack?: () => void;
}

export const TakeawayManagement: React.FC<TakeawayManagementProps> = ({ onBack }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [orders, setOrders] = useState<TakeawayOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [newForm, setNewForm] = useState<NewOrderForm>({ customerName: '', phone: '' });
    const [saving, setSaving] = useState(false);

    const loadOrders = useCallback(async () => {
        try {
            setError(null);
            const rows = await RestaurantService.getTakeawayOrders();
            setOrders(rows as TakeawayOrder[]);
        } catch (e: any) {
            setError(e?.message || 'Siparişler yüklenemedi');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadOrders();
        const interval = setInterval(loadOrders, 30000);
        return () => clearInterval(interval);
    }, [loadOrders]);

    const handleStatusChange = async (orderId: string, next: TakeawayStatus) => {
        try {
            await RestaurantService.updateTakeawayStatus(orderId, next);
            setOrders(prev =>
                prev.map(o => o.id === orderId ? { ...o, takeawayStatus: next } : o)
                    .filter(o => next !== 'picked_up' || o.id !== orderId)
            );
        } catch (e: any) {
            alert('Durum güncellenemedi: ' + (e?.message ?? e));
        }
    };

    const handleCreateOrder = async () => {
        if (!newForm.customerName.trim()) return;
        setSaving(true);
        try {
            await RestaurantService.createTakeawayOrder({
                customerName: newForm.customerName.trim(),
                phone: newForm.phone.trim(),
            });
            setNewForm({ customerName: '', phone: '' });
            setShowNewModal(false);
            await loadOrders();
        } catch (e: any) {
            alert('Sipariş oluşturulamadı: ' + (e?.message ?? e));
        } finally {
            setSaving(false);
        }
    };

    const getStatusColor = (s: TakeawayStatus) => {
        switch (s) {
            case 'pending':   return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'preparing': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'ready':     return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'picked_up': return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };
    const getStatusLabel = (s: TakeawayStatus) => {
        switch (s) {
            case 'pending':   return 'Bekliyor';
            case 'preparing': return 'Hazırlanıyor';
            case 'ready':     return 'Hazır';
            case 'picked_up': return 'Teslim Edildi';
        }
    };
    const nextStatus = (s: TakeawayStatus): TakeawayStatus | null => {
        const flow: TakeawayStatus[] = ['pending', 'preparing', 'ready', 'picked_up'];
        const idx = flow.indexOf(s);
        return idx < flow.length - 1 ? flow[idx + 1] : null;
    };
    const nextLabel = (s: TakeawayStatus) => {
        switch (s) {
            case 'pending':   return 'Hazırlamaya Başla';
            case 'preparing': return 'Hazır İşaretle';
            case 'ready':     return 'Teslim Et';
            default:          return '';
        }
    };

    const filtered = orders.filter(o =>
        !searchQuery ||
        o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.phone.includes(searchQuery)
    );

    const readyCount = orders.filter(o => o.takeawayStatus === 'ready').length;
    const preparingCount = orders.filter(o => o.takeawayStatus === 'preparing').length;

    return (
        <div className="flex flex-col h-full bg-[#f8f9fa] animate-in fade-in duration-300">
            {/* Header */}
            <div className="border-b px-6 py-4 flex items-center justify-between z-20 shrink-0 gap-8 shadow-2xl"
                style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}>
                <div className="flex items-center gap-4 flex-1">
                    <button onClick={onBack}
                        className="flex items-center gap-2.5 px-6 py-3 bg-white/15 hover:bg-white/25 text-white rounded-2xl transition-all active:scale-95 border border-white/20 font-black uppercase text-[12px] group shrink-0 shadow-inner">
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span>Geri</span>
                    </button>
                    <div className="flex items-center gap-4 ml-4">
                        <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                            <ShoppingBag className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black italic tracking-tighter text-white uppercase leading-none">Gel-Al Sipariş</h2>
                            <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-1">Takeaway & Pickup Management</p>
                        </div>
                    </div>
                    <div className="relative flex-1 max-w-lg group ml-8">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                        <input type="text" placeholder="Müşteri veya telefon ara..."
                            className="w-full bg-white/10 border border-white/20 rounded-2xl h-12 pl-12 pr-4 text-sm focus:ring-2 focus:ring-white/30 text-white placeholder:text-white/35 outline-none font-medium"
                            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button onClick={loadOrders}
                        className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all border border-white/20">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-6 px-6 py-2 bg-black/20 rounded-2xl border border-white/10">
                        <div className="text-center">
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none">AKTİF</p>
                            <p className="text-lg font-black text-white leading-none mt-1">{orders.length}</p>
                        </div>
                    </div>
                    <button onClick={() => setShowNewModal(true)}
                        className="flex items-center gap-2 bg-white text-blue-600 px-6 py-3 rounded-2xl font-black text-[11px] uppercase hover:bg-slate-50 transition-all active:scale-95 shadow-lg">
                        <Plus className="w-4 h-4" /> Yeni Sipariş
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 lg:p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-gray-500 font-medium">Siparişler yükleniyor...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                            <p className="text-red-600 font-medium">{error}</p>
                            <button onClick={loadOrders} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Tekrar Dene</button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {/* Summary Card */}
                        <div className="bg-orange-500 rounded-[2.5rem] p-8 text-white flex flex-col justify-between shadow-2xl shadow-orange-500/20 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                                <ShoppingBag size={120} />
                            </div>
                            <div className="relative z-10">
                                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-6 backdrop-blur-md border border-white/20">
                                    <Coffee className="w-7 h-7" />
                                </div>
                                <h4 className="text-2xl font-black uppercase tracking-tight leading-tight">Gel-Al<br />Durumu</h4>
                                <p className="text-orange-100 text-sm mt-2 opacity-80 font-medium">{orders.length} aktif sipariş.</p>
                            </div>
                            <div className="space-y-3 mt-12 relative z-10">
                                <div className="flex justify-between items-center text-sm font-black uppercase tracking-widest bg-white/10 p-3 rounded-xl border border-white/10">
                                    <span>Hazırlananlar</span>
                                    <span className="text-lg">{preparingCount}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-black uppercase tracking-widest bg-emerald-400/20 p-3 rounded-xl border border-emerald-400/20">
                                    <span>Hazır Olanlar</span>
                                    <span className="text-lg">{readyCount}</span>
                                </div>
                            </div>
                        </div>

                        {filtered.map(order => (
                            <div key={order.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-6 hover:border-orange-500 hover:shadow-2xl transition-all flex flex-col shadow-sm min-h-[300px] overflow-visible">
                                <div className="flex justify-between items-start mb-5 shrink-0">
                                    <div>
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{order.orderNo}</span>
                                        <h3 className="font-black text-slate-800 text-lg leading-none">{order.customerName}</h3>
                                    </div>
                                    <Badge className={cn("text-[9px] font-black uppercase tracking-wider py-1.5 px-3 rounded-xl border-none shadow-sm", getStatusColor(order.takeawayStatus))}>
                                        {getStatusLabel(order.takeawayStatus)}
                                    </Badge>
                                </div>
                                <div className="space-y-4 mb-4 bg-slate-50/50 p-5 rounded-[1.5rem] border border-slate-100 min-h-0 flex-1">
                                    {order.phone && (
                                        <div className="flex items-center gap-3 text-slate-500">
                                            <Phone className="w-4 h-4 shrink-0 text-orange-500/70" />
                                            <p className="text-xs font-black text-slate-700">{order.phone}</p>
                                        </div>
                                    )}
                                    {order.itemCount > 0 && (
                                        <Badge variant="outline" className="bg-white border-slate-200 text-slate-700 font-black text-[10px] px-3 py-1 rounded-lg shadow-sm">
                                            {order.itemCount} ÜRÜN
                                        </Badge>
                                    )}
                                </div>
                                <div className="shrink-0 pt-4 border-t border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-orange-50 p-2.5 rounded-xl border border-orange-100">
                                            <Timer className="w-4 h-4 text-orange-500" />
                                        </div>
                                        <span className="text-xs font-black text-slate-700 tabular-nums">
                                            {Math.floor((Date.now() - new Date(order.startTime).getTime()) / 60000)} dk
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] font-black text-slate-400 uppercase block leading-none mb-1.5 tracking-widest">ÖDENECEK</span>
                                        <span className="text-xl font-black text-slate-900 tabular-nums leading-none">
                                            {formatMoneyAmount(order.total, { minFrac: 0, maxFrac: 2 })}
                                        </span>
                                    </div>
                                </div>
                                <div className="shrink-0 mt-4 flex gap-3 bg-orange-50/80 -mx-2 px-2 py-3 rounded-2xl border border-orange-100">
                                    {nextStatus(order.takeawayStatus) ? (
                                        <button
                                            type="button"
                                            onClick={() => handleStatusChange(order.id, nextStatus(order.takeawayStatus)!)}
                                            className={cn(
                                                "flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 text-white border-0",
                                                order.takeawayStatus === 'ready'
                                                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                                                    : 'bg-orange-600 hover:bg-orange-700 shadow-orange-500/20'
                                            )}>
                                            {order.takeawayStatus === 'ready' ? <PackageCheck className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
                                            {nextLabel(order.takeawayStatus)}
                                        </button>
                                    ) : (
                                        <span className="flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase text-slate-500 flex items-center justify-center bg-slate-100">Teslim alındı</span>
                                    )}
                                    <button type="button" className="p-3.5 bg-white border-2 border-orange-200 text-orange-700 rounded-2xl hover:bg-orange-50 transition-all active:scale-95 shadow-sm" title="Detay">
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {filtered.length === 0 && !loading && (
                            <div className="col-span-full flex flex-col items-center justify-center py-24 text-slate-400">
                                <ShoppingBag className="w-16 h-16 mb-4 opacity-30" />
                                <p className="font-black uppercase tracking-widest text-sm">Aktif gel-al siparişi yok</p>
                                <button onClick={() => setShowNewModal(true)}
                                    className="mt-6 px-6 py-3 bg-orange-500 text-white rounded-2xl font-black text-sm hover:bg-orange-600 transition-all">
                                    İlk Siparişi Oluştur
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* New Order Modal */}
            {showNewModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h3 className="text-lg font-black text-slate-800">Yeni Gel-Al Sipariş</h3>
                            <button onClick={() => setShowNewModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Müşteri Adı *</label>
                                <input value={newForm.customerName} onChange={e => setNewForm(p => ({ ...p, customerName: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    placeholder="Ad Soyad" />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Telefon</label>
                                <input value={newForm.phone} onChange={e => setNewForm(p => ({ ...p, phone: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    placeholder="0555 123 45 67" type="tel" />
                            </div>
                        </div>
                        <div className="p-6 border-t flex gap-3">
                            <button onClick={() => setShowNewModal(false)}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                                İptal
                            </button>
                            <button onClick={handleCreateOrder} disabled={saving || !newForm.customerName.trim()}
                                className="flex-1 py-3 bg-orange-500 text-white rounded-xl text-sm font-black hover:bg-orange-600 transition-all disabled:opacity-50">
                                {saving ? 'Kaydediliyor...' : 'Sipariş Oluştur'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
