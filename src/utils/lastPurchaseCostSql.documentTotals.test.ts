import { describe, expect, it } from 'vitest';
import {
  isPlSalesOrReturnFiche,
  isPurchaseFiche,
  isSalesReturnFiche,
  PURCHASE_RETURN_TRCODE,
  scaleLineRevenueToInvoiceNet,
} from './lastPurchaseCostSql';

/** Ürün listesi Satış/Alış toplamı — belge sınıfları (rapor işaretleri ile aynı). */
describe('product list document money fiche kinds', () => {
  it('satış ve hizmet satış satış tarafındadır', () => {
    expect(isPlSalesOrReturnFiche({ fiche_type: 'sales_invoice', trcode: 8 })).toBe(true);
    expect(isPlSalesOrReturnFiche({ fiche_type: 'service', trcode: 9 })).toBe(true);
    expect(isPlSalesOrReturnFiche({ fiche_type: 'hizmet', trcode: 9 })).toBe(true);
    expect(isPurchaseFiche({ fiche_type: 'sales_invoice', trcode: 8 })).toBe(false);
  });

  it('satış iade satış toplamından düşülür, alışa karışmaz', () => {
    expect(isSalesReturnFiche({ fiche_type: 'return_invoice', trcode: 2 })).toBe(true);
    expect(isPlSalesOrReturnFiche({ fiche_type: 'return_invoice', trcode: 3 })).toBe(true);
    expect(isPurchaseFiche({ fiche_type: 'return_invoice', trcode: 2 })).toBe(false);
  });

  it('alış alış toplamına girer; alış iade (trcode 6) alış değildir', () => {
    expect(isPurchaseFiche({ fiche_type: 'purchase_invoice', trcode: 1 })).toBe(true);
    expect(isPurchaseFiche({ fiche_type: 'purchase_invoice', trcode: PURCHASE_RETURN_TRCODE })).toBe(false);
    expect(isPlSalesOrReturnFiche({ fiche_type: 'purchase_invoice', trcode: 1 })).toBe(false);
    expect(isPlSalesOrReturnFiche({ fiche_type: 'return_invoice', trcode: PURCHASE_RETURN_TRCODE })).toBe(false);
  });
});

/** Dip indirim: kâr marjı % ölçekli fatura neti (satış) üzerinden. */
describe('scaleLineRevenueToInvoiceNet', () => {
  it('satır toplamı fatura netine eşitse satır neti değişmez', () => {
    expect(scaleLineRevenueToInvoiceNet(100, 100, 100)).toBe(100);
  });

  it('dip indirimde satır ciro oransal küçülür', () => {
    expect(scaleLineRevenueToInvoiceNet(60, 100, 80)).toBeCloseTo(48, 6);
  });

  it('marj % ölçekli ciroya göre hesaplanır (ham satır neti değil)', () => {
    const scaledRevenue = scaleLineRevenueToInvoiceNet(100, 100, 80);
    const cost = 40;
    const marginPct = ((scaledRevenue - cost) / scaledRevenue) * 100;
    expect(scaledRevenue).toBeCloseTo(80, 6);
    expect(marginPct).toBeCloseTo(50, 6);
  });
});
