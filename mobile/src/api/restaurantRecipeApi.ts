/**
 * Restoran reçetesi — web `RestaurantService.getRecipes` / `saveRecipe`.
 * Maliyet = satır (maliyet × miktar) toplamı. Fire yüzdesi ayrıca saklanır.
 */

import { pgQuery } from './pgClient';
import { postgrestDelete, postgrestGet, postgrestPatch, postgrestPost } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { firmNr, newUuid, productsTable } from './erpTables';

const REST = { schema: 'rest' as const };

function recipesTable(): string {
  return `rest.rex_${firmNr()}_rest_recipes`;
}
function ingredientsTable(): string {
  return `rest.rex_${firmNr()}_rest_recipe_ingredients`;
}
function recipesPath(): string {
  return `/rex_${firmNr()}_rest_recipes`;
}
function ingredientsPath(): string {
  return `/rex_${firmNr()}_rest_recipe_ingredients`;
}

export type RestRecipeLine = {
  id: string;
  material_id: string;
  material_name: string | null;
  quantity: number;
  unit: string | null;
  cost: number;
};

export type RestRecipeRow = {
  id: string;
  menu_item_id: string;
  menu_item_name: string | null;
  total_cost: number;
  wastage_percent: number;
  ingredients: RestRecipeLine[];
};

export async function fetchRestaurantRecipes(): Promise<RestRecipeRow[]> {
  const products = productsTable();
  return runDataTransport({
    label: 'fetchRestaurantRecipes',
    viaRest: async () => {
      const recipes = await postgrestGet<Record<string, unknown>[]>(
        recipesPath(),
        { select: 'id,menu_item_id,total_cost,wastage_percent,is_active', is_active: 'eq.true', limit: 300 },
        REST,
      );
      const list = Array.isArray(recipes) ? recipes : [];
      const out: RestRecipeRow[] = [];
      for (const r of list) {
        const id = String(r.id ?? '');
        const lines = await postgrestGet<Record<string, unknown>[]>(
          ingredientsPath(),
          { select: 'id,material_id,quantity,unit,cost', recipe_id: `eq.${id}`, limit: 100 },
          REST,
        );
        out.push({
          id,
          menu_item_id: String(r.menu_item_id ?? ''),
          menu_item_name: null,
          total_cost: Number(r.total_cost) || 0,
          wastage_percent: Number(r.wastage_percent) || 0,
          ingredients: (Array.isArray(lines) ? lines : []).map(mapLine),
        });
      }
      return out;
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT r.id::text AS id,
                r.menu_item_id::text AS menu_item_id,
                p.name AS menu_item_name,
                COALESCE(r.total_cost, 0)::float8 AS total_cost,
                COALESCE(r.wastage_percent, 0)::float8 AS wastage_percent
           FROM ${recipesTable()} r
           LEFT JOIN ${products} p ON p.id = r.menu_item_id
          WHERE COALESCE(r.is_active, true) = true
          ORDER BY p.name NULLS LAST
          LIMIT 300`,
      );
      const out: RestRecipeRow[] = [];
      for (const r of res.rows) {
        const lines = await pgQuery<Record<string, unknown>>(
          `SELECT ri.id::text AS id, ri.material_id::text AS material_id, mp.name AS material_name,
                  COALESCE(ri.quantity, 0)::float8 AS quantity, ri.unit, COALESCE(ri.cost, 0)::float8 AS cost
             FROM ${ingredientsTable()} ri
             LEFT JOIN ${products} mp ON mp.id = ri.material_id
            WHERE ri.recipe_id = $1::uuid`,
          [r.id],
        );
        out.push({
          id: String(r.id),
          menu_item_id: String(r.menu_item_id ?? ''),
          menu_item_name: r.menu_item_name != null ? String(r.menu_item_name) : null,
          total_cost: Number(r.total_cost) || 0,
          wastage_percent: Number(r.wastage_percent) || 0,
          ingredients: lines.rows.map(mapLine),
        });
      }
      return out;
    },
  });
}

function mapLine(r: Record<string, unknown>): RestRecipeLine {
  return {
    id: String(r.id ?? ''),
    material_id: String(r.material_id ?? ''),
    material_name: r.material_name != null ? String(r.material_name) : null,
    quantity: Number(r.quantity) || 0,
    unit: r.unit != null ? String(r.unit) : null,
    cost: Number(r.cost) || 0,
  };
}

export function recipeLineTotal(lines: Array<{ cost: number; quantity: number }>): number {
  return lines.reduce((sum, line) => sum + Number(line.cost || 0) * Number(line.quantity || 0), 0);
}

export async function saveRestaurantRecipe(input: {
  id?: string;
  menuItemId: string;
  wastagePercent: number;
  ingredients: Array<{ materialId: string; quantity: number; unit?: string | null; cost: number }>;
}): Promise<void> {
  const total = recipeLineTotal(
    input.ingredients.map((i) => ({ cost: i.cost, quantity: i.quantity })),
  );
  const wastage = Number(input.wastagePercent) || 0;
  await runDataTransport({
    label: 'saveRestaurantRecipe',
    viaRest: async () => {
      let recipeId = input.id;
      if (recipeId) {
        await postgrestPatch(
          `${recipesPath()}?id=eq.${encodeURIComponent(recipeId)}`,
          { total_cost: total, wastage_percent: wastage, updated_at: new Date().toISOString() },
          { ...REST, prefer: 'return=minimal' },
        );
        const old = await postgrestGet<{ id: string }[]>(
          ingredientsPath(),
          { select: 'id', recipe_id: `eq.${recipeId}`, limit: 200 },
          REST,
        );
        for (const row of Array.isArray(old) ? old : []) {
          await postgrestDelete(`${ingredientsPath()}?id=eq.${encodeURIComponent(row.id)}`, REST);
        }
      } else {
        recipeId = newUuid();
        await postgrestPost(
          recipesPath(),
          {
            id: recipeId,
            menu_item_id: input.menuItemId,
            total_cost: total,
            wastage_percent: wastage,
            is_active: true,
          },
          { ...REST, prefer: 'return=minimal' },
        );
      }
      for (const ing of input.ingredients) {
        await postgrestPost(
          ingredientsPath(),
          {
            id: newUuid(),
            recipe_id: recipeId,
            material_id: ing.materialId,
            quantity: ing.quantity,
            unit: ing.unit ?? null,
            cost: ing.cost,
          },
          { ...REST, prefer: 'return=minimal' },
        );
      }
    },
    viaBridge: async () => {
      let recipeId = input.id;
      if (recipeId) {
        await pgQuery(
          `UPDATE ${recipesTable()} SET total_cost = $2, wastage_percent = $3, updated_at = NOW() WHERE id = $1::uuid`,
          [recipeId, total, wastage],
        );
        await pgQuery(`DELETE FROM ${ingredientsTable()} WHERE recipe_id = $1::uuid`, [recipeId]);
      } else {
        const ins = await pgQuery<{ id: string }>(
          `INSERT INTO ${recipesTable()} (id, menu_item_id, total_cost, wastage_percent, is_active)
           VALUES ($1::uuid, $2::uuid, $3, $4, true) RETURNING id::text AS id`,
          [newUuid(), input.menuItemId, total, wastage],
        );
        recipeId = ins.rows[0]?.id;
      }
      for (const ing of input.ingredients) {
        await pgQuery(
          `INSERT INTO ${ingredientsTable()} (id, recipe_id, material_id, quantity, unit, cost)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)`,
          [newUuid(), recipeId, ing.materialId, ing.quantity, ing.unit ?? null, ing.cost],
        );
      }
    },
  });
}
