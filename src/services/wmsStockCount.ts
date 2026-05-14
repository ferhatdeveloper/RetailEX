/**
 * WMS Stock Count Service
 * Manages inventory counting operations using wms.counting_slips and wms.counting_lines
 */

import { PostgresConnection, ERP_SETTINGS, DB_SETTINGS } from './postgres';
import { shouldUseTenantPostgrestApi } from '../config/postgrest.config';
import { IS_TAURI } from '../utils/env';
import * as wscRest from './wmsStockCountPostgrest';

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
    unit?: string;
    unit_multiplier?: number;
    base_counted_qty?: number;
    sale_price?: number;
    purchase_price?: number;
    variance_sale_value?: number;
    variance_purchase_value?: number;
}

export interface ProductLookup {
    id: string;
    name: string;
    code: string;
    barcode?: string;
    stock: number;
    unit?: string;
    unit_multiplier?: number;
    matched_by?: 'barcode' | 'unit_barcode';
}

class WMSStockCountService {
    private conn = PostgresConnection.getInstance();
    private schemaReady = false;

    /** Kiracı PostgREST (rest_api veya hibrit + remote_rest_url) — pg_bridge ile aynı veriyi okumak için. */
    private usePostgrestWms(): boolean {
        return shouldUseTenantPostgrestApi();
    }

    /**
     * Auto-migrate: Add missing columns to existing wms tables without dropping data.
     * Uses individual ALTER TABLE ... ADD COLUMN IF NOT EXISTS statements (extended query protocol safe).
     * DO $$ blocks cannot be prepared via tokio_postgres's extended protocol — use simple ALTER TABLE instead.
     * Runs once per session. Safe to call repeatedly.
     */
    async ensureSchema(): Promise<void> {
        if (this.schemaReady) return;

        // Tarayıcıda DDL pg_bridge üzerinden çok yavaş / zaman aşımına düşer; kolonlar migration ile gelmeli.
        if (typeof window !== 'undefined' && !IS_TAURI) {
            this.schemaReady = true;
            return;
        }

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
            `ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'Adet'`,
            `ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS unit_multiplier DECIMAL(15,4) DEFAULT 1`,
            `ALTER TABLE wms.counting_lines ADD COLUMN IF NOT EXISTS base_counted_qty DECIMAL(15,2)`,
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
        if (this.usePostgrestWms()) {
            return await wscRest.restGenerateFicheNo();
        }
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
        if (this.usePostgrestWms()) {
            return (await wscRest.restGetSlips(status)) as CountingSlip[];
        }
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
        await this.ensureSchema();
        if (this.usePostgrestWms()) {
            return (await wscRest.restGetSlipWithLines(slipId)) as { slip: CountingSlip; lines: CountingLine[] };
        }

        const { rows: slipRows } = await this.conn.query<CountingSlip>(
            `SELECT cs.*, s.name AS store_name
             FROM wms.counting_slips cs
             LEFT JOIN public.stores s ON cs.store_id = s.id
             WHERE cs.id = $1`,
            [slipId]
        );

        const { rows: lineRows } = await this.conn.query<CountingLine>(
            `SELECT cl.*
             FROM wms.counting_lines cl
             WHERE cl.slip_id = $1
             ORDER BY COALESCE(cl.counted_at, '1970-01-01'::timestamptz) DESC, cl.id ASC`,
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
        if (this.usePostgrestWms()) {
            return (await wscRest.restCreateSlip(data)) as CountingSlip;
        }
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
        if (this.usePostgrestWms()) {
            await wscRest.restUpdateSlipStatus(slipId, status);
            return;
        }
        // Simple status-only update — extra timestamp columns added by ensureSchema
        await this.conn.query(
            `UPDATE wms.counting_slips SET status = $2 WHERE id = $1`,
            [slipId, status]
        );
    }

    /**
     * Look up a product by barcode — mirrors productAPI.lookupByBarcode in MarketPOS.
     * Step 1: products.barcode / products.code direct match
     * Step 2: product_barcodes table (unit barcodes — palet, koli, paket)
     *   → multiplier from unitsetl (via unitset_id) or product_unit_conversions fallback
     */
    async lookupProductByBarcode(barcode: string): Promise<ProductLookup | null> {
        console.log('[lookupProductByBarcode] searching for barcode:', barcode);
        if (this.usePostgrestWms()) {
            try {
                const r = await wscRest.restLookupProductByBarcode(barcode);
                return r as ProductLookup | null;
            } catch (err) {
                console.warn('[lookupProductByBarcode] PostgREST failed:', err);
                return null;
            }
        }

        // ── Step 1: Direct products match (barcode or code) ──────────────────
        try {
            const { rows } = await this.conn.query<any>(
                `SELECT id, name, code, barcode, unitset_id
                 FROM products WHERE (barcode = $1 OR code = $1) AND is_active = true LIMIT 1`,
                [barcode]
            );
            console.log('[lookup step1] products direct match:', rows.length, 'rows');
            if (rows[0]) {
                console.log('[lookup step1] FOUND:', rows[0].name, rows[0].code);
                return { id: rows[0].id, name: rows[0].name, code: rows[0].code,
                         barcode: rows[0].barcode, unit: 'Adet', unit_multiplier: 1,
                         stock: 0, matched_by: 'barcode' };
            }
        } catch (err) {
            console.warn('[lookup step1] products query failed:', err);
        }

        // ── Step 2: product_barcodes — unit-specific barcodes ─────────────────
        try {
            console.log('[lookup step2] checking product_barcodes for:', barcode);
            const { rows: pbRows } = await this.conn.query<any>(
                `SELECT product_id, barcode_code, unit, sale_price
                 FROM product_barcodes WHERE barcode_code = $1 ORDER BY is_primary DESC LIMIT 1`,
                [barcode]
            );
            console.log('[lookup step2] product_barcodes rows:', pbRows.length, pbRows[0] || '');

            if (pbRows[0]) {
                const pb = pbRows[0];

                // Fetch the parent product
                const { rows: pRows } = await this.conn.query<any>(
                    `SELECT id, name, code, barcode, unitset_id
                     FROM products WHERE id::text = $1 LIMIT 1`,
                    [String(pb.product_id)]
                );
                console.log('[lookup step2] parent product rows:', pRows.length, pRows[0]?.name || '');
                if (!pRows[0]) return null;

                const prod = pRows[0];
                const unitName: string = pb.unit || 'Birim';
                let multiplier = 1;

                // Priority 1: unitsetl (same logic as MarketPOS)
                if (prod.unitset_id && unitName) {
                    try {
                        const { rows: uRows } = await this.conn.query<any>(
                            `SELECT conv_fact1 FROM unitsetl
                             WHERE unitset_id = $1 AND (name = $2 OR code = $2) LIMIT 1`,
                            [prod.unitset_id, unitName]
                        );
                        console.log('[lookup step2] unitsetl result:', uRows[0] || 'none');
                        if (uRows[0]?.conv_fact1) multiplier = parseFloat(uRows[0].conv_fact1) || 1;
                    } catch (err) {
                        console.warn('[lookup step2] unitsetl query failed:', err);
                    }
                }

                // Priority 2: product_unit_conversions fallback
                if (multiplier === 1 && unitName) {
                    try {
                        const { rows: cRows } = await this.conn.query<any>(
                            `SELECT factor FROM product_unit_conversions
                             WHERE product_id::text = $1 AND from_unit = $2 LIMIT 1`,
                            [String(pb.product_id), unitName]
                        );
                        console.log('[lookup step2] product_unit_conversions result:', cRows[0] || 'none');
                        if (cRows[0]?.factor) multiplier = parseFloat(cRows[0].factor) || 1;
                    } catch (err) {
                        console.warn('[lookup step2] product_unit_conversions query failed:', err);
                    }
                }

                console.log('[lookup step2] FOUND unit barcode — unit:', unitName, 'multiplier:', multiplier);
                return {
                    id: prod.id,
                    name: prod.name,
                    code: prod.code,
                    barcode,
                    unit: unitName,
                    unit_multiplier: multiplier,
                    stock: 0,
                    matched_by: 'unit_barcode',
                };
            }
        } catch (err) {
            console.warn('[lookup step2] product_barcodes query failed:', err);
        }

        console.log('[lookupProductByBarcode] NOT FOUND for barcode:', barcode);
        return null;
    }

    /**
     * Fetch purchase + sale prices for a list of product IDs.
     * Tries multiple column name conventions (price_list_1, price).
     */
    async getLinesPrices(productIds: string[]): Promise<Record<string, { purchase: number; sale: number; code?: string }>> {
        const ids = productIds.filter(Boolean);
        if (!ids.length) return {};
        if (this.usePostgrestWms()) {
            return await wscRest.restGetLinesPrices(ids);
        }
        const saleCols = [
            `COALESCE(price_list_1, 0)::float as sale`,
            `COALESCE(price, 0)::float as sale`,
            `0::float as sale`,
        ];
        /** Alış: kartta `purchase_price` boş/0 iken çoğu kurulumda maliyet `cost` kolonundadır. */
        const purchaseCols = [
            `COALESCE(NULLIF(purchase_price, 0), cost, 0)::float AS purchase`,
            `COALESCE(purchase_price, cost, 0)::float AS purchase`,
            `COALESCE(cost, 0)::float AS purchase`,
            `COALESCE(purchase_price, 0)::float AS purchase`,
            `0::float AS purchase`,
        ];
        for (const saleCol of saleCols) {
            for (const purchaseCol of purchaseCols) {
                try {
                    const { rows } = await this.conn.query<any>(
                        `SELECT id::text, NULLIF(TRIM(code::text), '') AS code, ${saleCol}, ${purchaseCol}
                         FROM products WHERE id::text = ANY($1)`,
                        [ids]
                    );
                    const uuidRe =
                        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    return Object.fromEntries(
                        rows.map((r: any) => {
                            const idRaw = String(r.id ?? '');
                            const k = uuidRe.test(idRaw) ? idRaw.toLowerCase() : idRaw;
                            return [
                                k,
                                {
                                    purchase: r.purchase || 0,
                                    sale: r.sale || 0,
                                    ...(r.code ? { code: String(r.code) } : {}),
                                },
                            ] as const;
                        })
                    );
                } catch {
                    continue;
                }
            }
        }
        return {};
    }

    /**
     * Create a minimal product card from an unknown barcode.
     * Returns the new product's id, or null on failure.
     */
    async createProductFromBarcode(data: {
        name: string;
        code: string;
        barcode: string;
        unit?: string;
        purchase_price?: number;
        sale_price?: number;
    }): Promise<string | null> {
        if (this.usePostgrestWms()) {
            return await wscRest.restCreateProductFromBarcode(data);
        }
        const firmNr = ERP_SETTINGS.firmNr || '001';
        // Try inserting with progressively fewer columns
        const attempts = [
            { sql: `INSERT INTO products (name, code, barcode, firm_nr, is_active, purchase_price, price_list_1) VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING id::text`, params: [data.name, data.code, data.barcode, firmNr, data.purchase_price || 0, data.sale_price || 0] },
            { sql: `INSERT INTO products (name, code, barcode, firm_nr, is_active) VALUES ($1,$2,$3,$4,true) RETURNING id::text`, params: [data.name, data.code, data.barcode, firmNr] },
            { sql: `INSERT INTO products (name, code, barcode, is_active) VALUES ($1,$2,$3,true) RETURNING id::text`, params: [data.name, data.code, data.barcode] },
        ];
        for (const { sql, params } of attempts) {
            try {
                const { rows } = await this.conn.query<{ id: string }>(sql, params);
                return rows[0]?.id || null;
            } catch { continue; }
        }
        return null;
    }

    /**
     * Link a counting line to a newly created product
     */
    async updateLineProduct(lineId: string, productId: string, productName: string): Promise<void> {
        if (this.usePostgrestWms()) {
            await wscRest.restUpdateLineProduct(lineId, productId, productName);
            return;
        }
        await this.conn.query(
            `UPDATE wms.counting_lines SET product_id = $2, product_name = $3 WHERE id = $1`,
            [lineId, productId, productName]
        );
    }

    /**
     * Get an existing counting line by barcode within a slip (fresh from DB)
     */
    async getLineByBarcode(slipId: string, barcode: string): Promise<CountingLine | null> {
        await this.ensureSchema();
        if (this.usePostgrestWms()) {
            return (await wscRest.restGetLineByBarcode(slipId, barcode)) as CountingLine | null;
        }
        const { rows } = await this.conn.query<CountingLine>(
            `SELECT * FROM wms.counting_lines WHERE slip_id = $1 AND barcode = $2 LIMIT 1`,
            [slipId, barcode]
        );
        return rows[0] || null;
    }

    /**
     * Get unit set lines for a product's unitset
     */
    async getUnitSetLines(unitsetId: string): Promise<Array<{ code: string; name: string; main_unit: boolean; multiplier: number }>> {
        try {
            const { rows } = await this.conn.query(
                `SELECT code, name, main_unit,
                        COALESCE(conv_fact1, multiplier1, 1)::float AS multiplier
                 FROM unitsetl WHERE unitset_id = $1 ORDER BY main_unit DESC, conv_fact1 ASC`,
                [unitsetId]
            );
            return rows.map((r: any) => ({ ...r, multiplier: parseFloat(r.multiplier) || 1 }));
        } catch {
            return [];
        }
    }

    /**
     * Get current stock for a product
     */
    async getProductStock(productId: string): Promise<number> {
        if (this.usePostgrestWms()) {
            return await wscRest.restGetProductStock(productId);
        }
        try {
            const { rows } = await this.conn.query<{ stock: number }>(
                `SELECT COALESCE(stock, 0) as stock FROM products WHERE id = $1`,
                [productId]
            );
            return rows[0]?.stock || 0;
        } catch {
            return 0;
        }
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
        unit?: string;
        unit_multiplier?: number;
        base_counted_qty?: number;
    }): Promise<CountingLine> {
        await this.ensureSchema();
        if (this.usePostgrestWms()) {
            return (await wscRest.restUpsertLine(slipId, data)) as CountingLine;
        }
        console.log('[upsertLine] slipId=', slipId, 'barcode=', data.barcode);
        // Check if line already exists for this barcode in this slip
        const { rows: existing } = await this.conn.query<CountingLine>(
            `SELECT * FROM wms.counting_lines
             WHERE slip_id = $1 AND (barcode = $2 OR (product_id = $3 AND $2 IS NULL))
             LIMIT 1`,
            [slipId, data.barcode || null, data.product_id || null]
        );
        console.log('[upsertLine] existing rows:', existing.length);

        const unitMultiplier = data.unit_multiplier || 1;
        const baseCounted = data.base_counted_qty ?? (data.counted_qty * unitMultiplier);

        if (existing.length > 0) {
            const { rows } = await this.conn.query<CountingLine>(
                `UPDATE wms.counting_lines
                 SET counted_qty = $2,
                     variance = $9 - COALESCE(expected_qty, 0),
                     counted_by = $3,
                     counted_at = NOW(),
                     location_code = COALESCE($4, location_code),
                     notes = COALESCE($5, notes),
                     unit = COALESCE($7, unit),
                     unit_multiplier = $8,
                     base_counted_qty = $9
                 WHERE id = $6 AND slip_id = $1
                 RETURNING *`,
                [slipId, data.counted_qty, data.counted_by || null, data.location_code || null, data.notes || null, existing[0].id,
                 data.unit || null, unitMultiplier, baseCounted]
            );
            console.log('[upsertLine] UPDATE returned:', rows.length, 'rows');
            return rows[0];
        } else {
            const variance = baseCounted - (data.expected_qty || 0);
            const firmNr = ERP_SETTINGS.firmNr || '001';
            const { rows } = await this.conn.query<CountingLine>(
                `INSERT INTO wms.counting_lines
                    (slip_id, firm_nr, product_id, barcode, product_name, location_code, expected_qty, counted_qty, variance, counted_by, counted_at, notes, unit, unit_multiplier, base_counted_qty)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, $13, $14)
                 RETURNING *`,
                [
                    slipId, firmNr,
                    data.product_id || null, data.barcode || null, data.product_name || null,
                    data.location_code || null, data.expected_qty || 0,
                    data.counted_qty, variance,
                    data.counted_by || null, data.notes || null,
                    data.unit || 'Adet', unitMultiplier, baseCounted
                ]
            );
            console.log('[upsertLine] INSERT returned:', rows.length, 'rows, row=', rows[0]);
            return rows[0];
        }
    }

    /**
     * Delete a counting line
     */
    async deleteLine(lineId: string): Promise<void> {
        if (this.usePostgrestWms()) {
            await wscRest.restDeleteLine(lineId);
            return;
        }
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
        shortage_qty: number;
        surplus_qty: number;
        shortage_sale_value: number;
        shortage_purchase_value: number;
        surplus_purchase_value: number;
        net_profit_impact: number;
    }> {
        if (this.usePostgrestWms()) {
            return await wscRest.restGetVarianceSummary(slipId);
        }
        // Note: products JOIN is avoided to prevent "column does not exist" errors on
        // price / price_list_1 columns that differ between firm schemas.
        const { rows } = await this.conn.query<any>(
            `SELECT
                COUNT(*)::int as total_items,
                COUNT(CASE WHEN ABS(COALESCE(cl.variance, 0)) > 0 THEN 1 END)::int as items_with_variance,
                COALESCE(SUM(ABS(COALESCE(cl.variance, 0))), 0)::float as total_variance,
                COALESCE(SUM(CASE WHEN cl.variance < 0 THEN ABS(cl.variance) ELSE 0 END), 0)::float as shortage_qty,
                COALESCE(SUM(CASE WHEN cl.variance > 0 THEN cl.variance ELSE 0 END), 0)::float as surplus_qty,
                0::float as shortage_sale_value,
                0::float as shortage_purchase_value,
                0::float as surplus_purchase_value
             FROM wms.counting_lines cl
             WHERE cl.slip_id = $1 AND cl.counted_qty IS NOT NULL`,
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
            accuracy_rate: Math.round(accuracyRate * 10) / 10,
            shortage_qty: r.shortage_qty,
            surplus_qty: r.surplus_qty,
            shortage_sale_value: r.shortage_sale_value,
            shortage_purchase_value: r.shortage_purchase_value,
            surplus_purchase_value: r.surplus_purchase_value,
            net_profit_impact: r.surplus_purchase_value - r.shortage_purchase_value,
        };
    }

    /**
     * Get available stores for this firm (falls back to all active stores if none match firm_nr)
     */
    async getStores(): Promise<{ id: string; name: string; code: string }[]> {
        const firmNr = ERP_SETTINGS.firmNr || '001';
        if (DB_SETTINGS.connectionProvider === 'rest_api') {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const rows = await postgrest.get<any[]>(
                    '/stores',
                    {
                        select: 'id,name,code,firm_nr,type,is_active',
                        is_active: 'eq.true',
                        order: 'name.asc',
                    },
                    { schema: 'public' }
                );
                const all = Array.isArray(rows) ? rows : [];
                const firmNorm = String(firmNr).padStart(3, '0');
                const byFirm = all.filter((r: any) => {
                    const fn = String(r?.firm_nr ?? '').trim();
                    if (!fn) return false;
                    return fn.padStart(3, '0') === firmNorm || String(parseInt(fn, 10)).padStart(3, '0') === firmNorm;
                });
                const source = byFirm.length > 0 ? byFirm : all;
                const mapped = source
                    .filter((r: any) => {
                        const t = String(r?.type ?? '').toUpperCase();
                        return !t || t === 'STORE' || t === 'BRANCH' || t === 'WAREHOUSE';
                    })
                    .map((r: any) => ({
                        id: String(r.id),
                        name: String(r.name ?? ''),
                        code: String(r.code ?? ''),
                    }));
                return mapped;
            } catch (err) {
                console.warn('[WMSStockCount] getStores PostgREST fallback failed:', err);
            }
        }
        const { rows } = await this.conn.query<{ id: string; name: string; code: string }>(
            `SELECT id, name, code
             FROM public.stores
             WHERE is_active = true
               AND (firm_nr::text = $1 OR lpad(trim(firm_nr::text), 3, '0') = lpad(trim($1::text), 3, '0'))
               AND (type IS NULL OR type IN ('STORE','BRANCH','WAREHOUSE'))
             ORDER BY name`,
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
        if (this.usePostgrestWms()) {
            await wscRest.restCancelSlip(slipId);
            return;
        }
        await this.conn.query(
            `UPDATE wms.counting_slips SET status = 'cancelled' WHERE id = $1`,
            [slipId]
        );
    }

    /**
     * Complete reconciliation - mark as completed (status only, no stock movement)
     */
    async completeReconciliation(slipId: string): Promise<void> {
        if (this.usePostgrestWms()) {
            await wscRest.restCompleteReconciliation(slipId);
            return;
        }
        await this.conn.query(
            `UPDATE wms.counting_slips
             SET status = 'completed', completed_at = NOW()
             WHERE id = $1`,
            [slipId]
        );
    }

    /**
     * Apply stock count: create surplus/shortage movements + update product stocks.
     * - Surplus lines (counted > expected) → TRCODE 26 (Sayım Fazlası, movement_type='in')
     * - Shortage lines (counted < expected) → TRCODE 50 (Sayım Eksiği, movement_type='out')
     * - All known lines → products.stock updated to base_counted_qty
     * - Slip marked as 'completed'
     */
    async applyStockCount(slipId: string): Promise<{
        processed: number;
        surplus: number;
        shortage: number;
    }> {
        if (this.usePostgrestWms()) {
            return await wscRest.restApplyStockCount(slipId);
        }
        // 1. Get slip header
        const { rows: slipRows } = await this.conn.query<any>(
            `SELECT * FROM wms.counting_slips WHERE id = $1`,
            [slipId]
        );
        if (!slipRows[0]) throw new Error('Sayım fişi bulunamadı');
        const slip = slipRows[0];

        // 2. Get all lines that have a product linked and a sayılan değer (counted veya baz)
        const { rows: lines } = await this.conn.query<any>(
            `SELECT * FROM wms.counting_lines
             WHERE slip_id = $1 AND product_id IS NOT NULL
               AND (counted_qty IS NOT NULL OR base_counted_qty IS NOT NULL)`,
            [slipId]
        );

        if (!lines.length) {
            await this.completeReconciliation(slipId);
            return { processed: 0, surplus: 0, shortage: 0 };
        }

        const countedBase = (l: any): number => {
            const q = Number(l.counted_qty);
            const m = Number(l.unit_multiplier) > 0 ? Number(l.unit_multiplier) : 1;
            const fromCounted = (Number.isFinite(q) ? q : 0) * m;
            const rawBase = l.base_counted_qty;
            if (rawBase != null && rawBase !== '' && Number.isFinite(Number(rawBase))) {
                const b = Number(rawBase);
                if (Math.abs(b) < 1e-9 && Math.abs(fromCounted) > 1e-9) return fromCounted;
                return b;
            }
            return fromCounted;
        };

        const now = new Date().toISOString();
        const warehouseId = slip.warehouse_id || slip.store_id || null;

        const surplusLines = lines.filter(
            (l: any) => countedBase(l) > (Number(l.expected_qty) || 0) + 1e-9
        );
        const shortageLines = lines.filter(
            (l: any) => countedBase(l) < (Number(l.expected_qty) || 0) - 1e-9
        );

        // 3. Create Sayım Fazlası movement (TRCODE 26) for surplus lines
        if (surplusLines.length > 0) {
            const { rows: mvRows } = await this.conn.query<any>(
                `INSERT INTO stock_movements
                    (document_no, movement_type, trcode, warehouse_id, movement_date, description, status, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [
                    `SAY-FAZ-${slip.fiche_no}`, 'in', 26,
                    warehouseId, now,
                    `Sayım Fazlası - ${slip.fiche_no}`, 'completed',
                    slip.created_by || null,
                ]
            );
            const mvId = mvRows[0].id;
            const params: unknown[] = [mvId];
            const tuples: string[] = [];
            let ph = 2;
            for (const line of surplusLines) {
                const qty = countedBase(line) - (Number(line.expected_qty) || 0);
                if (qty <= 1e-9) continue;
                tuples.push(`($1,$${ph},$${ph + 1},$${ph + 2},$${ph + 3},$${ph + 4})`);
                params.push(line.product_id, qty, line.unit || 'Adet', line.unit_multiplier || 1, `Sayım: ${line.product_name || ''}`);
                ph += 5;
            }
            if (tuples.length > 0) {
                await this.conn.query(
                    `INSERT INTO stock_movement_items (movement_id, product_id, quantity, unit_name, convert_factor, notes) VALUES ${tuples.join(',')}`,
                    params
                );
            }
        }

        // 4. Create Sayım Eksiği movement (TRCODE 50) for shortage lines
        if (shortageLines.length > 0) {
            const { rows: mvRows } = await this.conn.query<any>(
                `INSERT INTO stock_movements
                    (document_no, movement_type, trcode, warehouse_id, movement_date, description, status, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 RETURNING *`,
                [
                    `SAY-EKS-${slip.fiche_no}`, 'out', 50,
                    warehouseId, now,
                    `Sayım Eksiği - ${slip.fiche_no}`, 'completed',
                    slip.created_by || null,
                ]
            );
            const mvId = mvRows[0].id;
            const params: unknown[] = [mvId];
            const tuples: string[] = [];
            let ph = 2;
            for (const line of shortageLines) {
                const qty = (Number(line.expected_qty) || 0) - countedBase(line);
                if (qty <= 1e-9) continue;
                tuples.push(`($1,$${ph},$${ph + 1},$${ph + 2},$${ph + 3},$${ph + 4})`);
                params.push(line.product_id, qty, line.unit || 'Adet', line.unit_multiplier || 1, `Sayım: ${line.product_name || ''}`);
                ph += 5;
            }
            if (tuples.length > 0) {
                await this.conn.query(
                    `INSERT INTO stock_movement_items (movement_id, product_id, quantity, unit_name, convert_factor, notes) VALUES ${tuples.join(',')}`,
                    params
                );
            }
        }

        // 5. Adjust product stocks to counted values (tek UPDATE — satır başına UPDATE yok)
        if (lines.length > 0) {
            const ids = lines.map((l: any) => String(l.product_id));
            const stocks = lines.map((l: any) => countedBase(l));
            await this.conn.query(
                `UPDATE products AS p
                 SET stock = d.new_stock
                 FROM (
                   SELECT unnest($1::uuid[]) AS id,
                          unnest($2::numeric[]) AS new_stock
                 ) AS d
                 WHERE p.id = d.id`,
                [ids, stocks]
            );
        }

        // 6. Mark slip as completed
        await this.completeReconciliation(slipId);

        return {
            processed: lines.length,
            surplus: surplusLines.length,
            shortage: shortageLines.length,
        };
    }
}

export const wmsStockCount = new WMSStockCountService();

