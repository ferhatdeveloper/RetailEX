import { describe, expect, it } from 'vitest';
import type { Sale } from '../../core/types/models';
import { buildReceipt80mmPrintHtml } from '../../utils/receipt80mmPrintHtml';
import { RECEIPT_80MM_DOCUMENT_CSS, RECEIPT_80MM_SLIP_CSS } from '../../utils/receipt80mmDocumentCss';
import { receiptLineGross, receiptSettlement } from '../../utils/receiptSettlement';

const soapLine = { quantity: 1, price: 15_000, total: 14_000, discount: 0 };

describe('receiptSettlement — brüt, iskonto, net, ödenen, kalan', () => {
  it('brüt 15.000, iskonto 1.000, net 14.000, ödenen 14.000, kalan 0', () => {
    const row = receiptSettlement({
      items: [soapLine],
      discount: 1_000,
      total: 15_000,
      subtotal: 15_000,
      paid: 14_000,
    }, 'IQD');

    expect(receiptLineGross(soapLine)).toBe(15_000);
    expect(row.gross).toBe(15_000);
    expect(row.discount).toBe(1_000);
    expect(row.net).toBe(14_000);
    expect(row.paid).toBe(14_000);
    expect(row.remaining).toBe(0);
    expect(row.net).toBe(row.gross - row.discount);
    expect(row.remaining).toBe(row.net - row.paid);
  });

  it('iskonto kalana eklenmez', () => {
    const row = receiptSettlement({
      items: [soapLine],
      discount: 1_000,
      total: 15_000,
      paid: 14_000,
    }, 'IQD');

    expect(row.remaining).toBe(0);
    expect(row.remaining).not.toBe(row.discount);
    expect(row.remaining).not.toBe(1_000);
    expect(row.paid).toBe(14_000);
    expect(row.paid).not.toBe(row.gross);
  });

  it('net belge toplamı ikinci kez iskonto düşmez', () => {
    const row = receiptSettlement({
      items: [{ quantity: 1, price: 15_000, total: 15_000 }],
      discount: 1_000,
      total: 14_000,
      paid: 14_000,
    }, 'IQD');

    expect(row.gross).toBe(15_000);
    expect(row.discount).toBe(1_000);
    expect(row.net).toBe(14_000);
    expect(row.paid).toBe(14_000);
    expect(row.remaining).toBe(0);
  });

  it('iskonto yokken kısmi ödemede kalan net eksi ödenen', () => {
    const row = receiptSettlement({
      items: [{ quantity: 1, price: 50_000, total: 50_000 }],
      discount: 0,
      total: 50_000,
      paid: 20_000,
    }, 'IQD');

    expect(row.net).toBe(50_000);
    expect(row.remaining).toBe(30_000);
  });
});

function chunkAfter(html: string, label: string, len = 380): string {
  const at = html.indexOf(label);
  expect(at).toBeGreaterThan(-1);
  return html.slice(at, at + len);
}

describe('fiş şablonu — sabun 15.000 / iskonto 1.000', () => {
  function soapSale(total: number, lineTotal: number): Sale {
    return {
      id: 'soap-1',
      receiptNumber: 'BEA-2026-00009',
      date: '2026-10-26T11:08:24',
      customerName: 'ROZA',
      cashier: 'admin',
      notes: 'GüzellikPOS — Güzellik satışı',
      items: [
        {
          productId: 'sabun',
          productName: 'SABUN',
          quantity: 1,
          price: 15_000,
          discount: 0,
          total: lineTotal,
        },
      ],
      subtotal: 15_000,
      discount: 1_000,
      total,
      paymentMethod: 'cash',
    };
  }

  function htmlFor(total: number, lineTotal: number): string {
    return buildReceipt80mmPrintHtml({
      sale: soapSale(total, lineTotal),
      paymentData: {
        payments: [{ method: 'cash', amount: 14_000, currency: 'IQD' }],
        totalPaid: 14_000,
        change: 0,
      },
      receiptSettings: { companyName: 'RetailEx OS' },
      locale: 'tr',
      currencyCode: 'IQD',
    });
  }

  it('modal fiş brüt satır, net toplam ve kalan 0 yazar', () => {
    const html = htmlFor(15_000, 14_000);
    const order = ['SABUN', 'İskonto', 'Toplam', 'ÖDENEN', 'KALAN'];
    let pos = -1;
    for (const label of order) {
      const at = html.indexOf(label);
      expect(at).toBeGreaterThan(pos);
      pos = at;
    }

    const line = html.slice(html.indexOf('SABUN'), html.indexOf('İskonto'));
    expect(line).toContain('15.000');
    expect(line).not.toContain('14.000');

    const discount = chunkAfter(html, 'İskonto');
    expect(discount).toContain('1.000');

    const toplam = chunkAfter(html, 'Toplam');
    expect(toplam).toContain('14.000');
    expect(toplam).not.toContain('15.000');

    const paid = chunkAfter(html, 'ÖDENEN');
    expect(paid).toContain('14.000');
    expect(paid).not.toContain('15.000');

    const kalan = chunkAfter(html, 'KALAN');
    expect(kalan).toContain('0 IQD');
    expect(kalan).not.toContain('1.000');

    expect(html).toContain('ROZA');
    expect(html).toContain('admin');
    expect(html).toContain('GüzellikPOS');
    expect(html).toContain('class="rx-slip"');
  });

  it('yazdırma fişi aynı neti korur ve sayfayı 80mm ortalar', () => {
    const html = htmlFor(14_000, 15_000);
    expect(chunkAfter(html, 'KALAN')).toContain('0 IQD');
    expect(chunkAfter(html, 'KALAN')).not.toContain('1.000');
    expect(html).toContain('15.000');
    expect(chunkAfter(html, 'Toplam')).toContain('14.000');
    expect(RECEIPT_80MM_DOCUMENT_CSS).toContain('size: 80mm auto');
    expect(RECEIPT_80MM_DOCUMENT_CSS).toContain('margin: 0 auto');
    expect(RECEIPT_80MM_DOCUMENT_CSS).not.toContain('width: 100% !important');
    expect(RECEIPT_80MM_DOCUMENT_CSS).toContain('height: auto');
    expect(RECEIPT_80MM_SLIP_CSS).toContain('margin-left: auto');
    expect(RECEIPT_80MM_SLIP_CSS).toContain('text-align: end');
    expect(html).toContain('.rx-slip table');
    expect(html).toContain('size: 80mm auto');
  });
});
