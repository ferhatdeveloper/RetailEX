/**
 * Ürün Brüt Kârı — SABUN: ciro 15.000, maliyet 5.000, brüt kâr 10.000 → marj 66,67.
 * Marj = brüt kâr / net ciro × 100. Dip toplam satır yüzdelerinin toplamı değildir.
 */
import { describe, expect, it } from 'vitest';
import type { ProductGrossProfitRow } from '../../services/api/erpReports';
import { aggregateProductGrossProfitTotals } from '../../services/api/erpReports';
import {
  formatProductGrossProfitMarginPct,
  productGrossProfitMarginPct,
  productGrossProfitMarginPctFromRows,
} from '../../utils/productGrossProfitMargin';

const row = (over: Partial<ProductGrossProfitRow>): ProductGrossProfitRow => ({
  productId: '',
  productCode: '',
  productName: '',
  quantity: 0,
  revenue: 0,
  cost: 0,
  grossProfit: 0,
  marginPct: 0,
  lineKind: 'product',
  ...over,
});

describe('productGrossProfitMarginPct', () => {
  it('15.000 ciro, 5.000 maliyet, 10.000 kâr → 66.67', () => {
    const revenue = 15_000;
    const cost = 5_000;
    const profit = revenue - cost;
    expect(profit).toBe(10_000);
    const margin = productGrossProfitMarginPct(revenue, profit);
    expect(margin).toBe(66.67);
    expect(margin).not.toBe(200);
    expect(margin).not.toBe(66.7);
    expect(margin).not.toBeCloseTo(33.33, 2);
    expect(formatProductGrossProfitMarginPct(margin)).toBe('66,67');
  });

  it('aynı tanım: 114.500 kâr / 120.000 net ciro → 95.42', () => {
    expect(productGrossProfitMarginPct(120_000, 114_500)).toBe(95.42);
  });

  it('ciro 0 ise marj 0, bölme çökmez', () => {
    expect(productGrossProfitMarginPct(0, 10_000)).toBe(0);
    expect(productGrossProfitMarginPct(0, 0)).toBe(0);
    expect(productGrossProfitMarginPct(Number.NaN, 5_000)).toBe(0);
    expect(Number.isFinite(productGrossProfitMarginPct(0, 5_000))).toBe(true);
  });

  it('iki satırın dip toplamı yüzde toplamı değil, ağırlıklı marj', () => {
    const sabun = row({
      productCode: '0000001',
      productName: 'SABUN',
      quantity: 1,
      revenue: 15_000,
      cost: 5_000,
      grossProfit: 10_000,
      marginPct: productGrossProfitMarginPct(15_000, 10_000),
    });
    const diger = row({
      productCode: '0000002',
      productName: 'DİĞER',
      quantity: 1,
      revenue: 3_000,
      cost: 0,
      grossProfit: 3_000,
      marginPct: productGrossProfitMarginPct(3_000, 3_000),
    });
    const yuzdeToplami = sabun.marginPct + diger.marginPct;
    const agirlikli = productGrossProfitMarginPctFromRows([sabun, diger]);
    expect(sabun.marginPct).toBe(66.67);
    expect(diger.marginPct).toBe(100);
    expect(yuzdeToplami).toBeCloseTo(166.67, 2);
    expect(agirlikli).toBe(72.22);
    expect(agirlikli).not.toBeCloseTo(yuzdeToplami, 2);
    expect(agirlikli).toBe(productGrossProfitMarginPct(18_000, 13_000));

    const toplam = aggregateProductGrossProfitTotals([sabun, diger]);
    expect(toplam.ciro).toBe(18_000);
    expect(toplam.maliyet).toBe(5_000);
    expect(toplam.brutKar).toBe(13_000);
    expect(toplam.marjPct).toBe(72.22);
    expect(toplam.marjPct).not.toBe(yuzdeToplami);
  });
});
