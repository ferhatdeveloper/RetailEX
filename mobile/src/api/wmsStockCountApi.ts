/**
 * WMS stok sayım — web wmsStockCountPostgrest.ts + wmsStockCount.ts ile aynı tablolar.
 * PostgREST önce (wms şeması), bridge SQL yedek (shouldUseBridgeSql).
 */

import { pgQuery } from './pgClient';
import {
  postgrestDelete,
  postgrestGet,
  postgrestPatch,
  postgrestPost,
} from './postgrestClient';
import { runDataTransport } from './dataTransport';
import {
  appendStoreIdFilter,
  firmNr,
  newUuid,
  periodNr,
  productsTable,
  stockMovementItemsTable,
  stockMovementsTable,
  storeId,
} from './erpTables';
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

const WMS_SCHEMA = { schema: 'wms' as const };
const PUB_SCHEMA = { schema: 'public' as const };

function restMovementPaths(): { movements: string; items: string } {
  const f = fn();
  const p = periodNr();
  return {
    movements: `/${stockMovementsTable(f, p)}`,
    items: `/${stockMovementItemsTable(f, p)}`,
  };
}

function restLineCountedBase(l: CountingLine | Record<string, unknown>): number {
  const q = Number((l as CountingLine).counted_qty);
  const m = Number((l as CountingLine).unit_multiplier) > 0 ? Number((l as CountingLine).unit_multiplier) : 1;
  const fromCounted = (Number.isFinite(q) ? q : 0) * m;
  const rawBase = (l as CountingLine).base_counted_qty;
  if (rawBase != null && Number.isFinite(Number(rawBase))) {
    const b = Number(rawBase);
    if (Math.abs(b) < 1e-9 && Math.abs(fromCounted) > 1e-9) return fromCounted;
    return b;
  }
  return fromCounted;
}

async function runCountingTransport<T>(label: string, viaRest: () => Promise<T>, viaBridge: () => Promise<T>): Promise<T> {
  return runDataTransport({ label, viaRest, viaBridge });
}

async function restGenerateFicheNo(): Promise<string> {
  const firm = fn();
  const year = new Date().getFullYear();
  const prefix = `SAY-${year}-`;
  const rows = await postgrestGet<Array<{ fiche_no: string }>>(
    '/counting_slips',
    {
      firm_nr: `eq.${firm}`,
      fiche_no: `like.${prefix}*`,
      select: 'fiche_no',
      order: 'fiche_no.desc',
      limit: 1,
    },
    WMS_SCHEMA,
  );
  let next = 1;
  const list = Array.isArray(rows) ? rows : [];
  if (list[0]?.fiche_no) {
    const m = String(list[0].fiche_no).match(new RegExp(`^SAY-${year}-(\\d+)$`));
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

async function restFetchCountingSlips(): Promise<CountingSlip[]> {
  const firm = fn();
  const sid = storeId();
  const q: Record<string, string | number> = {
    firm_nr: `eq.${firm}`,
    select: '*',
    order: 'created_at.desc',
    limit: 100,
    status: 'not.in.(cancelled)',
  };
  if (sid) q.store_id = `eq.${sid}`;

  const slips = await postgrestGet<CountingSlip[]>('/counting_slips', q, WMS_SCHEMA);
  const slipList = Array.isArray(slips) ? slips : [];
  if (!slipList.length) return [];

  const ids = slipList.map((s) => s.id).filter(Boolean);
  const inList = ids.map((id) => String(id)).join(',');
  let lineRows: Array<{ slip_id: string; id: string }> = [];
  try {
    lineRows = await postgrestGet<Array<{ slip_id: string; id: string }>>(
      '/counting_lines',
      { slip_id: `in.(${inList})`, select: 'slip_id,id' },
      WMS_SCHEMA,
    );
  } catch {
    lineRows = [];
  }
  const countBySlip: Record<string, number> = {};
  for (const l of Array.isArray(lineRows) ? lineRows : []) {
    const sidKey = String(l.slip_id);
    countBySlip[sidKey] = (countBySlip[sidKey] || 0) + 1;
  }

  const storeRows = await postgrestGet<Array<{ id: string; name: string }>>(
    '/stores',
    { select: 'id,name', is_active: 'eq.true', limit: 5000 },
    PUB_SCHEMA,
  );
  const storeMap: Record<string, string> = {};
  for (const s of Array.isArray(storeRows) ? storeRows : []) {
    storeMap[String(s.id)] = String(s.name ?? '');
  }

  return slipList.map((r) => ({
    ...r,
    store_name: storeMap[String(r.store_id)] || undefined,
    line_count: countBySlip[String(r.id)] || 0,
  }));
}

async function restFetchSlipWithLines(
  slipId: string,
): Promise<{ slip: CountingSlip | null; lines: CountingLine[] }> {
  const slipRows = await postgrestGet<CountingSlip[]>(
    '/counting_slips',
    { id: `eq.${slipId}`, select: '*', limit: 1 },
    WMS_SCHEMA,
  );
  const slip = Array.isArray(slipRows) ? slipRows[0] ?? null : null;
  const lineRows = await postgrestGet<CountingLine[]>(
    '/counting_lines',
    {
      slip_id: `eq.${slipId}`,
      select: '*',
      order: 'counted_at.desc.nullslast,id.asc',
    },
    WMS_SCHEMA,
  );
  const lines = Array.isArray(lineRows) ? lineRows : [];
  if (slip?.store_id) {
    try {
      const sr = await postgrestGet<Array<{ name?: string }>>(
        '/stores',
        { id: `eq.${slip.store_id}`, select: 'name', limit: 1 },
        PUB_SCHEMA,
      );
      const s0 = Array.isArray(sr) ? sr[0] : undefined;
      if (s0?.name) slip.store_name = String(s0.name);
    } catch {
      /* ignore */
    }
  }
  return { slip, lines };
}

async function restCreateCountingSlipLive(
  data: {
    store_id: string;
    count_type?: 'full' | 'cycle' | 'location';
    description?: string;
  },
  writeOpts?: Pick<WmsWriteOptions, 'id' | 'ficheNo'>,
): Promise<CountingSlip> {
  const slipId = writeOpts?.id;
  if (slipId) {
    const { slip } = await restFetchSlipWithLines(slipId);
    if (slip) return slip;
  }

  const firm = fn();
  const ficheNo = writeOpts?.ficheNo || (await restGenerateFicheNo());
  const user = useAuthStore.getState().user;
  const today = new Date().toISOString().slice(0, 10);
  const body: Record<string, unknown> = {
    id: writeOpts?.id || newUuid(),
    firm_nr: firm,
    store_id: data.store_id,
    fiche_no: ficheNo,
    count_type: data.count_type || 'full',
    description: data.description ?? null,
    status: 'draft',
    created_by: user?.id ?? null,
    date: today,
  };
  const created = await postgrestPost<CountingSlip[]>(
    '/counting_slips',
    body,
    { ...WMS_SCHEMA, prefer: 'return=representation' },
  );
  const row = Array.isArray(created) ? created[0] : created;
  if (!row) throw new Error('Sayım fişi oluşturulamadı (PostgREST)');
  return row;
}

async function restUpdateSlipStatus(slipId: string, status: CountingSlip['status']): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === 'completed') {
    patch.completed_at = new Date().toISOString();
  }
  await postgrestPatch(
    `/counting_slips?id=eq.${encodeURIComponent(slipId)}`,
    patch,
    { ...WMS_SCHEMA, prefer: 'return=minimal' },
  );
}

async function restGetLineByBarcode(slipId: string, barcode: string): Promise<CountingLine | null> {
  const rows = await postgrestGet<CountingLine[]>(
    '/counting_lines',
    {
      slip_id: `eq.${slipId}`,
      barcode: `eq.${barcode}`,
      select: '*',
      limit: 1,
    },
    WMS_SCHEMA,
  );
  const list = Array.isArray(rows) ? rows : [];
  return list[0] ?? null;
}

async function restUpsertCountingLine(
  slipId: string,
  data: {
    product_id?: string;
    barcode?: string;
    product_name?: string;
    expected_qty?: number;
    counted_qty: number;
    unit?: string;
    unit_multiplier?: number;
    base_counted_qty?: number;
  },
  writeOpts?: Pick<WmsWriteOptions, 'lineId'>,
): Promise<CountingLine> {
  const firm = fn();
  const unitMultiplier = data.unit_multiplier || 1;
  const baseCounted = data.base_counted_qty ?? data.counted_qty * unitMultiplier;
  const by = cashier();
  const barcode = data.barcode?.trim() || null;

  let existing: CountingLine | null = null;
  if (barcode) {
    existing = await restGetLineByBarcode(slipId, barcode);
  } else if (data.product_id) {
    const rows = await postgrestGet<CountingLine[]>(
      '/counting_lines',
      {
        slip_id: `eq.${slipId}`,
        product_id: `eq.${data.product_id}`,
        select: '*',
        limit: 1,
      },
      WMS_SCHEMA,
    );
    existing = (Array.isArray(rows) ? rows : [])[0] ?? null;
  }

  if (existing?.id) {
    const expectedBase = Number(existing.expected_qty) || 0;
    const patch = {
      counted_qty: data.counted_qty,
      variance: baseCounted - expectedBase,
      counted_by: by,
      counted_at: new Date().toISOString(),
      product_name: data.product_name ?? existing.product_name ?? null,
      unit: data.unit ?? existing.unit ?? 'Adet',
      unit_multiplier: unitMultiplier,
      base_counted_qty: baseCounted,
    };
    const updated = await postgrestPatch<CountingLine[]>(
      `/counting_lines?id=eq.${encodeURIComponent(String(existing.id))}`,
      patch,
      { ...WMS_SCHEMA, prefer: 'return=representation' },
    );
    const u = Array.isArray(updated) ? updated[0] : updated;
    if (!u) throw new Error('Sayım satırı güncellenemedi');
    return u;
  }

  const variance = baseCounted - (Number(data.expected_qty) || 0);
  const insertBody: Record<string, unknown> = {
    id: writeOpts?.lineId || newUuid(),
    slip_id: slipId,
    firm_nr: firm,
    product_id: data.product_id ?? null,
    barcode,
    product_name: data.product_name ?? null,
    expected_qty: data.expected_qty || 0,
    counted_qty: data.counted_qty,
    variance,
    counted_by: by,
    counted_at: new Date().toISOString(),
    unit: data.unit || 'Adet',
    unit_multiplier: unitMultiplier,
    base_counted_qty: baseCounted,
  };
  const ins = await postgrestPost<CountingLine[]>(
    '/counting_lines',
    insertBody,
    { ...WMS_SCHEMA, prefer: 'return=representation' },
  );
  const row = Array.isArray(ins) ? ins[0] : ins;
  if (!row) throw new Error('Sayım satırı eklenemedi');
  return row;
}

async function restDeleteCountingLine(lineId: string): Promise<void> {
  await postgrestDelete(`/counting_lines?id=eq.${encodeURIComponent(lineId)}`, {
    ...WMS_SCHEMA,
    prefer: 'return=minimal',
  });
}

async function restLookupProductByBarcode(barcode: string): Promise<ProductLookup | null> {
  const code = barcode.trim();
  if (!code) return null;
  const table = productsTable();
  for (const col of ['barcode', 'code'] as const) {
    try {
      const rows = await postgrestGet<Record<string, unknown>[]>(
        `/${table}`,
        {
          [col]: `eq.${code}`,
          is_active: 'eq.true',
          select: 'id,name,code,barcode,unit',
          limit: 1,
        },
        PUB_SCHEMA,
      );
      const p = Array.isArray(rows) ? rows[0] : undefined;
      if (p) {
        const stockRows = await postgrestGet<Array<{ stock?: number }>>(
          `/${table}`,
          { id: `eq.${String(p.id)}`, select: 'stock', limit: 1 },
          PUB_SCHEMA,
        );
        const stock = Number((Array.isArray(stockRows) ? stockRows[0] : undefined)?.stock) || 0;
        return {
          id: String(p.id),
          name: String(p.name ?? ''),
          code: p.code != null ? String(p.code) : null,
          barcode: p.barcode != null ? String(p.barcode) : code,
          stock,
          unit: p.unit != null ? String(p.unit) : 'Adet',
        };
      }
    } catch {
      /* next */
    }
  }
  return null;
}

async function restGetProductStock(productId: string): Promise<number> {
  try {
    const table = productsTable();
    const rows = await postgrestGet<Array<{ stock?: number }>>(
      `/${table}`,
      { id: `eq.${productId}`, select: 'stock', limit: 1 },
      PUB_SCHEMA,
    );
    return Number((Array.isArray(rows) ? rows[0] : undefined)?.stock) || 0;
  } catch {
    return 0;
  }
}

async function restFetchVarianceSummary(slipId: string): Promise<VarianceSummary> {
  const lineRows = await postgrestGet<CountingLine[]>(
    '/counting_lines',
    { slip_id: `eq.${slipId}`, select: '*', limit: 100000 },
    WMS_SCHEMA,
  );
  return summarizeVarianceFromLines(
    (Array.isArray(lineRows) ? lineRows : []).filter((l) => l.counted_qty != null),
  );
}

async function restApplyStockCount(slipId: string): Promise<ApplyStockCountResult> {
  const { slip, lines } = await restFetchSlipWithLines(slipId);
  if (!slip) throw new Error('Sayım fişi bulunamadı');
  if (slip.status === 'completed') {
    return { processed: 0, surplus: 0, shortage: 0 };
  }

  const relevant = lines.filter(lineIsCountable);
  if (!relevant.length) {
    await restUpdateSlipStatus(slipId, 'completed');
    return { processed: 0, surplus: 0, shortage: 0 };
  }

  const firmNr = fn();
  const period = periodNr();
  const { movements: movPath, items: itemsPath } = restMovementPaths();
  const now = new Date().toISOString();
  const warehouseId = slip.store_id || null;
  const createdBy = createdByUuid(slip.created_by);
  const ficheNo = String(slip.fiche_no ?? '');

  const surplusLines = relevant.filter(
    (l) => restLineCountedBase(l) > (Number(l.expected_qty) || 0) + 1e-9,
  );
  const shortageLines = relevant.filter(
    (l) => restLineCountedBase(l) < (Number(l.expected_qty) || 0) - 1e-9,
  );

  const insertMovementWithItems = async (
    documentNo: string,
    movementType: 'in' | 'out',
    trcode: number,
    desc: string,
    lineSet: CountingLine[],
    qtyFn: (line: CountingLine) => number,
  ) => {
    const linesWithQty = lineSet.filter((l) => qtyFn(l) > 1e-9);
    if (!linesWithQty.length) return;

    const header: Record<string, unknown> = {
      firm_nr: firmNr,
      period_nr: period,
      document_no: documentNo,
      movement_type: movementType,
      trcode,
      warehouse_id: warehouseId,
      movement_date: now,
      exchange_rate: 1,
      description: desc,
      status: 'completed',
    };
    if (createdBy) header.created_by = createdBy;

    const mrows = await postgrestPost<Record<string, unknown>[]>(movPath, header, {
      ...PUB_SCHEMA,
      prefer: 'return=representation',
    });
    const mov = Array.isArray(mrows) ? mrows[0] : mrows;
    const mvId = mov?.id;
    if (!mvId) throw new Error('Stok fişi oluşturulamadı (PostgREST)');

    const itemRows = linesWithQty.map((line) => ({
      movement_id: mvId,
      product_id: line.product_id,
      quantity: qtyFn(line),
      unit_price: 0,
      cost_price: 0,
      exchange_rate: 1,
      unit_name: line.unit || 'Adet',
      convert_factor: Number(line.unit_multiplier) > 0 ? Number(line.unit_multiplier) : 1,
      notes: `Sayım: ${line.product_name || ''}`,
    }));
    const ITEM_BATCH = 120;
    for (let i = 0; i < itemRows.length; i += ITEM_BATCH) {
      await postgrestPost(itemsPath, itemRows.slice(i, i + ITEM_BATCH), {
        ...PUB_SCHEMA,
        prefer: 'return=minimal',
      });
    }
  };

  await insertMovementWithItems(
    `SAY-FAZ-${ficheNo}`,
    'in',
    26,
    `Sayım Fazlası - ${ficheNo}`,
    surplusLines,
    (line) => restLineCountedBase(line) - (Number(line.expected_qty) || 0),
  );

  await insertMovementWithItems(
    `SAY-EKS-${ficheNo}`,
    'out',
    50,
    `Sayım Eksiği - ${ficheNo}`,
    shortageLines,
    (line) => (Number(line.expected_qty) || 0) - restLineCountedBase(line),
  );

  const table = productsTable();
  const PATCH_CONCURRENCY = 14;
  for (let i = 0; i < relevant.length; i += PATCH_CONCURRENCY) {
    const slice = relevant.slice(i, i + PATCH_CONCURRENCY);
    await Promise.all(
      slice.map((line) => {
        const newStock = restLineCountedBase(line);
        return postgrestPatch(
          `/${table}?id=eq.${encodeURIComponent(String(line.product_id))}`,
          { stock: newStock },
          { ...PUB_SCHEMA, prefer: 'return=minimal' },
        );
      }),
    );
  }

  await restUpdateSlipStatus(slipId, 'completed');

  return {
    processed: relevant.length,
    surplus: surplusLines.length,
    shortage: shortageLines.length,
  };
}

export async function generateFicheNo(): Promise<string> {
  if (!shouldUseLiveData()) {
    return nextOfflineCountingFicheNo();
  }
  return runCountingTransport('generateFicheNo', restGenerateFicheNo, async () => {
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
  });
}

export async function fetchCountingStores(): Promise<WmsStore[]> {
  return runCountingTransport(
    'fetchCountingStores',
    async () => {
      const firm = fn();
      const rows = await postgrestGet<Record<string, unknown>[]>(
        '/stores',
        {
          select: 'id,name,code,firm_nr,type,is_active',
          is_active: 'eq.true',
          order: 'name.asc',
          limit: 500,
        },
        PUB_SCHEMA,
      );
      const list = (Array.isArray(rows) ? rows : []).filter((r) => {
        const type = r.type != null ? String(r.type) : '';
        if (type && !['STORE', 'BRANCH', 'WAREHOUSE'].includes(type)) return false;
        const fr = String(r.firm_nr ?? '').trim();
        const padded = firm.replace(/^0+/, '') || firm;
        return (
          !fr ||
          fr === firm ||
          fr === padded ||
          fr.padStart(3, '0') === firm.padStart(3, '0')
        );
      });
      if (list.length) {
        return list.map((r) => ({
          id: String(r.id ?? ''),
          name: String(r.name ?? ''),
          code: String(r.code ?? ''),
        }));
      }
      return (Array.isArray(rows) ? rows : []).slice(0, 50).map((r) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        code: String(r.code ?? ''),
      }));
    },
    async () => {
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
    },
  );
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
  const rows = await runCountingTransport('fetchCountingSlips', restFetchCountingSlips, async () => {
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
    return res.rows;
  });
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

  const { slip, lines } = await runCountingTransport(
    'fetchSlipWithLines',
    () => restFetchSlipWithLines(slipId),
    async () => {
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
    },
  );
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
      line_count: lines.length,
      lines: lines as CachedCountingLine[],
      pending: false,
    });
  }
  return { slip, lines };
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
  return runCountingTransport(
    'createCountingSlip',
    () => restCreateCountingSlipLive(data, writeOpts),
    async () => {
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
    },
  );
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
  await runCountingTransport(
    'updateCountingSlipStatus',
    () => restUpdateSlipStatus(slipId, status),
    async () => {
      await pgQuery(`UPDATE wms.counting_slips SET status = $2 WHERE id = $1::uuid`, [slipId, status]);
    },
  );
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
  return runCountingTransport(
    'lookupProductByBarcode',
    () => restLookupProductByBarcode(code),
    async () => {
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
    },
  );
}

export async function getProductStock(productId: string): Promise<number> {
  if (!shouldUseLiveData()) {
    const rows = await getCachedProducts('', 500);
    const hit = rows.find((r) => String(r.id) === String(productId));
    return Number(hit?.stock ?? 0);
  }

  const table = productsTable();
  return runCountingTransport(
    'getProductStock',
    () => restGetProductStock(productId),
    async () => {
      const res = await pgQuery<{ stock: number }>(
        `SELECT COALESCE(stock, 0)::float8 AS stock FROM ${table} WHERE id::text = $1`,
        [productId],
      );
      return Number(res.rows[0]?.stock ?? 0);
    },
  );
}

export async function getLineByBarcode(
  slipId: string,
  barcode: string,
): Promise<CountingLine | null> {
  if (!shouldUseLiveData()) {
    const line = await getCachedLineByBarcode(slipId, barcode);
    return line as CountingLine | null;
  }

  return runCountingTransport(
    'getLineByBarcode',
    () => restGetLineByBarcode(slipId, barcode.trim()),
    async () => {
      const res = await pgQuery<CountingLine>(
        `SELECT * FROM wms.counting_lines
         WHERE slip_id = $1::uuid AND barcode = $2
         LIMIT 1`,
        [slipId, barcode.trim()],
      );
      return res.rows[0] ?? null;
    },
  );
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

  const row = await runCountingTransport(
    'upsertCountingLine',
    () =>
      restUpsertCountingLine(
        slipId,
        {
          product_id: data.product_id,
          barcode: barcode || undefined,
          product_name: data.product_name,
          expected_qty: expected,
          counted_qty: counted,
          unit: data.unit,
        },
        { lineId: writeOpts?.lineId },
      ),
    async () => {
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
      return res.rows[0]!;
    },
  );

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

  await runCountingTransport(
    'deleteCountingLine',
    () => restDeleteCountingLine(lineId),
    async () => {
      await pgQuery(`DELETE FROM wms.counting_lines WHERE id = $1::uuid`, [lineId]);
    },
  );
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

  return runCountingTransport(
    'fetchVarianceSummary',
    () => restFetchVarianceSummary(slipId),
    async () => {
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
    },
  );
}

export async function completeCountingReconciliation(slipId: string): Promise<void> {
  await runCountingTransport(
    'completeCountingReconciliation',
    () => restUpdateSlipStatus(slipId, 'completed'),
    async () => {
      await pgQuery(
        `UPDATE wms.counting_slips
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1::uuid`,
        [slipId],
      );
    },
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
  return runCountingTransport(
    'applyStockCount',
    () => restApplyStockCount(slipId),
    async () => {
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

      const firm = fn();
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
          firm,
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
    },
  ).then(async (result) => {
    await updateCountingSlipStatusInCache(slipId, 'completed');
    await markCountingSlipSynced(slipId);
    return result;
  });
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
