import { looksLikeUuid } from './pgUuid';
import { displayItemCode } from './lastPurchaseCostSql';

const CODE_ID_RE =
  /(^|_)(code|itemcode|item_code|productcode|product_code|materialcode|material_code)(_|$)/i;

const SKIP_SUM_RE =
  /percent|margin|oran|rate|code|name|barcode|uuid|date|skt|batch|brand|category|status|note|fiche|invoice|supplier|customer|days|bucket|type$|unit$|description|title|label|avg|average|discount|iskonto/i;

const UNIT_PRICE_RE = /(^|_)(price|unit_price|unitprice|avg|average)(_|$)/i;

const SUM_ID_RE =
  /qty|quantity|miktar|adet|amount|tutar|total|toplam|revenue|cogs|profit|stock|value|debit|credit|balance|incoming|outgoing|inqty|outqty|inamt|outamt|inamount|outamount|sold|satilan|net_|gross_|count/i;

export function isReportCodeColumnId(id: unknown): boolean {
  const s = String(id || '').trim();
  if (!s || s === 'select' || s === 'actions') return false;
  return CODE_ID_RE.test(s);
}

export function isReportSumColumnId(id: unknown): boolean {
  const s = String(id || '').trim().toLowerCase();
  if (!s || s === 'select' || s === 'actions') return false;
  if (SKIP_SUM_RE.test(s)) return false;
  if (UNIT_PRICE_RE.test(s)) return false;
  if (s === 'cost' || s === 'unit_cost' || s === 'average_unit_cost') return false;
  if (s.endsWith('_cost') && !s.includes('total') && s !== 'cogs') return false;
  if (/(^|_)(min|max|critical)(_)?stock/.test(s) || /^(min|max|critical)stock$/.test(s)) return false;
  return SUM_ID_RE.test(s);
}

export function coerceReportNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value == null || value === '') return 0;
  let t = String(value).trim().replace(/\s+/g, '').replace(/[^\d,.\-]/g, '');
  if (!t) return 0;
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.')
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '');
  } else if (t.includes(',')) {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function reportDisplayCode(...vals: unknown[]): string {
  const shown = displayItemCode(...vals);
  return shown === '—' ? '' : shown;
}

export function excelCellDisplay(columnId: string, value: unknown, row?: Record<string, unknown>): unknown {
  if (isReportCodeColumnId(columnId)) {
    return reportDisplayCode(value, row?.barcode, row?.item_code, row?.product_code, row?.code);
  }
  if (looksLikeUuid(value) && isReportCodeColumnId(columnId)) {
    return '';
  }
  return value;
}
