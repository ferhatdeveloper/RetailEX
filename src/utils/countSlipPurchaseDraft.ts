import type { CountingLine, CountingSlip } from '../services/wmsStockCount';

/** InvoiceListModule tarafından bir kez okunup silinir. */
export const PREFILL_PURCHASE_FROM_COUNT_STORAGE_KEY = 'retailex_purchase_invoice_from_count_v1';

export type ProductPriceRow = { purchase: number; sale: number; code?: string };

/** Sayılan miktar (baz birim): base_counted_qty varsa o; yoksa counted × çarpan. */
function countedBaseQty(line: CountingLine): number {
    const q = Number(line.counted_qty);
    const m = Number(line.unit_multiplier) > 0 ? Number(line.unit_multiplier) : 1;
    const fromCounted = (Number.isFinite(q) ? q : 0) * m;

    const rawBase = line.base_counted_qty;
    if (rawBase != null && rawBase !== '' && Number.isFinite(Number(rawBase))) {
        const b = Number(rawBase);
        // Baz alan bazen 0 kalıp sayılan adet dolu olabiliyor; fazla tespiti için counted×çarpan kullan.
        if (Math.abs(b) < 1e-9 && Math.abs(fromCounted) > 1e-9) return fromCounted;
        return b;
    }
    return fromCounted;
}

/**
 * Pozitif fark (fazla) = baz sayılan − beklenen.
 * DB'deki `variance` alanına güvenilmez (PostgREST yamasında counted−expected hatası olabiliyor).
 */
function signedVariance(line: CountingLine): number {
    const exp = Number(line.expected_qty) || 0;
    return countedBaseQty(line) - exp;
}

/** Fatura taslağında en az bir fazla (pozitif fark) satırı var mı — ürünü olmayan satırlar sayılmaz. */
export function countSlipHasSurplusForPurchase(lines: CountingLine[]): boolean {
    for (const l of lines) {
        if (!l.product_id) continue;
        if (signedVariance(l) > 0.000001) return true;
    }
    return false;
}

/**
 * Sayım fişi satırlarından yalnızca fazla (pozitif fark) kalemleriyle
 * UniversalInvoiceForm editData taslağı üretir.
 */
export function buildPurchaseEditDataFromCountSlip(
    slip: CountingSlip,
    lines: CountingLine[],
    priceMap: Record<string, ProductPriceRow>
): Record<string, unknown> | null {
    const items: Array<Record<string, unknown>> = [];
    for (const l of lines) {
        if (!l.product_id) continue;
        const delta = signedVariance(l);
        if (delta <= 0.000001) continue;
        const pid = String(l.product_id);
        const pr = priceMap[pid];
        const unitPrice = Number(l.purchase_price) || pr?.purchase || 0;
        const code = (pr?.code && String(pr.code).trim()) || (l.barcode && String(l.barcode).trim()) || '';
        items.push({
            type: 'Malzeme',
            productId: pid,
            code,
            description: l.product_name || '',
            quantity: delta,
            unit: (l.unit && String(l.unit).trim()) || 'Adet',
            unitPrice,
            discountPercent: 0,
        });
    }
    if (!items.length) return null;

    const supplierLabel = `Sayım ${slip.fiche_no}`;
    const today = new Date().toISOString().slice(0, 10);
    return {
        invoice_date: today,
        invoice_category: 'Alis',
        supplier_name: supplierLabel,
        supplier_code: '',
        supplier_id: '',
        customer_name: supplierLabel,
        notes: `Sayım fişi: ${slip.fiche_no} (${slip.id})`,
        items,
    };
}
