/**
 * Terazi PLU aktarımı için tartı ürünleri (`is_scale_product`).
 */

import { pgQuery } from './pgClient';
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

export async function fetchScaleProducts(limit = 500): Promise<ScaleProductRow[]> {
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

/** kg birimli veya is_scale_product ürünler — tartılı satış araması */
export async function searchWeighableProducts(
  search: string,
  limit = 40,
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
  // LabelId senkron sırasında NetworkScaleTransport / settings.labelSlot ile eklenir
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
