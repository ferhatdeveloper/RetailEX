import type { Product } from '../core/types/models';

const MAX_DRAFT_LINES = 400;

function isProductService(p: Product): boolean {
  return p.materialType === 'service' || p.isService === true;
}

/**
 * Malzeme listesinden standart alış faturası taslağı (kayıtta stok artar).
 * Varsayılan miktar satır başına 1 — kartta elle girilmiş stokla çakışmayı önlemek için;
 * kullanıcı formda miktarı güncellemelidir.
 */
export function buildPurchaseEditDataFromProductsForPurchaseWithStock(
  products: Product[],
  opts: { supplierLabel: string; notesIntro: string }
): Record<string, unknown> | null {
  const eligible = products.filter((p) => p?.id && !isProductService(p));
  const capped = eligible.slice(0, MAX_DRAFT_LINES);
  const items: Array<Record<string, unknown>> = [];
  for (const p of capped) {
    const unitPrice = Number(p.cost) || 0;
    const code = String(p.code || '').trim() || String(p.barcode || '').trim();
    items.push({
      type: 'Malzeme',
      productId: p.id,
      code,
      description: String(p.name || '').trim() || code,
      quantity: 1,
      unit: (String(p.unit || 'Adet').trim() || 'Adet'),
      unitPrice,
      discountPercent: 0,
    });
  }
  if (!items.length) return null;

  const today = new Date().toISOString().slice(0, 10);
  const truncated = eligible.length > MAX_DRAFT_LINES;
  const notesExtra = truncated
    ? ` İlk ${MAX_DRAFT_LINES} satır eklendi; toplam uygun ürün: ${eligible.length}.`
    : '';
  return {
    invoice_date: today,
    invoice_category: 'Alis',
    supplier_name: opts.supplierLabel,
    supplier_code: '',
    supplier_id: '',
    customer_name: opts.supplierLabel,
    notes: `${opts.notesIntro} Alış kaydı stoğu artırır; satır başına varsayılan miktar 1 ve birim fiyat maliyet alanından gelir — kayıt öncesi düzenleyin.${notesExtra}`,
    items,
  };
}

export function productNeedPurchaseDraftMaxLines(): number {
  return MAX_DRAFT_LINES;
}
