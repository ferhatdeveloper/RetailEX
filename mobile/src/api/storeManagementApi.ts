import { pgQuery } from './pgClient';
import { firmNr } from './erpTables';

export type StoreMgmtRow = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  region: string | null;
  phone: string | null;
  manager_name: string | null;
  is_main: boolean;
  is_active: boolean;
};

function firmMatchParams(fn: string): [string, string] {
  return [fn, fn.replace(/^0+/, '') || fn];
}

export async function fetchStoreList(limit = 100): Promise<StoreMgmtRow[]> {
  const fn = firmNr();
  const [rawFn, paddedFn] = firmMatchParams(fn);
  try {
    const res = await pgQuery<{
      id: string;
      code: string;
      name: string;
      city: string | null;
      region: string | null;
      phone: string | null;
      manager_name: string | null;
      is_main: boolean | null;
      is_active: boolean | null;
    }>(
      `SELECT id::text, code, name, city, region, phone, manager_name,
              COALESCE(is_main, false) AS is_main,
              COALESCE(is_active, true) AS is_active
       FROM public.stores
       WHERE (
         TRIM(COALESCE(firm_nr::text, '')) = TRIM($1::text)
         OR LPAD(TRIM(COALESCE(firm_nr::text, '')), 3, '0') = $2
       )
       ORDER BY COALESCE(is_main, false) DESC, name ASC
       LIMIT $3`,
      [rawFn, paddedFn, limit],
    );
    return res.rows.map((r) => ({
      id: String(r.id),
      code: String(r.code ?? ''),
      name: String(r.name ?? ''),
      city: r.city,
      region: r.region,
      phone: r.phone,
      manager_name: r.manager_name,
      is_main: Boolean(r.is_main),
      is_active: Boolean(r.is_active),
    }));
  } catch {
    return [];
  }
}
