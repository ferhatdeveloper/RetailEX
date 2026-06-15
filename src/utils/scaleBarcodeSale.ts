/**
 * Tartılı ürün barkodu → satış satırı (kg × birim fiyat veya gömülü fiyat).
 * Format: 20PPPPWWWWWC (Logo Tiger / XXXX + KGDEGERİ gram)
 */
import type { Product } from '../App';
import { productAPI } from '../services/api/products';
import {
  convertPrice,
  convertWeight,
  getBarcodeFormatInfo,
  parseBarcode,
  type ParsedBarcode,
} from './barcodeParser';
import { isScaleProductFlag } from './scaleProductFilter';

export interface ScaleBarcodeSaleResult {
  product: Product;
  quantity: number;
  unitName: string;
  unitPrice: number;
  parsed: ParsedBarcode;
  formatInfo: string;
}

function pluCodeVariants(code: string): string[] {
  const t = String(code ?? '').trim();
  if (!t) return [];
  const stripped = t.replace(/^0+/, '') || '0';
  const out = new Set<string>([
    t,
    stripped,
    stripped.padStart(4, '0'),
    stripped.padStart(5, '0'),
    t.padStart(4, '0'),
    t.padStart(5, '0'),
  ]);
  return [...out].filter(Boolean);
}

async function findProductByPlu(productCode: string): Promise<Product | null> {
  for (const code of pluCodeVariants(productCode)) {
    const p = await productAPI.getByCode(code);
    if (p) return p;
  }
  const bySpecial = await productAPI.getBySpecialCode(productCode);
  if (bySpecial) return bySpecial;
  return productAPI.getScaleProductByPlu(productCode);
}

function resolveUnitPricePerKg(
  product: Product,
  exchangeRate: number,
): number {
  let price = Number(product.price) || 0;
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
    if (rate > 0) price = saleUsd * rate;
  }
  return price;
}

/**
 * Tam barkod eşleşmesi yoksa tartılı EAN-13 parse eder; kg × fiyat hesaplar.
 */
export async function resolveScaleBarcodeSale(
  barcode: string,
  exchangeRate = 1,
): Promise<ScaleBarcodeSaleResult | null> {
  const parsed = parseBarcode(barcode.trim());
  if (!parsed.isWeightBased && !parsed.isPriceBased) return null;
  if (!parsed.productCode) return null;

  const product = await findProductByPlu(parsed.productCode);
  if (!product) return null;

  const unit = (product.unit || 'KG').toString();
  const unitUpper = unit.toUpperCase();

  if (parsed.isPriceBased && parsed.price != null) {
    const lineTotal = convertPrice(parsed.price);
    return {
      product,
      quantity: 1,
      unitName: unit,
      unitPrice: lineTotal,
      parsed,
      formatInfo: getBarcodeFormatInfo(parsed),
    };
  }

  if (!parsed.isWeightBased || parsed.weight == null) return null;

  const qty = convertWeight(parsed.weight, unitUpper);
  if (!(qty > 0)) return null;

  const unitPrice = resolveUnitPricePerKg(product, exchangeRate);
  if (!(unitPrice > 0) && !isScaleProductFlag(product)) return null;

  return {
    product,
    quantity: Math.round(qty * 1000) / 1000,
    unitName: unitUpper === 'KG' || unitUpper === 'KİLO' ? 'KG' : unit,
    unitPrice,
    parsed,
    formatInfo: getBarcodeFormatInfo(parsed),
  };
}
