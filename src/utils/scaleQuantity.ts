import { isGramScaleUnit, normalizeProductUnit, isWeightBasedUnit } from './productUnits';

/** Tartılı / KG-LT-GR stok ve fatura miktarı — alış 1,610 = satış 1610 g */
export const SCALE_QTY_DECIMALS = 3;

export function roundScaleQuantity(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** SCALE_QTY_DECIMALS;
  return Math.round(n * factor) / factor;
}

/**
 * Terazi etiketindeki gram alanı → ürün biriminde miktar.
 * KG: 1610 g → 1,610 kg | GR: 1610 g → 1610 gr
 */
export function scaleGramsToProductQuantity(grams: number, unit?: string | null): number {
  const g = Math.round(Number(grams));
  if (!(g > 0)) return 0;
  if (isGramScaleUnit(unit)) return g;
  return roundScaleQuantity(g / 1000);
}

/** Alış/satış/fatura: ağırlık birimli miktarı 3 ondalığa hizalar (1,610 kg). */
export function normalizeWeightProductQuantity(qty: number, unit?: string | null): number {
  const n = Number(qty);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!isWeightBasedUnit(unit)) return n;
  return roundScaleQuantity(n);
}

/** Stok karşılaştırması: miktarı gram cinsinden (KG → ×1000). */
export function productQuantityToGrams(qty: number, unit?: string | null): number {
  const n = normalizeWeightProductQuantity(qty, unit);
  if (!(n > 0)) return 0;
  if (isGramScaleUnit(unit)) return Math.round(n);
  return Math.round(n * 1000);
}

/** Sepet / fatura gösterimi: KG tartılı satırda 1,610 gibi 3 hane. */
export function formatScaleQuantityDisplay(qty: number, unit?: string | null): string {
  if (!Number.isFinite(qty)) return '';
  const u = normalizeProductUnit(unit);
  const isWeight = isWeightBasedUnit(u);
  return qty.toLocaleString('tr-TR', {
    minimumFractionDigits: isWeight ? SCALE_QTY_DECIMALS : 0,
    maximumFractionDigits: isWeight ? SCALE_QTY_DECIMALS : 0,
  });
}
