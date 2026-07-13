/**
 * Logistics / Teslimat Yönetim servisi
 * `connectionProvider === 'db'` → PostgresConnection; `rest_api` → PostgREST (logistics şeması).
 */

import { PostgresConnection, ERP_SETTINGS, DB_SETTINGS } from './postgres';

const conn = () => PostgresConnection.getInstance();

function isRestApi(): boolean {
  return DB_SETTINGS.connectionProvider === 'rest_api';
}

function firmNr(): string {
  return String(ERP_SETTINGS.firmNr || '001').trim();
}

function periodNr(): string {
  return String(ERP_SETTINGS.periodNr || '01').trim();
}

function padFirm(): string {
  return firmNr().padStart(3, '0').slice(0, 10);
}

function padPeriod(): string {
  return periodNr().padStart(2, '0').slice(0, 10);
}

function salesTable(): string {
  return `rex_${padFirm()}_${padPeriod()}_sales`;
}

function saleItemsTable(): string {
  return `rex_${padFirm()}_${padPeriod()}_sale_items`;
}

export type DeliveryStatus =
  | 'draft'
  | 'planned'
  | 'picking'
  | 'packing'
  | 'loading'
  | 'in_transit'
  | 'delivered'
  | 'partial'
  | 'absent'
  | 'cancelled'
  | 'returned';

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  draft: 'Taslak',
  planned: 'Planlandı',
  picking: 'Toplama',
  packing: 'Paketleme',
  loading: 'Yükleme',
  in_transit: 'Yolda',
  delivered: 'Teslim Edildi',
  partial: 'Kısmi Teslim',
  absent: 'Adreste Yok',
  cancelled: 'İptal',
  returned: 'İade',
};

const STATUS_FLOW: Record<DeliveryStatus, DeliveryStatus[]> = {
  draft: ['planned', 'picking', 'cancelled'],
  planned: ['picking', 'cancelled'],
  picking: ['packing', 'cancelled'],
  packing: ['loading', 'cancelled'],
  loading: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'partial', 'absent', 'returned'],
  delivered: ['returned'],
  partial: ['delivered', 'returned', 'in_transit'],
  absent: ['in_transit', 'cancelled', 'returned'],
  cancelled: [],
  returned: [],
};

export interface LogisticsDelivery {
  id: string;
  firm_nr: string;
  period_nr: string;
  delivery_no: string;
  delivery_date: string;
  delivery_time?: string | null;
  branch_id?: string | null;
  warehouse_id?: string | null;
  plan_id?: string | null;
  sales_id: string;
  sales_fiche_no?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  address_text?: string | null;
  phone?: string | null;
  vehicle_id?: string | null;
  courier_id?: string | null;
  driver_name?: string | null;
  dispatch_slip_id?: string | null;
  status: DeliveryStatus | string;
  status_changed_at?: string;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  line_count?: number;
  courier_name?: string | null;
  vehicle_plate?: string | null;
}

export interface LogisticsDeliveryLine {
  id: string;
  delivery_id: string;
  sale_item_id?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  unit?: string | null;
  qty_ordered: number;
  qty_planned: number;
  qty_picked: number;
  qty_packed: number;
  qty_shipped: number;
  qty_delivered: number;
  qty_returned: number;
  line_status: string;
}

export interface LogisticsDeliveryDetail extends LogisticsDelivery {
  lines: LogisticsDeliveryLine[];
  events: Array<{
    id: string;
    from_status?: string | null;
    to_status: string;
    actor_id?: string | null;
    note?: string | null;
    created_at: string;
  }>;
}

export interface LogisticsCourier {
  id: string;
  firm_nr: string;
  full_name: string;
  phone?: string | null;
  default_vehicle_id?: string | null;
  is_active: boolean;
}

export interface LogisticsVehicle {
  id: string;
  firm_nr: string;
  plate: string;
  brand?: string | null;
  model?: string | null;
  is_active: boolean;
}

export interface DeliveryListOptions {
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

function normalizeStatus(s: string | undefined | null): DeliveryStatus {
  const v = String(s || 'draft').trim().toLowerCase() as DeliveryStatus;
  return (v in DELIVERY_STATUS_LABELS ? v : 'draft') as DeliveryStatus;
}

export function canTransition(from: string, to: string): boolean {
  const f = normalizeStatus(from);
  const t = normalizeStatus(to);
  return (STATUS_FLOW[f] || []).includes(t);
}

export function nextStatuses(from: string): DeliveryStatus[] {
  return STATUS_FLOW[normalizeStatus(from)] || [];
}

async function nextDeliveryNo(): Promise<string> {
  const f = firmNr();
  const p = periodNr();
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const prefix = `TSL-${ymd}-`;

  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<{ delivery_no: string }[]>(
      '/deliveries',
      {
        select: 'delivery_no',
        firm_nr: `eq.${f}`,
        period_nr: `eq.${p}`,
        delivery_no: `like.${prefix}*`,
        order: 'delivery_no.desc',
        limit: 1,
      },
      { schema: 'logistics' }
    );
    const last = Array.isArray(rows) && rows[0]?.delivery_no ? String(rows[0].delivery_no) : '';
    const m = last.match(/-(\d+)$/);
    const seq = m ? parseInt(m[1], 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  const c = conn();
  const r = await c.query(
    `SELECT delivery_no FROM logistics.deliveries
     WHERE firm_nr = $1 AND period_nr = $2 AND delivery_no LIKE $3
     ORDER BY delivery_no DESC LIMIT 1`,
    [f, p, `${prefix}%`]
  );
  const last = r?.rows?.[0]?.delivery_no ? String(r.rows[0].delivery_no) : '';
  const m = last.match(/-(\d+)$/);
  const seq = m ? parseInt(m[1], 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export async function listDeliveries(opts: DeliveryListOptions = {}): Promise<LogisticsDelivery[]> {
  const f = firmNr();
  const p = periodNr();
  const limit = opts.limit ?? 200;

  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const q: Record<string, string | number> = {
      select: '*,delivery_lines(count)',
      firm_nr: `eq.${f}`,
      period_nr: `eq.${p}`,
      order: 'delivery_date.desc,created_at.desc',
      limit,
    };
    if (opts.status && opts.status !== 'all') q.status = `eq.${opts.status}`;
    if (opts.dateFrom) q.delivery_date = `gte.${opts.dateFrom}`;
    if (opts.dateTo) {
      q.and = `(delivery_date.gte.${opts.dateFrom || '1900-01-01'},delivery_date.lte.${opts.dateTo})`;
      delete q.delivery_date;
    }
    if (opts.search) {
      const s = String(opts.search).replace(/[,()]/g, ' ').trim();
      q.or = `(delivery_no.ilike.*${s}*,sales_fiche_no.ilike.*${s}*,customer_name.ilike.*${s}*,address_text.ilike.*${s}*)`;
    }
    try {
      const rows = await postgrest.get<any[]>('/deliveries', q, { schema: 'logistics' });
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        ...r,
        line_count: Array.isArray(r.delivery_lines)
          ? Number(r.delivery_lines[0]?.count ?? r.delivery_lines.length ?? 0)
          : Number(r.line_count || 0),
      })) as LogisticsDelivery[];
    } catch {
      const rows = await postgrest.get<any[]>(
        '/deliveries',
        {
          select: '*',
          firm_nr: `eq.${f}`,
          period_nr: `eq.${p}`,
          order: 'delivery_date.desc',
          limit,
          ...(opts.status && opts.status !== 'all' ? { status: `eq.${opts.status}` } : {}),
        },
        { schema: 'logistics' }
      );
      return (Array.isArray(rows) ? rows : []) as LogisticsDelivery[];
    }
  }

  const c = conn();
  const params: unknown[] = [f, p];
  let where = `d.firm_nr = $1 AND d.period_nr = $2`;
  if (opts.status && opts.status !== 'all') {
    params.push(opts.status);
    where += ` AND d.status = $${params.length}`;
  }
  if (opts.dateFrom) {
    params.push(opts.dateFrom);
    where += ` AND d.delivery_date >= $${params.length}::date`;
  }
  if (opts.dateTo) {
    params.push(opts.dateTo);
    where += ` AND d.delivery_date <= $${params.length}::date`;
  }
  if (opts.search) {
    params.push(`%${String(opts.search).trim()}%`);
    where += ` AND (
      d.delivery_no ILIKE $${params.length}
      OR COALESCE(d.sales_fiche_no,'') ILIKE $${params.length}
      OR COALESCE(d.customer_name,'') ILIKE $${params.length}
      OR COALESCE(d.address_text,'') ILIKE $${params.length}
    )`;
  }
  params.push(limit);
  const sql = `
    SELECT d.*,
      (SELECT COUNT(*)::int FROM logistics.delivery_lines dl WHERE dl.delivery_id = d.id) AS line_count,
      c.full_name AS courier_name,
      v.plate AS vehicle_plate
    FROM logistics.deliveries d
    LEFT JOIN logistics.couriers c ON c.id = d.courier_id
    LEFT JOIN logistics.vehicles v ON v.id = d.vehicle_id
    WHERE ${where}
    ORDER BY d.delivery_date DESC, d.created_at DESC
    LIMIT $${params.length}
  `;
  const r = await c.query(sql, params);
  return (r?.rows || []) as LogisticsDelivery[];
}

export async function getDelivery(id: string): Promise<LogisticsDeliveryDetail | null> {
  if (!id) return null;

  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const rows = await postgrest.get<any[]>(
      '/deliveries',
      { select: '*', id: `eq.${id}`, limit: 1 },
      { schema: 'logistics' }
    );
    const header = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!header) return null;
    const lines = await postgrest.get<any[]>(
      '/delivery_lines',
      { select: '*', delivery_id: `eq.${id}`, order: 'created_at.asc' },
      { schema: 'logistics' }
    );
    const events = await postgrest.get<any[]>(
      '/delivery_status_events',
      { select: '*', delivery_id: `eq.${id}`, order: 'created_at.asc' },
      { schema: 'logistics' }
    );
    return {
      ...header,
      lines: (Array.isArray(lines) ? lines : []).map(normalizeLine),
      events: Array.isArray(events) ? events : [],
    } as LogisticsDeliveryDetail;
  }

  const c = conn();
  const h = await c.query(`SELECT * FROM logistics.deliveries WHERE id = $1`, [id]);
  const header = h?.rows?.[0];
  if (!header) return null;
  const lines = await c.query(
    `SELECT * FROM logistics.delivery_lines WHERE delivery_id = $1 ORDER BY created_at`,
    [id]
  );
  const events = await c.query(
    `SELECT * FROM logistics.delivery_status_events WHERE delivery_id = $1 ORDER BY created_at`,
    [id]
  );
  return {
    ...header,
    lines: (lines?.rows || []).map(normalizeLine),
    events: events?.rows || [],
  } as LogisticsDeliveryDetail;
}

function normalizeLine(l: any): LogisticsDeliveryLine {
  return {
    id: String(l.id),
    delivery_id: String(l.delivery_id),
    sale_item_id: l.sale_item_id ?? null,
    product_id: l.product_id ?? null,
    product_code: l.product_code ?? null,
    product_name: l.product_name ?? null,
    unit: l.unit ?? null,
    qty_ordered: Number(l.qty_ordered || 0),
    qty_planned: Number(l.qty_planned || 0),
    qty_picked: Number(l.qty_picked || 0),
    qty_packed: Number(l.qty_packed || 0),
    qty_shipped: Number(l.qty_shipped || 0),
    qty_delivered: Number(l.qty_delivered || 0),
    qty_returned: Number(l.qty_returned || 0),
    line_status: String(l.line_status || 'open'),
  };
}

export async function listCouriers(activeOnly = true): Promise<LogisticsCourier[]> {
  const f = firmNr();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const q: Record<string, string | number> = {
      select: '*',
      firm_nr: `eq.${f}`,
      order: 'full_name.asc',
      limit: 500,
    };
    if (activeOnly) q.is_active = 'eq.true';
    const rows = await postgrest.get<any[]>('/couriers', q, { schema: 'logistics' });
    return (Array.isArray(rows) ? rows : []) as LogisticsCourier[];
  }
  const c = conn();
  const r = await c.query(
    `SELECT * FROM logistics.couriers WHERE firm_nr = $1 ${activeOnly ? 'AND is_active' : ''} ORDER BY full_name`,
    [f]
  );
  return (r?.rows || []) as LogisticsCourier[];
}

export async function listVehicles(activeOnly = true): Promise<LogisticsVehicle[]> {
  const f = firmNr();
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const q: Record<string, string | number> = {
      select: '*',
      firm_nr: `eq.${f}`,
      order: 'plate.asc',
      limit: 500,
    };
    if (activeOnly) q.is_active = 'eq.true';
    const rows = await postgrest.get<any[]>('/vehicles', q, { schema: 'logistics' });
    return (Array.isArray(rows) ? rows : []) as LogisticsVehicle[];
  }
  const c = conn();
  const r = await c.query(
    `SELECT * FROM logistics.vehicles WHERE firm_nr = $1 ${activeOnly ? 'AND is_active' : ''} ORDER BY plate`,
    [f]
  );
  return (r?.rows || []) as LogisticsVehicle[];
}

export async function transitionStatus(
  deliveryId: string,
  toStatus: DeliveryStatus | string,
  opts?: { note?: string; actorId?: string }
): Promise<LogisticsDeliveryDetail | null> {
  const detail = await getDelivery(deliveryId);
  if (!detail) throw new Error('Teslimat bulunamadı');
  const from = normalizeStatus(detail.status);
  const to = normalizeStatus(toStatus);
  if (!canTransition(from, to)) {
    throw new Error(`Durum geçişi geçersiz: ${DELIVERY_STATUS_LABELS[from]} → ${DELIVERY_STATUS_LABELS[to]}`);
  }

  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.patch(
      `/deliveries?id=eq.${encodeURIComponent(deliveryId)}`,
      {
        status: to,
        status_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { schema: 'logistics' }
    );
    await postgrest.post(
      '/delivery_status_events',
      {
        delivery_id: deliveryId,
        from_status: from,
        to_status: to,
        actor_id: opts?.actorId || null,
        note: opts?.note || null,
      },
      { schema: 'logistics', prefer: 'return=minimal' }
    );
    return getDelivery(deliveryId);
  }

  const c = conn();
  await c.query(
    `UPDATE logistics.deliveries
     SET status = $2, status_changed_at = now(), updated_at = now()
     WHERE id = $1`,
    [deliveryId, to]
  );
  await c.query(
    `INSERT INTO logistics.delivery_status_events (delivery_id, from_status, to_status, actor_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [deliveryId, from, to, opts?.actorId || null, opts?.note || null]
  );
  return getDelivery(deliveryId);
}

export async function assignCourierVehicle(
  deliveryId: string,
  data: { courier_id?: string | null; vehicle_id?: string | null; driver_name?: string | null }
): Promise<void> {
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    await postgrest.patch(
      `/deliveries?id=eq.${encodeURIComponent(deliveryId)}`,
      {
        courier_id: data.courier_id ?? null,
        vehicle_id: data.vehicle_id ?? null,
        driver_name: data.driver_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { schema: 'logistics' }
    );
    return;
  }
  const c = conn();
  await c.query(
    `UPDATE logistics.deliveries
     SET courier_id = $2, vehicle_id = $3, driver_name = $4, updated_at = now()
     WHERE id = $1`,
    [deliveryId, data.courier_id ?? null, data.vehicle_id ?? null, data.driver_name ?? null]
  );
}

/**
 * Satış siparişinden (rex_*_sales / trcode 20-21) teslimat oluştur.
 * Önce RPC dener; yoksa uygulama tarafında satırları kopyalar.
 */
export async function createDeliveryFromSales(
  salesId: string,
  opts?: { createdBy?: string; addressText?: string; phone?: string }
): Promise<{ ok: boolean; delivery_id?: string; delivery_no?: string; error?: string }> {
  if (!salesId) return { ok: false, error: 'sales_id_required' };
  const f = firmNr();
  const p = periodNr();

  // RPC (PostgREST veya PG)
  try {
    if (isRestApi()) {
      const { postgrest } = await import('./api/postgrestClient');
      const rpc = await postgrest.post<any>(
        '/rpc/create_delivery_from_sales',
        {
          p_firm_nr: f,
          p_period_nr: p,
          p_sales_id: salesId,
          p_created_by: opts?.createdBy || null,
        },
        { schema: 'logic' }
      );
      const body = Array.isArray(rpc) ? rpc[0] : rpc;
      if (body?.ok) {
        if (opts?.addressText || opts?.phone) {
          await postgrest.patch(
            `/deliveries?id=eq.${encodeURIComponent(body.delivery_id)}`,
            {
              address_text: opts.addressText || null,
              phone: opts.phone || null,
            },
            { schema: 'logistics' }
          );
        }
        return {
          ok: true,
          delivery_id: body.delivery_id,
          delivery_no: body.delivery_no,
        };
      }
      if (body?.error && body.error !== 'function_missing') {
        return { ok: false, error: String(body.error) };
      }
    } else {
      const c = conn();
      const r = await c.query(
        `SELECT logic.create_delivery_from_sales($1, $2, $3::uuid, $4) AS result`,
        [f, p, salesId, opts?.createdBy || null]
      );
      const body = r?.rows?.[0]?.result;
      if (body?.ok) {
        if (opts?.addressText || opts?.phone) {
          await c.query(
            `UPDATE logistics.deliveries SET address_text = COALESCE($2, address_text), phone = COALESCE($3, phone)
             WHERE id = $1`,
            [body.delivery_id, opts.addressText || null, opts.phone || null]
          );
        }
        return {
          ok: true,
          delivery_id: body.delivery_id,
          delivery_no: body.delivery_no,
        };
      }
      if (body?.error) return { ok: false, error: String(body.error) };
    }
  } catch {
    /* RPC yoksa uygulama yolu */
  }

  return createDeliveryFromSalesApp(salesId, opts);
}

async function createDeliveryFromSalesApp(
  salesId: string,
  opts?: { createdBy?: string; addressText?: string; phone?: string }
): Promise<{ ok: boolean; delivery_id?: string; delivery_no?: string; error?: string }> {
  const f = firmNr();
  const p = periodNr();

  // Mevcut açık teslimat var mı?
  if (isRestApi()) {
    const { postgrest } = await import('./api/postgrestClient');
    const existing = await postgrest.get<any[]>(
      '/deliveries',
      {
        select: 'id,status',
        firm_nr: `eq.${f}`,
        period_nr: `eq.${p}`,
        sales_id: `eq.${salesId}`,
        status: 'neq.cancelled',
        limit: 1,
      },
      { schema: 'logistics' }
    );
    if (Array.isArray(existing) && existing.length) {
      return { ok: false, error: 'delivery_already_exists' };
    }

    let sales: any = null;
    try {
      const srows = await postgrest.get<any[]>(
        `/${salesTable()}`,
        { select: 'id,fiche_no,customer_id,customer_name,notes,store_id', id: `eq.${salesId}`, limit: 1 },
        { schema: 'public' }
      );
      sales = Array.isArray(srows) ? srows[0] : null;
    } catch (e: any) {
      return { ok: false, error: e?.message || 'sales_not_found' };
    }
    if (!sales) return { ok: false, error: 'sales_not_found' };

    let items: any[] = [];
    try {
      items = await postgrest.get<any[]>(
        `/${saleItemsTable()}`,
        {
          select: 'id,product_id,item_code,item_name,unit,quantity',
          invoice_id: `eq.${salesId}`,
        },
        { schema: 'public' }
      );
      if (!Array.isArray(items)) items = [];
    } catch {
      items = [];
    }

    const deliveryNo = await nextDeliveryNo();
    const deliveryId = crypto.randomUUID();
    await postgrest.post(
      '/deliveries',
      {
        id: deliveryId,
        firm_nr: f,
        period_nr: p,
        delivery_no: deliveryNo,
        delivery_date: new Date().toISOString().slice(0, 10),
        branch_id: sales.store_id || null,
        sales_id: salesId,
        sales_fiche_no: sales.fiche_no || null,
        customer_id: sales.customer_id || null,
        customer_name: sales.customer_name || null,
        address_text: opts?.addressText || sales.notes || null,
        phone: opts?.phone || null,
        status: 'draft',
        created_by: opts?.createdBy || null,
      },
      { schema: 'logistics', prefer: 'return=minimal' }
    );

    for (const it of items) {
      const qty = Number(it.quantity || 0);
      await postgrest.post(
        '/delivery_lines',
        {
          delivery_id: deliveryId,
          sale_item_id: it.id || null,
          product_id: it.product_id || null,
          product_code: it.item_code || null,
          product_name: it.item_name || null,
          unit: it.unit || 'Adet',
          qty_ordered: qty,
          qty_planned: qty,
        },
        { schema: 'logistics', prefer: 'return=minimal' }
      );
    }

    await postgrest.post(
      '/delivery_status_events',
      {
        delivery_id: deliveryId,
        from_status: null,
        to_status: 'draft',
        actor_id: opts?.createdBy || null,
        note: 'Siparişten oluşturuldu',
      },
      { schema: 'logistics', prefer: 'return=minimal' }
    );

    return { ok: true, delivery_id: deliveryId, delivery_no: deliveryNo };
  }

  const c = conn();
  const ex = await c.query(
    `SELECT id FROM logistics.deliveries
     WHERE firm_nr = $1 AND period_nr = $2 AND sales_id = $3 AND status <> 'cancelled'
     LIMIT 1`,
    [f, p, salesId]
  );
  if (ex?.rows?.length) return { ok: false, error: 'delivery_already_exists' };

  const s = await c.query(
    `SELECT id, fiche_no, customer_id, customer_name, notes, store_id::text AS store_id
     FROM ${salesTable()} WHERE id = $1::uuid`,
    [salesId]
  );
  const sales = s?.rows?.[0];
  if (!sales) return { ok: false, error: 'sales_not_found' };

  const itemsR = await c.query(
    `SELECT id, product_id, item_code, item_name, unit, quantity
     FROM ${saleItemsTable()} WHERE invoice_id = $1::uuid`,
    [salesId]
  );
  const items = itemsR?.rows || [];
  const deliveryNo = await nextDeliveryNo();
  const deliveryId = crypto.randomUUID();

  await c.query(
    `INSERT INTO logistics.deliveries (
      id, firm_nr, period_nr, delivery_no, delivery_date, branch_id,
      sales_id, sales_fiche_no, customer_id, customer_name, address_text, phone, status, created_by
    ) VALUES (
      $1, $2, $3, $4, CURRENT_DATE, $5,
      $6, $7, $8, $9, $10, $11, 'draft', $12
    )`,
    [
      deliveryId,
      f,
      p,
      deliveryNo,
      sales.store_id || null,
      salesId,
      sales.fiche_no || null,
      sales.customer_id || null,
      sales.customer_name || null,
      opts?.addressText || sales.notes || null,
      opts?.phone || null,
      opts?.createdBy || null,
    ]
  );

  for (const it of items) {
    const qty = Number(it.quantity || 0);
    await c.query(
      `INSERT INTO logistics.delivery_lines (
        delivery_id, sale_item_id, product_id, product_code, product_name, unit, qty_ordered, qty_planned
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [
        deliveryId,
        it.id || null,
        it.product_id || null,
        it.item_code || null,
        it.item_name || null,
        it.unit || 'Adet',
        qty,
      ]
    );
  }

  await c.query(
    `INSERT INTO logistics.delivery_status_events (delivery_id, from_status, to_status, actor_id, note)
     VALUES ($1, NULL, 'draft', $2, 'Siparişten oluşturuldu')`,
    [deliveryId, opts?.createdBy || null]
  );

  return { ok: true, delivery_id: deliveryId, delivery_no: deliveryNo };
}

export async function getDeliveryStats(): Promise<Record<string, number>> {
  const list = await listDeliveries({ limit: 500 });
  const stats: Record<string, number> = {
    total: list.length,
    draft: 0,
    planned: 0,
    picking: 0,
    packing: 0,
    loading: 0,
    in_transit: 0,
    delivered: 0,
    partial: 0,
    absent: 0,
    cancelled: 0,
    returned: 0,
  };
  for (const d of list) {
    const s = normalizeStatus(d.status);
    stats[s] = (stats[s] || 0) + 1;
  }
  return stats;
}

export const logisticsService = {
  listDeliveries,
  getDelivery,
  listCouriers,
  listVehicles,
  transitionStatus,
  assignCourierVehicle,
  createDeliveryFromSales,
  getDeliveryStats,
  canTransition,
  nextStatuses,
  DELIVERY_STATUS_LABELS,
};

export default logisticsService;
