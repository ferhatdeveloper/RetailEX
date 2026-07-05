import type { Product, ProductVariant } from '../../../core/types';
import type { LabelPrintVariant } from './ProductLabelPrint';
import type { QuickRetailLabelInput } from './quickRetailProductLabelTemplate';
import { resolveLabelBarcodeValue } from './labelBarcodeValue';

export interface BulkLabelQueueItem {
  queueKey: string;
  productName: string;
  category?: string;
  brand?: string;
  unit?: string;
  /** Ürün `special_code_2` — etiket satırı */
  specialCode2?: string;
  variant: LabelPrintVariant;
  quantity: number;
}

/** Ürün kartını etiket yazdırma satırlarına dönüştürür (varyantlıysa her varyant ayrı satır). */
export function productToLabelPrintVariants(p: Product): LabelPrintVariant[] {
  if (p.variants && p.variants.length > 0) {
    return p.variants.map((v: ProductVariant) => ({
      id: v.id,
      variantCode: (v.code || v.barcode || p.code || p.id || '').toString().trim(),
      barcode: resolveLabelBarcodeValue(v.barcode, p.barcode, v.code, p.code, p.sku),
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
      barcode: resolveLabelBarcodeValue(p.barcode, p.code, p.sku),
      attributes: {},
      salePrice: p.price,
      enabled: true,
      stock: p.stock,
      cost: p.cost,
      unit: (p.unit || 'Adet').toString().trim() || 'Adet',
    },
  ];
}

export function bulkQueueItemToQuickRetailLabelInput(row: BulkLabelQueueItem): QuickRetailLabelInput {
  return {
    name: row.productName,
    code: row.variant.variantCode,
    barcode: resolveLabelBarcodeValue(row.variant.barcode, row.variant.variantCode),
    price: row.variant.salePrice,
    stock: row.variant.stock,
    brand: row.brand,
    category: row.category,
    unit: row.unit,
    specialCode2: row.specialCode2,
  };
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
        specialCode2: (p.specialCode2 || '').trim() || undefined,
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
