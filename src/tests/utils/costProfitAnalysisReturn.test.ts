/**
 * Maliyet ve Karlılık Analizi — SABUN satış iadesi.
 * Satış 5 adet, ciro 59.000, birim alış 5.000 → SMM 25.000.
 * İade satırında kod boş ve SMM 0 kalmaz.
 * İade SMM, satış satırının 25.000'inden düşülmez.
 */
import { describe, expect, it } from 'vitest';
import { productGrossProfitMarginPct } from '../../utils/productGrossProfitMargin';
import {
  buildCostProfitRows,
  finishCostProfitRows,
  type CostProfitAggLine,
} from '../../utils/layeredInventoryCost';
import type { ProductGrossProfitUnitRef } from '../../utils/productGrossProfitCost';

const UNIT = 5_000;

function line(over: Partial<CostProfitAggLine>): CostProfitAggLine {
  return {
    productId: '',
    productCode: '',
    productName: 'SABUN',
    quantity: 0,
    revenue: 0,
    fallbackCogs: 0,
    lineKind: 'product',
    ...over,
  };
}

function unitOf(ref: ProductGrossProfitUnitRef): number {
  if (ref.productId === 'sabun-id' || ref.productCode === '0000001') return UNIT;
  if (ref.productId === 'b' || ref.productCode === '0000002') return 6_000;
  return 0;
}

const sabunCard = { id: 'sabun-id', code: '0000001', name: 'SABUN' };

describe('maliyet ve karlılık SABUN iade satırı', () => {
  it('iade kodu 0000001, SMM −5.000, brüt kâr −10.000; toplam SMM 20.000, brüt kâr 24.000', () => {
    const built = buildCostProfitRows(
      [
        line({
          productId: 'sabun-id',
          productCode: '0000001',
          quantity: 5,
          revenue: 59_000,
          purchaseUnitCost: UNIT,
        }),
        line({
          productId: '',
          productCode: '—',
          quantity: -1,
          revenue: -15_000,
          fallbackCogs: 0,
        }),
      ],
      new Map(),
    );
    const rows = finishCostProfitRows(built, { cards: [sabunCard], unitOf });
    expect(rows).toHaveLength(2);

    const sale = rows.find((row) => row.quantity > 0);
    const returned = rows.find((row) => row.quantity < 0);
    expect(sale?.productCode).toBe('0000001');
    expect(sale?.quantity).toBe(5);
    expect(sale?.revenue).toBe(59_000);
    expect(sale?.cogs).toBe(25_000);
    expect(sale?.profit).toBe(34_000);
    expect(sale?.cogs).not.toBe(20_000);

    expect(returned?.productCode).toBe('0000001');
    expect(returned?.quantity).toBe(-1);
    expect(returned?.revenue).toBe(-15_000);
    expect(returned?.cogs).toBe(-5_000);
    expect(returned?.cogs).not.toBe(0);
    expect(returned?.profit).toBe(-10_000);
    expect(returned?.profit).toBe((returned?.revenue || 0) - (returned?.cogs || 0));
    expect(returned?.costSource).toBe('inventory_purchase');

    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const cogs = rows.reduce((sum, row) => sum + row.cogs, 0);
    const profit = rows.reduce((sum, row) => sum + row.profit, 0);
    expect(quantity).toBe(4);
    expect(revenue).toBe(44_000);
    expect(cogs).toBe(20_000);
    expect(profit).toBe(24_000);
    expect(profit).toBe(revenue - cogs);
    const margin = productGrossProfitMarginPct(revenue, profit);
    expect(margin).toBe(54.55);
    expect(margin).toBe(productGrossProfitMarginPct(44_000, 24_000));
    const summedMargins = rows.reduce((sum, row) => sum + row.marginPercent, 0);
    expect(summedMargins).not.toBe(margin);
  });

  it('kod boşken tek SABUN kartından kod gelir; kart yokken satış kodu kopyalanmaz', () => {
    const alone = finishCostProfitRows(
      buildCostProfitRows(
        [line({ productCode: '—', productName: 'SABUN', quantity: -1, revenue: -15_000 })],
        new Map(),
      ),
      {
        cards: [{ id: 'sabun-id', code: '0000001', name: 'Sabun' }],
        unitOf,
      },
    );
    expect(alone[0].productCode).toBe('0000001');
    expect(alone[0].cogs).toBe(-5_000);
    expect(alone[0].profit).toBe(-10_000);

    const noCard = finishCostProfitRows(
      buildCostProfitRows(
        [
          line({
            productId: 'sabun-id',
            productCode: '0000001',
            quantity: 5,
            revenue: 59_000,
            purchaseUnitCost: UNIT,
          }),
          line({ productCode: '', quantity: -1, revenue: -15_000 }),
        ],
        new Map(),
      ),
      { cards: [], unitOf },
    );
    const returned = noCard.find((row) => row.quantity < 0);
    expect(returned?.productCode).toBe('');
    expect(returned?.cogs).toBe(-5_000);
    expect(returned?.profit).toBe(-10_000);
  });

  it('iki ayrı kart aynı addaysa kod ve maliyet uydurulmaz', () => {
    const rows = finishCostProfitRows(
      buildCostProfitRows(
        [
          line({
            productId: 'sabun-id',
            productCode: '0000001',
            quantity: 5,
            revenue: 59_000,
            purchaseUnitCost: UNIT,
          }),
          line({
            productId: 'b',
            productCode: '0000002',
            quantity: 1,
            revenue: 10_000,
            purchaseUnitCost: 6_000,
          }),
          line({ productCode: '—', quantity: -1, revenue: -15_000 }),
        ],
        new Map(),
      ),
      {
        cards: [
          sabunCard,
          { id: 'b', code: '0000002', name: 'SABUN' },
        ],
        unitOf,
      },
    );
    const returned = rows.find((row) => row.quantity < 0);
    expect(returned?.productCode).toBe('—');
    expect(returned?.cogs).toBe(0);
    expect(returned?.profit).toBe(-15_000);
    expect(rows.find((row) => row.productId === 'sabun-id')?.cogs).toBe(25_000);
    expect(rows.find((row) => row.productId === 'b')?.cogs).toBe(6_000);
  });

  it('alış birimi yoksa iade SMM 0 kalır; kod yine tek karttan gelir', () => {
    const rows = finishCostProfitRows(
      buildCostProfitRows(
        [line({ productCode: '—', quantity: -1, revenue: -15_000 })],
        new Map(),
      ),
      { cards: [sabunCard], unitOf: () => 0 },
    );
    expect(rows[0].productCode).toBe('0000001');
    expect(rows[0].cogs).toBe(0);
    expect(rows[0].profit).toBe(-15_000);
  });

  it('hizmet satırının kodu ve maliyeti malzeme kartından yazılmaz', () => {
    const rows = finishCostProfitRows(
      buildCostProfitRows(
        [
          line({
            lineKind: 'service',
            productCode: '—',
            productName: 'SABUN',
            quantity: -1,
            revenue: -15_000,
            fallbackCogs: -3_000,
          }),
        ],
        new Map(),
      ),
      { cards: [sabunCard], unitOf },
    );
    expect(rows[0].productCode).toBe('—');
    expect(rows[0].cogs).toBe(-3_000);
    expect(rows[0].lineKind).toBe('service');
  });

  it('aynı kartın ikinci adı iki kart sayılmaz', () => {
    const rows = finishCostProfitRows(
      buildCostProfitRows(
        [line({ productCode: '—', productName: 'SABUN', quantity: -1, revenue: -15_000 })],
        new Map(),
      ),
      {
        cards: [{ id: 'sabun-id', code: '0000001', name: 'Deterjan', name2: 'SABUN' }],
        unitOf,
      },
    );
    expect(rows[0].productCode).toBe('0000001');
    expect(rows[0].cogs).toBe(-5_000);
  });
});
