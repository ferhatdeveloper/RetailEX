import type { Product, ProductVariant } from '../../../core/types';
import type { LabelPrintVariant } from './ProductLabelPrint';

export interface BulkLabelQueueItem {
  queueKey: string;
  productName: string;
  category?: string;
  brand?: string;
  unit?: string;
  variant: LabelPrintVariant;
  quantity: number;
}

/** Ürün kartını etiket yazdırma satırlarına dönüştürür (varyantlıysa her varyant ayrı satır). */
export function productToLabelPrintVariants(p: Product): LabelPrintVariant[] {
  if (p.variants && p.variants.length > 0) {
    return p.variants.map((v: ProductVariant) => ({
      id: v.id,
      variantCode: (v.code || v.barcode || p.code || p.id || '').toString().trim(),
      barcode: (v.barcode || p.barcode || '').trim(),
      attributes: {
        ...(v.size ? { Boyut: v.size } : {}),
        ...(v.color ? { Renk: v.color } : {}),
      },
      salePrice: typeof v.price === 'number' ? v.price : p.price,
      enabled: true,
      stock: v.stock,
      cost: v.cost,
      unit: (p.unit || 'Adet').toString().trim() || 'Adet',
    }));
  }
  return [
    {
      id: `${p.id}-base`,
      variantCode: String(p.code || p.sku || p.barcode || p.id || '').trim(),
      barcode: (p.barcode || '').trim(),
      attributes: {},
      salePrice: p.price,
      enabled: true,
      stock: p.stock,
      cost: p.cost,
      unit: (p.unit || 'Adet').toString().trim() || 'Adet',
    },
  ];
}

export function addProductToBulkQueue(prev: BulkLabelQueueItem[], p: Product): BulkLabelQueueItem[] {
  if (p.isService) return prev;
  const vars = productToLabelPrintVariants(p);
  let next = [...prev];
  for (const variant of vars) {
    const queueKey = `${p.id}::${variant.id}`;
    const existing = next.find((r) => r.queueKey === queueKey);
    if (existing) {
      next = next.map((r) =>
        r.queueKey === queueKey ? { ...r, quantity: Math.min(999, r.quantity + 1) } : r
      );
    } else {
      next.push({
        queueKey,
        productName: p.name,
        category: p.category,
        brand: (p.brand || '').trim() || undefined,
        unit: (p.unit || 'Adet').toString().trim() || 'Adet',
        variant,
        quantity: 1,
      });
    }
  }
  return next;
}

export function addProductsToBulkQueue(prev: BulkLabelQueueItem[], products: Product[]): BulkLabelQueueItem[] {
  let next = [...prev];
  for (const p of products) {
    next = addProductToBulkQueue(next, p);
  }
  return next;
}
