import { pgQuery } from './pgClient';
import {
  butcherRecipeOutputsTable,
  butcherRecipesTable,
  firmNr,
  newUuid,
  productionRecipeIngredientsTable,
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

export type ProductionIngredientRow = {
  id: string;
  material_id: string;
  material_name: string | null;
  material_code: string | null;
  quantity: number;
  unit: string | null;
  cost: number;
};

export type ProductionRecipeDetail = ProductionRecipeRow & {
  ingredients: ProductionIngredientRow[];
};

export type ButcherOutputRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  product_code: string | null;
  sort_order: number;
  standard_ratio_percent: number | null;
  coefficient: number;
};

export type ButcherRecipeDetail = ButcherRecipeRow & {
  outputs: ButcherOutputRow[];
};

export async function fetchProductionRecipeById(id: string): Promise<ProductionRecipeDetail | null> {
  const table = productionRecipesTable();
  const ing = productionRecipeIngredientsTable();
  const products = productsTable();
  const rows = await tryQueries<ProductionRecipeRow>([
    {
      sql: `SELECT r.id::text AS id, r.name, r.description,
                   r.product_id::text AS product_id, p.name AS product_name,
                   COALESCE(r.total_cost, 0)::float8 AS total_cost,
                   COALESCE(r.wastage_percent, 0)::float8 AS wastage_percent,
                   COALESCE(r.is_active, true) AS is_active
            FROM ${table} r
            LEFT JOIN ${products} p ON p.id = r.product_id
            WHERE r.id::text = $1
            LIMIT 1`,
      params: [id],
    },
  ]);
  const header = rows[0];
  if (!header) return null;

  let ingredients: ProductionIngredientRow[] = [];
  try {
    const res = await pgQuery<ProductionIngredientRow>(
      `SELECT i.id::text AS id,
              i.material_id::text AS material_id,
              p.name AS material_name,
              p.code AS material_code,
              COALESCE(i.quantity, 0)::float8 AS quantity,
              i.unit,
              COALESCE(i.cost, 0)::float8 AS cost
       FROM ${ing} i
       LEFT JOIN ${products} p ON p.id = i.material_id
       WHERE i.recipe_id::text = $1
       ORDER BY i.created_at NULLS LAST`,
      [id],
    );
    ingredients = res.rows;
  } catch {
    ingredients = [];
  }

  return { ...header, ingredients };
}

export async function saveProductionRecipeIngredients(
  recipeId: string,
  ingredients: Array<{ materialId: string; quantity: number; unit?: string; cost?: number }>,
): Promise<void> {
  const ing = productionRecipeIngredientsTable();
  const recipes = productionRecipesTable();
  await pgQuery(`DELETE FROM ${ing} WHERE recipe_id::text = $1`, [recipeId]);
  let totalCost = 0;
  for (const row of ingredients) {
    if (!row.materialId) continue;
    const qty = Math.abs(Number(row.quantity) || 0);
    const cost = Math.abs(Number(row.cost) || 0);
    totalCost += cost;
    await pgQuery(
      `INSERT INTO ${ing} (recipe_id, material_id, quantity, unit, cost)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
      [recipeId, row.materialId, qty, row.unit || 'Adet', cost],
    );
  }
  try {
    await pgQuery(`UPDATE ${recipes} SET total_cost = $1, updated_at = NOW() WHERE id::text = $2`, [
      totalCost,
      recipeId,
    ]);
  } catch {
    await pgQuery(`UPDATE ${recipes} SET total_cost = $1 WHERE id::text = $2`, [totalCost, recipeId]);
  }
}

export async function fetchButcherRecipeById(id: string): Promise<ButcherRecipeDetail | null> {
  const table = butcherRecipesTable();
  const out = butcherRecipeOutputsTable();
  const products = productsTable();
  const rows = await tryQueries<ButcherRecipeRow>([
    {
      sql: `SELECT id::text AS id, code, name, animal_type, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            WHERE id::text = $1
            LIMIT 1`,
      params: [id],
    },
  ]);
  const header = rows[0];
  if (!header) return null;

  let outputs: ButcherOutputRow[] = [];
  try {
    const res = await pgQuery<ButcherOutputRow>(
      `SELECT o.id::text AS id,
              o.product_id::text AS product_id,
              p.name AS product_name,
              p.code AS product_code,
              COALESCE(o.sort_order, 0)::int AS sort_order,
              o.standard_ratio_percent::float8 AS standard_ratio_percent,
              COALESCE(o.coefficient, 1)::float8 AS coefficient
       FROM ${out} o
       LEFT JOIN ${products} p ON p.id = o.product_id
       WHERE o.recipe_id::text = $1
       ORDER BY o.sort_order NULLS LAST, o.created_at NULLS LAST`,
      [id],
    );
    outputs = res.rows;
  } catch {
    outputs = [];
  }

  return { ...header, outputs };
}

export async function saveButcherRecipeOutputs(
  recipeId: string,
  outputs: Array<{
    productId: string;
    sortOrder?: number;
    standardRatioPercent?: number | null;
    coefficient?: number;
  }>,
): Promise<void> {
  const out = butcherRecipeOutputsTable();
  await pgQuery(`DELETE FROM ${out} WHERE recipe_id::text = $1`, [recipeId]);
  for (let i = 0; i < outputs.length; i++) {
    const row = outputs[i];
    if (!row.productId) continue;
    await pgQuery(
      `INSERT INTO ${out}
         (recipe_id, product_id, sort_order, standard_ratio_percent, coefficient)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5)`,
      [
        recipeId,
        row.productId,
        row.sortOrder ?? i,
        row.standardRatioPercent ?? null,
        row.coefficient ?? 1,
      ],
    );
  }
}
