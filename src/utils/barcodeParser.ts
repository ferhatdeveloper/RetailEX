/**
 * Tartılı ürün barkod parser — Rongta RLS1000/1100 (tip 0–99).
 *
 * **Tip 99 (özel)**: Yazılımda genelde tip 17 kopyası → prefix **27** + PLU(5) + gram(5).
 * **Tip 17**: 27 + PLU(5) + WW.WWW(5) — ağırlık alanı gram (örn. 01250 = 1250 g).
 * **Tip 19**: 29 + PLU(5) + WWWWW(5).
 * **Tip 27 (PLU ayarı)**: D(1) + PLU(6) + WW.WWW(5) — alternatif parse denenir.
 */

import { getCurrencyDecimalPlaces } from './currency';
import { getScaleBarcodeType } from './scaleBarcodeConfig';

export type BarcodeFormat =
  | 'rongta_type17'
  | 'rongta_type99'
  | 'rongta_fixed_weight'
  | 'rongta_dept_plu6'
  | 'code10_weight'
  | 'logo_tiger'
  | 'price_based'
  | 'weight_end'
  | 'weight_start'
  | 'unknown';

export interface ParsedBarcode {
  isWeightBased: boolean;
  isPriceBased?: boolean;
  productCode?: string;
  weight?: number; // Rongta ağırlık alanı (÷1000 = kg; 01300 → 1,300 kg)
  price?: number; // kuruş (fiyat barkodu)
  originalBarcode: string;
  format?: BarcodeFormat;
  /** Rongta barkod tipi referansı (17, 99 vb.) */
  rongtaTypeHint?: number;
}

/** Sabit prefix 25–29 (Rongta tablo: tip 15–19, ağırlık barkodu) */
const FIXED_WEIGHT_SPECS: Record<
  string,
  { pluFrom: number; pluTo: number; weightFrom: number; weightTo: number; rongtaType: number }
> = {
  '25': { pluFrom: 2, pluTo: 8, weightFrom: 8, weightTo: 12, rongtaType: 15 },
  '26': { pluFrom: 2, pluTo: 8, weightFrom: 8, weightTo: 12, rongtaType: 16 },
  '27': { pluFrom: 2, pluTo: 7, weightFrom: 7, weightTo: 12, rongtaType: 17 },
  '28': { pluFrom: 2, pluTo: 7, weightFrom: 7, weightTo: 12, rongtaType: 18 },
  '29': { pluFrom: 2, pluTo: 7, weightFrom: 7, weightTo: 12, rongtaType: 19 },
};

function parseWeightDigits(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

function parseFixedPrefixWeight(trimmed: string): ParsedBarcode | null {
  const spec = FIXED_WEIGHT_SPECS[trimmed.substring(0, 2)];
  if (!spec) return null;
  const weight = parseWeightDigits(trimmed.substring(spec.weightFrom, spec.weightTo));
  const configuredType = getScaleBarcodeType();
  const format: BarcodeFormat =
    configuredType === 99 ? 'rongta_type99' : spec.rongtaType === 17 ? 'rongta_type17' : 'rongta_fixed_weight';
  return {
    isWeightBased: true,
    productCode: trimmed.substring(spec.pluFrom, spec.pluTo),
    weight,
    originalBarcode: trimmed,
    format,
    rongtaTypeHint: configuredType === 99 ? 99 : spec.rongtaType,
  };
}

/**
 * 14+ hane: ürün kodu(10) + ağırlık(4+)
 * Örn. 10000000091610 → kod 1000000009, ağırlık 1610 (gr veya ÷1000 kg)
 */
function parseCode10WeightSuffix(trimmed: string): ParsedBarcode | null {
  if (!/^\d{14,15}$/.test(trimmed)) return null;
  if (!trimmed.startsWith('10')) return null;
  const productCode = trimmed.substring(0, 10);
  if (!productCode.replace(/0/g, '')) return null;
  const weight = parseWeightDigits(trimmed.substring(10));
  if (weight <= 0) return null;
  return {
    isWeightBased: true,
    productCode,
    weight,
    originalBarcode: trimmed,
    format: 'code10_weight',
  };
}

/** 14+ hane tartı etiketi (10 hane kod + ağırlık). */
export function isCompositeScaleBarcode(barcode: string): boolean {
  return parseCode10WeightSuffix(barcode.trim()) != null;
}

/** PLU ayarı tip 25–29 (grup 21–29): D(1) + PLU(6) + WW.WWW(5) — barkod 10… / 20… ile başlayabilir */
function parseDeptPlus6Plu(trimmed: string): ParsedBarcode | null {
  const deptDigit = trimmed[0];
  if (!deptDigit || deptDigit < '1' || deptDigit > '9') return null;
  const weight = parseWeightDigits(trimmed.substring(7, 12));
  if (weight <= 0) return null;
  const productCode = trimmed.substring(1, 7);
  if (!productCode.replace(/0/g, '')) return null;
  return {
    isWeightBased: true,
    productCode,
    weight,
    originalBarcode: trimmed,
    format: 'rongta_dept_plu6',
    rongtaTypeHint: parseInt(deptDigit, 10),
  };
}

/**
 * Rongta EAN-13 ağırlık alanı → kilogram.
 * WW.WWW(5) / WWWWW(5): 01300 = 1,300 kg (alan ÷ 1000).
 */
export function rongtaWeightFieldToKg(fieldValue: number): number {
  if (!Number.isFinite(fieldValue) || fieldValue <= 0) return 0;
  const kg = fieldValue / 1000;
  if (kg > 50) return 0;
  return Math.round(kg * 1000) / 1000;
}

function normalizeScaleUnit(unit?: string): string {
  return (unit ?? 'KG').toUpperCase().replace(/İ/g, 'I');
}

export function isGramScaleUnit(unit?: string): boolean {
  const u = normalizeScaleUnit(unit);
  return u === 'GR' || u === 'G' || u === 'GRAM' || u === 'GRM';
}

/** Tartı ağırlık alanı → satış miktarı (GR: gram; KG/LT: kg). */
export function scaleWeightFieldToQuantity(
  fieldValue: number,
  unit?: string,
): { quantity: number; unitName: string } {
  if (!Number.isFinite(fieldValue) || fieldValue <= 0) {
    return { quantity: 0, unitName: scaleSaleUnitLabel(normalizeScaleUnit(unit)) };
  }
  if (isGramScaleUnit(unit)) {
    return { quantity: Math.round(fieldValue), unitName: 'GR' };
  }
  const kg = rongtaWeightFieldToKg(fieldValue);
  return { quantity: kg, unitName: scaleSaleUnitLabel(normalizeScaleUnit(unit)) };
}

function dedupeParsed(list: ParsedBarcode[]): ParsedBarcode[] {
  const seen = new Set<string>();
  const out: ParsedBarcode[] = [];
  for (const p of list) {
    if (!p.isWeightBased && !p.isPriceBased) continue;
    const key = `${p.format}|${p.productCode}|${p.weight}|${p.price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * Olası tüm tartılı parse sonuçları (PLU eşleşmesi için sırayla denenir).
 * Tip 99 → önce tip 17 (prefix 27 + 5 PLU), gerekirse 6 haneli PLU alternatifi.
 */
export function parseBarcodeVariants(barcode: string): ParsedBarcode[] {
  const trimmed = barcode.trim();
  const primary = parseBarcode(trimmed);
  const variants: ParsedBarcode[] = [];

  if (primary.isWeightBased || primary.isPriceBased) {
    variants.push(primary);
  }

  const composite = parseCode10WeightSuffix(trimmed);
  if (composite) variants.push(composite);

  if (trimmed.length === 13 && /^\d{13}$/.test(trimmed)) {
    const prefixNum = parseInt(trimmed.substring(0, 2), 10);
    if (prefixNum >= 10 && prefixNum <= 19) {
      const dept6 = parseDeptPlus6Plu(trimmed);
      if (dept6) variants.push(dept6);
    } else {
      const alt6 = parseDeptPlus6Plu(trimmed);
      if (alt6) variants.push(alt6);
    }
  }

  return dedupeParsed(variants);
}

/**
 * Barkodu parse eder — birincil tartılı format.
 */
export function parseBarcode(barcode: string): ParsedBarcode {
  const trimmed = barcode.trim();

  const composite = parseCode10WeightSuffix(trimmed);
  if (composite) return composite;

  if (trimmed.length !== 13 || !/^\d{13}$/.test(trimmed)) {
    return { isWeightBased: false, originalBarcode: trimmed };
  }

  const prefixNum = parseInt(trimmed.substring(0, 2), 10);

  // Ürün kodu 100000001 → etiket 1000001013000 (dept 1 + PLU 6 + ağırlık 5)
  if (prefixNum >= 10 && prefixNum <= 19) {
    const dept6 = parseDeptPlus6Plu(trimmed);
    if (dept6) return dept6;
    return { isWeightBased: false, originalBarcode: trimmed };
  }

  if (prefixNum < 20 || prefixNum > 29) {
    return { isWeightBased: false, originalBarcode: trimmed };
  }

  // Ağırlık: sabit prefix 25–29 (tip 15–19; tip 99 genelde tip 17 = prefix 27)
  const fixedWeight = parseFixedPrefixWeight(trimmed);
  if (fixedWeight) return fixedWeight;

  // Fiyat: sabit prefix 23–24 (tip 13–14)
  if (prefixNum === 23 || prefixNum === 24) {
    return {
      isWeightBased: false,
      isPriceBased: true,
      productCode: trimmed.substring(2, 7),
      price: parseWeightDigits(trimmed.substring(7, 12)),
      originalBarcode: trimmed,
      format: 'price_based',
    };
  }

  // Rongta PLU barkod tipi 25–29: D + 6 hane PLU + ağırlık (barkod 20… / 21… ile başlar)
  // Logo Tiger sanılmasın — yanlış parse ~8–10× şişkin fiyat üretir (1,3 kg → ~10 kg)
  if (prefixNum >= 20 && prefixNum <= 24) {
    const dept6 = parseDeptPlus6Plu(trimmed);
    if (dept6) return dept6;
  }

  // Prefix 22: sabit prefix ağırlık (tip 12)
  if (prefixNum === 22) {
    return {
      isWeightBased: true,
      productCode: trimmed.substring(2, 7),
      weight: parseWeightDigits(trimmed.substring(7, 12)),
      originalBarcode: trimmed,
      format: 'rongta_fixed_weight',
      rongtaTypeHint: 22,
    };
  }

  return { isWeightBased: false, originalBarcode: trimmed };
}

export function convertWeight(weightFieldValue: number, _unit?: string): number {
  return rongtaWeightFieldToKg(weightFieldValue);
}

export function scaleSaleUnitLabel(unit: string): string {
  const u = unit.toUpperCase().replace(/İ/g, 'I');
  if (u === 'GR' || u === 'G' || u === 'GRAM' || u === 'GRM') return 'KG';
  if (u === 'LT' || u === 'L' || u === 'LITRE' || u === 'LITER') return 'LT';
  if (u === 'KG' || u === 'KILO' || u === 'KILOGRAM') return 'KG';
  return unit || 'KG';
}

/** Fiyat barkodu alanı → para birimi tutarı (IQD tam sayı; USD/EUR ÷100). */
export function convertPrice(priceFieldValue: number, currency?: string | null): number {
  const n = Number(priceFieldValue);
  if (!Number.isFinite(n)) return 0;
  if (getCurrencyDecimalPlaces(currency) === 0) return Math.round(n);
  return n / 100;
}

export function isWeightBasedBarcode(barcode: string): boolean {
  const trimmed = barcode.trim();
  if (parseCode10WeightSuffix(trimmed)) return true;
  if (trimmed.length !== 13 || !/^\d{13}$/.test(trimmed)) return false;
  const prefix = parseInt(trimmed.substring(0, 2), 10);
  if (prefix >= 10 && prefix <= 19) return parseDeptPlus6Plu(trimmed) != null;
  if (prefix < 20 || prefix > 29) return false;
  if (prefix === 23 || prefix === 24) return false;
  return true;
}

export function getBarcodeFormatInfo(parsed: ParsedBarcode): string {
  if (!parsed.isWeightBased && !parsed.isPriceBased) {
    return 'Normal ürün barkodu';
  }
  const typeHint = parsed.rongtaTypeHint != null ? ` (tip ${parsed.rongtaTypeHint})` : '';
  switch (parsed.format) {
    case 'rongta_type99':
      return `Rongta tip 99: 27 + 5 PLU + gram${typeHint}`;
    case 'rongta_type17':
      return `Rongta tip 17: 27 + 5 PLU + gram${typeHint}`;
    case 'rongta_fixed_weight':
      return `Rongta sabit prefix + PLU + gram${typeHint}`;
    case 'rongta_dept_plu6':
      return `Rongta: dept + 6 PLU + gram${typeHint}`;
    case 'code10_weight':
      return 'Tartılı: 10 hane kod + ağırlık (gr/kg)';
    case 'logo_tiger':
      return 'Logo Tiger: 20/21 + 4 PLU + gram';
    case 'price_based':
      return 'Fiyat gömülü barkod';
    case 'weight_end':
      return 'Format 1: Ağırlık sonda';
    case 'weight_start':
      return 'Format 2: Ağırlık başta';
    default:
      return 'Bilinmeyen format';
  }
}
