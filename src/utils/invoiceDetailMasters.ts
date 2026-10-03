/**
 * Fatura Detaylar seçicileri: satış elemanı / işyeri / extra depo.
 * Yalnızca kiracının oluşturduğu kayıtlar; hardcoded SAT001 vb. yok.
 */

import { postgres, ERP_SETTINGS } from '../services/postgres';
import { warehouseAPI } from '../services/warehouseAPI';
import { organizationAPI } from '../services/api/organization';
import { isDemoInvoiceHeaderPartyValue } from './invoiceHeaderFields';

export type InvoicePickerMaster = {
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  /**
   * Liste kaynağı: 'salesperson' (sales_reps tablosu) veya 'cashier'
   * (auth.users / public.users role=cashier). UI rozet rengi için kullanılır.
   * Belirlenmezse 'salesperson' varsayılır (geriye dönük uyumlu).
   */
  source?: 'salesperson' | 'cashier';
};

/** InvoiceSalespersonModal eski mock listesi — 001_demo_data.sql değil. */
const DEMO_SALESPERSON_CODES = new Set(['SAT001', 'SAT002', 'SAT003', 'SAT004']);
const DEMO_SALESPERSON_EMAILS = new Set([
  'ahmed@example.com',
  'mohammed@example.com',
  'fatima@example.com',
  'omar@example.com',
]);
const DEMO_SALESPERSON_NAMES = new Set([
  'ahmed yılmaz',
  'mohammed ali',
  'fatima hassan',
  'omar kader',
]);

const DEMO_WAREHOUSE_PAIRS = new Set([
  '000|merkez',
  '001|depo 1',
  '002|depo 2',
  '003|depo 3',
]);

const DEMO_WORKPLACE_PAIRS = new Set([
  '000|merkez',
  '001|şube 1',
  '002|şube 2',
  '003|şube 3',
]);

function normCode(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function normName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR');
}

export function isHardcodedDemoSalespersonRow(row: {
  code?: string;
  name?: string;
  email?: string;
}): boolean {
  const code = normCode(row.code);
  if (DEMO_SALESPERSON_CODES.has(code)) return true;
  const email = String(row.email ?? '').trim().toLowerCase();
  if (email && DEMO_SALESPERSON_EMAILS.has(email)) return true;
  const name = normName(row.name);
  if (name && DEMO_SALESPERSON_NAMES.has(name)) return true;
  return isDemoInvoiceHeaderPartyValue(row.code);
}

export function isHardcodedDemoWarehouseRow(row: { code?: string; name?: string }): boolean {
  const pair = `${normCode(row.code)}|${normName(row.name)}`;
  if (DEMO_WAREHOUSE_PAIRS.has(pair)) return true;
  return isDemoInvoiceHeaderPartyValue(`${row.code ?? ''}, ${row.name ?? ''}`);
}

export function isHardcodedDemoWorkplaceRow(row: { code?: string; name?: string }): boolean {
  const pair = `${normCode(row.code)}|${normName(row.name)}`;
  if (DEMO_WORKPLACE_PAIRS.has(pair)) return true;
  return isDemoInvoiceHeaderPartyValue(`${row.code ?? ''}, ${row.name ?? ''}`);
}

function keepMaster(row: { code?: string; name?: string } | null | undefined): boolean {
  return Boolean(row && String(row.code ?? '').trim() && String(row.name ?? '').trim());
}

/** rex_{firm}_sales_reps — postgres.query tablo adını önekler. */
export async function listInvoiceSalespersons(): Promise<InvoicePickerMaster[]> {
  try {
    const { rows } = await postgres.query<InvoicePickerMaster>(
      `SELECT code, name, phone, email
       FROM sales_reps
       WHERE COALESCE(is_active, true) = true
       ORDER BY name ASC`,
    );
    return (rows || [])
      .filter(keepMaster)
      .filter((r) => !isHardcodedDemoSalespersonRow(r))
      .map((r) => ({ ...r, source: 'salesperson' as const }));
  } catch {
    return [];
  }
}

/**
 * `public.users` tablosundan role='cashier' (veya eş anlamlı) kullanıcıları
 * InvoicePickerMaster formatında getirir. sales_reps tablosu boş olduğunda
 * kasiyer seçimi için fallback kaynak olarak kullanılır.
 *
 * Neden `public.users`:
 *   - Master şemada `auth.users` SADECE `id UUID` kolonuna sahiptir; `username`,
 *     `full_name`, `role` kolonları yoktur (`reset-guzel-db.mjs` yalnızca web
 *     login için `raw_user_meta_data` ekler). Bu yüzden önceki `auth.users`
 *     sorgusu her zaman hata verip boş dönüyordu.
 *   - Tüm `src/services/*` kullanıcı listeleme sorguları `public.users`
 *     üzerinden gider (`firm_nr`, `is_active`, `role` burada).
 *
 * Multi-tenant: aktif firma filtresi (ERP_SETTINGS.firmNr) uygulanır.
 */
export async function listCashierRoleUsers(): Promise<InvoicePickerMaster[]> {
  try {
    // cashier rolü + boş/yer tutucu roller; 'admin' gibi üst düzey rolleri
    // kasıtlı olarak DAHİL ETMİYORUZ — kasiyer listesi operasyonel kullanıcılar.
    const firmNr = String(ERP_SETTINGS.firmNr || '').trim();
    const { rows } = await postgres.query<{
      code: string;
      name: string;
      phone?: string | null;
      email?: string | null;
    }>(
      `SELECT
         id::text AS code,
         COALESCE(
           NULLIF(TRIM(full_name), ''),
           NULLIF(TRIM(username), ''),
           NULLIF(TRIM(email), ''),
           'Kullanıcı-' || SUBSTRING(id::text, 1, 8)
         ) AS name,
         phone,
         email
       FROM public.users
       WHERE COALESCE(role, 'cashier') IN ('cashier', 'kasiyer', 'sales', 'satis', '')
         AND COALESCE(is_active, true) = true
         AND ($1 = '' OR LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0')
              = LPAD(TRIM($1), 3, '0'))
       ORDER BY name ASC`,
      [firmNr],
    );
    return (rows || [])
      .filter((r) => keepMaster(r))
      .map((r) => ({
        code: String(r.code || '').trim(),
        name: String(r.name || '').trim(),
        phone: r.phone ? String(r.phone) : undefined,
        email: r.email ? String(r.email) : undefined,
        source: 'cashier' as const,
      }));
  } catch {
    return [];
  }
}

/** Satış elemanı hızlı ekleme (fatura seçim modalı). */
export async function createInvoiceSalesperson(input: {
  code: string;
  name: string;
  phone?: string;
}): Promise<InvoicePickerMaster> {
  const code = String(input.code || '').trim();
  const name = String(input.name || '').trim();
  if (!code || !name) throw new Error('Kod ve ad zorunlu');
  const firmNr = String(ERP_SETTINGS.firmNr || '').trim();
  const { rows } = await postgres.query<InvoicePickerMaster>(
    `INSERT INTO sales_reps (firm_nr, code, name, phone, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING code, name, phone, email`,
    [firmNr, code, name, input.phone?.trim() || null],
  );
  const row = rows?.[0];
  if (!row) throw new Error('Satış elemanı oluşturulamadı');
  return row;
}

export async function listInvoiceWarehouses(): Promise<InvoicePickerMaster[]> {
  try {
    const rows = await warehouseAPI.getActive();
    return (rows || [])
      .filter((r) => keepMaster(r))
      .filter((r) => !isHardcodedDemoWarehouseRow(r))
      .map((r) => ({
        code: r.code,
        name: r.name,
        address: r.address,
      }));
  } catch {
    return [];
  }
}

export async function listInvoiceWorkplaces(): Promise<InvoicePickerMaster[]> {
  try {
    const firmNr = String(ERP_SETTINGS.firmNr || '').trim();
    if (!firmNr) return [];
    const rows = await organizationAPI.getStoresByFirmNr(firmNr);
    return (rows || [])
      .filter((r) => keepMaster(r))
      .filter((r) => !isHardcodedDemoWorkplaceRow(r))
      .map((r) => ({
        code: r.code,
        name: r.name,
      }));
  } catch {
    return [];
  }
}

/** Fatura seçici etiketi: `KOD, Ad` (modal onSelect ile aynı). */
export function formatInvoiceMasterLabel(code?: unknown, name?: unknown): string {
  const c = String(code ?? '').trim();
  const n = String(name ?? '').trim();
  if (!c || !n) return '';
  return `${c}, ${n}`;
}

function labelFromPreferredStore(
  preferred: { code?: string | null; nr?: number | null; name?: string | null } | null | undefined,
  kind: 'warehouse' | 'workplace',
): string {
  if (!preferred) return '';
  const code = String(preferred.code ?? (preferred.nr != null ? preferred.nr : '')).trim();
  const name = String(preferred.name ?? '').trim();
  if (!code || !name) return '';
  const row = { code, name };
  if (kind === 'warehouse' && isHardcodedDemoWarehouseRow(row)) return '';
  if (kind === 'workplace' && isHardcodedDemoWorkplaceRow(row)) return '';
  return formatInvoiceMasterLabel(code, name);
}

/** Yeni fatura: oturum ambarı veya ilk aktif depo. */
export async function resolveDefaultInvoiceWarehouseLabel(
  preferred?: { code?: string | null; nr?: number | null; name?: string | null } | null,
): Promise<string> {
  const fromPreferred = labelFromPreferredStore(preferred, 'warehouse');
  if (fromPreferred) return fromPreferred;
  const rows = await listInvoiceWarehouses();
  const first = rows[0];
  return first ? formatInvoiceMasterLabel(first.code, first.name) : '';
}

/** Yeni fatura: oturum şubesi / BRANCH tipi mağaza veya ilk aktif işyeri. */
export async function resolveDefaultInvoiceWorkplaceLabel(
  preferred?: { code?: string | null; nr?: number | null; name?: string | null } | null,
): Promise<string> {
  const fromPreferred = labelFromPreferredStore(preferred, 'workplace');
  if (fromPreferred) return fromPreferred;
  try {
    const firmNr = String(ERP_SETTINGS.firmNr || '').trim();
    if (!firmNr) return '';
    const rows = await organizationAPI.getStoresByFirmNr(firmNr);
    const usable = (rows || [])
      .filter((r) => keepMaster(r))
      .filter((r) => !isHardcodedDemoWorkplaceRow(r));
    const branch = usable.find((r) => String(r.type || '').toUpperCase() === 'BRANCH');
    const pick = branch || usable[0];
    return pick ? formatInvoiceMasterLabel(pick.code, pick.name) : '';
  } catch {
    const rows = await listInvoiceWorkplaces();
    const first = rows[0];
    return first ? formatInvoiceMasterLabel(first.code, first.name) : '';
  }
}
