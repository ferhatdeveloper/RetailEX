/**
 * Tartılı ürün barkod parser — Rongta RLS1000/1100 (tip 0–99).
 *
 * **Ana format (code10)**: İlk **10 hane** ürün kodu/barkod, **kalan hane(ler)** ağırlık.
 * GR biriminde sonek gram; KG/LT biriminde sonek gram (÷1000 → kg).
 * Örn. 10000000091610 → kod 1000000009, ağırlık 1610 → 1,610 kg.
 *
 * **Tip 99 (özel)**: Yazılımda genelde tip 17 kopyası → prefix **27** + PLU(5) + gram(5).
 * **Tip 17**: 27 + PLU(5) + WW.WWW(5) — ağırlık alanı gram (örn. 01250 = 1250 g).
 * **Tip 19**: 29 + PLU(5) + WWWWW(5).
 * **Tip 27 (PLU ayarı)**: D(1) + PLU(6) + WW.WWW(5) — alternatif parse denenir.
 */

import { getCurrencyDecimalPlaces } from './currency';
import { getCode10SuffixMode, getScaleBarcodeType } from './scaleBarcodeConfig';
import { isGramScaleUnit } from './productUnits';
import { scaleGramsToProductQuantity, normalizeWeightProductQuantity } from './scaleQuantity';

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
  /** code10: sonek gram mı satır tutarı (IQD) mı */
  code10SuffixMode?: 'weight_grams' | 'total_iqd';
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

/** Okuyucudan gelen barkodu temizler (boşluk, görünmez karakter). */
export function normalizeScannedBarcode(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s/g, '');
}

/**
 * POS / stok: aynı etiketin farklı kayıtlı biçimleri (UPC-A 12 hane, EAN-13 baştaki 0 vb.).
 */
export function expandBarcodeLookupKeys(barcode: string): string[] {
  const normalized = normalizeScannedBarcode(barcode);
  if (!normalized) return [];

  const keys = new Set<string>([normalized]);
  if (!/^\d+$/.test(normalized)) return [...keys];

  const noLeadingZeros = normalized.replace(/^0+/, '') || '0';
  keys.add(noLeadingZeros);

  if (normalized.length === 12) {
    keys.add(`0${normalized}`);
  }
  if (normalized.length === 13 && normalized.startsWith('0')) {
    keys.add(normalized.slice(1));
  }
  if (noLeadingZeros.length === 12) {
    keys.add(`0${noLeadingZeros}`);
  }

  return [...keys];
}

function parseWeightDigits(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/** 13 haneli tartı etiketi (EAN-13 gövdesi). */
function parseScaleBarcode13(trimmed: string): ParsedBarcode | null {
  if (trimmed.length !== 13 || !/^\d{13}$/.test(trimmed)) return null;

  const prefixNum = parseInt(trimmed.substring(0, 2), 10);

  if (prefixNum >= 10 && prefixNum <= 19) {
    return parseDeptPlus6Plu(trimmed);
  }

  if (prefixNum < 20 || prefixNum > 29) return null;

  const fixedWeight = parseFixedPrefixWeight(trimmed);
  if (fixedWeight) return fixedWeight;

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

  if (prefixNum >= 20 && prefixNum <= 24) {
    const dept6 = parseDeptPlus6Plu(trimmed);
    if (dept6) return dept6;
  }

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

  return null;
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

/** 14 hane Rongta EAN-13 + kontrol — code10 ile karışmasın (27… / 20…). */
function shouldSkipCode10ForRongta14(trimmed: string): boolean {
  if (trimmed.length !== 14) return false;
  const prefixNum = parseInt(trimmed.substring(0, 2), 10);
  return prefixNum >= 20 && prefixNum <= 29;
}

/**
 * İlk 10 hane ürün kodu + sonek ağırlık (11–16 hane toplam).
 * GR: sonek gram; KG: sonek gram → ÷1000 kg.
 * 13 hane: yalnızca tartı prefix aralığında (10–29) ve Rongta/dept parse edilemediğinde.
 */
function parseCode10WeightSuffix(trimmed: string): ParsedBarcode | null {
  if (!/^\d{11,16}$/.test(trimmed)) return null;
  if (shouldSkipCode10ForRongta14(trimmed)) return null;

  if (trimmed.length === 13) {
    const prefixNum = parseInt(trimmed.substring(0, 2), 10);
    if (prefixNum < 10 || prefixNum > 29) return null;
    const scale13 = parseScaleBarcode13(trimmed);
    if (scale13?.isWeightBased || scale13?.isPriceBased) return null;
  }

  const productCode = trimmed.substring(0, 10);
  if (!productCode.replace(/0/g, '')) return null;
  const weightStr = trimmed.substring(10);
  if (!weightStr) return null;
  const weight = parseWeightDigits(weightStr);
  if (weight <= 0) return null;
  return {
    isWeightBased: true,
    productCode,
    weight,
    originalBarcode: trimmed,
    format: 'code10_weight',
    code10SuffixMode: getCode10SuffixMode(),
  };
}

/** code10 formatında mı (10 hane kod + ağırlık soneki)? */
export function isCode10WeightBarcode(barcode: string): boolean {
  return parseCode10WeightSuffix(normalizeScannedBarcode(barcode)) != null;
}

/**
 * Tartı parse adayları: tam barkod + olası EAN kontrol hanesi (14→13) veya code10 kısaltma.
 */
export function expandScaleBarcodeCandidates(barcode: string): string[] {
  const normalized = normalizeScannedBarcode(barcode);
  const out = new Set<string>([normalized]);
  if (!/^\d+$/.test(normalized)) return [...out];

  const code10Full = parseCode10WeightSuffix(normalized);

  // Geçerli code10 barkodu 13 haneye bölünmesin (10000000091610 → 1000000009161 hatalı olur)
  if (normalized.length === 14 && !code10Full) {
    const head13 = normalized.substring(0, 13);
    const prefix2 = parseInt(head13.substring(0, 2), 10);
    if (prefix2 >= 10 && prefix2 <= 29) out.add(head13);
  }

  if ((normalized.length === 15 || normalized.length === 16) && !code10Full) {
    const head14 = normalized.substring(0, 14);
    if (parseCode10WeightSuffix(head14)) out.add(head14);
  }

  return [...out];
}

/** 14+ hane tartı etiketi (10 hane kod + ağırlık) veya tartılı aday barkod. */
export function isCompositeScaleBarcode(barcode: string): boolean {
  return expandScaleBarcodeCandidates(barcode).some(
    (candidate) => parseCode10WeightSuffix(candidate) != null || parseScaleBarcode13(candidate) != null,
  );
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

export { isGramScaleUnit } from './productUnits';

export function scaleWeightFieldToQuantity(
  fieldValue: number,
  unit?: string,
  format?: BarcodeFormat,
): { quantity: number; unitName: string } {
  if (!Number.isFinite(fieldValue) || fieldValue <= 0) {
    return { quantity: 0, unitName: scaleSaleUnitLabel(normalizeScaleUnit(unit)) };
  }
  if (format === 'code10_weight') {
    // Sonek gram: KG → 1,610 kg; GR → 1610 gr (alış faturası ile aynı birim)
    const qty = scaleGramsToProductQuantity(fieldValue, unit);
    const unitName = isGramScaleUnit(unit) ? 'GR' : scaleSaleUnitLabel(normalizeScaleUnit(unit));
    return { quantity: qty, unitName };
  }
  if (isGramScaleUnit(unit)) {
    return { quantity: Math.round(fieldValue), unitName: 'GR' };
  }
  const kg = normalizeWeightProductQuantity(rongtaWeightFieldToKg(fieldValue), unit);
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
  const variants: ParsedBarcode[] = [];

  for (const candidate of expandScaleBarcodeCandidates(barcode)) {
    const code10 = parseCode10WeightSuffix(candidate);
    if (code10) {
      variants.push(code10);
      continue;
    }

    if (candidate.length === 13 && /^\d{13}$/.test(candidate)) {
      const scale13 = parseScaleBarcode13(candidate);
      if (scale13) variants.push(scale13);

      const prefixNum = parseInt(candidate.substring(0, 2), 10);
      if (prefixNum >= 10 && prefixNum <= 19) {
        const dept6 = parseDeptPlus6Plu(candidate);
        if (dept6) variants.push(dept6);
      } else {
        const alt6 = parseDeptPlus6Plu(candidate);
        if (alt6) variants.push(alt6);
      }
    }
  }

  return dedupeParsed(variants);
}

/**
 * Barkodu parse eder — birincil tartılı format.
 */
export function parseBarcode(barcode: string): ParsedBarcode {
  const trimmed = normalizeScannedBarcode(barcode);

  const composite = parseCode10WeightSuffix(trimmed);
  if (composite) return composite;

  const scale13 = parseScaleBarcode13(trimmed);
  if (scale13) return scale13;

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
  return expandScaleBarcodeCandidates(barcode).some((candidate) => {
    if (parseCode10WeightSuffix(candidate)) return true;
    const scale13 = parseScaleBarcode13(candidate);
    if (scale13?.isWeightBased) return true;
    return false;
  });
}

/** POS: 11–16 hane sayısal barkod tartılı etiket olabilir mi? */
export function isLikelyScaleBarcodeInput(barcode: string): boolean {
  const normalized = normalizeScannedBarcode(barcode);
  if (!/^\d{11,16}$/.test(normalized)) return false;
  return isWeightBasedBarcode(normalized);
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
