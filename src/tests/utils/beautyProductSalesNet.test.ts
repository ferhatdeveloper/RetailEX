import { describe, expect, it } from 'vitest';
import {
  netBeautyProductSaleRows,
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
  it('2 adet × 10.000 satış ve 1 adet × 10.000 iade → tek satır, miktar 1, tutar 10.000', () => {
    const sale = {
      ...boyaSale(),
      unitPrice: 10_000,
      customerName: 'FERDİN BEY',
      staffName: 'System Administrator',
      paymentMethod: 'cash',
    };
    const snapshot = { ...sale };
    const applied = planBeautyProductReturns([sale], [productReturn({
      cashier: 'admin',
      paymentMethod: 'veresiye',
      customerName: '',
    })]);
    const net = netBeautyProductSaleRows([sale], [productReturn({
      cashier: 'admin',
      paymentMethod: 'veresiye',
      customerName: '',
    })]);

    expect(sale).toEqual(snapshot);
    expect(applied).toHaveLength(1);
    expect(applied[0].quantity).toBe(-1);
    expect(applied[0].total).toBe(-10_000);
    expect(net).toHaveLength(1);
    expect(net[0].quantity).toBe(1);
    expect(net[0].total).toBe(10_000);
    expect(net[0].unitPrice).toBe(10_000);
    expect(net[0].customerName).toBe('FERDİN BEY');
    expect(net[0].staffName).toBe('System Administrator');
    expect(net[0].paymentMethod).toBe('cash');
    expect(net[0].productCode).toBe('0000001');
    expect(net[0].productName).toBe('BOYA');

    const summary = summarizeBeautyProductSales([
      { saleId: 'sale-1', quantity: net[0].quantity, total: net[0].total, isReturn: false },
    ]);
    expect(summary.totalQty).toBe(1);
    expect(summary.totalRevenue).toBe(10_000);
    expect(summary.transactionCount).toBe(1);
    expect(summary.lineCount).toBe(1);
  });

  it('aynı iade satırı ikinci kez düşülmez (10.000 ikinci kez inip 0 olmaz)', () => {
    const net = netBeautyProductSaleRows(
      [boyaSale()],
      [productReturn(), productReturn({ saleId: 'return-sale-dup' })],
    );
    expect(net).toHaveLength(1);
    expect(net[0].quantity).toBe(1);
    expect(net[0].total).toBe(10_000);
  });

  it('veritabanında eksi yazılmış iade de bir kez düşülür', () => {
    const net = netBeautyProductSaleRows(
      [boyaSale()],
      [productReturn({ quantity: -1, unitPrice: 10_000, netAmount: -10_000, totalAmount: -10_000 })],
    );
    expect(net).toHaveLength(1);
    expect(net[0].quantity).toBe(1);
    expect(net[0].total).toBe(10_000);
  });

  it('depozito 20.000 ve hizmet iadesi ürün cirosundan düşmez', () => {
    const net = netBeautyProductSaleRows(
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
    expect(net).toHaveLength(1);
    expect(net[0].quantity).toBe(1);
    expect(net[0].total).toBe(10_000);
  });

  it('başka ürünün iadesi BOYA satırına yazılmaz', () => {
    const sabun: BeautyProductSaleNetInput = {
      productId: '22222222-2222-4222-8222-222222222222',
      productName: 'SABUN',
      productCode: '0000099',
      productBarcode: '',
      categoryName: '—',
      subCategoryName: '—',
      quantity: 1,
      total: 5_000,
    };
    const net = netBeautyProductSaleRows(
      [boyaSale(), sabun],
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
    expect(net).toHaveLength(2);
    expect(net[0].productCode).toBe('0000001');
    expect(net[0].quantity).toBe(2);
    expect(net[0].total).toBe(20_000);
    expect(net[1].productCode).toBe('0000099');
    expect(net[1].quantity).toBe(0);
    expect(net[1].total).toBe(0);
  });

  it('farklı ürün ayrı satır kalır, BOYA iadesi SABUN satırına yazılmaz', () => {
    const sabun: BeautyProductSaleNetInput = {
      productId: '22222222-2222-4222-8222-222222222222',
      productName: 'SABUN',
      productCode: '0000099',
      productBarcode: '',
      categoryName: '—',
      subCategoryName: '—',
      quantity: 1,
      total: 5_000,
    };
    const net = netBeautyProductSaleRows([boyaSale(), sabun], [productReturn()]);
    expect(net).toHaveLength(2);
    expect(net[0].productName).toBe('BOYA');
    expect(net[0].quantity).toBe(1);
    expect(net[0].total).toBe(10_000);
    expect(net[1].productName).toBe('SABUN');
    expect(net[1].quantity).toBe(1);
    expect(net[1].total).toBe(5_000);
  });

  it('alış iadesi satıştan düşülmez', () => {
    const net = netBeautyProductSaleRows(
      [boyaSale()],
      [productReturn({ trcode: 6, ficheType: 'return_invoice', lineId: 'purchase-return' })],
    );
    expect(net).toHaveLength(1);
    expect(net[0].quantity).toBe(2);
    expect(net[0].total).toBe(20_000);
  });

  it('ürün kodu ile eşleşen iade aynı satırdan düşülür', () => {
    const net = netBeautyProductSaleRows(
      [boyaSale()],
      [productReturn({ productId: '', itemCode: '0000001', itemName: '' })],
    );
    expect(net).toHaveLength(1);
    expect(net[0].quantity).toBe(1);
    expect(net[0].total).toBe(10_000);
    expect(net[0].productCode).toBe('0000001');
    expect(net[0].productId).toBe(BOYA_ID);
  });
});
