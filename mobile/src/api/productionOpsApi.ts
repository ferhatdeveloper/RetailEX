import { pgQuery } from './pgClient';
import {
  butcherRecipesTable,
  firmNr,
  newUuid,
  productionRecipesTable,
  productsTable,
} from './erpTables';

export type ProductionRecipeRow = {
  id: string;
  name: string;
  description: string | null;
  product_id: string | null;
  product_name: string | null;
  total_cost: number;
  wastage_percent: number;
  is_active: boolean;
};

export type ButcherRecipeRow = {
  id: string;
  code: string | null;
  name: string;
  animal_type: string;
  description: string | null;
  is_active: boolean;
};

export type ProductionRecipeInput = {
  name: string;
  description?: string;
  productId?: string | null;
  wastagePercent?: number;
};

export type ButcherRecipeInput = {
  name: string;
  code?: string;
  animalType?: string;
  description?: string;
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

export async function fetchProductionRecipes(limit = 200): Promise<ProductionRecipeRow[]> {
  const table = productionRecipesTable();
  const products = productsTable();
  return tryQueries<ProductionRecipeRow>([
    {
      sql: `SELECT r.id::text AS id, r.name, r.description,
                   r.product_id::text AS product_id, p.name AS product_name,
                   COALESCE(r.total_cost, 0)::float8 AS total_cost,
                   COALESCE(r.wastage_percent, 0)::float8 AS wastage_percent,
                   COALESCE(r.is_active, true) AS is_active
            FROM ${table} r
            LEFT JOIN ${products} p ON p.id = r.product_id
            WHERE COALESCE(r.is_active, true) = true
            ORDER BY r.name ASC
            LIMIT $1`,
      params: [limit],
    },
    {
      sql: `SELECT id::text AS id, name, description,
                   product_id::text AS product_id, NULL::text AS product_name,
                   COALESCE(total_cost, 0)::float8 AS total_cost,
                   COALESCE(wastage_percent, 0)::float8 AS wastage_percent,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            WHERE COALESCE(is_active, true) = true
            ORDER BY name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function fetchButcherRecipes(limit = 200): Promise<ButcherRecipeRow[]> {
  const table = butcherRecipesTable();
  return tryQueries<ButcherRecipeRow>([
    {
      sql: `SELECT id::text AS id, code, name, animal_type, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            WHERE COALESCE(is_active, true) = true
            ORDER BY name ASC
            LIMIT $1`,
      params: [limit],
    },
  ]);
}

export async function createProductionRecipe(input: ProductionRecipeInput): Promise<string> {
  const table = productionRecipesTable();
  const id = newUuid();
  const fn = firmNr();
  const name = input.name.trim();
  if (!name) throw new Error('Reçete adı zorunlu');
  const wastage = Math.max(0, Number(input.wastagePercent) || 0);

  const attempts: { sql: string; params: unknown[] }[] = [
    {
      sql: `INSERT INTO ${table}
              (id, firm_nr, product_id, name, description, total_cost, wastage_percent, is_active)
            VALUES ($1, $2, $3, $4, $5, 0, $6, true)`,
      params: [
        id,
        fn,
        input.productId || null,
        name,
        input.description?.trim() || null,
        wastage,
      ],
    },
    {
      sql: `INSERT INTO ${table}
              (id, product_id, name, description, total_cost, wastage_percent, is_active)
            VALUES ($1, $2, $3, $4, 0, $5, true)`,
      params: [id, input.productId || null, name, input.description?.trim() || null, wastage],
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

export async function createButcherRecipe(input: ButcherRecipeInput): Promise<string> {
  const table = butcherRecipesTable();
  const id = newUuid();
  const fn = firmNr();
  const name = input.name.trim();
  if (!name) throw new Error('Reçete adı zorunlu');
  const animal = (input.animalType || 'sheep').trim() || 'sheep';

  const attempts: { sql: string; params: unknown[] }[] = [
    {
      sql: `INSERT INTO ${table}
              (id, firm_nr, code, name, animal_type, description, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, true)`,
      params: [
        id,
        fn,
        input.code?.trim() || null,
        name,
        animal,
        input.description?.trim() || null,
      ],
    },
    {
      sql: `INSERT INTO ${table}
              (id, code, name, animal_type, description, is_active)
            VALUES ($1, $2, $3, $4, $5, true)`,
      params: [id, input.code?.trim() || null, name, animal, input.description?.trim() || null],
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
