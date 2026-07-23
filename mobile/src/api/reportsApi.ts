import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import {
  isTransportInfrastructureError as isReportsInfrastructureError,
  runDataTransport as runReportTransport,
} from './dataTransport';
import {
  customerBalancesCteForSession,
  supplierBalancesCteForSession,
  sqlResolvedCustomerBalanceExpr,
  sqlResolvedSupplierBalanceExpr,
} from './accountBalance';
import {
  accountMovementsTable,
  appendStoreIdFilterAllowNull,
  cashLinesTable,
  cashRegistersTable,
  customersTable,
  firmNr,
  matchesSessionStoreAllowNull,
  periodNr,
  productsTable,
  saleItemsTable,
  salesTable,
  stockMovementItemsTable,
  stockMovementsTable,
  storeId,
  suppliersTable,
} from './erpTables';

/** Rapor API hatalarını yutma — ekranda gerçek mesaj görünsün */
function throwReportError(err: unknown, label: string): never {
  const base = err instanceof Error ? err.message : String(err || 'Bilinmeyen hata');
  throw new Error(
    `${base} [${label} · firma=${firmNr()} dönem=${periodNr()}${storeId() ? ` mağaza=${storeId()}` : ''}]`,
  );
}

/** Köprü/ağ → throw; şema eksikliği → devam (fallback) */
function softSchemaOrThrow(err: unknown, label: string): void {
  if (isReportsInfrastructureError(err)) throwReportError(err, label);
  if (__DEV__) {
    console.warn(
      `[reportsApi:${label}]`,
      err instanceof Error ? err.message : err,
      `| firma=${firmNr()} dönem=${periodNr()}`,
    );
  }
}

/** Yerel YYYY-MM-DD — REST filtreleri için erken tanım */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function defaultExtractRange(days = 90): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: toYmd(start), end: toYmd(end) };
}

/** SQL `sqlSalesRevenueFt` istemci karşılığı */
function isSalesRevenueRow(r: Record<string, unknown>): boolean {
  const ft = String(r.fiche_type || '').trim().toLowerCase();
  const tr = Number(r.trcode ?? 0) || 0;
  if (
    ft === 'sales_invoice' ||
    ft === 'sales' ||
    ft === 'retail' ||
    ft === 'service' ||
    ft === 'hizmet' ||
    ft === 'return_invoice'
  ) {
    return true;
  }
  /** Dashboard ile aynı — boş fiche_type, alış trcode değilse satış say */
  if (ft === '' && ![1, 4, 5, 6, 13, 26, 41, 42].includes(tr)) return true;
  return [0, 2, 3, 7, 8, 9, 14].includes(tr);
}

/** SQL `sqlSalesRevenueSign` istemci karşılığı */
function salesRevenueSign(r: Record<string, unknown>): number {
  const ft = String(r.fiche_type || '').trim().toLowerCase();
  const tr = Number(r.trcode ?? 0) || 0;
  if (tr === 2 || tr === 3) return -1;
  if (
    ft === 'return_invoice' &&
    ![1, 4, 5, 6, 13, 26, 41, 42].includes(tr)
  ) {
    return -1;
  }
  return 1;
}

function isCancelledRow(r: Record<string, unknown>): boolean {
  return r.is_cancelled === true || r.is_cancelled === 'true';
}

function isCountableSaleStatus(r: Record<string, unknown>): boolean {
  const st = String(r.status ?? 'approved').trim().toLowerCase();
  return st === 'completed' || st === 'approved' || st === '';
}

function matchesSessionStore(r: Record<string, unknown>): boolean {
  return matchesSessionStoreAllowNull(r.store_id);
}

/** Web `SQL_COUNTABLE_SALE_STATUS` — alias `s` */
const SQL_COUNTABLE_SALE = `COALESCE(s.status, 'approved') IN ('completed', 'approved')`;

export type SalesDayRow = {
  day: string;
  revenue: number;
  count: number;
};

/** Alış / irsaliye vb. hariç — ciro yalnız satış yönlü fişler (web SalesAPI ile uyumlu) */
function sqlSalesRevenueFt(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `
  LOWER(TRIM(COALESCE(${p}fiche_type, ''))) IN (
    'sales_invoice', 'sales', 'retail', 'service', 'hizmet', 'return_invoice'
  )
  OR COALESCE(${p}trcode, 0) IN (0, 2, 3, 7, 8, 9, 14)
`;
}

/**
 * Satış iadesi işareti — web `SQL_SALES_SIGN` / `SQL_IS_SALES_RETURN`.
 * trcode 2–3 veya return_invoice (alış iade trcode hariç) → −1.
 */
function sqlSalesRevenueSign(alias = ''): string {
  const p = alias ? `${alias}.` : '';
  return `
  CASE
    WHEN COALESCE(${p}trcode, 0) IN (2, 3)
      OR (
        LOWER(TRIM(COALESCE(${p}fiche_type, ''))) = 'return_invoice'
        AND COALESCE(${p}trcode, 0) NOT IN (1, 4, 5, 6, 13, 26, 41, 42)
      )
    THEN -1
    ELSE 1
  END
`;
}

export async function fetchSalesByDay(days = 14): Promise<SalesDayRow[]> {
  return runReportTransport({
    label: 'fetchSalesByDay',
    viaRest: () => fetchSalesByDayViaRest(days),
    viaBridge: () => fetchSalesByDayViaBridge(days),
  });
}

async function fetchSalesByDayViaRest(days: number): Promise<SalesDayRow[]> {
  const table = salesTable(firmNr(), periodNr());
  const sales = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select:
        'date,created_at,net_amount,total_net,fiche_type,trcode,is_cancelled,store_id,status',
      order: 'date.desc',
      limit: 8000,
    },
    { schema: 'public' },
  );
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, days));
  const cutoffYmd = toYmd(cutoff);
  const byDay = new Map<string, { revenue: number; count: number }>();

  for (const r of sales || []) {
    if (isCancelledRow(r)) continue;
    if (!isCountableSaleStatus(r)) continue;
    if (!isSalesRevenueRow(r)) continue;
    if (!matchesSessionStore(r)) continue;
    const day = String(r.date || r.created_at || '').slice(0, 10);
    if (!day || day < cutoffYmd) continue;
    const sign = salesRevenueSign(r);
    const net = Math.abs(Number(r.net_amount ?? r.total_net ?? 0) || 0);
    const cur = byDay.get(day) || { revenue: 0, count: 0 };
    cur.revenue += sign * net;
    cur.count += 1;
    byDay.set(day, cur);
  }

  return [...byDay.entries()]
    .map(([day, v]) => ({ day, revenue: v.revenue, count: v.count }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

async function fetchSalesByDayViaBridge(days: number): Promise<SalesDayRow[]> {
  const table = salesTable(firmNr(), periodNr());
  const sign = sqlSalesRevenueSign();
  const params: unknown[] = [days];
  const storeSql = appendStoreIdFilterAllowNull('store_id', params);
  const res = await pgQuery<{ day: string; revenue: string | number; count: string | number }>(
    `SELECT date_trunc('day', COALESCE(date::timestamp, created_at))::date::text AS day,
            COALESCE(SUM(
              (${sign}) * ABS(COALESCE(net_amount, total_net, 0))
            ), 0)::float8 AS revenue,
            COUNT(*)::int AS count
     FROM ${table}
     WHERE COALESCE(is_cancelled, false) = false
       AND (${sqlSalesRevenueFt()})
       AND COALESCE(date::date, created_at::date) >= (CURRENT_DATE - ($1::int || ' days')::interval)
       ${storeSql}
     GROUP BY 1
     ORDER BY 1 DESC`,
    params,
  );
  return res.rows.map((r) => ({
    day: r.day,
    revenue: Number(r.revenue),
    count: Number(r.count),
  }));
}

export type CriticalStockRow = {
  id: string;
  code: string | null;
  name: string;
  stock: number;
  min_stock: number;
  unit: string | null;
};

export async function fetchCriticalStock(limit = 100): Promise<CriticalStockRow[]> {
  return runReportTransport({
    label: 'fetchCriticalStock',
    viaRest: () => fetchCriticalStockViaRest(limit),
    viaBridge: () => fetchCriticalStockViaBridge(limit),
  });
}

async function fetchCriticalStockViaRest(limit: number): Promise<CriticalStockRow[]> {
  const table = productsTable();
  const products = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select: 'id,code,name,stock,min_stock,critical_stock,unit,is_active',
      is_active: 'eq.true',
      order: 'name.asc',
      limit: 4000,
    },
    { schema: 'public' },
  );
  const out: CriticalStockRow[] = [];
  for (const p of products || []) {
    const id = String(p.id ?? '');
    if (!id) continue;
    const stock = Number(p.stock ?? 0);
    const minStock = Number(p.min_stock ?? 0);
    const criticalStock = Number(p.critical_stock ?? 0);
    const belowCrit = criticalStock > 0 && stock <= criticalStock;
    const belowMin = minStock > 0 && stock < minStock;
    if (!belowCrit && !belowMin) continue;
    out.push({
      id,
      code: p.code != null ? String(p.code) : null,
      name: String(p.name ?? ''),
      stock,
      min_stock: minStock,
      unit: p.unit != null ? String(p.unit) : null,
    });
  }
  return out.sort((a, b) => a.stock - b.stock).slice(0, limit);
}

async function fetchCriticalStockViaBridge(limit: number): Promise<CriticalStockRow[]> {
  const table = productsTable();
  const res = await pgQuery<CriticalStockRow>(
    `SELECT id, code, name,
            COALESCE(stock, 0)::float8 AS stock,
            COALESCE(min_stock, 0)::float8 AS min_stock,
            unit
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND min_stock IS NOT NULL
       AND COALESCE(stock, 0) < min_stock
     ORDER BY (min_stock - COALESCE(stock, 0)) DESC
     LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export type TopProductRow = {
  product_name: string;
  qty: number;
  amount: number;
};

async function fetchTopProductsViaRest(limit: number): Promise<TopProductRow[]> {
  const fn = firmNr();
  const pn = periodNr();
  const items = saleItemsTable(fn, pn);
  const sales = salesTable(fn, pn);

  const [salesRows, itemRows] = await Promise.all([
    postgrestGet<Record<string, unknown>[]>(
      `/${sales}`,
      {
        select: 'id,fiche_type,trcode,is_cancelled,store_id,status',
        limit: 8000,
      },
      { schema: 'public' },
    ),
    postgrestGet<Record<string, unknown>[]>(
      `/${items}`,
      {
        select: 'invoice_id,item_name,item_code,quantity,net_amount,total_amount',
        limit: 20000,
      },
      { schema: 'public' },
    ),
  ]);

  const salesOk = new Map<string, number>();
  for (const s of Array.isArray(salesRows) ? salesRows : []) {
    if (isCancelledRow(s)) continue;
    if (!isSalesRevenueRow(s)) continue;
    const st = String(s.status ?? 'approved').trim().toLowerCase();
    if (st && st !== 'completed' && st !== 'approved') continue;
    if (!matchesSessionStore(s)) continue;
    salesOk.set(String(s.id), salesRevenueSign(s));
  }

  const byName = new Map<string, { qty: number; amount: number }>();
  for (const it of Array.isArray(itemRows) ? itemRows : []) {
    const sign = salesOk.get(String(it.invoice_id ?? ''));
    if (sign == null) continue;
    const name = String(it.item_name || it.item_code || 'Ürün');
    const cur = byName.get(name) || { qty: 0, amount: 0 };
    cur.qty += sign * (Number(it.quantity) || 0);
    cur.amount += sign * Math.abs(Number(it.net_amount ?? it.total_amount ?? 0) || 0);
    byName.set(name, cur);
  }

  return [...byName.entries()]
    .map(([product_name, v]) => ({ product_name, qty: v.qty, amount: v.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

async function fetchTopProductsViaBridge(limit: number): Promise<TopProductRow[]> {
  const fn = firmNr();
  const pn = periodNr();
  const items = saleItemsTable(fn, pn);
  const sales = salesTable(fn, pn);
  const sign = sqlSalesRevenueSign('s');
  const params: unknown[] = [limit];
  const storeSql = appendStoreIdFilterAllowNull('s.store_id', params);
  const res = await pgQuery<TopProductRow>(
    `SELECT COALESCE(si.item_name, si.item_code, 'Ürün') AS product_name,
            COALESCE(SUM((${sign}) * COALESCE(si.quantity, 0)), 0)::float8 AS qty,
            COALESCE(SUM(
              (${sign}) * ABS(COALESCE(si.net_amount, si.total_amount, 0))
            ), 0)::float8 AS amount
     FROM ${items} si
     INNER JOIN ${sales} s ON s.id = si.invoice_id
     WHERE COALESCE(s.is_cancelled, false) = false
       AND ${SQL_COUNTABLE_SALE}
       AND (${sqlSalesRevenueFt('s')})
       ${storeSql}
     GROUP BY 1
     ORDER BY amount DESC
     LIMIT $1`,
    params,
  );
  return res.rows;
}

export async function fetchTopProducts(limit = 20): Promise<TopProductRow[]> {
  try {
    return await runReportTransport({
      label: 'fetchTopProducts',
      viaRest: () => fetchTopProductsViaRest(limit),
      viaBridge: () => fetchTopProductsViaBridge(limit),
    });
  } catch (err) {
    throwReportError(err, 'fetchTopProducts');
  }
}

/**
 * Cari mizan / bakiye özeti.
 * Varsayılan `balance` = aktif dönem ledger CTE (web `accountBalance.ts`).
 * `cardBalance` = firma kart kolonu (dönem bağımsız) — R2/R11 ayrımı.
 */
export type CariBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  cardType: 'customer' | 'supplier';
  /** Dönem ledger bakiyesi (gösterim varsayılanı) */
  balance: number;
  /** Kart `balance` kolonu — firma genel */
  cardBalance: number;
  creditLimit: number;
  txnCount: number;
  balanceSource: 'period_ledger' | 'card';
  periodNr: string;
  firmNr: string;
};

function mapCardFallbackRow(
  r: {
    account_id: string;
    account_code: string;
    account_name: string;
    card_type?: string;
    balance: number;
    credit_limit: number;
  },
  cardType: 'customer' | 'supplier',
  fn: string,
  pn: string,
): CariBalanceRow {
  const bal = Number(r.balance ?? 0);
  return {
    accountId: String(r.account_id ?? ''),
    accountCode: String(r.account_code ?? ''),
    accountName: String(r.account_name ?? ''),
    cardType: r.card_type === 'supplier' || cardType === 'supplier' ? 'supplier' : 'customer',
    balance: bal,
    cardBalance: bal,
    creditLimit: Number(r.credit_limit ?? 0),
    txnCount: 0,
    balanceSource: 'card',
    periodNr: pn,
    firmNr: fn,
  };
}

async function fetchCariBalancesFromCardViaRest(opts: {
  want: 'customer' | 'supplier' | 'all';
  onlyNonZero: boolean;
  limit: number;
  fn: string;
  pn: string;
}): Promise<CariBalanceRow[]> {
  const { want, onlyNonZero, limit, fn, pn } = opts;
  const cust = customersTable(fn);
  const supp = suppliersTable(fn);
  const out: CariBalanceRow[] = [];

  const fetchCard = async (table: string, cardType: 'customer' | 'supplier') => {
    const rows = await postgrestGet<Record<string, unknown>[]>(
      `/${table}`,
      {
        select: 'id,code,name,balance,credit_limit,is_active',
        is_active: 'eq.true',
        order: 'name.asc',
        limit: Math.min(limit * 2, 2000),
      },
      { schema: 'public' },
    );
    for (const r of Array.isArray(rows) ? rows : []) {
      const bal = Number(r.balance ?? 0) || 0;
      if (onlyNonZero && Math.abs(bal) <= 0.009) continue;
      out.push(
        mapCardFallbackRow(
          {
            account_id: String(r.id ?? ''),
            account_code: String(r.code ?? ''),
            account_name: String(r.name ?? ''),
            card_type: cardType,
            balance: bal,
            credit_limit: Number(r.credit_limit ?? 0) || 0,
          },
          cardType,
          fn,
          pn,
        ),
      );
    }
  };

  if (want === 'all' || want === 'customer') await fetchCard(cust, 'customer');
  if (want === 'all' || want === 'supplier') {
    try {
      await fetchCard(supp, 'supplier');
    } catch {
      /* supplier table eksik olabilir */
    }
  }

  return out.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, limit);
}

async function fetchCariBalancesFromCard(opts: {
  want: 'customer' | 'supplier' | 'all';
  onlyNonZero: boolean;
  limit: number;
  fn: string;
  pn: string;
}): Promise<CariBalanceRow[]> {
  try {
    return await runReportTransport({
      label: 'fetchCariBalancesFromCard',
      viaRest: () => fetchCariBalancesFromCardViaRest(opts),
      viaBridge: () => fetchCariBalancesFromCardViaBridge(opts),
    });
  } catch (err) {
    throwReportError(err, 'fetchCariBalancesFromCard');
  }
}

async function fetchCariBalancesFromCardViaBridge(opts: {
  want: 'customer' | 'supplier' | 'all';
  onlyNonZero: boolean;
  limit: number;
  fn: string;
  pn: string;
}): Promise<CariBalanceRow[]> {
  const { want, onlyNonZero, limit, fn, pn } = opts;
  const balFilter = onlyNonZero ? 'AND ABS(COALESCE(balance, 0)) > 0.009' : '';
  const cust = customersTable(fn);
  const supp = suppliersTable(fn);
  const parts: string[] = [];
  if (want === 'all' || want === 'customer') {
    parts.push(`
      SELECT id::text AS account_id,
             COALESCE(code,'') AS account_code,
             COALESCE(name,'') AS account_name,
             'customer'::text AS card_type,
             COALESCE(balance,0)::float8 AS balance,
             COALESCE(credit_limit,0)::float8 AS credit_limit
      FROM ${cust}
      WHERE COALESCE(is_active, true) = true ${balFilter}
    `);
  }
  if (want === 'all' || want === 'supplier') {
    parts.push(`
      SELECT id::text AS account_id,
             COALESCE(code,'') AS account_code,
             COALESCE(name,'') AS account_name,
             'supplier'::text AS card_type,
             COALESCE(balance,0)::float8 AS balance,
             COALESCE(credit_limit,0)::float8 AS credit_limit
      FROM ${supp}
      WHERE COALESCE(is_active, true) = true ${balFilter}
    `);
  }
  if (!parts.length) return [];

  try {
    const res = await pgQuery<{
      account_id: string;
      account_code: string;
      account_name: string;
      card_type: string;
      balance: number;
      credit_limit: number;
    }>(`${parts.join(' UNION ALL ')} ORDER BY ABS(balance) DESC LIMIT $1`, [limit]);
    return res.rows.map((r) => mapCardFallbackRow(r, 'customer', fn, pn));
  } catch (err) {
    softSchemaOrThrow(err, 'fetchCariBalancesFromCard');
    if (want === 'supplier') return [];
    const res = await pgQuery<{
      account_id: string;
      account_code: string;
      account_name: string;
      balance: number;
      credit_limit: number;
    }>(
      `SELECT id::text AS account_id,
              COALESCE(code,'') AS account_code,
              COALESCE(name,'') AS account_name,
              COALESCE(balance,0)::float8 AS balance,
              COALESCE(credit_limit,0)::float8 AS credit_limit
       FROM ${cust}
       WHERE COALESCE(is_active, true) = true ${balFilter}
       ORDER BY ABS(COALESCE(balance,0)) DESC
       LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => mapCardFallbackRow(r, 'customer', fn, pn));
  }
}

export async function fetchCariBalances(opts?: {
  cardType?: 'customer' | 'supplier' | 'all';
  onlyNonZero?: boolean;
  limit?: number;
  /** true → yalnızca kart kolonu (eski davranış) */
  useCardBalance?: boolean;
}): Promise<CariBalanceRow[]> {
  const want = opts?.cardType ?? 'all';
  const onlyNonZero = opts?.onlyNonZero !== false;
  const limit = opts?.limit ?? 500;
  const fn = firmNr();
  const pn = periodNr();

  if (opts?.useCardBalance) {
    return fetchCariBalancesFromCard({ want, onlyNonZero, limit, fn, pn });
  }

  const cust = customersTable(fn);
  const supp = suppliersTable(fn);
  const balOuter = onlyNonZero ? 'WHERE ABS(COALESCE(period_balance, 0)) > 0.009' : '';

  const parts: string[] = [];
  if (want === 'all' || want === 'customer') {
    parts.push(`
      SELECT c.id::text AS account_id,
             COALESCE(c.code,'') AS account_code,
             COALESCE(c.name,'') AS account_name,
             'customer'::text AS card_type,
             (${sqlResolvedCustomerBalanceExpr()})::float8 AS period_balance,
             COALESCE(c.balance,0)::float8 AS card_balance,
             COALESCE(c.credit_limit,0)::float8 AS credit_limit,
             COALESCE(b.txn_count, 0)::int AS txn_count
      FROM ${cust} c
      LEFT JOIN account_balances b ON c.id = b.id
      WHERE COALESCE(c.is_active, true) = true
        AND (
          c.firm_nr = $1
          OR LPAD(TRIM(COALESCE(c.firm_nr, '')), 3, '0') = LPAD(TRIM($1::text), 3, '0')
          OR c.firm_nr IS NULL
          OR TRIM(COALESCE(c.firm_nr, '')) = ''
        )
    `);
  }
  if (want === 'all' || want === 'supplier') {
    parts.push(`
      SELECT s.id::text AS account_id,
             COALESCE(s.code,'') AS account_code,
             COALESCE(s.name,'') AS account_name,
             'supplier'::text AS card_type,
             (${sqlResolvedSupplierBalanceExpr()})::float8 AS period_balance,
             COALESCE(s.balance,0)::float8 AS card_balance,
             COALESCE(s.credit_limit,0)::float8 AS credit_limit,
             COALESCE(b.txn_count, 0)::int AS txn_count
      FROM ${supp} s
      LEFT JOIN supplier_balances b ON s.id = b.id
      WHERE COALESCE(s.is_active, true) = true
    `);
  }
  if (!parts.length) return [];

  const withParts: string[] = [];
  if (want === 'all' || want === 'customer') {
    withParts.push(customerBalancesCteForSession('$1::text'));
  }
  if (want === 'all' || want === 'supplier') {
    withParts.push(supplierBalancesCteForSession());
  }

  const includeCustomer = want === 'all' || want === 'customer';
  // PG parametreleri $1'den ardışık olmalı — yalnızca tedarikçide $1 = limit
  const limitParam = includeCustomer ? '$2' : '$1';
  const queryParams = includeCustomer ? [fn, limit] : [limit];

  try {
    const sql = `
      WITH ${withParts.join(',\n')}
      SELECT * FROM (
        ${parts.join(' UNION ALL ')}
      ) balances
      ${balOuter}
      ORDER BY ABS(period_balance) DESC
      LIMIT ${limitParam}`;
    const res = await pgQuery<{
      account_id: string;
      account_code: string;
      account_name: string;
      card_type: string;
      period_balance: number;
      card_balance: number;
      credit_limit: number;
      txn_count: number;
    }>(sql, queryParams);
    return res.rows.map((r) => ({
      accountId: String(r.account_id ?? ''),
      accountCode: String(r.account_code ?? ''),
      accountName: String(r.account_name ?? ''),
      cardType: r.card_type === 'supplier' ? 'supplier' : 'customer',
      balance: Number(r.period_balance ?? 0),
      cardBalance: Number(r.card_balance ?? 0),
      creditLimit: Number(r.credit_limit ?? 0),
      txnCount: Number(r.txn_count ?? 0),
      balanceSource: 'period_ledger' as const,
      periodNr: pn,
      firmNr: fn,
    }));
  } catch (err) {
    softSchemaOrThrow(err, 'fetchCariBalances');
    // CTE / cash_lines yoksa kart bakiyesine düş
    return fetchCariBalancesFromCard({ want, onlyNonZero, limit, fn, pn });
  }
}

/** Web `erpReports.getCariExtract` / `supplierAPI.getAccountStatement` — cari ekstre */
export type CariExtractSource = 'movement' | 'sale' | 'cash';

export type CariExtractRow = {
  id: string;
  date: string;
  ficheNo: string;
  definition: string;
  debit: number;
  credit: number;
  balance: number;
  source: CariExtractSource;
};

function mapRunningExtract(
  raw: {
    id: string;
    date: string;
    ficheNo: string;
    definition: string;
    amount: number;
    sign: number;
    source: CariExtractSource;
  }[],
): CariExtractRow[] {
  let running = 0;
  return raw.map((m) => {
    const amount = Math.abs(m.amount);
    const debit = m.sign > 0 ? amount : 0;
    const credit = m.sign < 0 ? amount : 0;
    running += debit - credit;
    return {
      id: m.id,
      date: m.date,
      ficheNo: m.ficheNo,
      definition: m.definition,
      debit,
      credit,
      balance: running,
      source: m.source,
    };
  });
}

function mapExtractSqlRow(r: {
  id: string;
  date: string;
  fiche_no: string;
  definition: string;
  amount: number;
  sign: number;
  source: string;
}): {
  id: string;
  date: string;
  ficheNo: string;
  definition: string;
  amount: number;
  sign: number;
  source: CariExtractSource;
} {
  const src = String(r.source || 'sale');
  const source: CariExtractSource =
    src === 'movement' ? 'movement' : src === 'cash' ? 'cash' : 'sale';
  const signNum = Number(r.sign);
  return {
    id: String(r.id ?? ''),
    date: String(r.date ?? '').slice(0, 10),
    ficheNo: String(r.fiche_no ?? ''),
    definition: String(r.definition ?? ''),
    amount: Number(r.amount ?? 0),
    sign: signNum < 0 ? -1 : 1,
    source,
  };
}

/** Dönem öncesi net bakiye — ekstre “Devreden” satırı (R11b; gerçek fiş etiketi “Devir”) */
async function fetchCariExtractOpeningNet(opts: {
  accountId: string;
  isCustomer: boolean;
  startDate: string;
  useMovements: boolean;
  ficheFilter: string;
  saleSignSql: string;
}): Promise<number> {
  const { accountId, isCustomer, startDate, useMovements, ficheFilter, saleSignSql } = opts;
  const idCol = isCustomer ? 'customer_id' : 'supplier_id';

  if (useMovements) {
    try {
      const res = await pgQuery<{ net: number }>(
        `SELECT COALESCE(SUM(
           ABS(COALESCE(am.amount, 0)) *
           CASE WHEN COALESCE(am.sign, 1) < 0 THEN -1 ELSE 1 END
         ), 0)::float8 AS net
         FROM ${accountMovementsTable()} am
         WHERE am.${idCol}::text = $1
           AND COALESCE(am.date::date, (am.date AT TIME ZONE 'UTC')::date) < $2::date`,
        [accountId, startDate],
      );
      return Number(res.rows[0]?.net ?? 0);
    } catch (err) {
      softSchemaOrThrow(err, 'fetchCariExtractOpeningNet.mov');
      return 0;
    }
  }

  try {
    const res = await pgQuery<{ net: number }>(
      `SELECT COALESCE(SUM(u.signed_amt), 0)::float8 AS net FROM (
         SELECT
           ABS(COALESCE(s.net_amount, s.total_net, 0)) * (${saleSignSql})::int AS signed_amt
         FROM ${salesTable()} s
         WHERE s.customer_id::text = $1
           AND COALESCE(s.is_cancelled, false) = false
           AND ${SQL_COUNTABLE_SALE}
           AND ${ficheFilter}
           AND COALESCE(s.date::date, (s.date AT TIME ZONE 'UTC')::date) < $2::date
         UNION ALL
         SELECT
           -ABS(COALESCE(cl.amount, 0)) AS signed_amt
         FROM ${cashLinesTable()} cl
         WHERE cl.customer_id::text = $1
           AND UPPER(TRIM(COALESCE(cl.transaction_type, ''))) IN ('CH_TAHSILAT', 'CH_ODEME')
           AND COALESCE(cl.date::date, (cl.date AT TIME ZONE 'UTC')::date) < $2::date
       ) u`,
      [accountId, startDate],
    );
    return Number(res.rows[0]?.net ?? 0);
  } catch (err) {
    softSchemaOrThrow(err, 'fetchCariExtractOpeningNet.sale');
    return 0;
  }
}

export async function fetchCariExtract(opts: {
  accountId: string;
  cardType: 'customer' | 'supplier';
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<CariExtractRow[]> {
  const accountId = String(opts.accountId || '').trim();
  const start = String(opts.startDate || '').slice(0, 10);
  const end = String(opts.endDate || '').slice(0, 10);
  if (!accountId || !start || !end) return [];
  const limit = opts.limit ?? 1000;
  return runReportTransport({
    label: 'fetchCariExtract',
    viaRest: () =>
      fetchCariExtractViaRest({
        accountId,
        cardType: opts.cardType,
        start,
        end,
        limit,
      }),
    viaBridge: () =>
      fetchCariExtractViaBridge({
        accountId,
        cardType: opts.cardType,
        start,
        end,
        limit,
      }),
  });
}

/** Web `erpReports.getCariExtract` rest_api — movements → sales fallback */
async function fetchCariExtractViaRest(opts: {
  accountId: string;
  cardType: 'customer' | 'supplier';
  start: string;
  end: string;
  limit: number;
}): Promise<CariExtractRow[]> {
  const { accountId, start, end, limit } = opts;
  const isCustomer = opts.cardType === 'customer';
  const fn = firmNr();
  const pn = periodNr();
  const movPath = `/${accountMovementsTable(fn, pn)}`;
  const salesPath = `/${salesTable(fn, pn)}`;

  const movements = await postgrestGet<Record<string, unknown>[]>(
    movPath,
    {
      select: 'id,fiche_no,date,amount,sign,definition,customer_id,supplier_id,created_at',
      order: 'date.asc',
      limit: 5000,
    },
    { schema: 'public' },
  ).catch(() => [] as Record<string, unknown>[]);

  const accountMatch = (m: Record<string, unknown>) => {
    const id = isCustomer
      ? String(m.customer_id || '')
      : String(m.supplier_id || m.customer_id || '');
    return id === accountId;
  };

  const inRange = (m: Record<string, unknown>[]) =>
    m.filter((row) => {
      const d = String(row.date || '').slice(0, 10);
      return d >= start && d <= end && accountMatch(row);
    });

  const filteredMov = inRange(movements || []);
  let openingNet = 0;
  for (const m of movements || []) {
    if (!accountMatch(m)) continue;
    const d = String(m.date || '').slice(0, 10);
    if (!d || d >= start) continue;
    const amt = Math.abs(Number(m.amount ?? 0) || 0);
    const sign = Number(m.sign ?? 1) < 0 ? -1 : 1;
    openingNet += sign * amt;
  }

  type Raw = {
    id: string;
    date: string;
    ficheNo: string;
    definition: string;
    amount: number;
    sign: number;
    source: CariExtractSource;
  };

  let raw: Raw[] = [];
  let usedMovements = false;

  if (filteredMov.length) {
    usedMovements = true;
    raw = filteredMov.map((m) => ({
      id: String(m.id ?? `${m.fiche_no}-${m.date}`),
      date: String(m.date || '').slice(0, 10),
      ficheNo: String(m.fiche_no ?? ''),
      definition: String(m.definition ?? ''),
      amount: Math.abs(Number(m.amount ?? 0) || 0),
      sign: Number(m.sign ?? 1) < 0 ? -1 : 1,
      source: 'movement' as const,
    }));
  } else {
    const sales = await postgrestGet<Record<string, unknown>[]>(
      salesPath,
      {
        select:
          'id,fiche_no,date,net_amount,total_net,fiche_type,trcode,customer_id,is_cancelled,status',
        customer_id: `eq.${accountId}`,
        order: 'date.asc',
        limit: 5000,
      },
      { schema: 'public' },
    ).catch(() => [] as Record<string, unknown>[]);

    const saleSign = (s: Record<string, unknown>): number => {
      const ft = String(s.fiche_type || '').trim().toLowerCase();
      const tr = Number(s.trcode ?? 0) || 0;
      const net = Number(s.net_amount ?? s.total_net ?? 0);
      if (ft === 'opening_balance') return net < 0 ? -1 : 1;
      if (isCustomer) {
        if (ft === 'return_invoice' || tr === 2 || tr === 3) return -1;
        return 1;
      }
      if (tr === 6 || ft === 'return_invoice') return -1;
      return 1;
    };

    const isRelevantSale = (s: Record<string, unknown>): boolean => {
      if (isCancelledRow(s)) return false;
      if (!isCountableSaleStatus(s)) return false;
      const ft = String(s.fiche_type || '').trim().toLowerCase();
      const tr = Number(s.trcode ?? 0) || 0;
      if (isCustomer) {
        return (
          [
            'sales_invoice',
            'sales',
            'retail',
            'service',
            'hizmet',
            'return_invoice',
            'opening_balance',
          ].includes(ft) || [0, 2, 3, 7, 8, 9, 14].includes(tr)
        );
      }
      return (
        ['purchase_invoice', 'return_invoice', 'opening_balance'].includes(ft) ||
        [1, 4, 5, 6, 13, 26, 41, 42].includes(tr)
      );
    };

    for (const s of sales || []) {
      if (!isRelevantSale(s)) continue;
      const d = String(s.date || '').slice(0, 10);
      const net = Number(s.net_amount ?? s.total_net ?? 0);
      const sign = saleSign(s);
      if (d && d < start) {
        openingNet += sign * Math.abs(net);
        continue;
      }
      if (!d || d < start || d > end) continue;
      const ft = String(s.fiche_type || '').trim().toLowerCase();
      raw.push({
        id: String(s.id ?? ''),
        date: d,
        ficheNo: String(s.fiche_no ?? ''),
        definition: ft === 'opening_balance' ? 'Devir' : ft || 'sale',
        amount: Math.abs(net),
        sign,
        source: 'sale',
      });
    }
  }

  raw.sort((a, b) => a.date.localeCompare(b.date));
  const withOpening = [...raw];
  if (Math.abs(openingNet) >= 0.005) {
    withOpening.unshift({
      id: `bf-${accountId}-${start}`,
      date: start,
      ficheNo: '',
      definition: 'Devreden',
      amount: Math.abs(openingNet),
      sign: openingNet >= 0 ? 1 : -1,
      source: usedMovements ? 'movement' : 'sale',
    });
  }
  return mapRunningExtract(withOpening.slice(0, limit));
}

async function fetchCariExtractViaBridge(opts: {
  accountId: string;
  cardType: 'customer' | 'supplier';
  start: string;
  end: string;
  limit: number;
}): Promise<CariExtractRow[]> {
  const { accountId, start, end, limit } = opts;
  const isCustomer = opts.cardType === 'customer';
  const idCol = isCustomer ? 'customer_id' : 'supplier_id';
  const movTable = accountMovementsTable();
  const sales = salesTable();
  const cash = cashLinesTable();

  // Web getAccountStatement: sales UNION ALL cash_lines (CH_*)
  // + mobil legacy ('sales'/'retail') + trcode 7/8 POS
  const ficheFilter = isCustomer
    ? `(
           LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN (
             'sales_invoice', 'sales', 'retail', 'service', 'hizmet', 'return_invoice', 'opening_balance'
           )
           OR COALESCE(s.trcode, 0) IN (0, 2, 3, 7, 8, 9, 14)
         )`
    : `(
           LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN (
             'purchase_invoice', 'return_invoice', 'opening_balance'
           )
           OR s.trcode IN (1, 4, 5, 6, 13, 26, 41, 42)
         )`;
  // Web buildEkstreRows: alış/satış +delta; iade −delta; opening_balance → işaretli net_amount (R11a).
  // Önceki mobil CASE alış fişlerini de −1 yapıyordu → tedarikçi kapanış bakiyesi ters dönüyordu (V2-R13).
  // Açılış: cariDevirApi alacak için negatif net_amount yazar; ABS+ELSE 1 → yanlış borç (R11a).
  const openingSignSql = `CASE
           WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'opening_balance'
             THEN CASE WHEN COALESCE(s.net_amount, s.total_net, 0) < 0 THEN -1 ELSE 1 END`;
  const saleSignSql = isCustomer
    ? `${openingSignSql}
           WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
             OR COALESCE(s.trcode, 0) IN (2, 3) THEN -1
           ELSE 1
         END`
    : `${openingSignSql}
           WHEN COALESCE(s.trcode, 0) = 6
             OR LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice' THEN -1
           ELSE 1
         END`;
  // Web ficheTypeToInfo(opening_balance) → 'Devir'
  const saleDefinitionSql = `CASE
           WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'opening_balance' THEN 'Devir'
           ELSE COALESCE(s.fiche_type, '')
         END`;

  let raw: {
    id: string;
    date: string;
    ficheNo: string;
    definition: string;
    amount: number;
    sign: number;
    source: CariExtractSource;
  }[] = [];
  let usedMovements = false;

  try {
    const res = await pgQuery<{
      id: string;
      date: string;
      fiche_no: string;
      definition: string;
      amount: number;
      sign: number;
      source: string;
    }>(
      `SELECT
         am.id::text AS id,
         COALESCE(am.date::date, (am.date AT TIME ZONE 'UTC')::date)::text AS date,
         COALESCE(am.fiche_no, '') AS fiche_no,
         COALESCE(am.definition, '') AS definition,
         ABS(COALESCE(am.amount, 0))::float8 AS amount,
         COALESCE(am.sign, 1)::int AS sign,
         'movement'::text AS source
       FROM ${movTable} am
       WHERE am.${idCol}::text = $1
         AND COALESCE(am.date::date, (am.date AT TIME ZONE 'UTC')::date) >= $2::date
         AND COALESCE(am.date::date, (am.date AT TIME ZONE 'UTC')::date) <= $3::date
       ORDER BY am.date ASC, am.created_at ASC NULLS LAST
       LIMIT $4`,
      [accountId, start, end, limit],
    );
    raw = (res.rows || []).map(mapExtractSqlRow);
    usedMovements = raw.length > 0;
  } catch (err) {
    softSchemaOrThrow(err, 'fetchCariExtract.mov');
    raw = [];
  }

  if (!raw.length) {
    try {
      const res = await pgQuery<{
        id: string;
        date: string;
        fiche_no: string;
        definition: string;
        amount: number;
        sign: number;
        source: string;
      }>(
        `SELECT * FROM (
           SELECT
             s.id::text AS id,
             COALESCE(s.date::date, (s.date AT TIME ZONE 'UTC')::date)::text AS date,
             COALESCE(s.fiche_no, '') AS fiche_no,
             (${saleDefinitionSql}) AS definition,
             ABS(COALESCE(s.net_amount, s.total_net, 0))::float8 AS amount,
             (${saleSignSql})::int AS sign,
             'sale'::text AS source,
             COALESCE(s.date::timestamptz, s.created_at) AS sort_ts
           FROM ${sales} s
           WHERE s.customer_id::text = $1
             AND COALESCE(s.is_cancelled, false) = false
             AND ${SQL_COUNTABLE_SALE}
             AND ${ficheFilter}
             AND COALESCE(s.date::date, (s.date AT TIME ZONE 'UTC')::date) >= $2::date
             AND COALESCE(s.date::date, (s.date AT TIME ZONE 'UTC')::date) <= $3::date
           UNION ALL
           SELECT
             cl.id::text AS id,
             COALESCE(cl.date::date, (cl.date AT TIME ZONE 'UTC')::date)::text AS date,
             COALESCE(cl.fiche_no, '') AS fiche_no,
             COALESCE(NULLIF(TRIM(cl.definition), ''), UPPER(TRIM(COALESCE(cl.transaction_type, ''))), 'Kasa') AS definition,
             ABS(COALESCE(cl.amount, 0))::float8 AS amount,
             -1 AS sign,
             'cash'::text AS source,
             COALESCE(cl.date::timestamptz, cl.created_at) AS sort_ts
           FROM ${cash} cl
           WHERE cl.customer_id::text = $1
             AND UPPER(TRIM(COALESCE(cl.transaction_type, ''))) IN ('CH_TAHSILAT', 'CH_ODEME')
             AND COALESCE(cl.date::date, (cl.date AT TIME ZONE 'UTC')::date) >= $2::date
             AND COALESCE(cl.date::date, (cl.date AT TIME ZONE 'UTC')::date) <= $3::date
         ) u
         ORDER BY u.date ASC, u.sort_ts ASC NULLS LAST
         LIMIT $4`,
        [accountId, start, end, limit],
      );
      raw = (res.rows || []).map(mapExtractSqlRow);
    } catch (err) {
      throwReportError(err, 'fetchCariExtract.saleCash');
    }
  }

  // R11b: tarih aralığı öncesi net → sentetik “Devreden” (opening_balance fişi “Devir” kalır)
  let openingNet = await fetchCariExtractOpeningNet({
    accountId,
    isCustomer,
    startDate: start,
    useMovements: usedMovements,
    ficheFilter,
    saleSignSql,
  });
  // Sales/cash prior boşsa geçmiş account_movements bakiyesini dene
  if (!usedMovements && Math.abs(openingNet) < 0.005) {
    openingNet = await fetchCariExtractOpeningNet({
      accountId,
      isCustomer,
      startDate: start,
      useMovements: true,
      ficheFilter,
      saleSignSql,
    });
  }

  const withOpening = [...raw];
  if (Math.abs(openingNet) >= 0.005) {
    withOpening.unshift({
      id: `bf-${accountId}-${start}`,
      date: start,
      ficheNo: '',
      definition: 'Devreden',
      amount: Math.abs(openingNet),
      sign: openingNet >= 0 ? 1 : -1,
      source: usedMovements ? 'movement' : 'sale',
    });
  }

  return mapRunningExtract(withOpening);
}

/** Web `MinMaxStockReport` — min/max stok kontrol listesi */
export type MinMaxStockRow = {
  id: string;
  code: string | null;
  name: string;
  stock: number;
  min_stock: number | null;
  max_stock: number | null;
  unit: string | null;
  status: 'normal' | 'critical' | 'depleted' | 'over';
};

function mapMinMaxStockRow(r: {
  id: string;
  code: string | null;
  name: string;
  stock: number;
  min_stock: number | null;
  max_stock: number | null;
  unit: string | null;
}): MinMaxStockRow {
  const stock = Number(r.stock ?? 0);
  const min = r.min_stock != null ? Number(r.min_stock) : null;
  const max = r.max_stock != null ? Number(r.max_stock) : null;
  let status: MinMaxStockRow['status'] = 'normal';
  if (stock === 0) status = 'depleted';
  else if (min != null && stock <= min) status = 'critical';
  else if (max != null && stock >= max) status = 'over';
  return {
    id: String(r.id),
    code: r.code,
    name: r.name,
    stock,
    min_stock: min,
    max_stock: max,
    unit: r.unit,
    status,
  };
}

async function fetchMinMaxStockViaRest(opts: {
  filter: 'all' | 'low' | 'out';
  limit: number;
}): Promise<MinMaxStockRow[]> {
  const table = productsTable();
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select: 'id,code,name,stock,min_stock,max_stock,unit,is_active',
      is_active: 'eq.true',
      order: 'name.asc',
      limit: Math.min(opts.limit * 3, 5000),
    },
    { schema: 'public' },
  );
  let list = (Array.isArray(rows) ? rows : []).map((r) =>
    mapMinMaxStockRow({
      id: String(r.id ?? ''),
      code: r.code != null ? String(r.code) : null,
      name: String(r.name ?? ''),
      stock: Number(r.stock ?? 0) || 0,
      min_stock: r.min_stock == null ? null : Number(r.min_stock),
      max_stock: r.max_stock == null ? null : Number(r.max_stock),
      unit: r.unit != null ? String(r.unit) : null,
    }),
  );
  if (opts.filter === 'low') list = list.filter((r) => r.stock <= (r.min_stock ?? 0));
  if (opts.filter === 'out') list = list.filter((r) => r.stock === 0);
  return list.sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name)).slice(0, opts.limit);
}

async function fetchMinMaxStockViaBridge(opts: {
  filter: 'all' | 'low' | 'out';
  limit: number;
}): Promise<MinMaxStockRow[]> {
  const table = productsTable();
  let where = `COALESCE(is_active, true) = true`;
  if (opts.filter === 'low') {
    where += ` AND COALESCE(stock, 0) <= COALESCE(min_stock, 0)`;
  } else if (opts.filter === 'out') {
    where += ` AND COALESCE(stock, 0) = 0`;
  }

  const res = await pgQuery<{
    id: string;
    code: string | null;
    name: string;
    stock: number;
    min_stock: number | null;
    max_stock: number | null;
    unit: string | null;
  }>(
    `SELECT id::text AS id, code, name,
            COALESCE(stock, 0)::float8 AS stock,
            min_stock, max_stock, unit
     FROM ${table}
     WHERE ${where}
     ORDER BY COALESCE(stock, 0) ASC, name ASC
     LIMIT $1`,
    [opts.limit],
  );
  return res.rows.map(mapMinMaxStockRow);
}

export async function fetchMinMaxStock(opts?: {
  filter?: 'all' | 'low' | 'out';
  limit?: number;
}): Promise<MinMaxStockRow[]> {
  const limit = opts?.limit ?? 500;
  const filter = opts?.filter ?? 'all';
  try {
    return await runReportTransport({
      label: 'fetchMinMaxStock',
      viaRest: () => fetchMinMaxStockViaRest({ filter, limit }),
      viaBridge: () => fetchMinMaxStockViaBridge({ filter, limit }),
    });
  } catch (err) {
    throwReportError(err, 'fetchMinMaxStock');
  }
}

/** Web `MaterialValueReport` — stok × ortalama maliyet */
export type MaterialValueRow = {
  id: string;
  code: string | null;
  name: string;
  unit: string | null;
  quantity: number;
  unit_cost: number;
  total_value: number;
};

export async function fetchMaterialValue(limit = 500): Promise<MaterialValueRow[]> {
  try {
    return await runReportTransport({
      label: 'fetchMaterialValue',
      viaRest: async () => {
        const table = productsTable();
        const rows = await postgrestGet<Record<string, unknown>[]>(
          `/${table}`,
          {
            select: 'id,code,name,unit,stock,cost,price,is_active',
            is_active: 'eq.true',
            order: 'name.asc',
            limit: Math.min(limit * 2, 5000),
          },
          { schema: 'public' },
        );
        return (Array.isArray(rows) ? rows : [])
          .map((r) => {
            const quantity = Number(r.stock ?? 0) || 0;
            const unit_cost = Number(r.cost ?? r.price ?? 0) || 0;
            return {
              id: String(r.id ?? ''),
              code: r.code != null ? String(r.code) : null,
              name: String(r.name ?? ''),
              unit: r.unit != null ? String(r.unit) : null,
              quantity,
              unit_cost,
              total_value: quantity * unit_cost,
            };
          })
          .filter((r) => r.quantity > 0 && r.id)
          .sort((a, b) => b.total_value - a.total_value)
          .slice(0, limit);
      },
      viaBridge: () => fetchMaterialValueViaBridge(limit),
    });
  } catch (err) {
    throwReportError(err, 'fetchMaterialValue');
  }
}

async function fetchMaterialValueViaBridge(limit: number): Promise<MaterialValueRow[]> {
  const table = productsTable();
  const res = await pgQuery<{
    id: string;
    code: string | null;
    name: string;
    unit: string | null;
    quantity: number;
    unit_cost: number;
    total_value: number;
  }>(
    `SELECT id::text AS id, code, name, unit,
            COALESCE(stock, 0)::float8 AS quantity,
            COALESCE(cost, price, 0)::float8 AS unit_cost,
            (COALESCE(stock, 0) * COALESCE(cost, price, 0))::float8 AS total_value
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND COALESCE(stock, 0) > 0
     ORDER BY total_value DESC, name ASC
     LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    code: r.code,
    name: r.name,
    unit: r.unit,
    quantity: Number(r.quantity ?? 0),
    unit_cost: Number(r.unit_cost ?? 0),
    total_value: Number(r.total_value ?? 0),
  }));
}

/** Web `WarehouseStatusReport` — çoklu depo yok; toplam stok + ilk aktif depo */
export type WarehouseStatusRow = {
  id: string;
  code: string | null;
  name: string;
  total: number;
  warehouse_name: string | null;
  warehouse_qty: number;
};

export async function fetchWarehouseStatus(limit = 500): Promise<{
  warehouseName: string | null;
  rows: WarehouseStatusRow[];
}> {
  const table = productsTable();
  let warehouseName: string | null = null;
  try {
    const wh = await pgQuery<{ name: string }>(
      `SELECT name FROM public.stores
       WHERE COALESCE(is_active, true) = true
       ORDER BY created_at ASC NULLS LAST
       LIMIT 1`,
    );
    warehouseName = wh.rows[0]?.name ?? null;
  } catch (err) {
    softSchemaOrThrow(err, 'fetchWarehouseStatus.stores');
    warehouseName = null;
  }

  const res = await pgQuery<{
    id: string;
    code: string | null;
    name: string;
    total: number;
  }>(
    `SELECT id::text AS id, code, name,
            COALESCE(stock, 0)::float8 AS total
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
     ORDER BY total DESC, name ASC
     LIMIT $1`,
    [limit],
  );

  return {
    warehouseName,
    rows: res.rows.map((r) => ({
      id: String(r.id),
      code: r.code,
      name: r.name,
      total: Number(r.total ?? 0),
      warehouse_name: warehouseName,
      warehouse_qty: Number(r.total ?? 0),
    })),
  };
}

/** Web `MaterialExtractReport` — ürün hareket ekstresi */
export type MaterialExtractRow = {
  id: string;
  date: string;
  document_no: string;
  movement_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  running_balance: number;
  warehouse_name: string | null;
  source: 'slip' | 'invoice';
};

export async function fetchMaterialExtract(opts: {
  productId: string;
  productCode?: string;
  startDate: string;
  endDate: string;
  limit?: number;
}): Promise<MaterialExtractRow[]> {
  const productId = String(opts.productId || '').trim();
  const start = String(opts.startDate || '').slice(0, 10);
  const end = String(opts.endDate || '').slice(0, 10);
  if (!productId || !start || !end) return [];

  const fn = firmNr();
  const pn = periodNr();
  const mov = stockMovementsTable(fn, pn);
  const items = stockMovementItemsTable(fn, pn);
  const products = productsTable(fn);
  const sales = salesTable(fn, pn);
  const saleItems = saleItemsTable(fn, pn);
  const hintCode = String(opts.productCode || '').trim();
  const limit = opts.limit ?? 1000;

  type Raw = {
    id: string;
    date: string;
    document_no: string;
    movement_type: string;
    description: string;
    quantity: number;
    unit_price: number;
    warehouse_name: string | null;
    source: 'slip' | 'invoice';
  };

  const raw: Raw[] = [];

  try {
    const res = await pgQuery<Raw>(
      `SELECT i.id::text AS id,
              COALESCE(m.movement_date::date, m.created_at::date)::text AS date,
              COALESCE(m.document_no, '') AS document_no,
              COALESCE(m.movement_type, '') AS movement_type,
              COALESCE(NULLIF(TRIM(m.description), ''), '') AS description,
              COALESCE(i.quantity, 0)::float8 AS quantity,
              COALESCE(i.unit_price, i.cost_price, 0)::float8 AS unit_price,
              s.name AS warehouse_name,
              'slip'::text AS source
       FROM ${items} i
       JOIN ${mov} m ON i.movement_id = m.id
       LEFT JOIN public.stores s ON m.warehouse_id = s.id
       WHERE i.product_id::text = $1
          OR i.product_id IN (
               SELECT id FROM ${products}
               WHERE id::text = $1 OR code = $1
                  OR ($2::text <> '' AND code = $2)
             )
         AND COALESCE(m.movement_date::date, m.created_at::date) >= $3::date
         AND COALESCE(m.movement_date::date, m.created_at::date) <= $4::date
       ORDER BY m.movement_date ASC, m.created_at ASC NULLS LAST
       LIMIT $5`,
      [productId, hintCode, start, end, limit],
    );
    raw.push(...res.rows);
  } catch (err) {
    softSchemaOrThrow(err, 'fetchMaterialExtract.slip');
  }

  try {
    const res = await pgQuery<Raw>(
      `SELECT si.id::text AS id,
              COALESCE(sl.date::date, sl.created_at::date)::text AS date,
              COALESCE(sl.fiche_no, '') AS document_no,
              CASE
                WHEN LOWER(TRIM(COALESCE(sl.fiche_type, ''))) = 'purchase_invoice'
                  OR COALESCE(sl.trcode, 0) IN (1, 4, 5) THEN 'in'
                WHEN LOWER(TRIM(COALESCE(sl.fiche_type, ''))) = 'return_invoice'
                  AND COALESCE(sl.trcode, 0) = 3 THEN 'in'
                WHEN LOWER(TRIM(COALESCE(sl.fiche_type, ''))) = 'return_invoice' THEN 'out'
                WHEN LOWER(TRIM(COALESCE(sl.fiche_type, ''))) IN (
                  'sales_invoice', 'sales', 'retail', 'service', 'hizmet'
                )
                  OR COALESCE(sl.trcode, 0) IN (0, 7, 8, 9) THEN 'out'
                ELSE 'out'
              END AS movement_type,
              COALESCE(sl.fiche_type, '') AS description,
              COALESCE(si.quantity, 0)::float8 AS quantity,
              COALESCE(
                NULLIF(si.unit_price, 0),
                CASE
                  WHEN ABS(COALESCE(si.quantity, 0)) > 0.0000001
                  THEN COALESCE(NULLIF(si.net_amount, 0), NULLIF(si.total_amount, 0), 0)
                       / NULLIF(ABS(si.quantity), 0)
                  ELSE 0
                END
              )::float8 AS unit_price,
              st.name AS warehouse_name,
              'invoice'::text AS source
       FROM ${saleItems} si
       JOIN ${sales} sl ON si.invoice_id = sl.id
       LEFT JOIN public.stores st ON sl.store_id = st.id
       WHERE COALESCE(sl.is_cancelled, false) = false
         AND (
           si.product_id::text = $1
           OR si.item_code = $1
           OR si.item_code IN (
                SELECT code FROM ${products}
                WHERE id::text = $1 OR code = $1
                   OR ($2::text <> '' AND code = $2)
              )
         )
         AND COALESCE(sl.date::date, sl.created_at::date) >= $3::date
         AND COALESCE(sl.date::date, sl.created_at::date) <= $4::date
       ORDER BY sl.date ASC
       LIMIT $5`,
      [productId, hintCode, start, end, limit],
    );
    raw.push(...res.rows);
  } catch (err) {
    throwReportError(err, 'fetchMaterialExtract.invoice');
  }

  raw.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let balance = 0;
  return raw.map((m) => {
    const qty = Number(m.quantity) || 0;
    const unitPrice = Number(m.unit_price) || 0;
    if (m.movement_type === 'in') balance += qty;
    else if (m.movement_type === 'out') balance -= qty;
    return {
      id: m.id,
      date: m.date,
      document_no: m.document_no,
      movement_type: m.movement_type,
      description: m.description,
      quantity: qty,
      unit_price: unitPrice,
      amount: qty * unitPrice,
      running_balance: balance,
      warehouse_name: m.warehouse_name,
      source: m.source,
    };
  });
}

/** Web `erpReports.getProductGrossProfit` — basitleştirilmiş ürün satış dökümü */
export type ProductSalesRow = {
  productId: string;
  productCode: string;
  productName: string;
  qty: number;
  amount: number;
};

export async function fetchProductSales(opts?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<ProductSalesRow[]> {
  const range = defaultExtractRange(30);
  const start = String(opts?.startDate || range.start).slice(0, 10);
  const end = String(opts?.endDate || range.end).slice(0, 10);
  const limit = opts?.limit ?? 200;
  return runReportTransport({
    label: 'fetchProductSales',
    viaRest: () => fetchProductSalesViaRest(start, end, limit),
    viaBridge: () => fetchProductSalesViaBridge(start, end, limit),
  });
}

async function fetchProductSalesViaRest(
  start: string,
  end: string,
  limit: number,
): Promise<ProductSalesRow[]> {
  const fn = firmNr();
  const pn = periodNr();
  const salesPath = `/${salesTable(fn, pn)}`;
  const itemsPath = `/${saleItemsTable(fn, pn)}`;
  const productsPath = `/${productsTable(fn)}`;

  const [sales, items, products] = await Promise.all([
    postgrestGet<Record<string, unknown>[]>(
      salesPath,
      {
        select: 'id,date,created_at,fiche_type,trcode,is_cancelled,status,store_id',
        order: 'date.desc',
        limit: 8000,
      },
      { schema: 'public' },
    ),
    postgrestGet<Record<string, unknown>[]>(
      itemsPath,
      {
        select: 'invoice_id,product_id,item_code,item_name,item_type,quantity,net_amount,total_amount',
        limit: 12000,
      },
      { schema: 'public' },
    ),
    postgrestGet<Record<string, unknown>[]>(
      productsPath,
      { select: 'id,code,name', limit: 8000 },
      { schema: 'public' },
    ),
  ]);

  const salesById = new Map<string, Record<string, unknown>>();
  for (const s of sales || []) {
    if (isCancelledRow(s)) continue;
    if (!isCountableSaleStatus(s)) continue;
    if (!isSalesRevenueRow(s)) continue;
    if (!matchesSessionStore(s)) continue;
    const day = String(s.date || s.created_at || '').slice(0, 10);
    if (!day || day < start || day > end) continue;
    salesById.set(String(s.id), s);
  }

  const productById = new Map(
    (products || []).map((p) => [String(p.id), p] as const),
  );

  const agg = new Map<string, ProductSalesRow>();
  for (const it of items || []) {
    const inv = salesById.get(String(it.invoice_id || ''));
    if (!inv) continue;
    const itemType = String(it.item_type || 'Malzeme');
    if (itemType === 'Promosyon' || itemType === 'İndirim') continue;
    const pid = String(it.product_id ?? it.item_code ?? '');
    const p = pid ? productById.get(pid) : undefined;
    const productCode = String(it.item_code || p?.code || '').trim();
    const productName = String(it.item_name || p?.name || 'Ürün').trim() || 'Ürün';
    const key = pid || productCode || productName;
    if (!key) continue;
    const qty = Number(it.quantity ?? 0) || 0;
    const amount = Number(it.net_amount ?? it.total_amount ?? 0) || 0;
    const cur = agg.get(key) || {
      productId: pid,
      productCode,
      productName,
      qty: 0,
      amount: 0,
    };
    cur.qty += qty;
    cur.amount += amount;
    if (!cur.productCode && productCode) cur.productCode = productCode;
    if ((!cur.productName || cur.productName === 'Ürün') && productName) {
      cur.productName = productName;
    }
    agg.set(key, cur);
  }

  return [...agg.values()]
    .filter((r) => r.qty !== 0 || r.amount !== 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

async function fetchProductSalesViaBridge(
  start: string,
  end: string,
  limit: number,
): Promise<ProductSalesRow[]> {
  const items = saleItemsTable();
  const sales = salesTable();
  const products = productsTable();

  try {
    const params: unknown[] = [start, end, limit];
    const storeSql = appendStoreIdFilterAllowNull('s.store_id', params);
    const res = await pgQuery<{
      product_id: string;
      product_code: string;
      product_name: string;
      qty: string | number;
      amount: string | number;
    }>(
      `SELECT
         COALESCE(si.product_id::text, si.item_code, '') AS product_id,
         COALESCE(NULLIF(TRIM(si.item_code), ''), p.code, '') AS product_code,
         COALESCE(NULLIF(TRIM(si.item_name), ''), p.name, 'Ürün') AS product_name,
         COALESCE(SUM(COALESCE(si.quantity, 0)), 0)::float8 AS qty,
         COALESCE(SUM(COALESCE(si.net_amount, si.total_amount, 0)), 0)::float8 AS amount
       FROM ${items} si
       INNER JOIN ${sales} s ON s.id = si.invoice_id
       LEFT JOIN ${products} p ON p.id = si.product_id
       WHERE COALESCE(s.is_cancelled, false) = false
         AND ${SQL_COUNTABLE_SALE}
         AND COALESCE(s.date::date, s.created_at::date) >= $1::date
         AND COALESCE(s.date::date, s.created_at::date) <= $2::date
         AND COALESCE(si.item_type, 'Malzeme') NOT IN ('Promosyon', 'İndirim')
         ${storeSql}
       GROUP BY 1, 2, 3
       HAVING COALESCE(SUM(COALESCE(si.quantity, 0)), 0) <> 0
          OR COALESCE(SUM(COALESCE(si.net_amount, si.total_amount, 0)), 0) <> 0
       ORDER BY amount DESC
       LIMIT $3`,
      params,
    );
    return res.rows.map((r) => ({
      productId: String(r.product_id ?? ''),
      productCode: String(r.product_code ?? ''),
      productName: String(r.product_name ?? ''),
      qty: Number(r.qty ?? 0),
      amount: Number(r.amount ?? 0),
    }));
  } catch (err) {
    throwReportError(err, 'fetchProductSales');
  }
}

/** Web `erpReports.getCashBankMovements` — kasa hareketleri (cash) */
export type CashMovementRow = {
  id: string;
  registerName: string;
  ficheNo: string;
  date: string;
  transactionType: string;
  definition: string;
  amount: number;
  sign: number;
  netAmount: number;
};

async function fetchCashMovementsViaRest(
  start: string,
  end: string,
  limit: number,
): Promise<CashMovementRow[]> {
  const lines = cashLinesTable();
  const registers = cashRegistersTable();
  const sid = storeId();

  const [lineRows, regRows] = await Promise.all([
    postgrestGet<Record<string, unknown>[]>(
      `/${lines}`,
      {
        select:
          'id,register_id,fiche_no,date,created_at,transaction_type,definition,amount,sign,store_id',
        order: 'date.desc',
        limit: Math.min(limit * 3, 5000),
      },
      { schema: 'public' },
    ),
    postgrestGet<Array<{ id?: string; name?: string; code?: string }>>(
      `/${registers}`,
      { select: 'id,name,code', limit: 500 },
      { schema: 'public' },
    ).catch(() => [] as Array<{ id?: string; name?: string; code?: string }>),
  ]);

  const regMap = new Map(
    (Array.isArray(regRows) ? regRows : [])
      .filter((r) => r.id)
      .map((r) => [String(r.id), String(r.name || r.code || '')]),
  );

  const out: CashMovementRow[] = [];
  for (const r of Array.isArray(lineRows) ? lineRows : []) {
    const day = String(r.date || r.created_at || '').slice(0, 10);
    if (!day || day < start || day > end) continue;
    if (sid && r.store_id != null && String(r.store_id) !== String(sid)) continue;
    const amount = Number(r.amount ?? 0) || 0;
    const sign = Number(r.sign ?? 1) || 1;
    out.push({
      id: String(r.id ?? ''),
      registerName: regMap.get(String(r.register_id ?? '')) || '',
      ficheNo: String(r.fiche_no ?? ''),
      date: day,
      transactionType: String(r.transaction_type ?? ''),
      definition: String(r.definition ?? ''),
      amount,
      sign,
      netAmount: amount * sign,
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchCashMovementsViaBridge(
  start: string,
  end: string,
  limit: number,
): Promise<CashMovementRow[]> {
  const lines = cashLinesTable();
  const registers = cashRegistersTable();
  const params: unknown[] = [start, end, limit];
  const storeSql = appendStoreIdFilterAllowNull('cl.store_id', params);
  const res = await pgQuery<{
    id: string;
    register_name: string;
    fiche_no: string;
    date: string;
    transaction_type: string;
    definition: string;
    amount: string | number;
    sign: string | number;
  }>(
    `SELECT
       cl.id::text AS id,
       COALESCE(cr.name, cr.code, '') AS register_name,
       COALESCE(cl.fiche_no, '') AS fiche_no,
       COALESCE(cl.date::date, cl.created_at::date)::text AS date,
       COALESCE(cl.transaction_type, '') AS transaction_type,
       COALESCE(cl.definition, '') AS definition,
       COALESCE(cl.amount, 0)::float8 AS amount,
       COALESCE(cl.sign, 1)::int AS sign
     FROM ${lines} cl
     LEFT JOIN ${registers} cr ON cr.id = cl.register_id
     WHERE COALESCE(cl.date::date, cl.created_at::date) >= $1::date
       AND COALESCE(cl.date::date, cl.created_at::date) <= $2::date
       ${storeSql}
     ORDER BY COALESCE(cl.date, cl.created_at) DESC
     LIMIT $3`,
    params,
  );
  return res.rows.map((r) => {
    const amount = Number(r.amount ?? 0);
    const sign = Number(r.sign ?? 1) || 1;
    return {
      id: String(r.id ?? ''),
      registerName: String(r.register_name ?? ''),
      ficheNo: String(r.fiche_no ?? ''),
      date: String(r.date ?? '').slice(0, 10),
      transactionType: String(r.transaction_type ?? ''),
      definition: String(r.definition ?? ''),
      amount,
      sign,
      netAmount: amount * sign,
    };
  });
}

export async function fetchCashMovements(opts?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<CashMovementRow[]> {
  const range = defaultExtractRange(30);
  const start = String(opts?.startDate || range.start).slice(0, 10);
  const end = String(opts?.endDate || range.end).slice(0, 10);
  const limit = opts?.limit ?? 500;
  try {
    return await runReportTransport({
      label: 'fetchCashMovements',
      viaRest: () => fetchCashMovementsViaRest(start, end, limit),
      viaBridge: () => fetchCashMovementsViaBridge(start, end, limit),
    });
  } catch (err) {
    throwReportError(err, 'fetchCashMovements');
  }
}

/** Web `AgingBucket` — vade aşım aralıkları */
export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export type CariAgingRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  cardType: 'customer' | 'supplier';
  ficheNo: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  daysOverdue: number;
  bucket: AgingBucket;
  termsDays: number;
};

function parseTermsDays(raw: unknown, fallback = 30): number {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 3650);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function ymdDiff(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

function todayYmdLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function bucketFromDaysOverdue(days: number): AgingBucket {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90_plus';
}

export function agingBucketLabel(bucket: AgingBucket): string {
  switch (bucket) {
    case 'current':
      return 'Vadesi gelmemiş';
    case 'd1_30':
      return '1–30 gün';
    case 'd31_60':
      return '31–60 gün';
    case 'd61_90':
      return '61–90 gün';
    case 'd90_plus':
      return '90+ gün';
    default:
      return bucket;
  }
}

/**
 * Basit cari yaşlandırma — web `erpReports.getCariAging` (dönem sales, veresiye/açık).
 */
export async function fetchCariAging(opts?: {
  cardType?: 'customer' | 'supplier' | 'all';
  limit?: number;
}): Promise<CariAgingRow[]> {
  const want = opts?.cardType ?? 'all';
  const limit = opts?.limit ?? 400;
  const today = todayYmdLocal();
  const fn = firmNr();
  const pn = periodNr();
  const sales = salesTable(fn, pn);
  const cust = customersTable(fn);
  const supp = suppliersTable(fn);
  const out: CariAgingRow[] = [];

  const mapRow = (
    r: Record<string, unknown>,
    cardType: 'customer' | 'supplier',
  ): CariAgingRow => {
    const invoiceDate = String(r.invoice_date ?? '').slice(0, 10);
    const termsDays = parseTermsDays(r.payment_terms, 30);
    const dueDate =
      String(r.due_date ?? '').slice(0, 10) || addDaysYmd(invoiceDate || today, termsDays);
    const daysOverdue = Math.max(0, ymdDiff(today, dueDate));
    return {
      accountId: String(r.account_id ?? ''),
      accountCode: String(r.account_code ?? ''),
      accountName: String(r.account_name ?? ''),
      cardType,
      ficheNo: String(r.fiche_no ?? ''),
      invoiceDate,
      dueDate,
      amount: Number(r.amount ?? 0),
      daysOverdue,
      bucket: bucketFromDaysOverdue(daysOverdue),
      termsDays,
    };
  };

  if (want === 'all' || want === 'customer') {
    try {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT
           c.id::text AS account_id,
           COALESCE(c.code, '') AS account_code,
           COALESCE(c.name, s.customer_name, '') AS account_name,
           c.payment_terms,
           s.fiche_no,
           COALESCE(s.date::date, s.created_at::date)::text AS invoice_date,
           CASE
             WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
               THEN -ABS(COALESCE(s.net_amount, 0))
             ELSE ABS(COALESCE(s.net_amount, 0))
           END::float8 AS amount
         FROM ${sales} s
         LEFT JOIN ${cust} c ON c.id = s.customer_id
         WHERE COALESCE(s.is_cancelled, false) = false
           AND ${SQL_COUNTABLE_SALE}
           AND (
             LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN (
               'sales_invoice', 'sales', 'retail', 'service', 'hizmet', 'return_invoice'
             )
             OR COALESCE(s.trcode, 0) IN (0, 2, 3, 7, 8, 9, 14)
           )
           AND (
             LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
             OR LOWER(TRIM(COALESCE(s.payment_method, ''))) IN (
               'veresiye', 'open_account', 'cari', 'açık hesap', 'acik hesap',
               'açık cari', 'acik cari', 'acik_cari', 'açık_cari'
             )
             OR LOWER(TRIM(COALESCE(s.payment_method, ''))) LIKE '%veresiye%'
           )
         ORDER BY s.date DESC NULLS LAST
         LIMIT $1`,
        [limit],
      );
      for (const r of res.rows) out.push(mapRow(r, 'customer'));
    } catch (err) {
      softSchemaOrThrow(err, 'fetchCariAging.customer');
    }
  }

  if (want === 'all' || want === 'supplier') {
    try {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT
           COALESCE(sup.id, c.id)::text AS account_id,
           COALESCE(sup.code, c.code, '') AS account_code,
           COALESCE(sup.name, c.name, s.customer_name, '') AS account_name,
           COALESCE(sup.payment_terms, c.payment_terms) AS payment_terms,
           s.fiche_no,
           COALESCE(s.date::date, s.created_at::date)::text AS invoice_date,
           CASE
             WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
               THEN -ABS(COALESCE(s.net_amount, 0))
             ELSE ABS(COALESCE(s.net_amount, 0))
           END::float8 AS amount
         FROM ${sales} s
         LEFT JOIN ${supp} sup ON sup.id = s.customer_id
         LEFT JOIN ${cust} c ON c.id = s.customer_id
         WHERE COALESCE(s.is_cancelled, false) = false
           AND ${SQL_COUNTABLE_SALE}
           AND (
             LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('purchase_invoice', 'return_invoice')
             OR COALESCE(s.trcode, 0) IN (1, 4, 5, 6, 13, 26, 41, 42)
           )
           AND (
             LOWER(TRIM(COALESCE(s.fiche_type, ''))) = 'return_invoice'
             OR NOT (
               LOWER(TRIM(COALESCE(s.payment_method, ''))) IN (
                 'cash', 'nakit', 'card', 'kart', 'gateway', 'havale', 'eft', 'haval', 'kredikarti', 'transfer'
               )
               OR LOWER(TRIM(COALESCE(s.payment_method, ''))) LIKE '%kredi%kart%'
             )
           )
         ORDER BY s.date DESC NULLS LAST
         LIMIT $1`,
        [limit],
      );
      for (const r of res.rows) out.push(mapRow(r, 'supplier'));
    } catch (err) {
      softSchemaOrThrow(err, 'fetchCariAging.supplier');
    }
  }

  return out
    .filter((r) => Math.abs(r.amount) > 0.009)
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount)
    .slice(0, limit);
}
