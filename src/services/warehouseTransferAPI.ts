import { postgres, ERP_SETTINGS } from './postgres';
import { supabase } from '../utils/supabase/client';

export interface WarehouseTransfer {
    id: string;
    transfer_no: string;
    from_warehouse_id?: string;
    to_warehouse_id?: string;
    transfer_date: string;
    status: string;
    notes?: string;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export interface WarehouseTransferItem {
    id: string;
    transfer_id: string;
    product_id: string;
    quantity: number;
    notes?: string;
}

class WarehouseTransferAPI {
    async getAll(): Promise<WarehouseTransfer[]> {
        try {
            // wms.transfers INNER JOIN stores (twice) to get names
            const { rows } = await postgres.query(
                `SELECT 
                    t.id, t.fiche_no as transfer_no, t.source_store_id as from_warehouse_id, t.target_store_id as to_warehouse_id, 
                    t.date as transfer_date, t.status, t.created_at,
                    s1.name as from_warehouse_name,
                    s2.name as to_warehouse_name
                 FROM wms.transfers t
                 LEFT JOIN stores s1 ON t.source_store_id = s1.id
                 LEFT JOIN stores s2 ON t.target_store_id = s2.id
                 WHERE t.firm_nr = $1
                 ORDER BY t.created_at DESC`,
                [ERP_SETTINGS.firmNr]
            );

            return rows.map(r => ({
                ...r,
                from_warehouse: { name: r.from_warehouse_name },
                to_warehouse: { name: r.to_warehouse_name }
            }));
        } catch (error) {
            console.error('Error fetching transfers:', error);
            return [];
        }
    }

    async getById(id: string): Promise<WarehouseTransfer | null> {
        try {
            const { rows } = await postgres.query(
                `SELECT 
                    t.id, t.fiche_no as transfer_no, t.source_store_id as from_warehouse_id, t.target_store_id as to_warehouse_id, 
                    t.date as transfer_date, t.status, t.created_at
                 FROM wms.transfers t
                 WHERE t.id = $1`,
                [id]
            );

            if (!rows[0]) return null;
            const transfer = rows[0];

            // Get Items
            const { rows: items } = await postgres.query(
                `SELECT 
                    ti.*,
                    p.name as product_name, p.code as product_code
                 FROM wms.transfer_items ti
                 LEFT JOIN rex_${ERP_SETTINGS.firmNr}_products p ON ti.product_id = p.id
                 WHERE ti.transfer_id = $1`,
                [id]
            );

            return {
                ...transfer,
                warehouse_transfer_items: items.map(i => ({
                    ...i,
                    products: { name: i.product_name, code: i.product_code }
                }))
            };

        } catch (error) {
            console.error('Error fetching transfer:', error);
            return null;
        }
    }

    async create(transfer: Partial<WarehouseTransfer>, items: Partial<WarehouseTransferItem>[]): Promise<WarehouseTransfer> {
        try {
            // Header
            const { rows } = await postgres.query(
                `INSERT INTO wms.transfers (
                    firm_nr, fiche_no, source_store_id, target_store_id, date, status
                 ) VALUES ($1, $2, $3, $4, $5, $6) 
                 RETURNING id, fiche_no as transfer_no`,
                [
                    ERP_SETTINGS.firmNr,
                    transfer.transfer_no,
                    transfer.from_warehouse_id,
                    transfer.to_warehouse_id,
                    transfer.transfer_date,
                    transfer.status || 'pending'
                ]
            );
            const newTransfer = rows[0];

            // Items
            for (const item of items) {
                await postgres.query(
                    `INSERT INTO wms.transfer_items (transfer_id, product_id, quantity, notes)
                     VALUES ($1, $2, $3, $4)`,
                    [newTransfer.id, item.product_id, item.quantity, item.notes]
                );
            }

            return newTransfer;
        } catch (error) {
            console.error('Error creating transfer:', error);
            throw error;
        }
    }

    async update(id: string, transfer: Partial<WarehouseTransfer>, items: Partial<WarehouseTransferItem>[]): Promise<WarehouseTransfer> {
        try {
            // Update Header
            // Only specific fields
            if (transfer.status) {
                await postgres.query(`UPDATE wms.transfers SET status = $1 WHERE id = $2`, [transfer.status, id]);
            }

            // Replace Items (Delete & Insert)
            await postgres.query(`DELETE FROM wms.transfer_items WHERE transfer_id = $1`, [id]);

            for (const item of items) {
                await postgres.query(
                    `INSERT INTO wms.transfer_items (transfer_id, product_id, quantity, notes)
                     VALUES ($1, $2, $3, $4)`,
                    [id, item.product_id, item.quantity, item.notes]
                );
            }

            return (await this.getById(id))!;

        } catch (error) {
            console.error('Error updating transfer:', error);
            throw error;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await postgres.query(`DELETE FROM wms.transfers WHERE id = $1`, [id]);
        } catch (error) {
            console.error('Error deleting transfer:', error);
            throw error;
        }
    }
}

export const warehouseTransferAPI = new WarehouseTransferAPI();


