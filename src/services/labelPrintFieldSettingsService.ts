/**
 * Profesyonel / toplu etiket yazdırmada hangi alanların görüneceği — `app_settings` (firma bazlı).
 */
import { postgres, ERP_SETTINGS } from './postgres';

const KEY_LABEL_PRINT_FIELDS = 'label_print_field_settings';

export type BarcodeCaptionMode = 'barcode' | 'variantCode' | 'both' | 'none';

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

/** JsBarcode seçenekleri — `variantCode` barkod altı metni için (EAN-13’te sadece displayValue). */
export function buildJsBarcodeOptions(
  barcode: string,
  variantCode: string,
  captionMode: BarcodeCaptionMode,
  size: { width: number; height: number }
): Record<string, unknown> {
  const isEan13 = barcode.length === 13 && /^\d{13}$/.test(barcode);
  const fmt = isEan13 ? 'EAN13' : 'CODE128';
  const narrow = size.width < 50;
  const low = size.height < 30;
  const mid = size.height < 50;
  /** Yazdırmada çubuk ve rakamların okunması için modül yüksekliği / font biraz büyük tutulur. */
  const base: Record<string, unknown> = {
    format: fmt,
    width: narrow ? 2 : 2.5,
    height: low ? 24 : mid ? 34 : 46,
    margin: 0,
    fontSize: narrow ? 11 : 13,
    font: 'monospace',
    fontOptions: 'bold',
    textMargin: 2,
  };
  if (captionMode === 'none') {
    return { ...base, displayValue: false };
  }
  if (fmt === 'EAN13') {
    return { ...base, displayValue: true };
  }
  if (captionMode === 'variantCode') {
    return { ...base, displayValue: true, text: (variantCode || barcode).slice(0, 80) };
  }
  if (captionMode === 'both') {
    const line = [barcode, variantCode].filter(Boolean).join(' · ');
    return { ...base, displayValue: true, text: line.slice(0, 80) };
  }
  return { ...base, displayValue: true, text: barcode };
}
