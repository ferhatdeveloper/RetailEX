import { describe, expect, it } from 'vitest';
import {
  buildCariEkstrePrintHtml,
  buildCariEkstrePrintLabels,
  formatCariAccountAddress,
  mapCariEkstrePrintRows,
} from '../../utils/cariEkstrePrint';
import type { EkstreRow } from '../../utils/cariAccountStatement';

describe('cariEkstrePrint', () => {
  const sampleRows: EkstreRow[] = [
    {
      date: '2026-03-15',
      fiche_no: 'SF-1',
      fiche_type: 'sales_invoice',
      trcode: 8,
      notes: 'GüzellikPOS|beauty_sale_id:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee|Güzellik satışı',
      borcAmount: 100,
      alacakAmount: 0,
      balance: 100,
    },
    {
      date: '2026-03-16',
      fiche_no: 'TH-2',
      fiche_type: 'CH_TAHSILAT',
      trcode: 0,
      notes: 'Tahsilat',
      borcAmount: 0,
      alacakAmount: 40,
      balance: 60,
    },
  ];

  it('formats account address parts', () => {
    expect(
      formatCariAccountAddress({
        address: 'Atatürk Cad. 1',
        city: 'Erbil',
        country: 'IQ',
      }),
    ).toBe('Atatürk Cad. 1, Erbil, IQ');
  });

  it('sanitizes beauty_sale_id from print descriptions and formats dates', () => {
    const mapped = mapCariEkstrePrintRows(sampleRows, 'tr', 'IQD', 'customer');
    expect(mapped[0].date).toBe('15.03.2026');
    expect(mapped[0].description).not.toMatch(/beauty_sale_id/i);
    expect(mapped[0].description).not.toMatch(/aaaaaaaa-bbbb/i);
    expect(mapped[0].description).toMatch(/Güzellik/);
    expect(mapped[0].debit).toContain('100');
    expect(mapped[1].credit).toContain('40');
    expect(mapped[1].balance).toContain('60');
  });

  it('builds corporate HTML with i18n headers and A4 landscape', () => {
    const labels = buildCariEkstrePrintLabels('en');
    const html = buildCariEkstrePrintHtml({
      reportTitle: labels.reportTitle,
      accountCode: 'C-001',
      accountName: 'Demo Customer',
      accountAddress: 'Street 1',
      cardType: 'customer',
      cardTypeLabel: labels.customer,
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      periodLabel: '1 — 2026',
      currency: 'IQD',
      companyName: 'RetailEX Demo Co',
      companyAddress: 'HQ Address',
      rows: sampleRows,
      totalDebit: 100,
      totalCredit: 40,
      netBalance: 60,
      labels,
      printLang: 'en',
      orientation: 'landscape',
    });

    expect(html).toContain('size: A4 landscape');
    expect(html).toContain('RetailEX Demo Co');
    expect(html).toContain('Demo Customer');
    expect(html).toContain(labels.debit);
    expect(html).toContain(labels.credit);
    expect(html).toContain(labels.balance);
    expect(html).not.toMatch(/beauty_sale_id/i);
    expect(html).toContain('15.03.2026');
    expect(html).toContain('lang="en"');
  });

  it('uses Arabic labels and rtl when printLang is ar', () => {
    const labels = buildCariEkstrePrintLabels('ar');
    const html = buildCariEkstrePrintHtml({
      reportTitle: labels.reportTitle,
      accountCode: 'C-001',
      accountName: 'عميل',
      cardTypeLabel: labels.customer,
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      currency: 'IQD',
      companyName: 'RetailEX',
      rows: sampleRows,
      totalDebit: 100,
      totalCredit: 40,
      netBalance: 60,
      labels,
      printLang: 'ar',
      orientation: 'portrait',
    });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('size: A4 portrait');
    expect(html).toContain(labels.debit);
  });
});
