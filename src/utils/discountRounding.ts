/**
 * POS indirim tutarları — 250’lik kademelere yukarı yuvarlanır (250, 500, 750, 1000, …).
 * 250’den küçük ham tutarlar aşırı şişmemesi için yalnızca tam sayıya yuvarlanır.
 */
export const POS_DISCOUNT_MONETARY_STEP = 250;

export function roundPosDiscountAmountUp(raw: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = POS_DISCOUNT_MONETARY_STEP;
  if (n < step) return Math.round(n);
  return Math.ceil(n / step) * step;
}

/** Yüzde indirimden düşülecek tutar (tavana kadar, brütü aşmaz). */
export function lineDiscountMoneyFromPercent(gross: number, discountPercent: number): number {
  if (gross <= 0 || !discountPercent) return 0;
  const raw = (gross * discountPercent) / 100;
  return Math.min(roundPosDiscountAmountUp(raw), gross);
}

/** Satır net tutarı = brüt − (yuvarlanmış indirim). */
export function lineNetAfterPercentDiscount(gross: number, discountPercent: number): number {
  return Math.max(0, gross - lineDiscountMoneyFromPercent(gross, discountPercent));
}
