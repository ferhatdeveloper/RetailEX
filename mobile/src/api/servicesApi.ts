/**
 * Hizmet kartları — web `src/services/serviceAPI.ts` parity (rex_{firm}_services).
 */
import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
import { servicesTable } from './erpTables';

export type ServiceRow = {
  id: string;
  code: string | null;
  name: string;
  unit: string | null;
  unit_price: number;
  purchase_price: number;
  tax_rate: number;
  is_active: boolean;
  category: string | null;
};

function mapRow(r: Record<string, unknown>): ServiceRow {
  const tax = Number(r.tax_rate);
  return {
    id: String(r.id ?? ''),
    code: r.code != null ? String(r.code) : null,
    name: String(r.name ?? ''),
    unit: r.unit != null ? String(r.unit) : null,
    unit_price: Number(r.unit_price) || 0,
    purchase_price: Number(r.purchase_price) || 0,
    tax_rate: tax >= 0 ? tax : 18,
    is_active: !(
      r.is_active === false ||
      r.is_active === 0 ||
      String(r.is_active).toLowerCase() === 'false'
    ),
    category: r.category != null ? String(r.category) : null,
  };
}

function escapeIlike(q: string): string {
  return q.replace(/[%_*(),]/g, '');
}

async function fetchServicesViaRest(search: string, lim: number): Promise<ServiceRow[]> {
  const table = servicesTable();
  const query: Record<string, string | number> = {
    select: 'id,code,name,unit,unit_price,purchase_price,tax_rate,is_active,category',
    is_active: 'eq.true',
    order: 'name.asc',
    limit: lim,
  };
  const q = escapeIlike(search.trim());
  if (q.length >= 1) {
    query.or = `(name.ilike.*${q}*,code.ilike.*${q}*,category.ilike.*${q}*)`;
  }
  const rows = await postgrestGet<Record<string, unknown>[]>(`/${table}`, query, {
    schema: 'public',
  });
  return (Array.isArray(rows) ? rows : []).map(mapRow).filter((r) => r.is_active && r.id);
}

async function fetchServicesViaBridge(search: string, lim: number): Promise<ServiceRow[]> {
  const table = servicesTable();
  const q = search.trim();
  if (q) {
    const like = `%${q}%`;
    const res = await pgQuery<Record<string, unknown>>(
      `SELECT id, code, name, unit,
              COALESCE(unit_price, 0)::float8 AS unit_price,
              COALESCE(purchase_price, 0)::float8 AS purchase_price,
              COALESCE(tax_rate, 18)::float8 AS tax_rate,
              COALESCE(is_active, true) AS is_active,
              category
       FROM ${table}
       WHERE COALESCE(is_active, true) = true
         AND (
           COALESCE(name,'') ILIKE $1
           OR COALESCE(code,'') ILIKE $1
           OR COALESCE(category,'') ILIKE $1
         )
       ORDER BY name ASC NULLS LAST
       LIMIT $2`,
      [like, lim],
    );
    return res.rows.map(mapRow);
  }

  const res = await pgQuery<Record<string, unknown>>(
    `SELECT id, code, name, unit,
            COALESCE(unit_price, 0)::float8 AS unit_price,
            COALESCE(purchase_price, 0)::float8 AS purchase_price,
            COALESCE(tax_rate, 18)::float8 AS tax_rate,
            COALESCE(is_active, true) AS is_active,
            category
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
     ORDER BY name ASC NULLS LAST
     LIMIT $1`,
    [lim],
  );
  return res.rows.map(mapRow);
}

/** Aktif hizmet kartı ara — fatura hizmet kalemi picker */
export async function fetchServices(search = '', limit = 40): Promise<ServiceRow[]> {
  const lim = Math.min(Math.max(limit, 1), 100);
  try {
    return await runDataTransport({
      label: 'fetchServices',
      viaRest: () => fetchServicesViaRest(search, lim),
      viaBridge: () => fetchServicesViaBridge(search, lim),
    });
  } catch (e) {
    rethrowTransportInfra(e, 'fetchServices');
    /* tablo yoksa boş */
    return [];
  }
}
