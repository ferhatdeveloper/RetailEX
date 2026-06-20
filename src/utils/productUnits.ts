import type { Product } from '../core/types';
import { isScaleProductFlag } from './scaleProductFilter';

const WEIGHT_VOLUME_UNITS = new Set([
  'KG', 'KILO', 'KILOGRAM', 'KİLO', 'KILO',
  'GR', 'G', 'GRAM', 'GRM',
  'LT', 'L', 'LITRE', 'LITER', 'LİTRE',
  'ML', 'CL',
]);

/** Birim kodunu karşılaştırma için normalize eder (Türkçe İ → I). */
export function normalizeProductUnit(unit?: string | null): string {
  return String(unit ?? '')
    .trim()
    .toUpperCase()
    .replace(/İ/g, 'I');
}

/** KG, GR, LT vb. — küsüratlı miktar girişi gerektiren birimler. */
export function isWeightBasedUnit(unit?: string | null): boolean {
  const u = normalizeProductUnit(unit);
  return u.length > 0 && WEIGHT_VOLUME_UNITS.has(u);
}

/** Tartılı ürün veya ağırlık/hacim biriminde küsüratlı miktar kullanılır. */
export function productUsesDecimalQuantity(
  product: Pick<Product, 'unit' | 'isScaleProduct'> | Record<string, unknown>
): boolean {
  const p = product as Product & { is_scale_product?: boolean };
  if (isScaleProductFlag(p)) return true;
  return isWeightBasedUnit(p.unit);
}

/** Sepet / POS gösterimi: 1.25 → "1,25", 1.25 → "1,250" (gerekirse 3 hane). */
export function formatPosQuantityDisplay(qty: number, unit?: string | null): string {
  if (!Number.isFinite(qty)) return '';
  const maxDecimals = isWeightBasedUnit(unit) ? 3 : 0;
  return qty.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

/** Birim etiketi: "KG", "GR" veya boş. */
export function productUnitLabel(unit?: string | null): string {
  const u = normalizeProductUnit(unit);
  if (!u) return '';
  if (u === 'KILOGRAM' || u === 'KILO' || u === 'KİLO') return 'KG';
  if (u === 'GRAM' || u === 'GRM') return 'GR';
  if (u === 'LITRE' || u === 'LITER' || u === 'LİTRE') return 'LT';
  return u;
}
