/**
 * PostgreSQL Bridge for Web Environment
 * This server component allows browser clients to execute SQL queries.
 * 
 * SECURITY NOTE: Direct SQL execution from frontend should only be used in 
 * development or secure private networks.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { normalizeFoodDeliveryChannel } from '../config/foodDeliveryChannels';
import { initProviderPayment } from '../../eticaret/core/payments/registry';
import type { PaymentInitRequest, PaymentProviderConfig } from '../../eticaret/core/payments/types';
import {
  resolveEticaretConnStr,
  resolveEticaretConnStrAsync,
  resolveTenantDatabaseName,
  loadEticaretSettingsFromPg,
  saveEticaretSettingsToPg,
  fetchFirmNrFromPg,
  fetchTenantFirmsFromPg,
  resolveCatalogFirmNr,
  fetchRetailTenantsFromMerkezPg,
  firmNrCandidates,
  getEticaretPool,
} from '../../eticaret/core/server/tenantDbResolve';

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

import { getSharedPgPool, normalizePgPoolKey } from '../utils/pgPoolShared';

function getPool(connStr: string): Pool {
    const key = normalizePgPoolKey(connStr);
    if (!poolsLogged.has(key)) {
        poolsLogged.add(key);
        console.log(`[PG Bridge] Pool: ${key.replace(/:[^:@]+@/, ':***@')}`);
    }
    return getSharedPgPool(connStr);
}

const poolsLogged = new Set<string>();

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

/** PLU temizleme — operate=D (açık TCP; SDK clearPludata değil). */
app.post('/api/scale/rongta/clear-plu', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const ipAddress = typeof body.ipAddress === 'string' ? body.ipAddress.trim() : '';
        const port = typeof body.port === 'number' ? body.port : undefined;
        const records = Array.isArray(body.records) ? body.records : [];
        if (!ipAddress) return c.json({ success: false, message: 'ipAddress gerekli' }, 400);
        if (!records.length) return c.json({ success: false, message: 'records boş' }, 400);
        const { rongtaTcpClearPlu } = await import('./rongtaTcpNode');
        const result = await rongtaTcpClearPlu(ipAddress, port, records as any);
        return c.json(result);
    } catch (error: any) {
        console.error('[Rongta clear-plu]', error);
        return c.json({
            success: false,
            message: error?.message || 'clear-plu failed',
            sentCount: 0,
            failedCount: 0,
        }, 500);
    }
});

/** LAN subnet TCP tarama (mobil Expo Go yedek — PC köprüsünden). */
app.post('/api/scale/rongta/lan-scan', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const deviceIp = typeof body.deviceIp === 'string' ? body.deviceIp.trim() : null;
        const hintHost = typeof body.hintHost === 'string' ? body.hintHost.trim() : undefined;
        const timeoutMs = typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined;
        const ports = Array.isArray(body.ports)
            ? body.ports.filter((p): p is number => typeof p === 'number')
            : undefined;
        const { rongtaTcpLanScan } = await import('./rongtaTcpNode');
        const result = await rongtaTcpLanScan({ deviceIp, hintHost, ports, timeoutMs });
        return c.json(result);
    } catch (error: any) {
        console.error('[Rongta lan-scan]', error);
        return c.json({
            success: false,
            message: error?.message || 'lan-scan failed',
            hits: [],
        }, 500);
    }
});

/**
 * Hotkey — açık TCP ASCII’de komut yok; Windows DLL / Android lib_plu gerekir.
 * Tablo istemci tarafından hazırlanır; burada dürüst yanıt.
 */
app.post('/api/scale/rongta/send-hotkeys', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const tables = Array.isArray(body.tables) ? body.tables : [];
        return c.json({
            success: false,
            message:
                'Hotkey gönderimi Windows TeraziRongta (rtscaleDownLoadHotkey) veya Android lib_plu.writeHotkey ister. ' +
                `Açık TCP protokolünde hotkey komutu yok. Tablo paketleri hazır: ${tables.length}.`,
            tables,
        });
    } catch (error: any) {
        return c.json({ success: false, message: error?.message || 'send-hotkeys failed' }, 500);
    }
});

/** Etiket .scr / SYSTEM.CFG — Windows DLL rtscaleDownLoadData. */
app.post('/api/scale/rongta/send-label-template', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const slot = typeof body.slot === 'string' ? body.slot : 'D0';
        return c.json({
            success: false,
            message:
                `Etiket .scr / SYSTEM.CFG / RLS gönderimi Windows TeraziRongta DLL gerektirir (slot ${slot}). ` +
                'Mobilde LabelId PLU senkronuna yazılır; dosya indirme masaüstünden yapılır.',
        });
    } catch (error: any) {
        return c.json({ success: false, message: error?.message || 'send-label failed' }, 500);
    }
});

/** Ağ termal — ham ESC/POS TCP (varsayılan 9100). Mobil pg_bridge köprüsü + DeskApp ile aynı mantık. */
app.post('/api/printer/escpos-tcp', async (c) => {
    try {
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const hostRaw =
            (typeof body.host === 'string' ? body.host : '') ||
            (typeof body.ipAddress === 'string' ? body.ipAddress : '');
        const host = hostRaw.trim();
        const port = typeof body.port === 'number' ? body.port : undefined;
        const dataB64 = typeof body.dataB64 === 'string' ? body.dataB64.trim() : '';
        if (!host) return c.json({ ok: false, message: 'host / ipAddress gerekli' }, 400);
        if (!dataB64) return c.json({ ok: false, message: 'dataB64 gerekli' }, 400);
        const binary = Buffer.from(dataB64, 'base64');
        if (binary.length === 0) return c.json({ ok: false, message: 'ESC/POS verisi boş' }, 400);
        const { escposTcpSend } = await import('./escposTcpNode');
        const result = await escposTcpSend(host, port, binary);
        return c.json(result, result.ok ? 200 : 502);
    } catch (error: any) {
        console.error('[ESC/POS TCP]', error);
        return c.json({ ok: false, message: error?.message || 'escpos-tcp failed' }, 500);
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

async function loadRegistryEticaretSettings(tenantCode: string): Promise<Record<string, unknown>> {
  const { merkezPgUri } = await import('../../eticaret/core/server/tenantDbResolve');
  const merkez = merkezPgUri();
  if (!merkez || !tenantCode.trim()) return {};
  try {
    const pool = getEticaretPool(merkez);
    const row = await pool.query(
      `SELECT eticaret_settings FROM public.tenant_registry WHERE code = $1 LIMIT 1`,
      [tenantCode.trim().toLowerCase()],
    );
    const s = row.rows[0]?.eticaret_settings;
    return s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mergeSettingsLayers(
  ...layers: Array<Record<string, unknown>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const layer of layers) {
    Object.assign(out, layer);
  }
  return out;
}

function buildStorefrontPayload(settings: Record<string, unknown>, tenant: string) {
  const list = Array.isArray(settings.paymentProviders) ? settings.paymentProviders : [];
  const providers = (list as Array<{ id?: string; enabled?: boolean; label?: string }>)
    .filter((p) => p.enabled)
    .map((p) => ({ id: String(p.id), label: String(p.label || p.id) }));
  const demoMode = Boolean(settings.demoMode);
  const catalogTenantCode =
    demoMode && settings.demoTenantCode
      ? String(settings.demoTenantCode).trim().toLowerCase()
      : tenant;
  return {
    ...settings,
    enabled: settings.enabled !== false,
    demoMode,
    storeTitle: String(settings.storeTitle || ''),
    announcementText: String(settings.announcementText || ''),
    activeThemeId: String(settings.activeThemeId || 'ella'),
    activeVariantId: String(settings.activeVariantId || 'ella-classic'),
    defaultPaymentProvider: settings.defaultPaymentProvider || null,
    providers,
    catalogTenantCode,
    banners: Array.isArray(settings.banners) ? settings.banners : [],
    sliders: Array.isArray(settings.sliders) ? settings.sliders : [],
    campaigns: Array.isArray(settings.campaigns) ? settings.campaigns : [],
    featuredProducts: Array.isArray(settings.featuredProducts) ? settings.featuredProducts : [],
    menuItems: Array.isArray(settings.menuItems) ? settings.menuItems : [],
    footerLinks: Array.isArray(settings.footerLinks) ? settings.footerLinks : [],
    staticPages: Array.isArray(settings.staticPages) ? settings.staticPages : [],
    logoUrl: settings.logoUrl ? String(settings.logoUrl) : '',
    seoTitle: settings.seoTitle ? String(settings.seoTitle) : '',
    productSectionTitle: settings.productSectionTitle ? String(settings.productSectionTitle) : 'Ürünler',
    footerCopyright: settings.footerCopyright ? String(settings.footerCopyright) : '',
    storefrontFeatures:
      settings.storefrontFeatures && typeof settings.storefrontFeatures === 'object'
        ? settings.storefrontFeatures
        : {},
    freeShippingThreshold: Number(settings.freeShippingThreshold) || 500,
    searchSuggestions: Array.isArray(settings.searchSuggestions) ? settings.searchSuggestions : [],
    lookbookScenes: Array.isArray(settings.lookbookScenes) ? settings.lookbookScenes : [],
    askExpertEmail: settings.askExpertEmail ? String(settings.askExpertEmail) : '',
    gdprCookieText: settings.gdprCookieText ? String(settings.gdprCookieText) : '',
    catalogFirmNr: settings.catalogFirmNr ? String(settings.catalogFirmNr).trim() : '',
    seoDescription: settings.seoDescription ? String(settings.seoDescription) : '',
    faviconUrl: settings.faviconUrl ? String(settings.faviconUrl) : '',
    socialLinks: Array.isArray(settings.socialLinks) ? settings.socialLinks : [],
    contactInfo: settings.contactInfo && typeof settings.contactInfo === 'object' ? settings.contactInfo : {},
    newsletter: settings.newsletter && typeof settings.newsletter === 'object' ? settings.newsletter : {},
    beforeYouLeave:
      settings.beforeYouLeave && typeof settings.beforeYouLeave === 'object' ? settings.beforeYouLeave : {},
    recentSales: settings.recentSales && typeof settings.recentSales === 'object' ? settings.recentSales : {},
    themeBranding:
      settings.themeBranding && typeof settings.themeBranding === 'object' ? settings.themeBranding : {},
    layout: settings.layout && typeof settings.layout === 'object' ? settings.layout : {},
    homepageSections: Array.isArray(settings.homepageSections) ? settings.homepageSections : [],
  };
}

function mapProductRow(row: Record<string, unknown>, currency: string) {
  const id = String(row.id ?? row.code ?? '').trim();
  const name = String(row.name ?? '').trim();
  if (!id || !name) return null;
  if (row.is_active === false) return null;
  const price = Number(row.price || 0) || 0;
  return {
    id,
    code: String(row.code || row.barcode || id),
    name,
    price,
    currency: String(row.currency || currency || 'TRY'),
    imageUrl: String(row.image_url_cdn || row.image_url || '').trim() || null,
    vendor: String(row.brand || 'RetailEX').trim(),
    inStock: Number(row.stock ?? 0) > 0,
  };
}

async function queryTenantProducts(
  connStr: string,
  options: { limit?: number; search?: string; code?: string; catalogFirmNr?: string },
): Promise<{ products: Record<string, unknown>[]; currency: string; firmNr: string }> {
  const pool = getEticaretPool(connStr);
  const firm = options.catalogFirmNr?.trim()
    ? options.catalogFirmNr.trim().padStart(3, '0').slice(0, 10)
    : await resolveCatalogFirmNr(connStr);
  const currencyRow = await pool.query(
    `SELECT default_currency FROM public.system_settings WHERE id = 1 LIMIT 1`,
  );
  const currency = String(currencyRow.rows[0]?.default_currency || 'TRY');
  const limit = Math.min(100, Math.max(1, options.limit ?? 24));
  const firms = options.catalogFirmNr?.trim() ? [firm] : firmNrCandidates(firm);

  for (const f of firms) {
    const table = `rex_${f}_products`;
    const params: unknown[] = [];
    let sql = `SELECT id, code, barcode, name, price, image_url, image_url_cdn, brand, currency, stock, is_active
               FROM public.${table.replace(/[^a-z0-9_]/gi, '')}
               WHERE is_active = true`;
    if (options.code) {
      params.push(options.code);
      sql += ` AND (code = $${params.length} OR barcode = $${params.length})`;
    } else if (options.search?.trim()) {
      const term = `%${options.search.trim()}%`;
      params.push(term, term, term);
      sql += ` AND (name ILIKE $${params.length - 2} OR code ILIKE $${params.length - 1} OR barcode ILIKE $${params.length})`;
    }
    params.push(limit);
    sql += ` ORDER BY code ASC LIMIT $${params.length}`;
    try {
      const result = await pool.query(sql, params);
      const products = result.rows
        .map((r) => mapProductRow(r as Record<string, unknown>, currency))
        .filter(Boolean) as Record<string, unknown>[];
      if (products.length || options.code) return { products, currency, firmNr: firm };
    } catch {
      /* tablo yoksa sonraki firmayı dene */
    }
  }
  return { products: [], currency, firmNr: firm };
}

app.put('/api/eticaret/settings', async (c) => {
  try {
    const body = (await c.req.json()) as { tenant_code?: string; settings?: Record<string, unknown> };
    const tenant = String(body.tenant_code || '').trim().toLowerCase();
    const settings = body.settings;
    if (!tenant || !settings || typeof settings !== 'object') {
      return c.json({ error: 'tenant_code ve settings gerekli' }, 400);
    }
    const connStr = await resolveEticaretConnStrAsync(tenant);
    if (!connStr) return c.json({ error: 'Kiracı veritabanı çözülemedi' }, 400);
    await saveEticaretSettingsToPg(connStr, settings);
    return c.json({ ok: true });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return c.json({ ok: false, error: err?.message || 'settings save failed' }, 500);
  }
});

app.get('/api/eticaret/firms', async (c) => {
  try {
    const tenant = c.req.query('tenant')?.trim().toLowerCase() || '';
    if (!tenant) return c.json({ firms: [], primaryFirmNr: '001' });
    const connStr = await resolveEticaretConnStrAsync(tenant, c.req.query('database') || undefined);
    if (!connStr) return c.json({ firms: [], primaryFirmNr: '001' });
    const [firms, primaryFirmNr] = await Promise.all([
      fetchTenantFirmsFromPg(connStr),
      fetchFirmNrFromPg(connStr),
    ]);
    return c.json({ firms, primaryFirmNr });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return c.json({ firms: [], primaryFirmNr: '001', error: err?.message }, 500);
  }
});

app.get('/api/eticaret/tenants', async (c) => {
  try {
    const rows = await fetchRetailTenantsFromMerkezPg();
    return c.json({ tenants: rows });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return c.json({ tenants: [], error: err?.message }, 500);
  }
});

app.get('/api/eticaret/catalog', async (c) => {
  try {
    const tenant = c.req.query('tenant')?.trim().toLowerCase() || '';
    const limit = Number(c.req.query('limit') || 24);
    const search = c.req.query('search') || '';
    const connStr = await resolveEticaretConnStrAsync(tenant, c.req.query('database') || undefined);
    if (!connStr) return c.json({ products: [], currency: 'TRY', demo: true });

    const settings = await loadEticaretSettingsFromPg(connStr);
    const registry = await loadRegistryEticaretSettings(tenant);
    const merged = mergeSettingsLayers(registry, settings);
    const demoMode = Boolean(merged.demoMode);
    const catalogTenant = tenant;
    const catalogFirmNr =
      c.req.query('catalog_firm_nr')?.trim() ||
      (merged.catalogFirmNr ? String(merged.catalogFirmNr).trim() : undefined);

    const { products, currency } = await queryTenantProducts(connStr, { limit, search, catalogFirmNr });
    if (!products.length && demoMode) {
      const label = catalogTenant.toUpperCase();
      const demoProducts = Array.from({ length: 8 }, (_, i) => ({
        id: `demo-${i}`,
        code: `${label}-${String(i + 1).padStart(3, '0')}`,
        name: `${label} Ürün ${i + 1}`,
        price: 199 + i * 50,
        currency,
        inStock: true,
      }));
      return c.json({ products: demoProducts, currency, demo: true });
    }
    return c.json({ products, currency, demo: demoMode });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return c.json({ products: [], currency: 'TRY', demo: false, error: err?.message }, 500);
  }
});

app.get('/api/eticaret/product', async (c) => {
  try {
    const tenant = c.req.query('tenant')?.trim().toLowerCase() || '';
    const code = c.req.query('code')?.trim() || '';
    if (!tenant || !code) return c.json({ product: null });
    const connStr = await resolveEticaretConnStrAsync(tenant);
    if (!connStr) return c.json({ product: null });
    const settings = await loadEticaretSettingsFromPg(connStr);
    const registry = await loadRegistryEticaretSettings(tenant);
    const merged = mergeSettingsLayers(registry, settings);
    const catalogFirmNr = merged.catalogFirmNr ? String(merged.catalogFirmNr).trim() : undefined;
    const { products, currency } = await queryTenantProducts(connStr, { limit: 1, code, catalogFirmNr });
    const product = products[0] ? { ...products[0], currency } : null;
    return c.json({ product });
  } catch {
    return c.json({ product: null });
  }
});

app.get('/api/eticaret/orders', async (c) => {
  try {
    const tenant = c.req.query('tenant')?.trim().toLowerCase() || '';
    const connStr = await resolveEticaretConnStrAsync(tenant);
    if (!connStr) return c.json({ orders: [] });
    const pool = getEticaretPool(connStr);
    const sql = tenant
      ? `SELECT * FROM public.eticaret_web_orders WHERE tenant_code = $1 ORDER BY created_at DESC LIMIT 200`
      : `SELECT * FROM public.eticaret_web_orders ORDER BY created_at DESC LIMIT 200`;
    const result = await pool.query(sql, tenant ? [tenant] : []);
    return c.json({ orders: result.rows });
  } catch {
    return c.json({ orders: [] });
  }
});

app.post('/api/eticaret/inquiry', async (c) => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    const tenant = String(body.tenant_code || '').trim().toLowerCase();
    if (!tenant) return c.json({ error: 'tenant_code gerekli' }, 400);
    const connStr = await resolveEticaretConnStrAsync(tenant);
    if (!connStr) return c.json({ error: 'Kiracı veritabanı çözülemedi' }, 400);
    const pool = getEticaretPool(connStr);
    const orderNo = `INQ-${Date.now().toString(36).toUpperCase()}`;
    const message = String(body.message || body.question || '').trim();
    await pool.query(
      `INSERT INTO public.eticaret_web_orders (
        tenant_code, order_no, status, demo_mode, customer_name, customer_email, customer_phone,
        payment_provider, payment_status, currency, subtotal, total, items, notes
      ) VALUES ($1, $2, 'inquiry', false, $3, $4, $5, 'inquiry', 'pending', 'TRY', 0, 0, '[]'::jsonb, $6)`,
      [
        tenant,
        orderNo,
        String(body.name || body.customer_name || ''),
        String(body.email || body.customer_email || ''),
        String(body.phone || body.customer_phone || ''),
        message,
      ],
    );
    return c.json({ ok: true, order_no: orderNo });
  } catch (error: unknown) {
    const err = error as { message?: string };
    return c.json({ ok: false, error: err?.message || 'inquiry failed' }, 500);
  }
});

app.post('/api/eticaret/submit-order', async (c) => {
    try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const tenant = String(body.tenant_code || '').trim().toLowerCase();
        const connStr =
            resolveEticaretConnStr(body) ||
            (tenant ? await resolveEticaretConnStrAsync(tenant) : null);
        if (!connStr) {
            return c.json({ error: 'Veritabanı bağlantısı çözülemedi (connStr veya PG_DUMP_INTERNAL_URI + tenant)' }, 400);
        }
        const dbSettings = await loadEticaretSettingsFromPg(connStr);
        const registry = tenant ? await loadRegistryEticaretSettings(tenant) : {};
        const merged = mergeSettingsLayers(registry, dbSettings);
        const catalogFirmNr = await resolveCatalogFirmNr(connStr, {
          catalogFirmNr: merged.catalogFirmNr
            ? String(merged.catalogFirmNr)
            : body.firm_nr
              ? String(body.firm_nr)
              : undefined,
        });
        const payload = {
            tenant_code: body.tenant_code,
            demo_mode: body.demo_mode,
            firm_nr: catalogFirmNr,
            customer_name: body.customer_name,
            customer_email: body.customer_email,
            customer_phone: body.customer_phone,
            shipping_address: body.shipping_address,
            payment_provider: body.payment_provider,
            payment_status: body.payment_status,
            currency: body.currency,
            subtotal: body.subtotal,
            total: body.total,
            items: body.items,
            notes: body.notes,
        };
        const pool = getEticaretPool(connStr);
        const result = await pool.query(`SELECT public.eticaret_submit_web_order($1::jsonb) AS data`, [
            JSON.stringify(payload),
        ]);
        const data = result.rows[0]?.data ?? { ok: false };
        return c.json(data);
    } catch (error: unknown) {
        const err = error as { message?: string };
        console.error('[eticaret/submit-order]', error);
        return c.json({ ok: false, error: err?.message || 'submit-order failed' }, 500);
    }
});

app.post('/api/eticaret/payment/init', async (c) => {
    try {
        const body = (await c.req.json()) as Record<string, unknown>;
        const provider = String(body.provider || '');
        const tenant = String(body.tenantCode || body.tenant_code || '').trim().toLowerCase();
        const connStr =
            resolveEticaretConnStr(body) ||
            (tenant ? await resolveEticaretConnStrAsync(tenant) : null);
        let providerCfg: PaymentProviderConfig = {
            id: 'other',
            enabled: true,
            label: provider,
            mode: 'test',
        };
        if (connStr) {
            const pool = getEticaretPool(connStr);
            const row = await pool.query(
                `SELECT eticaret_settings FROM public.system_settings WHERE id = 1 LIMIT 1`
            );
            const settings = row.rows[0]?.eticaret_settings || {};
            const list = Array.isArray(settings.paymentProviders) ? settings.paymentProviders : [];
            const found = (list as PaymentProviderConfig[]).find((p) => String(p.id) === provider);
            if (found) providerCfg = { ...providerCfg, ...found };
        }
        const orderNo = String(body.orderNo || '');
        const orderId = String(body.orderId || '');
        const amount = Number(body.amount || 0);
        const currency = String(body.currency || 'TRY');
        const req: PaymentInitRequest = {
            tenantCode: String(body.tenantCode || body.tenant_code || ''),
            orderId,
            orderNo,
            amount,
            currency,
            provider: provider as PaymentInitRequest['provider'],
            customerEmail: body.customerEmail ? String(body.customerEmail) : undefined,
            customerName: body.customerName ? String(body.customerName) : undefined,
            returnUrl: String(body.returnUrl || ''),
            cancelUrl: body.cancelUrl ? String(body.cancelUrl) : undefined,
        };
        const result = await initProviderPayment(req, providerCfg);
        if (!result.ok) {
            return c.json({ ...result, error: result.message || 'Ödeme sağlayıcı yapılandırması eksik' }, 400);
        }
        return c.json({ ...result, amount, currency, orderNo, orderId });
    } catch (error: unknown) {
        const err = error as { message?: string };
        return c.json({ ok: false, error: err?.message || 'payment init failed' }, 500);
    }
});

app.get('/api/eticaret/storefront-config', async (c) => {
    try {
        const tenant = c.req.query('tenant')?.trim().toLowerCase() || '';
        const connStr = await resolveEticaretConnStrAsync(tenant, c.req.query('database') || undefined);
        const registry = tenant ? await loadRegistryEticaretSettings(tenant) : {};
        if (!connStr) {
            return c.json(buildStorefrontPayload(registry, tenant));
        }
        const dbSettings = await loadEticaretSettingsFromPg(connStr);
        const merged = mergeSettingsLayers(registry, dbSettings);
        return c.json(buildStorefrontPayload(merged, tenant));
    } catch {
        return c.json(buildStorefrontPayload({}, ''));
    }
});

app.get('/api/eticaret/payment-methods', async (c) => {
    try {
        const tenant = c.req.query('tenant')?.trim().toLowerCase() || '';
        const connStr = await resolveEticaretConnStrAsync(tenant, c.req.query('database') || undefined);
        if (!connStr) return c.json({ providers: [] });
        const settings = await loadEticaretSettingsFromPg(connStr);
        const registry = await loadRegistryEticaretSettings(tenant);
        const merged = mergeSettingsLayers(registry, settings);
        const list = Array.isArray(merged.paymentProviders) ? merged.paymentProviders : [];
        const providers = (list as Array<{ id?: string; enabled?: boolean; label?: string }>)
            .filter((p) => p.enabled)
            .map((p) => ({ id: p.id, label: p.label || p.id }));
        return c.json({ providers, demoMode: Boolean(merged.demoMode) });
    } catch {
        return c.json({ providers: [] });
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

const hostname = (process.env.BRIDGE_BIND || '0.0.0.0').trim() || '0.0.0.0';

function detectedLanIps(): string[] {
    const ips: string[] = [];
    const nets = os.networkInterfaces();
    for (const entries of Object.values(nets)) {
        for (const entry of entries || []) {
            const family = typeof entry.family === 'string' ? entry.family : String(entry.family);
            if (family !== 'IPv4' || entry.internal) continue;
            ips.push(entry.address);
        }
    }
    return Array.from(new Set(ips)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

const server = serve(
    {
        fetch: app.fetch,
        port,
        hostname,
    },
    () => {
        const lanIps = detectedLanIps();
        console.log(`🚀 SQL Bridge started on http://${hostname}:${port}`);
        console.log(`[PG Bridge] Bind: ${hostname}:${port}`);
        if (lanIps.length) {
            console.log(`[PG Bridge] LAN URL adayları: ${lanIps.map((ip) => `http://${ip}:${port}`).join(', ')}`);
        } else {
            console.log('[PG Bridge] LAN IPv4 adresi bulunamadı; ipconfig/ifconfig ile PC LAN IP adresini kontrol edin.');
        }
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


