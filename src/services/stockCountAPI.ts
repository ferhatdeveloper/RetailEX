import { postgres, ERP_SETTINGS } from './postgres';
import { supabase } from '../utils/supabase/client';

export interface StockCount {
    id: string;
    count_no: string;
    warehouse_id?: string;
    count_date: string;
    status: string;
    notes?: string;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export interface StockCountItem {
    id: string;
    count_id: string;
    product_id: string;
    expected_quantity?: number;
    counted_quantity?: number;
    difference?: number;
    notes?: string;
}

class StockCountAPI {
    async getAll(): Promise<StockCount[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT 
                    c.id, c.fiche_no as count_no, c.store_id as warehouse_id, c.date as count_date, 
                    c.status, c.description as notes, c.created_by, c.created_at,
                    s.name as warehouse_name
                 FROM wms.counting_slips c
                 LEFT JOIN stores s ON c.store_id = s.id
                 WHERE c.firm_nr = $1
                 ORDER BY c.created_at DESC`,
                [ERP_SETTINGS.firmNr]
            );
            return rows.map(r => ({
                ...r,
                warehouses: { name: r.warehouse_name }
            }));
        } catch (error) {
            console.error('Error fetching stock counts:', error);
            return [];
        }
    }

    async getById(id: string): Promise<StockCount | null> {
        try {
            const { rows } = await postgres.query(
                `SELECT 
                    c.id, c.fiche_no as count_no, c.store_id as warehouse_id, c.date as count_date, 
                    c.status, c.description as notes, c.created_by, c.created_at
                 FROM wms.counting_slips c
                 WHERE c.id = $1`,
                [id]
            );

            if (!rows[0]) return null;
            const count = rows[0];

            // Items
            const { rows: items } = await postgres.query(
                `SELECT 
                    ci.id, ci.slip_id as count_id, ci.product_id, 
                    ci.expected_qty as expected_quantity, ci.counted_qty as counted_quantity, ci.variance as difference, ci.notes,
                    p.name as product_name, p.code as product_code
                 FROM wms.counting_lines ci
                 LEFT JOIN rex_${ERP_SETTINGS.firmNr}_products p ON ci.product_id = p.id
                 WHERE ci.slip_id = $1`,
                [id]
            );

            return {
                ...count,
                stock_count_items: items.map(i => ({
                    ...i,
                    products: { name: i.product_name, code: i.product_code }
                }))
            };
        } catch (error) {
            console.error('Error fetching stock count:', error);
            return null;
        }
    }

    async create(count: Partial<StockCount>, items: Partial<StockCountItem>[]): Promise<StockCount> {
        try {
            // Header
            const { rows } = await postgres.query(
                `INSERT INTO wms.counting_slips (
                    firm_nr, fiche_no, store_id, date, status, description, created_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
                 RETURNING id, fiche_no as count_no`,
                [
                    ERP_SETTINGS.firmNr,
                    count.count_no,
                    count.warehouse_id,
                    count.count_date,
                    count.status || 'draft',
                    count.notes,
                    count.created_by
                ]
            );
            const newCount = rows[0];

            // Items
            for (const item of items) {
                await postgres.query(
                    `INSERT INTO wms.counting_lines (slip_id, product_id, expected_qty, counted_qty, variance, notes)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [
                        newCount.id,
                        item.product_id,
                        item.expected_quantity || 0,
                        item.counted_quantity || 0,
                        (item.counted_quantity || 0) - (item.expected_quantity || 0),
                        item.notes
                    ]
                );
            }

            return newCount;
        } catch (error) {
            console.error('Error creating stock count:', error);
            throw error;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await postgres.query(`DELETE FROM wms.counting_slips WHERE id = $1`, [id]);
        } catch (error) {
            console.error('Error deleting stock count:', error);
            throw error;
        }
    }
}

export const stockCountAPI = new StockCountAPI();


