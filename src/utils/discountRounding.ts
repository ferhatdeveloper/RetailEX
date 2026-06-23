/**
 * POS para tutarları — IQD: 250’lik kademe (…000, …250, …500, …750).
 * İndirimler yukarı; satış satırı ve toplamlar en yakın 250.
 */
import { roundMoneyAmount } from './currency';

export const POS_DISCOUNT_MONETARY_STEP = 250;

export function roundPosMoneyAmount(value: number, currency: string = 'IQD'): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const code = String(currency ?? 'IQD').trim().toUpperCase();
  if (code !== 'IQD') return roundMoneyAmount(n, code);
  if (n === 0) return 0;
  const step = POS_DISCOUNT_MONETARY_STEP;
  return Math.round(n / step) * step;
}

/** IQD POS ödeme toleransı (yarım kademe). */
export function posMoneyEpsilon(currency: string = 'IQD'): number {
  const code = String(currency ?? 'IQD').trim().toUpperCase();
  if (code === 'IQD') return POS_DISCOUNT_MONETARY_STEP / 2;
  return 0.005;
}

export function roundPosDiscountAmountUp(raw: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = POS_DISCOUNT_MONETARY_STEP;
  return Math.ceil(n / step) * step;
}

/** Yüzde indirimden düşülecek tutar (tavana kadar, brütü aşmaz). */
export function lineDiscountMoneyFromPercent(gross: number, discountPercent: number): number {
  if (gross <= 0 || !discountPercent) return 0;
  const raw = (gross * discountPercent) / 100;
  return Math.min(roundPosDiscountAmountUp(raw), gross);
}

/** Satır net tutarı = yuvarlanmış brüt − (yuvarlanmış indirim). */
export function lineNetAfterPercentDiscount(
  gross: number,
  discountPercent: number,
  currency: string = 'IQD',
): number {
  const roundedGross = roundPosMoneyAmount(gross, currency);
  const net = roundedGross - lineDiscountMoneyFromPercent(roundedGross, discountPercent);
  return Math.max(0, roundPosMoneyAmount(net, currency));
}
