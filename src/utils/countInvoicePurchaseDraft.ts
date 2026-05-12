import type { Invoice } from '../core/types';

/** Logo: alış grubunda sayım fazlası fişi (stok zaten sayımla güncellenmiş olabilir). */
export const SAYIM_FAZLASI_ALIS_TRCODES: ReadonlySet<number> = new Set([26]);

export function isSayimFazlasiAlisInvoice(inv: {
  invoice_type?: number;
  trcode?: number;
}): boolean {
  const tc = Number(inv.invoice_type ?? inv.trcode ?? 0);
  return SAYIM_FAZLASI_ALIS_TRCODES.has(tc);
}

function mergeKeyForItem(item: {
  productId?: string;
  code?: string;
}): string {
  const pid = item.productId != null ? String(item.productId).trim() : '';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pid)) {
    return `uuid:${pid.toLowerCase()}`;
  }
  const code = String(item.code || '').trim();
  if (code) return `code:${code}`;
  return `anon:${Math.random().toString(36).slice(2)}`;
}

function lineBaseQty(item: {
  baseQuantity?: number;
  quantity?: number;
  multiplier?: number;
}): number {
  const m = Number(item.multiplier) > 0 ? Number(item.multiplier) : 1;
  if (item.baseQuantity != null && Number.isFinite(Number(item.baseQuantity))) {
    return Number(item.baseQuantity);
  }
  return (Number(item.quantity) || 0) * m;
}

/**
 * Bir veya birden fazla sayım fazlası (trcode 26) alış faturasından,
 * UniversalInvoiceForm için tek taslak (birleştirilmiş satırlar).
 */
export function buildPurchaseEditDataFromSayimInvoices(
  fullInvoices: Invoice[],
  tm: (key: string) => string
): Record<string, unknown> | null {
  const bad = fullInvoices.filter((inv) => !isSayimFazlasiAlisInvoice(inv));
  if (bad.length) return null;

  type Acc = {
    description: string;
    unit: string;
    qty: number;
    priceSum: number;
    code: string;
    productId: string;
  };
  const map = new Map<string, Acc>();

  for (const inv of fullInvoices) {
    const items = inv.items || [];
    for (const raw of items as any[]) {
      const unitPrice = Number(raw.unitPrice ?? raw.price ?? 0) || 0;
      const baseQty = lineBaseQty(raw);
      if (baseQty <= 0.0000001) continue;
      const key = mergeKeyForItem({
        productId: raw.productId,
        code: raw.code,
      });
      const desc = String(raw.description || raw.productName || '').trim();
      const unit = String(raw.unit || 'Adet').trim() || 'Adet';
      const code = String(raw.code || '').trim();
      const productId =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(raw.productId || ''))
          ? String(raw.productId)
          : code;

      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          description: desc,
          unit,
          qty: baseQty,
          priceSum: unitPrice * baseQty,
          code,
          productId,
        });
      } else {
        prev.qty += baseQty;
        prev.priceSum += unitPrice * baseQty;
        if (desc && (!prev.description || desc.length > prev.description.length)) {
          prev.description = desc;
        }
      }
    }
  }

  const formItems: Array<Record<string, unknown>> = [];
  for (const acc of map.values()) {
    if (acc.qty <= 0.0000001) continue;
    const unitPrice = acc.qty > 0 ? acc.priceSum / acc.qty : 0;
    formItems.push({
      type: 'Malzeme',
      productId: acc.productId,
      code: acc.code,
      description: acc.description,
      quantity: acc.qty,
      unit: acc.unit,
      unitPrice,
      discountPercent: 0,
    });
  }

  if (!formItems.length) return null;

  const nos = fullInvoices
    .map((i) => String(i.invoice_no || (i as any).fiche_no || '').trim())
    .filter(Boolean);
  const labelExtra = nos.length ? nos.join(', ') : String(fullInvoices.length);
  const supplierLabel = `${tm('countPurchaseSupplierName')} (${labelExtra})`;
  const today = new Date().toISOString().slice(0, 10);
  const ids = fullInvoices.map((i) => String(i.id || '').trim()).filter(Boolean);

  return {
    invoice_date: today,
    invoice_category: 'Alis',
    supplier_name: supplierLabel,
    supplier_code: '',
    supplier_id: '',
    customer_name: supplierLabel,
    notes: `${tm('invoiceBulkPurchaseFromSayimNotesPrefix')} ${labelExtra}${ids.length ? ` [${ids.join(', ')}]` : ''}`,
    items: formItems,
  };
}
