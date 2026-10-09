/**
 * Kasa Durumu — Rezervasyon Avansı ayrıştırma regresyon testi.
 *
 * Kullanıcı şikâyeti (WhatsApp):
 *   "jmn bh kasaya 25 rezervasyon yaptım 25 kasada var bu raporda 50"
 *
 * Yani gerçek nakit 25.000 + alınan avans 25.000 = 50.000. Raporun bu
 * 50.000'i Nakit'e dahil etmemesi, avansı ayrı göstermesi gerekir.
 */
import { describe, expect, it } from 'vitest';
import {
  extraCustomerCollectionsNotOnSales,
  extraReservationCustomerCollections,
} from '../../utils/saleCollectedAmounts';
import {
  buildPaymentTypeDistribution,
} from '../../utils/paymentTypeDistribution';
import { SYSTEM_PAYMENT_FORM_CODES } from '../../utils/paymentMethodUtils';

describe('Kasa Durumu — Rezervasyon Avansı ayrıştırma', () => {
  it('REZERVASYON_AVANS form kodu SYSTEM_PAYMENT_FORM_CODES içinde', () => {
    expect(SYSTEM_PAYMENT_FORM_CODES).toContain('REZERVASYON_AVANS');
  });

  it('CH_TAHSILAT + REZERVASYON satırları ayrı bucket\'a yazılır, Nakit\'e eklenmez', () => {
    const kasaLines = [
      // gerçek nakit satış (BEA fiş)
      {
        id: '1',
        islem_no: 'BEA-2026-MV1ANE8K',
        islem_tipi: 'KASA_GIRIS',
        tutar: 50000,
      },
      // rezervasyon avansı (KL-001)
      {
        id: '2',
        islem_no: 'KL-001-1791569968772',
        islem_tipi: 'CH_TAHSILAT',
        ozel_kod: 'REZERVASYON',
        tutar: 25000,
      },
    ];
    // Sale tablosunda BEA fişi → 50.000 nakit ödeme kayıtlı
    const sales = [
      {
        receiptNumber: 'BEA-2026-MV1ANE8K',
        total: 50000,
        paymentMethod: 'cash',
        payments: [{ amount: 50000, method: 'cash' }],
      },
    ];

    const dist = buildPaymentTypeDistribution(
      [
        {
          id: 'sale-1',
          total: 50000,
          paymentMethod: 'cash',
          payments: [{ amount: 50000, method: 'cash' }],
        },
      ],
      {
        extraCash: extraCustomerCollectionsNotOnSales(kasaLines, sales),
        extraReservation: extraReservationCustomerCollections(kasaLines),
        includeZero: true,
      }
    );

    // Gerçek nakit: 50.000 (sale.payments.cash)
    expect(dist.byCode.NAKIT.amount).toBe(50000);
    // Rezervasyon avansı: 25.000 ayrı bucket'ta
    expect(dist.byCode.REZERVASYON_AVANS.amount).toBe(25000);
    // Avans Nakit'e katılmadı (önceden 75.000 olurdu)
    expect(dist.byCode.NAKIT.amount).not.toBe(75000);
  });

  it('Avanssız satışta REZERVASYON_AVANS=0 ve Nakit doğru', () => {
    const kasaLines = [
      {
        id: '1',
        islem_no: 'BEA-2026-X',
        islem_tipi: 'KASA_GIRIS',
        tutar: 30000,
      },
    ];
    const sales = [
      {
        receiptNumber: 'BEA-2026-X',
        total: 30000,
        paymentMethod: 'cash',
        payments: [{ amount: 30000, method: 'cash' }],
      },
    ];

    const dist = buildPaymentTypeDistribution(
      [
        {
          id: 's1',
          total: 30000,
          paymentMethod: 'cash',
          payments: [{ amount: 30000, method: 'cash' }],
        },
      ],
      {
        extraCash: extraCustomerCollectionsNotOnSales(kasaLines, sales),
        extraReservation: extraReservationCustomerCollections(kasaLines),
        includeZero: true,
      }
    );

    expect(dist.byCode.NAKIT.amount).toBe(30000);
    expect(dist.byCode.REZERVASYON_AVANS.amount).toBe(0);
  });

  it('Sadece avans (nakit satış yok) — Nakit 0, Avans 25.000', () => {
    const kasaLines = [
      {
        id: '1',
        islem_no: 'KL-001-XXX',
        islem_tipi: 'CH_TAHSILAT',
        ozel_kod: 'REZERVASYON',
        tutar: 25000,
      },
    ];

    const dist = buildPaymentTypeDistribution(
      [],
      {
        extraCash: extraCustomerCollectionsNotOnSales(kasaLines, []),
        extraReservation: extraReservationCustomerCollections(kasaLines),
        includeZero: true,
      }
    );

    expect(dist.byCode.NAKIT.amount).toBe(0);
    expect(dist.byCode.REZERVASYON_AVANS.amount).toBe(25000);
  });

  it('extraReservationCustomerCollections yalnız REZERVASYON/AVANS özel_kodlu satırları toplar', () => {
    const lines = [
      { id: '1', islem_tipi: 'CH_TAHSILAT', ozel_kod: 'REZERVASYON', tutar: 10000 },
      { id: '2', islem_tipi: 'CH_TAHSILAT', ozel_kod: 'AVANS', tutar: 5000 },
      { id: '3', islem_tipi: 'CH_TAHSILAT', ozel_kod: 'DIGER', tutar: 7000 },
      { id: '4', islem_tipi: 'KASA_GIRIS', tutar: 20000 },
    ];

    const total = extraReservationCustomerCollections(lines);
    expect(total).toBe(15000); // 10.000 + 5.000
  });

  it('Boş/null cashLines için 0 döner', () => {
    expect(extraReservationCustomerCollections(null)).toBe(0);
    expect(extraReservationCustomerCollections([])).toBe(0);
    expect(extraReservationCustomerCollections(undefined)).toBe(0);
  });
});
