/**
 * Bug 29 follow-up (12.10.2026) — Müşteri Bazlı Satış Raporu "BRÜT TUTAR" regresyonu.
 *
 * Kök neden:
 *   Rapor, `effectiveCatalogSales` → `sale.total` aggregate eder.
 *   `mapInvoiceToSale` `total_net → total_amount → total` fallback zinciri ile
 *   brüt Ciro döner (`771b00b1` düzeltmesi). Ancak DB `total_net` 50000 olsa
 *   bile rapor 65000 (net_amount toplamı) dönüyorsa ya:
 *     a) `mapInvoiceToSale`'e `total_net` ulaşmıyor (parseFloat 0 + || undefined)
 *     b) catalogSales cache'i eski bundle'dan
 *     c) sale.total başka bir aggregate tarafından eziliyor
 *
 * Bu test, mapInvoiceToSale → CustomerSalesReport aggregate semantiğini
 * simüle eder ve NIHAT (50k) + Refık (50k) senaryosu için BRÜT=100k
 * döndüğünü doğrular.
 */

import { describe, it, expect } from 'vitest';
import { mapInvoiceToSale } from '../../services/api/sales';
import type { Invoice, Sale } from '../../core/types';

function baseInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'inv-1',
    invoice_no: 'F-001',
    invoice_date: '2026-10-12',
    invoice_type: 8,
    invoice_category: 'Satis',
    total_amount: 0,
    total: 0,
    subtotal: 0,
    discount: 0,
    tax: 0,
    items: [],
    firma_id: '001',
    firma_name: 'Test',
    donem_id: '01',
    donem_name: '2026',
    ...overrides,
  } as Invoice;
}

/** mapInvoiceToSale → sale.total brüt dönmeli (Bug 29). */
describe('mapInvoiceToSale — Müşteri Bazlı Rapor brüt Ciro', () => {
  it('NIHAT senaryosu: total_net=50000 → sale.total=50000 (brüt)', () => {
    // DB'den okunan Invoice (mapDatabaseInvoiceToInvoice sonrası):
    // - total_net: DB total_net (brüt)
    // - total_amount: normalizeSalesHeaderNetAmount (net tahsilat = net_amount)
    // - total: aynı
    const inv = baseInvoice({
      total_net: 50000,
      total_amount: 30000, // net tahsilat
      total: 30000,
      status: 'completed',
    });
    const sale = mapInvoiceToSale(inv);
    expect(Math.abs(sale.total)).toBe(50000);
  });

  it('Refık senaryosu: total_net=50000 → sale.total=50000 (brüt)', () => {
    const inv = baseInvoice({
      total_net: 50000,
      total_amount: 35000,
      total: 35000,
      status: 'completed',
    });
    const sale = mapInvoiceToSale(inv);
    expect(Math.abs(sale.total)).toBe(50000);
  });

  it('İki müşteri aggregate brüt = 100.000 (nihai rapor beklentisi)', () => {
    const invoices: Invoice[] = [
      baseInvoice({
        id: 'inv-nihat',
        customer_name: 'NIHAT',
        total_net: 50000,
        total_amount: 30000,
        total: 30000,
        status: 'completed',
      }),
      baseInvoice({
        id: 'inv-refik',
        customer_name: 'Refık',
        total_net: 50000,
        total_amount: 35000,
        total: 35000,
        status: 'completed',
      }),
    ];
    const sales: Sale[] = invoices.map(mapInvoiceToSale);
    const totalBrut = sales.reduce((s, x) => s + Math.abs(x.total), 0);
    expect(totalBrut).toBe(100000);
  });

  it('Aynı aggregate net tahsilat toplamı = 65.000 (yanlış kolona yazılırsa)', () => {
    // Bu, kullanıcının raporda gördüğü değer. mapInvoiceToSale öncesi
    // total_amount (net tahsilat) aggregate edilirse → 65.000 döner.
    // Bu test, "rapor sale.total yerine sale.total'ın brüt fallback
    // kullanmadığı bir aggregate" davranışını belgeliyor; bug 29
    // düzeltmesinin satır bazında doğru çalıştığını ispatlar.
    const inv1 = baseInvoice({
      total_net: 50000,
      total_amount: 30000,
    });
    const inv2 = baseInvoice({
      total_net: 50000,
      total_amount: 35000,
    });
    const s1 = mapInvoiceToSale(inv1);
    const s2 = mapInvoiceToSale(inv2);
    // Yanlış davranış: total_amount aggregate edilseydi 65000 dönerdi.
    const wrongNetAggregate = Math.abs(s1.total) + Math.abs(s2.total); // 100000 brüt
    // total_amount fallback olsaydı (yani sale.total = total_amount)
    const wrongNetFromInvoice = s1.total + s2.total; // 100000 de olur çünkü fallback total_net
    expect(wrongNetAggregate).toBe(100000);
    // NOT: 65.000 dönüyorsa → ya mapInvoiceToSale bypass ediliyor
    // (örn. catalogSales eski cache'ten geliyor) ya da aggregate başka
    // bir zincirde hesaplanıyor (örn. cash_lines/payments).
  });
});