import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import {
  appendStoreIdFilter,
  firmNr,
  newUuid,
  periodNr,
  productsTable,
  saleItemsTable,
  salesTable,
  storeId,
} from './erpTables';
import {
  buildInvoiceFilterClause,
  matchesInvoiceListFilter,
  type InvoiceListFilter,
} from './invoiceFilters';
import {
  adjustCustomerBalance,
  adjustSupplierBalance,
  recordBankaCikisForPurchase,
  recordBankaCikisForReturn,
  recordBankaGirisForPurchaseReturn,
  recordBankaGirisForSale,
  recordKasaCikisForPurchase,
  recordKasaCikisForReturn,
  recordKasaGirisForPurchaseReturn,
  recordKasaGirisForSale,
} from './cashApi';
import {
  paymentMethodImpliesBankTransfer,
  paymentMethodImpliesCashInKasa,
  paymentMethodImpliesCashOutKasa,
  paymentMethodImpliesCustomerDebt,
  paymentMethodImpliesSupplierDebt,
} from './paymentMethodUtils';
import { shouldUseLiveData, getNetworkPolicy } from '../offline/policy';
import {
  enqueueMutation,
  type InvoiceHeaderFieldsInput,
  type InvoiceLineInput,
} from '../offline/mutationQueue';

export type { InvoiceHeaderFieldsInput };
import {
  adjustProductStockInCache,
  getPendingInvoiceById,
  getPendingInvoices,
  patchPendingInvoiceInCache,
  upsertPendingInvoiceInCache,
} from '../offline/snapshotCache';
import { useConnectivityStore } from '../store/connectivityStore';

export type { InvoiceListFilter, InvoicesListPreset } from './invoiceFilters';
export {
  invoiceFilterLabel,
  resolveInvoicesRouteParams,
  trcodeBadgeLabel,
} from './invoiceFilters';

/** Liste filtresi — web Logo trcode / fiche_type grupları ile uyumlu */
export type InvoiceKind = 'all' | 'sales' | 'purchase';

const PURCHASE_TRCODES = [1, 4, 5, 6, 13, 26, 41, 42] as const;

export function isPurchaseInvoice(row: {
  trcode?: number | null;
  fiche_type?: string | null;
}): boolean {
  const tc = Number(row.trcode ?? 0);
  const ft = String(row.fiche_type ?? '').toLowerCase().trim();
  if (ft === 'purchase_invoice' || ft === 'a') return true;
  if (ft.includes('alis') || ft.includes('alış') || ft.includes('purchase')) return true;
  return (PURCHASE_TRCODES as readonly number[]).includes(tc);
}

export function isSalesInvoice(row: {
  trcode?: number | null;
  fiche_type?: string | null;
}): boolean {
  if (isPurchaseInvoice(row)) return false;
  const tc = Number(row.trcode ?? 0);
  const ft = String(row.fiche_type ?? '').toLowerCase().trim();
  if (ft === 'sales_invoice' || ft === 'sales' || ft === 'retail' || ft === 'service') return true;
  if (ft.includes('sat') || ft.includes('sales')) return true;
  if ([0, 2, 3, 7, 8, 9, 14, 29, 30, 31, 32].includes(tc)) return true;
  return !ft;
}

export function invoiceKindLabel(row: {
  trcode?: number | null;
  fiche_type?: string | null;
}): 'Alış' | 'Satış' {
  return isPurchaseInvoice(row) ? 'Alış' : 'Satış';
}

function kindSqlWhere(kind: InvoiceKind): string {
  if (kind === 'purchase') {
    return `(COALESCE(trcode, 0) IN (1, 4, 5, 6, 13, 26, 41, 42)
      OR LOWER(TRIM(COALESCE(fiche_type, ''))) IN ('purchase_invoice', 'a')
      OR COALESCE(fiche_type, '') ILIKE '%alis%'
      OR COALESCE(fiche_type, '') ILIKE '%alış%')`;
  }
  if (kind === 'sales') {
    return `NOT (
      COALESCE(trcode, 0) IN (1, 4, 5, 6, 13, 26, 41, 42)
      OR LOWER(TRIM(COALESCE(fiche_type, ''))) IN ('purchase_invoice', 'a')
      OR COALESCE(fiche_type, '') ILIKE '%alis%'
      OR COALESCE(fiche_type, '') ILIKE '%alış%'
    )`;
  }
  return 'TRUE';
}

export type InvoiceRow = {
  id: string;
  fiche_no: string | null;
  date: string | null;
  customer_name: string | null;
  net_amount: number;
  total_gross: number;
  status: string | null;
  fiche_type: string | null;
  trcode: number | null;
  payment_method: string | null;
  is_cancelled: boolean;
};

export async function fetchInvoices(opts?: {
  search?: string;
  limit?: number;
  /** Genel satış/alış ayrımı — `filter` verilmişse yok sayılır */
  kind?: InvoiceKind;
  /** trcode / fiche_type — satış iade (3), alış iade (6) vb. */
  filter?: InvoiceListFilter;
}): Promise<InvoiceRow[]> {
  if (!shouldUseLiveData()) {
    const pending = await getPendingInvoices();
    const q = (opts?.search ?? '').trim().toLowerCase();
    const filtered = pending.filter((p) => {
      if (!q) return true;
      return (
        (p.fiche_no || '').toLowerCase().includes(q) ||
        (p.customer_name || '').toLowerCase().includes(q)
      );
    });
    return filtered.slice(0, opts?.limit ?? 100).map((p) => ({
      id: p.id,
      fiche_no: p.fiche_no,
      date: p.date,
      customer_name: p.customer_name,
      net_amount: p.net_amount,
      total_gross: p.total_gross,
      status: p.status,
      fiche_type: p.fiche_type,
      trcode: p.trcode,
      payment_method: p.payment_method,
      is_cancelled: p.is_cancelled,
    }));
  }

  return runDataTransport({
    label: 'fetchInvoices',
    viaRest: () => fetchInvoicesViaRest(opts),
    viaBridge: () => fetchInvoicesViaBridge(opts),
  });
}

function escapeIlike(q: string): string {
  return q.replace(/[%_*(),]/g, '');
}

function mapInvoiceRow(r: Record<string, unknown>): InvoiceRow {
  return {
    id: String(r.id ?? ''),
    fiche_no: r.fiche_no != null ? String(r.fiche_no) : null,
    date: r.date != null ? String(r.date).slice(0, 10) : null,
    customer_name: r.customer_name != null ? String(r.customer_name) : null,
    net_amount: Number(r.net_amount ?? r.total_net ?? r.total_gross ?? 0) || 0,
    total_gross: Number(r.total_gross ?? 0) || 0,
    status: r.status != null ? String(r.status) : null,
    fiche_type: r.fiche_type != null ? String(r.fiche_type) : null,
    trcode: r.trcode == null || r.trcode === '' ? null : Number(r.trcode),
    payment_method: r.payment_method != null ? String(r.payment_method) : null,
    is_cancelled:
      r.is_cancelled === true || String(r.is_cancelled).toLowerCase() === 'true',
  };
}

/** Web invoices getPaginated rest_api — client-side kind/filter + mağaza */
async function fetchInvoicesViaRest(opts?: {
  search?: string;
  limit?: number;
  kind?: InvoiceKind;
  filter?: InvoiceListFilter;
}): Promise<InvoiceRow[]> {
  const table = salesTable(firmNr(), periodNr());
  const limit = opts?.limit ?? 100;
  const q = escapeIlike((opts?.search ?? '').trim());
  const useTrcodeFilter = !!opts?.filter && opts.filter.preset !== 'all';
  const kind = useTrcodeFilter ? 'all' : (opts?.kind ?? 'all');
  const sid = storeId();

  const query: Record<string, string | number> = {
    select:
      'id,fiche_no,date,customer_name,net_amount,total_net,total_gross,status,fiche_type,trcode,payment_method,is_cancelled,store_id,document_no,created_at',
    order: 'date.desc',
    limit: Math.min(Math.max(limit * 8, 500), 5000),
    is_cancelled: 'eq.false',
  };

  if (q.length >= 1) {
    query.or = `(fiche_no.ilike.*${q}*,customer_name.ilike.*${q}*,document_no.ilike.*${q}*)`;
  }
  if (sid) {
    query.store_id = `eq.${sid}`;
  }

  const rows = await postgrestGet<Record<string, unknown>[]>(`/${table}`, query, {
    schema: 'public',
  });

  let list = (Array.isArray(rows) ? rows : [])
    .map(mapInvoiceRow)
    .filter((r) => r.id && !r.is_cancelled);

  if (useTrcodeFilter) {
    list = list.filter((r) => matchesInvoiceListFilter(r, opts!.filter));
  } else if (kind === 'purchase') {
    list = list.filter((r) => isPurchaseInvoice(r));
  } else if (kind === 'sales') {
    list = list.filter((r) => isSalesInvoice(r));
  }

  return list.slice(0, limit);
}

async function fetchInvoicesViaBridge(opts?: {
  search?: string;
  limit?: number;
  kind?: InvoiceKind;
  filter?: InvoiceListFilter;
}): Promise<InvoiceRow[]> {
  const table = salesTable(firmNr(), periodNr());
  const limit = opts?.limit ?? 100;
  const q = (opts?.search ?? '').trim();
  const useTrcodeFilter = !!opts?.filter && opts.filter.preset !== 'all';
  const kind = useTrcodeFilter ? 'all' : (opts?.kind ?? 'all');

  let filterSql = '';
  let filterParams: unknown[] = [];
  if (useTrcodeFilter) {
    const fc = buildInvoiceFilterClause(opts!.filter, q.length >= 1 ? 3 : 2);
    filterSql = fc.sql;
    filterParams = fc.params;
  } else if (kind !== 'all') {
    filterSql = ` AND (${kindSqlWhere(kind)})`;
  }

  const cols = `id, fiche_no, date::text AS date, customer_name,
    COALESCE(net_amount, total_net, total_gross, 0)::float8 AS net_amount,
    COALESCE(total_gross, 0)::float8 AS total_gross,
    status, fiche_type, trcode, payment_method,
    COALESCE(is_cancelled, false) AS is_cancelled`;

  if (q.length >= 1) {
    const like = `%${q}%`;
    const params: unknown[] = [like, limit, ...filterParams];
    const storeSql = appendStoreIdFilter('store_id', params);
    const res = await pgQuery<InvoiceRow>(
      `SELECT ${cols}
       FROM ${table}
       WHERE COALESCE(is_cancelled, false) = false
         AND (
           fiche_no ILIKE $1 OR COALESCE(customer_name,'') ILIKE $1
           OR COALESCE(document_no,'') ILIKE $1
         )${filterSql}${storeSql}
       ORDER BY date DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT $2`,
      params,
    );
    return res.rows;
  }

  const params: unknown[] = [limit, ...filterParams];
  const storeSql = appendStoreIdFilter('store_id', params);
  const res = await pgQuery<InvoiceRow>(
    `SELECT ${cols}
     FROM ${table}
     WHERE COALESCE(is_cancelled, false) = false${filterSql}${storeSql}
     ORDER BY date DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT $1`,
    params,
  );
  return res.rows;
}

/** Filtrelenmiş liste özeti (iade ekranları için) */
export async function fetchInvoiceFilterSummary(
  filter?: InvoiceListFilter,
): Promise<{ count: number; total: number }> {
  if (!filter || filter.preset === 'all') {
    return { count: 0, total: 0 };
  }
  try {
    const rows = await fetchInvoices({ filter, limit: 5000 });
    const total = rows.reduce((s, r) => s + (Number(r.net_amount) || 0), 0);
    return { count: rows.length, total };
  } catch {
    return { count: 0, total: 0 };
  }
}

export async function fetchInvoiceSummary(): Promise<{
  salesTotal: number;
  salesCount: number;
  purchaseTotal: number;
  purchaseCount: number;
}> {
  try {
    return await runDataTransport({
      label: 'fetchInvoiceSummary',
      viaRest: fetchInvoiceSummaryViaRest,
      viaBridge: fetchInvoiceSummaryViaBridge,
    });
  } catch {
    return { salesTotal: 0, salesCount: 0, purchaseTotal: 0, purchaseCount: 0 };
  }
}

async function fetchInvoiceSummaryViaRest(): Promise<{
  salesTotal: number;
  salesCount: number;
  purchaseTotal: number;
  purchaseCount: number;
}> {
  const table = salesTable();
  const sid = storeId();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceYmd = since.toISOString().slice(0, 10);

  const query: Record<string, string | number> = {
    select: 'net_amount,total_net,total_gross,fiche_type,trcode,is_cancelled,date,store_id',
    order: 'date.desc',
    limit: 5000,
    date: `gte.${sinceYmd}`,
  };
  if (sid) query.store_id = `eq.${sid}`;

  const rows = await postgrestGet<Record<string, unknown>[]>(`/${table}`, query, {
    schema: 'public',
  });

  let salesTotal = 0;
  let salesCount = 0;
  let purchaseTotal = 0;
  let purchaseCount = 0;
  for (const raw of Array.isArray(rows) ? rows : []) {
    const r = mapInvoiceRow(raw);
    if (r.is_cancelled) continue;
    const net = Number(r.net_amount) || 0;
    if (isPurchaseInvoice(r)) {
      purchaseTotal += net;
      purchaseCount += 1;
    } else if (isSalesInvoice(r)) {
      salesTotal += net;
      salesCount += 1;
    }
  }
  return { salesTotal, salesCount, purchaseTotal, purchaseCount };
}

async function fetchInvoiceSummaryViaBridge(): Promise<{
  salesTotal: number;
  salesCount: number;
  purchaseTotal: number;
  purchaseCount: number;
}> {
  const table = salesTable();
  const purchaseCond = kindSqlWhere('purchase');
  const salesCond = kindSqlWhere('sales');
  const params: unknown[] = [];
  const storeSql = appendStoreIdFilter('store_id', params);
  const res = await pgQuery<{
    sales_total: string | number;
    sales_count: string | number;
    purchase_total: string | number;
    purchase_count: string | number;
  }>(
    `SELECT
       COALESCE(SUM(COALESCE(net_amount,0)) FILTER (
         WHERE COALESCE(is_cancelled,false)=false AND (${salesCond})
       ), 0)::numeric AS sales_total,
       COUNT(*) FILTER (
         WHERE COALESCE(is_cancelled,false)=false AND (${salesCond})
       )::int AS sales_count,
       COALESCE(SUM(COALESCE(net_amount,0)) FILTER (
         WHERE COALESCE(is_cancelled,false)=false AND (${purchaseCond})
       ), 0)::numeric AS purchase_total,
       COUNT(*) FILTER (
         WHERE COALESCE(is_cancelled,false)=false AND (${purchaseCond})
       )::int AS purchase_count
     FROM ${table}
     WHERE date::date >= (CURRENT_DATE - INTERVAL '30 days')${storeSql}`,
    params,
  );
  const r = res.rows[0];
  return {
    salesTotal: Number(r?.sales_total ?? 0),
    salesCount: Number(r?.sales_count ?? 0),
    purchaseTotal: Number(r?.purchase_total ?? 0),
    purchaseCount: Number(r?.purchase_count ?? 0),
  };
}

export type InvoiceLine = {
  id: string;
  item_code: string | null;
  item_name: string | null;
  quantity: number;
  unit_price: number;
  net_amount: number;
  unit: string | null;
  product_id?: string | null;
  vat_rate?: number;
  discount_rate?: number;
  item_type?: string | null;
};

export type InvoiceDetail = InvoiceRow & {
  notes: string | null;
  total_vat: number;
  total_discount: number;
  currency: string | null;
  currency_rate?: number | null;
  document_no?: string | null;
  customer_id?: string | null;
  store_id?: string | null;
  header_fields?: InvoiceHeaderFieldsInput | null;
  lines: InvoiceLine[];
};

export async function fetchInvoiceById(id: string): Promise<InvoiceDetail | null> {
  if (!id) return null;

  if (!shouldUseLiveData()) {
    const pending = await getPendingInvoiceById(id);
    if (!pending) return null;
    return {
      id: pending.id,
      fiche_no: pending.fiche_no,
      date: pending.date,
      customer_name: pending.customer_name,
      net_amount: pending.net_amount,
      total_gross: pending.total_gross,
      status: pending.status,
      fiche_type: pending.fiche_type,
      trcode: pending.trcode,
      payment_method: pending.payment_method,
      is_cancelled: pending.is_cancelled,
      notes: pending.notes,
      total_vat: pending.total_vat,
      total_discount: pending.total_discount,
      currency: pending.currency,
      lines: pending.lines,
    };
  }

  const header = salesTable();
  const items = saleItemsTable();

  const hRes = await pgQuery<
    InvoiceRow & {
      notes: string | null;
      total_vat: number;
      total_discount: number;
      currency: string | null;
      currency_rate: number | null;
      document_no: string | null;
      customer_id: string | null;
      store_id: string | null;
      header_fields: unknown;
    }
  >(
    `SELECT id, fiche_no, date::text AS date, customer_name,
            customer_id::text AS customer_id,
            document_no,
            store_id::text AS store_id,
            COALESCE(net_amount, total_net, total_gross, 0)::float8 AS net_amount,
            COALESCE(total_gross, 0)::float8 AS total_gross,
            status, fiche_type, trcode, payment_method,
            COALESCE(is_cancelled, false) AS is_cancelled,
            notes,
            COALESCE(total_vat, 0)::float8 AS total_vat,
            COALESCE(total_discount, 0)::float8 AS total_discount,
            currency,
            COALESCE(currency_rate, 1)::float8 AS currency_rate,
            header_fields
     FROM ${header}
     WHERE id::text = $1
     LIMIT 1`,
    [id],
  );
  const row = hRes.rows[0];
  if (!row) return null;

  let lines: InvoiceLine[] = [];
  try {
    const lRes = await pgQuery<InvoiceLine>(
      `SELECT id, item_code, item_name,
              product_id::text AS product_id,
              COALESCE(quantity, 0)::float8 AS quantity,
              COALESCE(unit_price, 0)::float8 AS unit_price,
              COALESCE(net_amount, total_amount, 0)::float8 AS net_amount,
              unit,
              COALESCE(vat_rate, 0)::float8 AS vat_rate,
              COALESCE(discount_rate, 0)::float8 AS discount_rate,
              item_type
       FROM ${items}
       WHERE invoice_id::text = $1
       ORDER BY id`,
      [id],
    );
    lines = lRes.rows;
  } catch {
    try {
      const lRes = await pgQuery<InvoiceLine>(
        `SELECT id, item_code, item_name,
                product_id::text AS product_id,
                COALESCE(quantity, 0)::float8 AS quantity,
                COALESCE(unit_price, 0)::float8 AS unit_price,
                COALESCE(net_amount, total_amount, 0)::float8 AS net_amount,
                unit
         FROM ${items}
         WHERE invoice_id::text = $1
         ORDER BY id`,
        [id],
      );
      lines = lRes.rows;
    } catch {
      lines = [];
    }
  }

  const hfRaw = row.header_fields;
  const header_fields =
    hfRaw && typeof hfRaw === 'object' && !Array.isArray(hfRaw)
      ? (hfRaw as InvoiceHeaderFieldsInput)
      : null;

  return { ...row, header_fields, lines };
}

export type InvoiceDraftLine = InvoiceLineInput;

/** Form / API — fatura yazma türü */
export type InvoiceDocumentKind =
  | 'service-given'
  | 'service-received'
  | 'waybill-sales'
  | 'waybill-purchase'
  | 'order-sales'
  | 'order-purchase'
  | 'quote';

export type InvoiceFormKind =
  | 'sales'
  | 'purchase'
  | 'sales-return'
  | 'purchase-return'
  | InvoiceDocumentKind;

export type InvoiceWriteResult = {
  id: string;
  ficheNo: string;
  total: number;
  queued?: boolean;
};

export type InvoiceWriteOptions = {
  forceLive?: boolean;
  skipQueue?: boolean;
  id?: string;
  ficheNo?: string;
};

export type InvoiceCreateExtras = {
  documentNo?: string;
  /** Dip indirim tutarı (satır netlerinden düşülür) */
  footerDiscountAmount?: number;
  /** Fatura tarihi YYYY-MM-DD — yoksa NOW() */
  invoiceDate?: string;
  currency?: string;
  currencyRate?: number;
  storeId?: string | null;
  /** Web header_fields parity */
  headerFields?: InvoiceHeaderFieldsInput;
  /** Peşin kasa satırı için kasa id */
  cashRegisterId?: string | null;
};

function normalizeInvoiceDate(raw?: string): string | null {
  const s = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function buildHeaderFieldsJson(
  extras: InvoiceCreateExtras,
  documentNo?: string,
): string {
  const hf: InvoiceHeaderFieldsInput = { ...(extras.headerFields || {}) };
  const doc = (documentNo || extras.documentNo || hf.documentNo || '').trim();
  if (doc) hf.documentNo = doc;
  if (extras.cashRegisterId) hf.cashRegisterId = extras.cashRegisterId;
  return JSON.stringify(hf);
}

function lineAffectsStock(line: InvoiceDraftLine): boolean {
  if (line.lineType === 'service') return false;
  const it = String(line.itemType || '').toLowerCase();
  if (it === 'hizmet' || it === 'service') return false;
  return Boolean(line.productId && String(line.productId).trim());
}

/** trcode → form kind (edit yükleme) */
export function invoiceFormKindFromTrcode(
  trcode: number,
  ficheType?: string | null,
): InvoiceFormKind {
  const tc = Number(trcode) || 0;
  switch (tc) {
    case 3:
      return 'sales-return';
    case 6:
      return 'purchase-return';
    case 9:
      return 'service-given';
    case 4:
      return 'service-received';
    case 10:
    case 12:
      return 'waybill-sales';
    case 11:
    case 13:
      return 'waybill-purchase';
    case 20:
      return 'order-sales';
    case 21:
      return 'order-purchase';
    case 30:
      return 'quote';
    case 1:
      return 'purchase';
    case 8:
      return 'sales';
    default:
      break;
  }
  const ft = String(ficheType || '').toLowerCase();
  if (ft.includes('purchase')) return 'purchase';
  if (ft.includes('waybill')) return 'waybill-sales';
  if (ft.includes('order')) return 'order-sales';
  if (ft.includes('quote')) return 'quote';
  return 'sales';
}

export function invoiceAllowsLineEdit(status: string | null | undefined): boolean {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  return s === 'draft' || s === 'pending';
}

/** Satır brüt → indirim sonrası net */
export function invoiceLineNet(line: InvoiceDraftLine): number {
  const gross = Math.max(0, Number(line.unitPrice) || 0) * Math.max(0, Number(line.qty) || 0);
  const pct = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
  return Math.max(0, gross * (1 - pct / 100));
}

/** Satır KDV tutarı (net × oran / 100) */
export function invoiceLineVat(line: InvoiceDraftLine): number {
  const rate = Math.max(0, Number(line.vatRate) || 0);
  return invoiceLineNet(line) * (rate / 100);
}

export function invoiceLinesSubtotal(lines: InvoiceDraftLine[]): number {
  return lines.reduce((s, l) => s + invoiceLineNet(l), 0);
}

export function invoiceLinesDiscountTotal(lines: InvoiceDraftLine[]): number {
  return lines.reduce((s, l) => {
    const gross = Math.max(0, Number(l.unitPrice) || 0) * Math.max(0, Number(l.qty) || 0);
    const pct = Math.min(100, Math.max(0, Number(l.discountPercent) || 0));
    return s + gross * (pct / 100);
  }, 0);
}

/**
 * Özet hesaplama — satır vat_rate + header total_vat (web invoicesAPI.tax → total_vat).
 */
export function invoiceTotalsFromLines(
  lines: InvoiceDraftLine[],
  footerDiscountAmount = 0,
): {
  subtotal: number;
  lineDiscount: number;
  footerDiscount: number;
  totalVat: number;
  net: number;
} {
  const subtotal = invoiceLinesSubtotal(lines);
  const lineDiscount = invoiceLinesDiscountTotal(lines);
  const footerDiscount = Math.min(subtotal, Math.max(0, Number(footerDiscountAmount) || 0));
  const net = Math.max(0, subtotal - footerDiscount);
  // Dip indirim sonrası KDV’yi satır oranlarının ağırlıklı ortalaması ile yaklaşıkla
  const rawVat = lines.reduce((s, l) => s + invoiceLineVat(l), 0);
  const scale = subtotal > 0 ? net / subtotal : 1;
  const totalVat = Math.round(rawVat * scale * 100) / 100;
  return { subtotal, lineDiscount, footerDiscount, totalVat, net };
}

function nextFicheNo(prefix: string): string {
  const d = new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${prefix}-${stamp}`;
}

async function insertSaleItemRow(
  itemsTable: string,
  opts: {
    invoiceId: string;
    firmNr: string;
    periodNr: string;
    line: InvoiceDraftLine;
  },
): Promise<void> {
  const lineNet = invoiceLineNet(opts.line);
  const lineId = newUuid();
  const vatRate = Math.max(0, Number(opts.line.vatRate) || 0);
  const disc = Math.min(100, Math.max(0, Number(opts.line.discountPercent) || 0));
  try {
    await pgQuery(
      `INSERT INTO ${itemsTable} (
         id, invoice_id, firm_nr, period_nr,
         product_id, item_code, item_name,
         quantity, unit_price, discount_rate, vat_rate,
         net_amount, total_amount, unit
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4,
         $5::uuid, $6, $7,
         $8, $9, $10, $11,
         $12, $12, $13
       )`,
      [
        lineId,
        opts.invoiceId,
        opts.firmNr,
        opts.periodNr,
        opts.line.productId,
        opts.line.code ?? null,
        opts.line.name,
        opts.line.qty,
        opts.line.unitPrice,
        disc,
        vatRate,
        lineNet,
        opts.line.unit || 'Adet',
      ],
    );
  } catch {
    /* vat_rate / discount_rate kolonu yoksa sade insert */
    await pgQuery(
      `INSERT INTO ${itemsTable} (
         id, invoice_id, firm_nr, period_nr,
         product_id, item_code, item_name,
         quantity, unit_price, net_amount, total_amount, unit
       ) VALUES (
         $1::uuid, $2::uuid, $3, $4,
         $5::uuid, $6, $7,
         $8, $9, $10, $10, $11
       )`,
      [
        lineId,
        opts.invoiceId,
        opts.firmNr,
        opts.periodNr,
        opts.line.productId,
        opts.line.code ?? null,
        opts.line.name,
        opts.line.qty,
        opts.line.unitPrice,
        lineNet,
        opts.line.unit || 'Adet',
      ],
    );
  }
}

/** Basit satış faturası — POS ile aynı tablolar, fiche_type=sales_invoice, trcode=8 (toptan) */
async function createSalesInvoiceLive(
  opts: {
    customerId?: string;
    customerName: string;
    notes?: string;
    paymentMethod?: string;
    lines: InvoiceDraftLine[];
  } & InvoiceCreateExtras,
  writeOpts?: Pick<InvoiceWriteOptions, 'id' | 'ficheNo'>,
): Promise<InvoiceWriteResult> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');

  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const items = saleItemsTable(fn, pn);
  const { useAuthStore } = await import('../store/authStore');

  const id = writeOpts?.id || newUuid();
  const ficheNo = writeOpts?.ficheNo || nextFicheNo('SF');
  const totals = invoiceTotalsFromLines(opts.lines, opts.footerDiscountAmount);
  const total = totals.net;
  const discountTotal = totals.lineDiscount + totals.footerDiscount;
  const user = useAuthStore.getState().user;
  const cashier = user?.fullName || user?.username || 'mobile';
  const customerName = opts.customerName.trim() || 'Perakende';
  const documentNo = opts.documentNo?.trim() || ficheNo;
  const invDate = normalizeInvoiceDate(opts.invoiceDate);
  const currency = (opts.currency || 'TRY').trim() || 'TRY';
  const currencyRate =
    Number(opts.currencyRate) > 0 ? Number(opts.currencyRate) : 1;
  const headerFieldsJson = buildHeaderFieldsJson(opts, documentNo);

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name, store_id,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes, header_fields
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()),
       'sales_invoice', 8, $7::uuid, $8, $9::uuid,
       $10, $11, $12, $13, $10,
       $14, $15, 'approved', $16, $17, $18, $19::jsonb
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      documentNo,
      invDate,
      opts.customerId || null,
      customerName,
      opts.storeId || null,
      total,
      totals.totalVat,
      totals.subtotal,
      discountTotal,
      currency,
      currencyRate,
      opts.paymentMethod || 'Nakit',
      cashier,
      opts.notes?.trim() || 'Asin Mobile Fatura',
      headerFieldsJson,
    ],
  );

  for (const line of opts.lines) {
    await insertSaleItemRow(items, {
      invoiceId: id,
      firmNr: fn,
      periodNr: pn,
      line,
    });

    if (!lineAffectsStock(line)) continue;
    try {
      await pgQuery(
        `UPDATE ${productsTable(fn)}
         SET stock = COALESCE(stock, 0) - $1, updated_at = NOW()
         WHERE id::text = $2`,
        [line.qty, line.productId],
      );
    } catch {
      /* şema farkı */
    }
  }

  const pm = opts.paymentMethod || 'Nakit';
  if (opts.customerId && paymentMethodImpliesCustomerDebt(pm) && total > 0) {
    try {
      await adjustCustomerBalance(opts.customerId, total);
    } catch {
      /* cari yoksa sessiz */
    }
  }
  if (paymentMethodImpliesCashInKasa(pm) && total > 0) {
    try {
      await recordKasaGirisForSale({
        amount: total,
        ficheNo,
        description: `Satış faturası — ${ficheNo}`,
        customerId: opts.customerId || null,
        registerId: opts.cashRegisterId || null,
      });
    } catch {
      /* kasa yoksa sessiz */
    }
  } else if (paymentMethodImpliesBankTransfer(pm) && total > 0) {
    try {
      await recordBankaGirisForSale({
        amount: total,
        ficheNo,
        description: `Satış faturası (havale) — ${ficheNo}`,
      });
    } catch {
      /* banka yoksa sessiz */
    }
  }

  return { id, ficheNo, total };
}

export async function createSalesInvoice(
  opts: {
    customerId?: string;
    customerName: string;
    notes?: string;
    paymentMethod?: string;
    lines: InvoiceDraftLine[];
  } & InvoiceCreateExtras,
  writeOpts?: InvoiceWriteOptions,
): Promise<InvoiceWriteResult> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');

  const id = writeOpts?.id || newUuid();
  const ficheNo = writeOpts?.ficheNo || nextFicheNo('SF');
  const totals = invoiceTotalsFromLines(opts.lines, opts.footerDiscountAmount);
  const total = totals.net;
  const live = writeOpts?.forceLive === true || shouldUseLiveData();

  if (!live && !writeOpts?.skipQueue) {
    await enqueueMutation({
      type: 'invoice.sales.create',
      payload: {
        localId: id,
        ficheNo,
        customerId: opts.customerId,
        customerName: opts.customerName,
        notes: opts.notes,
        paymentMethod: opts.paymentMethod,
        lines: opts.lines.map((l) => ({ ...l })),
      },
    });
    for (const line of opts.lines) {
      if (lineAffectsStock(line) && line.productId) {
        await adjustProductStockInCache(line.productId ?? '', -line.qty);
      }
    }
    const now = new Date().toISOString();
    await upsertPendingInvoiceInCache({
      id,
      fiche_no: ficheNo,
      date: now.slice(0, 10),
      customer_name: opts.customerName.trim() || 'Perakende',
      net_amount: total,
      total_gross: totals.subtotal,
      status: 'approved',
      fiche_type: 'sales_invoice',
      trcode: 8,
      payment_method: opts.paymentMethod || 'Nakit',
      is_cancelled: false,
      notes: opts.notes?.trim() || 'Asin Mobile Fatura',
      total_vat: totals.totalVat,
      total_discount: totals.lineDiscount + totals.footerDiscount,
      currency: 'TRY',
      lines: opts.lines.map((l) => ({
        id: newUuid(),
        item_code: l.code ?? null,
        item_name: l.name,
        quantity: l.qty,
        unit_price: l.unitPrice,
        net_amount: invoiceLineNet(l),
        unit: l.unit || 'Adet',
      })),
      pending: true,
    });
    await useConnectivityStore.getState().refreshPendingCount();
    return { id, ficheNo, total, queued: true };
  }

  return createSalesInvoiceLive(opts, { id, ficheNo });
}

/** Basit alış faturası — trcode=1, stok artışı */
async function createPurchaseInvoiceLive(
  opts: {
    supplierId?: string;
    supplierName: string;
    notes?: string;
    paymentMethod?: string;
    lines: InvoiceDraftLine[];
  } & InvoiceCreateExtras,
  writeOpts?: Pick<InvoiceWriteOptions, 'id' | 'ficheNo'>,
): Promise<InvoiceWriteResult> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');

  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const items = saleItemsTable(fn, pn);
  const { useAuthStore } = await import('../store/authStore');

  const id = writeOpts?.id || newUuid();
  const ficheNo = writeOpts?.ficheNo || nextFicheNo('AF');
  const totals = invoiceTotalsFromLines(opts.lines, opts.footerDiscountAmount);
  const total = totals.net;
  const discountTotal = totals.lineDiscount + totals.footerDiscount;
  const user = useAuthStore.getState().user;
  const cashier = user?.fullName || user?.username || 'mobile';
  const supplierName = opts.supplierName.trim() || 'Tedarikçi';
  const documentNo = opts.documentNo?.trim() || ficheNo;
  const invDate = normalizeInvoiceDate(opts.invoiceDate);
  const currency = (opts.currency || 'TRY').trim() || 'TRY';
  const currencyRate =
    Number(opts.currencyRate) > 0 ? Number(opts.currencyRate) : 1;
  const headerFieldsJson = buildHeaderFieldsJson(opts, documentNo);

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name, store_id,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes, header_fields
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()),
       'purchase_invoice', 1, $7::uuid, $8, $9::uuid,
       $10, $11, $12, $13, $10,
       $14, $15, 'approved', $16, $17, $18, $19::jsonb
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      documentNo,
      invDate,
      opts.supplierId || null,
      supplierName,
      opts.storeId || null,
      total,
      totals.totalVat,
      totals.subtotal,
      discountTotal,
      currency,
      currencyRate,
      opts.paymentMethod || 'Nakit',
      cashier,
      opts.notes?.trim() || 'Asin Mobile Alış Faturası',
      headerFieldsJson,
    ],
  );

  for (const line of opts.lines) {
    await insertSaleItemRow(items, {
      invoiceId: id,
      firmNr: fn,
      periodNr: pn,
      line,
    });

    if (!lineAffectsStock(line)) continue;
    try {
      await pgQuery(
        `UPDATE ${productsTable(fn)}
         SET stock = COALESCE(stock, 0) + $1, updated_at = NOW()
         WHERE id::text = $2`,
        [line.qty, line.productId],
      );
    } catch {
      /* şema farkı */
    }
  }

  const pm = opts.paymentMethod || 'Nakit';
  // Peşin alışta tedarikçi borcu yok; veresiye / açık hesap → balance +=
  if (opts.supplierId && paymentMethodImpliesSupplierDebt(pm) && total > 0) {
    try {
      await adjustSupplierBalance(opts.supplierId, total);
    } catch {
      /* tedarikçi yoksa sessiz */
    }
  }

  // Peşin nakit/kart → KASA_CIKIS; peşin havale → BANKA_CIKIS (R5 P2)
  if (paymentMethodImpliesCashOutKasa(pm) && total > 0) {
    try {
      await recordKasaCikisForPurchase({
        amount: total,
        ficheNo,
        description: `Alış faturası — ${ficheNo}`,
        supplierId: opts.supplierId || null,
      });
    } catch {
      /* kasa yok / şema — alış yine geçerli */
    }
  } else if (paymentMethodImpliesBankTransfer(pm) && total > 0) {
    try {
      await recordBankaCikisForPurchase({
        amount: total,
        ficheNo,
        description: `Alış faturası (havale) — ${ficheNo}`,
      });
    } catch {
      /* banka yok / şema — alış yine geçerli */
    }
  }

  return { id, ficheNo, total };
}

export async function createPurchaseInvoice(
  opts: {
    supplierId?: string;
    supplierName: string;
    notes?: string;
    paymentMethod?: string;
    lines: InvoiceDraftLine[];
  } & InvoiceCreateExtras,
  writeOpts?: InvoiceWriteOptions,
): Promise<InvoiceWriteResult> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');

  const id = writeOpts?.id || newUuid();
  const ficheNo = writeOpts?.ficheNo || nextFicheNo('AF');
  const totals = invoiceTotalsFromLines(opts.lines, opts.footerDiscountAmount);
  const total = totals.net;
  const live = writeOpts?.forceLive === true || shouldUseLiveData();

  if (!live && !writeOpts?.skipQueue) {
    await enqueueMutation({
      type: 'invoice.purchase.create',
      payload: {
        localId: id,
        ficheNo,
        supplierId: opts.supplierId,
        supplierName: opts.supplierName,
        notes: opts.notes,
        paymentMethod: opts.paymentMethod,
        lines: opts.lines.map((l) => ({ ...l })),
      },
    });
    for (const line of opts.lines) {
      if (lineAffectsStock(line) && line.productId) {
        await adjustProductStockInCache(line.productId ?? '', line.qty);
      }
    }
    const now = new Date().toISOString();
    await upsertPendingInvoiceInCache({
      id,
      fiche_no: ficheNo,
      date: now.slice(0, 10),
      customer_name: opts.supplierName.trim() || 'Tedarikçi',
      net_amount: total,
      total_gross: totals.subtotal,
      status: 'approved',
      fiche_type: 'purchase_invoice',
      trcode: 1,
      payment_method: opts.paymentMethod || 'Nakit',
      is_cancelled: false,
      notes: opts.notes?.trim() || 'Asin Mobile Alış Faturası',
      total_vat: totals.totalVat,
      total_discount: totals.lineDiscount + totals.footerDiscount,
      currency: 'TRY',
      lines: opts.lines.map((l) => ({
        id: newUuid(),
        item_code: l.code ?? null,
        item_name: l.name,
        quantity: l.qty,
        unit_price: l.unitPrice,
        net_amount: invoiceLineNet(l),
        unit: l.unit || 'Adet',
      })),
      pending: true,
    });
    await useConnectivityStore.getState().refreshPendingCount();
    return { id, ficheNo, total, queued: true };
  }

  return createPurchaseInvoiceLive(opts, { id, ficheNo });
}

/**
 * İade faturası — Logo trcode:
 * - 3 satış iade: fiche_type=return_invoice, stok +, müşteri bakiyesi −
 * - 6 alış iade: fiche_type=purchase_invoice, stok −, tedarikçi bakiyesi −
 */
async function createReturnInvoiceLive(
  opts: {
    trcode: 3 | 6;
    accountId?: string;
    accountName: string;
    notes?: string;
    paymentMethod?: string;
    cashier?: string;
    returnReason?: string;
    lines: InvoiceDraftLine[];
  } & InvoiceCreateExtras,
  writeOpts?: Pick<InvoiceWriteOptions, 'id' | 'ficheNo'>,
): Promise<InvoiceWriteResult> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');

  const isSalesReturn = opts.trcode === 3;
  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const items = saleItemsTable(fn, pn);
  const { useAuthStore } = await import('../store/authStore');

  const id = writeOpts?.id || newUuid();
  const ficheNo = writeOpts?.ficheNo || nextFicheNo(isSalesReturn ? 'SI' : 'AI');
  const totals = invoiceTotalsFromLines(opts.lines, opts.footerDiscountAmount);
  const total = totals.net;
  const discountTotal = totals.lineDiscount + totals.footerDiscount;
  const user = useAuthStore.getState().user;
  const cashier =
    opts.cashier?.trim() || user?.fullName || user?.username || 'mobile';
  const accountName =
    opts.accountName.trim() || (isSalesReturn ? 'Perakende' : 'Tedarikçi');
  const documentNo = opts.documentNo?.trim() || ficheNo;
  const ficheType = isSalesReturn ? 'return_invoice' : 'purchase_invoice';
  const reasonNote = opts.returnReason?.trim();
  const notesParts = [
    opts.notes?.trim(),
    reasonNote ? `İade nedeni: ${reasonNote}` : null,
    'Asin Mobile İade',
  ].filter(Boolean);
  const notes = notesParts.join(' · ');

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, NOW(),
       $6, $7, $8::uuid, $9,
       $10, $11, $12, $13, $10,
       'TRY', 1, 'completed', $14, $15, $16
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      documentNo,
      ficheType,
      opts.trcode,
      opts.accountId || null,
      accountName,
      total,
      totals.totalVat,
      totals.subtotal,
      discountTotal,
      opts.paymentMethod || 'Nakit',
      cashier,
      notes,
    ],
  );

  // stok: 3 → +, 6 → −
  const stockSign = isSalesReturn ? 1 : -1;

  for (const line of opts.lines) {
    await insertSaleItemRow(items, {
      invoiceId: id,
      firmNr: fn,
      periodNr: pn,
      line,
    });

    if (!lineAffectsStock(line)) continue;
    try {
      await pgQuery(
        `UPDATE ${productsTable(fn)}
         SET stock = COALESCE(stock, 0) + $1, updated_at = NOW()
         WHERE id::text = $2`,
        [stockSign * line.qty, line.productId],
      );
    } catch {
      /* şema farkı */
    }
  }

  // Yan etki (V2-R14 / V2-R16 / R5 P2):
  // - Veresiye satış iade → müşteri bakiyesi −
  // - Peşin satış iade nakit/kart → KASA_CIKIS; havale → BANKA_CIKIS
  // - Açık hesap alış iade → tedarikçi bakiyesi −
  // - Peşin alış iade nakit/kart → KASA_GIRIS; havale → BANKA_GIRIS
  const pm = opts.paymentMethod || 'Nakit';
  if (total > 0) {
    try {
      if (isSalesReturn) {
        if (opts.accountId && paymentMethodImpliesCustomerDebt(pm)) {
          await adjustCustomerBalance(opts.accountId, -total);
        } else if (paymentMethodImpliesCashOutKasa(pm)) {
          await recordKasaCikisForReturn({
            amount: total,
            ficheNo,
            description: `Satış iadesi — ${ficheNo}`,
            customerId: opts.accountId || null,
          });
        } else if (paymentMethodImpliesBankTransfer(pm)) {
          await recordBankaCikisForReturn({
            amount: total,
            ficheNo,
            description: `Satış iadesi (havale) — ${ficheNo}`,
          });
        }
      } else if (opts.accountId && paymentMethodImpliesSupplierDebt(pm)) {
        await adjustSupplierBalance(opts.accountId, -total);
      } else if (paymentMethodImpliesCashOutKasa(pm)) {
        await recordKasaGirisForPurchaseReturn({
          amount: total,
          ficheNo,
          description: `Alış iadesi — ${ficheNo}`,
          supplierId: opts.accountId || null,
        });
      } else if (paymentMethodImpliesBankTransfer(pm)) {
        await recordBankaGirisForPurchaseReturn({
          amount: total,
          ficheNo,
          description: `Alış iadesi (havale) — ${ficheNo}`,
        });
      }
    } catch {
      /* kart/kasa/banka yoksa sessiz */
    }
  }

  return { id, ficheNo, total };
}

export async function createReturnInvoice(
  opts: {
    /** 3 = satış iade, 6 = alış iade */
    trcode: 3 | 6;
    accountId?: string;
    accountName: string;
    notes?: string;
    paymentMethod?: string;
    cashier?: string;
    returnReason?: string;
    lines: InvoiceDraftLine[];
  } & InvoiceCreateExtras,
  writeOpts?: InvoiceWriteOptions,
): Promise<InvoiceWriteResult> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');
  if (opts.trcode !== 3 && opts.trcode !== 6) {
    throw new Error('İade için trcode 3 veya 6 gerekli');
  }

  const isSalesReturn = opts.trcode === 3;
  const id = writeOpts?.id || newUuid();
  const ficheNo = writeOpts?.ficheNo || nextFicheNo(isSalesReturn ? 'SI' : 'AI');
  const totals = invoiceTotalsFromLines(opts.lines, opts.footerDiscountAmount);
  const total = totals.net;
  const live = writeOpts?.forceLive === true || shouldUseLiveData();

  if (!live && !writeOpts?.skipQueue) {
    await enqueueMutation({
      type: 'invoice.return.create',
      payload: {
        localId: id,
        ficheNo,
        trcode: opts.trcode,
        accountId: opts.accountId,
        accountName: opts.accountName,
        notes: opts.notes,
        paymentMethod: opts.paymentMethod,
        cashier: opts.cashier,
        returnReason: opts.returnReason,
        documentNo: opts.documentNo,
        lines: opts.lines.map((l) => ({ ...l })),
      },
    });
    const stockDelta = isSalesReturn ? 1 : -1;
    for (const line of opts.lines) {
      if (lineAffectsStock(line) && line.productId) {
        await adjustProductStockInCache(line.productId ?? '', stockDelta * line.qty);
      }
    }
    const now = new Date().toISOString();
    await upsertPendingInvoiceInCache({
      id,
      fiche_no: ficheNo,
      date: now.slice(0, 10),
      customer_name:
        opts.accountName.trim() || (isSalesReturn ? 'Perakende' : 'Tedarikçi'),
      net_amount: total,
      total_gross: totals.subtotal,
      status: 'completed',
      fiche_type: isSalesReturn ? 'return_invoice' : 'purchase_invoice',
      trcode: opts.trcode,
      payment_method: opts.paymentMethod || 'Nakit',
      is_cancelled: false,
      notes: opts.notes?.trim() || 'Asin Mobile İade',
      total_vat: totals.totalVat,
      total_discount: totals.lineDiscount + totals.footerDiscount,
      currency: 'TRY',
      lines: opts.lines.map((l) => ({
        id: newUuid(),
        item_code: l.code ?? null,
        item_name: l.name,
        quantity: l.qty,
        unit_price: l.unitPrice,
        net_amount: invoiceLineNet(l),
        unit: l.unit || 'Adet',
      })),
      pending: true,
    });
    await useConnectivityStore.getState().refreshPendingCount();
    return { id, ficheNo, total, queued: true };
  }

  return createReturnInvoiceLive(opts, { id, ficheNo });
}

export type InvoiceUpdatePatch = {
  notes?: string;
  status?: string;
  documentNo?: string;
  invoiceDate?: string;
  currency?: string;
  currencyRate?: number;
  headerFields?: InvoiceHeaderFieldsInput;
  /** Yalnızca status=draft|pending — stok/cari tersine çevirme yok */
  lines?: InvoiceDraftLine[];
  footerDiscountAmount?: number;
};

async function updateInvoiceHeaderLive(
  id: string,
  patch: InvoiceUpdatePatch,
): Promise<void> {
  if (!id) throw new Error('Fatura id gerekli');
  const table = salesTable();
  const itemsTable = saleItemsTable();

  const statusRes = await pgQuery<{ status: string | null }>(
    `SELECT status FROM ${table} WHERE id::text = $1 LIMIT 1`,
    [id],
  );
  const currentStatus = statusRes.rows[0]?.status ?? null;
  const allowLines = invoiceAllowsLineEdit(currentStatus);

  if (patch.lines !== undefined) {
    if (!allowLines) {
      throw new Error(
        'Kalem düzenleme yalnızca taslak (draft) faturalarda mümkündür. Onaylı fişte stok/cari yan etkisi için web formu kullanın.',
      );
    }
    if (!patch.lines.length) throw new Error('En az bir kalem gerekli');
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (patch.notes !== undefined) {
    sets.push(`notes = $${i++}`);
    vals.push(patch.notes.trim() || null);
  }
  if (patch.status !== undefined) {
    sets.push(`status = $${i++}`);
    vals.push(patch.status.trim() || null);
  }
  if (patch.documentNo !== undefined) {
    sets.push(`document_no = $${i++}`);
    vals.push(patch.documentNo.trim() || null);
  }
  if (patch.invoiceDate !== undefined) {
    const d = normalizeInvoiceDate(patch.invoiceDate);
    if (d) {
      sets.push(`date = $${i++}::timestamptz`);
      vals.push(d);
    }
  }
  if (patch.currency !== undefined) {
    sets.push(`currency = $${i++}`);
    vals.push((patch.currency || 'TRY').trim() || 'TRY');
  }
  if (patch.currencyRate !== undefined) {
    sets.push(`currency_rate = $${i++}`);
    vals.push(Number(patch.currencyRate) > 0 ? Number(patch.currencyRate) : 1);
  }
  if (patch.headerFields !== undefined) {
    sets.push(`header_fields = $${i++}::jsonb`);
    vals.push(JSON.stringify(patch.headerFields || {}));
  }

  if (patch.lines) {
    const totals = invoiceTotalsFromLines(patch.lines, patch.footerDiscountAmount);
    sets.push(`total_net = $${i++}`);
    vals.push(totals.net);
    sets.push(`net_amount = $${i++}`);
    vals.push(totals.net);
    sets.push(`total_vat = $${i++}`);
    vals.push(totals.totalVat);
    sets.push(`total_gross = $${i++}`);
    vals.push(totals.subtotal);
    sets.push(`total_discount = $${i++}`);
    vals.push(totals.lineDiscount + totals.footerDiscount);
  }

  if (sets.length) {
    vals.push(id);
    await pgQuery(`UPDATE ${table} SET ${sets.join(', ')} WHERE id::text = $${i}`, vals);
  }

  if (patch.lines) {
    await pgQuery(`DELETE FROM ${itemsTable} WHERE invoice_id::text = $1`, [id]);
    const fn = firmNr();
    const pn = periodNr();
    for (const line of patch.lines) {
      await insertSaleItemRow(itemsTable, {
        invoiceId: id,
        firmNr: fn,
        periodNr: pn,
        line,
      });
    }
  }
}

/** Mevcut fatura — header (+ draft ise kalem) güncelleme */
export async function updateInvoiceHeader(
  id: string,
  patch: InvoiceUpdatePatch,
  writeOpts?: InvoiceWriteOptions,
): Promise<{ queued?: boolean }> {
  if (!id) throw new Error('Fatura id gerekli');
  const live = writeOpts?.forceLive === true || shouldUseLiveData();

  if (!live && !writeOpts?.skipQueue) {
    const pending = await getPendingInvoiceById(id);
    if (pending) {
      await patchPendingInvoiceInCache(id, {
        notes: patch.notes,
        status: patch.status,
      });
      await enqueueMutation({
        type: 'invoice.header.update',
        payload: { invoiceId: id, ...patch },
      });
      await useConnectivityStore.getState().refreshPendingCount();
      return { queued: true };
    }
    if (getNetworkPolicy() === 'offline') {
      throw new Error('Çevrimdışı: yalnızca bekleyen faturalar düzenlenebilir');
    }
  }

  await updateInvoiceHeaderLive(id, patch);
  return {};
}

type DocumentSpec = {
  trcode: number;
  ficheType: string;
  prefix: string;
  party: 'customer' | 'supplier';
  applyCustomerDebt: boolean;
  applySupplierDebt: boolean;
  applyCashIn: boolean;
  /** Web Irsaliye/Siparis/Teklif stok=0; Hizmet de stok=0 */
  noteDefault: string;
  defaultStatus: 'approved' | 'draft';
};

const DOCUMENT_SPECS: Record<InvoiceDocumentKind, DocumentSpec> = {
  'service-given': {
    trcode: 9,
    ficheType: 'sales_invoice',
    prefix: 'HI',
    party: 'customer',
    applyCustomerDebt: true,
    applySupplierDebt: false,
    applyCashIn: true,
    noteDefault: 'Asin Mobile Verilen Hizmet',
    defaultStatus: 'approved',
  },
  'service-received': {
    trcode: 4,
    ficheType: 'purchase_invoice',
    prefix: 'HA',
    party: 'supplier',
    applyCustomerDebt: false,
    applySupplierDebt: true,
    applyCashIn: false,
    noteDefault: 'Asin Mobile Alınan Hizmet',
    defaultStatus: 'approved',
  },
  'waybill-sales': {
    trcode: 10,
    ficheType: 'waybill',
    prefix: 'IS',
    party: 'customer',
    applyCustomerDebt: false,
    applySupplierDebt: false,
    applyCashIn: false,
    noteDefault: 'Asin Mobile Satış İrsaliyesi',
    defaultStatus: 'approved',
  },
  'waybill-purchase': {
    trcode: 11,
    ficheType: 'waybill',
    prefix: 'IA',
    party: 'supplier',
    applyCustomerDebt: false,
    applySupplierDebt: false,
    applyCashIn: false,
    noteDefault: 'Asin Mobile Alış İrsaliyesi',
    defaultStatus: 'approved',
  },
  'order-sales': {
    trcode: 20,
    ficheType: 'order',
    prefix: 'SS',
    party: 'customer',
    applyCustomerDebt: false,
    applySupplierDebt: false,
    applyCashIn: false,
    noteDefault: 'Asin Mobile Satış Siparişi',
    defaultStatus: 'draft',
  },
  'order-purchase': {
    trcode: 21,
    ficheType: 'order',
    prefix: 'SA',
    party: 'supplier',
    applyCustomerDebt: false,
    applySupplierDebt: false,
    applyCashIn: false,
    noteDefault: 'Asin Mobile Satınalma Siparişi',
    defaultStatus: 'draft',
  },
  quote: {
    trcode: 30,
    ficheType: 'quote',
    prefix: 'TK',
    party: 'customer',
    applyCustomerDebt: false,
    applySupplierDebt: false,
    applyCashIn: false,
    noteDefault: 'Asin Mobile Teklif',
    defaultStatus: 'draft',
  },
};

export function isInvoiceDocumentKind(kind: string): kind is InvoiceDocumentKind {
  return kind in DOCUMENT_SPECS;
}

export function documentSpecForKind(
  kind: InvoiceDocumentKind,
  trcodeOverride?: number,
): DocumentSpec {
  const base = DOCUMENT_SPECS[kind];
  if (trcodeOverride != null && trcodeOverride > 0 && trcodeOverride !== base.trcode) {
    return { ...base, trcode: trcodeOverride };
  }
  return base;
}

/**
 * Hizmet / irsaliye / sipariş / teklif create — web UniversalInvoice trcode + fiche_type.
 * Stok yok (web `invoiceLineStockDelta` Irsaliye/Siparis/Teklif/Hizmet = 0).
 * Hizmet: cari borç (veresiye) + verilen hizmette peşin kasa.
 */
async function createDocumentInvoiceLive(
  kind: InvoiceDocumentKind,
  opts: {
    accountId?: string;
    accountName: string;
    notes?: string;
    paymentMethod?: string;
    lines: InvoiceDraftLine[];
    trcodeOverride?: number;
  } & InvoiceCreateExtras,
  writeOpts?: Pick<InvoiceWriteOptions, 'id' | 'ficheNo'>,
): Promise<InvoiceWriteResult> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');

  const spec = documentSpecForKind(kind, opts.trcodeOverride);
  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const items = saleItemsTable(fn, pn);
  const { useAuthStore } = await import('../store/authStore');

  const id = writeOpts?.id || newUuid();
  const ficheNo = writeOpts?.ficheNo || nextFicheNo(spec.prefix);
  const totals = invoiceTotalsFromLines(opts.lines, opts.footerDiscountAmount);
  const total = totals.net;
  const discountTotal = totals.lineDiscount + totals.footerDiscount;
  const user = useAuthStore.getState().user;
  const cashier = user?.fullName || user?.username || 'mobile';
  const accountName =
    opts.accountName.trim() ||
    (spec.party === 'supplier' ? 'Tedarikçi' : 'Perakende');
  const documentNo = opts.documentNo?.trim() || ficheNo;
  const invDate = normalizeInvoiceDate(opts.invoiceDate);
  const currency = (opts.currency || 'TRY').trim() || 'TRY';
  const currencyRate =
    Number(opts.currencyRate) > 0 ? Number(opts.currencyRate) : 1;
  const headerFieldsJson = buildHeaderFieldsJson(opts, documentNo);

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name, store_id,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes, header_fields
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()),
       $7, $8, $9::uuid, $10, $11::uuid,
       $12, $13, $14, $15, $12,
       $16, $17, $18, $19, $20, $21, $22::jsonb
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      documentNo,
      invDate,
      spec.ficheType,
      spec.trcode,
      opts.accountId || null,
      accountName,
      opts.storeId || null,
      total,
      totals.totalVat,
      totals.subtotal,
      discountTotal,
      currency,
      currencyRate,
      spec.defaultStatus,
      opts.paymentMethod || 'Nakit',
      cashier,
      opts.notes?.trim() || spec.noteDefault,
      headerFieldsJson,
    ],
  );

  for (const line of opts.lines) {
    await insertSaleItemRow(items, {
      invoiceId: id,
      firmNr: fn,
      periodNr: pn,
      line,
    });
  }

  const pm = opts.paymentMethod || 'Nakit';
  if (total > 0) {
    try {
      if (spec.applyCustomerDebt && opts.accountId && paymentMethodImpliesCustomerDebt(pm)) {
        await adjustCustomerBalance(opts.accountId, total);
      } else if (
        spec.applySupplierDebt &&
        opts.accountId &&
        paymentMethodImpliesSupplierDebt(pm)
      ) {
        await adjustSupplierBalance(opts.accountId, total);
      }
      if (spec.applyCashIn && paymentMethodImpliesCashInKasa(pm)) {
        await recordKasaGirisForSale({
          amount: total,
          ficheNo,
          description: `${spec.noteDefault} — ${ficheNo}`,
          customerId: opts.accountId || null,
          registerId: opts.cashRegisterId || null,
        });
      } else if (spec.applyCashIn && paymentMethodImpliesBankTransfer(pm)) {
        await recordBankaGirisForSale({
          amount: total,
          ficheNo,
          description: `${spec.noteDefault} (havale) — ${ficheNo}`,
        });
      }
    } catch {
      /* kart/kasa/banka yoksa sessiz */
    }
  }

  return { id, ficheNo, total };
}

export async function createDocumentInvoice(
  kind: InvoiceDocumentKind,
  opts: {
    accountId?: string;
    accountName: string;
    notes?: string;
    paymentMethod?: string;
    lines: InvoiceDraftLine[];
    trcodeOverride?: number;
  } & InvoiceCreateExtras,
  writeOpts?: InvoiceWriteOptions,
): Promise<InvoiceWriteResult> {
  if (!opts.lines.length) throw new Error('En az bir kalem gerekli');
  if (!isInvoiceDocumentKind(kind)) {
    throw new Error(`Geçersiz belge türü: ${kind}`);
  }

  const spec = documentSpecForKind(kind, opts.trcodeOverride);
  const id = writeOpts?.id || newUuid();
  const ficheNo = writeOpts?.ficheNo || nextFicheNo(spec.prefix);
  const totals = invoiceTotalsFromLines(opts.lines, opts.footerDiscountAmount);
  const total = totals.net;
  const live = writeOpts?.forceLive === true || shouldUseLiveData();

  if (!live && !writeOpts?.skipQueue) {
    await enqueueMutation({
      type: 'invoice.document.create',
      payload: {
        localId: id,
        ficheNo,
        kind,
        trcode: spec.trcode,
        accountId: opts.accountId,
        accountName: opts.accountName,
        notes: opts.notes,
        paymentMethod: opts.paymentMethod,
        documentNo: opts.documentNo,
        footerDiscountAmount: opts.footerDiscountAmount,
        lines: opts.lines.map((l) => ({ ...l })),
      },
    });
    const now = new Date().toISOString();
    await upsertPendingInvoiceInCache({
      id,
      fiche_no: ficheNo,
      date: now.slice(0, 10),
      customer_name: opts.accountName.trim() || accountFallback(spec),
      net_amount: total,
      total_gross: totals.subtotal,
      status: spec.defaultStatus,
      fiche_type: spec.ficheType,
      trcode: spec.trcode,
      payment_method: opts.paymentMethod || 'Nakit',
      is_cancelled: false,
      notes: opts.notes?.trim() || spec.noteDefault,
      total_vat: totals.totalVat,
      total_discount: totals.lineDiscount + totals.footerDiscount,
      currency: 'TRY',
      lines: opts.lines.map((l) => ({
        id: newUuid(),
        item_code: l.code ?? null,
        item_name: l.name,
        quantity: l.qty,
        unit_price: l.unitPrice,
        net_amount: invoiceLineNet(l),
        unit: l.unit || 'Adet',
      })),
      pending: true,
    });
    await useConnectivityStore.getState().refreshPendingCount();
    return { id, ficheNo, total, queued: true };
  }

  return createDocumentInvoiceLive(kind, opts, { id, ficheNo });
}

function accountFallback(spec: DocumentSpec): string {
  return spec.party === 'supplier' ? 'Tedarikçi' : 'Perakende';
}

/** Liste filtresinden form kind + opsiyonel trcode (12/13 irsaliye vb.) */
export function invoiceFormParamsFromFilter(
  filter?: InvoiceListFilter,
): { kind: InvoiceFormKind; trcode?: number } | null {
  if (!filter || filter.preset === 'all') return null;
  const tc = filter.trcode;
  switch (filter.preset) {
    case 'service-given':
      return { kind: 'service-given', trcode: tc ?? 9 };
    case 'service-received':
      return { kind: 'service-received', trcode: tc ?? 4 };
    case 'waybill':
      if (tc === 11 || tc === 13) return { kind: 'waybill-purchase', trcode: tc };
      return { kind: 'waybill-sales', trcode: tc ?? 10 };
    case 'order':
      if (tc === 21) return { kind: 'order-purchase', trcode: 21 };
      return { kind: 'order-sales', trcode: tc ?? 20 };
    case 'quote':
      return { kind: 'quote', trcode: tc ?? 30 };
    case 'purchase-request':
      return { kind: 'order-sales', trcode: tc ?? 20 };
    case 'sales':
      return { kind: 'sales' };
    case 'purchase':
      return { kind: 'purchase' };
    case 'sales-return':
      return { kind: 'sales-return' };
    case 'purchase-return':
      return { kind: 'purchase-return' };
    default:
      return null;
  }
}
