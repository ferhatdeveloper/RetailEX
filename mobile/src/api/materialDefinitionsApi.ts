import { pgQuery } from './pgClient';
import {
  brandsTable,
  categoriesTable,
  firmNr,
  newUuid,
  productGroupsTable,
  productVariantsTable,
  productsTable,
  specialCodesTable,
  unitsetLinesTable,
  unitsetsTable,
  variantsTable,
} from './erpTables';

export type DefinitionRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_restaurant?: boolean;
};

export type UnitSetRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  line_count: number;
};

export type DefinitionInput = {
  code: string;
  name: string;
  description?: string;
  is_restaurant?: boolean;
};

export type UnitSetInput = {
  code: string;
  name: string;
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

export async function fetchBrands(limit = 200): Promise<DefinitionRow[]> {
  const table = brandsTable();
  return tryQueries<DefinitionRow>([
    {
      sql: `SELECT id::text AS id, code, name, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchCategories(limit = 200): Promise<DefinitionRow[]> {
  const table = categoriesTable();
  return tryQueries<DefinitionRow>([
    {
      sql: `SELECT id::text AS id, code, name, description,
                   COALESCE(is_active, true) AS is_active,
                   COALESCE(is_restaurant, false) AS is_restaurant
            FROM ${table}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchUnitSets(limit = 100): Promise<UnitSetRow[]> {
  const header = unitsetsTable();
  const lines = unitsetLinesTable();
  return tryQueries<UnitSetRow>([
    {
      sql: `SELECT u.id::text AS id, u.code, u.name,
                   COALESCE(u.is_active, true) AS is_active,
                   COALESCE(lc.cnt, 0)::int AS line_count
            FROM ${header} u
            LEFT JOIN (
              SELECT unitset_id, COUNT(*)::int AS cnt
              FROM ${lines}
              GROUP BY unitset_id
            ) lc ON lc.unitset_id = u.id
            ORDER BY u.code ASC NULLS LAST, u.name ASC
            LIMIT $1`,
      params: [limit],
    },
    {
      sql: `SELECT id::text AS id, code, name,
                   COALESCE(is_active, true) AS is_active,
                   0::int AS line_count
            FROM ${header}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function createBrand(input: DefinitionInput): Promise<string> {
  const table = brandsTable();
  const id = newUuid();
  await pgQuery(
    `INSERT INTO ${table} (id, code, name, description, is_active)
     VALUES ($1, $2, $3, $4, true)`,
    [id, input.code.trim(), input.name.trim(), input.description?.trim() || null],
  );
  return id;
}

export async function createCategory(input: DefinitionInput): Promise<string> {
  const table = categoriesTable();
  const id = newUuid();
  await pgQuery(
    `INSERT INTO ${table} (id, code, name, description, is_restaurant, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [
      id,
      input.code.trim(),
      input.name.trim(),
      input.description?.trim() || null,
      Boolean(input.is_restaurant),
    ],
  );
  return id;
}

export async function createUnitSet(input: UnitSetInput): Promise<string> {
  const table = unitsetsTable();
  const id = newUuid();
  await pgQuery(
    `INSERT INTO ${table} (id, code, name, is_active)
     VALUES ($1, $2, $3, true)`,
    [id, input.code.trim(), input.name.trim()],
  );
  return id;
}

export type ProductVariantRow = {
  id: string;
  sku: string;
  product_id: string;
  product_name: string | null;
  attributes: string;
};

export async function fetchSpecialCodes(limit = 200): Promise<DefinitionRow[]> {
  const table = specialCodesTable();
  return tryQueries<DefinitionRow>([
    {
      sql: `SELECT id::text AS id, COALESCE(code, '') AS code, name,
                   description, COALESCE(is_active, true) AS is_active
            FROM ${table}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchGroupCodes(limit = 200): Promise<DefinitionRow[]> {
  const table = productGroupsTable();
  return tryQueries<DefinitionRow>([
    {
      sql: `SELECT id::text AS id, code, name, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

/** Önce tanım tablosu, yoksa ürün varyant SKU listesi */
export async function fetchVariants(limit = 200): Promise<DefinitionRow[]> {
  const defTable = variantsTable();
  const defs = await tryQueries<DefinitionRow>([
    {
      sql: `SELECT id::text AS id, code, name, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${defTable}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
  if (defs.length > 0) return defs;

  const pv = productVariantsTable();
  const pt = productsTable();
  const rows = await tryQueries<{
    id: string;
    sku: string;
    product_name: string | null;
    attributes: unknown;
  }>([
    {
      sql: `SELECT v.id::text AS id, COALESCE(v.sku, '') AS sku,
                   p.name AS product_name, v.attributes
            FROM ${pv} v
            LEFT JOIN ${pt} p ON p.id = v.product_id
            ORDER BY v.sku ASC NULLS LAST
            LIMIT $1`,
      params: [limit],
    },
    {
      sql: `SELECT id::text AS id, COALESCE(sku, '') AS sku,
                   NULL::text AS product_name, attributes
            FROM ${pv}
            ORDER BY sku ASC NULLS LAST
            LIMIT $1`,
      params: [limit],
    },
  ]);
  return rows.map((r) => ({
    id: r.id,
    code: r.sku || r.id.slice(0, 8),
    name: r.product_name || r.sku || 'Varyant',
    description:
      typeof r.attributes === 'string'
        ? r.attributes
        : r.attributes
          ? JSON.stringify(r.attributes)
          : null,
    is_active: true,
  }));
}

export async function createSpecialCode(input: DefinitionInput): Promise<string> {
  const table = specialCodesTable();
  const id = newUuid();
  await pgQuery(
    `INSERT INTO ${table} (id, code, name, description, is_active)
     VALUES ($1, $2, $3, $4, true)`,
    [id, input.code.trim(), input.name.trim(), input.description?.trim() || null],
  );
  return id;
}

export async function createGroupCode(input: DefinitionInput): Promise<string> {
  const table = productGroupsTable();
  const id = newUuid();
  await pgQuery(
    `INSERT INTO ${table} (id, code, name, description, is_active)
     VALUES ($1, $2, $3, $4, true)`,
    [id, input.code.trim(), input.name.trim(), input.description?.trim() || null],
  );
  return id;
}

export async function createVariantDefinition(input: DefinitionInput): Promise<string> {
  const table = variantsTable();
  const id = newUuid();
  try {
    await pgQuery(
      `INSERT INTO ${table} (id, code, name, description, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [id, input.code.trim(), input.name.trim(), input.description?.trim() || null],
    );
    return id;
  } catch {
    /* tanım tablosu yoksa ürün varyantı olarak kaydet (product_id null olabilir) */
  }
  const pv = productVariantsTable();
  const attrs = JSON.stringify({
    name: input.name.trim(),
    description: input.description?.trim() || null,
  });
  await pgQuery(
    `INSERT INTO ${pv} (id, product_id, sku, attributes)
     VALUES ($1, NULL, $2, $3::jsonb)`,
    [id, input.code.trim(), attrs],
  );
  return id;
}

export async function generateDefinitionCode(
  kind: 'brand' | 'category' | 'unitset' | 'special' | 'group' | 'variant',
): Promise<string> {
  const fn = firmNr();
  const prefixMap: Record<typeof kind, string> = {
    brand: 'MRK',
    category: 'KTG',
    unitset: 'BS',
    special: 'OZ',
    group: 'GRP',
    variant: 'VAR',
  };
  const prefix = prefixMap[kind];
  const table =
    kind === 'brand'
      ? brandsTable(fn)
      : kind === 'category'
        ? categoriesTable(fn)
        : kind === 'unitset'
          ? unitsetsTable(fn)
          : kind === 'special'
            ? specialCodesTable(fn)
            : kind === 'group'
              ? productGroupsTable()
              : variantsTable(fn);
  try {
    const res = await pgQuery<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE code LIKE $1`,
      [`${prefix}-%`],
    );
    const n = (res.rows[0]?.n ?? 0) + 1;
    return `${prefix}-${String(n).padStart(3, '0')}`;
  } catch {
    return `${prefix}-001`;
  }
}
