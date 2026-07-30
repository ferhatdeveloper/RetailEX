import { pgQuery } from './pgClient';
import { postgrestDelete, postgrestGet, postgrestPatch, postgrestPost } from './postgrestClient';
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
  order_discount_pct?: number;
  note?: string | null;
  payment_method?: string | null;
};

export type RestDeliveryStatus = 'pending' | 'preparing' | 'on_way' | 'delivered';
export type RestTakeawayStatus = 'pending' | 'preparing' | 'ready' | 'picked_up';
export type RestDeliveryPayMethod = 'cash' | 'card' | 'transfer';

export type RestDeliveryOrder = {
  id: string;
  order_no: string | null;
  customer_name: string;
  phone: string;
  address: string;
  courier: string;
  delivery_status: RestDeliveryStatus;
  total_amount: number;
  items_summary: string;
  expected_payment_method: RestDeliveryPayMethod;
  created_at: string | null;
  item_count: number;
};

export type RestTakeawayOrder = {
  id: string;
  order_no: string | null;
  customer_name: string;
  phone: string;
  takeaway_status: RestTakeawayStatus;
  total_amount: number;
  created_at: string | null;
  item_count: number;
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
  discount_pct?: number;
  is_void?: boolean;
  is_complimentary?: boolean;
  void_reason?: string | null;
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
    order_discount_pct:
      r.order_discount_pct == null ? undefined : Number(r.order_discount_pct) || 0,
    note: r.note == null ? null : String(r.note),
    payment_method: r.payment_method == null ? null : String(r.payment_method),
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

function mapOrderItemRow(it: Record<string, unknown>): RestOrderItem {
  return {
    id: String(it.id ?? ''),
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
    discount_pct: it.discount_pct == null ? 0 : Number(it.discount_pct) || 0,
    is_void: Boolean(it.is_void),
    is_complimentary: Boolean(it.is_complimentary),
    void_reason: it.void_reason == null ? null : String(it.void_reason),
  };
}

function mapOrderDetail(
  row: RestOrder & { item_json?: RestOrderItem[] | null },
): RestOrderDetail {
  const rawItems = row.item_json;
  const itemsList: RestOrderItem[] = Array.isArray(rawItems)
    ? rawItems.map((it) => mapOrderItemRow(it as unknown as Record<string, unknown>))
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
    order_discount_pct: row.order_discount_pct,
    note: row.note,
    payment_method: row.payment_method,
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
      COALESCE(o.order_discount_pct, 0)::float8 AS order_discount_pct,
      o.note,
      o.payment_method,
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
            'sent_to_kitchen_at', i.sent_to_kitchen_at,
            'discount_pct', i.discount_pct,
            'is_void', i.is_void,
            'is_complimentary', i.is_complimentary,
            'void_reason', i.void_reason
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

async function fetchOrderItemsViaRest(orderId: string): Promise<RestOrderItem[]> {
  const itemsBare = restTableBare(restOrderItemsTable());
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${itemsBare}`,
    {
      order_id: `eq.${orderId}`,
      is_void: 'eq.false',
      select:
        'id,product_id,product_name,quantity,unit_price,subtotal,status,course,note,options,sent_to_kitchen_at,discount_pct,is_void,is_complimentary,void_reason',
      order: 'created_at.asc',
      limit: 500,
    },
    { schema: 'rest' },
  );
  return (Array.isArray(rows) ? rows : []).map(mapOrderItemRow).filter((r) => r.id);
}

async function getOrderDetailByIdViaRest(orderId: string): Promise<RestOrderDetail | null> {
  const ordersBare = restTableBare(restOrdersTable());
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${ordersBare}`,
    {
      id: `eq.${orderId}`,
      select:
        'id,order_no,table_id,status,total_amount,waiter,opened_at,created_at,order_discount_pct,note,payment_method',
      limit: 1,
    },
    { schema: 'rest' },
  );
  const r = Array.isArray(rows) ? rows[0] : undefined;
  if (!r?.id) return null;
  const tableNames = await fetchTablesNameMapViaRest().catch(() => new Map<string, string>());
  const base = mapRestOrderRow(r, tableNames);
  const items = await fetchOrderItemsViaRest(String(r.id));
  return { ...base, items };
}

async function getActiveOrderForTableViaRest(tableId: string): Promise<RestOrderDetail | null> {
  const ordersBare = restTableBare(restOrdersTable());
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${ordersBare}`,
    {
      table_id: `eq.${tableId}`,
      status: 'eq.open',
      select:
        'id,order_no,table_id,status,total_amount,waiter,opened_at,created_at,order_discount_pct,note,payment_method',
      order: 'opened_at.desc',
      limit: 1,
    },
    { schema: 'rest' },
  );
  const r = Array.isArray(rows) ? rows[0] : undefined;
  if (!r?.id) return null;
  return getOrderDetailByIdViaRest(String(r.id));
}

async function getActiveOrderForTableViaBridge(tableId: string): Promise<RestOrderDetail | null> {
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

async function getOrderDetailByIdViaBridge(orderId: string): Promise<RestOrderDetail | null> {
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

export async function getActiveOrderForTable(tableId: string): Promise<RestOrderDetail | null> {
  return runDataTransport({
    label: 'getActiveOrderForTable',
    viaRest: () => getActiveOrderForTableViaRest(tableId),
    viaBridge: () => getActiveOrderForTableViaBridge(tableId),
  });
}

/** Açık adisyon listesinden id ile detay + kalemler */
export async function getOrderDetailById(orderId: string): Promise<RestOrderDetail | null> {
  return runDataTransport({
    label: 'getOrderDetailById',
    viaRest: () => getOrderDetailByIdViaRest(orderId),
    viaBridge: () => getOrderDetailByIdViaBridge(orderId),
  });
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
  const rows = await postgrestGet<
    Array<{ subtotal?: number; is_void?: boolean; is_complimentary?: boolean }>
  >(
    `/${itemsBare}`,
    {
      order_id: `eq.${orderId}`,
      select: 'subtotal,is_void,is_complimentary',
      limit: 5000,
    },
    { schema: 'rest' },
  );
  const total = (Array.isArray(rows) ? rows : [])
    .filter((r) => !r.is_void && !r.is_complimentary)
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

async function fetchActiveKitchenOrdersViaRest(limit = 50): Promise<RestKitchenOrder[]> {
  const koBare = restTableBare(restKitchenOrdersTable());
  const kiBare = restTableBare(restKitchenItemsTable());
  const ordersBare = restTableBare(restOrdersTable());
  const capped = Math.min(100, Math.max(1, limit));

  const koRows = await postgrestGet<Record<string, unknown>[]>(
    `/${koBare}`,
    {
      status: 'not.in.(served,cancelled)',
      select: 'id,order_id,table_number,floor_name,waiter,status,note,sent_at,estimated_ready_at',
      order: 'sent_at.asc',
      limit: capped,
    },
    { schema: 'rest' },
  );
  const headers = Array.isArray(koRows) ? koRows : [];
  if (headers.length === 0) return [];

  const orderIds = headers
    .map((h) => (h.order_id == null ? null : String(h.order_id)))
    .filter((id): id is string => !!id);
  const kitchenOrderIds = headers.map((h) => String(h.id)).filter(Boolean);

  const orderTableMap = new Map<string, string | null>();
  if (orderIds.length > 0) {
    try {
      const oRows = await postgrestGet<Array<{ id?: string; table_id?: string | null }>>(
        `/${ordersBare}`,
        {
          id: `in.(${orderIds.join(',')})`,
          select: 'id,table_id',
          limit: capped,
        },
        { schema: 'rest' },
      );
      for (const o of Array.isArray(oRows) ? oRows : []) {
        if (o.id != null) orderTableMap.set(String(o.id), o.table_id == null ? null : String(o.table_id));
      }
    } catch {
      /* şema farkı */
    }
  }

  let itemRows: Record<string, unknown>[] = [];
  if (kitchenOrderIds.length > 0) {
    try {
      itemRows = await postgrestGet<Record<string, unknown>[]>(
        `/${kiBare}`,
        {
          kitchen_order_id: `in.(${kitchenOrderIds.join(',')})`,
          select:
            'id,kitchen_order_id,order_item_id,product_name,quantity,course,note,status,preparation_time,start_at,estimated_ready_at',
          limit: 2000,
        },
        { schema: 'rest' },
      );
      if (!Array.isArray(itemRows)) itemRows = [];
    } catch {
      itemRows = [];
    }
  }

  const itemsByKo = new Map<string, RestKitchenItem[]>();
  for (const it of itemRows) {
    const kid = it.kitchen_order_id == null ? '' : String(it.kitchen_order_id);
    if (!kid) continue;
    const list = itemsByKo.get(kid) || [];
    list.push({
      id: String(it.id ?? ''),
      order_item_id: it.order_item_id == null ? null : String(it.order_item_id),
      product_name: String(it.product_name ?? ''),
      quantity: Number(it.quantity) || 0,
      course: it.course == null ? null : String(it.course),
      note: it.note == null ? null : String(it.note),
      status: it.status == null ? null : String(it.status),
      preparation_time:
        it.preparation_time == null ? null : Number(it.preparation_time) || null,
      start_at: it.start_at == null ? null : String(it.start_at),
      estimated_ready_at:
        it.estimated_ready_at == null ? null : String(it.estimated_ready_at),
    });
    itemsByKo.set(kid, list);
  }

  return headers
    .map((h) => {
      const id = String(h.id ?? '');
      const orderId = h.order_id == null ? '' : String(h.order_id);
      return {
        id,
        order_id: orderId,
        table_id: orderTableMap.get(orderId) ?? null,
        table_number: h.table_number == null ? null : String(h.table_number),
        floor_name: h.floor_name == null ? null : String(h.floor_name),
        waiter: h.waiter == null ? null : String(h.waiter),
        status: h.status == null ? null : String(h.status),
        note: h.note == null ? null : String(h.note),
        sent_at: h.sent_at == null ? null : String(h.sent_at),
        estimated_ready_at:
          h.estimated_ready_at == null ? null : String(h.estimated_ready_at),
        items: itemsByKo.get(id) || [],
      } satisfies RestKitchenOrder;
    })
    .filter((o) => o.id);
}

async function fetchActiveKitchenOrdersViaBridge(limit = 50): Promise<RestKitchenOrder[]> {
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

export async function fetchActiveKitchenOrders(limit = 50): Promise<RestKitchenOrder[]> {
  return runDataTransport({
    label: 'fetchActiveKitchenOrders',
    viaRest: () => fetchActiveKitchenOrdersViaRest(limit),
    viaBridge: () => fetchActiveKitchenOrdersViaBridge(limit),
  });
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

async function bridgeRecalcOrderTotal(orderId: string): Promise<void> {
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const tables = restTablesTable();
  await pgQuery(
    `UPDATE ${orders}
     SET total_amount = (
       SELECT COALESCE(SUM(subtotal), 0)
       FROM ${items}
       WHERE order_id = $1::uuid AND COALESCE(is_void, false) = false
         AND COALESCE(is_complimentary, false) = false
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

/** Web RestaurantService.voidOrderItem — tam iptal (is_void) */
export async function voidRestaurantOrderItem(
  itemId: string,
  reason: string,
): Promise<void> {
  return runDataTransport({
    label: 'voidRestaurantOrderItem',
    viaRest: async () => {
      const itemsBare = restTableBare(restOrderItemsTable());
      const rows = await postgrestGet<Array<{ order_id?: string; subtotal?: number }>>(
        `/${itemsBare}`,
        { id: `eq.${itemId}`, select: 'order_id,subtotal', limit: 1 },
        { schema: 'rest' },
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row?.order_id) throw new Error('Kalem bulunamadı');
      await postgrestPatch(
        `/${itemsBare}?id=eq.${encodeURIComponent(itemId)}`,
        { is_void: true, void_reason: reason.trim() || 'İptal' },
        { schema: 'rest', prefer: 'return=minimal' },
      );
      await restRecalcOrderTotal(String(row.order_id));
    },
    viaBridge: async () => {
      const items = restOrderItemsTable();
      const res = await pgQuery<{ order_id: string; subtotal: number }>(
        `SELECT order_id::text AS order_id, COALESCE(subtotal, 0)::float8 AS subtotal
         FROM ${items} WHERE id = $1::uuid`,
        [itemId],
      );
      const row = res.rows[0];
      if (!row) throw new Error('Kalem bulunamadı');
      await pgQuery(
        `UPDATE ${items} SET is_void = TRUE, void_reason = $2 WHERE id = $1::uuid`,
        [itemId, reason.trim() || 'İptal'],
      );
      await bridgeRecalcOrderTotal(row.order_id);
    },
  });
}

/** Mutfağa gitmemiş kalemi sil */
export async function removeRestaurantOrderItem(itemId: string): Promise<void> {
  return runDataTransport({
    label: 'removeRestaurantOrderItem',
    viaRest: async () => {
      const itemsBare = restTableBare(restOrderItemsTable());
      const rows = await postgrestGet<
        Array<{ order_id?: string; sent_to_kitchen_at?: string | null; status?: string | null }>
      >(
        `/${itemsBare}`,
        { id: `eq.${itemId}`, select: 'order_id,sent_to_kitchen_at,status', limit: 1 },
        { schema: 'rest' },
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row?.order_id) throw new Error('Kalem bulunamadı');
      const st = String(row.status || 'pending').toLowerCase();
      if (
        row.sent_to_kitchen_at ||
        st === 'cooking' ||
        st === 'ready' ||
        st === 'served'
      ) {
        throw new Error('Mutfağa gönderilmiş kalem silinemez; iptal kullanın');
      }
      await postgrestDelete(`/${itemsBare}?id=eq.${encodeURIComponent(itemId)}`, {
        schema: 'rest',
      });
      await restRecalcOrderTotal(String(row.order_id));
    },
    viaBridge: async () => {
      const items = restOrderItemsTable();
      const res = await pgQuery<{
        order_id: string;
        sent_to_kitchen_at: string | null;
        status: string | null;
      }>(
        `SELECT order_id::text AS order_id, sent_to_kitchen_at::text AS sent_to_kitchen_at, status
         FROM ${items} WHERE id = $1::uuid`,
        [itemId],
      );
      const row = res.rows[0];
      if (!row) throw new Error('Kalem bulunamadı');
      const st = String(row.status || 'pending').toLowerCase();
      if (
        row.sent_to_kitchen_at ||
        st === 'cooking' ||
        st === 'ready' ||
        st === 'served'
      ) {
        throw new Error('Mutfağa gönderilmiş kalem silinemez; iptal kullanın');
      }
      await pgQuery(`DELETE FROM ${items} WHERE id = $1::uuid`, [itemId]);
      await bridgeRecalcOrderTotal(row.order_id);
    },
  });
}

/** Kalem notu */
export async function updateRestaurantOrderItemNote(
  itemId: string,
  note: string,
): Promise<void> {
  return runDataTransport({
    label: 'updateRestaurantOrderItemNote',
    viaRest: async () => {
      const itemsBare = restTableBare(restOrderItemsTable());
      await postgrestPatch(
        `/${itemsBare}?id=eq.${encodeURIComponent(itemId)}`,
        { note: note.trim() || null },
        { schema: 'rest', prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const items = restOrderItemsTable();
      await pgQuery(`UPDATE ${items} SET note = $2 WHERE id = $1::uuid`, [
        itemId,
        note.trim() || null,
      ]);
    },
  });
}

/** İkram — toplamdan düş */
export async function markRestaurantItemComplimentary(itemId: string): Promise<void> {
  return runDataTransport({
    label: 'markRestaurantItemComplimentary',
    viaRest: async () => {
      const itemsBare = restTableBare(restOrderItemsTable());
      const rows = await postgrestGet<
        Array<{ order_id?: string; is_complimentary?: boolean }>
      >(
        `/${itemsBare}`,
        { id: `eq.${itemId}`, select: 'order_id,is_complimentary', limit: 1 },
        { schema: 'rest' },
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row?.order_id) throw new Error('Kalem bulunamadı');
      if (row.is_complimentary) return;
      await postgrestPatch(
        `/${itemsBare}?id=eq.${encodeURIComponent(itemId)}`,
        { is_complimentary: true, subtotal: 0 },
        { schema: 'rest', prefer: 'return=minimal' },
      );
      await restRecalcOrderTotal(String(row.order_id));
    },
    viaBridge: async () => {
      const items = restOrderItemsTable();
      const res = await pgQuery<{ order_id: string; is_complimentary: boolean }>(
        `SELECT order_id::text AS order_id, COALESCE(is_complimentary, false) AS is_complimentary
         FROM ${items} WHERE id = $1::uuid`,
        [itemId],
      );
      const row = res.rows[0];
      if (!row) throw new Error('Kalem bulunamadı');
      if (row.is_complimentary) return;
      await pgQuery(
        `UPDATE ${items} SET is_complimentary = TRUE, subtotal = 0 WHERE id = $1::uuid`,
        [itemId],
      );
      await bridgeRecalcOrderTotal(row.order_id);
    },
  });
}

/** Açık adisyon indirim % */
export async function updateOpenOrderDiscountPct(
  orderId: string,
  pct: number,
): Promise<void> {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  return runDataTransport({
    label: 'updateOpenOrderDiscountPct',
    viaRest: async () => {
      const ordersBare = restTableBare(restOrdersTable());
      await postgrestPatch(
        `/${ordersBare}?id=eq.${encodeURIComponent(orderId)}&status=eq.open`,
        { order_discount_pct: p, updated_at: new Date().toISOString() },
        { schema: 'rest', prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const orders = restOrdersTable();
      await pgQuery(
        `UPDATE ${orders}
         SET order_discount_pct = $2, updated_at = NOW()
         WHERE id = $1::uuid AND status = 'open'`,
        [orderId, p],
      );
    },
  });
}

/** Masa durumu (ör. cleaning → empty) */
export async function updateRestaurantTableStatus(
  tableId: string,
  status: string,
): Promise<void> {
  return runDataTransport({
    label: 'updateRestaurantTableStatus',
    viaRest: async () => {
      const tablesBare = restTableBare(restTablesTable());
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === 'empty' || status === 'cleaning') {
        patch.waiter = null;
        patch.total = 0;
      }
      await postgrestPatch(
        `/${tablesBare}?id=eq.${encodeURIComponent(tableId)}`,
        patch,
        { schema: 'rest', prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const tables = restTablesTable();
      if (status === 'empty' || status === 'cleaning') {
        await pgQuery(
          `UPDATE ${tables}
           SET status = $2, waiter = NULL, total = 0, updated_at = NOW()
           WHERE id = $1::uuid`,
          [tableId, status],
        );
      } else {
        await pgQuery(
          `UPDATE ${tables} SET status = $2, updated_at = NOW() WHERE id = $1::uuid`,
          [tableId, status],
        );
      }
    },
  });
}

/** Web transferTable — açık siparişi hedef masaya taşı */
export async function transferRestaurantTable(
  sourceTableId: string,
  targetTableId: string,
): Promise<void> {
  if (sourceTableId === targetTableId) return;
  return runDataTransport({
    label: 'transferRestaurantTable',
    viaRest: async () => {
      const detail = await getActiveOrderForTableViaRest(sourceTableId);
      if (!detail) throw new Error('Bu masada taşınacak açık sipariş yok');
      const targetOpen = await getActiveOrderForTableViaRest(targetTableId);
      if (targetOpen) throw new Error('Hedef masada zaten açık adisyon var');

      const ordersBare = restTableBare(restOrdersTable());
      const tablesBare = restTableBare(restTablesTable());
      const now = new Date().toISOString();
      await postgrestPatch(
        `/${ordersBare}?id=eq.${encodeURIComponent(detail.id)}`,
        { table_id: targetTableId, updated_at: now },
        { schema: 'rest', prefer: 'return=minimal' },
      );
      await postgrestPatch(
        `/${tablesBare}?id=eq.${encodeURIComponent(targetTableId)}`,
        {
          status: 'occupied',
          waiter: detail.waiter,
          total: detail.total_amount,
          updated_at: now,
        },
        { schema: 'rest', prefer: 'return=minimal' },
      );
      await postgrestPatch(
        `/${tablesBare}?id=eq.${encodeURIComponent(sourceTableId)}`,
        { status: 'empty', waiter: null, total: 0, updated_at: now },
        { schema: 'rest', prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const orders = restOrdersTable();
      const tables = restTablesTable();
      const detail = await getActiveOrderForTableViaBridge(sourceTableId);
      if (!detail) throw new Error('Bu masada taşınacak açık sipariş yok');
      const targetOpen = await getActiveOrderForTableViaBridge(targetTableId);
      if (targetOpen) throw new Error('Hedef masada zaten açık adisyon var');

      await pgQuery(
        `UPDATE ${orders} SET table_id = $2::uuid, updated_at = NOW() WHERE id = $1::uuid`,
        [detail.id, targetTableId],
      );
      await pgQuery(
        `UPDATE ${tables}
         SET status = 'occupied', waiter = $2, total = $3, updated_at = NOW()
         WHERE id = $1::uuid`,
        [targetTableId, detail.waiter, detail.total_amount],
      );
      await pgQuery(
        `UPDATE ${tables}
         SET status = 'empty', waiter = NULL, total = 0, updated_at = NOW()
         WHERE id = $1::uuid`,
        [sourceTableId],
      );
    },
  });
}

function parseDeliveryNote(note: string | null | undefined): Record<string, unknown> {
  if (!note) return {};
  try {
    const obj = JSON.parse(note);
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mapDeliveryOrder(
  r: Record<string, unknown>,
  itemCount = 0,
): RestDeliveryOrder {
  const noteObj = parseDeliveryNote(r.note == null ? null : String(r.note));
  const st = String(noteObj.delivery_status || 'pending').toLowerCase();
  const deliveryStatus: RestDeliveryStatus =
    st === 'preparing' || st === 'on_way' || st === 'delivered' ? st : 'pending';
  const payRaw = noteObj.expected_payment_method;
  const pay: RestDeliveryPayMethod =
    payRaw === 'card' || payRaw === 'transfer' ? payRaw : 'cash';
  const created =
    r.opened_at != null
      ? String(r.opened_at)
      : r.created_at == null
        ? null
        : String(r.created_at);
  return {
    id: String(r.id ?? ''),
    order_no: r.order_no == null ? null : String(r.order_no),
    customer_name: String(noteObj.customer_name ?? '—'),
    phone: String(noteObj.phone ?? ''),
    address: String(noteObj.address ?? ''),
    courier: String(noteObj.courier ?? ''),
    delivery_status: deliveryStatus,
    total_amount: Number(r.total_amount) || 0,
    items_summary: String(noteObj.items_summary ?? ''),
    expected_payment_method: pay,
    created_at: created,
    item_count: itemCount,
  };
}

function mapTakeawayOrder(
  r: Record<string, unknown>,
  itemCount = 0,
): RestTakeawayOrder {
  const noteObj = parseDeliveryNote(r.note == null ? null : String(r.note));
  const st = String(noteObj.takeaway_status || 'pending').toLowerCase();
  const takeawayStatus: RestTakeawayStatus =
    st === 'preparing' || st === 'ready' || st === 'picked_up' ? st : 'pending';
  const created =
    r.opened_at != null
      ? String(r.opened_at)
      : r.created_at == null
        ? null
        : String(r.created_at);
  return {
    id: String(r.id ?? ''),
    order_no: r.order_no == null ? null : String(r.order_no),
    customer_name: String(noteObj.customer_name ?? '—'),
    phone: String(noteObj.phone ?? ''),
    takeaway_status: takeawayStatus,
    total_amount: Number(r.total_amount) || 0,
    created_at: created,
    item_count: itemCount,
  };
}

async function fetchDeliveryOrdersViaRest(): Promise<RestDeliveryOrder[]> {
  const ordersBare = restTableBare(restOrdersTable());
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${ordersBare}`,
    {
      order_no: 'like.DLV-*',
      status: 'eq.open',
      select: 'id,order_no,status,total_amount,note,opened_at,created_at',
      order: 'opened_at.desc',
      limit: 100,
    },
    { schema: 'rest' },
  );
  return (Array.isArray(rows) ? rows : []).map((r) => mapDeliveryOrder(r)).filter((o) => o.id);
}

async function fetchDeliveryOrdersViaBridge(): Promise<RestDeliveryOrder[]> {
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const rows = await tryQueries<Record<string, unknown>>([
    {
      sql: `SELECT o.id, o.order_no, o.status, o.total_amount, o.note,
              o.opened_at::text AS opened_at, o.created_at::text AS created_at,
              COUNT(i.id)::int AS item_count
       FROM ${orders} o
       LEFT JOIN ${items} i ON i.order_id = o.id AND COALESCE(i.is_void, false) = false
       WHERE o.order_no LIKE 'DLV-%' AND o.status = 'open'
       GROUP BY o.id
       ORDER BY o.opened_at DESC NULLS LAST
       LIMIT 100`,
    },
  ]);
  return rows.map((r) => mapDeliveryOrder(r, Number(r.item_count) || 0)).filter((o) => o.id);
}

export async function fetchDeliveryOrders(): Promise<RestDeliveryOrder[]> {
  return runDataTransport({
    label: 'fetchDeliveryOrders',
    viaRest: fetchDeliveryOrdersViaRest,
    viaBridge: fetchDeliveryOrdersViaBridge,
  });
}

export async function createDeliveryOrder(params: {
  customerName: string;
  phone: string;
  address: string;
  itemsSummary?: string;
  totalAmount?: number;
  expectedPaymentMethod?: RestDeliveryPayMethod;
}): Promise<RestDeliveryOrder> {
  return runDataTransport({
    label: 'createDeliveryOrder',
    viaRest: async () => {
      const ordersBare = restTableBare(restOrdersTable());
      const year = new Date().getFullYear();
      const prefix = `DLV-${year}-`;
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
        const m = String(last).match(new RegExp(`^DLV-${year}-(\\d+)$`));
        if (m) next = parseInt(m[1], 10) + 1;
      }
      const orderNo = `${prefix}${String(next).padStart(4, '0')}`;
      const pay: RestDeliveryPayMethod =
        params.expectedPaymentMethod === 'card' || params.expectedPaymentMethod === 'transfer'
          ? params.expectedPaymentMethod
          : 'cash';
      const note = JSON.stringify({
        type: 'delivery',
        customer_name: params.customerName.trim(),
        phone: params.phone.trim(),
        address: params.address.trim(),
        delivery_status: 'pending',
        channel: 'manual',
        expected_payment_method: pay,
        ...(params.itemsSummary?.trim()
          ? { items_summary: params.itemsSummary.trim() }
          : {}),
      });
      const id = newUuid();
      const total =
        typeof params.totalAmount === 'number' && !Number.isNaN(params.totalAmount)
          ? Math.max(0, params.totalAmount)
          : 0;
      const user = useAuthStore.getState().user;
      await postgrestPost(
        `/${ordersBare}`,
        {
          id,
          order_no: orderNo,
          table_id: null,
          waiter: user?.fullName || user?.username || 'mobile',
          status: 'open',
          note,
          total_amount: total,
        },
        { schema: 'rest', prefer: 'return=minimal' },
      );
      return mapDeliveryOrder({
        id,
        order_no: orderNo,
        total_amount: total,
        note,
        opened_at: new Date().toISOString(),
      });
    },
    viaBridge: async () => {
      const orders = restOrdersTable();
      const year = new Date().getFullYear();
      const seqRes = await pgQuery<{ seq: number }>(
        `SELECT COUNT(*)+1 AS seq FROM ${orders} WHERE order_no LIKE $1`,
        [`DLV-${year}-%`],
      );
      const seq = String(seqRes.rows[0]?.seq ?? 1).padStart(4, '0');
      const orderNo = `DLV-${year}-${seq}`;
      const pay: RestDeliveryPayMethod =
        params.expectedPaymentMethod === 'card' || params.expectedPaymentMethod === 'transfer'
          ? params.expectedPaymentMethod
          : 'cash';
      const note = JSON.stringify({
        type: 'delivery',
        customer_name: params.customerName.trim(),
        phone: params.phone.trim(),
        address: params.address.trim(),
        delivery_status: 'pending',
        channel: 'manual',
        expected_payment_method: pay,
        ...(params.itemsSummary?.trim()
          ? { items_summary: params.itemsSummary.trim() }
          : {}),
      });
      const id = newUuid();
      const total =
        typeof params.totalAmount === 'number' && !Number.isNaN(params.totalAmount)
          ? Math.max(0, params.totalAmount)
          : 0;
      const user = useAuthStore.getState().user;
      await pgQuery(
        `INSERT INTO ${orders}
           (id, order_no, table_id, waiter, status, note, total_amount)
         VALUES ($1::uuid, $2, NULL, $3, 'open', $4, $5)`,
        [id, orderNo, user?.fullName || user?.username || 'mobile', note, total],
      );
      return mapDeliveryOrder({
        id,
        order_no: orderNo,
        total_amount: total,
        note,
        opened_at: new Date().toISOString(),
      });
    },
  });
}

async function postDeliveryLedgerIfNeeded(
  orderNo: string,
  totalAmount: number,
  noteObj: Record<string, unknown>,
): Promise<void> {
  if (noteObj.payment_posted_at) return;
  const amt = Number(totalAmount) || 0;
  if (amt <= 0) {
    noteObj.payment_posted_at = new Date().toISOString();
    noteObj.payment_posted_skip = 'zero_amount';
    return;
  }
  const method: RestDeliveryPayMethod =
    noteObj.expected_payment_method === 'card' || noteObj.expected_payment_method === 'transfer'
      ? (noteObj.expected_payment_method as RestDeliveryPayMethod)
      : 'cash';
  try {
    const { fetchCashRegisters, fetchBankRegisters, createSimpleCashMovement, createSimpleBankMovement } =
      await import('./financeApi');
    const today = todayYmdLocal();
    const desc = `Paket servis teslim: ${orderNo}`;
    if (method === 'transfer') {
      const banks = await fetchBankRegisters(20);
      const bank = banks.find((b) => b.is_active) || banks[0];
      if (!bank) throw new Error('Aktif banka hesabı tanımlı değil');
      await createSimpleBankMovement({
        registerId: bank.id,
        amount: amt,
        direction: 'in',
        date: today,
        description: `${desc} (Havale/EFT)`,
      });
    } else {
      const kasalar = await fetchCashRegisters(20);
      const kasa = kasalar.find((k) => k.is_active) || kasalar[0];
      if (!kasa) throw new Error('Aktif kasa tanımlı değil');
      const label = method === 'card' ? 'Kart' : 'Nakit';
      await createSimpleCashMovement({
        registerId: kasa.id,
        amount: amt,
        direction: 'in',
        date: today,
        description: `${desc} (${label})`,
      });
    }
    noteObj.payment_posted_at = new Date().toISOString();
    noteObj.payment_posted_method = method;
  } catch (e) {
    /* kasa yoksa yine de teslim et — kullanıcıya üst katmanda gösterilebilir */
    noteObj.payment_posted_error = e instanceof Error ? e.message : String(e);
    noteObj.payment_posted_at = new Date().toISOString();
  }
}

export async function updateDeliveryStatus(
  orderId: string,
  deliveryStatus: RestDeliveryStatus,
  extra?: { courier?: string },
): Promise<void> {
  return runDataTransport({
    label: 'updateDeliveryStatus',
    viaRest: async () => {
      const ordersBare = restTableBare(restOrdersTable());
      const rows = await postgrestGet<
        Array<{ note?: string | null; total_amount?: number; order_no?: string }>
      >(
        `/${ordersBare}`,
        { id: `eq.${orderId}`, select: 'note,total_amount,order_no', limit: 1 },
        { schema: 'rest' },
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row) throw new Error('Sipariş bulunamadı');
      const noteObj = parseDeliveryNote(row.note);
      if (deliveryStatus === 'delivered') {
        await postDeliveryLedgerIfNeeded(
          String(row.order_no || orderId),
          Number(row.total_amount) || 0,
          noteObj,
        );
      }
      noteObj.delivery_status = deliveryStatus;
      if (extra?.courier) noteObj.courier = extra.courier;
      const patch: Record<string, unknown> = {
        note: JSON.stringify(noteObj),
        updated_at: new Date().toISOString(),
      };
      if (deliveryStatus === 'delivered') {
        patch.status = 'closed';
        patch.closed_at = new Date().toISOString();
      }
      await postgrestPatch(
        `/${ordersBare}?id=eq.${encodeURIComponent(orderId)}`,
        patch,
        { schema: 'rest', prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const orders = restOrdersTable();
      const res = await pgQuery<{
        note: string | null;
        total_amount: number;
        order_no: string;
      }>(
        `SELECT note, COALESCE(total_amount, 0)::float8 AS total_amount, order_no
         FROM ${orders} WHERE id = $1::uuid`,
        [orderId],
      );
      const row = res.rows[0];
      if (!row) throw new Error('Sipariş bulunamadı');
      const noteObj = parseDeliveryNote(row.note);
      if (deliveryStatus === 'delivered') {
        await postDeliveryLedgerIfNeeded(row.order_no, row.total_amount, noteObj);
      }
      noteObj.delivery_status = deliveryStatus;
      if (extra?.courier) noteObj.courier = extra.courier;
      await pgQuery(
        `UPDATE ${orders} SET note = $2, updated_at = NOW() WHERE id = $1::uuid`,
        [orderId, JSON.stringify(noteObj)],
      );
      if (deliveryStatus === 'delivered') {
        await pgQuery(
          `UPDATE ${orders} SET status = 'closed', closed_at = NOW() WHERE id = $1::uuid`,
          [orderId],
        );
      }
    },
  });
}

async function fetchTakeawayOrdersViaRest(): Promise<RestTakeawayOrder[]> {
  const ordersBare = restTableBare(restOrdersTable());
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${ordersBare}`,
    {
      order_no: 'like.GEL-*',
      status: 'eq.open',
      select: 'id,order_no,status,total_amount,note,opened_at,created_at',
      order: 'opened_at.desc',
      limit: 100,
    },
    { schema: 'rest' },
  );
  return (Array.isArray(rows) ? rows : []).map((r) => mapTakeawayOrder(r)).filter((o) => o.id);
}

async function fetchTakeawayOrdersViaBridge(): Promise<RestTakeawayOrder[]> {
  const orders = restOrdersTable();
  const items = restOrderItemsTable();
  const rows = await tryQueries<Record<string, unknown>>([
    {
      sql: `SELECT o.id, o.order_no, o.status, o.total_amount, o.note,
              o.opened_at::text AS opened_at, o.created_at::text AS created_at,
              COUNT(i.id)::int AS item_count
       FROM ${orders} o
       LEFT JOIN ${items} i ON i.order_id = o.id AND COALESCE(i.is_void, false) = false
       WHERE o.order_no LIKE 'GEL-%' AND o.status = 'open'
       GROUP BY o.id
       ORDER BY o.opened_at DESC NULLS LAST
       LIMIT 100`,
    },
  ]);
  return rows.map((r) => mapTakeawayOrder(r, Number(r.item_count) || 0)).filter((o) => o.id);
}

export async function fetchTakeawayOrders(): Promise<RestTakeawayOrder[]> {
  return runDataTransport({
    label: 'fetchTakeawayOrders',
    viaRest: fetchTakeawayOrdersViaRest,
    viaBridge: fetchTakeawayOrdersViaBridge,
  });
}

export async function createTakeawayOrder(params: {
  customerName: string;
  phone: string;
}): Promise<RestTakeawayOrder> {
  return runDataTransport({
    label: 'createTakeawayOrder',
    viaRest: async () => {
      const ordersBare = restTableBare(restOrdersTable());
      const year = new Date().getFullYear();
      const prefix = `GEL-${year}-`;
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
        const m = String(last).match(new RegExp(`^GEL-${year}-(\\d+)$`));
        if (m) next = parseInt(m[1], 10) + 1;
      }
      const orderNo = `${prefix}${String(next).padStart(4, '0')}`;
      const note = JSON.stringify({
        type: 'takeaway',
        customer_name: params.customerName.trim(),
        phone: params.phone.trim(),
        takeaway_status: 'pending',
      });
      const id = newUuid();
      const user = useAuthStore.getState().user;
      await postgrestPost(
        `/${ordersBare}`,
        {
          id,
          order_no: orderNo,
          table_id: null,
          waiter: user?.fullName || user?.username || 'mobile',
          status: 'open',
          note,
          total_amount: 0,
        },
        { schema: 'rest', prefer: 'return=minimal' },
      );
      return mapTakeawayOrder({
        id,
        order_no: orderNo,
        total_amount: 0,
        note,
        opened_at: new Date().toISOString(),
      });
    },
    viaBridge: async () => {
      const orders = restOrdersTable();
      const year = new Date().getFullYear();
      const seqRes = await pgQuery<{ seq: number }>(
        `SELECT COUNT(*)+1 AS seq FROM ${orders} WHERE order_no LIKE $1`,
        [`GEL-${year}-%`],
      );
      const seq = String(seqRes.rows[0]?.seq ?? 1).padStart(4, '0');
      const orderNo = `GEL-${year}-${seq}`;
      const note = JSON.stringify({
        type: 'takeaway',
        customer_name: params.customerName.trim(),
        phone: params.phone.trim(),
        takeaway_status: 'pending',
      });
      const id = newUuid();
      const user = useAuthStore.getState().user;
      await pgQuery(
        `INSERT INTO ${orders} (id, order_no, table_id, waiter, status, note)
         VALUES ($1::uuid, $2, NULL, $3, 'open', $4)`,
        [id, orderNo, user?.fullName || user?.username || 'mobile', note],
      );
      return mapTakeawayOrder({
        id,
        order_no: orderNo,
        total_amount: 0,
        note,
        opened_at: new Date().toISOString(),
      });
    },
  });
}

export async function updateTakeawayStatus(
  orderId: string,
  takeawayStatus: RestTakeawayStatus,
): Promise<void> {
  return runDataTransport({
    label: 'updateTakeawayStatus',
    viaRest: async () => {
      const ordersBare = restTableBare(restOrdersTable());
      const rows = await postgrestGet<Array<{ note?: string | null }>>(
        `/${ordersBare}`,
        { id: `eq.${orderId}`, select: 'note', limit: 1 },
        { schema: 'rest' },
      );
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row) throw new Error('Sipariş bulunamadı');
      const noteObj = parseDeliveryNote(row.note);
      noteObj.takeaway_status = takeawayStatus;
      const patch: Record<string, unknown> = {
        note: JSON.stringify(noteObj),
        updated_at: new Date().toISOString(),
      };
      if (takeawayStatus === 'picked_up') {
        patch.status = 'closed';
        patch.closed_at = new Date().toISOString();
      }
      await postgrestPatch(
        `/${ordersBare}?id=eq.${encodeURIComponent(orderId)}`,
        patch,
        { schema: 'rest', prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const orders = restOrdersTable();
      const res = await pgQuery<{ note: string | null }>(
        `SELECT note FROM ${orders} WHERE id = $1::uuid`,
        [orderId],
      );
      const row = res.rows[0];
      if (!row) throw new Error('Sipariş bulunamadı');
      const noteObj = parseDeliveryNote(row.note);
      noteObj.takeaway_status = takeawayStatus;
      await pgQuery(
        `UPDATE ${orders} SET note = $2, updated_at = NOW() WHERE id = $1::uuid`,
        [orderId, JSON.stringify(noteObj)],
      );
      if (takeawayStatus === 'picked_up') {
        await pgQuery(
          `UPDATE ${orders} SET status = 'closed', closed_at = NOW() WHERE id = $1::uuid`,
          [orderId],
        );
      }
    },
  });
}
