/**
 * Ürün Brüt Kârı — SABUN satış iadesi.
 * Alış birim maliyeti 5.000. Satış 5 adet, iade 1 adet.
 * İade maliyeti 0 kalmaz; stoka geri giren malın maliyeti eksi yazılır.
 */
import { describe, expect, it } from 'vitest';
import { aggregateProductGrossProfitTotals } from '../../services/api/erpReports';
import type { ProductGrossProfitRow } from '../../services/api/erpReports';
import { productGrossProfitMarginPct } from '../../utils/productGrossProfitMargin';
import {
  applyProductGrossProfitWeightedCosts,
  productGrossProfitFromWeightedUnit,
  type ProductGrossProfitCostRow,
} from '../../utils/productGrossProfitCost';

const UNIT = 5_000;

function line(over: Partial<ProductGrossProfitCostRow>): ProductGrossProfitCostRow {
  return {
    productId: '',
    productCode: '',
    productName: 'SABUN',
    quantity: 0,
    revenue: 0,
    cost: 0,
    grossProfit: 0,
    marginPct: 0,
    lineKind: 'product',
    ...over,
  };
}

describe('ürün brüt kârı satış iadesi maliyeti', () => {
  it('satış 5 adet, ciro 59.000, birim 5.000 → maliyet 25.000, brüt kâr 34.000', () => {
    const sale = productGrossProfitFromWeightedUnit({
      quantity: 5,
      revenue: 59_000,
      unitCost: UNIT,
    });
    expect(sale.cost).toBe(25_000);
    expect(sale.grossProfit).toBe(34_000);
    expect(sale.marginPct).toBe(57.63);
  });

  it('iade −1 adet, ciro −15.000 → maliyet −5.000, brüt kâr −10.000', () => {
    const returned = productGrossProfitFromWeightedUnit({
      quantity: -1,
      revenue: -15_000,
      unitCost: UNIT,
    });
    expect(returned.cost).toBe(-5_000);
    expect(returned.cost).not.toBe(0);
    expect(returned.grossProfit).toBe(-10_000);
    expect(returned.grossProfit).toBe(-15_000 - returned.cost);
    expect(returned.marginPct).toBe(productGrossProfitMarginPct(-15_000, -10_000));
    expect(returned.marginPct).toBe(66.67);
  });

  it('satış ve iade satırlarının toplamı: miktar 4, ciro 44.000, maliyet 20.000, brüt kâr 24.000', () => {
    const rows = applyProductGrossProfitWeightedCosts(
      [
        line({
          productId: 'sabun-id',
          productCode: '00000001',
          quantity: 5,
          revenue: 59_000,
        }),
        line({
          productId: '',
          productCode: '—',
          quantity: -1,
          revenue: -15_000,
          cost: 0,
          grossProfit: -15_000,
          marginPct: 100,
        }),
      ],
      (ref) => {
        if (ref.productId === 'sabun-id' || ref.productCode === '00000001') return UNIT;
        if (String(ref.productName || '').toLocaleLowerCase('tr-TR') === 'sabun') return UNIT;
        return 0;
      },
    );

    expect(rows[0].cost).toBe(25_000);
    expect(rows[0].grossProfit).toBe(34_000);
    expect(rows[1].quantity).toBe(-1);
    expect(rows[1].revenue).toBe(-15_000);
    expect(rows[1].cost).toBe(-5_000);
    expect(rows[1].grossProfit).toBe(-10_000);

    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const cost = rows.reduce((sum, row) => sum + row.cost, 0);
    const profit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
    expect(quantity).toBe(4);
    expect(revenue).toBe(44_000);
    expect(cost).toBe(20_000);
    expect(profit).toBe(24_000);
    expect(profit).toBe(revenue - cost);

    const cards = aggregateProductGrossProfitTotals(rows as ProductGrossProfitRow[]);
    expect(cards.ciro).toBe(44_000);
    expect(cards.maliyet).toBe(20_000);
    expect(cards.brutKar).toBe(24_000);
    expect(cards.marjPct).toBe(54.55);
    expect(cards.marjPct).toBe(productGrossProfitMarginPct(44_000, 24_000));
  });

  it('kimliksiz iade, kardeş satış satırındaki birim maliyeti alır', () => {
    const rows = applyProductGrossProfitWeightedCosts(
      [
        line({ productId: 'sabun-id', productCode: '00000001', quantity: 5, revenue: 59_000 }),
        line({ productId: '', productCode: '', quantity: -1, revenue: -15_000 }),
      ],
      (ref) => (ref.productId === 'sabun-id' || ref.productCode === '00000001' ? UNIT : 0),
    );
    expect(rows[1].cost).toBe(-5_000);
    expect(rows[1].grossProfit).toBe(-10_000);
  });

  it('birim maliyet yoksa iade maliyeti 0 kalır', () => {
    const alone = productGrossProfitFromWeightedUnit({
      quantity: -1,
      revenue: -15_000,
      unitCost: 0,
    });
    expect(alone.cost).toBe(0);
    expect(alone.grossProfit).toBe(-15_000);

    const rows = applyProductGrossProfitWeightedCosts(
      [
        line({ productId: 'sabun-id', quantity: 5, revenue: 59_000, cost: 0, grossProfit: 59_000 }),
        line({ quantity: -1, revenue: -15_000, cost: 0, grossProfit: -15_000 }),
      ],
      () => 0,
    );
    expect(rows[0].cost).toBe(0);
    expect(rows[1].cost).toBe(0);
    expect(rows[1].grossProfit).toBe(-15_000);
  });

  it('aynı adda iki farklı birim varsa kimliksiz iadeye maliyet uydurulmaz', () => {
    const rows = applyProductGrossProfitWeightedCosts(
      [
        line({ productId: 'a', quantity: 5, revenue: 59_000 }),
        line({ productId: 'b', quantity: 1, revenue: 10_000 }),
        line({ productId: '', productCode: '', quantity: -1, revenue: -15_000 }),
      ],
      (ref) => {
        if (ref.productId === 'a') return 5_000;
        if (ref.productId === 'b') return 6_000;
        return 0;
      },
    );
    expect(rows[0].cost).toBe(25_000);
    expect(rows[1].cost).toBe(6_000);
    expect(rows[2].cost).toBe(0);
    expect(rows[2].grossProfit).toBe(-15_000);
  });

  it('maliyetin işareti miktarın işaretidir; ikinci bir eksi uygulanmaz', () => {
    const purchaseLike = productGrossProfitFromWeightedUnit({
      quantity: 1,
      revenue: 5_000,
      unitCost: UNIT,
    });
    expect(purchaseLike.cost).toBe(5_000);

    const salesReturn = productGrossProfitFromWeightedUnit({
      quantity: -1,
      revenue: -15_000,
      unitCost: UNIT,
    });
    expect(salesReturn.cost).toBe(-5_000);
  });
});
