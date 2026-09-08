/**
 * Public QR Menü API helpers — pg_bridge üzerinde /api/qr/:tenantCode/*
 * Kiracı: resolveEticaretConnStrAsync + firm/period prefix'li rest tabloları.
 */

import type { Context } from 'hono';
import type { Pool } from 'pg';
import {
  resolveEticaretConnStrAsync,
  fetchFirmNrFromPg,
  getEticaretPool,
} from '../../eticaret/core/server/tenantDbResolve';

const QR_RATE = new Map<string, { n: number; t: number }>();
const QR_RATE_WINDOW_MS = 60_000;
const QR_RATE_MAX = 120;

function rateOk(key: string): boolean {
  const now = Date.now();
  const cur = QR_RATE.get(key);
  if (!cur || now - cur.t > QR_RATE_WINDOW_MS) {
    QR_RATE.set(key, { n: 1, t: now });
    return true;
  }
  if (cur.n >= QR_RATE_MAX) return false;
  cur.n += 1;
  return true;
}

function padFirm(raw: string): string {
  const d = String(raw || '001').replace(/\D/g, '').slice(0, 3).padStart(3, '0');
  return d || '001';
}

function padPeriod(raw: string): string {
  const d = String(raw || '01').replace(/\D/g, '').slice(0, 2).padStart(2, '0');
  return d || '01';
}

async function resolvePeriod(pool: Pool, firm: string): Promise<string> {
  try {
    const r = await pool.query<{ primary_period_nr: string | null }>(
      `SELECT primary_period_nr FROM public.system_settings WHERE id = 1 LIMIT 1`
    );
    if (r.rows[0]?.primary_period_nr) return padPeriod(String(r.rows[0].primary_period_nr));
  } catch {
    /* ignore */
  }
  try {
    const r = await pool.query<{ nr: string }>(
      `SELECT nr::text AS nr FROM public.periods WHERE firm_nr = $1 ORDER BY nr DESC LIMIT 1`,
      [firm]
    );
    if (r.rows[0]?.nr) return padPeriod(r.rows[0].nr);
  } catch {
    /* ignore */
  }
  return '01';
}

export type QrTenantCtx = {
  pool: Pool;
  firm: string;
  period: string;
  card: (name: string) => string;
  mov: (name: string) => string;
  tenantCode: string;
};

export async function resolveQrTenant(
  tenantCode: string,
  opts?: { firmNr?: string; periodNr?: string }
): Promise<QrTenantCtx | { error: string; status: number }> {
  const code = String(tenantCode || '')
    .trim()
    .toLowerCase();
  if (!code || !/^[a-z0-9_-]{2,64}$/.test(code)) {
    return { error: 'Geçersiz kiracı kodu', status: 400 };
  }
  const connStr = await resolveEticaretConnStrAsync(code);
  if (!connStr) {
    return {
      error:
        'Kiracı veritabanı çözülemedi. Bridge ortamında PG_DUMP_INTERNAL_URI / MERKEZ_PG_URI gerekir.',
      status: 503,
    };
  }
  const pool = getEticaretPool(connStr);
  const firm = padFirm(opts?.firmNr || (await fetchFirmNrFromPg(connStr)));
  const period = padPeriod(opts?.periodNr || (await resolvePeriod(pool, firm)));
  const card = (name: string) => `rest.rex_${firm}_${name}`;
  const mov = (name: string) => `rest.rex_${firm}_${period}_${name}`;
  return { pool, firm, period, card, mov, tenantCode: code };
}

async function getQrSettings(ctx: QrTenantCtx) {
  try {
    const { rows } = await ctx.pool.query(`SELECT * FROM ${ctx.card('qr_settings')} LIMIT 1`);
    if (rows[0]) return rows[0];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/does not exist|undefined_table/i.test(msg)) {
      try {
        await ensureQrCardTables(ctx);
        const again = await ctx.pool.query(`SELECT * FROM ${ctx.card('qr_settings')} LIMIT 1`);
        if (again.rows[0]) return again.rows[0];
      } catch (e2: unknown) {
        console.error('[QR Settings ensure]', e2 instanceof Error ? e2.message : e2);
      }
    } else {
      throw e;
    }
  }
  return {
    restaurant_name: ctx.tenantCode,
    primary_color: '#f59e0b',
    ordering_enabled: true,
    call_waiter_enabled: true,
    request_bill_enabled: true,
    valet_enabled: false,
    feedback_enabled: true,
    wifi_enabled: true,
    auto_send_kitchen: false,
    order_approval_mode: 'manual',
    is_active: true,
    default_language: 'tr',
    supported_languages: ['tr', 'en', 'ar', 'ku'],
  };
}

async function ensureQrCardTables(ctx: QrTenantCtx) {
  const settings = ctx.card('qr_settings').replace(/^rest\./, '');
  const questions = ctx.card('qr_feedback_questions').replace(/^rest\./, '');
  await ctx.pool.query(`
    CREATE TABLE IF NOT EXISTS rest.${settings} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      restaurant_name VARCHAR(255),
      logo_url TEXT,
      cover_image_url TEXT,
      primary_color VARCHAR(7) DEFAULT '#f59e0b',
      wifi_ssid VARCHAR(255),
      wifi_password VARCHAR(255),
      public_base_url TEXT,
      default_language VARCHAR(5) DEFAULT 'tr',
      supported_languages TEXT[] DEFAULT ARRAY['tr','en','ar','ku'],
      ordering_enabled BOOLEAN DEFAULT true,
      call_waiter_enabled BOOLEAN DEFAULT true,
      request_bill_enabled BOOLEAN DEFAULT true,
      valet_enabled BOOLEAN DEFAULT false,
      feedback_enabled BOOLEAN DEFAULT true,
      wifi_enabled BOOLEAN DEFAULT true,
      auto_send_kitchen BOOLEAN DEFAULT false,
      order_approval_mode VARCHAR(20) DEFAULT 'manual',
      is_active BOOLEAN DEFAULT true,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
  await ctx.pool.query(
    `INSERT INTO rest.${settings} (restaurant_name)
     SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM rest.${settings} LIMIT 1)`,
    [ctx.tenantCode]
  );
  await ctx.pool.query(`
    CREATE TABLE IF NOT EXISTS rest.${questions} (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) NOT NULL UNIQUE,
      name_tr VARCHAR(255) NOT NULL,
      name_en VARCHAR(255),
      name_ar VARCHAR(255),
      name_ku VARCHAR(255),
      icon_key VARCHAR(50) DEFAULT 'star',
      sort_order INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
}

async function findTableByToken(ctx: QrTenantCtx, token: string) {
  const { rows } = await ctx.pool.query(
    `SELECT id, number, seats, status, floor_id, qr_token, total, waiter
     FROM ${ctx.card('rest_tables')} WHERE qr_token = $1::uuid LIMIT 1`,
    [token]
  );
  return rows[0] ?? null;
}

async function ensureOpenOrder(
  ctx: QrTenantCtx,
  table: { id: string; floor_id?: string; number?: string },
  source = 'qr_menu'
) {
  const existing = await ctx.pool.query(
    `SELECT * FROM ${ctx.mov('rest_orders')}
     WHERE table_id = $1 AND status = 'open'
     ORDER BY opened_at DESC LIMIT 1`,
    [table.id]
  );
  if (existing.rows[0]) return existing.rows[0];

  const year = new Date().getFullYear();
  const seqRes = await ctx.pool.query(
    `SELECT COUNT(*)::int + 1 AS n FROM ${ctx.mov('rest_orders')} WHERE order_no LIKE $1`,
    [`RES-${year}-%`]
  );
  const seq = String(seqRes.rows[0]?.n ?? 1).padStart(5, '0');
  const orderNo = `RES-${year}-${seq}`;

  const ins = await ctx.pool.query(
    `INSERT INTO ${ctx.mov('rest_orders')}
       (order_no, table_id, floor_id, waiter, status, note, source)
     VALUES ($1, $2, $3, 'QR Menü', 'open', $4, $5)
     RETURNING *`,
    [orderNo, table.id, table.floor_id ?? null, JSON.stringify({ channel: 'qr_menu' }), source]
  );

  await ctx.pool.query(
    `UPDATE ${ctx.card('rest_tables')}
     SET status = 'occupied', waiter = COALESCE(waiter, 'QR Menü'),
         start_time = COALESCE(start_time, NOW()), updated_at = NOW()
     WHERE id = $1 AND status = 'empty'`,
    [table.id]
  );

  return ins.rows[0];
}

async function addItems(
  ctx: QrTenantCtx,
  orderId: string,
  items: Array<{ productId?: string; name: string; quantity: number; unitPrice: number; note?: string }>
) {
  const created = [];
  for (const it of items) {
    const qty = Number(it.quantity) || 1;
    const price = Number(it.unitPrice) || 0;
    const subtotal = qty * price;
    const r = await ctx.pool.query(
      `INSERT INTO ${ctx.mov('rest_order_items')}
         (order_id, product_id, product_name, quantity, unit_price, discount_pct, subtotal, note, status)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $7, 'pending')
       RETURNING *`,
      [
        orderId,
        it.productId || null,
        it.name,
        qty,
        price,
        subtotal,
        it.note || null,
      ]
    );
    created.push(r.rows[0]);
  }
  await ctx.pool.query(
    `UPDATE ${ctx.mov('rest_orders')} SET total_amount = (
       SELECT COALESCE(SUM(subtotal), 0) FROM ${ctx.mov('rest_order_items')} WHERE order_id = $1 AND COALESCE(is_void,false)=false
     ), updated_at = NOW() WHERE id = $1`,
    [orderId]
  );
  const tot = await ctx.pool.query(
    `SELECT total_amount FROM ${ctx.mov('rest_orders')} WHERE id = $1`,
    [orderId]
  );
  await ctx.pool.query(
    `UPDATE ${ctx.card('rest_tables')} SET total = $2, updated_at = NOW() WHERE id = (
       SELECT table_id FROM ${ctx.mov('rest_orders')} WHERE id = $1
     )`,
    [orderId, tot.rows[0]?.total_amount ?? 0]
  );
  return created;
}

async function sendToKitchenSql(
  ctx: QrTenantCtx,
  orderId: string,
  tableNumber: string,
  itemRows: Array<{ id: string; product_name: string; quantity: number; note?: string; course?: string }>
) {
  if (!itemRows.length) return null;
  const ko = await ctx.pool.query(
    `INSERT INTO ${ctx.mov('rest_kitchen_orders')}
       (order_id, table_number, waiter, status, note)
     VALUES ($1, $2, 'QR Menü', 'new', 'QR otomatik')
     RETURNING id`,
    [orderId, tableNumber]
  );
  const kitchenOrderId = ko.rows[0].id;
  for (const it of itemRows) {
    await ctx.pool.query(
      `INSERT INTO ${ctx.mov('rest_kitchen_items')}
         (kitchen_order_id, order_item_id, product_name, quantity, note, status)
       VALUES ($1, $2, $3, $4, $5, 'new')`,
      [kitchenOrderId, it.id, it.product_name, it.quantity, it.note ?? null]
    );
    await ctx.pool.query(
      `UPDATE ${ctx.mov('rest_order_items')}
       SET status = 'cooking', sent_to_kitchen_at = NOW() WHERE id = $1`,
      [it.id]
    );
  }
  await ctx.pool.query(
    `UPDATE ${ctx.card('rest_tables')} SET status = 'kitchen', updated_at = NOW()
     WHERE id = (SELECT table_id FROM ${ctx.mov('rest_orders')} WHERE id = $1)`,
    [orderId]
  );
  return kitchenOrderId;
}

async function createServiceRequest(
  ctx: QrTenantCtx,
  params: {
    requestType: string;
    tableId?: string | null;
    tableNumber?: string | null;
    orderId?: string | null;
    payload?: Record<string, unknown>;
    customerNote?: string;
  }
) {
  const { rows } = await ctx.pool.query(
    `INSERT INTO ${ctx.mov('rest_service_requests')}
       (request_type, status, table_id, table_number, order_id, payload, customer_note)
     VALUES ($1, 'pending', $2, $3, $4, $5::jsonb, $6)
     RETURNING *`,
    [
      params.requestType,
      params.tableId ?? null,
      params.tableNumber ?? null,
      params.orderId ?? null,
      JSON.stringify(params.payload ?? {}),
      params.customerNote ?? null,
    ]
  );
  return rows[0];
}

function clientKey(c: Context, tenant: string) {
  const ip =
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'local';
  return `${tenant}:${ip}`;
}

/** Hono route mount — app üzerinde /api/qr/:tenantCode/... */
export function registerQrMenuBridgeRoutes(app: {
  get: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
  post: (path: string, handler: (c: Context) => Promise<Response> | Response) => void;
}) {
  app.get('/api/qr/:tenantCode/menu', async (c) => {
    const tenantCode = String(c.req.param('tenantCode') || '');
    if (!rateOk(clientKey(c, tenantCode))) return c.json({ error: 'Rate limit' }, 429);
    const firmNr = c.req.query('firmNr') || undefined;
    const periodNr = c.req.query('periodNr') || undefined;
    const ctx = await resolveQrTenant(tenantCode, { firmNr, periodNr });
    if ('error' in ctx) return c.json({ error: ctx.error }, ctx.status as 400);

    try {
      const settings = await getQrSettings(ctx);
      if (settings.is_active === false) {
        return c.json({ error: 'QR menü kapalı' }, 403);
      }

      let categories: Array<{ id: string; name: string }> = [];
      let products: Array<Record<string, unknown>> = [];
      try {
        const cat = await ctx.pool.query(
          `SELECT id, name FROM public.rex_${ctx.firm}_categories ORDER BY name ASC LIMIT 200`
        );
        categories = cat.rows;
      } catch {
        categories = [];
      }
      try {
        const prod = await ctx.pool.query(
          `SELECT id, name, sale_price, category_id, image_url, description, is_active
           FROM public.rex_${ctx.firm}_products
           WHERE COALESCE(is_active, true) = true
           ORDER BY name ASC
           LIMIT 500`
        );
        products = prod.rows.map((p) => ({
          id: p.id,
          name: p.name,
          price: Number(p.sale_price) || 0,
          categoryId: p.category_id,
          imageUrl: p.image_url,
          description: p.description,
        }));
      } catch (e: unknown) {
        console.warn('[QR Menu] products query', e);
      }

      return c.json({
        ok: true,
        tenantCode: ctx.tenantCode,
        firmNr: ctx.firm,
        periodNr: ctx.period,
        settings: {
          restaurantName: settings.restaurant_name,
          logoUrl: settings.logo_url,
          coverImageUrl: settings.cover_image_url,
          primaryColor: settings.primary_color || '#f59e0b',
          wifiSsid: settings.wifi_ssid,
          wifiPassword: settings.wifi_password,
          defaultLanguage: settings.default_language || 'tr',
          supportedLanguages: settings.supported_languages || ['tr', 'en', 'ar', 'ku'],
          orderingEnabled: settings.ordering_enabled !== false,
          callWaiterEnabled: settings.call_waiter_enabled !== false,
          requestBillEnabled: settings.request_bill_enabled !== false,
          valetEnabled: !!settings.valet_enabled,
          feedbackEnabled: settings.feedback_enabled !== false,
          wifiEnabled: settings.wifi_enabled !== false,
          autoSendKitchen: !!settings.auto_send_kitchen,
          orderApprovalMode: String(settings.order_approval_mode || 'manual') === 'auto' ? 'auto' : 'manual',
        },
        categories,
        products,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[QR Menu]', msg);
      return c.json({ error: msg }, 500);
    }
  });

  app.get('/api/qr/:tenantCode/table/:tableToken', async (c) => {
    const tenantCode = String(c.req.param('tenantCode') || '');
    const tableToken = String(c.req.param('tableToken') || '');
    if (!rateOk(clientKey(c, tenantCode))) return c.json({ error: 'Rate limit' }, 429);
    const ctx = await resolveQrTenant(tenantCode, {
      firmNr: c.req.query('firmNr') || undefined,
      periodNr: c.req.query('periodNr') || undefined,
    });
    if ('error' in ctx) return c.json({ error: ctx.error }, ctx.status as 400);

    try {
      const table = await findTableByToken(ctx, tableToken);
      if (!table) return c.json({ error: 'Masa bulunamadı' }, 404);
      const order = await ctx.pool.query(
        `SELECT o.id, o.order_no, o.status, o.total_amount, o.discount_amount,
                o.order_discount_pct, o.tax_amount, o.source, o.opened_at, o.billed_at,
                COALESCE(json_agg(json_build_object(
                  'id', i.id,
                  'name', i.product_name,
                  'qty', i.quantity,
                  'price', i.unit_price,
                  'subtotal', i.subtotal,
                  'status', i.status,
                  'note', i.note,
                  'sentToKitchenAt', i.sent_to_kitchen_at,
                  'servedAt', i.served_at,
                  'createdAt', i.created_at
                ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
         FROM ${ctx.mov('rest_orders')} o
         LEFT JOIN ${ctx.mov('rest_order_items')} i ON i.order_id = o.id AND COALESCE(i.is_void,false)=false
         WHERE o.table_id = $1 AND o.status = 'open'
         GROUP BY o.id
         ORDER BY o.opened_at DESC LIMIT 1`,
        [table.id]
      );
      const orderRow = order.rows[0] ?? null;
      let items = orderRow?.items;
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items);
        } catch {
          items = [];
        }
      }
      if (!Array.isArray(items)) items = [];

      // Misafir özeti: kalem durumlarından türetilmiş sipariş aşaması
      const statuses = items.map((i: { status?: string }) => String(i.status || 'pending'));
      let guestPhase = 'empty';
      if (items.length === 0) guestPhase = 'empty';
      else if (statuses.every((s: string) => s === 'served')) guestPhase = 'served';
      else if (statuses.some((s: string) => s === 'cooking' || s === 'ready')) guestPhase = 'preparing';
      else if (statuses.some((s: string) => s === 'pending' || s === 'awaiting_ack')) guestPhase = 'received';
      else guestPhase = 'open';

      if (table.status === 'billing') guestPhase = 'billing';

      // Manuel onay bekleyen QR siparişleri (henüz adisyonda yok)
      const pendingReq = await ctx.pool.query(
        `SELECT id, order_id, payload, customer_note, created_at, status
         FROM ${ctx.mov('rest_service_requests')}
         WHERE table_id = $1 AND request_type = 'qr_order' AND status = 'pending'
         ORDER BY created_at ASC`,
        [table.id]
      );
      const pendingOrders = (pendingReq.rows || []).map((row) => {
        let payload = row.payload;
        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch {
            payload = {};
          }
        }
        const p = (payload || {}) as {
          awaitingApproval?: boolean;
          items?: Array<{
            productId?: string;
            name?: string;
            quantity?: number;
            unitPrice?: number;
            note?: string;
          }>;
        };
        const pItems = Array.isArray(p.items) ? p.items : [];
        return {
          requestId: row.id,
          awaitingApproval: p.awaitingApproval !== false && !row.order_id,
          createdAt: row.created_at,
          note: row.customer_note,
          items: pItems.map((i, idx) => ({
            id: `pending-${row.id}-${idx}`,
            name: String(i.name || 'Ürün'),
            qty: Number(i.quantity) || 1,
            price: Number(i.unitPrice) || 0,
            subtotal: (Number(i.quantity) || 1) * (Number(i.unitPrice) || 0),
            status: 'awaiting_ack',
            note: i.note || null,
          })),
        };
      });

      if (!orderRow && pendingOrders.length > 0) {
        guestPhase = 'awaiting_approval';
      }

      return c.json({
        ok: true,
        table: {
          id: table.id,
          number: table.number,
          seats: table.seats,
          status: table.status,
          token: table.qr_token,
          total: Number(table.total) || Number(orderRow?.total_amount) || 0,
        },
        order: orderRow
          ? {
              id: orderRow.id,
              orderNo: orderRow.order_no,
              status: orderRow.status,
              totalAmount: Number(orderRow.total_amount) || 0,
              discountAmount: Number(orderRow.discount_amount) || 0,
              taxAmount: Number(orderRow.tax_amount) || 0,
              source: orderRow.source,
              openedAt: orderRow.opened_at,
              billedAt: orderRow.billed_at,
              guestPhase,
              items,
            }
          : null,
        pendingOrders,
        bill: orderRow
          ? {
              tableNumber: table.number,
              itemCount: items.length,
              subtotal: items.reduce(
                (s: number, i: { subtotal?: number; qty?: number; price?: number }) =>
                  s + (Number(i.subtotal) || Number(i.qty) * Number(i.price) || 0),
                0
              ),
              discountAmount: Number(orderRow.discount_amount) || 0,
              totalAmount: Number(orderRow.total_amount) || 0,
              currencyHint: null,
              guestPhase,
              items,
            }
          : null,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post('/api/qr/:tenantCode/orders', async (c) => {
    const tenantCode = String(c.req.param('tenantCode') || '');
    if (!rateOk(clientKey(c, tenantCode))) return c.json({ error: 'Rate limit' }, 429);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const ctx = await resolveQrTenant(tenantCode, {
      firmNr: typeof body.firmNr === 'string' ? body.firmNr : undefined,
      periodNr: typeof body.periodNr === 'string' ? body.periodNr : undefined,
    });
    if ('error' in ctx) return c.json({ error: ctx.error }, ctx.status as 400);

    try {
      const settings = await getQrSettings(ctx);
      if (settings.ordering_enabled === false) {
        return c.json({ error: 'Online sipariş kapalı' }, 403);
      }
      const tableToken = String(body.tableToken || '').trim();
      if (!tableToken) return c.json({ error: 'tableToken zorunlu' }, 400);
      const table = await findTableByToken(ctx, tableToken);
      if (!table) return c.json({ error: 'Masa bulunamadı' }, 404);

      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (!rawItems.length) return c.json({ error: 'Sepet boş' }, 400);
      const items = rawItems.map((x: Record<string, unknown>) => ({
        productId: typeof x.productId === 'string' ? x.productId : undefined,
        name: String(x.name || x.productName || 'Ürün'),
        quantity: Number(x.quantity ?? x.qty) || 1,
        unitPrice: Number(x.unitPrice ?? x.price) || 0,
        note: typeof x.note === 'string' ? x.note : undefined,
      }));

      const approvalMode =
        String(settings.order_approval_mode || 'manual').toLowerCase() === 'auto' ? 'auto' : 'manual';
      const autoKitchen = !!settings.auto_send_kitchen;
      const customerNote = typeof body.note === 'string' ? body.note : undefined;

      // Manuel: adisyona yazma — yalnızca onay kaydı (payload'da kalemler)
      if (approvalMode === 'manual') {
        const request = await createServiceRequest(ctx, {
          requestType: 'qr_order',
          tableId: table.id,
          tableNumber: table.number,
          orderId: null,
          payload: {
            awaitingApproval: true,
            items,
            itemCount: items.length,
            note: customerNote,
          },
          customerNote,
        });
        return c.json({
          ok: true,
          pendingApproval: true,
          orderId: null,
          orderNo: null,
          tableNumber: table.number,
          orderApprovalMode: 'manual',
          autoSendKitchen: autoKitchen,
          kitchenOrderId: null,
          requestId: request?.id ?? null,
          items: [],
        });
      }

      // Otomatik onay: hemen adisyona yaz
      const order = await ensureOpenOrder(ctx, table);
      const createdItems = await addItems(ctx, order.id, items);
      let kitchenOrderId: string | null = null;
      let request: Record<string, unknown> | null = null;

      if (autoKitchen) {
        kitchenOrderId = await sendToKitchenSql(
          ctx,
          order.id,
          table.number,
          createdItems.map((i) => ({
            id: i.id,
            product_name: i.product_name,
            quantity: Number(i.quantity),
            note: i.note,
          }))
        );
      } else {
        request = await createServiceRequest(ctx, {
          requestType: 'qr_order',
          tableId: table.id,
          tableNumber: table.number,
          orderId: order.id,
          payload: {
            awaitingApproval: false,
            itemIds: createdItems.map((i) => i.id),
            itemCount: createdItems.length,
          },
          customerNote,
        });
      }

      return c.json({
        ok: true,
        pendingApproval: false,
        orderId: order.id,
        orderNo: order.order_no,
        tableNumber: table.number,
        orderApprovalMode: 'auto',
        autoSendKitchen: autoKitchen,
        kitchenOrderId,
        requestId: request?.id ?? null,
        items: createdItems,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[QR Order]', msg);
      return c.json({ error: msg }, 500);
    }
  });

  app.post('/api/qr/:tenantCode/requests', async (c) => {
    const tenantCode = String(c.req.param('tenantCode') || '');
    if (!rateOk(clientKey(c, tenantCode))) return c.json({ error: 'Rate limit' }, 429);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const ctx = await resolveQrTenant(tenantCode, {
      firmNr: typeof body.firmNr === 'string' ? body.firmNr : undefined,
      periodNr: typeof body.periodNr === 'string' ? body.periodNr : undefined,
    });
    if ('error' in ctx) return c.json({ error: ctx.error }, ctx.status as 400);

    try {
      const settings = await getQrSettings(ctx);
      const type = String(body.type || body.requestType || 'waiter').toLowerCase();
      const allowed = ['waiter', 'bill', 'help', 'valet'];
      if (!allowed.includes(type)) return c.json({ error: 'Geçersiz tip' }, 400);
      if (type === 'waiter' && settings.call_waiter_enabled === false) {
        return c.json({ error: 'Garson çağırma kapalı' }, 403);
      }
      if (type === 'bill' && settings.request_bill_enabled === false) {
        return c.json({ error: 'Hesap isteme kapalı' }, 403);
      }
      if (type === 'valet' && !settings.valet_enabled) {
        return c.json({ error: 'Vale kapalı' }, 403);
      }

      let table: { id: string; number: string } | null = null;
      const tableToken = String(body.tableToken || '').trim();
      if (tableToken) {
        const t = await findTableByToken(ctx, tableToken);
        if (t) table = { id: t.id, number: t.number };
      }
      const plate = typeof body.plateNumber === 'string' ? body.plateNumber.trim().toUpperCase() : '';
      if (type === 'valet' && !plate) return c.json({ error: 'Plaka gerekli' }, 400);

      const row = await createServiceRequest(ctx, {
        requestType: type,
        tableId: table?.id,
        tableNumber: table?.number || (typeof body.tableNumber === 'string' ? body.tableNumber : null),
        payload: type === 'valet' ? { plateNumber: plate } : {},
        customerNote: typeof body.note === 'string' ? body.note : undefined,
      });

      return c.json({ ok: true, request: row });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.get('/api/qr/:tenantCode/feedback/questions', async (c) => {
    const tenantCode = String(c.req.param('tenantCode') || '');
    if (!rateOk(clientKey(c, tenantCode))) return c.json({ error: 'Rate limit' }, 429);
    const ctx = await resolveQrTenant(tenantCode, {
      firmNr: c.req.query('firmNr') || undefined,
      periodNr: c.req.query('periodNr') || undefined,
    });
    if ('error' in ctx) return c.json({ error: ctx.error }, ctx.status as 400);
    try {
      const { rows } = await ctx.pool.query(
        `SELECT id, code, name_tr, name_en, name_ar, name_ku, icon_key, sort_order
         FROM ${ctx.card('qr_feedback_questions')}
         WHERE COALESCE(is_active, true) = true
         ORDER BY sort_order ASC, code ASC`
      );
      return c.json({ ok: true, questions: rows });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post('/api/qr/:tenantCode/feedback', async (c) => {
    const tenantCode = String(c.req.param('tenantCode') || '');
    if (!rateOk(clientKey(c, tenantCode))) return c.json({ error: 'Rate limit' }, 429);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const ctx = await resolveQrTenant(tenantCode, {
      firmNr: typeof body.firmNr === 'string' ? body.firmNr : undefined,
      periodNr: typeof body.periodNr === 'string' ? body.periodNr : undefined,
    });
    if ('error' in ctx) return c.json({ error: ctx.error }, ctx.status as 400);
    try {
      const settings = await getQrSettings(ctx);
      if (settings.feedback_enabled === false) {
        return c.json({ error: 'Geri bildirim kapalı' }, 403);
      }
      let tableId: string | null = null;
      let tableNumber: string | null = null;
      const tableToken = String(body.tableToken || '').trim();
      if (tableToken) {
        const t = await findTableByToken(ctx, tableToken);
        if (t) {
          tableId = t.id;
          tableNumber = t.number;
        }
      }
      const rating = Number(body.rating);
      if (!rating || rating < 1 || rating > 5) {
        return c.json({ error: 'rating 1-5 olmalı' }, 400);
      }
      const { rows } = await ctx.pool.query(
        `INSERT INTO ${ctx.mov('rest_feedback')}
           (question_code, question_id, rating, table_id, table_number, staff_id,
            first_name, last_name, phone, comment, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'new')
         RETURNING *`,
        [
          typeof body.questionCode === 'string' ? body.questionCode : null,
          typeof body.questionId === 'string' ? body.questionId : null,
          rating,
          tableId,
          tableNumber,
          typeof body.staffId === 'string' ? body.staffId : null,
          typeof body.firstName === 'string' ? body.firstName : null,
          typeof body.lastName === 'string' ? body.lastName : null,
          typeof body.phone === 'string' ? body.phone : null,
          typeof body.comment === 'string' ? body.comment : null,
        ]
      );
      return c.json({ ok: true, feedback: rows[0] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });
}
