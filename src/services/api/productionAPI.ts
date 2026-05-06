/**
 * Production API - Direct PostgreSQL Implementation
 * Handles Recipes (BOM) and Production Orders
 */

import { postgres, ERP_SETTINGS, DB_SETTINGS } from '../postgres';

function padFirmNr(): string {
    return String(ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
}

function firmTablePrefix(): string {
    return `rex_${padFirmNr()}`;
}

function isRestApi(): boolean {
    return DB_SETTINGS.connectionProvider === 'rest_api';
}

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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const px = firmTablePrefix();
                const recipes = await postgrest.get<any[]>(
                    `/${px}_production_recipes`,
                    { select: '*', is_active: 'eq.true', order: 'name.asc' },
                    { schema: 'public' }
                );
                const list = Array.isArray(recipes) ? recipes : [];
                if (list.length === 0) return [];
                const pids = [...new Set(list.map((r: any) => r.product_id).filter(Boolean))];
                const productMap = new Map<string, string>();
                if (pids.length) {
                    const inList = pids.map(id => encodeURIComponent(id)).join(',');
                    const prows = await postgrest.get<any[]>(
                        `/${px}_products`,
                        { select: 'id,name', id: `in.(${inList})` },
                        { schema: 'public' }
                    );
                    (Array.isArray(prows) ? prows : []).forEach((p: any) => productMap.set(p.id, p.name));
                }
                const rids = list.map((r: any) => r.id).filter(Boolean);
                const ingByRecipe = new Map<string, any[]>();
                if (rids.length) {
                    const inList = rids.map(id => encodeURIComponent(id)).join(',');
                    const irows = await postgrest.get<any[]>(
                        `/${px}_production_recipe_ingredients`,
                        { select: '*', recipe_id: `in.(${inList})`, order: 'created_at.asc' },
                        { schema: 'public' }
                    );
                    (Array.isArray(irows) ? irows : []).forEach((row: any) => {
                        const rid = row.recipe_id;
                        if (!ingByRecipe.has(rid)) ingByRecipe.set(rid, []);
                        ingByRecipe.get(rid)!.push(row);
                    });
                }
                return list.map((r: any) =>
                    mapDatabaseRecipe({
                        ...r,
                        product_name: productMap.get(r.product_id),
                        ingredients: ingByRecipe.get(r.id) || [],
                    })
                );
            }
            const prefix = firmTablePrefix();
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
        const prefix = firmTablePrefix();
        const firmNr = padFirmNr();
        let recipeId = recipe.id;

        if (isRestApi()) {
            const { postgrest } = await import('./postgrestClient');
            if (recipeId) {
                await postgrest.patch(
                    `/${prefix}_production_recipes?id=eq.${encodeURIComponent(recipeId)}`,
                    {
                        product_id: recipe.productId,
                        name: recipe.name,
                        description: recipe.description ?? null,
                        total_cost: recipe.totalCost,
                        wastage_percent: recipe.wastagePercent,
                    },
                    { schema: 'public', prefer: 'return=minimal' }
                );
                await postgrest.delete(
                    `/${prefix}_production_recipe_ingredients?recipe_id=eq.${encodeURIComponent(recipeId)}`,
                    { schema: 'public', prefer: 'return=minimal' }
                );
            } else {
                const created = await postgrest.post<any[]>(
                    `/${prefix}_production_recipes`,
                    {
                        firm_nr: firmNr,
                        product_id: recipe.productId,
                        name: recipe.name,
                        description: recipe.description ?? null,
                        total_cost: recipe.totalCost,
                        wastage_percent: recipe.wastagePercent,
                    },
                    { schema: 'public', prefer: 'return=representation' }
                );
                const row = Array.isArray(created) ? created[0] : created;
                recipeId = (row as any)?.id;
            }
            if (!recipeId) throw new Error('Reçete kaydedilemedi');
            for (const ing of recipe.ingredients) {
                await postgrest.post(
                    `/${prefix}_production_recipe_ingredients`,
                    {
                        recipe_id: recipeId,
                        material_id: ing.materialId,
                        quantity: ing.quantity,
                        unit: ing.unit,
                        cost: ing.cost,
                    },
                    { schema: 'public', prefer: 'return=minimal' }
                );
            }
            return recipeId;
        }

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
                [firmNr, recipe.productId, recipe.name, recipe.description, recipe.totalCost, recipe.wastagePercent]
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
            if (isRestApi()) {
                const { postgrest } = await import('./postgrestClient');
                const px = firmTablePrefix();
                const orows = await postgrest.get<any[]>(
                    `/${px}_production_orders`,
                    { select: '*', order: 'created_at.desc' },
                    { schema: 'public' }
                );
                const list = Array.isArray(orows) ? orows : [];
                if (list.length === 0) return [];
                const pids = [...new Set(list.map((o: any) => o.product_id).filter(Boolean))];
                const rids = [...new Set(list.map((o: any) => o.recipe_id).filter(Boolean))];
                const productMap = new Map<string, string>();
                const recipeMap = new Map<string, string>();
                if (pids.length) {
                    const inList = pids.map(id => encodeURIComponent(id)).join(',');
                    const prows = await postgrest.get<any[]>(
                        `/${px}_products`,
                        { select: 'id,name', id: `in.(${inList})` },
                        { schema: 'public' }
                    );
                    (Array.isArray(prows) ? prows : []).forEach((p: any) => productMap.set(p.id, p.name));
                }
                if (rids.length) {
                    const inList = rids.map(id => encodeURIComponent(id)).join(',');
                    const rrows = await postgrest.get<any[]>(
                        `/${px}_production_recipes`,
                        { select: 'id,name', id: `in.(${inList})` },
                        { schema: 'public' }
                    );
                    (Array.isArray(rrows) ? rrows : []).forEach((r: any) => recipeMap.set(r.id, r.name));
                }
                return list.map((o: any) =>
                    mapDatabaseOrder({
                        ...o,
                        product_name: productMap.get(o.product_id),
                        recipe_name: recipeMap.get(o.recipe_id),
                    })
                );
            }
            const prefix = firmTablePrefix();
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
        const prefix = firmTablePrefix();
        const firmNr = padFirmNr();
        if (isRestApi()) {
            const { postgrest } = await import('./postgrestClient');
            if (order.id) {
                const body: Record<string, unknown> = {};
                if (order.status) body.status = order.status;
                if (order.producedQty !== undefined) body.produced_qty = order.producedQty;
                if (order.status === 'completed') body.completed_at = new Date().toISOString();
                if (Object.keys(body).length > 0) {
                    await postgrest.patch(
                        `/${prefix}_production_orders?id=eq.${encodeURIComponent(order.id)}`,
                        body,
                        { schema: 'public', prefer: 'return=minimal' }
                    );
                }
                return order.id;
            }
            const orderNo = `UR-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
            const created = await postgrest.post<any[]>(
                `/${prefix}_production_orders`,
                {
                    firm_nr: firmNr,
                    order_no: orderNo,
                    recipe_id: order.recipeId,
                    product_id: order.productId,
                    planned_qty: order.plannedQty,
                    status: order.status || 'draft',
                    start_date: order.startDate ?? null,
                    end_date: order.endDate ?? null,
                },
                { schema: 'public', prefer: 'return=representation' }
            );
            const row = Array.isArray(created) ? created[0] : created;
            return String((row as any)?.id || '');
        }
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
                [firmNr, orderNo, order.recipeId, order.productId, order.plannedQty, order.status || 'draft', order.startDate, order.endDate]
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
