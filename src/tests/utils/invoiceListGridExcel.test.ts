/**
 * Fatura listesi Excel'i ekrandaki ızgaradır.
 * Barkod ve birim fiyat görünmüyorsa yazılmaz.
 * Net tutar sayıdır. Dip, satır netlerinin toplamıdır.
 */
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  buildInvoiceListColumns,
  defaultInvoiceListColumnVisibility,
  type ListInvoice,
} from '../../components/trading/invoices/invoiceListColumns';
import { buildDataGridExportAoa, buildGridExportWorksheet } from '../../utils/gridExcelExport';
import { invoiceListDisplayedCost, invoiceListDisplayedProfit } from '../../utils/invoiceListEconomics';
import { invoiceListPayableNet } from '../../utils/invoiceListPayableNet';

const labels: Record<string, string> = {
  invoiceNo: 'Fatura No',
  customerSupplier: 'Müşteri/Tedarikçi',
  date: 'Tarih',
  invoiceType: 'Fatura Türü',
  lineMix: 'Ürün / Hizmet',
  payments: 'Ödemeler',
  subtotal: 'subtotal',
  discount: 'İndirim',
  invoiceListNetAmount: 'Net tutar',
  cost: 'Maliyet',
  profit: 'Kâr',
  profitPercent: 'Kâr %',
  product: 'Ürün',
  service: 'Hizmet',
  invalidDate: '—',
  localeCode: 'tr-TR',
  noCustomer: '—',
  salesInvoices: 'Perakende Satış',
};

function tm(key: string): string {
  return labels[key] ?? key;
}

function row(partial: Partial<ListInvoice>): ListInvoice {
  return {
    invoice_no: '',
    invoice_date: '2026-10-27',
    invoice_type: 7,
    invoice_category: 'Satis',
    total_amount: 0,
    subtotal: 0,
    discount: 0,
    tax: 0,
    items: [],
    firma_id: '1',
    firma_name: '',
    donem_id: '1',
    donem_name: '',
    ...partial,
  } as ListInvoice;
}

function screenColumns(): ColumnDef<ListInvoice, unknown>[] {
  const columnVisibility = {
    ...defaultInvoiceListColumnVisibility(),
    cashier: false,
    payment_method: true,
    subtotal: true,
    discount: true,
    total_cost: true,
    gross_profit: true,
    profit_margin: true,
  };
  return buildInvoiceListColumns({
    columnVisibility,
    tm,
    localeCode: 'tr-TR',
    invoiceTypes: [{ code: 7, name: 'Perakende Satış', category: 'Satis', icon: 'FileText', translationKey: 'salesInvoices' }],
    getIcon: () => () => null,
    returnProcessorColumnLabel: 'Kasiyer',
    resolveListRowCurrency: () => 'IQD',
    ledgerCurrency: 'IQD',
    onViewDetail: () => {},
    onEdit: () => {},
  });
}

describe('fatura listesi excel ızgarası', () => {
  const discounted = row({
    invoice_no: 'BEA-2026-00010',
    customer_name: 'FERHAT',
    line_mix: 'product',
    payment_method: 'cash',
    subtotal: 20000,
    total_net: 20000,
    discount: 1000,
    total: 19000,
    total_amount: 19000,
    total_cost: 5000,
    header_fields: { footerDiscountAmount: '1000' },
  });
  const footerDiscount = row({
    invoice_no: 'BEA-2026-00012',
    customer_name: 'DUHA',
    line_mix: 'product',
    payment_method: 'cash',
    subtotal: 20000,
    total_net: 20000,
    discount: 12000,
    total: 20000,
    total_amount: 20000,
    total_cost: 5000,
    header_fields: { footerDiscountAmount: '12000' },
  });
  const service = row({
    invoice_no: 'BEA-2026-00006',
    customer_name: 'Hizmet',
    line_mix: 'service',
    payment_method: 'cash',
    subtotal: 75000,
    total_net: 75000,
    discount: 0,
    total: 75000,
    total_amount: 75000,
    total_cost: 0,
    service_lines: [{ itemType: 'Hizmet', quantity: 1, cardUnitCost: 10000 }],
  });

  it('görünen başlıklar yazılır; barkod ve birim fiyat yazılmaz', () => {
    const visible = screenColumns();
    const withHiddenTemplate: ColumnDef<ListInvoice, unknown>[] = [
      ...visible,
      { id: 'barcode', header: 'Barkod/Kod', accessorFn: () => '869000111' },
      { id: 'unit_price', header: 'Birim Fiyat', accessorFn: () => 15000 },
      { id: 'line_note', header: 'Açıklama', accessorFn: () => 'satır notu' },
    ];
    const visibleColumnIds = visible.map((col) => String(col.id || ''));
    const { headers, aoa } = buildDataGridExportAoa([discounted, footerDiscount, service], withHiddenTemplate, {
      visibleColumnIds,
      footerLabel: 'Dip Toplam',
      footerSumColumns: [
        { columnId: 'subtotal', getValue: (inv) => Number(inv.subtotal || 0) },
        { columnId: 'discount', getValue: (inv) => Number(inv.discount || 0) },
        { columnId: 'total', getValue: (inv) => invoiceListPayableNet(inv) },
        { columnId: 'total_cost', getValue: (inv) => invoiceListDisplayedCost(inv) },
        { columnId: 'gross_profit', getValue: (inv) => invoiceListDisplayedProfit(inv) },
      ],
    });

    expect(headers).toEqual([
      'Fatura No',
      'Müşteri/Tedarikçi',
      'Tarih',
      'Fatura Türü',
      'Ürün / Hizmet',
      'Ödemeler',
      'subtotal',
      'İndirim',
      'Net tutar',
      'Maliyet',
      'Kâr',
      'Kâr %',
    ]);
    expect(headers).not.toContain('Barkod/Kod');
    expect(headers).not.toContain('Birim Fiyat');
    expect(headers).not.toContain('Açıklama');
    expect(headers).not.toContain('Fatura Toplam');

    const netCol = headers.indexOf('Net tutar');
    const costCol = headers.indexOf('Maliyet');
    expect(aoa).toHaveLength(5);
    expect(aoa[1]?.[0]).toBe('BEA-2026-00010');
    expect(aoa[1]?.[netCol]).toBe(19000);
    expect(aoa[1]?.[costCol]).toBe(5000);
    expect(aoa[2]?.[netCol]).toBe(8000);
    expect(aoa[3]?.[netCol]).toBe(75000);
    expect(aoa[3]?.[costCol]).toBe(10000);
    expect(aoa[4]?.[netCol]).toBe(19000 + 8000 + 75000);
    expect(aoa[4]?.[costCol]).toBe(5000 + 5000 + 10000);
    expect(aoa[4]?.[netCol]).not.toBe(19000 * 3);

    const ws = buildGridExportWorksheet(aoa, headers);
    const netRef = XLSX.utils.encode_cell({ r: 1, c: netCol });
    const firstNo = XLSX.utils.encode_cell({ r: 1, c: 0 });
    expect(ws['A1']?.v).toBe('Fatura No');
    expect(ws[firstNo]?.v).toBe('BEA-2026-00010');
    expect(ws[netRef]?.v).toBe(19000);
    expect(ws[netRef]?.t).toBe('n');
    const merges = ws['!merges'] ?? [];
    expect(merges.some((m) => m.s.r === 0 && m.e.c > m.s.c)).toBe(false);
    expect(merges.some((m) => m.s.r === 1 && m.e.c > m.s.c)).toBe(false);
  });

  it('görünür kolon listesi boşsa gizli şablonun tamamı yazılmaz', () => {
    const visible = screenColumns();
    const withHidden: ColumnDef<ListInvoice, unknown>[] = [
      ...visible,
      { id: 'barcode', header: 'Barkod/Kod', accessorFn: () => '869' },
    ];
    const { headers } = buildDataGridExportAoa([discounted], withHidden, {
      visibleColumnIds: [],
    });
    expect(headers).toEqual([]);
    expect(headers).not.toContain('Barkod/Kod');
  });
});
