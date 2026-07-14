import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPost } from './postgrestClient';
import { firmNr, newUuid, suppliersTable } from './erpTables';
import { shouldUseLiveData, getNetworkPolicy } from '../offline/policy';
import {
  shouldPreferPostgrest,
  shouldUseBridgeSql,
  useConfigStore,
} from '../store/configStore';
import type { CustomerInput } from '../offline/mutationQueue';

export type SupplierRow = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  balance: number;
  is_active: boolean;
};

/** Tedarikçi yazma — CustomerInput ile aynı alanlar */
export type SupplierInput = CustomerInput;

async function fetchSuppliersViaPostgrest(search = '', limit = 200): Promise<SupplierRow[]> {
  const table = suppliersTable();
  const fn = firmNr();
  const fnBare = fn.replace(/^0+/, '') || fn;
  const firmOr = [...Array.from(new Set([fn, fnBare].filter(Boolean))).map((f) => `firm_nr.eq.${f}`), 'firm_nr.is.null'].join(
    ',',
  );

  const query: Record<string, string | number> = {
    select: 'id,code,name,phone,email,city,balance,is_active',
    order: 'name.asc',
    limit,
    or: `(${firmOr})`,
  };

  const q = escapeIlike(search.trim());
  if (q.length >= 1) {
    query.and = `(or(${firmOr}),or(name.ilike.*${q}*,code.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*))`;
    delete query.or;
  }

  const rows = await postgrestGet<Record<string, unknown>[]>(`/${table}`, query, {
    schema: 'public',
  });
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({
      id: String(r.id ?? ''),
      code: r.code != null ? String(r.code) : null,
      name: String(r.name ?? ''),
      phone: r.phone != null ? String(r.phone) : null,
      email: r.email != null ? String(r.email) : null,
      city: r.city != null ? String(r.city) : null,
      balance: Number(r.balance) || 0,
      is_active: !(
        r.is_active === false ||
        r.is_active === 0 ||
        String(r.is_active).toLowerCase() === 'false'
      ),
    }))
    .filter((r) => r.is_active && r.id);
}

function escapeIlike(q: string): string {
  return q.replace(/[%_*(),]/g, '');
}

async function fetchSuppliersLive(search = '', limit = 200): Promise<SupplierRow[]> {
  const cfg = useConfigStore.getState().config;
  if (shouldPreferPostgrest(cfg)) {
    try {
      return await fetchSuppliersViaPostgrest(search, limit);
    } catch (e) {
      if (!shouldUseBridgeSql(cfg)) throw e;
    }
  }
  if (!shouldUseBridgeSql(cfg)) {
    throw new Error(
      shouldPreferPostgrest(cfg)
        ? 'PostgREST tedarikçi okuma başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }
  return fetchSuppliersLiveBridge(search, limit);
}

async function fetchSuppliersLiveBridge(search = '', limit = 200): Promise<SupplierRow[]> {
  const table = suppliersTable();
  const fn = firmNr();
  const q = search.trim();

  const baseSelect = `
    SELECT id, code, name, phone, email, city,
           COALESCE(balance, 0)::float8 AS balance,
           COALESCE(is_active, true) AS is_active
    FROM ${table}
  `;

  if (q.length >= 1) {
    const like = `%${q}%`;
    const res = await pgQuery<SupplierRow>(
      `${baseSelect}
       WHERE COALESCE(is_active, true) = true
         AND (
           name ILIKE $1 OR code ILIKE $1 OR COALESCE(phone,'') ILIKE $1
           OR COALESCE(email,'') ILIKE $1
         )
         AND (
           LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $2
           OR TRIM(COALESCE(firm_nr, '')) = $3
           OR firm_nr IS NULL
         )
       ORDER BY name ASC
       LIMIT $4`,
      [like, fn, fn.replace(/^0+/, '') || fn, limit],
    );
    return res.rows;
  }

  const res = await pgQuery<SupplierRow>(
    `${baseSelect}
     WHERE COALESCE(is_active, true) = true
       AND (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
     ORDER BY name ASC
     LIMIT $3`,
    [fn, fn.replace(/^0+/, '') || fn, limit],
  );
  return res.rows;
}

/** Alış / alış iade formu için tedarikçi listesi */
export async function fetchSuppliers(search = '', limit = 200): Promise<SupplierRow[]> {
  if (!shouldUseLiveData()) {
    return [];
  }
  try {
    return await fetchSuppliersLive(search, limit);
  } catch (e) {
    if (getNetworkPolicy() === 'online') throw e;
    return [];
  }
}

/** Web supplierAPI.generateCode — T001 deseni (mobil müşteri M001 ile simetrik) */
export async function generateSupplierCode(): Promise<string> {
  if (!shouldUseLiveData()) {
    return `T${Date.now().toString().slice(-3)}`;
  }

  const table = suppliersTable();
  const fn = firmNr();
  const cfg = useConfigStore.getState().config;

  if (shouldPreferPostgrest(cfg)) {
    try {
      const rows = await postgrestGet<{ code?: string }[]>(
        `/${table}`,
        {
          select: 'code',
          code: 'like.T*',
          order: 'code.desc',
          limit: 1,
          or: `(firm_nr.eq.${fn},firm_nr.is.null)`,
        },
        { schema: 'public' },
      );
      const last = Array.isArray(rows) ? rows[0]?.code : undefined;
      if (!last) return 'T001';
      const num = parseInt(String(last).replace(/^T/i, ''), 10);
      if (Number.isNaN(num)) return 'T001';
      return `T${String(num + 1).padStart(3, '0')}`;
    } catch {
      /* bridge fallback */
    }
  }

  if (!shouldUseBridgeSql(cfg) && shouldPreferPostgrest(cfg)) {
    return `T${Date.now().toString().slice(-3)}`;
  }

  try {
    const res = await pgQuery<{ code: string | null }>(
      `SELECT code FROM ${table}
       WHERE (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
       AND code LIKE 'T%'
       ORDER BY code DESC
       LIMIT 1`,
      [fn, fn.replace(/^0+/, '') || fn],
    );
    const last = res.rows[0]?.code;
    if (!last) return 'T001';
    const num = parseInt(String(last).slice(1), 10);
    if (Number.isNaN(num)) return 'T001';
    return `T${String(num + 1).padStart(3, '0')}`;
  } catch {
    return `T${Date.now().toString().slice(-3)}`;
  }
}

async function createSupplierViaPostgrest(input: SupplierInput, id: string): Promise<string> {
  const table = suppliersTable();
  const fn = firmNr();
  const code = (input.code || '').trim() || (await generateSupplierCode());
  const body: Record<string, unknown> = {
    id,
    firm_nr: fn,
    code,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    district: input.district?.trim() || null,
    tax_nr: input.tax_nr?.trim() || null,
    tax_office: input.tax_office?.trim() || null,
    notes: input.notes?.trim() || null,
    is_active: true,
    balance: 0,
  };
  const rows = await postgrestPost<Record<string, unknown>[]>(`/${table}`, body, {
    schema: 'public',
    prefer: 'return=representation',
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.id != null ? String(row.id) : id;
}

async function createSupplierViaBridge(input: SupplierInput, id: string): Promise<string> {
  const table = suppliersTable();
  const fn = firmNr();
  const code = (input.code || '').trim() || (await generateSupplierCode());

  await pgQuery(
    `INSERT INTO ${table} (
       id, firm_nr, code, name, phone, email, address, city, district,
       tax_nr, tax_office, notes, is_active, balance
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9,
       $10, $11, $12, true, 0
     )`,
    [
      id,
      fn,
      code,
      input.name.trim(),
      input.phone?.trim() || null,
      input.email?.trim() || null,
      input.address?.trim() || null,
      input.city?.trim() || null,
      input.district?.trim() || null,
      input.tax_nr?.trim() || null,
      input.tax_office?.trim() || null,
      input.notes?.trim() || null,
    ],
  );
  return id;
}

/** Tedarikçi cari oluştur — PostgREST tercih, bridge fallback */
export async function createSupplier(input: SupplierInput, opts?: { id?: string }): Promise<string> {
  const id = opts?.id || newUuid();
  if (!input.name?.trim()) throw new Error('Tedarikçi adı zorunludur');

  const cfg = useConfigStore.getState().config;
  const preferRest = shouldPreferPostgrest(cfg);
  const canBridge = shouldUseBridgeSql(cfg);

  if (preferRest) {
    try {
      return await createSupplierViaPostgrest(input, id);
    } catch (e) {
      if (!canBridge) throw e;
    }
  }

  if (!canBridge) {
    throw new Error(
      preferRest
        ? 'PostgREST tedarikçi kaydı başarısız ve bridge kapalı (apiMode=postgrest)'
        : 'Bridge yapılandırması eksik',
    );
  }

  return createSupplierViaBridge(input, id);
}
