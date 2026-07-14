import { pgQuery } from './pgClient';

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
  table_name: string | null;
  status: string | null;
  total_amount: number;
  waiter: string | null;
  created_at: string | null;
};

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
  return tryQueries<RestTable>([
    {
      sql: `SELECT id,
              COALESCE(name, code, id::text) AS name,
              status, waiter,
              COALESCE(total, 0)::float8 AS total,
              floor_id::text AS floor_id
       FROM rest_tables
       ORDER BY name ASC
       LIMIT 200`,
    },
    {
      sql: `SELECT id,
              COALESCE(name, code, id::text) AS name,
              status, waiter,
              COALESCE(total, 0)::float8 AS total,
              floor_id::text AS floor_id
       FROM rest.rest_tables
       ORDER BY name ASC
       LIMIT 200`,
    },
  ]);
}

export async function fetchOpenOrders(limit = 50): Promise<RestOrder[]> {
  return tryQueries<RestOrder>([
    {
      sql: `SELECT o.id, o.order_no,
              COALESCE(t.name, o.table_id::text) AS table_name,
              o.status,
              COALESCE(o.total_amount, 0)::float8 AS total_amount,
              o.waiter,
              o.created_at::text AS created_at
       FROM rest_orders o
       LEFT JOIN rest_tables t ON t.id = o.table_id
       WHERE o.status IS DISTINCT FROM 'closed'
         AND o.status IS DISTINCT FROM 'cancelled'
       ORDER BY o.created_at DESC NULLS LAST
       LIMIT $1`,
      params: [limit],
    },
  ]);
}
