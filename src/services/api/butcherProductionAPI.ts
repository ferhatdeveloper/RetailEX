/**
 * Kasap üretim API — reçete, üretim fişi, firma maliyet ayarı
 * Tablolar: rex_{firm}_butcher_*
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';
import type { ButcherCostMethod } from '../../utils/butcherCost';

function padFirmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function firmTablePrefix(): string {
  return `rex_${padFirmNr()}`;
}

function isRestApi(): boolean {
  return DB_SETTINGS.connectionProvider === 'rest_api';
}

export type AnimalType = 'cattle' | 'sheep' | 'goat' | 'other';

export interface ButcherRecipeOutput {
  id?: string;
  productId: string;
  productName?: string;
  sortOrder: number;
  standardRatioPercent?: number | null;
  coefficient: number;
}

export interface ButcherRecipe {
  id?: string;
  /** Üretim / reçete kodu — fişte hızlı seçim */
  code?: string | null;
  name: string;
  animalType: AnimalType;
  inputProductId?: string | null;
  inputProductName?: string;
  wasteProductId?: string | null;
  wasteProductName?: string;
  costMethod?: ButcherCostMethod | null;
  description?: string;
  isActive: boolean;
  outputs: ButcherRecipeOutput[];
}

export interface ButcherOrderOutput {
  id?: string;
  productId: string;
  productName?: string;
  outputKg: number;
  coefficient: number;
  salePrice: number;
  unitCost: number;
  totalCost: number;
  costSharePercent: number;
  sortOrder?: number;
}

export interface ButcherOrder {
  id?: string;
  orderNo: string;
  recipeId?: string | null;
  recipeName?: string;
  animalType: AnimalType;
  inputProductId: string;
  inputProductName?: string;
  inputQtyKg: number;
  inputUnitCost: number;
  inputTotalCost: number;
  warehouseId?: string | null;
  wasteProductId?: string | null;
  lotNo?: string | null;
  costMethod: ButcherCostMethod;
  outputQtyKg: number;
  wasteQtyKg: number;
  wastePercent: number;
  wasteCostAllocated: number;
  costPerKgSalable: number;
  status: 'draft' | 'open' | 'completed' | 'cancelled';
  note?: string;
  purchaseInvoiceId?: string | null;
  purchaseInvoiceNo?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  completedAt?: string;
  createdAt?: string;
  outputs: ButcherOrderOutput[];
}

export interface ButcherSettings {
  defaultCostMethod: ButcherCostMethod;
  defaultWarehouseId?: string | null;
  /** true: yetersiz girdi stoğunda üretim tamamlanabilir (alış sonrası belge ile tamamlanır) */
  allowCompleteWithoutStock?: boolean;
}

async function productNameMap(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return map;
  const px = firmTablePrefix();
  if (isRestApi()) {
    const { postgrest } = await import('./postgrestClient');
    const inList = unique.map((id) => encodeURIComponent(id)).join(',');
    const rows = await postgrest.get<any[]>(
      `/${px}_products`,
      { select: 'id,name', id: `in.(${inList})` },
      { schema: 'public' },
    );
    (Array.isArray(rows) ? rows : []).forEach((p) => map.set(p.id, p.name));
    return map;
  }
  const inPh = unique.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await postgres.query(
    `SELECT id, name FROM ${px}_products WHERE id IN (${inPh})`,
    unique,
  );
  rows.forEach((p: { id: string; name: string }) => map.set(p.id, p.name));
  return map;
}

function mapRecipe(row: any, outputs: any[], names: Map<string, string>): ButcherRecipe {
  return {
    id: row.id,
    code: row.code != null && String(row.code).trim() !== '' ? String(row.code).trim() : null,
    name: row.name,
    animalType: (row.animal_type || 'sheep') as AnimalType,
    inputProductId: row.input_product_id ?? null,
    inputProductName: row.input_product_id ? names.get(row.input_product_id) : undefined,
    wasteProductId: row.waste_product_id ?? null,
    wasteProductName: row.waste_product_id ? names.get(row.waste_product_id) : undefined,
    costMethod: (row.cost_method as ButcherCostMethod) || null,
    description: row.description ?? undefined,
    isActive: row.is_active !== false,
    outputs: outputs.map((o) => ({
      id: o.id,
      productId: o.product_id,
      productName: names.get(o.product_id),
      sortOrder: Number(o.sort_order ?? 0),
      standardRatioPercent: o.standard_ratio_percent != null ? Number(o.standard_ratio_percent) : null,
      coefficient: Number(o.coefficient ?? 1),
    })),
  };
}

function mapOrder(row: any, outputs: any[], names: Map<string, string>): ButcherOrder {
  return {
    id: row.id,
    orderNo: row.order_no,
    recipeId: row.recipe_id ?? null,
    recipeName: row.recipe_name,
    animalType: (row.animal_type || 'sheep') as AnimalType,
    inputProductId: row.input_product_id,
    inputProductName: names.get(row.input_product_id),
    inputQtyKg: Number(row.input_qty_kg ?? 0),
    inputUnitCost: Number(row.input_unit_cost ?? 0),
    inputTotalCost: Number(row.input_total_cost ?? 0),
    warehouseId: row.warehouse_id ?? null,
    wasteProductId: row.waste_product_id ?? null,
    lotNo: row.lot_no ?? null,
    costMethod: (row.cost_method || 'by_weight') as ButcherCostMethod,
    outputQtyKg: Number(row.output_qty_kg ?? 0),
    wasteQtyKg: Number(row.waste_qty_kg ?? 0),
    wastePercent: Number(row.waste_percent ?? 0),
    wasteCostAllocated: Number(row.waste_cost_allocated ?? 0),
    costPerKgSalable: Number(row.cost_per_kg_salable ?? 0),
    status: row.status,
    note: row.note ?? undefined,
    purchaseInvoiceId: row.purchase_invoice_id ?? null,
    purchaseInvoiceNo: row.purchase_invoice_no ?? null,
    supplierId: row.supplier_id ?? null,
    supplierName: row.supplier_name ?? null,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at ?? undefined,
    outputs: outputs.map((o, idx) => ({
      id: o.id,
      productId: o.product_id,
      productName: names.get(o.product_id),
      outputKg: Number(o.output_kg ?? 0),
      coefficient: Number(o.coefficient ?? 1),
      salePrice: Number(o.sale_price ?? 0),
      unitCost: Number(o.unit_cost ?? 0),
      totalCost: Number(o.total_cost ?? 0),
      costSharePercent: Number(o.cost_share_percent ?? 0),
      sortOrder: Number(o.sort_order ?? idx),
    })),
  };
}

export const butcherProductionAPI = {
  async ensureTables(): Promise<void> {
    const firm = padFirmNr();
    try {
      await postgres.query(`SELECT public.INIT_BUTCHER_PRODUCTION_TABLES($1)`, [firm]);
    } catch (e) {
      console.warn('[ButcherAPI] ensureTables:', e);
    }
    try {
      const px = firmTablePrefix();
      await postgres.query(
        `ALTER TABLE ${px}_butcher_settings
         ADD COLUMN IF NOT EXISTS allow_complete_without_stock BOOLEAN NOT NULL DEFAULT true`,
      );
    } catch (e) {
      console.warn('[ButcherAPI] allow_complete_without_stock:', e);
    }
  },

  async getSettings(): Promise<ButcherSettings> {
    await this.ensureTables();
    const px = firmTablePrefix();
    try {
      const { rows } = await postgres.query(
        `SELECT default_cost_method, default_warehouse_id, allow_complete_without_stock
         FROM ${px}_butcher_settings LIMIT 1`,
      );
      if (!rows.length) {
        return {
          defaultCostMethod: 'by_weight',
          defaultWarehouseId: null,
          allowCompleteWithoutStock: true,
        };
      }
      return {
        defaultCostMethod: (rows[0].default_cost_method || 'by_weight') as ButcherCostMethod,
        defaultWarehouseId: rows[0].default_warehouse_id ?? null,
        allowCompleteWithoutStock: rows[0].allow_complete_without_stock !== false,
      };
    } catch {
      const { rows } = await postgres.query(
        `SELECT default_cost_method, default_warehouse_id FROM ${px}_butcher_settings LIMIT 1`,
      );
      if (!rows.length) {
        return {
          defaultCostMethod: 'by_weight',
          defaultWarehouseId: null,
          allowCompleteWithoutStock: true,
        };
      }
      return {
        defaultCostMethod: (rows[0].default_cost_method || 'by_weight') as ButcherCostMethod,
        defaultWarehouseId: rows[0].default_warehouse_id ?? null,
        allowCompleteWithoutStock: true,
      };
    }
  },

  async saveSettings(settings: ButcherSettings): Promise<void> {
    await this.ensureTables();
    const px = firmTablePrefix();
    const firm = padFirmNr();
    const allow = settings.allowCompleteWithoutStock !== false;
    const { rows } = await postgres.query(`SELECT id FROM ${px}_butcher_settings LIMIT 1`);
    if (rows.length) {
      await postgres.query(
        `UPDATE ${px}_butcher_settings
         SET default_cost_method = $1,
             default_warehouse_id = $2,
             allow_complete_without_stock = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [settings.defaultCostMethod, settings.defaultWarehouseId ?? null, allow, rows[0].id],
      );
    } else {
      await postgres.query(
        `INSERT INTO ${px}_butcher_settings
           (firm_nr, default_cost_method, default_warehouse_id, allow_complete_without_stock)
         VALUES ($1, $2, $3, $4)`,
        [firm, settings.defaultCostMethod, settings.defaultWarehouseId ?? null, allow],
      );
    }
  },

  async getRecipes(): Promise<ButcherRecipe[]> {
    await this.ensureTables();
    const px = firmTablePrefix();
    const { rows } = await postgres.query(
      `SELECT * FROM ${px}_butcher_recipes WHERE is_active = true ORDER BY name`,
    );
    if (!rows.length) return [];
    const ids = rows.map((r: any) => r.id);
    const inPh = ids.map((_: any, i: number) => `$${i + 1}`).join(', ');
    const { rows: outs } = await postgres.query(
      `SELECT * FROM ${px}_butcher_recipe_outputs WHERE recipe_id IN (${inPh}) ORDER BY sort_order, created_at`,
      ids,
    );
    const nameIds = [
      ...rows.map((r: any) => r.input_product_id),
      ...rows.map((r: any) => r.waste_product_id),
      ...outs.map((o: any) => o.product_id),
    ];
    const names = await productNameMap(nameIds);
    return rows.map((r: any) =>
      mapRecipe(
        r,
        outs.filter((o: any) => o.recipe_id === r.id),
        names,
      ),
    );
  },

  async saveRecipe(recipe: ButcherRecipe): Promise<string> {
    await this.ensureTables();
    const px = firmTablePrefix();
    const firm = padFirmNr();
    let recipeId = recipe.id;

    if (recipeId) {
      await postgres.query(
        `UPDATE ${px}_butcher_recipes SET
          code = $1, name = $2, animal_type = $3, input_product_id = $4, waste_product_id = $5,
          cost_method = $6, description = $7, is_active = $8, updated_at = CURRENT_TIMESTAMP
         WHERE id = $9`,
        [
          recipe.code?.trim() || null,
          recipe.name,
          recipe.animalType,
          recipe.inputProductId ?? null,
          recipe.wasteProductId ?? null,
          recipe.costMethod ?? null,
          recipe.description ?? null,
          recipe.isActive !== false,
          recipeId,
        ],
      );
      await postgres.query(`DELETE FROM ${px}_butcher_recipe_outputs WHERE recipe_id = $1`, [recipeId]);
    } else {
      const { rows } = await postgres.query(
        `INSERT INTO ${px}_butcher_recipes
          (firm_nr, code, name, animal_type, input_product_id, waste_product_id, cost_method, description, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          firm,
          recipe.code?.trim() || null,
          recipe.name,
          recipe.animalType,
          recipe.inputProductId ?? null,
          recipe.wasteProductId ?? null,
          recipe.costMethod ?? null,
          recipe.description ?? null,
          recipe.isActive !== false,
        ],
      );
      recipeId = rows[0].id;
    }

    for (let i = 0; i < recipe.outputs.length; i++) {
      const o = recipe.outputs[i];
      if (!o.productId) continue;
      await postgres.query(
        `INSERT INTO ${px}_butcher_recipe_outputs
          (recipe_id, product_id, sort_order, standard_ratio_percent, coefficient)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          recipeId,
          o.productId,
          o.sortOrder ?? i,
          o.standardRatioPercent ?? null,
          o.coefficient ?? 1,
        ],
      );
    }
    return recipeId!;
  },

  async deleteRecipe(id: string): Promise<void> {
    const px = firmTablePrefix();
    await postgres.query(
      `UPDATE ${px}_butcher_recipes SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id],
    );
  },

  async getOrders(limit = 100): Promise<ButcherOrder[]> {
    await this.ensureTables();
    const px = firmTablePrefix();
    const { rows } = await postgres.query(
      `SELECT o.*, r.name AS recipe_name
       FROM ${px}_butcher_orders o
       LEFT JOIN ${px}_butcher_recipes r ON r.id = o.recipe_id
       ORDER BY o.created_at DESC
       LIMIT $1`,
      [limit],
    );
    if (!rows.length) return [];
    const ids = rows.map((r: any) => r.id);
    const inPh = ids.map((_: any, i: number) => `$${i + 1}`).join(', ');
    const { rows: outs } = await postgres.query(
      `SELECT * FROM ${px}_butcher_order_outputs WHERE order_id IN (${inPh}) ORDER BY sort_order, created_at`,
      ids,
    );
    const nameIds = [
      ...rows.map((r: any) => r.input_product_id),
      ...outs.map((o: any) => o.product_id),
    ];
    const names = await productNameMap(nameIds);
    return rows.map((r: any) =>
      mapOrder(
        r,
        outs.filter((o: any) => o.order_id === r.id),
        names,
      ),
    );
  },

  async getOrderById(id: string): Promise<ButcherOrder | null> {
    const px = firmTablePrefix();
    const { rows } = await postgres.query(
      `SELECT o.*, r.name AS recipe_name
       FROM ${px}_butcher_orders o
       LEFT JOIN ${px}_butcher_recipes r ON r.id = o.recipe_id
       WHERE o.id = $1`,
      [id],
    );
    if (!rows.length) return null;
    const { rows: outs } = await postgres.query(
      `SELECT * FROM ${px}_butcher_order_outputs WHERE order_id = $1 ORDER BY sort_order`,
      [id],
    );
    const names = await productNameMap([
      rows[0].input_product_id,
      ...outs.map((o: any) => o.product_id),
    ]);
    return mapOrder(rows[0], outs, names);
  },

  async saveOrder(order: {
    id?: string;
    recipeId?: string | null;
    animalType: AnimalType;
    inputProductId: string;
    inputQtyKg: number;
    inputUnitCost: number;
    inputTotalCost: number;
    warehouseId?: string | null;
    wasteProductId?: string | null;
    lotNo?: string | null;
    costMethod: ButcherCostMethod;
    outputQtyKg: number;
    wasteQtyKg: number;
    wastePercent: number;
    wasteCostAllocated: number;
    costPerKgSalable: number;
    status: ButcherOrder['status'];
    note?: string;
    outputs: ButcherOrderOutput[];
    orderNo?: string;
  }): Promise<string> {
    await this.ensureTables();
    const px = firmTablePrefix();
    const firm = padFirmNr();
    const orderNo = order.orderNo || `KU-${Date.now()}`;
    let orderId = order.id;

    if (orderId) {
      await postgres.query(
        `UPDATE ${px}_butcher_orders SET
          recipe_id=$1, animal_type=$2, input_product_id=$3, input_qty_kg=$4, input_unit_cost=$5,
          input_total_cost=$6, warehouse_id=$7, waste_product_id=$8, lot_no=$9, cost_method=$10,
          output_qty_kg=$11, waste_qty_kg=$12, waste_percent=$13, waste_cost_allocated=$14,
          cost_per_kg_salable=$15, status=$16, note=$17,
          completed_at = CASE WHEN $16 = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $18`,
        [
          order.recipeId ?? null,
          order.animalType,
          order.inputProductId,
          order.inputQtyKg,
          order.inputUnitCost,
          order.inputTotalCost,
          order.warehouseId ?? null,
          order.wasteProductId ?? null,
          order.lotNo ?? null,
          order.costMethod,
          order.outputQtyKg,
          order.wasteQtyKg,
          order.wastePercent,
          order.wasteCostAllocated,
          order.costPerKgSalable,
          order.status,
          order.note ?? null,
          orderId,
        ],
      );
      await postgres.query(`DELETE FROM ${px}_butcher_order_outputs WHERE order_id = $1`, [orderId]);
    } else {
      const { rows } = await postgres.query(
        `INSERT INTO ${px}_butcher_orders (
          firm_nr, order_no, recipe_id, animal_type, input_product_id, input_qty_kg, input_unit_cost,
          input_total_cost, warehouse_id, waste_product_id, lot_no, cost_method, output_qty_kg,
          waste_qty_kg, waste_percent, waste_cost_allocated, cost_per_kg_salable, status, note,
          completed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
          CASE WHEN $18 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END
        ) RETURNING id`,
        [
          firm,
          orderNo,
          order.recipeId ?? null,
          order.animalType,
          order.inputProductId,
          order.inputQtyKg,
          order.inputUnitCost,
          order.inputTotalCost,
          order.warehouseId ?? null,
          order.wasteProductId ?? null,
          order.lotNo ?? null,
          order.costMethod,
          order.outputQtyKg,
          order.wasteQtyKg,
          order.wastePercent,
          order.wasteCostAllocated,
          order.costPerKgSalable,
          order.status,
          order.note ?? null,
        ],
      );
      orderId = rows[0].id;
    }

    for (let i = 0; i < order.outputs.length; i++) {
      const o = order.outputs[i];
      await postgres.query(
        `INSERT INTO ${px}_butcher_order_outputs (
          order_id, product_id, output_kg, coefficient, sale_price, unit_cost, total_cost, cost_share_percent, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          orderId,
          o.productId,
          o.outputKg,
          o.coefficient ?? 1,
          o.salePrice ?? 0,
          o.unitCost,
          o.totalCost,
          o.costSharePercent,
          o.sortOrder ?? i,
        ],
      );
    }
    return orderId!;
  },

  /**
   * Üretime alış faturası bağla (yalnızca henüz bağlı değilse).
   * Dönüş: true = bağlandı; false = zaten başka fatura var.
   */
  async linkPurchaseInvoice(params: {
    orderId: string;
    invoiceId: string;
    invoiceNo: string;
    supplierId?: string | null;
    supplierName?: string | null;
  }): Promise<boolean> {
    await this.ensureTables();
    const px = firmTablePrefix();
    const { rows } = await postgres.query(
      `UPDATE ${px}_butcher_orders
       SET purchase_invoice_id = $1,
           purchase_invoice_no = $2,
           supplier_id = COALESCE($3, supplier_id),
           supplier_name = COALESCE($4, supplier_name),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
         AND purchase_invoice_id IS NULL
       RETURNING id`,
      [
        params.invoiceId,
        params.invoiceNo,
        params.supplierId ?? null,
        params.supplierName ?? null,
        params.orderId,
      ],
    );
    return rows.length > 0;
  },

  /** Rapor: üretim geçmişi özeti */
  async reportProductionHistory(limit = 200): Promise<ButcherOrder[]> {
    return this.getOrders(limit);
  },

  /** Rapor: fire analizi (tamamlanan fişler) */
  async reportWasteAnalysis(): Promise<
    Array<{
      animalType: string;
      recipeName: string;
      orderCount: number;
      inputKg: number;
      outputKg: number;
      wasteKg: number;
      avgWastePercent: number;
      totalInputCost: number;
    }>
  > {
    await this.ensureTables();
    const px = firmTablePrefix();
    const { rows } = await postgres.query(
      `SELECT
         o.animal_type,
         COALESCE(r.name, '—') AS recipe_name,
         COUNT(*)::int AS order_count,
         COALESCE(SUM(o.input_qty_kg), 0) AS input_kg,
         COALESCE(SUM(o.output_qty_kg), 0) AS output_kg,
         COALESCE(SUM(o.waste_qty_kg), 0) AS waste_kg,
         COALESCE(AVG(o.waste_percent), 0) AS avg_waste_percent,
         COALESCE(SUM(o.input_total_cost), 0) AS total_input_cost
       FROM ${px}_butcher_orders o
       LEFT JOIN ${px}_butcher_recipes r ON r.id = o.recipe_id
       WHERE o.status = 'completed'
       GROUP BY o.animal_type, COALESCE(r.name, '—')
       ORDER BY waste_kg DESC`,
    );
    return rows.map((r: any) => ({
      animalType: r.animal_type,
      recipeName: r.recipe_name,
      orderCount: Number(r.order_count),
      inputKg: Number(r.input_kg),
      outputKg: Number(r.output_kg),
      wasteKg: Number(r.waste_kg),
      avgWastePercent: Number(r.avg_waste_percent),
      totalInputCost: Number(r.total_input_cost),
    }));
  },

  /** Rapor: ürün maliyet / verim */
  async reportProductCostYield(): Promise<
    Array<{
      productId: string;
      productName: string;
      totalKg: number;
      totalCost: number;
      avgUnitCost: number;
      avgSharePercent: number;
      lineCount: number;
    }>
  > {
    await this.ensureTables();
    const px = firmTablePrefix();
    const { rows } = await postgres.query(
      `SELECT
         out.product_id,
         COALESCE(SUM(out.output_kg), 0) AS total_kg,
         COALESCE(SUM(out.total_cost), 0) AS total_cost,
         COALESCE(AVG(out.unit_cost), 0) AS avg_unit_cost,
         COALESCE(AVG(out.cost_share_percent), 0) AS avg_share,
         COUNT(*)::int AS line_count
       FROM ${px}_butcher_order_outputs out
       INNER JOIN ${px}_butcher_orders o ON o.id = out.order_id AND o.status = 'completed'
       GROUP BY out.product_id
       ORDER BY total_kg DESC`,
    );
    const names = await productNameMap(rows.map((r: any) => r.product_id));
    return rows.map((r: any) => ({
      productId: r.product_id,
      productName: names.get(r.product_id) || r.product_id,
      totalKg: Number(r.total_kg),
      totalCost: Number(r.total_cost),
      avgUnitCost: Number(r.avg_unit_cost),
      avgSharePercent: Number(r.avg_share),
      lineCount: Number(r.line_count),
    }));
  },
};
