import { describe, expect, it } from 'vitest';
import { defaultInvoiceLineTypeFor, isServiceInvoiceType } from '../../utils/invoiceLineType';

describe('isServiceInvoiceType / defaultInvoiceLineTypeFor', () => {
  it('Alınan Hizmet (trcode 4) ve Verilen Hizmet (9) satır türü Hizmet', () => {
    expect(isServiceInvoiceType({ code: 4, category: 'Hizmet' })).toBe(true);
    expect(isServiceInvoiceType({ code: 9, category: 'Hizmet' })).toBe(true);
    expect(defaultInvoiceLineTypeFor({ code: 4, category: 'Hizmet' })).toBe('Hizmet');
    expect(defaultInvoiceLineTypeFor({ code: 9, category: 'Hizmet' })).toBe('Hizmet');
  });

  it('isimden Alınan / Verilen Hizmet Faturası tanır', () => {
    expect(isServiceInvoiceType({ name: 'Alınan Hizmet Faturası' })).toBe(true);
    expect(isServiceInvoiceType({ name: 'Verilen Hizmet Faturası' })).toBe(true);
    expect(defaultInvoiceLineTypeFor({ name: 'Alınan Hizmet Faturası' })).toBe('Hizmet');
  });

  it('alış / satış malzeme faturalarında Malzeme kalır', () => {
    expect(isServiceInvoiceType({ code: 1, category: 'Alis', name: 'Alış Faturası' })).toBe(false);
    expect(isServiceInvoiceType({ code: 0, category: 'Satis', name: 'Satış Faturası' })).toBe(false);
    expect(defaultInvoiceLineTypeFor({ code: 1, category: 'Alis' })).toBe('Malzeme');
    expect(defaultInvoiceLineTypeFor({ code: 0, category: 'Satis' })).toBe('Malzeme');
  });
});
