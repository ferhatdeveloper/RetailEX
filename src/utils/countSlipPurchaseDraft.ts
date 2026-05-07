import type { CountingLine, CountingSlip } from '../services/wmsStockCount';

/** InvoiceListModule tarafından bir kez okunup silinir. */
export const PREFILL_PURCHASE_FROM_COUNT_STORAGE_KEY = 'retailex_purchase_invoice_from_count_v1';

export type ProductPriceRow = { purchase: number; sale: number; code?: string };

/** Pozitif fark (fazla) miktarı; variance yoksa sayılan − beklenen. */
function signedVariance(line: CountingLine): number {
    const exp = Number(line.expected_qty) || 0;
    const cnt = Number(line.base_counted_qty ?? line.counted_qty ?? 0) || 0;
    const v = line.variance;
    if (v !== undefined && v !== null && Number.isFinite(Number(v))) {
        return Number(v);
    }
    return cnt - exp;
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
