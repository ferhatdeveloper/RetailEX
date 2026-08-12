import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
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

const REST_SELECT =
  'id,code,name,city,region,phone,manager_name,is_main,is_active';

function firmMatchParams(fn: string): [string, string] {
  return [fn, fn.replace(/^0+/, '') || fn];
}

function mapStoreRow(r: Record<string, unknown>): StoreMgmtRow {
  return {
    id: String(r.id ?? ''),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
    city: r.city != null ? String(r.city) : null,
    region: r.region != null ? String(r.region) : null,
    phone: r.phone != null ? String(r.phone) : null,
    manager_name: r.manager_name != null ? String(r.manager_name) : null,
    is_main: Boolean(r.is_main),
    is_active: !(
      r.is_active === false ||
      r.is_active === 0 ||
      String(r.is_active).toLowerCase() === 'false'
    ),
  };
}

/** PostgREST — mağaza listesi (firm_nr padded + bare) */
async function fetchStoreListViaRest(limit: number): Promise<StoreMgmtRow[]> {
  const fn = firmNr();
  const fnBare = fn.replace(/^0+/, '') || fn;
  const firmParts = Array.from(new Set([fn, fnBare].filter(Boolean)));
  const firmOr = firmParts.map((f) => `firm_nr.eq.${f}`).join(',');

  const rows = await postgrestGet<Record<string, unknown>[]>(
    '/stores',
    {
      select: REST_SELECT,
      or: `(${firmOr})`,
      order: 'is_main.desc,name.asc',
      limit,
    },
    { schema: 'public' },
  );

  return (Array.isArray(rows) ? rows : [])
    .map(mapStoreRow)
    .filter((r) => r.id);
}

async function fetchStoreListViaBridge(limit: number): Promise<StoreMgmtRow[]> {
  const fn = firmNr();
  const [rawFn, paddedFn] = firmMatchParams(fn);
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
}

export async function fetchStoreList(limit = 100): Promise<StoreMgmtRow[]> {
  try {
    return await runDataTransport({
      label: 'fetchStoreList',
      viaRest: () => fetchStoreListViaRest(limit),
      viaBridge: () => fetchStoreListViaBridge(limit),
    });
  } catch (e) {
    rethrowTransportInfra(e, 'fetchStoreList');
    return [];
  }
}
