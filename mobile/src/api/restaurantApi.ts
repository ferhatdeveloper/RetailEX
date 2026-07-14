import { pgQuery } from './pgClient';
import {
  newUuid,
  restOrderItemsTable,
  restOrdersTable,
  restTablesTable,
} from './erpTables';
import { useAuthStore } from '../store/authStore';

export type RestTable = {
  id: string;
  name: string | null;
  status: string | null;
  waiter: string | null;
  total: number;
  floor_id: string | null;
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

export type RestOrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type RestOrderDetail = RestOrder & { items: RestOrderItem[] };

async function tryQueries<T>(queries: { sql: string; params?: unknown[] }[]): Promise<T[]> {
  for (const q of queries) {
    try {
      const res = await pgQuery<T>(q.sql, q.params ?? []);
      return res.rows;
    } catch {
      /* next */
    }
  }
  return [];
}

export async function fetchRestaurantTables(): Promise<RestTable[]> {
  const tbl = restTablesTable();
  return tryQueries<RestTable>([
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

export async function fetchOpenOrders(limit = 50): Promise<RestOrder[]> {
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

function mapOrderDetail(
  row: RestOrder & { item_json?: RestOrderItem[] | null },
): RestOrderDetail {
  const rawItems = row.item_json;
  const itemsList: RestOrderItem[] = Array.isArray(rawItems)
    ? rawItems.map((it) => ({
        id: String(it.id),
        product_name: String(it.product_name ?? ''),
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        subtotal: Number(it.subtotal) || 0,
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
            'product_name', i.product_name,
            'quantity', i.quantity,
            'unit_price', i.unit_price,
            'subtotal', i.subtotal
          )
          ORDER BY i.created_at
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::json
      ) AS item_json
   FROM ${orders} o
   LEFT JOIN ${tables} t ON t.id = o.table_id
   LEFT JOIN ${items} i ON i.order_id = o.id AND COALESCE(i.is_void, false) = false`;

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

export async function addRestaurantOrderItem(
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
  const tables = restTablesTable();
  const pay = {
    discountAmount: params.discountAmount,
    taxAmount: params.taxAmount,
    paymentMethod: params.paymentMethod,
  };

  await closeRestaurantOrder(params.orderId, pay);
  for (const linkedId of params.linkedOrderIds || []) {
    try {
      await closeRestaurantOrder(linkedId, { paymentMethod: params.paymentMethod });
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
