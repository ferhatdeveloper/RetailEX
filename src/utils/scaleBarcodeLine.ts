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
  let pricePerKg = Number(product.price) || 0;
  const isAutoCalc =
    (product as Product & { autoCalculateUSD?: boolean }).autoCalculateUSD ||
    (product as Product & { auto_calculate_usd?: boolean }).auto_calculate_usd;
  const saleUsd = Number(
    (product as Product & { salePriceUSD?: number }).salePriceUSD ??
      (product as Product & { sale_price_usd?: number }).sale_price_usd ??
      0,
  );
  if (isAutoCalc && saleUsd > 0) {
    let rate =
      Number(
        (product as Product & { customExchangeRate?: number }).customExchangeRate ??
          (product as Product & { custom_exchange_rate?: number }).custom_exchange_rate ??
          0,
      ) || exchangeRate;
    if (rate > 0 && rate < 10) rate *= 1000;
    if (rate > 0) pricePerKg = saleUsd * rate;
  } else {
    const priceList1 = Number((product as Product & { priceList1?: number }).priceList1 ?? 0);
    if (priceList1 > 0) pricePerKg = priceList1;
  }
  return pricePerKg;
}

/** Birim fiyat × miktar = satır tutarı; satır toplamı 250 IQD kademesine yuvarlanır. */
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
      const unitPrice =
        quantity > 0 ? roundPosMoneyAmount(lineTotal / quantity, currency) : lineTotal;
      return { quantity, unitName: 'GR', unitPrice, lineTotal };
    }
    const quantity =
      pricePerKg > 0 ? Math.round((lineTotal / pricePerKg) * 1000) / 1000 : 1;
    const unitPrice =
      quantity > 0 ? roundPosMoneyAmount(lineTotal / quantity, currency) : lineTotal;
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
  const unitPrice =
    quantity > 0 ? roundPosMoneyAmount(lineTotal / quantity, currency) : unitPriceBase;

  return { quantity, unitName, unitPrice, lineTotal };
}
