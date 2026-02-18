import { postgres, ERP_SETTINGS } from './postgres';

export interface StockMovement {
    id: string;
    document_no: string;
    trcode: number;
    movement_type: string; // 'in' | 'out' | 'transfer' | 'adjustment'
    warehouse_id?: string;
    target_warehouse_id?: string; // For transfers
    movement_date: string;
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
        try {
            const { rows } = await postgres.query(
                `SELECT 
                    i.*, 
                    m.document_no, m.movement_type, m.movement_date, m.status, m.trcode,
                    s.name as warehouse_name
                 FROM stock_movement_items i
                 JOIN stock_movements m ON i.movement_id = m.id
                 LEFT JOIN stores s ON m.warehouse_id = s.id
                 WHERE i.product_id = $1
                 ORDER BY i.created_at DESC`,
                [productId]
            );

            return rows.map(r => ({
                ...r,
                movement: {
                    document_no: r.document_no,
                    movement_type: r.movement_type,
                    movement_date: r.movement_date,
                    status: r.status,
                    trcode: r.trcode,
                    warehouses: { name: r.warehouse_name }
                }
            }));
        } catch (error) {
            console.error('[StockMovementAPI] getProductMovements failed:', error);
            return [];
        }
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
                    document_no, movement_type, trcode, warehouse_id, movement_date, description, status, created_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                 RETURNING *`,
                [
                    movement.document_no || `ST-${Date.now()}`,
                    movement.movement_type || 'out',
                    trcode,
                    movement.warehouse_id,
                    movement.movement_date || new Date().toISOString(),
                    movement.description,
                    movement.status || 'completed',
                    movement.created_by
                ]
            );
            const newMovement = rows[0];

            // Items
            for (const item of items) {
                await postgres.query(
                    `INSERT INTO stock_movement_items (movement_id, product_id, quantity, unit_price, notes)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [newMovement.id, item.product_id, item.quantity, item.unit_price || 0, item.notes]
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

