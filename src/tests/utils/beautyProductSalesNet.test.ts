import { describe, expect, it } from 'vitest';
import {
  planBeautyProductReturns,
  summarizeBeautyProductSales,
  type BeautyProductReturnLine,
  type BeautyProductSaleNetInput,
} from '../../utils/beautyProductSalesNet';

const BOYA_ID = '11111111-1111-4111-8111-111111111111';

function boyaSale(qty = 2, total = 20_000): BeautyProductSaleNetInput {
  return {
    productId: BOYA_ID,
    productName: 'BOYA',
    productCode: '0000001',
    productBarcode: '',
    categoryName: '—',
    subCategoryName: '—',
    quantity: qty,
    total,
  };
}

function productReturn(overrides: Partial<BeautyProductReturnLine> = {}): BeautyProductReturnLine {
  return {
    saleId: 'return-sale-1',
    lineId: 'return-line-1',
    ficheNo: 'IAD-1',
    date: '2026-10-20',
    customerName: 'FERDİN BEY',
    paymentMethod: 'cash',
    cashier: 'System Administrator',
    trcode: 3,
    ficheType: 'return_invoice',
    productId: BOYA_ID,
    itemCode: '0000001',
    itemName: 'BOYA',
    itemType: 'Malzeme',
    quantity: 1,
    unitPrice: 10_000,
    netAmount: 10_000,
    totalAmount: 10_000,
    ...overrides,
  };
}

describe('Güzellik ürün satış — iade netleştirmesi', () => {
  it('2 adet × 10.000 satış ve 1 adet × 10.000 iade → net miktar 1, net tutar 10.000', () => {
    const sale = boyaSale();
    const snapshot = { ...sale };
    const applied = planBeautyProductReturns([sale], [productReturn()]);

    expect(sale).toEqual(snapshot);
    expect(applied).toHaveLength(1);
    expect(applied[0].quantity).toBe(-1);
    expect(applied[0].total).toBe(-10_000);
    expect(applied[0].unitPrice).toBe(10_000);

    const summary = summarizeBeautyProductSales([
      { saleId: 'sale-1', quantity: sale.quantity, total: sale.total, isReturn: false },
      {
        saleId: applied[0].saleId,
        quantity: applied[0].quantity,
        total: applied[0].total,
        isReturn: true,
      },
    ]);
    expect(summary.totalQty).toBe(1);
    expect(summary.totalRevenue).toBe(10_000);
    expect(summary.transactionCount).toBe(1);
    expect(summary.lineCount).toBe(2);
  });

  it('aynı iade satırı ikinci kez düşülmez (20.000 − 10.000 − 10.000 olmaz)', () => {
    const applied = planBeautyProductReturns(
      [boyaSale()],
      [productReturn(), productReturn({ saleId: 'return-sale-dup' })],
    );
    expect(applied).toHaveLength(1);
    const netQty = 2 + applied.reduce((sum, row) => sum + row.quantity, 0);
    const netTotal = 20_000 + applied.reduce((sum, row) => sum + row.total, 0);
    expect(netQty).toBe(1);
    expect(netTotal).toBe(10_000);
  });

  it('veritabanında eksi yazılmış iade de bir kez düşülür', () => {
    const applied = planBeautyProductReturns(
      [boyaSale()],
      [productReturn({ quantity: -1, unitPrice: 10_000, netAmount: -10_000, totalAmount: -10_000 })],
    );
    expect(applied).toHaveLength(1);
    expect(applied[0].quantity).toBe(-1);
    expect(applied[0].total).toBe(-10_000);
    expect(2 + applied[0].quantity).toBe(1);
    expect(20_000 + applied[0].total).toBe(10_000);
  });

  it('depozito 20.000 ve hizmet iadesi ürün cirosundan düşmez', () => {
    const applied = planBeautyProductReturns(
      [boyaSale()],
      [
        productReturn({
          lineId: 'deposit-line',
          itemType: 'deposit',
          itemName: 'Peşinat',
          itemCode: 'deposit',
          productId: '',
          quantity: 1,
          unitPrice: 20_000,
          netAmount: 20_000,
          totalAmount: 20_000,
        }),
        productReturn({
          lineId: 'service-line',
          itemType: 'Hizmet',
          itemName: 'Kesim',
          itemCode: '',
          productId: '',
          quantity: 1,
          unitPrice: 50_000,
          netAmount: 50_000,
          totalAmount: 50_000,
        }),
        productReturn(),
      ],
    );
    expect(applied).toHaveLength(1);
    expect(applied[0].total).toBe(-10_000);
    expect(20_000 + applied[0].total).toBe(10_000);
  });

  it('başka ürünün iadesi BOYA satırına yazılmaz', () => {
    const applied = planBeautyProductReturns(
      [boyaSale()],
      [
        productReturn({
          lineId: 'other-product',
          productId: '22222222-2222-4222-8222-222222222222',
          itemCode: '0000099',
          itemName: 'SABUN',
          quantity: 1,
          unitPrice: 5_000,
          netAmount: 5_000,
          totalAmount: 5_000,
        }),
      ],
    );
    expect(applied).toHaveLength(0);
    const summary = summarizeBeautyProductSales([
      { saleId: 'sale-1', quantity: 2, total: 20_000, isReturn: false },
    ]);
    expect(summary.totalQty).toBe(2);
    expect(summary.totalRevenue).toBe(20_000);
  });

  it('alış iadesi satıştan düşülmez', () => {
    const applied = planBeautyProductReturns(
      [boyaSale()],
      [productReturn({ trcode: 6, ficheType: 'return_invoice', lineId: 'purchase-return' })],
    );
    expect(applied).toHaveLength(0);
  });

  it('ürün kodu ile eşleşen iade, kod karttaysa düşülür', () => {
    const applied = planBeautyProductReturns(
      [boyaSale()],
      [productReturn({ productId: '', itemCode: '0000001', itemName: '' })],
    );
    expect(applied).toHaveLength(1);
    expect(applied[0].quantity).toBe(-1);
    expect(applied[0].productCode).toBe('0000001');
    expect(applied[0].productId).toBe(BOYA_ID);
  });
});
