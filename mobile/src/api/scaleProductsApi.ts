/**
 * Terazi PLU aktarımı için tartı ürünleri (`is_scale_product`).
 */

import { pgQuery } from './pgClient';
import { postgrestGet } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { firmNr, productsTable } from './erpTables';
import type { RongtaPluPayload } from '../services/scale/rongtaBridge';

export type ScaleProductRow = {
  id: string;
  code: string | null;
  barcode: string | null;
  name: string;
  unit: string | null;
  price: number;
  vat_rate: number;
  plu_code: string | null;
  shelf_life_days: number | null;
  is_scale_product: boolean;
  is_active: boolean;
};

function firmNrOrFilter(): string {
  const fn = firmNr();
  const fnBare = fn.replace(/^0+/, '') || fn;
  const parts = Array.from(new Set([fn, fnBare].filter(Boolean)));
  return [...parts.map((f) => `firm_nr.eq.${f}`), 'firm_nr.is.null'].join(',');
}

function mapScaleProduct(r: Record<string, unknown>): ScaleProductRow {
  return {
    id: String(r.id ?? ''),
    code: r.code != null ? String(r.code) : null,
    barcode: r.barcode != null ? String(r.barcode) : null,
    name: String(r.name ?? ''),
    unit: r.unit != null ? String(r.unit) : null,
    price: Number(r.price ?? 0) || 0,
    vat_rate: Number(r.vat_rate ?? 20) || 20,
    plu_code: r.plu_code != null ? String(r.plu_code) : null,
    shelf_life_days: r.shelf_life_days != null ? Number(r.shelf_life_days) : null,
    is_scale_product: r.is_scale_product === true || String(r.is_scale_product) === 'true',
    is_active: !(r.is_active === false || String(r.is_active).toLowerCase() === 'false'),
  };
}

const WEIGHABLE_UNITS = new Set(['KG', 'GR', 'G', 'GRAM', 'LT', 'L', 'LITRE']);

function isWeighableUnit(unit: unknown): boolean {
  const u = String(unit ?? '')
    .trim()
    .toUpperCase()
    .replace(/İ/g, 'I');
  return WEIGHABLE_UNITS.has(u);
}

async function fetchScaleProductsViaRest(limit: number): Promise<ScaleProductRow[]> {
  const table = productsTable();
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select:
        'id,code,barcode,name,unit,price,vat_rate,plu_code,shelf_life_days,is_scale_product,is_active',
      is_active: 'eq.true',
      is_scale_product: 'eq.true',
      or: `(${firmNrOrFilter()})`,
      order: 'name.asc',
      limit: Math.min(limit * 2, 2000),
    },
    { schema: 'public' },
  );
  return (Array.isArray(rows) ? rows : [])
    .map(mapScaleProduct)
    .sort((a, b) => {
      const aPlu = (a.plu_code || '').trim();
      const bPlu = (b.plu_code || '').trim();
      if (!aPlu && bPlu) return 1;
      if (aPlu && !bPlu) return -1;
      return (a.plu_code || a.code || a.barcode || a.name).localeCompare(
        b.plu_code || b.code || b.barcode || b.name,
      );
    })
    .slice(0, limit);
}

async function fetchScaleProductsViaBridge(limit: number): Promise<ScaleProductRow[]> {
  const table = productsTable();
  const fn = firmNr();
  const res = await pgQuery<ScaleProductRow>(
    `SELECT id, code, barcode, name, unit,
            COALESCE(price, 0)::float8 AS price,
            COALESCE(vat_rate, 20)::float8 AS vat_rate,
            plu_code,
            shelf_life_days,
            COALESCE(is_scale_product, false) AS is_scale_product,
            COALESCE(is_active, true) AS is_active
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND COALESCE(is_scale_product, false) = true
       AND (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
     ORDER BY
       CASE WHEN NULLIF(TRIM(COALESCE(plu_code, '')), '') IS NULL THEN 1 ELSE 0 END,
       COALESCE(NULLIF(TRIM(plu_code), ''), code, barcode, name)
     LIMIT $3`,
    [fn, fn.replace(/^0+/, '') || fn, limit],
  );
  return res.rows;
}

export async function fetchScaleProducts(limit = 500): Promise<ScaleProductRow[]> {
  return runDataTransport({
    label: 'fetchScaleProducts',
    viaRest: () => fetchScaleProductsViaRest(limit),
    viaBridge: () => fetchScaleProductsViaBridge(limit),
  });
}

/** kg birimli veya is_scale_product ürünler — tartılı satış araması */
export async function searchWeighableProducts(
  search: string,
  limit = 40,
): Promise<ScaleProductRow[]> {
  return runDataTransport({
    label: 'searchWeighableProducts',
    viaRest: () => searchWeighableProductsViaRest(search, limit),
    viaBridge: () => searchWeighableProductsViaBridge(search, limit),
  });
}

async function searchWeighableProductsViaRest(
  search: string,
  limit: number,
): Promise<ScaleProductRow[]> {
  const table = productsTable();
  const q = search.trim();
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${table}`,
    {
      select:
        'id,code,barcode,name,unit,price,vat_rate,plu_code,shelf_life_days,is_scale_product,is_active',
      is_active: 'eq.true',
      or: `(${firmNrOrFilter()})`,
      order: 'name.asc',
      limit: Math.min(limit * 4, 500),
    },
    { schema: 'public' },
  );
  const like = q.toLowerCase();
  return (Array.isArray(rows) ? rows : [])
    .map(mapScaleProduct)
    .filter((p) => p.is_scale_product || isWeighableUnit(p.unit))
    .filter((p) => {
      if (!like) return true;
      const hay = `${p.name} ${p.code || ''} ${p.barcode || ''} ${p.plu_code || ''}`.toLowerCase();
      return hay.includes(like);
    })
    .sort((a, b) => {
      if (a.is_scale_product !== b.is_scale_product) return a.is_scale_product ? -1 : 1;
      return a.name.localeCompare(b.name, 'tr');
    })
    .slice(0, limit);
}

async function searchWeighableProductsViaBridge(
  search: string,
  limit: number,
): Promise<ScaleProductRow[]> {
  const table = productsTable();
  const fn = firmNr();
  const q = search.trim();
  const like = `%${q}%`;

  const res = await pgQuery<ScaleProductRow>(
    `SELECT id, code, barcode, name, unit,
            COALESCE(price, 0)::float8 AS price,
            COALESCE(vat_rate, 20)::float8 AS vat_rate,
            plu_code,
            shelf_life_days,
            COALESCE(is_scale_product, false) AS is_scale_product,
            COALESCE(is_active, true) AS is_active
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND (
         COALESCE(is_scale_product, false) = true
         OR UPPER(REPLACE(COALESCE(unit, ''), 'İ', 'I')) IN ('KG', 'GR', 'G', 'GRAM', 'LT', 'L', 'LITRE')
       )
       AND (
         LPAD(TRIM(COALESCE(firm_nr, '')), 3, '0') = $1
         OR TRIM(COALESCE(firm_nr, '')) = $2
         OR firm_nr IS NULL
       )
       AND (
         $3 = '' OR
         name ILIKE $4 OR code ILIKE $4 OR barcode ILIKE $4
         OR COALESCE(plu_code, '') ILIKE $4
       )
     ORDER BY CASE WHEN is_scale_product = true THEN 0 ELSE 1 END, name ASC
     LIMIT $5`,
    [fn, fn.replace(/^0+/, '') || fn, q, like, limit],
  );
  return res.rows;
}

export function scaleProductsToPluPayload(rows: ScaleProductRow[]): RongtaPluPayload[] {
  return rows.map((p, idx) => {
    const plu = (p.plu_code || p.code || p.barcode || String(idx + 1)).replace(/\D/g, '') || String(idx + 1);
    return {
      pluCode: plu.slice(-6),
      name: p.name.slice(0, 36),
      price: Number(p.price) || 0,
      unit: p.unit ?? 'KG',
      barcode: p.barcode ?? undefined,
      lfCode: plu.slice(-6),
      barcodeType: 99,
      department: 21,
      shelfDays: Math.max(0, Number(p.shelf_life_days) || 0),
      rank: idx + 1,
      operate: 'I' as const,
    };
  });
}
