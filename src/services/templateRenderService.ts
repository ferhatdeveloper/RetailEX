import type { Invoice } from '../core/types';
import type { Template, TemplateElement, TemplateUsageScope } from '../core/types/templates';
import type { ReportComponent, ReportTemplate } from '../components/reports/designerUtils';
import { formatNumber } from '../utils/formatNumber';
import { flattenDbRecord, mergeTemplateContexts } from './templateRecordContext';

const TEMPLATE_TOKEN_REGEX = /\{\{\s*([^}]+)\s*\}\}/g;

function extractToken(raw?: string): string {
  if (!raw) return '';
  return raw.replace(/[{}]/g, '').trim();
}

function toPathValue(path: string, data: Record<string, unknown>): unknown {
  if (!path) return '';
  const parts = path.split('.');
  let current: unknown = data;
  for (const part of parts) {
    if (current == null) return '';
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function normalizeValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'number') return formatNumber(value, 2, true);
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (value instanceof Date) return value.toLocaleString('tr-TR');
  return String(value);
}

export function interpolateTemplateText(text: string, data: Record<string, unknown>): string {
  if (!text) return '';
  return text.replace(TEMPLATE_TOKEN_REGEX, (_full, token: string) => {
    const key = String(token || '').trim();
    if (!key) return '';
    const direct = data[key];
    if (direct != null) return normalizeValue(direct);
    const pathValue = toPathValue(key, data);
    if (pathValue != null && pathValue !== '') return normalizeValue(pathValue);
    const invoice = (data.invoice as Record<string, unknown>) || {};
    const invoiceDirect = invoice[key];
    if (invoiceDirect != null) return normalizeValue(invoiceDirect);
    return '';
  });
}

function elementToReportComponent(element: TemplateElement): ReportComponent {
  if (element.type === 'box') {
    return {
      id: element.id,
      type: 'rect',
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      content: '',
      style: {
        border: `${Math.max(1, element.borderWidth ?? 1)}px solid ${element.borderColor || '#111827'}`,
        background: element.backgroundColor || 'transparent',
      },
    };
  }

  if (element.type === 'table') {
    const columns = (element.columns?.length ? element.columns : ['Ürün', 'Miktar', 'Birim', 'Toplam']).map((col) => ({
      header: col,
      field: (() => {
        const norm = col.toLocaleLowerCase('tr-TR');
        if (norm.includes('ürün') || norm.includes('malzeme')) return 'productName';
        if (norm.includes('miktar') || norm.includes('adet')) return 'quantity';
        if (norm.includes('birim') || norm.includes('fiyat')) return 'unitPrice';
        if (norm.includes('toplam') || norm.includes('tutar')) return 'total';
        return col;
      })(),
      width: Math.floor(100 / Math.max(1, (element.columns?.length || 4))),
    }));
    return {
      id: element.id,
      type: 'table',
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      columns,
      content: element.content ?? '',
      style: {
        fontSize: `${element.fontSize ?? 10}px`,
      },
    };
  }

  if (element.type === 'line') {
    return {
      id: element.id,
      type: 'line',
      x: element.x,
      y: element.y,
      width: element.width,
      height: Math.max(0.2, element.height || 0.5),
      content: '',
      style: {
        borderTop: `${Math.max(1, element.borderWidth ?? 1)}px solid ${element.borderColor || element.color || '#111827'}`,
      },
    };
  }

  if (element.type === 'barcode') {
    return {
      id: element.id,
      type: 'barcode',
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      binding: extractToken(element.field || element.content) || 'barcode',
      content: element.content ?? '',
      style: {
        color: element.color || '#111827',
      },
    };
  }

  return {
    id: element.id,
    type: 'text',
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    content: element.content ?? '',
    binding: extractToken(element.field),
    style: {
      fontSize: `${element.fontSize ?? 11}px`,
      fontWeight: element.fontWeight ?? 'normal',
      textAlign: element.textAlign ?? 'left',
      color: element.color || '#111827',
      background: element.backgroundColor || 'transparent',
    },
  };
}

export function convertTemplateToReportTemplate(template: Template): ReportTemplate {
  return {
    name: template.name,
    category: template.type === 'label' ? 'etiket' : 'fatura',
    pageSize: { width: template.width, height: template.height },
    components: template.elements.map(elementToReportComponent),
  };
}

export function invoiceScopeFromTrcode(trcode?: number | null): TemplateUsageScope {
  const code = Number(trcode || 0);
  if ([7, 8].includes(code)) return 'invoice_sales';
  if ([1, 26].includes(code)) return 'invoice_purchase';
  if ([3, 6].includes(code)) return 'invoice_return';
  if ([10, 11, 12, 13].includes(code)) return 'invoice_waybill';
  if ([4, 9].includes(code)) return 'invoice_service';
  if ([20, 21].includes(code)) return 'invoice_order';
  if ([30, 31].includes(code)) return 'invoice_quote';
  return 'invoice_sales';
}

function parseDateParts(value: unknown): { date: string; time: string } {
  const raw = value ? String(value) : '';
  if (!raw) return { date: '', time: '' };
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return { date: raw.slice(0, 10), time: raw.slice(11, 16) };
  return {
    date: dt.toLocaleDateString('tr-TR'),
    time: dt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
  };
}

export function buildInvoicePrintContext(invoice: Invoice): Record<string, unknown> {
  const invoiceRecord = invoice as unknown as Record<string, unknown>;
  const dateSource =
    invoiceRecord.invoice_date ||
    invoiceRecord.date ||
    invoiceRecord.created_at ||
    '';
  const { date, time } = parseDateParts(dateSource);
  const customerName = invoiceRecord.customer_name || invoiceRecord.customerName || '';
  const items = (invoice.items || []).map((item) => {
    const row = item as unknown as Record<string, unknown>;
    return {
      ...item,
      name: item.productName || item.description || item.code || row.item_name || '',
      productName: item.productName || item.description || item.code || row.item_name || '',
      itemName: row.item_name || item.productName || '',
      itemCode: row.item_code || item.code || '',
      quantity: item.quantity ?? 0,
      unitPrice: item.unitPrice ?? item.price ?? row.unit_price ?? 0,
      unit_price: item.unitPrice ?? item.price ?? row.unit_price ?? 0,
      total: item.total ?? item.netAmount ?? row.net_amount ?? 0,
      net_amount: item.total ?? item.netAmount ?? row.net_amount ?? 0,
    };
  });
  const firstLine = items[0] as Record<string, unknown> | undefined;
  const headerFlat = flattenDbRecord(invoiceRecord, {
    prefix: 'sales',
    namespaces: ['sales', 'invoice'],
  });
  const lineFlat = firstLine
    ? flattenDbRecord(firstLine, { prefix: 'line', namespaces: ['line', 'item'] })
    : {};

  return mergeTemplateContexts(headerFlat, lineFlat, {
    invoice: invoiceRecord,
    sales: invoiceRecord,
    items,
    item: firstLine ?? {},
    line: firstLine ?? {},
    invoiceNo:
      invoiceRecord.invoice_no ||
      invoiceRecord.invoiceNo ||
      invoiceRecord.fiche_no ||
      '',
    ficheNo: invoiceRecord.fiche_no || invoiceRecord.invoice_no || '',
    documentNo: invoiceRecord.document_no || '',
    receiptNumber: invoiceRecord.receiptNumber || invoiceRecord.document_no || invoiceRecord.fiche_no || '',
    date,
    time,
    customerName: normalizeValue(customerName),
    customerAddress: invoiceRecord.customer_address || invoiceRecord.address || '',
    customerTaxNo: invoiceRecord.customer_tax_no || invoiceRecord.tax_nr || '',
    storeName: invoiceRecord.store_name || 'RetailEX',
    storeAddress: invoiceRecord.store_address || '',
    storeTaxNo: invoiceRecord.store_tax_no || invoiceRecord.storeTaxNo || '',
    storePhone: invoiceRecord.store_phone || '',
    subtotal: formatNumber(invoice.subtotal || Number(invoiceRecord.total_net || 0), 2, true),
    discount: formatNumber(invoice.discount || Number(invoiceRecord.total_discount || 0), 2, true),
    tax: formatNumber(invoice.tax || Number(invoiceRecord.total_vat || 0), 2, true),
    total: formatNumber(invoice.total || Number(invoiceRecord.net_amount || invoiceRecord.totalAmount || 0), 2, true),
    totalNet: formatNumber(Number(invoiceRecord.total_net || invoice.subtotal || 0), 2, true),
    totalVat: formatNumber(Number(invoiceRecord.total_vat || invoice.tax || 0), 2, true),
    netAmount: formatNumber(Number(invoiceRecord.net_amount || invoice.total || 0), 2, true),
    paymentMethod: invoiceRecord.paymentMethod || invoiceRecord.payment_method || '',
    cashier: invoiceRecord.cashier || '',
    currency: invoiceRecord.currency || '',
    firmNr: invoiceRecord.firm_nr || invoiceRecord.firma_id || '',
    periodNr: invoiceRecord.period_nr || invoiceRecord.donem_id || '',
    notes: invoiceRecord.notes || '',
    barcode: String(invoiceRecord.barcode || invoiceRecord.invoice_no || ''),
    price: formatNumber(invoice.total || Number(invoiceRecord.totalAmount || 0), 2, true),
  });
}
