import { describe, expect, it } from 'vitest';
import {
  buildExpiryPurchaseReturnInvoice,
  canReturnExpiringPurchase,
  clampExpiryReturnQty,
  expiryReturnLineAmounts,
  isAlreadyReturnDocument,
} from './expiryPurchaseReturn';

const SUPPLIER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PRODUCT = '11111111-2222-3333-4444-555555555555';

describe('canReturnExpiringPurchase', () => {
  it('kaynak alış + tedarikçi UUID ile iade edilebilir', () => {
    expect(
      canReturnExpiringPurchase({
        invoiceId: 'inv-1',
        supplierId: SUPPLIER,
        trcode: 1,
        ficheType: 'purchase_invoice',
      }),
    ).toBe(true);
  });

  it('alış iade belgesinden tekrar iade açılmaz', () => {
    expect(
      canReturnExpiringPurchase({
        invoiceId: 'inv-1',
        supplierId: SUPPLIER,
        trcode: 6,
      }),
    ).toBe(false);
    expect(isAlreadyReturnDocument(6, 'purchase_invoice')).toBe(true);
    expect(isAlreadyReturnDocument(1, 'return_invoice')).toBe(true);
  });

  it('tedarikçi yoksa iade yok', () => {
    expect(canReturnExpiringPurchase({ invoiceId: 'inv-1', trcode: 1 })).toBe(false);
    expect(canReturnExpiringPurchase({ invoiceId: 'inv-1', supplierId: 'Genel', trcode: 1 })).toBe(false);
  });
});

describe('clampExpiryReturnQty / amounts', () => {
  it('miktarı kaynak satırın üstüne çıkarmaz', () => {
    expect(clampExpiryReturnQty(15, 10)).toBe(10);
    expect(clampExpiryReturnQty(0, 10)).toBe(0);
    expect(clampExpiryReturnQty(-1, 10)).toBe(0);
  });

  it('kalan stok 0 ise iade miktarı 0', () => {
    expect(clampExpiryReturnQty(10, 0)).toBe(0);
  });

  it('KDV ve iskonto satır tutarını üretir', () => {
    const a = expiryReturnLineAmounts({ quantity: 10, unitPrice: 100, discountRate: 10, vatRate: 10 });
    expect(a.subtotal).toBe(1000);
    expect(a.discount).toBe(100);
    expect(a.lineNet).toBe(900);
    expect(a.tax).toBe(90);
    expect(a.total).toBe(990);
  });
});

describe('buildExpiryPurchaseReturnInvoice', () => {
  it('trcode 6 alış iade, cari tedarikçi, stok satırı kaynak fiyattan', () => {
    const inv = buildExpiryPurchaseReturnInvoice({
      source: {
        invoiceId: 'src-inv',
        invoiceNo: '283G091878748',
        invoiceDate: '2026-09-18',
        supplierId: SUPPLIER,
        supplierName: 'Genel Tedarikçi',
        itemCode: '41',
        itemName: 'SABUN',
        quantity: 10,
        unit: 'Adet',
        expiryDate: '2026-09-20',
        batchNo: '',
        productId: PRODUCT,
        unitPrice: 2500,
        vatRate: 0,
      },
      quantity: 10,
      firmaId: '001',
      donemId: '01',
    });
    expect(inv.invoice_type).toBe(6);
    expect(inv.invoice_category).toBe('Iade');
    expect(inv.customer_id).toBe(SUPPLIER);
    expect(inv.supplier_id).toBe(SUPPLIER);
    expect(inv.supplier_name).toBe('Genel Tedarikçi');
    expect(inv.payment_method).toBe('Veresiye');
    expect(inv.status).toBe('completed');
    expect(inv.total_amount).toBe(25000);
    expect(inv.items).toHaveLength(1);
    expect(inv.items[0].productId).toBe(PRODUCT);
    expect(inv.items[0].code).toBe('41');
    expect(inv.items[0].quantity).toBe(10);
    expect(inv.items[0].unitPrice).toBe(2500);
    expect(inv.items[0].expiryDate).toBe('2026-09-20');
    expect(String(inv.notes)).toContain('283G091878748');
    expect(String(inv.notes)).toContain('2026-09-20');
  });
});
