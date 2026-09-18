import { roundMoneyAmount } from './currency';

/**
 * Ürün / hizmet kartı kâr marjı = alış üzerine **markup %** (satış marjı değil).
 *
 * Örnek: alış 10.000 IQD, marj 150 → satış 25.000
 *   sale = cost * (1 + percent / 100)
 *   10000 * (1 + 150/100) = 10000 * 2.5 = 25000
 *
 * Geri hesap (satış elle girilince):
 *   percent = (sale - cost) / cost * 100
 *
 * Fatura alış satırındaki `profitMarginPercent` ile aynı:
 *   unitPrice * (1 + profitMarginPercent / 100)
 *
 * Maliyet (alış) değişmez. TAX / tevkifat ayrı alanlardır; bu formüle girmez.
 */
export function salePriceFromMarkupPercent(
  cost: number,
  percent: number,
  currency?: string | null,
): number {
  const c = Number(cost);
  const p = Number(percent);
  if (!(c > 0) || !Number.isFinite(p)) return 0;
  return roundMoneyAmount(c * (1 + p / 100), currency);
}

/** Alış ve satıştan markup %; alış ≤ 0 ise 0. */
export function markupPercentFromPrices(cost: number, sale: number): number {
  const c = Number(cost);
  const s = Number(sale);
  if (!(c > 0) || !Number.isFinite(s)) return 0;
  return ((s - c) / c) * 100;
}
