/**
 * Fatura listesi maliyet ve kâr.
 * Hizmet: kart birim maliyeti × miktar. Ürün: kayıtlı stok maliyeti.
 * Kâr = net − maliyet. Marj = kâr / net.
 */
import { describe, expect, it } from 'vitest';
import {
  invoiceListDisplayedCost,
  invoiceListDisplayedMargin,
  invoiceListDisplayedProfit,
  serviceCardUnitCost,
  serviceLineCardCost,
} from '../../utils/invoiceListEconomics';
import type { InvoiceListEconomicsSource } from '../../utils/invoiceListEconomics';

function sale(partial: InvoiceListEconomicsSource): InvoiceListEconomicsSource {
  return {
    invoice_category: 'Satis',
    total_net: 75000,
    subtotal: 75000,
    discount: 0,
    total: 75000,
    total_amount: 75000,
    total_cost: 0,
    gross_profit: 75000,
    profit_margin: 150,
    line_mix: 'service',
    ...partial,
  };
}

describe('hizmet kart maliyeti', () => {
  it('alış fiyatı doluysa o kullanılır, satış fiyatı değil', () => {
    expect(serviceCardUnitCost({ purchasePrice: 10000, beautyCostPrice: 4000 })).toBe(10000);
    expect(serviceCardUnitCost({ purchasePrice: 0, beautyCostPrice: 4000 })).toBe(4000);
    expect(serviceCardUnitCost({ purchasePrice: 0, beautyCostPrice: 0 })).toBe(0);
  });

  it('kart maliyeti 10000, miktar 1, net 75000 → maliyet 10000, kâr 65000', () => {
    const row = sale({
      service_lines: [{ itemType: 'Hizmet', quantity: 1, cardUnitCost: 10000 }],
    });
    expect(invoiceListDisplayedCost(row)).toBe(10000);
    expect(invoiceListDisplayedProfit(row)).toBe(65000);
    expect(invoiceListDisplayedMargin(row)).toBe(86.67);
  });

  it('miktar 2 ise birim maliyet iki kez yazılır', () => {
    const row = sale({
      service_lines: [{ itemType: 'Hizmet', quantity: 2, cardUnitCost: 10000 }],
    });
    expect(serviceLineCardCost({ itemType: 'Hizmet', quantity: 2, cardUnitCost: 10000 })).toBe(20000);
    expect(invoiceListDisplayedCost(row)).toBe(20000);
    expect(invoiceListDisplayedProfit(row)).toBe(55000);
  });

  it('maliyetsiz hizmet 0 kalır, uydurma tutar yazılmaz', () => {
    const row = sale({
      service_lines: [{ itemType: 'Hizmet', quantity: 1, cardUnitCost: 0 }],
      total_cost: 0,
    });
    expect(invoiceListDisplayedCost(row)).toBe(0);
    expect(invoiceListDisplayedProfit(row)).toBe(75000);
    expect(invoiceListDisplayedMargin(row)).toBe(100);
  });

  it('ürün satırının 5000 maliyeti hizmet satırı olsa bile değişmez', () => {
    const row = sale({
      line_mix: 'product',
      total_net: 20000,
      subtotal: 20000,
      discount: 12000,
      total: 20000,
      total_amount: 20000,
      total_cost: 5000,
      gross_profit: 3000,
      header_fields: { footerDiscountAmount: '12000' },
      service_lines: [{ itemType: 'Hizmet', quantity: 1, cardUnitCost: 10000 }],
    });
    expect(invoiceListDisplayedCost(row)).toBe(5000);
    expect(invoiceListDisplayedProfit(row)).toBe(3000);
    expect(invoiceListDisplayedMargin(row)).toBe(37.5);
  });

  it('alış listesi kayıtlı kârı korur', () => {
    const row = sale({
      invoice_category: 'Alis',
      line_mix: 'product',
      total_cost: 5000,
      gross_profit: 0,
      profit_margin: 0,
    });
    expect(invoiceListDisplayedProfit(row)).toBe(0);
    expect(invoiceListDisplayedMargin(row)).toBe(0);
  });
});
