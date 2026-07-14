import { pgQuery } from './pgClient';
import {
  accountMovementsTable,
  customersTable,
  firmNr,
  periodNr,
  productsTable,
  salesTable,
  suppliersTable,
} from './erpTables';

/** Web `SQL_COUNTABLE_SALE_STATUS` — alias `s` */
const SQL_COUNTABLE_SALE = `COALESCE(s.status, 'approved') IN ('completed', 'approved')`;

export type SalesDayRow = {
  day: string;
  revenue: number;
  count: number;
};

export async function fetchSalesByDay(days = 14): Promise<SalesDayRow[]> {
  const table = salesTable(firmNr(), periodNr());
  const res = await pgQuery<{ day: string; revenue: string | number; count: string | number }>(
    `SELECT date_trunc('day', COALESCE(date::timestamp, created_at))::date::text AS day,
            COALESCE(SUM(COALESCE(net_amount, total_net, 0)), 0)::float8 AS revenue,
            COUNT(*)::int AS count
     FROM ${table}
     WHERE COALESCE(is_cancelled, false) = false
       AND COALESCE(date::date, created_at::date) >= (CURRENT_DATE - ($1::int || ' days')::interval)
     GROUP BY 1
     ORDER BY 1 DESC`,
    [days],
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

export async function fetchTopProducts(limit = 20): Promise<TopProductRow[]> {
  const fn = firmNr();
  const pn = periodNr();
  // sale_items tablosu — yoksa boş
  try {
    const res = await pgQuery<TopProductRow>(
      `SELECT COALESCE(item_name, item_code, 'Ürün') AS product_name,
              COALESCE(SUM(quantity), 0)::float8 AS qty,
              COALESCE(SUM(COALESCE(net_amount, total_amount, 0)), 0)::float8 AS amount
       FROM rex_${fn}_${pn}_sale_items
       GROUP BY 1
       ORDER BY amount DESC
       LIMIT $1`,
      [limit],
    );
    return res.rows;
  } catch {
    return [];
  }
}

/** Web `erpReports.getCariBalances` — cari mizan / bakiye özeti */
export type CariBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  cardType: 'customer' | 'supplier';
  balance: number;
  creditLimit: number;
};

export async function fetchCariBalances(opts?: {
  cardType?: 'customer' | 'supplier' | 'all';
  onlyNonZero?: boolean;
  limit?: number;
}): Promise<CariBalanceRow[]> {
  const want = opts?.cardType ?? 'all';
  const onlyNonZero = opts?.onlyNonZero !== false;
  const limit = opts?.limit ?? 500;
  const balFilter = onlyNonZero ? 'AND ABS(COALESCE(balance, 0)) > 0.009' : '';
  const cust = customersTable();
  const supp = suppliersTable();

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
    return res.rows.map((r) => ({
      accountId: String(r.account_id ?? ''),
      accountCode: String(r.account_code ?? ''),
      accountName: String(r.account_name ?? ''),
      cardType: r.card_type === 'supplier' ? 'supplier' : 'customer',
      balance: Number(r.balance ?? 0),
      creditLimit: Number(r.credit_limit ?? 0),
    }));
  } catch {
    // Tedarikçi tablosu yoksa yalnızca müşteri
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
    return res.rows.map((r) => ({
      accountId: String(r.account_id ?? ''),
      accountCode: String(r.account_code ?? ''),
      accountName: String(r.account_name ?? ''),
      cardType: 'customer' as const,
      balance: Number(r.balance ?? 0),
      creditLimit: Number(r.credit_limit ?? 0),
    }));
  }
}

/** Web `erpReports.getCariExtract` — cari ekstre */
export type CariExtractRow = {
  id: string;
  date: string;
  ficheNo: string;
  definition: string;
  debit: number;
  credit: number;
  balance: number;
  source: 'movement' | 'sale';
};

function mapRunningExtract(
  raw: {
    id: string;
    date: string;
    ficheNo: string;
    definition: string;
    amount: number;
    sign: number;
    source: 'movement' | 'sale';
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

  const isCustomer = opts.cardType === 'customer';
  const idCol = isCustomer ? 'customer_id' : 'supplier_id';
  const limit = opts.limit ?? 1000;
  const movTable = accountMovementsTable();
  const sales = salesTable();

  let raw: {
    id: string;
    date: string;
    ficheNo: string;
    definition: string;
    amount: number;
    sign: number;
    source: 'movement' | 'sale';
  }[] = [];

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
    raw = (res.rows || []).map((r) => ({
      id: String(r.id ?? ''),
      date: String(r.date ?? '').slice(0, 10),
      ficheNo: String(r.fiche_no ?? ''),
      definition: String(r.definition ?? ''),
      amount: Number(r.amount ?? 0),
      sign: Number(r.sign ?? 1) || 1,
      source: 'movement' as const,
    }));
  } catch {
    raw = [];
  }

  if (!raw.length) {
    const ficheFilter = isCustomer
      ? `s.fiche_type IN ('sales_invoice', 'service', 'hizmet', 'return_invoice', 'opening_balance')`
      : `(s.fiche_type = 'purchase_invoice' OR s.trcode IN (1, 4, 5, 6, 13, 26, 41, 42) OR s.fiche_type IN ('return_invoice', 'opening_balance'))`;
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
           s.id::text AS id,
           COALESCE(s.date::date, (s.date AT TIME ZONE 'UTC')::date)::text AS date,
           COALESCE(s.fiche_no, '') AS fiche_no,
           COALESCE(s.fiche_type, '') AS definition,
           ABS(COALESCE(s.net_amount, s.total_net, 0))::float8 AS amount,
           CASE
             WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('return_invoice', 'purchase_invoice') THEN -1
             ELSE 1
           END AS sign,
           'sale'::text AS source
         FROM ${sales} s
         WHERE s.customer_id::text = $1
           AND COALESCE(s.is_cancelled, false) = false
           AND ${SQL_COUNTABLE_SALE}
           AND ${ficheFilter}
           AND COALESCE(s.date::date, (s.date AT TIME ZONE 'UTC')::date) >= $2::date
           AND COALESCE(s.date::date, (s.date AT TIME ZONE 'UTC')::date) <= $3::date
         ORDER BY s.date ASC
         LIMIT $4`,
        [accountId, start, end, limit],
      );
      raw = (res.rows || []).map((r) => ({
        id: String(r.id ?? ''),
        date: String(r.date ?? '').slice(0, 10),
        ficheNo: String(r.fiche_no ?? ''),
        definition: String(r.definition ?? ''),
        amount: Number(r.amount ?? 0),
        sign: Number(r.sign ?? 1) || 1,
        source: 'sale' as const,
      }));
    } catch {
      raw = [];
    }
  }

  return mapRunningExtract(raw);
}

/** Yerel YYYY-MM-DD */
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
