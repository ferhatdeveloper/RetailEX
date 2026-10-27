/**
 * Excel aktarımı: başlıklar ayrı hücre, tutar gerçek sayı, dip toplam eksik kolon bırakmaz.
 * Türkçe "75.000" İngilizce Excel'de 75 okunmasın.
 */
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import { buildStyledWorksheet } from '../../utils/excelStyles';
import {
  csvCell,
  excelAmountCellValue,
  readExcelNumberCell,
} from '../../utils/excelCellValue';
import { buildDataGridExportAoa, buildGridExportWorksheet } from '../../utils/gridExcelExport';
import {
  INVOICE_ITEMS_DETAIL_EXPORT_HEADERS,
  invoiceItemsDetailExportCells,
} from '../../utils/invoiceItemsDetailAmounts';

describe('excel hücre değeri', () => {
  it('75.000 sayısı 75000 olur, 75 olmaz', () => {
    expect(excelAmountCellValue('Net tutar', '75.000')).toBe(75_000);
    expect(excelAmountCellValue('Net tutar', '75.000')).not.toBe(75);
    expect(csvCell('Net tutar', '75.000')).toBe('75000');

    const aoa = [
      ['Net tutar'],
      ['75.000'],
    ];
    const ws = buildGridExportWorksheet(aoa, ['Net tutar']);
    expect(ws['A2']?.v).toBe(75_000);
    expect(ws['A2']?.t).toBe('n');
    expect(ws['A2']?.v).not.toBe(75);
  });

  it('25.000 IQD (A) tutarı 25000 sayıdır, (A) yutulmaz', () => {
    const cell = excelAmountCellValue('Tutar', '25.000 IQD (A)');
    const marked = readExcelNumberCell(cell);
    expect(marked?.value).toBe(25_000);
    expect(marked?.direction).toBe('A');
    expect(csvCell('Tutar', '25.000 IQD (A)')).toBe('25000 (A)');

    const ws = buildGridExportWorksheet(
      [
        ['Tutar'],
        ['25.000 IQD (A)'],
      ],
      ['Tutar'],
    );
    expect(ws['A2']?.v).toBe(25_000);
    expect(ws['A2']?.t).toBe('n');
    expect(String(ws['A2']?.z)).toContain('(A)');
  });

  it('tarih, uzman ve fiş no sayıya çevrilmez', () => {
    expect(excelAmountCellValue('Tarih', '26.10.2026')).toBe('26.10.2026');
    expect(excelAmountCellValue('Tarih', '2026-10-26')).toBe('2026-10-26');
    expect(excelAmountCellValue('Uzman', 'System Administrator')).toBe('System Administrator');
    expect(excelAmountCellValue('Fiş No', '00002')).toBe('00002');
    expect(excelAmountCellValue('Cari', 'ROZA')).toBe('ROZA');
    expect(csvCell('Fiş No', '00002')).toContain('00002');
  });
});

describe('excel başlık ve kolon hizası', () => {
  it('başlık satırı birleşince ikinci kolon kaybolmaz', () => {
    const aoa = [
      ['Tarih', 'Uzman', 'Hizmet primi', 'Ürün primi', 'Toplam prim'],
      ['26.10.2026', 'System Administrator', 22_500, 0, 22_500],
    ];
    const ws = buildStyledWorksheet(aoa, {
      title: 'Prim dökümü',
      subtitle: '26.10.2026',
      headerRowIndex: 1,
      columnCount: 5,
      dataStartIndex: 1,
    });
    const merges = ws['!merges'] ?? [];
    const rowMerged = (row: number) => merges.some((m) => m.s.r === row && m.e.c > m.s.c);
    expect(rowMerged(0)).toBe(false);
    expect(rowMerged(1)).toBe(false);
    expect(ws['A1']?.v).toBe('Tarih');
    expect(ws['B1']?.v).toBe('Uzman');
    expect(ws['E1']?.v).toBe('Toplam prim');
    expect(ws['B2']?.v).toBe('System Administrator');
    expect(ws['C2']?.v).toBe(22_500);
  });

  it('fatura kalem başlık sayısı veri kolon sayısına eşittir', () => {
    const cells = invoiceItemsDetailExportCells(
      {
        date: '2026-10-26',
        invoiceNo: 'BEA-2026-00009',
        invoiceType: 'Satış Faturası',
        customerName: 'ROZA',
        productName: 'SABUN',
        quantity: 1,
        unitPrice: 15_000,
        discount: 1_000,
        lineTotal: 14_000,
        invoiceTotal: 14_000,
        phone: '07501234567',
      },
      0,
    );
    expect(cells).toHaveLength(INVOICE_ITEMS_DETAIL_EXPORT_HEADERS.length);
    const aoa = [[...INVOICE_ITEMS_DETAIL_EXPORT_HEADERS], cells];
    const ws = buildGridExportWorksheet(aoa, [...INVOICE_ITEMS_DETAIL_EXPORT_HEADERS]);
    expect(ws['A1']?.v).toBe('No');
    expect(ws['B1']?.v).toBe('Tarih');
    expect(ws['K1']?.v).toBe('Fatura Toplam');
    expect(ws['L1']?.v).toBe('Telefon');
    expect(ws['B2']?.v).toBe('26.10.2026');
    expect(ws['J2']?.v).toBe(14_000);
    expect(ws['K2']?.v).toBe(14_000);
    expect(ws['J2']?.t).toBe('n');
    const merges = ws['!merges'] ?? [];
    expect(merges.some((m) => m.s.r === 0 && m.e.c > m.s.c)).toBe(false);
    expect(merges.some((m) => m.s.r === 1 && m.e.c > m.s.c)).toBe(false);
  });

  it('malzeme ekstresi çıkış tutarı birim fiyat değil net tutardır', () => {
    type Row = {
      ficheNo: string;
      outAmt: number;
      salesUnitPrice: number;
    };
    const columns: ColumnDef<Row, unknown>[] = [
      { id: 'ficheNo', accessorKey: 'ficheNo', header: 'Fiş No' },
      { id: 'outAmt', accessorKey: 'outAmt', header: 'Çıkış Tutarı', meta: { type: 'currency' } },
      { id: 'salesUnitPrice', accessorKey: 'salesUnitPrice', header: 'Satış Birim Fiyatı', meta: { type: 'currency' } },
    ];
    const rows: Row[] = [{ ficheNo: 'BEA-2026-00009', outAmt: 99_000, salesUnitPrice: 115_000 }];
    const { headers, aoa } = buildDataGridExportAoa(rows, columns, {
      footerLabel: 'TOPLAM',
      footerSumColumns: [{ columnId: 'outAmt', getValue: (row) => row.outAmt }],
    });
    expect(headers).toHaveLength(3);
    expect(aoa[1]).toHaveLength(headers.length);
    expect(aoa[1]?.[1]).toBe(99_000);
    expect(aoa[1]?.[1]).not.toBe(115_000);
    expect(aoa[1]?.[2]).toBe(115_000);
    expect(aoa[aoa.length - 1]?.[1]).toBe(99_000);
    const ws = buildGridExportWorksheet(aoa, headers);
    expect(ws['A1']?.v).toBe('Fiş No');
    expect(ws['B1']?.v).toBe('Çıkış Tutarı');
    expect(ws['C1']?.v).toBe('Satış Birim Fiyatı');
    expect(ws['B2']?.v).toBe(99_000);
    expect(ws['B2']?.t).toBe('n');
    expect(ws['C2']?.v).toBe(115_000);
  });
});
