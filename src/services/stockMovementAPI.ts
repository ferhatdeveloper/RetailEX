import { shouldUseTenantPostgrestApi } from '../config/postgrest.config';
import { postgres, ERP_SETTINGS } from './postgres';
import { toSqlDateInputString } from '../utils/localCalendarDate';
import {
    aggregateInOutTotals,
    classifyStockLineDirection,
    isSqlDateInInclusiveRange,
    sqlDateExclusiveUpperBound,
    type InOutTotalsRow,
    type StockInOutLine,
} from '../utils/stockInOutTotals';
import { resolveExtractSourceMeta } from '../utils/materialExtractLabels';
import { displayItemCode, isUuidText, SQL_NON_UUID_ITEM_CODE } from '../utils/lastPurchaseCostSql';
import {
    computePriceDriftCandidates,
    latestSlipPriceByProduct,
    type PriceDriftCandidate as ComputedPriceDriftCandidate,
} from '../utils/priceChangeSlipDrift';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function padFirmNr(): string {
  const raw = String(ERP_SETTINGS.firmNr ?? '').trim();
  return (raw || '001').padStart(3, '0').slice(0, 10);
}

function padPeriodNr(): string {
  const raw = String(ERP_SETTINGS.periodNr ?? '').trim();
  return (raw || '01').padStart(2, '0').slice(0, 10);
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
    customer_name?: string;
    status: string;
    created_by?: string;
    created_at: string;
    updated_at: string;
    stock_movement_items?: StockMovementItem[];
    /** slip: ambar fişi; invoice: satış/alış faturası (synthetic liste) */
    source_kind?: 'slip' | 'invoice';
}

/** Hareket Dökümü — belge başlığı değil, stok kalem satırı. */
export interface StockMovementLine {
    id: string;
    document_no: string;
    movement_date: string;
    created_at: string;
    movement_type: string;
    source_kind: 'slip' | 'invoice';
    product_code: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    warehouse_name: string;
    customer_name: string;
    description: string;
    /** Hizmet | Malzeme — CostReport / analysisSaleLine ile aynı kova */
    line_kind: 'service' | 'product';
}

/** Depo görünen adı: kod + ad; yoksa yalnız ad/kod. */
function formatWarehouseLabel(code?: unknown, name?: unknown): string {
    const c = String(code ?? '').trim();
    const n = String(name ?? '').trim();
    if (c && n) return `${c}, ${n}`;
    return n || c || '';
}

/** Satır türü: item_type / material_type / beauty-service kodları. */
function resolveLineKind(r: {
    item_type?: unknown;
    material_type?: unknown;
    item_code?: unknown;
    product_code?: unknown;
}): 'service' | 'product' {
    const itemType = String(r.item_type ?? '').trim().toLocaleLowerCase('tr-TR');
    if (
        itemType === 'hizmet' ||
        itemType === 'service' ||
        itemType === 'package' ||
        itemType === 'paket'
    ) {
        return 'service';
    }
    const mat = String(r.material_type ?? '').trim().toLowerCase();
    if (mat === 'service') return 'service';
    const code = String(r.item_code ?? r.product_code ?? '').trim().toLowerCase();
    if (code.startsWith('beauty-service') || code.startsWith('beauty-package')) return 'service';
    return 'product';
}

/** Güzellik hizmet/paket kart id'leri — sale_items.product_id eşlemesi için. */
async function loadBeautyServiceKeys(
    firmNr: string,
    candidateIds: string[],
): Promise<Set<string>> {
    const keys = new Set<string>();
    const uuids = [
        ...new Set(
            candidateIds
                .map((id) => String(id || '').trim())
                .filter((id) => UUID_RE.test(id)),
        ),
    ];
    if (uuids.length === 0) return keys;

    const chunkSize = 35;
    const addRows = (rows: any[] | null | undefined) => {
        for (const r of Array.isArray(rows) ? rows : []) {
            const id = String(r?.id ?? '').trim().toLowerCase();
            if (id) keys.add(id);
        }
    };

    if (shouldUseTenantPostgrestApi()) {
        try {
            const { postgrest } = await import('./api/postgrestClient');
            const svcPath = `/rex_${firmNr}_beauty_services`;
            const pkgPath = `/rex_${firmNr}_beauty_packages`;
            for (let i = 0; i < uuids.length; i += chunkSize) {
                const chunk = uuids.slice(i, i + chunkSize);
                const inFilter = `in.(${chunk.join(',')})`;
                const [svcs, pkgs] = await Promise.all([
                    postgrest
                        .get<any[]>(
                            svcPath,
                            { select: 'id', id: inFilter, limit: chunk.length },
                            { schema: 'beauty' },
                        )
                        .catch(() => [] as any[]),
                    postgrest
                        .get<any[]>(
                            pkgPath,
                            { select: 'id', id: inFilter, limit: chunk.length },
                            { schema: 'beauty' },
                        )
                        .catch(() => [] as any[]),
                ]);
                addRows(svcs);
                addRows(pkgs);
            }
            if (keys.size > 0) return keys;
        } catch (e) {
            console.warn('[StockMovementAPI] loadBeautyServiceKeys PostgREST:', e);
        }
    }

    try {
        const fp = { firmNr, periodNr: padPeriodNr() };
        for (let i = 0; i < uuids.length; i += chunkSize) {
            const chunk = uuids.slice(i, i + chunkSize);
            const placeholders = chunk.map((_, idx) => `$${idx + 1}::uuid`).join(',');
            const { rows: svcRows } = await postgres
                .query(
                    `SELECT id::text AS id FROM beauty_services WHERE id IN (${placeholders})`,
                    chunk,
                    fp,
                )
                .catch(() => ({ rows: [] as any[] }));
            addRows(svcRows);
            const { rows: pkgRows } = await postgres
                .query(
                    `SELECT id::text AS id FROM beauty_packages WHERE id IN (${placeholders})`,
                    chunk,
                    fp,
                )
                .catch(() => ({ rows: [] as any[] }));
            addRows(pkgRows);
        }
    } catch (e) {
        console.warn('[StockMovementAPI] loadBeautyServiceKeys SQL:', e);
    }
    return keys;
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

/** Son fiyat fişindeki değerler ile ürün kartındaki güncel fiyatların karşılaştırması. */
export type PriceDriftCandidate = ComputedPriceDriftCandidate;

/**
 * Logo ERP Standard Stock Slip TRCODEs
 * (Depo Giriş/Çıkış: jRetail materialReceiptList ile hizalı uygulama kodları)
 */
export const STOCK_SLIP_TRCODES = {
    CONSUMPTION: 1,      // Sarf Fişi
    PRODUCTION_IN: 2,    // Üretimden Giriş
    TRANSFER: 5,         // Depolar Arası Transfer / Ambar Fişi
    WASTAGE: 11,         // Fire Fişi
    OPENING: 14,         // Devir Fişi (Ekle menüsünde yok)
    COUNTING: 25,        // Sayım Fişi
    SURPLUS: 26,         // Sayım Fazlası
    SHORTAGE: 50,        // Sayım Eksiği
    /** Depo Giriş Fişi — jRetail materialReceiptList */
    WAREHOUSE_IN: 51,
    /** Depo Çıkış Fişi — jRetail materialReceiptList */
    WAREHOUSE_OUT: 52,
    /** Fiyat değişim fişi (Excel toplu fiyat vb.) — stok miktarı değişmez */
    PRICE_CHANGE: 78,
};

/** + Ekle menü sırası (jRetail materialReceiptList) — Stok Devir yok */
export const MATERIAL_SLIP_ADD_MENU = [
    {
        key: 'transfer',
        trcode: STOCK_SLIP_TRCODES.TRANSFER,
        movement_type: 'transfer' as const,
        labelKey: 'slipInterWarehouseTransfer',
    },
    {
        key: 'warehouse_in',
        trcode: STOCK_SLIP_TRCODES.WAREHOUSE_IN,
        movement_type: 'in' as const,
        labelKey: 'slipWarehouseEntry',
    },
    {
        key: 'warehouse_out',
        trcode: STOCK_SLIP_TRCODES.WAREHOUSE_OUT,
        movement_type: 'out' as const,
        labelKey: 'slipWarehouseExit',
    },
    {
        key: 'surplus',
        trcode: STOCK_SLIP_TRCODES.SURPLUS,
        movement_type: 'in' as const,
        labelKey: 'slipCountSurplus',
    },
    {
        key: 'shortage',
        trcode: STOCK_SLIP_TRCODES.SHORTAGE,
        movement_type: 'out' as const,
        labelKey: 'slipCountDeficit',
    },
    {
        key: 'consumption',
        trcode: STOCK_SLIP_TRCODES.CONSUMPTION,
        movement_type: 'out' as const,
        labelKey: 'slipConsumption',
    },
    {
        key: 'wastage',
        trcode: STOCK_SLIP_TRCODES.WASTAGE,
        movement_type: 'out' as const,
        labelKey: 'slipWastage',
    },
    {
        key: 'production_in',
        trcode: STOCK_SLIP_TRCODES.PRODUCTION_IN,
        movement_type: 'in' as const,
        labelKey: 'slipProductionEntry',
    },
] as const;

export type MaterialSlipAddMenuItem = (typeof MATERIAL_SLIP_ADD_MENU)[number];

/** Liste / modal Belge Türü etiketi (tm anahtarları) */
export function labelStockSlipDocumentType(
    tm: (key: string) => string,
    trcode: number | null | undefined,
    movementType?: string,
): string {
    const code = Number(trcode ?? 0);
    switch (code) {
        case STOCK_SLIP_TRCODES.TRANSFER:
            return tm('slipInterWarehouseTransfer') || 'Depolar Arası Transfer Fişi';
        case STOCK_SLIP_TRCODES.WAREHOUSE_IN:
            return tm('slipWarehouseEntry') || 'Depo Giriş Fişi';
        case STOCK_SLIP_TRCODES.WAREHOUSE_OUT:
            return tm('slipWarehouseExit') || 'Depo Çıkış Fişi';
        case STOCK_SLIP_TRCODES.SURPLUS:
            return tm('slipCountSurplus') || 'Sayım Fazlası Fişi';
        case STOCK_SLIP_TRCODES.SHORTAGE:
            return tm('slipCountDeficit') || 'Sayım Eksiği Fişi';
        case STOCK_SLIP_TRCODES.CONSUMPTION:
            return tm('slipConsumption') || 'Sarf Fişi';
        case STOCK_SLIP_TRCODES.WASTAGE:
            return tm('slipWastage') || 'Fire Fişi';
        case STOCK_SLIP_TRCODES.PRODUCTION_IN:
            return tm('slipProductionEntry') || 'Üretimden Giriş Fişi';
        case STOCK_SLIP_TRCODES.OPENING:
            return tm('openingBalance') || 'Devir';
        case STOCK_SLIP_TRCODES.COUNTING:
            return tm('slipType') || 'Sayım Fişi';
        case STOCK_SLIP_TRCODES.PRICE_CHANGE:
            return tm('stockPriceChangeSlips') || 'Fiyat Değişim Fişi';
        default: {
            const mt = String(movementType || '').toLowerCase();
            if (mt === 'transfer') return tm('slipInterWarehouseTransfer') || 'Depolar Arası Transfer Fişi';
            if (mt === 'in') return tm('in') || 'Giriş';
            if (mt === 'out') return tm('out') || 'Çıkış';
            return tm('otherType') || 'Diğer';
        }
    }
}

class StockMovementAPI {
    /**
     * Fetch all stock movements for the current firm/period
     */
    async getAll(): Promise<StockMovement[]> {
        try {
            /** `m.*` yerine açık kolon + üst sınır: büyük dönemlerde rapor / liste ekranı kilitlenmesini önler. */
            const SLIP_LIST_CAP = 25000;
            const { rows: slipRows } = await postgres.query(
                `SELECT 
                    m.id, m.document_no, m.trcode, m.movement_type, m.warehouse_id, m.target_warehouse_id,
                    m.movement_date, m.exchange_rate, m.description, m.status, m.created_by, m.created_at, m.updated_at,
                    s.name AS warehouse_name
                 FROM stock_movements m
                 LEFT JOIN stores s ON m.warehouse_id = s.id
                 ORDER BY m.movement_date DESC NULLS LAST, m.created_at DESC NULLS LAST
                 LIMIT ${SLIP_LIST_CAP}`
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
                        COALESCE(
                            NULLIF(TRIM(s.customer_name), ''),
                            c.name,
                            sup.name,
                            ''
                        ) AS customer_name,
                        s.created_at,
                        s.updated_at,
                        st.name AS warehouse_name
                    FROM sales s
                    LEFT JOIN stores st ON s.store_id = st.id
                    LEFT JOIN customers c ON c.id::text = s.customer_id::text
                    LEFT JOIN suppliers sup ON sup.id::text = s.customer_id::text
                    WHERE LOWER(TRIM(COALESCE(s.fiche_type, ''))) IN (
                        'purchase_invoice', 'sales_invoice', 'return_invoice',
                        'service', 'hizmet', 'beauty', 'beauty_sale', 'pos', 'retail'
                    )
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
     * Hareket Dökümü: fiş/fatura kalem satırları (ürün, miktar, depo, fiyat).
     * Fiş Listesi `getAll` başlık satırıdır; burası aynı belgelerin satır dökümü.
     */
    async getAllLines(): Promise<StockMovementLine[]> {
        const LINE_CAP = 15000;
        try {
            let defaultWarehouse = '';
            try {
                const { rows: whRows } = await postgres.query(
                    `SELECT code, name FROM stores
                     WHERE firm_nr = $1 AND COALESCE(is_active, true) = true
                     ORDER BY COALESCE(is_main, false) DESC, COALESCE("default", false) DESC, name ASC NULLS LAST
                     LIMIT 1`,
                    [padFirmNr()],
                );
                if (whRows?.[0]) {
                    defaultWarehouse = formatWarehouseLabel(whRows[0].code, whRows[0].name);
                }
            } catch (err) {
                console.warn('[StockMovementAPI] getAllLines default warehouse failed:', err);
            }

            let slipRows: any[] = [];
            try {
                const { rows } = await postgres.query(
                    `SELECT
                        i.id,
                        m.document_no,
                        m.movement_date,
                        m.created_at,
                        m.movement_type,
                        COALESCE(p.code, '') AS product_code,
                        COALESCE(p.name, '') AS product_name,
                        i.quantity,
                        i.unit_price,
                        COALESCE(NULLIF(TRIM(s.code), ''), '') AS warehouse_code,
                        COALESCE(NULLIF(TRIM(s.name), ''), '') AS warehouse_name_raw,
                        '' AS customer_name,
                        COALESCE(i.notes, m.description, '') AS description,
                        COALESCE(p.material_type, '') AS material_type,
                        'Malzeme' AS item_type
                     FROM stock_movement_items i
                     JOIN stock_movements m ON i.movement_id = m.id
                     LEFT JOIN products p ON p.id = i.product_id
                     LEFT JOIN stores s ON m.warehouse_id = s.id
                     WHERE LOWER(COALESCE(m.movement_type, '')) <> 'price_change'
                     ORDER BY m.movement_date DESC NULLS LAST, m.created_at DESC NULLS LAST
                     LIMIT ${LINE_CAP}`
                );
                slipRows = rows || [];
            } catch (err) {
                console.warn('[StockMovementAPI] getAllLines slips failed:', err);
            }

            let invRows: any[] = [];
            try {
                const { rows } = await postgres.query(
                    `SELECT
                        si.id,
                        sl.fiche_no AS document_no,
                        sl.date AS movement_date,
                        sl.created_at,
                        CASE
                            WHEN sl.fiche_type = 'purchase_invoice' THEN 'in'
                            WHEN sl.fiche_type = 'sales_invoice' THEN 'out'
                            WHEN sl.fiche_type = 'return_invoice' AND COALESCE(sl.trcode, 0) = 3 THEN 'in'
                            WHEN sl.fiche_type = 'return_invoice' THEN 'out'
                            ELSE 'out'
                        END AS movement_type,
                        COALESCE(NULLIF(TRIM(p.code), ''), ${SQL_NON_UUID_ITEM_CODE}, '—') AS product_code,
                        COALESCE(p.name, si.item_name, '') AS product_name,
                        si.quantity,
                        COALESCE(
                          NULLIF(si.unit_price, 0),
                          CASE
                            WHEN ABS(COALESCE(si.quantity, 0)) > 0.0000001
                            THEN COALESCE(NULLIF(si.net_amount, 0), NULLIF(si.total_amount, 0), 0)
                                 / NULLIF(ABS(si.quantity), 0)
                            ELSE 0
                          END
                        ) AS unit_price,
                        COALESCE(NULLIF(TRIM(st.code), ''), '') AS warehouse_code,
                        COALESCE(NULLIF(TRIM(st.name), ''), '') AS warehouse_name_raw,
                        NULLIF(TRIM(COALESCE(sl.header_fields->>'warehouse', '')), '') AS warehouse_header,
                        COALESCE(
                            NULLIF(TRIM(sl.customer_name), ''),
                            c.name,
                            sup.name,
                            ''
                        ) AS customer_name,
                        COALESCE(si.item_name, sl.notes, '') AS description,
                        COALESCE(si.item_type, 'Malzeme') AS item_type,
                        COALESCE(p.material_type, '') AS material_type,
                        COALESCE(si.item_code, '') AS item_code
                     FROM sale_items si
                     JOIN sales sl ON si.invoice_id = sl.id
                     LEFT JOIN products p ON p.id = si.product_id
                        OR (si.product_id IS NULL AND p.code = si.item_code)
                        OR (si.product_id IS NULL AND p.id::text = si.item_code)
                     LEFT JOIN stores st ON sl.store_id = st.id
                     LEFT JOIN customers c ON c.id::text = sl.customer_id::text
                     LEFT JOIN suppliers sup ON sup.id::text = sl.customer_id::text
                     WHERE LOWER(TRIM(COALESCE(sl.fiche_type, ''))) IN (
                         'purchase_invoice', 'sales_invoice', 'return_invoice',
                         'service', 'hizmet', 'beauty', 'beauty_sale', 'pos', 'retail'
                       )
                     ORDER BY sl.date DESC NULLS LAST, sl.created_at DESC NULLS LAST
                     LIMIT ${LINE_CAP}`
                );
                invRows = rows || [];
            } catch (err) {
                console.warn('[StockMovementAPI] getAllLines invoices failed:', err);
            }

            const slips: StockMovementLine[] = slipRows.map((r: any) => ({
                id: String(r.id),
                document_no: String(r.document_no || ''),
                movement_date: r.movement_date || r.created_at || '',
                created_at: r.created_at || '',
                movement_type: String(r.movement_type || ''),
                source_kind: 'slip' as const,
                product_code: String(r.product_code || ''),
                product_name: String(r.product_name || ''),
                quantity: Number(r.quantity) || 0,
                unit_price: Number(r.unit_price) || 0,
                warehouse_name:
                    formatWarehouseLabel(r.warehouse_code, r.warehouse_name_raw) || defaultWarehouse,
                customer_name: String(r.customer_name || ''),
                description: String(r.description || ''),
                line_kind: resolveLineKind(r),
            }));

            const invoices: StockMovementLine[] = invRows.map((r: any) => {
                const fromStore = formatWarehouseLabel(r.warehouse_code, r.warehouse_name_raw);
                const fromHeader = String(r.warehouse_header || '').trim();
                return {
                    id: `inv-line-${r.id}`,
                    document_no: String(r.document_no || ''),
                    movement_date: r.movement_date || r.created_at || '',
                    created_at: r.created_at || '',
                    movement_type: String(r.movement_type || ''),
                    source_kind: 'invoice' as const,
                    product_code: String(r.product_code || ''),
                    product_name: String(r.product_name || ''),
                    quantity: Number(r.quantity) || 0,
                    unit_price: Number(r.unit_price) || 0,
                    warehouse_name: fromStore || fromHeader || defaultWarehouse,
                    customer_name: String(r.customer_name || ''),
                    description: String(r.description || ''),
                    line_kind: resolveLineKind(r),
                };
            });

            const combined = [...slips, ...invoices];
            combined.sort((a, b) => {
                const ta = new Date(b.created_at || b.movement_date || 0).getTime();
                const tb = new Date(a.created_at || a.movement_date || 0).getTime();
                return ta - tb;
            });
            return combined.slice(0, LINE_CAP);
        } catch (error) {
            console.error('[StockMovementAPI] getAllLines failed:', error);
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
        const mid = String(id || '').trim();
        if (!mid) return null;

        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = padFirmNr();
                const pn = padPeriodNr();
                const movPath = `/rex_${fn}_${pn}_stock_movements`;
                const itemPath = `/rex_${fn}_${pn}_stock_movement_items`;
                const prodPath = `/rex_${fn}_products`;
                const headers = await postgrest.get<any[]>(
                    movPath,
                    { select: '*', id: `eq.${mid}`, limit: 1 },
                    { schema: 'public' },
                );
                const movement = Array.isArray(headers) ? headers[0] : null;
                if (!movement) return null;
                const items = await postgrest
                    .get<any[]>(
                        itemPath,
                        { select: '*', movement_id: `eq.${mid}`, limit: 20000 },
                        { schema: 'public' },
                    )
                    .catch(() => [] as any[]);
                const list = Array.isArray(items) ? items : [];
                const pids = [...new Set(list.map((i) => String(i.product_id || '').trim()).filter(Boolean))];
                const pmap = new Map<string, any>();
                const chunkSize = 35;
                for (let i = 0; i < pids.length; i += chunkSize) {
                    const chunk = pids.slice(i, i + chunkSize);
                    const prows = await postgrest
                        .get<any[]>(
                            prodPath,
                            {
                                select: 'id,code,name,unit,cost,price',
                                id: `in.(${chunk.join(',')})`,
                                limit: 2000,
                            },
                            { schema: 'public' },
                        )
                        .catch(() => [] as any[]);
                    for (const p of Array.isArray(prows) ? prows : []) {
                        if (p?.id) pmap.set(String(p.id), p);
                    }
                }
                return {
                    ...movement,
                    stock_movement_items: list.map((i) => {
                        const p = pmap.get(String(i.product_id || ''));
                        const code = displayItemCode(p?.code);
                        return {
                            ...i,
                            product_name: p?.name || i.product_name,
                            product_code: code === '—' ? '' : code,
                        };
                    }),
                };
            } catch (e) {
                console.warn('[StockMovementAPI] getById PostgREST:', e);
                return null;
            }
        }

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
                    product_code: displayItemCode(i.product_code) === '—' ? '' : displayItemCode(i.product_code),
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
     * PostgREST (web) ve doğrudan PostgreSQL (masaüstü / köprü) desteklenir.
     */
    async findPriceDriftVsLastSlip(): Promise<PriceDriftCandidate[]> {
        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const fn = padFirmNr();
                const pn = padPeriodNr();
                const movPath = `/rex_${fn}_${pn}_stock_movements`;
                const itemPath = `/rex_${fn}_${pn}_stock_movement_items`;
                const prodPath = `/rex_${fn}_products`;
                const movements = await postgrest.get<any[]>(
                    movPath,
                    {
                        select: 'id,movement_date,created_at',
                        movement_type: 'eq.price_change',
                        order: 'movement_date.desc,created_at.desc',
                        limit: 500,
                    },
                    { schema: 'public' },
                );
                const list = Array.isArray(movements) ? movements : [];
                if (list.length === 0) return [];

                const items: any[] = [];
                const mids = list.map((m) => String(m.id));
                const chunkSize = 35;
                for (let i = 0; i < mids.length; i += chunkSize) {
                    const chunk = mids.slice(i, i + chunkSize);
                    const rows = await postgrest
                        .get<any[]>(
                            itemPath,
                            {
                                select: 'movement_id,product_id,cost_price,unit_price',
                                movement_id: `in.(${chunk.join(',')})`,
                                limit: 20000,
                            },
                            { schema: 'public' },
                        )
                        .catch(() => [] as any[]);
                    items.push(...(Array.isArray(rows) ? rows : []));
                }

                const lastByProduct = latestSlipPriceByProduct(list, items);
                const pids = [...lastByProduct.keys()];
                const products: any[] = [];
                for (let i = 0; i < pids.length; i += chunkSize) {
                    const chunk = pids.slice(i, i + chunkSize);
                    const rows = await postgrest
                        .get<any[]>(
                            prodPath,
                            {
                                select: 'id,code,name,unit,cost,price',
                                id: `in.(${chunk.join(',')})`,
                                limit: 2000,
                            },
                            { schema: 'public' },
                        )
                        .catch(() => [] as any[]);
                    products.push(...(Array.isArray(rows) ? rows : []));
                }

                return computePriceDriftCandidates(
                    lastByProduct,
                    products.map((p) => ({
                        id: String(p.id),
                        code: p.code,
                        name: p.name,
                        unit: p.unit,
                        cost: Number(p.cost) || 0,
                        price: Number(p.price) || 0,
                    })),
                );
            } catch (e) {
                console.warn('[StockMovementAPI] findPriceDriftVsLastSlip PostgREST:', e);
                return [];
            }
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
        const computeGrossProfit = (row: {
            gross_profit?: number;
            unit_price?: number;
            cost_price?: number;
            unit_cost?: number;
            quantity?: number;
            fiche_type?: string;
            trcode?: number;
            movement_type?: string;
            source_type?: string;
        }): number => {
            const stored = Number(row.gross_profit ?? 0);
            if (Number.isFinite(stored) && Math.abs(stored) > 0.0000001) return stored;
            const qty = Math.abs(Number(row.quantity) || 0);
            const unitPrice = Number(row.unit_price) || 0;
            const unitCost = Number(row.unit_cost ?? row.cost_price ?? 0) || 0;
            if (!qty || !unitPrice || !unitCost) return 0;
            const fiche = String(row.fiche_type || '').toLowerCase();
            const tr = Number(row.trcode ?? 0);
            const mt = String(row.movement_type || '');
            // Alış / alış iadesi: brüt kâr yok
            if (fiche === 'purchase_invoice' || (fiche === 'return_invoice' && (tr === 2 || tr === 6))) return 0;
            if (row.source_type === 'slip' && mt !== 'out') return 0;
            const line = (unitPrice - unitCost) * qty;
            if (fiche === 'return_invoice' && tr === 3) return -Math.abs(line);
            if (mt === 'out' || fiche === 'sales_invoice' || tr === 7 || tr === 8) return line;
            return 0;
        };

        const mapRow = (r: any) => {
            const classified = resolveExtractSourceMeta(r);
            const row = { ...r, source_type: classified.source_type, fiche_type: classified.fiche_type };
            return {
                ...row,
                currency: row.currency,
                currency_rate: parseFloat(row.currency_rate || 1),
                gross_profit: computeGrossProfit(row),
                movement: {
                    document_no: row.document_no,
                    movement_type: row.movement_type,
                    movement_date: row.movement_date,
                    status: row.status,
                    trcode: row.trcode,
                    fiche_type: classified.fiche_type,
                    source_type: classified.source_type,
                    warehouses: { name: row.warehouse_name }
                }
            };
        };

        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const { invoicesAPI } = await import('./api/invoices');
                const fn = padFirmNr();
                const pn = padPeriodNr();
                const pid = String(productId || '').trim();
                if (!pid) return [];

                const resolvedUuid = (await this.resolveProductUuidForMovements(productId, hint)) || '';

                // UUID → gerçek ürün kodu (alış satırları item_code = kod)
                let resolvedCode = String(hint?.code || '').trim();
                let resolvedBarcode = String(hint?.barcode || '').trim();
                if (UUID_RE.test(resolvedCode)) resolvedCode = '';
                if (resolvedUuid || resolvedCode || resolvedBarcode || pid) {
                    try {
                        const { productAPI } = await import('./api/products');
                        const prod =
                            (resolvedUuid ? await productAPI.getById(resolvedUuid) : null) ||
                            (resolvedCode ? await productAPI.getByCode(resolvedCode) : null) ||
                            (!UUID_RE.test(pid) ? await productAPI.getByCode(pid) : null) ||
                            (resolvedBarcode ? await productAPI.getByBarcode(resolvedBarcode) : null) ||
                            (UUID_RE.test(pid) ? await productAPI.getById(pid) : null);
                        if (prod?.code) resolvedCode = String(prod.code).trim();
                        if (prod?.barcode && !resolvedBarcode) resolvedBarcode = String(prod.barcode).trim();
                    } catch (e) {
                        console.warn('[StockMovementAPI] product code resolve:', e);
                    }
                }

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

                // 2) Fatura satırları — UUID + kod + barkod
                const histPid = resolvedUuid || pid;
                const hist = await invoicesAPI.getProductHistory(histPid, {
                    code: resolvedCode || (!UUID_RE.test(pid) ? pid : undefined),
                    barcode: resolvedBarcode || undefined,
                });
                for (const h of hist) {
                    const ficheType = String(h.ficheType || h.fiche_type || '');
                    const kind = String(h.type || '');
                    let movementType = 'out';
                    let trcode = 8;
                    if (kind === 'purchase' || ficheType === 'purchase_invoice') {
                        movementType = 'in';
                        trcode = 1;
                    } else if (kind === 'sales_return' || (ficheType === 'return_invoice' && Number(h.trcode) === 3)) {
                        movementType = 'in';
                        trcode = 3;
                    } else if (
                        kind === 'purchase_return' ||
                        (ficheType === 'return_invoice' && [2, 6].includes(Number(h.trcode)))
                    ) {
                        movementType = 'out';
                        trcode = Number(h.trcode) || 6;
                    } else if (ficheType === 'return_invoice') {
                        movementType = Number(h.trcode) === 3 ? 'in' : 'out';
                        trcode = Number(h.trcode) || 3;
                    }
                    const qty = Number(h.quantity) || 0;
                    let unitPrice = Number(h.unitPrice) || 0;
                    const total = Number(h.total) || 0;
                    if (!unitPrice && qty) unitPrice = total / Math.abs(qty);
                    combinedRaw.push({
                        id: `inv-${String(h.documentNo)}-${String(h.date)}`,
                        movement_id: h.documentNo,
                        product_id: histPid,
                        quantity: h.quantity,
                        unit_price: unitPrice,
                        unit_cost: Number(h.unitCost) || 0,
                        cost_price: Number(h.unitCost) || 0,
                        total_amount: total,
                        created_at: h.date,
                        document_no: h.documentNo,
                        movement_type: movementType,
                        movement_date: h.date,
                        status: 'approved',
                        trcode,
                        fiche_type: ficheType || (kind === 'purchase' ? 'purchase_invoice' : 'sales_invoice'),
                        warehouse_name: 'Merkez Ambar',
                        source_type: 'invoice',
                        currency_rate: 1,
                        currency: 'IQD',
                        gross_profit: Number(h.grossProfit) || 0,
                        notes: h.supplier || '',
                    });
                }

                combinedRaw.sort((a, b) => {
                    const da = new Date(a.movement_date || a.created_at).getTime();
                    const db = new Date(b.movement_date || b.created_at).getTime();
                    return db - da;
                });
                const mappedPgrest = combinedRaw.map(mapRow);
                // PostgREST boş döndüyse (yanlış server / eşleme) postgres yoluna düş.
                if (mappedPgrest.length > 0) return mappedPgrest;
            } catch (e) {
                console.warn('[StockMovementAPI] getProductMovements PostgREST:', e);
                // Postgres yoluna düş — sessiz [] ile modalın “boş/açılmadı” karışmasın.
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
                    OR i.product_id IN (
                         SELECT id FROM products
                         WHERE code = $1 OR id::text = $1 OR barcode = $1
                            OR ($2::text <> '' AND (code = $2 OR barcode = $2))
                       )`,
                [productId, String(hint?.code || '').trim()]
            );
            slipRows = rows;
        } catch (err) {
            console.warn('[StockMovementAPI] stock_movement_items query failed:', err);
        }

        // Query 2: Invoice-based movements (satış/alış faturaları)
        let invoiceRows: any[] = [];
        try {
            // sale_items şemasında created_at yok; tarih sales başlığından alınır
            const hintCode = String(hint?.code || '').trim();
            const hintBarcode = String(hint?.barcode || '').trim();
            const { rows } = await postgres.query(
                `SELECT
                    si.id,
                    si.invoice_id as movement_id,
                    si.item_code as product_id,
                    si.quantity,
                    COALESCE(
                      NULLIF(si.unit_price, 0),
                      CASE
                        WHEN ABS(COALESCE(si.quantity, 0)) > 0.0000001
                        THEN COALESCE(NULLIF(si.net_amount, 0), NULLIF(si.total_amount, 0), 0)
                             / NULLIF(ABS(si.quantity), 0)
                        ELSE 0
                      END
                    ) as unit_price,
                    COALESCE(si.total_amount, si.net_amount, 0) as total_amount,
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
                    sl.fiche_type,
                    COALESCE(NULLIF(TRIM(sl.customer_name), ''), sl.notes, '') as notes,
                    COALESCE(st.name, 'Merkez Ambar') as warehouse_name,
                    'invoice' as source_type,
                    COALESCE(sl.currency_rate, 1.0) as currency_rate,
                    COALESCE(sl.currency, 'IQD') as currency,
                    COALESCE(si.unit_cost, 0) as unit_cost,
                    COALESCE(si.gross_profit, 0) as gross_profit
                 FROM sale_items si
                 JOIN sales sl ON si.invoice_id = sl.id
                 LEFT JOIN stores st ON sl.store_id = st.id
                 WHERE si.item_code = $1
                    OR si.product_id::text = $1
                    OR si.item_code IN (
                         SELECT code FROM products WHERE id::text = $1 OR code = $1 OR barcode = $1
                       )
                    OR si.item_code IN (
                         SELECT id::text FROM products WHERE id::text = $1 OR code = $1 OR barcode = $1
                       )
                    OR si.item_code IN (
                         SELECT barcode FROM products WHERE id::text = $1 OR code = $1 OR barcode = $1
                       )
                    OR si.product_id IN (
                         SELECT id FROM products WHERE id::text = $1 OR code = $1 OR barcode = $1
                       )
                    OR (
                         NULLIF(TRIM($2::text), '') IS NOT NULL
                         AND (
                           si.item_code = TRIM($2::text)
                           OR si.product_id IN (
                             SELECT id FROM products WHERE code = TRIM($2::text) OR barcode = TRIM($2::text)
                           )
                         )
                       )
                    OR (
                         NULLIF(TRIM($3::text), '') IS NOT NULL
                         AND (
                           si.item_code = TRIM($3::text)
                           OR si.product_id IN (
                             SELECT id FROM products WHERE barcode = TRIM($3::text) OR code = TRIM($3::text)
                           )
                         )
                       )`,
                [productId, hintCode, hintBarcode]
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
     * Malzeme ekstresi — tarih aralığında tüm malzemelerin hareket satırları
     * (ambar fişi + fatura). Ürün filtresi yok; üst sınır ile kırpılır.
     */
    async getExtractMovementsInDateRange(options: {
        startDate: string;
        endDate: string;
        limit?: number;
        firmNr?: string | number;
        periodNr?: string | number;
    }): Promise<{ rows: any[]; truncated: boolean; limit: number }> {
        const start = toSqlDateInputString(options.startDate);
        const end = toSqlDateInputString(options.endDate);
        const limit = Math.min(Math.max(Number(options.limit) || 10_000, 1), 25_000);
        if (!start || !end) return { rows: [], truncated: false, limit };

        const firmNr = String(options.firmNr ?? ERP_SETTINGS.firmNr ?? '001').padStart(3, '0').slice(0, 10);
        const periodNr = String(options.periodNr ?? ERP_SETTINGS.periodNr ?? '01').padStart(2, '0').slice(0, 10);
        const fp = { firmNr, periodNr };
        const fetchCap = limit + 1;

        const mapExtractRow = (r: any) => {
            const classified = resolveExtractSourceMeta(r);
            const productCode = (() => {
                const shown = displayItemCode(r.product_code, r.productCode, r.item_code, r.barcode);
                return shown === '—' ? '' : shown;
            })();
            return {
                ...r,
                product_id: String(r.product_id || '').trim(),
                product_code: productCode,
                product_name: String(r.product_name || r.item_name || '').trim(),
                source_type: classified.source_type,
                fiche_type: classified.fiche_type,
                movement: {
                    document_no: r.document_no,
                    movement_type: r.movement_type,
                    movement_date: r.movement_date,
                    status: r.status,
                    trcode: r.trcode,
                    fiche_type: classified.fiche_type,
                    source_type: classified.source_type,
                    warehouses: { name: r.warehouse_name },
                },
            };
        };

        let slipRows: any[] = [];
        let invoiceRows: any[] = [];

        try {
            const { rows } = await postgres.query(
                `SELECT
                    i.id, i.movement_id, i.product_id::text AS product_id,
                    COALESCE(p.code, '') AS product_code,
                    COALESCE(p.name, '') AS product_name,
                    i.quantity, i.unit_price, i.cost_price,
                    i.notes, i.created_at,
                    m.document_no, m.movement_type, m.movement_date, m.status, m.trcode,
                    COALESCE(s.name, '') AS warehouse_name,
                    'slip' AS source_type,
                    '' AS fiche_type,
                    COALESCE(m.exchange_rate, 1.0) AS currency_rate,
                    'IQD' AS currency
                 FROM stock_movement_items i
                 JOIN stock_movements m ON i.movement_id = m.id
                 LEFT JOIN products p ON p.id = i.product_id
                 LEFT JOIN stores s ON m.warehouse_id = s.id
                 WHERE m.movement_date::date >= $1::date
                   AND m.movement_date::date <= $2::date
                   AND LOWER(COALESCE(m.movement_type, '')) <> 'price_change'
                 ORDER BY m.movement_date ASC NULLS LAST, m.created_at ASC NULLS LAST, i.id ASC
                 LIMIT $3`,
                [start, end, fetchCap],
                fp,
            );
            slipRows = rows || [];
        } catch (err) {
            console.warn('[StockMovementAPI] getExtractMovementsInDateRange slips failed:', err);
        }

        try {
            const { rows } = await postgres.query(
                `SELECT
                    si.id,
                    si.invoice_id AS movement_id,
                    COALESCE(si.product_id::text, p.id::text, si.item_code) AS product_id,
                    COALESCE(NULLIF(TRIM(p.code), ''), ${SQL_NON_UUID_ITEM_CODE}, '—') AS product_code,
                    COALESCE(p.name, si.item_name, '') AS product_name,
                    si.quantity,
                    COALESCE(
                      NULLIF(si.unit_price, 0),
                      CASE
                        WHEN ABS(COALESCE(si.quantity, 0)) > 0.0000001
                        THEN COALESCE(NULLIF(si.net_amount, 0), NULLIF(si.total_amount, 0), 0)
                             / NULLIF(ABS(si.quantity), 0)
                        ELSE 0
                      END
                    ) AS unit_price,
                    COALESCE(si.unit_cost, 0) AS cost_price,
                    COALESCE(NULLIF(TRIM(sl.customer_name), ''), sl.notes, '') AS notes,
                    sl.date AS created_at,
                    sl.fiche_no AS document_no,
                    CASE
                        WHEN sl.fiche_type = 'purchase_invoice' THEN 'in'
                        WHEN sl.fiche_type = 'sales_invoice' THEN 'out'
                        WHEN sl.fiche_type = 'return_invoice' AND sl.trcode = 3 THEN 'in'
                        WHEN sl.fiche_type = 'return_invoice' AND sl.trcode IN (2, 6) THEN 'out'
                        ELSE 'out'
                    END AS movement_type,
                    sl.date AS movement_date,
                    sl.status,
                    sl.trcode,
                    sl.fiche_type,
                    COALESCE(st.name, 'Merkez Ambar') AS warehouse_name,
                    'invoice' AS source_type,
                    COALESCE(sl.currency_rate, 1.0) AS currency_rate,
                    COALESCE(sl.currency, 'IQD') AS currency
                 FROM sale_items si
                 JOIN sales sl ON si.invoice_id = sl.id
                 LEFT JOIN products p ON p.id = si.product_id
                    OR (si.product_id IS NULL AND p.code = si.item_code)
                    OR (si.product_id IS NULL AND p.id::text = si.item_code)
                 LEFT JOIN stores st ON sl.store_id = st.id
                 WHERE sl.date::date >= $1::date
                   AND sl.date::date <= $2::date
                   AND LOWER(TRIM(COALESCE(sl.fiche_type, ''))) IN (
                     'purchase_invoice', 'sales_invoice', 'return_invoice',
                     'service', 'hizmet', 'beauty', 'beauty_sale', 'pos', 'retail'
                   )
                   AND COALESCE(sl.is_cancelled, false) = false
                   AND LOWER(TRIM(COALESCE(sl.status, ''))) NOT IN ('iptal', 'silindi', 'cancelled', 'canceled', 'deleted')
                   AND LOWER(TRIM(COALESCE(si.item_type, 'Malzeme'))) NOT IN ('hizmet', 'service', 'package', 'paket')
                   AND LOWER(TRIM(COALESCE(p.material_type, ''))) IS DISTINCT FROM 'service'
                 ORDER BY sl.date ASC NULLS LAST, sl.created_at ASC NULLS LAST, si.id ASC
                 LIMIT $3`,
                [start, end, fetchCap],
                fp,
            );
            invoiceRows = rows || [];
        } catch (err) {
            console.warn('[StockMovementAPI] getExtractMovementsInDateRange invoices failed:', err);
        }

        const combined = [...slipRows, ...invoiceRows];
        combined.sort((a, b) => {
            const da = new Date(a.movement_date || a.created_at).getTime();
            const db = new Date(b.movement_date || b.created_at).getTime();
            if (da !== db) return da - db;
            return String(a.id || '').localeCompare(String(b.id || ''));
        });

        const truncated =
            slipRows.length > limit ||
            invoiceRows.length > limit ||
            combined.length > limit;
        const sliced = combined.slice(0, limit).map(mapExtractRow);

        console.log(
            `[StockMovementAPI] getExtractMovementsInDateRange(${start}..${end}): slips=${slipRows.length}, invoices=${invoiceRows.length}, out=${sliced.length}, truncated=${truncated}`,
        );
        return { rows: sliced, truncated, limit };
    }

    /**
     * Tarih aralığında ürün bazında giriş/çıkış toplamları.
     * Kaynak: getProductMovements ile aynı — ambar fiş kalemleri + sale_items (alış/satış/iade).
     * Bitiş günü `::date` ile dahildir; tutarlar netlenmez.
     */
    async getInOutTotalsByDateRange(options: {
        startDate: string;
        endDate: string;
        firmNr?: string | number;
        periodNr?: string | number;
        /** true → hizmet/güzellik satırlarını da dahil et (varsayılan: yalnızca ürün) */
        includeServices?: boolean;
    }): Promise<InOutTotalsRow[]> {
        const start = toSqlDateInputString(options.startDate);
        const end = toSqlDateInputString(options.endDate);
        if (!start || !end) return [];
        const includeServices = options.includeServices === true;
        const firmNr = String(options.firmNr ?? ERP_SETTINGS.firmNr ?? '001').padStart(3, '0').slice(0, 10);
        const periodNr = String(options.periodNr ?? ERP_SETTINGS.periodNr ?? '01').padStart(2, '0').slice(0, 10);
        const fp = { firmNr, periodNr };
        const exclusiveEnd = sqlDateExclusiveUpperBound(end);

        const toLine = (r: any, sourceType: 'slip' | 'invoice'): StockInOutLine => ({
            productId: String(r.product_id || r.productId || '').trim(),
            productCode: (() => {
                const shown = displayItemCode(r.product_code, r.productCode, r.item_code);
                return shown === '—' ? '' : shown;
            })(),
            productName: String(r.product_name || r.item_name || r.productName || '').trim(),
            itemCode: String(r.item_code || '').trim(),
            itemType: String(r.item_type ?? r.itemType ?? r.lineType ?? '').trim() || undefined,
            lineType: String(r.item_type ?? r.itemType ?? r.lineType ?? '').trim() || undefined,
            materialType: String(r.material_type ?? r.materialType ?? '').trim() || undefined,
            isService:
                r.is_service === true ||
                r.isService === true ||
                String(r.material_type ?? r.materialType ?? '').trim().toLowerCase() === 'service',
            quantity: Number(r.quantity) || 0,
            unitPrice: Number(r.unit_price ?? r.unitPrice) || 0,
            costPrice: Number(r.cost_price ?? r.costPrice ?? r.unit_cost) || 0,
            totalAmount: Number(r.total_amount ?? r.net_amount ?? r.totalAmount) || 0,
            movementType: String(r.movement_type || r.movementType || ''),
            ficheType: String(r.fiche_type || r.ficheType || ''),
            trcode: Number(r.trcode ?? 0),
            sourceType,
            movementDate: r.movement_date || r.date || r.created_at,
        });

        if (shouldUseTenantPostgrestApi()) {
            try {
                const { postgrest } = await import('./api/postgrestClient');
                const movPath = `/rex_${firmNr}_${periodNr}_stock_movements`;
                const smiPath = `/rex_${firmNr}_${periodNr}_stock_movement_items`;
                const salesPath = `/rex_${firmNr}_${periodNr}_sales`;
                const itemsPath = `/rex_${firmNr}_${periodNr}_sale_items`;
                const prodPath = `/rex_${firmNr}_products`;
                const RANGE_CAP = 20000;
                const chunkSize = 35;
                const lines: StockInOutLine[] = [];

                const isCancelled = (row: any) =>
                    row?.is_cancelled === true ||
                    ['iptal', 'silindi', 'cancelled', 'canceled', 'deleted'].includes(
                        String(row?.status || '').trim().toLowerCase(),
                    );

                const slipHeaders = await postgrest
                    .get<any[]>(
                        movPath,
                        {
                            select: 'id,movement_type,movement_date,trcode,status',
                            and: `(movement_date.gte.${start},movement_date.lt.${exclusiveEnd || end})`,
                            limit: RANGE_CAP,
                        },
                        { schema: 'public' },
                    )
                    .catch(() => [] as any[]);

                const slips = (Array.isArray(slipHeaders) ? slipHeaders : []).filter((m) => {
                    const mt = String(m?.movement_type || '').toLowerCase();
                    if (mt === 'price_change' || mt === 'transfer') return false;
                    return isSqlDateInInclusiveRange(m?.movement_date, start, end);
                });
                const slipById = new Map<string, any>();
                slips.forEach((m) => {
                    if (m?.id) slipById.set(String(m.id), m);
                });
                const slipIds = [...slipById.keys()];
                for (let i = 0; i < slipIds.length; i += chunkSize) {
                    const chunk = slipIds.slice(i, i + chunkSize);
                    const items = await postgrest
                        .get<any[]>(
                            smiPath,
                            {
                                select: 'id,movement_id,product_id,quantity,unit_price,cost_price,notes',
                                movement_id: `in.(${chunk.join(',')})`,
                                limit: 20000,
                            },
                            { schema: 'public' },
                        )
                        .catch(() => [] as any[]);
                    for (const it of Array.isArray(items) ? items : []) {
                        const m = slipById.get(String(it.movement_id));
                        if (!m) continue;
                        lines.push(
                            toLine(
                                {
                                    ...it,
                                    movement_type: m.movement_type,
                                    movement_date: m.movement_date,
                                    trcode: m.trcode,
                                },
                                'slip',
                            ),
                        );
                    }
                }

                const saleHeaders = await postgrest
                    .get<any[]>(
                        salesPath,
                        {
                            select: 'id,date,fiche_type,trcode,status,is_cancelled',
                            and: `(date.gte.${start},date.lt.${exclusiveEnd || end})`,
                            limit: RANGE_CAP,
                        },
                        { schema: 'public' },
                    )
                    .catch(() => [] as any[]);
                const sales = (Array.isArray(saleHeaders) ? saleHeaders : []).filter((s) => {
                    if (isCancelled(s)) return false;
                    const ft = String(s?.fiche_type || '').trim().toLowerCase();
                    if (
                      ![
                        'purchase_invoice',
                        'sales_invoice',
                        'return_invoice',
                        'service',
                        'hizmet',
                        'beauty',
                        'beauty_sale',
                        'pos',
                        'retail',
                      ].includes(ft)
                    ) {
                      return false;
                    }
                    return isSqlDateInInclusiveRange(s?.date, start, end);
                });
                const saleById = new Map<string, any>();
                sales.forEach((s) => {
                    if (s?.id) saleById.set(String(s.id), s);
                });
                const saleIds = [...saleById.keys()];
                for (let i = 0; i < saleIds.length; i += chunkSize) {
                    const chunk = saleIds.slice(i, i + chunkSize);
                    const items = await postgrest
                        .get<any[]>(
                            itemsPath,
                            {
                                select: 'id,invoice_id,product_id,item_code,item_name,item_type,quantity,unit_price,total_amount,net_amount,unit_cost',
                                invoice_id: `in.(${chunk.join(',')})`,
                                limit: 20000,
                            },
                            { schema: 'public' },
                        )
                        .catch(() => [] as any[]);
                    for (const it of Array.isArray(items) ? items : []) {
                        const sl = saleById.get(String(it.invoice_id));
                        if (!sl) continue;
                        if (
                            !includeServices &&
                            resolveLineKind({
                                item_type: it.item_type,
                                item_code: it.item_code,
                                product_code: it.item_code,
                            }) === 'service'
                        ) {
                            continue;
                        }
                        const ft = String(sl.fiche_type || '');
                        let movementType = 'out';
                        if (ft === 'purchase_invoice') movementType = 'in';
                        else if (ft === 'return_invoice' && Number(sl.trcode) === 3) movementType = 'in';
                        else if (ft === 'return_invoice' && [2, 6].includes(Number(sl.trcode))) movementType = 'out';
                        lines.push(
                            toLine(
                                {
                                    ...it,
                                    product_code: isUuidText(it.item_code) ? '' : it.item_code,
                                    product_name: it.item_name,
                                    movement_type: movementType,
                                    movement_date: sl.date,
                                    fiche_type: ft,
                                    trcode: sl.trcode,
                                },
                                'invoice',
                            ),
                        );
                    }
                }

                // Agregasyon öncesi: ürün kartı material_type=service işaretle + kod/ad doldur
                const lineProductIds = [
                    ...new Set(
                        lines
                            .map((l) => String(l.productId || '').trim())
                            .filter((id) => UUID_RE.test(id)),
                    ),
                ];
                const productIdSet = new Set<string>();
                if (lineProductIds.length > 0) {
                    const byId = new Map<string, { code?: string; name?: string; material_type?: string }>();
                    for (let i = 0; i < lineProductIds.length; i += chunkSize) {
                        const chunk = lineProductIds.slice(i, i + chunkSize);
                        const prows = await postgrest
                            .get<any[]>(
                                prodPath,
                                {
                                    select: 'id,code,name,material_type',
                                    id: `in.(${chunk.join(',')})`,
                                    limit: chunk.length,
                                },
                                { schema: 'public' },
                            )
                            .catch(() => [] as any[]);
                        for (const p of Array.isArray(prows) ? prows : []) {
                            if (p?.id) {
                                const id = String(p.id);
                                productIdSet.add(id.toLowerCase());
                                byId.set(id, {
                                    code: p.code,
                                    name: p.name,
                                    material_type: p.material_type,
                                });
                                byId.set(id.toLowerCase(), {
                                    code: p.code,
                                    name: p.name,
                                    material_type: p.material_type,
                                });
                            }
                        }
                    }
                    for (const line of lines) {
                        const pid = String(line.productId || '');
                        const p = byId.get(pid) || byId.get(pid.toLowerCase());
                        if (!p) continue;
                        if (!line.productCode && p.code) line.productCode = String(p.code);
                        if (!line.productName && p.name) line.productName = String(p.name);
                        if (!line.materialType && p.material_type) {
                            line.materialType = String(p.material_type);
                            line.isService =
                                String(p.material_type).trim().toLowerCase() === 'service';
                        }
                    }
                }

                // item_type boş/Malzeme olsa bile beauty_services kartı = hizmet
                // + ürün kartında bulunmayan UUID → stok dışı / hizmet (SAÇ BOYAMA vb.)
                const unresolvedIds = lineProductIds.filter(
                    (id) => !productIdSet.has(id.toLowerCase()),
                );
                const serviceKeys = await loadBeautyServiceKeys(firmNr, [
                    ...unresolvedIds,
                    ...lines
                        .filter((l) => l.sourceType === 'invoice')
                        .map((l) => String(l.productId || '').trim()),
                ]);
                for (const id of unresolvedIds) {
                    serviceKeys.add(String(id).toLowerCase());
                }
                for (const line of lines) {
                    const pid = String(line.productId || '').trim().toLowerCase();
                    if (pid && serviceKeys.has(pid)) line.isService = true;
                }

                let totals = aggregateInOutTotals(lines, { includeServices, serviceKeys });
                const needIds = totals
                    .filter((r) => UUID_RE.test(r.productId) && !String(r.productCode || '').trim())
                    .map((r) => r.productId);
                if (needIds.length > 0) {
                    const byId = new Map<string, { code?: string; name?: string }>();
                    for (let i = 0; i < needIds.length; i += chunkSize) {
                        const chunk = needIds.slice(i, i + chunkSize);
                        const prows = await postgrest
                            .get<any[]>(
                                prodPath,
                                {
                                    select: 'id,code,name',
                                    id: `in.(${chunk.join(',')})`,
                                    limit: chunk.length,
                                },
                                { schema: 'public' },
                            )
                            .catch(() => [] as any[]);
                        (Array.isArray(prows) ? prows : []).forEach((p) => {
                            if (p?.id) byId.set(String(p.id), { code: p.code, name: p.name });
                        });
                    }
                    totals = totals.map((r) => {
                        const p = byId.get(r.productId);
                        if (!p) return r;
                        return {
                            ...r,
                            productCode: r.productCode || String(p.code || ''),
                            productName: r.productName || String(p.name || ''),
                        };
                    });
                }
                if (totals.length > 0) return totals;
            } catch (e) {
                console.warn('[StockMovementAPI] getInOutTotalsByDateRange PostgREST:', e);
            }
        }

        const lines: StockInOutLine[] = [];
        try {
            const { rows } = await postgres.query(
                `SELECT
                    i.product_id::text AS product_id,
                    COALESCE(p.code, '') AS product_code,
                    COALESCE(p.name, '') AS product_name,
                    i.quantity,
                    i.unit_price,
                    i.cost_price,
                    m.movement_type,
                    m.movement_date,
                    m.trcode
                 FROM stock_movement_items i
                 JOIN stock_movements m ON i.movement_id = m.id
                 LEFT JOIN products p ON p.id = i.product_id
                 WHERE m.movement_date::date >= $1::date
                   AND m.movement_date::date <= $2::date
                   AND LOWER(COALESCE(m.movement_type, '')) NOT IN ('price_change', 'transfer')`,
                [start, end],
                fp,
            );
            for (const r of rows || []) {
                if (classifyStockLineDirection(r) === 'skip') continue;
                lines.push(toLine(r, 'slip'));
            }
        } catch (err) {
            console.warn('[StockMovementAPI] getInOutTotalsByDateRange slips failed:', err);
        }

        try {
            const serviceExcludeSql = includeServices
                ? ''
                : ` AND LOWER(TRIM(COALESCE(si.item_type, 'Malzeme'))) NOT IN ('hizmet', 'service', 'package', 'paket')
                   AND LOWER(TRIM(COALESCE(p.material_type, ''))) IS DISTINCT FROM 'service'`;
            const { rows } = await postgres.query(
                `SELECT
                    COALESCE(si.product_id::text, p.id::text, si.item_code) AS product_id,
                    COALESCE(NULLIF(TRIM(p.code), ''), ${SQL_NON_UUID_ITEM_CODE}, '—') AS product_code,
                    COALESCE(p.name, si.item_name, '') AS product_name,
                    si.item_code,
                    si.item_type,
                    p.material_type,
                    si.quantity,
                    COALESCE(
                      NULLIF(si.unit_price, 0),
                      CASE
                        WHEN ABS(COALESCE(si.quantity, 0)) > 0.0000001
                        THEN COALESCE(NULLIF(si.net_amount, 0), NULLIF(si.total_amount, 0), 0)
                             / NULLIF(ABS(si.quantity), 0)
                        ELSE 0
                      END
                    ) AS unit_price,
                    COALESCE(si.unit_cost, 0) AS cost_price,
                    COALESCE(si.total_amount, si.net_amount, 0) AS total_amount,
                    CASE
                        WHEN sl.fiche_type = 'purchase_invoice' THEN 'in'
                        WHEN sl.fiche_type = 'sales_invoice' THEN 'out'
                        WHEN sl.fiche_type = 'return_invoice' AND sl.trcode = 3 THEN 'in'
                        WHEN sl.fiche_type = 'return_invoice' AND sl.trcode IN (2, 6) THEN 'out'
                        ELSE 'out'
                    END AS movement_type,
                    sl.date AS movement_date,
                    sl.fiche_type,
                    sl.trcode
                 FROM sale_items si
                 JOIN sales sl ON si.invoice_id = sl.id
                 LEFT JOIN products p ON p.id = si.product_id
                    OR (si.product_id IS NULL AND p.code = si.item_code)
                    OR (si.product_id IS NULL AND p.id::text = si.item_code)
                 WHERE sl.date::date >= $1::date
                   AND sl.date::date <= $2::date
                   AND LOWER(TRIM(COALESCE(sl.fiche_type, ''))) IN (
                     'purchase_invoice', 'sales_invoice', 'return_invoice',
                     'service', 'hizmet', 'beauty', 'beauty_sale', 'pos', 'retail'
                   )
                   AND COALESCE(sl.is_cancelled, false) = false
                   AND LOWER(TRIM(COALESCE(sl.status, ''))) NOT IN ('iptal', 'silindi', 'cancelled', 'canceled', 'deleted')
                   ${serviceExcludeSql}`,
                [start, end],
                fp,
            );
            for (const r of rows || []) {
                if (
                    !includeServices &&
                    resolveLineKind({
                        item_type: r.item_type,
                        material_type: r.material_type,
                        item_code: r.item_code,
                        product_code: r.product_code,
                    }) === 'service'
                ) {
                    continue;
                }
                lines.push(toLine(r, 'invoice'));
            }
        } catch (err) {
            console.warn('[StockMovementAPI] getInOutTotalsByDateRange invoices failed:', err);
        }

        const serviceKeys = await loadBeautyServiceKeys(
            firmNr,
            lines.map((l) => String(l.productId || '').trim()),
        );
        for (const line of lines) {
            const pid = String(line.productId || '').trim().toLowerCase();
            if (pid && serviceKeys.has(pid)) line.isService = true;
        }

        return aggregateInOutTotals(lines, { includeServices, serviceKeys });
    }

    /**
     * Create a new stock movement.
     * document_no UNIQUE (firma/dönem tablosu) — çakışmada suffix + retry.
     */
    async create(movement: Partial<StockMovement>, items: Partial<StockMovementItem>[]): Promise<StockMovement> {
        const firmNr = padFirmNr();
        const periodNr = padPeriodNr();
        const fp = { firmNr, periodNr };

        /** Açık trcode varsa koru (Sayım Fazlası vb.); yoksa movement_type’tan türet */
        let trcode =
            movement.trcode != null && !Number.isNaN(Number(movement.trcode))
                ? Number(movement.trcode)
                : undefined;
        if (trcode == null) {
            trcode = STOCK_SLIP_TRCODES.CONSUMPTION;
            if (movement.movement_type === 'in') trcode = STOCK_SLIP_TRCODES.PRODUCTION_IN;
            if (movement.movement_type === 'transfer') trcode = STOCK_SLIP_TRCODES.TRANSFER;
            if (movement.movement_type === 'adjustment') trcode = STOCK_SLIP_TRCODES.COUNTING;
            if (movement.movement_type === 'price_change') trcode = STOCK_SLIP_TRCODES.PRICE_CHANGE;
        }

        const baseDoc =
            (movement.document_no && String(movement.document_no).trim()) ||
            `ST-${Date.now()}`;
        const maxAttempts = 6;
        let lastError: unknown;

        if (shouldUseTenantPostgrestApi()) {
            const { postgrest } = await import('./api/postgrestClient');
            const { productAPI } = await import('./api/products');
            const movPath = `/rex_${firmNr}_${periodNr}_stock_movements`;
            const itemPath = `/rex_${firmNr}_${periodNr}_stock_movement_items`;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                const documentNo =
                    attempt === 0
                        ? baseDoc.slice(0, 50)
                        : `${baseDoc.slice(0, 36)}-${Date.now().toString(36)}${attempt}`.slice(0, 50);
                try {
                    const header: Record<string, unknown> = {
                        firm_nr: firmNr,
                        period_nr: periodNr,
                        document_no: documentNo,
                        movement_type: movement.movement_type || 'out',
                        trcode,
                        movement_date: movement.movement_date || new Date().toISOString(),
                        exchange_rate: movement.exchange_rate || 1,
                        description: movement.description ?? null,
                        status: movement.status || 'completed',
                    };
                    if (movement.warehouse_id) header.warehouse_id = movement.warehouse_id;
                    if (movement.target_warehouse_id) header.target_warehouse_id = movement.target_warehouse_id;
                    if (movement.created_by && UUID_RE.test(String(movement.created_by))) {
                        header.created_by = movement.created_by;
                    }
                    const posted = await postgrest.post<any[]>(movPath, header, {
                        schema: 'public',
                        prefer: 'return=representation',
                    });
                    const newMovement = Array.isArray(posted) ? posted[0] : posted;
                    const movementId = String(newMovement?.id || '');
                    if (!movementId) throw new Error('Stok hareketi oluşturulamadı');

                    const itemBodies = items.map((item) => ({
                        movement_id: movementId,
                        product_id: item.product_id,
                        quantity: item.quantity ?? 0,
                        unit_price: item.unit_price || 0,
                        cost_price: item.cost_price || 0,
                        exchange_rate: item.exchange_rate || movement.exchange_rate || 1,
                        unit_name: item.unit_name || 'Adet',
                        convert_factor: item.convert_factor || 1,
                        notes: item.notes ?? null,
                    }));
                    if (itemBodies.length > 0) {
                        try {
                            await postgrest.post(itemPath, itemBodies, {
                                schema: 'public',
                                prefer: 'return=minimal',
                            });
                        } catch {
                            for (const body of itemBodies) {
                                await postgrest.post(itemPath, body, {
                                    schema: 'public',
                                    prefer: 'return=minimal',
                                });
                            }
                        }
                    }

                    if (movement.movement_type !== 'price_change') {
                        for (const item of items) {
                            if (!item.product_id) continue;
                            let modifier = Number(item.quantity) || 0;
                            if (['out', 'adjustment'].includes(movement.movement_type || 'out')) {
                                modifier = -modifier;
                            }
                            if (movement.movement_type === 'transfer') continue;
                            const p = await productAPI.getById(String(item.product_id));
                            if (!p) continue;
                            await productAPI.updateStock(
                                String(item.product_id),
                                (Number(p.stock) || 0) + modifier,
                            );
                        }
                    }

                    return { ...newMovement, stock_movement_items: items } as StockMovement;
                } catch (error) {
                    lastError = error;
                    const msg = error instanceof Error ? error.message : String(error);
                    const isDupDoc =
                        /document_no/i.test(msg) &&
                        (/unique|duplicate key/i.test(msg) || /_document_no_key/i.test(msg));
                    if (isDupDoc && attempt < maxAttempts - 1) continue;
                    console.error('[StockMovementAPI] create PostgREST failed:', error);
                    throw error;
                }
            }
            throw lastError instanceof Error ? lastError : new Error(String(lastError));
        }

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const documentNo =
                attempt === 0
                    ? baseDoc.slice(0, 50)
                    : `${baseDoc.slice(0, 36)}-${Date.now().toString(36)}${attempt}`.slice(0, 50);
            try {
                const { rows } = await postgres.query(
                    `INSERT INTO stock_movements (
                        firm_nr, period_nr, document_no, movement_type, trcode, warehouse_id, target_warehouse_id,
                        movement_date, exchange_rate, description, status, created_by
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                     RETURNING *`,
                    [
                        firmNr,
                        periodNr,
                        documentNo,
                        movement.movement_type || 'out',
                        trcode,
                        movement.warehouse_id,
                        movement.target_warehouse_id,
                        movement.movement_date || new Date().toISOString(),
                        movement.exchange_rate || 1,
                        movement.description,
                        movement.status || 'completed',
                        movement.created_by,
                    ],
                    fp,
                );
                const newMovement = rows[0];

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
                            item.notes,
                        ],
                        fp,
                    );

                    if (movement.movement_type !== 'price_change' && item.product_id) {
                        let modifier = Number(item.quantity) || 0;
                        if (['out', 'adjustment'].includes(movement.movement_type || 'out')) {
                            modifier = -modifier;
                        }

                        if (movement.movement_type !== 'transfer') {
                            await postgres.query(
                                `UPDATE products SET stock = stock + $1 WHERE id = $2`,
                                [modifier, item.product_id],
                                fp,
                            );
                        }
                    }
                }

                return newMovement;
            } catch (error) {
                lastError = error;
                const msg = error instanceof Error ? error.message : String(error);
                const isDupDoc =
                    /document_no/i.test(msg) &&
                    (/unique|duplicate key/i.test(msg) || /_document_no_key/i.test(msg));
                if (isDupDoc && attempt < maxAttempts - 1) {
                    continue;
                }
                console.error('[StockMovementAPI] create failed:', error);
                throw error;
            }
        }

        console.error('[StockMovementAPI] create failed after retries:', lastError);
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
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

    /**
     * Kasap üretim fişi (KU-…) için stok hareketleri — document_no / description eşleşmesi.
     */
    async listByOrderDocumentNo(orderNo: string): Promise<
        Array<{
            document_no: string;
            movement_type: string;
            trcode: number;
            description?: string;
            created_at?: string;
            product_id: string;
            product_name?: string;
            product_code?: string;
            quantity: number;
            unit_price: number;
            cost_price: number;
            notes?: string;
            product_stock?: number;
        }>
    > {
        const q = String(orderNo || '').trim();
        if (!q) return [];
        const firmNr = padFirmNr();
        const periodNr = padPeriodNr();
        const fp = { firmNr, periodNr };
        try {
            const { rows } = await postgres.query(
                `SELECT m.document_no, m.movement_type, m.trcode, m.description, m.created_at,
                        i.product_id::text AS product_id, i.quantity, i.unit_price, i.cost_price, i.notes,
                        p.name AS product_name, p.code AS product_code, p.stock AS product_stock
                 FROM stock_movements m
                 JOIN stock_movement_items i ON i.movement_id = m.id
                 LEFT JOIN products p ON p.id = i.product_id
                 WHERE m.document_no LIKE $1 OR m.description ILIKE $2
                 ORDER BY m.created_at ASC, m.document_no ASC`,
                [`${q}%`, `%${q}%`],
                fp,
            );
            return (rows || []).map((r: any) => ({
                document_no: String(r.document_no || ''),
                movement_type: String(r.movement_type || ''),
                trcode: Number(r.trcode) || 0,
                description: r.description ?? undefined,
                created_at: r.created_at ?? undefined,
                product_id: String(r.product_id || ''),
                product_name: r.product_name ?? undefined,
                product_code: r.product_code ?? undefined,
                quantity: Number(r.quantity) || 0,
                unit_price: Number(r.unit_price) || 0,
                cost_price: Number(r.cost_price) || 0,
                notes: r.notes ?? undefined,
                product_stock: r.product_stock != null ? Number(r.product_stock) : undefined,
            }));
        } catch (error) {
            console.error('[StockMovementAPI] listByOrderDocumentNo failed:', error);
            return [];
        }
    }
}

export const stockMovementAPI = new StockMovementAPI();

