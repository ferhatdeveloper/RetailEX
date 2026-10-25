/**
 * Malzeme kartı stok seviyeleri (minimum, maksimum, güvenli).
 * Miktar ve maliyet değişmez; yalnız kayıt doğrulaması ve kritik stok raporudur.
 */

export type CriticalStockLevelStatus = 'ok' | 'below_min' | 'below_safe' | 'above_max';

export type ProductStockLevelInput = {
  minStock: unknown;
  maxStock: unknown;
  safeStock: unknown;
};

export type ProductStockLevelColumns = {
  min_stock: number;
  max_stock: number;
  safe_stock: number;
};

export type ProductStockLevelCheck =
  | { ok: true; minStock: number; maxStock: number; safeStock: number; columns: ProductStockLevelColumns }
  | { ok: false; message: string };

export function readStockLevel(value: unknown): number {
  if (value === '' || value == null) return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Boş ve sıfır serbest. Negatif yok. Maksimum, doluysa minimumdan küçük olamaz. */
export function validateProductStockLevels(input: ProductStockLevelInput): ProductStockLevelCheck {
  const minStock = readStockLevel(input.minStock);
  const maxStock = readStockLevel(input.maxStock);
  const safeStock = readStockLevel(input.safeStock);
  if (![minStock, maxStock, safeStock].every((n) => Number.isFinite(n))) {
    return { ok: false, message: 'Stok seviyesi sayı olmalıdır.' };
  }
  if (minStock < 0 || maxStock < 0 || safeStock < 0) {
    return { ok: false, message: 'Stok seviyesi negatif olamaz.' };
  }
  if (maxStock > 0 && maxStock < minStock) {
    return { ok: false, message: 'Maksimum stok, minimum stoktan küçük olamaz.' };
  }
  return {
    ok: true,
    minStock,
    maxStock,
    safeStock,
    columns: {
      min_stock: minStock,
      max_stock: maxStock,
      safe_stock: safeStock,
    },
  };
}

function positiveLevel(value: unknown): number {
  const n = readStockLevel(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/**
 * Eşik boş veya 0 ise devreye girmez.
 * Minimum veya güvenli (güvenli boşsa eski kritik seviye) ve altı kritiktir.
 * Maksimumun üstü ayrı seviyedir. Stok miktarını değiştirmez.
 */
export function classifyCriticalStockLevel(input: {
  stock: unknown;
  minStock?: unknown;
  maxStock?: unknown;
  safeStock?: unknown;
  criticalStock?: unknown;
}): CriticalStockLevelStatus {
  const stockRaw = readStockLevel(input.stock);
  const stock = Number.isFinite(stockRaw) ? stockRaw : 0;
  const minStock = positiveLevel(input.minStock);
  const maxStock = positiveLevel(input.maxStock);
  const safeRaw = positiveLevel(input.safeStock);
  const legacyCritical = positiveLevel(input.criticalStock);
  const safeStock = safeRaw > 0 ? safeRaw : legacyCritical;

  if (minStock > 0 && stock <= minStock) return 'below_min';
  if (safeStock > 0 && stock <= safeStock) return 'below_safe';
  if (maxStock > 0 && stock > maxStock) return 'above_max';
  return 'ok';
}

export function isCriticalStockReportRow(input: {
  stock: unknown;
  minStock?: unknown;
  maxStock?: unknown;
  safeStock?: unknown;
  criticalStock?: unknown;
}): boolean {
  return classifyCriticalStockLevel(input) !== 'ok';
}
