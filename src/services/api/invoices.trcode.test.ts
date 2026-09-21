/**
 * Regression test: trcode 6 (Alış İade) fiche_type düzeltmesi
 *
 * Skandal: Kullanıcı Alış İade kesti, sistem `fiche_type='purchase_invoice'`
 * olarak yazıyordu (2026-09-01 kasap BADIA — 262,081 IQD). Kök neden
 * `deriveFicheTypeFromTrcode` + `TRCODES_BY_INVOICE_CATEGORY` tablolarında
 * trcode 6 purchase_invoice olarak işaretlenmişti.
 *
 * Bu test hem mapping fonksiyonunu hem de kategori tablosunu kontrol eder.
 */
import { describe, expect, it } from 'vitest';
import {
  deriveFicheTypeFromTrcode,
  excludedSiblingReturnTrcodes,
  TRCODES_BY_INVOICE_CATEGORY,
} from './invoices';

describe('deriveFicheTypeFromTrcode — Logo trcode standartları', () => {
  it('trcode 1 = Alış → purchase_invoice', () => {
    expect(deriveFicheTypeFromTrcode(1)).toBe('purchase_invoice');
  });
  it('trcode 5 = Alış (veresiye) → purchase_invoice', () => {
    expect(deriveFicheTypeFromTrcode(5)).toBe('purchase_invoice');
  });

  // Bug duzeltmesi — kritik
  it('trcode 6 = Alış İade → return_invoice (önceden purchase_invoice idi)', () => {
    expect(deriveFicheTypeFromTrcode(6)).toBe('return_invoice');
  });

  it('trcode 3 = Satış İade → return_invoice', () => {
    expect(deriveFicheTypeFromTrcode(3)).toBe('return_invoice');
  });

  it('trcode 2 = İade → return_invoice', () => {
    expect(deriveFicheTypeFromTrcode(2)).toBe('return_invoice');
  });

  it('trcode 7/8/9 = Satış → sales_invoice', () => {
    expect(deriveFicheTypeFromTrcode(7)).toBe('sales_invoice');
    expect(deriveFicheTypeFromTrcode(8)).toBe('sales_invoice');
    expect(deriveFicheTypeFromTrcode(9)).toBe('sales_invoice');
  });

  it('trcode 10/11/12 = İrsaliye → waybill', () => {
    expect(deriveFicheTypeFromTrcode(10)).toBe('waybill');
    expect(deriveFicheTypeFromTrcode(11)).toBe('waybill');
    expect(deriveFicheTypeFromTrcode(12)).toBe('waybill');
  });

  it('trcode 20/21 = Sipariş → order', () => {
    expect(deriveFicheTypeFromTrcode(20)).toBe('order');
    expect(deriveFicheTypeFromTrcode(21)).toBe('order');
  });
});

describe('TRCODES_BY_INVOICE_CATEGORY — kategori başına trcode listesi', () => {
  it('Alis listesinde trcode 6 OLMAMALI (çift kayıt engellendi)', () => {
    expect(TRCODES_BY_INVOICE_CATEGORY.Alis).not.toContain(6);
  });

  it('Iade listesinde trcode 6 olmalı', () => {
    expect(TRCODES_BY_INVOICE_CATEGORY.Iade).toContain(6);
  });

  it('Iade listesinde trcode 2 ve 3 olmalı', () => {
    expect(TRCODES_BY_INVOICE_CATEGORY.Iade).toContain(2);
    expect(TRCODES_BY_INVOICE_CATEGORY.Iade).toContain(3);
  });

  it('Alis ürün listesinde temel alış trcode 1, 5 olmalı; Alınan Hizmet (4) olmamalı', () => {
    expect(TRCODES_BY_INVOICE_CATEGORY.Alis).toContain(1);
    expect(TRCODES_BY_INVOICE_CATEGORY.Alis).toContain(5);
    expect(TRCODES_BY_INVOICE_CATEGORY.Alis).not.toContain(4);
  });

  it('Satis ürün listesinde Verilen Hizmet (9) olmamalı; Hizmet menüsünde 4 ve 9 olmalı', () => {
    expect(TRCODES_BY_INVOICE_CATEGORY.Satis).not.toContain(9);
    expect(TRCODES_BY_INVOICE_CATEGORY.Satis).toContain(7);
    expect(TRCODES_BY_INVOICE_CATEGORY.Satis).toContain(8);
    expect(TRCODES_BY_INVOICE_CATEGORY.Hizmet).toContain(4);
    expect(TRCODES_BY_INVOICE_CATEGORY.Hizmet).toContain(9);
  });
});

describe('invoiceMatchesModuleCategory — ürün vs hizmet ayrımı', () => {
  it('Alınan Hizmet (trcode 4) Alış listesine uymaz, Hizmet listesine uyar', async () => {
    const { invoiceMatchesModuleCategory } = await import('./invoices');
    const inv = { invoice_type: 4, trcode: 4, invoice_category: 'Hizmet' as const };
    expect(invoiceMatchesModuleCategory(inv, 'Alis')).toBe(false);
    expect(invoiceMatchesModuleCategory(inv, 'Hizmet')).toBe(true);
  });

  it('yanlışlıkla Alis kategorisi yazılmış trcode 4 yine Alış listesine uymaz', async () => {
    const { invoiceMatchesModuleCategory } = await import('./invoices');
    const inv = {
      invoice_type: 4,
      trcode: 4,
      invoice_category: 'Alis' as const,
      fiche_type: 'purchase_invoice',
    };
    expect(invoiceMatchesModuleCategory(inv, 'Alis')).toBe(false);
    expect(invoiceMatchesModuleCategory(inv, 'Hizmet')).toBe(true);
  });

  it('Verilen Hizmet (trcode 9) Satış listesine uymaz', async () => {
    const { invoiceMatchesModuleCategory } = await import('./invoices');
    const inv = { invoice_type: 9, trcode: 9, invoice_category: 'Hizmet' as const };
    expect(invoiceMatchesModuleCategory(inv, 'Satis')).toBe(false);
    expect(invoiceMatchesModuleCategory(inv, 'Hizmet')).toBe(true);
  });

  it('ürün alış (trcode 1) Alış listesine uyar', async () => {
    const { invoiceMatchesModuleCategory } = await import('./invoices');
    const inv = { invoice_type: 1, trcode: 1, invoice_category: 'Alis' as const };
    expect(invoiceMatchesModuleCategory(inv, 'Alis')).toBe(true);
    expect(invoiceMatchesModuleCategory(inv, 'Hizmet')).toBe(false);
  });
});

describe('resolveInvoiceBalanceLedgerTarget — Alınan Hizmet tedarikçi cari', () => {
  it('trcode 4 + Hizmet + veresiye → supplier (müşteri değil)', async () => {
    const { resolveInvoiceBalanceLedgerTarget, invoiceIsPurchaseLedgerSide } = await import('./invoices');
    const inv = {
      invoice_category: 'Hizmet',
      invoice_type: 4,
      total_amount: 10000,
      payment_method: 'credit',
      customer_id: '00000000-0000-4000-a000-000000000099',
    } as any;
    expect(invoiceIsPurchaseLedgerSide(inv)).toBe(true);
    expect(resolveInvoiceBalanceLedgerTarget(inv, 'credit')).toBe('supplier');
    expect(resolveInvoiceBalanceLedgerTarget(inv, 'veresiye')).toBe('supplier');
  });

  it('trcode 9 + Hizmet + veresiye → customer (verilen hizmet)', async () => {
    const { resolveInvoiceBalanceLedgerTarget, invoiceIsPurchaseLedgerSide } = await import('./invoices');
    const inv = {
      invoice_category: 'Hizmet',
      invoice_type: 9,
      total_amount: 10000,
      payment_method: 'credit',
    } as any;
    expect(invoiceIsPurchaseLedgerSide(inv)).toBe(false);
    expect(resolveInvoiceBalanceLedgerTarget(inv, 'credit')).toBe('customer');
  });

  it('peşin alınan hizmet → none (kasa, cari borç yok)', async () => {
    const { resolveInvoiceBalanceLedgerTarget } = await import('./invoices');
    const inv = {
      invoice_category: 'Hizmet',
      invoice_type: 4,
      total_amount: 10000,
      payment_method: 'cash',
    } as any;
    expect(resolveInvoiceBalanceLedgerTarget(inv, 'cash')).toBe('none');
  });
});

describe('excludedSiblingReturnTrcodes — satış/alış iade ayrımı', () => {
  it('invoiceType 3 (satış iade) alış iade trcode 6 hariç tutar', () => {
    expect(excludedSiblingReturnTrcodes(3)).toEqual([6]);
  });

  it('invoiceType 6 (alış iade) satış iade 2/3 hariç tutar', () => {
    expect(excludedSiblingReturnTrcodes(6)).toEqual([2, 3]);
  });

  it('invoiceType 2 genel iade 3 ve 6 hariç tutar', () => {
    expect(excludedSiblingReturnTrcodes(2)).toEqual([3, 6]);
  });

  it('satış/alış dışı tipte boş', () => {
    expect(excludedSiblingReturnTrcodes(8)).toEqual([]);
    expect(excludedSiblingReturnTrcodes(1)).toEqual([]);
  });
});
