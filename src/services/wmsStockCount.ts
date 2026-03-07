/**
 * WMS Stock Count Service
 * Manages inventory counting operations using wms.counting_slips and wms.counting_lines
 */

import { PostgresConnection, ERP_SETTINGS } from './postgres';

export interface CountingSlip {
    id: string;
    firm_nr: string;
    store_id: string;
    fiche_no: string;
    date: string;
    count_type: 'full' | 'cycle' | 'location';
    location_code?: string;
    status: 'draft' | 'active' | 'counting' | 'reconciliation' | 'completed' | 'cancelled';
    description?: string;
    created_by?: string;
    created_at: string;
    updated_at?: string;
    started_at?: string;
    completed_at?: string;
    // Joined fields
    store_name?: string;
    line_count?: number;
}

export interface CountingLine {
    id: string;
    slip_id: string;
    product_id?: string;
    barcode?: string;
    product_name?: string;
    location_code?: string;
    bin_id?: string;
    expected_qty: number;
    counted_qty?: number;
    variance?: number;
    counted_by?: string;
    counted_at?: string;
    notes?: string;
}

export interface ProductLookup {
    id: string;
    name: string;
    code: string;
    barcode?: string;
    stock: number;
}

class WMSStockCountService {
    private conn = PostgresConnection.getInstance();
    private schemaReady = false;

    /**
     * Auto-migrate: Add missing columns to existing wms tables without dropping data.
     * Uses individual ALTER TABLE ... ADD COLUMN IF NOT EXISTS statements (extended query protocol safe).
     * DO $$ blocks cannot be prepared via tokio_postgres's extended protocol — use simple ALTER TABLE instead.
     * Runs once per session. Safe to call repeatedly.
     */
    async ensureSchema(): Promise<void> {
        if (this.schemaReady) return;

        const alterations = [
            // counting_slips enhancements
            `ALTER TABLE wms.counting_slips ADD COLUMN IF NOT EXISTS count_type VARCHAR(20) DEFAULT 'full'`,
            `ALTER TABLE wms.counting_slips ADD COLUMN IF NOT EXISTS location_code VARCHAR(50)`,
            `ALTER TABLE wms.counting_slips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
            `ALTER TABLE wms.counting_slips ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`,
            `ALTER TABLE wms.counting_slips ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
            // counting_lines enhancements
            `ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10)`,
            `ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS barcode VARCHAR(100)`,
            `ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS product_name VARCHAR(500)`,
            `ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS location_code VARCHAR(50)`,
            `ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS counted_by VARCHAR(255)`,
            `ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS counted_at TIMESTAMPTZ`,
            // Backfill firm_nr from parent counting_slips
            `UPDATE wms.counting_lines cl SET firm_nr = cs.firm_nr FROM wms.counting_slips cs WHERE cl.slip_id = cs.id AND cl.firm_nr IS NULL`,
        ];

        let applied = 0;
        for (const sql of alterations) {
            try {
                await this.conn.query(sql);
                applied++;
            } catch (err) {
                // Column likely already exists — not a critical error
                console.warn(`[WMSStockCount] ALTER skipped: ${sql.slice(0, 60)}...`, err);
            }
        }

        this.schemaReady = true;
        console.log(`[WMSStockCount] Schema ensured. ${applied}/${alterations.length} alterations applied.`);
    }

    /**
     * Generate next fiche number for a firm
     */
    async generateFicheNo(): Promise<string> {
        const firmNr = ERP_SETTINGS.firmNr || '001';
        const year = new Date().getFullYear();
        const { rows } = await this.conn.query<{ count: string }>(
            `SELECT COUNT(*) as count FROM wms.counting_slips WHERE firm_nr = $1 AND date_part('year', created_at) = $2`,
            [firmNr, year]
        );
        const seq = (parseInt(rows[0]?.count || '0') + 1).toString().padStart(4, '0');
        return `SAY-${year}-${seq}`;
    }

    /**
     * Get all counting slips for current firm
     */
    async getSlips(status?: string): Promise<CountingSlip[]> {
        await this.ensureSchema();
        const firmNr = ERP_SETTINGS.firmNr || '001';
        let sql = `
            SELECT
                cs.*,
                s.name AS store_name,
                COUNT(cl.id)::int AS line_count
            FROM wms.counting_slips cs
            LEFT JOIN public.stores s ON cs.store_id = s.id
            LEFT JOIN wms.counting_lines cl ON cs.id = cl.slip_id
            WHERE cs.firm_nr = $1
        `;
        const params: any[] = [firmNr];

        if (status) {
            sql += ` AND cs.status = $2`;
            params.push(status);
        }

        sql += ` GROUP BY cs.id, s.name ORDER BY cs.created_at DESC`;

        const { rows } = await this.conn.query<CountingSlip>(sql, params);
        return rows;
    }

    /**
     * Get a single counting slip with its lines
     */
    async getSlipWithLines(slipId: string): Promise<{ slip: CountingSlip; lines: CountingLine[] }> {
        const { rows: slipRows } = await this.conn.query<CountingSlip>(
            `SELECT cs.*, s.name AS store_name
             FROM wms.counting_slips cs
             LEFT JOIN public.stores s ON cs.store_id = s.id
             WHERE cs.id = $1`,
            [slipId]
        );

        const { rows: lineRows } = await this.conn.query<CountingLine>(
            `SELECT * FROM wms.counting_lines WHERE slip_id = $1 ORDER BY counted_at DESC NULLS LAST, created_at ASC`,
            [slipId]
        );

        return { slip: slipRows[0], lines: lineRows };
    }

    /**
     * Create a new counting slip
     */
    async createSlip(data: {
        store_id: string;
        count_type: 'full' | 'cycle' | 'location';
        location_code?: string;
        description?: string;
        created_by?: string;
    }): Promise<CountingSlip> {
        await this.ensureSchema();
        const firmNr = ERP_SETTINGS.firmNr || '001';
        const ficheNo = await this.generateFicheNo();

        const { rows } = await this.conn.query<CountingSlip>(
            `INSERT INTO wms.counting_slips
                (firm_nr, store_id, fiche_no, count_type, location_code, description, status, created_by, date)
             VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7, CURRENT_DATE)
             RETURNING *`,
            [firmNr, data.store_id, ficheNo, data.count_type, data.location_code || null, data.description || null, data.created_by || null]
        );
        if (!rows[0]) throw new Error('INSERT returned no rows - check wms schema');
        return rows[0];
    }

    /**
     * Update slip status
     */
    async updateSlipStatus(slipId: string, status: CountingSlip['status']): Promise<void> {
        // Simple status-only update — extra timestamp columns added by ensureSchema
        await this.conn.query(
            `UPDATE wms.counting_slips SET status = $2 WHERE id = $1`,
            [slipId, status]
        );
    }

    /**
     * Look up a product by barcode
     */
    async lookupProductByBarcode(barcode: string): Promise<ProductLookup | null> {
        // products table will get rewritten to rex_{firmNr}_products by PostgresConnection
        const { rows } = await this.conn.query<ProductLookup>(
            `SELECT id, name, code, barcode, stock
             FROM products
             WHERE barcode = $1 OR code = $1
             LIMIT 1`,
            [barcode]
        );
        return rows[0] || null;
    }

    /**
     * Get current stock for a product
     */
    async getProductStock(productId: string): Promise<number> {
        const { rows } = await this.conn.query<{ stock: number }>(
            `SELECT COALESCE(stock, 0) as stock FROM products WHERE id = $1`,
            [productId]
        );
        return rows[0]?.stock || 0;
    }

    /**
     * Add or update a counting line (upsert by slip_id + barcode)
     */
    async upsertLine(slipId: string, data: {
        product_id?: string;
        barcode?: string;
        product_name?: string;
        location_code?: string;
        expected_qty?: number;
        counted_qty: number;
        counted_by?: string;
        notes?: string;
    }): Promise<CountingLine> {
        await this.ensureSchema();
        // Check if line already exists for this barcode in this slip
        const { rows: existing } = await this.conn.query<CountingLine>(
            `SELECT * FROM wms.counting_lines
             WHERE slip_id = $1 AND (barcode = $2 OR (product_id = $3 AND $2 IS NULL))
             LIMIT 1`,
            [slipId, data.barcode || null, data.product_id || null]
        );

        if (existing.length > 0) {
            // Update: accumulate counted quantity
            const { rows } = await this.conn.query<CountingLine>(
                `UPDATE wms.counting_lines
                 SET counted_qty = $2,
                     variance = $2 - COALESCE(expected_qty, 0),
                     counted_by = $3,
                     counted_at = NOW(),
                     location_code = COALESCE($4, location_code),
                     notes = COALESCE($5, notes)
                 WHERE id = $6
                 RETURNING *`,
                [slipId, data.counted_qty, data.counted_by || null, data.location_code || null, data.notes || null, existing[0].id]
            );
            return rows[0];
        } else {
            // Insert new line
            const variance = data.counted_qty - (data.expected_qty || 0);
            const firmNr = ERP_SETTINGS.firmNr || '001';
            const { rows } = await this.conn.query<CountingLine>(
                `INSERT INTO wms.counting_lines
                    (slip_id, firm_nr, product_id, barcode, product_name, location_code, expected_qty, counted_qty, variance, counted_by, counted_at, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
                 RETURNING *`,
                [
                    slipId,
                    firmNr,
                    data.product_id || null,
                    data.barcode || null,
                    data.product_name || null,
                    data.location_code || null,
                    data.expected_qty || 0,
                    data.counted_qty,
                    variance,
                    data.counted_by || null,
                    data.notes || null
                ]
            );
            return rows[0];
        }
    }

    /**
     * Delete a counting line
     */
    async deleteLine(lineId: string): Promise<void> {
        await this.conn.query(`DELETE FROM wms.counting_lines WHERE id = $1`, [lineId]);
    }

    /**
     * Get variance summary for a slip
     */
    async getVarianceSummary(slipId: string): Promise<{
        total_items: number;
        items_with_variance: number;
        total_variance: number;
        accuracy_rate: number;
    }> {
        const { rows } = await this.conn.query<any>(
            `SELECT
                COUNT(*)::int as total_items,
                COUNT(CASE WHEN ABS(COALESCE(variance, 0)) > 0 THEN 1 END)::int as items_with_variance,
                COALESCE(SUM(ABS(COALESCE(variance, 0))), 0)::float as total_variance
             FROM wms.counting_lines
             WHERE slip_id = $1 AND counted_qty IS NOT NULL`,
            [slipId]
        );
        const r = rows[0];
        const accuracyRate = r.total_items > 0
            ? ((r.total_items - r.items_with_variance) / r.total_items) * 100
            : 100;

        return {
            total_items: r.total_items,
            items_with_variance: r.items_with_variance,
            total_variance: r.total_variance,
            accuracy_rate: Math.round(accuracyRate * 10) / 10
        };
    }

    /**
     * Get available stores for this firm (falls back to all active stores if none match firm_nr)
     */
    async getStores(): Promise<{ id: string; name: string; code: string }[]> {
        const firmNr = ERP_SETTINGS.firmNr || '001';
        const { rows } = await this.conn.query<{ id: string; name: string; code: string }>(
            `SELECT id, name, code FROM public.stores WHERE firm_nr = $1 AND is_active = true ORDER BY name`,
            [firmNr]
        );
        if (rows.length > 0) return rows;
        // Fallback: return all active stores regardless of firm
        const { rows: all } = await this.conn.query<{ id: string; name: string; code: string }>(
            `SELECT id, name, code FROM public.stores WHERE is_active = true ORDER BY name`
        );
        return all;
    }

    /**
     * Cancel a counting slip
     */
    async cancelSlip(slipId: string): Promise<void> {
        await this.conn.query(
            `UPDATE wms.counting_slips SET status = 'cancelled' WHERE id = $1`,
            [slipId]
        );
    }

    /**
     * Complete reconciliation - mark as completed
     */
    async completeReconciliation(slipId: string): Promise<void> {
        await this.conn.query(
            `UPDATE wms.counting_slips
             SET status = 'completed', completed_at = NOW()
             WHERE id = $1`,
            [slipId]
        );
    }
}

export const wmsStockCount = new WMSStockCountService();

