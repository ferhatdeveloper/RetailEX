/**
 * AppointmentPrePaymentPanel — Randevu Ön Ödeme + Kalan Ödeme paneli
 *
 * Tek sorumluluk: randevuya bağlı deposit/remainder/complete aksiyonlarını UI
 * düzeyinde sunmak. Asıl iş mantığı `appointmentPaymentService` üzerinden.
 *
 * İki mod:
 *   • Booking modu (`!existingAppointment`): yeni randevu için ön ödeme tutarı + yöntemi seç.
 *   • Existing mod (`existingAppointment` ve `paymentSummary` dolu): mevcut randevunun özetini
 *     gösterir; deposit al, kalan ödeme al veya randevuyu tamamla butonları sunar.
 *
 * Muhasebe (kıdemli muhasebeci gözüyle):
 *   • Deposit  → cari avans ekstresi (−), kasa/banka (+); stok etkilenmez.
 *   • Remainder→ cari (−, hizmet borcuna), kasa/banka (+); stok etkilenmez.
 *   • Complete → stok/sarf düşer (beautyService.updateAppointmentStatus).
 */
import React, { useState } from 'react';
import { Banknote, Receipt } from 'lucide-react';
import type {
    AppointmentPaymentProvider,
    AppointmentPaymentSummary,
} from '../../../services/appointmentPaymentService';

const fmt = (n: number) => formatMoneyAmount(n, { minFrac: 0, maxFrac: 0 });

const iStyle: React.CSSProperties = {
    height: 34, padding: '0 10px', border: '1px solid #e5e7eb', borderRadius: 5,
    fontSize: 12, fontWeight: 500, color: '#111827', background: '#fafafa', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const selStyle: React.CSSProperties = { ...iStyle, cursor: 'pointer' };

function Label({ children }: { children: React.ReactNode }) {
    return (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.09em', display: 'block', marginBottom: 4 }}>
            {children}
        </span>
    );
}

function formatMoneyAmount(value: number, opts: { minFrac: number; maxFrac: number }): string {
    try {
        return new Intl.NumberFormat('tr-TR', {
            minimumFractionDigits: opts.minFrac,
            maximumFractionDigits: opts.maxFrac,
        }).format(value);
    } catch {
        return String(value);
    }
}

export interface AppointmentPrePaymentPanelProps {
    mode: 'booking' | 'existing';
    paymentSummary?: AppointmentPaymentSummary | null;
    /**
     * Booking modunda kullanıcının "şimdi ön ödeme alayım mı?" tercihi.
     * true → ön ödeme tutarı + provider + hint görünür.
     * false → "şimdi ödeme alınmayacak" kısa notu görünür, panel gizli kalır.
     */
    takeDepositAtBooking?: boolean;
    onToggleTakeDepositAtBooking?: (next: boolean) => void;
    labels: {
        prePaymentAmount: string;
        prePaymentProvider: string;
        cashLabel: string;
        cardLabel: string;
        gatewayLabel: string;
        bankTransferLabel?: string;
        prePaymentHint?: string;
        appointmentDeposit?: string;
        appointmentRemainder?: string;
        total?: string;
        remainderAmount?: string;
        appointmentTakeDeposit?: string;
        appointmentCollectRemainder?: string;
        appointmentComplete?: string;
        paidPanelTitle?: string;
        depositOnlyHint?: string;
        partialHint?: string;
        unpaidHint?: string;
        noAmountHint?: string;
        noPaymentAtBookingHint?: string;
        remainderPendingHint?: string;
    };
    depositAmount: string;
    depositProvider: AppointmentPaymentProvider;
    onDepositAmountChange: (v: string) => void;
    onDepositProviderChange: (v: AppointmentPaymentProvider) => void;
    onTakeDeposit: () => void;
    onCollectRemainder: () => void;
    onComplete: () => void;
    depositSubmitting: boolean;
    outstandingAmount: number;
    /** Booking modunda "kalan ödenecek" hesabı için kullanılır (parent'tan total). */
    bookingTotal?: number;
}

export function AppointmentPrePaymentPanel(props: AppointmentPrePaymentPanelProps) {
    const {
        mode, paymentSummary, labels,
        takeDepositAtBooking, onToggleTakeDepositAtBooking,
        depositAmount, depositProvider,
        onDepositAmountChange, onDepositProviderChange,
        onTakeDeposit, onCollectRemainder, onComplete,
        depositSubmitting,
        outstandingAmount,
        bookingTotal,
    } = props;
    const [localErr] = useState<string | null>(null);

    if (mode === 'booking') {
        // Kullanıcı "şimdi ödeme almayacağım" dediyse: panelin tamamı gizlenir,
        // yalnızca bilgilendirme + toggle görünür (randevu sadece kayıt amaçlı).
        if (!takeDepositAtBooking) {
            return (
                <div
                    style={{
                        padding: 10,
                        borderRadius: 8,
                        border: '1px dashed #e5e7eb',
                        background: '#f9fafb',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                    }}
                >
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#374151',
                            cursor: 'pointer',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={!!takeDepositAtBooking}
                            onChange={(e) => onToggleTakeDepositAtBooking?.(e.target.checked)}
                            style={{ width: 14, height: 14, accentColor: '#7c3aed' }}
                        />
                        {labels.prePaymentAmount}
                    </label>
                    {labels.noPaymentAtBookingHint && (
                        <p style={{ margin: 0, fontSize: 10, color: '#6b7280', lineHeight: 1.4 }}>
                            {labels.noPaymentAtBookingHint}
                        </p>
                    )}
                </div>
            );
        }
        return (
            <div
                style={{
                    padding: 10,
                    borderRadius: 8,
                    border: '1px dashed #c4b5fd',
                    background: '#faf5ff',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <Label>{labels.prePaymentAmount}</Label>
                    <label
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#7c3aed',
                            cursor: 'pointer',
                            textTransform: 'none',
                            letterSpacing: 0,
                        }}
                        title={labels.noPaymentAtBookingHint || 'Ödemeyi kapat'}
                    >
                        <input
                            type="checkbox"
                            checked={!!takeDepositAtBooking}
                            onChange={(e) => onToggleTakeDepositAtBooking?.(e.target.checked)}
                            style={{ width: 12, height: 12, accentColor: '#7c3aed' }}
                        />
                        ×
                    </label>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={depositAmount}
                        onChange={(e) => onDepositAmountChange(e.target.value)}
                        placeholder="0"
                        style={{ ...iStyle, flex: 1 }}
                    />
                    <select
                        value={depositProvider}
                        onChange={(e) => onDepositProviderChange(e.target.value as AppointmentPaymentProvider)}
                        style={{ ...selStyle, width: 110 }}
                    >
                        <option value="cash">{labels.cashLabel}</option>
                        <option value="card">{labels.cardLabel}</option>
                        <option value="gateway">{labels.gatewayLabel}</option>
                        <option value="bank_transfer">{labels.bankTransferLabel || 'Banka Havalesi'}</option>
                    </select>
                </div>
                {labels.prePaymentHint && (
                    <p style={{ margin: 0, fontSize: 10, color: '#6b7280', lineHeight: 1.4 }}>
                        {labels.prePaymentHint}
                    </p>
                )}
                {(() => {
                    // Booking modunda outstandingAmount parent'tan 0 gelir; total-deposit'i
                    // canlı hesaplayıp göster.
                    const dep = parseFloat(String(depositAmount).replace(',', '.'));
                    const bookingRemainder = Math.max(
                        0,
                        (bookingTotal ?? 0) - (Number.isFinite(dep) && dep > 0 ? dep : 0),
                    );
                    const showRemainder = bookingRemainder > 0 || outstandingAmount > 0;
                    if (!showRemainder) return null;
                    const displayRemainder = outstandingAmount > 0 ? outstandingAmount : bookingRemainder;
                    return (
                        <div
                            style={{
                                background: '#fffbeb',
                                border: '1px solid #fde68a',
                                borderRadius: 6,
                                padding: '6px 8px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}
                        >
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>
                                {labels.remainderAmount || 'Kalan Ödenecek'}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: '#b45309' }}>
                                {fmt(displayRemainder)}
                            </span>
                        </div>
                    );
                })()}
            </div>
        );
    }

    // existing mode
    if (!paymentSummary) return null;
    const outstandingBlocking = paymentSummary.outstandingAmount > 0;
    const completeDisabled = outstandingBlocking;
    const completeTitle = outstandingBlocking
        ? (labels.remainderPendingHint || 'Önce kalan ödeme alınmalı')
            : undefined;
    return (
        <div
            style={{
                padding: 10,
                borderRadius: 8,
                border: '1px solid #e8e4f0',
                background: '#faf5ff',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
            }}
        >
            <Label>
                {labels.appointmentDeposit} · {labels.appointmentRemainder}
            </Label>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563' }}>
                <span>{labels.total}:</span>
                <span style={{ fontWeight: 700 }}>{fmt(paymentSummary.totalPrice)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563' }}>
                <span>{labels.appointmentDeposit}:</span>
                <span style={{ fontWeight: 700 }}>{fmt(paymentSummary.depositAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#4b5563' }}>
                <span>{labels.appointmentRemainder}:</span>
                <span style={{ fontWeight: 700 }}>{fmt(paymentSummary.remainderPaidAmount)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#7c3aed', borderTop: '1px solid #e8e4f0', paddingTop: 6 }}>
                <span>{labels.remainderAmount}:</span>
                <span style={{ fontWeight: 800 }}>{fmt(paymentSummary.outstandingAmount)}</span>
            </div>
            {outstandingBlocking && (
                <div
                    role="status"
                    style={{
                        background: '#fffbeb',
                        border: '1px solid #fcd34d',
                        color: '#92400e',
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '6px 8px',
                        borderRadius: 6,
                        lineHeight: 1.4,
                    }}
                >
                    {labels.remainderPendingHint || 'Kalan ödeme bekleniyor — hizmet verildiğinde tahsil edilecek ve randevu o zaman tamamlanabilir.'}
                </div>
            )}
            <div style={{ fontSize: 10, color: '#6b7280' }}>
                {paymentSummary.paymentState === 'paid' && labels.paidPanelTitle}
                {paymentSummary.paymentState === 'deposit_only' && (labels.depositOnlyHint || 'Ön ödeme alındı; kalan bekleniyor.')}
                {paymentSummary.paymentState === 'partial' && (labels.partialHint || 'Kısmi ödeme alındı.')}
                {paymentSummary.paymentState === 'unpaid' && (labels.unpaidHint || 'Henüz ödeme alınmadı.')}
                {paymentSummary.paymentState === 'no_amount' && (labels.noAmountHint || 'Tutar tanımsız.')}
            </div>
            {paymentSummary.depositAmount <= 0 && paymentSummary.totalPrice > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={depositAmount}
                        onChange={(e) => onDepositAmountChange(e.target.value)}
                        placeholder={labels.prePaymentAmount}
                        style={{ ...iStyle, flex: 1 }}
                    />
                    <select
                        value={depositProvider}
                        onChange={(e) => onDepositProviderChange(e.target.value as AppointmentPaymentProvider)}
                        style={{ ...selStyle, width: 100 }}
                    >
                        <option value="cash">{labels.cashLabel}</option>
                        <option value="card">{labels.cardLabel}</option>
                        <option value="gateway">{labels.gatewayLabel}</option>
                        <option value="bank_transfer">{labels.bankTransferLabel || 'Banka'}</option>
                    </select>
                </div>
            )}
            {paymentSummary.depositAmount <= 0 && paymentSummary.totalPrice > 0 && (
                <button
                    type="button"
                    disabled={depositSubmitting || !depositAmount}
                    onClick={onTakeDeposit}
                    style={{
                        height: 32,
                        borderRadius: 6,
                        border: 'none',
                        background: depositSubmitting || !depositAmount ? '#e5e7eb' : '#7c3aed',
                        color: depositSubmitting || !depositAmount ? '#9ca3af' : '#fff',
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: depositSubmitting || !depositAmount ? 'not-allowed' : 'pointer',
                    }}
                >
                    {labels.appointmentTakeDeposit || 'Ön Ödeme Al'}
                </button>
            )}
            {outstandingAmount > 0 && paymentSummary.paymentState !== 'no_amount' && (
                <button
                    type="button"
                    onClick={onCollectRemainder}
                    style={{
                        height: 32,
                        borderRadius: 6,
                        border: '1px solid #7c3aed',
                        background: '#fff',
                        color: '#7c3aed',
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: 'pointer',
                    }}
                >
                    {labels.appointmentCollectRemainder || 'Kalan Ödeme Al'}
                </button>
            )}
            <button
                type="button"
                onClick={onComplete}
                disabled={completeDisabled}
                title={completeTitle}
                style={{
                    height: 32,
                    borderRadius: 6,
                    border: 'none',
                    background: completeDisabled ? '#e5e7eb' : '#059669',
                    color: completeDisabled ? '#9ca3af' : '#fff',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: completeDisabled ? 'not-allowed' : 'pointer',
                }}
            >
                {labels.appointmentComplete || 'Randevuyu Tamamla'}
            </button>
            {localErr && <p style={{ margin: 0, fontSize: 10, color: '#dc2626' }}>{localErr}</p>}
        </div>
    );
}

// `Receipt` ve `Banknote` import'ları referans için tutuluyor (ileride Receipt80mm / BanknoteActions entegrasyonu)
export const __prePaymentPanelIcons = { Receipt, Banknote };
