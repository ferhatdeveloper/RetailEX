/**
 * Fatura kod formatı — app_settings (key=invoice_code_formats, firma bazlı).
 * Format yoksa null döner; çağıran mevcut damgayı kullanır.
 */
import { postgres, ERP_SETTINGS } from './postgres';
import {
  INVOICE_CODE_FORMAT_SETTINGS_KEY,
  compileInvoiceCodePattern,
  formatInvoiceCode,
  nextInvoiceSequenceFromCodes,
  resolveInvoiceCodePattern,
  type InvoiceCodeFormatsSettings,
} from '../utils/invoiceCodeFormat';

function firmNrOf(firmNr?: string): string {
  return String(firmNr || ERP_SETTINGS.firmNr || '001').trim() || '001';
}

function periodNrOf(periodNr?: string): string {
  return String(periodNr || ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
}

export async function getInvoiceCodeFormats(firmNr?: string): Promise<InvoiceCodeFormatsSettings> {
  const fn = firmNrOf(firmNr);
  try {
    const { rows } = await postgres.query<{ value: InvoiceCodeFormatsSettings }>(
      `SELECT value FROM app_settings WHERE key = $1 AND firm_nr = $2`,
      [INVOICE_CODE_FORMAT_SETTINGS_KEY, fn]
    );
    if (rows.length > 0 && rows[0].value && typeof rows[0].value === 'object') {
      return rows[0].value as InvoiceCodeFormatsSettings;
    }
  } catch (e) {
    console.warn('[invoiceCodeFormat] getInvoiceCodeFormats failed', e);
  }
  return {};
}

export async function saveInvoiceCodeFormats(
  data: InvoiceCodeFormatsSettings,
  firmNr?: string
): Promise<void> {
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
    [INVOICE_CODE_FORMAT_SETTINGS_KEY, JSON.stringify(payload), fn]
  );
}

async function listMatchingFicheNos(
  likePrefix: string,
  firmNr: string,
  periodNr: string
): Promise<string[]> {
  try {
    const { rows } = await postgres.query<{ fiche_no: string }>(
      `SELECT fiche_no FROM sales
        WHERE fiche_no LIKE $1 ESCAPE '\\'
        LIMIT 8000`,
      [likePrefix],
      { firmNr, periodNr }
    );
    return (rows || []).map((r) => String(r.fiche_no || '')).filter(Boolean);
  } catch (e) {
    console.warn('[invoiceCodeFormat] listMatchingFicheNos failed', e);
    return [];
  }
}

async function ficheNoExists(ficheNo: string, firmNr: string, periodNr: string): Promise<boolean> {
  const code = String(ficheNo || '').trim();
  if (!code) return false;
  try {
    const { rows } = await postgres.query<{ id: string }>(
      `SELECT id FROM sales WHERE fiche_no::text = $1::text LIMIT 1`,
      [code],
      { firmNr, periodNr }
    );
    return (rows || []).length > 0;
  } catch (e) {
    console.warn('[invoiceCodeFormat] ficheNoExists failed', e);
    return false;
  }
}

/**
 * Tanımlı format varsa sıradaki benzersiz kodu üretir (firma+dönem sales).
 * Format yoksa null — çağıran YYYYMMDD damgasını korur.
 * Mevcut (posted dahil) numaralar atlanır; yeniden kullanılmaz.
 */
export async function allocateNextInvoiceCode(
  trcode: number | string | undefined | null,
  date: Date = new Date(),
  opts?: { firmNr?: string; periodNr?: string }
): Promise<string | null> {
  const settings = await getInvoiceCodeFormats(opts?.firmNr);
  const pattern = resolveInvoiceCodePattern(settings, trcode);
  const compiled = compileInvoiceCodePattern(pattern, date);
  if (!compiled) return null;

  const firmNr = firmNrOf(opts?.firmNr);
  const periodNr = periodNrOf(opts?.periodNr);
  const existing = await listMatchingFicheNos(compiled.likePrefix, firmNr, periodNr);
  let seq = nextInvoiceSequenceFromCodes(compiled, existing);

  for (let i = 0; i < 80; i += 1) {
    const candidate = formatInvoiceCode(compiled, seq);
    const taken = await ficheNoExists(candidate, firmNr, periodNr);
    if (!taken) return candidate;
    seq += 1n;
  }
  return formatInvoiceCode(compiled, seq);
}
