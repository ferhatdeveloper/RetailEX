import { looksLikeUuid } from './pgUuid';
import { displayItemCode } from './lastPurchaseCostSql';
import { formatLedgerAmount } from './currency';
import { formatNumber } from './formatNumber';

const CODE_ID_RE =
  /(^|_)(code|itemcode|item_code|productcode|product_code|materialcode|material_code)(_|$)/i;

const SKIP_SUM_RE =
  /percent|margin|oran|rate|code|name|barcode|uuid|date|skt|batch|brand|category|status|note|fiche|invoice|supplier|customer|days|bucket|type$|unit$|description|title|label|avg|average|discount|iskonto/i;

const UNIT_PRICE_RE = /(^|_)(price|unit_price|unitprice|avg|average)(_|$)/i;

const SUM_ID_RE =
  /qty|quantity|miktar|adet|amount|tutar|total|toplam|revenue|cogs|profit|stock|value|debit|credit|balance|incoming|outgoing|inqty|outqty|inamt|outamt|inamount|outamount|sold|satilan|net_|gross_|count/i;

/** Miktar / adet / stok sayımı — footer'da para birimi yok. */
const QTY_LIKE_COLUMN_RE =
  /(^|_)(qty|quantity|miktar|adet|count|inqty|outqty)(_|$)|quantity_sold|sold_qty|soldqty|salescount|productcount|transactioncount/i;

/** Tutar / para kolonları — footer'da sistem (firma) para birimi. */
const MONEY_COLUMN_RE =
  /(amount|tutar|(^|_)amt(_|$)|inamt|outamt|revenue|cogs|profit|value|debit|credit|balance|incoming|outgoing|collected|recv|pay|inflow|outflow|beforediscount|before_discount|(^|_)(total|cost|sales|purchased|gross)(_|$)|total_cost|totalcost|totalsales|totalpurchased|totalrevenue|grossprofit|stockvalue|stock_value)/i;

export function isReportCodeColumnId(id: unknown): boolean {
  const s = String(id || '').trim();
  if (!s || s === 'select' || s === 'actions') return false;
  return CODE_ID_RE.test(s);
}

/**
 * DevEx / rapor ızgarası — sayısal kolon varsayılan genişlikleri (px).
 * Türkçe başlıklar (Giriş miktar, Alış Birim Fiyatı…) kesilmesin diye okunabilir min.
 */
export const DEVEX_COMPACT_NUMERIC_SIZE = {
  qty: 104,
  amount: 112,
  price: 128,
  balance: 112,
  number: 100,
} as const;

export type DevExCompactNumericKind = keyof typeof DEVEX_COMPACT_NUMERIC_SIZE;

export const DEVEX_COMPACT_NUMERIC_MIN_SIZE = 72;
export const DEVEX_COMPACT_NUMERIC_MAX_SIZE = 180;

const COMPACT_QTY_ID_RE =
  /(^|_)(qty|quantity|miktar|adet|count|inqty|outqty|in_qty|out_qty)(_|$)|quantity_sold|sold_qty|soldqty/i;

const COMPACT_PRICE_ID_RE =
  /(price|unit_?price|unitprice|birim.?fiyat|purchaseunitprice|salesunitprice|(^|_)(avg|average)(_|$))/i;

const COMPACT_BALANCE_ID_RE =
  /(balance|bakiye|running_?balance|(^|_)kalan(_|$))/i;

const COMPACT_AMOUNT_ID_RE =
  /(amount|tutar|(^|_)amt(_|$)|inamt|outamt|in_amt|out_amt|revenue|cogs|profit|value|debit|credit|incoming|outgoing|(^|_)(total|toplam)(_|$))/i;

const COMPACT_GENERIC_NUMERIC_ID_RE =
  /(qty|quantity|miktar|adet|amount|tutar|price|fiyat|balance|bakiye|kalan|stock|stok|cost|maliyet|debit|credit|borc|alacak)/i;

export type DevExCompactNumericMeta = {
  filterKind?: string;
  format?: string;
  type?: string;
  align?: string;
  /** false ise daraltma uygulanmaz */
  compactWidth?: boolean;
};

/**
 * Kolon id / meta → dar sayısal tür (qty / amount / price / balance / number).
 * Metin kolonları (açıklama, ad) eşleşmez.
 */
export function resolveDevExCompactNumericKind(
  id: unknown,
  meta?: DevExCompactNumericMeta | null,
): DevExCompactNumericKind | null {
  if (meta?.compactWidth === false) return null;
  const s = String(id || '').trim().toLowerCase();
  if (!s || s === 'select' || s === 'actions') return null;
  if (CODE_ID_RE.test(s)) return null;

  const looksTextOnly =
    /name|title|description|aciklama|açıklama|note|fiche|invoice|supplier|customer|barcode|uuid|date|tarih|status|brand|category|skt|batch|typelabel|desclabel/i.test(
      s,
    ) && !COMPACT_GENERIC_NUMERIC_ID_RE.test(s);
  if (looksTextOnly) return null;

  const metaType = String(meta?.type || meta?.format || meta?.filterKind || '').toLowerCase();
  const metaSaysNumeric =
    metaType === 'number' ||
    metaType === 'currency' ||
    meta?.format === 'number' ||
    meta?.format === 'currency' ||
    meta?.filterKind === 'number';

  if (COMPACT_PRICE_ID_RE.test(s)) return 'price';
  if (COMPACT_BALANCE_ID_RE.test(s)) return 'balance';
  if (COMPACT_QTY_ID_RE.test(s) && !/amt|amount|tutar|price|fiyat/i.test(s)) return 'qty';
  if (COMPACT_AMOUNT_ID_RE.test(s) || metaType === 'currency') return 'amount';
  if (metaSaysNumeric) return 'number';
  if (meta?.align === 'right' && COMPACT_GENERIC_NUMERIC_ID_RE.test(s)) return 'number';
  if (COMPACT_GENERIC_NUMERIC_ID_RE.test(s)) return 'number';
  return null;
}

/**
 * Sayısal kolon genişliği: tanımsız / TanStack default / eski geniş değerler → compact.
 * Bilinçli daha dar `size` (compact’tan küçük) korunur. `meta.compactWidth: false` ile opt-out.
 */
export function resolveDevExCompactNumericSizing(
  id: unknown,
  meta?: DevExCompactNumericMeta | null,
  existingSize?: number | null,
): { size: number; minSize: number; maxSize: number } | null {
  const kind = resolveDevExCompactNumericKind(id, meta);
  if (!kind) return null;
  const compact = DEVEX_COMPACT_NUMERIC_SIZE[kind];
  const existing =
    typeof existingSize === 'number' && Number.isFinite(existingSize) && existingSize > 0
      ? existingSize
      : null;
  // Daha dar bilinçli size korunur; bilinçli daha geniş size (başlık okunabilirliği) ezilmez
  const size =
    existing == null
      ? compact
      : existing < compact
        ? existing
        : existing > compact
          ? existing
          : compact;
  return {
    size,
    minSize: Math.min(DEVEX_COMPACT_NUMERIC_MIN_SIZE, size),
    maxSize: Math.max(DEVEX_COMPACT_NUMERIC_MAX_SIZE, size),
  };
}

export function isDevExCompactNumericColumn(
  id: unknown,
  meta?: DevExCompactNumericMeta | null,
): boolean {
  return resolveDevExCompactNumericKind(id, meta) != null;
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

/**
 * Para/tutar kolon kimliği — footer'da firma para birimi gösterilir.
 * Miktar (qty/stock/count) false; stockValue true.
 */
export function isReportMoneyColumnId(id: unknown): boolean {
  const s = String(id || '').trim().toLowerCase();
  if (!s || s === 'select' || s === 'actions') return false;
  if (/percent|margin|oran|rate|avg|average/.test(s)) return false;
  if (/stockvalue|stock_value|stockval/.test(s)) return true;
  if (QTY_LIKE_COLUMN_RE.test(s)) return false;
  if (s === 'stock' || /(^|_)stock$/.test(s)) return false;
  if (s === 'unit_cost' || s === 'average_unit_cost' || UNIT_PRICE_RE.test(s)) return false;
  if (/(^|_)discount(_|$)|beforediscount|before_discount/.test(s)) return true;
  return MONEY_COLUMN_RE.test(s);
}

/** Toplanabilir ve para birimli kolon (otomatik dip toplam formatı). */
export function isReportMoneySumColumnId(id: unknown): boolean {
  return isReportSumColumnId(id) && isReportMoneyColumnId(id);
}

/**
 * Dip toplam metni: tutar kolonlarında formatLedgerAmount, aksi halde düz sayı.
 */
export function formatReportFooterSum(
  sum: number,
  columnId: string,
  currency?: string | null,
): string {
  if (isReportMoneyColumnId(columnId)) {
    return formatLedgerAmount(sum, currency);
  }
  return formatNumber(sum, 2, false);
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
