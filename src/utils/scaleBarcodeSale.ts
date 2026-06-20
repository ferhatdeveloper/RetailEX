/**
 * Tartılı ürün barkodu → satış satırı (kg × birim fiyat veya gömülü fiyat).
 * Rongta tip 27: 27 + PLU(5) + gram(5) + kontrol hanesi
 */
import type { Product } from '../core/types';
import { productAPI } from '../services/api/products';
import {
  convertPrice,
  getBarcodeFormatInfo,
  isGramScaleUnit,
  parseBarcodeVariants,
  type ParsedBarcode,
} from './barcodeParser';
import { getGlobalCurrency, roundMoneyAmount } from './currency';
import { buildScaleCartLineAmounts } from './scaleBarcodeLine';
import { isScaleProductFlag } from './scaleProductFilter';

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

function pluCodeVariants(code: string): string[] {
  const t = String(code ?? '').trim();
  if (!t) return [];
  const stripped = t.replace(/^0+/, '') || '0';
  const out = new Set<string>([
    t,
    stripped,
    stripped.padStart(4, '0'),
    stripped.padStart(5, '0'),
    stripped.padStart(6, '0'),
    stripped.padStart(10, '0'),
    t.padStart(4, '0'),
    t.padStart(5, '0'),
    t.padStart(6, '0'),
    t.padStart(10, '0'),
  ]);

  // Uzun tartı kodu: 100000001 ↔ terazi PLU 000001 (dept 1 + 8 hane)
  for (const dept of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    out.add(`${dept}${stripped.padStart(8, '0')}`);
    out.add(`${dept}${t.padStart(8, '0')}`);
  }
  if (t.length > 6) out.add(t.slice(-6));
  if (stripped.length > 0 && stripped.length <= 6) {
    out.add(`1${stripped.padStart(8, '0')}`);
  }

  return [...out].filter(Boolean);
}

async function findProductByPlu(productCode: string): Promise<Product | null> {
  for (const code of pluCodeVariants(productCode)) {
    const scaleProduct = await productAPI.getScaleProductByPlu(code);
    if (scaleProduct) return scaleProduct;
  }
  for (const code of pluCodeVariants(productCode)) {
    const byBarcode = await productAPI.getByBarcode(code);
    if (byBarcode && isScaleProductFlag(byBarcode)) return byBarcode;
  }
  for (const code of pluCodeVariants(productCode)) {
    const p = await productAPI.getByCode(code);
    if (p && isScaleProductFlag(p)) return p;
  }
  const bySpecial = await productAPI.getBySpecialCode(productCode);
  if (bySpecial) return bySpecial;
  for (const code of pluCodeVariants(productCode)) {
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
  const variants = parseBarcodeVariants(barcode.trim());
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
  if (!(unitPrice > 0) && !isScaleProductFlag(product)) return null;

  const weightGrams = isGramScaleUnit(unitUpper)
    ? Math.round(line.quantity)
    : Math.round(line.quantity * 1000);

  return {
    product,
    quantity: line.quantity,
    unitName: line.unitName,
    unitPrice,
    lineTotal: line.lineTotal,
    parsed,
    formatInfo: getBarcodeFormatInfo(parsed),
    weightGrams,
  };
}
