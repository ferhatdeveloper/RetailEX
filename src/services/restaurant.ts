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
        // rest.floors şemasında is_active yok; tüm katları getir
        let sql = 'SELECT * FROM rest.floors';
        const params: any[] = [];
        if (storeId) {
            sql += ' WHERE store_id = $1';
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
                SET name=$2, color=$3, display_order=$4
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
        await this.db.query('DELETE FROM rest.floors WHERE id=$1', [floorId]);
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

    /** Arka plan senkronizasyonu için sadece masa durumları (hafif sorgu). */
    static async getTableStatuses(floorId?: string): Promise<{ id: string; floor_id: string; status: string; waiter?: string; total: number; start_time?: string }[]> {
        let sql = 'SELECT id, floor_id, status, waiter, total, start_time FROM rest_tables';
        const params: any[] = [];
        if (floorId) {
            sql += ' WHERE floor_id = $1';
            params.push(floorId);
        }
        sql += ' ORDER BY number';
        const { rows } = await this.db.query(sql, params);
        return rows;
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
        if (status === 'empty') {
            // Kapalı/dolu masayı boşaltırken linked_order_ids ve garson bilgisini de sıfırla
            const sql = `
                UPDATE rest_tables
                SET status='empty', waiter=NULL, staff_id=NULL, total=0, linked_order_ids='{}', updated_at=NOW()
                WHERE id=$1
            `;
            await this.db.query(sql, [tableId]);
            return;
        }
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
        if ('color' in updates) { sets.push(`color=$${i++}`); vals.push(updates.color ?? null); }
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

    /** Bir masadaki tüm açık siparişleri döndürür (birleştirilmiş masada birden fazla olabilir). */
    static async getTableOrders(tableId: string) {
        const sql = `
            SELECT o.*,
                   t.number as table_number,
                   json_agg(i ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL) as items
            FROM rest_orders o
            LEFT JOIN rest_tables t ON t.id = o.table_id
            LEFT JOIN rest_order_items i ON i.order_id = o.id
            WHERE o.table_id = $1 AND o.status = 'open'
            GROUP BY o.id, t.number
            ORDER BY o.opened_at ASC
        `;
        const { rows } = await this.db.query(sql, [tableId]);
        return rows ?? [];
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
     * Birleştir: Kaynak masanın siparişini hedef masaya bağlar (sipariş ayrı kalır, işlem numarasına göre taşıma mümkün).
     */
    static async mergeTables(sourceTableId: string, targetTableId: string) {
        const sourceOrder = await this.getActiveOrder(sourceTableId);
        if (!sourceOrder) return;

        const targetOrder = await this.getActiveOrder(targetTableId);
        if (!targetOrder) {
            await this.transferTable(sourceTableId, targetTableId);
            return;
        }

        // Kaynak siparişi hedef masaya bağla (item'ları taşıma, siparişi link et)
        await this.db.query(
            'UPDATE rest_orders SET table_id = $2, updated_at = NOW() WHERE id = $1',
            [sourceOrder.id, targetTableId]
        );

        // Hedef masanın toplamı = kendi siparişi + bağlı siparişler
        const allOrders = await this.getTableOrders(targetTableId);
        const totalAmount = allOrders.reduce((sum: number, o: any) => sum + (Number(o.total_amount) || 0), 0);
        await this.updateTableStatus(targetTableId, 'occupied', targetOrder.waiter, undefined, totalAmount);
        await this.updateTableStatus(sourceTableId, 'empty', undefined, undefined, 0);
    }

    /**
     * Transfers an entire order from one table to another.
     * Veritabanında: siparişin table_id'si hedef masaya alınır, kaynak masa boş, hedef masa dolu olarak güncellenir.
     */
    static async transferTable(sourceTableId: string, targetTableId: string): Promise<void> {
        const order = await this.getActiveOrder(sourceTableId);
        if (!order) {
            throw new Error('Bu masada taşınacak açık sipariş yok. Sipariş kapalı veya iptal olabilir.');
        }

        // Siparişi hedef masaya taşı
        await this.db.query(
            'UPDATE rest_orders SET table_id = $2, updated_at=NOW() WHERE id = $1',
            [order.id, targetTableId]
        );

        // Masa durumlarını güncelle: hedef dolu, kaynak boş (linked_order_ids de sıfırlanır)
        await this.updateTableStatus(targetTableId, 'occupied', order.waiter, undefined, order.total_amount || 0);
        await this.updateTableStatus(sourceTableId, 'empty', undefined, undefined, 0);
    }

    static async moveTable(fromTableId: string, toTableId: string) {
        await this.transferTable(fromTableId, toTableId);
    }

    /**
     * Tek bir siparişi (işlem numarası) başka masaya taşır (birleştirilmiş masada kullanım).
     */
    static async moveOrderToTable(orderId: string, targetTableId: string) {
        const { rows: orderRows } = await this.db.query(
            'SELECT id, table_id, waiter, total_amount FROM rest_orders WHERE id = $1 AND status = $2',
            [orderId, 'open']
        );
        if (!orderRows?.length) throw new Error('Sipariş bulunamadı veya kapalı.');
        const order = orderRows[0];
        const sourceTableId = order.table_id;
        if (!sourceTableId) throw new Error('Sipariş masaya bağlı değil.');
        if (sourceTableId === targetTableId) return;

        await this.db.query(
            'UPDATE rest_orders SET table_id = $2, updated_at = NOW() WHERE id = $1',
            [orderId, targetTableId]
        );

        const sourceOrders = await this.getTableOrders(sourceTableId);
        const sourceTotal = sourceOrders.reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);
        const sourceWaiter = sourceOrders[0]?.waiter;
        if (sourceOrders.length === 0) {
            await this.updateTableStatus(sourceTableId, 'empty', undefined, undefined, 0);
        } else {
            await this.updateTableStatus(sourceTableId, 'occupied', sourceWaiter, undefined, sourceTotal);
        }

        const targetOrders = await this.getTableOrders(targetTableId);
        const targetTotal = targetOrders.reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);
        const targetWaiter = targetOrders[0]?.waiter;
        await this.updateTableStatus(targetTableId, 'occupied', targetWaiter, undefined, targetTotal);
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

    /** Tek bir sipariş kalemini başka masanın siparişine taşır (yanlış masaya giden ürün için). */
    static async moveOrderItemToTable(itemId: string, targetTableId: string) {
        const { rows: itemRows } = await this.db.query(
            'SELECT order_id, subtotal FROM rest_order_items WHERE id = $1 AND (is_void IS NOT TRUE)',
            [itemId]
        );
        if (!itemRows?.length) throw new Error('Ürün bulunamadı veya iptal.');
        const sourceOrderId = itemRows[0].order_id;

        const { rows: sourceOrderRows } = await this.db.query(
            'SELECT table_id, floor_id, waiter FROM rest_orders WHERE id = $1 AND status = $2',
            [sourceOrderId, 'open']
        );
        if (!sourceOrderRows?.length) throw new Error('Kaynak sipariş bulunamadı.');
        const sourceTableId = sourceOrderRows[0].table_id;
        if (sourceTableId === targetTableId) return;

        let targetOrder = await this.getActiveOrder(targetTableId);
        if (!targetOrder) {
            const { rows: tbl } = await this.db.query(
                'SELECT floor_id FROM rest_tables WHERE id = $1',
                [targetTableId]
            );
            const floorId = tbl[0]?.floor_id ?? null;
            const year = new Date().getFullYear();
            const { rows: seqRows } = await this.db.query(
                'SELECT COUNT(*)+1 AS seq FROM rest_orders WHERE order_no LIKE $1',
                [`RES-${year}-%`]
            );
            const seq = String(seqRows[0]?.seq ?? 1).padStart(5, '0');
            const orderNo = `RES-${year}-${seq}`;
            const { rows: newOrder } = await this.db.query(
                `INSERT INTO rest_orders (order_no, table_id, floor_id, waiter, customer_id, status)
                 VALUES ($1, $2, $3, $4, NULL, 'open') RETURNING id`,
                [orderNo, targetTableId, floorId, sourceOrderRows[0].waiter ?? null]
            );
            targetOrder = { id: newOrder[0].id };
        }

        await this.db.query(
            'UPDATE rest_order_items SET order_id = $2 WHERE id = $1',
            [itemId, targetOrder.id]
        );

        const recalc = (orderId: string) =>
            this.db.query(
                `UPDATE rest_orders SET total_amount = (SELECT COALESCE(SUM(subtotal), 0) FROM rest_order_items WHERE order_id = $1 AND (is_void IS NOT TRUE)), updated_at = NOW() WHERE id = $1`,
                [orderId]
            );
        await recalc(sourceOrderId);
        await recalc(targetOrder.id);

        const { rows: sourceItems } = await this.db.query(
            'SELECT COUNT(*) AS cnt FROM rest_order_items WHERE order_id = $1 AND (is_void IS NOT TRUE)',
            [sourceOrderId]
        );
        if (Number(sourceItems[0]?.cnt ?? 0) === 0) {
            await this.updateTableStatus(sourceTableId, 'empty', undefined, undefined, 0);
            await this.db.query('DELETE FROM rest_orders WHERE id = $1', [sourceOrderId]);
        } else {
            const { rows: sumRow } = await this.db.query(
                'SELECT COALESCE(SUM(subtotal), 0) AS total FROM rest_order_items WHERE order_id = $1 AND (is_void IS NOT TRUE)',
                [sourceOrderId]
            );
            await this.updateTableStatus(sourceTableId, 'occupied', sourceOrderRows[0].waiter ?? null, undefined, Number(sumRow[0]?.total ?? 0));
        }

        const { rows: targetSum } = await this.db.query(
            'SELECT COALESCE(SUM(subtotal), 0) AS total FROM rest_order_items WHERE order_id = $1 AND (is_void IS NOT TRUE)',
            [targetOrder.id]
        );
        const targetOrderFull = await this.getActiveOrder(targetTableId);
        await this.updateTableStatus(targetTableId, 'occupied', targetOrderFull?.waiter ?? null, undefined, Number(targetSum[0]?.total ?? 0));
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
        // 1. Fetch preparation times (products.preparation_time yoksa veya tablo farklıysa varsayılan 5 dk)
        const productIds = params.items.map(i => i.productId);
        const productIdsCsv = productIds.filter(Boolean).join(',');
        let prepTimeMap = new Map<string, number>();
        try {
            const { rows: products } = await this.db.query(
                productIdsCsv
                    ? "SELECT id, preparation_time FROM products WHERE id = ANY(string_to_array($1, ',')::uuid[])"
                    : 'SELECT id, 5 AS preparation_time FROM products WHERE false',
                productIdsCsv ? [productIdsCsv] : []
            );
            prepTimeMap = new Map(products.map((p: any) => [p.id, Number(p?.preparation_time) || 5]));
        } catch {
            params.items.forEach(i => i.productId && prepTimeMap.set(i.productId, 5));
        }

        // --- PHASE 2.6: KITCHEN LOAD ANALYSIS (tablo yoksa 0 kabul et) ---
        let activeItemCount = 0;
        try {
            const { rows: activeCounts } = await this.db.query(
                "SELECT COUNT(*) as count FROM rest.rest_kitchen_items WHERE status IN ('new', 'cooking')"
            );
            activeItemCount = parseInt(activeCounts[0]?.count ?? '0', 10) || 0;
        } catch {
            activeItemCount = 0;
        }
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
            SELECT ko.*, o.table_id,
                   json_agg(ki ORDER BY ki.id) FILTER (WHERE ki.id IS NOT NULL) as items
            FROM rest_kitchen_orders ko
            LEFT JOIN rest_orders o ON o.id = ko.order_id
            LEFT JOIN rest_kitchen_items ki ON ki.kitchen_order_id = ko.id
            WHERE ko.status NOT IN ('served')
            GROUP BY ko.id, o.table_id
            ORDER BY ko.sent_at ASC
        `;
        const { rows } = await this.db.query(sql);
        return rows;
    }

    static async updateKitchenOrderStatus(
        kitchenOrderId: string,
        status: 'new' | 'cooking' | 'ready' | 'served'
    ) {
        // Nota: rest_kitchen_orders şemasında updated_at/cooked_at/served_at yok; sadece status güncellenir.
        await this.db.query(
            `UPDATE rest_kitchen_orders SET status=$2 WHERE id=$1`,
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

    /** Tam iptal: kalemi is_void=TRUE yap, sipariş toplamından düş (DB fonksiyonu yok, uygulama tarafında) */
    static async _fullVoidOrderItem(itemId: string, reason: string) {
        const { rows: [row] } = await this.db.query(`
            SELECT order_id, subtotal FROM rest_order_items WHERE id = $1
        `, [itemId]);
        if (!row) return;
        const orderId = row.order_id;
        const itemTotal = parseFloat(row.subtotal) || 0;
        await this.db.query(`
            UPDATE rest_order_items SET is_void = TRUE, void_reason = $1 WHERE id = $2
        `, [reason, itemId]);
        await this.db.query(`
            UPDATE rest_orders SET total_amount = total_amount - $1, updated_at = NOW() WHERE id = $2
        `, [itemTotal, orderId]);
    }

    /** İptal: voidQuantity verilmezse veya kalem adedine eşitse tümü iptal; aksi halde sadece o adet iptal (kalan sepette kalır) */
    static async voidOrderItem(itemId: string, reason: string, voidQuantity?: number) {
        if (voidQuantity == null || voidQuantity <= 0) {
            await this._fullVoidOrderItem(itemId, reason);
            return;
        }
        const { rows: [item] } = await this.db.query(`
            SELECT order_id, product_id, product_name, quantity, unit_price, discount_pct, subtotal, status, course, note
            FROM rest_order_items WHERE id = $1
        `, [itemId]);
        if (!item) {
            await this._fullVoidOrderItem(itemId, reason);
            return;
        }
        const qty = Number(item.quantity);
        const unitPrice = Number(item.unit_price);
        const discountPct = Number(item.discount_pct ?? 0);
        const voidSubtotal = voidQuantity * unitPrice * (1 - discountPct / 100);

        if (voidQuantity >= qty) {
            await this._fullVoidOrderItem(itemId, reason);
            return;
        }
        // Kısmi iptal: yeni satır (iptal) ekle, mevcut satırın miktarını düşür
        await this.db.query(`
            INSERT INTO rest_order_items (order_id, product_id, product_name, quantity, unit_price, discount_pct, subtotal, status, course, note, is_void, void_reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
        `, [
            item.order_id, item.product_id, item.product_name, voidQuantity, unitPrice, discountPct, voidSubtotal,
            item.status ?? 'pending', item.course ?? null, item.note ?? null, reason
        ]);
        const newQty = qty - voidQuantity;
        const newSubtotal = newQty * unitPrice * (1 - discountPct / 100);
        await this.db.query(`
            UPDATE rest_order_items SET quantity = $2, subtotal = $3 WHERE id = $1
        `, [itemId, newQty, newSubtotal]);
        await this.db.query(`
            UPDATE rest_orders SET total_amount = total_amount - $1, updated_at = NOW() WHERE id = $2
        `, [voidSubtotal, item.order_id]);
    }

    /** İkram: kalemi is_complimentary=TRUE yap, sipariş toplamından düş (DB fonksiyonu yok, uygulama tarafında) */
    static async markItemAsComplementary(itemId: string) {
        const { rows: [row] } = await this.db.query(`
            SELECT order_id, subtotal FROM rest_order_items WHERE id = $1 AND (is_complimentary IS NOT TRUE)
        `, [itemId]);
        if (!row) return;
        const itemTotal = parseFloat(row.subtotal) || 0;
        await this.db.query(`
            UPDATE rest_order_items SET is_complimentary = TRUE WHERE id = $1
        `, [itemId]);
        await this.db.query(`
            UPDATE rest_orders SET total_amount = total_amount - $1, updated_at = NOW() WHERE id = $2
        `, [itemTotal, row.order_id]);
    }

    static async updateKitchenOrderItemStatus(orderItemId: string, status: string) {
        const sql = `
            UPDATE rest_kitchen_items
            SET status = $2
            WHERE id = $1
            RETURNING *
        `;
        const { rows } = await this.db.query(sql, [orderItemId, status]);

        // If status is 'served', also update the main order item served_at
        if (status === 'served') {
            const getOiId = 'SELECT order_item_id FROM rest_kitchen_items WHERE id = $1';
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
            VALUES ($1, NULL, $2, $3, 'open', $4)
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
            VALUES ($1, NULL, $2, $3, 'open', $4)
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

    /** Garson/waiter sayılan rol adları (küçük harf) */
    private static readonly WAITER_ROLE_KEYS = ['garson', 'görevli', 'waiter', 'servis', 'personel'];

    static async getStaffList(firmNr: string): Promise<Staff[]> {
        const prefix = `rex_${firmNr.toLowerCase()}`;
        const tableName = `rest.${prefix}_rest_staff`;
        const staffList: Staff[] = [];

        try {
            const { rows: restRows } = await this.db.query(
                `SELECT * FROM ${tableName} WHERE is_active = true ORDER BY name`
            );
            for (const r of restRows) {
                staffList.push({
                    id: r.id,
                    name: r.name,
                    role: r.role ?? 'Garson',
                    pin: r.pin ?? '',
                    isActive: r.is_active !== false
                });
            }
        } catch (error) {
            console.error('Get Staff List Error (rest_staff):', error);
        }

        try {
            const roleCondition = RestaurantService.WAITER_ROLE_KEYS
                .map((_, i) => `(LOWER(COALESCE(r.name, u.role, '')) LIKE $${i + 2})`)
                .join(' OR ');
            const roleParams = RestaurantService.WAITER_ROLE_KEYS.map(k => `%${k}%`);
            const { rows: userRows } = await this.db.query(
                `SELECT u.id, u.full_name, u.username, COALESCE(r.name, u.role) AS role_name
                 FROM public.users u
                 LEFT JOIN public.roles r ON r.id = u.role_id
                 WHERE u.firm_nr = $1 AND u.is_active = true
                 AND (${roleCondition})
                 ORDER BY u.full_name, u.username`,
                [firmNr, ...roleParams]
            );
            const existingNames = new Set(staffList.map(s => s.name.toLowerCase().trim()));
            for (const u of userRows) {
                const name = (u.full_name || u.username || '').trim();
                if (!name || existingNames.has(name.toLowerCase())) continue;
                existingNames.add(name.toLowerCase());
                staffList.push({
                    id: u.id,
                    name,
                    role: u.role_name || 'Garson',
                    pin: '',
                    isActive: true
                });
            }
        } catch (error) {
            console.error('Get Staff List Error (users):', error);
        }

        staffList.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        return staffList;
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
        // Tarihi YYYY-MM-DD yap (DB DATE karşılaştırması için). Gelen "17.03.2026" veya "2026-03-17" olabilir.
        const normalizedDate = (() => {
            const d = workDayDate.trim();
            const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
            if (isoMatch) return d;
            const trMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(d);
            if (trMatch) return `${trMatch[3]}-${trMatch[2].padStart(2, '0')}-${trMatch[1].padStart(2, '0')}`;
            return new Date().toISOString().slice(0, 10);
        })();

        try {
            // 1. Payment method breakdown + totals (sadece rest_orders — tablo adı postgres tarafından prefix’lenir)
            const { rows: paymentRows } = await this.db.query(`
                SELECT
                    COALESCE(UPPER(payment_method), 'DİĞER') AS method,
                    SUM(total_amount)                         AS amount,
                    COUNT(*)                                  AS count
                FROM rest_orders
                WHERE status = 'closed'
                  AND (closed_at IS NOT NULL AND closed_at::date = $1::date)
                GROUP BY COALESCE(UPPER(payment_method), 'DİĞER')
                ORDER BY SUM(total_amount) DESC
            `, [normalizedDate]);

            const totalSales = paymentRows.reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0);
            const netCash = paymentRows
                .filter((r: any) => /NAK[İI]T|CASH/i.test(r.method))
                .reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0);

            // 2. Kategori özeti (products tablosuna bağlı değil; sadece rest tabloları)
            const { rows: catRows } = await this.db.query(`
                SELECT
                    'Satış' AS category,
                    SUM(oi.subtotal) AS amount,
                    COUNT(oi.id)     AS count
                FROM rest_order_items oi
                JOIN rest_orders o ON oi.order_id = o.id
                WHERE o.status = 'closed'
                  AND (o.closed_at IS NOT NULL AND o.closed_at::date = $1::date)
                  AND (oi.is_void IS NOT TRUE)
            `, [normalizedDate]);

            // 3. İptaller
            const { rows: voidRows } = await this.db.query(`
                SELECT
                    COALESCE(oi.void_reason, 'İptal') AS reason,
                    SUM(oi.subtotal)                  AS amount,
                    COUNT(oi.id)                      AS count
                FROM rest_order_items oi
                JOIN rest_orders o ON oi.order_id = o.id
                WHERE o.status = 'closed'
                  AND (o.closed_at IS NOT NULL AND o.closed_at::date = $1::date)
                  AND oi.is_void = TRUE
                GROUP BY COALESCE(oi.void_reason, 'İptal')
            `, [normalizedDate]);

            // 4. İkramlar
            const { rows: compRows } = await this.db.query(`
                SELECT COALESCE(SUM(oi.subtotal), 0) AS amount, COALESCE(COUNT(oi.id), 0) AS count
                FROM rest_order_items oi
                JOIN rest_orders o ON oi.order_id = o.id
                WHERE o.status = 'closed'
                  AND (o.closed_at IS NOT NULL AND o.closed_at::date = $1::date)
                  AND oi.is_complimentary = TRUE
            `, [normalizedDate]);

            return {
                totalSales,
                netCash,
                paymentsByType: paymentRows.map((r: any) => ({
                    type: r.method,
                    amount: parseFloat(r.amount) || 0,
                    count: parseInt(r.count) || 0,
                })),
                salesByCategory: (catRows?.length ? catRows : [{ category: 'Satış', amount: 0, count: 0 }]).map((r: any) => ({
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
                    amount: parseFloat(compRows?.[0]?.amount) || 0,
                    count: parseInt(compRows?.[0]?.count) || 0,
                },
            };
        } catch (err: any) {
            const msg = err?.message || String(err);
            console.error('[getZReportData]', msg, err);
            throw new Error(`Z-Raporu verisi alınamadı: ${msg}. Restoran mali gün tabloları (rest_orders, rest_order_items) mevcut mu kontrol edin.`);
        }
    }

    /** İptal edilen kalemlerin raporu — sebep, tutar, tarih, masa, fiş (kayıt altı) */
    static async getVoidReport(params?: { fromDate?: string; toDate?: string; limit?: number }) {
        let sql = `
            SELECT
                oi.id AS item_id,
                oi.product_name,
                oi.quantity,
                oi.unit_price,
                oi.subtotal,
                COALESCE(oi.void_reason, 'İptal') AS void_reason,
                oi.status AS item_status,
                o.order_no,
                o.opened_at,
                o.closed_at,
                o.waiter,
                t.number AS table_number
            FROM rest_order_items oi
            JOIN rest_orders o ON o.id = oi.order_id
            LEFT JOIN rest_tables t ON t.id = o.table_id
            WHERE oi.is_void = TRUE
        `;
        const vals: any[] = [];
        let idx = 1;
        if (params?.fromDate) { sql += ` AND COALESCE(o.closed_at, o.opened_at) >= $${idx++}`; vals.push(params.fromDate); }
        if (params?.toDate) { sql += ` AND COALESCE(o.closed_at, o.opened_at) < $${idx++}`; vals.push(params.toDate); }
        sql += ' ORDER BY COALESCE(o.closed_at, o.opened_at) DESC, oi.id';
        if (params?.limit) { sql += ` LIMIT $${idx}`; vals.push(params.limit); }
        const { rows } = await this.db.query(sql, vals);
        return rows.map((r: any) => ({
            itemId: r.item_id,
            productName: r.product_name,
            quantity: Number(r.quantity),
            unitPrice: Number(r.unit_price),
            subtotal: Number(r.subtotal),
            voidReason: r.void_reason,
            itemStatus: r.item_status ?? 'pending',
            orderNo: r.order_no,
            openedAt: r.opened_at,
            closedAt: r.closed_at,
            waiter: r.waiter,
            tableNumber: r.table_number ?? '—',
        }));
    }

    /** İade işlemini kayıt altına al (sebep zorunlu, rapor için) */
    static async logReturn(data: {
        returnNumber: string;
        originalReceipt?: string;
        productName: string;
        productId?: string;
        quantity: number;
        unitPrice: number;
        totalAmount: number;
        returnReason: string;
        staffName?: string;
    }) {
        try {
            await this.db.query(`
                INSERT INTO rest.return_log (return_number, original_receipt, product_id, product_name, quantity, unit_price, total_amount, return_reason, staff_name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                data.returnNumber,
                data.originalReceipt ?? null,
                data.productId ?? null,
                data.productName,
                data.quantity,
                data.unitPrice,
                data.totalAmount,
                data.returnReason,
                data.staffName ?? null,
            ]);
        } catch (e) {
            console.error('[RestaurantService] logReturn error (table rest.return_log may not exist):', e);
        }
    }

    /** İade kayıtları raporu */
    static async getReturnReport(params?: { fromDate?: string; toDate?: string; limit?: number }) {
        try {
            let sql = `
                SELECT id, return_number, original_receipt, product_name, quantity, unit_price, total_amount, return_reason, staff_name, created_at
                FROM rest.return_log WHERE 1=1
            `;
            const vals: any[] = [];
            let idx = 1;
            if (params?.fromDate) { sql += ` AND created_at >= $${idx++}`; vals.push(params.fromDate); }
            if (params?.toDate) { sql += ` AND created_at < $${idx++}`; vals.push(params.toDate); }
            sql += ' ORDER BY created_at DESC';
            if (params?.limit) { sql += ` LIMIT $${idx}`; vals.push(params.limit); }
            const { rows } = await this.db.query(sql, vals);
            return rows.map((r: any) => ({
                id: r.id,
                returnNumber: r.return_number,
                originalReceipt: r.original_receipt,
                productName: r.product_name,
                quantity: Number(r.quantity),
                unitPrice: Number(r.unit_price),
                totalAmount: Number(r.total_amount),
                returnReason: r.return_reason,
                staffName: r.staff_name,
                createdAt: r.created_at,
            }));
        } catch (e) {
            console.error('[RestaurantService] getReturnReport error:', e);
            return [];
        }
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

