import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
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
    } catch (e) {
      rethrowTransportInfra(e, 'materialDefinitions.tryQueries');
      /* next */
    }
  }
  return [];
}

function mapDefinitionRow(r: Record<string, unknown>): DefinitionRow {
  return {
    id: String(r.id ?? ''),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    description: r.description != null ? String(r.description) : null,
    is_active: !(
      r.is_active === false ||
      r.is_active === 0 ||
      String(r.is_active).toLowerCase() === 'false'
    ),
    is_restaurant:
      r.is_restaurant === true ||
      r.is_restaurant === 1 ||
      String(r.is_restaurant).toLowerCase() === 'true',
  };
}

async function fetchDefinitionsViaRest(
  table: string,
  limit: number,
  extraSelect = '',
): Promise<DefinitionRow[]> {
  const select = extraSelect
    ? `id,code,name,description,is_active,${extraSelect}`
    : 'id,code,name,description,is_active';
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    { select, order: 'code.asc', limit },
    { schema: 'public' },
  );
  return (Array.isArray(rows) ? rows : [])
    .map(mapDefinitionRow)
    .filter((r) => r.id);
}

export async function fetchBrands(limit = 200): Promise<DefinitionRow[]> {
  const table = brandsTable();
  return runDataTransport({
    label: 'fetchBrands',
    viaRest: () => fetchDefinitionsViaRest(table, limit),
    viaBridge: () =>
      tryQueries<DefinitionRow>([
        {
          sql: `SELECT id::text AS id, code, name, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
          params: [limit],
        },
      ]),
  });
}

export async function fetchCategories(limit = 200): Promise<DefinitionRow[]> {
  const table = categoriesTable();
  return runDataTransport({
    label: 'fetchCategories',
    viaRest: () => fetchDefinitionsViaRest(table, limit, 'is_restaurant'),
    viaBridge: () =>
      tryQueries<DefinitionRow>([
        {
          sql: `SELECT id::text AS id, code, name, description,
                   COALESCE(is_active, true) AS is_active,
                   COALESCE(is_restaurant, false) AS is_restaurant
            FROM ${table}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
          params: [limit],
        },
      ]),
  });
}

export async function fetchUnitSets(limit = 100): Promise<UnitSetRow[]> {
  const header = unitsetsTable();
  const lines = unitsetLinesTable();
  return runDataTransport({
    label: 'fetchUnitSets',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        `/${header}`,
        { select: 'id,code,name,is_active', order: 'code.asc', limit },
        { schema: 'public' },
      );
      return (Array.isArray(rows) ? rows : [])
        .filter((r) => r.id)
        .map((r) => ({
          id: String(r.id),
          code: String(r.code ?? ''),
          name: String(r.name ?? ''),
          is_active: !(
            r.is_active === false ||
            r.is_active === 0 ||
            String(r.is_active).toLowerCase() === 'false'
          ),
          line_count: 0,
        }));
    },
    viaBridge: () =>
      tryQueries<UnitSetRow>([
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
      ]),
  });
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
  return runDataTransport({
    label: 'fetchSpecialCodes',
    viaRest: () => fetchDefinitionsViaRest(table, limit),
    viaBridge: () =>
      tryQueries<DefinitionRow>([
        {
          sql: `SELECT id::text AS id, COALESCE(code, '') AS code, name,
                   description, COALESCE(is_active, true) AS is_active
            FROM ${table}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
          params: [limit],
        },
      ]),
  });
}

export async function fetchGroupCodes(limit = 200): Promise<DefinitionRow[]> {
  const table = productGroupsTable();
  return runDataTransport({
    label: 'fetchGroupCodes',
    viaRest: () => fetchDefinitionsViaRest(table, limit),
    viaBridge: () =>
      tryQueries<DefinitionRow>([
        {
          sql: `SELECT id::text AS id, code, name, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
          params: [limit],
        },
      ]),
  });
}

/** Önce tanım tablosu, yoksa ürün varyant SKU listesi */
export async function fetchVariants(limit = 200): Promise<DefinitionRow[]> {
  const defTable = variantsTable();
  try {
    const defs = await runDataTransport({
      label: 'fetchVariants.defs',
      viaRest: () => fetchDefinitionsViaRest(defTable, limit),
      viaBridge: () =>
        tryQueries<DefinitionRow>([
          {
            sql: `SELECT id::text AS id, code, name, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${defTable}
            ORDER BY code ASC NULLS LAST, name ASC
            LIMIT $1`,
            params: [limit],
          },
        ]),
    });
    if (defs.length > 0) return defs;
  } catch {
    /* product_variants fallback */
  }

  const pv = productVariantsTable();
  const pt = productsTable();
  try {
    const rows = await runDataTransport({
      label: 'fetchVariants.productVariants',
      viaRest: async () => {
        const raw = await postgrestGet<Record<string, unknown>[]>(
          `/${pv}`,
          { select: 'id,sku,attributes', order: 'sku.asc', limit },
          { schema: 'public' },
        );
        return (Array.isArray(raw) ? raw : []).map((r) => ({
          id: String(r.id ?? ''),
          sku: String(r.sku ?? ''),
          product_name: null as string | null,
          attributes: r.attributes,
        }));
      },
      viaBridge: () =>
        tryQueries<{
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
        ]),
    });
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
  } catch (e) {
    rethrowTransportInfra(e, 'fetchVariants');
    return [];
  }
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

export type DefinitionKind = 'brand' | 'category' | 'unitset' | 'special' | 'group' | 'variant';

export async function fetchDefinitionById(
  kind: DefinitionKind,
  id: string,
): Promise<DefinitionRow | UnitSetRow | null> {
  const raw = String(id || '').trim();
  if (!raw) return null;

  if (kind === 'unitset') {
    const header = unitsetsTable();
    const lines = unitsetLinesTable();
    const rows = await tryQueries<UnitSetRow>([
      {
        sql: `SELECT u.id::text AS id, u.code, u.name,
                     COALESCE(u.is_active, true) AS is_active,
                     COALESCE(lc.cnt, 0)::int AS line_count
              FROM ${header} u
              LEFT JOIN (
                SELECT unitset_id, COUNT(*)::int AS cnt FROM ${lines} GROUP BY unitset_id
              ) lc ON lc.unitset_id = u.id
              WHERE u.id::text = $1 LIMIT 1`,
        params: [raw],
      },
      {
        sql: `SELECT id::text AS id, code, name,
                     COALESCE(is_active, true) AS is_active, 0::int AS line_count
              FROM ${header} WHERE id::text = $1 LIMIT 1`,
        params: [raw],
      },
    ]);
    return rows[0] ?? null;
  }

  const table =
    kind === 'brand'
      ? brandsTable()
      : kind === 'category'
        ? categoriesTable()
        : kind === 'special'
          ? specialCodesTable()
          : kind === 'group'
            ? productGroupsTable()
            : variantsTable();

  const rows = await tryQueries<DefinitionRow>([
    {
      sql: `SELECT id::text AS id, code, name, description,
                   COALESCE(is_active, true) AS is_active,
                   COALESCE(is_restaurant, false) AS is_restaurant
            FROM ${table} WHERE id::text = $1 LIMIT 1`,
      params: [raw],
    },
    {
      sql: `SELECT id::text AS id, COALESCE(code, '') AS code, name, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${table} WHERE id::text = $1 LIMIT 1`,
      params: [raw],
    },
  ]);
  if (rows[0]) return rows[0];

  if (kind === 'variant') {
    const pv = productVariantsTable();
    const pt = productsTable();
    const variantRows = await tryQueries<{
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
              WHERE v.id::text = $1 LIMIT 1`,
        params: [raw],
      },
    ]);
    const v = variantRows[0];
    if (!v) return null;
    return {
      id: v.id,
      code: v.sku || v.id.slice(0, 8),
      name:
        typeof v.attributes === 'object' && v.attributes && 'name' in (v.attributes as object)
          ? String((v.attributes as { name?: string }).name || v.product_name || v.sku || 'Varyant')
          : v.product_name || v.sku || 'Varyant',
      description:
        typeof v.attributes === 'string'
          ? v.attributes
          : v.attributes
            ? JSON.stringify(v.attributes)
            : null,
      is_active: true,
    };
  }

  return null;
}

export async function updateBrand(id: string, input: DefinitionInput & { is_active?: boolean }): Promise<void> {
  const table = brandsTable();
  await pgQuery(
    `UPDATE ${table}
     SET code = $2, name = $3, description = $4,
         is_active = COALESCE($5, is_active)
     WHERE id::text = $1`,
    [
      id,
      input.code.trim(),
      input.name.trim(),
      input.description?.trim() || null,
      input.is_active ?? null,
    ],
  );
}

export async function updateCategory(
  id: string,
  input: DefinitionInput & { is_active?: boolean },
): Promise<void> {
  const table = categoriesTable();
  await pgQuery(
    `UPDATE ${table}
     SET code = $2, name = $3, description = $4,
         is_restaurant = COALESCE($5, is_restaurant),
         is_active = COALESCE($6, is_active)
     WHERE id::text = $1`,
    [
      id,
      input.code.trim(),
      input.name.trim(),
      input.description?.trim() || null,
      input.is_restaurant ?? null,
      input.is_active ?? null,
    ],
  );
}

export async function updateUnitSet(
  id: string,
  input: UnitSetInput & { is_active?: boolean },
): Promise<void> {
  const table = unitsetsTable();
  await pgQuery(
    `UPDATE ${table}
     SET code = $2, name = $3, is_active = COALESCE($4, is_active)
     WHERE id::text = $1`,
    [id, input.code.trim(), input.name.trim(), input.is_active ?? null],
  );
}

export async function updateSpecialCode(
  id: string,
  input: DefinitionInput & { is_active?: boolean },
): Promise<void> {
  const table = specialCodesTable();
  await pgQuery(
    `UPDATE ${table}
     SET code = $2, name = $3, description = $4,
         is_active = COALESCE($5, is_active)
     WHERE id::text = $1`,
    [
      id,
      input.code.trim(),
      input.name.trim(),
      input.description?.trim() || null,
      input.is_active ?? null,
    ],
  );
}

export async function updateGroupCode(
  id: string,
  input: DefinitionInput & { is_active?: boolean },
): Promise<void> {
  const table = productGroupsTable();
  await pgQuery(
    `UPDATE ${table}
     SET code = $2, name = $3, description = $4,
         is_active = COALESCE($5, is_active)
     WHERE id::text = $1`,
    [
      id,
      input.code.trim(),
      input.name.trim(),
      input.description?.trim() || null,
      input.is_active ?? null,
    ],
  );
}

export async function updateVariantDefinition(
  id: string,
  input: DefinitionInput & { is_active?: boolean },
): Promise<void> {
  const table = variantsTable();
  try {
    await pgQuery(
      `UPDATE ${table}
       SET code = $2, name = $3, description = $4,
           is_active = COALESCE($5, is_active)
       WHERE id::text = $1`,
      [
        id,
        input.code.trim(),
        input.name.trim(),
        input.description?.trim() || null,
        input.is_active ?? null,
      ],
    );
    return;
  } catch {
    /* ürün varyantı */
  }
  const pv = productVariantsTable();
  const attrs = JSON.stringify({
    name: input.name.trim(),
    description: input.description?.trim() || null,
  });
  await pgQuery(
    `UPDATE ${pv} SET sku = $2, attributes = $3::jsonb WHERE id::text = $1`,
    [id, input.code.trim(), attrs],
  );
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
