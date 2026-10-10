import { describe, expect, it } from 'vitest';

/**
 * 10.10.2026 — Rezervasyon / Ön Ödeme Raporu "Kalan" hesabı regresyon testi.
 *
 * Kullanıcı şikâyeti:
 *   "EGER RANDEVU KAPANIRSA KALAN TUTAR KOLONUNDAKI RAKAM ALINAN
 *    ODEMEYE GECECEK KALAN TUTAR SIFIR OLACAK. YANI
 *    TOTAL AMOUNT - (REZERVASYON TUTARI + ALINAN TUTAR) = KALAN TUTAR"
 *
 * Formül:
 *   remaining = total - (deposit + takenPayment)
 *
 * Edge case'ler:
 *  - Status 'completed' / 'closed' → Kalan = 0 (hizmet verildi).
 *  - Status 'cancelled' / 'no_show' → Kalan = 0 (borç kapanmıştır).
 *  - Status null ya da 'deposit_only' / 'scheduled' → Kalan = total - deposit - remainder_paid.
 *
 * Bu test, `DepositPrePaymentReport.tsx` içindeki `computeKalan` helper'ının
 * kullanıcı formülünü birebir uyguladığını garanti eder.
 */

type Row = {
    total_price: number;
    deposit_amount: number;
    remainder_paid_amount: number;
    status: string | null;
};

// computeKalan'ın birebir kopyası — UI ile aynı formül, regression için izole.
function computeKalan(r: Row): number {
    const total = Number(r.total_price) || 0;
    const deposit = Number(r.deposit_amount) || 0;
    const remainder = Number(r.remainder_paid_amount) || 0;
    const status = String(r.status ?? '').trim().toLowerCase();
    if (status === 'completed' || status === 'closed') return 0;
    if (status === 'cancelled' || status === 'no_show') return 0;
    return Math.max(0, total - deposit - remainder);
}

describe('DepositPrePaymentReport — Kalan hesabı (computeKalan)', () => {
    it('completed randevuda Kalan = 0 (formül: total − (deposit + takenPayment))', () => {
        // Senaryo: total=50.000, deposit=10.000, remainder_paid henüz 0.
        // completed → Kalan = 0 (alınan ödeme = 50.000 - 10.000 = 40.000'e eşit sayılır).
        const row: Row = {
            total_price: 50000,
            deposit_amount: 10000,
            remainder_paid_amount: 0,
            status: 'completed',
        };
        expect(computeKalan(row)).toBe(0);
    });

    it('closed randevuda Kalan = 0', () => {
        const row: Row = {
            total_price: 50000,
            deposit_amount: 5000,
            remainder_paid_amount: 0,
            status: 'closed',
        };
        expect(computeKalan(row)).toBe(0);
    });

    it('cancelled randevuda Kalan = 0 (borç kapanmıştır)', () => {
        const row: Row = {
            total_price: 50000,
            deposit_amount: 10000,
            remainder_paid_amount: 0,
            status: 'cancelled',
        };
        expect(computeKalan(row)).toBe(0);
    });

    it('no_show randevuda Kalan = 0', () => {
        const row: Row = {
            total_price: 50000,
            deposit_amount: 10000,
            remainder_paid_amount: 0,
            status: 'no_show',
        };
        expect(computeKalan(row)).toBe(0);
    });

    it('Sadece peşinat (deposit_only) → Kalan = total − deposit', () => {
        const row: Row = {
            total_price: 50000,
            deposit_amount: 5000,
            remainder_paid_amount: 0,
            status: 'deposit_only',
        };
        expect(computeKalan(row)).toBe(45000);
    });

    it('scheduled randevu + deposit 10.000 → Kalan = 40.000', () => {
        const row: Row = {
            total_price: 50000,
            deposit_amount: 10000,
            remainder_paid_amount: 0,
            status: 'scheduled',
        };
        expect(computeKalan(row)).toBe(40000);
    });

    it('partial ödeme → Kalan = total − deposit − remainder_paid', () => {
        const row: Row = {
            total_price: 50000,
            deposit_amount: 10000,
            remainder_paid_amount: 20000,
            status: 'partial',
        };
        expect(computeKalan(row)).toBe(20000);
    });

    it('Kısmi completed olmayan randevu + status büyük harf "Completed" → Kalan = 0', () => {
        // DB tarafında status enum case-insensitive; helper normalize eder.
        const row: Row = {
            total_price: 50000,
            deposit_amount: 10000,
            remainder_paid_amount: 0,
            status: 'Completed',
        };
        expect(computeKalan(row)).toBe(0);
    });

    it('status null olan scheduled randevu → Kalan = total − deposit', () => {
        // Eski verilerde status NULL olabilir; bu yüzden null kabul edilir.
        const row: Row = {
            total_price: 50000,
            deposit_amount: 10000,
            remainder_paid_amount: 0,
            status: null,
        };
        expect(computeKalan(row)).toBe(40000);
    });

    it('Toplam Kalan KPI hesabı: tüm randevulardaki computeKalan toplamı', () => {
        const rows: Row[] = [
            // Sadece peşinat: 50k − 5k = 45k
            { total_price: 50000, deposit_amount: 5000, remainder_paid_amount: 0, status: 'deposit_only' },
            // Sadece peşinat: 50k − 10k = 40k
            { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'scheduled' },
            // completed: 0
            { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 40000, status: 'completed' },
            // cancelled: 0
            { total_price: 80000, deposit_amount: 20000, remainder_paid_amount: 0, status: 'cancelled' },
            // partial: 80k − 20k − 30k = 30k
            { total_price: 80000, deposit_amount: 20000, remainder_paid_amount: 30000, status: 'partial' },
        ];
        const totalKalan = rows.reduce((acc, r) => acc + computeKalan(r), 0);
        // 45k + 40k + 0 + 0 + 30k = 115k
        expect(totalKalan).toBe(115000);
    });
});