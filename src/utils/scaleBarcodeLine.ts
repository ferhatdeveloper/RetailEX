/**
 * Tartılı satış satır tutarı — barkod/etiket ile POS sepeti aynı IQD tutarı.
 */
import type { Product } from '../core/types';
import { isGramScaleUnit, scaleWeightFieldToQuantity, type ParsedBarcode } from './barcodeParser';
import { roundMoneyAmount } from './currency';
import { roundPosMoneyAmount } from './discountRounding';
import { normalizeWeightProductQuantity } from './scaleQuantity';

export interface ScaleCartLineAmounts {
  quantity: number;
  unitName: string;
  unitPrice: number;
  lineTotal: number;
}

function resolvePricePerKg(product: Product, exchangeRate: number): number {
  const priceLists: number[] = [];
  for (let i = 1; i <= 6; i++) {
    const key = `priceList${i}` as keyof Product;
    priceLists.push(Number((product as Record<string, unknown>)[key as string] ?? 0));
  }
  for (const v of priceLists) {
    if (v > 0) return v;
  }

  const isAutoCalc =
    (product as Product & { autoCalculateUSD?: boolean }).autoCalculateUSD ||
    (product as Product & { auto_calculate_usd?: boolean }).auto_calculate_usd;
  const saleUsd = Number(
    (product as Product & { salePriceUSD?: number }).salePriceUSD ??
      (product as Product & { sale_price_usd?: number }).sale_price_usd ??
      0,
  );

  let customRate =
    Number(
      (product as Product & { customExchangeRate?: number }).customExchangeRate ??
        (product as Product & { custom_exchange_rate?: number }).custom_exchange_rate ??
        0,
    ) || exchangeRate;
  if (customRate > 0 && customRate < 10) customRate *= 1000;

  if (isAutoCalc && saleUsd > 0 && customRate > 0) {
    return saleUsd * customRate;
  }

  return Number(product.price) || 0;
}

/**
 * Birim fiyat × miktar = satır tutarı.
 * Satır toplamı IQD 250 kademesine yuvarlanır; **ürün kartındaki birim fiyat**
 * (kg başına) **yuvarlanmadan** döner — etiket ve POS kart fiyatı aynı görünür.
 */
export function buildScaleCartLineAmounts(
  product: Product,
  parsed: ParsedBarcode,
  exchangeRate: number,
): ScaleCartLineAmounts | null {
  if (!parsed.isWeightBased || parsed.weight == null || !(parsed.weight > 0)) return null;

  const unit = (product.unit || 'KG').toString();
  const unitUpper = unit.toUpperCase().replace(/İ/g, 'I');
  const currency =
    String((product as Product & { currency?: string }).currency ?? 'IQD').trim().toUpperCase() ||
    'IQD';
  const suffixValue = parsed.weight;
  const suffixMode = parsed.code10SuffixMode ?? 'weight_grams';

  if (parsed.format === 'code10_weight' && suffixMode === 'total_iqd') {
    const lineTotal = roundPosMoneyAmount(suffixValue, currency);
    const pricePerKg = roundMoneyAmount(resolvePricePerKg(product, exchangeRate), currency);
    if (isGramScaleUnit(unitUpper)) {
      const pricePerGr = pricePerKg > 0 ? roundMoneyAmount(pricePerKg / 1000, currency) : 0;
      const quantity =
        pricePerGr > 0 ? Math.max(1, Math.round(lineTotal / pricePerGr)) : 1;
      const unitPrice = quantity > 0 ? Math.round((lineTotal / quantity) * 1000) / 1000 : 0;
      return { quantity, unitName: 'GR', unitPrice, lineTotal };
    }
    const quantity =
      pricePerKg > 0 ? Math.round((lineTotal / pricePerKg) * 1000) / 1000 : 1;
    const unitPrice = quantity > 0 ? Math.round((lineTotal / quantity) * 1000) / 1000 : 0;
    return { quantity, unitName: 'KG', unitPrice, lineTotal };
  }

  const { quantity: rawQty, unitName } = scaleWeightFieldToQuantity(
    suffixValue,
    unitUpper,
    parsed.format,
  );
  const quantity = normalizeWeightProductQuantity(rawQty, unitUpper);
  if (!(quantity > 0)) return null;

  const pricePerKg = roundMoneyAmount(resolvePricePerKg(product, exchangeRate), currency);
  const unitPriceBase = isGramScaleUnit(unitUpper)
    ? roundMoneyAmount(pricePerKg / 1000, currency)
    : pricePerKg;
  const lineTotal = roundPosMoneyAmount(unitPriceBase * quantity, currency);

  return { quantity, unitName, unitPrice: unitPriceBase, lineTotal };
}
