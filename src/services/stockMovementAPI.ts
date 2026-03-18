import { postgres, ERP_SETTINGS } from './postgres';

export interface StockMovement {
    id: string;
    document_no: string;
    trcode: number;
    movement_type: string; // 'in' | 'out' | 'transfer' | 'adjustment'
    warehouse_id?: string;
    target_warehouse_id?: string; // For transfers
    movement_date: string;
    exchange_rate?: number;
    description?: string;
    status: string;
    created_by?: string;
    created_at: string;
    updated_at: string;
    stock_movement_items?: StockMovementItem[];
}

export interface StockMovementItem {
    id: string;
    movement_id: string;
    product_id: string;
    product_name?: string;
    product_code?: string;
    quantity: number;
    unit_price?: number;
    cost_price?: number;
    exchange_rate?: number;
    unit_name?: string;
    convert_factor?: number;
    notes?: string;
}

/**
 * Logo ERP Standard Stock Slip TRCODEs
 */
export const STOCK_SLIP_TRCODES = {
    CONSUMPTION: 1,      // Sarf Fişi
    PRODUCTION_IN: 2,    // Üretimden Giriş
    TRANSFER: 5,         // Ambar Fişi
    WASTAGE: 11,         // Fire Fişi
    OPENING: 14,         // Devir Fişi
    COUNTING: 25,        // Sayım Fişi
    SURPLUS: 26,         // Sayım Fazlası
    SHORTAGE: 50,        // Sayım Eksiği
};

class StockMovementAPI {
    /**
     * Fetch all stock movements for the current firm/period
     */
    async getAll(): Promise<StockMovement[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT 
                    m.*, s.name as warehouse_name
                 FROM stock_movements m
                 LEFT JOIN stores s ON m.warehouse_id = s.id
                 ORDER BY m.created_at DESC`
            );
            return rows.map(r => ({
                ...r,
                warehouses: { name: r.warehouse_name }
            }));
        } catch (error) {
            console.error('[StockMovementAPI] getAll failed:', error);
            return [];
        }
    }

    /**
     * Get a single stock movement with its items
     */
    async getById(id: string): Promise<StockMovement | null> {
        try {
            const { rows } = await postgres.query(`SELECT * FROM stock_movements WHERE id = $1`, [id]);
            if (!rows[0]) return null;
            const movement = rows[0];

            const { rows: items } = await postgres.query(
                `SELECT 
                    i.*, p.name as product_name, p.code as product_code
                 FROM stock_movement_items i
                 LEFT JOIN products p ON i.product_id = p.id
                 WHERE i.movement_id = $1`,
                [id]
            );

            return {
                ...movement,
                stock_movement_items: items.map(i => ({
                    ...i,
                    product_name: i.product_name,
                    product_code: i.product_code
                }))
            };
        } catch (error) {
            console.error('[StockMovementAPI] getById failed:', error);
            return null;
        }
    }

    /**
     * Get movements for a specific product
     */
    async getProductMovements(productId: string): Promise<any[]> {
        const mapRow = (r: any) => ({
            ...r,
            currency: r.currency,
            currency_rate: parseFloat(r.currency_rate || 1),
            gross_profit: parseFloat(r.gross_profit || 0),
            movement: {
                document_no: r.document_no,
                movement_type: r.movement_type,
                movement_date: r.movement_date,
                status: r.status,
                trcode: r.trcode,
                warehouses: { name: r.warehouse_name }
            }
        });

        // Query 1: Manual stock movements (ambar fişleri)
        let slipRows: any[] = [];
        try {
            const { rows } = await postgres.query(
                `SELECT
                    i.id, i.movement_id, i.product_id::text as product_id, i.quantity, i.unit_price, i.created_at,
                    m.document_no, m.movement_type, m.movement_date, m.status, m.trcode,
                    COALESCE(s.name, '') as warehouse_name,
                    'slip' as source_type,
                    COALESCE(m.exchange_rate, 1.0) as currency_rate,
                    'IQD' as currency,
                    0::numeric as gross_profit
                 FROM stock_movement_items i
                 JOIN stock_movements m ON i.movement_id = m.id
                 LEFT JOIN stores s ON m.warehouse_id = s.id
                 WHERE i.product_id::text = $1
                    OR i.product_id IN (SELECT id FROM products WHERE code = $1 OR id::text = $1)`,
                [productId]
            );
            slipRows = rows;
        } catch (err) {
            console.warn('[StockMovementAPI] stock_movement_items query failed:', err);
        }

        // Query 2: Invoice-based movements (satış/alış faturaları)
        let invoiceRows: any[] = [];
        try {
            const { rows } = await postgres.query(
                `SELECT
                    si.id,
                    si.invoice_id as movement_id,
                    si.item_code as product_id,
                    si.quantity,
                    si.unit_price,
                    si.created_at,
                    sl.fiche_no as document_no,
                    CASE
                        WHEN sl.fiche_type = 'purchase_invoice' THEN 'in'
                        WHEN sl.fiche_type = 'sales_invoice'    THEN 'out'
                        WHEN sl.fiche_type = 'return_invoice' AND sl.trcode = 3         THEN 'in'
                        WHEN sl.fiche_type = 'return_invoice' AND sl.trcode IN (2, 6)   THEN 'out'
                        ELSE 'out'
                    END as movement_type,
                    sl.date as movement_date,
                    sl.status,
                    sl.trcode,
                    COALESCE(st.name, 'Merkez Ambar') as warehouse_name,
                    'invoice' as source_type,
                    COALESCE(sl.currency_rate, 1.0) as currency_rate,
                    COALESCE(sl.currency, 'IQD') as currency,
                    COALESCE(si.gross_profit, 0) as gross_profit
                 FROM sale_items si
                 JOIN sales sl ON si.invoice_id = sl.id
                 LEFT JOIN stores st ON sl.store_id = st.id
                 WHERE si.item_code = $1
                    OR si.item_code IN (SELECT code FROM products WHERE id::text = $1 OR code = $1)
                    OR si.product_id::text = $1`,
                [productId]
            );
            invoiceRows = rows;
        } catch (err) {
            console.warn('[StockMovementAPI] sale_items query failed:', err);
        }

        const combined = [...slipRows, ...invoiceRows];
        combined.sort((a, b) => {
            const da = new Date(a.movement_date || a.created_at).getTime();
            const db = new Date(b.movement_date || b.created_at).getTime();
            return db - da;
        });

        console.log(`[StockMovementAPI] getProductMovements(${productId}): slips=${slipRows.length}, invoices=${invoiceRows.length}`);
        return combined.map(mapRow);
    }

    /**
     * Create a new stock movement
     */
    async create(movement: Partial<StockMovement>, items: Partial<StockMovementItem>[]): Promise<StockMovement> {
        try {
            // Determine trcode if not provided
            let trcode = movement.trcode || STOCK_SLIP_TRCODES.CONSUMPTION;
            if (movement.movement_type === 'in') trcode = STOCK_SLIP_TRCODES.PRODUCTION_IN;
            if (movement.movement_type === 'transfer') trcode = STOCK_SLIP_TRCODES.TRANSFER;
            if (movement.movement_type === 'adjustment') trcode = STOCK_SLIP_TRCODES.COUNTING;

            // Header
            const { rows } = await postgres.query(
                `INSERT INTO stock_movements (
                    document_no, movement_type, trcode, warehouse_id, target_warehouse_id, movement_date, exchange_rate, description, status, created_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                 RETURNING *`,
                [
                    movement.document_no || `ST-${Date.now()}`,
                    movement.movement_type || 'out',
                    trcode,
                    movement.warehouse_id,
                    movement.target_warehouse_id,
                    movement.movement_date || new Date().toISOString(),
                    movement.exchange_rate || 1,
                    movement.description,
                    movement.status || 'completed',
                    movement.created_by
                ]
            );
            const newMovement = rows[0];

            // Items
            for (const item of items) {
                await postgres.query(
                    `INSERT INTO stock_movement_items (
                        movement_id, product_id, quantity, unit_price, cost_price, exchange_rate, unit_name, convert_factor, notes
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        newMovement.id, 
                        item.product_id, 
                        item.quantity, 
                        item.unit_price || 0,
                        item.cost_price || 0,
                        item.exchange_rate || movement.exchange_rate || 1,
                        item.unit_name,
                        item.convert_factor || 1,
                        item.notes
                    ]
                );

                // Update stock in products table
                if (item.product_id) {
                    let modifier = Number(item.quantity) || 0;
                    // If out-type movement, subtract stock (except for specific in-types)
                    if (['out', 'adjustment'].includes(movement.movement_type || 'out')) {
                        // Adjustment logic could be more complex (expected vs counted), 
                        // but here we follow movement_type simple logic for now.
                        modifier = -modifier;
                    }

                    if (movement.movement_type !== 'transfer') { // Transfers don't change global stock in this model
                        await postgres.query(
                            `UPDATE products SET stock = stock + $1 WHERE id = $2`,
                            [modifier, item.product_id]
                        );
                    }
                }
            }

            return newMovement;
        } catch (error) {
            console.error('[StockMovementAPI] create failed:', error);
            throw error;
        }
    }

    /**
     * Delete a movement
     */
    async delete(id: string): Promise<void> {
        try {
            // Note: In a real system, deleting movements should probably revert stock changes.
            // For now, we follow the simple delete pattern.
            await postgres.query(`DELETE FROM stock_movements WHERE id = $1`, [id]);
        } catch (error) {
            console.error('[StockMovementAPI] delete failed:', error);
            throw error;
        }
    }
}

export const stockMovementAPI = new StockMovementAPI();

