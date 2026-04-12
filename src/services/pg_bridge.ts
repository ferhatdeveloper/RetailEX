/**
 * PostgreSQL Bridge for Web Environment
 * This server component allows browser clients to execute SQL queries.
 * 
 * SECURITY NOTE: Direct SQL execution from frontend should only be used in 
 * development or secure private networks.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Pool } from 'pg';
import { serve } from '@hono/node-server';
import { normalizeFoodDeliveryChannel } from '../config/foodDeliveryChannels';

const app = new Hono();

/** Caller ID: sanal santral webhook → tarayıcı poll. Tek son kayıt (LAN / güvenilir ağ için). */
type CallerIdLast = { phone: string; name?: string; receivedAt: string };
let callerIdLast: CallerIdLast | null = null;
type CallerCustomerLast = {
    phone: string;
    customerName?: string;
    address?: string;
    locationUrl?: string;
    note?: string;
    updatedAt: string;
};
let callerCustomerLast: CallerCustomerLast | null = null;

function deliveryPushTokenOk(
    c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } },
    bodyToken?: string
): boolean {
    const required = process.env.DELIVERY_PUSH_TOKEN?.trim();
    if (!required) return true;
    const bearer = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
    const q = c.req.query('token')?.trim();
    const b = bodyToken?.trim();
    return bearer === required || q === required || b === required;
}

function callerIdTokenOk(
    c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } },
    bodyToken?: string
): boolean {
    const required = process.env.CALLER_ID_PUSH_TOKEN?.trim();
    if (!required) return true;
    const bearer = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
    const q = c.req.query('token')?.trim();
    const b = bodyToken?.trim();
    return bearer === required || q === required || b === required;
}

// Enable CORS for frontend requests
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

// DB Pool Cache: connectionString -> Pool
const pools = new Map<string, Pool>();

function getPool(connStr: string): Pool {
    if (!pools.has(connStr)) {
        console.log(`[PG Bridge] Creating new pool for: ${connStr.replace(/:[^:@]+@/, ':***@')}`);
        const pool = new Pool({
            connectionString: connStr,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 15000, // Increased to 15s for remote connections
        });
        
        pool.on('error', (err) => {
            console.error('[PG Bridge] Unexpected error on idle client', err);
        });

        pools.set(connStr, pool);
    }
    return pools.get(connStr)!;
}

app.get('/api/status', (c) => {
    return c.json({ status: 'RUNNING', version: '1.0.0', service: 'PostgreSQL Bridge' });
});

/**
 * Santral / ara yazılım buraya POST atar. Örnek: { "phone": "905321234567", "name": "..." }
 * Güvenlik: CALLER_ID_PUSH_TOKEN ortam değişkeni tanımlıysa Authorization: Bearer <token> veya ?token=
 */
app.post('/api/caller_id/push', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const bodyTok = typeof body.token === 'string' ? body.token : typeof body.secret === 'string' ? body.secret : undefined;
        if (!callerIdTokenOk(c, bodyTok)) {
            return c.json({ error: 'Unauthorized' }, 401);
        }
        const raw =
            (typeof body.phone === 'string' && body.phone) ||
            (typeof body.telefon === 'string' && body.telefon) ||
            (typeof body.caller === 'string' && body.caller) ||
            (typeof body.caller_number === 'string' && body.caller_number) ||
            (typeof body.callerid === 'string' && body.callerid) ||
            (typeof body.from === 'string' && body.from) ||
            '';
        const phone = String(raw).replace(/\s+/g, '').trim();
        if (!phone) {
            return c.json({ error: 'phone (or alias field) required' }, 400);
        }
        const name =
            (typeof body.name === 'string' && body.name.trim()) ||
            (typeof body.caller_name === 'string' && body.caller_name.trim()) ||
            undefined;
        callerIdLast = { phone, name, receivedAt: new Date().toISOString() };
        return c.json({ ok: true, receivedAt: callerIdLast.receivedAt });
    } catch (error: any) {
        console.error('[Caller ID push]', error);
        return c.json({ error: error?.message || 'push failed' }, 500);
    }
});

/** Son gelen arayan (poll). Aynı token kuralı. */
app.get('/api/caller_id/last', (c) => {
    if (!callerIdTokenOk(c)) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    if (!callerIdLast) {
        return c.json({});
    }
    return c.json(callerIdLast);
});

/**
 * RetailEX UI eşleşen müşteri detayını telefona aktarır.
 * Android uygulama bu kaydı okuyup kuryeye paylaşır.
 */
app.post('/api/caller_id/customer_context', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const bodyTok = typeof body.token === 'string' ? body.token : undefined;
        if (!callerIdTokenOk(c, bodyTok)) {
            return c.json({ error: 'Unauthorized' }, 401);
        }
        const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
        if (!phone) return c.json({ error: 'phone required' }, 400);
        callerCustomerLast = {
            phone,
            customerName: typeof body.customerName === 'string' ? body.customerName.trim() : undefined,
            address: typeof body.address === 'string' ? body.address.trim() : undefined,
            locationUrl: typeof body.locationUrl === 'string' ? body.locationUrl.trim() : undefined,
            note: typeof body.note === 'string' ? body.note.trim() : undefined,
            updatedAt: new Date().toISOString(),
        };
        return c.json({ ok: true, updatedAt: callerCustomerLast.updatedAt });
    } catch (error: any) {
        return c.json({ error: error?.message || 'customer context push failed' }, 500);
    }
});

app.get('/api/caller_id/customer_last', (c) => {
    if (!callerIdTokenOk(c)) return c.json({ error: 'Unauthorized' }, 401);
    if (!callerCustomerLast) return c.json({});
    return c.json(callerCustomerLast);
});

/**
 * Paket servis: Yemeksepeti / Getir / aracı entegratör gibi dış sistemlerden sipariş oluşturma.
 * Güvenlik: DELIVERY_PUSH_TOKEN tanımlıysa Authorization: Bearer veya ?token= veya body.token
 */
app.post('/api/delivery_order/push', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const bodyTok = typeof body.token === 'string' ? body.token : undefined;
        if (!deliveryPushTokenOk(c, bodyTok)) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const connStr = typeof body.connStr === 'string' ? body.connStr.trim() : '';
        if (!connStr) {
            return c.json({ error: 'connStr gerekli' }, 400);
        }

        const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
        const address = typeof body.address === 'string' ? body.address.trim() : '';
        if (!customerName || !address) {
            return c.json({ error: 'customerName ve address zorunlu' }, 400);
        }

        const firmRaw = body.firmNr ?? body.firm_nr;
        const periodRaw = body.periodNr ?? body.period_nr;
        const firmDigits = String(firmRaw ?? '001').replace(/\D/g, '').slice(0, 3).padStart(3, '0');
        const periodDigits = String(periodRaw ?? '01').replace(/\D/g, '').slice(0, 2).padStart(2, '0');

        const channelRaw = typeof body.channel === 'string' ? body.channel : 'manual';
        const channel = normalizeFoodDeliveryChannel(channelRaw);
        const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
        const externalOrderId = typeof body.externalOrderId === 'string' ? body.externalOrderId.trim() : '';
        const itemsSummary = typeof body.itemsSummary === 'string' ? body.itemsSummary.trim() : '';
        let totalAmount = 0;
        if (typeof body.totalAmount === 'number' && !Number.isNaN(body.totalAmount)) {
            totalAmount = body.totalAmount;
        } else if (typeof body.totalAmount === 'string' && body.totalAmount.trim()) {
            const n = Number(String(body.totalAmount).replace(',', '.'));
            if (!Number.isNaN(n)) totalAmount = n;
        }

        const tableName = `rex_${firmDigits}_${periodDigits}_rest_orders`;
        const qualified = `rest.${tableName}`;

        const pool = getPool(connStr);

        if (externalOrderId) {
            const dup = await pool.query(
                `SELECT id, order_no FROM ${qualified}
                 WHERE status = 'open' AND order_no LIKE 'DLV-%'
                 AND COALESCE(note::json->>'external_order_id','') = $1
                 AND COALESCE(note::json->>'channel','') = $2
                 LIMIT 1`,
                [externalOrderId, channel]
            );
            if (dup.rows?.length) {
                return c.json({
                    ok: true,
                    duplicate: true,
                    id: dup.rows[0].id,
                    orderNo: dup.rows[0].order_no,
                });
            }
        }

        const year = new Date().getFullYear();
        const seqRes = await pool.query(
            `SELECT COUNT(*)::int + 1 AS n FROM ${qualified} WHERE order_no LIKE $1`,
            [`DLV-${year}-%`]
        );
        const seq = String(seqRes.rows[0]?.n ?? 1).padStart(4, '0');
        const orderNo = `DLV-${year}-${seq}`;

        const payRaw = typeof body.expectedPaymentMethod === 'string' ? body.expectedPaymentMethod.trim().toLowerCase() : '';
        const expected_payment_method =
            payRaw === 'card' || payRaw === 'transfer' ? payRaw : 'cash';
        const note = JSON.stringify({
            type: 'delivery',
            customer_name: customerName,
            phone,
            address,
            delivery_status: 'pending',
            channel,
            expected_payment_method,
            ...(externalOrderId ? { external_order_id: externalOrderId } : {}),
            ...(itemsSummary ? { items_summary: itemsSummary } : {}),
        });

        const ins = await pool.query(
            `INSERT INTO ${qualified} (order_no, table_id, waiter, customer_id, status, note, total_amount)
             VALUES ($1, NULL, NULL, NULL, 'open', $2, $3)
             RETURNING id, order_no`,
            [orderNo, note, totalAmount]
        );

        return c.json({
            ok: true,
            id: ins.rows[0]?.id,
            orderNo: ins.rows[0]?.order_no,
        });
    } catch (error: any) {
        console.error('[delivery_order/push]', error);
        return c.json({ error: error?.message || 'push failed' }, 500);
    }
});

app.post('/api/pg_query', async (c) => {
    try {
        const { connStr, sql, params } = await c.req.json();

        if (!sql) return c.json({ error: 'SQL is required' }, 400);
        if (!connStr) return c.json({ error: 'Connection string is required' }, 400);

        const pool = getPool(connStr);
        const start = Date.now();
        const result = await pool.query(sql, params || []);
        const duration = Date.now() - start;

        console.log(`[PG Bridge] Query executed in ${duration}ms: ${sql.substring(0, 100)}...`);

        return c.json({
            rows: result.rows,
            rowCount: result.rowCount
        });
    } catch (error: any) {
        console.error('[PG Bridge Error]', error);
        return c.json({
            error: error.message,
            detail: error.detail,
            code: error.code
        }, 500);
    }
});

// Port: BRIDGE_PORT (tercih) veya PORT; varsayılan 3001
const port = (() => {
    const raw = (process.env.BRIDGE_PORT || process.env.PORT || '3001').trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 65535) {
        console.error(`[PG Bridge] Geçersiz port: ${raw}`);
        process.exit(1);
    }
    return n;
})();

const server = serve(
    {
        fetch: app.fetch,
        port,
    },
    () => {
        console.log(`🚀 SQL Bridge started on http://localhost:${port}`);
    }
);

server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(
            `[PG Bridge] Port ${port} zaten kullanımda (EADDRINUSE). Muhtemelen bridge zaten çalışıyor.`
        );
        console.error(
            '  → Yeni örnek açmayın; http://localhost:' +
                port +
                '/api/status ile kontrol edin.'
        );
        console.error(
            '  → Kapatmak için: netstat -ano | findstr :' +
                port +
                '  (LISTENING satırındaki PID’yi Görev Yöneticisi veya Stop-Process ile sonlandırın)'
        );
        console.error('  → Farklı port: PowerShell’de $env:BRIDGE_PORT=3002; npm run bridge');
    } else {
        console.error('[PG Bridge] Sunucu hatası:', err);
    }
    process.exit(1);
});


