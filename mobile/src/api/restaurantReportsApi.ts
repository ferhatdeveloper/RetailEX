/**
 * Restoran raporları — web RestaurantService (Z / iptal / ürün / adisyon / analiz) ile uyumlu.
 * Tablo: rest.rex_{firm}_{period}_rest_orders / rest_order_items / rest_tables
 */
import { pgQuery } from './pgClient';
import { rethrowTransportInfra } from './dataTransport';
import {
  restOrderItemsTable,
  restOrdersTable,
  restTablesTable,
  salesTable,
} from './erpTables';

function ymdToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function parseYmd(s: string): { y: number; m: number; day: number } | null {
  const d = String(s ?? '').trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (iso) return { y: +iso[1]!, m: +iso[2]!, day: +iso[3]! };
  const tr = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(d);
  if (tr) return { y: +tr[3]!, m: +tr[2]!, day: +tr[1]! };
  return null;
}

/** Yerel takvim günü → UTC ISO aralığı (web Z raporu ile aynı) */
export function restYmdRangeToUtcIso(
  fromYmd: string,
  toYmd: string,
): { start: string; end: string } | null {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return null;
  const d1 = new Date(a.y, a.m - 1, a.day, 0, 0, 0, 0);
  const d2 = new Date(b.y, b.m - 1, b.day, 23, 59, 59, 999);
  if (d1.getTime() > d2.getTime()) return null;
  return { start: d1.toISOString(), end: d2.toISOString() };
}

export function defaultRestReportRange(): { from: string; to: string } {
  const to = ymdToday();
  const d = new Date();
  d.setDate(1);
  const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  return { from, to };
}

export function restReportPresetRange(
  preset: 'today' | '7d' | 'month',
): { from: string; to: string } {
  const to = ymdToday();
  const n = new Date();
  if (preset === 'today') return { from: to, to };
  if (preset === '7d') {
    const s = new Date(n);
    s.setDate(s.getDate() - 6);
    const from = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
    return { from, to };
  }
  return defaultRestReportRange();
}

async function trySql<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const res = await pgQuery<T>(sql, params);
    return res.rows ?? [];
  } catch (e) {
    rethrowTransportInfra(e, 'restaurantReportsApi');
    return [];
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type RestZReport = {
  totalSales: number;
  netCash: number;
  paymentsByType: { type: string; amount: number; count: number }[];
  salesByCategory: { category: string; amount: number; count: number }[];
  voids: { reason: string; amount: number; count: number }[];
  complements: { amount: number; count: number };
  returns: { amount: number; count: number };
  salesByProduct: { productName: string; quantity: number; amount: number }[];
};

export type RestProductQtyRow = {
  productId: string | null;
  productName: string;
  quantity: number;
  revenue: number;
};

export type RestVoidRow = {
  itemId: string;
  productName: string;
  quantity: number;
  subtotal: number;
  voidReason: string;
  orderNo: string | null;
  closedAt: string | null;
  waiter: string | null;
  tableNumber: string;
};

export type RestReturnRow = {
  id: string;
  returnNumber: string;
  originalReceipt: string | null;
  productName: string;
  quantity: number;
  totalAmount: number;
  returnReason: string;
  staffName: string | null;
  createdAt: string | null;
};

export type RestClosedOrderRow = {
  id: string;
  orderNo: string | null;
  tableName: string;
  waiter: string | null;
  totalAmount: number;
  paymentMethod: string | null;
  openedAt: string | null;
  closedAt: string | null;
  status: string | null;
  channel: string;
};

export type RestDailySummary = {
  orderCount: number;
  gross: number;
  discount: number;
  net: number;
  cash: number;
  card: number;
  other: number;
  voidAmount: number;
  complementaryAmount: number;
};

export type RestCategoryRow = {
  category: string;
  quantity: number;
  revenue: number;
};

export type RestHourlyRow = {
  hour: number;
  orderCount: number;
  revenue: number;
};

export type RestWaiterRow = {
  waiter: string;
  orderCount: number;
  revenue: number;
};

export type RestTableTurnoverRow = {
  tableName: string;
  orderCount: number;
  revenue: number;
};

export type RestDetailLineRow = {
  openedAt: string | null;
  closedAt: string | null;
  orderNo: string | null;
  tableName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  status: string | null;
};

// ─── Z Report ────────────────────────────────────────────────────────────────

export async function fetchRestZReport(workDayYmd: string): Promise<RestZReport> {
  const range = restYmdRangeToUtcIso(workDayYmd, workDayYmd);
  if (!range) throw new Error('Geçersiz tarih');
  const { start, end } = range;
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const sales = salesTable();

  let paymentRows = await trySql<{ method: string; amount: number; count: number }>(
    `SELECT COALESCE(UPPER(payment_method), 'DİĞER') AS method,
            SUM(COALESCE(total_amount, 0) - COALESCE(discount_amount, 0))::float8 AS amount,
            COUNT(*)::int AS count
     FROM ${orders}
     WHERE status = 'closed'
       AND closed_at IS NOT NULL AND closed_at >= $1::timestamptz AND closed_at <= $2::timestamptz
     GROUP BY 1
     ORDER BY 2 DESC`,
    [start, end],
  );

  try {
    const erp = await pgQuery<{ method: string; amount: number; count: number }>(
      `SELECT COALESCE(UPPER(TRIM(payment_method)), 'DİĞER') AS method,
              SUM(COALESCE(net_amount, 0))::float8 AS amount,
              COUNT(*)::int AS count
       FROM ${sales}
       WHERE date >= $1::timestamptz AND date <= $2::timestamptz
         AND COALESCE(is_cancelled, false) = false
         AND (
           fiche_no ILIKE 'REST-%' OR fiche_no ILIKE 'GEL-%' OR fiche_no ILIKE 'DLV-%'
           OR COALESCE(document_no, '') ILIKE 'REST-%'
           OR COALESCE(document_no, '') ILIKE 'GEL-%'
           OR COALESCE(document_no, '') ILIKE 'DLV-%'
         )
       GROUP BY 1
       ORDER BY 2 DESC`,
      [start, end],
    );
    const erpCount = (erp.rows || []).reduce((n, r) => n + (Number(r.count) || 0), 0);
    if (erpCount > 0) paymentRows = erp.rows;
  } catch {
    /* sales yok */
  }

  const totalSales = paymentRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const netCash = paymentRows
    .filter((r) => /NAK[İI]T|CASH|^cash$/i.test(String(r.method || '')))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const catRows = await trySql<{ category: string; amount: number; count: number }>(
    `SELECT 'Satış' AS category,
            COALESCE(SUM(oi.subtotal), 0)::float8 AS amount,
            COUNT(DISTINCT o.id)::int AS count
     FROM ${items} oi
     JOIN ${orders} o ON oi.order_id = o.id
     WHERE o.status = 'closed'
       AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
       AND (oi.is_void IS NOT TRUE)`,
    [start, end],
  );

  const voidRows = await trySql<{ reason: string; amount: number; count: number }>(
    `SELECT COALESCE(oi.void_reason, 'İptal') AS reason,
            SUM(oi.subtotal)::float8 AS amount,
            COUNT(oi.id)::int AS count
     FROM ${items} oi
     JOIN ${orders} o ON oi.order_id = o.id
     WHERE o.status = 'closed'
       AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
       AND oi.is_void = TRUE
     GROUP BY 1`,
    [start, end],
  );

  const compRows = await trySql<{ amount: number; count: number }>(
    `SELECT COALESCE(SUM(oi.subtotal), 0)::float8 AS amount,
            COALESCE(COUNT(oi.id), 0)::int AS count
     FROM ${items} oi
     JOIN ${orders} o ON oi.order_id = o.id
     WHERE o.status = 'closed'
       AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
       AND oi.is_complimentary = TRUE`,
    [start, end],
  );

  let returns = { amount: 0, count: 0 };
  try {
    const rr = await pgQuery<{ amount: number; count: number }>(
      `SELECT COALESCE(SUM(total_amount), 0)::float8 AS amount,
              COALESCE(COUNT(id), 0)::int AS count
       FROM rest.return_log
       WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz`,
      [start, end],
    );
    returns = {
      amount: Number(rr.rows[0]?.amount) || 0,
      count: Number(rr.rows[0]?.count) || 0,
    };
  } catch {
    /* return_log yok */
  }

  const productRows = await trySql<{ product_name: string; qty: number; amount: number }>(
    `SELECT oi.product_name,
            SUM(oi.quantity)::float8 AS qty,
            SUM(oi.subtotal)::float8 AS amount
     FROM ${items} oi
     JOIN ${orders} o ON oi.order_id = o.id
     WHERE o.status = 'closed'
       AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
       AND (oi.is_void IS NOT TRUE)
     GROUP BY oi.product_name
     ORDER BY SUM(oi.subtotal) DESC`,
    [start, end],
  );

  return {
    totalSales,
    netCash,
    paymentsByType: paymentRows.map((r) => ({
      type: String(r.method || 'DİĞER'),
      amount: Number(r.amount) || 0,
      count: Number(r.count) || 0,
    })),
    salesByCategory: (catRows.length ? catRows : [{ category: 'Satış', amount: 0, count: 0 }]).map(
      (r) => ({
        category: String(r.category),
        amount: Number(r.amount) || 0,
        count: Number(r.count) || 0,
      }),
    ),
    voids: voidRows.map((r) => ({
      reason: String(r.reason),
      amount: Number(r.amount) || 0,
      count: Number(r.count) || 0,
    })),
    complements: {
      amount: Number(compRows[0]?.amount) || 0,
      count: Number(compRows[0]?.count) || 0,
    },
    returns,
    salesByProduct: productRows.map((r) => ({
      productName: String(r.product_name ?? ''),
      quantity: Number(r.qty) || 0,
      amount: Number(r.amount) || 0,
    })),
  };
}

// ─── Product qty ─────────────────────────────────────────────────────────────

export async function fetchRestProductQty(
  fromYmd: string,
  toYmd: string,
): Promise<RestProductQtyRow[]> {
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  if (!range) throw new Error('Geçersiz tarih aralığı');
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const rows = await trySql<{
    product_id: string | null;
    product_name: string;
    qty: number;
    revenue: number;
  }>(
    `SELECT oi.product_id::text AS product_id,
            oi.product_name,
            SUM(oi.quantity)::float8 AS qty,
            SUM(oi.subtotal)::float8 AS revenue
     FROM ${items} oi
     JOIN ${orders} o ON oi.order_id = o.id
     WHERE o.status = 'closed'
       AND o.closed_at IS NOT NULL
       AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
       AND (oi.is_void IS NOT TRUE)
     GROUP BY oi.product_id, oi.product_name
     ORDER BY SUM(oi.quantity) DESC`,
    [range.start, range.end],
  );
  return rows.map((r) => ({
    productId: r.product_id?.trim() ? String(r.product_id) : null,
    productName: String(r.product_name || '—'),
    quantity: Number(r.qty) || 0,
    revenue: Number(r.revenue) || 0,
  }));
}

// ─── Void / Return ───────────────────────────────────────────────────────────

export async function fetchRestVoidReport(
  fromYmd: string,
  toYmd: string,
  limit = 200,
): Promise<RestVoidRow[]> {
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  if (!range) throw new Error('Geçersiz tarih aralığı');
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const tables = restTablesTable();
  const rows = await trySql<{
    item_id: string;
    product_name: string;
    quantity: number;
    subtotal: number;
    void_reason: string;
    order_no: string | null;
    closed_at: string | null;
    waiter: string | null;
    table_number: string | null;
  }>(
    `SELECT oi.id::text AS item_id,
            oi.product_name,
            oi.quantity::float8 AS quantity,
            oi.subtotal::float8 AS subtotal,
            COALESCE(oi.void_reason, 'İptal') AS void_reason,
            o.order_no,
            o.closed_at::text AS closed_at,
            o.waiter,
            COALESCE(t.number, '—') AS table_number
     FROM ${items} oi
     JOIN ${orders} o ON o.id = oi.order_id
     LEFT JOIN ${tables} t ON t.id = o.table_id
     WHERE oi.is_void = TRUE
       AND COALESCE(o.closed_at, o.opened_at, o.created_at) >= $1::timestamptz
       AND COALESCE(o.closed_at, o.opened_at, o.created_at) <= $2::timestamptz
     ORDER BY COALESCE(o.closed_at, o.opened_at) DESC
     LIMIT $3`,
    [range.start, range.end, limit],
  );
  return rows.map((r) => ({
    itemId: String(r.item_id),
    productName: String(r.product_name || '—'),
    quantity: Number(r.quantity) || 0,
    subtotal: Number(r.subtotal) || 0,
    voidReason: String(r.void_reason || 'İptal'),
    orderNo: r.order_no == null ? null : String(r.order_no),
    closedAt: r.closed_at,
    waiter: r.waiter == null ? null : String(r.waiter),
    tableNumber: String(r.table_number || '—'),
  }));
}

export async function fetchRestReturnReport(
  fromYmd: string,
  toYmd: string,
  limit = 200,
): Promise<RestReturnRow[]> {
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  if (!range) return [];
  try {
    const res = await pgQuery<{
      id: string;
      return_number: string;
      original_receipt: string | null;
      product_name: string;
      quantity: number;
      total_amount: number;
      return_reason: string;
      staff_name: string | null;
      created_at: string | null;
    }>(
      `SELECT id::text AS id, return_number, original_receipt, product_name,
              quantity::float8 AS quantity, total_amount::float8 AS total_amount,
              return_reason, staff_name, created_at::text AS created_at
       FROM rest.return_log
       WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
       ORDER BY created_at DESC
       LIMIT $3`,
      [range.start, range.end, limit],
    );
    return (res.rows || []).map((r) => ({
      id: String(r.id),
      returnNumber: String(r.return_number || ''),
      originalReceipt: r.original_receipt == null ? null : String(r.original_receipt),
      productName: String(r.product_name || '—'),
      quantity: Number(r.quantity) || 0,
      totalAmount: Number(r.total_amount) || 0,
      returnReason: String(r.return_reason || ''),
      staffName: r.staff_name == null ? null : String(r.staff_name),
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

// ─── Closed orders / daily / analysis ────────────────────────────────────────

function channelFromOrder(orderNo: string | null, tableName: string): string {
  const n = String(orderNo || '').toUpperCase();
  if (n.startsWith('DLV-') || n.startsWith('REST-DLV')) return 'Paket';
  if (n.startsWith('GEL-') || n.startsWith('REST-GEL')) return 'Gel Al';
  if (!tableName || tableName === '—' || /perakende|takeaway|delivery/i.test(tableName)) {
    return 'Perakende';
  }
  return 'Masa';
}

export async function fetchRestClosedOrders(
  fromYmd: string,
  toYmd: string,
  limit = 200,
): Promise<RestClosedOrderRow[]> {
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  if (!range) throw new Error('Geçersiz tarih aralığı');
  const orders = restOrdersTable();
  const tables = restTablesTable();
  const rows = await trySql<{
    id: string;
    order_no: string | null;
    table_name: string | null;
    waiter: string | null;
    total_amount: number;
    payment_method: string | null;
    opened_at: string | null;
    closed_at: string | null;
    status: string | null;
    discount_amount: number;
  }>(
    `SELECT o.id::text AS id, o.order_no,
            COALESCE(t.number, '—') AS table_name,
            o.waiter,
            COALESCE(o.total_amount, 0)::float8 AS total_amount,
            o.payment_method,
            COALESCE(o.opened_at, o.created_at)::text AS opened_at,
            o.closed_at::text AS closed_at,
            o.status,
            COALESCE(o.discount_amount, 0)::float8 AS discount_amount
     FROM ${orders} o
     LEFT JOIN ${tables} t ON t.id = o.table_id
     WHERE o.status = 'closed'
       AND o.closed_at IS NOT NULL
       AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
     ORDER BY o.closed_at DESC
     LIMIT $3`,
    [range.start, range.end, limit],
  );
  return rows.map((r) => {
    const tableName = String(r.table_name || '—');
    return {
      id: String(r.id),
      orderNo: r.order_no == null ? null : String(r.order_no),
      tableName,
      waiter: r.waiter == null ? null : String(r.waiter),
      totalAmount: Number(r.total_amount) || 0,
      paymentMethod: r.payment_method == null ? null : String(r.payment_method),
      openedAt: r.opened_at,
      closedAt: r.closed_at,
      status: r.status,
      channel: channelFromOrder(r.order_no, tableName),
    };
  });
}

export async function fetchRestDailySummary(
  fromYmd: string,
  toYmd: string,
): Promise<RestDailySummary> {
  const orders = await fetchRestClosedOrders(fromYmd, toYmd, 5000);
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  let voidAmount = 0;
  let complementaryAmount = 0;
  let discount = 0;
  if (range) {
    const o = restOrdersTable();
    const i = restOrderItemsTable();
    const voids = await trySql<{ amount: number }>(
      `SELECT COALESCE(SUM(oi.subtotal), 0)::float8 AS amount
       FROM ${i} oi JOIN ${o} ord ON oi.order_id = ord.id
       WHERE ord.status = 'closed' AND ord.closed_at >= $1 AND ord.closed_at <= $2
         AND oi.is_void = TRUE`,
      [range.start, range.end],
    );
    voidAmount = Number(voids[0]?.amount) || 0;
    const comps = await trySql<{ amount: number }>(
      `SELECT COALESCE(SUM(oi.subtotal), 0)::float8 AS amount
       FROM ${i} oi JOIN ${o} ord ON oi.order_id = ord.id
       WHERE ord.status = 'closed' AND ord.closed_at >= $1 AND ord.closed_at <= $2
         AND oi.is_complimentary = TRUE`,
      [range.start, range.end],
    );
    complementaryAmount = Number(comps[0]?.amount) || 0;
    const disc = await trySql<{ amount: number }>(
      `SELECT COALESCE(SUM(discount_amount), 0)::float8 AS amount
       FROM ${o}
       WHERE status = 'closed' AND closed_at >= $1 AND closed_at <= $2`,
      [range.start, range.end],
    );
    discount = Number(disc[0]?.amount) || 0;
  }

  let cash = 0;
  let card = 0;
  let other = 0;
  let net = 0;
  for (const o of orders) {
    const amt = o.totalAmount;
    net += amt;
    const pm = String(o.paymentMethod || '').toUpperCase();
    if (/NAK|CASH/.test(pm)) cash += amt;
    else if (/KART|CARD|POS|CREDIT/.test(pm)) card += amt;
    else other += amt;
  }

  return {
    orderCount: orders.length,
    gross: net + discount,
    discount,
    net,
    cash,
    card,
    other,
    voidAmount,
    complementaryAmount,
  };
}

export async function fetchRestCategoryReport(
  fromYmd: string,
  toYmd: string,
): Promise<RestCategoryRow[]> {
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  if (!range) throw new Error('Geçersiz tarih aralığı');
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const rows = await trySql<{ category: string; quantity: number; revenue: number }>(
    `SELECT COALESCE(NULLIF(TRIM(oi.category_name), ''), NULLIF(TRIM(oi.course), ''), 'Genel') AS category,
            SUM(oi.quantity)::float8 AS quantity,
            SUM(oi.subtotal)::float8 AS revenue
     FROM ${items} oi
     JOIN ${orders} o ON oi.order_id = o.id
     WHERE o.status = 'closed'
       AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
       AND (oi.is_void IS NOT TRUE)
     GROUP BY 1
     ORDER BY SUM(oi.subtotal) DESC`,
    [range.start, range.end],
  );
  // category_name yoksa sade sorgu
  if (rows.length === 0) {
    const fallback = await trySql<{ category: string; quantity: number; revenue: number }>(
      `SELECT 'Genel' AS category,
              SUM(oi.quantity)::float8 AS quantity,
              SUM(oi.subtotal)::float8 AS revenue
       FROM ${items} oi
       JOIN ${orders} o ON oi.order_id = o.id
       WHERE o.status = 'closed'
         AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
         AND (oi.is_void IS NOT TRUE)`,
      [range.start, range.end],
    );
    return fallback
      .filter((r) => Number(r.quantity) > 0 || Number(r.revenue) > 0)
      .map((r) => ({
        category: String(r.category),
        quantity: Number(r.quantity) || 0,
        revenue: Number(r.revenue) || 0,
      }));
  }
  return rows.map((r) => ({
    category: String(r.category || 'Genel'),
    quantity: Number(r.quantity) || 0,
    revenue: Number(r.revenue) || 0,
  }));
}

export async function fetchRestHourlyReport(
  fromYmd: string,
  toYmd: string,
): Promise<RestHourlyRow[]> {
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  if (!range) throw new Error('Geçersiz tarih aralığı');
  const orders = restOrdersTable();
  const rows = await trySql<{ hour: number; order_count: number; revenue: number }>(
    `SELECT EXTRACT(HOUR FROM closed_at)::int AS hour,
            COUNT(*)::int AS order_count,
            SUM(COALESCE(total_amount, 0))::float8 AS revenue
     FROM ${orders}
     WHERE status = 'closed'
       AND closed_at >= $1::timestamptz AND closed_at <= $2::timestamptz
     GROUP BY 1
     ORDER BY 1`,
    [range.start, range.end],
  );
  return rows.map((r) => ({
    hour: Number(r.hour) || 0,
    orderCount: Number(r.order_count) || 0,
    revenue: Number(r.revenue) || 0,
  }));
}

export async function fetchRestWaiterReport(
  fromYmd: string,
  toYmd: string,
): Promise<RestWaiterRow[]> {
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  if (!range) throw new Error('Geçersiz tarih aralığı');
  const orders = restOrdersTable();
  const rows = await trySql<{ waiter: string; order_count: number; revenue: number }>(
    `SELECT COALESCE(NULLIF(TRIM(waiter), ''), '—') AS waiter,
            COUNT(*)::int AS order_count,
            SUM(COALESCE(total_amount, 0))::float8 AS revenue
     FROM ${orders}
     WHERE status = 'closed'
       AND closed_at >= $1::timestamptz AND closed_at <= $2::timestamptz
     GROUP BY 1
     ORDER BY SUM(COALESCE(total_amount, 0)) DESC`,
    [range.start, range.end],
  );
  return rows.map((r) => ({
    waiter: String(r.waiter || '—'),
    orderCount: Number(r.order_count) || 0,
    revenue: Number(r.revenue) || 0,
  }));
}

export async function fetchRestTableTurnover(
  fromYmd: string,
  toYmd: string,
): Promise<RestTableTurnoverRow[]> {
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  if (!range) throw new Error('Geçersiz tarih aralığı');
  const orders = restOrdersTable();
  const tables = restTablesTable();
  const rows = await trySql<{ table_name: string; order_count: number; revenue: number }>(
    `SELECT COALESCE(t.number, '—') AS table_name,
            COUNT(*)::int AS order_count,
            SUM(COALESCE(o.total_amount, 0))::float8 AS revenue
     FROM ${orders} o
     LEFT JOIN ${tables} t ON t.id = o.table_id
     WHERE o.status = 'closed'
       AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
     GROUP BY 1
     ORDER BY SUM(COALESCE(o.total_amount, 0)) DESC`,
    [range.start, range.end],
  );
  return rows.map((r) => ({
    tableName: String(r.table_name || '—'),
    orderCount: Number(r.order_count) || 0,
    revenue: Number(r.revenue) || 0,
  }));
}

export async function fetchRestDetailLines(
  fromYmd: string,
  toYmd: string,
  limit = 300,
): Promise<RestDetailLineRow[]> {
  const range = restYmdRangeToUtcIso(fromYmd, toYmd);
  if (!range) throw new Error('Geçersiz tarih aralığı');
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const tables = restTablesTable();
  const rows = await trySql<{
    opened_at: string | null;
    closed_at: string | null;
    order_no: string | null;
    table_name: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    status: string | null;
  }>(
    `SELECT COALESCE(o.opened_at, o.created_at)::text AS opened_at,
            o.closed_at::text AS closed_at,
            o.order_no,
            COALESCE(t.number, '—') AS table_name,
            oi.product_name,
            oi.quantity::float8 AS quantity,
            oi.unit_price::float8 AS unit_price,
            oi.subtotal::float8 AS subtotal,
            oi.status
     FROM ${items} oi
     JOIN ${orders} o ON oi.order_id = o.id
     LEFT JOIN ${tables} t ON t.id = o.table_id
     WHERE o.status = 'closed'
       AND o.closed_at >= $1::timestamptz AND o.closed_at <= $2::timestamptz
       AND (oi.is_void IS NOT TRUE)
     ORDER BY o.closed_at DESC, oi.product_name
     LIMIT $3`,
    [range.start, range.end, limit],
  );
  return rows.map((r) => ({
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    orderNo: r.order_no == null ? null : String(r.order_no),
    tableName: String(r.table_name || '—'),
    productName: String(r.product_name || '—'),
    quantity: Number(r.quantity) || 0,
    unitPrice: Number(r.unit_price) || 0,
    subtotal: Number(r.subtotal) || 0,
    status: r.status,
  }));
}

export type RestPeriodCompare = {
  current: RestDailySummary;
  previous: RestDailySummary;
  labelCurrent: string;
  labelPrevious: string;
};

export async function fetchRestPeriodCompare(
  mode: 'week' | 'month',
): Promise<RestPeriodCompare> {
  const n = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (mode === 'week') {
    const end = new Date(n);
    const start = new Date(n);
    start.setDate(start.getDate() - 6);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - 6);
    const current = await fetchRestDailySummary(ymd(start), ymd(end));
    const previous = await fetchRestDailySummary(ymd(prevStart), ymd(prevEnd));
    return {
      current,
      previous,
      labelCurrent: `${ymd(start)} → ${ymd(end)}`,
      labelPrevious: `${ymd(prevStart)} → ${ymd(prevEnd)}`,
    };
  }

  const curFrom = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-01`;
  const curTo = ymd(n);
  const prevMonth = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const prevEnd = new Date(n.getFullYear(), n.getMonth(), 0);
  const previous = await fetchRestDailySummary(ymd(prevMonth), ymd(prevEnd));
  const current = await fetchRestDailySummary(curFrom, curTo);
  return {
    current,
    previous,
    labelCurrent: `${curFrom} → ${curTo}`,
    labelPrevious: `${ymd(prevMonth)} → ${ymd(prevEnd)}`,
  };
}
