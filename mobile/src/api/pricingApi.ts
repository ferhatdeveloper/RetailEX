import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import { firmNr, productsTable } from './erpTables';
import { shouldUseLiveData, getNetworkPolicy } from '../offline/policy';
import { getCachedProducts } from '../offline/snapshotCache';
import {
  shouldPreferPostgrest,
  shouldUseBridgeSql,
  useConfigStore,
} from '../store/configStore';

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

const REST_SELECT =
  'id,code,barcode,name,unit,price,purchase_price,cost,price_list_1,price_list_2,price_list_3,price_list_4,price_list_5,price_list_6,is_active';

const FIRM_WHERE = `(
  LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $FIRM$
  OR TRIM(COALESCE(firm_nr, '')) = $FIRM_TRIM$
  OR firm_nr IS NULL
)`;

function n0(v: unknown): number {
  return Number(v) || 0;
}

function mapPriceRow(r: Record<string, unknown>): ProductPriceRow {
  const cost = n0(r.cost);
  const purchase = r.purchase_price != null && r.purchase_price !== '' ? n0(r.purchase_price) : cost;
  return {
    id: String(r.id ?? ''),
    code: r.code != null ? String(r.code) : null,
    barcode: r.barcode != null ? String(r.barcode) : null,
    name: String(r.name ?? ''),
    unit: r.unit != null ? String(r.unit) : null,
    price: n0(r.price),
    purchase_price: purchase,
    cost,
    price_list_1: n0(r.price_list_1),
    price_list_2: n0(r.price_list_2),
    price_list_3: n0(r.price_list_3),
    price_list_4: n0(r.price_list_4),
    price_list_5: n0(r.price_list_5),
    price_list_6: n0(r.price_list_6),
  };
}

function escapeIlike(q: string): string {
  return q.replace(/[%_*(),]/g, '');
}

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

/** PostgREST — ürün fiyat kolonları */
async function fetchProductPricesViaPostgrest(
  search = '',
  limit = 300,
): Promise<ProductPriceRow[]> {
  const table = productsTable();
  const fn = firmNr();
  const fnBare = fn.replace(/^0+/, '') || fn;
  const firmParts = Array.from(new Set([fn, fnBare].filter(Boolean)));
  const firmOr = [
    ...firmParts.map((f) => `firm_nr.eq.${f}`),
    'firm_nr.is.null',
  ].join(',');

  const query: Record<string, string | number> = {
    select: REST_SELECT,
    is_active: 'eq.true',
    order: 'name.asc',
    limit,
    or: `(${firmOr})`,
  };

  const q = escapeIlike(search.trim());
  if (q.length >= 1) {
    query.and = `(or(${firmOr}),or(name.ilike.*${q}*,code.ilike.*${q}*,barcode.ilike.*${q}*,brand.ilike.*${q}*))`;
    delete query.or;
  }

  const rows = await postgrestGet<Record<string, unknown>[]>(`/${table}`, query, {
    schema: 'public',
  });
  return (Array.isArray(rows) ? rows : [])
    .map(mapPriceRow)
    .filter((r) => r.id);
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
    return res.rows.map((r) => mapPriceRow(r as unknown as Record<string, unknown>));
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
  return res.rows.map((r) => mapPriceRow(r as unknown as Record<string, unknown>));
}

async function fetchProductPricesLiveBridge(
  search = '',
  limit = 300,
): Promise<ProductPriceRow[]> {
  try {
    return await queryPrices(FULL_COLS, search, limit);
  } catch {
    return queryPrices(BASIC_COLS, search, limit);
  }
}

async function fetchProductPricesLive(search = '', limit = 300): Promise<ProductPriceRow[]> {
  const cfg = useConfigStore.getState().config;
  const preferRest = shouldPreferPostgrest(cfg);
  const canBridge = shouldUseBridgeSql(cfg);

  if (preferRest) {
    try {
      return await fetchProductPricesViaPostgrest(search, limit);
    } catch (e) {
      if (!canBridge) throw e;
      // hybrid: PostgREST başarısız → bridge
    }
  }

  if (!canBridge) {
    throw new Error(
      preferRest
        ? 'PostgREST fiyat okuma başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }

  return fetchProductPricesLiveBridge(search, limit);
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
