import { describe, expect, it } from 'vitest';
import type { Sale } from '../../core/types';
import { isReturnSale } from '../../utils/posZReport';
import {
  accumulateComparisonProducts,
  sumComparisonProducts,
} from '../../utils/periodComparisonProducts';

/**
 * Ekrandaki fişler: iki satış (hizmet + brüt BOYA) ve ayrı BOYA iadesi.
 * Kalem tutarı veritabanında artı durur; fiş başlığı iadede eksidir.
 */
function headerNet(sales: Array<{ total: number; status?: string }>): number {
  const positive = sales.filter((s) => !isReturnSale(s as Sale));
  const returns = sales.filter((s) => isReturnSale(s as Sale));
  const gross = positive.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  const returned = returns.reduce((sum, s) => sum + Math.abs(Number(s.total) || 0), 0);
  return gross - returned;
}

function scenarioSales(returnLine: { quantity: number; total: number }) {
  const pink = {
    id: 'satis-pink',
    total: 70_000,
    status: 'completed',
    items: [
      { productName: 'HAIR PINK COLOR', quantity: 1, total: 60_000 },
      { productName: 'BOYA', quantity: 1, total: 10_000 },
    ],
  };
  const cut = {
    id: 'satis-cut',
    total: 60_000,
    status: 'completed',
    items: [
      { productName: 'HAIR CUT', quantity: 1, total: 50_000 },
      { productName: 'BOYA', quantity: 1, total: 10_000 },
    ],
  };
  const boyaReturn = {
    id: 'iade-boya',
    total: -10_000,
    status: 'return',
    items: [{ productName: 'BOYA', ...returnLine }],
  };
  return [pink, cut, boyaReturn];
}

describe('Dönem karşılaştırma — BOYA iadesi bir kez düşülür', () => {
  it('2×10.000 BOYA ve 1×10.000 artı iade: BOYA 1 adet / 10.000, tablo 3 adet / 120.000', () => {
    const sales = scenarioSales({ quantity: 1, total: 10_000 });
    const map = accumulateComparisonProducts(sales);
    const boya = map.get('BOYA');
    const total = sumComparisonProducts(map);

    expect(headerNet(sales)).toBe(120_000);
    expect(map.get('HAIR PINK COLOR')).toEqual({ qty: 1, revenue: 60_000 });
    expect(map.get('HAIR CUT')).toEqual({ qty: 1, revenue: 50_000 });
    expect(boya).toEqual({ qty: 1, revenue: 10_000 });
    expect(total).toEqual({ qty: 3, revenue: 120_000 });
    expect(boya?.revenue).not.toBe(30_000);
    expect(boya?.qty).not.toBe(3);
    expect(total.revenue).not.toBe(140_000);
    expect(total.qty).not.toBe(5);
    expect(total.revenue).not.toBe(110_000);
  });

  it('iade satırı zaten eksi ise ikinci kez düşülmez, BOYA 0 olmaz', () => {
    const sales = scenarioSales({ quantity: -1, total: -10_000 });
    const map = accumulateComparisonProducts(sales);
    const boya = map.get('BOYA');
    const total = sumComparisonProducts(map);

    expect(boya).toEqual({ qty: 1, revenue: 10_000 });
    expect(total).toEqual({ qty: 3, revenue: 120_000 });
    expect(boya?.revenue).not.toBe(0);
    expect(total.revenue).not.toBe(140_000);
  });

  it('aynı iade fişi listede iki kez gelse de bir kez düşülür', () => {
    const sales = scenarioSales({ quantity: 1, total: 10_000 });
    const doubled = [...sales, sales[2]];
    const map = accumulateComparisonProducts(doubled);
    const boya = map.get('BOYA');
    const total = sumComparisonProducts(map);

    expect(boya).toEqual({ qty: 1, revenue: 10_000 });
    expect(total.revenue).toBe(120_000);
    expect(boya?.revenue).not.toBe(0);
    expect(total.revenue).not.toBe(110_000);
  });
});
