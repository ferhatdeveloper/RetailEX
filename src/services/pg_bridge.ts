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
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';
import { Readable } from 'node:stream';
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

function pgDumpTokenOk(
    c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } },
    bodyToken?: string
): boolean {
    const required = process.env.PG_DUMP_TOKEN?.trim();
    if (!required) return true;
    const bearer = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '')?.trim();
    const q = c.req.query('token')?.trim();
    const b = bodyToken?.trim();
    return bearer === required || q === required || b === required;
}

function resolvePgDumpBinary(): string {
    const envPath = process.env.PG_DUMP_PATH?.trim();
    if (envPath && fs.existsSync(envPath)) return envPath;

    const winPaths = [
        'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
        'C:\\Program Files\\PostgreSQL\\14\\bin\\pg_dump.exe',
    ];
    for (const p of winPaths) {
        if (fs.existsSync(p)) return p;
    }

    try {
        const isWin = process.platform === 'win32';
        const out = execSync(isWin ? 'where pg_dump' : 'which pg_dump', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .trim()
            .split(/\r?\n/)[0]
            ?.trim();
        if (out && fs.existsSync(out)) return out;
    } catch {
        /* PATH yok */
    }

    return 'pg_dump';
}

/** pg_dump çıktısını geçici dosyaya yazar; başarılıysa dosya yolunu döner. */
async function runPgDumpToTempFile(connStr: string): Promise<string> {
    const tmpFile = path.join(os.tmpdir(), `retailex_pg_dump_${Date.now()}.sql`);
    const pgDumpBin = resolvePgDumpBinary();
    const args = ['-d', connStr, '-F', 'p', '--no-owner', '--no-acl', '-f', tmpFile];
    await new Promise<void>((resolve, reject) => {
        const child = spawn(pgDumpBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.on('error', (err: Error) => reject(err));
        child.on('close', (code: number | null) => {
            if (code === 0) resolve();
            else reject(new Error(stderr.trim() || `pg_dump çıkış kodu ${code}`));
        });
    });
    return tmpFile;
}

function streamTmpSqlFileAsDownload(tmpFile: string): Response {
    const downloadName = `retailex_full_${Date.now()}.sql`;
    const nodeStream = fs.createReadStream(tmpFile);
    const cleanup = () => {
        fs.unlink(tmpFile, () => {});
    };
    nodeStream.on('close', cleanup);
    nodeStream.on('error', cleanup);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;
    return new Response(webStream, {
        headers: {
            'Content-Type': 'application/sql; charset=utf-8',
            'Content-Disposition': `attachment; filename="${downloadName}"`,
        },
    });
}

/**
 * PostgREST / SaaS: tarayıcıdaki host (api.*:443) PostgreSQL kablo protokolü değildir.
 * Köprü konteynerinden aynı Docker ağındaki postgres:5432 ile pg_dump (PGRST_DB_URI ile aynı mantık).
 * PG_DUMP_INTERNAL_URI: veritabanı adı OLMADAN, örn. postgres://postgres:PAROLA@postgres:5432
 * İsteğe bağlı: PG_DUMP_ALLOWED_DBS=db1,db2 (virgülle); boşsa yalnızca güvenli isim kalıbı.
 */
function resolveInternalDumpConnStr(databaseRaw: string): string | null {
    const database = databaseRaw.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(database)) {
        return null;
    }
    const allow = process.env.PG_DUMP_ALLOWED_DBS?.trim();
    if (allow) {
        const ok = new Set(allow.split(',').map((s) => s.trim()).filter(Boolean));
        if (!ok.has(database)) {
            return null;
        }
    }
    const rawBase = process.env.PG_DUMP_INTERNAL_URI?.trim();
    if (!rawBase) {
        return null;
    }
    const conn = rawBase.replace(/\/+$/, '');
    try {
        const u = new URL(conn.includes('://') ? conn : `postgres://${conn}`);
        u.pathname = `/${database}`;
        return u.href;
    } catch {
        return null;
    }
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
            // Uzak PG / uyku modu / yavaş ağ: köprü ile DB arasında zaman aşımını azaltmak için
            connectionTimeoutMillis: 30000,
            keepAlive: true,
        });
        
        pool.on('error', (err) => {
            console.error('[PG Bridge] Unexpected error on idle client', err);
        });

        pools.set(connStr, pool);
    }
    return pools.get(connStr)!;
}

/** Logo REST proxy yolları — /api/logo/* bazı reklam engelleyicilerde bloklanır */
export const LOGO_PROXY_ROUTE_PATHS = ['/api/erp-logo-proxy', '/api/logo/proxy'] as const;

app.get('/api/status', (c) => {
    return c.json({
        status: 'RUNNING',
        version: '1.0.0',
        service: 'PostgreSQL Bridge',
        logoProxy: true,
        logoProxyPaths: [...LOGO_PROXY_ROUTE_PATHS],
        marketRatesProxy: true,
    });
});

/** Dış kur/altın kaynakları — tarayıcı CORS bypass */
app.get('/api/market-rates/proxy', async (c) => {
    const rawUrl = c.req.query('url')?.trim();
    if (!rawUrl) return c.json({ error: 'url parametresi gerekli' }, 400);
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return c.json({ error: 'Geçersiz URL' }, 400);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return c.json({ error: 'Yalnızca http/https' }, 400);
    }
    const host = parsed.hostname.toLowerCase();
    const allowedHosts = new Set([
        'hatwanexchange.com',
        'www.hatwanexchange.com',
        'salargolds.com',
        'www.salargolds.com',
        'docs.google.com',
        'doc-0s-b4-sheets.googleusercontent.com',
        'api.gold-api.com',
    ]);
    const allowed = [...allowedHosts].some((h) => host === h || host.endsWith(`.${h}`));
    if (!allowed) {
        return c.json({ error: `Host izinli değil: ${host}` }, 403);
    }
    try {
        const res = await fetch(parsed.toString(), {
            method: 'GET',
            headers: {
                'User-Agent': 'RetailEX-MarketRates/1.0',
                Accept: 'text/html,application/json,text/csv,*/*',
            },
        });
        const text = await res.text();
        return c.json({ ok: res.ok, status: res.status, text });
    } catch (error: unknown) {
        const err = error as { message?: string };
        return c.json({ error: err?.message || 'Proxy fetch başarısız' }, 502);
    }
});

type LogoProxyBody = {
    baseUrl?: string;
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string | null;
    query?: Record<string, string>;
};

async function handleLogoProxyRequest(body: LogoProxyBody) {
    const baseUrl = String(body.baseUrl || '').trim().replace(/\/+$/, '');
    const method = String(body.method || 'GET').toUpperCase();
    const path = String(body.path || '/').trim();
    if (!baseUrl || !baseUrl.startsWith('http')) {
        return { status: 400 as const, json: { error: 'baseUrl gerekli (http/https)' } };
    }
    if (!path.startsWith('/')) {
        return { status: 400 as const, json: { error: 'path / ile başlamalı' } };
    }

    const qs = body.query && typeof body.query === 'object'
        ? '?' + Object.entries(body.query)
            .filter(([, v]) => v != null && String(v) !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
            .join('&')
        : '';
    const url = `${baseUrl}${path}${qs}`;

    const headers: Record<string, string> = {};
    if (body.headers && typeof body.headers === 'object') {
        for (const [k, v] of Object.entries(body.headers)) {
            if (v != null) headers[k] = String(v);
        }
    }

    let upstream: Response;
    try {
        upstream = await fetch(url, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' ? undefined : (body.body ?? undefined),
                signal: AbortSignal.timeout(300_000),
        });
    } catch (upstreamErr: unknown) {
        const msg = upstreamErr instanceof Error ? upstreamErr.message : String(upstreamErr);
        console.error('[PG Bridge] Logo upstream fetch failed:', url.replace(/:[^:@]+@/, ':***@'), msg);
        return {
            status: 200 as const,
            json: {
                proxy: {
                    ok: false,
                    status: 0,
                    data: { upstreamError: msg, upstreamUrl: url },
                    text: msg,
                    upstreamUnreachable: true,
                },
            },
        };
    }

    const text = await upstream.text();
    let data: unknown = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    return {
        status: 200 as const,
        json: {
            proxy: {
                ok: upstream.ok,
                status: upstream.status,
                data,
                text,
            },
        },
    };
}

/**
 * Logo Tiger REST API proxy — tarayıcı CORS engelini aşmak için.
 * POST { baseUrl, method, path, headers?, body?, query? }
 */
async function logoProxyRoute(c: { req: { json: () => Promise<unknown> } }) {
    try {
        const body = await c.req.json().catch(() => ({})) as LogoProxyBody;
        const result = await handleLogoProxyRequest(body);
        return c.json(result.json, result.status);
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[PG Bridge] Logo proxy error:', msg);
        return c.json({ error: msg }, 500);
    }
}

for (const routePath of LOGO_PROXY_ROUTE_PATHS) {
    app.post(routePath, logoProxyRoute);
}

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

/** Rongta RLS1000/RLS1100 — doğrudan TCP PLU (RLS1000.exe olmadan). Mağaza LAN'ında çalışır. */
app.post('/api/scale/rongta/test', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const ipAddress = typeof body.ipAddress === 'string' ? body.ipAddress.trim() : '';
        const port = typeof body.port === 'number' ? body.port : undefined;
        if (!ipAddress) return c.json({ error: 'ipAddress gerekli' }, 400);
        const { rongtaTcpTest } = await import('./rongtaTcpNode');
        const result = await rongtaTcpTest(ipAddress, port);
        return c.json(result);
    } catch (error: any) {
        console.error('[Rongta test]', error);
        return c.json({ ok: false, error: error?.message || 'test failed' }, 500);
    }
});

app.post('/api/scale/rongta/send-plu', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const ipAddress = typeof body.ipAddress === 'string' ? body.ipAddress.trim() : '';
        const port = typeof body.port === 'number' ? body.port : undefined;
        const records = Array.isArray(body.records) ? body.records : [];
        if (!ipAddress) return c.json({ success: false, message: 'ipAddress gerekli' }, 400);
        if (!records.length) return c.json({ success: false, message: 'records boş' }, 400);
        const { rongtaTcpSendPlu } = await import('./rongtaTcpNode');
        const result = await rongtaTcpSendPlu(ipAddress, port, records);
        return c.json(result);
    } catch (error: any) {
        console.error('[Rongta send-plu]', error);
        return c.json({
            success: false,
            message: error?.message || 'send-plu failed',
            sentCount: 0,
            failedCount: 0,
        }, 500);
    }
});

app.post('/api/scale/rongta/fetch-sales', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const ipAddress = typeof body.ipAddress === 'string' ? body.ipAddress.trim() : '';
        const port = typeof body.port === 'number' ? body.port : undefined;
        const maxRecords = typeof body.maxRecords === 'number' ? body.maxRecords : undefined;
        const timeoutMs = typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined;
        if (!ipAddress) return c.json({ success: false, message: 'ipAddress gerekli' }, 400);
        const { rongtaTcpFetchSales } = await import('./rongtaTcpNode');
        const result = await rongtaTcpFetchSales(ipAddress, port, { maxRecords, timeoutMs });
        return c.json(result);
    } catch (error: any) {
        console.error('[Rongta fetch-sales]', error);
        return c.json({
            success: false,
            message: error?.message || 'fetch-sales failed',
            count: 0,
            records: [],
        }, 500);
    }
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

/**
 * Tam veritabanı yedeği — köprü iç PostgreSQL (PostgREST ile aynı örnek).
 * Body: { database: "berzin_com", token? }
 */
app.post('/api/pg_dump_internal', async (c) => {
    let tmpFile: string | null = null;
    try {
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        const bodyTok = typeof body.token === 'string' ? body.token : undefined;
        if (!pgDumpTokenOk(c, bodyTok)) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const database = typeof body.database === 'string' ? body.database.trim() : '';
        const connStr = resolveInternalDumpConnStr(database);
        if (!connStr) {
            return c.json(
                {
                    error:
                        'İç pg_dump kullanılamıyor: geçersiz veritabanı adı veya PG_DUMP_INTERNAL_URI tanımlı değil. ' +
                        'Docker’da köprüye örn. PG_DUMP_INTERNAL_URI=postgres://postgres:PAROLA@postgres:5432 verin (PostgREST PGRST_DB_URI ile aynı host/port).',
                },
                400
            );
        }

        tmpFile = await runPgDumpToTempFile(connStr);
        return streamTmpSqlFileAsDownload(tmpFile);
    } catch (error: unknown) {
        if (tmpFile) {
            try {
                fs.unlinkSync(tmpFile);
            } catch {
                /* yok */
            }
        }
        const err = error as { message?: string };
        console.error('[PG Bridge pg_dump_internal]', error);
        return c.json({ error: err?.message || 'pg_dump_internal başarısız' }, 500);
    }
});

/**
 * Tam veritabanı yedeği (pg_dump düz SQL). Sunucuda `pg_dump` gerekir.
 * Güvenlik: `PG_DUMP_TOKEN` tanımlıysa Authorization: Bearer, ?token= veya body.token zorunlu.
 */
app.post('/api/pg_dump', async (c) => {
    let tmpFile: string | null = null;
    try {
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        const bodyTok = typeof body.token === 'string' ? body.token : undefined;
        if (!pgDumpTokenOk(c, bodyTok)) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const connStr = typeof body.connStr === 'string' ? body.connStr.trim() : '';
        if (!connStr || !connStr.toLowerCase().startsWith('postgresql://')) {
            return c.json({ error: 'postgresql:// ile başlayan connStr gerekli' }, 400);
        }

        tmpFile = await runPgDumpToTempFile(connStr);
        return streamTmpSqlFileAsDownload(tmpFile);
    } catch (error: unknown) {
        if (tmpFile) {
            try {
                fs.unlinkSync(tmpFile);
            } catch {
                /* yok */
            }
        }
        const err = error as { message?: string };
        console.error('[PG Bridge pg_dump]', error);
        return c.json({ error: err?.message || 'pg_dump başarısız' }, 500);
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


