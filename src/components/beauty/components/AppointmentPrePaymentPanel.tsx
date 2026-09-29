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
}

export function AppointmentPrePaymentPanel(props: AppointmentPrePaymentPanelProps) {
    const {
        mode, paymentSummary, labels,
        depositAmount, depositProvider,
        onDepositAmountChange, onDepositProviderChange,
        onTakeDeposit, onCollectRemainder, onComplete,
        depositSubmitting,
        outstandingAmount,
    } = props;
    const [localErr] = useState<string | null>(null);

    if (mode === 'booking') {
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
                <Label>{labels.prePaymentAmount}</Label>
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
            </div>
        );
    }

    // existing mode
    if (!paymentSummary) return null;
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
                style={{
                    height: 32,
                    borderRadius: 6,
                    border: 'none',
                    background: '#059669',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
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
