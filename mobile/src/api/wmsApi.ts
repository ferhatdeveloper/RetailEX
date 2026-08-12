import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
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

const REST_STOCK_SELECT =
  'id,code,name,stock,min_stock,max_stock,unit,category_code,brand,is_active';

function mapWmsStockRow(r: Record<string, unknown>): WmsStockRow {
  return {
    id: String(r.id ?? ''),
    code: r.code != null ? String(r.code) : null,
    name: String(r.name ?? ''),
    stock: Number(r.stock) || 0,
    min_stock: r.min_stock == null ? null : Number(r.min_stock),
    max_stock: r.max_stock == null ? null : Number(r.max_stock),
    unit: r.unit != null ? String(r.unit) : null,
    warehouse:
      r.category_code != null
        ? String(r.category_code)
        : r.brand != null
          ? String(r.brand)
          : null,
  };
}

function escapeIlike(q: string): string {
  return q.replace(/[%_*(),]/g, '');
}

async function fetchWmsStockViaRest(search = '', limit = 150): Promise<WmsStockRow[]> {
  const table = productsTable();
  const fn = firmNr();
  const fnBare = fn.replace(/^0+/, '') || fn;
  const firmParts = Array.from(new Set([fn, fnBare].filter(Boolean)));
  const firmOr = [...firmParts.map((f) => `firm_nr.eq.${f}`), 'firm_nr.is.null'].join(',');

  const query: Record<string, string | number> = {
    select: REST_STOCK_SELECT,
    is_active: 'eq.true',
    order: 'stock.asc,name.asc',
    limit,
    or: `(${firmOr})`,
  };

  const q = escapeIlike(search.trim());
  if (q.length >= 1) {
    query.and = `(or(${firmOr}),or(name.ilike.*${q}*,code.ilike.*${q}*,barcode.ilike.*${q}*))`;
    delete query.or;
  }

  const rows = await postgrestGet<Record<string, unknown>[]>(`/${table}`, query, {
    schema: 'public',
  });
  return (Array.isArray(rows) ? rows : []).map(mapWmsStockRow).filter((r) => r.id);
}

async function fetchWmsStockViaBridge(search = '', limit = 150): Promise<WmsStockRow[]> {
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

export async function fetchWmsStock(search = '', limit = 150): Promise<WmsStockRow[]> {
  return runDataTransport({
    label: 'fetchWmsStock',
    viaRest: () => fetchWmsStockViaRest(search, limit),
    viaBridge: () => fetchWmsStockViaBridge(search, limit),
  });
}

export type WmsCountSummary = {
  productCount: number;
  belowMin: number;
  zeroStock: number;
  totalStockValue: number;
};

async function fetchWmsSummaryViaRest(): Promise<WmsCountSummary> {
  const table = productsTable();
  const fn = firmNr();
  const fnBare = fn.replace(/^0+/, '') || fn;
  const firmParts = Array.from(new Set([fn, fnBare].filter(Boolean)));
  const firmOr = [...firmParts.map((f) => `firm_nr.eq.${f}`), 'firm_nr.is.null'].join(',');

  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select: 'stock,min_stock,cost,price',
      is_active: 'eq.true',
      or: `(${firmOr})`,
      limit: 10000,
    },
    { schema: 'public' },
  );
  const list = Array.isArray(rows) ? rows : [];
  let belowMin = 0;
  let zeroStock = 0;
  let totalStockValue = 0;
  for (const r of list) {
    const stock = Number(r.stock) || 0;
    const minStock = r.min_stock == null ? null : Number(r.min_stock);
    if (minStock != null && stock < minStock) belowMin += 1;
    if (stock <= 0) zeroStock += 1;
    const unitCost = Number(r.cost) || Number(r.price) || 0;
    totalStockValue += stock * unitCost;
  }
  return {
    productCount: list.length,
    belowMin,
    zeroStock,
    totalStockValue,
  };
}

async function fetchWmsSummaryViaBridge(): Promise<WmsCountSummary> {
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
  } catch (e) {
    rethrowTransportInfra(e, 'fetchWmsSummaryViaBridge');
    return { productCount: 0, belowMin: 0, zeroStock: 0, totalStockValue: 0 };
  }
}

export async function fetchWmsSummary(): Promise<WmsCountSummary> {
  return runDataTransport({
    label: 'fetchWmsSummary',
    viaRest: fetchWmsSummaryViaRest,
    viaBridge: fetchWmsSummaryViaBridge,
  });
}
