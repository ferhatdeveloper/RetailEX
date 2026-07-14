import { pgQuery } from './pgClient';
import { customersTable, firmNr } from './erpTables';

export type CustomerRow = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  balance: number;
  is_active: boolean;
};

export async function fetchCustomers(search = '', limit = 200): Promise<CustomerRow[]> {
  const table = customersTable();
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
    const res = await pgQuery<CustomerRow>(
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

  const res = await pgQuery<CustomerRow>(
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

export type CustomerDetail = CustomerRow & {
  address?: string | null;
  tax_no?: string | null;
  tax_office?: string | null;
  district?: string | null;
};

export async function fetchCustomerById(id: string): Promise<CustomerDetail | null> {
  if (!id) return null;
  const table = customersTable();
  try {
    const res = await pgQuery<CustomerDetail>(
      `SELECT id, code, name, phone, email, city,
              COALESCE(balance, 0)::float8 AS balance,
              COALESCE(is_active, true) AS is_active,
              address, tax_no, tax_office, district
       FROM ${table}
       WHERE id::text = $1
       LIMIT 1`,
      [id],
    );
    return res.rows[0] ?? null;
  } catch {
    const res = await pgQuery<CustomerDetail>(
      `SELECT id, code, name, phone, email, city,
              COALESCE(balance, 0)::float8 AS balance,
              COALESCE(is_active, true) AS is_active
       FROM ${table}
       WHERE id::text = $1
       LIMIT 1`,
      [id],
    );
    return res.rows[0] ?? null;
  }
}

/** Son satışlar — cari detay ekstresi (basit) */
export async function fetchCustomerRecentSales(
  customerId: string,
  limit = 20,
): Promise<{ id: string; fiche_no: string | null; date: string | null; net_amount: number }[]> {
  const { salesTable } = await import('./erpTables');
  const table = salesTable();
  try {
    const res = await pgQuery<{
      id: string;
      fiche_no: string | null;
      date: string | null;
      net_amount: number;
    }>(
      `SELECT id, fiche_no, date::text AS date,
              COALESCE(net_amount, total_net, 0)::float8 AS net_amount
       FROM ${table}
       WHERE customer_id::text = $1
         AND COALESCE(is_cancelled, false) = false
       ORDER BY date DESC NULLS LAST
       LIMIT $2`,
      [customerId, limit],
    );
    return res.rows;
  } catch {
    return [];
  }
}
