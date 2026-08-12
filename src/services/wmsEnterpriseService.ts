/**
 * WMS Kurumsal servis — bin envanteri, lot/SKT, putaway, FEFO tahsis, fire.
 * `rest_api` → PostgREST (wms şeması); aksi halde PostgresConnection.
 * Şema: migration 106_wms_enterprise.sql.
 */
import { PostgresConnection, ERP_SETTINGS, DB_SETTINGS } from './postgres';

const conn = () => PostgresConnection.getInstance();

function isRestApi(): boolean {
  return DB_SETTINGS.connectionProvider === 'rest_api';
}
function firmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim();
}

export interface WmsBin {
  id: string;
  store_id?: string | null;
  firm_nr?: string | null;
  code: string;
  zone?: string | null;
  aisle?: string | null;
  rack?: string | null;
  shelf?: string | null;
  bin?: string | null;
  bin_type?: string | null;
  barcode?: string | null;
  is_active?: boolean;
}

export interface BinInventoryRow {
  id: string;
  bin_id?: string | null;
  bin_code?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  lot_no?: string | null;
  expiry_date?: string | null;
  qty: number;
  reserved_qty: number;
  uom?: string | null;
}

export interface FefoAllocation {
  bin_id: string;
  bin_code: string;
  lot_no: string | null;
  expiry_date: string | null;
  alloc_qty: number;
}

export interface PutawayTask {
  id: string;
  firm_nr: string;
  store_id?: string | null;
  receiving_slip_id?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  lot_no?: string | null;
  expiry_date?: string | null;
  qty: number;
  qty_done: number;
  suggested_bin_id?: string | null;
  to_bin_id?: string | null;
  status: string;
}

// ── Bin (lokasyon) ─────────────────────────────────────────────────────────
export async function listBins(storeId?: string): Promise<WmsBin[]> {
  const f = firmNr();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const q: Record<string, string | number> = {
      select: '*',
      order: 'code.asc',
      limit: 1000,
      or: `(firm_nr.eq.${f},firm_nr.is.null)`,
    };
    if (storeId) q.store_id = `eq.${storeId}`;
    const rows = await postgrest.get<any[]>('/bins', q, { schema: 'wms' });
    return (Array.isArray(rows) ? rows : []) as WmsBin[];
  }
  const c = conn();
  const params: unknown[] = [f];
  let where = `(firm_nr = $1 OR firm_nr IS NULL)`;
  if (storeId) {
    params.push(storeId);
    where += ` AND store_id = $${params.length}`;
  }
  const r = await c.query(`SELECT * FROM wms.bins WHERE ${where} ORDER BY code`, params);
  return (r?.rows || []) as WmsBin[];
}

export async function createBin(data: Partial<WmsBin>): Promise<WmsBin | null> {
  const f = firmNr();
  const payload = {
    firm_nr: f,
    store_id: data.store_id ?? null,
    code: data.code,
    zone: data.zone ?? null,
    aisle: data.aisle ?? null,
    rack: data.rack ?? null,
    shelf: data.shelf ?? null,
    bin: data.bin ?? null,
    bin_type: data.bin_type ?? 'storage',
    barcode: data.barcode ?? null,
    is_active: data.is_active ?? true,
  };
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.post<any[]>('/bins', payload, {
      schema: 'wms',
      prefer: 'return=representation',
    });
    return (Array.isArray(rows) ? rows[0] : rows) as WmsBin;
  }
  const c = conn();
  const r = await c.query(
    `INSERT INTO wms.bins (firm_nr, store_id, code, zone, aisle, rack, shelf, bin, bin_type, barcode, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [f, payload.store_id, payload.code, payload.zone, payload.aisle, payload.rack, payload.shelf, payload.bin, payload.bin_type, payload.barcode, payload.is_active]
  );
  return (r?.rows?.[0] || null) as WmsBin | null;
}

// ── Bin envanteri ────────────────────────────────────────────────────────────
export async function getBinInventory(opts: { productId?: string; storeId?: string; binId?: string } = {}): Promise<BinInventoryRow[]> {
  const f = firmNr();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const q: Record<string, string | number> = {
      select: '*',
      firm_nr: `eq.${f}`,
      order: 'expiry_date.asc',
      limit: 2000,
    };
    if (opts.productId) q.product_id = `eq.${opts.productId}`;
    if (opts.storeId) q.store_id = `eq.${opts.storeId}`;
    if (opts.binId) q.bin_id = `eq.${opts.binId}`;
    const rows = await postgrest.get<any[]>('/bin_inventory', q, { schema: 'wms' });
    return (Array.isArray(rows) ? rows : []) as BinInventoryRow[];
  }
  const c = conn();
  const params: unknown[] = [f];
  let where = `firm_nr = $1`;
  if (opts.productId) {
    params.push(opts.productId);
    where += ` AND product_id = $${params.length}`;
  }
  if (opts.storeId) {
    params.push(opts.storeId);
    where += ` AND store_id = $${params.length}`;
  }
  if (opts.binId) {
    params.push(opts.binId);
    where += ` AND bin_id = $${params.length}`;
  }
  const r = await c.query(`SELECT * FROM wms.bin_inventory WHERE ${where} ORDER BY expiry_date NULLS LAST`, params);
  return (r?.rows || []) as BinInventoryRow[];
}

/** Bin stoğunu delta ile artır/azalt (wms.upsert_bin_inventory RPC) */
export async function adjustBinInventory(args: {
  storeId?: string | null;
  binId: string;
  productId: string;
  qtyDelta: number;
  lotNo?: string | null;
  expiryDate?: string | null;
  productCode?: string | null;
  productName?: string | null;
  uom?: string | null;
}): Promise<void> {
  const f = firmNr();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.post(
      '/rpc/upsert_bin_inventory',
      {
        p_firm_nr: f,
        p_store_id: args.storeId ?? null,
        p_bin_id: args.binId,
        p_product_id: args.productId,
        p_qty_delta: args.qtyDelta,
        p_lot_no: args.lotNo ?? null,
        p_expiry_date: args.expiryDate ?? null,
        p_product_code: args.productCode ?? null,
        p_product_name: args.productName ?? null,
        p_uom: args.uom ?? 'Adet',
      },
      { schema: 'wms', prefer: 'return=minimal' }
    );
    return;
  }
  const c = conn();
  await c.query(
    `SELECT wms.upsert_bin_inventory($1,$2,$3::uuid,$4::uuid,$5,$6,$7::date,$8,$9,$10)`,
    [f, args.storeId ?? null, args.binId, args.productId, args.qtyDelta, args.lotNo ?? null, args.expiryDate ?? null, args.productCode ?? null, args.productName ?? null, args.uom ?? 'Adet']
  );
}

/** FEFO/FIFO tahsis (wms.allocate_fefo RPC) */
export async function allocateFefo(productId: string, qty: number, opts: { storeId?: string; strategy?: 'fefo' | 'fifo' } = {}): Promise<FefoAllocation[]> {
  const f = firmNr();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.post<any[]>(
      '/rpc/allocate_fefo',
      {
        p_firm_nr: f,
        p_product_id: productId,
        p_qty: qty,
        p_store_id: opts.storeId ?? null,
        p_strategy: opts.strategy ?? 'fefo',
      },
      { schema: 'wms' }
    );
    return (Array.isArray(rows) ? rows : []) as FefoAllocation[];
  }
  const c = conn();
  const r = await c.query(
    `SELECT * FROM wms.allocate_fefo($1,$2::uuid,$3,$4,$5)`,
    [f, productId, qty, opts.storeId ?? null, opts.strategy ?? 'fefo']
  );
  return (r?.rows || []) as FefoAllocation[];
}

// ── Putaway ──────────────────────────────────────────────────────────────────
export async function listPutawayTasks(status = 'open'): Promise<PutawayTask[]> {
  const f = firmNr();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const q: Record<string, string | number> = {
      select: '*',
      firm_nr: `eq.${f}`,
      order: 'created_at.desc',
      limit: 500,
    };
    if (status && status !== 'all') q.status = `eq.${status}`;
    const rows = await postgrest.get<any[]>('/putaway_tasks', q, { schema: 'wms' });
    return (Array.isArray(rows) ? rows : []) as PutawayTask[];
  }
  const c = conn();
  const params: unknown[] = [f];
  let where = `firm_nr = $1`;
  if (status && status !== 'all') {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const r = await c.query(`SELECT * FROM wms.putaway_tasks WHERE ${where} ORDER BY created_at DESC LIMIT 500`, params);
  return (r?.rows || []) as PutawayTask[];
}

/** Bir mal kabul fişindeki satırlardan putaway görevleri üretir */
export async function createPutawayFromReceiving(receivingSlipId: string): Promise<number> {
  const f = firmNr();
  const c = conn();
  // Yalnızca PG yolunda (satır okuma + toplu insert). REST için lines okunup POST edilir.
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const lines = await postgrest.get<any[]>(
      '/receiving_lines',
      { select: '*', slip_id: `eq.${receivingSlipId}` },
      { schema: 'wms' }
    );
    let n = 0;
    for (const ln of Array.isArray(lines) ? lines : []) {
      await postgrest.post(
        '/putaway_tasks',
        {
          firm_nr: f,
          receiving_slip_id: receivingSlipId,
          receiving_line_id: ln.id,
          product_id: ln.product_id ?? null,
          product_code: ln.product_code ?? null,
          product_name: ln.product_name ?? null,
          lot_no: ln.lot_no ?? null,
          expiry_date: ln.expiry_date ?? null,
          qty: Number(ln.received_qty ?? ln.ordered_qty ?? 0),
          suggested_bin_id: ln.bin_id ?? null,
          status: 'open',
        },
        { schema: 'wms', prefer: 'return=minimal' }
      );
      n += 1;
    }
    return n;
  }
  const r = await c.query(
    `INSERT INTO wms.putaway_tasks
       (firm_nr, receiving_slip_id, receiving_line_id, product_id, product_code, product_name, lot_no, expiry_date, qty, suggested_bin_id, status)
     SELECT $1, $2::uuid, l.id, l.product_id, l.product_code, l.product_name, l.lot_no, l.expiry_date,
            COALESCE(l.received_qty, l.ordered_qty, 0), l.bin_id, 'open'
     FROM wms.receiving_lines l
     WHERE l.slip_id = $2::uuid`,
    [f, receivingSlipId]
  );
  return r?.rowCount || 0;
}

/** Putaway tamamla → bin envanterine ekle */
export async function completePutaway(taskId: string, toBinId: string, opts: { storeId?: string | null } = {}): Promise<void> {
  const c = conn();
  const f = firmNr();
  const t = await getPutawayTask(taskId);
  if (!t) throw new Error('Putaway görevi bulunamadı');

  await adjustBinInventory({
    storeId: opts.storeId ?? t.store_id ?? null,
    binId: toBinId,
    productId: String(t.product_id),
    qtyDelta: Number(t.qty) - Number(t.qty_done || 0),
    lotNo: t.lot_no ?? null,
    expiryDate: t.expiry_date ?? null,
    productCode: t.product_code ?? null,
    productName: t.product_name ?? null,
  });

  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.patch(
      `/putaway_tasks?id=eq.${encodeURIComponent(taskId)}`,
      { to_bin_id: toBinId, qty_done: t.qty, status: 'done' },
      { schema: 'wms' }
    );
    return;
  }
  await c.query(
    `UPDATE wms.putaway_tasks SET to_bin_id = $2::uuid, qty_done = qty, status = 'done', updated_at = now() WHERE id = $1`,
    [taskId, toBinId]
  );
  void f;
}

async function getPutawayTask(taskId: string): Promise<PutawayTask | null> {
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<any[]>('/putaway_tasks', { select: '*', id: `eq.${taskId}`, limit: 1 }, { schema: 'wms' });
    return Array.isArray(rows) && rows[0] ? (rows[0] as PutawayTask) : null;
  }
  const c = conn();
  const r = await c.query(`SELECT * FROM wms.putaway_tasks WHERE id = $1`, [taskId]);
  return (r?.rows?.[0] || null) as PutawayTask | null;
}

// ── Fire / stok düzeltme ──────────────────────────────────────────────────────
export async function createStockAdjustment(data: {
  adjType?: string;
  reasonCode?: string;
  reasonText?: string;
  storeId?: string | null;
  createdBy?: string;
  lines: Array<{ productId?: string; productCode?: string; productName?: string; binId?: string; lotNo?: string; expiryDate?: string; qtyDelta: number; reasonCode?: string }>;
}): Promise<{ id: string; adj_no: string } | null> {
  const f = firmNr();
  const adjNo = `FIRE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
  const c = conn();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const hdr = await postgrest.post<any[]>(
      '/stock_adjustments',
      {
        firm_nr: f,
        store_id: data.storeId ?? null,
        adj_no: adjNo,
        adj_type: data.adjType ?? 'fire',
        reason_code: data.reasonCode ?? null,
        reason_text: data.reasonText ?? null,
        status: 'draft',
        created_by: data.createdBy ?? null,
      },
      { schema: 'wms', prefer: 'return=representation' }
    );
    const id = Array.isArray(hdr) ? hdr[0]?.id : (hdr as any)?.id;
    for (const ln of data.lines) {
      await postgrest.post(
        '/stock_adjustment_lines',
        {
          adjustment_id: id,
          product_id: ln.productId ?? null,
          product_code: ln.productCode ?? null,
          product_name: ln.productName ?? null,
          bin_id: ln.binId ?? null,
          lot_no: ln.lotNo ?? null,
          expiry_date: ln.expiryDate ?? null,
          qty_delta: ln.qtyDelta,
          reason_code: ln.reasonCode ?? data.reasonCode ?? null,
        },
        { schema: 'wms', prefer: 'return=minimal' }
      );
    }
    return { id, adj_no: adjNo };
  }
  const hdr = await c.query(
    `INSERT INTO wms.stock_adjustments (firm_nr, store_id, adj_no, adj_type, reason_code, reason_text, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
    [f, data.storeId ?? null, adjNo, data.adjType ?? 'fire', data.reasonCode ?? null, data.reasonText ?? null, data.createdBy ?? null]
  );
  const id = hdr?.rows?.[0]?.id;
  for (const ln of data.lines) {
    await c.query(
      `INSERT INTO wms.stock_adjustment_lines (adjustment_id, product_id, product_code, product_name, bin_id, lot_no, expiry_date, qty_delta, reason_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, ln.productId ?? null, ln.productCode ?? null, ln.productName ?? null, ln.binId ?? null, ln.lotNo ?? null, ln.expiryDate ?? null, ln.qtyDelta, ln.reasonCode ?? data.reasonCode ?? null]
    );
  }
  return { id, adj_no: adjNo };
}

// ── Packing (paketleme istasyonu) ─────────────────────────────────────────────
export interface PackingSlip {
  id: string;
  firm_nr: string;
  store_id?: string | null;
  pack_no: string;
  dispatch_slip_id?: string | null;
  delivery_id?: string | null;
  sales_id?: string | null;
  status: string;
  packed_by?: string | null;
  created_at?: string;
}

export interface PackingCarton {
  id: string;
  packing_slip_id: string;
  carton_no?: string | null;
  sscc?: string | null;
  tracking_no?: string | null;
  weight_kg?: number | null;
}

export async function listPackingSlips(status = 'all'): Promise<PackingSlip[]> {
  const f = firmNr();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const q: Record<string, string | number> = { select: '*', firm_nr: `eq.${f}`, order: 'created_at.desc', limit: 300 };
    if (status && status !== 'all') q.status = `eq.${status}`;
    const rows = await postgrest.get<any[]>('/packing_slips', q, { schema: 'wms' });
    return (Array.isArray(rows) ? rows : []) as PackingSlip[];
  }
  const c = conn();
  const params: unknown[] = [f];
  let where = `firm_nr = $1`;
  if (status && status !== 'all') {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const r = await c.query(`SELECT * FROM wms.packing_slips WHERE ${where} ORDER BY created_at DESC LIMIT 300`, params);
  return (r?.rows || []) as PackingSlip[];
}

export async function createPackingSlip(data: { deliveryId?: string; dispatchSlipId?: string; salesId?: string; storeId?: string; packedBy?: string }): Promise<PackingSlip | null> {
  const f = firmNr();
  const packNo = `PACK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
  const payload = {
    firm_nr: f,
    store_id: data.storeId ?? null,
    pack_no: packNo,
    delivery_id: data.deliveryId ?? null,
    dispatch_slip_id: data.dispatchSlipId ?? null,
    sales_id: data.salesId ?? null,
    status: 'open',
    packed_by: data.packedBy ?? null,
  };
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.post<any[]>('/packing_slips', payload, { schema: 'wms', prefer: 'return=representation' });
    return (Array.isArray(rows) ? rows[0] : rows) as PackingSlip;
  }
  const c = conn();
  const r = await c.query(
    `INSERT INTO wms.packing_slips (firm_nr, store_id, pack_no, delivery_id, dispatch_slip_id, sales_id, status, packed_by)
     VALUES ($1,$2,$3,$4,$5,$6,'open',$7) RETURNING *`,
    [f, payload.store_id, packNo, payload.delivery_id, payload.dispatch_slip_id, payload.sales_id, payload.packed_by]
  );
  return (r?.rows?.[0] || null) as PackingSlip | null;
}

export async function listCartons(packingSlipId: string): Promise<PackingCarton[]> {
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<any[]>('/packing_cartons', { select: '*', packing_slip_id: `eq.${packingSlipId}`, order: 'created_at.asc' }, { schema: 'wms' });
    return (Array.isArray(rows) ? rows : []) as PackingCarton[];
  }
  const c = conn();
  const r = await c.query(`SELECT * FROM wms.packing_cartons WHERE packing_slip_id = $1 ORDER BY created_at`, [packingSlipId]);
  return (r?.rows || []) as PackingCarton[];
}

export async function addCarton(packingSlipId: string, data: { cartonNo?: string; sscc?: string; trackingNo?: string; weightKg?: number }): Promise<void> {
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.post(
      '/packing_cartons',
      { packing_slip_id: packingSlipId, carton_no: data.cartonNo ?? null, sscc: data.sscc ?? null, tracking_no: data.trackingNo ?? null, weight_kg: data.weightKg ?? null },
      { schema: 'wms', prefer: 'return=minimal' }
    );
    return;
  }
  const c = conn();
  await c.query(
    `INSERT INTO wms.packing_cartons (packing_slip_id, carton_no, sscc, tracking_no, weight_kg) VALUES ($1,$2,$3,$4,$5)`,
    [packingSlipId, data.cartonNo ?? null, data.sscc ?? null, data.trackingNo ?? null, data.weightKg ?? null]
  );
}

export async function setPackingStatus(packingSlipId: string, status: string): Promise<void> {
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.patch(`/packing_slips?id=eq.${encodeURIComponent(packingSlipId)}`, { status }, { schema: 'wms' });
    return;
  }
  const c = conn();
  await c.query(`UPDATE wms.packing_slips SET status = $2, updated_at = now() WHERE id = $1`, [packingSlipId, status]);
}

// ── Fire / stok düzeltme listesi + uygula ─────────────────────────────────────
export interface StockAdjustment {
  id: string;
  firm_nr: string;
  adj_no: string;
  adj_type: string;
  reason_code?: string | null;
  reason_text?: string | null;
  status: string;
  created_at?: string;
}

export async function listStockAdjustments(status = 'all'): Promise<StockAdjustment[]> {
  const f = firmNr();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const q: Record<string, string | number> = { select: '*', firm_nr: `eq.${f}`, order: 'created_at.desc', limit: 300 };
    if (status && status !== 'all') q.status = `eq.${status}`;
    const rows = await postgrest.get<any[]>('/stock_adjustments', q, { schema: 'wms' });
    return (Array.isArray(rows) ? rows : []) as StockAdjustment[];
  }
  const c = conn();
  const params: unknown[] = [f];
  let where = `firm_nr = $1`;
  if (status && status !== 'all') {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const r = await c.query(`SELECT * FROM wms.stock_adjustments WHERE ${where} ORDER BY created_at DESC LIMIT 300`, params);
  return (r?.rows || []) as StockAdjustment[];
}

/** Düzeltmeyi onayla → satır delta'larını bin envanterine uygula (bin_id olanlar) */
export async function applyStockAdjustment(adjustmentId: string, storeId?: string | null): Promise<void> {
  let lines: any[] = [];
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    lines = await postgrest.get<any[]>('/stock_adjustment_lines', { select: '*', adjustment_id: `eq.${adjustmentId}` }, { schema: 'wms' });
  } else {
    const c = conn();
    const r = await c.query(`SELECT * FROM wms.stock_adjustment_lines WHERE adjustment_id = $1`, [adjustmentId]);
    lines = r?.rows || [];
  }
  for (const ln of Array.isArray(lines) ? lines : []) {
    if (ln.bin_id && ln.product_id) {
      await adjustBinInventory({
        storeId: storeId ?? null,
        binId: String(ln.bin_id),
        productId: String(ln.product_id),
        qtyDelta: Number(ln.qty_delta || 0),
        lotNo: ln.lot_no ?? null,
        expiryDate: ln.expiry_date ?? null,
        productCode: ln.product_code ?? null,
        productName: ln.product_name ?? null,
      });
    }
  }
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.patch(`/stock_adjustments?id=eq.${encodeURIComponent(adjustmentId)}`, { status: 'applied' }, { schema: 'wms' });
  } else {
    const c = conn();
    await c.query(`UPDATE wms.stock_adjustments SET status = 'applied', updated_at = now() WHERE id = $1`, [adjustmentId]);
  }
}

/** Bin-to-bin transfer: kaynaktan düş, hedefe ekle (aynı lot/SKT) */
export async function binToBinTransfer(args: {
  storeId?: string | null;
  fromBinId: string;
  toBinId: string;
  productId: string;
  qty: number;
  lotNo?: string | null;
  expiryDate?: string | null;
  productCode?: string | null;
  productName?: string | null;
}): Promise<void> {
  await adjustBinInventory({ ...args, binId: args.fromBinId, qtyDelta: -Math.abs(args.qty) });
  await adjustBinInventory({ ...args, binId: args.toBinId, qtyDelta: Math.abs(args.qty) });
}

/** Putaway üretmek için mevcut mal kabul fişleri (wmsService köprüsü) */
export async function listReceivingForPutaway(): Promise<Array<{ id: string; slip_no: string; supplier_name?: string; status?: string }>> {
  const { getReceivingSlips } = await import('./wmsService');
  const slips = await getReceivingSlips().catch(() => []);
  return (Array.isArray(slips) ? slips : []).map((s: any) => ({
    id: s.id,
    slip_no: s.slip_no,
    supplier_name: s.supplier_name,
    status: s.status,
  }));
}

export const wmsEnterpriseService = {
  listBins,
  createBin,
  getBinInventory,
  adjustBinInventory,
  allocateFefo,
  listPutawayTasks,
  createPutawayFromReceiving,
  completePutaway,
  createStockAdjustment,
  listStockAdjustments,
  applyStockAdjustment,
  binToBinTransfer,
  listPackingSlips,
  createPackingSlip,
  listCartons,
  addCarton,
  setPackingStatus,
  listReceivingForPutaway,
};

export default wmsEnterpriseService;
