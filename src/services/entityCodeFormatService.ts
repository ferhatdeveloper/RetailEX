/**
 * Fatura / ürün / hizmet kod formatı — app_settings JSON.
 * Fatura mevcut invoice_code_formats anahtarını kullanır; ürün ve hizmet ayrı key.
 * Format yoksa null — çağıran mevcut varsayılanı korur (hizmet 000001, fatura damga, ürün PROD-tarih).
 */
import { postgres, ERP_SETTINGS } from './postgres';
import {
  INVOICE_CODE_FORMAT_SETTINGS_KEY,
  compileInvoiceCodePattern,
  formatInvoiceCode,
  generateDefaultInvoiceStamp,
  isInvoiceCodePatternDefined,
  nextInvoiceSequenceFromCodes,
  resolveInvoiceCodePattern,
  type InvoiceCodeFormatsSettings,
} from '../utils/invoiceCodeFormat';
import { allocateNextInvoiceCode, getInvoiceCodeFormats, saveInvoiceCodeFormats } from './invoiceCodeFormatService';

export type CodeFormatEntity = 'invoice' | 'product' | 'service';

export const PRODUCT_CODE_FORMAT_SETTINGS_KEY = 'product_code_formats';
export const SERVICE_CODE_FORMAT_SETTINGS_KEY = 'service_code_formats';

function settingsKey(entity: CodeFormatEntity): string {
  if (entity === 'invoice') return INVOICE_CODE_FORMAT_SETTINGS_KEY;
  if (entity === 'product') return PRODUCT_CODE_FORMAT_SETTINGS_KEY;
  return SERVICE_CODE_FORMAT_SETTINGS_KEY;
}

function firmNrOf(firmNr?: string): string {
  return String(firmNr || ERP_SETTINGS.firmNr || '001').trim() || '001';
}

function codeTable(entity: 'product' | 'service'): 'products' | 'services' {
  return entity === 'product' ? 'products' : 'services';
}

export async function getEntityCodeFormats(
  entity: CodeFormatEntity,
  firmNr?: string
): Promise<InvoiceCodeFormatsSettings> {
  if (entity === 'invoice') return getInvoiceCodeFormats(firmNr);
  const fn = firmNrOf(firmNr);
  try {
    const { rows } = await postgres.query<{ value: InvoiceCodeFormatsSettings }>(
      `SELECT value FROM app_settings WHERE key = $1 AND firm_nr = $2`,
      [settingsKey(entity), fn]
    );
    if (rows.length > 0 && rows[0].value && typeof rows[0].value === 'object') {
      return rows[0].value as InvoiceCodeFormatsSettings;
    }
  } catch (e) {
    console.warn('[entityCodeFormat] get failed', entity, e);
  }
  return {};
}

export async function saveEntityCodeFormats(
  entity: CodeFormatEntity,
  data: InvoiceCodeFormatsSettings,
  firmNr?: string
): Promise<void> {
  if (entity === 'invoice') {
    await saveInvoiceCodeFormats(data, firmNr);
    return;
  }
  const fn = firmNrOf(firmNr);
  const payload: InvoiceCodeFormatsSettings = {
    default: { pattern: String(data.default?.pattern || '').trim() },
    byType: {},
  };
  const byType = data.byType || {};
  for (const [k, v] of Object.entries(byType)) {
    const pattern = String(v?.pattern || '').trim();
    if (pattern) payload.byType![k] = { pattern };
  }
  await postgres.query(
    `INSERT INTO app_settings (key, value, firm_nr)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key, firm_nr) DO UPDATE SET value = $2::jsonb`,
    [settingsKey(entity), JSON.stringify(payload), fn]
  );
}

async function listMatchingCodes(
  entity: 'product' | 'service',
  likePrefix: string
): Promise<string[]> {
  const table = codeTable(entity);
  try {
    const { rows } = await postgres.query<{ code: string }>(
      `SELECT code FROM ${table}
        WHERE code LIKE $1 ESCAPE '\\'
        LIMIT 8000`,
      [likePrefix]
    );
    return (rows || []).map((r) => String(r.code || '')).filter(Boolean);
  } catch (e) {
    console.warn('[entityCodeFormat] listMatchingCodes failed', entity, e);
    return [];
  }
}

async function codeExists(entity: 'product' | 'service', code: string): Promise<boolean> {
  const trimmed = String(code || '').trim();
  if (!trimmed) return false;
  const table = codeTable(entity);
  try {
    const { rows } = await postgres.query<{ id: string }>(
      `SELECT id FROM ${table} WHERE code::text = $1::text LIMIT 1`,
      [trimmed]
    );
    return (rows || []).length > 0;
  } catch (e) {
    console.warn('[entityCodeFormat] codeExists failed', entity, e);
    return false;
  }
}

/**
 * Tanımlı format varsa sıradaki benzersiz kod.
 * Format yoksa null — çağıran mevcut varsayılanı kullanır.
 */
export async function allocateNextEntityCode(
  entity: CodeFormatEntity,
  typeCode?: number | string | null,
  date: Date = new Date()
): Promise<string | null> {
  if (entity === 'invoice') {
    return allocateNextInvoiceCode(typeCode, date);
  }
  const settings = await getEntityCodeFormats(entity);
  const pattern = resolveInvoiceCodePattern(settings, typeCode);
  const compiled = compileInvoiceCodePattern(pattern, date);
  if (!compiled) return null;

  const existing = await listMatchingCodes(entity, compiled.likePrefix);
  let seq = nextInvoiceSequenceFromCodes(compiled, existing);
  for (let i = 0; i < 80; i += 1) {
    const candidate = formatInvoiceCode(compiled, seq);
    const taken = await codeExists(entity, candidate);
    if (!taken) return candidate;
    seq += 1n;
  }
  return formatInvoiceCode(compiled, seq);
}

/** Format yokken mevcut ürün varsayılanı (PROD-YYYYMMDD-xxxx). */
export function generateDefaultProductCode(now: Date = new Date()): string {
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PROD-${dateStr}-${random}`;
}

export function generateDefaultInvoiceCode(now: Date = new Date()): string {
  return generateDefaultInvoiceStamp(now);
}

export { isInvoiceCodePatternDefined };
