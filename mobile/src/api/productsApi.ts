import { pgQuery } from './pgClient';
import { firmNr, productsTable } from './erpTables';

export type ProductRow = {
  id: string;
  code: string | null;
  barcode: string | null;
  name: string;
  unit: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number | null;
  brand: string | null;
  category_code: string | null;
  is_active: boolean;
};

const LIST_COLS = `id, code, barcode, name, unit,
  COALESCE(price, 0)::float8 AS price,
  COALESCE(cost, 0)::float8 AS cost,
  COALESCE(stock, 0)::float8 AS stock,
  min_stock, brand, category_code,
  COALESCE(is_active, true) AS is_active`;

export async function fetchProducts(search = '', limit = 200): Promise<ProductRow[]> {
  const table = productsTable();
  const fn = firmNr();
  const q = search.trim();

  if (q.length >= 1) {
    const like = `%${q}%`;
    const res = await pgQuery<ProductRow>(
      `SELECT ${LIST_COLS}
       FROM ${table}
       WHERE COALESCE(is_active, true) = true
         AND (
           name ILIKE $1 OR code ILIKE $1 OR barcode ILIKE $1
           OR COALESCE(brand,'') ILIKE $1
         )
         AND (
           LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $2
           OR TRIM(COALESCE(firm_nr, '')) = $3
           OR firm_nr IS NULL
         )
       ORDER BY name ASC
       LIMIT $4`,
      [like, fn, fn.replace(/^0+/, '') || fn, limit],
    );
    return res.rows;
  }

  const res = await pgQuery<ProductRow>(
    `SELECT ${LIST_COLS}
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
     ORDER BY name ASC
     LIMIT $3`,
    [fn, fn.replace(/^0+/, '') || fn, limit],
  );
  return res.rows;
}

export async function fetchProductByBarcode(barcode: string): Promise<ProductRow | null> {
  const table = productsTable();
  const code = barcode.trim();
  if (!code) return null;
  const res = await pgQuery<ProductRow>(
    `SELECT ${LIST_COLS}
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND (barcode = $1 OR code = $1)
     LIMIT 1`,
    [code],
  );
  return res.rows[0] ?? null;
}

export async function fetchProductById(id: string): Promise<ProductRow | null> {
  if (!id) return null;
  const table = productsTable();
  const res = await pgQuery<ProductRow>(
    `SELECT ${LIST_COLS}
     FROM ${table}
     WHERE id::text = $1
     LIMIT 1`,
    [id],
  );
  return res.rows[0] ?? null;
}
