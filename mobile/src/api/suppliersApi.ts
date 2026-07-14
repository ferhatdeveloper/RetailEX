import { pgQuery } from './pgClient';
import { firmNr, suppliersTable } from './erpTables';
import { shouldUseLiveData, getNetworkPolicy } from '../offline/policy';

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

async function fetchSuppliersLive(search = '', limit = 200): Promise<SupplierRow[]> {
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
