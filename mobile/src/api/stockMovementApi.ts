import { pgQuery } from './pgClient';
import {
  postgrestDelete,
  postgrestGet,
  postgrestPatch,
  postgrestPost,
} from './postgrestClient';
import { runDataTransport, rethrowTransportInfra } from './dataTransport';
import {
  appendStoreIdFilter,
  customersTable,
  firmNr,
  newUuid,
  periodNr,
  productsTable,
  saleItemsTable,
  salesTable,
  stockMovementItemsTable,
  stockMovementsTable,
  storeId,
  suppliersTable,
} from './erpTables';

/** Web `STOCK_SLIP_TRCODES` */
export const STOCK_SLIP_TRCODES = {
  CONSUMPTION: 1,
  PRODUCTION_IN: 2,
  TRANSFER: 5,
  WASTAGE: 11,
  OPENING: 14,
  COUNTING: 25,
  SURPLUS: 26,
  SHORTAGE: 50,
  PRICE_CHANGE: 78,
} as const;

export type StockMovementRow = {
  id: string;
  document_no: string;
  trcode: number;
  movement_type: string;
  movement_date: string;
  warehouse_name: string | null;
  description: string | null;
  customer_name: string | null;
  status: string;
  line_count: number;
  source_kind: 'slip' | 'invoice';
};

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  in: 'Giriş',
  out: 'Çıkış',
  transfer: 'Transfer',
  adjustment: 'Düzeltme',
  price_change: 'Fiyat Değişimi',
};

const TRCODE_LABEL: Record<number, string> = {
  1: 'Sarf',
  2: 'Üretimden Giriş',
  5: 'Ambar Fişi',
  11: 'Fire',
  14: 'Devir',
  25: 'Sayım',
  26: 'Sayım Fazlası',
  50: 'Sayım Eksiği',
  78: 'Fiyat Değişimi',
};

export function stockMovementLabel(row: Pick<StockMovementRow, 'trcode' | 'movement_type'>): string {
  return TRCODE_LABEL[row.trcode] || MOVEMENT_TYPE_LABEL[row.movement_type] || row.movement_type || '—';
}

export async function fetchStockMovements(opts?: {
  trcode?: number;
  limit?: number;
}): Promise<StockMovementRow[]> {
  return runDataTransport({
    label: 'fetchStockMovements',
    viaRest: () => fetchStockMovementsViaRest(opts),
    viaBridge: () => fetchStockMovementsViaBridge(opts),
  });
}

async function fetchStockMovementsViaRest(opts?: {
  trcode?: number;
  limit?: number;
}): Promise<StockMovementRow[]> {
  const fn = firmNr();
  const pn = periodNr();
  const mov = stockMovementsTable(fn, pn);
  const limit = opts?.limit ?? 300;
  const trcode = opts?.trcode ?? null;
  const sid = storeId();

  const slipQuery: Record<string, string | number> = {
    select:
      'id,document_no,trcode,movement_type,movement_date,created_at,warehouse_id,description,status',
    order: 'movement_date.desc',
    limit,
  };
  if (trcode != null) slipQuery.trcode = `eq.${trcode}`;
  if (sid) slipQuery.warehouse_id = `eq.${sid}`;

  const slipRows = await postgrestGet<Record<string, unknown>[]>(`/${mov}`, slipQuery, {
    schema: 'public',
  });

  let storeNameById = new Map<string, string>();
  try {
    const stores = await postgrestGet<Array<{ id?: string; name?: string }>>(
      '/stores',
      { select: 'id,name', limit: 500 },
      { schema: 'public' },
    );
    storeNameById = new Map(
      (Array.isArray(stores) ? stores : [])
        .filter((s) => s.id)
        .map((s) => [String(s.id), String(s.name || '')]),
    );
  } catch {
    /* warehouse adı opsiyonel */
  }

  const slips: StockMovementRow[] = (Array.isArray(slipRows) ? slipRows : []).map((r) => {
    const wid = r.warehouse_id != null ? String(r.warehouse_id) : '';
    return {
      id: String(r.id ?? ''),
      document_no: String(r.document_no ?? ''),
      trcode: Number(r.trcode ?? 0),
      movement_type: String(r.movement_type ?? ''),
      movement_date: String(r.movement_date || r.created_at || '').slice(0, 10),
      warehouse_name: wid ? storeNameById.get(wid) || null : null,
      description: r.description != null ? String(r.description).trim() || null : null,
      customer_name: null,
      status: String(r.status ?? ''),
      line_count: 0,
      source_kind: 'slip' as const,
    };
  });

  if (trcode != null) return slips;

  const sales = salesTable(fn, pn);
  const invQuery: Record<string, string | number> = {
    select:
      'id,fiche_no,trcode,fiche_type,date,created_at,store_id,notes,customer_name,status,is_cancelled',
    fiche_type: 'in.(purchase_invoice,sales_invoice,return_invoice)',
    is_cancelled: 'eq.false',
    order: 'date.desc',
    limit: 200,
  };
  if (sid) invQuery.store_id = `eq.${sid}`;

  const invRows = await postgrestGet<Record<string, unknown>[]>(`/${sales}`, invQuery, {
    schema: 'public',
  });

  const invoices: StockMovementRow[] = (Array.isArray(invRows) ? invRows : []).map((r) => {
    const ft = String(r.fiche_type ?? '');
    const tc = Number(r.trcode ?? 0);
    let movement_type = 'out';
    if (ft === 'purchase_invoice') movement_type = 'in';
    else if (ft === 'sales_invoice') movement_type = 'out';
    else if (ft === 'return_invoice' && tc === 3) movement_type = 'in';
    else if (ft === 'return_invoice') movement_type = 'out';
    const storeKey = r.store_id != null ? String(r.store_id) : '';
    return {
      id: `inv-${String(r.id ?? '')}`,
      document_no: String(r.fiche_no ?? ''),
      trcode: tc,
      movement_type,
      movement_date: String(r.date || r.created_at || '').slice(0, 10),
      warehouse_name: storeKey ? storeNameById.get(storeKey) || null : null,
      description: r.notes != null ? String(r.notes).trim() || null : null,
      customer_name: r.customer_name != null ? String(r.customer_name) : null,
      status: String(r.status ?? 'approved'),
      line_count: 0,
      source_kind: 'invoice' as const,
    };
  });

  const combined = [...slips, ...invoices];
  combined.sort((a, b) => {
    const ta = new Date(a.movement_date || 0).getTime();
    const tb = new Date(b.movement_date || 0).getTime();
    return tb - ta;
  });
  return combined.slice(0, limit);
}

async function fetchStockMovementsViaBridge(opts?: {
  trcode?: number;
  limit?: number;
}): Promise<StockMovementRow[]> {
  const fn = firmNr();
  const pn = periodNr();
  const mov = stockMovementsTable(fn, pn);
  const items = stockMovementItemsTable(fn, pn);
  const limit = opts?.limit ?? 300;
  const trcode = opts?.trcode ?? null;

  let slips: StockMovementRow[] = [];
  try {
    const slipParams: unknown[] = [trcode, limit];
    const slipStoreSql = appendStoreIdFilter('m.warehouse_id', slipParams);
    const res = await pgQuery<{
      id: string;
      document_no: string;
      trcode: number;
      movement_type: string;
      movement_date: string;
      warehouse_name: string | null;
      description: string | null;
      status: string;
      line_count: number;
    }>(
      `SELECT m.id::text AS id,
              COALESCE(m.document_no, '') AS document_no,
              COALESCE(m.trcode, 0)::int AS trcode,
              COALESCE(m.movement_type, '') AS movement_type,
              COALESCE(m.movement_date::date, m.created_at::date)::text AS movement_date,
              s.name AS warehouse_name,
              NULLIF(TRIM(COALESCE(m.description, '')), '') AS description,
              COALESCE(m.status, '') AS status,
              (SELECT COUNT(*)::int FROM ${items} i WHERE i.movement_id = m.id) AS line_count
       FROM ${mov} m
       LEFT JOIN public.stores s ON m.warehouse_id = s.id
       WHERE ($1::int IS NULL OR COALESCE(m.trcode, 0) = $1)
         ${slipStoreSql}
       ORDER BY m.movement_date DESC NULLS LAST, m.created_at DESC NULLS LAST
       LIMIT $2`,
      slipParams,
    );
    slips = res.rows.map((r) => ({
      ...r,
      customer_name: null,
      source_kind: 'slip' as const,
    }));
  } catch (e) {
    rethrowTransportInfra(e, 'fetchStockMovements.slips');
    slips = [];
  }

  if (trcode != null) return slips;

  const sales = salesTable(fn, pn);
  const cust = customersTable(fn);
  const supp = suppliersTable(fn);
  let invoices: StockMovementRow[] = [];
  try {
    const invParams: unknown[] = [];
    const invStoreSql = appendStoreIdFilter('s.store_id', invParams);
    const res = await pgQuery<{
      id: string;
      document_no: string;
      trcode: number;
      movement_type: string;
      movement_date: string;
      warehouse_name: string | null;
      description: string | null;
      customer_name: string | null;
      status: string;
      line_count: number;
    }>(
      `SELECT s.id::text AS id,
              COALESCE(s.fiche_no, '') AS document_no,
              COALESCE(s.trcode, 0)::int AS trcode,
              CASE
                WHEN s.fiche_type = 'purchase_invoice' THEN 'in'
                WHEN s.fiche_type = 'sales_invoice' THEN 'out'
                WHEN s.fiche_type = 'return_invoice' AND COALESCE(s.trcode, 0) = 3 THEN 'in'
                WHEN s.fiche_type = 'return_invoice' THEN 'out'
                ELSE 'out'
              END AS movement_type,
              COALESCE(s.date::date, s.created_at::date)::text AS movement_date,
              st.name AS warehouse_name,
              NULLIF(TRIM(COALESCE(s.notes, '')), '') AS description,
              COALESCE(
                NULLIF(TRIM(s.customer_name), ''),
                c.name,
                sup.name,
                ''
              ) AS customer_name,
              COALESCE(s.status, 'approved') AS status,
              (SELECT COUNT(*)::int FROM ${saleItemsTable(fn, pn)} si WHERE si.invoice_id = s.id) AS line_count
       FROM ${sales} s
       LEFT JOIN public.stores st ON s.store_id = st.id
       LEFT JOIN ${cust} c ON c.id::text = s.customer_id::text
       LEFT JOIN ${supp} sup ON sup.id::text = s.customer_id::text
       WHERE s.fiche_type IN ('purchase_invoice', 'sales_invoice', 'return_invoice')
         AND COALESCE(s.is_cancelled, false) = false
         ${invStoreSql}
       ORDER BY s.date DESC NULLS LAST, s.created_at DESC NULLS LAST
       LIMIT 200`,
      invParams,
    );
    invoices = res.rows.map((r) => ({
      ...r,
      id: `inv-${r.id}`,
      source_kind: 'invoice' as const,
    }));
  } catch (e) {
    rethrowTransportInfra(e, 'fetchStockMovements.invoices');
    invoices = [];
  }

  const combined = [...slips, ...invoices];
  combined.sort((a, b) => {
    const ta = new Date(a.movement_date || 0).getTime();
    const tb = new Date(b.movement_date || 0).getTime();
    return tb - ta;
  });
  return combined.slice(0, limit);
}

export type StockMovementItemRow = {
  id: string;
  product_id: string;
  product_name: string | null;
  product_code: string | null;
  quantity: number;
  unit_price: number;
  cost_price: number;
  unit_name: string | null;
  notes: string | null;
};

export type StockMovementDetail = StockMovementRow & {
  warehouse_id: string | null;
  items: StockMovementItemRow[];
};

export type StockMovementCreateInput = {
  movementType: 'in' | 'out' | 'adjustment' | 'transfer' | 'price_change';
  trcode?: number;
  warehouseId?: string | null;
  movementDate?: string;
  description?: string;
  documentNo?: string;
  items?: Array<{
    productId: string;
    quantity: number;
    unitPrice?: number;
    costPrice?: number;
    unitName?: string;
    notes?: string;
  }>;
};

function trcodeForMovementType(movementType: string, explicit?: number): number {
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  if (movementType === 'in') return STOCK_SLIP_TRCODES.PRODUCTION_IN;
  if (movementType === 'transfer') return STOCK_SLIP_TRCODES.TRANSFER;
  if (movementType === 'adjustment') return STOCK_SLIP_TRCODES.COUNTING;
  if (movementType === 'price_change') return STOCK_SLIP_TRCODES.PRICE_CHANGE;
  return STOCK_SLIP_TRCODES.CONSUMPTION;
}

export async function fetchStockMovementById(id: string): Promise<StockMovementDetail | null> {
  const raw = String(id || '').trim();
  if (!raw || raw.startsWith('inv-')) return null;

  return runDataTransport({
    label: 'fetchStockMovementById',
    viaRest: () => fetchStockMovementByIdViaRest(raw),
    viaBridge: () => fetchStockMovementByIdViaBridge(raw),
  });
}

async function fetchStockMovementByIdViaRest(raw: string): Promise<StockMovementDetail | null> {
  const fn = firmNr();
  const pn = periodNr();
  const mov = stockMovementsTable(fn, pn);
  const items = stockMovementItemsTable(fn, pn);
  const products = productsTable(fn);

  const headers = await postgrestGet<Record<string, unknown>[]>(
    `/${mov}`,
    {
      select:
        'id,document_no,trcode,movement_type,movement_date,created_at,warehouse_id,description,status',
      id: `eq.${raw}`,
      limit: 1,
    },
    { schema: 'public' },
  );
  const h = Array.isArray(headers) ? headers[0] : null;
  if (!h) return null;

  let warehouse_name: string | null = null;
  const wid = h.warehouse_id != null ? String(h.warehouse_id) : '';
  if (wid) {
    try {
      const stores = await postgrestGet<Array<{ name?: string }>>(
        '/stores',
        { select: 'name', id: `eq.${wid}`, limit: 1 },
        { schema: 'public' },
      );
      warehouse_name = stores?.[0]?.name != null ? String(stores[0].name) : null;
    } catch {
      warehouse_name = null;
    }
  }

  const itemRows = await postgrestGet<Record<string, unknown>[]>(
    `/${items}`,
    {
      select: 'id,product_id,quantity,unit_price,cost_price,unit_name,notes',
      movement_id: `eq.${raw}`,
      order: 'id.asc',
      limit: 500,
    },
    { schema: 'public' },
  );

  const productIds = [
    ...new Set(
      (Array.isArray(itemRows) ? itemRows : [])
        .map((r) => String(r.product_id ?? ''))
        .filter(Boolean),
    ),
  ];
  const productById = new Map<string, { name?: string; code?: string }>();
  if (productIds.length) {
    try {
      const prows = await postgrestGet<Record<string, unknown>[]>(
        `/${products}`,
        { select: 'id,name,code', limit: 500 },
        { schema: 'public' },
      );
      for (const p of Array.isArray(prows) ? prows : []) {
        if (p.id) productById.set(String(p.id), { name: String(p.name ?? ''), code: String(p.code ?? '') });
      }
    } catch {
      /* optional */
    }
  }

  const mappedItems: StockMovementItemRow[] = (Array.isArray(itemRows) ? itemRows : []).map(
    (i) => {
      const pid = String(i.product_id ?? '');
      const p = productById.get(pid);
      return {
        id: String(i.id ?? ''),
        product_id: pid,
        product_name: p?.name ?? null,
        product_code: p?.code ?? null,
        quantity: Number(i.quantity ?? 0) || 0,
        unit_price: Number(i.unit_price ?? 0) || 0,
        cost_price: Number(i.cost_price ?? 0) || 0,
        unit_name: i.unit_name != null ? String(i.unit_name) : null,
        notes: i.notes != null ? String(i.notes).trim() || null : null,
      };
    },
  );

  return {
    id: String(h.id ?? ''),
    document_no: String(h.document_no ?? ''),
    trcode: Number(h.trcode ?? 0),
    movement_type: String(h.movement_type ?? ''),
    movement_date: String(h.movement_date || h.created_at || '').slice(0, 10),
    warehouse_id: wid || null,
    warehouse_name,
    description: h.description != null ? String(h.description).trim() || null : null,
    customer_name: null,
    status: String(h.status ?? ''),
    line_count: mappedItems.length,
    source_kind: 'slip',
    items: mappedItems,
  };
}

async function fetchStockMovementByIdViaBridge(raw: string): Promise<StockMovementDetail | null> {
  const fn = firmNr();
  const pn = periodNr();
  const mov = stockMovementsTable(fn, pn);
  const items = stockMovementItemsTable(fn, pn);
  const products = productsTable(fn);

  const header = await pgQuery<{
    id: string;
    document_no: string;
    trcode: number;
    movement_type: string;
    movement_date: string;
    warehouse_id: string | null;
    warehouse_name: string | null;
    description: string | null;
    status: string;
    line_count: number;
  }>(
    `SELECT m.id::text AS id,
            COALESCE(m.document_no, '') AS document_no,
            COALESCE(m.trcode, 0)::int AS trcode,
            COALESCE(m.movement_type, '') AS movement_type,
            COALESCE(m.movement_date::date, m.created_at::date)::text AS movement_date,
            m.warehouse_id::text AS warehouse_id,
            s.name AS warehouse_name,
            NULLIF(TRIM(COALESCE(m.description, '')), '') AS description,
            COALESCE(m.status, '') AS status,
            (SELECT COUNT(*)::int FROM ${items} i WHERE i.movement_id = m.id) AS line_count
     FROM ${mov} m
     LEFT JOIN public.stores s ON m.warehouse_id = s.id
     WHERE m.id::text = $1
     LIMIT 1`,
    [raw],
  );
  const h = header.rows[0];
  if (!h) return null;

  const itemRes = await pgQuery<StockMovementItemRow>(
    `SELECT i.id::text AS id,
            i.product_id::text AS product_id,
            p.name AS product_name,
            p.code AS product_code,
            COALESCE(i.quantity, 0)::float8 AS quantity,
            COALESCE(i.unit_price, 0)::float8 AS unit_price,
            COALESCE(i.cost_price, 0)::float8 AS cost_price,
            i.unit_name,
            NULLIF(TRIM(COALESCE(i.notes, '')), '') AS notes
     FROM ${items} i
     LEFT JOIN ${products} p ON p.id = i.product_id
     WHERE i.movement_id::text = $1
     ORDER BY i.id`,
    [raw],
  );

  return {
    ...h,
    customer_name: null,
    source_kind: 'slip',
    items: itemRes.rows,
  };
}

export async function createStockMovement(input: StockMovementCreateInput): Promise<string> {
  return runDataTransport({
    label: 'createStockMovement',
    viaRest: () => createStockMovementViaRest(input),
    viaBridge: () => createStockMovementViaBridge(input),
  });
}

async function createStockMovementViaRest(input: StockMovementCreateInput): Promise<string> {
  const fn = firmNr();
  const pn = periodNr();
  const mov = stockMovementsTable(fn, pn);
  const itemsTable = stockMovementItemsTable(fn, pn);
  const products = productsTable(fn);
  const movementType = input.movementType || 'out';
  const trcode = trcodeForMovementType(movementType, input.trcode);
  const warehouseId = input.warehouseId || storeId();
  const date = (input.movementDate || new Date().toISOString()).slice(0, 10);
  const description = (input.description || '').trim() || null;
  const lineItems = input.items || [];
  const baseDoc = (input.documentNo && String(input.documentNo).trim()) || `ST-${Date.now()}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    const documentNo =
      attempt === 0
        ? baseDoc.slice(0, 50)
        : `${baseDoc.slice(0, 36)}-${Date.now().toString(36)}${attempt}`.slice(0, 50);
    const id = newUuid();
    try {
      await postgrestPost(
        `/${mov}`,
        {
          id,
          firm_nr: fn,
          period_nr: pn,
          document_no: documentNo,
          movement_type: movementType,
          trcode,
          warehouse_id: warehouseId,
          movement_date: date,
          exchange_rate: 1,
          description,
          status: 'completed',
        },
        { schema: 'public', prefer: 'return=minimal' },
      );

      for (const item of lineItems) {
        if (!item.productId) continue;
        const qty = Math.abs(Number(item.quantity) || 0);
        await postgrestPost(
          `/${itemsTable}`,
          {
            movement_id: id,
            product_id: item.productId,
            quantity: qty,
            unit_price: Number(item.unitPrice) || 0,
            cost_price: Number(item.costPrice) || 0,
            exchange_rate: 1,
            unit_name: item.unitName || 'Adet',
            convert_factor: 1,
            notes: item.notes || null,
          },
          { schema: 'public', prefer: 'return=minimal' },
        );

        if (movementType !== 'price_change' && movementType !== 'transfer' && qty > 0) {
          let modifier = qty;
          if (movementType === 'out' || movementType === 'adjustment') modifier = -qty;
          const cur = await postgrestGet<Record<string, unknown>[]>(
            `/${products}`,
            { select: 'stock', id: `eq.${item.productId}`, limit: 1 },
            { schema: 'public' },
          );
          const stock = Number(cur?.[0]?.stock ?? 0) || 0;
          await postgrestPatch(
            `/${products}?id=eq.${encodeURIComponent(item.productId)}`,
            { stock: stock + modifier },
            { schema: 'public', prefer: 'return=minimal' },
          );
        }
      }
      return id;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isDupDoc = /document_no/i.test(msg) && /unique|duplicate/i.test(msg);
      if (isDupDoc && attempt < 5) continue;
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function createStockMovementViaBridge(input: StockMovementCreateInput): Promise<string> {
  const fn = firmNr();
  const pn = periodNr();
  const mov = stockMovementsTable(fn, pn);
  const items = stockMovementItemsTable(fn, pn);
  const products = productsTable(fn);
  const movementType = input.movementType || 'out';
  const trcode = trcodeForMovementType(movementType, input.trcode);
  const warehouseId = input.warehouseId || storeId();
  const date = (input.movementDate || new Date().toISOString()).slice(0, 10);
  const description = (input.description || '').trim() || null;
  const lineItems = input.items || [];
  const baseDoc = (input.documentNo && String(input.documentNo).trim()) || `ST-${Date.now()}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    const documentNo =
      attempt === 0
        ? baseDoc.slice(0, 50)
        : `${baseDoc.slice(0, 36)}-${Date.now().toString(36)}${attempt}`.slice(0, 50);
    const id = newUuid();
    try {
      await pgQuery(
        `INSERT INTO ${mov} (
           id, firm_nr, period_nr, document_no, movement_type, trcode, warehouse_id,
           movement_date, exchange_rate, description, status
         ) VALUES (
           $1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::date, 1, $9, 'completed'
         )`,
        [id, fn, pn, documentNo, movementType, trcode, warehouseId, date, description],
      );

      for (const item of lineItems) {
        if (!item.productId) continue;
        const qty = Math.abs(Number(item.quantity) || 0);
        await pgQuery(
          `INSERT INTO ${items} (
             movement_id, product_id, quantity, unit_price, cost_price, exchange_rate, unit_name, convert_factor, notes
           ) VALUES (
             $1::uuid, $2::uuid, $3, $4, $5, 1, $6, 1, $7
           )`,
          [
            id,
            item.productId,
            qty,
            Number(item.unitPrice) || 0,
            Number(item.costPrice) || 0,
            item.unitName || 'Adet',
            item.notes || null,
          ],
        );

        if (movementType !== 'price_change' && movementType !== 'transfer' && qty > 0) {
          let modifier = qty;
          if (movementType === 'out' || movementType === 'adjustment') modifier = -qty;
          await pgQuery(`UPDATE ${products} SET stock = COALESCE(stock, 0) + $1 WHERE id = $2::uuid`, [
            modifier,
            item.productId,
          ]);
        }
      }

      return id;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      const isDupDoc =
        /document_no/i.test(msg) &&
        (/unique|duplicate key/i.test(msg) || /_document_no_key/i.test(msg));
      if (isDupDoc && attempt < 5) continue;
      throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export type StockMovementUpdateInput = {
  documentNo?: string;
  description?: string;
  movementDate?: string;
  warehouseId?: string | null;
};

export type StockMovementItemInput = {
  productId: string;
  quantity: number;
  unitPrice?: number;
  costPrice?: number;
  unitName?: string;
  notes?: string;
};

function stockModifier(movementType: string, quantity: number): number {
  const qty = Math.abs(Number(quantity) || 0);
  if (!qty || movementType === 'price_change' || movementType === 'transfer') return 0;
  if (movementType === 'in') return qty;
  if (movementType === 'out' || movementType === 'adjustment') return -qty;
  return qty;
}

async function fetchMovementHeaderViaRest(id: string): Promise<{
  movement_type: string;
  warehouse_id: string | null;
} | null> {
  const mov = stockMovementsTable();
  const rows = await postgrestGet<Record<string, unknown>[]>(
    `/${mov}`,
    { id: `eq.${id}`, select: 'movement_type,warehouse_id', limit: 1 },
    { schema: 'public' },
  );
  const h = Array.isArray(rows) ? rows[0] : null;
  if (!h) return null;
  return {
    movement_type: String(h.movement_type ?? ''),
    warehouse_id: h.warehouse_id != null ? String(h.warehouse_id) : null,
  };
}

async function fetchMovementHeader(id: string): Promise<{
  movement_type: string;
  warehouse_id: string | null;
} | null> {
  return runDataTransport({
    label: 'fetchMovementHeader',
    viaRest: () => fetchMovementHeaderViaRest(id),
    viaBridge: async () => {
      const mov = stockMovementsTable();
      const res = await pgQuery<{ movement_type: string; warehouse_id: string | null }>(
        `SELECT COALESCE(movement_type, '') AS movement_type, warehouse_id::text AS warehouse_id
         FROM ${mov} WHERE id::text = $1 LIMIT 1`,
        [id],
      );
      return res.rows[0] ?? null;
    },
  });
}

export async function updateStockMovement(id: string, input: StockMovementUpdateInput): Promise<void> {
  const raw = String(id || '').trim();
  if (!raw) throw new Error('Fiş id gerekli');
  if (raw.startsWith('inv-')) throw new Error('Fatura kaynaklı kayıt düzenlenemez');

  return runDataTransport({
    label: 'updateStockMovement',
    viaRest: () => updateStockMovementViaRest(raw, input),
    viaBridge: () => updateStockMovementViaBridge(raw, input),
  });
}

async function updateStockMovementViaRest(
  raw: string,
  input: StockMovementUpdateInput,
): Promise<void> {
  const mov = stockMovementsTable();
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.documentNo !== undefined) body.document_no = String(input.documentNo).trim().slice(0, 50);
  if (input.description !== undefined) {
    body.description = String(input.description).trim() || null;
  }
  if (input.movementDate !== undefined) {
    body.movement_date = String(input.movementDate).slice(0, 10);
  }
  if (input.warehouseId !== undefined) body.warehouse_id = input.warehouseId || null;
  if (Object.keys(body).length <= 1) return;
  await postgrestPatch(`/${mov}?id=eq.${encodeURIComponent(raw)}`, body, {
    schema: 'public',
    prefer: 'return=minimal',
  });
}

async function updateStockMovementViaBridge(
  raw: string,
  input: StockMovementUpdateInput,
): Promise<void> {
  const mov = stockMovementsTable();
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (input.documentNo !== undefined) {
    sets.push(`document_no = $${idx++}`);
    params.push(String(input.documentNo).trim().slice(0, 50));
  }
  if (input.description !== undefined) {
    sets.push(`description = $${idx++}`);
    params.push(String(input.description).trim() || null);
  }
  if (input.movementDate !== undefined) {
    sets.push(`movement_date = $${idx++}::date`);
    params.push(String(input.movementDate).slice(0, 10));
  }
  if (input.warehouseId !== undefined) {
    sets.push(`warehouse_id = $${idx++}::uuid`);
    params.push(input.warehouseId || null);
  }
  if (!sets.length) return;

  sets.push('updated_at = NOW()');
  params.push(raw);
  await pgQuery(`UPDATE ${mov} SET ${sets.join(', ')} WHERE id::text = $${idx}`, params);
}

export async function addStockMovementItem(
  movementId: string,
  item: StockMovementItemInput,
): Promise<string> {
  const raw = String(movementId || '').trim();
  if (!raw) throw new Error('Fiş id gerekli');
  if (!item.productId) throw new Error('Ürün seçin');

  return runDataTransport({
    label: 'addStockMovementItem',
    viaRest: () => addStockMovementItemViaRest(raw, item),
    viaBridge: () => addStockMovementItemViaBridge(raw, item),
  });
}

async function addStockMovementItemViaRest(
  raw: string,
  item: StockMovementItemInput,
): Promise<string> {
  const header = await fetchMovementHeaderViaRest(raw);
  if (!header) throw new Error('Fiş bulunamadı');

  const items = stockMovementItemsTable();
  const products = productsTable();
  const qty = Math.abs(Number(item.quantity) || 0);
  if (qty <= 0) throw new Error('Miktar 0 olamaz');
  const itemId = newUuid();

  await postgrestPost(
    `/${items}`,
    {
      id: itemId,
      movement_id: raw,
      product_id: item.productId,
      quantity: qty,
      unit_price: Number(item.unitPrice) || 0,
      cost_price: Number(item.costPrice) || 0,
      exchange_rate: 1,
      unit_name: item.unitName || 'Adet',
      convert_factor: 1,
      notes: item.notes || null,
    },
    { schema: 'public', prefer: 'return=minimal' },
  );

  const modifier = stockModifier(header.movement_type, qty);
  if (modifier !== 0) {
    const cur = await postgrestGet<Record<string, unknown>[]>(
      `/${products}`,
      { id: `eq.${item.productId}`, select: 'stock', limit: 1 },
      { schema: 'public' },
    );
    const stock = Number(cur?.[0]?.stock ?? 0) || 0;
    await postgrestPatch(
      `/${products}?id=eq.${encodeURIComponent(item.productId)}`,
      { stock: stock + modifier },
      { schema: 'public', prefer: 'return=minimal' },
    );
  }
  return itemId;
}

async function addStockMovementItemViaBridge(
  raw: string,
  item: StockMovementItemInput,
): Promise<string> {
  const header = await pgQuery<{ movement_type: string }>(
    `SELECT COALESCE(movement_type, '') AS movement_type
     FROM ${stockMovementsTable()} WHERE id::text = $1 LIMIT 1`,
    [raw],
  );
  if (!header.rows[0]) throw new Error('Fiş bulunamadı');

  const items = stockMovementItemsTable();
  const products = productsTable();
  const qty = Math.abs(Number(item.quantity) || 0);
  if (qty <= 0) throw new Error('Miktar 0 olamaz');

  const res = await pgQuery<{ id: string }>(
    `INSERT INTO ${items} (
       movement_id, product_id, quantity, unit_price, cost_price, exchange_rate, unit_name, convert_factor, notes
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, 1, $6, 1, $7
     ) RETURNING id::text AS id`,
    [
      raw,
      item.productId,
      qty,
      Number(item.unitPrice) || 0,
      Number(item.costPrice) || 0,
      item.unitName || 'Adet',
      item.notes || null,
    ],
  );
  const itemId = res.rows[0]?.id;
  if (!itemId) throw new Error('Kalem eklenemedi');

  const modifier = stockModifier(header.rows[0].movement_type, qty);
  if (modifier !== 0) {
    await pgQuery(`UPDATE ${products} SET stock = COALESCE(stock, 0) + $1 WHERE id = $2::uuid`, [
      modifier,
      item.productId,
    ]);
  }
  return itemId;
}

export async function updateStockMovementItem(
  movementId: string,
  itemId: string,
  patch: Partial<StockMovementItemInput>,
): Promise<void> {
  const movId = String(movementId || '').trim();
  const lineId = String(itemId || '').trim();
  if (!movId || !lineId) throw new Error('Fiş veya kalem id gerekli');

  return runDataTransport({
    label: 'updateStockMovementItem',
    viaRest: () => updateStockMovementItemViaRest(movId, lineId, patch),
    viaBridge: () => updateStockMovementItemViaBridge(movId, lineId, patch),
  });
}

async function updateStockMovementItemViaRest(
  movId: string,
  lineId: string,
  patch: Partial<StockMovementItemInput>,
): Promise<void> {
  const header = await fetchMovementHeaderViaRest(movId);
  if (!header) throw new Error('Fiş bulunamadı');

  const items = stockMovementItemsTable();
  const products = productsTable();

  const curRows = await postgrestGet<Record<string, unknown>[]>(
    `/${items}`,
    {
      id: `eq.${lineId}`,
      movement_id: `eq.${movId}`,
      select: 'product_id,quantity',
      limit: 1,
    },
    { schema: 'public' },
  );
  const row = Array.isArray(curRows) ? curRows[0] : null;
  if (!row) throw new Error('Kalem bulunamadı');

  const oldQty = Number(row.quantity ?? 0) || 0;
  let newQty = oldQty;
  const body: Record<string, unknown> = {};

  if (patch.productId !== undefined) body.product_id = patch.productId;
  if (patch.quantity !== undefined) {
    newQty = Math.abs(Number(patch.quantity) || 0);
    if (newQty <= 0) throw new Error('Miktar 0 olamaz');
    body.quantity = newQty;
  }
  if (patch.unitPrice !== undefined) body.unit_price = Number(patch.unitPrice) || 0;
  if (patch.costPrice !== undefined) body.cost_price = Number(patch.costPrice) || 0;
  if (patch.unitName !== undefined) body.unit_name = patch.unitName || 'Adet';
  if (patch.notes !== undefined) body.notes = patch.notes || null;
  if (!Object.keys(body).length) return;

  await postgrestPatch(
    `/${items}?id=eq.${encodeURIComponent(lineId)}&movement_id=eq.${encodeURIComponent(movId)}`,
    body,
    { schema: 'public', prefer: 'return=minimal' },
  );

  if (patch.quantity !== undefined && newQty !== oldQty) {
    const oldMod = stockModifier(header.movement_type, oldQty);
    const newMod = stockModifier(header.movement_type, newQty);
    const delta = newMod - oldMod;
    const productId = patch.productId || String(row.product_id ?? '');
    if (delta !== 0 && productId) {
      const cur = await postgrestGet<Record<string, unknown>[]>(
        `/${products}`,
        { id: `eq.${productId}`, select: 'stock', limit: 1 },
        { schema: 'public' },
      );
      const stock = Number(cur?.[0]?.stock ?? 0) || 0;
      await postgrestPatch(
        `/${products}?id=eq.${encodeURIComponent(productId)}`,
        { stock: stock + delta },
        { schema: 'public', prefer: 'return=minimal' },
      );
    }
  }
}

async function updateStockMovementItemViaBridge(
  movId: string,
  lineId: string,
  patch: Partial<StockMovementItemInput>,
): Promise<void> {
  const header = await pgQuery<{ movement_type: string }>(
    `SELECT COALESCE(movement_type, '') AS movement_type
     FROM ${stockMovementsTable()} WHERE id::text = $1 LIMIT 1`,
    [movId],
  );
  if (!header.rows[0]) throw new Error('Fiş bulunamadı');

  const items = stockMovementItemsTable();
  const products = productsTable();

  const current = await pgQuery<{ product_id: string; quantity: number }>(
    `SELECT product_id::text AS product_id, COALESCE(quantity, 0)::float8 AS quantity
     FROM ${items} WHERE id::text = $1 AND movement_id::text = $2 LIMIT 1`,
    [lineId, movId],
  );
  const row = current.rows[0];
  if (!row) throw new Error('Kalem bulunamadı');

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  let newQty = row.quantity;

  if (patch.productId !== undefined) {
    sets.push(`product_id = $${idx++}::uuid`);
    params.push(patch.productId);
  }
  if (patch.quantity !== undefined) {
    newQty = Math.abs(Number(patch.quantity) || 0);
    if (newQty <= 0) throw new Error('Miktar 0 olamaz');
    sets.push(`quantity = $${idx++}`);
    params.push(newQty);
  }
  if (patch.unitPrice !== undefined) {
    sets.push(`unit_price = $${idx++}`);
    params.push(Number(patch.unitPrice) || 0);
  }
  if (patch.costPrice !== undefined) {
    sets.push(`cost_price = $${idx++}`);
    params.push(Number(patch.costPrice) || 0);
  }
  if (patch.unitName !== undefined) {
    sets.push(`unit_name = $${idx++}`);
    params.push(patch.unitName || 'Adet');
  }
  if (patch.notes !== undefined) {
    sets.push(`notes = $${idx++}`);
    params.push(patch.notes || null);
  }
  if (!sets.length) return;

  params.push(lineId, movId);
  await pgQuery(
    `UPDATE ${items} SET ${sets.join(', ')} WHERE id::text = $${idx++} AND movement_id::text = $${idx}`,
    params,
  );

  if (patch.quantity !== undefined && patch.quantity !== row.quantity) {
    const oldMod = stockModifier(header.rows[0].movement_type, row.quantity);
    const newMod = stockModifier(header.rows[0].movement_type, newQty);
    const delta = newMod - oldMod;
    const productId = patch.productId || row.product_id;
    if (delta !== 0 && productId) {
      await pgQuery(`UPDATE ${products} SET stock = COALESCE(stock, 0) + $1 WHERE id = $2::uuid`, [
        delta,
        productId,
      ]);
    }
  }
}

export async function deleteStockMovementItem(movementId: string, itemId: string): Promise<void> {
  const movId = String(movementId || '').trim();
  const lineId = String(itemId || '').trim();
  if (!movId || !lineId) throw new Error('Fiş veya kalem id gerekli');

  return runDataTransport({
    label: 'deleteStockMovementItem',
    viaRest: () => deleteStockMovementItemViaRest(movId, lineId),
    viaBridge: () => deleteStockMovementItemViaBridge(movId, lineId),
  });
}

async function deleteStockMovementItemViaRest(movId: string, lineId: string): Promise<void> {
  const header = await fetchMovementHeaderViaRest(movId);
  if (!header) throw new Error('Fiş bulunamadı');

  const items = stockMovementItemsTable();
  const products = productsTable();

  const curRows = await postgrestGet<Record<string, unknown>[]>(
    `/${items}`,
    {
      id: `eq.${lineId}`,
      movement_id: `eq.${movId}`,
      select: 'product_id,quantity',
      limit: 1,
    },
    { schema: 'public' },
  );
  const row = Array.isArray(curRows) ? curRows[0] : null;
  if (!row) throw new Error('Kalem bulunamadı');

  await postgrestDelete(
    `/${items}?id=eq.${encodeURIComponent(lineId)}&movement_id=eq.${encodeURIComponent(movId)}`,
    { schema: 'public' },
  );

  const qty = Number(row.quantity ?? 0) || 0;
  const modifier = stockModifier(header.movement_type, qty);
  const productId = String(row.product_id ?? '');
  if (modifier !== 0 && productId) {
    const cur = await postgrestGet<Record<string, unknown>[]>(
      `/${products}`,
      { id: `eq.${productId}`, select: 'stock', limit: 1 },
      { schema: 'public' },
    );
    const stock = Number(cur?.[0]?.stock ?? 0) || 0;
    await postgrestPatch(
      `/${products}?id=eq.${encodeURIComponent(productId)}`,
      { stock: stock - modifier },
      { schema: 'public', prefer: 'return=minimal' },
    );
  }
}

async function deleteStockMovementItemViaBridge(movId: string, lineId: string): Promise<void> {
  const header = await pgQuery<{ movement_type: string }>(
    `SELECT COALESCE(movement_type, '') AS movement_type
     FROM ${stockMovementsTable()} WHERE id::text = $1 LIMIT 1`,
    [movId],
  );
  if (!header.rows[0]) throw new Error('Fiş bulunamadı');

  const items = stockMovementItemsTable();
  const products = productsTable();

  const current = await pgQuery<{ product_id: string; quantity: number }>(
    `SELECT product_id::text AS product_id, COALESCE(quantity, 0)::float8 AS quantity
     FROM ${items} WHERE id::text = $1 AND movement_id::text = $2 LIMIT 1`,
    [lineId, movId],
  );
  const row = current.rows[0];
  if (!row) throw new Error('Kalem bulunamadı');

  await pgQuery(`DELETE FROM ${items} WHERE id::text = $1 AND movement_id::text = $2`, [
    lineId,
    movId,
  ]);

  const modifier = stockModifier(header.rows[0].movement_type, row.quantity);
  if (modifier !== 0) {
    await pgQuery(`UPDATE ${products} SET stock = COALESCE(stock, 0) - $1 WHERE id = $2::uuid`, [
      modifier,
      row.product_id,
    ]);
  }
}

export async function deleteStockMovement(id: string): Promise<void> {
  const raw = String(id || '').trim();
  if (!raw) throw new Error('Fiş id gerekli');
  if (raw.startsWith('inv-')) throw new Error('Fatura kaynaklı kayıt buradan silinemez');

  return runDataTransport({
    label: 'deleteStockMovement',
    viaRest: () => deleteStockMovementViaRest(raw),
    viaBridge: () => deleteStockMovementViaBridge(raw),
  });
}

async function deleteStockMovementViaRest(raw: string): Promise<void> {
  const mov = stockMovementsTable();
  const items = stockMovementItemsTable();
  await postgrestDelete(`/${items}?movement_id=eq.${encodeURIComponent(raw)}`, {
    schema: 'public',
  });
  await postgrestDelete(`/${mov}?id=eq.${encodeURIComponent(raw)}`, { schema: 'public' });
}

async function deleteStockMovementViaBridge(raw: string): Promise<void> {
  const mov = stockMovementsTable();
  const items = stockMovementItemsTable();
  await pgQuery(`DELETE FROM ${items} WHERE movement_id::text = $1`, [raw]);
  await pgQuery(`DELETE FROM ${mov} WHERE id::text = $1`, [raw]);
}
