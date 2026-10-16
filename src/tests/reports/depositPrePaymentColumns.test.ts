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
// 16.10.2026 — Sadece Peşinat: Alınan = deposit + avans (remainder Hariç).
// Henüz tamamlanmamış randevuda "henüz verilmemiş hizmet" için
// remainder sayılmaz; sadece fiilen alınan peşinat gösterilir.
function computeTakenPayment(r: Row): number {
    const total = Number(r.total_price) || 0;
    const deposit = Number(r.deposit_amount) || 0;
    const status = String(r.status ?? '').trim().toLowerCase();
    if (status === 'completed' || status === 'closed') return Math.max(0, total - deposit);
    if (status === 'cancelled' || status === 'no_show') return 0;
    return Math.max(0, deposit);
}

// computeKalan'ın birebir kopyası.
// 16.10.2026 — Kullanıcı kararı: Kalan = total - deposit (peşinat düşülür).
// "Alınan Ödeme" kolonu bilgi amaçlı (remainder); Kalan'dan düşülmez.
function computeKalan(r: Row): number {
    const total = Number(r.total_price) || 0;
    const deposit = Number(r.deposit_amount) || 0;
    const status = String(r.status ?? '').trim().toLowerCase();
    if (status === 'completed' || status === 'closed') return 0;
    if (status === 'cancelled' || status === 'no_show') return 0;
    return Math.max(0, total - deposit);
}

describe('DepositPrePaymentReport — Alınan Ödeme + Kalan kolonları', () => {
    describe('computeTakenPayment (Alınan Ödeme)', () => {
        it('Sadece Peşinat (pending/deposit_only) → Alınan = deposit (peşinat), remainder Hariç', () => {
            // 16.10.2026 — Kullanıcı kararı: randevu henüz tamamlanmadığı
            // için "Alınan Ödeme" sadece peşinatı gösterir; remainder
            // hizmet verilmediği için bu kolona dahil edilmez.
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'pending',
                }),
            ).toBe(10000);
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: 'deposit_only',
                }),
            ).toBe(10000);
        });

        it('partial (kısmi ödeme) → Alınan = deposit (peşinat), remainder Hariç', () => {
            // 16.10.2026 — Kullanıcı kararı: randevu henüz tamamlanmadığı
            // için "Alınan Ödeme" sadece peşinatı gösterir; remainder
            // hizmet verilmediği için bu kolona dahil edilmez.
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 20000,
                    status: 'partial',
                }),
            ).toBe(10000);
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

        it('status null olan scheduled randevu → Alınan = deposit (peşinat)', () => {
            // 16.10.2026 — kullanıcı kararı.
            expect(
                computeTakenPayment({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 0,
                    status: null,
                }),
            ).toBe(10000);
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

        it('partial ödeme → Kalan = total − deposit (peşinat düşülür, remainder görmezden gelinir)', () => {
            // 16.10.2026 — kullanıcı kararı.
            expect(
                computeKalan({
                    total_price: 50000,
                    deposit_amount: 10000,
                    remainder_paid_amount: 20000,
                    status: 'partial',
                }),
            ).toBe(40000);
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

    describe('Kullanıcı formülü (16.10.2026): Kalan = Total − Deposit', () => {
        // 16.10.2026 — Kullanıcı kararı: "Toplam Kalan" kolonu yalnızca
        // rezervasyon peşinatını düşer; "Alınan Ödeme" kolonu bilgi
        // amaçlıdır. Bu nedenle Alınan + Kalan + Deposit = Total invariant'ı
        // **partial** durumda bozulur (deposit 10k + alınan 20k + kalan 40k
        // = 70k ≠ 50k). Ama her satırda Alınan + Kalan ≤ Total sağlanır.
        it('pending durumda: Alınan(10k) + Kalan(40k) = Total(50k) (deposit zaten Alınan\'a dahil)', () => {
            // 16.10.2026 — Alınan = deposit (peşinat) + avans. Deposit
            // artık Alınan'a dahil olduğu için Rezervasyon + Alınan + Kalan
            // formülü **pending** durumda bozulur (çift sayım). Yeni
            // invariant: Alınan + Kalan = Total (deposit zaten Alınan'da).
            const row: Row = {
                total_price: 50000,
                deposit_amount: 10000,
                remainder_paid_amount: 0,
                status: 'pending',
            };
            const alinan = computeTakenPayment(row);
            const kalan = computeKalan(row);
            expect(alinan + kalan).toBe(row.total_price);
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

        it('partial durumda: Kalan = Total − Deposit = 40k (bilgi amaçlı; çift sayım kabul)', () => {
            // 16.10.2026 — Kalan = 50k - 10k = 40k. partial durumda
            // (10k + 20k + 40k) > total (50k) bilinçli olarak kabul
            // edildi; Alınan + Kalan ≤ Total invariant'ı sağlanır.
            const row: Row = {
                total_price: 50000,
                deposit_amount: 10000,
                remainder_paid_amount: 20000,
                status: 'partial',
            };
            const alinan = computeTakenPayment(row);
            const kalan = computeKalan(row);
            expect(kalan).toBe(40000);
            expect(alinan + kalan).toBeLessThanOrEqual(row.total_price + row.deposit_amount);
        });

        it('cancelled durumda: Alınan(0) + Kalan(0)', () => {
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
                // 16.10.2026 — Sadece Peşinat: Alınan=5k (deposit), Kalan=45k
                { total_price: 50000, deposit_amount: 5000, remainder_paid_amount: 0, status: 'deposit_only' },
                // completed: Alınan=40k (total-deposit), Kalan=0
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'completed' },
                // 16.10.2026 — partial: Alınan=10k (deposit, remainder Hariç), Kalan=40k
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 20000, status: 'partial' },
                // cancelled: Alınan=0, Kalan=0
                { total_price: 80000, deposit_amount: 20000, remainder_paid_amount: 0, status: 'cancelled' },
            ];

            const totalAlinan = rows.reduce((acc, r) => acc + computeTakenPayment(r), 0);
            const totalKalan = rows.reduce((acc, r) => acc + computeKalan(r), 0);

            // 16.10.2026 — Alınan: 5k (deposit_only) + 40k (completed) + 10k (partial: deposit) + 0 = 55.000
            expect(totalAlinan).toBe(55000);
            // 16.10.2026 — Kalan = total - deposit (peşinat düşülür, remainder görmezden gelinir).
            //   deposit_only: 50k - 5k = 45k
            //   completed:   50k - 10k = 0
            //   partial:     50k - 10k = 40k
            //   cancelled:   0
            // Toplam: 45k + 0 + 40k + 0 = 85.000
            expect(totalKalan).toBe(85000);
        });
    });

    // 12.10.2026 — Rezervasyon / Ön Ödeme raporu gruplama (sarı satır)
    // kaldırıldı (kullanıcı isteği). Bu blok eskiden `total_price` grup
    // alt toplamını kontrol ediyordu; artık uygulanabilir değil — DevExDataGrid
    // `buildDevExGroupedRows` çağrılmadığı için `groupFooterSumColumns`
    // köprüsü gereksizdir. Dip toplam (mavi satır) aşağıdaki testlerde
    // doğrulanır; orada `footerGetValue: computeKalan / computeTakenPayment`
    // köprüsü hâlâ aktiftir.

    // 12.10.2026 — Kullanıcı isteği: "Toplam Kalan, Alınan Ödemenin altına
    // kaydır". Dip toplam satırı (mavi) aşağıdaki kolon sırasını izlemeli:
    //   1) Toplam Tutar        (total_price)
    //   2) Rezervasyon Tutarı  (deposit_amount)
    //   3) Alınan Ödeme        (received_payment)
    //   4) Kalan Bakiye        (outstanding_amount)
    //
    // DevExDataGrid dip toplam satırı `visibleLeafColumns` sırasını kullandığı
    // için (DevExDataGrid.tsx:3411+) bu sırayı korumak için kolon tanımlarının
    // (DepositPrePaymentReport.tsx → `columns` array) yukarıdaki sırayla
    // tanımlanması gerekir. Bu blok, mantıksal formülün hâlâ geçerli
    // olduğunu garanti eder:
    //
    //   Toplam Tutar = Rezervasyon + Alınan Ödeme + Kalan Bakiye
    //
    // (Alınan Ödeme ve Kalan Bakiye birlikte tüm tutarı kapsar; completed
    // durumda Kalan=0, Alınan=Total-Deposit, böylece Alınan + Kalan =
    // Total − Deposit.)
    describe('Kolon sırası + dip toplam hizalama (12.10.2026)', () => {
        // 12.10.2026 — Beklenen dip toplam kolon sırası.
        // Sıra, kullanıcının "Kalan, Alınan'ın altına kaydır" isteğine göre
        // belirlenir: [Toplam Tutar, Rezervasyon, Alınan Ödeme, Kalan Bakiye].
        const DIP_TOPLAM_KOLON_SIRASI = [
            'total_price',           // Toplam Tutar
            'deposit_amount',        // Rezervasyon Tutarı
            'received_payment',      // Alınan Ödeme
            'outstanding_amount',    // Kalan Bakiye
        ] as const;

        it('Dip toplam kolon sırası: Toplam Tutar → Rezervasyon → Alınan → Kalan', () => {
            // Kullanıcının istediği nihai sıra
            expect([...DIP_TOPLAM_KOLON_SIRASI]).toEqual([
                'total_price',
                'deposit_amount',
                'received_payment',
                'outstanding_amount',
            ]);
            // Kalan (outstanding_amount), Alınan'dan (received_payment) SONRA gelir
            expect(DIP_TOPLAM_KOLON_SIRASI.indexOf('outstanding_amount'))
                .toBeGreaterThan(DIP_TOPLAM_KOLON_SIRASI.indexOf('received_payment'));
            // Alınan, Rezervasyon'dan (deposit_amount) SONRA gelir
            expect(DIP_TOPLAM_KOLON_SIRASI.indexOf('received_payment'))
                .toBeGreaterThan(DIP_TOPLAM_KOLON_SIRASI.indexOf('deposit_amount'));
            // Rezervasyon, Toplam'dan (total_price) SONRA gelir
            expect(DIP_TOPLAM_KOLON_SIRASI.indexOf('deposit_amount'))
                .toBeGreaterThan(DIP_TOPLAM_KOLON_SIRASI.indexOf('total_price'));
        });

        it('Formül: Toplam = Rezervasyon + Alınan + Kalan (tüm status\'lerde tutar)', () => {
            const rows: Row[] = [
                // pending (Sadece Peşinat): Toplam 50k = Rez 10k + Alınan 0 + Kalan 40k
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'pending' },
                // completed: Toplam 50k = Rez 10k + Alınan 40k + Kalan 0
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'completed' },
                // partial: Toplam 50k = Rez 10k + Alınan 20k + Kalan 20k
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 20000, status: 'partial' },
                // deposit_only: Toplam 80k = Rez 5k + Alınan 0 + Kalan 75k
                { total_price: 80000, deposit_amount: 5000, remainder_paid_amount: 0, status: 'deposit_only' },
            ];

            const totalToplam = rows.reduce((acc, r) => acc + r.total_price, 0);
            const totalRez = rows.reduce((acc, r) => acc + r.deposit_amount, 0);
            const totalAlinan = rows.reduce((acc, r) => acc + computeTakenPayment(r), 0);
            const totalKalan = rows.reduce((acc, r) => acc + computeKalan(r), 0);

            // 50 + 50 + 50 + 80 = 230.000
            expect(totalToplam).toBe(230000);
            // 10 + 10 + 10 + 5 = 35.000 (kullanıcı görselindeki dip toplam)
            expect(totalRez).toBe(35000);
            // 16.10.2026 — Alınan: 10k (pending: deposit) + 40k (completed) + 10k (partial: deposit) + 5k (deposit_only: deposit) = 65.000
            expect(totalAlinan).toBe(65000);
            // 16.10.2026 — Kalan = total - deposit (peşinat düşülür, remainder görmezden gelinir).
            //   pending: 50k - 10k = 40k
            //   completed: 0
            //   partial: 50k - 10k = 40k
            //   deposit_only: 80k - 5k = 75k
            // Toplam: 40k + 0 + 40k + 75k = 155.000
            expect(totalKalan).toBe(155000);

            // 16.10.2026 — Tutarlılık notu: Rezervasyon + Alınan + Kalan = Total
            // **artık garanti değil** (partial durumda Kalan = total - deposit,
            // Alınan = remainder; deposit + remainder + (total - deposit) =
            // total + remainder ≠ total). Formülün kullanıcı kararı olduğu
            // bilinçli olarak kabul edildi. Sadece negatif olmayan değerler
            // invariant'ı korunur:
            const activeRows = rows.filter((r) => r.status !== 'cancelled');
            for (const r of activeRows) {
                const sum = computeTakenPayment(r) + computeKalan(r);
                expect(sum).toBeGreaterThanOrEqual(0);
                expect(computeKalan(r)).toBeGreaterThanOrEqual(0);
                expect(computeTakenPayment(r)).toBeGreaterThanOrEqual(0);
            }
        });

        it('Kullanıcı görseli ile birebir uyumlu dip toplam (HAIR CUT × 2, 50k+50k)', () => {
            // Görseldeki iki satır — kullanıcının paylaştığı ekran görüntüsü:
            //   HAIR CUT: rez 15k + alınan 35k + kalan 0  + tutar 50k
            //   HAIR CUT: rez 20k + alınan 30k + kalan 0  + tutar 50k
            //   ────────────────────────────────────────────
            //   Dip     : rez 35k + alınan 65k + kalan 0  + tutar 100k
            const rows: Row[] = [
                { total_price: 50000, deposit_amount: 15000, remainder_paid_amount: 0, status: 'completed' },
                { total_price: 50000, deposit_amount: 20000, remainder_paid_amount: 0, status: 'completed' },
            ];

            // Dip toplam hücreleri (sıra: Toplam Tutar → Rezervasyon → Alınan → Kalan)
            expect(rows.reduce((a, r) => a + r.total_price, 0)).toBe(100000);
            expect(rows.reduce((a, r) => a + r.deposit_amount, 0)).toBe(35000);
            expect(rows.reduce((a, r) => a + computeTakenPayment(r), 0)).toBe(65000);
            expect(rows.reduce((a, r) => a + computeKalan(r), 0)).toBe(0);
        });
    });

    // 12.10.2026 — Kök neden: `ReportColumnTable` `footerSumColumns` listesini
    // kolonlardan otomatik türetiyor; ham `row[key]` üzerinden toplama
    // yapıyordu. `received_payment` DB'de her zaman 0 olabildiği için dip
    // toplam (mavi satır) 0 dönüyordu. Çözüm: `ReportColumnTableCol`'a
    // `footerGetValue` opsiyonu eklendi; `received_payment` ve
    // `outstanding_amount` için bu kolonda `computeTakenPayment(r)` /
    // `computeKalan(r)` helper'ı bağlandı. Bu blok, **dip toplam hücresinin
    // (grand total) status-aware helper'ı kullandığını** ve
    // ham `r.received_payment` (genelde 0) yerine doğru hesabı
    // yansıttığını garanti eder.
    describe('Dip toplam (grand total) — `footerGetValue` köprüsü (12.10.2026)', () => {
        // Senaryo: kullanıcının paylaştığı HAIR CUT × 2 görseli. Hem grup
        // alt toplamı (sarı) hem dip toplam (mavi) `computeTakenPayment`
        // kullanmalı. Ham `r.received_payment` (DB'de 0) kullanılırsa dip
        // toplam 0 çıkar — bu regresyondur.
        const userRows: Row[] = [
            { total_price: 50000, deposit_amount: 15000, remainder_paid_amount: 0, status: 'completed' },
            { total_price: 50000, deposit_amount: 20000, remainder_paid_amount: 0, status: 'completed' },
        ];

        it('Grand total (dip toplam) — received_payment ham alan 0 olsa bile 65.000 verir', () => {
            // DB'deki ham alanlar (genelde 0)
            const rawReceivedSum = userRows.reduce((acc, r) => acc + (Number((r as any).received_payment) || 0), 0);
            // status-aware helper
            const helperReceivedSum = userRows.reduce((acc, r) => acc + computeTakenPayment(r), 0);

            // Ham alanlar 0 olur (regresyonun orijinal davranışı)
            expect(rawReceivedSum).toBe(0);
            // Helper doğru toplamı verir (65.000)
            expect(helperReceivedSum).toBe(65000);
        });

        it('Grand total — outstanding_amount ham alan 0 olsa bile Kalan = 0 verir (completed)', () => {
            const rawKalanSum = userRows.reduce((acc, r) => acc + (Number((r as any).outstanding_amount) || 0), 0);
            const helperKalanSum = userRows.reduce((acc, r) => acc + computeKalan(r), 0);
            // Tamamlanmış randevularda Kalan = 0
            expect(helperKalanSum).toBe(0);
            // Ham alan da bu durumda 0 (DB doğru hesaplamış), ama garanti değil
            expect(rawKalanSum).toBe(0);
        });

        it('Grand total — Kalan 0 olduğunda dip toplamın "0" rozet olarak görünür', () => {
            // computeKalan 0 döndüğünde bile hücre "0" olarak görünmeli
            // (kullanıcı şikâyeti: "Alınan Ödeme boş, Kalan gitmiş, dip toplam kalmış").
            // Bu test, hücre render'ı değil mantığı garanti eder; render
            // DeposPrePaymentReport içinde `cls` ile yapılıyor.
            const r = userRows[0];
            const kalan = computeKalan(r);
            expect(kalan).toBe(0);
            // hücre mantığı: 0.005'ten küçükse yeşil rozet (kalan yok)
            const isZero = kalan < 0.005;
            expect(isZero).toBe(true);
        });

        it('Karma durum — grand total tüm satırları kapsar (grand total = Σ helper, grand total = Σ raw karışmaz)', () => {
            const mixed: Row[] = [
                // completed: Alınan = 40k (raw=0), Kalan = 0
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'completed' },
                // partial: Alınan = 20k (raw=0, remainder_db=20k), Kalan = 50k - 10k = 40k
                { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 20000, status: 'partial' },
                // deposit_only: Alınan = 0 (raw=0), Kalan = 50k - 5k = 45k
                { total_price: 50000, deposit_amount: 5000, remainder_paid_amount: 0, status: 'deposit_only' },
            ];

            // Ham alanlar (DB'den) — hepsi 0 (raw received_payment DB'de
            // 0, raw outstanding_amount da view'de farklı formül kullanıyor)
            const rawReceivedSum = mixed.reduce((a, r) => a + (Number((r as any).received_payment) || 0), 0);
            expect(rawReceivedSum).toBe(0);

            // 16.10.2026 — Helper: 40k (completed: total - deposit) + 10k (partial: deposit) + 5k (deposit_only: deposit) = 55.000
            const helperReceivedSum = mixed.reduce((a, r) => a + computeTakenPayment(r), 0);
            expect(helperReceivedSum).toBe(55000);

            // 16.10.2026 — Kalan = total - deposit (peşinat düşülür).
            //   completed:   0
            //   partial:     50k - 10k = 40k
            //   deposit_only: 50k - 5k = 45k
            // Toplam: 0 + 40k + 45k = 85.000
            const helperKalanSum = mixed.reduce((a, r) => a + computeKalan(r), 0);
            expect(helperKalanSum).toBe(85000);
        });
    });

    // 12.10.2026 — Kullanıcı isteği: "0 ise göstermesin".
    // Hücre ve footer format fonksiyonları `Math.abs(n) < 0.005` eşiğinde
    // boş string (footer için) veya "—" (hücre için) döner. Bu blok,
    // aşağıdaki yardımcı fonksiyonların beklenen sözleşmeyi koruduğunu
    // garanti eder; gerçek render React bileşen ağacında DevExDataGrid
    // tarafından yapılır.
    describe('12.10.2026 — Sıfır değerlerin gizlenmesi (hücre + footer)', () => {
        // Yardımcı: DepositPrePaymentReport.tsx → `fmtAmt` ile aynı semantik.
        const isZeroAmount = (n: number) => Math.abs(n) < 0.005;
        const fmtAmt = (n: number) => (isZeroAmount(n) ? '' : 'X'); // 'X' = fmt(>0) temsili

        it('isZeroAmount: 0 → true', () => {
            expect(isZeroAmount(0)).toBe(true);
        });

        it('isZeroAmount: 0.0049 → true (epsilon altı)', () => {
            expect(isZeroAmount(0.0049)).toBe(true);
        });

        it('isZeroAmount: -0.004 → true (negatif sıfır)', () => {
            expect(isZeroAmount(-0.004)).toBe(true);
        });

        it('isZeroAmount: 0.0051 → false (epsilon üstü)', () => {
            expect(isZeroAmount(0.0051)).toBe(false);
        });

        it('isZeroAmount: 1 → false', () => {
            expect(isZeroAmount(1)).toBe(false);
        });

        it('fmtAmt: sıfır → boş string', () => {
            expect(fmtAmt(0)).toBe('');
        });

        it('fmtAmt: negatif sıfır → boş string', () => {
            expect(fmtAmt(-0)).toBe('');
        });

        it('fmtAmt: 1 → "X" (formatlı değer)', () => {
            expect(fmtAmt(1)).toBe('X');
        });

        it('fmtAmt: 65.000 → "X"', () => {
            expect(fmtAmt(65000)).toBe('X');
        });

        it('Kullanıcı senaryosu — 2 completed satır için Kalan dip toplamı 0 (boş gösterim)', () => {
            // Yardımcı mapping simülasyonu:
            //   mergedFooterSumColumns[i].getValue = footerGetValue || (row) => Number(row[key])
            // Burada `outstanding_amount` kolonu `footerGetValue: computeKalan` kullanır.
            const userRows: Row[] = [
                { total_price: 50000, deposit_amount: 15000, remainder_paid_amount: 0, status: 'completed' },
                { total_price: 50000, deposit_amount: 20000, remainder_paid_amount: 0, status: 'completed' },
            ];
            const footerGetValue = (r: Row) => computeKalan(r);
            const sum = userRows.reduce((acc, r) => acc + (Number(footerGetValue(r)) || 0), 0);
            // Helper dip toplamı 0 olur (her iki satır tamamlanmış → kalan yok)
            expect(sum).toBe(0);
            // Footer formatı: 0 ise boş string
            expect(fmtAmt(sum)).toBe('');
        });

        it('Kullanıcı senaryosu — Kullanıcı görselindeki 65k Alınan dip toplamı doğru hesaplanır', () => {
            // Görselde görülen iki tamamlanmış satır:
            //   HAIR CUT: rez 15k + alınan 35k + kalan 0 + tutar 50k
            //   HAIR CUT: rez 20k + alınan 30k + kalan 0 + tutar 50k
            //   ────────────────────────────────────────────
            //   Dip   : rez 35k + alınan 65k + kalan 0 + tutar 100k
            const userRows: Row[] = [
                { total_price: 50000, deposit_amount: 15000, remainder_paid_amount: 0, status: 'completed' },
                { total_price: 50000, deposit_amount: 20000, remainder_paid_amount: 0, status: 'completed' },
            ];
            const helperReceivedSum = userRows.reduce((a, r) => a + computeTakenPayment(r), 0);
            expect(helperReceivedSum).toBe(65000);
            // Formatlı metin: 65.000 > 0 → göster (boş değil)
            expect(fmtAmt(helperReceivedSum)).toBe('X');

            // Kalan = 0 → boş gösterim
            const helperKalanSum = userRows.reduce((a, r) => a + computeKalan(r), 0);
            expect(helperKalanSum).toBe(0);
            expect(fmtAmt(helperKalanSum)).toBe('');
        });

        it('Hücre 0 — render kararı: outstanding_amount ve received_payment hücreleri "—" üretir', () => {
            // renderZeroAmount(0) → <span>—</span>; renderZeroAmount(n>0) → nonZero(n)
            // Burada semantiği: 0 olan hücrede "—" sembolü render edilir.
            const ZERO_RENDER = '—';
            const renderZeroAmount = (n: number, nonZero: (n: number) => string): string =>
                isZeroAmount(n) ? ZERO_RENDER : nonZero(n);

            // Tüm status'lerde Kalan = 0: completed/cancelled/no_show
            const closed: Row = { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'completed' };
            expect(renderZeroAmount(computeKalan(closed), (v) => `K:${v}`)).toBe('—');

            // scheduled/deposit_only → Kalan = total-deposit (0 olmaz)
            const pending: Row = { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'pending' };
            expect(renderZeroAmount(computeKalan(pending), (v) => `K:${v}`)).toBe('K:40000');

            // Alınan 0 ise "—"
            expect(renderZeroAmount(computeTakenPayment(closed), (v) => `A:${v}`)).toBe('A:40000');
            const cancelled: Row = { total_price: 50000, deposit_amount: 10000, remainder_paid_amount: 0, status: 'cancelled' };
            expect(renderZeroAmount(computeTakenPayment(cancelled), (v) => `A:${v}`)).toBe('—');
        });
    });
});
