import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPost } from './postgrestClient';
import { firmNr, newUuid, productsTable } from './erpTables';
import { shouldUseLiveData, getNetworkPolicy } from '../offline/policy';
import { getCachedProducts, saveProductsSnapshot } from '../offline/snapshotCache';
import {
  shouldPreferPostgrest,
  shouldUseBridgeSql,
  useConfigStore,
} from '../store/configStore';

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
  /** Ürün kartı KDV % (yoksa 20) */
  vat_rate: number;
};

export type ProductInput = {
  code?: string;
  barcode?: string;
  name: string;
  unit?: string;
  price?: number;
  cost?: number;
  stock?: number;
  min_stock?: number | null;
  brand?: string;
  category_code?: string;
  /** KDV % — yoksa DB default / 20 */
  vat_rate?: number;
};

const LIST_COLS = `id, code, barcode, name, unit,
  COALESCE(price, 0)::float8 AS price,
  COALESCE(cost, 0)::float8 AS cost,
  COALESCE(stock, 0)::float8 AS stock,
  min_stock, brand, category_code,
  COALESCE(is_active, true) AS is_active,
  COALESCE(vat_rate, vatrate, 20)::float8 AS vat_rate`;

const LIST_COLS_FALLBACK = `id, code, barcode, name, unit,
  COALESCE(price, 0)::float8 AS price,
  COALESCE(cost, 0)::float8 AS cost,
  COALESCE(stock, 0)::float8 AS stock,
  min_stock, brand, category_code,
  COALESCE(is_active, true) AS is_active,
  20::float8 AS vat_rate`;

const REST_SELECT =
  'id,code,barcode,name,unit,price,cost,stock,min_stock,brand,category_code,is_active,vat_rate';

function mapProductRow(r: Record<string, unknown>): ProductRow {
  const vat = Number(r.vat_rate);
  return {
    id: String(r.id ?? ''),
    code: r.code != null ? String(r.code) : null,
    barcode: r.barcode != null ? String(r.barcode) : null,
    name: String(r.name ?? ''),
    unit: r.unit != null ? String(r.unit) : null,
    price: Number(r.price) || 0,
    cost: Number(r.cost) || 0,
    stock: Number(r.stock) || 0,
    min_stock: r.min_stock == null ? null : Number(r.min_stock),
    brand: r.brand != null ? String(r.brand) : null,
    category_code: r.category_code != null ? String(r.category_code) : null,
    is_active: !(r.is_active === false || r.is_active === 0 || String(r.is_active).toLowerCase() === 'false'),
    vat_rate: vat >= 0 ? vat : 20,
  };
}

/** PostgREST filtre metninde özel karakterleri kaçır */
function escapeIlike(q: string): string {
  return q.replace(/[%_*(),]/g, '');
}

async function fetchProductsViaPostgrest(search = '', limit = 200): Promise<ProductRow[]> {
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
  const list = (Array.isArray(rows) ? rows : [])
    .map(mapProductRow)
    .filter((r) => r.is_active && r.id);
  return list;
}

async function selectProducts(
  cols: string,
  whereSql: string,
  params: unknown[],
): Promise<ProductRow[]> {
  const table = productsTable();
  try {
    const res = await pgQuery<ProductRow>(
      `SELECT ${cols} FROM ${table} WHERE ${whereSql}`,
      params,
    );
    return res.rows.map((r) => ({
      ...r,
      vat_rate: Number(r.vat_rate) >= 0 ? Number(r.vat_rate) : 20,
    }));
  } catch {
    if (cols === LIST_COLS_FALLBACK) throw new Error('Ürün listesi okunamadı');
    return selectProducts(LIST_COLS_FALLBACK, whereSql, params);
  }
}

async function fetchProductsLiveBridge(search = '', limit = 200): Promise<ProductRow[]> {
  const fn = firmNr();
  const q = search.trim();

  if (q.length >= 1) {
    const like = `%${q}%`;
    return selectProducts(
      LIST_COLS,
      `COALESCE(is_active, true) = true
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
  }

  return selectProducts(
    LIST_COLS,
    `COALESCE(is_active, true) = true
       AND (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
     ORDER BY name ASC
     LIMIT $3`,
    [fn, fn.replace(/^0+/, '') || fn, limit],
  );
}

async function fetchProductsLive(search = '', limit = 200): Promise<ProductRow[]> {
  const cfg = useConfigStore.getState().config;
  const preferRest = shouldPreferPostgrest(cfg);
  const canBridge = shouldUseBridgeSql(cfg);

  if (preferRest) {
    try {
      const rows = await fetchProductsViaPostgrest(search, limit);
      if (!search.trim()) await saveProductsSnapshot(rows);
      return rows;
    } catch (e) {
      if (!canBridge) throw e;
      // hybrid: PostgREST başarısız → bridge
    }
  }

  if (!canBridge) {
    throw new Error(
      preferRest
        ? 'PostgREST okuma başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }

  const rows = await fetchProductsLiveBridge(search, limit);
  if (!search.trim()) await saveProductsSnapshot(rows);
  return rows;
}

export async function fetchProducts(search = '', limit = 200): Promise<ProductRow[]> {
  if (!shouldUseLiveData()) {
    return (await getCachedProducts(search, limit)).map((r) => ({
      ...r,
      vat_rate: r.vat_rate ?? 20,
    }));
  }
  try {
    return await fetchProductsLive(search, limit);
  } catch (e) {
    // Hybrid: bridge/net hatasında son snapshot; Online politikada cache yok
    if (getNetworkPolicy() === 'online') throw e;
    const cached = await getCachedProducts(search, limit);
    if (cached.length > 0) {
      return cached.map((r) => ({ ...r, vat_rate: r.vat_rate ?? 20 }));
    }
    throw e;
  }
}

export async function fetchProductByBarcode(barcode: string): Promise<ProductRow | null> {
  const code = barcode.trim();
  if (!code) return null;

  if (!shouldUseLiveData()) {
    const rows = await getCachedProducts(code, 50);
    const hit =
      rows.find((r) => r.barcode === code || r.code === code) ?? rows[0] ?? null;
    return hit ? { ...hit, vat_rate: hit.vat_rate ?? 20 } : null;
  }

  const cfg = useConfigStore.getState().config;
  if (shouldPreferPostgrest(cfg)) {
    try {
      const table = productsTable();
      const rows = await postgrestGet<Record<string, unknown>[]>(
        `/${table}`,
        {
          select: REST_SELECT,
          or: `(barcode.eq.${code},code.eq.${code})`,
          is_active: 'eq.true',
          limit: 1,
        },
        { schema: 'public' },
      );
      const list = (Array.isArray(rows) ? rows : []).map(mapProductRow).filter((r) => r.id);
      if (list[0]) return list[0];
    } catch (e) {
      if (!shouldUseBridgeSql(cfg)) {
        const rows = await getCachedProducts(code, 50);
        const hit = rows.find((r) => r.barcode === code || r.code === code);
        if (hit) return { ...hit, vat_rate: hit.vat_rate ?? 20 };
        throw e;
      }
    }
  }

  try {
    const rows = await selectProducts(
      LIST_COLS,
      `COALESCE(is_active, true) = true
         AND (barcode = $1 OR code = $1)
       LIMIT 1`,
      [code],
    );
    return rows[0] ?? null;
  } catch {
    const rows = await getCachedProducts(code, 50);
    const hit = rows.find((r) => r.barcode === code || r.code === code);
    return hit ? { ...hit, vat_rate: hit.vat_rate ?? 20 } : null;
  }
}

export async function fetchProductById(id: string): Promise<ProductRow | null> {
  if (!id) return null;

  if (!shouldUseLiveData()) {
    const rows = await getCachedProducts('', 500);
    const hit = rows.find((r) => String(r.id) === String(id));
    return hit ? { ...hit, vat_rate: hit.vat_rate ?? 20 } : null;
  }

  const cfg = useConfigStore.getState().config;
  if (shouldPreferPostgrest(cfg)) {
    try {
      const table = productsTable();
      const rows = await postgrestGet<Record<string, unknown>[]>(
        `/${table}`,
        {
          select: REST_SELECT,
          id: `eq.${id}`,
          limit: 1,
        },
        { schema: 'public' },
      );
      const list = (Array.isArray(rows) ? rows : []).map(mapProductRow).filter((r) => r.id);
      if (list[0]) return list[0];
    } catch (e) {
      if (!shouldUseBridgeSql(cfg)) {
        const rows = await getCachedProducts('', 500);
        const hit = rows.find((r) => String(r.id) === String(id));
        if (hit) return { ...hit, vat_rate: hit.vat_rate ?? 20 };
        throw e;
      }
    }
  }

  try {
    const rows = await selectProducts(LIST_COLS, `id::text = $1 LIMIT 1`, [id]);
    return rows[0] ?? null;
  } catch {
    const rows = await getCachedProducts('', 500);
    const hit = rows.find((r) => String(r.id) === String(id));
    return hit ? { ...hit, vat_rate: hit.vat_rate ?? 20 } : null;
  }
}

/** Basit kod üretimi — P001, P002… */
export async function generateProductCode(): Promise<string> {
  const table = productsTable();
  const fn = firmNr();
  try {
    const res = await pgQuery<{ code: string | null }>(
      `SELECT code FROM ${table}
       WHERE (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
       AND code ~ '^P[0-9]+$'
       ORDER BY code DESC
       LIMIT 1`,
      [fn, fn.replace(/^0+/, '') || fn],
    );
    const last = res.rows[0]?.code;
    if (!last) return 'P001';
    const num = parseInt(String(last).slice(1), 10);
    if (Number.isNaN(num)) return 'P001';
    return `P${String(num + 1).padStart(3, '0')}`;
  } catch {
    return `P${Date.now().toString().slice(-3)}`;
  }
}

function normalizeVatRate(input: ProductInput): number {
  const v = Number(input.vat_rate);
  if (!Number.isFinite(v) || v < 0) return 20;
  return Math.min(100, v);
}

async function createProductViaPostgrest(input: ProductInput, id: string): Promise<string> {
  const table = productsTable();
  const fn = firmNr();
  const code = (input.code || '').trim() || (await generateProductCode());
  const name = input.name.trim();
  if (!name) throw new Error('Ürün adı zorunlu');

  const price = Math.max(0, Number(input.price) || 0);
  const cost = Math.max(0, Number(input.cost) || 0);
  const stock = Number(input.stock) || 0;
  const unit = (input.unit || 'AD').trim() || 'AD';
  const vatRate = normalizeVatRate(input);
  const minStock =
    input.min_stock === undefined || input.min_stock === null
      ? null
      : Number(input.min_stock);

  const body: Record<string, unknown> = {
    id,
    firm_nr: fn,
    code,
    barcode: input.barcode?.trim() || null,
    name,
    unit,
    price,
    cost,
    stock,
    min_stock: minStock,
    brand: input.brand?.trim() || null,
    category_code: input.category_code?.trim() || null,
    is_active: true,
    vat_rate: vatRate,
    price_list_1: price,
  };

  try {
    const rows = await postgrestPost<Record<string, unknown>[]>(`/${table}`, body, {
      schema: 'public',
      prefer: 'return=representation',
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row?.id != null ? String(row.id) : id;
  } catch (e) {
    // Bazı kiracılarda price_list_1 / vat_rate yok — sade gövde dene
    const slim = { ...body };
    delete slim.price_list_1;
    delete slim.vat_rate;
    delete slim.min_stock;
    delete slim.brand;
    delete slim.category_code;
    const rows = await postgrestPost<Record<string, unknown>[]>(`/${table}`, slim, {
      schema: 'public',
      prefer: 'return=representation',
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row?.id != null) return String(row.id);
    throw e;
  }
}

async function createProductViaBridge(input: ProductInput, id: string): Promise<string> {
  const table = productsTable();
  const fn = firmNr();
  const code = (input.code || '').trim() || (await generateProductCode());
  const name = input.name.trim();
  if (!name) throw new Error('Ürün adı zorunlu');

  const price = Math.max(0, Number(input.price) || 0);
  const cost = Math.max(0, Number(input.cost) || 0);
  const stock = Number(input.stock) || 0;
  const unit = (input.unit || 'AD').trim() || 'AD';
  const barcode = input.barcode?.trim() || null;
  const brand = input.brand?.trim() || null;
  const category = input.category_code?.trim() || null;
  const vatRate = normalizeVatRate(input);
  const minStock =
    input.min_stock === undefined || input.min_stock === null
      ? null
      : Number(input.min_stock);

  const attempts: { sql: string; params: unknown[] }[] = [
    {
      sql: `INSERT INTO ${table} (
         id, firm_nr, code, barcode, name, unit, price, cost, stock, min_stock,
         brand, category_code, is_active, price_list_1, vat_rate
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, true, $7, $13
       )`,
      params: [
        id,
        fn,
        code,
        barcode,
        name,
        unit,
        price,
        cost,
        stock,
        minStock,
        brand,
        category,
        vatRate,
      ],
    },
    {
      sql: `INSERT INTO ${table} (
         id, firm_nr, code, barcode, name, unit, price, cost, stock, min_stock,
         brand, category_code, is_active, price_list_1
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, true, $7
       )`,
      params: [id, fn, code, barcode, name, unit, price, cost, stock, minStock, brand, category],
    },
    {
      sql: `INSERT INTO ${table} (
         id, firm_nr, code, barcode, name, unit, price, cost, stock, min_stock,
         brand, category_code, is_active
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, true
       )`,
      params: [id, fn, code, barcode, name, unit, price, cost, stock, minStock, brand, category],
    },
    {
      sql: `INSERT INTO ${table} (
         id, firm_nr, code, barcode, name, unit, price, cost, stock, is_active
       ) VALUES (
         $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, true
       )`,
      params: [id, fn, code, barcode, name, unit, price, cost, stock],
    },
  ];

  let lastErr: unknown;
  for (const a of attempts) {
    try {
      await pgQuery(a.sql, a.params);
      return id;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Basit ürün oluştur (web ProductAPI.create alt kümesi) — PostgREST veya bridge */
export async function createProduct(input: ProductInput): Promise<string> {
  if (!shouldUseLiveData()) {
    throw new Error('Çevrimdışı: ürün oluşturma için canlı bağlantı gerekir');
  }
  const id = newUuid();
  const name = input.name.trim();
  if (!name) throw new Error('Ürün adı zorunlu');

  const cfg = useConfigStore.getState().config;
  const preferRest = shouldPreferPostgrest(cfg);
  const canBridge = shouldUseBridgeSql(cfg);

  if (preferRest) {
    try {
      return await createProductViaPostgrest(input, id);
    } catch (e) {
      if (!canBridge) throw e;
    }
  }

  if (!canBridge) {
    throw new Error(
      preferRest
        ? 'PostgREST ürün kaydı başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }

  return createProductViaBridge(input, id);
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<void> {
  if (!id) throw new Error('Ürün id gerekli');
  if (!shouldUseLiveData()) {
    throw new Error('Çevrimdışı: ürün güncelleme için canlı bağlantı gerekir');
  }
  const table = productsTable();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  const push = (col: string, v: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  };

  if (input.code !== undefined) push('code', input.code.trim() || null);
  if (input.barcode !== undefined) push('barcode', input.barcode.trim() || null);
  if (input.name !== undefined) push('name', input.name.trim());
  if (input.unit !== undefined) push('unit', input.unit.trim() || null);
  if (input.price !== undefined) push('price', Math.max(0, Number(input.price) || 0));
  if (input.cost !== undefined) push('cost', Math.max(0, Number(input.cost) || 0));
  if (input.stock !== undefined) push('stock', Number(input.stock) || 0);
  if (input.min_stock !== undefined) {
    push(
      'min_stock',
      input.min_stock === null || Number.isNaN(Number(input.min_stock))
        ? null
        : Number(input.min_stock),
    );
  }
  if (input.brand !== undefined) push('brand', input.brand.trim() || null);
  if (input.category_code !== undefined) push('category_code', input.category_code.trim() || null);

  if (!sets.length) return;
  vals.push(id);
  await pgQuery(`UPDATE ${table} SET ${sets.join(', ')} WHERE id::text = $${i}`, vals);
}
