/**
 * AppointmentPrePaymentPanel — Kalan ödeme (remainder) + "Randevuyu Tamamla"
 * disable davranışı testleri.
 *
 * Kullanıcı isteği (Parça 4):
 *  • Ön ödeme alındı + remainder > 0 → "Randevuyu Tamamla" disable olmalı.
 *  • Ön ödeme alındı + remainder = 0  → "Randevuyu Tamamla" enable olmalı.
 *  • Kalan ödeme bekleniyor mesajı görünmeli.
 *  • Booking modunda kullanıcı "şimdi ödeme almayacağım" toggle'ını kapattıysa
 *    Ön Ödeme input/select gizlenmeli, yalnızca toggle + bilgilendirme görünmeli.
 *  • Toggle açıksa input/select + hint görünmeli.
 *
 * Kıdemli muhasebeci notu:
 *  • Deposit → cari avans ekstresi (−), kasa/banka (+).
 *  • Remainder → cari (−, hizmet borcuna), kasa/banka (+).
 *  • Complete → stok düşer; ama kalan ödeme alınmadan tamamlanırsa cari alacak
 *    bakiyesi kalır (simetri bozulur). Bu yüzden disable şart.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AppointmentPrePaymentPanel } from '../../components/beauty/components/AppointmentPrePaymentPanel';
import type { AppointmentPaymentSummary } from '../../services/appointmentPaymentService';

const baseLabels = {
    prePaymentAmount: 'Ön Ödeme Tutarı',
    prePaymentProvider: 'Ön Ödeme Yöntemi',
    cashLabel: 'Nakit',
    cardLabel: 'Kart',
    gatewayLabel: 'Ön Ödeme',
    bankTransferLabel: 'Banka Havalesi',
    prePaymentHint: 'İleri tarihli randevu için şimdi kısmi ödeme alabilirsiniz.',
    noPaymentAtBookingHint: 'Şimdi ödeme alınmayacak — yalnızca randevu kaydı oluşturulacak.',
    remainderPendingHint: 'Kalan ödeme bekleniyor — hizmet verildiğinde tahsil edilir ve randevu o zaman tamamlanabilir.',
    appointmentDeposit: 'Ön Ödeme (Avans)',
    appointmentRemainder: 'Kalan Ödeme',
    total: 'Toplam',
    remainderAmount: 'Kalan Tutar',
    appointmentTakeDeposit: 'Ön Ödeme Al',
    appointmentCollectRemainder: 'Kalan Ödeme Al',
    appointmentComplete: 'Randevuyu Tamamla',
    paidPanelTitle: 'Ödeme alındı',
    depositOnlyHint: 'Ön ödeme alındı; kalan bekleniyor.',
    partialHint: 'Kısmi ödeme alındı.',
    unpaidHint: 'Henüz ödeme alınmadı.',
    noAmountHint: 'Tutar tanımsız.',
};

const baseSummary = (over: Partial<AppointmentPaymentSummary> = {}): AppointmentPaymentSummary => ({
    appointmentId: 'apt-1',
    totalPrice: 100,
    depositAmount: 30,
    remainderPaidAmount: 0,
    outstandingAmount: 70,
    paymentState: 'deposit_only',
    payments: [],
    ...over,
});

describe('AppointmentPrePaymentPanel — Randevuyu Tamamla disable (kalan ödeme)', () => {
    beforeEach(() => {
        // jsdom ortamında RTL otomatik mount ediyor; her testte temizleyelim.
    });
    afterEach(() => {
        cleanup();
    });

    it('existing modda kalan tutar > 0 → Randevuyu Tamamla disable + kalan bekleniyor mesajı görünür', () => {
        const summary = baseSummary({ outstandingAmount: 70, paymentState: 'deposit_only' });
        render(
            <AppointmentPrePaymentPanel
                mode="existing"
                paymentSummary={summary}
                labels={baseLabels}
                depositAmount=""
                depositProvider="cash"
                onDepositAmountChange={() => {}}
                onDepositProviderChange={() => {}}
                onTakeDeposit={() => {}}
                onCollectRemainder={() => {}}
                onComplete={() => {}}
                depositSubmitting={false}
                outstandingAmount={summary.outstandingAmount}
            />,
        );

        const completeBtn = screen.getByRole('button', { name: /Randevuyu Tamamla/ });
        expect(completeBtn).toBeDisabled();
        expect(completeBtn.getAttribute('title')).toMatch(/Kalan ödeme bekleniyor/i);

        // Kalan ödeme bekleniyor mesajı görünür (role=status)
        expect(screen.getByRole('status')).toHaveTextContent(/Kalan ödeme bekleniyor/i);
    });

    it('existing modda kalan tutar = 0 → Randevuyu Tamamla enable', () => {
        const summary = baseSummary({ outstandingAmount: 0, paymentState: 'paid' });
        render(
            <AppointmentPrePaymentPanel
                mode="existing"
                paymentSummary={summary}
                labels={baseLabels}
                depositAmount=""
                depositProvider="cash"
                onDepositAmountChange={() => {}}
                onDepositProviderChange={() => {}}
                onTakeDeposit={() => {}}
                onCollectRemainder={() => {}}
                onComplete={() => {}}
                depositSubmitting={false}
                outstandingAmount={0}
            />,
        );

        const completeBtn = screen.getByRole('button', { name: /Randevuyu Tamamla/ });
        expect(completeBtn).not.toBeDisabled();
        expect(screen.queryByRole('status')).toBeNull();
    });

    it('existing modda hiç ödeme alınmamış → Tamamla disable + Kalan Ödeme Al butonu görünür', () => {
        const summary = baseSummary({
            depositAmount: 0,
            remainderPaidAmount: 0,
            outstandingAmount: 100,
            paymentState: 'unpaid',
        });
        render(
            <AppointmentPrePaymentPanel
                mode="existing"
                paymentSummary={summary}
                labels={baseLabels}
                depositAmount=""
                depositProvider="cash"
                onDepositAmountChange={() => {}}
                onDepositProviderChange={() => {}}
                onTakeDeposit={() => {}}
                onCollectRemainder={() => {}}
                onComplete={() => {}}
                depositSubmitting={false}
                outstandingAmount={100}
            />,
        );

        expect(screen.getByRole('button', { name: /Randevuyu Tamamla/ })).toBeDisabled();
        // deposit > 0 olmadığı için Ön Ödeme Al butonu da görünür.
        expect(screen.getByRole('button', { name: /Ön Ödeme Al/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Kalan Ödeme Al/ })).toBeInTheDocument();
    });
});

describe('AppointmentPrePaymentPanel — Booking modu ödeme toggle', () => {
    afterEach(() => cleanup());

    it('takeDepositAtBooking=false → Ön Ödeme input/select gizli, yalnız toggle + bilgi görünür', () => {
        render(
            <AppointmentPrePaymentPanel
                mode="booking"
                takeDepositAtBooking={false}
                onToggleTakeDepositAtBooking={() => {}}
                labels={baseLabels}
                depositAmount=""
                depositProvider="cash"
                onDepositAmountChange={() => {}}
                onDepositProviderChange={() => {}}
                onTakeDeposit={() => {}}
                onCollectRemainder={() => {}}
                onComplete={() => {}}
                depositSubmitting={false}
                outstandingAmount={0}
            />,
        );

        // 0 sayısal input görünmemeli (placeholder="0" olan Ön Ödeme inputu).
        expect(screen.queryByPlaceholderText('0')).toBeNull();
        // Provider select görünmemeli (value=cash default olsa da, ekranda option listesi yok).
        expect(screen.queryByRole('combobox')).toBeNull();
        // Bilgilendirme metni görünür.
        expect(screen.getByText(/Şimdi ödeme alınmayacak/i)).toBeInTheDocument();
        // Label olarak prePaymentAmount görünür (toggle metni).
        expect(screen.getByText('Ön Ödeme Tutarı')).toBeInTheDocument();
    });

    it('takeDepositAtBooking=true → Ön Ödeme input + provider + hint görünür', () => {
        render(
            <AppointmentPrePaymentPanel
                mode="booking"
                takeDepositAtBooking
                onToggleTakeDepositAtBooking={() => {}}
                labels={baseLabels}
                depositAmount="30"
                depositProvider="cash"
                onDepositAmountChange={() => {}}
                onDepositProviderChange={() => {}}
                onTakeDeposit={() => {}}
                onCollectRemainder={() => {}}
                onComplete={() => {}}
                depositSubmitting={false}
                outstandingAmount={0}
            />,
        );

        expect(screen.getByPlaceholderText('0')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeInTheDocument();
        // prePaymentHint görünür.
        expect(screen.getByText(/İleri tarihli randevu/)).toBeInTheDocument();
    });

    it('toggle checkbox işaretlenince onToggleTakeDepositAtBooking çağrılır', () => {
        const onToggle = vi.fn();
        render(
            <AppointmentPrePaymentPanel
                mode="booking"
                takeDepositAtBooking={false}
                onToggleTakeDepositAtBooking={onToggle}
                labels={baseLabels}
                depositAmount=""
                depositProvider="cash"
                onDepositAmountChange={() => {}}
                onDepositProviderChange={() => {}}
                onTakeDeposit={() => {}}
                onCollectRemainder={() => {}}
                onComplete={() => {}}
                depositSubmitting={false}
                outstandingAmount={0}
            />,
        );

        const checkbox = screen.getByRole('checkbox');
        fireEvent.click(checkbox);
        expect(onToggle).toHaveBeenCalledWith(true);
    });
});

describe('AppointmentPrePaymentPanel — Muhasebe simetrisi (kıdemli muhasebeci)', () => {
    afterEach(() => cleanup());

    it('deposit + remainder + outstanding simetri (tipik akış)', () => {
        // Pure aritmetik: 100 TL hizmet, 30 deposit, 70 remainder → 0 outstanding.
        const summary = baseSummary({
            totalPrice: 100,
            depositAmount: 30,
            remainderPaidAmount: 70,
            outstandingAmount: 0,
            paymentState: 'paid',
        });

        // Cari hareketleri:
        //   - deposit: cari -30 (avans ekstresi)
        //   - hizmet verildi: cari +100 (borç)
        //   - remainder: cari -70 (kalan ödeme)
        // NET: 0
        const cariNet = -summary.depositAmount + summary.totalPrice - summary.remainderPaidAmount;
        expect(cariNet).toBe(0);
        // Kasa/Banka: 30 + 70 = 100
        expect(summary.depositAmount + summary.remainderPaidAmount).toBe(summary.totalPrice);
        // Outstanding sıfır → Tamamla enable olmalı.
        render(
            <AppointmentPrePaymentPanel
                mode="existing"
                paymentSummary={summary}
                labels={baseLabels}
                depositAmount=""
                depositProvider="cash"
                onDepositAmountChange={() => {}}
                onDepositProviderChange={() => {}}
                onTakeDeposit={() => {}}
                onCollectRemainder={() => {}}
                onComplete={() => {}}
                depositSubmitting={false}
                outstandingAmount={0}
            />,
        );
        expect(screen.getByRole('button', { name: /Randevuyu Tamamla/ })).not.toBeDisabled();
    });

    it('deposit_only (kalan > 0) → Tamamla disable — cari simetrisi korunur', () => {
        const summary = baseSummary({
            totalPrice: 100,
            depositAmount: 30,
            remainderPaidAmount: 0,
            outstandingAmount: 70,
            paymentState: 'deposit_only',
        });

        // Cari net: -30 (avans) + 100 (hizmet) - 0 = +70 (müşteri bize borçlu — kalan)
        const cariNet = -summary.depositAmount + summary.totalPrice - summary.remainderPaidAmount;
        expect(cariNet).toBe(70); // müşteri borçlu

        render(
            <AppointmentPrePaymentPanel
                mode="existing"
                paymentSummary={summary}
                labels={baseLabels}
                depositAmount=""
                depositProvider="cash"
                onDepositAmountChange={() => {}}
                onDepositProviderChange={() => {}}
                onTakeDeposit={() => {}}
                onCollectRemainder={() => {}}
                onComplete={() => {}}
                depositSubmitting={false}
                outstandingAmount={70}
            />,
        );
        // Kalan 70 → Tamamla disable (hizmet verilmeden önce borç bakiyesi kapatılmamalı).
        expect(screen.getByRole('button', { name: /Randevuyu Tamamla/ })).toBeDisabled();
    });
});