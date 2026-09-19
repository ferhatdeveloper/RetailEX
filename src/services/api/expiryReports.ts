import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { localCalendarDateKey, localTodayDateKey, toSqlDateInputString } from '../../utils/localCalendarDate';
import {
  EXPIRY_REPORT_DEFAULT_DAYS,
  expiryRangeBounds,
  isExpiryYmdInRange,
  type ExpiryRangeBounds,
} from '../../utils/expiryReportRange';
import { looksLikeUuid } from '../../utils/pgUuid';
import { PURCHASE_ONLY_TRCODES } from '../../utils/lastPurchaseCostSql';
import {
  buildExpiryPurchaseReturnInvoice,
  canReturnExpiringPurchase,
  clampExpiryReturnQty,
  isAlreadyReturnDocument,
} from '../../utils/expiryPurchaseReturn';
import {
  expiryLotMatchKey,
  finalizeExpiryReportQuantities,
} from '../../utils/expiryReportQuantity';
import { invoicesAPI } from './invoices';
import type { Invoice } from '../../core/types';

export {
  EXPIRY_REPORT_ALL_FUTURE,
  EXPIRY_REPORT_ALL_RECORDED,
  EXPIRY_REPORT_DEFAULT_DAYS,
  addDaysYmd,
  expiryRangeBounds,
  isExpiryYmdInRange,
  normalizeExpiryLimitDays,
} from '../../utils/expiryReportRange';
export type { ExpiryRangeBounds } from '../../utils/expiryReportRange';

export interface ExpiringPurchaseItem {
  invoiceId: string;
  invoiceNo: string;
  invoiceDate: string;
  supplierId?: string;
  supplierName: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  batchNo?: string;
  daysLeft: number;
  productId?: string;
  unitPrice?: number;
  vatRate?: number;
  discountRate?: number;
  saleItemId?: string;
  trcode?: number;
  ficheType?: string;
  paymentMethod?: string;
}

/** Logo alış trcode — invoices.TRCODES_BY_INVOICE_CATEGORY.Alis + alış iade (6) */
const PURCHASE_TRCODES = [1, 4, 5, 6, 13, 26, 41, 42] as const;

function isPurchaseSaleRow(sale: Record<string, unknown>): boolean {
  const trcode = Number(sale.trcode ?? sale.invoice_type ?? 0);
  const fiche = String(sale.fiche_type ?? '').toLowerCase();
  if (PURCHASE_TRCODES.includes(trcode as (typeof PURCHASE_TRCODES)[number])) return true;
  return fiche === 'purchase_invoice' || fiche === 'a';
}

function isPurchaseSourceSaleRow(sale: Record<string, unknown>): boolean {
  const trcode = Number(sale.trcode ?? sale.invoice_type ?? 0);
  const fiche = String(sale.fiche_type ?? '').toLowerCase();
  if (isAlreadyReturnDocument(trcode, fiche)) return false;
  if (PURCHASE_ONLY_TRCODES.includes(trcode as (typeof PURCHASE_ONLY_TRCODES)[number])) return true;
  return fiche === 'purchase_invoice' || fiche === 'a';
}

/** PG DATE / ISO / Date → YYYY-MM-DD (UTC gece kayması olmadan) */
function expiryYmd(value: unknown): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) return localCalendarDateKey(value);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return localCalendarDateKey(s);
  return toSqlDateInputString(s) || localCalendarDateKey(s);
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split('-').map((x) => parseInt(x, 10));
  const [ty, tm, td] = toYmd.split('-').map((x) => parseInt(x, 10));
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

function optionalText(value: unknown): string | undefined {
  const s = String(value ?? '').trim();
  return s ? s : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function rowToExpiringItem(row: Record<string, unknown>, todayYmd?: string): ExpiringPurchaseItem {
  const expiry = expiryYmd(row.expiry_date);
  const today = todayYmd || localTodayDateKey();
  const daysLeft = expiry ? daysBetweenYmd(today, expiry) : 0;
  const productId = optionalText(row.product_id);
  const itemCode = String(row.item_code ?? '');
  return {
    invoiceId: String(row.invoice_id ?? ''),
    invoiceNo: String(row.invoice_no ?? ''),
    invoiceDate: expiryYmd(row.invoice_date) || String(row.invoice_date ?? '').slice(0, 10),
    supplierId: optionalText(row.supplier_id),
    supplierName: String(row.supplier_name ?? ''),
    itemCode,
    itemName: String(row.item_name ?? ''),
    quantity: Number(row.quantity ?? 0),
    unit: String(row.unit ?? ''),
    expiryDate: expiry,
    batchNo: optionalText(row.batch_no),
    daysLeft,
    productId: productId || (looksLikeUuid(itemCode) ? itemCode : undefined),
    unitPrice: optionalNumber(row.unit_price),
    vatRate: optionalNumber(row.vat_rate),
    discountRate: optionalNumber(row.discount_rate),
    saleItemId: optionalText(row.sale_item_id ?? row.id),
    trcode: optionalNumber(row.trcode),
    ficheType: optionalText(row.fiche_type),
    paymentMethod: optionalText(row.payment_method),
  };
}

function sqlExpiryPredicate(columnExpr: string, bounds: ExpiryRangeBounds, params: string[]): string {
  const parts: string[] = [`${columnExpr} IS NOT NULL`];
  if (bounds.fromYmd) {
    params.push(bounds.fromYmd);
    parts.push(`${columnExpr}::date >= $${params.length}::date`);
  }
  if (bounds.toYmd) {
    params.push(bounds.toYmd);
    parts.push(`${columnExpr}::date <= $${params.length}::date`);
  }
  return parts.join('\n          AND ');
}

function restExpiryFilters(bounds: ExpiryRangeBounds): Record<string, string> {
  if (!bounds.fromYmd && !bounds.toYmd) return { expiry_date: 'not.is.null' };
  if (bounds.fromYmd && bounds.toYmd) {
    return { and: `(expiry_date.gte.${bounds.fromYmd},expiry_date.lte.${bounds.toYmd})` };
  }
  if (bounds.fromYmd) return { expiry_date: `gte.${bounds.fromYmd}` };
  return { expiry_date: `lte.${bounds.toYmd}` };
}

function queryOpts(fn: string, pn: string) {
  return { firmNr: fn, periodNr: pn };
}

function mergeExpiryRows(chunks: ExpiringPurchaseItem[]): ExpiringPurchaseItem[] {
  const seen = new Set<string>();
  const out: ExpiringPurchaseItem[] = [];
  for (const row of chunks) {
    if (!row.expiryDate) continue;
    const key = `${row.invoiceId}|${row.itemCode}|${row.expiryDate}|${row.batchNo || ''}|${row.itemName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  out.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.itemName.localeCompare(b.itemName, 'tr'));
  return out;
}

function lotExpiryRaw(row: Record<string, unknown>): unknown {
  return row.expiration_date ?? row.expiry_date ?? row.expire_date ?? null;
}

/**
 * Envanter Listesi ile aynı kaynak: rex_{fn}_products.stock
 * Anahtarlar: id:{uuid} ve code:{kod} (satır eşlemesi için)
 */
async function fetchProductStockMap(
  fn: string,
  pn: string,
  rows: ExpiringPurchaseItem[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!rows.length) return map;

  const ids = Array.from(
    new Set(rows.map((r) => String(r.productId || '').trim()).filter(Boolean)),
  );
  const codes = Array.from(
    new Set(rows.map((r) => String(r.itemCode || '').trim()).filter(Boolean)),
  );

  try {
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      const { postgrest } = await import('./postgrestClient');
      const productsTable = `rex_${fn}_products`;
      const fetched: Record<string, unknown>[] = [];
      if (ids.length) {
        const part = await postgrest
          .get<Record<string, unknown>[]>(
            `/${productsTable}`,
            {
              select: 'id,code,stock',
              id: `in.(${ids.join(',')})`,
              limit: '5000',
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]);
        fetched.push(...part);
      }
      const missingCodes = codes.filter((c) => !fetched.some((p) => String(p.code || '') === c));
      if (missingCodes.length) {
        const part = await postgrest
          .get<Record<string, unknown>[]>(
            `/${productsTable}`,
            {
              select: 'id,code,stock',
              code: `in.(${missingCodes.join(',')})`,
              limit: '5000',
            },
            { schema: 'public' },
          )
          .catch(() => [] as Record<string, unknown>[]);
        fetched.push(...part);
      }
      for (const p of fetched) {
        const stock = Math.max(0, Number(p.stock) || 0);
        const id = String(p.id || '').trim();
        const code = String(p.code || '').trim();
        if (id) map.set(`id:${id}`, stock);
        if (code) map.set(`code:${code}`, stock);
      }
      return map;
    }

    const productsTable = `rex_${fn}_products`;
    const params: string[] = [];
    const clauses: string[] = [];
    if (ids.length) {
      const placeholders = ids.map((id) => {
        params.push(id);
        return `$${params.length}`;
      });
      clauses.push(`p.id::text IN (${placeholders.join(', ')})`);
    }
    if (codes.length) {
      const placeholders = codes.map((code) => {
        params.push(code);
        return `$${params.length}`;
      });
      clauses.push(`p.code IN (${placeholders.join(', ')})`);
    }
    if (!clauses.length) return map;

    const { rows: productRows } = await postgres.query(
      `
        SELECT p.id, p.code, COALESCE(p.stock, 0) AS stock
        FROM ${productsTable} p
        WHERE ${clauses.join(' OR ')}
      `,
      params,
      queryOpts(fn, pn),
    );
    for (const p of productRows) {
      const stock = Math.max(0, Number(p.stock) || 0);
      const id = String(p.id || '').trim();
      const code = String(p.code || '').trim();
      if (id) map.set(`id:${id}`, stock);
      if (code) map.set(`code:${code}`, stock);
    }
  } catch (e) {
    console.warn('[expiryReports] ürün stokları okunamadı:', e);
  }
  return map;
}

export const expiryReportsAPI = {
  async getExpiringPurchaseItems(daysAhead = EXPIRY_REPORT_DEFAULT_DAYS): Promise<ExpiringPurchaseItem[]> {
    const fn = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
    const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
    const todayYmd = localTodayDateKey();
    const bounds = expiryRangeBounds(daysAhead, todayYmd);

    const settled = DB_SETTINGS.connectionProvider === 'rest_api'
      ? await Promise.allSettled([
          fetchPurchaseItemsRest(fn, pn, todayYmd, bounds),
          fetchProductCardItemsRest(fn, todayYmd, bounds),
          fetchLotItemsRest(fn, todayYmd, bounds),
        ])
      : await Promise.allSettled([
          fetchPurchaseItemsSql(fn, pn, todayYmd, bounds),
          fetchProductCardItemsSql(fn, pn, todayYmd, bounds),
          fetchLotItemsSql(fn, pn, todayYmd, bounds),
        ]);

    const purchaseRows = settled[0].status === 'fulfilled' ? settled[0].value : [];
    const productRows = settled[1].status === 'fulfilled' ? settled[1].value : [];
    const lotRows = settled[2].status === 'fulfilled' ? settled[2].value : [];
    if (
      settled[0].status === 'rejected' &&
      settled[1].status === 'rejected' &&
      settled[2].status === 'rejected'
    ) {
      throw settled[0].reason || settled[1].reason || settled[2].reason;
    }
    for (const r of settled) {
      if (r.status === 'rejected') {
        console.warn('[expiryReports] SKT kaynağı atlandı:', r.reason);
      }
    }

    const lotQtyByKey = new Map<string, number>();
    for (const row of lotRows) {
      const key = expiryLotMatchKey(row);
      lotQtyByKey.set(key, Math.max(0, Number(row.quantity) || 0));
    }

    const merged = mergeExpiryRows([...purchaseRows, ...productRows, ...lotRows]);
    const inRange = merged.filter((row) => isExpiryYmdInRange(row.expiryDate, bounds));
    const stockByProductKey = await fetchProductStockMap(fn, pn, inRange);
    const aligned = finalizeExpiryReportQuantities(inRange, stockByProductKey, lotQtyByKey);
    aligned.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.itemName.localeCompare(b.itemName, 'tr'));
    return aligned;
  },

  async resolveReturnSource(row: ExpiringPurchaseItem): Promise<ExpiringPurchaseItem | null> {
    if (isAlreadyReturnDocument(row.trcode, row.ficheType)) return null;
    if (canReturnExpiringPurchase(row)) return row;
    const last = await fetchLastPurchaseForProduct(row.productId, row.itemCode);
    if (!last) return null;
    return {
      ...row,
      invoiceId: last.invoiceId || row.invoiceId,
      invoiceNo: last.invoiceNo || row.invoiceNo,
      invoiceDate: last.invoiceDate || row.invoiceDate,
      supplierId: last.supplierId || row.supplierId,
      supplierName: last.supplierName || row.supplierName,
      productId: row.productId || last.productId,
      unitPrice: (row.unitPrice && row.unitPrice > 0) ? row.unitPrice : last.unitPrice,
      vatRate: row.vatRate ?? last.vatRate,
      discountRate: row.discountRate ?? last.discountRate,
      saleItemId: last.saleItemId || row.saleItemId,
      trcode: last.trcode,
      ficheType: last.ficheType,
      paymentMethod: last.paymentMethod || row.paymentMethod,
    };
  },

  async createPurchaseReturn(source: ExpiringPurchaseItem, quantity: number): Promise<Invoice> {
    const resolved = (await this.resolveReturnSource(source)) || source;
    if (!canReturnExpiringPurchase(resolved)) {
      throw new Error('NO_SUPPLIER');
    }
    const qty = clampExpiryReturnQty(quantity, Number(resolved.quantity) || 0);
    if (qty <= 0) throw new Error('INVALID_QTY');
    const invoice = buildExpiryPurchaseReturnInvoice({
      source: resolved,
      quantity: qty,
      firmaId: String(ERP_SETTINGS.firmNr || '0'),
      donemId: String(ERP_SETTINGS.periodNr || '01'),
    });
    const saved = await invoicesAPI.create(invoice);
    if (!saved) throw new Error('CREATE_FAILED');
    return saved;
  },
};

async function fetchPurchaseItemsSql(
  fn: string,
  pn: string,
  todayYmd: string,
  bounds: ExpiryRangeBounds,
): Promise<ExpiringPurchaseItem[]> {
  const salesTable = `rex_${fn}_${pn}_sales`;
  const itemsTable = `rex_${fn}_${pn}_sale_items`;
  const suppliersTable = `rex_${fn}_suppliers`;
  const customersTable = `rex_${fn}_customers`;
  const purchaseTrcodeIn = PURCHASE_TRCODES.join(', ');
  const params: string[] = [];
  const dateFilterSql = sqlExpiryPredicate('it.expiry_date', bounds, params);

  const { rows } = await postgres.query(
    `
        SELECT
          s.id AS invoice_id,
          s.fiche_no AS invoice_no,
          s.date AS invoice_date,
          s.customer_id AS supplier_id,
          COALESCE(NULLIF(TRIM(sup.name), ''), NULLIF(TRIM(c.name), ''), s.customer_name, '') AS supplier_name,
          it.id AS sale_item_id,
          it.product_id,
          it.item_code,
          it.item_name,
          it.quantity,
          it.unit,
          it.unit_price,
          it.vat_rate,
          it.discount_rate,
          it.expiry_date,
          it.batch_no,
          s.trcode,
          s.fiche_type,
          s.payment_method
        FROM ${itemsTable} it
        INNER JOIN ${salesTable} s ON s.id = it.invoice_id
        LEFT JOIN ${suppliersTable} sup ON sup.id = s.customer_id
        LEFT JOIN ${customersTable} c ON c.id = s.customer_id
        WHERE ${dateFilterSql}
          AND (
            COALESCE(s.trcode, 0) IN (${purchaseTrcodeIn})
            OR LOWER(COALESCE(s.fiche_type, '')) IN ('purchase_invoice', 'a')
          )
          AND COALESCE(s.is_cancelled, false) = false
        ORDER BY it.expiry_date ASC, it.item_name ASC
      `,
    params,
    queryOpts(fn, pn),
  );
  return rows.map((row) => rowToExpiringItem(row, todayYmd));
}

async function fetchProductCardItemsSql(
  fn: string,
  pn: string,
  todayYmd: string,
  bounds: ExpiryRangeBounds,
): Promise<ExpiringPurchaseItem[]> {
  const productsTable = `rex_${fn}_products`;
  const params: string[] = [];
  const dateFilterSql = sqlExpiryPredicate('p.expiry_date', bounds, params);
  const { rows } = await postgres.query(
    `
        SELECT
          '' AS invoice_id,
          '' AS invoice_no,
          NULL AS invoice_date,
          NULL AS supplier_id,
          '' AS supplier_name,
          p.id AS product_id,
          p.code AS item_code,
          COALESCE(NULLIF(TRIM(p.name), ''), p.code, '') AS item_name,
          COALESCE(p.stock, 0) AS quantity,
          COALESCE(p.unit, '') AS unit,
          p.expiry_date,
          NULL AS batch_no
        FROM ${productsTable} p
        WHERE ${dateFilterSql}
          AND COALESCE(p.is_active, true) = true
      `,
    params,
    queryOpts(fn, pn),
  );
  return rows.map((row) => rowToExpiringItem(row, todayYmd));
}

async function fetchLotItemsSql(
  fn: string,
  pn: string,
  todayYmd: string,
  bounds: ExpiryRangeBounds,
): Promise<ExpiringPurchaseItem[]> {
  const lotsTable = `rex_${fn}_lots`;
  const productsTable = `rex_${fn}_products`;
  const attempts: string[][] = [
    ['expiration_date', 'expiry_date'],
    ['expiration_date'],
    ['expiry_date'],
  ];
  let lastErr: unknown;
  for (const cols of attempts) {
    const expr = cols.length === 1 ? `lot.${cols[0]}` : `COALESCE(${cols.map((c) => `lot.${c}`).join(', ')})`;
    const params: string[] = [];
    const dateFilterSql = sqlExpiryPredicate(expr, bounds, params);
    try {
      const { rows } = await postgres.query(
        `
            SELECT
              '' AS invoice_id,
              '' AS invoice_no,
              NULL AS invoice_date,
              NULL AS supplier_id,
              '' AS supplier_name,
              lot.product_id AS product_id,
              COALESCE(p.code, '') AS item_code,
              COALESCE(NULLIF(TRIM(p.name), ''), lot.lot_no, '') AS item_name,
              COALESCE(lot.quantity, 0) AS quantity,
              COALESCE(p.unit, '') AS unit,
              ${expr} AS expiry_date,
              COALESCE(NULLIF(TRIM(lot.lot_no), ''), NULLIF(TRIM(lot.serial_no), '')) AS batch_no
            FROM ${lotsTable} lot
            LEFT JOIN ${productsTable} p ON p.id = lot.product_id
            WHERE COALESCE(lot.is_active, true) = true
              AND ${dateFilterSql}
          `,
        params,
        queryOpts(fn, pn),
      );
      return rows.map((row) => rowToExpiringItem(row, todayYmd));
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function fetchPurchaseItemsRest(
  fn: string,
  pn: string,
  todayYmd: string,
  bounds: ExpiryRangeBounds,
): Promise<ExpiringPurchaseItem[]> {
  const { postgrest } = await import('./postgrestClient');
  const itemsTable = `rex_${fn}_${pn}_sale_items`;
  const salesTable = `rex_${fn}_${pn}_sales`;
  const suppliersTable = `rex_${fn}_suppliers`;
  const customersTable = `rex_${fn}_customers`;
  const itemRows = await postgrest.get<Record<string, unknown>[]>(
    `/${itemsTable}`,
    {
      select: '*',
      order: 'expiry_date.asc',
      limit: '5000',
      ...restExpiryFilters(bounds),
    },
    { schema: 'public' },
  );
  const invoiceIds = Array.from(new Set((itemRows || []).map((row) => String(row.invoice_id || '')).filter(Boolean)));
  if (!invoiceIds.length) return [];
  const salesRows = await postgrest.get<Record<string, unknown>[]>(
    `/${salesTable}`,
    {
      select: 'id,fiche_no,date,customer_id,customer_name,trcode,fiche_type,is_cancelled,payment_method',
      id: `in.(${invoiceIds.join(',')})`,
      limit: '5000',
    },
    { schema: 'public' },
  );
  const salesById = new Map((salesRows || []).map((row) => [String(row.id), row]));
  const supplierIds = Array.from(new Set((salesRows || []).map((row) => String(row.customer_id || '')).filter(Boolean)));
  const supplierRows = supplierIds.length
    ? await postgrest
        .get<Record<string, unknown>[]>(
          `/${suppliersTable}`,
          { select: 'id,name', id: `in.(${supplierIds.join(',')})`, limit: '1000' },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[])
    : [];
  const customerRows = supplierIds.length
    ? await postgrest
        .get<Record<string, unknown>[]>(
          `/${customersTable}`,
          { select: 'id,name', id: `in.(${supplierIds.join(',')})`, limit: '1000' },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[])
    : [];
  const names = new Map([...supplierRows, ...customerRows].map((row) => [String(row.id), String(row.name || '')]));
  return (itemRows || [])
    .map((item) => {
      const sale = salesById.get(String(item.invoice_id));
      if (!sale) return null;
      if (sale.is_cancelled === true || sale.is_cancelled === 'true') return null;
      if (!isPurchaseSaleRow(sale)) return null;
      const expYmd = expiryYmd(item.expiry_date);
      if (!expYmd || !isExpiryYmdInRange(expYmd, bounds)) return null;
      return rowToExpiringItem(
        {
          ...item,
          expiry_date: expYmd,
          invoice_id: sale.id,
          invoice_no: sale.fiche_no,
          invoice_date: sale.date,
          supplier_id: sale.customer_id,
          supplier_name: names.get(String(sale.customer_id)) || sale.customer_name || '',
          sale_item_id: item.id,
          trcode: sale.trcode,
          fiche_type: sale.fiche_type,
          payment_method: sale.payment_method,
        },
        todayYmd,
      );
    })
    .filter((row): row is ExpiringPurchaseItem => row != null);
}

async function fetchProductCardItemsRest(
  fn: string,
  todayYmd: string,
  bounds: ExpiryRangeBounds,
): Promise<ExpiringPurchaseItem[]> {
  const { postgrest } = await import('./postgrestClient');
  const productsTable = `rex_${fn}_products`;
  const rows = await postgrest.get<Record<string, unknown>[]>(
    `/${productsTable}`,
    {
      select: 'id,code,name,unit,stock,expiry_date,is_active',
      limit: '5000',
      ...restExpiryFilters(bounds),
    },
    { schema: 'public' },
  );
  return (rows || [])
    .filter((row) => row.is_active !== false && row.is_active !== 'false')
    .map((row) => {
      const expYmd = expiryYmd(row.expiry_date);
      if (!expYmd || !isExpiryYmdInRange(expYmd, bounds)) return null;
      return rowToExpiringItem(
        {
          invoice_id: '',
          invoice_no: '',
          invoice_date: '',
          supplier_id: '',
          supplier_name: '',
          product_id: row.id,
          item_code: row.code,
          item_name: row.name || row.code,
          quantity: row.stock,
          unit: row.unit,
          expiry_date: expYmd,
        },
        todayYmd,
      );
    })
    .filter((row): row is ExpiringPurchaseItem => row != null);
}

async function fetchLotItemsRest(
  fn: string,
  todayYmd: string,
  bounds: ExpiryRangeBounds,
): Promise<ExpiringPurchaseItem[]> {
  const { postgrest } = await import('./postgrestClient');
  const lotsTable = `rex_${fn}_lots`;
  const productsTable = `rex_${fn}_products`;
  const lotRows = await postgrest.get<Record<string, unknown>[]>(
    `/${lotsTable}`,
    { select: '*', is_active: 'eq.true', limit: '5000' },
    { schema: 'public' },
  ).catch(() => [] as Record<string, unknown>[]);
  const productIds = Array.from(
    new Set((lotRows || []).map((row) => String(row.product_id || '')).filter(Boolean)),
  );
  const productRows = productIds.length
    ? await postgrest
        .get<Record<string, unknown>[]>(
          `/${productsTable}`,
          { select: 'id,code,name,unit', id: `in.(${productIds.join(',')})`, limit: '5000' },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[])
    : [];
  const productsById = new Map(productRows.map((row) => [String(row.id), row]));
  return (lotRows || [])
    .map((lot) => {
      const expYmd = expiryYmd(lotExpiryRaw(lot));
      if (!expYmd || !isExpiryYmdInRange(expYmd, bounds)) return null;
      const product = productsById.get(String(lot.product_id || ''));
      return rowToExpiringItem(
        {
          invoice_id: '',
          invoice_no: '',
          invoice_date: '',
          supplier_id: '',
          supplier_name: '',
          product_id: lot.product_id,
          item_code: product?.code,
          item_name: product?.name || lot.lot_no,
          quantity: lot.quantity,
          unit: product?.unit,
          expiry_date: expYmd,
          batch_no: lot.lot_no || lot.serial_no,
        },
        todayYmd,
      );
    })
    .filter((row): row is ExpiringPurchaseItem => row != null);
}

async function fetchLastPurchaseForProduct(
  productId?: string,
  itemCode?: string,
): Promise<ExpiringPurchaseItem | null> {
  const pid = String(productId || '').trim();
  const code = String(itemCode || '').trim();
  if (!pid && !code) return null;
  const fn = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
  const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
  const todayYmd = localTodayDateKey();
  try {
    if (DB_SETTINGS.connectionProvider === 'rest_api') {
      return await fetchLastPurchaseRest(fn, pn, todayYmd, pid, code);
    }
    return await fetchLastPurchaseSql(fn, pn, todayYmd, pid, code);
  } catch (e) {
    console.warn('[expiryReports] son alış tedarikçisi okunamadı:', e);
    return null;
  }
}

async function fetchLastPurchaseSql(
  fn: string,
  pn: string,
  todayYmd: string,
  productId: string,
  itemCode: string,
): Promise<ExpiringPurchaseItem | null> {
  const salesTable = `rex_${fn}_${pn}_sales`;
  const itemsTable = `rex_${fn}_${pn}_sale_items`;
  const suppliersTable = `rex_${fn}_suppliers`;
  const customersTable = `rex_${fn}_customers`;
  const sourceTrcodes = PURCHASE_ONLY_TRCODES.join(', ');
  const { rows } = await postgres.query(
    `
        SELECT
          s.id AS invoice_id,
          s.fiche_no AS invoice_no,
          s.date AS invoice_date,
          s.customer_id AS supplier_id,
          COALESCE(NULLIF(TRIM(sup.name), ''), NULLIF(TRIM(c.name), ''), s.customer_name, '') AS supplier_name,
          it.id AS sale_item_id,
          it.product_id,
          it.item_code,
          it.item_name,
          it.quantity,
          it.unit,
          it.unit_price,
          it.vat_rate,
          it.discount_rate,
          it.expiry_date,
          it.batch_no,
          s.trcode,
          s.fiche_type,
          s.payment_method
        FROM ${itemsTable} it
        INNER JOIN ${salesTable} s ON s.id = it.invoice_id
        LEFT JOIN ${suppliersTable} sup ON sup.id = s.customer_id
        LEFT JOIN ${customersTable} c ON c.id = s.customer_id
        WHERE (
            ($1 <> '' AND (it.product_id::text = $1 OR it.item_code = $1))
            OR ($2 <> '' AND it.item_code = $2)
          )
          AND (
            COALESCE(s.trcode, 0) IN (${sourceTrcodes})
            OR LOWER(COALESCE(s.fiche_type, '')) IN ('purchase_invoice', 'a')
          )
          AND COALESCE(s.trcode, 0) NOT IN (2, 3, 6)
          AND LOWER(COALESCE(s.fiche_type, '')) <> 'return_invoice'
          AND COALESCE(s.is_cancelled, false) = false
        ORDER BY s.date DESC NULLS LAST
        LIMIT 1
      `,
    [productId, itemCode],
    queryOpts(fn, pn),
  );
  const row = rows[0];
  return row ? rowToExpiringItem(row, todayYmd) : null;
}

async function fetchLastPurchaseRest(
  fn: string,
  pn: string,
  todayYmd: string,
  productId: string,
  itemCode: string,
): Promise<ExpiringPurchaseItem | null> {
  const { postgrest } = await import('./postgrestClient');
  const itemsTable = `rex_${fn}_${pn}_sale_items`;
  const salesTable = `rex_${fn}_${pn}_sales`;
  const suppliersTable = `rex_${fn}_suppliers`;
  const customersTable = `rex_${fn}_customers`;
  const ors: string[] = [];
  if (productId) {
    ors.push(`product_id.eq.${productId}`);
    ors.push(`item_code.eq.${productId}`);
  }
  if (itemCode && itemCode !== productId) {
    ors.push(`item_code.eq.${itemCode}`);
  }
  if (!ors.length) return null;
  const itemRows = await postgrest.get<Record<string, unknown>[]>(
    `/${itemsTable}`,
    {
      select: '*',
      or: `(${ors.join(',')})`,
      limit: '400',
    },
    { schema: 'public' },
  ).catch(() => [] as Record<string, unknown>[]);
  const invoiceIds = Array.from(new Set((itemRows || []).map((row) => String(row.invoice_id || '')).filter(Boolean)));
  if (!invoiceIds.length) return null;
  const salesRows = await postgrest.get<Record<string, unknown>[]>(
    `/${salesTable}`,
    {
      select: 'id,fiche_no,date,customer_id,customer_name,trcode,fiche_type,is_cancelled,payment_method',
      id: `in.(${invoiceIds.join(',')})`,
      limit: '400',
    },
    { schema: 'public' },
  ).catch(() => [] as Record<string, unknown>[]);
  const salesById = new Map((salesRows || []).map((row) => [String(row.id), row]));
  const ranked = (itemRows || [])
    .map((item) => {
      const sale = salesById.get(String(item.invoice_id));
      if (!sale) return null;
      if (sale.is_cancelled === true || sale.is_cancelled === 'true') return null;
      if (!isPurchaseSourceSaleRow(sale)) return null;
      return { item, sale, date: expiryYmd(sale.date) || String(sale.date || '') };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const top = ranked[0];
  if (!top) return null;
  const supplierId = String(top.sale.customer_id || '');
  let supplierName = String(top.sale.customer_name || '');
  if (supplierId) {
    const named = await postgrest
      .get<Record<string, unknown>[]>(
        `/${suppliersTable}`,
        { select: 'id,name', id: `eq.${supplierId}`, limit: '1' },
        { schema: 'public' },
      )
      .catch(() => [] as Record<string, unknown>[]);
    if (named[0]?.name) supplierName = String(named[0].name);
    else {
      const cust = await postgrest
        .get<Record<string, unknown>[]>(
          `/${customersTable}`,
          { select: 'id,name', id: `eq.${supplierId}`, limit: '1' },
          { schema: 'public' },
        )
        .catch(() => [] as Record<string, unknown>[]);
      if (cust[0]?.name) supplierName = String(cust[0].name);
    }
  }
  return rowToExpiringItem(
    {
      ...top.item,
      invoice_id: top.sale.id,
      invoice_no: top.sale.fiche_no,
      invoice_date: top.sale.date,
      supplier_id: top.sale.customer_id,
      supplier_name: supplierName,
      sale_item_id: top.item.id,
      trcode: top.sale.trcode,
      fiche_type: top.sale.fiche_type,
      payment_method: top.sale.payment_method,
    },
    todayYmd,
  );
}
