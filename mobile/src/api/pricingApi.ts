import { pgQuery } from './pgClient';
import { firmNr, productsTable } from './erpTables';
import { shouldUseLiveData, getNetworkPolicy } from '../offline/policy';
import { getCachedProducts } from '../offline/snapshotCache';

export type PriceListKey =
  | 'price'
  | 'purchase_price'
  | 'price_list_1'
  | 'price_list_2'
  | 'price_list_3'
  | 'price_list_4'
  | 'price_list_5'
  | 'price_list_6';

export type ProductPriceRow = {
  id: string;
  code: string | null;
  barcode: string | null;
  name: string;
  unit: string | null;
  price: number;
  purchase_price: number;
  cost: number;
  price_list_1: number;
  price_list_2: number;
  price_list_3: number;
  price_list_4: number;
  price_list_5: number;
  price_list_6: number;
};

export const PRICE_LIST_OPTIONS: { key: PriceListKey; label: string }[] = [
  { key: 'price', label: 'Perakende' },
  { key: 'price_list_1', label: 'Liste 1' },
  { key: 'price_list_2', label: 'Liste 2' },
  { key: 'price_list_3', label: 'Liste 3' },
  { key: 'price_list_4', label: 'Liste 4' },
  { key: 'price_list_5', label: 'Liste 5' },
  { key: 'price_list_6', label: 'Liste 6' },
  { key: 'purchase_price', label: 'Alış' },
];

export function getPriceValue(row: ProductPriceRow, key: PriceListKey): number {
  return Number(row[key]) || 0;
}

const FULL_COLS = `id, code, barcode, name, unit,
  COALESCE(price, 0)::float8 AS price,
  COALESCE(purchase_price, cost, 0)::float8 AS purchase_price,
  COALESCE(cost, 0)::float8 AS cost,
  COALESCE(price_list_1, 0)::float8 AS price_list_1,
  COALESCE(price_list_2, 0)::float8 AS price_list_2,
  COALESCE(price_list_3, 0)::float8 AS price_list_3,
  COALESCE(price_list_4, 0)::float8 AS price_list_4,
  COALESCE(price_list_5, 0)::float8 AS price_list_5,
  COALESCE(price_list_6, 0)::float8 AS price_list_6`;

const BASIC_COLS = `id, code, barcode, name, unit,
  COALESCE(price, 0)::float8 AS price,
  COALESCE(cost, 0)::float8 AS cost,
  COALESCE(cost, 0)::float8 AS purchase_price,
  0::float8 AS price_list_1,
  0::float8 AS price_list_2,
  0::float8 AS price_list_3,
  0::float8 AS price_list_4,
  0::float8 AS price_list_5,
  0::float8 AS price_list_6`;

const FIRM_WHERE = `(
  LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $FIRM$
  OR TRIM(COALESCE(firm_nr, '')) = $FIRM_TRIM$
  OR firm_nr IS NULL
)`;

function cachedToPriceRow(
  rows: Awaited<ReturnType<typeof getCachedProducts>>,
): ProductPriceRow[] {
  return rows.map((r) => ({
    id: String(r.id),
    code: r.code,
    barcode: r.barcode,
    name: r.name,
    unit: r.unit,
    price: r.price,
    purchase_price: r.cost,
    cost: r.cost,
    price_list_1: r.price,
    price_list_2: 0,
    price_list_3: 0,
    price_list_4: 0,
    price_list_5: 0,
    price_list_6: 0,
  }));
}

async function queryPrices(
  cols: string,
  search: string,
  limit: number,
): Promise<ProductPriceRow[]> {
  const table = productsTable();
  const fn = firmNr();
  const fnTrim = fn.replace(/^0+/, '') || fn;
  const q = search.trim();
  const firmClause = FIRM_WHERE.replace(/\$FIRM\$/g, '$2').replace(/\$FIRM_TRIM\$/g, '$3');

  if (q.length >= 1) {
    const like = `%${q}%`;
    const res = await pgQuery<ProductPriceRow>(
      `SELECT ${cols}
       FROM ${table}
       WHERE COALESCE(is_active, true) = true
         AND (
           name ILIKE $1 OR code ILIKE $1 OR barcode ILIKE $1
           OR COALESCE(brand,'') ILIKE $1
         )
         AND ${firmClause}
       ORDER BY name ASC
       LIMIT $4`,
      [like, fn, fnTrim, limit],
    );
    return res.rows;
  }

  const res = await pgQuery<ProductPriceRow>(
    `SELECT ${cols}
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND ${FIRM_WHERE.replace(/\$FIRM\$/g, '$1').replace(/\$FIRM_TRIM\$/g, '$2')}
     ORDER BY name ASC
     LIMIT $3`,
    [fn, fnTrim, limit],
  );
  return res.rows;
}

async function fetchProductPricesLive(search = '', limit = 300): Promise<ProductPriceRow[]> {
  try {
    return await queryPrices(FULL_COLS, search, limit);
  } catch {
    return queryPrices(BASIC_COLS, search, limit);
  }
}

export async function fetchProductPrices(search = '', limit = 300): Promise<ProductPriceRow[]> {
  if (!shouldUseLiveData()) {
    return cachedToPriceRow(await getCachedProducts(search, limit));
  }
  try {
    return await fetchProductPricesLive(search, limit);
  } catch (e) {
    if (getNetworkPolicy() === 'online') throw e;
    const cached = cachedToPriceRow(await getCachedProducts(search, limit));
    if (cached.length > 0) return cached;
    throw e;
  }
}
