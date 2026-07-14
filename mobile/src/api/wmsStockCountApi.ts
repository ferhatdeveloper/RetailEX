/**
 * WMS stok sayım — web wmsStockCount.ts ile aynı wms.counting_* tabloları.
 * Mobil bridge (pgClient) üzerinden ham SQL.
 */

import { pgQuery } from './pgClient';
import { firmNr, newUuid, productsTable } from './erpTables';
import { useAuthStore } from '../store/authStore';

export type CountingSlip = {
  id: string;
  firm_nr: string;
  store_id: string;
  fiche_no: string;
  date: string;
  count_type: 'full' | 'cycle' | 'location';
  location_code?: string | null;
  status: 'draft' | 'active' | 'counting' | 'reconciliation' | 'completed' | 'cancelled';
  description?: string | null;
  created_by?: string | null;
  created_at: string;
  store_name?: string | null;
  line_count?: number;
};

export type CountingLine = {
  id: string;
  slip_id: string;
  product_id?: string | null;
  barcode?: string | null;
  product_name?: string | null;
  expected_qty: number;
  counted_qty?: number | null;
  variance?: number | null;
  unit?: string | null;
  unit_multiplier?: number | null;
  base_counted_qty?: number | null;
  counted_at?: string | null;
};

export type ProductLookup = {
  id: string;
  name: string;
  code: string | null;
  barcode?: string | null;
  stock: number;
  unit?: string | null;
};

export type WmsStore = { id: string; name: string; code: string };

function fn(): string {
  return firmNr();
}

function cashier(): string {
  const u = useAuthStore.getState().user;
  return u?.fullName || u?.username || 'mobile';
}

export async function generateFicheNo(): Promise<string> {
  const firm = fn();
  const year = new Date().getFullYear();
  const res = await pgQuery<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM wms.counting_slips
     WHERE firm_nr = $1 AND date_part('year', created_at) = $2`,
    [firm, year],
  );
  const seq = (parseInt(res.rows[0]?.count || '0', 10) + 1).toString().padStart(4, '0');
  return `SAY-${year}-${seq}`;
}

export async function fetchCountingStores(): Promise<WmsStore[]> {
  const firm = fn();
  try {
    const res = await pgQuery<{ id: string; name: string; code: string }>(
      `SELECT id::text, name, COALESCE(code, '') AS code
       FROM public.stores
       WHERE COALESCE(is_active, true) = true
         AND (
           firm_nr::text = $1
           OR lpad(trim(firm_nr::text), 3, '0') = lpad(trim($1::text), 3, '0')
         )
         AND (type IS NULL OR type IN ('STORE','BRANCH','WAREHOUSE'))
       ORDER BY name`,
      [firm],
    );
    if (res.rows.length) return res.rows;
  } catch {
    /* fallback */
  }
  const all = await pgQuery<{ id: string; name: string; code: string }>(
    `SELECT id::text, name, COALESCE(code, '') AS code
     FROM public.stores
     WHERE COALESCE(is_active, true) = true
     ORDER BY name
     LIMIT 50`,
  );
  return all.rows;
}

export async function fetchCountingSlips(): Promise<CountingSlip[]> {
  const firm = fn();
  const res = await pgQuery<CountingSlip>(
    `SELECT cs.*,
            s.name AS store_name,
            COUNT(cl.id)::int AS line_count
     FROM wms.counting_slips cs
     LEFT JOIN public.stores s ON cs.store_id = s.id
     LEFT JOIN wms.counting_lines cl ON cs.id = cl.slip_id
     WHERE cs.firm_nr = $1
       AND cs.status NOT IN ('cancelled')
     GROUP BY cs.id, s.name
     ORDER BY cs.created_at DESC
     LIMIT 100`,
    [firm],
  );
  return res.rows;
}

export async function fetchSlipWithLines(
  slipId: string,
): Promise<{ slip: CountingSlip | null; lines: CountingLine[] }> {
  const slipRes = await pgQuery<CountingSlip>(
    `SELECT cs.*, s.name AS store_name
     FROM wms.counting_slips cs
     LEFT JOIN public.stores s ON cs.store_id = s.id
     WHERE cs.id = $1::uuid`,
    [slipId],
  );
  const linesRes = await pgQuery<CountingLine>(
    `SELECT cl.*
     FROM wms.counting_lines cl
     WHERE cl.slip_id = $1::uuid
     ORDER BY COALESCE(cl.counted_at, '1970-01-01'::timestamptz) DESC, cl.id ASC`,
    [slipId],
  );
  return { slip: slipRes.rows[0] ?? null, lines: linesRes.rows };
}

export async function createCountingSlip(data: {
  store_id: string;
  count_type?: 'full' | 'cycle' | 'location';
  description?: string;
}): Promise<CountingSlip> {
  const firm = fn();
  const ficheNo = await generateFicheNo();
  const user = useAuthStore.getState().user;
  const res = await pgQuery<CountingSlip>(
    `INSERT INTO wms.counting_slips
       (firm_nr, store_id, fiche_no, count_type, description, status, created_by, date)
     VALUES ($1, $2::uuid, $3, $4, $5, 'draft', $6::uuid, CURRENT_DATE)
     RETURNING *`,
    [
      firm,
      data.store_id,
      ficheNo,
      data.count_type || 'full',
      data.description || null,
      user?.id || null,
    ],
  );
  const slip = res.rows[0];
  if (!slip) throw new Error('Sayım fişi oluşturulamadı');
  return slip;
}

export async function updateCountingSlipStatus(
  slipId: string,
  status: CountingSlip['status'],
): Promise<void> {
  await pgQuery(`UPDATE wms.counting_slips SET status = $2 WHERE id = $1::uuid`, [slipId, status]);
}

export async function lookupProductByBarcode(barcode: string): Promise<ProductLookup | null> {
  const table = productsTable();
  const code = barcode.trim();
  if (!code) return null;

  const direct = await pgQuery<ProductLookup>(
    `SELECT id::text, name, code, barcode,
            COALESCE(stock, 0)::float8 AS stock,
            COALESCE(unit, 'Adet') AS unit
     FROM ${table}
     WHERE COALESCE(is_active, true) = true
       AND (barcode = $1 OR code = $1)
     LIMIT 1`,
    [code],
  );
  if (direct.rows[0]) return direct.rows[0];

  try {
    const pb = await pgQuery<{ product_id: string }>(
      `SELECT product_id::text
       FROM product_barcodes
       WHERE barcode_code = $1
       ORDER BY is_primary DESC NULLS LAST
       LIMIT 1`,
      [code],
    );
    if (pb.rows[0]?.product_id) {
      const prod = await pgQuery<ProductLookup>(
        `SELECT id::text, name, code, barcode,
                COALESCE(stock, 0)::float8 AS stock,
                COALESCE(unit, 'Adet') AS unit
         FROM ${table}
         WHERE id::text = $1
         LIMIT 1`,
        [pb.rows[0].product_id],
      );
      if (prod.rows[0]) return { ...prod.rows[0], barcode: code };
    }
  } catch {
    /* product_barcodes yoksa atla */
  }
  return null;
}

export async function getProductStock(productId: string): Promise<number> {
  const table = productsTable();
  const res = await pgQuery<{ stock: number }>(
    `SELECT COALESCE(stock, 0)::float8 AS stock FROM ${table} WHERE id::text = $1`,
    [productId],
  );
  return Number(res.rows[0]?.stock ?? 0);
}

export async function getLineByBarcode(
  slipId: string,
  barcode: string,
): Promise<CountingLine | null> {
  const res = await pgQuery<CountingLine>(
    `SELECT * FROM wms.counting_lines
     WHERE slip_id = $1::uuid AND barcode = $2
     LIMIT 1`,
    [slipId, barcode.trim()],
  );
  return res.rows[0] ?? null;
}

export async function upsertCountingLine(
  slipId: string,
  data: {
    product_id?: string;
    barcode?: string;
    product_name?: string;
    expected_qty?: number;
    counted_qty: number;
    unit?: string;
  },
): Promise<CountingLine> {
  const firm = fn();
  const by = cashier();
  const barcode = data.barcode?.trim() || null;
  const expected = data.expected_qty ?? 0;
  const counted = data.counted_qty;
  const variance = counted - expected;

  const existing = await pgQuery<CountingLine>(
    `SELECT * FROM wms.counting_lines
     WHERE slip_id = $1::uuid
       AND (barcode = $2 OR (product_id::text = $3 AND $2 IS NULL))
     LIMIT 1`,
    [slipId, barcode, data.product_id || null],
  );

  if (existing.rows[0]) {
    const res = await pgQuery<CountingLine>(
      `UPDATE wms.counting_lines
       SET counted_qty = $2,
           variance = $2 - COALESCE(expected_qty, 0),
           counted_by = $3,
           counted_at = NOW(),
           product_name = COALESCE($4, product_name),
           unit = COALESCE($5, unit)
       WHERE id = $6::uuid
       RETURNING *`,
      [slipId, counted, by, data.product_name || null, data.unit || 'Adet', existing.rows[0].id],
    );
    return res.rows[0]!;
  }

  const lineId = newUuid();
  const res = await pgQuery<CountingLine>(
    `INSERT INTO wms.counting_lines
       (id, slip_id, firm_nr, product_id, barcode, product_name,
        expected_qty, counted_qty, variance, counted_by, counted_at, unit)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, NOW(), $11)
     RETURNING *`,
    [
      lineId,
      slipId,
      firm,
      data.product_id || null,
      barcode,
      data.product_name || null,
      expected,
      counted,
      variance,
      by,
      data.unit || 'Adet',
    ],
  );
  return res.rows[0]!;
}

export async function deleteCountingLine(lineId: string): Promise<void> {
  await pgQuery(`DELETE FROM wms.counting_lines WHERE id = $1::uuid`, [lineId]);
}

export function slipStatusLabel(status: CountingSlip['status']): string {
  const map: Record<CountingSlip['status'], string> = {
    draft: 'Taslak',
    active: 'Aktif',
    counting: 'Sayılıyor',
    reconciliation: 'Mutabakat',
    completed: 'Tamamlandı',
    cancelled: 'İptal',
  };
  return map[status] ?? status;
}
