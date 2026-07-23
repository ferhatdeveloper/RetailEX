/**
 * WMS stok sayım — web wmsStockCount.ts ile aynı wms.counting_* tabloları.
 * Mobil bridge (pgClient) üzerinden ham SQL.
 */

import { pgQuery } from './pgClient';
import { appendStoreIdFilter, firmNr, newUuid, periodNr, productsTable, storeId } from './erpTables';
import { useAuthStore } from '../store/authStore';
import { shouldUseLiveData } from '../offline/policy';
import { enqueueMutation } from '../offline/mutationQueue';
import {
  adjustProductStockInCache,
  deleteCountingLineInCache,
  getCachedCountingSlips,
  getCachedLineByBarcode,
  getCachedProducts,
  getCachedSlipWithLines,
  markCountingSlipSynced,
  nextOfflineCountingFicheNo,
  saveCountingSlipsSnapshot,
  setProductStockInCache,
  updateCountingSlipStatusInCache,
  upsertCountingLineInCache,
  upsertCountingSlipInCache,
  type CachedCountingLine,
  type CachedCountingSlip,
} from '../offline/snapshotCache';
import { useConnectivityStore } from '../store/connectivityStore';

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
  /** Yerel kuyruk — henüz PG senkronu yok */
  pending?: boolean;
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

export type WmsWriteResult<T> = T & { queued?: boolean };

export type WmsWriteOptions = {
  forceLive?: boolean;
  skipQueue?: boolean;
  id?: string;
  ficheNo?: string;
  lineId?: string;
};

function fn(): string {
  return firmNr();
}

function cashier(): string {
  const u = useAuthStore.getState().user;
  return u?.fullName || u?.username || 'mobile';
}

export async function generateFicheNo(): Promise<string> {
  if (!shouldUseLiveData()) {
    return nextOfflineCountingFicheNo();
  }
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
  if (!shouldUseLiveData()) {
    const cached = await getCachedCountingSlips();
    const sid = storeId();
    return cached
      .filter((s) => !sid || String(s.store_id) === sid)
      .map((s) => ({
        id: s.id,
        firm_nr: s.firm_nr,
        store_id: s.store_id,
        fiche_no: s.fiche_no,
        date: s.date,
        count_type: s.count_type,
        location_code: s.location_code,
        status: s.status,
        description: s.description,
        created_by: s.created_by,
        created_at: s.created_at,
        store_name: s.store_name,
        line_count: s.line_count ?? s.lines.length,
        pending: s.pending ?? false,
      }));
  }

  const firm = fn();
  const params: unknown[] = [firm];
  const storeSql = appendStoreIdFilter('cs.store_id', params);
  const res = await pgQuery<CountingSlip>(
    `SELECT cs.*,
            s.name AS store_name,
            COUNT(cl.id)::int AS line_count
     FROM wms.counting_slips cs
     LEFT JOIN public.stores s ON cs.store_id = s.id
     LEFT JOIN wms.counting_lines cl ON cs.id = cl.slip_id
     WHERE cs.firm_nr = $1
       AND cs.status NOT IN ('cancelled')
       ${storeSql}
     GROUP BY cs.id, s.name
     ORDER BY cs.created_at DESC
     LIMIT 100`,
    params,
  );
  const rows = res.rows;
  if (rows.length) {
    const existing = await getCachedCountingSlips();
    await saveCountingSlipsSnapshot(
      rows.map((s) => {
        const prev = existing.find((e) => String(e.id) === String(s.id));
        return {
          id: s.id,
          firm_nr: s.firm_nr,
          store_id: s.store_id,
          fiche_no: s.fiche_no,
          date: String(s.date),
          count_type: s.count_type,
          location_code: s.location_code,
          status: s.status,
          description: s.description,
          created_by: s.created_by,
          created_at: String(s.created_at),
          store_name: s.store_name,
          line_count: s.line_count,
          lines: prev?.lines ?? [],
          pending: prev?.pending ?? false,
        };
      }),
    );
  }
  return rows;
}

export async function fetchSlipWithLines(
  slipId: string,
): Promise<{ slip: CountingSlip | null; lines: CountingLine[] }> {
  if (!shouldUseLiveData()) {
    const { slip, lines } = await getCachedSlipWithLines(slipId);
    if (!slip) return { slip: null, lines: [] };
    return {
      slip: {
        id: slip.id,
        firm_nr: slip.firm_nr,
        store_id: slip.store_id,
        fiche_no: slip.fiche_no,
        date: slip.date,
        count_type: slip.count_type,
        location_code: slip.location_code,
        status: slip.status,
        description: slip.description,
        created_by: slip.created_by,
        created_at: slip.created_at,
        store_name: slip.store_name,
        line_count: slip.lines.length,
      },
      lines: lines as CountingLine[],
    };
  }

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
  const slip = slipRes.rows[0] ?? null;
  if (slip) {
    await upsertCountingSlipInCache({
      id: slip.id,
      firm_nr: slip.firm_nr,
      store_id: slip.store_id,
      fiche_no: slip.fiche_no,
      date: String(slip.date),
      count_type: slip.count_type,
      location_code: slip.location_code,
      status: slip.status,
      description: slip.description,
      created_by: slip.created_by,
      created_at: String(slip.created_at),
      store_name: slip.store_name,
      line_count: linesRes.rows.length,
      lines: linesRes.rows as CachedCountingLine[],
      pending: false,
    });
  }
  return { slip, lines: linesRes.rows };
}

async function createCountingSlipLive(
  data: {
    store_id: string;
    store_name?: string | null;
    count_type?: 'full' | 'cycle' | 'location';
    description?: string;
  },
  writeOpts?: Pick<WmsWriteOptions, 'id' | 'ficheNo'>,
): Promise<CountingSlip> {
  const slipId = writeOpts?.id;
  if (slipId) {
    const existing = await pgQuery<CountingSlip>(
      `SELECT * FROM wms.counting_slips WHERE id = $1::uuid`,
      [slipId],
    );
    if (existing.rows[0]) return existing.rows[0];
  }

  const firm = fn();
  const ficheNo = writeOpts?.ficheNo || (await generateFicheNo());
  const user = useAuthStore.getState().user;
  const res = await pgQuery<CountingSlip>(
    `INSERT INTO wms.counting_slips
       (id, firm_nr, store_id, fiche_no, count_type, description, status, created_by, date)
     VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, 'draft', $7::uuid, CURRENT_DATE)
     RETURNING *`,
    [
      writeOpts?.id || newUuid(),
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

export async function createCountingSlip(
  data: {
    store_id: string;
    store_name?: string | null;
    count_type?: 'full' | 'cycle' | 'location';
    description?: string;
  },
  writeOpts?: WmsWriteOptions,
): Promise<WmsWriteResult<CountingSlip>> {
  const live = writeOpts?.forceLive === true || shouldUseLiveData();
  const id = writeOpts?.id || newUuid();
  const ficheNo = writeOpts?.ficheNo || (await generateFicheNo());
  const firm = fn();
  const user = useAuthStore.getState().user;
  const now = new Date().toISOString();

  if (!live && !writeOpts?.skipQueue) {
    await enqueueMutation({
      type: 'wms.counting.slip.create',
      payload: {
        localId: id,
        ficheNo,
        store_id: data.store_id,
        store_name: data.store_name,
        count_type: data.count_type,
        description: data.description,
      },
    });
    const slip: CachedCountingSlip = {
      id,
      firm_nr: firm,
      store_id: data.store_id,
      fiche_no: ficheNo,
      date: now.slice(0, 10),
      count_type: data.count_type || 'full',
      status: 'draft',
      description: data.description || null,
      created_by: user?.id || null,
      created_at: now,
      store_name: data.store_name,
      line_count: 0,
      lines: [],
      pending: true,
    };
    await upsertCountingSlipInCache(slip);
    await useConnectivityStore.getState().refreshPendingCount();
    return { ...slip, queued: true };
  }

  const slip = await createCountingSlipLive(data, { id, ficheNo });
  await upsertCountingSlipInCache({
    id: slip.id,
    firm_nr: slip.firm_nr,
    store_id: slip.store_id,
    fiche_no: slip.fiche_no,
    date: String(slip.date),
    count_type: slip.count_type,
    location_code: slip.location_code,
    status: slip.status,
    description: slip.description,
    created_by: slip.created_by,
    created_at: String(slip.created_at),
    store_name: slip.store_name ?? data.store_name,
    line_count: 0,
    lines: [],
    pending: false,
  });
  return slip;
}

async function updateCountingSlipStatusLive(
  slipId: string,
  status: CountingSlip['status'],
): Promise<void> {
  await pgQuery(`UPDATE wms.counting_slips SET status = $2 WHERE id = $1::uuid`, [slipId, status]);
}

export async function updateCountingSlipStatus(
  slipId: string,
  status: CountingSlip['status'],
  writeOpts?: WmsWriteOptions,
): Promise<{ queued?: boolean }> {
  const live = writeOpts?.forceLive === true || shouldUseLiveData();

  if (!live && !writeOpts?.skipQueue) {
    const { slip } = await getCachedSlipWithLines(slipId);
    if (!slip) {
      throw new Error('Çevrimdışı: sayım fişi önbellekte bulunamadı');
    }
    await updateCountingSlipStatusInCache(slipId, status);
    await enqueueMutation({
      type: 'wms.counting.status.update',
      payload: { slipId, status },
    });
    await useConnectivityStore.getState().refreshPendingCount();
    return { queued: true };
  }

  await updateCountingSlipStatusLive(slipId, status);
  await updateCountingSlipStatusInCache(slipId, status);
  return {};
}

export async function lookupProductByBarcode(barcode: string): Promise<ProductLookup | null> {
  const code = barcode.trim();
  if (!code) return null;

  if (!shouldUseLiveData()) {
    const rows = await getCachedProducts(code, 50);
    const hit =
      rows.find((r) => r.barcode === code || r.code === code) ?? rows[0] ?? null;
    if (!hit) return null;
    return {
      id: hit.id,
      name: hit.name,
      code: hit.code,
      barcode: hit.barcode || code,
      stock: hit.stock,
      unit: hit.unit,
    };
  }

  const table = productsTable();
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
  if (!shouldUseLiveData()) {
    const rows = await getCachedProducts('', 500);
    const hit = rows.find((r) => String(r.id) === String(productId));
    return Number(hit?.stock ?? 0);
  }

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
  if (!shouldUseLiveData()) {
    const line = await getCachedLineByBarcode(slipId, barcode);
    return line as CountingLine | null;
  }

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
  writeOpts?: WmsWriteOptions,
): Promise<WmsWriteResult<CountingLine>> {
  const live = writeOpts?.forceLive === true || shouldUseLiveData();
  const firm = fn();
  const barcode = data.barcode?.trim() || null;
  const expected = data.expected_qty ?? 0;
  const counted = data.counted_qty;
  const variance = counted - expected;
  const now = new Date().toISOString();

  if (!live && !writeOpts?.skipQueue) {
    const { slip, lines } = await getCachedSlipWithLines(slipId);
    if (!slip) {
      throw new Error('Çevrimdışı: sayım fişi önbellekte bulunamadı');
    }
    const existing = lines.find(
      (l) =>
        (barcode && (l.barcode || '').trim() === barcode) ||
        (data.product_id && String(l.product_id) === String(data.product_id) && !barcode),
    );
    const lineId = writeOpts?.lineId || existing?.id || newUuid();
    const line: CachedCountingLine = {
      id: lineId,
      slip_id: slipId,
      product_id: data.product_id || existing?.product_id || null,
      barcode,
      product_name: data.product_name || existing?.product_name || null,
      expected_qty: expected,
      counted_qty: counted,
      variance,
      unit: data.unit || existing?.unit || 'Adet',
      counted_at: now,
    };
    await upsertCountingLineInCache(slipId, line);
    await enqueueMutation({
      type: 'wms.counting.line.upsert',
      payload: {
        slipId,
        lineId,
        product_id: data.product_id,
        barcode: barcode || undefined,
        product_name: data.product_name,
        expected_qty: expected,
        counted_qty: counted,
        unit: data.unit,
      },
    });
    await useConnectivityStore.getState().refreshPendingCount();
    return { ...(line as CountingLine), queued: true };
  }

  const by = cashier();

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
    const row = res.rows[0]!;
    await upsertCountingLineInCache(slipId, row as CachedCountingLine);
    return row;
  }

  const lineId = writeOpts?.lineId || newUuid();
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
  const row = res.rows[0]!;
  await upsertCountingLineInCache(slipId, row as CachedCountingLine);
  return row;
}

export async function deleteCountingLine(
  slipId: string,
  lineId: string,
  writeOpts?: WmsWriteOptions,
): Promise<{ queued?: boolean }> {
  const live = writeOpts?.forceLive === true || shouldUseLiveData();

  if (!live && !writeOpts?.skipQueue) {
    await deleteCountingLineInCache(slipId, lineId);
    await enqueueMutation({
      type: 'wms.counting.line.delete',
      payload: { slipId, lineId },
    });
    await useConnectivityStore.getState().refreshPendingCount();
    return { queued: true };
  }

  await pgQuery(`DELETE FROM wms.counting_lines WHERE id = $1::uuid`, [lineId]);
  await deleteCountingLineInCache(slipId, lineId);
  return {};
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

export type VarianceSummary = {
  total_items: number;
  items_with_variance: number;
  total_variance: number;
  accuracy_rate: number;
  shortage_qty: number;
  surplus_qty: number;
  shortage_sale_value: number;
  shortage_purchase_value: number;
  surplus_purchase_value: number;
  net_profit_impact: number;
};

export type ApplyStockCountResult = {
  processed: number;
  surplus: number;
  shortage: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stockMovementsTable(): string {
  return `rex_${firmNr()}_${periodNr()}_stock_movements`;
}

function stockMovementItemsTable(): string {
  return `rex_${firmNr()}_${periodNr()}_stock_movement_items`;
}

function createdByUuid(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return UUID_RE.test(s) ? s : null;
}

function lineCountedBase(line: CountingLine): number {
  const q = Number(line.counted_qty);
  const m = Number(line.unit_multiplier) > 0 ? Number(line.unit_multiplier) : 1;
  const fromCounted = (Number.isFinite(q) ? q : 0) * m;
  const rawBase = line.base_counted_qty;
  if (rawBase != null && Number.isFinite(Number(rawBase))) {
    const b = Number(rawBase);
    if (Math.abs(b) < 1e-9 && Math.abs(fromCounted) > 1e-9) return fromCounted;
    return b;
  }
  return fromCounted;
}

function lineIsCountable(line: CountingLine): boolean {
  if (!line.product_id) return false;
  if (line.counted_qty != null && Number.isFinite(Number(line.counted_qty))) return true;
  if (line.base_counted_qty != null && Number.isFinite(Number(line.base_counted_qty))) {
    return true;
  }
  return false;
}

function summarizeVarianceFromLines(lines: CountingLine[]): VarianceSummary {
  const counted = lines.filter((l) => l.counted_qty != null);
  const totalItems = counted.length;
  let itemsWithVariance = 0;
  let totalVariance = 0;
  let shortageQty = 0;
  let surplusQty = 0;
  for (const l of counted) {
    const v = Number(l.variance ?? 0);
    if (Math.abs(v) > 0) itemsWithVariance += 1;
    totalVariance += Math.abs(v);
    if (v < 0) shortageQty += Math.abs(v);
    if (v > 0) surplusQty += v;
  }
  const accuracyRate =
    totalItems > 0 ? ((totalItems - itemsWithVariance) / totalItems) * 100 : 100;
  return {
    total_items: totalItems,
    items_with_variance: itemsWithVariance,
    total_variance: totalVariance,
    accuracy_rate: Math.round(accuracyRate * 10) / 10,
    shortage_qty: shortageQty,
    surplus_qty: surplusQty,
    shortage_sale_value: 0,
    shortage_purchase_value: 0,
    surplus_purchase_value: 0,
    net_profit_impact: 0,
  };
}

export async function fetchVarianceSummary(slipId: string): Promise<VarianceSummary> {
  if (!shouldUseLiveData()) {
    const { lines } = await getCachedSlipWithLines(slipId);
    return summarizeVarianceFromLines(lines as CountingLine[]);
  }

  const res = await pgQuery<{
    total_items: number;
    items_with_variance: number;
    total_variance: number;
    shortage_qty: number;
    surplus_qty: number;
    shortage_sale_value: number;
    shortage_purchase_value: number;
    surplus_purchase_value: number;
  }>(
    `SELECT
       COUNT(*)::int AS total_items,
       COUNT(CASE WHEN ABS(COALESCE(cl.variance, 0)) > 0 THEN 1 END)::int AS items_with_variance,
       COALESCE(SUM(ABS(COALESCE(cl.variance, 0))), 0)::float8 AS total_variance,
       COALESCE(SUM(CASE WHEN cl.variance < 0 THEN ABS(cl.variance) ELSE 0 END), 0)::float8 AS shortage_qty,
       COALESCE(SUM(CASE WHEN cl.variance > 0 THEN cl.variance ELSE 0 END), 0)::float8 AS surplus_qty,
       0::float8 AS shortage_sale_value,
       0::float8 AS shortage_purchase_value,
       0::float8 AS surplus_purchase_value
     FROM wms.counting_lines cl
     WHERE cl.slip_id = $1::uuid AND cl.counted_qty IS NOT NULL`,
    [slipId],
  );
  const r = res.rows[0];
  const totalItems = r?.total_items ?? 0;
  const itemsWithVariance = r?.items_with_variance ?? 0;
  const accuracyRate =
    totalItems > 0 ? ((totalItems - itemsWithVariance) / totalItems) * 100 : 100;

  return {
    total_items: totalItems,
    items_with_variance: itemsWithVariance,
    total_variance: Number(r?.total_variance ?? 0),
    accuracy_rate: Math.round(accuracyRate * 10) / 10,
    shortage_qty: Number(r?.shortage_qty ?? 0),
    surplus_qty: Number(r?.surplus_qty ?? 0),
    shortage_sale_value: 0,
    shortage_purchase_value: 0,
    surplus_purchase_value: 0,
    net_profit_impact: 0,
  };
}

export async function completeCountingReconciliation(slipId: string): Promise<void> {
  await pgQuery(
    `UPDATE wms.counting_slips
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1::uuid`,
    [slipId],
  );
}

export async function cancelCountingSlip(
  slipId: string,
  writeOpts?: WmsWriteOptions,
): Promise<{ queued?: boolean }> {
  return updateCountingSlipStatus(slipId, 'cancelled', writeOpts);
}

/**
 * Web wmsStockCount.applyStockCount ile aynı mantık:
 * TRCODE 26 (fazla) / 50 (eksik) stok fişleri + ürün stok güncelleme + fiş tamamlandı.
 */
async function applyStockCountLive(slipId: string): Promise<ApplyStockCountResult> {
  const slipRes = await pgQuery<CountingSlip>(
    `SELECT * FROM wms.counting_slips WHERE id = $1::uuid`,
    [slipId],
  );
  const slip = slipRes.rows[0];
  if (!slip) throw new Error('Sayım fişi bulunamadı');
  if (slip.status === 'completed') {
    return { processed: 0, surplus: 0, shortage: 0 };
  }

  const linesRes = await pgQuery<CountingLine>(
    `SELECT * FROM wms.counting_lines
     WHERE slip_id = $1::uuid
       AND product_id IS NOT NULL
       AND (counted_qty IS NOT NULL OR base_counted_qty IS NOT NULL)`,
    [slipId],
  );
  const lines = linesRes.rows.filter(lineIsCountable);

  if (!lines.length) {
    await completeCountingReconciliation(slipId);
    return { processed: 0, surplus: 0, shortage: 0 };
  }

  const fn = firmNr();
  const pn = periodNr();
  const movTable = stockMovementsTable();
  const itemTable = stockMovementItemsTable();
  const prodTable = productsTable();
  const now = new Date().toISOString();
  const warehouseId = slip.store_id || null;
  const createdBy = createdByUuid(slip.created_by);

  const surplusLines = lines.filter(
    (l) => lineCountedBase(l) > (Number(l.expected_qty) || 0) + 1e-9,
  );
  const shortageLines = lines.filter(
    (l) => lineCountedBase(l) < (Number(l.expected_qty) || 0) - 1e-9,
  );

  const insertMovement = async (
    documentNo: string,
    movementType: 'in' | 'out',
    trcode: number,
    description: string,
    movementLines: CountingLine[],
    qtyFn: (line: CountingLine) => number,
  ) => {
    const withQty = movementLines.filter((l) => qtyFn(l) > 1e-9);
    if (!withQty.length) return;

    const headerParams: unknown[] = [
      fn,
      pn,
      documentNo,
      movementType,
      trcode,
      warehouseId,
      now,
      1,
      description,
      'completed',
      createdBy,
    ];
    const movRes = await pgQuery<{ id: string }>(
      `INSERT INTO ${movTable}
         (firm_nr, period_nr, document_no, movement_type, trcode, warehouse_id,
          movement_date, exchange_rate, description, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, $8, $9, $10, $11::uuid)
       RETURNING id::text`,
      headerParams,
    );
    const mvId = movRes.rows[0]?.id;
    if (!mvId) throw new Error('Stok fişi oluşturulamadı');

    for (const line of withQty) {
      const qty = qtyFn(line);
      await pgQuery(
        `INSERT INTO ${itemTable}
           (movement_id, product_id, quantity, unit_price, cost_price, exchange_rate, unit_name, convert_factor, notes)
         VALUES ($1::uuid, $2::uuid, $3, 0, 0, 1, $4, $5, $6)`,
        [
          mvId,
          line.product_id,
          qty,
          line.unit || 'Adet',
          Number(line.unit_multiplier) > 0 ? Number(line.unit_multiplier) : 1,
          `Sayım: ${line.product_name || ''}`,
        ],
      );
    }
  };

  await insertMovement(
    `SAY-FAZ-${slip.fiche_no}`,
    'in',
    26,
    `Sayım Fazlası - ${slip.fiche_no}`,
    surplusLines,
    (line) => lineCountedBase(line) - (Number(line.expected_qty) || 0),
  );

  await insertMovement(
    `SAY-EKS-${slip.fiche_no}`,
    'out',
    50,
    `Sayım Eksiği - ${slip.fiche_no}`,
    shortageLines,
    (line) => (Number(line.expected_qty) || 0) - lineCountedBase(line),
  );

  const ids = lines.map((l) => String(l.product_id));
  const stocks = lines.map((l) => lineCountedBase(l));
  await pgQuery(
    `UPDATE ${prodTable} AS p
     SET stock = d.new_stock
     FROM (
       SELECT unnest($1::uuid[]) AS id,
              unnest($2::numeric[]) AS new_stock
     ) AS d
     WHERE p.id = d.id`,
    [ids, stocks],
  );

  await completeCountingReconciliation(slipId);

  await updateCountingSlipStatusInCache(slipId, 'completed');
  await markCountingSlipSynced(slipId);

  return {
    processed: lines.length,
    surplus: surplusLines.length,
    shortage: shortageLines.length,
  };
}

export async function applyStockCount(
  slipId: string,
  writeOpts?: WmsWriteOptions,
): Promise<WmsWriteResult<ApplyStockCountResult>> {
  const live = writeOpts?.forceLive === true || shouldUseLiveData();

  if (!live && !writeOpts?.skipQueue) {
    const { slip, lines } = await getCachedSlipWithLines(slipId);
    if (!slip) throw new Error('Sayım fişi bulunamadı');

    const countable = (lines as CountingLine[]).filter(lineIsCountable);
    const surplusLines = countable.filter(
      (l) => lineCountedBase(l) > (Number(l.expected_qty) || 0) + 1e-9,
    );
    const shortageLines = countable.filter(
      (l) => lineCountedBase(l) < (Number(l.expected_qty) || 0) - 1e-9,
    );

    for (const line of countable) {
      if (line.product_id) {
        await setProductStockInCache(String(line.product_id), lineCountedBase(line));
      }
    }

    await updateCountingSlipStatusInCache(slipId, 'completed');
    await enqueueMutation({
      type: 'wms.counting.applyStock',
      payload: { slipId },
    });
    await useConnectivityStore.getState().refreshPendingCount();

    return {
      processed: countable.length,
      surplus: surplusLines.length,
      shortage: shortageLines.length,
      queued: true,
    };
  }

  return applyStockCountLive(slipId);
}
