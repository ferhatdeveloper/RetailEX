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

  it('Alis listesinde temel alış trcode 1, 4, 5 olmalı', () => {
    expect(TRCODES_BY_INVOICE_CATEGORY.Alis).toContain(1);
    expect(TRCODES_BY_INVOICE_CATEGORY.Alis).toContain(4);
    expect(TRCODES_BY_INVOICE_CATEGORY.Alis).toContain(5);
  });
});