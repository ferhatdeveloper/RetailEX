/**
 * Cari kart tablolarına yazılabilir kolonlar (tenant şema farklarına karşı güvenli PATCH/POST).
 */
import type { Supplier } from '../../core/types';

const CUSTOMER_DB_COLUMNS = new Set([
  'code',
  'name',
  'phone',
  'phone2',
  'email',
  'address',
  'city',
  'district',
  'neighborhood',
  'tax_nr',
  'tax_office',
  'notes',
  'is_active',
  'balance',
  'points',
  'gender',
  'customer_tier',
  'heard_from',
  'file_id',
  'age',
  'occupation',
  'call_plan_enabled',
  'call_plan_weekdays',
  'call_plan_note',
  'call_last_status',
  'call_last_note',
  'call_last_at',
  'firm_nr',
]);

const SUPPLIER_DB_COLUMNS = new Set([
  'code',
  'name',
  'phone',
  'email',
  'address',
  'city',
  'district',
  'neighborhood',
  'tax_nr',
  'tax_office',
  'notes',
  'is_active',
  'balance',
  'contact_person',
  'contact_person_phone',
  'payment_terms',
  'credit_limit',
  'firm_nr',
]);

function formKeyToDbColumn(key: string): string | null {
  if (key === 'tax_number' || key === 'taxNumber') return 'tax_nr';
  if (key === 'tax_office' || key === 'taxOffice') return 'tax_office';
  if (key === 'cardType' || key === 'id' || key === 'created_at' || key === 'updated_at') return null;
  if (key === 'postal_code') return null;
  if (key === 'country') return null;
  return key;
}

/** PostgREST / INSERT gövdesi — yalnızca hedef tabloda olan kolonlar */
export function buildCariDbPayload(
  account: Partial<Supplier> & Record<string, unknown>,
  cardType: 'customer' | 'supplier',
  options?: { includeFirmNr?: boolean; forceActive?: boolean },
): Record<string, unknown> {
  const allowed = cardType === 'supplier' ? SUPPLIER_DB_COLUMNS : CUSTOMER_DB_COLUMNS;
  const body: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(account)) {
    if (value === undefined) continue;
    const col = formKeyToDbColumn(key);
    if (!col || !allowed.has(col)) continue;
    body[col] = value;
  }

  if (options?.forceActive) body.is_active = true;
  if (options?.includeFirmNr && allowed.has('firm_nr') && body.firm_nr == null) {
    body.firm_nr = account.firm_nr;
  }

  return body;
}

export function supplierOnlyFieldsFromAccount(account: Partial<Supplier>): Partial<Supplier> {
  const payload = buildCariDbPayload(account, 'supplier');
  return payload as Partial<Supplier>;
}
