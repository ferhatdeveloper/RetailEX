/**
 * Kar-Zarar — SABUN satış iadesi.
 * Alış birim maliyeti 5.000. Satış 5 adet. İade 1 adet, ciro 15.000.
 * İade SMM 0 kalmaz. Satış satırının 25.000'i düşülmez.
 */
import { describe, expect, it } from 'vitest';
import { productGrossProfitMarginPct } from '../../utils/productGrossProfitMargin';
import {
  mapProfitLossAnalysisRows,
  sumProfitLossAnalysis,
  type ProfitLossSourceLine,
} from '../../utils/profitLossRows';

const UNIT = 5_000;

function soap(over: Partial<ProfitLossSourceLine>): ProfitLossSourceLine {
  return {
    invoiceId: 'satis',
    invoiceNet: 59_000,
    ficheType: 'sales_invoice',
    trcode: 8,
    productId: 'sabun-id',
    productCode: '0000001',
    productName: 'SABUN',
    lineKind: 'product',
    lineType: 'Malzeme',
    quantity: 5,
    total: 59_000,
    cost: 0,
    ...over,
  };
}

function unitOf(ref: { productId?: string; productCode?: string }): number {
  if (ref.productId === 'sabun-id' || ref.productCode === '0000001') return UNIT;
  if (ref.productId === 'b') return 6_000;
  return 0;
}

describe('kar-zarar SABUN iade satırı', () => {
  it('iade SMM −5.000 ve brüt kâr −10.000; toplam SMM 20.000, brüt kâr 24.000', () => {
    const rows = mapProfitLossAnalysisRows(
      [
        soap({}),
        soap({
          invoiceId: 'iade',
          invoiceNet: -15_000,
          ficheType: 'return_invoice',
          trcode: 3,
          productId: '',
          productCode: '—',
          quantity: -1,
          total: -15_000,
          cost: 0,
        }),
      ],
      { reportType: 'product', unitOf },
    );
    const sale = rows.find((row) => row.quantity > 0);
    const returned = rows.find((row) => row.quantity < 0);
    expect(sale?.cost).toBe(25_000);
    expect(sale?.profit).toBe(34_000);
    expect(sale?.revenue).toBe(59_000);
    expect(returned?.returnAmount).toBe(15_000);
    expect(returned?.revenue).toBe(-15_000);
    expect(returned?.cost).toBe(-5_000);
    expect(returned?.cost).not.toBe(0);
    expect(returned?.profit).toBe(-10_000);
    expect(returned?.profit).toBe((returned?.revenue || 0) - (returned?.cost || 0));
    expect(returned?.profitMargin).toBe(productGrossProfitMarginPct(-15_000, -10_000));

    const totals = sumProfitLossAnalysis(rows);
    expect(totals.quantity).toBe(4);
    expect(totals.cost).toBe(20_000);
    expect(totals.profit).toBe(24_000);
    expect(totals.profit).toBe(totals.revenue - totals.cost);
    expect(totals.revenue).toBe(44_000);
    expect(totals.marginPct).toBe(productGrossProfitMarginPct(44_000, 24_000));
    expect(totals.marginPct).toBe(54.55);
  });

  it('aynı iade brüte ve iade kolonuna iki kez girdiyse brüt 59.000, iade 15.000', () => {
    const rows = mapProfitLossAnalysisRows(
      [
        soap({ invoiceNet: 74_000, total: 74_000, quantity: 5 }),
        soap({
          invoiceNet: 74_000,
          quantity: 0,
          total: -15_000,
          cost: 0,
        }),
        soap({
          invoiceId: 'iade',
          invoiceNet: -15_000,
          ficheType: 'return_invoice',
          trcode: 3,
          productId: '',
          productCode: '—',
          quantity: -1,
          total: -15_000,
          cost: 0,
        }),
      ],
      { reportType: 'product', unitOf },
    );
    const sale = rows.find((row) => row.quantity > 0);
    const returned = rows.find((row) => row.quantity < 0);
    expect(sale?.quantity).toBe(5);
    expect(sale?.grossRevenue).toBe(59_000);
    expect(sale?.returnAmount).toBe(0);
    expect(sale?.revenue).toBe(59_000);
    expect(sale?.cost).toBe(25_000);
    expect(sale?.profit).toBe(34_000);
    expect(returned?.quantity).toBe(-1);
    expect(returned?.cost).toBe(-5_000);
    expect(returned?.profit).toBe(-10_000);

    const totals = sumProfitLossAnalysis(rows);
    expect(totals.grossRevenue).toBe(59_000);
    expect(totals.returnAmount).toBe(15_000);
    expect(totals.revenue).toBe(44_000);
    expect(totals.cost).toBe(20_000);
    expect(totals.profit).toBe(24_000);
    expect(totals.grossRevenue).not.toBe(74_000);
    expect(totals.returnAmount).not.toBe(30_000);
  });

  it('aynı iade fişinin kodsuz kopyası da brütten bir kez düşülür', () => {
    const rows = mapProfitLossAnalysisRows(
      [
        soap({ invoiceId: 'satis', invoiceNet: 74_000, total: 74_000 }),
        soap({
          invoiceId: 'iade',
          invoiceNet: -15_000,
          ficheType: 'return_invoice',
          trcode: 3,
          quantity: 0,
          total: -15_000,
        }),
        soap({
          invoiceId: 'iade',
          invoiceNet: -15_000,
          ficheType: 'return_invoice',
          trcode: 3,
          productId: '',
          productCode: '—',
          quantity: -1,
          total: -15_000,
        }),
      ],
      { reportType: 'product', unitOf },
    );
    const totals = sumProfitLossAnalysis(rows);
    expect(totals.grossRevenue).toBe(59_000);
    expect(totals.returnAmount).toBe(15_000);
    expect(totals.revenue).toBe(44_000);
    expect(totals.cost).toBe(20_000);
    expect(totals.profit).toBe(24_000);
  });

  it('iki ayrı miktarlı iade fişi düşürülmez', () => {
    const rows = mapProfitLossAnalysisRows(
      [
        soap({ invoiceNet: 74_000, total: 74_000 }),
        soap({
          invoiceId: 'iade-1',
          invoiceNet: -15_000,
          ficheType: 'return_invoice',
          trcode: 3,
          productId: '',
          productCode: '—',
          quantity: -1,
          total: -15_000,
        }),
        soap({
          invoiceId: 'iade-2',
          invoiceNet: -15_000,
          ficheType: 'return_invoice',
          trcode: 3,
          productId: '',
          productCode: '—',
          quantity: -1,
          total: -15_000,
        }),
      ],
      { reportType: 'product', unitOf },
    );
    const totals = sumProfitLossAnalysis(rows);
    expect(totals.grossRevenue).toBe(74_000);
    expect(totals.returnAmount).toBe(30_000);
    expect(totals.revenue).toBe(44_000);
    expect(totals.quantity).toBe(3);
    expect(totals.grossRevenue).not.toBe(59_000);
    expect(totals.returnAmount).not.toBe(15_000);
  });

  it('alış iadesi satış iadesine ve SMM’ye yazılmaz', () => {
    const rows = mapProfitLossAnalysisRows(
      [
        soap({}),
        soap({
          invoiceId: 'alis-iade',
          invoiceNet: -15_000,
          ficheType: 'return_invoice',
          trcode: 6,
          productId: '',
          productCode: '—',
          quantity: -1,
          total: -15_000,
          cost: 0,
        }),
      ],
      { reportType: 'product', unitOf },
    );
    const totals = sumProfitLossAnalysis(rows);
    expect(rows).toHaveLength(1);
    expect(totals.grossRevenue).toBe(59_000);
    expect(totals.returnAmount).toBe(0);
    expect(totals.revenue).toBe(59_000);
    expect(totals.cost).toBe(25_000);
    expect(totals.profit).toBe(34_000);
  });

  it('aynı adda iki birim varsa kodsuz iade maliyeti 0 kalır', () => {
    const rows = mapProfitLossAnalysisRows(
      [
        soap({ productId: 'sabun-id', quantity: 5, total: 59_000 }),
        soap({ productId: 'b', productCode: '0000002', quantity: 1, total: 10_000, cost: 0 }),
        soap({
          invoiceId: 'iade',
          invoiceNet: -15_000,
          ficheType: 'return_invoice',
          trcode: 3,
          productId: '',
          productCode: '',
          quantity: -1,
          total: -15_000,
        }),
      ],
      { reportType: 'product', unitOf },
    );
    const returned = rows.find((row) => row.quantity < 0);
    expect(returned?.cost).toBe(0);
    expect(returned?.profit).toBe(-15_000);
    expect(rows.find((row) => row.productId === 'sabun-id')?.cost).toBe(25_000);
    expect(rows.find((row) => row.productId === 'b')?.cost).toBe(6_000);
  });
});
