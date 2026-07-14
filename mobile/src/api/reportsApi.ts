import { pgQuery } from './pgClient';
import {
  accountMovementsTable,
  cashLinesTable,
  cashRegistersTable,
  customersTable,
  firmNr,
  periodNr,
  productsTable,
  saleItemsTable,
  salesTable,
  stockMovementItemsTable,
  stockMovementsTable,
  suppliersTable,
} from './erpTables';

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

export async function fetchSalesByDay(days = 14): Promise<SalesDayRow[]> {
  const table = salesTable(firmNr(), periodNr());
  const res = await pgQuery<{ day: string; revenue: string | number; count: string | number }>(
    `SELECT date_trunc('day', COALESCE(date::timestamp, created_at))::date::text AS day,
            COALESCE(SUM(COALESCE(net_amount, total_net, 0)), 0)::float8 AS revenue,
            COUNT(*)::int AS count
     FROM ${table}
     WHERE COALESCE(is_cancelled, false) = false
       AND (${sqlSalesRevenueFt()})
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
  const items = saleItemsTable(fn, pn);
  const sales = salesTable(fn, pn);
  try {
    const res = await pgQuery<TopProductRow>(
      `SELECT COALESCE(si.item_name, si.item_code, 'Ürün') AS product_name,
              COALESCE(SUM(si.quantity), 0)::float8 AS qty,
              COALESCE(SUM(COALESCE(si.net_amount, si.total_amount, 0)), 0)::float8 AS amount
       FROM ${items} si
       INNER JOIN ${sales} s ON s.id = si.invoice_id
       WHERE COALESCE(s.is_cancelled, false) = false
         AND ${SQL_COUNTABLE_SALE}
         AND (${sqlSalesRevenueFt('s')})
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
    // Web erpReports + mobil legacy ('sales'/'retail') + trcode 7/8 POS
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
             WHEN LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN ('return_invoice', 'purchase_invoice')
               OR COALESCE(s.trcode, 0) IN (1, 3, 6) THEN -1
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

export async function fetchMinMaxStock(opts?: {
  filter?: 'all' | 'low' | 'out';
  limit?: number;
}): Promise<MinMaxStockRow[]> {
  const table = productsTable();
  const limit = opts?.limit ?? 500;
  const filter = opts?.filter ?? 'all';
  let where = `COALESCE(is_active, true) = true`;
  if (filter === 'low') {
    where += ` AND COALESCE(stock, 0) <= COALESCE(min_stock, 0)`;
  } else if (filter === 'out') {
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
    [limit],
  );

  return res.rows.map((r) => {
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
  });
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
  } catch {
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
  } catch {
    // slip yok
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
  } catch {
    // fatura satırı yok
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
  const items = saleItemsTable();
  const sales = salesTable();
  const products = productsTable();

  try {
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
       GROUP BY 1, 2, 3
       HAVING COALESCE(SUM(COALESCE(si.quantity, 0)), 0) <> 0
          OR COALESCE(SUM(COALESCE(si.net_amount, si.total_amount, 0)), 0) <> 0
       ORDER BY amount DESC
       LIMIT $3`,
      [start, end, limit],
    );
    return res.rows.map((r) => ({
      productId: String(r.product_id ?? ''),
      productCode: String(r.product_code ?? ''),
      productName: String(r.product_name ?? ''),
      qty: Number(r.qty ?? 0),
      amount: Number(r.amount ?? 0),
    }));
  } catch {
    return [];
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

export async function fetchCashMovements(opts?: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<CashMovementRow[]> {
  const range = defaultExtractRange(30);
  const start = String(opts?.startDate || range.start).slice(0, 10);
  const end = String(opts?.endDate || range.end).slice(0, 10);
  const limit = opts?.limit ?? 500;
  const lines = cashLinesTable();
  const registers = cashRegistersTable();

  try {
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
       ORDER BY COALESCE(cl.date, cl.created_at) DESC
       LIMIT $3`,
      [start, end, limit],
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
  } catch {
    return [];
  }
}
