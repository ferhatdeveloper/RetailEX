/**
 * WMS Service - Central data service for Warehouse Management System
 * All queries use PostgresConnection (local PostgreSQL, no Supabase)
 */

import { PostgresConnection, ERP_SETTINGS } from './postgres';

const conn = () => PostgresConnection.getInstance();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WMSDashboardStats {
    totalProducts: number;
    lowStockCount: number;
    activeCountingSlips: number;
    activeStores: number;
    pendingTransfers: number;
    todayReceiving: number;
    stockAccuracy: number;
}

export interface WMSProduct {
    id: string;
    code: string;
    name: string;
    barcode?: string;
    stock: number;
    min_stock?: number;
    unit?: string;
    category?: string;
    brand?: string;
    price?: number;
    cost?: number;
}

export interface WMSTransfer {
    id: string;
    transfer_no?: string;
    from_store_id?: string;
    to_store_id?: string;
    from_store_name?: string;
    to_store_name?: string;
    status: string;
    created_at: string;
    item_count?: number;
    notes?: string;
}

export interface WMSReceivingSlip {
    id: string;
    slip_no: string;
    supplier_name?: string;
    store_id: string;
    store_name?: string;
    status: 'draft' | 'open' | 'completed' | 'cancelled';
    date: string;
    created_at: string;
    item_count?: number;
    total_qty?: number;
}

export interface WMSReceivingLine {
    id: string;
    slip_id: string;
    product_id?: string;
    product_name?: string;
    product_code?: string;
    barcode?: string;
    ordered_qty: number;
    received_qty: number;
    unit?: string;
    lot_number?: string;
    expiry_date?: string;
    location_code?: string;
    notes?: string;
}

export interface WMSDispatchSlip {
    id: string;
    slip_no: string;
    customer_name?: string;
    store_id: string;
    store_name?: string;
    status: 'draft' | 'picking' | 'packed' | 'shipped' | 'cancelled';
    date: string;
    created_at: string;
    item_count?: number;
    total_qty?: number;
    priority?: 'normal' | 'high' | 'urgent';
}

export interface WMSDispatchLine {
    id: string;
    slip_id: string;
    product_id?: string;
    product_name?: string;
    product_code?: string;
    barcode?: string;
    ordered_qty: number;
    picked_qty: number;
    unit?: string;
    location_code?: string;
    notes?: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<WMSDashboardStats> {
    const c = conn();
    const defaults: WMSDashboardStats = {
        totalProducts: 0, lowStockCount: 0, activeCountingSlips: 0,
        activeStores: 0, pendingTransfers: 0, todayReceiving: 0, stockAccuracy: 98.5,
    };

    const firmNr = ERP_SETTINGS.firmNr || '001';
    try {
        const results = await Promise.allSettled([
            // Products (auto-rewritten to rex_{firm}_products)
            c.query<{ cnt: string }>(`SELECT COUNT(*)::int AS cnt FROM products`),
            // Low stock (stock <= min_stock)
            c.query<{ cnt: string }>(`SELECT COUNT(*)::int AS cnt FROM products WHERE stock <= COALESCE(min_stock, 0) AND min_stock > 0`),
            // Active counting slips — firm-scoped
            c.query<{ cnt: string }>(`SELECT COUNT(*)::int AS cnt FROM wms.counting_slips WHERE firm_nr = $1 AND status NOT IN ('completed','cancelled')`, [firmNr]),
            // Active stores
            c.query<{ cnt: string }>(`SELECT COUNT(*)::int AS cnt FROM public.stores WHERE is_active = true`),
            // Pending transfers — firm-scoped
            c.query<{ cnt: string }>(`SELECT COUNT(*)::int AS cnt FROM wms.transfers WHERE firm_nr = $1 AND status NOT IN ('completed','cancelled')`, [firmNr]),
        ]);

        const get = (r: PromiseSettledResult<{ rows: { cnt: string }[]; rowCount: number }>) =>
            r.status === 'fulfilled' ? parseInt(r.value.rows[0]?.cnt || '0') : 0;

        return {
            totalProducts: get(results[0]),
            lowStockCount: get(results[1]),
            activeCountingSlips: get(results[2]),
            activeStores: get(results[3]),
            pendingTransfers: get(results[4]),
            todayReceiving: 0,
            stockAccuracy: 98.5,
        };
    } catch {
        return defaults;
    }
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function searchProducts(query: string, limit = 50): Promise<WMSProduct[]> {
    const c = conn();
    try {
        const { rows } = await c.query<WMSProduct>(
            `SELECT id, code, name, barcode, stock, min_stock, unit, category_code AS category, brand, price, cost
             FROM products
             WHERE name ILIKE $1 OR code ILIKE $1 OR barcode ILIKE $1
             ORDER BY name
             LIMIT $2`,
            [`%${query}%`, limit]
        );
        return rows;
    } catch { return []; }
}

export async function getAllProducts(limit = 200): Promise<WMSProduct[]> {
    const c = conn();
    try {
        const { rows } = await c.query<WMSProduct>(
            `SELECT id, code, name, barcode, stock, min_stock, unit, category_code AS category, brand, price, cost
             FROM products ORDER BY name LIMIT $1`,
            [limit]
        );
        return rows;
    } catch { return []; }
}

export async function getLowStockProducts(): Promise<WMSProduct[]> {
    const c = conn();
    try {
        const { rows } = await c.query<WMSProduct>(
            `SELECT id, code, name, barcode, stock, min_stock, unit, category_code AS category, brand, price, cost
             FROM products
             WHERE stock <= COALESCE(min_stock, 0) AND min_stock > 0
             ORDER BY (COALESCE(min_stock,0) - stock) DESC
             LIMIT 100`
        );
        return rows;
    } catch { return []; }
}

export async function getProductByBarcode(barcode: string): Promise<WMSProduct | null> {
    const c = conn();
    try {
        const { rows } = await c.query<WMSProduct>(
            `SELECT id, code, name, barcode, stock, min_stock, unit, category_code AS category, brand, price, cost
             FROM products WHERE barcode = $1 OR code = $1 LIMIT 1`,
            [barcode]
        );
        return rows[0] || null;
    } catch { return null; }
}

// ─── Stores ───────────────────────────────────────────────────────────────────

export async function getActiveStores(): Promise<{ id: string; name: string; code: string }[]> {
    const c = conn();
    const firmNr = ERP_SETTINGS.firmNr || '001';
    try {
        const { rows } = await c.query<{ id: string; name: string; code: string }>(
            `SELECT id, name, code FROM public.stores WHERE is_active = true ORDER BY name`
        );
        if (rows.length > 0) return rows;
        const { rows: all } = await c.query<{ id: string; name: string; code: string }>(
            `SELECT id, name, code FROM public.stores ORDER BY name LIMIT 20`
        );
        return all;
    } catch { return []; }
}

// ─── Receiving ────────────────────────────────────────────────────────────────

export async function ensureReceivingSchema(): Promise<void> {
    const c = conn();
    const ddl = [
        `CREATE TABLE IF NOT EXISTS wms.receiving_slips (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            store_id UUID REFERENCES public.stores(id),
            slip_no VARCHAR(50) UNIQUE NOT NULL,
            supplier_name VARCHAR(255),
            status VARCHAR(20) DEFAULT 'draft',
            date DATE DEFAULT CURRENT_DATE,
            notes TEXT,
            created_by VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS wms.receiving_lines (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            slip_id UUID REFERENCES wms.receiving_slips(id) ON DELETE CASCADE,
            product_id UUID,
            product_name VARCHAR(500),
            product_code VARCHAR(100),
            barcode VARCHAR(100),
            ordered_qty NUMERIC(15,3) DEFAULT 0,
            received_qty NUMERIC(15,3) DEFAULT 0,
            unit VARCHAR(50),
            lot_number VARCHAR(100),
            expiry_date DATE,
            location_code VARCHAR(50),
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_receiving_slips_firm ON wms.receiving_slips(firm_nr)`,
        `CREATE INDEX IF NOT EXISTS idx_receiving_slips_status ON wms.receiving_slips(status)`,
        `CREATE INDEX IF NOT EXISTS idx_receiving_lines_slip ON wms.receiving_lines(slip_id)`,
    ];
    for (const sql of ddl) {
        try { await c.query(sql); } catch { /* table may already exist */ }
    }
}

export async function getReceivingSlips(status?: string): Promise<WMSReceivingSlip[]> {
    const c = conn();
    const firmNr = ERP_SETTINGS.firmNr || '001';
    await ensureReceivingSchema();
    try {
        let sql = `SELECT rs.*, s.name AS store_name, COUNT(rl.id)::int AS item_count
                   FROM wms.receiving_slips rs
                   LEFT JOIN public.stores s ON rs.store_id = s.id
                   LEFT JOIN wms.receiving_lines rl ON rs.id = rl.slip_id
                   WHERE rs.firm_nr = $1`;
        const params: any[] = [firmNr];
        if (status && status !== 'all') { sql += ` AND rs.status = $2`; params.push(status); }
        sql += ` GROUP BY rs.id, s.name ORDER BY rs.created_at DESC LIMIT 100`;
        const { rows } = await c.query<WMSReceivingSlip>(sql, params);
        return rows;
    } catch { return []; }
}

export async function createReceivingSlip(data: {
    store_id: string;
    supplier_name?: string;
    notes?: string;
    created_by?: string;
}): Promise<WMSReceivingSlip> {
    const c = conn();
    await ensureReceivingSchema();
    const firmNr = ERP_SETTINGS.firmNr || '001';
    const year = new Date().getFullYear();
    const { rows: cnt } = await c.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM wms.receiving_slips WHERE firm_nr = $1 AND date_part('year', created_at) = $2`,
        [firmNr, year]
    );
    const seq = (parseInt(cnt[0]?.count || '0') + 1).toString().padStart(4, '0');
    const slip_no = `MAL-${year}-${seq}`;
    const { rows } = await c.query<WMSReceivingSlip>(
        `INSERT INTO wms.receiving_slips (firm_nr, store_id, slip_no, supplier_name, notes, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6) RETURNING *`,
        [firmNr, data.store_id, slip_no, data.supplier_name || null, data.notes || null, data.created_by || null]
    );
    return rows[0];
}

export async function addReceivingLine(slipId: string, data: Omit<WMSReceivingLine, 'id' | 'slip_id'>): Promise<WMSReceivingLine> {
    const c = conn();
    const { rows } = await c.query<WMSReceivingLine>(
        `INSERT INTO wms.receiving_lines
            (slip_id, product_id, product_name, product_code, barcode, ordered_qty, received_qty, unit, lot_number, expiry_date, location_code, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [slipId, data.product_id || null, data.product_name || null, data.product_code || null,
         data.barcode || null, data.ordered_qty || 0, data.received_qty || 0, data.unit || null,
         data.lot_number || null, data.expiry_date || null, data.location_code || null, data.notes || null]
    );
    return rows[0];
}

export async function getReceivingLines(slipId: string): Promise<WMSReceivingLine[]> {
    const c = conn();
    try {
        const { rows } = await c.query<WMSReceivingLine>(
            `SELECT * FROM wms.receiving_lines WHERE slip_id = $1 ORDER BY created_at`,
            [slipId]
        );
        return rows;
    } catch { return []; }
}

export async function updateReceivingSlipStatus(slipId: string, status: WMSReceivingSlip['status']): Promise<void> {
    const c = conn();
    await c.query(`UPDATE wms.receiving_slips SET status = $2, updated_at = NOW() WHERE id = $1`, [slipId, status]);
}

export async function deleteReceivingLine(lineId: string): Promise<void> {
    const c = conn();
    await c.query(`DELETE FROM wms.receiving_lines WHERE id = $1`, [lineId]);
}

// ─── Dispatch (Issue) ─────────────────────────────────────────────────────────

export async function ensureDispatchSchema(): Promise<void> {
    const c = conn();
    const ddl = [
        `CREATE TABLE IF NOT EXISTS wms.dispatch_slips (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            store_id UUID REFERENCES public.stores(id),
            slip_no VARCHAR(50) UNIQUE NOT NULL,
            customer_name VARCHAR(255),
            status VARCHAR(20) DEFAULT 'draft',
            priority VARCHAR(20) DEFAULT 'normal',
            date DATE DEFAULT CURRENT_DATE,
            notes TEXT,
            created_by VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )`,
        `CREATE TABLE IF NOT EXISTS wms.dispatch_lines (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            slip_id UUID REFERENCES wms.dispatch_slips(id) ON DELETE CASCADE,
            product_id UUID,
            product_name VARCHAR(500),
            product_code VARCHAR(100),
            barcode VARCHAR(100),
            ordered_qty NUMERIC(15,3) DEFAULT 0,
            picked_qty NUMERIC(15,3) DEFAULT 0,
            unit VARCHAR(50),
            location_code VARCHAR(50),
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )`,
        `CREATE INDEX IF NOT EXISTS idx_dispatch_slips_firm ON wms.dispatch_slips(firm_nr)`,
        `CREATE INDEX IF NOT EXISTS idx_dispatch_slips_status ON wms.dispatch_slips(status)`,
        `CREATE INDEX IF NOT EXISTS idx_dispatch_lines_slip ON wms.dispatch_lines(slip_id)`,
    ];
    for (const sql of ddl) {
        try { await c.query(sql); } catch { /* already exists */ }
    }
}

export async function getDispatchSlips(status?: string): Promise<WMSDispatchSlip[]> {
    const c = conn();
    const firmNr = ERP_SETTINGS.firmNr || '001';
    await ensureDispatchSchema();
    try {
        let sql = `SELECT ds.*, s.name AS store_name, COUNT(dl.id)::int AS item_count
                   FROM wms.dispatch_slips ds
                   LEFT JOIN public.stores s ON ds.store_id = s.id
                   LEFT JOIN wms.dispatch_lines dl ON ds.id = dl.slip_id
                   WHERE ds.firm_nr = $1`;
        const params: any[] = [firmNr];
        if (status && status !== 'all') { sql += ` AND ds.status = $2`; params.push(status); }
        sql += ` GROUP BY ds.id, s.name ORDER BY ds.created_at DESC LIMIT 100`;
        const { rows } = await c.query<WMSDispatchSlip>(sql, params);
        return rows;
    } catch { return []; }
}

export async function createDispatchSlip(data: {
    store_id: string;
    customer_name?: string;
    priority?: string;
    notes?: string;
    created_by?: string;
}): Promise<WMSDispatchSlip> {
    const c = conn();
    await ensureDispatchSchema();
    const firmNr = ERP_SETTINGS.firmNr || '001';
    const year = new Date().getFullYear();
    const { rows: cnt } = await c.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count FROM wms.dispatch_slips WHERE firm_nr = $1 AND date_part('year', created_at) = $2`,
        [firmNr, year]
    );
    const seq = (parseInt(cnt[0]?.count || '0') + 1).toString().padStart(4, '0');
    const slip_no = `SEV-${year}-${seq}`;
    const { rows } = await c.query<WMSDispatchSlip>(
        `INSERT INTO wms.dispatch_slips (firm_nr, store_id, slip_no, customer_name, priority, notes, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7) RETURNING *`,
        [firmNr, data.store_id, slip_no, data.customer_name || null,
         data.priority || 'normal', data.notes || null, data.created_by || null]
    );
    return rows[0];
}

export async function addDispatchLine(slipId: string, data: Omit<WMSDispatchLine, 'id' | 'slip_id'>): Promise<WMSDispatchLine> {
    const c = conn();
    const { rows } = await c.query<WMSDispatchLine>(
        `INSERT INTO wms.dispatch_lines
            (slip_id, product_id, product_name, product_code, barcode, ordered_qty, picked_qty, unit, location_code, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [slipId, data.product_id || null, data.product_name || null, data.product_code || null,
         data.barcode || null, data.ordered_qty || 0, data.picked_qty || 0, data.unit || null,
         data.location_code || null, data.notes || null]
    );
    return rows[0];
}

export async function getDispatchLines(slipId: string): Promise<WMSDispatchLine[]> {
    const c = conn();
    try {
        const { rows } = await c.query<WMSDispatchLine>(
            `SELECT * FROM wms.dispatch_lines WHERE slip_id = $1 ORDER BY created_at`,
            [slipId]
        );
        return rows;
    } catch { return []; }
}

export async function updateDispatchSlipStatus(slipId: string, status: WMSDispatchSlip['status']): Promise<void> {
    const c = conn();
    await c.query(`UPDATE wms.dispatch_slips SET status = $2, updated_at = NOW() WHERE id = $1`, [slipId, status]);
}

export async function deleteDispatchLine(lineId: string): Promise<void> {
    const c = conn();
    await c.query(`DELETE FROM wms.dispatch_lines WHERE id = $1`, [lineId]);
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export async function getTransfers(status?: string): Promise<WMSTransfer[]> {
    const c = conn();
    const firmNr = ERP_SETTINGS.firmNr || '001';
    try {
        let sql = `SELECT t.*,
                    sf.name AS from_store_name,
                    st2.name AS to_store_name,
                    COUNT(ti.id)::int AS item_count
                   FROM wms.transfers t
                   LEFT JOIN public.stores sf ON t.from_store_id = sf.id
                   LEFT JOIN public.stores st2 ON t.to_store_id = st2.id
                   LEFT JOIN wms.transfer_items ti ON t.id = ti.transfer_id
                   WHERE t.firm_nr = $1`;
        const params: any[] = [firmNr];
        if (status && status !== 'all') { sql += ` AND t.status = $2`; params.push(status); }
        sql += ` GROUP BY t.id, sf.name, st2.name ORDER BY t.created_at DESC LIMIT 100`;
        const { rows } = await c.query<WMSTransfer>(sql, params);
        return rows;
    } catch { return []; }
}

