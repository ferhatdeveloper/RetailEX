/**
 * Backoffice Günlük Özet — 20.10.2026.
 *
 * Hizmet 110.000 + ürün 20.000 − iade 10.000 = net satış 120.000.
 * Peşinat 20.000 ciroya girmez ve netten düşülmez.
 * SMM = 1 × 5.500. Kâr = 120.000 − 5.500 = 114.500.
 * Stok 19 × 5.500 = 104.500. 19 × satış fiyatı 10.000 = 190.000 yazılmaz.
 */
import { describe, expect, it } from 'vitest';
import {
  backofficeBusinessDateKey,
  summarizeBackofficeDailyStrip,
  type BackofficeSummarySale,
} from '../../utils/backofficeDailySummary';

const NOW = new Date(2026, 9, 20, 18, 0, 0);

const boya = {
  id: 'boya-1',
  code: 'BOYA',
  name: 'BOYA',
  stock: 19,
  price: 10_000,
  cost: 10_000,
  average_unit_cost: 5_500,
};

function fiches(date: string | Date): BackofficeSummarySale[] {
  return [
    {
      id: 'ret-1',
      receiptNumber: '0000003',
      date,
      status: 'return',
      total: -10_000,
      trcode: 3,
      items: [{ productName: 'BOYA', productId: 'boya-1', quantity: 1, price: 10_000, total: 10_000, cost: 10_000, lineType: 'Malzeme' }],
    },
    {
      id: 'srv-1',
      receiptNumber: 'BEA-2026-MVGYLBOM',
      date,
      status: 'completed',
      total: 110_000,
      items: [
        { productName: 'HAIR CUT', quantity: 1, price: 50_000, total: 50_000, lineType: 'Hizmet' },
        { productName: 'HAIR PINK COLOR', quantity: 1, price: 60_000, total: 60_000, lineType: 'Hizmet' },
      ],
    },
    {
      id: 'sale-1',
      receiptNumber: 'BEA-2026-MVGZEUWF',
      date,
      status: 'completed',
      total: 20_000,
      items: [{ productName: 'BOYA', productId: 'boya-1', quantity: 2, price: 10_000, total: 20_000, cost: 10_000, lineType: 'Malzeme' }],
    },
    {
      id: 'dep-1',
      receiptNumber: 'PESINAT-20',
      date,
      status: 'completed',
      total: 20_000,
      isDeposit: true,
      items: [{ productName: 'PEŞİNAT', quantity: 1, price: 20_000, total: 20_000, lineType: 'Hizmet' }],
    },
  ];
}

describe('Günlük Özet — 20.10.2026 net satış ve stok maliyeti', () => {
  const strip = summarizeBackofficeDailyStrip({
    sales: fiches('2026-10-20T00:00:00.000Z'),
    products: [boya],
    now: NOW,
  });

  it('bugünkü net satış 120.000, iade 10.000 bir kez, peşinat hariç', () => {
    expect(strip.today.netSales).toBe(120_000);
    expect(strip.today.returnAmount).toBe(10_000);
    expect(strip.today.depositAmount).toBe(20_000);
    expect(strip.today.netSales).not.toBe(140_000);
    expect(strip.today.netSales).not.toBe(130_000);
    expect(strip.today.netSales).not.toBe(110_000);
    expect(strip.today.netSales).not.toBe(100_000);
    expect(Number.isInteger(strip.today.netSales)).toBe(true);
  });

  it('işlem sayısı 3; iade ek ciro yazmaz, peşinat sayılmaz', () => {
    expect(strip.today.transactionCount).toBe(3);
    expect(strip.today.transactionCount).not.toBe(0);
    expect(strip.today.transactionCount).not.toBe(4);
    expect(strip.week.netSales).toBe(120_000);
    expect(strip.week.transactionCount).toBe(3);
  });

  it('kâr 114.500 ve marj net satışa bölünür', () => {
    expect(strip.today.cogs).toBe(5_500);
    expect(strip.today.profit).toBe(114_500);
    expect(strip.today.profit).toBe(strip.today.netSales - strip.today.cogs);
    expect(strip.today.marginPercent).toBeCloseTo((114_500 / 120_000) * 100, 4);
    expect(Number.isInteger(strip.today.profit)).toBe(true);
    expect(Number.isInteger(strip.today.cogs)).toBe(true);
  });

  it('stok değeri 104.500; satış fiyatı 190.000 kullanılmaz', () => {
    expect(strip.stockValueCost).toBe(104_500);
    expect(strip.stockValueCost).toBe(19 * 5_500);
    expect(strip.stockValueSale).toBe(190_000);
    expect(strip.stockValueCost).not.toBe(190_000);
    expect(strip.stockValueCost).not.toBe(105_000);
  });

  it('UTC gece yarısı ve tarih-only iş günü bugüne yazılır', () => {
    expect(backofficeBusinessDateKey('2026-10-20')).toBe('2026-10-20');
    expect(backofficeBusinessDateKey('2026-10-20T00:00:00.000Z')).toBe('2026-10-20');
    expect(backofficeBusinessDateKey(new Date(Date.UTC(2026, 9, 20, 0, 0, 0)))).toBe('2026-10-20');
    expect(backofficeBusinessDateKey('20.10.2026')).toBe('2026-10-20');

    const fromDateOnly = summarizeBackofficeDailyStrip({
      sales: fiches('2026-10-20'),
      products: [boya],
      now: NOW,
    });
    const fromUtcMidnight = summarizeBackofficeDailyStrip({
      sales: fiches(new Date(Date.UTC(2026, 9, 20, 0, 0, 0))),
      products: [boya],
      now: NOW,
    });
    expect(fromDateOnly.today.netSales).toBe(120_000);
    expect(fromUtcMidnight.today.netSales).toBe(120_000);
    expect(fromDateOnly.today.transactionCount).toBe(3);
  });

  it('dün fişi bugüne yazılmaz; kart maliyeti ağırlıklı ortalamayı satış fiyatına tercih eder', () => {
    const mixed = summarizeBackofficeDailyStrip({
      sales: [
        ...fiches('2026-10-20'),
        {
          id: 'yday',
          date: '2026-10-19',
          status: 'completed',
          total: 50_000,
          items: [{ productName: 'HAIR CUT', quantity: 1, price: 50_000, total: 50_000, lineType: 'Hizmet' }],
        },
      ],
      products: [{ ...boya, cost: 10_000, layeredAvg: 105_000 / 19 }],
      now: NOW,
    });
    expect(mixed.today.netSales).toBe(120_000);
    expect(mixed.yesterday.netSales).toBe(50_000);
    expect(mixed.week.netSales).toBe(170_000);
    expect(mixed.stockValueCost).toBe(104_500);
    expect(mixed.revenueChangePercent).toBeCloseTo(((120_000 - 50_000) / 50_000) * 100, 4);
  });
});

/**
 * 24.10.2026 — Kar-Zarar ile aynı hizmet SMM.
 * TORPI 2 × 20.000 = 40.000, SAC BOYA 1 × 10.000 = 10.000.
 * Net 125.000 − SMM 50.000 = kâr 75.000, marj %60.
 * Satış kartı 125.000 kalır. Peşinat kâra girmez.
 * Sıfır hizmet kartı dolu satır maliyetini silmez.
 */
describe('Günlük Özet — 24.10.2026 hizmet kârı', () => {
  const now = new Date(2026, 9, 24, 13, 20, 0);
  const strip = summarizeBackofficeDailyStrip({
    now,
    products: [
      { id: 'torpi', code: 'TORPI', name: 'TORPI', isService: true, materialType: 'service', cost: 0, price: 50_000, stock: 0 },
      { id: 'sac', code: 'SACBOYA', name: 'SAC BOYA', isService: true, materialType: 'service', cost: 0, price: 25_000, stock: 0 },
    ],
    sales: [
      {
        id: 'fiche-1',
        date: '2026-10-24',
        status: 'completed',
        total: 125_000,
        items: [
          { productName: 'TORPI', productId: 'torpi', quantity: 2, price: 50_000, total: 100_000, unit_cost: 20_000, lineType: 'Hizmet' },
          { productName: 'SAC BOYA', productId: 'sac', quantity: 1, price: 25_000, total: 25_000, unit_cost: 10_000, lineType: 'Hizmet' },
        ],
      },
      {
        id: 'dep-1',
        date: '2026-10-24',
        status: 'completed',
        total: 20_000,
        isDeposit: true,
        items: [{ productName: 'PEŞİNAT', quantity: 1, price: 20_000, total: 20_000, unit_cost: 20_000, lineType: 'Hizmet' }],
      },
    ],
  });

  it('satış 125.000 kalır, kâr 75.000 ve marj 60 olur', () => {
    expect(strip.today.netSales).toBe(125_000);
    expect(strip.today.returnAmount).toBe(0);
    expect(strip.today.cogs).toBe(50_000);
    expect(strip.today.profit).toBe(75_000);
    expect(strip.today.profit).toBe(strip.today.netSales - strip.today.cogs);
    expect(strip.today.marginPercent).toBe(60);
    expect(strip.today.profit).not.toBe(strip.today.netSales);
    expect(strip.today.marginPercent).not.toBe(100);
    expect(strip.today.transactionCount).toBe(1);
    expect(strip.week.netSales).toBe(125_000);
    expect(strip.week.profit).toBe(75_000);
  });

  it('peşinat kâra girmez ve satıştan düşülmez', () => {
    expect(strip.today.depositAmount).toBe(20_000);
    expect(strip.today.netSales).toBe(125_000);
    expect(strip.today.profit).toBe(75_000);
    expect(strip.today.profit).not.toBe(75_000 - 20_000);
    expect(strip.today.profit).not.toBe(125_000 + 20_000);
    expect(strip.today.netSales).not.toBe(125_000 + 20_000);
    expect(strip.today.netSales).not.toBe(125_000 - 20_000);
    expect(strip.today.cogs).not.toBe(50_000 + 20_000);
  });

  it('satır birimi yokken hizmet kartı maliyeti düşülür', () => {
    const fromCard = summarizeBackofficeDailyStrip({
      now,
      products: [
        { id: 'torpi', code: 'TORPI', name: 'TORPI', isService: true, materialType: 'service', cost: 20_000, price: 50_000, stock: 0 },
        { id: 'sac', code: 'SACBOYA', name: 'SAC BOYA', isService: true, materialType: 'service', purchase_price: 10_000, price: 25_000, stock: 0 },
      ],
      sales: [
        {
          id: 'fiche-card',
          date: '2026-10-24',
          status: 'completed',
          total: 125_000,
          items: [
            { productName: 'TORPI', productId: 'torpi', quantity: 2, price: 50_000, total: 100_000, lineType: 'Hizmet' },
            { productName: 'SAC BOYA', productId: 'sac', quantity: 1, price: 25_000, total: 25_000, lineType: 'Hizmet' },
          ],
        },
      ],
    });
    expect(fromCard.today.netSales).toBe(125_000);
    expect(fromCard.today.cogs).toBe(50_000);
    expect(fromCard.today.profit).toBe(75_000);
    expect(fromCard.today.marginPercent).toBe(60);
    expect(fromCard.today.cogs).not.toBe(0);
    expect(fromCard.today.cogs).not.toBe(125_000);
  });
});
