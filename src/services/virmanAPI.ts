/**
 * Virman API - Warehouse Transfer Notes
 * Converted from Supabase to Direct PostgreSQL (postgres.ts)
 * Tables: virman_operations (period), virman_items (period)
 */

import { postgres, ERP_SETTINGS } from './postgres';

export interface VirmanOperation {
    id: string;
    virman_no: string;
    from_warehouse_id?: string;
    to_warehouse_id?: string;
    operation_date: string;
    status: string;
    notes?: string;
    created_by?: string;
    created_at: string;
    updated_at: string;
}

export interface VirmanItem {
    id: string;
    virman_id: string;
    product_id: string;
    quantity: number;
    notes?: string;
}

class VirmanAPI {
    async getAll(): Promise<VirmanOperation[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT v.*,
                    fw.name as from_warehouse_name,
                    tw.name as to_warehouse_name
                 FROM virman_operations v
                 LEFT JOIN stores fw ON v.from_warehouse_id = fw.id
                 LEFT JOIN stores tw ON v.to_warehouse_id = tw.id
                 WHERE v.firm_nr = $1
                 ORDER BY v.created_at DESC`,
                [ERP_SETTINGS.firmNr]
            );
            return rows.map(mapRow);
        } catch (error) {
            console.error('[VirmanAPI] getAll failed:', error);
            return [];
        }
    }

    async getById(id: string): Promise<VirmanOperation | null> {
        try {
            const { rows } = await postgres.query(
                `SELECT * FROM virman_operations WHERE id = $1 AND firm_nr = $2`,
                [id, ERP_SETTINGS.firmNr]
            );
            return rows[0] ? mapRow(rows[0]) : null;
        } catch (error) {
            console.error('[VirmanAPI] getById failed:', error);
            return null;
        }
    }

    async getItems(virmanId: string): Promise<VirmanItem[]> {
        try {
            const { rows } = await postgres.query(
                `SELECT vi.*, p.name as product_name, p.code as product_code
                 FROM virman_items vi
                 LEFT JOIN products p ON vi.product_id = p.id
                 WHERE vi.virman_id = $1`,
                [virmanId]
            );
            return rows.map((r: any) => ({
                id: r.id,
                virman_id: r.virman_id,
                product_id: r.product_id,
                quantity: parseFloat(r.quantity || 0),
                notes: r.notes,
            }));
        } catch (error) {
            console.error('[VirmanAPI] getItems failed:', error);
            return [];
        }
    }

    async create(virman: Partial<VirmanOperation>, items: Partial<VirmanItem>[]): Promise<VirmanOperation> {
        try {
            await postgres.query('BEGIN');

            const { rows } = await postgres.query(
                `INSERT INTO virman_operations (
                    firm_nr, period_nr, virman_no, from_warehouse_id, to_warehouse_id,
                    operation_date, status, notes, created_by
                 ) VALUES ($1, $2, $3, $4::uuid, $5::uuid, $6::timestamptz, $7, $8, $9)
                 RETURNING *`,
                [
                    ERP_SETTINGS.firmNr,
                    ERP_SETTINGS.periodNr || '01',
                    virman.virman_no || `VRM-${Date.now()}`,
                    virman.from_warehouse_id || null,
                    virman.to_warehouse_id || null,
                    virman.operation_date || new Date().toISOString(),
                    virman.status || 'draft',
                    virman.notes || '',
                    virman.created_by || ''
                ]
            );

            const virmanId = rows[0].id;

            for (const item of items) {
                await postgres.query(
                    `INSERT INTO virman_items (virman_id, product_id, quantity, notes)
                     VALUES ($1::uuid, $2::uuid, $3::numeric, $4)`,
                    [virmanId, item.product_id || null, item.quantity || 0, item.notes || '']
                );
            }

            await postgres.query('COMMIT');
            return mapRow(rows[0]);
        } catch (error) {
            await postgres.query('ROLLBACK');
            console.error('[VirmanAPI] create failed:', error);
            throw error;
        }
    }

    async delete(id: string): Promise<void> {
        try {
            await postgres.query(
                `DELETE FROM virman_operations WHERE id = $1 AND firm_nr = $2`,
                [id, ERP_SETTINGS.firmNr]
            );
        } catch (error) {
            console.error('[VirmanAPI] delete failed:', error);
            throw error;
        }
    }
}

function mapRow(row: any): VirmanOperation {
    return {
        id: row.id,
        virman_no: row.virman_no,
        from_warehouse_id: row.from_warehouse_id,
        to_warehouse_id: row.to_warehouse_id,
        operation_date: row.operation_date,
        status: row.status || 'draft',
        notes: row.notes,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at || row.created_at,
    };
}

export const virmanAPI = new VirmanAPI();
