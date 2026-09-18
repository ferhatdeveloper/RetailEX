import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import { normalizeFirmTableNr } from './accountBalance';
import { localCalendarDateKey, localTodayDateKey, toSqlDateInputString } from '../../utils/localCalendarDate';
import {
  EXPIRY_REPORT_DEFAULT_DAYS,
  expiryRangeBounds,
  isExpiryYmdInRange,
  type ExpiryRangeBounds,
} from '../../utils/expiryReportRange';

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
}

/** Logo alış trcode — invoices.TRCODES_BY_INVOICE_CATEGORY.Alis + alış iade (6) */
const PURCHASE_TRCODES = [1, 4, 5, 6, 13, 26, 41, 42] as const;

function isPurchaseSaleRow(sale: Record<string, unknown>): boolean {
  const trcode = Number(sale.trcode ?? sale.invoice_type ?? 0);
  const fiche = String(sale.fiche_type ?? '').toLowerCase();
  if (PURCHASE_TRCODES.includes(trcode as (typeof PURCHASE_TRCODES)[number])) return true;
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

function rowToExpiringItem(row: Record<string, unknown>, todayYmd?: string): ExpiringPurchaseItem {
  const expiry = expiryYmd(row.expiry_date);
  const today = todayYmd || localTodayDateKey();
  const daysLeft = expiry ? daysBetweenYmd(today, expiry) : 0;
  return {
    invoiceId: String(row.invoice_id ?? ''),
    invoiceNo: String(row.invoice_no ?? ''),
    invoiceDate: expiryYmd(row.invoice_date) || String(row.invoice_date ?? '').slice(0, 10),
    supplierId: row.supplier_id ? String(row.supplier_id) : undefined,
    supplierName: String(row.supplier_name ?? ''),
    itemCode: String(row.item_code ?? ''),
    itemName: String(row.item_name ?? ''),
    quantity: Number(row.quantity ?? 0),
    unit: String(row.unit ?? ''),
    expiryDate: expiry,
    batchNo: row.batch_no ? String(row.batch_no) : undefined,
    daysLeft,
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

async function mapSettledRows(
  results: PromiseSettledResult<ExpiringPurchaseItem[]>[],
): Promise<ExpiringPurchaseItem[]> {
  const rows: ExpiringPurchaseItem[] = [];
  let lastErr: unknown;
  let ok = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') {
      ok += 1;
      rows.push(...r.value);
    } else {
      lastErr = r.reason;
      console.warn('[expiryReports] SKT kaynağı atlandı:', r.reason);
    }
  }
  if (ok === 0 && lastErr) throw lastErr;
  return rows;
}

export const expiryReportsAPI = {
  async getExpiringPurchaseItems(daysAhead = EXPIRY_REPORT_DEFAULT_DAYS): Promise<ExpiringPurchaseItem[]> {
    const fn = normalizeFirmTableNr(ERP_SETTINGS.firmNr);
    const pn = String(ERP_SETTINGS.periodNr ?? '01').padStart(2, '0');
    const todayYmd = localTodayDateKey();
    const bounds = expiryRangeBounds(daysAhead, todayYmd);

    const chunks = DB_SETTINGS.connectionProvider === 'rest_api'
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

    const merged = mergeExpiryRows(await mapSettledRows(chunks));
    return merged.filter((row) => isExpiryYmdInRange(row.expiryDate, bounds));
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
          it.item_code,
          it.item_name,
          it.quantity,
          it.unit,
          it.expiry_date,
          it.batch_no
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
      select: 'id,fiche_no,date,customer_id,customer_name,trcode,fiche_type,is_cancelled',
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
