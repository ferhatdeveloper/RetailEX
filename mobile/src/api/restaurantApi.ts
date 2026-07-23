import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPatch, postgrestPost } from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
import { fetchProducts } from './productsApi';
import {
  categoriesTable,
  newUuid,
  productsTable,
  restKitchenItemsTable,
  restKitchenOrdersTable,
  restOrderItemsTable,
  restOrdersTable,
  restReservationsTable,
  restTablesTable,
} from './erpTables';
import { useAuthStore } from '../store/authStore';

/** SQL `rest.rex_…` → PostgREST path segment (`Accept-Profile: rest`) */
function restTableBare(sqlName: string): string {
  return sqlName.replace(/^rest\./, '');
}

function todayYmdLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type RestTable = {
  id: string;
  name: string | null;
  status: string | null;
  waiter: string | null;
  total: number;
  floor_id: string | null;
  seats?: number | null;
  start_time?: string | null;
};

export type RestOrder = {
  id: string;
  order_no: string | null;
  table_id: string | null;
  table_name: string | null;
  status: string | null;
  total_amount: number;
  waiter: string | null;
  created_at: string | null;
};

export type RestReservation = {
  id: string;
  customer_name: string;
  phone: string | null;
  reservation_date: string;
  reservation_time: string;
  guest_count: number;
  table_id: string | null;
  table_name: string | null;
  status: string | null;
  note: string | null;
};

export type RestReservationStatus = 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show';

export type RestOrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  status: string | null;
  course?: string | null;
  note?: string | null;
  options?: unknown;
  category_name?: string | null;
  category_id?: string | null;
  category_code?: string | null;
  sent_to_kitchen_at: string | null;
};

export type RestOrderDetail = RestOrder & { items: RestOrderItem[] };

export type RestMenuItem = {
  id: string;
  code: string | null;
  name: string;
  price: number;
  category: string;
  preparation_time: number;
};

export type RestKitchenItem = {
  id: string;
  order_item_id: string | null;
  product_name: string;
  quantity: number;
  course: string | null;
  note: string | null;
  status: string | null;
  preparation_time: number | null;
  start_at: string | null;
  estimated_ready_at: string | null;
};

export type RestKitchenOrder = {
  id: string;
  order_id: string;
  table_id: string | null;
  table_number: string | null;
  floor_name: string | null;
  waiter: string | null;
  status: string | null;
  note: string | null;
  sent_at: string | null;
  estimated_ready_at: string | null;
  items: RestKitchenItem[];
};

export type SendToKitchenResult = {
  kitchenOrderId: string | null;
  sentItemIds: string[];
  sentItemCount: number;
  kitchenOrderCreated: boolean;
};

async function tryQueries<T>(queries: { sql: string; params?: unknown[] }[]): Promise<T[]> {
  for (const q of queries) {
    try {
      const res = await pgQuery<T>(q.sql, q.params ?? []);
      return res.rows;
    } catch (e) {
      rethrowTransportInfra(e, 'restaurantApi.tryQueries');
      /* next — şema farkı */
    }
  }
  return [];
}

async function runFirst(queries: { sql: string; params?: unknown[] }[]): Promise<boolean> {
  for (const q of queries) {
    try {
      await pgQuery(q.sql, q.params ?? []);
      return true;
    } catch (e) {
      rethrowTransportInfra(e, 'restaurantApi.runFirst');
      /* next — şema farkı */
    }
  }
  return false;
}

function mapRestTableRow(r: Record<string, unknown>): RestTable {
  const number = r.number != null ? String(r.number) : null;
  return {
    id: String(r.id ?? ''),
    name: number ?? (r.name != null ? String(r.name) : String(r.id ?? '')),
    status: r.status == null ? null : String(r.status),
    waiter: r.waiter == null ? null : String(r.waiter),
    total: Number(r.total) || 0,
    floor_id: r.floor_id == null ? null : String(r.floor_id),
    seats: r.seats == null ? null : Number(r.seats) || 0,
    start_time: r.start_time == null ? null : String(r.start_time),
  };
}

async function fetchTablesNameMapViaRest(): Promise<Map<string, string>> {
  const bare = restTableBare(restTablesTable());
  const rows = await postgrestGet<Array<{ id?: string; number?: string | null }>>(
    `/${bare}`,
    { select: 'id,number', order: 'number.asc', limit: 500 },
    { schema: 'rest' },
  );
  const map = new Map<string, string>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r.id == null) continue;
    map.set(String(r.id), r.number != null ? String(r.number) : String(r.id));
  }
  return map;
}

function mapRestOrderRow(
  r: Record<string, unknown>,
  tableNames: Map<string, string>,
): RestOrder {
  const tableId = r.table_id == null ? null : String(r.table_id);
  const created =
    r.opened_at != null
      ? String(r.opened_at)
      : r.created_at == null
        ? null
        : String(r.created_at);
  return {
    id: String(r.id ?? ''),
    order_no: r.order_no == null ? null : String(r.order_no),
    table_id: tableId,
    table_name: tableId ? tableNames.get(tableId) ?? tableId : null,
    status: r.status == null ? null : String(r.status),
    total_amount: Number(r.total_amount) || 0,
    waiter: r.waiter == null ? null : String(r.waiter),
    created_at: created,
  };
}

async function fetchRestaurantTablesViaRest(): Promise<RestTable[]> {
  const bare = restTableBare(restTablesTable());
  try {
    const rows = await postgrestGet<Record<string, unknown>[]>(
      `/${bare}`,
      {
        select: 'id,number,status,waiter,total,floor_id,seats,start_time',
        order: 'number.asc',
        limit: 200,
      },
      { schema: 'rest' },
    );
    return (Array.isArray(rows) ? rows : []).map(mapRestTableRow).filter((r) => r.id);
  } catch {
    /* seats/start_time yoksa sade select */
    const rows = await postgrestGet<Record<string, unknown>[]>(
      `/${bare}`,
      {
        select: 'id,number,status,waiter,total,floor_id',
        order: 'number.asc',
        limit: 200,
      },
      { schema: 'rest' },
    );
    return (Array.isArray(rows) ? rows : []).map(mapRestTableRow).filter((r) => r.id);
  }
}

async function fetchRestaurantTablesViaBridge(): Promise<RestTable[]> {
  const tbl = restTablesTable();
  return tryQueries<RestTable>([
    {
      sql: `SELECT id,
              COALESCE(number, id::text) AS name,
              status, waiter,
              COALESCE(total, 0)::float8 AS total,
              floor_id::text AS floor_id,
              COALESCE(seats, 0)::int AS seats,
              start_time::text AS start_time
       FROM ${tbl}
       ORDER BY number ASC
       LIMIT 200`,
    },
    {
      sql: `SELECT id,
              COALESCE(number, id::text) AS name,
              status, waiter,
              COALESCE(total, 0)::float8 AS total,
              floor_id::text AS floor_id
       FROM ${tbl}
       ORDER BY number ASC
       LIMIT 200`,
    },
  ]);
}

export async function fetchRestaurantTables(): Promise<RestTable[]> {
  return runDataTransport({
    label: 'fetchRestaurantTables',
    viaRest: fetchRestaurantTablesViaRest,
    viaBridge: fetchRestaurantTablesViaBridge,
  });
}

async function fetchOpenOrdersViaRest(limit: number): Promise<RestOrder[]> {
  const bare = restTableBare(restOrdersTable());
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${bare}`,
    {
      select: 'id,order_no,table_id,status,total_amount,waiter,created_at',
      or: '(status.is.null,status.not.in.(closed,cancelled))',
      order: 'created_at.desc',
      limit,
    },
    { schema: 'rest' },
  );
  const tableNames = await fetchTablesNameMapViaRest();
  return (Array.isArray(rows) ? rows : [])
    .map((r) => mapRestOrderRow(r, tableNames))
    .filter((r) => r.id);
}

async function fetchOpenOrdersViaBridge(limit: number): Promise<RestOrder[]> {
  const orders = restOrdersTable();
  const tables = restTablesTable();
  return tryQueries<RestOrder>([
    {
      sql: `SELECT o.id, o.order_no, o.table_id::text AS table_id,
              COALESCE(t.number, o.table_id::text) AS table_name,
              o.status,
              COALESCE(o.total_amount, 0)::float8 AS total_amount,
              o.waiter,
              o.created_at::text AS created_at
       FROM ${orders} o
       LEFT JOIN ${tables} t ON t.id = o.table_id
       WHERE o.status IS DISTINCT FROM 'closed'
         AND o.status IS DISTINCT FROM 'cancelled'
       ORDER BY o.created_at DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchOpenOrders(limit = 50): Promise<RestOrder[]> {
  return runDataTransport({
    label: 'fetchOpenOrders',
    viaRest: () => fetchOpenOrdersViaRest(limit),
    viaBridge: () => fetchOpenOrdersViaBridge(limit),
  });
}

async function fetchTodayOrdersViaRest(limit: number): Promise<RestOrder[]> {
  const dateStr = todayYmdLocal();
  const bare = restTableBare(restOrdersTable());
  let rows: Record<string, unknown>[];
  try {
    rows = await postgrestGet<Record<string, unknown>[]>(
      `/${bare}`,
      {
        select: 'id,order_no,table_id,status,total_amount,waiter,created_at,opened_at',
        or: `(opened_at.gte.${dateStr},created_at.gte.${dateStr})`,
        order: 'created_at.asc',
        limit,
      },
      { schema: 'rest' },
    );
  } catch {
    rows = await postgrestGet<Record<string, unknown>[]>(
      `/${bare}`,
      {
        select: 'id,order_no,table_id,status,total_amount,waiter,created_at',
        created_at: `gte.${dateStr}`,
        order: 'created_at.asc',
        limit,
      },
      { schema: 'rest' },
    );
  }
  const tableNames = await fetchTablesNameMapViaRest();
  return (Array.isArray(rows) ? rows : [])
    .map((r) => mapRestOrderRow(r, tableNames))
    .filter((r) => {
      if (!r.id) return false;
      const ts = r.created_at || '';
      return ts.startsWith(dateStr) || ts.slice(0, 10) === dateStr;
    });
}

async function fetchTodayOrdersViaBridge(limit: number): Promise<RestOrder[]> {
  const orders = restOrdersTable();
  const tables = restTablesTable();
  return tryQueries<RestOrder>([
    {
      sql: `SELECT o.id, o.order_no, o.table_id::text AS table_id,
              COALESCE(t.number, o.table_id::text) AS table_name,
              o.status,
              COALESCE(o.total_amount, 0)::float8 AS total_amount,
              o.waiter,
              COALESCE(o.opened_at, o.created_at)::text AS created_at
       FROM ${orders} o
       LEFT JOIN ${tables} t ON t.id = o.table_id
       WHERE COALESCE(o.opened_at, o.created_at)::date = CURRENT_DATE
       ORDER BY COALESCE(o.opened_at, o.created_at) ASC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
    {
      sql: `SELECT o.id, o.order_no, o.table_id::text AS table_id,
              COALESCE(t.number, o.table_id::text) AS table_name,
              o.status,
              COALESCE(o.total_amount, 0)::float8 AS total_amount,
              o.waiter,
              o.created_at::text AS created_at
       FROM ${orders} o
       LEFT JOIN ${tables} t ON t.id = o.table_id
       WHERE o.created_at::date = CURRENT_DATE
       ORDER BY o.created_at ASC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}

/** Bugünkü siparişler (açık + kapalı) — zaman çizelgesi */
export async function fetchTodayOrders(limit = 120): Promise<RestOrder[]> {
  return runDataTransport({
    label: 'fetchTodayOrders',
    viaRest: () => fetchTodayOrdersViaRest(limit),
    viaBridge: () => fetchTodayOrdersViaBridge(limit),
  });
}

export async function fetchReservationsForDate(dateYmd: string): Promise<RestReservation[]> {
  return runDataTransport({
    label: 'fetchReservationsForDate',
    viaRest: () => fetchReservationsForDateViaRest(dateYmd),
    viaBridge: () => fetchReservationsForDateViaBridge(dateYmd),
  });
}

function mapRestReservationRow(r: Record<string, unknown>): RestReservation {
  const timeRaw = r.reservation_time != null ? String(r.reservation_time) : '';
  return {
    id: String(r.id ?? ''),
    customer_name: String(r.customer_name ?? ''),
    phone: r.phone != null ? String(r.phone) : null,
    reservation_date: String(r.reservation_date ?? '').slice(0, 10),
    reservation_time: timeRaw.slice(0, 5),
    guest_count: Number(r.guest_count ?? 2) || 2,
    table_id: r.table_id != null ? String(r.table_id) : null,
    table_name: r.table_number != null ? String(r.table_number) : r.table_name != null ? String(r.table_name) : null,
    status: r.status != null ? String(r.status) : null,
    note: r.note != null ? String(r.note) : null,
  };
}

async function fetchReservationsForDateViaRest(dateYmd: string): Promise<RestReservation[]> {
  const bare = restTableBare(restReservationsTable());
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${bare}`,
    {
      select:
        'id,customer_name,phone,reservation_date,reservation_time,guest_count,table_id,table_number,status,note',
      reservation_date: `eq.${dateYmd}`,
      order: 'reservation_time.asc',
      limit: 100,
    },
    { schema: 'rest' },
  );
  return (Array.isArray(rows) ? rows : []).map(mapRestReservationRow);
}

async function fetchReservationsForDateViaBridge(dateYmd: string): Promise<RestReservation[]> {
  const pref = restReservationsTable();
  const rows = await tryQueries<RestReservation>([
    {
      sql: `SELECT id,
              customer_name,
              phone,
              reservation_date::text AS reservation_date,
              to_char(reservation_time, 'HH24:MI') AS reservation_time,
              COALESCE(guest_count, 2)::int AS guest_count,
              table_id::text AS table_id,
              table_number AS table_name,
              status,
              note
       FROM ${pref}
       WHERE reservation_date = $1::date
       ORDER BY reservation_time ASC
       LIMIT 100`,
      params: [dateYmd],
    },
    {
      sql: `SELECT id,
              customer_name,
              phone,
              reservation_date::text AS reservation_date,
              substring(reservation_time::text, 1, 5) AS reservation_time,
              COALESCE(guest_count, 2)::int AS guest_count,
              table_id::text AS table_id,
              table_number AS table_name,
              status,
              note
       FROM rest.rest_reservations
       WHERE reservation_date = $1::date
       ORDER BY reservation_time ASC
       LIMIT 100`,
      params: [dateYmd],
    },
    {
      sql: `SELECT id,
              customer_name,
              phone,
              reservation_date::text AS reservation_date,
              substring(reservation_time::text, 1, 5) AS reservation_time,
              COALESCE(guest_count, 2)::int AS guest_count,
              table_id::text AS table_id,
              table_number AS table_name,
              status,
              note
       FROM rest_reservations
       WHERE reservation_date = $1::date
       ORDER BY reservation_time ASC
       LIMIT 100`,
      params: [dateYmd],
    },
  ]);
  return rows.map((r) => ({
    ...r,
    reservation_time: String(r.reservation_time || '').slice(0, 5),
  }));
}

async function markOrderItemsCookingViaRest(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const itemsBare = restTableBare(restOrderItemsTable());
  const now = new Date().toISOString();
  for (const itemId of itemIds) {
    try {
      await postgrestPatch(
        `/${itemsBare}?id=eq.${encodeURIComponent(itemId)}`,
        { status: 'cooking', sent_to_kitchen_at: now },
        { schema: 'rest', prefer: 'return=minimal' },
      );
    } catch {
      await postgrestPatch(
        `/${itemsBare}?id=eq.${encodeURIComponent(itemId)}`,
        { status: 'cooking' },
        { schema: 'rest', prefer: 'return=minimal' },
      );
    }
  }
}

async function sendRestaurantItemsToKitchenViaRest(orderId: string): Promise<SendToKitchenResult> {
  const ordersBare = restTableBare(restOrdersTable());
  const tablesBare = restTableBare(restTablesTable());
  const kitchenOrdersBare = restTableBare(restKitchenOrdersTable());
  const kitchenItemsBare = restTableBare(restKitchenItemsTable());
  const products = productsTable();

  const detail = await getOrderDetailById(orderId);
  if (!detail) throw new Error('Adisyon bulunamadı');

  const pendingItems = detail.items.filter(isKitchenPendingItem);
  if (pendingItems.length === 0) {
    return {
      kitchenOrderId: null,
      sentItemIds: [],
      sentItemCount: 0,
      kitchenOrderCreated: false,
    };
  }

  const sentItemIds = pendingItems.map((item) => item.id);
  await markOrderItemsCookingViaRest(sentItemIds);

  let activeItemCount = 0;
  try {
    const activeRows = await postgrestGet<Array<{ id?: string }>>(
      `/${kitchenItemsBare}`,
      { status: 'in.(new,pending,cooking)', select: 'id', limit: 5000 },
      { schema: 'rest' },
    );
    activeItemCount = Array.isArray(activeRows) ? activeRows.length : 0;
  } catch {
    activeItemCount = 0;
  }

  const productIds = pendingItems.map((item) => item.product_id).filter(Boolean) as string[];
  const prepTimeMap = new Map<string, number>();
  if (productIds.length) {
    try {
      const inList = productIds.join(',');
      const prepRows = await postgrestGet<Record<string, unknown>[]>(
        `/${products}`,
        { id: `in.(${inList})`, select: 'id,preparation_time', limit: 500 },
        { schema: 'public' },
      );
      for (const row of Array.isArray(prepRows) ? prepRows : []) {
        if (row.id) {
          prepTimeMap.set(String(row.id), Math.max(1, Number(row.preparation_time) || 5));
        }
      }
    } catch {
      /* ürün hazırlık süresi yoksa 5 dk */
    }
  }

  const loadMultiplier = 1 + activeItemCount * 0.05;
  const maxPrepTime = Math.max(
    5,
    ...pendingItems.map((item) => prepTimeMap.get(item.product_id || '') || 5),
  );
  const adjustedMaxPrepTime = Math.round(maxPrepTime * loadMultiplier);
  const now = Date.now();
  const estimatedFinish = new Date(now + adjustedMaxPrepTime * 60_000).toISOString();
  const kitchenOrderId = newUuid();
  const tableNumber = detail.table_name || detail.table_id || 'Masa';

  let kitchenOrderCreated = false;
  try {
    await postgrestPost(
      `/${kitchenOrdersBare}`,
      {
        id: kitchenOrderId,
        order_id: orderId,
        table_number: tableNumber,
        floor_name: null,
        waiter: detail.waiter || null,
        staff_id: null,
        status: 'new',
        note: null,
        estimated_ready_at: estimatedFinish,
      },
      { schema: 'rest', prefer: 'return=minimal' },
    );

    for (const item of pendingItems) {
      const prepMinutes = Math.max(
        1,
        Math.round((prepTimeMap.get(item.product_id || '') || 5) * loadMultiplier),
      );
      const startAt = new Date(new Date(estimatedFinish).getTime() - prepMinutes * 60_000).toISOString();
      await postgrestPost(
        `/${kitchenItemsBare}`,
        {
          id: newUuid(),
          kitchen_order_id: kitchenOrderId,
          order_item_id: item.id,
          product_name: item.product_name,
          quantity: item.quantity,
          course: null,
          note: null,
          status: 'new',
          preparation_time: prepMinutes,
          start_at: startAt,
          estimated_ready_at: estimatedFinish,
        },
        { schema: 'rest', prefer: 'return=minimal' },
      );
    }
    kitchenOrderCreated = true;
  } catch {
    kitchenOrderCreated = false;
  }

  try {
    await postgrestPatch(
      `/${ordersBare}?id=eq.${encodeURIComponent(orderId)}`,
      { status: 'open', estimated_ready_at: estimatedFinish, updated_at: new Date().toISOString() },
      { schema: 'rest', prefer: 'return=minimal' },
    );
  } catch {
    /* şema farkı */
  }

  if (detail.table_id) {
    try {
      await postgrestPatch(
        `/${tablesBare}?id=eq.${encodeURIComponent(detail.table_id)}`,
        { status: 'kitchen', updated_at: new Date().toISOString() },
        { schema: 'rest', prefer: 'return=minimal' },
      );
    } catch {
      /* şema farkı */
    }
  }

  return {
    kitchenOrderId: kitchenOrderCreated ? kitchenOrderId : null,
    sentItemIds,
    sentItemCount: sentItemIds.length,
    kitchenOrderCreated,
  };
}

async function sendRestaurantItemsToKitchenViaBridge(orderId: string): Promise<SendToKitchenResult> {
  const orders = restOrdersTable();
  const tables = restTablesTable();
  const kitchenOrders = restKitchenOrdersTable();
  const kitchenItems = restKitchenItemsTable();
  const products = productsTable();
  const detail = await getOrderDetailById(orderId);
  if (!detail) {
    throw new Error('Adisyon bulunamadı');
  }

  const pendingItems = detail.items.filter(isKitchenPendingItem);
  if (pendingItems.length === 0) {
    return {
      kitchenOrderId: null,
      sentItemIds: [],
      sentItemCount: 0,
      kitchenOrderCreated: false,
    };
  }

  const sentItemIds = pendingItems.map((item) => item.id);
  await markOrderItemsCooking(sentItemIds);

  let activeItemCount = 0;
  try {
    const active = await pgQuery<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM ${kitchenItems} WHERE status IN ('new', 'pending', 'cooking')`,
    );
    activeItemCount = Number(active.rows[0]?.count) || 0;
  } catch {
    activeItemCount = 0;
  }

  const productIds = pendingItems.map((item) => item.product_id).filter(Boolean) as string[];
  const prepTimeMap = new Map<string, number>();
  if (productIds.length > 0) {
    try {
      const prep = await pgQuery<{ id: string; preparation_time: number }>(
        `SELECT id::text AS id, COALESCE(preparation_time, 5)::int AS preparation_time
         FROM ${products}
         WHERE id = ANY(string_to_array($1, ',')::uuid[])`,
        [productIds.join(',')],
      );
      for (const row of prep.rows) {
        prepTimeMap.set(String(row.id), Math.max(1, Number(row.preparation_time) || 5));
      }
    } catch {
      /* ürün hazırlık süresi yoksa 5 dk */
    }
  }

  const loadMultiplier = 1 + activeItemCount * 0.05;
  const maxPrepTime = Math.max(
    5,
    ...pendingItems.map((item) => prepTimeMap.get(item.product_id || '') || 5),
  );
  const adjustedMaxPrepTime = Math.round(maxPrepTime * loadMultiplier);
  const now = Date.now();
  const estimatedFinish = new Date(now + adjustedMaxPrepTime * 60_000).toISOString();
  const kitchenOrderId = newUuid();
  const tableNumber = detail.table_name || detail.table_id || 'Masa';

  let kitchenOrderCreated = false;
  try {
    await pgQuery(
      `INSERT INTO ${kitchenOrders}
         (id, order_id, table_number, floor_name, waiter, staff_id, status, note, estimated_ready_at)
       VALUES ($1::uuid, $2::uuid, $3, NULL, $4, NULL, 'new', NULL, $5::timestamptz)`,
      [kitchenOrderId, orderId, tableNumber, detail.waiter || null, estimatedFinish],
    );

    for (const item of pendingItems) {
      const prepMinutes = Math.max(
        1,
        Math.round((prepTimeMap.get(item.product_id || '') || 5) * loadMultiplier),
      );
      const startAt = new Date(new Date(estimatedFinish).getTime() - prepMinutes * 60_000).toISOString();
      await pgQuery(
        `INSERT INTO ${kitchenItems}
           (id, kitchen_order_id, order_item_id, product_name, quantity, course, note, status,
            preparation_time, start_at, estimated_ready_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, NULL, NULL, 'new',
            $6, $7::timestamptz, $8::timestamptz)`,
        [
          newUuid(),
          kitchenOrderId,
          item.id,
          item.product_name,
          item.quantity,
          prepMinutes,
          startAt,
          estimatedFinish,
        ],
      );
    }
    kitchenOrderCreated = true;
  } catch {
    kitchenOrderCreated = false;
  }

  try {
    await pgQuery(
      `UPDATE ${orders}
       SET status = 'open', estimated_ready_at = COALESCE(estimated_ready_at, $2::timestamptz),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [orderId, estimatedFinish],
    );
  } catch {
    /* şema farkı */
  }

  if (detail.table_id) {
    try {
      await pgQuery(
        `UPDATE ${tables}
         SET status = 'kitchen', updated_at = NOW()
         WHERE id = $1::uuid`,
        [detail.table_id],
      );
    } catch {
      /* şema farkı */
    }
  }

  return {
    kitchenOrderId: kitchenOrderCreated ? kitchenOrderId : null,
    sentItemIds,
    sentItemCount: sentItemIds.length,
    kitchenOrderCreated,
  };
}

export async function sendRestaurantItemsToKitchen(orderId: string): Promise<SendToKitchenResult> {
  return runDataTransport({
    label: 'sendRestaurantItemsToKitchen',
    viaRest: () => sendRestaurantItemsToKitchenViaRest(orderId),
    viaBridge: () => sendRestaurantItemsToKitchenViaBridge(orderId),
  });
}

export async function fetchRestaurantMenuItems(
  search = '',
  limit = 120,
): Promise<RestMenuItem[]> {
  const products = productsTable();
  const categories = categoriesTable();
  const q = search.trim();
  const like = `%${q}%`;
  const capped = Math.max(10, Math.min(300, Number(limit) || 120));

  const mapMenu = (rows: RestMenuItem[]): RestMenuItem[] =>
    rows
      .map((r) => ({
        id: String(r.id),
        code: r.code == null ? null : String(r.code),
        name: String(r.name ?? ''),
        price: Number(r.price) || 0,
        category: String(r.category || 'Genel'),
        preparation_time: Math.max(1, Number(r.preparation_time) || 5),
      }))
      .filter((r) => r.id && r.name);

  async function viaRest(): Promise<RestMenuItem[]> {
    const list = await fetchProducts(q, capped);
    return mapMenu(
      list
        .filter((p) => p.is_active && (Number(p.price) || 0) > 0)
        .map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          price: Number(p.price) || 0,
          category: String(p.category_code || 'Genel'),
          preparation_time: 5,
        })),
    );
  }

  async function viaBridge(): Promise<RestMenuItem[]> {
    const queries = [
      {
        sql: `SELECT p.id::text AS id,
              p.code,
              p.name,
              COALESCE(p.price, 0)::float8 AS price,
              COALESCE(NULLIF(c.name, ''), NULLIF(p.category_code, ''), NULLIF(p.group_code, ''), 'Genel') AS category,
              COALESCE(p.preparation_time, 5)::int AS preparation_time
       FROM ${products} p
       LEFT JOIN ${categories} c ON c.id = p.category_id OR c.code = p.category_code
       WHERE COALESCE(p.is_active, true) = true
         AND COALESCE(p.price, 0) > 0
         AND COALESCE(c.is_restaurant, false) = true
         AND (
           $1 = '%%'
           OR p.name ILIKE $1
           OR COALESCE(p.code, '') ILIKE $1
           OR COALESCE(p.barcode, '') ILIKE $1
           OR COALESCE(c.name, '') ILIKE $1
         )
       ORDER BY c.name ASC NULLS LAST, p.name ASC
       LIMIT $2`,
        params: [like, capped],
      },
      {
        sql: `SELECT p.id::text AS id,
              p.code,
              p.name,
              COALESCE(p.price, 0)::float8 AS price,
              COALESCE(NULLIF(c.name, ''), NULLIF(p.category_code, ''), NULLIF(p.group_code, ''), 'Genel') AS category,
              COALESCE(p.preparation_time, 5)::int AS preparation_time
       FROM ${products} p
       LEFT JOIN ${categories} c ON c.id = p.category_id OR c.code = p.category_code
       WHERE COALESCE(p.is_active, true) = true
         AND COALESCE(p.price, 0) > 0
         AND (
           $1 = '%%'
           OR p.name ILIKE $1
           OR COALESCE(p.code, '') ILIKE $1
           OR COALESCE(p.barcode, '') ILIKE $1
           OR COALESCE(c.name, '') ILIKE $1
         )
       ORDER BY c.name ASC NULLS LAST, p.name ASC
       LIMIT $2`,
        params: [like, capped],
      },
      {
        sql: `SELECT p.id::text AS id,
              p.code,
              p.name,
              COALESCE(p.price, 0)::float8 AS price,
              COALESCE(NULLIF(p.category_code, ''), NULLIF(p.group_code, ''), 'Genel') AS category,
              COALESCE(p.preparation_time, 5)::int AS preparation_time
       FROM ${products} p
       WHERE COALESCE(p.is_active, true) = true
         AND COALESCE(p.price, 0) > 0
         AND (
           $1 = '%%'
           OR p.name ILIKE $1
           OR COALESCE(p.code, '') ILIKE $1
           OR COALESCE(p.barcode, '') ILIKE $1
         )
       ORDER BY p.name ASC
       LIMIT $2`,
        params: [like, capped],
      },
    ];

    for (const query of queries) {
      const rows = await tryQueries<RestMenuItem>([query]);
      const mapped = mapMenu(rows);
      if (mapped.length > 0) return mapped;
    }
    return [];
  }

  try {
    return await runDataTransport({
      label: 'fetchRestaurantMenuItems',
      viaRest,
      viaBridge,
    });
  } catch (e) {
    rethrowTransportInfra(e, 'fetchRestaurantMenuItems');
    return [];
  }
}

function mapOrderDetail(
  row: RestOrder & { item_json?: RestOrderItem[] | null },
): RestOrderDetail {
  const rawItems = row.item_json;
  const itemsList: RestOrderItem[] = Array.isArray(rawItems)
    ? rawItems.map((it) => ({
        id: String(it.id),
        product_id: it.product_id == null ? null : String(it.product_id),
        product_name: String(it.product_name ?? ''),
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        subtotal: Number(it.subtotal) || 0,
        status: it.status == null ? null : String(it.status),
        course: it.course == null ? null : String(it.course),
        note: it.note == null ? null : String(it.note),
        options: it.options,
        category_name: it.category_name == null ? null : String(it.category_name),
        category_id: it.category_id == null ? null : String(it.category_id),
        category_code: it.category_code == null ? null : String(it.category_code),
        sent_to_kitchen_at:
          it.sent_to_kitchen_at == null ? null : String(it.sent_to_kitchen_at),
      }))
    : [];

  return {
    id: row.id,
    order_no: row.order_no,
    table_id: row.table_id,
    table_name: row.table_name,
    status: row.status,
    total_amount: row.total_amount,
    waiter: row.waiter,
    created_at: row.created_at,
    items: itemsList,
  };
}

const ORDER_DETAIL_SELECT = (orders: string, tables: string, items: string) =>
  `SELECT o.id, o.order_no, o.table_id::text AS table_id,
      COALESCE(t.number, o.table_id::text) AS table_name,
      o.status,
      COALESCE(o.total_amount, 0)::float8 AS total_amount,
      o.waiter,
      o.created_at::text AS created_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id', i.id,
            'product_id', i.product_id,
            'product_name', i.product_name,
            'quantity', i.quantity,
            'unit_price', i.unit_price,
            'subtotal', i.subtotal,
            'status', i.status,
            'course', i.course,
            'note', i.note,
            'options', i.options,
            'category_name', COALESCE(NULLIF(c.name, ''), NULLIF(p.category_code, ''), NULLIF(p.group_code, '')),
            'category_id', p.category_id,
            'category_code', p.category_code,
            'sent_to_kitchen_at', i.sent_to_kitchen_at
          )
          ORDER BY i.created_at
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::json
      ) AS item_json
   FROM ${orders} o
   LEFT JOIN ${tables} t ON t.id = o.table_id
   LEFT JOIN ${items} i ON i.order_id = o.id AND COALESCE(i.is_void, false) = false
   LEFT JOIN ${productsTable()} p ON p.id = i.product_id
   LEFT JOIN ${categoriesTable()} c ON c.id = p.category_id OR c.code = p.category_code`;

export async function getActiveOrderForTable(tableId: string): Promise<RestOrderDetail | null> {
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const tables = restTablesTable();

  const res = await tryQueries<RestOrder & { item_json?: RestOrderItem[] | null }>([
    {
      sql: `${ORDER_DETAIL_SELECT(orders, tables, items)}
       WHERE o.table_id = $1::uuid AND o.status = 'open'
       GROUP BY o.id, t.number
       ORDER BY o.opened_at DESC NULLS LAST
       LIMIT 1`,
      params: [tableId],
    },
  ]);

  const row = res[0];
  return row ? mapOrderDetail(row) : null;
}

/** Açık adisyon listesinden id ile detay + kalemler */
export async function getOrderDetailById(orderId: string): Promise<RestOrderDetail | null> {
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const tables = restTablesTable();

  const res = await tryQueries<RestOrder & { item_json?: RestOrderItem[] | null }>([
    {
      sql: `${ORDER_DETAIL_SELECT(orders, tables, items)}
       WHERE o.id = $1::uuid
       GROUP BY o.id, t.number
       LIMIT 1`,
      params: [orderId],
    },
  ]);

  const row = res[0];
  return row ? mapOrderDetail(row) : null;
}

export async function createRestaurantOrder(params: {
  tableId: string;
  floorId?: string | null;
  note?: string;
}): Promise<RestOrder> {
  return runDataTransport({
    label: 'createRestaurantOrder',
    viaRest: () => createRestaurantOrderViaRest(params),
    viaBridge: () => createRestaurantOrderViaBridge(params),
  });
}

async function createRestaurantOrderViaRest(params: {
  tableId: string;
  floorId?: string | null;
  note?: string;
}): Promise<RestOrder> {
  const ordersBare = restTableBare(restOrdersTable());
  const tablesBare = restTableBare(restTablesTable());
  const user = useAuthStore.getState().user;
  const waiter = user?.fullName || user?.username || 'mobile';
  const year = new Date().getFullYear();
  const prefix = `RES-${year}-`;

  const seqRows = await postgrestGet<Array<{ order_no?: string }>>(
    `/${ordersBare}`,
    {
      order_no: `like.${prefix}*`,
      select: 'order_no',
      order: 'order_no.desc',
      limit: 1,
    },
    { schema: 'rest' },
  );
  let next = 1;
  const last = Array.isArray(seqRows) ? seqRows[0]?.order_no : undefined;
  if (last) {
    const m = String(last).match(new RegExp(`^RES-${year}-(\\d+)$`));
    if (m) next = parseInt(m[1], 10) + 1;
  }
  const orderNo = `${prefix}${String(next).padStart(5, '0')}`;
  const id = newUuid();

  await postgrestPost(
    `/${ordersBare}`,
    {
      id,
      order_no: orderNo,
      table_id: params.tableId,
      floor_id: params.floorId || null,
      waiter,
      status: 'open',
      note: params.note ?? null,
      total_amount: 0,
    },
    { schema: 'rest', prefer: 'return=minimal' },
  );

  await postgrestPatch(
    `/${tablesBare}?id=eq.${encodeURIComponent(params.tableId)}`,
    { status: 'occupied', waiter, total: 0, updated_at: new Date().toISOString() },
    { schema: 'rest', prefer: 'return=minimal' },
  );

  const detail = await getActiveOrderForTable(params.tableId);
  if (detail) return detail;

  return {
    id,
    order_no: orderNo,
    table_id: params.tableId,
    table_name: null,
    status: 'open',
    total_amount: 0,
    waiter,
    created_at: new Date().toISOString(),
  };
}

async function createRestaurantOrderViaBridge(params: {
  tableId: string;
  floorId?: string | null;
  note?: string;
}): Promise<RestOrder> {
  const orders = restOrdersTable();
  const tables = restTablesTable();
  const user = useAuthStore.getState().user;
  const waiter = user?.fullName || user?.username || 'mobile';
  const year = new Date().getFullYear();

  const seqRes = await pgQuery<{ seq: number }>(
    `SELECT COUNT(*)+1 AS seq FROM ${orders} WHERE order_no LIKE $1`,
    [`RES-${year}-%`],
  );
  const seq = String(seqRes.rows[0]?.seq ?? 1).padStart(5, '0');
  const orderNo = `RES-${year}-${seq}`;
  const id = newUuid();

  await pgQuery(
    `INSERT INTO ${orders}
       (id, order_no, table_id, floor_id, waiter, status, note)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, 'open', $6)`,
    [
      id,
      orderNo,
      params.tableId,
      params.floorId || null,
      waiter,
      params.note ?? null,
    ],
  );

  await pgQuery(
    `UPDATE ${tables}
     SET status = 'occupied', waiter = $2, total = 0, updated_at = NOW()
     WHERE id = $1::uuid`,
    [params.tableId, waiter],
  );

  const detail = await getActiveOrderForTable(params.tableId);
  if (detail) return detail;

  return {
    id,
    order_no: orderNo,
    table_id: params.tableId,
    table_name: null,
    status: 'open',
    total_amount: 0,
    waiter,
    created_at: new Date().toISOString(),
  };
}

async function restRecalcOrderTotal(orderId: string): Promise<number> {
  const itemsBare = restTableBare(restOrderItemsTable());
  const ordersBare = restTableBare(restOrdersTable());
  const rows = await postgrestGet<Array<{ subtotal?: number; is_void?: boolean }>>(
    `/${itemsBare}`,
    {
      order_id: `eq.${orderId}`,
      select: 'subtotal,is_void',
      limit: 5000,
    },
    { schema: 'rest' },
  );
  const total = (Array.isArray(rows) ? rows : [])
    .filter((r) => !r.is_void)
    .reduce((sum, r) => sum + (Number(r.subtotal) || 0), 0);
  await postgrestPatch(
    `/${ordersBare}?id=eq.${encodeURIComponent(orderId)}`,
    { total_amount: total, updated_at: new Date().toISOString() },
    { schema: 'rest', prefer: 'return=minimal' },
  );
  return total;
}

export async function addRestaurantOrderItem(
  orderId: string,
  item: {
    productName: string;
    quantity: number;
    unitPrice: number;
    productId?: string;
  },
): Promise<void> {
  return runDataTransport({
    label: 'addRestaurantOrderItem',
    viaRest: () => addRestaurantOrderItemViaRest(orderId, item),
    viaBridge: () => addRestaurantOrderItemViaBridge(orderId, item),
  });
}

async function addRestaurantOrderItemViaRest(
  orderId: string,
  item: {
    productName: string;
    quantity: number;
    unitPrice: number;
    productId?: string;
  },
): Promise<void> {
  const itemsBare = restTableBare(restOrderItemsTable());
  const ordersBare = restTableBare(restOrdersTable());
  const tablesBare = restTableBare(restTablesTable());
  const qty = Math.max(0.001, Number(item.quantity) || 1);
  const price = Math.max(0, Number(item.unitPrice) || 0);
  const subtotal = qty * price;
  const itemId = newUuid();

  await postgrestPost(
    `/${itemsBare}`,
    {
      id: itemId,
      order_id: orderId,
      product_id: item.productId || null,
      product_name: item.productName.trim(),
      quantity: qty,
      unit_price: price,
      discount_pct: 0,
      subtotal,
    },
    { schema: 'rest', prefer: 'return=minimal' },
  );

  const total = await restRecalcOrderTotal(orderId);

  try {
    const orderRows = await postgrestGet<Array<{ table_id?: string }>>(
      `/${ordersBare}`,
      { id: `eq.${orderId}`, select: 'table_id', limit: 1 },
      { schema: 'rest' },
    );
    const tableId = Array.isArray(orderRows) ? orderRows[0]?.table_id : undefined;
    if (tableId) {
      await postgrestPatch(
        `/${tablesBare}?id=eq.${encodeURIComponent(String(tableId))}`,
        { total, updated_at: new Date().toISOString() },
        { schema: 'rest', prefer: 'return=minimal' },
      );
    }
  } catch {
    /* şema farkı */
  }
}

async function addRestaurantOrderItemViaBridge(
  orderId: string,
  item: {
    productName: string;
    quantity: number;
    unitPrice: number;
    productId?: string;
  },
): Promise<void> {
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const tables = restTablesTable();
  const qty = Math.max(0.001, Number(item.quantity) || 1);
  const price = Math.max(0, Number(item.unitPrice) || 0);
  const subtotal = qty * price;
  const itemId = newUuid();

  await pgQuery(
    `INSERT INTO ${items}
       (id, order_id, product_id, product_name, quantity, unit_price, discount_pct, subtotal)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 0, $7)`,
    [
      itemId,
      orderId,
      item.productId || null,
      item.productName.trim(),
      qty,
      price,
      subtotal,
    ],
  );

  await pgQuery(
    `UPDATE ${orders}
     SET total_amount = (
       SELECT COALESCE(SUM(subtotal), 0)
       FROM ${items}
       WHERE order_id = $1::uuid AND COALESCE(is_void, false) = false
     ), updated_at = NOW()
     WHERE id = $1::uuid`,
    [orderId],
  );

  try {
    await pgQuery(
      `UPDATE ${tables} t
       SET total = o.total_amount, updated_at = NOW()
       FROM ${orders} o
       WHERE o.id = $1::uuid AND t.id = o.table_id`,
      [orderId],
    );
  } catch {
    /* şema farkı */
  }
}

function isKitchenPendingItem(item: RestOrderItem): boolean {
  const status = String(item.status || 'pending').toLowerCase();
  return (
    !item.sent_to_kitchen_at &&
    status !== 'cooking' &&
    status !== 'ready' &&
    status !== 'served' &&
    status !== 'cancelled'
  );
}

async function markOrderItemsCooking(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const items = restOrderItemsTable();
  const idsCsv = itemIds.join(',');
  const ok = await runFirst([
    {
      sql: `UPDATE ${items}
       SET status = 'cooking', sent_to_kitchen_at = COALESCE(sent_to_kitchen_at, NOW())
       WHERE id = ANY(string_to_array($1, ',')::uuid[])`,
      params: [idsCsv],
    },
    {
      sql: `UPDATE ${items}
       SET status = 'cooking'
       WHERE id = ANY(string_to_array($1, ',')::uuid[])`,
      params: [idsCsv],
    },
  ]);
  if (!ok) {
    throw new Error('Adisyon kalemleri mutfak statüsüne alınamadı');
  }
}

function mapKitchenOrder(row: RestKitchenOrder & { item_json?: RestKitchenItem[] | null }): RestKitchenOrder {
  const rawItems = row.item_json;
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    table_id: row.table_id == null ? null : String(row.table_id),
    table_number: row.table_number == null ? null : String(row.table_number),
    floor_name: row.floor_name == null ? null : String(row.floor_name),
    waiter: row.waiter == null ? null : String(row.waiter),
    status: row.status == null ? null : String(row.status),
    note: row.note == null ? null : String(row.note),
    sent_at: row.sent_at == null ? null : String(row.sent_at),
    estimated_ready_at:
      row.estimated_ready_at == null ? null : String(row.estimated_ready_at),
    items: Array.isArray(rawItems)
      ? rawItems.map((item) => ({
          id: String(item.id),
          order_item_id: item.order_item_id == null ? null : String(item.order_item_id),
          product_name: String(item.product_name ?? ''),
          quantity: Number(item.quantity) || 0,
          course: item.course == null ? null : String(item.course),
          note: item.note == null ? null : String(item.note),
          status: item.status == null ? null : String(item.status),
          preparation_time:
            item.preparation_time == null ? null : Number(item.preparation_time) || null,
          start_at: item.start_at == null ? null : String(item.start_at),
          estimated_ready_at:
            item.estimated_ready_at == null ? null : String(item.estimated_ready_at),
        }))
      : [],
  };
}

export async function fetchActiveKitchenOrders(limit = 50): Promise<RestKitchenOrder[]> {
  const kitchenOrders = restKitchenOrdersTable();
  const kitchenItems = restKitchenItemsTable();
  const orders = restOrdersTable();
  const rows = await tryQueries<RestKitchenOrder & { item_json?: RestKitchenItem[] | null }>([
    {
      sql: `SELECT ko.id,
              ko.order_id::text AS order_id,
              o.table_id::text AS table_id,
              ko.table_number,
              ko.floor_name,
              ko.waiter,
              ko.status,
              ko.note,
              ko.sent_at::text AS sent_at,
              ko.estimated_ready_at::text AS estimated_ready_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', ki.id,
                    'order_item_id', ki.order_item_id,
                    'product_name', ki.product_name,
                    'quantity', ki.quantity,
                    'course', ki.course,
                    'note', ki.note,
                    'status', ki.status,
                    'preparation_time', ki.preparation_time,
                    'start_at', ki.start_at,
                    'estimated_ready_at', ki.estimated_ready_at
                  )
                  ORDER BY ki.id
                ) FILTER (WHERE ki.id IS NOT NULL),
                '[]'::json
              ) AS item_json
       FROM ${kitchenOrders} ko
       LEFT JOIN ${orders} o ON o.id = ko.order_id
       LEFT JOIN ${kitchenItems} ki ON ki.kitchen_order_id = ko.id
       WHERE COALESCE(ko.status, 'new') NOT IN ('served', 'cancelled')
       GROUP BY ko.id, o.table_id
       ORDER BY ko.sent_at ASC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
  return rows.map(mapKitchenOrder);
}

export async function updateRestaurantKitchenItemStatus(
  kitchenItemId: string,
  status: 'new' | 'cooking' | 'ready' | 'served',
): Promise<void> {
  return runDataTransport({
    label: 'updateRestaurantKitchenItemStatus',
    viaRest: () => updateRestaurantKitchenItemStatusViaRest(kitchenItemId, status),
    viaBridge: () => updateRestaurantKitchenItemStatusViaBridge(kitchenItemId, status),
  });
}

async function updateRestaurantKitchenItemStatusViaRest(
  kitchenItemId: string,
  status: 'new' | 'cooking' | 'ready' | 'served',
): Promise<void> {
  const kitchenItemsBare = restTableBare(restKitchenItemsTable());
  const orderItemsBare = restTableBare(restOrderItemsTable());
  await postgrestPatch(
    `/${kitchenItemsBare}?id=eq.${encodeURIComponent(kitchenItemId)}`,
    { status },
    { schema: 'rest', prefer: 'return=minimal' },
  );

  if (status === 'ready' || status === 'served') {
    try {
      const kiRows = await postgrestGet<Array<{ order_item_id?: string }>>(
        `/${kitchenItemsBare}`,
        { id: `eq.${kitchenItemId}`, select: 'order_item_id', limit: 1 },
        { schema: 'rest' },
      );
      const orderItemId = Array.isArray(kiRows) ? kiRows[0]?.order_item_id : undefined;
      if (orderItemId) {
        const patch: Record<string, unknown> = { status };
        if (status === 'served') patch.served_at = new Date().toISOString();
        await postgrestPatch(
          `/${orderItemsBare}?id=eq.${encodeURIComponent(String(orderItemId))}`,
          patch,
          { schema: 'rest', prefer: 'return=minimal' },
        );
      }
    } catch {
      /* şema farkı */
    }
  }
}

async function updateRestaurantKitchenItemStatusViaBridge(
  kitchenItemId: string,
  status: 'new' | 'cooking' | 'ready' | 'served',
): Promise<void> {
  const kitchenItems = restKitchenItemsTable();
  const orderItems = restOrderItemsTable();
  await pgQuery(
    `UPDATE ${kitchenItems}
     SET status = $2
     WHERE id = $1::uuid`,
    [kitchenItemId, status],
  );

  if (status === 'ready' || status === 'served') {
    await runFirst([
      {
        sql: `UPDATE ${orderItems} oi
         SET status = $2${status === 'served' ? ', served_at = COALESCE(served_at, NOW())' : ''}
         FROM ${kitchenItems} ki
         WHERE ki.id = $1::uuid AND oi.id = ki.order_item_id`,
        params: [kitchenItemId, status],
      },
    ]);
  }
}

export async function updateRestaurantKitchenOrderStatus(
  kitchenOrderId: string,
  status: 'new' | 'cooking' | 'ready' | 'served',
): Promise<void> {
  return runDataTransport({
    label: 'updateRestaurantKitchenOrderStatus',
    viaRest: () => updateRestaurantKitchenOrderStatusViaRest(kitchenOrderId, status),
    viaBridge: () => updateRestaurantKitchenOrderStatusViaBridge(kitchenOrderId, status),
  });
}

async function updateRestaurantKitchenOrderStatusViaRest(
  kitchenOrderId: string,
  status: 'new' | 'cooking' | 'ready' | 'served',
): Promise<void> {
  const kitchenOrdersBare = restTableBare(restKitchenOrdersTable());
  const kitchenItemsBare = restTableBare(restKitchenItemsTable());
  const orderItemsBare = restTableBare(restOrderItemsTable());

  await postgrestPatch(
    `/${kitchenOrdersBare}?id=eq.${encodeURIComponent(kitchenOrderId)}`,
    { status },
    { schema: 'rest', prefer: 'return=minimal' },
  );

  if (status === 'ready' || status === 'served') {
    const kiRows = await postgrestGet<Array<{ id?: string; order_item_id?: string; status?: string }>>(
      `/${kitchenItemsBare}`,
      { kitchen_order_id: `eq.${kitchenOrderId}`, select: 'id,order_item_id,status', limit: 500 },
      { schema: 'rest' },
    );
    for (const ki of Array.isArray(kiRows) ? kiRows : []) {
      const st = String(ki.status || 'new');
      if (st === 'served' || st === 'cancelled') continue;
      if (ki.id) {
        await postgrestPatch(
          `/${kitchenItemsBare}?id=eq.${encodeURIComponent(String(ki.id))}`,
          { status },
          { schema: 'rest', prefer: 'return=minimal' },
        );
      }
      if (ki.order_item_id) {
        const patch: Record<string, unknown> = { status };
        if (status === 'served') patch.served_at = new Date().toISOString();
        await postgrestPatch(
          `/${orderItemsBare}?id=eq.${encodeURIComponent(String(ki.order_item_id))}`,
          patch,
          { schema: 'rest', prefer: 'return=minimal' },
        );
      }
    }
  }
}

async function updateRestaurantKitchenOrderStatusViaBridge(
  kitchenOrderId: string,
  status: 'new' | 'cooking' | 'ready' | 'served',
): Promise<void> {
  const kitchenOrders = restKitchenOrdersTable();
  const kitchenItems = restKitchenItemsTable();
  const orderItems = restOrderItemsTable();
  await pgQuery(
    `UPDATE ${kitchenOrders}
     SET status = $2
     WHERE id = $1::uuid`,
    [kitchenOrderId, status],
  );

  if (status === 'ready' || status === 'served') {
    await pgQuery(
      `UPDATE ${kitchenItems}
       SET status = $2
       WHERE kitchen_order_id = $1::uuid
         AND COALESCE(status, 'new') NOT IN ('served', 'cancelled')`,
      [kitchenOrderId, status],
    );
    await runFirst([
      {
        sql: `UPDATE ${orderItems} oi
         SET status = $2${status === 'served' ? ', served_at = COALESCE(served_at, NOW())' : ''}
         FROM ${kitchenItems} ki
         WHERE ki.kitchen_order_id = $1::uuid AND oi.id = ki.order_item_id`,
        params: [kitchenOrderId, status],
      },
    ]);
  }
}

export async function createRestaurantReservation(params: {
  customerName: string;
  phone?: string | null;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  tableId?: string | null;
  note?: string | null;
}): Promise<void> {
  return runDataTransport({
    label: 'createRestaurantReservation',
    viaRest: () => createRestaurantReservationViaRest(params),
    viaBridge: () => createRestaurantReservationViaBridge(params),
  });
}

async function createRestaurantReservationViaRest(params: {
  customerName: string;
  phone?: string | null;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  tableId?: string | null;
  note?: string | null;
}): Promise<void> {
  const reservationsBare = restTableBare(restReservationsTable());
  const tablesBare = restTableBare(restTablesTable());
  const id = newUuid();
  let tableNumber: string | null = null;
  if (params.tableId) {
    try {
      const rows = await postgrestGet<Array<{ number?: string }>>(
        `/${tablesBare}`,
        { id: `eq.${params.tableId}`, select: 'number', limit: 1 },
        { schema: 'rest' },
      );
      tableNumber = Array.isArray(rows) ? rows[0]?.number ?? null : null;
    } catch {
      tableNumber = null;
    }
  }

  const body: Record<string, unknown> = {
    id,
    customer_name: params.customerName.trim(),
    phone: params.phone?.trim() || null,
    reservation_date: params.reservationDate,
    reservation_time: params.reservationTime,
    guest_count: Math.max(1, Number(params.guestCount) || 1),
    table_id: params.tableId || null,
    status: 'pending',
    note: params.note?.trim() || null,
  };
  if (tableNumber) body.table_number = tableNumber;

  await postgrestPost(`/${reservationsBare}`, body, {
    schema: 'rest',
    prefer: 'return=minimal',
  });
}

async function createRestaurantReservationViaBridge(params: {
  customerName: string;
  phone?: string | null;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  tableId?: string | null;
  note?: string | null;
}): Promise<void> {
  const reservations = restReservationsTable();
  const tables = restTablesTable();
  const id = newUuid();
  let tableNumber: string | null = null;
  if (params.tableId) {
    try {
      const row = await pgQuery<{ number: string | null }>(
        `SELECT number FROM ${tables} WHERE id = $1::uuid LIMIT 1`,
        [params.tableId],
      );
      tableNumber = row.rows[0]?.number ?? null;
    } catch {
      tableNumber = null;
    }
  }

  const ok = await runFirst([
    {
      sql: `INSERT INTO ${reservations}
         (id, customer_name, phone, reservation_date, reservation_time, guest_count,
          table_id, table_number, status, note)
       VALUES ($1::uuid, $2, $3, $4::date, $5::time, $6, $7::uuid, $8, 'pending', $9)`,
      params: [
        id,
        params.customerName.trim(),
        params.phone?.trim() || null,
        params.reservationDate,
        params.reservationTime,
        Math.max(1, Number(params.guestCount) || 1),
        params.tableId || null,
        tableNumber,
        params.note?.trim() || null,
      ],
    },
    {
      sql: `INSERT INTO ${reservations}
         (id, customer_name, phone, reservation_date, reservation_time, guest_count,
          table_id, status, note)
       VALUES ($1::uuid, $2, $3, $4::date, $5::time, $6, $7::uuid, 'pending', $8)`,
      params: [
        id,
        params.customerName.trim(),
        params.phone?.trim() || null,
        params.reservationDate,
        params.reservationTime,
        Math.max(1, Number(params.guestCount) || 1),
        params.tableId || null,
        params.note?.trim() || null,
      ],
    },
  ]);
  if (!ok) {
    throw new Error('Rezervasyon kaydedilemedi');
  }
}

export async function updateRestaurantReservationStatus(
  reservationId: string,
  status: RestReservationStatus,
): Promise<void> {
  return runDataTransport({
    label: 'updateRestaurantReservationStatus',
    viaRest: () => updateRestaurantReservationStatusViaRest(reservationId, status),
    viaBridge: () => updateRestaurantReservationStatusViaBridge(reservationId, status),
  });
}

async function updateRestaurantReservationStatusViaRest(
  reservationId: string,
  status: RestReservationStatus,
): Promise<void> {
  const reservationsBare = restTableBare(restReservationsTable());
  try {
    await postgrestPatch(
      `/${reservationsBare}?id=eq.${encodeURIComponent(reservationId)}`,
      { status, updated_at: new Date().toISOString() },
      { schema: 'rest', prefer: 'return=minimal' },
    );
  } catch {
    await postgrestPatch(
      `/${reservationsBare}?id=eq.${encodeURIComponent(reservationId)}`,
      { status },
      { schema: 'rest', prefer: 'return=minimal' },
    );
  }
}

async function updateRestaurantReservationStatusViaBridge(
  reservationId: string,
  status: RestReservationStatus,
): Promise<void> {
  const reservations = restReservationsTable();
  const ok = await runFirst([
    {
      sql: `UPDATE ${reservations}
       SET status = $2, updated_at = NOW()
       WHERE id = $1::uuid`,
      params: [reservationId, status],
    },
    {
      sql: `UPDATE ${reservations}
       SET status = $2
       WHERE id = $1::uuid`,
      params: [reservationId, status],
    },
  ]);
  if (!ok) {
    throw new Error('Rezervasyon durumu güncellenemedi');
  }
}

export type RestPaymentMethod = 'cash' | 'card' | 'veresiye';

/** Web RestaurantService.closeOrder */
export async function closeRestaurantOrder(
  orderId: string,
  params?: {
    discountAmount?: number;
    taxAmount?: number;
    paymentMethod?: RestPaymentMethod | string;
  },
): Promise<void> {
  return runDataTransport({
    label: 'closeRestaurantOrder',
    viaRest: () => closeRestaurantOrderViaRest(orderId, params),
    viaBridge: () => closeRestaurantOrderViaBridge(orderId, params),
  });
}

async function closeRestaurantOrderViaRest(
  orderId: string,
  params?: {
    discountAmount?: number;
    taxAmount?: number;
    paymentMethod?: RestPaymentMethod | string;
  },
): Promise<void> {
  const ordersBare = restTableBare(restOrdersTable());
  const now = new Date().toISOString();
  await postgrestPatch(
    `/${ordersBare}?id=eq.${encodeURIComponent(orderId)}`,
    {
      status: 'closed',
      closed_at: now,
      billed_at: now,
      discount_amount: params?.discountAmount ?? 0,
      tax_amount: params?.taxAmount ?? 0,
      payment_method: params?.paymentMethod ?? null,
      updated_at: now,
    },
    { schema: 'rest', prefer: 'return=minimal' },
  );
}

async function closeRestaurantOrderViaBridge(
  orderId: string,
  params?: {
    discountAmount?: number;
    taxAmount?: number;
    paymentMethod?: RestPaymentMethod | string;
  },
): Promise<void> {
  const orders = restOrdersTable();
  await pgQuery(
    `UPDATE ${orders}
     SET status = 'closed',
         closed_at = NOW(),
         billed_at = COALESCE(billed_at, NOW()),
         discount_amount = $2,
         tax_amount = $3,
         payment_method = $4,
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [
      orderId,
      params?.discountAmount ?? 0,
      params?.taxAmount ?? 0,
      params?.paymentMethod ?? null,
    ],
  );
}

/** Web RestaurantService.completeTablePayment — sipariş kapat + masa empty */
export async function completeTablePayment(params: {
  tableId: string;
  orderId: string;
  linkedOrderIds?: string[];
  discountAmount?: number;
  taxAmount?: number;
  paymentMethod?: RestPaymentMethod | string;
}): Promise<void> {
  return runDataTransport({
    label: 'completeTablePayment',
    viaRest: () => completeTablePaymentViaRest(params),
    viaBridge: () => completeTablePaymentViaBridge(params),
  });
}

async function completeTablePaymentViaRest(params: {
  tableId: string;
  orderId: string;
  linkedOrderIds?: string[];
  discountAmount?: number;
  taxAmount?: number;
  paymentMethod?: RestPaymentMethod | string;
}): Promise<void> {
  const pay = {
    discountAmount: params.discountAmount,
    taxAmount: params.taxAmount,
    paymentMethod: params.paymentMethod,
  };

  await closeRestaurantOrderViaRest(params.orderId, pay);
  for (const linkedId of params.linkedOrderIds || []) {
    try {
      await closeRestaurantOrderViaRest(linkedId, { paymentMethod: params.paymentMethod });
    } catch {
      /* birleşik adisyon yoksa atla */
    }
  }

  const tablesBare = restTableBare(restTablesTable());
  const now = new Date().toISOString();
  try {
    await postgrestPatch(
      `/${tablesBare}?id=eq.${encodeURIComponent(params.tableId)}`,
      {
        status: 'empty',
        waiter: null,
        staff_id: null,
        total: 0,
        linked_order_ids: '{}',
        updated_at: now,
      },
      { schema: 'rest', prefer: 'return=minimal' },
    );
  } catch {
    await postgrestPatch(
      `/${tablesBare}?id=eq.${encodeURIComponent(params.tableId)}`,
      { status: 'empty', waiter: null, total: 0, updated_at: now },
      { schema: 'rest', prefer: 'return=minimal' },
    );
  }
}

async function completeTablePaymentViaBridge(params: {
  tableId: string;
  orderId: string;
  linkedOrderIds?: string[];
  discountAmount?: number;
  taxAmount?: number;
  paymentMethod?: RestPaymentMethod | string;
}): Promise<void> {
  const tables = restTablesTable();
  const pay = {
    discountAmount: params.discountAmount,
    taxAmount: params.taxAmount,
    paymentMethod: params.paymentMethod,
  };

  await closeRestaurantOrderViaBridge(params.orderId, pay);
  for (const linkedId of params.linkedOrderIds || []) {
    try {
      await closeRestaurantOrderViaBridge(linkedId, { paymentMethod: params.paymentMethod });
    } catch {
      /* birleşik adisyon yoksa atla */
    }
  }

  try {
    await pgQuery(
      `UPDATE ${tables}
       SET status = 'empty', waiter = NULL, staff_id = NULL, total = 0,
           linked_order_ids = '{}', updated_at = NOW()
       WHERE id = $1::uuid`,
      [params.tableId],
    );
  } catch {
    await pgQuery(
      `UPDATE ${tables}
       SET status = 'empty', waiter = NULL, total = 0, updated_at = NOW()
       WHERE id = $1::uuid`,
      [params.tableId],
    );
  }
}
