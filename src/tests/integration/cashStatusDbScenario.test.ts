/**
 * Entegrasyon testi — DB verisi ile Kasa Durumu senaryosunun doğrulanması.
 *
 * Senaryo:
 *   25.000 IQD hizmet nakdi + 25.000 IQD rezervasyon avansı.
 *   Kaynak bucket'lar ayrı kalır (NAKIT 25.000, REZERVASYON_AVANS 25.000).
 *   Kasa durumu katmanı rezervasyonu nakde bir kez ekler: günlük nakit 50.000,
 *   genel toplam 50.000 (75.000 değil).
 *
 * Bu test vitest config'i içinde `integration` glob'u ile ayrı çalışır.
 */
import { describe, expect, it } from 'vitest';
import {
  extraReservationCustomerCollections,
  extraCustomerCollectionsNotOnSales,
  type KasaCollectionLine,
} from '../../utils/saleCollectedAmounts';
import { buildPaymentTypeDistribution } from '../../utils/paymentTypeDistribution';
import { foldReservationIntoCashStatus } from '../../utils/cashStatusTotals';

describe('DB senaryosu — 25k avans + 25k nakit (Kasa Durumu)', () => {
  const kasaLinesToday: KasaCollectionLine[] = [
    {
      id: 'kasa-1',
      islem_no: 'BEA-2026-TESTNIT1',
      islem_tipi: 'KASA_GIRIS',
      tutar: 25000,
      ozel_kod: '',
    },
    {
      id: 'kasa-2',
      islem_no: 'KL-2026-TESTAVANS1',
      islem_tipi: 'CH_TAHSILAT',
      ozel_kod: 'REZERVASYON',
      tutar: 25000,
    },
  ];

  it('extraReservationCustomerCollections: 25k döner (sadece avans)', () => {
    expect(extraReservationCustomerCollections(kasaLinesToday)).toBe(25000);
  });

  it('extraCustomerCollectionsNotOnSales: 0 döner (avans hariç tutulur)', () => {
    // sales'da BEA fiş yok → normalde ekstra olurdu, ama biz REZERVASYON satırını
    // Nakit'ten Hariç tutuyoruz. KL-2026 avansı zaten filtrelenir.
    const sales = [
      {
        receiptNumber: 'BEA-2026-TESTNIT1',
        total: 25000,
        paymentMethod: 'cash',
        payments: [{ amount: 25000, method: 'cash' }],
      },
    ];
    // Avans filtrelendiği için ekstra 0 olur.
    expect(extraCustomerCollectionsNotOnSales(kasaLinesToday, sales)).toBe(0);
  });

  it('buildPaymentTypeDistribution: Nakit=25k + REZERVASYON_AVANS=25k', () => {
    const sales = [
      {
        receiptNumber: 'BEA-2026-TESTNIT1',
        total: 25000,
        paymentMethod: 'cash',
        payments: [{ amount: 25000, method: 'cash' }],
      },
    ];

    const dist = buildPaymentTypeDistribution(
      [
        {
          id: 'sale-1',
          total: 25000,
          paymentMethod: 'cash',
          payments: [{ amount: 25000, method: 'cash' }],
        },
      ],
      {
        extraCash: extraCustomerCollectionsNotOnSales(kasaLinesToday, sales),
        extraReservation: extraReservationCustomerCollections(kasaLinesToday),
        includeZero: true,
      }
    );

    // ✅ Gerçek nakit = 25.000 (önceden 50.000 görünüyordu)
    expect(dist.byCode.NAKIT.amount).toBe(25000);

    // ✅ Alınan avans = 25.000 ayrı kalem
    expect(dist.byCode.REZERVASYON_AVANS.amount).toBe(25000);

    // ✅ Nakit şişmedi (avans Nakit'e katılmadı)
    expect(dist.byCode.NAKIT.amount).not.toBe(50000);

    // ✅ Kaynak toplam = 50.000 (bucket'lar ayrı; henüz ekran katmanı değil)
    expect(dist.totalAmount).toBe(50000);

    const folded = foldReservationIntoCashStatus({
      openingCash: 0,
      serviceCash: dist.byCode.NAKIT.amount,
      reservationCash: dist.byCode.REZERVASYON_AVANS.amount,
      cashOut: 0,
      paymentTypes: dist.types,
    });
    expect(folded.todayCash).toBe(50000);
    expect(folded.closingCash).toBe(50000);
    expect(folded.grandTotal).toBe(50000);
    expect(folded.grandTotal).not.toBe(75000);
  });
});
