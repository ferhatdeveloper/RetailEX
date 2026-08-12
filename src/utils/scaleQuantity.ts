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

/** Fatura satırı: miktar + stok birimi (baseQuantity) — alış 1,610 = stok 1,610 kg */
export function syncWeightLineQuantities(
  quantity: number,
  unit?: string | null,
  multiplier = 1,
): { quantity: number; baseQuantity: number } {
  const q = normalizeWeightProductQuantity(quantity, unit);
  const mult = Number(multiplier) || 1;
  return {
    quantity: q,
    baseQuantity: normalizeWeightProductQuantity(q * mult, unit),
  };
}

/** DB / Excel yükleme: baseQuantity ve quantity tutarlı hale getirilir */
export function hydrateWeightLineFromDb(item: {
  quantity?: number;
  baseQuantity?: number;
  base_quantity?: number;
  unit?: string | null;
  multiplier?: number;
}): { quantity: number; baseQuantity: number } {
  const unit = item.unit;
  const mult = Number(item.multiplier || 1) || 1;
  const rawBase = Number(item.baseQuantity ?? item.base_quantity ?? (Number(item.quantity || 0) * mult));
  const baseQuantity = normalizeWeightProductQuantity(rawBase, unit);
  const quantity = normalizeWeightProductQuantity(
    mult !== 0 ? baseQuantity / mult : baseQuantity,
    unit,
  );
  return { quantity, baseQuantity };
}

/** Sepette aynı tartılı ürün birleştirme — 1,610 + 1,610 = 3,220 kg */
export function mergeScaleCartQuantity(
  existingQty: number,
  addQty: number,
  unit?: string | null,
): number {
  return normalizeWeightProductQuantity(Number(existingQty) + Number(addQty), unit);
}

/** Fatura satırı miktar gösterimi — KG: 2,500 | adet: tam sayı */
export function formatInvoiceLineQuantityDisplay(qty: number, unit?: string | null): string {
  if (!Number.isFinite(qty) || qty === 0) return '';
  if (isWeightBasedUnit(unit)) return formatScaleQuantityDisplay(qty, unit);
  return qty.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
}

/** POS / fatura stok miktarı (baseQuantity öncelikli) */
export function resolveStockQuantityFromLine(item: {
  quantity?: number;
  baseQuantity?: number;
  unit?: string | null;
  multiplier?: number;
}): number {
  const mult = Number(item.multiplier || 1) || 1;
  const raw = Number(item.baseQuantity ?? (Number(item.quantity || 0) * mult));
  return normalizeWeightProductQuantity(raw, item.unit);
}
