/**
 * WMS dalga toplama — web pickingService.ts + wms.pick_waves / wms.pick_tasks.
 * PostgREST önce (wms şeması), bridge SQL yedek.
 */

import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPatch, postgrestPost } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { firmNr, newUuid, periodNr, saleItemsTable } from './erpTables';

const WMS_SCHEMA = { schema: 'wms' as const };
const PUB_SCHEMA = { schema: 'public' as const };

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

function mapPickWaveRow(r: Record<string, unknown>): PickWave {
  const salesIds = r.sales_ids;
  let orderCount = 0;
  if (Array.isArray(salesIds)) orderCount = salesIds.length;
  else if (r.order_count != null) orderCount = Number(r.order_count) || 0;

  return {
    id: String(r.id ?? ''),
    wave_no: String(r.wave_no ?? ''),
    status: String(r.status || 'draft'),
    order_count: orderCount,
    total_items: Number(r.total_lines ?? 0) || 0,
    total_qty: Number(r.total_qty ?? 0) || 0,
    created_at: String(r.created_at ?? ''),
  };
}

function mapPickTaskRow(r: Record<string, unknown>): PickTask {
  return {
    id: String(r.id ?? ''),
    wave_id: String(r.wave_id ?? ''),
    product_id: String(r.product_id || ''),
    product_name: String(r.product_name || r.product_code || '—'),
    location_code: String(r.bin_code || '—'),
    quantity: Number(r.qty_to_pick ?? 0) || 0,
    picked_quantity: Number(r.qty_picked ?? 0) || 0,
    status: mapTaskStatus(String(r.status || 'open')),
    lot_no: r.lot_no != null ? String(r.lot_no) : null,
    expiry_date: r.expiry_date != null ? String(r.expiry_date) : null,
  };
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

async function fetchPickWavesViaRest(limit: number): Promise<PickWave[]> {
  const firm = fn();
  const rows = await postgrestGet<Record<string, unknown>[]>(
    '/pick_waves',
    {
      select: 'id,wave_no,status,total_lines,total_qty,sales_ids,created_at',
      firm_nr: `eq.${firm}`,
      order: 'created_at.desc',
      limit,
    },
    WMS_SCHEMA,
  );
  return (Array.isArray(rows) ? rows : []).map(mapPickWaveRow);
}

async function fetchPickWavesViaBridge(limit: number): Promise<PickWave[]> {
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

/** Firma bazlı toplama dalgaları */
export async function fetchPickWaves(limit = 100): Promise<PickWave[]> {
  return runDataTransport({
    label: 'fetchPickWaves',
    viaRest: () => fetchPickWavesViaRest(limit),
    viaBridge: () => fetchPickWavesViaBridge(limit),
  });
}

async function fetchPickWaveViaRest(waveId: string): Promise<PickWave | null> {
  const firm = fn();
  const rows = await postgrestGet<Record<string, unknown>[]>(
    '/pick_waves',
    {
      select: 'id,wave_no,status,total_lines,total_qty,sales_ids,created_at',
      id: `eq.${waveId}`,
      firm_nr: `eq.${firm}`,
      limit: 1,
    },
    WMS_SCHEMA,
  );
  const r = Array.isArray(rows) ? rows[0] : null;
  return r ? mapPickWaveRow(r) : null;
}

async function fetchPickWaveViaBridge(waveId: string): Promise<PickWave | null> {
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

/** Tek dalga özeti */
export async function fetchPickWave(waveId: string): Promise<PickWave | null> {
  return runDataTransport({
    label: 'fetchPickWave',
    viaRest: () => fetchPickWaveViaRest(waveId),
    viaBridge: () => fetchPickWaveViaBridge(waveId),
  });
}

type AggregatedSaleItem = {
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  uom: string | null;
  qty: number;
};

async function aggregateSaleItemsViaRest(salesIds: string[]): Promise<AggregatedSaleItem[]> {
  const itemsTable = saleItemsTable(fn(), periodNr());
  const inList = salesIds.map((id) => id).join(',');
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${itemsTable}`,
    {
      invoice_id: `in.(${inList})`,
      select: 'product_id,item_code,item_name,unit,quantity',
      limit: 5000,
    },
    PUB_SCHEMA,
  );

  const byProduct = new Map<string, AggregatedSaleItem>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const pid = r.product_id != null ? String(r.product_id) : '';
    if (!pid) continue;
    const qty = Number(r.quantity ?? 0) || 0;
    if (qty <= 0) continue;
    const cur = byProduct.get(pid);
    if (cur) {
      cur.qty += qty;
      if (!cur.product_code && r.item_code) cur.product_code = String(r.item_code);
      if (!cur.product_name && r.item_name) cur.product_name = String(r.item_name);
      if (!cur.uom && r.unit) cur.uom = String(r.unit);
    } else {
      byProduct.set(pid, {
        product_id: pid,
        product_code: r.item_code != null ? String(r.item_code) : null,
        product_name: r.item_name != null ? String(r.item_name) : null,
        uom: r.unit != null ? String(r.unit) : null,
        qty,
      });
    }
  }
  return Array.from(byProduct.values());
}

async function createWaveFromSalesViaRest(salesIds: string[]): Promise<string> {
  if (!salesIds?.length) throw new Error('Sipariş seçilmedi');
  const f = fn();
  const waveNo = `PW-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
  const waveId = newUuid();

  await postgrestPost(
    '/pick_waves',
    {
      id: waveId,
      wave_no: waveNo,
      firm_nr: f,
      status: 'draft',
      wave_type: 'sales',
      sales_ids: salesIds,
    },
    { ...WMS_SCHEMA, prefer: 'return=minimal' },
  );

  const aggItems = await aggregateSaleItemsViaRest(salesIds);
  let totalLines = 0;
  let totalQty = 0;

  for (const it of aggItems) {
    const qty = Number(it.qty || 0);
    if (qty <= 0) continue;

    await postgrestPost(
      '/pick_tasks',
      {
        id: newUuid(),
        wave_id: waveId,
        product_id: it.product_id,
        product_code: it.product_code,
        product_name: it.product_name,
        bin_code: null,
        bin_id: null,
        lot_no: null,
        expiry_date: null,
        qty_to_pick: qty,
        uom: it.uom || 'Adet',
        status: 'open',
        firm_nr: f,
      },
      { ...WMS_SCHEMA, prefer: 'return=minimal' },
    );
    totalLines += 1;
    totalQty += qty;
  }

  await postgrestPatch(
    `/pick_waves?id=eq.${encodeURIComponent(waveId)}`,
    { total_lines: totalLines, total_qty: totalQty, status: 'picking' },
    { ...WMS_SCHEMA, prefer: 'return=minimal' },
  );
  return waveId;
}

async function createWaveFromSalesViaBridge(salesIds: string[]): Promise<string> {
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

/**
 * Satış siparişlerinden toplama dalgası oluşturur.
 * Satırlar dönem sale_items'tan ürün bazında toplanır; bin FEFO bridge yolunda atanır.
 */
export async function createWaveFromSales(salesIds: string[]): Promise<string> {
  return runDataTransport({
    label: 'createWaveFromSales',
    viaRest: () => createWaveFromSalesViaRest(salesIds),
    viaBridge: () => createWaveFromSalesViaBridge(salesIds),
  });
}

async function fetchPickTasksViaRest(waveId: string): Promise<PickTask[]> {
  const rows = await postgrestGet<Record<string, unknown>[]>(
    '/pick_tasks',
    {
      select:
        'id,wave_id,product_id,product_name,product_code,bin_code,qty_to_pick,qty_picked,status,lot_no,expiry_date',
      wave_id: `eq.${waveId}`,
      order: 'bin_code.asc.nullslast',
      limit: 5000,
    },
    WMS_SCHEMA,
  );
  return (Array.isArray(rows) ? rows : []).map(mapPickTaskRow);
}

async function fetchPickTasksViaBridge(waveId: string): Promise<PickTask[]> {
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

/** Dalga görevleri — bin sırasına göre (S-Shape) */
export async function fetchPickTasks(waveId: string): Promise<PickTask[]> {
  return runDataTransport({
    label: 'fetchPickTasks',
    viaRest: () => fetchPickTasksViaRest(waveId),
    viaBridge: () => fetchPickTasksViaBridge(waveId),
  });
}

async function recordPickViaRest(taskId: string, quantity: number): Promise<void> {
  if (quantity <= 0) throw new Error('Miktar 0 olamaz');
  const rows = await postgrestGet<Record<string, unknown>[]>(
    '/pick_tasks',
    { id: `eq.${taskId}`, select: 'qty_picked,qty_to_pick,status', limit: 1 },
    WMS_SCHEMA,
  );
  const cur = Array.isArray(rows) ? rows[0] : null;
  if (!cur) throw new Error('Görev bulunamadı');
  const picked = Number(cur.qty_picked ?? 0) + quantity;
  const toPick = Number(cur.qty_to_pick ?? 0);
  const patch: Record<string, unknown> = {
    qty_picked: picked,
    updated_at: new Date().toISOString(),
  };
  if (picked >= toPick) patch.status = 'done';
  await postgrestPatch(
    `/pick_tasks?id=eq.${encodeURIComponent(taskId)}`,
    patch,
    { ...WMS_SCHEMA, prefer: 'return=minimal' },
  );
}

async function recordPickViaBridge(taskId: string, quantity: number): Promise<void> {
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

/** Toplama kaydı — miktar ekler, tamamlanınca 'done' */
export async function recordPick(taskId: string, quantity: number): Promise<void> {
  return runDataTransport({
    label: 'recordPick',
    viaRest: () => recordPickViaRest(taskId, quantity),
    viaBridge: () => recordPickViaBridge(taskId, quantity),
  });
}

async function completePickWaveViaRest(waveId: string): Promise<void> {
  await postgrestPatch(
    `/pick_waves?id=eq.${encodeURIComponent(waveId)}`,
    { status: 'completed', completed_at: new Date().toISOString() },
    { ...WMS_SCHEMA, prefer: 'return=minimal' },
  );
}

async function completePickWaveViaBridge(waveId: string): Promise<void> {
  await pgQuery(
    `UPDATE wms.pick_waves SET status = 'completed', completed_at = now() WHERE id = $1::uuid`,
    [waveId],
  );
}

/** Dalgayı tamamla */
export async function completePickWave(waveId: string): Promise<void> {
  return runDataTransport({
    label: 'completePickWave',
    viaRest: () => completePickWaveViaRest(waveId),
    viaBridge: () => completePickWaveViaBridge(waveId),
  });
}
