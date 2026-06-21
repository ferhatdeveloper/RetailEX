/**
 * Tartılı ürün barkodu → satış satırı (kg × birim fiyat veya gömülü fiyat).
 * Rongta tip 27: 27 + PLU(5) + gram(5) + kontrol hanesi
 */
import type { Product } from '../core/types';
import { productAPI, scalePluLookupVariants } from '../services/api/products';
import {
  convertPrice,
  getBarcodeFormatInfo,
  normalizeScannedBarcode,
  parseBarcodeVariants,
  type ParsedBarcode,
} from './barcodeParser';
import { getGlobalCurrency, roundMoneyAmount } from './currency';
import { buildScaleCartLineAmounts } from './scaleBarcodeLine';
import { isScaleProductFlag } from './scaleProductFilter';
import { normalizeWeightProductQuantity, productQuantityToGrams } from './scaleQuantity';

export interface ScaleBarcodeSaleResult {
  product: Product;
  quantity: number;
  unitName: string;
  unitPrice: number;
  lineTotal: number;
  parsed: ParsedBarcode;
  formatInfo: string;
  weightGrams: number;
}

function resolveSaleCurrency(product: Product): string {
  const raw = (product as Product & { currency?: string }).currency;
  return String(raw ?? getGlobalCurrency()).trim().toUpperCase() || 'IQD';
}

async function findProductByPlu(productCode: string): Promise<Product | null> {
  for (const code of scalePluLookupVariants(productCode)) {
    const scaleProduct = await productAPI.getScaleProductByPlu(code);
    if (scaleProduct) return scaleProduct;
  }
  for (const code of scalePluLookupVariants(productCode)) {
    const byBarcode = await productAPI.getByBarcode(code);
    if (byBarcode) return byBarcode;
  }
  for (const code of scalePluLookupVariants(productCode)) {
    const p = await productAPI.getByCode(code);
    if (p && isScaleProductFlag(p)) return p;
  }
  const bySpecial = await productAPI.getBySpecialCode(productCode);
  if (bySpecial) return bySpecial;
  for (const code of scalePluLookupVariants(productCode)) {
    const p = await productAPI.getByCode(code);
    if (p) return p;
  }
  return productAPI.getScaleProductByPlu(productCode);
}

/**
 * Tam barkod eşleşmesi yoksa tartılı EAN-13 parse eder; kg × birim fiyat hesaplar.
 */
export async function resolveScaleBarcodeSale(
  barcode: string,
  exchangeRate = 1,
): Promise<ScaleBarcodeSaleResult | null> {
  const variants = parseBarcodeVariants(normalizeScannedBarcode(barcode));
  if (variants.length === 0) return null;

  for (const parsed of variants) {
    const result = await resolveParsedScaleBarcode(parsed, exchangeRate);
    if (result) return result;
  }
  return null;
}

async function resolveParsedScaleBarcode(
  parsed: ParsedBarcode,
  exchangeRate: number,
): Promise<ScaleBarcodeSaleResult | null> {
  if (!parsed.isWeightBased && !parsed.isPriceBased) return null;
  if (!parsed.productCode) return null;

  const product = await findProductByPlu(parsed.productCode);
  if (!product) return null;

  const unit = (product.unit || 'KG').toString();
  const unitUpper = unit.toUpperCase().replace(/İ/g, 'I');

  if (parsed.isPriceBased && parsed.price != null) {
    const currency = resolveSaleCurrency(product);
    const lineTotal = roundMoneyAmount(convertPrice(parsed.price, currency), currency);
    return {
      product,
      quantity: 1,
      unitName: unit,
      unitPrice: lineTotal,
      lineTotal,
      parsed,
      formatInfo: getBarcodeFormatInfo(parsed),
      weightGrams: 0,
    };
  }

  if (!parsed.isWeightBased || parsed.weight == null) return null;

  const line = buildScaleCartLineAmounts(product, parsed, exchangeRate);
  if (!line) return null;

  const unitPrice = line.unitPrice;
  if (!(line.lineTotal > 0) && !(unitPrice > 0) && !isScaleProductFlag(product)) return null;

  const quantity = normalizeWeightProductQuantity(line.quantity, unitUpper);
  const weightGrams = productQuantityToGrams(quantity, unitUpper);

  return {
    product,
    quantity,
    unitName: line.unitName,
    unitPrice,
    lineTotal: line.lineTotal,
    parsed,
    formatInfo: getBarcodeFormatInfo(parsed),
    weightGrams,
  };
}
