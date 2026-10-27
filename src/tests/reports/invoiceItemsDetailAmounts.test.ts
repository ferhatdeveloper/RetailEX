/**
 * Fatura kalem detayı — iskonto, net fatura toplamı, tür, grup dip toplamı.
 * Satır neti ikinci kez düşülmez. Başlık brütü kolona yazılmaz.
 */
import { describe, expect, it } from 'vitest';
import {
  INVOICE_ITEMS_DETAIL_EXPORT_HEADERS,
  invoiceItemsDetailExportCells,
  invoiceItemsDetailInvoiceFooterSum,
  invoiceItemsDetailTypeLabel,
  mapInvoiceItemsDetailAmounts,
} from '../../utils/invoiceItemsDetailAmounts';

function line(input: {
  quantity?: number;
  unitPrice: number;
  lineTotal: number;
  discountAmount?: number;
  discountRate?: number;
  isReturn?: boolean;
  headerTotalNet?: number;
  lineGross?: number;
  ficheType?: string;
  trcode?: number;
}) {
  const amounts = mapInvoiceItemsDetailAmounts({
    quantity: input.quantity ?? 1,
    unitPrice: input.unitPrice,
    lineGross: input.lineGross ?? input.lineTotal,
    lineTotal: input.lineTotal,
    discountAmount: input.discountAmount ?? 0,
    discountRate: input.discountRate ?? 0,
    isReturn: input.isReturn === true,
    headerTotalNet: input.headerTotalNet,
  });
  return {
    ...amounts,
    invoiceType: invoiceItemsDetailTypeLabel(input.ficheType ?? 'sales_invoice', input.trcode ?? 8),
  };
}

describe('fatura kalem detayı iskonto ve net toplam', () => {
  it('ROZA 15.000 birim, net 14.000 → iskonto 1.000, fatura toplam 14.000', () => {
    const row = line({
      unitPrice: 15_000,
      lineTotal: 14_000,
      discountAmount: 0,
      headerTotalNet: 15_000,
      ficheType: 'sales_invoice',
      trcode: 8,
    });
    expect(row.discount).toBe(1_000);
    expect(row.lineTotal).toBe(14_000);
    expect(row.invoiceTotal).toBe(14_000);
    expect(row.invoiceTotal).toBe(row.lineTotal);
    expect(row.lineTotal).not.toBe(13_000);
    expect(row.invoiceTotal).not.toBe(15_000);
    expect(row.invoiceType).toBe('Satış Faturası');
  });

  it('ARAM 15.000 birim, net 10.000 → iskonto 5.000, fatura toplam 10.000', () => {
    const row = line({
      unitPrice: 15_000,
      lineTotal: 10_000,
      discountRate: (5_000 / 15_000) * 100,
      headerTotalNet: 15_000,
    });
    expect(row.discount).toBe(5_000);
    expect(row.lineTotal).toBe(10_000);
    expect(row.invoiceTotal).toBe(10_000);
    expect(row.invoiceType.length).toBeGreaterThan(0);
  });

  it('kayıtlı iskonto tutarı brüt-net farkıyla aynıysa o tutar yazılır', () => {
    const row = line({
      unitPrice: 15_000,
      lineTotal: 14_000,
      discountAmount: 1_000,
      lineGross: 14_000,
    });
    expect(row.discount).toBe(1_000);
    expect(row.invoiceTotal).toBe(14_000);
  });

  it('iskontosuz satırda iskonto 0, satır toplam fatura toplama eşit', () => {
    const plain = line({ unitPrice: 15_000, lineTotal: 15_000, headerTotalNet: 15_000 });
    const highlight = line({ unitPrice: 75_000, lineTotal: 75_000 });
    const strong = line({ unitPrice: 25_000, lineTotal: 25_000 });
    for (const row of [plain, highlight, strong]) {
      expect(row.discount).toBe(0);
      expect(row.lineTotal).toBe(row.invoiceTotal);
      expect(row.invoiceTotal).toBe(row.unitPrice);
    }
  });

  it('iade satırı eksi kalır, iskontosuz iadede iskonto 0', () => {
    const row = line({
      quantity: 1,
      unitPrice: 15_000,
      lineTotal: 15_000,
      isReturn: true,
      ficheType: 'return_invoice',
      trcode: 3,
      headerTotalNet: 15_000,
    });
    expect(row.quantity).toBe(-1);
    expect(row.lineTotal).toBe(-15_000);
    expect(row.invoiceTotal).toBe(-15_000);
    expect(row.discount).toBe(0);
    expect(row.unitPrice).toBe(15_000);
    expect(row.invoiceType).toBe('Satış İade Faturası');
  });

  it('zaten eksi iade bir kez kalır', () => {
    const row = line({
      quantity: -1,
      unitPrice: 15_000,
      lineTotal: -15_000,
      isReturn: true,
      ficheType: 'return_invoice',
      trcode: 3,
    });
    expect(row.quantity).toBe(-1);
    expect(row.lineTotal).toBe(-15_000);
    expect(row.invoiceTotal).toBe(-15_000);
    expect(row.discount).toBe(0);
  });

  it('çok kalemli fişte dip toplam başlığı satır sayısı kadar çarpmaz', () => {
    const lines = [
      line({ unitPrice: 15_000, lineTotal: 14_000, headerTotalNet: 24_000 }),
      line({ unitPrice: 15_000, lineTotal: 10_000, headerTotalNet: 24_000 }),
    ];
    expect(lines[0]?.invoiceTotal).toBe(14_000);
    expect(lines[1]?.invoiceTotal).toBe(10_000);
    const footer = invoiceItemsDetailInvoiceFooterSum(
      lines.reduce((sum, row) => sum + row.lineTotal, 0),
      lines,
    );
    expect(footer).toBe(24_000);
    expect(footer).not.toBe(48_000);
  });

  it('grup dip toplamı fatura toplam kolonunda 0 değil, satır netleri toplamı', () => {
    const rows = [
      line({ unitPrice: 15_000, lineTotal: 14_000, headerTotalNet: 15_000 }),
      line({ unitPrice: 15_000, lineTotal: 10_000, headerTotalNet: 15_000 }),
      line({ unitPrice: 15_000, lineTotal: 15_000 }),
      line({
        quantity: 1,
        unitPrice: 15_000,
        lineTotal: 15_000,
        isReturn: true,
        ficheType: 'return_invoice',
        trcode: 3,
      }),
    ];
    const lineNetSum = rows.reduce((sum, row) => sum + row.lineTotal, 0);
    expect(lineNetSum).toBe(14_000 + 10_000 + 15_000 - 15_000);
    const grouped = invoiceItemsDetailInvoiceFooterSum(lineNetSum, []);
    expect(grouped).toBe(lineNetSum);
    expect(grouped).not.toBe(0);
    expect(invoiceItemsDetailInvoiceFooterSum(0, rows)).toBe(lineNetSum);
  });

  it('fatura türü kolonu fiş türünden dolar', () => {
    expect(invoiceItemsDetailTypeLabel('sales_invoice', 8)).toBe('Satış Faturası');
    expect(invoiceItemsDetailTypeLabel('purchase_invoice', 1)).toBe('Alış Faturası');
    expect(invoiceItemsDetailTypeLabel('return_invoice', 3)).toBe('Satış İade Faturası');
    expect(invoiceItemsDetailTypeLabel('return_invoice', 2)).toBe('Satış İade Faturası');
    expect(invoiceItemsDetailTypeLabel('return_invoice', 6)).toBe('Alış İade Faturası');
    expect(invoiceItemsDetailTypeLabel('service', 9)).toBe('Verilen Hizmet Faturası');
    expect(invoiceItemsDetailTypeLabel('purchase_invoice', 4)).toBe('Alınan Hizmet Faturası');
    expect(invoiceItemsDetailTypeLabel('hizmet', 9)).toBe('Verilen Hizmet Faturası');
    expect(invoiceItemsDetailTypeLabel('waybill', 10)).toBe('İrsaliye');
    for (const label of [
      invoiceItemsDetailTypeLabel('sales_invoice', 8),
      invoiceItemsDetailTypeLabel('purchase_invoice', 5),
      invoiceItemsDetailTypeLabel('return_invoice', 6),
    ]) {
      expect(label.trim().length).toBeGreaterThan(0);
    }
  });

  it('Excel satırı tür ve net tutarları başlıkla aynı sayıda yazar', () => {
    const row = line({
      unitPrice: 15_000,
      lineTotal: 14_000,
      ficheType: 'sales_invoice',
      trcode: 8,
    });
    const cells = invoiceItemsDetailExportCells(
      {
        date: '2026-10-26',
        invoiceNo: 'BEA-2026-00009',
        invoiceType: row.invoiceType,
        customerName: 'ROZA',
        productName: 'SABUN',
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        discount: row.discount,
        lineTotal: row.lineTotal,
        invoiceTotal: row.invoiceTotal,
        phone: '',
      },
      0,
    );
    expect(INVOICE_ITEMS_DETAIL_EXPORT_HEADERS).toContain('Fatura Türü');
    expect(cells).toHaveLength(INVOICE_ITEMS_DETAIL_EXPORT_HEADERS.length);
    expect(cells[1]).toBe('26.10.2026');
    expect(cells[3]).toBe('Satış Faturası');
    expect(cells[8]).toBe('1000');
    expect(cells[9]).toBe('14000');
    expect(cells[10]).toBe('14000');
  });
});
