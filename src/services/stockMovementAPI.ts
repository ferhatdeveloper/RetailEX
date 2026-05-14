import { shouldUseTenantPostgrestApi } from '../config/postgrest.config';
import { postgres, ERP_SETTINGS } from './postgres';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function padFirmNr(): string {
  return String(ERP_SETTINGS.firmNr ?? '001').trim().padStart(3, '0').slice(0, 10);
}

function padPeriodNr(): string {
  return String(ERP_SETTINGS.periodNr ?? '01').trim().padStart(2, '0').slice(0, 10);
}

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
    /** slip: ambar fişi; invoice: satış/alış faturası (synthetic liste) */
    source_kind?: 'slip' | 'invoice';
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

/** Liste: Excel vb. ile oluşturulan fiyat değişim fişi özetleri */
export interface PriceChangeSlipSummary {
    id: string;
    document_no: string;
    movement_date: string;
    created_at: string;
    description: string | null;
    status: string;
    line_count: number;
}

/** Son fiyat fişindeki değerler ile ürün kartındaki güncel fiyatların karşılaştırması (PG). */
export interface PriceDriftCandidate {
    product_id: string;
    product_code: string;
    product_name: string;
    unit: string;
    current_cost: number;
    current_price: number;
    last_slip_cost: number;
    last_slip_price: number;
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
    /** Fiyat değişim fişi (Excel toplu fiyat vb.) — stok miktarı değişmez */
    PRICE_CHANGE: 78,
};

class StockMovementAPI {
    /**
     * Fetch all stock movements for the current firm/period
     */
    async getAll(): Promise<StockMovement[]> {
        try {
            const { rows: slipRows } = await postgres.query(
                `SELECT 
                    m.*, s.name as warehouse_name
                 FROM stock_movements m
                 LEFT JOIN stores s ON m.warehouse_id = s.id
                 ORDER BY m.created_at DESC`
            );
            const slips: StockMovement[] = slipRows.map((r: any) => ({
                ...r,
                source_kind: 'slip' as const,
                warehouses: { name: r.warehouse_name }
            }));

            let invRows: any[] = [];
            try {
                const { rows } = await postgres.query(
                    `SELECT
                        s.id,
                        s.fiche_no AS document_no,
                        s.date AS movement_date,
                        CASE
                            WHEN s.fiche_type = 'purchase_invoice' THEN 'in'
                            WHEN s.fiche_type = 'sales_invoice' THEN 'out'
                            WHEN s.fiche_type = 'return_invoice' AND COALESCE(s.trcode, 0) = 3 THEN 'in'
                            WHEN s.fiche_type = 'return_invoice' THEN 'out'
                            ELSE 'out'
                        END AS movement_type,
                        COALESCE(s.status, 'approved') AS status,
                        COALESCE(s.trcode, 0)::int AS trcode,
                        s.store_id AS warehouse_id,
                        NULL::uuid AS target_warehouse_id,
                        COALESCE(s.currency_rate, 1.0) AS exchange_rate,
                        COALESCE(s.notes, '') AS description,
                        s.created_at,
                        s.updated_at,
                        st.name AS warehouse_name
                    FROM sales s
                    LEFT JOIN stores st ON s.store_id = st.id
                    WHERE s.fiche_type IN ('purchase_invoice', 'sales_invoice', 'return_invoice')
                    ORDER BY s.date DESC NULLS LAST, s.created_at DESC NULLS LAST
                    LIMIT 500`
                );
                invRows = rows;
            } catch (err) {
                console.warn('[StockMovementAPI] getAll sales (fatura hareketleri) eklenemedi:', err);
            }

            const fromInvoices: StockMovement[] = invRows.map((r: any) => ({
                ...r,
                id: `inv-${r.id}`,
                source_kind: 'invoice' as const,
                warehouses: { name: r.warehouse_name || 'Merkez Ambar' }
            }));

            const combined = [...slips, ...fromInvoices];
            combined.sort((a: any, b: any) => {
                const ta = new Date(b.created_at || b.movement_date || 0).getTime();
                const tb = new Date(a.created_at || a.movement_date || 0).getTime();
                return ta - tb;
            });
            return combined;
        } catch (error) {
            console.error('[StockMovementAPI] getAll failed:', error);
            return [];
        }
    }

    /**
     * Tüm fiyat değişim fişleri (`movement_type = price_change`) — fiş tarihi ve oluşturulma tarihi ile.
     * Excel toplu fiyat güncelleme bu tabloya yazar; ürün bazlı hareket listesiyle aynı kaynak.
     */
    async listPriceChangeSlipSummaries(): Promise<PriceChangeSlipSummary[]> {
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = padFirmNr();
                const pn = padPeriodNr();
                const movPath = `/rex_${fn}_${pn}_stock_movements`;
                const rows = await postgrest.get<any[]>(
                    movPath,
                    {
                        select: 'id,document_no,movement_date,created_at,description,status,trcode',
                        movement_type: 'eq.price_change',
                        order: 'movement_date.desc,created_at.desc',
                        limit: 500,
                    },
                    { schema: 'public' }
                );
                const list = Array.isArray(rows) ? rows : [];
                if (list.length === 0) return [];

                const itemPath = `/rex_${fn}_${pn}_stock_movement_items`;
                const countMap = new Map<string, number>();
                const mids = list.map((r) => String(r.id));
                const chunkSize = 35;
                for (let i = 0; i < mids.length; i += chunkSize) {
                    const chunk = mids.slice(i, i + chunkSize);
                    const inList = chunk.join(',');
                    const items = await postgrest
                        .get<any[]>(
                            itemPath,
                            {
                                select: 'movement_id',
                                movement_id: `in.(${inList})`,
                                limit: 20000,
                            },
                            { schema: 'public' }
                        )
                        .catch(() => [] as any[]);
                    for (const row of Array.isArray(items) ? items : []) {
                        const mid = String(row.movement_id || '');
                        if (!mid) continue;
                        countMap.set(mid, (countMap.get(mid) || 0) + 1);
                    }
                }

                return list.map((r) => ({
                    id: String(r.id),
                    document_no: String(r.document_no || ''),
                    movement_date: r.movement_date || r.created_at || '',
                    created_at: r.created_at || '',
                    description: r.description != null ? String(r.description) : null,
                    status: String(r.status || ''),
                    line_count: countMap.get(String(r.id)) || 0,
                }));
            } catch (e) {
                console.warn('[StockMovementAPI] listPriceChangeSlipSummaries PostgREST:', e);
                return [];
            }
        }

        try {
            const { rows } = await postgres.query(
                `SELECT m.id, m.document_no, m.movement_date, m.created_at, m.description, m.status,
                        COUNT(i.id)::int AS line_count
                 FROM stock_movements m
                 LEFT JOIN stock_movement_items i ON i.movement_id = m.id
                 WHERE m.movement_type = 'price_change'
                 GROUP BY m.id
                 ORDER BY m.movement_date DESC NULLS LAST, m.created_at DESC NULLS LAST
                 LIMIT 500`
            );
            return (rows as any[]).map((r) => ({
                id: String(r.id),
                document_no: String(r.document_no || ''),
                movement_date: r.movement_date || r.created_at || '',
                created_at: r.created_at || '',
                description: r.description != null ? String(r.description) : null,
                status: String(r.status || ''),
                line_count: Number(r.line_count) || 0,
            }));
        } catch (error) {
            console.error('[StockMovementAPI] listPriceChangeSlipSummaries failed:', error);
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
     * Ürün hareketleri için `product_id` UUID çözümü: doğrudan UUID, kod, id veya barkod ipucu.
     */
    async resolveProductUuidForMovements(
        productId: string,
        hint?: { code?: string; barcode?: string }
    ): Promise<string | null> {
        const pid = String(productId || '').trim();
        if (!pid) return null;
        if (UUID_RE.test(pid)) return pid;
        const { productAPI } = await import('./api/products');
        const tryCode = async (c: string | undefined) => {
            if (!c?.trim()) return null;
            const p = await productAPI.getByCode(c.trim());
            return p?.id ? String(p.id) : null;
        };
        const fromHintCode = await tryCode(hint?.code);
        if (fromHintCode) return fromHintCode;
        const fromPidCode = await tryCode(pid);
        if (fromPidCode) return fromPidCode;
        const byId = await productAPI.getById(pid);
        if (byId?.id) return String(byId.id);
        if (hint?.barcode?.trim()) {
            const b = await productAPI.getByBarcode(hint.barcode.trim());
            if (b?.id) return String(b.id);
        }
        return null;
    }

    /**
     * Son kayıtlı fiyat değişim fişindeki alış/satış ile ürün kartındaki mevcut fiyatı karşılaştırır.
     * Yalnızca doğrudan PostgreSQL sorgusu (tablo öneki yeniden yazımı); PostgREST-only ortamda boş dizi döner.
     */
    async findPriceDriftVsLastSlip(): Promise<PriceDriftCandidate[]> {
        if (shouldUseTenantPostgrestApi()) {
            return [];
        }
        try {
            const { rows } = await postgres.query(
                `WITH ranked AS (
                    SELECT i.product_id,
                           i.cost_price,
                           i.unit_price,
                           ROW_NUMBER() OVER (
                             PARTITION BY i.product_id
                             ORDER BY m.movement_date DESC NULLS LAST, m.created_at DESC NULLS LAST
                           ) AS rn
                    FROM stock_movement_items i
                    INNER JOIN stock_movements m ON m.id = i.movement_id AND m.movement_type = 'price_change'
                )
                SELECT p.id::text AS product_id,
                       COALESCE(p.code, '') AS product_code,
                       COALESCE(p.name, '') AS product_name,
                       COALESCE(p.unit, 'Adet') AS unit,
                       COALESCE(p.cost, 0)::numeric AS current_cost,
                       COALESCE(p.price, 0)::numeric AS current_price,
                       COALESCE(r.cost_price, 0)::numeric AS last_slip_cost,
                       COALESCE(r.unit_price, 0)::numeric AS last_slip_price
                FROM products p
                INNER JOIN ranked r ON r.product_id = p.id AND r.rn = 1
                WHERE ABS(COALESCE(p.cost, 0)::numeric - COALESCE(r.cost_price, 0)::numeric) > 0.0000001
                   OR ABS(COALESCE(p.price, 0)::numeric - COALESCE(r.unit_price, 0)::numeric) > 0.0000001
                ORDER BY p.code NULLS LAST
                LIMIT 2000`
            );
            return (rows as any[]).map((row) => ({
                product_id: String(row.product_id),
                product_code: String(row.product_code || ''),
                product_name: String(row.product_name || ''),
                unit: String(row.unit || 'Adet'),
                current_cost: Number(row.current_cost) || 0,
                current_price: Number(row.current_price) || 0,
                last_slip_cost: Number(row.last_slip_cost) || 0,
                last_slip_price: Number(row.last_slip_price) || 0,
            }));
        } catch (e) {
            console.error('[StockMovementAPI] findPriceDriftVsLastSlip failed:', e);
            return [];
        }
    }

    /**
     * Get movements for a specific product
     * @param hint Ürün kodu/barkod — `id` UUID değilse PostgREST eşlemesi için kullanılır.
     */
    async getProductMovements(
        productId: string,
        hint?: { code?: string; barcode?: string }
    ): Promise<any[]> {
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

        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const { invoicesAPI } = await import('./api/invoices');
                const fn = padFirmNr();
                const pn = padPeriodNr();
                const pid = String(productId || '').trim();
                if (!pid) return [];

                const resolvedUuid = (await this.resolveProductUuidForMovements(productId, hint)) || '';

                const combinedRaw: any[] = [];

                // 1) Ambar fişleri (stock_movement_items)
                if (resolvedUuid) {
                    const smiPath = `/rex_${fn}_${pn}_stock_movement_items`;
                    const smiRows = await postgrest
                        .get<any[]>(
                            smiPath,
                            { select: '*', product_id: `eq.${resolvedUuid}`, limit: 500 },
                            { schema: 'public' }
                        )
                        .catch(() => [] as any[]);
                    const smi = Array.isArray(smiRows) ? smiRows : [];
                    const mids = [...new Set(smi.map((x) => String(x.movement_id || '').trim()).filter(Boolean))];
                    const movById = new Map<string, any>();
                    const chunkSize = 35;
                    for (let i = 0; i < mids.length; i += chunkSize) {
                        const chunk = mids.slice(i, i + chunkSize);
                        const inList = chunk.join(',');
                        const movPath = `/rex_${fn}_${pn}_stock_movements`;
                        const mrows = await postgrest
                            .get<any[]>(
                                movPath,
                                {
                                    select: 'id,document_no,movement_type,movement_date,status,trcode,warehouse_id,exchange_rate',
                                    id: `in.(${inList})`,
                                    limit: chunk.length,
                                },
                                { schema: 'public' }
                            )
                            .catch(() => [] as any[]);
                        (Array.isArray(mrows) ? mrows : []).forEach((m) => {
                            if (m?.id) movById.set(String(m.id), m);
                        });
                    }
                    const widSet = new Set<string>();
                    smi.forEach((row) => {
                        const m = movById.get(String(row.movement_id));
                        if (m?.warehouse_id && UUID_RE.test(String(m.warehouse_id))) widSet.add(String(m.warehouse_id));
                    });
                    const storeNameById = new Map<string, string>();
                    const wids = [...widSet];
                    for (let i = 0; i < wids.length; i += chunkSize) {
                        const chunk = wids.slice(i, i + chunkSize);
                        const inList = chunk.join(',');
                        const srows = await postgrest
                            .get<any[]>(
                                '/stores',
                                { select: 'id,name', id: `in.(${inList})`, limit: chunk.length },
                                { schema: 'public' }
                            )
                            .catch(() => [] as any[]);
                        (Array.isArray(srows) ? srows : []).forEach((s) => {
                            if (s?.id) storeNameById.set(String(s.id), String(s.name || ''));
                        });
                    }
                    for (const row of smi) {
                        const m = movById.get(String(row.movement_id));
                        if (!m) continue;
                        const wname =
                            (m.warehouse_id && storeNameById.get(String(m.warehouse_id))) || 'Merkez Ambar';
                        combinedRaw.push({
                            id: row.id,
                            movement_id: row.movement_id,
                            product_id: row.product_id,
                            quantity: row.quantity,
                            unit_price: row.unit_price,
                            cost_price: row.cost_price,
                            created_at: row.created_at,
                            document_no: m.document_no,
                            movement_type: m.movement_type,
                            movement_date: m.movement_date,
                            status: m.status,
                            trcode: m.trcode,
                            warehouse_name: wname,
                            source_type: 'slip',
                            currency_rate: m.exchange_rate ?? 1,
                            currency: 'IQD',
                            gross_profit: 0,
                            notes: row.notes || '',
                        });
                    }
                }

                // 2) Fatura satırları — invoicesAPI (PostgREST + item_code / product_id birleşimi)
                const histPid = resolvedUuid || pid;
                const hist = await invoicesAPI.getProductHistory(histPid);
                for (const h of hist) {
                    combinedRaw.push({
                        id: `inv-${String(h.documentNo)}-${String(h.date)}`,
                        movement_id: h.documentNo,
                        product_id: histPid,
                        quantity: h.quantity,
                        unit_price: h.unitPrice,
                        created_at: h.date,
                        document_no: h.documentNo,
                        movement_type: h.type === 'purchase' ? 'in' : 'out',
                        movement_date: h.date,
                        status: 'approved',
                        trcode: h.type === 'purchase' ? 1 : 8,
                        warehouse_name: 'Merkez Ambar',
                        source_type: 'invoice',
                        currency_rate: 1,
                        currency: 'IQD',
                        gross_profit: 0,
                        notes: h.supplier || '',
                    });
                }

                combinedRaw.sort((a, b) => {
                    const da = new Date(a.movement_date || a.created_at).getTime();
                    const db = new Date(b.movement_date || b.created_at).getTime();
                    return db - da;
                });
                return combinedRaw.map(mapRow);
            } catch (e) {
                console.warn('[StockMovementAPI] getProductMovements PostgREST:', e);
                return [];
            }
        }

        // Query 1: Manual stock movements (ambar fişleri)
        let slipRows: any[] = [];
        try {
            const { rows } = await postgres.query(
                `SELECT
                    i.id, i.movement_id, i.product_id::text as product_id, i.quantity, i.unit_price, i.cost_price,
                    i.notes, i.created_at,
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
            // sale_items şemasında created_at yok; tarih sales başlığından alınır
            const { rows } = await postgres.query(
                `SELECT
                    si.id,
                    si.invoice_id as movement_id,
                    si.item_code as product_id,
                    si.quantity,
                    si.unit_price,
                    sl.date as created_at,
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
            if (movement.movement_type === 'price_change') trcode = STOCK_SLIP_TRCODES.PRICE_CHANGE;

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

                // Fiyat değişim fişi: stok güncellenmez
                if (movement.movement_type !== 'price_change' && item.product_id) {
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
     * Toplu fiyat güncellemesi sonrası tek bir "fiyat değişim fişi" oluşturur.
     * `stock_movements` + `stock_movement_items` (miktar=0); ürün stoku değişmez.
     * Malzeme geçmişi / ürün hareketleri ekranında `movement_type = price_change` ile listelenir.
     */
    async createPriceChangeSlip(
        lines: Array<{
            product_id: string;
            product_name: string;
            product_code?: string;
            old_cost: number;
            old_price: number;
            new_cost: number;
            new_price: number;
            unit_name?: string;
        }>,
        opts?: { sourceNote?: string }
    ): Promise<StockMovement | null> {
        if (!lines.length) return null;
        const src = (opts?.sourceNote || 'Excel fiyat güncelleme').trim().slice(0, 200);
        const docNo = `FD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 50);
        const desc = `Fiyat değişim fişi — ${lines.length} kalem — ${src}`;
        const items: Partial<StockMovementItem>[] = lines.map((line) => {
            const code = (line.product_code || '').trim();
            const note = [
                `Alış: ${line.old_cost} → ${line.new_cost}`,
                `Satış: ${line.old_price} → ${line.new_price}`,
                code ? `Kod: ${code}` : '',
            ]
                .filter(Boolean)
                .join(' | ');
            return {
                product_id: line.product_id,
                quantity: 0,
                unit_price: line.new_price,
                cost_price: line.new_cost,
                unit_name: line.unit_name || 'Adet',
                notes: note.slice(0, 2000),
            };
        });
        return this.create(
            {
                document_no: docNo,
                movement_type: 'price_change',
                trcode: STOCK_SLIP_TRCODES.PRICE_CHANGE,
                movement_date: new Date().toISOString(),
                description: desc,
                status: 'completed',
            },
            items
        );
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

