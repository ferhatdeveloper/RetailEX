import { pgQuery } from './pgClient';
import { postgrestDelete, postgrestGet, postgrestPatch, postgrestPost } from './postgrestClient';
import { runDataTransport } from './dataTransport';
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
  return runDataTransport({
    label: 'fetchProductionRecipes',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        `/${table}`,
        {
          select: 'id,name,description,product_id,total_cost,wastage_percent,is_active',
          is_active: 'eq.true',
          order: 'name.asc',
          limit,
        },
        { schema: 'public' },
      );
      const productIds = [
        ...new Set(
          (Array.isArray(rows) ? rows : [])
            .map((r) => String(r.product_id ?? ''))
            .filter(Boolean),
        ),
      ];
      const productNameById = new Map<string, string>();
      if (productIds.length) {
        try {
          const prows = await postgrestGet<Record<string, unknown>[]>(
            `/${products}`,
            { select: 'id,name', limit: 500 },
            { schema: 'public' },
          );
          for (const p of Array.isArray(prows) ? prows : []) {
            if (p.id) productNameById.set(String(p.id), String(p.name ?? ''));
          }
        } catch {
          /* optional */
        }
      }
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        description: r.description != null ? String(r.description) : null,
        product_id: r.product_id != null ? String(r.product_id) : null,
        product_name: r.product_id ? productNameById.get(String(r.product_id)) ?? null : null,
        total_cost: Number(r.total_cost ?? 0) || 0,
        wastage_percent: Number(r.wastage_percent ?? 0) || 0,
        is_active: !(r.is_active === false || String(r.is_active).toLowerCase() === 'false'),
      }));
    },
    viaBridge: () =>
      tryQueries<ProductionRecipeRow>([
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
      ]),
  });
}

export async function fetchButcherRecipes(limit = 200): Promise<ButcherRecipeRow[]> {
  const table = butcherRecipesTable();
  return runDataTransport({
    label: 'fetchButcherRecipes',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        `/${table}`,
        {
          select: 'id,code,name,animal_type,description,is_active',
          is_active: 'eq.true',
          order: 'name.asc',
          limit,
        },
        { schema: 'public' },
      );
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: String(r.id ?? ''),
        code: r.code != null ? String(r.code) : null,
        name: String(r.name ?? ''),
        animal_type: String(r.animal_type ?? ''),
        description: r.description != null ? String(r.description) : null,
        is_active: !(r.is_active === false || String(r.is_active).toLowerCase() === 'false'),
      }));
    },
    viaBridge: () =>
      tryQueries<ButcherRecipeRow>([
        {
          sql: `SELECT id::text AS id, code, name, animal_type, description,
                   COALESCE(is_active, true) AS is_active
            FROM ${table}
            WHERE COALESCE(is_active, true) = true
            ORDER BY name ASC
            LIMIT $1`,
          params: [limit],
        },
      ]),
  });
}

export async function createProductionRecipe(input: ProductionRecipeInput): Promise<string> {
  const table = productionRecipesTable();
  const id = newUuid();
  const fn = firmNr();
  const name = input.name.trim();
  if (!name) throw new Error('Reçete adı zorunlu');
  const wastage = Math.max(0, Number(input.wastagePercent) || 0);

  return runDataTransport({
    label: 'createProductionRecipe',
    viaRest: async () => {
      try {
        await postgrestPost(
          `/${table}`,
          {
            id,
            firm_nr: fn,
            product_id: input.productId || null,
            name,
            description: input.description?.trim() || null,
            total_cost: 0,
            wastage_percent: wastage,
            is_active: true,
          },
          { schema: 'public', prefer: 'return=minimal' },
        );
      } catch {
        await postgrestPost(
          `/${table}`,
          {
            id,
            product_id: input.productId || null,
            name,
            description: input.description?.trim() || null,
            total_cost: 0,
            wastage_percent: wastage,
            is_active: true,
          },
          { schema: 'public', prefer: 'return=minimal' },
        );
      }
      return id;
    },
    viaBridge: async () => {
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
    },
  });
}

export async function createButcherRecipe(input: ButcherRecipeInput): Promise<string> {
  const table = butcherRecipesTable();
  const id = newUuid();
  const fn = firmNr();
  const name = input.name.trim();
  if (!name) throw new Error('Reçete adı zorunlu');
  const animal = (input.animalType || 'sheep').trim() || 'sheep';

  return runDataTransport({
    label: 'createButcherRecipe',
    viaRest: async () => {
      try {
        await postgrestPost(
          `/${table}`,
          {
            id,
            firm_nr: fn,
            code: input.code?.trim() || null,
            name,
            animal_type: animal,
            description: input.description?.trim() || null,
            is_active: true,
          },
          { schema: 'public', prefer: 'return=minimal' },
        );
      } catch {
        await postgrestPost(
          `/${table}`,
          {
            id,
            code: input.code?.trim() || null,
            name,
            animal_type: animal,
            description: input.description?.trim() || null,
            is_active: true,
          },
          { schema: 'public', prefer: 'return=minimal' },
        );
      }
      return id;
    },
    viaBridge: async () => {
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
    },
  });
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

async function fetchProductionRecipeByIdViaRest(
  id: string,
): Promise<ProductionRecipeDetail | null> {
  const table = productionRecipesTable();
  const ing = productionRecipeIngredientsTable();
  const products = productsTable();
  const headers = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select: 'id,name,description,product_id,total_cost,wastage_percent,is_active',
      id: `eq.${id}`,
      limit: 1,
    },
    { schema: 'public' },
  );
  const h = Array.isArray(headers) ? headers[0] : null;
  if (!h?.id) return null;

  let productName: string | null = null;
  if (h.product_id) {
    try {
      const prows = await postgrestGet<Array<{ name?: string }>>(
        `/${products}`,
        { select: 'name', id: `eq.${String(h.product_id)}`, limit: 1 },
        { schema: 'public' },
      );
      productName = Array.isArray(prows) && prows[0]?.name != null ? String(prows[0].name) : null;
    } catch {
      productName = null;
    }
  }

  const header: ProductionRecipeRow = {
    id: String(h.id),
    name: String(h.name ?? ''),
    description: h.description != null ? String(h.description) : null,
    product_id: h.product_id != null ? String(h.product_id) : null,
    product_name: productName,
    total_cost: Number(h.total_cost ?? 0) || 0,
    wastage_percent: Number(h.wastage_percent ?? 0) || 0,
    is_active: !(h.is_active === false || String(h.is_active).toLowerCase() === 'false'),
  };

  let ingredients: ProductionIngredientRow[] = [];
  try {
    const irows = await postgrestGet<Record<string, unknown>[]>(
      `/${ing}`,
      {
        select: 'id,material_id,quantity,unit,cost,created_at',
        recipe_id: `eq.${id}`,
        order: 'created_at.asc',
      },
      { schema: 'public' },
    );
    const list = Array.isArray(irows) ? irows : [];
    const materialIds = [
      ...new Set(list.map((r) => String(r.material_id ?? '')).filter(Boolean)),
    ];
    const materialById = new Map<string, { name?: string; code?: string }>();
    if (materialIds.length) {
      try {
        const mrows = await postgrestGet<Record<string, unknown>[]>(
          `/${products}`,
          {
            select: 'id,name,code',
            id: `in.(${materialIds.map((x) => encodeURIComponent(x)).join(',')})`,
            limit: materialIds.length,
          },
          { schema: 'public' },
        );
        for (const m of Array.isArray(mrows) ? mrows : []) {
          if (m.id) {
            materialById.set(String(m.id), {
              name: m.name != null ? String(m.name) : undefined,
              code: m.code != null ? String(m.code) : undefined,
            });
          }
        }
      } catch {
        /* optional */
      }
    }
    ingredients = list.map((r) => {
      const mid = r.material_id != null ? String(r.material_id) : '';
      const mat = materialById.get(mid);
      return {
        id: String(r.id ?? ''),
        material_id: mid,
        material_name: mat?.name ?? null,
        material_code: mat?.code ?? null,
        quantity: Number(r.quantity ?? 0) || 0,
        unit: r.unit != null ? String(r.unit) : null,
        cost: Number(r.cost ?? 0) || 0,
      };
    });
  } catch {
    ingredients = [];
  }

  return { ...header, ingredients };
}

async function fetchProductionRecipeByIdViaBridge(
  id: string,
): Promise<ProductionRecipeDetail | null> {
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

export async function fetchProductionRecipeById(id: string): Promise<ProductionRecipeDetail | null> {
  return runDataTransport({
    label: 'fetchProductionRecipeById',
    viaRest: () => fetchProductionRecipeByIdViaRest(id),
    viaBridge: () => fetchProductionRecipeByIdViaBridge(id),
  });
}

export async function saveProductionRecipeIngredients(
  recipeId: string,
  ingredients: Array<{ materialId: string; quantity: number; unit?: string; cost?: number }>,
): Promise<void> {
  return runDataTransport({
    label: 'saveProductionRecipeIngredients',
    viaRest: () => saveProductionRecipeIngredientsViaRest(recipeId, ingredients),
    viaBridge: () => saveProductionRecipeIngredientsViaBridge(recipeId, ingredients),
  });
}

async function saveProductionRecipeIngredientsViaRest(
  recipeId: string,
  ingredients: Array<{ materialId: string; quantity: number; unit?: string; cost?: number }>,
): Promise<void> {
  const ing = productionRecipeIngredientsTable();
  const recipes = productionRecipesTable();
  await postgrestDelete(`/${ing}?recipe_id=eq.${encodeURIComponent(recipeId)}`, {
    schema: 'public',
  });

  let totalCost = 0;
  const payload = ingredients
    .filter((row) => row.materialId)
    .map((row) => {
      const qty = Math.abs(Number(row.quantity) || 0);
      const cost = Math.abs(Number(row.cost) || 0);
      totalCost += cost;
      return {
        id: newUuid(),
        recipe_id: recipeId,
        material_id: row.materialId,
        quantity: qty,
        unit: row.unit || 'Adet',
        cost,
      };
    });

  if (payload.length) {
    await postgrestPost(`/${ing}`, payload, { schema: 'public', prefer: 'return=minimal' });
  }

  try {
    await postgrestPatch(
      `/${recipes}?id=eq.${encodeURIComponent(recipeId)}`,
      { total_cost: totalCost, updated_at: new Date().toISOString() },
      { schema: 'public', prefer: 'return=minimal' },
    );
  } catch {
    await postgrestPatch(
      `/${recipes}?id=eq.${encodeURIComponent(recipeId)}`,
      { total_cost: totalCost },
      { schema: 'public', prefer: 'return=minimal' },
    );
  }
}

async function saveProductionRecipeIngredientsViaBridge(
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

async function fetchButcherRecipeByIdViaRest(id: string): Promise<ButcherRecipeDetail | null> {
  const table = butcherRecipesTable();
  const out = butcherRecipeOutputsTable();
  const products = productsTable();
  const headers = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select: 'id,code,name,animal_type,description,is_active',
      id: `eq.${id}`,
      limit: 1,
    },
    { schema: 'public' },
  );
  const h = Array.isArray(headers) ? headers[0] : null;
  if (!h?.id) return null;

  const header: ButcherRecipeRow = {
    id: String(h.id),
    code: h.code != null ? String(h.code) : null,
    name: String(h.name ?? ''),
    animal_type: String(h.animal_type ?? ''),
    description: h.description != null ? String(h.description) : null,
    is_active: !(h.is_active === false || String(h.is_active).toLowerCase() === 'false'),
  };

  let outputs: ButcherOutputRow[] = [];
  try {
    const orows = await postgrestGet<Record<string, unknown>[]>(
      `/${out}`,
      {
        select: 'id,product_id,sort_order,standard_ratio_percent,coefficient,created_at',
        recipe_id: `eq.${id}`,
        order: 'sort_order.asc,created_at.asc',
      },
      { schema: 'public' },
    );
    const list = Array.isArray(orows) ? orows : [];
    const productIds = [
      ...new Set(list.map((r) => String(r.product_id ?? '')).filter(Boolean)),
    ];
    const productById = new Map<string, { name?: string; code?: string }>();
    if (productIds.length) {
      try {
        const prows = await postgrestGet<Record<string, unknown>[]>(
          `/${products}`,
          {
            select: 'id,name,code',
            id: `in.(${productIds.map((x) => encodeURIComponent(x)).join(',')})`,
            limit: productIds.length,
          },
          { schema: 'public' },
        );
        for (const p of Array.isArray(prows) ? prows : []) {
          if (p.id) {
            productById.set(String(p.id), {
              name: p.name != null ? String(p.name) : undefined,
              code: p.code != null ? String(p.code) : undefined,
            });
          }
        }
      } catch {
        /* optional */
      }
    }
    outputs = list.map((r) => {
      const pid = r.product_id != null ? String(r.product_id) : '';
      const prod = productById.get(pid);
      return {
        id: String(r.id ?? ''),
        product_id: pid,
        product_name: prod?.name ?? null,
        product_code: prod?.code ?? null,
        sort_order: Number(r.sort_order ?? 0) || 0,
        standard_ratio_percent:
          r.standard_ratio_percent != null ? Number(r.standard_ratio_percent) : null,
        coefficient: Number(r.coefficient ?? 1) || 1,
      };
    });
  } catch {
    outputs = [];
  }

  return { ...header, outputs };
}

async function fetchButcherRecipeByIdViaBridge(id: string): Promise<ButcherRecipeDetail | null> {
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

export async function fetchButcherRecipeById(id: string): Promise<ButcherRecipeDetail | null> {
  return runDataTransport({
    label: 'fetchButcherRecipeById',
    viaRest: () => fetchButcherRecipeByIdViaRest(id),
    viaBridge: () => fetchButcherRecipeByIdViaBridge(id),
  });
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
  return runDataTransport({
    label: 'saveButcherRecipeOutputs',
    viaRest: () => saveButcherRecipeOutputsViaRest(recipeId, outputs),
    viaBridge: () => saveButcherRecipeOutputsViaBridge(recipeId, outputs),
  });
}

async function saveButcherRecipeOutputsViaRest(
  recipeId: string,
  outputs: Array<{
    productId: string;
    sortOrder?: number;
    standardRatioPercent?: number | null;
    coefficient?: number;
  }>,
): Promise<void> {
  const out = butcherRecipeOutputsTable();
  await postgrestDelete(`/${out}?recipe_id=eq.${encodeURIComponent(recipeId)}`, {
    schema: 'public',
  });
  const payload = outputs
    .filter((row) => row.productId)
    .map((row, i) => ({
      id: newUuid(),
      recipe_id: recipeId,
      product_id: row.productId,
      sort_order: row.sortOrder ?? i,
      standard_ratio_percent: row.standardRatioPercent ?? null,
      coefficient: row.coefficient ?? 1,
    }));
  if (payload.length) {
    await postgrestPost(`/${out}`, payload, { schema: 'public', prefer: 'return=minimal' });
  }
}

async function saveButcherRecipeOutputsViaBridge(
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
