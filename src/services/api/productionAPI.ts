/**
 * Production API - Direct PostgreSQL Implementation
 * Handles Recipes (BOM) and Production Orders
 */

import { postgres, ERP_SETTINGS } from '../postgres';

export interface ProductionRecipeIngredient {
    id?: string;
    materialId: string;
    materialName?: string;
    quantity: number;
    unit: string;
    cost: number;
}

export interface ProductionRecipe {
    id?: string;
    productId: string;
    productName?: string;
    name: string;
    description?: string;
    totalCost: number;
    wastagePercent: number;
    isActive: boolean;
    ingredients: ProductionRecipeIngredient[];
}

export interface ProductionOrder {
    id?: string;
    orderNo: string;
    recipeId: string;
    recipeName?: string;
    productId: string;
    productName?: string;
    plannedQty: number;
    producedQty: number;
    status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
    startDate?: string;
    endDate?: string;
    completedAt?: string;
    note?: string;
    updatedAt?: string;
}

export const productionAPI = {
    /**
     * Get all recipes
     */
    async getRecipes(): Promise<ProductionRecipe[]> {
        try {
            const prefix = `rex_${ERP_SETTINGS.firmNr}`;
            const sql = `
                SELECT r.*, p.name as product_name,
                       json_agg(ri ORDER BY ri.created_at) FILTER (WHERE ri.id IS NOT NULL) as ingredients
                FROM ${prefix}_production_recipes r
                LEFT JOIN ${prefix}_products p ON p.id = r.product_id
                LEFT JOIN ${prefix}_production_recipe_ingredients ri ON ri.recipe_id = r.id
                WHERE r.is_active = true
                GROUP BY r.id, p.name
                ORDER BY r.name ASC
            `;
            const { rows } = await postgres.query(sql);
            return rows.map(mapDatabaseRecipe);
        } catch (error) {
            console.error('[ProductionAPI] getRecipes failed:', error);
            return [];
        }
    },

    /**
     * Save recipe (Create or Update)
     */
    async saveRecipe(recipe: ProductionRecipe): Promise<string> {
        const prefix = `rex_${ERP_SETTINGS.firmNr}`;
        let recipeId = recipe.id;

        if (recipeId) {
            await postgres.query(
                `UPDATE ${prefix}_production_recipes SET 
                 product_id=$2, name=$3, description=$4, total_cost=$5, wastage_percent=$6, updated_at=NOW() 
                 WHERE id=$1`,
                [recipeId, recipe.productId, recipe.name, recipe.description, recipe.totalCost, recipe.wastagePercent]
            );
            // Delete old ingredients
            await postgres.query(`DELETE FROM ${prefix}_production_recipe_ingredients WHERE recipe_id=$1`, [recipeId]);
        } else {
            const { rows } = await postgres.query(
                `INSERT INTO ${prefix}_production_recipes (firm_nr, product_id, name, description, total_cost, wastage_percent)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [ERP_SETTINGS.firmNr, recipe.productId, recipe.name, recipe.description, recipe.totalCost, recipe.wastagePercent]
            );
            recipeId = rows[0].id;
        }

        // Insert ingredients
        for (const ing of recipe.ingredients) {
            await postgres.query(
                `INSERT INTO ${prefix}_production_recipe_ingredients (recipe_id, material_id, quantity, unit, cost)
                 VALUES ($1, $2, $3, $4, $5)`,
                [recipeId, ing.materialId, ing.quantity, ing.unit, ing.cost]
            );
        }

        return recipeId!;
    },

    /**
     * Get all production orders
     */
    async getOrders(): Promise<ProductionOrder[]> {
        try {
            const prefix = `rex_${ERP_SETTINGS.firmNr}`;
            const sql = `
                SELECT o.*, p.name as product_name, r.name as recipe_name
                FROM ${prefix}_production_orders o
                LEFT JOIN ${prefix}_products p ON p.id = o.product_id
                LEFT JOIN ${prefix}_production_recipes r ON r.id = o.recipe_id
                ORDER BY o.created_at DESC
            `;
            const { rows } = await postgres.query(sql);
            return rows.map(mapDatabaseOrder);
        } catch (error) {
            console.error('[ProductionAPI] getOrders failed:', error);
            return [];
        }
    },

    /**
     * Save production order
     */
    async saveOrder(order: Partial<ProductionOrder>): Promise<string> {
        const prefix = `rex_${ERP_SETTINGS.firmNr}`;
        if (order.id) {
            const fields: string[] = [];
            const vals: any[] = [order.id];
            let i = 2;
            if (order.status) { fields.push(`status=$${i++}`); vals.push(order.status); }
            if (order.producedQty !== undefined) { fields.push(`produced_qty=$${i++}`); vals.push(order.producedQty); }
            if (order.status === 'completed') { fields.push(`completed_at=NOW()`); }

            await postgres.query(
                `UPDATE ${prefix}_production_orders SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$1`,
                vals
            );
            return order.id;
        } else {
            const orderNo = `UR-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
            const { rows } = await postgres.query(
                `INSERT INTO ${prefix}_production_orders (firm_nr, order_no, recipe_id, product_id, planned_qty, status, start_date, end_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [ERP_SETTINGS.firmNr, orderNo, order.recipeId, order.productId, order.plannedQty, order.status || 'draft', order.startDate, order.endDate]
            );
            return rows[0].id;
        }
    }
};

function mapDatabaseRecipe(r: any): ProductionRecipe {
    return {
        id: r.id,
        productId: r.product_id,
        productName: r.product_name,
        name: r.name,
        description: r.description,
        totalCost: Number(r.total_cost || 0),
        wastagePercent: Number(r.wastage_percent || 0),
        isActive: r.is_active,
        ingredients: (r.ingredients || []).map((ing: any) => ({
            id: ing.id,
            materialId: ing.material_id,
            quantity: Number(ing.quantity || 0),
            unit: ing.unit,
            cost: Number(ing.cost || 0)
        }))
    };
}

function mapDatabaseOrder(o: any): ProductionOrder {
    return {
        id: o.id,
        orderNo: o.order_no,
        recipeId: o.recipe_id,
        recipeName: o.recipe_name,
        productId: o.product_id,
        productName: o.product_name,
        plannedQty: Number(o.planned_qty || 0),
        producedQty: Number(o.produced_qty || 0),
        status: o.status,
        startDate: o.start_date,
        endDate: o.end_date,
        completedAt: o.completed_at,
        note: o.note,
        updatedAt: o.updated_at
    };
}
