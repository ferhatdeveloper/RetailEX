/**
 * WMS dalga toplama — web pickingService.ts + wms.pick_waves / wms.pick_tasks.
 */

import { pgQuery } from './pgClient';
import { firmNr, periodNr, saleItemsTable } from './erpTables';

export type PickWave = {
  id: string;
  wave_no: string;
  status: string;
  order_count: number;
  total_items: number;
  total_qty?: number;
  created_at: string;
};

export type PickTask = {
  id: string;
  wave_id: string;
  product_id: string;
  product_name: string;
  location_code: string;
  quantity: number;
  picked_quantity: number;
  status: 'pending' | 'completed';
  lot_no?: string | null;
  expiry_date?: string | null;
};

function fn(): string {
  return firmNr();
}

function mapTaskStatus(dbStatus: string): 'pending' | 'completed' {
  return dbStatus === 'done' || dbStatus === 'completed' ? 'completed' : 'pending';
}

export function waveStatusLabel(status: string): string {
  switch (status) {
    case 'picking':
      return 'Toplama';
    case 'completed':
      return 'Tamamlandı';
    case 'cancelled':
      return 'İptal';
    case 'draft':
    case 'pending':
      return 'Beklemede';
    default:
      return status || '—';
  }
}

export function waveStatusColor(status: string): string {
  if (status === 'picking') return '#2563eb';
  if (status === 'completed') return '#16a34a';
  if (status === 'cancelled') return '#6b7280';
  return '#d97706';
}

/** Firma bazlı toplama dalgaları */
export async function fetchPickWaves(limit = 100): Promise<PickWave[]> {
  const firm = fn();
  const res = await pgQuery<{
    id: string;
    wave_no: string;
    status: string;
    total_lines: string | number;
    total_qty: string | number;
    order_count: string | number;
    created_at: string;
  }>(
    `SELECT w.id, w.wave_no, w.status, w.total_lines, w.total_qty,
            COALESCE(array_length(w.sales_ids, 1), 0) AS order_count, w.created_at::text AS created_at
     FROM wms.pick_waves w
     WHERE w.firm_nr = $1
     ORDER BY w.created_at DESC
     LIMIT $2`,
    [firm, limit],
  );
  return (res.rows || []).map((r) => ({
    id: String(r.id),
    wave_no: r.wave_no,
    status: r.status || 'draft',
    order_count: Number(r.order_count || 0),
    total_items: Number(r.total_lines || 0),
    total_qty: Number(r.total_qty || 0),
    created_at: r.created_at,
  }));
}

/** Tek dalga özeti */
export async function fetchPickWave(waveId: string): Promise<PickWave | null> {
  const firm = fn();
  const res = await pgQuery<{
    id: string;
    wave_no: string;
    status: string;
    total_lines: string | number;
    total_qty: string | number;
    order_count: string | number;
    created_at: string;
  }>(
    `SELECT w.id, w.wave_no, w.status, w.total_lines, w.total_qty,
            COALESCE(array_length(w.sales_ids, 1), 0) AS order_count, w.created_at::text AS created_at
     FROM wms.pick_waves w
     WHERE w.id = $1::uuid AND w.firm_nr = $2
     LIMIT 1`,
    [waveId, firm],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    wave_no: r.wave_no,
    status: r.status || 'draft',
    order_count: Number(r.order_count || 0),
    total_items: Number(r.total_lines || 0),
    total_qty: Number(r.total_qty || 0),
    created_at: r.created_at,
  };
}

/**
 * Satış siparişlerinden toplama dalgası oluşturur.
 * Satırlar dönem sale_items'tan ürün bazında toplanır; bin FEFO ile atanır.
 */
export async function createWaveFromSales(salesIds: string[]): Promise<string> {
  if (!salesIds?.length) throw new Error('Sipariş seçilmedi');
  const f = fn();
  const items = saleItemsTable(f, periodNr());
  const waveNo = `PW-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;

  const waveRes = await pgQuery<{ id: string }>(
    `INSERT INTO wms.pick_waves (wave_no, firm_nr, status, wave_type, sales_ids)
     VALUES ($1, $2, 'draft', 'sales', $3::uuid[])
     RETURNING id`,
    [waveNo, f, salesIds],
  );
  const waveId = waveRes.rows[0]?.id;
  if (!waveId) throw new Error('Dalga oluşturulamadı');

  const aggRes = await pgQuery<{
    product_id: string;
    product_code: string | null;
    product_name: string | null;
    uom: string | null;
    qty: string | number;
  }>(
    `SELECT product_id, MAX(item_code) AS product_code, MAX(item_name) AS product_name,
            MAX(unit) AS uom, SUM(quantity) AS qty
     FROM ${items}
     WHERE invoice_id = ANY($1::uuid[]) AND product_id IS NOT NULL
     GROUP BY product_id`,
    [salesIds],
  );

  let totalLines = 0;
  let totalQty = 0;
  for (const it of aggRes.rows || []) {
    const qty = Number(it.qty || 0);
    if (qty <= 0) continue;

    let binCode: string | null = null;
    let binId: string | null = null;
    let lot: string | null = null;
    let expiry: string | null = null;
    try {
      const allocRes = await pgQuery<{
        bin_code: string | null;
        bin_id: string | null;
        lot_no: string | null;
        expiry_date: string | null;
      }>(
        `SELECT * FROM wms.allocate_fefo($1, $2::uuid, $3, NULL, 'fefo') LIMIT 1`,
        [f, it.product_id, qty],
      );
      const alloc = allocRes.rows[0];
      if (alloc) {
        binCode = alloc.bin_code ?? null;
        binId = alloc.bin_id ?? null;
        lot = alloc.lot_no ?? null;
        expiry = alloc.expiry_date ?? null;
      }
    } catch {
      /* FEFO opsiyonel */
    }

    await pgQuery(
      `INSERT INTO wms.pick_tasks
         (wave_id, product_id, product_code, product_name, bin_code, bin_id, lot_no, expiry_date, qty_to_pick, uom, status, firm_nr)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, 'open', $11)`,
      [
        waveId,
        it.product_id,
        it.product_code,
        it.product_name,
        binCode,
        binId,
        lot,
        expiry,
        qty,
        it.uom || 'Adet',
        f,
      ],
    );
    totalLines += 1;
    totalQty += qty;
  }

  await pgQuery(
    `UPDATE wms.pick_waves SET total_lines = $2, total_qty = $3, status = 'picking' WHERE id = $1`,
    [waveId, totalLines, totalQty],
  );
  return waveId;
}

/** Dalga görevleri — bin sırasına göre (S-Shape) */
export async function fetchPickTasks(waveId: string): Promise<PickTask[]> {
  const res = await pgQuery<{
    id: string;
    wave_id: string;
    product_id: string;
    product_name: string | null;
    product_code: string | null;
    bin_code: string;
    qty_to_pick: string | number;
    qty_picked: string | number;
    status: string;
    lot_no: string | null;
    expiry_date: string | null;
  }>(
    `SELECT t.id, t.wave_id, t.product_id, t.product_name, t.product_code,
            COALESCE(t.bin_code, '') AS bin_code, t.qty_to_pick, t.qty_picked, t.status,
            t.lot_no, t.expiry_date
     FROM wms.pick_tasks t
     WHERE t.wave_id = $1::uuid
     ORDER BY COALESCE(t.bin_code, 'ZZZ') ASC`,
    [waveId],
  );
  return (res.rows || []).map((r) => ({
    id: String(r.id),
    wave_id: String(r.wave_id),
    product_id: String(r.product_id || ''),
    product_name: r.product_name || r.product_code || '—',
    location_code: r.bin_code || '—',
    quantity: Number(r.qty_to_pick || 0),
    picked_quantity: Number(r.qty_picked || 0),
    status: mapTaskStatus(String(r.status || 'open')),
    lot_no: r.lot_no ?? null,
    expiry_date: r.expiry_date ?? null,
  }));
}

/** Toplama kaydı — miktar ekler, tamamlanınca 'done' */
export async function recordPick(taskId: string, quantity: number): Promise<void> {
  if (quantity <= 0) throw new Error('Miktar 0 olamaz');
  await pgQuery(
    `UPDATE wms.pick_tasks
       SET qty_picked = qty_picked + $1,
           status = CASE WHEN (qty_picked + $1) >= qty_to_pick THEN 'done' ELSE status END,
           updated_at = now()
     WHERE id = $2::uuid`,
    [quantity, taskId],
  );
}

/** Dalgayı tamamla */
export async function completePickWave(waveId: string): Promise<void> {
  await pgQuery(
    `UPDATE wms.pick_waves SET status = 'completed', completed_at = now() WHERE id = $1::uuid`,
    [waveId],
  );
}
