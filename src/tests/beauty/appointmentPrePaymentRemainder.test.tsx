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

/**
 * POSPaymentModal — "Kalanı cariye yaz" tek buton regresyonu.
 *
 * Kullanıcı isteği (Parça 4): ekran görüntüsünde iki buton görünüyordu
 * (Ödeme Özeti altı + Tam Tutar satırı altı). Düzeltme sonrası DOM'da
 * yalnızca TEK `data-testid="pos-write-remaining-to-cari"` butonu olmalı.
 *
 * Kıdemli muhasebeci notu:
 *  • Buton yalnızca `selectedCustomer && remaining > eşik` koşulunda render edilir.
 *  • Tıklayınca `veresiye` provider ile yeni bir payment satırı eklenir →
 *    POSPaymentModal.handleConfirmPayment içinde `payments` listesine yazılır.
 *  • Randevu POS bağlamında: handlePayComplete bu veresiye satırını da
 *    POSPaymentModalDraftContext'e yansıtır → appointmentPaymentService
 *    üzerinden cash_lines CH_TAHSILAT + account_movements debit yazılır.
 *  • Aynı işlem iki kez yapılamaz: buton yalnızca `remaining > 0` iken render
 *    edilir; veresiye satırı eklendiğinde remaining = 0 olur → buton kaybolur.
 */
import { POSPaymentModal } from '../../components/pos/POSPaymentModal';

vi.mock('../../contexts/LanguageContext', () => ({
    useLanguage: () => ({
        t: {
            writeRemainingToCari: 'Kalanı cariye yaz',
            selectCustomerForCari: 'Kalanı cariye yazmak için müşteri seçin.',
        },
        tm: (k: string) =>
            k === 'posWriteRemainingToCari'
                ? 'Kalanı cariye yaz'
                : k === 'posSelectCustomerForCari'
                    ? 'Kalanı cariye yazmak için müşteri seçin.'
                    : '',
        language: 'tr',
    }),
}));

vi.mock('../../contexts/FirmaDonemContext', () => ({
    useFirmaDonem: () => ({
        selectedFirm: { firm_nr: '001', ana_para_birimi: 'IQD' },
        firms: [],
    }),
}));

vi.mock('../../contexts/ThemeContext', () => ({
    useTheme: () => ({ darkMode: false }),
}));

vi.mock('../../services/receiptSettingsService', () => ({
    getReceiptSettings: vi.fn().mockResolvedValue({}),
    resolveDefaultPosReceiptPrintFormat: () => '80mm',
    resolveDefaultReceiptLang: () => 'tr',
    saveReceiptSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/paymentGateway', () => ({
    paymentGateway: {
        getActiveProviders: () => [],
    },
}));

vi.mock('../../services/api/kasa', () => ({
    fetchKasalar: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/reportMenuParamsService', () => ({
    loadReportMenuParams: vi.fn().mockResolvedValue({}),
    subscribeReportMenuParams: () => () => {},
}));

vi.mock('../../utils/posPaymentBackGuard', () => ({
    isPosPaymentBackToSaleAllowed: () => true,
}));

vi.mock('../../services/unifiedPrintQueueService', () => ({
    isWindowsPrinterServiceEnabled: () => Promise.resolve(false),
}));

describe('POSPaymentModal — Kalanı cariye yaz tek buton (regresyon: çift buton kaldırıldı)', () => {
    afterEach(() => cleanup());

    const baseCustomer = {
        id: 'cust-1',
        name: 'Ahmet Yılmaz',
        code: 'C001',
    };

    it('remaining > 0 + müşteri seçili → DOM\'da TEK "Kalanı cariye yaz" butonu var', () => {
        // Kullanıcı 20.000 ödedi, kalan 9.000 → buton görünür.
        render(
            <POSPaymentModal
                total={29000}
                subtotal={29000}
                itemDiscount={0}
                campaignDiscount={0}
                selectedCustomer={baseCustomer as any}
                showAutoPrintOption={false}
                defaultShowReceiptPreview={false}
                onClose={() => {}}
                onComplete={vi.fn()}
            />,
        );

        // Önce bir ödeme ekleyelim (FIB / Merkez Kasa — 20.000)
        const amountInput = screen.getByPlaceholderText('0') as HTMLInputElement;
        fireEvent.change(amountInput, { target: { value: '20000' } });
        const addBtn = screen.getByRole('button', { name: /Ödeme Ekle/i });
        fireEvent.click(addBtn);

        // Şimdi "Kalanı cariye yaz" butonu (tutar bilgili versiyon) görünmeli.
        const writeButtons = screen.queryAllByTestId('pos-write-remaining-to-cari');
        expect(writeButtons.length).toBe(1);
        expect(writeButtons[0]).toHaveTextContent(/Kalanı cariye yaz/i);
        // Tutar bilgisi (9000) buton metninde görünmeli (tek buton Seçenek A).
        expect(writeButtons[0]).toHaveTextContent(/9\.000|9000/);
    });

    it('müşteri seçili değil → "Kalanı cariye yaz" butonu YOK (engellenmiş durum)', () => {
        render(
            <POSPaymentModal
                total={29000}
                subtotal={29000}
                itemDiscount={0}
                campaignDiscount={0}
                selectedCustomer={null}
                showAutoPrintOption={false}
                defaultShowReceiptPreview={false}
                onClose={() => {}}
                onComplete={vi.fn()}
            />,
        );

        // 9.000 ödeme ekle (kalan 20.000)
        const amountInput = screen.getByPlaceholderText('0') as HTMLInputElement;
        fireEvent.change(amountInput, { target: { value: '9000' } });
        const addBtn = screen.getByRole('button', { name: /Ödeme Ekle/i });
        fireEvent.click(addBtn);

        const writeButtons = screen.queryAllByTestId('pos-write-remaining-to-cari');
        expect(writeButtons.length).toBe(0);
    });

    it('tek butona tıklayınca payments\'a veresiye satırı eklenir (ön ödeme mantığı)', () => {
        render(
            <POSPaymentModal
                total={29000}
                subtotal={29000}
                itemDiscount={0}
                campaignDiscount={0}
                selectedCustomer={baseCustomer as any}
                showAutoPrintOption={false}
                defaultShowReceiptPreview={false}
                onClose={() => {}}
                onComplete={vi.fn()}
            />,
        );

        // 20.000 cash ödeme ekle
        const amountInput = screen.getByPlaceholderText('0') as HTMLInputElement;
        fireEvent.change(amountInput, { target: { value: '20000' } });
        fireEvent.click(screen.getByRole('button', { name: /Ödeme Ekle/i }));

        // "Kalanı cariye yaz" butonuna tıkla → veresiye satırı eklenir
        const writeBtn = screen.getByTestId('pos-write-remaining-to-cari');
        fireEvent.click(writeBtn);

        // Eklenen ödemeler listesinde 2 satır görünmeli (cash 20.000 + veresiye 9.000)
        const veresiyeBadges = screen.getAllByText(/Veresiye \(Cari\)/);
        expect(veresiyeBadges.length).toBeGreaterThanOrEqual(1);
    });

    it('outstanding = 0 → "Kalanı cariye yaz" butonu YOK (idempotent: tekrar tetiklenemez)', () => {
        render(
            <POSPaymentModal
                total={10000}
                subtotal={10000}
                itemDiscount={0}
                campaignDiscount={0}
                selectedCustomer={baseCustomer as any}
                showAutoPrintOption={false}
                defaultShowReceiptPreview={false}
                onClose={() => {}}
                onComplete={vi.fn()}
            />,
        );

        // Tam 10.000 öde → remaining = 0
        const amountInput = screen.getByPlaceholderText('0') as HTMLInputElement;
        fireEvent.change(amountInput, { target: { value: '10000' } });
        fireEvent.click(screen.getByRole('button', { name: /Ödeme Ekle/i }));

        // remaining = 0 → buton render edilmemeli
        const writeButtons = screen.queryAllByTestId('pos-write-remaining-to-cari');
        expect(writeButtons.length).toBe(0);
    });

    it('iki buton DOM\'da YOK (regresyon: duplicate engellenmiş)', () => {
        // Bu test eskiden başarısız olurdu: hem Ödeme Özeti altında, hem
        // Tam Tutar satırı altında iki buton vardı. Düzeltme sonrası yalnızca
        // sağdaki (tutar bilgili) buton kaldı.
        render(
            <POSPaymentModal
                total={29000}
                subtotal={29000}
                itemDiscount={0}
                campaignDiscount={0}
                selectedCustomer={baseCustomer as any}
                showAutoPrintOption={false}
                defaultShowReceiptPreview={false}
                onClose={() => {}}
                onComplete={vi.fn()}
            />,
        );

        const amountInput = screen.getByPlaceholderText('0') as HTMLInputElement;
        fireEvent.change(amountInput, { target: { value: '20000' } });
        fireEvent.click(screen.getByRole('button', { name: /Ödeme Ekle/i }));

        // Tüm "Kalanı cariye yaz" yazılı butonları say (test-id olsun olmasın).
        const allWriteBtns = screen.getAllByRole('button').filter((b) =>
            /Kalanı cariye yaz/.test(b.textContent || ''),
        );
        expect(allWriteBtns.length).toBe(1);
    });
});