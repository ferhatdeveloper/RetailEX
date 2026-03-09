import { PostgresConnection, ERP_SETTINGS } from './postgres';
import { Table, Staff, LoginResult } from '../components/restaurant/types';

export class RestaurantService {
    public static get db() { return PostgresConnection.getInstance(); }
    public static get firmNr() { return ERP_SETTINGS.firmNr; }
    public static get periodNr() { return ERP_SETTINGS.periodNr; }

    // -------------------------------------------------------------------------
    // FLOORS  (rest.floors — schema-qualified, no prefix rewrite)
    // -------------------------------------------------------------------------

    static async getFloors(storeId?: string) {
        let sql = 'SELECT * FROM rest.floors WHERE is_active = true';
        const params: any[] = [];
        if (storeId) {
            sql += ' AND store_id = $1';
            params.push(storeId);
        }
        sql += ' ORDER BY display_order';
        const { rows } = await this.db.query(sql, params);
        return rows;
    }

    static async saveFloor(floor: {
        id?: string;
        store_id: string | null;
        name: string;
        color?: string;
        display_order?: number;
    }) {
        if (floor.id) {
            const sql = `
                UPDATE rest.floors
                SET name=$2, color=$3, display_order=$4, updated_at=NOW()
                WHERE id=$1
                RETURNING *
            `;
            const { rows } = await this.db.query(sql, [
                floor.id, floor.name, floor.color ?? '#3B82F6', floor.display_order ?? 0
            ]);
            return rows[0];
        }
        const sql = `
            INSERT INTO rest.floors (store_id, name, color, display_order)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const { rows } = await this.db.query(sql, [
            floor.store_id, floor.name, floor.color ?? '#3B82F6', floor.display_order ?? 0
        ]);
        return rows[0];
    }

    static async deleteFloor(floorId: string) {
        await this.db.query('UPDATE rest.floors SET is_active=false WHERE id=$1', [floorId]);
    }

    // -------------------------------------------------------------------------
    // TABLES  (rex_{firmNr}_rest_tables — auto-prefixed by pg service)
    // -------------------------------------------------------------------------

    static async getTables(floorId?: string) {
        let sql = 'SELECT * FROM rest_tables';
        const params: any[] = [];
        if (floorId) {
            sql += ' WHERE floor_id = $1';
            params.push(floorId);
        }
        sql += ' ORDER BY number';
        const { rows } = await this.db.query(sql, params);
        return rows as Table[];
    }

    static async addTable(table: {
        floor_id?: string;
        number: string;
        seats?: number;
        pos_x?: number;
        pos_y?: number;
        is_large?: boolean;
    }) {
        try {
            const sql = `
                INSERT INTO rest_tables (floor_id, number, seats, pos_x, pos_y, is_large)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            `;
            const { rows } = await this.db.query(sql, [
                (table.floor_id && table.floor_id.trim() !== '') ? table.floor_id : null,
                table.number,
                table.seats ?? 4,
                table.pos_x ?? 0,
                table.pos_y ?? 0,
                table.is_large ?? false
            ]);
            return rows[0];
        } catch (error) {
            console.error('[RestaurantService] addTable error:', error);
            throw error;
        }
    }

    static async updateTableStatus(
        tableId: string,
        status: string,
        waiter?: string,
        staffId?: string,
        total: number = 0
    ) {
        const sql = `
            UPDATE rest_tables
            SET status=$2, waiter=$3, staff_id=$4, total=$5, updated_at=NOW()
            WHERE id=$1
        `;
        await this.db.query(sql, [tableId, status, waiter ?? null, staffId ?? null, total]);
    }

    static async lockTable(tableId: string, staffId: string, staffName: string) {
        const sql = `
            UPDATE rest_tables
            SET locked_by_staff_id = $2, locked_by_staff_name = $3, locked_at = NOW()
            WHERE id = $1 AND (locked_by_staff_id IS NULL OR locked_by_staff_id = $2)
        `;
        const { rowCount } = await this.db.query(sql, [tableId, staffId, staffName]);
        return (rowCount || 0) > 0;
    }

    static async unlockTable(tableId: string) {
        const sql = `
            UPDATE rest_tables
            SET locked_by_staff_id = NULL, locked_by_staff_name = NULL, locked_at = NULL
            WHERE id = $1
        `;
        await this.db.query(sql, [tableId]);
    }

    static async updateTablePosition(tableId: string, posX: number, posY: number) {
        await this.db.query(
            'UPDATE rest_tables SET pos_x=$2, pos_y=$3, updated_at=NOW() WHERE id=$1',
            [tableId, posX, posY]
        );
    }

    static async updateTable(tableId: string, updates: Partial<Table>) {
        const sets: string[] = [];
        const vals: any[] = [tableId];
        let i = 2;

        // Map camelCase TS properties to snake_case DB columns
        if (updates.number !== undefined) { sets.push(`number=$${i++}`); vals.push(updates.number); }
        if (updates.seats !== undefined) { sets.push(`seats=$${i++}`); vals.push(updates.seats); }
        if (updates.floorId !== undefined) { sets.push(`floor_id=$${i++}`); vals.push(updates.floorId); }
        if (updates.isLarge !== undefined) { sets.push(`is_large=$${i++}`); vals.push(updates.isLarge); }
        // For positions, we support both camelCase and snake_case if someone passes it
        const posX = (updates as any).posX ?? (updates as any).pos_x;
        const posY = (updates as any).posY ?? (updates as any).pos_y;
        if (posX !== undefined) { sets.push(`pos_x=$${i++}`); vals.push(posX); }
        if (posY !== undefined) { sets.push(`pos_y=$${i++}`); vals.push(posY); }

        if (sets.length === 0) return;
        const sql = `UPDATE rest_tables SET ${sets.join(',')}, updated_at=NOW() WHERE id=$1`;
        await this.db.query(sql, vals);
    }

    static async deleteTable(tableId: string) {
        await this.db.query('DELETE FROM rest_tables WHERE id=$1', [tableId]);
    }

    // -------------------------------------------------------------------------
    // ORDERS  (rex_{firmNr}_{periodNr}_rest_orders — period auto-prefix)
    // -------------------------------------------------------------------------

    static async createOrder(params: {
        tableId: string;
        floorId?: string;
        waiter?: string;
        customerId?: string;
        note?: string;
    }) {
        // Generate order number: RES-{year}-{seq}
        const year = new Date().getFullYear();
        const { rows: seqRows } = await this.db.query(
            `SELECT COUNT(*)+1 AS seq FROM rest_orders WHERE order_no LIKE $1`,
            [`RES-${year}-%`]
        );
        const seq = String(seqRows[0]?.seq ?? 1).padStart(5, '0');
        const orderNo = `RES-${year}-${seq}`;

        const sql = `
            INSERT INTO rest_orders
                (order_no, table_id, floor_id, waiter, customer_id, status, note)
            VALUES ($1, $2, $3, $4, $5, 'open', $6)
            RETURNING *
        `;
        const { rows } = await this.db.query(sql, [
            orderNo,
            params.tableId,
            (params.floorId && params.floorId.trim() !== '') ? params.floorId : null,
            params.waiter ?? null,
            (params.customerId && params.customerId.trim() !== '') ? params.customerId : null,
            params.note ?? null
        ]);
        return rows[0];
    }

    static async getActiveOrder(tableId: string) {
        const sql = `
            SELECT o.*,
                   t.number as table_number,
                   json_agg(i ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL) as items
            FROM rest_orders o
            LEFT JOIN rest_tables t ON t.id = o.table_id
            LEFT JOIN rest_order_items i ON i.order_id = o.id
            WHERE o.table_id = $1 AND o.status = 'open'
            GROUP BY o.id, t.number
            ORDER BY o.opened_at DESC
            LIMIT 1
        `;
        const { rows } = await this.db.query(sql, [tableId]);
        return rows[0] ?? null;
    }

    static async addOrderItem(orderId: string, item: {
        productId?: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        discountPct?: number;
        course?: string;
        note?: string;
    }) {
        const subtotal = item.quantity * item.unitPrice * (1 - (item.discountPct ?? 0) / 100);
        const sql = `
            INSERT INTO rest_order_items
                (order_id, product_id, product_name, quantity, unit_price,
                 discount_pct, subtotal, course, note)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;
        const { rows } = await this.db.query(sql, [
            orderId,
            (item.productId && item.productId.trim() !== '') ? item.productId : null,
            item.productName,
            item.quantity,
            item.unitPrice,
            item.discountPct ?? 0,
            subtotal,
            item.course ?? null,
            item.note ?? null
        ]);
        // Update order total
        await this.db.query(
            `UPDATE rest_orders SET total_amount = (
                SELECT COALESCE(SUM(subtotal), 0) FROM rest_order_items WHERE order_id = $1
             ), updated_at=NOW() WHERE id=$1`,
            [orderId]
        );
        return rows[0];
    }

    static async updateOrderItem(itemId: string, updates: {
        quantity?: number;
        discountPct?: number;
        note?: string;
        status?: string;
        isComplimentary?: boolean;
    }) {
        const sets: string[] = [];
        const vals: any[] = [itemId];
        let i = 2;
        if (updates.quantity !== undefined) { sets.push(`quantity=$${i++}`); vals.push(updates.quantity); }
        if (updates.discountPct !== undefined) { sets.push(`discount_pct=$${i++}`); vals.push(updates.discountPct); }
        if (updates.note !== undefined) { sets.push(`note=$${i++}`); vals.push(updates.note); }
        if (updates.status !== undefined) { sets.push(`status=$${i++}`); vals.push(updates.status); }
        if (updates.isComplimentary !== undefined) { sets.push(`is_complimentary=$${i++}`); vals.push(updates.isComplimentary); }
        if (sets.length === 0) return;
        // Recompute subtotal when qty/discount changes
        sets.push(`subtotal = quantity * unit_price * (1 - discount_pct/100)`);
        await this.db.query(`UPDATE rest_order_items SET ${sets.join(',')} WHERE id=$1`, vals);
    }

    static async removeOrderItem(itemId: string) {
        const { rows } = await this.db.query(
            'DELETE FROM rest_order_items WHERE id=$1 RETURNING order_id',
            [itemId]
        );
        const orderId = rows[0]?.order_id;
        if (orderId) {
            await this.db.query(
                `UPDATE rest_orders SET total_amount = (
                    SELECT COALESCE(SUM(subtotal), 0) FROM rest_order_items WHERE order_id = $1
                 ), updated_at=NOW() WHERE id=$1`,
                [orderId]
            );
        }
    }

    static async closeOrder(orderId: string, params?: {
        discountAmount?: number;
        taxAmount?: number;
        paymentMethod?: string;
    }) {
        await this.db.query(
            `UPDATE rest_orders
             SET status='closed', closed_at=NOW(), billed_at=COALESCE(billed_at,NOW()),
                 discount_amount=$2, tax_amount=$3, payment_method=$4, updated_at=NOW()
             WHERE id=$1`,
            [orderId, params?.discountAmount ?? 0, params?.taxAmount ?? 0, params?.paymentMethod ?? null]
        );
    }

    /**
     * Consolidates closing the order and resetting the table status into a single service call.
     * Also closes any linked (merged) orders and clears linked_order_ids.
     */
    static async completeTablePayment(params: {
        tableId: string;
        orderId: string;
        linkedOrderIds?: string[];
        discountAmount?: number;
        taxAmount?: number;
        paymentMethod?: string;
    }) {
        try {
            // Close main order
            await this.closeOrder(params.orderId, {
                discountAmount: params.discountAmount,
                taxAmount: params.taxAmount,
                paymentMethod: params.paymentMethod,
            });

            // Close all linked (merged table) orders
            for (const linkedId of (params.linkedOrderIds || [])) {
                await this.closeOrder(linkedId, { paymentMethod: params.paymentMethod });
            }

            // Reset table: empty status + clear linked_order_ids
            await this.db.query(
                `UPDATE rest_tables
                 SET status = 'empty', waiter = NULL, staff_id = NULL, total = 0,
                     linked_order_ids = '{}', updated_at = NOW()
                 WHERE id = $1`,
                [params.tableId]
            );
        } catch (error) {
            console.error('[RestaurantService] completeTablePayment failed:', error);
            throw error;
        }
    }

    /**
     * Links source table's order to target table WITHOUT moving items.
     * Each order keeps its own fatura (invoice) code in DB.
     * Returns the source order record (with order_no/faturaNo).
     */
    static async linkOrderToTable(sourceTableId: string, targetTableId: string) {
        const sourceOrder = await this.getActiveOrder(sourceTableId);
        if (!sourceOrder) return null;

        // Append source order ID to target table's linked_order_ids array
        await this.db.query(
            `UPDATE rest_tables
             SET linked_order_ids = array_append(COALESCE(linked_order_ids, '{}'), $2),
                 updated_at = NOW()
             WHERE id = $1`,
            [targetTableId, sourceOrder.id]
        );

        // Clear source table (order stays open in DB)
        await this.updateTableStatus(sourceTableId, 'empty', undefined, undefined, 0);
        await this.db.query(
            `UPDATE rest_tables SET linked_order_ids = '{}', updated_at = NOW() WHERE id = $1`,
            [sourceTableId]
        );

        return sourceOrder;
    }

    /**
     * Fetches multiple open orders by their IDs (for merged table display).
     */
    static async getLinkedOrders(orderIds: string[]) {
        if (!orderIds || orderIds.length === 0) return [];
        const { rows } = await this.db.query(
            `SELECT o.*,
                    t.number as table_number,
                    json_agg(i ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL) as items
             FROM rest_orders o
             LEFT JOIN rest_tables t ON t.id = o.table_id
             LEFT JOIN rest_order_items i ON i.order_id = o.id
             WHERE o.id = ANY($1::uuid[]) AND o.status = 'open'
             GROUP BY o.id, t.number`,
            [orderIds]
        );
        return rows;
    }

    /**
     * Merges source table orders into target table.
     */
    static async mergeTables(sourceTableId: string, targetTableId: string) {
        const sourceOrder = await this.getActiveOrder(sourceTableId);
        if (!sourceOrder) return;

        let targetOrder = await this.getActiveOrder(targetTableId);
        if (!targetOrder) {
            // If target has no active order, just transfer the whole order
            await this.transferTable(sourceTableId, targetTableId);
            return;
        }

        // Move items from source to target order
        await this.db.query(
            'UPDATE rest_order_items SET order_id = $2 WHERE order_id = $1',
            [sourceOrder.id, targetOrder.id]
        );

        // Recompute target order total
        await this.db.query(
            `UPDATE rest_orders SET total_amount = (
                SELECT COALESCE(SUM(subtotal), 0) FROM rest_order_items WHERE order_id = $1
             ), updated_at=NOW() WHERE id=$1`,
            [targetOrder.id]
        );

        // Delete (or close) the now-empty source order
        await this.db.query('DELETE FROM rest_orders WHERE id = $1', [sourceOrder.id]);

        // Update table statuses
        const { rows } = await this.db.query('SELECT waiter, total_amount FROM rest_orders WHERE id = $1', [targetOrder.id]);
        await this.updateTableStatus(targetTableId, 'occupied', rows[0]?.waiter, undefined, rows[0]?.total_amount || 0);
        await this.updateTableStatus(sourceTableId, 'empty', undefined, undefined, 0);
    }

    /**
     * Transfers an entire order from one table to another.
     */
    static async transferTable(sourceTableId: string, targetTableId: string) {
        const order = await this.getActiveOrder(sourceTableId);
        if (!order) return;

        // Change table ID on the order
        await this.db.query(
            'UPDATE rest_orders SET table_id = $2, updated_at=NOW() WHERE id = $1',
            [order.id, targetTableId]
        );

        // Update table statuses
        await this.updateTableStatus(targetTableId, 'occupied', order.waiter, undefined, order.total_amount || 0);
        await this.updateTableStatus(sourceTableId, 'empty', undefined, undefined, 0);
    }

    static async moveTable(fromTableId: string, toTableId: string) {
        await this.transferTable(fromTableId, toTableId);
    }

    static async splitOrder(orderId: string, itemIds: string[], targetTableId?: string) {
        // 1. Create a new "child" order
        const { rows: originalOrder } = await this.db.query('SELECT * FROM rest_orders WHERE id=$1', [orderId]);
        if (originalOrder.length === 0) throw new Error('Original order not found.');

        const base = originalOrder[0];
        const newOrderNo = `${base.order_no}-S${Date.now().toString().slice(-4)}`;

        const { rows: newOrder } = await this.db.query(
            `INSERT INTO rest_orders (order_no, table_id, floor_id, waiter, customer_id, parent_order_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'open') RETURNING id`,
            [newOrderNo, targetTableId || base.table_id, base.floor_id, base.waiter, base.customer_id, orderId]
        );

        const newOrderId = newOrder[0].id;

        // 2. Move items
        for (const itemId of itemIds) {
            await this.db.query('UPDATE rest_order_items SET order_id=$1 WHERE id=$2', [newOrderId, itemId]);
        }

        // 3. Recalculate both orders
        const recalculateSql = `
            UPDATE rest_orders SET total_amount = (
                SELECT COALESCE(SUM(subtotal), 0) FROM rest_order_items WHERE order_id = $1
            ), updated_at=NOW() WHERE id=$1
        `;
        await this.db.query(recalculateSql, [orderId]);
        await this.db.query(recalculateSql, [newOrderId]);

        return newOrderId;
    }

    static async updateOrderItemOptions(itemId: string, options: any) {
        await this.db.query(
            'UPDATE rest_order_items SET options=$1 WHERE id=$2',
            [JSON.stringify(options), itemId]
        );
    }

    static async cancelOrder(orderId: string) {
        await this.db.query(
            `UPDATE rest_orders SET status='cancelled', updated_at=NOW() WHERE id=$1`,
            [orderId]
        );
    }

    static async getOrderHistory(params?: {
        fromDate?: string;
        toDate?: string;
        status?: string;
        tableId?: string;
        limit?: number;
        offset?: number;
    }) {
        let sql = `
            SELECT o.*,
                   t.number as table_number,
                   json_agg(i ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL) as items
            FROM rest_orders o
            LEFT JOIN rest_tables t ON t.id = o.table_id
            LEFT JOIN rest_order_items i ON i.order_id = o.id
            WHERE 1=1
        `;
        const vals: any[] = [];
        let idx = 1;
        if (params?.fromDate) { sql += ` AND o.opened_at >= $${idx++}`; vals.push(params.fromDate); }
        if (params?.toDate) { sql += ` AND o.opened_at <  $${idx++}`; vals.push(params.toDate); }
        if (params?.status) { sql += ` AND o.status = $${idx++}`; vals.push(params.status); }
        if (params?.tableId) { sql += ` AND o.table_id = $${idx++}`; vals.push(params.tableId); }
        sql += ' GROUP BY o.id, t.number ORDER BY o.opened_at DESC';
        if (params?.limit) { sql += ` LIMIT $${idx++}`; vals.push(params.limit); }
        if (params?.offset) { sql += ` OFFSET $${idx++}`; vals.push(params.offset); }
        const { rows } = await this.db.query(sql, vals);
        return rows;
    }

    // -------------------------------------------------------------------------
    // KITCHEN  (rex_{firmNr}_{periodNr}_rest_kitchen_orders)
    // -------------------------------------------------------------------------

    static async createKitchenOrder(params: {
        orderId: string;
        tableNumber: string;
        floorName?: string;
        waiter?: string;
        staffId?: string; // Phase 3
        note?: string;
        items: Array<{
            orderItemId: string;
            productId: string; // Added productId to fetch prep time
            productName: string;
            quantity: number;
            course?: string;
            note?: string;
        }>;
    }) {
        // 1. Fetch preparation times for all products
        const productIds = params.items.map(i => i.productId);
        const { rows: products } = await this.db.query(
            'SELECT id, preparation_time FROM products WHERE id = ANY($1)',
            [productIds]
        );

        const prepTimeMap = new Map(products.map((p: any) => [p.id, p.preparation_time || 5]));

        // --- PHASE 2.6: KITCHEN LOAD ANALYSIS ---
        const { rows: activeCounts } = await this.db.query(
            "SELECT COUNT(*) as count FROM rest.rest_kitchen_items WHERE status IN ('new', 'cooking')"
        );
        const activeItemCount = parseInt(activeCounts[0].count);
        const loadMultiplier = 1 + (activeItemCount * 0.05); // +5% per active item
        // ----------------------------------------

        const maxPrepTime = Math.max(...params.items.map(i => prepTimeMap.get(i.productId) || 5));
        const adjustedMaxPrepTime = maxPrepTime * loadMultiplier;

        const now = new Date();
        const estimatedFinish = new Date(now.getTime() + adjustedMaxPrepTime * 60000);

        // 2. Create Kitchen Order
        const { rows: koRows } = await this.db.query(
            `INSERT INTO rest.rest_kitchen_orders
                (order_id, table_number, floor_name, waiter, staff_id, status, note, estimated_ready_at)
             VALUES ($1, $2, $3, $4, $5, 'new', $6, $7)
             RETURNING id`,
            [params.orderId, params.tableNumber, params.floorName ?? null,
            params.waiter ?? null, params.staffId ?? null, params.note ?? null, estimatedFinish]
        );
        const kitchenOrderId = koRows[0].id;

        // 3. Create Kitchen Items with Timing Sync
        for (const item of params.items) {
            const itemPrepTime = (prepTimeMap.get(item.productId) || 5) * loadMultiplier;
            const startAt = new Date(estimatedFinish.getTime() - itemPrepTime * 60000);

            await this.db.query(
                `INSERT INTO rest.rest_kitchen_items
                    (kitchen_order_id, order_item_id, product_name, quantity, course, note, 
                     preparation_time, start_at, estimated_ready_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                    kitchenOrderId, item.orderItemId, item.productName,
                    item.quantity, item.course ?? null, item.note ?? null,
                    Math.round(itemPrepTime), startAt, estimatedFinish
                ]
            );

            await this.db.query(
                `UPDATE rest.rest_order_items SET sent_to_kitchen_at=NOW() WHERE id=$1`,
                [item.orderItemId]
            );
        }
        return kitchenOrderId;
    }

    static async getActiveKitchenOrders() {
        const sql = `
            SELECT ko.*,
                   json_agg(ki ORDER BY ki.id) FILTER (WHERE ki.id IS NOT NULL) as items
            FROM rest_kitchen_orders ko
            LEFT JOIN rest_kitchen_items ki ON ki.kitchen_order_id = ko.id
            WHERE ko.status NOT IN ('served')
            GROUP BY ko.id
            ORDER BY ko.sent_at ASC
        `;
        const { rows } = await this.db.query(sql);
        return rows;
    }

    static async updateKitchenOrderStatus(
        kitchenOrderId: string,
        status: 'new' | 'cooking' | 'ready' | 'served'
    ) {
        const extra =
            status === 'ready' ? ', cooked_at=NOW()' :
                status === 'served' ? ', served_at=NOW()' : '';
        await this.db.query(
            `UPDATE rest_kitchen_orders SET status=$2${extra}, updated_at=NOW() WHERE id=$1`,
            [kitchenOrderId, status]
        );
    }

    // -------------------------------------------------------------------------
    // RECIPES  (rex_{firmNr}_rest_recipes + rest_recipe_ingredients)
    // -------------------------------------------------------------------------

    static async getRecipes() {
        const sql = `
            SELECT r.*,
                   p.name as menu_item_name,
                   json_agg(
                       json_build_object(
                           'id', ri.id,
                           'material_id', ri.material_id,
                           'material_name', mp.name,
                           'quantity', ri.quantity,
                           'unit', ri.unit,
                           'cost', ri.cost
                       ) ORDER BY ri.id
                   ) FILTER (WHERE ri.id IS NOT NULL) as ingredients
            FROM rest_recipes r
            JOIN products p ON p.id = r.menu_item_id
            LEFT JOIN rest_recipe_ingredients ri ON ri.recipe_id = r.id
            LEFT JOIN products mp ON mp.id = ri.material_id
            WHERE r.is_active = true
            GROUP BY r.id, p.name
        `;
        const { rows } = await this.db.query(sql);
        return rows;
    }

    static async saveRecipe(recipe: {
        id?: string;
        menuItemId: string;
        totalCost?: number;
        wastagePercent?: number;
        ingredients: Array<{
            id?: string;
            materialId: string;
            quantity: number;
            unit?: string;
            cost?: number;
        }>;
    }) {
        let recipeId = recipe.id;
        if (recipeId) {
            await this.db.query(
                `UPDATE rest_recipes SET total_cost=$2, wastage_percent=$3, updated_at=NOW() WHERE id=$1`,
                [recipeId, recipe.totalCost ?? 0, recipe.wastagePercent ?? 0]
            );
            // Delete old ingredients
            await this.db.query('DELETE FROM rest_recipe_ingredients WHERE recipe_id=$1', [recipeId]);
        } else {
            const { rows } = await this.db.query(
                `INSERT INTO rest_recipes (menu_item_id, total_cost, wastage_percent)
                 VALUES ($1, $2, $3) RETURNING id`,
                [recipe.menuItemId, recipe.totalCost ?? 0, recipe.wastagePercent ?? 0]
            );
            recipeId = rows[0].id;
        }
        for (const ing of recipe.ingredients) {
            await this.db.query(
                `INSERT INTO rest_recipe_ingredients (recipe_id, material_id, quantity, unit, cost)
                 VALUES ($1, $2, $3, $4, $5)`,
                [recipeId, ing.materialId, ing.quantity, ing.unit ?? null, ing.cost ?? 0]
            );
        }
        return recipeId;
    }

    static async deleteRecipe(recipeId: string) {
        await this.db.query('DELETE FROM rest_recipe_ingredients WHERE recipe_id=$1', [recipeId]);
        await this.db.query('UPDATE rest_recipes SET is_active=false WHERE id=$1', [recipeId]);
    }

    // -------------------------------------------------------------------------
    // PRINTER PROFILES  (rest.printer_profiles — schema-qualified)
    // -------------------------------------------------------------------------

    static async getPrinterProfiles(storeId?: string) {
        let sql = 'SELECT * FROM rest.printer_profiles';
        const params: any[] = [];
        if (storeId) { sql += ' WHERE store_id=$1'; params.push(storeId); }
        sql += ' ORDER BY name';
        const { rows } = await this.db.query(sql, params);
        return rows;
    }

    static async savePrinterProfile(profile: {
        id?: string;
        storeId: string;
        name: string;
        type?: string;
        connectionType?: string;
        address?: string;
        port?: number;
        isCommon?: boolean;
    }) {
        if (profile.id) {
            const sql = `
                UPDATE rest.printer_profiles
                SET name=$2, type=$3, connection_type=$4, address=$5, port=$6,
                    is_common=$7, updated_at=NOW()
                WHERE id=$1 RETURNING *
            `;
            const { rows } = await this.db.query(sql, [
                profile.id, profile.name, profile.type ?? 'thermal',
                profile.connectionType ?? 'network', profile.address ?? null,
                profile.port ?? 9100, profile.isCommon ?? false
            ]);
            return rows[0];
        }
        const sql = `
            INSERT INTO rest.printer_profiles
                (store_id, name, type, connection_type, address, port, is_common)
            VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
        `;
        const { rows } = await this.db.query(sql, [
            profile.storeId, profile.name, profile.type ?? 'thermal',
            profile.connectionType ?? 'network', profile.address ?? null,
            profile.port ?? 9100, profile.isCommon ?? false
        ]);
        return rows[0];
    }

    static async deletePrinterProfile(profileId: string) {
        await this.db.query('DELETE FROM rest.printer_profiles WHERE id=$1', [profileId]);
    }

    // -------------------------------------------------------------------------
    // PHASE 2: VOID / COMPLEMENTARY / KDS
    // -------------------------------------------------------------------------

    static async voidOrderItem(itemId: string, reason: string) {
        await this.db.query('SELECT rest.rest_void_order_item($1, $2)', [itemId, reason]);
    }

    static async markItemAsComplementary(itemId: string) {
        await this.db.query('SELECT rest.rest_mark_complementary($1)', [itemId]);
    }

    static async updateKitchenOrderItemStatus(orderItemId: string, status: string) {
        const sql = `
            UPDATE rest.rest_kitchen_order_items
            SET status = $2, updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `;
        const { rows } = await this.db.query(sql, [orderItemId, status]);

        // If status is 'served', also update the main order item served_at
        if (status === 'served') {
            const getOiId = 'SELECT order_item_id FROM rest.rest_kitchen_order_items WHERE id = $1';
            const res = await this.db.query(getOiId, [orderItemId]);
            if (res.rows[0]?.order_item_id) {
                await this.db.query(
                    'UPDATE rest_order_items SET served_at = NOW() WHERE id = $1',
                    [res.rows[0].order_item_id]
                );
            }
        }
        return rows[0];
    }

    // -------------------------------------------------------------------------
    // PRINTER ROUTES  (rest.printer_routes — schema-qualified)
    // -------------------------------------------------------------------------

    static async getPrinterRoutes(storeId: string) {
        const sql = `
            SELECT pr.*, pp.name as printer_name
            FROM rest.printer_routes pr
            LEFT JOIN rest.printer_profiles pp ON pp.id = pr.printer_id
            WHERE pr.store_id=$1
        `;
        const { rows } = await this.db.query(sql, [storeId]);
        return rows;
    }

    static async savePrinterRoute(route: {
        storeId: string;
        categoryName: string;
        printerId: string;
    }) {
        const sql = `
            INSERT INTO rest.printer_routes (store_id, category_name, printer_id)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            RETURNING *
        `;
        const { rows } = await this.db.query(sql, [
            route.storeId, route.categoryName, route.printerId
        ]);
        return rows[0];
    }

    static async deletePrinterRoute(routeId: string) {
        await this.db.query('DELETE FROM rest.printer_routes WHERE id=$1', [routeId]);
    }

    // -------------------------------------------------------------------------
    // KROKI LAYOUT  (rest.kroki_layouts — schema-qualified)
    // -------------------------------------------------------------------------

    static async saveKrokiLayout(
        storeId: string | null,
        floorName: string,
        layoutData: Record<string, any>,
        hiddenTables: string[],
        updatedBy?: string
    ) {
        const sql = `
            INSERT INTO rest.kroki_layouts (store_id, floor_name, layout_data, hidden_tables, updated_by)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (store_id, floor_name)
            DO UPDATE SET
                layout_data  = EXCLUDED.layout_data,
                hidden_tables = EXCLUDED.hidden_tables,
                updated_by   = EXCLUDED.updated_by,
                updated_at   = NOW()
            RETURNING id
        `;
        const { rows } = await this.db.query(sql, [
            storeId,
            floorName,
            JSON.stringify(layoutData),
            hiddenTables,
            updatedBy ?? null
        ]);
        return rows[0]?.id;
    }

    static async getKrokiLayout(storeId: string | null, floorName: string) {
        const sql = `
            SELECT layout_data, hidden_tables, updated_at
            FROM rest.kroki_layouts
            WHERE store_id = $1 AND floor_name = $2
        `;
        const { rows } = await this.db.query(sql, [storeId, floorName]);
        if (rows.length === 0) return null;
        return {
            layoutData: rows[0].layout_data || {},
            hiddenTables: rows[0].hidden_tables || [],
            updatedAt: rows[0].updated_at
        };
    }

    // -------------------------------------------------------------------------
    // DELIVERY ORDERS  (rest_orders with order_no LIKE 'DLV-%')
    // delivery info stored as JSON in 'note' column
    // -------------------------------------------------------------------------

    static async getDeliveryOrders() {
        const sql = `
            SELECT o.*,
                   json_agg(i ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL) AS items
            FROM rest_orders o
            LEFT JOIN rest_order_items i ON i.order_id = o.id
            WHERE o.order_no LIKE 'DLV-%' AND o.status = 'open'
            GROUP BY o.id
            ORDER BY o.opened_at DESC
        `;
        const { rows } = await this.db.query(sql);
        return rows.map((r: any) => ({
            id: r.id,
            orderNo: r.order_no,
            status: r.note_data?.delivery_status ?? 'pending',
            customerName: r.note_data?.customer_name ?? r.note?.match(/"customer_name":"([^"]+)"/)?.[1] ?? '—',
            address: (() => { try { return JSON.parse(r.note)?.address ?? ''; } catch { return ''; } })(),
            phone: (() => { try { return JSON.parse(r.note)?.phone ?? ''; } catch { return ''; } })(),
            courier: (() => { try { return JSON.parse(r.note)?.courier ?? ''; } catch { return ''; } })(),
            deliveryStatus: (() => { try { return JSON.parse(r.note)?.delivery_status ?? 'pending'; } catch { return 'pending'; } })(),
            total: Number(r.total_amount ?? 0),
            startTime: r.opened_at,
            itemCount: (r.items ?? []).length,
            rawNote: r.note,
        }));
    }

    static async createDeliveryOrder(params: {
        customerName: string;
        phone: string;
        address: string;
        waiter?: string;
        customerId?: string;
    }) {
        const year = new Date().getFullYear();
        const { rows: seqRows } = await this.db.query(
            `SELECT COUNT(*)+1 AS seq FROM rest_orders WHERE order_no LIKE $1`,
            [`DLV-${year}-%`]
        );
        const seq = String(seqRows[0]?.seq ?? 1).padStart(4, '0');
        const orderNo = `DLV-${year}-${seq}`;
        const note = JSON.stringify({
            type: 'delivery',
            customer_name: params.customerName,
            phone: params.phone,
            address: params.address,
            delivery_status: 'pending',
        });
        const sql = `
            INSERT INTO rest_orders (order_no, table_id, waiter, customer_id, status, note)
            VALUES ($1, 'DELIVERY', $2, $3, 'open', $4)
            RETURNING *
        `;
        const { rows } = await this.db.query(sql, [
            orderNo, params.waiter ?? null, params.customerId ?? null, note
        ]);
        return rows[0];
    }

    static async updateDeliveryStatus(
        orderId: string,
        deliveryStatus: 'pending' | 'preparing' | 'on_way' | 'delivered',
        extra?: { courier?: string }
    ) {
        // Read current note, patch delivery_status, write back
        const { rows } = await this.db.query('SELECT note FROM rest_orders WHERE id=$1', [orderId]);
        let noteObj: any = {};
        try { noteObj = JSON.parse(rows[0]?.note ?? '{}'); } catch { /**/ }
        noteObj.delivery_status = deliveryStatus;
        if (extra?.courier) noteObj.courier = extra.courier;
        const newNote = JSON.stringify(noteObj);
        await this.db.query(
            'UPDATE rest_orders SET note=$2, updated_at=NOW() WHERE id=$1',
            [orderId, newNote]
        );
        if (deliveryStatus === 'delivered') {
            await this.db.query(
                `UPDATE rest_orders SET status='closed', closed_at=NOW() WHERE id=$1`,
                [orderId]
            );
        }
    }

    // -------------------------------------------------------------------------
    // TAKEAWAY ORDERS  (rest_orders with order_no LIKE 'GEL-%')
    // -------------------------------------------------------------------------

    static async getTakeawayOrders() {
        const sql = `
            SELECT o.*,
                   json_agg(i ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL) AS items
            FROM rest_orders o
            LEFT JOIN rest_order_items i ON i.order_id = o.id
            WHERE o.order_no LIKE 'GEL-%' AND o.status = 'open'
            GROUP BY o.id
            ORDER BY o.opened_at DESC
        `;
        const { rows } = await this.db.query(sql);
        return rows.map((r: any) => ({
            id: r.id,
            orderNo: r.order_no,
            customerName: (() => { try { return JSON.parse(r.note)?.customer_name ?? '—'; } catch { return '—'; } })(),
            phone: (() => { try { return JSON.parse(r.note)?.phone ?? ''; } catch { return ''; } })(),
            takeawayStatus: (() => { try { return JSON.parse(r.note)?.takeaway_status ?? 'pending'; } catch { return 'pending'; } })(),
            total: Number(r.total_amount ?? 0),
            startTime: r.opened_at,
            itemCount: (r.items ?? []).length,
        }));
    }

    static async createTakeawayOrder(params: {
        customerName: string;
        phone: string;
        waiter?: string;
        customerId?: string;
    }) {
        const year = new Date().getFullYear();
        const { rows: seqRows } = await this.db.query(
            `SELECT COUNT(*)+1 AS seq FROM rest_orders WHERE order_no LIKE $1`,
            [`GEL-${year}-%`]
        );
        const seq = String(seqRows[0]?.seq ?? 1).padStart(4, '0');
        const orderNo = `GEL-${year}-${seq}`;
        const note = JSON.stringify({
            type: 'takeaway',
            customer_name: params.customerName,
            phone: params.phone,
            takeaway_status: 'pending',
        });
        const sql = `
            INSERT INTO rest_orders (order_no, table_id, waiter, customer_id, status, note)
            VALUES ($1, 'TAKEAWAY', $2, $3, 'open', $4)
            RETURNING *
        `;
        const { rows } = await this.db.query(sql, [
            orderNo, params.waiter ?? null, params.customerId ?? null, note
        ]);
        return rows[0];
    }

    static async updateTakeawayStatus(
        orderId: string,
        takeawayStatus: 'pending' | 'preparing' | 'ready' | 'picked_up'
    ) {
        const { rows } = await this.db.query('SELECT note FROM rest_orders WHERE id=$1', [orderId]);
        let noteObj: any = {};
        try { noteObj = JSON.parse(rows[0]?.note ?? '{}'); } catch { /**/ }
        noteObj.takeaway_status = takeawayStatus;
        const newNote = JSON.stringify(noteObj);
        await this.db.query(
            'UPDATE rest_orders SET note=$2, updated_at=NOW() WHERE id=$1',
            [orderId, newNote]
        );
        if (takeawayStatus === 'picked_up') {
            await this.db.query(
                `UPDATE rest_orders SET status='closed', closed_at=NOW() WHERE id=$1`,
                [orderId]
            );
        }
    }

    static async verifyStaffPin(pin: string, firmNr: string): Promise<LoginResult> {
        const prefix = `rex_${firmNr.toLowerCase()}`;
        const tableName = `rest.${prefix}_rest_staff`;

        try {
            const { rows } = await this.db.query(
                `SELECT * FROM ${tableName} WHERE pin = $1 AND is_active = true`,
                [pin]
            );

            if (rows.length === 0) {
                return { success: false, error: 'Geçersiz PIN veya pasif personel' };
            }

            const staff: Staff = {
                id: rows[0].id,
                name: rows[0].name,
                role: rows[0].role,
                pin: rows[0].pin,
                isActive: rows[0].is_active
            };

            return { success: true, staff };
        } catch (error) {
            console.error('PIN Verification Error:', error);
            return { success: false, error: 'Sistem hatası' };
        }
    }

    static async getStaffList(firmNr: string): Promise<Staff[]> {
        const prefix = `rex_${firmNr.toLowerCase()}`;
        const tableName = `rest.${prefix}_rest_staff`;

        try {
            const { rows } = await this.db.query(
                `SELECT * FROM ${tableName} WHERE is_active = true ORDER BY name`
            );
            return rows.map(r => ({
                id: r.id,
                name: r.name,
                role: r.role,
                pin: r.pin,
                isActive: r.is_active
            }));
        } catch (error) {
            console.error('Get Staff List Error:', error);
            return [];
        }
    }

    // -------------------------------------------------------------------------
    // RESERVATIONS  (rex_{firmNr}_{periodNr}_rest_reservations)
    // -------------------------------------------------------------------------

    static async ensureReservationsTable() {
        const sql = `
            CREATE TABLE IF NOT EXISTS rest_reservations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                customer_id UUID,
                customer_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                reservation_date DATE NOT NULL,
                reservation_time TIME NOT NULL,
                guest_count INTEGER NOT NULL DEFAULT 2,
                table_id UUID,
                table_number TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                note TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `;
        await this.db.query(sql);
    }

    static async getReservations(params?: { date?: string; status?: string }) {
        await this.ensureReservationsTable();
        let sql = 'SELECT * FROM rest_reservations WHERE 1=1';
        const vals: any[] = [];
        let idx = 1;
        if (params?.date) {
            sql += ` AND reservation_date = $${idx++}`;
            vals.push(params.date);
        }
        if (params?.status) {
            sql += ` AND status = $${idx++}`;
            vals.push(params.status);
        }
        sql += ' ORDER BY reservation_date, reservation_time';
        const { rows } = await this.db.query(sql, vals);
        return rows.map(r => ({
            id: r.id,
            customerId: r.customer_id,
            customerName: r.customer_name,
            phone: r.phone,
            reservationDate: r.reservation_date,
            reservationTime: r.reservation_time.slice(0, 5),
            guestCount: r.guest_count,
            tableId: r.table_id,
            tableName: r.table_number,
            status: r.status,
            note: r.note,
            createdAt: r.created_at,
            updatedAt: r.updated_at
        }));
    }

    static async saveReservation(res: any) {
        await this.ensureReservationsTable();
        if (res.id) {
            const sql = `
                UPDATE rest_reservations
                SET customer_id=$2, customer_name=$3, phone=$4, reservation_date=$5,
                    reservation_time=$6, guest_count=$7, table_id=$8, table_number=$9,
                    status=$10, note=$11, updated_at=NOW()
                WHERE id=$1
                RETURNING *
            `;
            const { rows } = await this.db.query(sql, [
                res.id, res.customerId, res.customerName, res.phone, res.reservationDate,
                res.reservationTime, res.guestCount, res.tableId, res.tableName,
                res.status, res.note
            ]);
            return rows[0];
        }
        const sql = `
            INSERT INTO rest_reservations
                (customer_id, customer_name, phone, reservation_date, reservation_time,
                 guest_count, table_id, table_number, status, note)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *
        `;
        const { rows } = await this.db.query(sql, [
            res.customerId, res.customerName, res.phone, res.reservationDate,
            res.reservationTime, res.guestCount, res.tableId, res.tableName,
            res.status || 'pending', res.note
        ]);
        return rows[0];
    }

    static async deleteReservation(id: string) {
        await this.db.query('DELETE FROM rest_reservations WHERE id=$1', [id]);
    }

    static async updateReservationStatus(id: string, status: string) {
        await this.db.query(
            'UPDATE rest_reservations SET status=$2, updated_at=NOW() WHERE id=$1',
            [id, status]
        );
    }

    // -------------------------------------------------------------------------
    // Z-REPORT  — aggregate closed orders for a given work-day date
    // -------------------------------------------------------------------------

    static async getZReportData(workDayDate: string) {
        // 1. Payment method breakdown + totals
        const { rows: paymentRows } = await this.db.query(`
            SELECT
                COALESCE(UPPER(payment_method), 'DİĞER') AS method,
                SUM(total_amount)                         AS amount,
                COUNT(*)                                  AS count
            FROM rest_orders
            WHERE status = 'closed'
              AND DATE(closed_at) = $1
            GROUP BY COALESCE(UPPER(payment_method), 'DİĞER')
            ORDER BY SUM(total_amount) DESC
        `, [workDayDate]);

        const totalSales = paymentRows.reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0);
        const netCash = paymentRows
            .filter((r: any) => /NAK[İI]T|CASH/i.test(r.method))
            .reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0);

        // 2. Category breakdown (via product join)
        const { rows: catRows } = await this.db.query(`
            SELECT
                COALESCE(p.category, 'Diğer') AS category,
                SUM(oi.subtotal)               AS amount,
                COUNT(oi.id)                   AS count
            FROM rest_order_items oi
            JOIN rest_orders o  ON oi.order_id  = o.id
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE o.status = 'closed'
              AND DATE(o.closed_at) = $1
              AND (oi.is_void IS NOT TRUE)
            GROUP BY COALESCE(p.category, 'Diğer')
            ORDER BY SUM(oi.subtotal) DESC
        `, [workDayDate]);

        // 3. Voids
        const { rows: voidRows } = await this.db.query(`
            SELECT
                COALESCE(oi.void_reason, 'İptal') AS reason,
                SUM(oi.subtotal)                  AS amount,
                COUNT(oi.id)                      AS count
            FROM rest_order_items oi
            JOIN rest_orders o ON oi.order_id = o.id
            WHERE o.status = 'closed'
              AND DATE(o.closed_at) = $1
              AND oi.is_void = TRUE
            GROUP BY COALESCE(oi.void_reason, 'İptal')
        `, [workDayDate]);

        // 4. Complements
        const { rows: compRows } = await this.db.query(`
            SELECT SUM(oi.subtotal) AS amount, COUNT(oi.id) AS count
            FROM rest_order_items oi
            JOIN rest_orders o ON oi.order_id = o.id
            WHERE o.status = 'closed'
              AND DATE(o.closed_at) = $1
              AND oi.is_complementary = TRUE
        `, [workDayDate]);

        return {
            totalSales,
            netCash,
            paymentsByType: paymentRows.map((r: any) => ({
                type: r.method,
                amount: parseFloat(r.amount) || 0,
                count: parseInt(r.count) || 0,
            })),
            salesByCategory: catRows.map((r: any) => ({
                category: r.category,
                amount: parseFloat(r.amount) || 0,
                count: parseInt(r.count) || 0,
            })),
            voids: voidRows.map((r: any) => ({
                reason: r.reason,
                amount: parseFloat(r.amount) || 0,
                count: parseInt(r.count) || 0,
            })),
            complements: {
                amount: parseFloat(compRows[0]?.amount) || 0,
                count: parseInt(compRows[0]?.count) || 0,
            },
        };
    }

    static async saveStaff(firmNr: string, staff: Partial<Staff>): Promise<Staff> {
        const prefix = `rex_${firmNr.toLowerCase()}`;
        const tableName = `rest.${prefix}_rest_staff`;

        if (staff.id) {
            const sql = `
                UPDATE ${tableName}
                SET name = $2, role = $3, pin = $4, is_active = $5, updated_at = NOW()
                WHERE id = $1
                RETURNING *
            `;
            const { rows } = await this.db.query(sql, [
                staff.id, staff.name, staff.role, staff.pin, staff.isActive ?? true
            ]);
            return {
                id: rows[0].id,
                name: rows[0].name,
                role: rows[0].role,
                pin: rows[0].pin,
                isActive: rows[0].is_active
            };
        } else {
            const sql = `
                INSERT INTO ${tableName} (name, role, pin, is_active)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            const { rows } = await this.db.query(sql, [
                staff.name, staff.role, staff.pin, staff.isActive ?? true
            ]);
            return {
                id: rows[0].id,
                name: rows[0].name,
                role: rows[0].role,
                pin: rows[0].pin,
                isActive: rows[0].is_active
            };
        }
    }

    static async deleteStaff(firmNr: string, staffId: string): Promise<void> {
        const prefix = `rex_${firmNr.toLowerCase()}`;
        const tableName = `rest.${prefix}_rest_staff`;
        await this.db.query(`UPDATE ${tableName} SET is_active = false, updated_at = NOW() WHERE id = $1`, [staffId]);
    }
}

