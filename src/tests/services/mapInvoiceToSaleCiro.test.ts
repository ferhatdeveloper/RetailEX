/**
 * Bug 29 (2026-10-12) — Aylık Rapor Ciro brüt düzeltmesi.
 *
 * Kök neden:
 *   `sales.ts:mapInvoiceToSale` daha önce `invoice.total_amount` üzerinden
 *   `Sale.total` üretiyordu. DB'de `total_amount` aslında `net_amount`tan
 *   beslenir (indirim düşülmüş), dolayısıyla brüt Ciro düşük görünüyordu.
 *   DB şemasında `total_gross=0` invarianı vardır; brüt Ciro kaynağı
 *   `total_net`'tir (VAT Hariç brüt tutar).
 *
 * Bu test, `mapInvoiceToSale` için brüt Ciro fallback zincirini doğrular:
 *   total_net → total_amount (net_amount) → total (eski alan)
 *
 * Beklenen etki (yaygın analiz):
 *   - Günlük Rapor Ciro = brüt (toplam fatura başlık total_net)
 *   - Aylık / Yıllık Ciro = brüt (kullanıcı istedi)
 *   - Tahsilat (collected), Kasa Para Girişi, Tedarikçi Açık Borç, Ödeme
 *     Dağılımı, Veresiye → bağımsız alanlar; brüt Ciro'ya dahil değildir
 *     ve etkilenmemelidir.
 */

import { describe, it, expect } from 'vitest';
import { mapInvoiceToSale } from '../../services/api/sales';
import type { Invoice } from '../../core/types';

function baseInvoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 'inv-1',
    invoice_no: 'F-001',
    invoice_date: '2026-10-10',
    invoice_type: 8,
    invoice_category: 'Satis',
    total_amount: 0,
    total: 0,
    subtotal: 0,
    discount: 0,
    tax: 0,
    items: [],
    firma_id: '001',
    firma_name: 'Test Firma',
    donem_id: '01',
    donem_name: '2026',
    ...overrides,
  } as Invoice;
}

describe('mapInvoiceToSale — Ciro brüt (Bug 29)', () => {
  it('total_net=50.000 → Sale.total=50.000 (normal satış)', () => {
    const inv = baseInvoice({
      total_net: 50000,
      total_amount: 30000, // net_amount (indirim düşülmüş) — fallback OLMAZ
      total: 30000,
    });
    const sale = mapInvoiceToSale(inv);
    expect(Math.abs(sale.total)).toBe(50000);
  });

  it('total_net=0 → Sale.total=0 (açıkça brüt=0; fallback yok)', () => {
    // `??` yalnızca null/undefined için fallback yapar; 0 değeri geçerlidir.
    // Eski DB kayıtlarında total_net NULL ise fallback tetiklenir (aşağıdaki test).
    const inv = baseInvoice({
      total_net: 0,
      total_amount: 30000,
      total: 30000,
    });
    const sale = mapInvoiceToSale(inv);
    expect(Math.abs(sale.total)).toBe(0);
  });

  it('total_net null/undefined → fallback total_amount=30.000', () => {
    // Eski DB: total_net NULL, total_amount (net_amount) dolu → fallback.
    const inv = baseInvoice({
      total_net: undefined,
      total_amount: 30000,
      total: 30000,
    });
    const sale = mapInvoiceToSale(inv);
    expect(Math.abs(sale.total)).toBe(30000);
  });

  it('total_net undefined ve total_amount undefined → fallback total=25.000', () => {
    const inv = baseInvoice({
      total_amount: undefined,
      total: 25000,
    });
    const sale = mapInvoiceToSale(inv);
    expect(Math.abs(sale.total)).toBe(25000);
  });

  it('total_net=100.000 → Sale.total=100.000 (DB brüt Ciro senaryosu: 50k+50k=100k)', () => {
    // Kullanıcı istediği senaryo: iki ayrı satış 50.000 + 50.000 = 100.000 brüt.
    const inv = baseInvoice({
      total_net: 100000,
      total_amount: 65000, // indirim düşülmüş (30k + 35k)
      total: 65000,
    });
    const sale = mapInvoiceToSale(inv);
    expect(Math.abs(sale.total)).toBe(100000);
  });

  it('Sale.total işareti normal satışta pozitif kalır', () => {
    const inv = baseInvoice({
      total_net: 75000,
      total_amount: 60000,
    });
    const sale = mapInvoiceToSale(inv);
    expect(sale.total).toBe(75000); // pozitif
  });

  it('Sale.total müşteri iade fişinde negatif işaretlenir (Sale.total işaret)', () => {
    const inv = baseInvoice({
      total_net: 20000,
      total_amount: 20000,
      trcode: 3, // müşteri satış iade (sales_return)
      fiche_type: 'return_invoice',
    });
    const sale = mapInvoiceToSale(inv);
    // Bug 29 — iade işareti korunur; brüt Ciro 20.000 negatif
    expect(sale.total).toBe(-20000);
  });

  it('Tüm alanlar 0 → Sale.total=0 (sıfır brüt korunur)', () => {
    const inv = baseInvoice({});
    const sale = mapInvoiceToSale(inv);
    expect(sale.total).toBe(0);
  });
});