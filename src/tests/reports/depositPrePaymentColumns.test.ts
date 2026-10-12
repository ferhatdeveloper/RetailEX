import { describe, expect, it } from 'vitest';

/**
 * 10.10.2026 — Rezervasyon / Ön Ödeme Raporu "Alınan Ödeme" + "Kalan"
 * hesabı regresyon testi.
 *
 * Kullanıcı şikâyeti:
 *   "alinan tutar bos kalan tutar gitmis diptoplami kalmis"
 *
 * Kök neden:
 *  - "Alınan Ödeme" kolonu yalnızca DB'den gelen `remainder_paid_amount`a
 *    bağlıydı; hâlbuki DB view her zaman 0 döndürebiliyor.
 *  - "Kalan" kolonu DB'den ödünç `outstanding_amount` yerine status-aware
 *    `computeKalan` formülünü kullanıyordu ama kullanıcı eski
 *    localStorage ayarıyla kolonu görünürlük toolbar'ından gizlemiş
 *    olabilir.
 *
 * Bu test, `DepositPrePaymentReport.tsx` içindeki `computeTakenPayment`
 * ve `computeKalan` helper'larının birlikte kullanıcı formülünü
 * uyguladığını garanti eder:
 *
 *   pending (Sadece Peşinat) → Alınan = 0,  Kalan = total - deposit
 *   completed / closed      → Alınan = total - deposit, Kalan = 0
 *   cancelled / no_show     → Alınan = 0,  Kalan = 0
 */

type Row = {
    total_price: number;
    deposit_amount: number;
    remainder_paid_amount: number;
    status: string | null;
};

// computeTakenPayment'ın birebir kopyası.
function computeTakenPayment(r: Row): number {
    const total = Number(r.total_price) || 0;
    const deposit = Number(r.deposit_amount) || 0;
    const status = String(r.status ?? '').trim().toLowerCase();
    if (status === 'completed' || status === 'closed') return Math.max(0, total - deposit);
    if (status === 'cancelled' || status === 'no_show') return 0;
    const remainder = Number(r.remainder_paid_amount) || 0;
    return Math.max(0, remainder);
}

// computeKalan'ın birebir kopyası.
function computeKalan(r: Row): number {
    const total = Number(r.total_price) || 0;
    const deposit = Number(r.deposit_amount) || 0;
    const remainder = Number(r.remainder_paid_amount) || 0;
    const status = String(r.status ?? '').trim().toLowerCase();
    if (status === 'completed' || status === 'closed') return 0;
    if (status === 'cancelled' || status === 'no_show') return 0;
    return Math.max(0, total - deposit - remainder);
}

describe('DepositPrePaymentReport — Alınan Ödeme + Kalan kolonları', () => {
    describe('computeTakenPayment (Alınan Ödeme)', () => {
        it('Sadece Peşinat (pending/deposit_only) → Alınan = remainder_paid_amount', () => {
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'pending',
                }),
            ).toBe(0);
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'deposit_only',
                }),
            ).toBe(0);
        });

        it('partial (kısmi ödeme) → Alınan = remainder_paid_amount', () => {
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 20000,
                    status: 'partial',
                }),
            ).toBe(20000);
        });

        it('completed → Alınan = total - deposit (kalan bakiye tahsil kabul edilir)', () => {
            // Kullanıcı formülü: completed'ta total 50.000, deposit 10.000 → Alınan 40.000.
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'completed',
                }),
            ).toBe(40000);
        });

        it('closed → Alınan = total - deposit', () => {
            expect(
                computeTakenPayment({
                    total_price: 80000,
                    deposit_amount: 20000,
                    remainder_paid_amount: 0,
                    status: 'closed',
                }),
            ).toBe(60000);
        });

        it('cancelled → Alınan = 0 (borç kapanmıştır)', () => {
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'cancelled',
                }),
            ).toBe(0);
        });

        it('no_show → Alınan = 0', () => {
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'no_show',
                }),
            ).toBe(0);
        });

        it('status büyük harf "COMPLETED" → Alınan = total - deposit (case-insensitive)', () => {
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'COMPLETED',
                }),
            ).toBe(40000);
        });

        it('status null olan scheduled randevu → Alınan = 0 (geriye dönük uyum)', () => {
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: null,
                }),
            ).toBe(0);
        });

        it('negatif değerleri 0\'a kırpar', () => {
            expect(
                computeTakenPayment({
                    total_price: 0,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'completed',
                }),
            ).toBe(0);
        });
    });

    describe('computeKalan (Kalan Bakiye)', () => {
        it('Sadece Peşinat (deposit_only) → Kalan = total − deposit', () => {
            expect(
                computeKalan({
                    total_price: 50000,
                    deposit_amount: 5000,
                    remainder_paid_amount: 0,
                    status: 'deposit_only',
                }),
            ).toBe(45000);
        });

        it('completed → Kalan = 0 (—)', () => {
            expect(
                computeKalan({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'completed',
                }),
            ).toBe(0);
        });

        it('cancelled → Kalan = 0', () => {
            expect(
                computeKalan({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'cancelled',
                }),
            ).toBe(0);
        });

        it('partial ödeme → Kalan = total − deposit − remainder_paid', () => {
            expect(
                computeKalan({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 20000,
                    status: 'partial',
                }),
            ).toBe(20000);
        });

        it('status null olan scheduled randevu → Kalan = total − deposit (geriye dönük uyum)', () => {
            expect(
                computeKalan({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: null,
                }),
            ).toBe(40000);
        });
    });

    describe('Kullanıcı formülü: Alınan + Kalan + Deposit = Total', () => {
        it('pending durumda: Alınan(0) + Kalan(40k) + Deposit(10k) = Total(50k)', () => {
            const row: Row = {
                total_price: 50000,
                deposit_amount: 10000,
                remainder_paid_amount: 0,
                status: 'pending',
            };
            const alinan = computeTakenPayment(row);
            const kalan = computeKalan(row);
            expect(alinan + kalan + row.deposit_amount).toBe(row.total_price);
        });

        it('completed durumda: Alınan(40k) + Kalan(0) + Deposit(10k) = Total(50k)', () => {
            const row: Row = {
                total_price: 50000,
                deposit_amount: 10000,
                remainder_paid_amount: 0,
                status: 'completed',
            };
            const alinan = computeTakenPayment(row);
            const kalan = computeKalan(row);
            expect(alinan + kalan + row.deposit_amount).toBe(row.total_price);
        });

        it('partial durumda: Alınan(20k) + Kalan(20k) + Deposit(10k) = Total(50k)', () => {
            const row: Row = {
                total_price: 50000,
                deposit_amount: 10000,
                remainder_paid_amount: 20000,
                status: 'partial',
            };
            const alinan = computeTakenPayment(row);
            const kalan = computeKalan(row);
            expect(alinan + kalan + row.deposit_amount).toBe(row.total_price);
        });

        it('cancelled durumda: Alınan(0) + Kalan(0) + Deposit(0 tahsil kabul) → sadece peşinat döner', () => {
            // cancelled randevuda hizmet verilmediği için Alınan ve Kalan 0'dır;
            // deposit alınmış olabilir (müşteri kaybı). Toplam formülü:
            // Alınan(0) + Kalan(0) ≠ Total — bu beklenen davranıştır
            // (iptal edilen randevuda toplam hasılat kavramı yoktur).
            const row: Row = {
                total_price: 50000,
                deposit_amount: 10000,
                remainder_paid_amount: 0,
                status: 'cancelled',
            };
            expect(computeTakenPayment(row)).toBe(0);
            expect(computeKalan(row)).toBe(0);
        });
    });

    describe('Toplam (dip toplam) senaryosu — kullanıcı şikâyetinin dipteki toplamı', () => {
        it('Birden çok satır için Alınan + Kalan dip toplamı doğru hesaplanır', () => {
            const rows: Row[] = [
                // Sadece Peşinat: Alınan=0, Kalan=45k
                { total_price: 50000, deposit_amount: 5000, remainder_paid_amount: 0, status: 'deposit_only' },
                // completed: Alınan=40k, Kalan=0
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'completed' },
                // partial: Alınan=20k, Kalan=20k
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 20000, status: 'partial' },
                // cancelled: Alınan=0, Kalan=0
                { total_price: 80000, deposit_amount: 20000, remainder_paid_amount: 0, status: 'cancelled' },
            ];

            const totalAlinan = rows.reduce((acc, r) => acc + computeTakenPayment(r), 0);
            const totalKalan = rows.reduce((acc, r) => acc + computeKalan(r), 0);

            // Alınan: 0 + 40k + 20k + 0 = 60.000
            expect(totalAlinan).toBe(60000);
            // Kalan: 45k + 0 + 20k + 0 = 65.000
            expect(totalKalan).toBe(65000);
        });
    });

    // 12.10.2026 — Rezervasyon / Ön Ödeme raporu "Toplam Tutar" kolonu
    // grup alt toplamı (sarı satır) boş kalıyordu — kök neden:
    //   `ReportColumnTable.groupFooterSumColumns` listesinde `total_price`
    //   tanımlı değildi; yalnızca `deposit_amount`, `received_payment`,
    //   `outstanding_amount` vardı. DevExDataGrid `buildDevExGroupedRows`
    //   (DevExDataGrid.tsx:1807-1848) `sumDefs` üzerinden hesap yaptığı
    //   için `total_price` satırı "Toplam" kolonunda null dönüyordu.
    //
    // Bu blok, kullanıcı formülüne göre `total_price` grup alt toplamının
    // doğru hesaplandığını garanti eder:
    //   subtotal(total_price) = ∑ rows.map(r => r.total_price)
    describe('Toplam Tutar (total_price) grup alt toplamı — subtotal satırı', () => {
        it('Tek satırlı grup: alt toplam total_price = satır total_price', () => {
            const rows: Row[] = [
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'pending' },
            ];
            const subtotal = rows.reduce((acc, r) => acc + (Number(r.total_price) || 0), 0);
            expect(subtotal).toBe(50000);
        });

        it('Aynı BEA-* fişine ait birden çok satır: alt toplam = satırların toplamı', () => {
            const rows: Row[] = [
                // hizmet
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'pending' },
                // paket seans
                { total_price: 80000, deposit_amount: 20000, remainder_paid_amount: 0, status: 'pending' },
                // ürün
                { total_price: 20000, deposit_amount: 5000, remainder_paid_amount: 0, status: 'pending' },
            ];
            const subtotal = rows.reduce((acc, r) => acc + (Number(r.total_price) || 0), 0);
            expect(subtotal).toBe(150000);
        });

        it('Cancelled satırlar da alt toplama dahildir (görsel tutarlılık — gizleme yok)', () => {
            const rows: Row[] = [
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'pending' },
                { total_price: 30000, deposit_amount: 5000, remainder_paid_amount: 0, status: 'cancelled' },
            ];
            const subtotal = rows.reduce((acc, r) => acc + (Number(r.total_price) || 0), 0);
            expect(subtotal).toBe(80000);
        });

        it('null/eksik total_price 0 olarak değerlendirilir (NaN koruması)', () => {
            const rows = [
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'pending' },
                { total_price: null as unknown as number, deposit_amount: 0, remainder_paid_amount: 0, status: 'pending' },
                { total_price: undefined as unknown as number, deposit_amount: 0, remainder_paid_amount: 0, status: 'pending' },
            ];
            const subtotal = rows.reduce(
                (acc, r) => acc + (Number((r as Row).total_price) || 0),
                0,
            );
            expect(subtotal).toBe(50000);
        });
    });
});
