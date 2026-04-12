import React, { useState } from 'react';
import { Phone, X, User, UserCircle, List, MapPin, ChevronDown, ChevronUp, Package, Mail } from 'lucide-react';
import type { Customer } from '@/core/types';
import type { RestaurantCallerIdEvent } from '../types';
import { findCustomerByCallerPhone, formatCustomerAddressLines } from '@/services/restaurantCallerIdService';
import { useCallerIdRestaurantOrders, type CallerIdOrderPreview } from '@/hooks/useCallerIdRestaurantOrders';
import { cn } from '@/components/ui/utils';
import { useRestaurantModuleTm } from '../hooks/useRestaurantModuleTm';

interface RestaurantIncomingCallBannerProps {
    event: RestaurantCallerIdEvent;
    customers: Customer[];
    onDismiss: () => void;
    pollError?: string | null;
    /** POS sekmesi dışındayken gösterilir */
    isOnPosTab?: boolean;
    onGoToPos?: () => void;
    /** Kayıtlı müşteriyi doğrudan POS’a yazar */
    onAssignMatched?: (customer: Customer) => void;
    /** Müşteri modalını telefon ile açar */
    onOpenCustomerPicker?: (phone: string) => void;
}

function fmtMoney(v: number | string | null | undefined): string {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    if (Number.isNaN(n)) return '—';
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(iso: string | undefined): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function itemCount(row: CallerIdOrderPreview): number {
    const it = row.items;
    if (!Array.isArray(it)) return 0;
    return it.filter(Boolean).length;
}

export function RestaurantIncomingCallBanner({
    event,
    customers,
    onDismiss,
    pollError,
    isOnPosTab = false,
    onGoToPos,
    onAssignMatched,
    onOpenCustomerPicker,
}: RestaurantIncomingCallBannerProps) {
    const tmR = useRestaurantModuleTm();
    const orderStatusLabel = (s: string | undefined): string => {
        switch (s) {
            case 'closed':
                return tmR('resCallerClosed');
            case 'open':
                return tmR('resCallerOpen');
            case 'billed':
                return tmR('resCallerBilled');
            case 'cancelled':
                return tmR('resCallerCancelled');
            default:
                return s || '—';
        }
    };
    const match = findCustomerByCallerPhone(customers, event.phone);
    const displayPhone = event.phone;
    const [detailOpen, setDetailOpen] = useState(true);

    const { orders, loading: ordersLoading, error: ordersError } = useCallerIdRestaurantOrders(
        match?.id,
        !!match
    );

    const { singleLine: addressLine, hasAny: hasAddress } = match ? formatCustomerAddressLines(match) : { singleLine: '', hasAny: false };

    return (
        <div
            className={cn(
                'fixed left-1/2 -translate-x-1/2 z-[200] w-[calc(100%-2rem)]',
                match ? 'max-w-xl' : 'max-w-lg',
                'bottom-4 md:bottom-6 animate-in slide-in-from-bottom-4 fade-in duration-300'
            )}
        >
            <div className="rounded-2xl shadow-2xl border border-violet-200 bg-white overflow-hidden max-h-[85vh] flex flex-col">
                <div className="flex items-stretch shrink-0">
                    <div className="bg-violet-600 text-white px-4 flex items-center justify-center shrink-0">
                        <Phone className="w-6 h-6" />
                    </div>
                    <div className="flex-1 p-4 min-w-0 overflow-hidden">
                        <div className="text-[10px] font-black uppercase tracking-widest text-violet-600 mb-1">
                            {tmR('resCallerIncomingTitle')}
                        </div>
                        <div className="text-xl font-black text-slate-900 tracking-tight truncate">{displayPhone}</div>
                        {event.name ? (
                            <div className="text-sm font-semibold text-slate-600 mt-1 truncate">{event.name}</div>
                        ) : null}
                        {match ? (
                            <div className="mt-2 space-y-1">
                                <div className="flex items-center gap-2 text-sm text-emerald-700 font-bold">
                                    <User className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{match.name}</span>
                                </div>
                                {match.email ? (
                                    <div className="flex items-center gap-2 text-xs text-slate-500">
                                        <Mail className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{match.email}</span>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <div className="mt-2 text-xs text-slate-500 font-medium">
                                {tmR('resCallerNoPhoneMatch')}
                            </div>
                        )}
                        {pollError ? (
                            <div className="mt-2 text-[11px] text-amber-700 font-medium truncate" title={pollError}>
                                {pollError}
                            </div>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                            {!isOnPosTab && onGoToPos ? (
                                <button
                                    type="button"
                                    onClick={onGoToPos}
                                    className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors"
                                >
                                    {tmR('resCallerGoPos')}
                                </button>
                            ) : null}
                            {match && onAssignMatched ? (
                                <button
                                    type="button"
                                    onClick={() => onAssignMatched(match)}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1"
                                >
                                    <UserCircle className="w-3.5 h-3.5" />
                                    {tmR('resCallerAssign')}
                                </button>
                            ) : null}
                            {onOpenCustomerPicker ? (
                                <button
                                    type="button"
                                    onClick={() => onOpenCustomerPicker(displayPhone)}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors flex items-center gap-1"
                                >
                                    <List className="w-3.5 h-3.5" />
                                    {tmR('resCallerList')}
                                </button>
                            ) : null}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="px-3 hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                        aria-label={tmR('resCallerClose')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {match ? (
                    <div className="border-t border-slate-100 bg-slate-50/80 shrink min-h-0 flex flex-col">
                        <button
                            type="button"
                            onClick={() => setDetailOpen((v) => !v)}
                            className="flex items-center justify-between w-full px-4 py-2.5 text-left text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100/80 transition-colors"
                        >
                            <span>{tmR('resCallerAddressHistory')}</span>
                            {detailOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        {detailOpen ? (
                            <div className="px-4 pb-4 space-y-3 overflow-y-auto max-h-[min(320px,40vh)] custom-scrollbar">
                                <div className="rounded-xl bg-white border border-slate-100 p-3">
                                    <div className="flex items-start gap-2">
                                        <MapPin className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">
                                                {tmR('resCallerDeliveryAddrLabel')}
                                            </div>
                                            {hasAddress ? (
                                                <p className="text-sm text-slate-800 font-medium leading-snug break-words">
                                                    {addressLine}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-slate-400 italic">{tmR('resCallerNoAddress')}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-white border border-slate-100 p-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Package className="w-4 h-4 text-violet-500 shrink-0" />
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                            {tmR('resCallerRecentOrders')}
                                        </span>
                                    </div>
                                    {ordersLoading ? (
                                        <p className="text-xs text-slate-500 animate-pulse">{tmR('resCallerLoading')}</p>
                                    ) : ordersError ? (
                                        <p className="text-xs text-amber-700 font-medium">{ordersError}</p>
                                    ) : orders.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic">{tmR('resCallerNoOrders')}</p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {orders.map((row) => (
                                                <li
                                                    key={row.id}
                                                    className="text-xs border border-slate-100 rounded-lg p-2.5 bg-slate-50/50"
                                                >
                                                    <div className="flex justify-between gap-2 items-start">
                                                        <div className="min-w-0">
                                                            <div className="font-bold text-slate-800 truncate">
                                                                {row.order_no || row.id.slice(0, 8)}
                                                                {row.table_number ? (
                                                                    <span className="font-semibold text-slate-500">
                                                                        {' '}
                                                                        {tmR('resCallerOrderTableSuffix').replace('{n}', String(row.table_number))}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div className="text-slate-500 mt-0.5">{fmtDate(row.opened_at)}</div>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <div className="font-black text-slate-800">{fmtMoney(row.total_amount)}</div>
                                                            <div className="text-[10px] text-slate-500">
                                                                {itemCount(row)} {tmR('resCallerLineItems')} · {orderStatusLabel(row.status)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
