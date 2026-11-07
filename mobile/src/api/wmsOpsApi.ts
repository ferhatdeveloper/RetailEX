/**
 * WMS işlemleri — web `wmsService` (kabul / sevkiyat) ve
 * `wmsEnterpriseService` (lokasyon, yerleştirme, paket, fire) ile aynı tablolar.
 */

import { pgQuery } from './pgClient';
import { postgrestGet, postgrestPatch, postgrestPost } from './postgrestClient';
import { runDataTransport } from './dataTransport';
import { firmNr, storeId } from './erpTables';

const WMS = { schema: 'wms' as const };

export type WmsSlip = {
  id: string;
  slip_no: string;
  party: string | null;
  status: string;
  notes: string | null;
  item_count: number;
};

export type WmsBinRow = {
  id: string;
  code: string;
  zone: string | null;
  bin_type: string | null;
};

export type PutawayRow = {
  id: string;
  product_name: string | null;
  qty: number;
  status: string;
  product_id: string | null;
  lot_no: string | null;
  expiry_date: string | null;
  product_code: string | null;
  store_id: string | null;
};

export type PackingRow = {
  id: string;
  pack_no: string;
  status: string;
};

export type AdjustmentRow = {
  id: string;
  adj_no: string;
  adj_type: string;
  status: string;
  reason_text: string | null;
};

function yearSeq(prefix: string, count: number): string {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(count + 1).padStart(4, '0')}`;
}

async function ensureSlipTables(): Promise<void> {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS wms.receiving_slips (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr VARCHAR(10) NOT NULL,
      store_id UUID,
      slip_no VARCHAR(50) UNIQUE NOT NULL,
      supplier_name VARCHAR(255),
      status VARCHAR(20) DEFAULT 'draft',
      date DATE DEFAULT CURRENT_DATE,
      notes TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS wms.receiving_lines (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      slip_id UUID,
      product_id UUID,
      product_name VARCHAR(500),
      product_code VARCHAR(100),
      barcode VARCHAR(100),
      ordered_qty NUMERIC(15,3) DEFAULT 0,
      received_qty NUMERIC(15,3) DEFAULT 0,
      unit VARCHAR(50),
      lot_number VARCHAR(100),
      expiry_date DATE,
      location_code VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS wms.dispatch_slips (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      firm_nr VARCHAR(10) NOT NULL,
      store_id UUID,
      slip_no VARCHAR(50) UNIQUE NOT NULL,
      customer_name VARCHAR(255),
      status VARCHAR(20) DEFAULT 'draft',
      priority VARCHAR(20) DEFAULT 'normal',
      date DATE DEFAULT CURRENT_DATE,
      notes TEXT,
      created_by VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS wms.dispatch_lines (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      slip_id UUID,
      product_id UUID,
      product_name VARCHAR(500),
      product_code VARCHAR(100),
      barcode VARCHAR(100),
      ordered_qty NUMERIC(15,3) DEFAULT 0,
      picked_qty NUMERIC(15,3) DEFAULT 0,
      unit VARCHAR(50),
      location_code VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
  ];
  for (const sql of ddl) {
    try {
      await pgQuery(sql);
    } catch {
      /* tablo zaten var */
    }
  }
}

function mapSlip(r: Record<string, unknown>, partyKey: string): WmsSlip {
  return {
    id: String(r.id ?? ''),
    slip_no: String(r.slip_no ?? ''),
    party: r[partyKey] != null ? String(r[partyKey]) : null,
    status: String(r.status ?? 'draft'),
    notes: r.notes != null ? String(r.notes) : null,
    item_count: Number(r.item_count ?? 0) || 0,
  };
}

export async function fetchReceivingSlips(): Promise<WmsSlip[]> {
  const fn = firmNr();
  return runDataTransport({
    label: 'fetchReceivingSlips',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/receiving_slips',
        { select: 'id,slip_no,supplier_name,status,notes', firm_nr: `eq.${fn}`, order: 'created_at.desc', limit: 100 },
        WMS,
      );
      return (Array.isArray(rows) ? rows : []).map((r) => mapSlip(r, 'supplier_name'));
    },
    viaBridge: async () => {
      await ensureSlipTables();
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT rs.id::text AS id, rs.slip_no, rs.supplier_name, rs.status, rs.notes,
                COUNT(rl.id)::int AS item_count
           FROM wms.receiving_slips rs
           LEFT JOIN wms.receiving_lines rl ON rl.slip_id = rs.id
          WHERE rs.firm_nr = $1
          GROUP BY rs.id
          ORDER BY rs.created_at DESC
          LIMIT 100`,
        [fn],
      );
      return res.rows.map((r) => mapSlip(r, 'supplier_name'));
    },
  });
}

export async function createReceivingSlip(supplierName: string, notes?: string): Promise<string> {
  const fn = firmNr();
  const sid = storeId();
  return runDataTransport({
    label: 'createReceivingSlip',
    viaRest: async () => {
      const existing = await postgrestGet<unknown[]>('/receiving_slips', { select: 'id', firm_nr: `eq.${fn}`, limit: 500 }, WMS);
      const slipNo = yearSeq('MAL', Array.isArray(existing) ? existing.length : 0);
      const rows = await postgrestPost<Record<string, unknown>[]>(
        '/receiving_slips',
        {
          firm_nr: fn,
          store_id: sid,
          slip_no: slipNo,
          supplier_name: supplierName || null,
          notes: notes || null,
          status: 'draft',
        },
        { ...WMS, prefer: 'return=representation' },
      );
      const row = Array.isArray(rows) ? rows[0] : rows;
      return String((row as { id?: string })?.id ?? '');
    },
    viaBridge: async () => {
      await ensureSlipTables();
      const year = new Date().getFullYear();
      const cnt = await pgQuery<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM wms.receiving_slips WHERE firm_nr = $1 AND date_part('year', created_at) = $2`,
        [fn, year],
      );
      const slipNo = yearSeq('MAL', Number(cnt.rows[0]?.count ?? 0));
      const res = await pgQuery<{ id: string }>(
        `INSERT INTO wms.receiving_slips (firm_nr, store_id, slip_no, supplier_name, notes, status)
         VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING id::text AS id`,
        [fn, sid, slipNo, supplierName || null, notes || null],
      );
      return res.rows[0]?.id ?? '';
    },
  });
}

export async function addReceivingLine(slipId: string, productName: string, qty: number): Promise<void> {
  const q = Math.abs(Number(qty) || 0);
  await runDataTransport({
    label: 'addReceivingLine',
    viaRest: async () => {
      await postgrestPost(
        '/receiving_lines',
        { slip_id: slipId, product_name: productName, ordered_qty: q, received_qty: q },
        { ...WMS, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      await ensureSlipTables();
      await pgQuery(
        `INSERT INTO wms.receiving_lines (slip_id, product_name, ordered_qty, received_qty)
         VALUES ($1::uuid, $2, $3, $3)`,
        [slipId, productName, q],
      );
    },
  });
}

export async function setReceivingStatus(slipId: string, status: string): Promise<void> {
  await runDataTransport({
    label: 'setReceivingStatus',
    viaRest: async () => {
      await postgrestPatch(
        `/receiving_slips?id=eq.${encodeURIComponent(slipId)}`,
        { status, updated_at: new Date().toISOString() },
        { ...WMS, prefer: 'return=minimal' },
      );
    },
    viaBridge: () =>
      pgQuery(`UPDATE wms.receiving_slips SET status = $2, updated_at = NOW() WHERE id = $1::uuid`, [slipId, status]),
  });
}

export async function fetchDispatchSlips(): Promise<WmsSlip[]> {
  const fn = firmNr();
  return runDataTransport({
    label: 'fetchDispatchSlips',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/dispatch_slips',
        { select: 'id,slip_no,customer_name,status,notes', firm_nr: `eq.${fn}`, order: 'created_at.desc', limit: 100 },
        WMS,
      );
      return (Array.isArray(rows) ? rows : []).map((r) => mapSlip(r, 'customer_name'));
    },
    viaBridge: async () => {
      await ensureSlipTables();
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT ds.id::text AS id, ds.slip_no, ds.customer_name, ds.status, ds.notes,
                COUNT(dl.id)::int AS item_count
           FROM wms.dispatch_slips ds
           LEFT JOIN wms.dispatch_lines dl ON dl.slip_id = ds.id
          WHERE ds.firm_nr = $1
          GROUP BY ds.id
          ORDER BY ds.created_at DESC
          LIMIT 100`,
        [fn],
      );
      return res.rows.map((r) => mapSlip(r, 'customer_name'));
    },
  });
}

export async function createDispatchSlip(customerName: string, notes?: string): Promise<string> {
  const fn = firmNr();
  const sid = storeId();
  return runDataTransport({
    label: 'createDispatchSlip',
    viaRest: async () => {
      const existing = await postgrestGet<unknown[]>('/dispatch_slips', { select: 'id', firm_nr: `eq.${fn}`, limit: 500 }, WMS);
      const slipNo = yearSeq('SEV', Array.isArray(existing) ? existing.length : 0);
      const rows = await postgrestPost<Record<string, unknown>[]>(
        '/dispatch_slips',
        {
          firm_nr: fn,
          store_id: sid,
          slip_no: slipNo,
          customer_name: customerName || null,
          notes: notes || null,
          status: 'draft',
          priority: 'normal',
        },
        { ...WMS, prefer: 'return=representation' },
      );
      const row = Array.isArray(rows) ? rows[0] : rows;
      return String((row as { id?: string })?.id ?? '');
    },
    viaBridge: async () => {
      await ensureSlipTables();
      const year = new Date().getFullYear();
      const cnt = await pgQuery<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM wms.dispatch_slips WHERE firm_nr = $1 AND date_part('year', created_at) = $2`,
        [fn, year],
      );
      const slipNo = yearSeq('SEV', Number(cnt.rows[0]?.count ?? 0));
      const res = await pgQuery<{ id: string }>(
        `INSERT INTO wms.dispatch_slips (firm_nr, store_id, slip_no, customer_name, notes, status, priority)
         VALUES ($1, $2, $3, $4, $5, 'draft', 'normal') RETURNING id::text AS id`,
        [fn, sid, slipNo, customerName || null, notes || null],
      );
      return res.rows[0]?.id ?? '';
    },
  });
}

export async function addDispatchLine(slipId: string, productName: string, qty: number): Promise<void> {
  const q = Math.abs(Number(qty) || 0);
  await runDataTransport({
    label: 'addDispatchLine',
    viaRest: async () => {
      await postgrestPost(
        '/dispatch_lines',
        { slip_id: slipId, product_name: productName, ordered_qty: q, picked_qty: q },
        { ...WMS, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      await ensureSlipTables();
      await pgQuery(
        `INSERT INTO wms.dispatch_lines (slip_id, product_name, ordered_qty, picked_qty)
         VALUES ($1::uuid, $2, $3, $3)`,
        [slipId, productName, q],
      );
    },
  });
}

export async function setDispatchStatus(slipId: string, status: string): Promise<void> {
  await runDataTransport({
    label: 'setDispatchStatus',
    viaRest: async () => {
      await postgrestPatch(
        `/dispatch_slips?id=eq.${encodeURIComponent(slipId)}`,
        { status, updated_at: new Date().toISOString() },
        { ...WMS, prefer: 'return=minimal' },
      );
    },
    viaBridge: () =>
      pgQuery(`UPDATE wms.dispatch_slips SET status = $2, updated_at = NOW() WHERE id = $1::uuid`, [slipId, status]),
  });
}

export async function fetchBins(): Promise<WmsBinRow[]> {
  const fn = firmNr();
  return runDataTransport({
    label: 'fetchBins',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/bins',
        { select: 'id,code,zone,bin_type,is_active', or: `(firm_nr.eq.${fn},firm_nr.is.null)`, order: 'code.asc', limit: 500 },
        WMS,
      );
      return (Array.isArray(rows) ? rows : [])
        .filter((r) => r.is_active !== false)
        .map((r) => ({
          id: String(r.id ?? ''),
          code: String(r.code ?? ''),
          zone: r.zone != null ? String(r.zone) : null,
          bin_type: r.bin_type != null ? String(r.bin_type) : null,
        }));
    },
    viaBridge: async () => {
      const res = await pgQuery<WmsBinRow>(
        `SELECT id::text AS id, code, zone, bin_type
           FROM wms.bins
          WHERE (firm_nr = $1 OR firm_nr IS NULL) AND COALESCE(is_active, true) = true
          ORDER BY code
          LIMIT 500`,
        [fn],
      );
      return res.rows;
    },
  });
}

export async function createBin(code: string, zone?: string): Promise<void> {
  const fn = firmNr();
  const sid = storeId();
  const payload = {
    firm_nr: fn,
    store_id: sid,
    code: code.trim(),
    zone: zone?.trim() || null,
    bin_type: 'storage',
    is_active: true,
  };
  await runDataTransport({
    label: 'createBin',
    viaRest: () => postgrestPost('/bins', payload, { ...WMS, prefer: 'return=minimal' }),
    viaBridge: () =>
      pgQuery(
        `INSERT INTO wms.bins (firm_nr, store_id, code, zone, bin_type, is_active)
         VALUES ($1, $2, $3, $4, 'storage', true)`,
        [fn, sid, payload.code, payload.zone],
      ),
  });
}

export async function fetchPutawayTasks(): Promise<PutawayRow[]> {
  const fn = firmNr();
  return runDataTransport({
    label: 'fetchPutawayTasks',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/putaway_tasks',
        { select: '*', firm_nr: `eq.${fn}`, order: 'created_at.desc', limit: 200 },
        WMS,
      );
      return (Array.isArray(rows) ? rows : []).map(mapPutaway);
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id::text AS id, product_name, qty, status, product_id::text AS product_id,
                lot_no, expiry_date::text AS expiry_date, product_code, store_id::text AS store_id
           FROM wms.putaway_tasks
          WHERE firm_nr = $1
          ORDER BY created_at DESC
          LIMIT 200`,
        [fn],
      );
      return res.rows.map(mapPutaway);
    },
  });
}

function mapPutaway(r: Record<string, unknown>): PutawayRow {
  return {
    id: String(r.id ?? ''),
    product_name: r.product_name != null ? String(r.product_name) : null,
    qty: Number(r.qty) || 0,
    status: String(r.status ?? 'open'),
    product_id: r.product_id != null ? String(r.product_id) : null,
    lot_no: r.lot_no != null ? String(r.lot_no) : null,
    expiry_date: r.expiry_date != null ? String(r.expiry_date).slice(0, 10) : null,
    product_code: r.product_code != null ? String(r.product_code) : null,
    store_id: r.store_id != null ? String(r.store_id) : null,
  };
}

/** Web `createPutawayFromReceiving` — kabul satırından açık görev. */
export async function createPutawayFromReceiving(slipId: string): Promise<number> {
  const fn = firmNr();
  return runDataTransport({
    label: 'createPutawayFromReceiving',
    viaRest: async () => {
      const lines = await postgrestGet<Record<string, unknown>[]>(
        '/receiving_lines',
        { select: '*', slip_id: `eq.${slipId}` },
        WMS,
      );
      let n = 0;
      for (const ln of Array.isArray(lines) ? lines : []) {
        await postgrestPost(
          '/putaway_tasks',
          {
            firm_nr: fn,
            receiving_slip_id: slipId,
            receiving_line_id: ln.id,
            product_id: ln.product_id ?? null,
            product_code: ln.product_code ?? null,
            product_name: ln.product_name ?? null,
            lot_no: ln.lot_number ?? ln.lot_no ?? null,
            expiry_date: ln.expiry_date ?? null,
            qty: Number(ln.received_qty ?? ln.ordered_qty ?? 0),
            suggested_bin_id: ln.bin_id ?? null,
            status: 'open',
          },
          { ...WMS, prefer: 'return=minimal' },
        );
        n += 1;
      }
      return n;
    },
    viaBridge: async () => {
      const res = await pgQuery(
        `INSERT INTO wms.putaway_tasks
           (firm_nr, receiving_slip_id, receiving_line_id, product_id, product_code, product_name, lot_no, expiry_date, qty, suggested_bin_id, status)
         SELECT $1, $2::uuid, l.id, l.product_id, l.product_code, l.product_name, l.lot_number, l.expiry_date,
                COALESCE(l.received_qty, l.ordered_qty, 0), NULL, 'open'
           FROM wms.receiving_lines l
          WHERE l.slip_id = $2::uuid`,
        [fn, slipId],
      );
      return res.rowCount ?? 0;
    },
  });
}

/** Web `completePutaway` — `wms.upsert_bin_inventory` sonra görev kapanır. */
export async function completePutaway(task: PutawayRow, binId: string): Promise<void> {
  const fn = firmNr();
  const qty = Number(task.qty) || 0;
  if (!task.product_id) throw new Error('Görevde ürün yok');
  await runDataTransport({
    label: 'completePutaway',
    viaRest: async () => {
      await postgrestPost(
        '/rpc/upsert_bin_inventory',
        {
          p_firm_nr: fn,
          p_store_id: task.store_id ?? storeId(),
          p_bin_id: binId,
          p_product_id: task.product_id,
          p_qty_delta: qty,
          p_lot_no: task.lot_no,
          p_expiry_date: task.expiry_date,
          p_product_code: task.product_code,
          p_product_name: task.product_name,
          p_uom: 'Adet',
        },
        { ...WMS, prefer: 'return=minimal' },
      );
      await postgrestPatch(
        `/putaway_tasks?id=eq.${encodeURIComponent(task.id)}`,
        { to_bin_id: binId, qty_done: qty, status: 'done' },
        { ...WMS, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      await pgQuery(
        `SELECT wms.upsert_bin_inventory($1,$2,$3::uuid,$4::uuid,$5,$6,$7::date,$8,$9,$10)`,
        [fn, task.store_id ?? storeId(), binId, task.product_id, qty, task.lot_no, task.expiry_date, task.product_code, task.product_name, 'Adet'],
      );
      await pgQuery(
        `UPDATE wms.putaway_tasks SET to_bin_id = $2::uuid, qty_done = qty, status = 'done', updated_at = now() WHERE id = $1::uuid`,
        [task.id, binId],
      );
    },
  });
}

export async function fetchPackingSlips(): Promise<PackingRow[]> {
  const fn = firmNr();
  return runDataTransport({
    label: 'fetchPackingSlips',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/packing_slips',
        { select: 'id,pack_no,status', firm_nr: `eq.${fn}`, order: 'created_at.desc', limit: 200 },
        WMS,
      );
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        id: String(r.id ?? ''),
        pack_no: String(r.pack_no ?? ''),
        status: String(r.status ?? 'open'),
      }));
    },
    viaBridge: async () => {
      const res = await pgQuery<PackingRow>(
        `SELECT id::text AS id, pack_no, status FROM wms.packing_slips WHERE firm_nr = $1 ORDER BY created_at DESC LIMIT 200`,
        [fn],
      );
      return res.rows;
    },
  });
}

export async function createPackingSlip(): Promise<void> {
  const fn = firmNr();
  const sid = storeId();
  const packNo = `PKT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
  await runDataTransport({
    label: 'createPackingSlip',
    viaRest: () =>
      postgrestPost(
        '/packing_slips',
        { firm_nr: fn, store_id: sid, pack_no: packNo, status: 'open' },
        { ...WMS, prefer: 'return=minimal' },
      ),
    viaBridge: () =>
      pgQuery(
        `INSERT INTO wms.packing_slips (firm_nr, store_id, pack_no, status) VALUES ($1, $2, $3, 'open')`,
        [fn, sid, packNo],
      ),
  });
}

export async function setPackingStatus(id: string, status: string): Promise<void> {
  await runDataTransport({
    label: 'setPackingStatus',
    viaRest: () =>
      postgrestPatch(`/packing_slips?id=eq.${encodeURIComponent(id)}`, { status }, { ...WMS, prefer: 'return=minimal' }),
    viaBridge: () =>
      pgQuery(`UPDATE wms.packing_slips SET status = $2, updated_at = now() WHERE id = $1::uuid`, [id, status]),
  });
}

export async function fetchAdjustments(): Promise<AdjustmentRow[]> {
  const fn = firmNr();
  return runDataTransport({
    label: 'fetchAdjustments',
    viaRest: async () => {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/stock_adjustments',
        { select: 'id,adj_no,adj_type,status,reason_text', firm_nr: `eq.${fn}`, order: 'created_at.desc', limit: 200 },
        WMS,
      );
      return (Array.isArray(rows) ? rows : []).map(mapAdj);
    },
    viaBridge: async () => {
      const res = await pgQuery<Record<string, unknown>>(
        `SELECT id::text AS id, adj_no, adj_type, status, reason_text
           FROM wms.stock_adjustments WHERE firm_nr = $1 ORDER BY created_at DESC LIMIT 200`,
        [fn],
      );
      return res.rows.map(mapAdj);
    },
  });
}

function mapAdj(r: Record<string, unknown>): AdjustmentRow {
  return {
    id: String(r.id ?? ''),
    adj_no: String(r.adj_no ?? ''),
    adj_type: String(r.adj_type ?? 'fire'),
    status: String(r.status ?? 'draft'),
    reason_text: r.reason_text != null ? String(r.reason_text) : null,
  };
}

/** Fire / düzeltme taslağı. Miktar deltası web ile aynı: eksi = çıkış. */
export async function createAdjustment(productName: string, qtyDelta: number, reason: string): Promise<void> {
  const fn = firmNr();
  const sid = storeId();
  const adjNo = `FIRE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
  const delta = Number(qtyDelta);
  if (!Number.isFinite(delta) || delta === 0) throw new Error('Miktar farkı gerekli');
  await runDataTransport({
    label: 'createAdjustment',
    viaRest: async () => {
      const hdr = await postgrestPost<Record<string, unknown>[]>(
        '/stock_adjustments',
        {
          firm_nr: fn,
          store_id: sid,
          adj_no: adjNo,
          adj_type: 'fire',
          reason_text: reason || null,
          status: 'draft',
        },
        { ...WMS, prefer: 'return=representation' },
      );
      const id = Array.isArray(hdr) ? hdr[0]?.id : (hdr as { id?: string })?.id;
      await postgrestPost(
        '/stock_adjustment_lines',
        { adjustment_id: id, product_name: productName, qty_delta: delta, reason_code: 'fire' },
        { ...WMS, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const hdr = await pgQuery<{ id: string }>(
        `INSERT INTO wms.stock_adjustments (firm_nr, store_id, adj_no, adj_type, reason_text, status)
         VALUES ($1, $2, $3, 'fire', $4, 'draft') RETURNING id::text AS id`,
        [fn, sid, adjNo, reason || null],
      );
      const id = hdr.rows[0]?.id;
      await pgQuery(
        `INSERT INTO wms.stock_adjustment_lines (adjustment_id, product_name, qty_delta, reason_code)
         VALUES ($1::uuid, $2, $3, 'fire')`,
        [id, productName, delta],
      );
    },
  });
}

export async function applyAdjustment(adjustmentId: string): Promise<void> {
  const fn = firmNr();
  await runDataTransport({
    label: 'applyAdjustment',
    viaRest: async () => {
      const lines = await postgrestGet<Record<string, unknown>[]>(
        '/stock_adjustment_lines',
        { select: '*', adjustment_id: `eq.${adjustmentId}` },
        WMS,
      );
      for (const ln of Array.isArray(lines) ? lines : []) {
        if (!ln.bin_id || !ln.product_id) continue;
        await postgrestPost(
          '/rpc/upsert_bin_inventory',
          {
            p_firm_nr: fn,
            p_store_id: storeId(),
            p_bin_id: ln.bin_id,
            p_product_id: ln.product_id,
            p_qty_delta: Number(ln.qty_delta) || 0,
            p_lot_no: ln.lot_no ?? null,
            p_expiry_date: ln.expiry_date ?? null,
            p_product_code: ln.product_code ?? null,
            p_product_name: ln.product_name ?? null,
            p_uom: 'Adet',
          },
          { ...WMS, prefer: 'return=minimal' },
        );
      }
      await postgrestPatch(
        `/stock_adjustments?id=eq.${encodeURIComponent(adjustmentId)}`,
        { status: 'applied' },
        { ...WMS, prefer: 'return=minimal' },
      );
    },
    viaBridge: async () => {
      const lines = await pgQuery<Record<string, unknown>>(
        `SELECT * FROM wms.stock_adjustment_lines WHERE adjustment_id = $1::uuid`,
        [adjustmentId],
      );
      for (const ln of lines.rows) {
        if (!ln.bin_id || !ln.product_id) continue;
        await pgQuery(
          `SELECT wms.upsert_bin_inventory($1,$2,$3::uuid,$4::uuid,$5,$6,$7::date,$8,$9,$10)`,
          [fn, storeId(), ln.bin_id, ln.product_id, Number(ln.qty_delta) || 0, ln.lot_no ?? null, ln.expiry_date ?? null, ln.product_code ?? null, ln.product_name ?? null, 'Adet'],
        );
      }
      await pgQuery(`UPDATE wms.stock_adjustments SET status = 'applied', updated_at = now() WHERE id = $1::uuid`, [adjustmentId]);
    },
  });
}
