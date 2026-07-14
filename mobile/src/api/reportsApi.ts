import { pgQuery } from './pgClient';
import { firmNr, periodNr, productsTable, salesTable } from './erpTables';

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
