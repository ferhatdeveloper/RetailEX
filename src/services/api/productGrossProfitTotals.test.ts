/**
 * Dashboard KPI özet toplamları — Ürün Brüt Kârı raporuyla aynı formül.
 * WAC × miktar ile maliyet, satış − iade ile ciro.
 */
import { describe, expect, it } from 'vitest';
import type { ProductGrossProfitRow } from './erpReports';
import { aggregateProductGrossProfitTotals } from './erpReports';

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

describe('aggregateProductGrossProfitTotals (Dashboard KPI)', () => {
  it('iki ürünün ciro / maliyet / brüt kâr toplamı raporla eşleşir', () => {
    // Satış: 10 × 200 = 2000; iade: 2 × 200 = 400
    // WAC = (1000 + 600) / (10 + 6) = 100; maliyet = 100 × 8 (işaretli) = 800
    const rows: ProductGrossProfitRow[] = [
      row({
        productId: 'p1',
        productCode: 'SKU-1',
        productName: 'Sabun',
        quantity: 8,
        revenue: 1600,
        cost: 800,
        grossProfit: 800,
        marginPct: 50,
      }),
      row({
        productId: 'p2',
        productCode: 'SKU-2',
        productName: 'Şampuan',
        quantity: 5,
        revenue: 1000,
        cost: 400,
        grossProfit: 600,
        marginPct: 60,
      }),
    ];
    const t = aggregateProductGrossProfitTotals(rows);
    expect(t.ciro).toBe(2600);
    expect(t.maliyet).toBe(1200);
    expect(t.brutKar).toBe(1400);
    // (1400 / 2600) * 100
    expect(t.marjPct).toBeCloseTo(53.846, 2);
    expect(t.productCount).toBe(2);
    expect(t.profitableProducts).toBe(2);
    expect(t.lossProducts).toBe(0);
    expect(t.topProduct).toBe('SKU-1 - Sabun');
  });

  it('iade negatif işaretli — ciro ve brüt kâr düşer', () => {
    // 1. satır: 100 ciro, 60 maliyet, 40 brüt kâr
    // 2. satır (iade): -40 ciro, -24 maliyet, -16 brüt kâr
    const rows: ProductGrossProfitRow[] = [
      row({
        productId: 'a',
        productCode: 'A',
        productName: 'A ürünü',
        quantity: 5,
        revenue: 100,
        cost: 60,
        grossProfit: 40,
        marginPct: 40,
      }),
      row({
        productId: 'a',
        productCode: 'A',
        productName: 'A ürünü',
        quantity: -2,
        revenue: -40,
        cost: -24,
        grossProfit: -16,
        marginPct: 40,
      }),
    ];
    const t = aggregateProductGrossProfitTotals(rows);
    expect(t.ciro).toBe(60);
    expect(t.maliyet).toBe(36);
    expect(t.brutKar).toBe(24);
    expect(t.marjPct).toBeCloseTo(40, 6);
  });

  it('zarar eden ürünler lossProducts sayılır, topProfit kârlıdır', () => {
    const rows: ProductGrossProfitRow[] = [
      row({
        productId: 'x',
        productCode: 'X',
        productName: 'X',
        revenue: 100,
        cost: 150,
        grossProfit: -50,
      }),
      row({
        productId: 'y',
        productCode: 'Y',
        productName: 'Y',
        revenue: 200,
        cost: 80,
        grossProfit: 120,
      }),
      row({
        productId: 'z',
        productCode: 'Z',
        productName: 'Z',
        revenue: 50,
        cost: 50,
        grossProfit: 0,
      }),
    ];
    const t = aggregateProductGrossProfitTotals(rows);
    expect(t.profitableProducts).toBe(1);
    expect(t.lossProducts).toBe(1);
    expect(t.topProduct).toBe('Y - Y');
  });

  it('boş satır → sıfırlar', () => {
    const t = aggregateProductGrossProfitTotals([]);
    expect(t.ciro).toBe(0);
    expect(t.maliyet).toBe(0);
    expect(t.brutKar).toBe(0);
    expect(t.marjPct).toBe(0);
    expect(t.productCount).toBe(0);
    expect(t.topProduct).toBeNull();
  });

  it('Ciro = 0 ise marj yüzde 0 döner (NaN guard)', () => {
    const rows: ProductGrossProfitRow[] = [
      row({ revenue: 0, cost: 0, grossProfit: 0 }),
    ];
    const t = aggregateProductGrossProfitTotals(rows);
    expect(t.marjPct).toBe(0);
    expect(Number.isFinite(t.marjPct)).toBe(true);
  });
});