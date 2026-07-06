/**
 * POS para tutarları — IQD: 250’lik kademe (…000, …250, …500, …750).
 * İndirimler yukarı; satış satırı ve toplamlar en yakın 250.
 */
import { roundMoneyAmount } from './currency';

export const POS_DISCOUNT_MONETARY_STEP = 250;

export function isIqdPosCurrency(currency?: string | null): boolean {
  return String(currency ?? 'IQD').trim().toUpperCase() === 'IQD';
}

/** Ödeme ekranı — tutar modu hızlı seçim (IQD binlik / USD-EUR ondalıklı). */
export function getPosQuickDiscountAmountPresets(currency?: string | null): number[] {
  const code = String(currency ?? 'IQD').trim().toUpperCase();
  if (code === 'USD' || code === 'EUR' || code === 'GBP') {
    return [1, 5, 10, 20, 50, 100];
  }
  return [1000, 5000, 10000];
}

/** Kampanya / satır indirimi tutarını para birimine göre yuvarlar. */
export function roundPosCampaignDiscount(raw: number, currency: string = 'IQD'): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (isIqdPosCurrency(currency)) return roundPosDiscountAmountUp(n);
  return roundMoneyAmount(n, currency);
}

export function roundPosMoneyAmount(value: number, currency: string = 'IQD'): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const code = String(currency ?? 'IQD').trim().toUpperCase();
  if (code !== 'IQD') return roundMoneyAmount(n, code);
  if (n === 0) return 0;
  const step = POS_DISCOUNT_MONETARY_STEP;
  const rounded = Math.round(n / step) * step;
  // Ara birim fiyatlar (örn. 1 IQD/gr) — satır toplamı ayrı yuvarlanır
  if (rounded === 0 && n > 0) return Math.round(n);
  return rounded;
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
export function lineDiscountMoneyFromPercent(
  gross: number,
  discountPercent: number,
  currency: string = 'IQD',
): number {
  if (gross <= 0 || !discountPercent) return 0;
  const raw = (gross * discountPercent) / 100;
  const code = String(currency ?? 'IQD').trim().toUpperCase();
  const discount = isIqdPosCurrency(code)
    ? roundPosDiscountAmountUp(raw)
    : roundMoneyAmount(raw, code);
  return Math.min(discount, gross);
}

/**
 * Ödeme ekranı ilave indirim.
 * - Yüzde: gerçek oran (USD/EUR ondalık; IQD tam sayı) — 250 yukarı yuvarlama uygulanmaz.
 * - Tutar (IQD): 250’lik kademeye yukarı; diğer para birimleri standart yuvarlama.
 */
export function posPaymentAdditionalDiscount(
  gross: number,
  discountValue: number,
  mode: 'percentage' | 'amount',
  currency: string = 'IQD',
): number {
  if (!Number.isFinite(gross) || gross <= 0) return 0;
  if (!Number.isFinite(discountValue) || discountValue <= 0) return 0;

  const code = String(currency ?? 'IQD').trim().toUpperCase();
  let discount = 0;

  if (mode === 'percentage') {
    const raw = (gross * discountValue) / 100;
    discount = roundMoneyAmount(raw, code);
  } else if (code === 'IQD') {
    discount = roundPosDiscountAmountUp(discountValue);
  } else {
    discount = roundMoneyAmount(discountValue, code);
  }

  return Math.min(Math.max(0, discount), gross);
}

/** Satır net tutarı = yuvarlanmış brüt − (yuvarlanmış indirim). */
export function lineNetAfterPercentDiscount(
  gross: number,
  discountPercent: number,
  currency: string = 'IQD',
): number {
  const roundedGross = roundPosMoneyAmount(gross, currency);
  const net = roundedGross - lineDiscountMoneyFromPercent(roundedGross, discountPercent, currency);
  return Math.max(0, roundPosMoneyAmount(net, currency));
}
