/**
 * Entegrasyon testi — DB verisi ile Kasa Durumu senaryosunun doğrulanması.
 *
 * Senaryo (kullanıcı şikâyeti):
 *   25.000 IQD nakit + 25.000 IQD rezervasyon avansı
 *   Beklenen: Nakit KPI = 25.000 (avans Hariç),
 *             REZERVASYON_AVANS = 25.000 (ayrı kalem).
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

    // ✅ Toplam = 50.000 (avans + nakit doğru toplam)
    expect(dist.totalAmount).toBe(50000);
  });
});
