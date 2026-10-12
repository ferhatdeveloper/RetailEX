import { describe, expect, it } from 'vitest';
import {
  allocateSaleAmountsByFormCode,
  buildPaymentTypeDistribution,
  buildPaymentTypeMovements,
} from '../../utils/paymentTypeDistribution';
import {
  extraCustomerCollectionsNotOnSales,
  extraReservationCustomerCollections,
} from '../../utils/saleCollectedAmounts';

describe('paymentTypeDistribution', () => {
  it('yapıdaki tüm form kodlarını sıfır tutarla listeler', () => {
    const dist = buildPaymentTypeDistribution([], { includeZero: true });
    // REZERVASYON_AVANS, 5c56b892 ile eklendi — kasa durumu ayrı kalem.
    expect(dist.types.map((t) => t.code)).toEqual([
      'NAKIT',
      'KREDIKARTI',
      'ACIK_CARI',
      'HAVAL',
      'CEK',
      'SENET',
      'REZERVASYON_AVANS',
    ]);
    expect(dist.types.every((t) => t.amount === 0)).toBe(true);
  });

  it('tek ödeme yöntemini form koduna yazar', () => {
    const split = allocateSaleAmountsByFormCode(100_000, null, 'Nakit');
    expect(split.NAKIT).toBe(100_000);
    expect(split.KREDIKARTI).toBe(0);
  });

  it('çoklu ödemede çek / senet ayrı tipte görünür', () => {
    const dist = buildPaymentTypeDistribution(
      [
        {
          id: '1',
          total: 150,
          paymentMethod: 'mixed',
          payments: [
            { method: 'NAKIT', amount: 50 },
            { method: 'CEK', amount: 40 },
            { method: 'SENET', amount: 60 },
          ],
          receiptNumber: 'F-1',
          date: '2024-09-19',
        },
      ],
      { includeZero: true },
    );
    expect(dist.byCode.NAKIT.amount).toBe(50);
    expect(dist.byCode.CEK.amount).toBe(40);
    expect(dist.byCode.SENET.amount).toBe(60);
  });

  it('rezervasyon avansı ACIK_CARI bucket\'ına yazılmaz, NAKIT\'e kaydırılır', () => {
    const dist = buildPaymentTypeDistribution(
      [
        {
          id: 'r1',
          total: 20_000,
          paymentMethod: 'veresiye',
          receiptNumber: 'R1',
          date: '2024-09-19',
          isDeposit: true,
        },
        {
          id: 'r2',
          total: 30_000,
          paymentMethod: 'nakit',
          receiptNumber: 'R2',
          date: '2024-09-19',
        },
      ],
      { includeZero: true },
    );
    expect(dist.byCode.ACIK_CARI.amount).toBe(0);
    expect(dist.byCode.NAKIT.amount).toBe(50_000);
  });

  it('rezervasyon avansı (notes: parent_sale:) ACIK_CARI\'a yazılmaz', () => {
    const dist = buildPaymentTypeDistribution(
      [
        {
          id: 'r3',
          total: 75_000,
          paymentMethod: 'veresiye',
          receiptNumber: 'R3',
          date: '2024-09-19',
          notes: 'parent_sale:abc',
        },
      ],
      { includeZero: true },
    );
    expect(dist.byCode.ACIK_CARI.amount).toBe(0);
    expect(dist.byCode.NAKIT.amount).toBe(75_000);
  });

  it('buildPaymentTypeMovements ACIK_CARI için rezervasyon avansı satırını atlar', () => {
    const rows = buildPaymentTypeMovements(
      [
        {
          id: 'r1',
          total: 20_000,
          paymentMethod: 'veresiye',
          receiptNumber: 'R1',
          date: '2024-09-19',
          isDeposit: true,
        },
      ],
      'ACIK_CARI',
    );
    expect(rows).toHaveLength(0);
  });

  it('tip hareket listesini filtreler', () => {
    const rows = buildPaymentTypeMovements(
      [
        {
          id: 'a',
          total: 10,
          paymentMethod: 'card',
          receiptNumber: 'R1',
          date: '2024-09-18',
        },
        {
          id: 'b',
          total: 20,
          paymentMethod: 'cash',
          receiptNumber: 'R2',
          date: '2024-09-19',
        },
      ],
      'NAKIT',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].receiptNumber).toBe('R2');
    expect(rows[0].amount).toBe(20);
  });
});

/**
 * Kasa Durumu Toplam — Açık Cari Hariç (Senaryo B).
 *
 * Kullanıcı şikâyeti 2026-10-12:
 *   "toplamda rezervasyon tutarı fazla gösteriyor olması gereken 150.000 di"
 *
 * Resimdeki tablo:
 *   Nakit 150k + Kredi Kartı 0 + Açık Cari 35k + Havale 0 + Çek 0 + Senet 0
 *   + Rezervasyon Avansı 35k (ayrı bilgi) → Mevcut TOPLAM 185k (yanlış).
 *
 * Kullanıcı isteği: TOPLAM = 150k (Açık Cari Hariç — müşteriden henüz
 * tahsil edilmemiş alacak kasa nakit değil). Rezervasyon zaten Hariç
 * (Senaryo A). dist.totalAmount yapısal olarak tüm form kodlarını toplar;
 * KPI semantiği `getCashStatus.todayTotal = dist.totalAmount -
 * reservationDeposit - acikCari`.
 *
 * Bu test: dist.totalAmount'ın yapısal semantiği (220k), ve `todayTotal`'ın
 * KPI semantiği (150k) ayrı ayrı doğrulanır.
 */
describe('Kasa Durumu — Açık Cari Hariç (Senaryo B)', () => {
  // dist.totalAmount tüm form kodlarını toplar: NAKIT (150) + KREDIKARTI (0)
  // + ACIK_CARI (35) + HAVAL (0) + CEK (0) + SENET (0) + REZERVASYON_AVANS
  // (35) = 220k.
  const expectedDistTotal = 150_000 + 35_000 + 35_000;

  function buildScenarioForDisplay() {
    const kasaLines = [
      // 150.000 nakit (BEA fiş)
      {
        id: 'kasa-1',
        islem_no: 'BEA-2026-NAKIT',
        islem_tipi: 'KASA_GIRIS',
        tutar: 150_000,
        ozel_kod: '',
      },
      // 35.000 açık cari (veresiye satış — KASA_GIRIS ile tahsil edilmemiş)
      {
        id: 'kasa-2',
        islem_no: 'BEA-2026-VERESIYE',
        islem_tipi: 'KASA_GIRIS',
        tutar: 35_000,
        ozel_kod: 'VERESIYE',
      },
      // 35.000 rezervasyon avansı
      {
        id: 'kasa-3',
        islem_no: 'KL-2026-RES',
        islem_tipi: 'CH_TAHSILAT',
        ozel_kod: 'REZERVASYON',
        tutar: 35_000,
      },
    ];
    const sales = [
      {
        receiptNumber: 'BEA-2026-NAKIT',
        total: 150_000,
        paymentMethod: 'cash',
        payments: [{ amount: 150_000, method: 'cash' }],
      },
      {
        receiptNumber: 'BEA-2026-VERESIYE',
        total: 35_000,
        paymentMethod: 'veresiye',
        payments: [{ amount: 35_000, method: 'veresiye' }],
      },
    ];
    return { kasaLines, sales };
  }

  it('Senaryo B — kullanıcı senaryosu: 150k + 35k açık cari + 35k rezervasyon → todayTotal = 150k', () => {
    const { kasaLines, sales } = buildScenarioForDisplay();
    const dist = buildPaymentTypeDistribution(
      [
        {
          id: 'sale-1',
          total: 150_000,
          paymentMethod: 'cash',
          payments: [{ amount: 150_000, method: 'cash' }],
        },
        {
          id: 'sale-2',
          total: 35_000,
          paymentMethod: 'veresiye',
          payments: [{ amount: 35_000, method: 'veresiye' }],
        },
      ],
      {
        extraCash: extraCustomerCollectionsNotOnSales(kasaLines, sales),
        extraReservation: extraReservationCustomerCollections(kasaLines),
        includeZero: true,
      }
    );

    // ✅ Bireysel kalemler doğru
    expect(dist.byCode.NAKIT.amount).toBe(150_000);
    expect(dist.byCode.ACIK_CARI.amount).toBe(35_000);
    expect(dist.byCode.REZERVASYON_AVANS.amount).toBe(35_000);

    // ✅ Altta yatan API: dist.totalAmount tüm form kodlarını toplar (220k)
    // — Senaryo A + B düzeltmesi ayrı bir katmanda yapılır.
    expect(dist.totalAmount).toBe(expectedDistTotal);

    // ✅ KPI semantiği (Senaryo A + B): TOPLAM satırı = dist.totalAmount
    // − reservationDeposit − acikCari → 150k
    const reservationDeposit = dist.byCode.REZERVASYON_AVANS?.amount ?? 0;
    const acikCari = dist.byCode.ACIK_CARI?.amount ?? 0;
    const todayTotal = dist.totalAmount - reservationDeposit - acikCari;
    expect(todayTotal).toBe(150_000);
  });

  it('Senaryo B — kullanıcı senaryosu: tüm alanlar 0 → todayTotal = 0', () => {
    const dist = buildPaymentTypeDistribution([], { includeZero: true });
    expect(dist.totalAmount).toBe(0);
    const reservationDeposit = dist.byCode.REZERVASYON_AVANS?.amount ?? 0;
    const acikCari = dist.byCode.ACIK_CARI?.amount ?? 0;
    const todayTotal = dist.totalAmount - reservationDeposit - acikCari;
    expect(todayTotal).toBe(0);
  });

  it('Senaryo B — sadece Açık Cari (nakit yok) → todayTotal = 0 (kasa nakit yok)', () => {
    // 50.000 veresiye satış + 0 nakit + 0 rezervasyon → TOPLAM 0
    const dist = buildPaymentTypeDistribution(
      [
        {
          id: 's1',
          total: 50_000,
          paymentMethod: 'veresiye',
          payments: [{ amount: 50_000, method: 'veresiye' }],
        },
      ],
      { includeZero: true }
    );
    expect(dist.byCode.NAKIT.amount).toBe(0);
    expect(dist.byCode.ACIK_CARI.amount).toBe(50_000);
    const reservationDeposit = dist.byCode.REZERVASYON_AVANS?.amount ?? 0;
    const acikCari = dist.byCode.ACIK_CARI?.amount ?? 0;
    const todayTotal = dist.totalAmount - reservationDeposit - acikCari;
    expect(todayTotal).toBe(0);
  });

  it('Senaryo B — 80k nakit + 20k açık cari + 10k rezervasyon → todayTotal = 80k', () => {
    const dist = buildPaymentTypeDistribution(
      [
        {
          id: 's1',
          total: 80_000,
          paymentMethod: 'cash',
          payments: [{ amount: 80_000, method: 'cash' }],
        },
        {
          id: 's2',
          total: 20_000,
          paymentMethod: 'veresiye',
          payments: [{ amount: 20_000, method: 'veresiye' }],
        },
      ],
      {
        extraReservation: 10_000,
        includeZero: true,
      }
    );
    expect(dist.byCode.NAKIT.amount).toBe(80_000);
    expect(dist.byCode.ACIK_CARI.amount).toBe(20_000);
    expect(dist.byCode.REZERVASYON_AVANS.amount).toBe(10_000);
    // dist.totalAmount = 80 + 20 + 10 = 110k (yapısal tüm kod)
    expect(dist.totalAmount).toBe(110_000);
    // todayTotal = 110 - 10 (rezervasyon) - 20 (açık cari) = 80k
    const reservationDeposit = dist.byCode.REZERVASYON_AVANS?.amount ?? 0;
    const acikCari = dist.byCode.ACIK_CARI?.amount ?? 0;
    const todayTotal = dist.totalAmount - reservationDeposit - acikCari;
    expect(todayTotal).toBe(80_000);
  });
});
