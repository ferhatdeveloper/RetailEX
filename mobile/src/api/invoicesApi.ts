import { pgQuery } from './pgClient';
import {
  appendStoreIdFilter,
  firmNr,
  newUuid,
  periodNr,
  productsTable,
  saleItemsTable,
  salesTable,
} from './erpTables';
import {
  buildInvoiceFilterClause,
  type InvoiceListFilter,
} from './invoiceFilters';
import {
  adjustCustomerBalance,
  adjustSupplierBalance,
  recordBankaGirisForPurchaseReturn,
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
  type InvoiceLineInput,
} from '../offline/mutationQueue';
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
  const table = salesTable();
  const fc = buildInvoiceFilterClause(filter, 1);
  try {
    const params: unknown[] = [...fc.params];
    const storeSql = appendStoreIdFilter('store_id', params);
    const res = await pgQuery<{ cnt: string | number; total: string | number }>(
      `SELECT COUNT(*)::int AS cnt,
              COALESCE(SUM(COALESCE(net_amount, total_net, total_gross, 0)), 0)::float8 AS total
       FROM ${table}
       WHERE COALESCE(is_cancelled, false) = false${fc.sql}${storeSql}`,
      params,
    );
    const r = res.rows[0];
    return { count: Number(r?.cnt ?? 0), total: Number(r?.total ?? 0) };
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
  const table = salesTable();
  const purchaseCond = kindSqlWhere('purchase');
  const salesCond = kindSqlWhere('sales');
  try {
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
  } catch {
    return { salesTotal: 0, salesCount: 0, purchaseTotal: 0, purchaseCount: 0 };
  }
}

export type InvoiceLine = {
  id: string;
  item_code: string | null;
  item_name: string | null;
  quantity: number;
  unit_price: number;
  net_amount: number;
  unit: string | null;
};

export type InvoiceDetail = InvoiceRow & {
  notes: string | null;
  total_vat: number;
  total_discount: number;
  currency: string | null;
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

  const hRes = await pgQuery<InvoiceRow & {
    notes: string | null;
    total_vat: number;
    total_discount: number;
    currency: string | null;
  }>(
    `SELECT id, fiche_no, date::text AS date, customer_name,
            COALESCE(net_amount, total_net, total_gross, 0)::float8 AS net_amount,
            COALESCE(total_gross, 0)::float8 AS total_gross,
            status, fiche_type, trcode, payment_method,
            COALESCE(is_cancelled, false) AS is_cancelled,
            notes,
            COALESCE(total_vat, 0)::float8 AS total_vat,
            COALESCE(total_discount, 0)::float8 AS total_discount,
            currency
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

  return { ...row, lines };
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
};

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

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, NOW(),
       'sales_invoice', 8, $6::uuid, $7,
       $8, $9, $10, $11, $8,
       'TRY', 1, 'approved', $12, $13, $14
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      documentNo,
      opts.customerId || null,
      customerName,
      total,
      totals.totalVat,
      totals.subtotal,
      discountTotal,
      opts.paymentMethod || 'Nakit',
      cashier,
      opts.notes?.trim() || 'RetailEX Mobile Fatura',
    ],
  );

  for (const line of opts.lines) {
    await insertSaleItemRow(items, {
      invoiceId: id,
      firmNr: fn,
      periodNr: pn,
      line,
    });

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
      });
    } catch {
      /* kasa yoksa sessiz */
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
      await adjustProductStockInCache(line.productId, -line.qty);
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
      notes: opts.notes?.trim() || 'RetailEX Mobile Fatura',
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

  await pgQuery(
    `INSERT INTO ${sales} (
       id, firm_nr, period_nr, fiche_no, document_no, date,
       fiche_type, trcode, customer_id, customer_name,
       total_net, total_vat, total_gross, total_discount, net_amount,
       currency, currency_rate, status, payment_method, cashier, notes
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, NOW(),
       'purchase_invoice', 1, $6::uuid, $7,
       $8, $9, $10, $11, $8,
       'TRY', 1, 'approved', $12, $13, $14
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      documentNo,
      opts.supplierId || null,
      supplierName,
      total,
      totals.totalVat,
      totals.subtotal,
      discountTotal,
      opts.paymentMethod || 'Nakit',
      cashier,
      opts.notes?.trim() || 'RetailEX Mobile Alış Faturası',
    ],
  );

  for (const line of opts.lines) {
    await insertSaleItemRow(items, {
      invoiceId: id,
      firmNr: fn,
      periodNr: pn,
      line,
    });

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

  // Peşin nakit/kart → KASA_CIKIS (R5 tamamı)
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
      await adjustProductStockInCache(line.productId, line.qty);
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
      notes: opts.notes?.trim() || 'RetailEX Mobile Alış Faturası',
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
    'RetailEX Mobile İade',
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

  // Yan etki (V2-R14 / V2-R16):
  // - Veresiye satış iade → müşteri bakiyesi −
  // - Peşin satış iade → KASA_CIKIS (cariye dokunma; peşin satışta borç oluşmamıştı)
  // - Açık hesap alış iade → tedarikçi bakiyesi −
  // - Peşin alış iade nakit/kart → KASA_GIRIS (alış KASA_CIKIS simetrisi)
  // - Peşin alış iade havale → BANKA_GIRIS (varsayılan banka varsa)
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
      await adjustProductStockInCache(line.productId, stockDelta * line.qty);
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
      notes: opts.notes?.trim() || 'RetailEX Mobile İade',
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

async function updateInvoiceHeaderLive(
  id: string,
  patch: { notes?: string; status?: string },
): Promise<void> {
  if (!id) throw new Error('Fatura id gerekli');
  const table = salesTable();
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
  if (!sets.length) return;

  vals.push(id);
  await pgQuery(`UPDATE ${table} SET ${sets.join(', ')} WHERE id::text = $${i}`, vals);
}

/** Mevcut fatura — not ve durum güncelleme (mobil düzenleme) */
export async function updateInvoiceHeader(
  id: string,
  patch: { notes?: string; status?: string },
  writeOpts?: InvoiceWriteOptions,
): Promise<{ queued?: boolean }> {
  if (!id) throw new Error('Fatura id gerekli');
  const live = writeOpts?.forceLive === true || shouldUseLiveData();

  if (!live && !writeOpts?.skipQueue) {
    const pending = await getPendingInvoiceById(id);
    if (pending) {
      await patchPendingInvoiceInCache(id, patch);
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
    noteDefault: 'RetailEX Mobile Verilen Hizmet',
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
    noteDefault: 'RetailEX Mobile Alınan Hizmet',
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
    noteDefault: 'RetailEX Mobile Satış İrsaliyesi',
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
    noteDefault: 'RetailEX Mobile Alış İrsaliyesi',
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
    noteDefault: 'RetailEX Mobile Satış Siparişi',
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
    noteDefault: 'RetailEX Mobile Satınalma Siparişi',
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
    noteDefault: 'RetailEX Mobile Teklif',
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
       'TRY', 1, $14, $15, $16, $17
     )`,
    [
      id,
      fn,
      pn,
      ficheNo,
      documentNo,
      spec.ficheType,
      spec.trcode,
      opts.accountId || null,
      accountName,
      total,
      totals.totalVat,
      totals.subtotal,
      discountTotal,
      spec.defaultStatus,
      opts.paymentMethod || 'Nakit',
      cashier,
      opts.notes?.trim() || spec.noteDefault,
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
        });
      }
    } catch {
      /* kart/kasa yoksa sessiz */
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
