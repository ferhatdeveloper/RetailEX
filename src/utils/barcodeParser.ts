/**
 * Tartılı Ürün Barkod Parser
 *
 * EAN-13 tartılı barkod formatları (prefix 20–29):
 *
 * **Rongta / GS1 (tip 27 vb.)**: 2XPPPPPWWWWWC
 *   - Örnek: 2700010125001 → PLU 00001, 1250 gram
 *   - Prefix: 22, 24, 26–29 (Rongta varsayılan tip 27)
 *
 * **Logo Tiger**: 20PPPPWWWWWC / 21PPPPWWWWWC
 *   - Örnek: 2000010125001 → PLU 0001 (4 hane), 1250 gram
 *
 * **Fiyat bazlı**: 23PPPPFFFFFC – 24PPPPFFFFFC – 25PPPPFFFFFC
 *   - Gömülü fiyat (kuruş); ağırlık yok
 */

export type BarcodeFormat =
  | 'rongta_gs1'
  | 'logo_tiger'
  | 'price_based'
  | 'weight_end'
  | 'weight_start'
  | 'unknown';

export interface ParsedBarcode {
  isWeightBased: boolean;
  isPriceBased?: boolean;
  productCode?: string;
  weight?: number; // gram cinsinden
  price?: number; // fiyat bazlı ise (kuruş cinsinden)
  originalBarcode: string;
  format?: BarcodeFormat;
}

function parseWeightDigits(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Barkodu parse eder ve tartılı ürün bilgilerini çıkarır.
 */
export function parseBarcode(barcode: string): ParsedBarcode {
  const trimmed = barcode.trim();

  if (trimmed.length !== 13 || !/^\d{13}$/.test(trimmed)) {
    return {
      isWeightBased: false,
      originalBarcode: trimmed,
    };
  }

  const prefixNum = parseInt(trimmed.substring(0, 2), 10);
  if (prefixNum < 20 || prefixNum > 29) {
    return {
      isWeightBased: false,
      originalBarcode: trimmed,
    };
  }

  // Fiyat bazlı (23–25)
  if (prefixNum >= 23 && prefixNum <= 25) {
    return {
      isWeightBased: false,
      isPriceBased: true,
      productCode: trimmed.substring(2, 7),
      price: parseWeightDigits(trimmed.substring(7, 12)),
      originalBarcode: trimmed,
      format: 'price_based',
    };
  }

  // Logo Tiger — 4 haneli PLU (20, 21)
  if (prefixNum === 20 || prefixNum === 21) {
    return {
      isWeightBased: true,
      productCode: trimmed.substring(2, 6),
      weight: parseWeightDigits(trimmed.substring(6, 11)),
      originalBarcode: trimmed,
      format: 'logo_tiger',
    };
  }

  // Rongta / GS1 — 5 haneli PLU (22, 24, 26–29; terazi tip 27 dahil)
  if (
    prefixNum === 22 ||
    prefixNum === 24 ||
    (prefixNum >= 26 && prefixNum <= 29)
  ) {
    return {
      isWeightBased: true,
      productCode: trimmed.substring(2, 7),
      weight: parseWeightDigits(trimmed.substring(7, 12)),
      originalBarcode: trimmed,
      format: 'rongta_gs1',
    };
  }

  // Eski heuristic (nadir formatlar / geriye dönük)
  const format1ProductCode = trimmed.substring(1, 6);
  const format1Weight = parseWeightDigits(trimmed.substring(6, 11));
  const format2Weight = parseWeightDigits(trimmed.substring(1, 6));
  const format2ProductCode = trimmed.substring(6, 11);

  const isFormat1Valid = format1Weight >= 0 && format1Weight <= 50000;
  const isFormat2Valid = format2Weight >= 0 && format2Weight <= 50000;

  if (isFormat1Valid) {
    return {
      isWeightBased: true,
      productCode: format1ProductCode,
      weight: format1Weight,
      originalBarcode: trimmed,
      format: 'weight_end',
    };
  }
  if (isFormat2Valid) {
    return {
      isWeightBased: true,
      productCode: format2ProductCode,
      weight: format2Weight,
      originalBarcode: trimmed,
      format: 'weight_start',
    };
  }

  return {
    isWeightBased: true,
    productCode: format1ProductCode,
    weight: format1Weight,
    originalBarcode: trimmed,
    format: 'weight_end',
  };
}

/**
 * Gram cinsinden ağırlığı birime göre dönüştürür.
 * Tartılı satışta fiyat genelde KG başına olduğundan KG/LT için kg/litre döner.
 */
export function convertWeight(weightInGrams: number, unit: string): number {
  const upperUnit = unit.toUpperCase().replace(/İ/g, 'I');

  switch (upperUnit) {
    case 'GR':
    case 'G':
    case 'GRAM':
    case 'GRM':
      return weightInGrams / 1000;

    case 'KG':
    case 'KILO':
    case 'KILOGRAM':
      return weightInGrams / 1000;

    case 'LT':
    case 'L':
    case 'LITRE':
    case 'LITER':
      return weightInGrams / 1000;

    default:
      return weightInGrams / 1000;
  }
}

/** Sepet gösterimi için birim etiketi (tartılı satır). */
export function scaleSaleUnitLabel(unit: string): string {
  const u = unit.toUpperCase().replace(/İ/g, 'I');
  if (u === 'GR' || u === 'G' || u === 'GRAM' || u === 'GRM') return 'KG';
  if (u === 'LT' || u === 'L' || u === 'LITRE' || u === 'LITER') return 'LT';
  if (u === 'KG' || u === 'KILO' || u === 'KILOGRAM') return 'KG';
  return unit || 'KG';
}

/**
 * Kuruş cinsinden fiyatı TL'ye dönüştürür
 */
export function convertPrice(priceInCents: number): number {
  return priceInCents / 100;
}

/**
 * Barkod tartılı ürün barkodu mu kontrol eder (hızlı kontrol)
 */
export function isWeightBasedBarcode(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (trimmed.length !== 13 || !/^\d{13}$/.test(trimmed)) return false;
  const prefix = parseInt(trimmed.substring(0, 2), 10);
  if (prefix < 20 || prefix > 29) return false;
  if (prefix >= 23 && prefix <= 25) return false;
  return true;
}

/**
 * Barkod formatını açıklama olarak döndürür (debug/log için)
 */
export function getBarcodeFormatInfo(parsed: ParsedBarcode): string {
  if (!parsed.isWeightBased && !parsed.isPriceBased) {
    return 'Normal ürün barkodu';
  }

  switch (parsed.format) {
    case 'rongta_gs1':
      return 'Rongta/GS1: 2X + 5 hane PLU + 5 hane gram';
    case 'logo_tiger':
      return 'Logo Tiger: 20/21 + 4 hane PLU + 5 hane gram';
    case 'weight_end':
      return 'Format 1: Ağırlık sonda (2PPPPPWWWWW)';
    case 'weight_start':
      return 'Format 2: Ağırlık başta (2WWWWWPPPPP)';
    case 'price_based':
      return 'Format 4: Fiyat bazlı (23PPPPFFFFF)';
    default:
      return 'Bilinmeyen format';
  }
}
