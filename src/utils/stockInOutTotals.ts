import { classifyAnalysisSaleLine } from './analysisSaleLine';
import { toSqlDateInputString } from './localCalendarDate';

/** Ürün bazında giriş/çıkış özeti — tutarlar netlenmez. */
export interface InOutTotalsRow {
    productId: string;
    productCode: string;
    productName: string;
    inQty: number;
    inAmount: number;
    outQty: number;
    outAmount: number;
}

export interface StockInOutLine {
    productId?: string;
    productCode?: string;
    productName?: string;
    itemCode?: string;
    /** sale_items.item_type — Hizmet / Malzeme / service / package */
    itemType?: string;
    lineType?: string;
    isService?: boolean;
    materialType?: string;
    quantity?: number;
    unitPrice?: number;
    costPrice?: number;
    totalAmount?: number;
    movementType?: string;
    ficheType?: string;
    trcode?: number;
    sourceType?: string;
    movementDate?: string | Date | null;
}

/**
 * Giriş/çıkış toplamları yalnızca malzeme/stok satırları içindir.
 * analysisSaleLine + fatura türü (service/hizmet) ile hizalı.
 */
export function isInOutTotalsServiceLine(line: StockInOutLine): boolean {
    const fiche = String(line.ficheType || '').trim().toLowerCase();
    if (fiche === 'service' || fiche === 'hizmet') return true;

    const itemType = line.itemType ?? line.lineType;
    const materialType = String(line.materialType || '').trim().toLowerCase();
    const catalogHint = {
        id: String(line.productId || ''),
        code: String(line.productCode || line.itemCode || ''),
        name: String(line.productName || ''),
        isService: line.isService === true || materialType === 'service',
        materialType: (line.materialType || undefined) as
            | 'service'
            | 'commercial_goods'
            | undefined,
    };

    return (
        classifyAnalysisSaleLine(
            {
                productId: line.productId,
                productName: line.productName,
                lineType: itemType,
                item_type: itemType,
            },
            catalogHint.id || catalogHint.code || catalogHint.isService ? [catalogHint] : [],
        ) === 'service'
    );
}

/**
 * getProductMovements yön CASE ile aynı:
 * alış / satış iadesi → giriş; satış / alış iadesi → çıkış; ambar in/out.
 * Fiyat değişimi ve transfer özet raporda yok sayılır.
 */
export function classifyStockLineDirection(row: {
    movementType?: string;
    movement_type?: string;
    ficheType?: string;
    fiche_type?: string;
    trcode?: number;
}): 'in' | 'out' | 'skip' {
    const mt = String(row.movementType || row.movement_type || '').toLowerCase();
    if (mt === 'price_change' || mt === 'transfer') return 'skip';

    const fiche = String(row.ficheType || row.fiche_type || '').toLowerCase();
    const tr = Number(row.trcode ?? 0);

    if (fiche === 'purchase_invoice') return 'in';
    if (fiche === 'sales_invoice') return 'out';
    if (
      fiche === 'service' ||
      fiche === 'hizmet' ||
      fiche === 'beauty' ||
      fiche === 'beauty_sale' ||
      fiche === 'pos' ||
      fiche === 'retail'
    ) {
      return 'out';
    }
    if (fiche === 'return_invoice' && tr === 3) return 'in';
    if (fiche === 'return_invoice' && (tr === 2 || tr === 6)) return 'out';
    if (fiche === 'return_invoice') return tr === 3 ? 'in' : 'out';

    if (mt === 'in' || mt === 'purchase') return 'in';
    if (mt === 'out' || mt === 'sale') return 'out';
    return 'skip';
}

/** Satır tutarı: net_amount/total yoksa miktar × birim (veya maliyet). Mutlak değer. */
export function stockLineAmount(row: {
    quantity?: number;
    unitPrice?: number;
    unit_price?: number;
    costPrice?: number;
    cost_price?: number;
    totalAmount?: number;
    total_amount?: number;
    netAmount?: number;
    net_amount?: number;
}): number {
    const qty = Math.abs(Number(row.quantity) || 0);
    const total =
        Number(row.totalAmount ?? row.total_amount ?? 0) ||
        Number(row.netAmount ?? row.net_amount ?? 0) ||
        0;
    if (Number.isFinite(total) && Math.abs(total) > 0.0000001) return Math.abs(total);
    const unit = Number(row.unitPrice ?? row.unit_price ?? 0) || 0;
    if (unit) return qty * unit;
    const cost = Number(row.costPrice ?? row.cost_price ?? 0) || 0;
    return qty * cost;
}

/** Takvim günü (YYYY-MM-DD) dahil aralık — UTC getTime kayması yok. */
export function isSqlDateInInclusiveRange(
    raw: string | Date | number | null | undefined,
    startYmd: string,
    endYmd: string,
): boolean {
    const key = toSqlDateInputString(raw);
    const start = toSqlDateInputString(startYmd);
    const end = toSqlDateInputString(endYmd);
    if (!key || !start || !end) return false;
    return key >= start && key <= end;
}

/** PostgREST `lt.` üst sınırı: bitiş gününün ertesi (yerel takvim). */
export function sqlDateExclusiveUpperBound(endYmd: string): string {
    const s = toSqlDateInputString(endYmd);
    if (!s) return '';
    const parts = s.split('-').map((x) => parseInt(x, 10));
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) return '';
    const dt = new Date(y, m - 1, d + 1);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
}

function lineKey(line: StockInOutLine): string {
    const id = String(line.productId || '').trim();
    const code = String(line.productCode || line.itemCode || '').trim();
    return id || code || '';
}

/** Aynı ürünün giriş/çıkış miktar ve tutarlarını ayrı toplar; para netlenmez. */
export function aggregateInOutTotals(lines: StockInOutLine[]): InOutTotalsRow[] {
    const agg = new Map<string, InOutTotalsRow>();
    for (const line of lines) {
        if (isInOutTotalsServiceLine(line)) continue;
        const dir = classifyStockLineDirection(line);
        if (dir === 'skip') continue;
        const key = lineKey(line);
        if (!key) continue;
        const qty = Math.abs(Number(line.quantity) || 0);
        if (!qty) continue;
        const amount = stockLineAmount(line);
        const code = String(line.productCode || line.itemCode || '').trim();
        const name = String(line.productName || '').trim();
        const prev = agg.get(key);
        const row: InOutTotalsRow = prev || {
            productId: String(line.productId || key),
            productCode: code,
            productName: name,
            inQty: 0,
            inAmount: 0,
            outQty: 0,
            outAmount: 0,
        };
        if (!row.productCode && code) row.productCode = code;
        if (!row.productName && name) row.productName = name;
        if (dir === 'in') {
            row.inQty += qty;
            row.inAmount += amount;
        } else {
            row.outQty += qty;
            row.outAmount += amount;
        }
        agg.set(key, row);
    }
    return collapseInOutTotalsRows(Array.from(agg.values()));
}

const UUID_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID ve ürün kodu aynı malzemeyi iki satırda göstermesin. */
export function collapseInOutTotalsRows(rows: InOutTotalsRow[]): InOutTotalsRow[] {
    const byKey = new Map<string, InOutTotalsRow>();
    const codeToKey = new Map<string, string>();
    for (const r of rows) {
        const code = String(r.productCode || '').trim();
        let key = UUID_KEY_RE.test(r.productId) ? r.productId : (code || r.productId);
        if (code && codeToKey.has(code)) key = codeToKey.get(code) || key;
        else if (code) codeToKey.set(code, key);
        const prev = byKey.get(key);
        if (!prev) {
            byKey.set(key, { ...r, productId: UUID_KEY_RE.test(r.productId) ? r.productId : key });
        } else {
            prev.inQty += r.inQty;
            prev.inAmount += r.inAmount;
            prev.outQty += r.outQty;
            prev.outAmount += r.outAmount;
            if (!prev.productCode && r.productCode) prev.productCode = r.productCode;
            if (!prev.productName && r.productName) prev.productName = r.productName;
        }
    }
    return Array.from(byKey.values()).sort((a, b) => (b.inQty + b.outQty) - (a.inQty + a.outQty));
}
