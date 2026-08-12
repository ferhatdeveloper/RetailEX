import type { Invoice } from '../core/types/models';
import { normalizeWeightProductQuantity, mergeScaleCartQuantity } from './scaleQuantity';

/** Logo / ERP: sayım fazlası alış faturası */
const SAYIM_FAZLASI_TRCODE = 26;

/**
 * Liste satırı: yalnızca sayım fazlası (trcode 26) alış faturaları toplu taslağa alınabilir.
 */
export function isSayimFazlasiAlisInvoice(inv: {
    invoice_category?: string;
    invoice_type?: number;
    trcode?: number;
}): boolean {
    const tc = Number(inv.invoice_type ?? inv.trcode ?? 0);
    if (tc !== SAYIM_FAZLASI_TRCODE) return false;
    const cat = inv.invoice_category;
    if (cat && cat !== 'Alis') return false;
    return true;
}

type DraftLine = {
    type: string;
    productId: string;
    code: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    discountPercent: number;
};

function rawLineToDraft(item: Record<string, unknown>): DraftLine | null {
    const unit = (String(item.unit ?? 'Adet').trim() || 'Adet');
    const qty = normalizeWeightProductQuantity(parseFloat(String(item.quantity ?? item.qty ?? 0)) || 0, unit);
    if (qty <= 0.000001) return null;
    const pidRaw = item.product_id ?? item.productId;
    const productId = pidRaw != null && String(pidRaw).trim() !== '' ? String(pidRaw).trim() : '';
    const code = String(item.item_code ?? item.code ?? item.product_code ?? '').trim();
    if (!productId && !code) return null;
    const unitPrice =
        parseFloat(
            String(
                item.unit_price ??
                    item.price ??
                    item.unitPrice ??
                    item.unit_cost ??
                    item.cost ??
                    0
            )
        ) || 0;
    const description = String(
        item.item_name ?? item.description ?? item.product_name ?? item.productName ?? ''
    ).trim();
    const discountPercent = parseFloat(String(item.discount_rate ?? item.discountPercent ?? 0)) || 0;
    return {
        type: 'Malzeme',
        productId: productId || code,
        code: code || productId,
        description,
        quantity: qty,
        unit,
        unitPrice,
        discountPercent,
    };
}

function mergeKey(row: DraftLine): string {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (row.productId && uuid.test(row.productId)) return `id:${row.productId}`;
    const c = (row.code || '').trim();
    if (c) return `code:${c.toLowerCase()}`;
    return `id:${row.productId}`;
}

/**
 * Birden çok sayım fazlası (26) faturasının satırlarını tek alış faturası editData taslağında birleştirir.
 * Aynı ürün (UUID veya kod) satırları toplanır; birim fiyat miktar ağırlıklı ortalama alınır.
 */
export function buildPurchaseEditDataFromSayimInvoices(
    invoices: Invoice[],
    tm: (key: string) => string
): Record<string, unknown> | null {
    if (!invoices.length) return null;
    const map = new Map<string, DraftLine>();

    for (const inv of invoices) {
        const rows = Array.isArray(inv.items) ? inv.items : [];
        for (const raw of rows) {
            const line = rawLineToDraft(raw as Record<string, unknown>);
            if (!line) continue;
            const k = mergeKey(line);
            const prev = map.get(k);
            if (!prev) {
                map.set(k, { ...line });
                continue;
            }
            const q1 = prev.quantity;
            const q2 = line.quantity;
            const sumQ = mergeScaleCartQuantity(q1, q2, prev.unit || line.unit);
            const w =
                sumQ > 0.000001 ? (q1 * prev.unitPrice + q2 * line.unitPrice) / sumQ : prev.unitPrice;
            map.set(k, {
                ...prev,
                quantity: sumQ,
                unitPrice: Number.isFinite(w) ? w : prev.unitPrice,
                description: prev.description || line.description,
                code: (prev.code && prev.code.trim()) || line.code,
                productId: prev.productId || line.productId,
            });
        }
    }

    const items = [...map.values()].map((row) => ({
        type: row.type,
        productId: row.productId,
        code: row.code,
        description: row.description,
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: row.unitPrice,
        discountPercent: row.discountPercent,
    }));
    if (!items.length) return null;

    const today = new Date().toISOString().slice(0, 10);
    const nos = invoices
        .map((i) => i.invoice_no)
        .filter((n) => n != null && String(n).trim() !== '')
        .join(', ');
    const supplierLabel = `${tm('invoiceTypeCountSurplus')} (${invoices.length})`;
    return {
        invoice_date: today,
        invoice_category: 'Alis',
        supplier_name: supplierLabel,
        supplier_code: '',
        supplier_id: '',
        customer_name: supplierLabel,
        notes: `${tm('invoiceBulkPurchaseFromSayimNotesPrefix')} ${nos}`,
        items,
    };
}
