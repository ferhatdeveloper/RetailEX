import React, { useState, useEffect, useCallback } from 'react';
import {
    Bike, Clock, MapPin, Phone, CheckCircle2, Timer,
    Search, ChevronRight, Navigation, PackageCheck, Plus,
    ArrowLeft, RefreshCw, X, AlertCircle, Wallet, CreditCard, Landmark,
} from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { Badge } from '@/components/ui/badge';
import { RestaurantService, type DeliveryExpectedPaymentMethod } from '../../../services/restaurant';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import type { FoodDeliveryChannelId } from '../../../config/foodDeliveryChannels';
import { FOOD_DELIVERY_CHANNELS, getFoodDeliveryChannelMeta } from '../../../config/foodDeliveryChannels';

type DeliveryStatus = 'pending' | 'preparing' | 'on_way' | 'delivered';

interface DeliveryOrder {
    id: string;
    orderNo: string;
    customerName: string;
    address: string;
    phone: string;
    courier?: string;
    deliveryStatus: DeliveryStatus;
    total: number;
    startTime: string;
    itemCount: number;
    channel: FoodDeliveryChannelId;
    externalOrderId: string;
    itemsSummary: string;
    paymentMethod: DeliveryExpectedPaymentMethod;
    paymentPosted: boolean;
}

interface NewOrderForm {
    customerName: string;
    phone: string;
    address: string;
    channel: FoodDeliveryChannelId;
    externalOrderId: string;
    itemsSummary: string;
    totalAmount: string;
    expectedPaymentMethod: DeliveryExpectedPaymentMethod;
}

interface DeliveryManagementProps {
    onBack?: () => void;
}

export const DeliveryManagement: React.FC<DeliveryManagementProps> = ({ onBack }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [orders, setOrders] = useState<DeliveryOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [newForm, setNewForm] = useState<NewOrderForm>({
        customerName: '',
        phone: '',
        address: '',
        channel: 'manual',
        externalOrderId: '',
        itemsSummary: '',
        totalAmount: '',
        expectedPaymentMethod: 'cash',
    });
    const [channelFilter, setChannelFilter] = useState<FoodDeliveryChannelId | 'all'>('all');
    const [saving, setSaving] = useState(false);

    const loadOrders = useCallback(async () => {
        try {
            setError(null);
            const rows = await RestaurantService.getDeliveryOrders();
            setOrders(rows as DeliveryOrder[]);
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

    const handleStatusChange = async (orderId: string, next: DeliveryStatus) => {
        try {
            await RestaurantService.updateDeliveryStatus(orderId, next);
            setOrders(prev => prev.map(o =>
                o.id === orderId
                    ? { ...o, deliveryStatus: next, paymentPosted: next === 'delivered' ? true : o.paymentPosted }
                    : o
            ).filter(o => next !== 'delivered' || o.id !== orderId));
            if (next === 'delivered') {
                // Bilgi: tutar seçilen ödeme türüne göre kasa veya bankaya işlendi
            }
        } catch (e: any) {
            alert('Durum güncellenemedi: ' + (e?.message ?? e));
        }
    };

    const handlePaymentMethodChange = async (orderId: string, method: DeliveryExpectedPaymentMethod) => {
        try {
            await RestaurantService.updateDeliveryExpectedPaymentMethod(orderId, method);
            setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, paymentMethod: method } : o)));
        } catch (e: any) {
            alert('Ödeme türü güncellenemedi: ' + (e?.message ?? e));
        }
    };

    const handleCreateOrder = async () => {
        if (!newForm.customerName.trim() || !newForm.address.trim()) return;
        setSaving(true);
        try {
            const totalNum = newForm.totalAmount.trim()
                ? Number(String(newForm.totalAmount).replace(',', '.'))
                : undefined;
            await RestaurantService.createDeliveryOrder({
                customerName: newForm.customerName.trim(),
                phone: newForm.phone.trim(),
                address: newForm.address.trim(),
                channel: newForm.channel,
                externalOrderId: newForm.externalOrderId.trim() || undefined,
                itemsSummary: newForm.itemsSummary.trim() || undefined,
                totalAmount: totalNum !== undefined && !Number.isNaN(totalNum) ? totalNum : undefined,
                expectedPaymentMethod: newForm.expectedPaymentMethod,
            });
            setNewForm({
                customerName: '',
                phone: '',
                address: '',
                channel: 'manual',
                externalOrderId: '',
                itemsSummary: '',
                totalAmount: '',
                expectedPaymentMethod: 'cash',
            });
            setShowNewModal(false);
            await loadOrders();
        } catch (e: any) {
            alert('Sipariş oluşturulamadı: ' + (e?.message ?? e));
        } finally {
            setSaving(false);
        }
    };

    const getStatusColor = (s: DeliveryStatus) => {
        switch (s) {
            case 'pending':   return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'preparing': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'on_way':    return 'bg-purple-100 text-purple-700 border-purple-200';
            case 'delivered': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        }
    };
    const getStatusLabel = (s: DeliveryStatus) => {
        switch (s) {
            case 'pending':   return 'Onay Bekliyor';
            case 'preparing': return 'Hazırlanıyor';
            case 'on_way':    return 'Yolda';
            case 'delivered': return 'Teslim Edildi';
        }
    };
    const nextStatus = (s: DeliveryStatus): DeliveryStatus | null => {
        const flow: DeliveryStatus[] = ['pending', 'preparing', 'on_way', 'delivered'];
        const idx = flow.indexOf(s);
        return idx < flow.length - 1 ? flow[idx + 1] : null;
    };
    const nextLabel = (s: DeliveryStatus) => {
        switch (s) {
            case 'pending':   return 'Hazırlamaya Başla';
            case 'preparing': return 'Yola Çıkar';
            case 'on_way':    return 'Teslim Et';
            default:          return '';
        }
    };

    const paymentMethodHint = (m: DeliveryExpectedPaymentMethod) => {
        switch (m) {
            case 'card': return 'Teslimde → kasaya (kart)';
            case 'transfer': return 'Teslimde → bankaya';
            default: return 'Teslimde → kasaya (nakit)';
        }
    };

    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    const filtered = orders.filter(o => {
        if (channelFilter !== 'all' && o.channel !== channelFilter) return false;
        if (!q) return true;
        const name = o.customerName.toLocaleLowerCase('tr-TR');
        const addr = o.address.toLocaleLowerCase('tr-TR');
        const ext = (o.externalOrderId || '').toLowerCase();
        const sum = (o.itemsSummary || '').toLocaleLowerCase('tr-TR');
        return (
            name.includes(q) ||
            o.phone.includes(searchQuery.trim()) ||
            addr.includes(q) ||
            ext.includes(q) ||
            sum.includes(q)
        );
    });

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
                            <Bike className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black italic tracking-tighter text-white uppercase leading-none">Paket Servis</h2>
                            <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-1">Delivery Management System</p>
                        </div>
                    </div>
                    <div className="relative flex-1 max-w-lg group ml-8">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 group-focus-within:text-white transition-colors" />
                        <input type="text" placeholder="Müşteri, adres veya telefon ara..."
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
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none">AKTİF PAKET</p>
                            <p className="text-lg font-black text-white leading-none mt-1">{orders.length}</p>
                        </div>
                    </div>
                    <button onClick={() => setShowNewModal(true)}
                        className="flex items-center gap-2 bg-white text-blue-600 px-6 py-3 rounded-2xl font-black text-[11px] uppercase hover:bg-slate-50 transition-all active:scale-95 shadow-lg">
                        <Plus className="w-4 h-4" /> Yeni Paket
                    </button>
                </div>
            </div>

            {/* Kanal filtreleri */}
            <div className="px-4 lg:px-6 pt-3 pb-0 flex flex-wrap gap-2 shrink-0">
                <button
                    type="button"
                    onClick={() => setChannelFilter('all')}
                    className={cn(
                        'px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide border transition-all',
                        channelFilter === 'all'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    )}
                >
                    Tümü
                </button>
                {FOOD_DELIVERY_CHANNELS.map((c) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => setChannelFilter(c.id)}
                        className={cn(
                            'px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wide border transition-all',
                            channelFilter === c.id
                                ? 'bg-slate-800 text-white border-slate-800'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400',
                            c.id === 'manual' && channelFilter === c.id && 'bg-slate-600'
                        )}
                    >
                        {c.shortLabel}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 lg:p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
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
                        {filtered.map(order => (
                            <div key={order.id} className="bg-white border border-slate-200 rounded-[2.5rem] p-6 hover:border-blue-500 hover:shadow-2xl transition-all flex flex-col shadow-sm min-h-[340px] overflow-visible">
                                <div className="flex justify-between items-start mb-5 shrink-0 gap-2">
                                    <div className="min-w-0">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">{order.orderNo}</span>
                                        <h3 className="font-black text-slate-800 text-lg leading-none">{order.customerName}</h3>
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            <span
                                                className={cn(
                                                    'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border',
                                                    getFoodDeliveryChannelMeta(order.channel).accentClass
                                                )}
                                            >
                                                {getFoodDeliveryChannelMeta(order.channel).label}
                                            </span>
                                            {order.externalOrderId ? (
                                                <span className="text-[9px] font-bold text-slate-500 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200">
                                                    #{order.externalOrderId}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <Badge className={cn("text-[9px] font-black uppercase tracking-wider py-1.5 px-3 rounded-xl border-none shadow-sm shrink-0", getStatusColor(order.deliveryStatus))}>
                                        {getStatusLabel(order.deliveryStatus)}
                                    </Badge>
                                </div>
                                <div className="space-y-3 mb-4 bg-slate-50/50 p-4 rounded-[1.5rem] border border-slate-100 min-h-0 flex-1">
                                    {order.address && (
                                        <div className="flex items-start gap-3 text-slate-500">
                                            <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-blue-500/70" />
                                            <p className="text-xs font-bold line-clamp-2 leading-snug">{order.address}</p>
                                        </div>
                                    )}
                                    {order.phone && (
                                        <div className="flex items-center gap-3 text-slate-500">
                                            <Phone className="w-4 h-4 shrink-0 text-emerald-500/70" />
                                            <p className="text-xs font-black text-slate-700">{order.phone}</p>
                                        </div>
                                    )}
                                    {order.courier && (
                                        <p className="text-[10px] text-purple-600 font-bold">Kurye: {order.courier}</p>
                                    )}
                                    {order.itemsSummary && (
                                        <p className="text-[11px] text-slate-600 font-medium leading-snug line-clamp-3 border-t border-slate-100 pt-2 mt-1">
                                            {order.itemsSummary}
                                        </p>
                                    )}
                                </div>
                                <div className="shrink-0 pt-4 border-t border-slate-100 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-100">
                                            <Timer className="w-4 h-4 text-blue-500" />
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
                                        <p className="text-[9px] font-bold text-slate-500 mt-1.5 text-right leading-tight max-w-[11rem] ml-auto">
                                            {paymentMethodHint(order.paymentMethod)}
                                        </p>
                                    </div>
                                </div>
                                <div className="shrink-0 mt-2 space-y-2">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ödeme türü (teslimde kasa/banka)</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {([
                                            { id: 'cash' as const, Icon: Wallet, label: 'Nakit' },
                                            { id: 'card' as const, Icon: CreditCard, label: 'Kart' },
                                            { id: 'transfer' as const, Icon: Landmark, label: 'Havale' },
                                        ]).map(({ id, Icon, label }) => (
                                            <button
                                                key={id}
                                                type="button"
                                                disabled={order.paymentPosted}
                                                onClick={() => void handlePaymentMethodChange(order.id, id)}
                                                className={cn(
                                                    'flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-tight transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none',
                                                    order.paymentMethod === id
                                                        ? 'border-blue-600 bg-blue-50 text-blue-800 shadow-sm'
                                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                                )}
                                            >
                                                <Icon className="w-4 h-4 shrink-0" />
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="shrink-0 mt-4 flex gap-3 bg-slate-50/80 -mx-2 px-2 py-3 rounded-2xl border border-slate-100">
                                    {nextStatus(order.deliveryStatus) ? (
                                        <button
                                            type="button"
                                            onClick={() => handleStatusChange(order.id, nextStatus(order.deliveryStatus)!)}
                                            className={cn(
                                                "flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 text-white border-0",
                                                order.deliveryStatus === 'on_way'
                                                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                                                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                                            )}>
                                            {order.deliveryStatus === 'on_way' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Navigation className="w-4 h-4 shrink-0" />}
                                            {nextLabel(order.deliveryStatus)}
                                        </button>
                                    ) : (
                                        <span className="flex-1 py-3.5 rounded-2xl text-[11px] font-black uppercase text-slate-500 flex items-center justify-center bg-slate-100">Teslim edildi</span>
                                    )}
                                    <button type="button" className="p-3.5 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl hover:bg-slate-100 hover:border-slate-300 transition-all active:scale-95 shadow-sm" title="Detay">
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {filtered.length === 0 && !loading && (
                            <div className="col-span-full flex flex-col items-center justify-center py-24 text-slate-400">
                                <Bike className="w-16 h-16 mb-4 opacity-30" />
                                <p className="font-black uppercase tracking-widest text-sm">Aktif paket servis siparişi yok</p>
                                <button onClick={() => setShowNewModal(true)}
                                    className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-all">
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
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b">
                            <h3 className="text-lg font-black text-slate-800">Yeni Paket Sipariş</h3>
                            <button onClick={() => setShowNewModal(false)} className="p-2 hover:bg-slate-100 rounded-xl">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Müşteri Adı *</label>
                                <input value={newForm.customerName} onChange={e => setNewForm(p => ({ ...p, customerName: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Ad Soyad" />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Telefon</label>
                                <input value={newForm.phone} onChange={e => setNewForm(p => ({ ...p, phone: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="0555 123 45 67" type="tel" />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Teslimat Adresi *</label>
                                <textarea value={newForm.address} onChange={e => setNewForm(p => ({ ...p, address: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    rows={3} placeholder="Cadde, Sokak, No, İlçe..." />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Platform / Kanal</label>
                                <select
                                    value={newForm.channel}
                                    onChange={e => setNewForm(p => ({ ...p, channel: e.target.value as FoodDeliveryChannelId }))}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                >
                                    {FOOD_DELIVERY_CHANNELS.map((c) => (
                                        <option key={c.id} value={c.id}>{c.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Harici sipariş no (isteğe bağlı)</label>
                                <input
                                    value={newForm.externalOrderId}
                                    onChange={e => setNewForm(p => ({ ...p, externalOrderId: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Örn. YS- veya platform sipariş kodu"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Ürün özeti (isteğe bağlı)</label>
                                <textarea
                                    value={newForm.itemsSummary}
                                    onChange={e => setNewForm(p => ({ ...p, itemsSummary: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    rows={2}
                                    placeholder="2x Döner, 1x Ayran..."
                                />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Tutar (isteğe bağlı)</label>
                                <input
                                    value={newForm.totalAmount}
                                    onChange={e => setNewForm(p => ({ ...p, totalAmount: e.target.value }))}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="0"
                                    inputMode="decimal"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-2">Teslimde ödeme</label>
                                <p className="text-[10px] text-slate-500 mb-2 leading-snug">
                                    Teslim edildiğinde tutar seçime göre kasa (nakit/kart) veya banka (havale) hesabına işlenir.
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setNewForm(p => ({ ...p, expectedPaymentMethod: 'cash' }))}
                                        className={cn(
                                            'py-2.5 rounded-xl border-2 text-[10px] font-black uppercase',
                                            newForm.expectedPaymentMethod === 'cash'
                                                ? 'border-blue-600 bg-blue-50 text-blue-800'
                                                : 'border-slate-200 bg-white text-slate-600'
                                        )}
                                    >
                                        Nakit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewForm(p => ({ ...p, expectedPaymentMethod: 'card' }))}
                                        className={cn(
                                            'py-2.5 rounded-xl border-2 text-[10px] font-black uppercase',
                                            newForm.expectedPaymentMethod === 'card'
                                                ? 'border-blue-600 bg-blue-50 text-blue-800'
                                                : 'border-slate-200 bg-white text-slate-600'
                                        )}
                                    >
                                        Kart
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewForm(p => ({ ...p, expectedPaymentMethod: 'transfer' }))}
                                        className={cn(
                                            'py-2.5 rounded-xl border-2 text-[10px] font-black uppercase',
                                            newForm.expectedPaymentMethod === 'transfer'
                                                ? 'border-blue-600 bg-blue-50 text-blue-800'
                                                : 'border-slate-200 bg-white text-slate-600'
                                        )}
                                    >
                                        Havale
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t flex gap-3">
                            <button onClick={() => setShowNewModal(false)}
                                className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                                İptal
                            </button>
                            <button onClick={handleCreateOrder} disabled={saving || !newForm.customerName.trim() || !newForm.address.trim()}
                                className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                {saving ? 'Kaydediliyor...' : 'Sipariş Oluştur'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
