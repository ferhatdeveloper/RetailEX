import { pgQuery } from './pgClient';
import {
  brandsTable,
  categoriesTable,
  firmNr,
  newUuid,
  unitsetLinesTable,
  unitsetsTable,
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

export async function generateDefinitionCode(kind: 'brand' | 'category' | 'unitset'): Promise<string> {
  const fn = firmNr();
  const prefix =
    kind === 'brand' ? 'MRK' : kind === 'category' ? 'KTG' : 'BS';
  const table =
    kind === 'brand' ? brandsTable(fn) : kind === 'category' ? categoriesTable(fn) : unitsetsTable(fn);
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
