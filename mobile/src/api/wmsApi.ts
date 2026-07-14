import { pgQuery } from './pgClient';
import { firmNr, productsTable } from './erpTables';

export type WmsStockRow = {
  id: string;
  code: string | null;
  name: string;
  stock: number;
  min_stock: number | null;
  max_stock: number | null;
  unit: string | null;
  warehouse: string | null;
};

export async function fetchWmsStock(search = '', limit = 150): Promise<WmsStockRow[]> {
  const table = productsTable();
  const q = search.trim();
  const like = `%${q}%`;

  const sql = q
    ? `SELECT id, code, name,
              COALESCE(stock, 0)::float8 AS stock,
              min_stock, max_stock, unit,
              COALESCE(category_code, brand) AS warehouse
       FROM ${table}
       WHERE COALESCE(is_active, true) = true
         AND (name ILIKE $1 OR code ILIKE $1 OR barcode ILIKE $1)
       ORDER BY name ASC
       LIMIT $2`
    : `SELECT id, code, name,
              COALESCE(stock, 0)::float8 AS stock,
              min_stock, max_stock, unit,
              COALESCE(category_code, brand) AS warehouse
       FROM ${table}
       WHERE COALESCE(is_active, true) = true
       ORDER BY COALESCE(stock, 0) ASC, name ASC
       LIMIT $1`;

  const res = await pgQuery<WmsStockRow>(sql, q ? [like, limit] : [limit]);
  return res.rows;
}

export type WmsCountSummary = {
  productCount: number;
  belowMin: number;
  zeroStock: number;
  totalStockValue: number;
};

export async function fetchWmsSummary(): Promise<WmsCountSummary> {
  const table = productsTable();
  const fn = firmNr();
  try {
    const res = await pgQuery<{
      product_count: string | number;
      below_min: string | number;
      zero_stock: string | number;
      total_value: string | number;
    }>(
      `SELECT
         COUNT(*)::int AS product_count,
         COUNT(*) FILTER (WHERE min_stock IS NOT NULL AND COALESCE(stock,0) < min_stock)::int AS below_min,
         COUNT(*) FILTER (WHERE COALESCE(stock,0) <= 0)::int AS zero_stock,
         COALESCE(SUM(COALESCE(stock,0) * COALESCE(cost, price, 0)), 0)::float8 AS total_value
       FROM ${table}
       WHERE COALESCE(is_active, true) = true
         AND (
           LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
           OR firm_nr IS NULL
         )`,
      [fn],
    );
    const r = res.rows[0];
    return {
      productCount: Number(r?.product_count ?? 0),
      belowMin: Number(r?.below_min ?? 0),
      zeroStock: Number(r?.zero_stock ?? 0),
      totalStockValue: Number(r?.total_value ?? 0),
    };
  } catch {
    return { productCount: 0, belowMin: 0, zeroStock: 0, totalStockValue: 0 };
  }
}
