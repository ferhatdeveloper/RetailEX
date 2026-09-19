import { describe, expect, it } from 'vitest';
import {
  classifyInvoiceLineMix,
  invoiceLineMixFromItemTypes,
  invoiceLineMixLabelKey,
} from './invoiceLineMix';

describe('invoiceLineMix', () => {
  it('karma: hem ürün hem hizmet satırı', () => {
    expect(invoiceLineMixFromItemTypes(['Malzeme', 'Hizmet'])).toBe('mixed');
    expect(invoiceLineMixFromItemTypes(['product', 'service'])).toBe('mixed');
  });

  it('yalnız hizmet', () => {
    expect(invoiceLineMixFromItemTypes(['Hizmet', 'package'])).toBe('service');
  });

  it('yalnız ürün; promosyon/indirim yok sayılır', () => {
    expect(invoiceLineMixFromItemTypes(['Malzeme', 'Promosyon', 'İndirim'])).toBe('product');
  });

  it('satır yoksa verilen hizmet trcode 9 → hizmet', () => {
    expect(
      classifyInvoiceLineMix({ invoiceType: 9, invoiceCategory: 'Satis' }),
    ).toBe('service');
  });

  it('satır yoksa perakende 7 → ürün', () => {
    expect(classifyInvoiceLineMix({ invoiceType: 7 })).toBe('product');
  });

  it('etiket anahtarları', () => {
    expect(invoiceLineMixLabelKey('mixed')).toBe('lineMixMixed');
    expect(invoiceLineMixLabelKey('product')).toBe('product');
    expect(invoiceLineMixLabelKey('service')).toBe('service');
  });
});
