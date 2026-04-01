/**
 * Fiş / Firma bilgisi ve logo ayarları — app_settings tablosu üzerinden firma bazlı.
 */
import { postgres, ERP_SETTINGS } from './postgres';

export interface ReceiptSettings {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyTaxOffice?: string;
  companyTaxNumber?: string;
  /** Base64 data URL (data:image/png;base64,...) — fişte gösterilecek logo */
  logoDataUrl?: string;
}

const KEY_RECEIPT_SETTINGS = 'receipt_settings';

/** Aynı oturumda tekrar tekrar PG sorgusu önlemek (yazdırma hızı) */
const RECEIPT_SETTINGS_CACHE_MS = 5 * 60 * 1000;
let receiptSettingsMemoryCache: { firmKey: string; value: ReceiptSettings; at: number } | null = null;

export function invalidateReceiptSettingsCache(): void {
  receiptSettingsMemoryCache = null;
}

export async function getReceiptSettings(firmNr?: string): Promise<ReceiptSettings> {
  const fn = firmNr || ERP_SETTINGS.firmNr || '001';
  const now = Date.now();
  if (
    receiptSettingsMemoryCache &&
    receiptSettingsMemoryCache.firmKey === fn &&
    now - receiptSettingsMemoryCache.at < RECEIPT_SETTINGS_CACHE_MS
  ) {
    return receiptSettingsMemoryCache.value;
  }
  let result: ReceiptSettings = {};
  try {
    const { rows } = await postgres.query<{ value: ReceiptSettings }>(
      `SELECT value FROM app_settings WHERE key = $1 AND firm_nr = $2`,
      [KEY_RECEIPT_SETTINGS, fn]
    );
    if (rows.length > 0 && rows[0].value) {
      result = rows[0].value as ReceiptSettings;
    }
  } catch (e) {
    console.warn('[receiptSettings] getReceiptSettings failed', e);
  }
  receiptSettingsMemoryCache = { firmKey: fn, value: result, at: now };
  return result;
}

export async function saveReceiptSettings(data: ReceiptSettings, firmNr?: string): Promise<void> {
  const fn = firmNr || ERP_SETTINGS.firmNr || '001';
  try {
    await postgres.query(
      `INSERT INTO app_settings (key, value, firm_nr)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key, firm_nr) DO UPDATE SET value = $2::jsonb`,
      [KEY_RECEIPT_SETTINGS, JSON.stringify(data), fn]
    );
    invalidateReceiptSettingsCache();
  } catch (e) {
    console.error('[receiptSettings] saveReceiptSettings failed', e);
    throw e;
  }
}
