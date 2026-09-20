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
    return (rows || []).filter(keepMaster).filter((r) => !isHardcodedDemoSalespersonRow(r));
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
