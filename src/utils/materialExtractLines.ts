/**
 * Malzeme ekstresi — fiş satırının yönü ve tutarı.
 *
 * Tutar, hareket dökümü ile aynı kaynaktır: indirim sonrası net, bir kez.
 * Satış birim fiyatı liste fiyatı olarak kalır; brüt nete bölünmez.
 * Satış iadesi stoğa girer, alış iadesi stoktan çıkar.
 * Aynı satır kimliğinin kopyası düşer.
 * Ürün kimliği olmayan veya yalnızca ad eşlemesiyle gelen satır stok fişi değildir.
 * Kalan, önceki kalan artı bu satırın işaretli miktarıdır.
 * Dip toplam son kümülatif bakiyedir; satır bakiyelerinin toplamı değildir.
 */
import { computeNetAmount } from './stockMovementNet';
import { resolveExtractSourceMeta } from './materialExtractLabels';

export type ExtractSide = 'in' | 'out' | 'none';

export interface MaterialExtractSourceLine {
    id?: string;
    quantity?: number | string | null;
    unit_price?: number | string | null;
    gross_amount?: number | string | null;
    discount_amount?: number | string | null;
    net_amount?: number | string | null;
    movement_type?: string | null;
    fiche_type?: string | null;
    trcode?: number | string | null;
    product_id?: string | null;
    product_code?: string | null;
    source_type?: string | null;
    /** Ad eşlemesi seçili ürün kimliğini yapıştırmışsa stok satırı sayılmaz. */
    matchedByName?: boolean;
    /** false → stok fişine bağlı değil. */
    stockLinked?: boolean;
    document_no?: string | null;
    movement_date?: string | null;
}

export interface ProjectedExtractLine {
    id: string;
    side: ExtractSide;
    quantity: number;
    /** Liste / fiş birim fiyatı. Net tutar bu alana yazılmaz. */
    unitPrice: number;
    amount: number;
    inQty: number;
    inAmt: number;
    outQty: number;
    outAmt: number;
    runningBalance: number;
}

export interface MaterialExtractTotals {
    inQty: number;
    inAmt: number;
    outQty: number;
    outAmt: number;
    closingBalance: number;
}

function pickPositive(...values: unknown[]): number | null {
    for (const value of values) {
        if (value == null || value === '') continue;
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

function readDiscount(value: unknown): number {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, n);
}

/**
 * İndirim sonrası net. `net_amount` doluysa indirim ikinci kez düşülmez.
 * Net yoksa brüt − indirim; o da yoksa birim fiyat × miktar.
 */
export function extractLineNetAmount(line: MaterialExtractSourceLine): number {
    const qty = Math.abs(Number(line.quantity) || 0);
    const unitPrice = Number(line.unit_price) || 0;
    const net = pickPositive(line.net_amount);
    const gross = pickPositive(line.gross_amount);
    const discount = readDiscount(line.discount_amount);
    return computeNetAmount({
        quantity: qty,
        unit_price: unitPrice,
        gross_amount: gross ?? undefined,
        discount_amount: net != null ? 0 : discount,
        net_amount: net ?? undefined,
    });
}

/**
 * Satış iadesi (trcode 2 ve 3) giriş, alış iadesi (trcode 6) çıkış.
 * Belirsiz iade fişinde hareket yönü korunur; yön yoksa satış iadesi sayılır.
 */
export function extractMovementSide(line: {
    movement_type?: string | null;
    fiche_type?: string | null;
    trcode?: number | string | null;
}): ExtractSide {
    const fiche = String(line.fiche_type || '').trim().toLocaleLowerCase('tr-TR');
    const mt = String(line.movement_type || '').trim().toLocaleLowerCase('tr-TR');
    const tr = Number(line.trcode) || 0;

    if (tr === 6) return 'out';
    if (tr === 2 || tr === 3) return 'in';
    if (fiche === 'purchase_invoice') return 'in';
    if (fiche === 'sales_invoice') return 'out';
    if (fiche === 'return_invoice') {
        if (mt === 'out') return 'out';
        if (mt === 'in') return 'in';
        return 'in';
    }
    if (mt === 'in') return 'in';
    if (mt === 'out') return 'out';
    return 'none';
}

export function signedExtractQty(side: ExtractSide, quantity: number): number {
    const qty = Math.abs(Number(quantity) || 0);
    if (side === 'in') return qty;
    if (side === 'out') return -qty;
    return 0;
}

function localYmd(date: Date): string {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const da = String(date.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
}

/** Takvim günü. Ofsetsiz duvar saati UTC'ye kaydırılmaz. */
export function calendarDayKey(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return localYmd(value);
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const tr = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (tr) return `${tr[3]}-${tr[2]}-${tr[1]}`;
    const wall = raw.match(/^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}/);
    if (wall && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return wall[1];
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    return localYmd(parsed);
}

export function isWithinInclusiveDayRange(value: unknown, start: string, end: string): boolean {
    const day = calendarDayKey(value);
    const startDay = calendarDayKey(start);
    const endDay = calendarDayKey(end);
    if (!day || !startDay || !endDay) return false;
    return day >= startDay && day <= endDay;
}

/** Ham fiş satırını ekstre hesabının okuduğu düz kayda çevirir. Maliyet alanını tutara yazmaz. */
export function sourceFromMovementRow(raw: any, index = 0): MaterialExtractSourceLine {
    const mov = raw?.movement && typeof raw.movement === 'object' ? raw.movement : {};
    const movType = String(mov.movement_type || raw?.movement_type || '');
    const trcode = Number(mov.trcode ?? raw?.trcode ?? 0);
    const ficheRaw = String(
        raw?.fiche_type || raw?.ficheType || mov.fiche_type || mov.ficheType || '',
    );
    const classified = resolveExtractSourceMeta({
        movement_type: movType,
        trcode,
        source_type: String(raw?.source_type || raw?.source_kind || mov.source_type || mov.source_kind || ''),
        fiche_type: ficheRaw,
    });
    const productId = String(raw?.product_id || '').trim();
    const productCode = String(raw?.product_code || '').trim();
    const sourceType = String(raw?.source_type || raw?.source_kind || mov.source_type || mov.source_kind || '');
    const matchedByName = raw?.matched_by_name === true || raw?.matchedByName === true;
    const unbound = matchedByName || raw?.stock_linked === false || raw?.stockLinked === false;
    return {
        id: String(raw?.id ?? `row-${index}`),
        quantity: raw?.quantity,
        unit_price: raw?.unit_price,
        gross_amount: pickPositive(raw?.extract_gross_amount, raw?.gross_amount) ?? undefined,
        discount_amount: readDiscount(raw?.extract_discount_amount ?? raw?.discount_amount),
        net_amount: pickPositive(raw?.extract_net_amount, raw?.net_amount) ?? undefined,
        movement_type: movType,
        fiche_type: classified.fiche_type || ficheRaw,
        trcode,
        product_id: productId,
        product_code: productCode,
        source_type: sourceType,
        matchedByName,
        stockLinked: unbound ? false : undefined,
        document_no: String(mov.document_no || raw?.document_no || ''),
        movement_date: String(mov.movement_date || raw?.movement_date || raw?.created_at || ''),
    };
}

function isSlipSource(sourceType: string | null | undefined): boolean {
    const source = String(sourceType || '').trim().toLocaleLowerCase('tr-TR');
    return source === 'slip' || source === 'warehouse' || source === 'ambar';
}

/**
 * Kart stoğu ve sağ tık hareketleri ürün kimliği (id / kod / barkod) veya ambar fişi ister.
 * Adı tutan ama kimliği olmayan satır, ya da kimliği sonradan yapıştırılmış ad eşlemesi, dışarıda kalır.
 */
export function isBoundStockExtractLine(line: MaterialExtractSourceLine): boolean {
    if (line.matchedByName) return false;
    if (line.stockLinked === false) return false;
    if (isSlipSource(line.source_type)) return true;
    const productId = String(line.product_id || '').trim();
    const productCode = String(line.product_code || '').trim();
    return Boolean(productId || productCode);
}

/**
 * Stok kümesi: kimliksiz ve ad eşlemesi satırları düşer.
 * Aynı satır kimliği ikinci kez gelirse kopyadır, tutulmaz.
 */
export function prepareMaterialExtractLines(lines: MaterialExtractSourceLine[]): MaterialExtractSourceLine[] {
    const seen = new Set<string>();
    const kept: MaterialExtractSourceLine[] = [];
    for (const line of lines) {
        if (!isBoundStockExtractLine(line)) continue;
        const id = String(line.id || '').trim();
        if (id) {
            if (seen.has(id)) continue;
            seen.add(id);
        }
        kept.push(line);
    }
    return kept;
}

export function prepareMaterialExtractMovements<T>(
    rows: T[],
): Array<{ row: T; line: MaterialExtractSourceLine }> {
    const prepared = rows.map((row, index) => ({
        row,
        line: sourceFromMovementRow(row, index),
    }));
    const kept = new Set(prepareMaterialExtractLines(prepared.map((item) => item.line)));
    return prepared.filter((item) => kept.has(item.line));
}

/** Dip toplam: giriş miktar eksi çıkış miktar. Ara bakiyelerin toplamı değil. */
export function extractRunningFooter(
    rows: Array<{ inQty?: number | null; outQty?: number | null }>,
): number {
    return rows.reduce((acc, row) => acc + (Number(row.inQty) || 0) - (Number(row.outQty) || 0), 0);
}

/**
 * Hazırlanmış kaynak satırlarını ekstre satırına çevirir.
 * Kalan, ürün bazında önceki kalan artı işaretli miktardır.
 * Çıkış miktarı kendi kolonunda artı kalır; bakiye bir kez eksi yürür.
 */
export function projectMaterialExtractLines(
    lines: MaterialExtractSourceLine[],
    options?: { balanceKey?: (line: MaterialExtractSourceLine, index: number) => string },
): ProjectedExtractLine[] {
    const seen = new Map<string, number>();
    const balances = new Map<string, number>();
    return lines.map((line, index) => {
        const quantity = Math.abs(Number(line.quantity) || 0);
        const unitPrice = Number(line.unit_price) || 0;
        const side = extractMovementSide(line);
        const amount = extractLineNetAmount({ ...line, quantity });
        const productKey = options?.balanceKey
            ? options.balanceKey(line, index)
            : (String(line.product_id || line.product_code || '_').trim() || '_');
        const runningBalance = (balances.get(productKey) || 0) + signedExtractQty(side, quantity);
        balances.set(productKey, runningBalance);
        const baseId = String(line.id || '').trim() || `extract-${index}`;
        const seenCount = seen.get(baseId) ?? 0;
        seen.set(baseId, seenCount + 1);
        const id = seenCount === 0 ? baseId : `${baseId}~${seenCount}`;
        const inbound = side === 'in';
        const outbound = side === 'out';
        return {
            id,
            side,
            quantity,
            unitPrice,
            amount,
            inQty: inbound ? quantity : 0,
            inAmt: inbound ? amount : 0,
            outQty: outbound ? quantity : 0,
            outAmt: outbound ? amount : 0,
            runningBalance,
        };
    });
}

export function sumMaterialExtract(rows: ProjectedExtractLine[]): MaterialExtractTotals {
    const totals = rows.reduce(
        (acc, row) => {
            acc.inQty += row.inQty;
            acc.inAmt += row.inAmt;
            acc.outQty += row.outQty;
            acc.outAmt += row.outAmt;
            return acc;
        },
        { inQty: 0, inAmt: 0, outQty: 0, outAmt: 0, closingBalance: 0 },
    );
    totals.closingBalance = totals.inQty - totals.outQty;
    return totals;
}
