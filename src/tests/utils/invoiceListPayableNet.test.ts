/**
 * Perakende satış listesi Toplam kolonu.
 * BEA-2026-00010: satır brüt / satır net 20.000, dip indirim 1.000, ödenecek net 19.000.
 * Kasa bu neti tahsil eder. Liste de aynı neti yazmalı.
 */
import { describe, expect, it } from 'vitest';
import {
  invoiceListPayableNet,
  sumInvoiceListPayableNet,
  type InvoiceListPayableSource,
} from '../../utils/invoiceListPayableNet';

function fiche(partial: InvoiceListPayableSource): InvoiceListPayableSource {
  return partial;
}

describe('invoiceListPayableNet', () => {
  it('brüt satır 20.000 ve dip indirim 1.000 → liste toplamı 19.000', () => {
    const row = fiche({
      total_net: 20000,
      subtotal: 20000,
      discount: 1000,
      total: 19000,
      total_amount: 19000,
      header_fields: { footerDiscountAmount: '1000', footerDiscountPercent: '5' },
    });
    expect(invoiceListPayableNet(row)).toBe(19000);
  });

  it('indirimsiz fiş 20.000 kalır', () => {
    expect(
      invoiceListPayableNet({
        total_net: 20000,
        subtotal: 20000,
        discount: 0,
        total: 20000,
        total_amount: 20000,
      }),
    ).toBe(20000);
  });

  it('dip indirim ikinci kez düşülmez', () => {
    const row = fiche({
      total_net: 20000,
      discount: 1000,
      total: 19000,
      total_amount: 19000,
      header_fields: { footerDiscountAmount: '1000' },
    });
    expect(invoiceListPayableNet(row)).toBe(19000);
    expect(invoiceListPayableNet(row)).not.toBe(18000);

    const alreadyNet = fiche({
      total_net: 19000,
      discount: 1000,
      total: 19000,
      total_amount: 19000,
      header_fields: { footerDiscountAmount: '1000' },
    });
    // total_net dip öncesidir. Kayıtlı tutar da 19.000 ise indirim henüz düşülmemiştir.
    expect(invoiceListPayableNet(alreadyNet)).toBe(18000);
  });

  it('dip indirim 12.000 ve satır 20.000 → liste net 8.000; indirimsiz 20.000', () => {
    expect(
      invoiceListPayableNet({
        total_net: 20000,
        subtotal: 20000,
        discount: 12000,
        total: 20000,
        total_amount: 20000,
        header_fields: { footerDiscountAmount: '12000' },
      }),
    ).toBe(8000);
    expect(
      invoiceListPayableNet({
        total_net: 20000,
        subtotal: 20000,
        discount: 0,
        total: 20000,
        total_amount: 20000,
      }),
    ).toBe(20000);
  });

  it('satır indirimi nette ise bir daha düşülmez; dip ayrıca bir kez düşülür', () => {
    const row = fiche({
      total_net: 20000,
      discount: 3000,
      total: 17000,
      total_amount: 17000,
      header_fields: { footerDiscountAmount: '1000' },
      items: [{ netAmount: 18000, type: 'Malzeme' }],
    });
    expect(invoiceListPayableNet(row)).toBe(17000);
  });

  it('yalnız satır indirimi: satır neti 18.000, dip yok → 18.000', () => {
    expect(
      invoiceListPayableNet({
        total_net: 20000,
        discount: 2000,
        total: 18000,
        total_amount: 18000,
        items: [{ netAmount: 18000 }],
      }),
    ).toBe(18000);
  });

  it('indirim kanıtı yoksa düşük net_amount ile tutar düşülmez', () => {
    expect(
      invoiceListPayableNet({
        total_net: 75000,
        total_gross: 75000,
        total: 50000,
        total_amount: 50000,
        discount: 0,
      }),
    ).toBe(75000);
  });

  it('alış, iade ve hizmet listesi aynı net kuralını kullanır', () => {
    const discounted = fiche({
      total_net: 20000,
      discount: 1000,
      total: 19000,
      total_amount: 19000,
      header_fields: { footerDiscountAmount: '1000' },
    });
    const plain = fiche({
      total_net: 20000,
      discount: 0,
      total: 20000,
      total_amount: 20000,
    });
    expect(invoiceListPayableNet(discounted)).toBe(19000);
    expect(invoiceListPayableNet(plain)).toBe(20000);
  });

  it('kayıtlı net yoksa dip indirim başlıktan bir kez düşülür', () => {
    expect(
      invoiceListPayableNet({
        total_net: 20000,
        discount: 1000,
        header_fields: { footerDiscountPercent: '5', footerDiscountAmount: '1000' },
      }),
    ).toBe(19000);
  });

  it('üst özet netleri toplar; brüt 550.000 ise dip indirim kadar azalır', () => {
    const plain20 = fiche({ total_net: 20000, total: 20000, discount: 0 });
    const plain30 = fiche({ total_net: 30000, total: 30000, discount: 0 });
    const withFooter = fiche({
      total_net: 20000,
      total: 19000,
      discount: 1000,
      header_fields: { footerDiscountAmount: '1000' },
    });
    const rows: InvoiceListPayableSource[] = [
      ...Array.from({ length: 25 }, () => plain20),
      plain30,
      withFooter,
    ];
    const grossBanner = rows.reduce((sum, row) => sum + Number(row.total_net ?? 0), 0);
    expect(grossBanner).toBe(550000);
    expect(sumInvoiceListPayableNet(rows)).toBe(549000);
  });
});
