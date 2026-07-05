/**
 * Profesyonel / toplu etiket yazdırmada hangi alanların görüneceği — `app_settings` (firma bazlı).
 */
import JsBarcode from 'jsbarcode';
import { postgres, ERP_SETTINGS } from './postgres';

const KEY_LABEL_PRINT_FIELDS = 'label_print_field_settings';

export type BarcodeCaptionMode = 'barcode' | 'variantCode' | 'both' | 'none';

/** Etiket yazdırmada 1D barkod çizim formatı (auto = değere göre otomatik). */
export type BarcodePrintFormat = 'auto' | 'EAN13' | 'EAN8' | 'CODE128' | 'CODE39';

export type JsBarcodeFormat = 'EAN13' | 'EAN8' | 'CODE128' | 'CODE39';

const BARCODE_PRINT_FORMATS: BarcodePrintFormat[] = ['auto', 'EAN13', 'EAN8', 'CODE128', 'CODE39'];

export function normalizeBarcodePrintFormat(raw: string | undefined): BarcodePrintFormat {
  if (raw && BARCODE_PRINT_FORMATS.includes(raw as BarcodePrintFormat)) {
    return raw as BarcodePrintFormat;
  }
  return 'auto';
}

export interface LabelPrintFieldSettings {
  showProductName: boolean;
  showVariantCode: boolean;
  showVariantAttributes: boolean;
  showPrice: boolean;
  showStock: boolean;
  showCategory: boolean;
  /** Ürün kartındaki özel kod 2 (special_code_2) — standart/detaylı etiket satırı. */
  showSpecialCode2: boolean;
  /** 1D barkod çizgisinin altındaki yazı (CODE128’de özelleştirilebilir; EAN-13’te rakamlar standart). */
  barcodeCaptionMode: BarcodeCaptionMode;
  /** 1D barkod tipi — auto: 12–13 hane EAN-13, 7–8 hane EAN-8, diğer CODE128. */
  barcodeFormat: BarcodePrintFormat;
}

export const DEFAULT_LABEL_PRINT_FIELD_SETTINGS: LabelPrintFieldSettings = {
  showProductName: true,
  showVariantCode: true,
  showVariantAttributes: true,
  showPrice: true,
  showStock: true,
  showCategory: true,
  showSpecialCode2: true,
  barcodeCaptionMode: 'barcode',
  barcodeFormat: 'auto',
};

export function normalizeLabelPrintFieldSettings(
  raw: Partial<LabelPrintFieldSettings> | null | undefined
): LabelPrintFieldSettings {
  const m = raw?.barcodeCaptionMode;
  const barcodeCaptionMode: BarcodeCaptionMode =
    m === 'barcode' || m === 'variantCode' || m === 'both' || m === 'none' ? m : 'barcode';
  return {
    ...DEFAULT_LABEL_PRINT_FIELD_SETTINGS,
    ...raw,
    barcodeCaptionMode,
    barcodeFormat: normalizeBarcodePrintFormat(raw?.barcodeFormat),
  };
}

const CACHE_MS = 2 * 60 * 1000;
let mem: { firmKey: string; value: LabelPrintFieldSettings; at: number } | null = null;

export function invalidateLabelPrintFieldSettingsCache(): void {
  mem = null;
}

export async function getLabelPrintFieldSettings(firmNr?: string): Promise<LabelPrintFieldSettings> {
  const fn = firmNr || ERP_SETTINGS.firmNr || '001';
  const now = Date.now();
  if (mem && mem.firmKey === fn && now - mem.at < CACHE_MS) {
    return mem.value;
  }
  let parsed: LabelPrintFieldSettings = { ...DEFAULT_LABEL_PRINT_FIELD_SETTINGS };
  try {
    const { rows } = await postgres.query<{ value: LabelPrintFieldSettings }>(
      `SELECT value FROM app_settings WHERE key = $1 AND firm_nr = $2`,
      [KEY_LABEL_PRINT_FIELDS, fn]
    );
    if (rows.length > 0 && rows[0].value && typeof rows[0].value === 'object') {
      parsed = normalizeLabelPrintFieldSettings(rows[0].value as Partial<LabelPrintFieldSettings>);
    }
  } catch (e) {
    console.warn('[labelPrintFieldSettings] get failed', e);
  }
  mem = { firmKey: fn, value: parsed, at: now };
  return parsed;
}

export async function saveLabelPrintFieldSettings(
  data: LabelPrintFieldSettings,
  firmNr?: string
): Promise<void> {
  const fn = firmNr || ERP_SETTINGS.firmNr || '001';
  const payload = normalizeLabelPrintFieldSettings(data);
  try {
    await postgres.query(
      `INSERT INTO app_settings (key, value, firm_nr)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key, firm_nr) DO UPDATE SET value = $2::jsonb`,
      [KEY_LABEL_PRINT_FIELDS, JSON.stringify(payload), fn]
    );
    invalidateLabelPrintFieldSettingsCache();
  } catch (e) {
    console.error('[labelPrintFieldSettings] save failed', e);
    throw e;
  }
}

/** EAN-13 kontrol basamağını hesaplar (ilk 12 hane). */
export function computeEan13CheckDigit(twelveDigits: string): number {
  const digits = twelveDigits.split('').map((c) => Number(c));
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** EAN-13 kontrol basamağı geçerli mi (13 hane sayısal tek başına yetmez). */
export function isValidEan13(barcode: string): boolean {
  if (barcode.length !== 13 || !/^\d{13}$/.test(barcode)) return false;
  const check = computeEan13CheckDigit(barcode.slice(0, 12));
  return check === Number(barcode[12]);
}

/** 13 haneli EAN için kontrol basamağını düzeltir. */
export function fixEan13Checksum(thirteenDigits: string): string {
  const body = thirteenDigits.slice(0, 12);
  return body + String(computeEan13CheckDigit(body));
}

/** EAN-8 kontrol basamağını hesaplar (ilk 7 hane). */
export function computeEan8CheckDigit(sevenDigits: string): number {
  const digits = sevenDigits.split('').map((c) => Number(c));
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    sum += digits[i] * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** 8 haneli EAN için kontrol basamağını düzeltir. */
export function fixEan8Checksum(eightDigits: string): string {
  const body = eightDigits.slice(0, 7);
  return body + String(computeEan8CheckDigit(body));
}

export interface NormalizedBarcode {
  /** JsBarcode’a verilecek değer */
  value: string;
  format: JsBarcodeFormat;
}

function normalizeAutoBarcode(trimmed: string): NormalizedBarcode {
  if (/^\d{12}$/.test(trimmed)) {
    return {
      value: trimmed + String(computeEan13CheckDigit(trimmed)),
      format: 'EAN13',
    };
  }
  if (/^\d{13}$/.test(trimmed)) {
    return { value: fixEan13Checksum(trimmed), format: 'EAN13' };
  }
  if (/^\d{7}$/.test(trimmed)) {
    return {
      value: trimmed + String(computeEan8CheckDigit(trimmed)),
      format: 'EAN8',
    };
  }
  if (/^\d{8}$/.test(trimmed)) {
    return { value: fixEan8Checksum(trimmed), format: 'EAN8' };
  }
  return { value: trimmed.slice(0, 80), format: 'CODE128' };
}

/**
 * Yazdırma / okuyucu uyumu: auto modda 12–13 hane EAN-13, 7–8 hane EAN-8, diğerleri CODE128.
 * barcodeFormat ile tip zorlanabilir (uyumsuz değerlerde CODE128 yedek).
 */
export function normalizeBarcodeForPrint(
  raw: string,
  formatPreference: BarcodePrintFormat = 'auto',
): NormalizedBarcode {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { value: '', format: 'CODE128' };
  }

  if (formatPreference === 'auto') {
    return normalizeAutoBarcode(trimmed);
  }

  if (formatPreference === 'CODE128') {
    return { value: trimmed.slice(0, 80), format: 'CODE128' };
  }

  if (formatPreference === 'CODE39') {
    return { value: trimmed.slice(0, 43).toUpperCase(), format: 'CODE39' };
  }

  if (formatPreference === 'EAN13') {
    if (/^\d{12}$/.test(trimmed)) {
      return {
        value: trimmed + String(computeEan13CheckDigit(trimmed)),
        format: 'EAN13',
      };
    }
    if (/^\d{13}$/.test(trimmed)) {
      return { value: fixEan13Checksum(trimmed), format: 'EAN13' };
    }
    return { value: trimmed.slice(0, 80), format: 'CODE128' };
  }

  if (formatPreference === 'EAN8') {
    if (/^\d{7}$/.test(trimmed)) {
      return {
        value: trimmed + String(computeEan8CheckDigit(trimmed)),
        format: 'EAN8',
      };
    }
    if (/^\d{8}$/.test(trimmed)) {
      return { value: fixEan8Checksum(trimmed), format: 'EAN8' };
    }
    return { value: trimmed.slice(0, 80), format: 'CODE128' };
  }

  return normalizeAutoBarcode(trimmed);
}

export function resolveBarcodeFormat(barcode: string): JsBarcodeFormat {
  return normalizeBarcodeForPrint(barcode).format;
}

function quietZoneForFormat(format: JsBarcodeFormat, narrow: boolean): number {
  if (format === 'EAN13' || format === 'EAN8') return narrow ? 6 : 10;
  return narrow ? 4 : 8;
}

function isFixedWidthBarcodeFormat(format: JsBarcodeFormat): boolean {
  return format === 'EAN13' || format === 'EAN8';
}

/** JsBarcode seçenekleri — `variantCode` barkod altı metni için (EAN-13’te sadece displayValue). */
export function buildJsBarcodeOptions(
  encodeValue: string,
  variantCode: string,
  captionMode: BarcodeCaptionMode,
  size: { width: number; height: number },
  format: JsBarcodeFormat,
): Record<string, unknown> {
  const narrow = size.width < 50;
  const low = size.height < 30;
  const mid = size.height < 50;
  /** Fiziksel okuyucular için quiet zone (margin 0 okumayı bozuyordu). */
  const quietZone = quietZoneForFormat(format, narrow);
  /** Yazdırmada çubuk ve rakamların okunması için modül yüksekliği / font biraz büyük tutulur. */
  const base: Record<string, unknown> = {
    format,
    width: narrow ? 2 : 2.5,
    height: low ? 24 : mid ? 34 : 46,
    margin: quietZone,
    fontSize: narrow ? 11 : 13,
    font: 'monospace',
    fontOptions: 'bold',
    textMargin: 2,
  };
  if (captionMode === 'none') {
    return { ...base, displayValue: false };
  }
  if (format === 'EAN13' || format === 'EAN8') {
    return { ...base, displayValue: true };
  }
  if (captionMode === 'variantCode') {
    return { ...base, displayValue: true, text: (variantCode || encodeValue).slice(0, 80) };
  }
  if (captionMode === 'both') {
    const line = [encodeValue, variantCode].filter(Boolean).join(' · ');
    return { ...base, displayValue: true, text: line.slice(0, 80) };
  }
  return { ...base, displayValue: true, text: encodeValue };
}

/** Canvas veya SVG üzerine barkod çizer. */
export function paintJsBarcode(
  target: HTMLCanvasElement | SVGSVGElement,
  barcode: string,
  variantCode: string,
  captionMode: BarcodeCaptionMode,
  size: { width: number; height: number },
  formatPreference: BarcodePrintFormat = 'auto',
): void {
  const raw = barcode.trim();
  if (!raw) return;
  const { value: encodeValue, format } = normalizeBarcodeForPrint(raw, formatPreference);
  if (!encodeValue) return;
  const opts = buildJsBarcodeOptions(encodeValue, variantCode, captionMode, size, format);
  try {
    JsBarcode(target, encodeValue, opts as Parameters<typeof JsBarcode>[2]);
  } catch (firstErr) {
    if (isFixedWidthBarcodeFormat(format)) {
      try {
        JsBarcode(target, encodeValue, {
          ...opts,
          format: 'CODE128',
          margin: narrowQuietZone(size),
        } as Parameters<typeof JsBarcode>[2]);
        return;
      } catch {
        /* fall through */
      }
    }
    console.error('Barkod oluşturma hatası:', firstErr);
  }
}

function narrowQuietZone(size: { width: number; height: number }): number {
  return size.width < 50 ? 4 : 8;
}
