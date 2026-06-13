/**
 * Logo Tiger Objects REST API v1
 * Dokümantasyon: {baseUrl}/services/help?expandLevel=full&api_key=...
 *
 * Oturum akışı:
 * 1) POST /token  (firmno + kullanıcı; Basic client_id:client_secret)
 * 2) GET  /methods/CompanyLogin/{firmNr}/{periodNr}  — RetailEX ERP_SETTINGS'ten
 * 3) CRUD /items, /Arps, /salesInvoices, ...
 */

import { ERP_SETTINGS } from './postgres';
import { getBridgeUrl, IS_TAURI } from '../utils/env';

const STORAGE_CONFIG = 'retailex_logo_rest_config';
const STORAGE_SESSION = 'retailex_logo_rest_session';

export const LOGO_DEFAULT_BASE_URL = 'http://185.206.80.132:32001/api/v1';

/** Önemli kaynaklar — describe listesinden seçilmiş */
export const LOGO_KEY_RESOURCES = [
  'items',
  'Arps',
  'customers',
  'salesInvoices',
  'purchaseInvoices',
  'salesOrders',
  'purchaseOrders',
  'itemSlips',
  'salesDispatches',
  'purchaseDispatches',
  'GLAccounts',
  'GLSlips',
  'banks',
  'bankAccounts',
  'unitSets',
] as const;

export type LogoResourceName = (typeof LOGO_KEY_RESOURCES)[number] | string;

export interface LogoRestConfig {
  baseUrl: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  logoDb?: string;
}

export interface LogoRestSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  firmNr: number;
  periodNr: number;
  userName?: string;
  logoDb?: string;
}

export interface LogoDescribeEntry {
  path: string;
  name: string;
  description: string;
  schemaHref: string;
}

export interface LogoDataPreview {
  firmNr: number;
  periodNr: number;
  resources: Record<string, number | null>;
  fetchedAt: string;
}

export interface LogoListResult<T = unknown> {
  count: number | null;
  items: T[];
  raw: unknown;
}

function normalizeBaseUrl(url: string): string {
  let u = (url || '').trim().replace(/\/+$/, '');
  if (!u) return LOGO_DEFAULT_BASE_URL;
  u = u.replace(/\/services\/help.*$/i, '');
  if (!u.endsWith('/api/v1')) {
    if (u.endsWith('/api')) u += '/v1';
    else if (!u.includes('/api/v1')) u += '/api/v1';
  }
  return u;
}

/** RetailEX firma no → Logo integer (001 → 1) */
export function logoFirmNrFromErp(raw?: string | null): number {
  const d = String(raw ?? ERP_SETTINGS.firmNr ?? '001').replace(/\D/g, '');
  const n = parseInt(d, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** RetailEX dönem no → Logo integer (01 → 1) */
export function logoPeriodNrFromErp(raw?: string | null): number {
  const d = String(raw ?? ERP_SETTINGS.periodNr ?? '01').replace(/\D/g, '');
  const n = parseInt(d, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function getErpFirmPeriodLabel(): { firmNr: number; periodNr: number; firmLabel: string; periodLabel: string } {
  const firmNr = logoFirmNrFromErp();
  const periodNr = logoPeriodNrFromErp();
  return {
    firmNr,
    periodNr,
    firmLabel: String(ERP_SETTINGS.firmNr ?? firmNr).padStart(3, '0'),
    periodLabel: String(ERP_SETTINGS.periodNr ?? periodNr).padStart(2, '0'),
  };
}

export function loadLogoRestConfig(): LogoRestConfig {
  const defaults: LogoRestConfig = {
    baseUrl: LOGO_DEFAULT_BASE_URL,
    username: '',
    password: '',
    clientId: 'logotigerrestservice',
    clientSecret: '',
    logoDb: '',
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<LogoRestConfig>;
    return {
      ...defaults,
      ...parsed,
      baseUrl: normalizeBaseUrl(parsed.baseUrl || defaults.baseUrl),
    };
  } catch {
    return defaults;
  }
}

export function saveLogoRestConfig(cfg: LogoRestConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    STORAGE_CONFIG,
    JSON.stringify({ ...cfg, baseUrl: normalizeBaseUrl(cfg.baseUrl) })
  );
}

export function loadLogoRestSession(): LogoRestSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw) as LogoRestSession;
    if (!s.accessToken || !s.expiresAt) return null;
    if (Date.now() >= s.expiresAt) return null;
    return s;
  } catch {
    return null;
  }
}

function saveLogoRestSession(session: LogoRestSession | null): void {
  if (typeof window === 'undefined') return;
  if (!session) {
    sessionStorage.removeItem(STORAGE_SESSION);
    return;
  }
  sessionStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
}

function basicAuth(clientId: string, clientSecret: string): string {
  const id = clientId.trim();
  const secret = clientSecret;
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

async function logoHttpDirect(
  baseUrl: string,
  method: string,
  path: string,
  opts: {
    headers?: Record<string, string>;
    body?: string | null;
    query?: Record<string, string>;
  } = {}
): Promise<Response> {
  const base = normalizeBaseUrl(baseUrl);
  const p = path.startsWith('/') ? path : `/${path}`;
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
    : '';
  const url = `${base}${p}${qs}`;
  return fetch(url, {
    method,
    headers: opts.headers,
    body: opts.body ?? undefined,
  });
}

async function logoHttpViaBridge(
  baseUrl: string,
  method: string,
  path: string,
  opts: {
    headers?: Record<string, string>;
    body?: string | null;
    query?: Record<string, string>;
  } = {}
): Promise<Response> {
  const bridge = getBridgeUrl();
  const res = await fetch(`${bridge}/api/logo/proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: normalizeBaseUrl(baseUrl),
      method,
      path: path.startsWith('/') ? path : `/${path}`,
      headers: opts.headers || {},
      body: opts.body,
      query: opts.query || {},
    }),
  });
  return res;
}

async function logoHttp(
  baseUrl: string,
  method: string,
  path: string,
  opts: {
    headers?: Record<string, string>;
    body?: string | null;
    query?: Record<string, string>;
  } = {}
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const useBridge = !IS_TAURI && typeof window !== 'undefined';
  const res = useBridge
    ? await logoHttpViaBridge(baseUrl, method, path, opts)
    : await logoHttpDirect(baseUrl, method, path, opts);

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (useBridge && res.ok && data && typeof data === 'object' && data !== null && 'proxy' in data) {
    const wrapped = data as { proxy: { ok: boolean; status: number; data: unknown; text: string } };
    return wrapped.proxy;
  }

  return { ok: res.ok, status: res.status, data, text };
}

function extractCount(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.count === 'number') return o.count;
  if (typeof o.Count === 'number') return o.Count;
  const meta = o.Meta ?? o.meta;
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    if (typeof m.Count === 'number') return m.Count;
    if (typeof m.count === 'number') return m.count;
  }
  if (Array.isArray(o.items)) return o.items.length;
  if (Array.isArray(o.Items)) return o.Items.length;
  if (Array.isArray(data)) return data.length;
  return null;
}

function extractItems<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.items)) return o.items as T[];
    if (Array.isArray(o.Items)) return o.Items as T[];
    if (Array.isArray(o.data)) return o.data as T[];
  }
  return [];
}

export async function logoAuthenticate(
  cfg: LogoRestConfig,
  firmNr?: number,
  periodNr?: number
): Promise<LogoRestSession> {
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  const fNr = firmNr ?? logoFirmNrFromErp();
  const pNr = periodNr ?? logoPeriodNrFromErp();

  if (!cfg.username?.trim() || !cfg.password) {
    throw new Error('Logo kullanıcı adı ve şifre gerekli');
  }
  if (!cfg.clientId?.trim()) {
    throw new Error('Logo client_id gerekli (Logo REST uygulama kaydı)');
  }

  const tokenBody = new URLSearchParams({
    grant_type: 'password',
    username: cfg.username.trim(),
    password: cfg.password,
    firmno: String(fNr),
  });
  if (cfg.logoDb?.trim()) tokenBody.set('logodb', cfg.logoDb.trim());

  const tokenRes = await logoHttp(baseUrl, 'POST', '/token', {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth(cfg.clientId, cfg.clientSecret || ''),
    },
    body: tokenBody.toString(),
  });

  if (!tokenRes.ok) {
    const err = tokenRes.data as { error_description?: string; error?: string; message?: string };
    throw new Error(
      err?.error_description || err?.error || err?.message || `Token hatası HTTP ${tokenRes.status}`
    );
  }

  const tok = tokenRes.data as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    userName?: string;
    logoDB?: string;
  };
  if (!tok?.access_token) throw new Error('Logo access_token alınamadı');

  const expiresIn = typeof tok.expires_in === 'number' ? tok.expires_in : 3600;
  const session: LogoRestSession = {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000 - 30_000,
    firmNr: fNr,
    periodNr: pNr,
    userName: tok.userName,
    logoDb: tok.logoDB || cfg.logoDb,
  };

  const loginRes = await logoHttp(baseUrl, 'GET', `/methods/CompanyLogin/${fNr}/${pNr}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (!loginRes.ok) {
    throw new Error(
      `Firma/dönem seçimi başarısız (${fNr}/${pNr}): HTTP ${loginRes.status} — ${loginRes.text?.slice(0, 200)}`
    );
  }

  const loginOk = loginRes.data === true || (loginRes.data as { value?: boolean })?.value === true;
  if (loginRes.data !== true && !loginOk && loginRes.status !== 200) {
    throw new Error(`CompanyLogin(${fNr}/${pNr}) başarısız`);
  }

  saveLogoRestSession(session);
  return session;
}

export async function logoEnsureSession(cfg: LogoRestConfig): Promise<LogoRestSession> {
  const existing = loadLogoRestSession();
  const fNr = logoFirmNrFromErp();
  const pNr = logoPeriodNrFromErp();
  if (existing && existing.firmNr === fNr && existing.periodNr === pNr) return existing;
  return logoAuthenticate(cfg, fNr, pNr);
}

export async function logoRevokeSession(cfg: LogoRestConfig): Promise<void> {
  const session = loadLogoRestSession();
  if (session?.accessToken) {
    await logoHttp(normalizeBaseUrl(cfg.baseUrl), 'GET', '/revoke', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }).catch(() => {});
  }
  saveLogoRestSession(null);
}

export async function logoTestConnection(cfg: LogoRestConfig): Promise<{
  ok: boolean;
  session?: LogoRestSession;
  currentFirm?: number;
  currentPeriod?: number;
  error?: string;
}> {
  try {
    const session = await logoAuthenticate(cfg);
    const baseUrl = normalizeBaseUrl(cfg.baseUrl);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const firmRes = await logoHttp(baseUrl, 'GET', '/methods/CurrentFirm', { headers: auth });
    const periodRes = await logoHttp(baseUrl, 'GET', '/methods/CurrentPeriod', { headers: auth });

    return {
      ok: true,
      session,
      currentFirm: typeof firmRes.data === 'number' ? firmRes.data : undefined,
      currentPeriod: typeof periodRes.data === 'number' ? periodRes.data : undefined,
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function logoDescribeServices(cfg: LogoRestConfig): Promise<LogoDescribeEntry[]> {
  const session = await logoEnsureSession(cfg);
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  const res = await logoHttp(baseUrl, 'GET', '/services/describe', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    query: { api_key: cfg.clientId || 'logotigerrestservice' },
  });
  if (!res.ok) throw new Error(`describe hatası: HTTP ${res.status}`);
  const data = res.data as { apis?: Array<{ path?: string; description?: string; schema?: { href?: string } }> };
  return (data.apis || []).map((a) => {
    const path = String(a.path || '');
    const name = path.replace(/^\/api\/v1\//, '').replace(/^\//, '');
    return {
      path,
      name,
      description: String(a.description || ''),
      schemaHref: String(a.schema?.href || `/services/${name}?expandLevel=full`),
    };
  });
}

export async function logoListResource<T = unknown>(
  cfg: LogoRestConfig,
  resource: LogoResourceName,
  opts: { limit?: number; offset?: number; q?: string; withCount?: boolean; expandLevel?: string } = {}
): Promise<LogoListResult<T>> {
  const session = await logoEnsureSession(cfg);
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  const query: Record<string, string> = {};
  if (opts.limit != null) query.limit = String(opts.limit);
  if (opts.offset != null) query.offset = String(opts.offset);
  if (opts.q) query.q = opts.q;
  if (opts.withCount) query.withCount = 'true';
  if (opts.expandLevel) query.expandLevel = opts.expandLevel;

  const res = await logoHttp(baseUrl, 'GET', `/${resource}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    query,
  });
  if (!res.ok) {
    const err = res.data as { message?: string; error?: string };
    throw new Error(err?.message || err?.error || `${resource} listesi HTTP ${res.status}`);
  }
  return {
    count: extractCount(res.data),
    items: extractItems<T>(res.data),
    raw: res.data,
  };
}

export async function logoGetResource<T = unknown>(
  cfg: LogoRestConfig,
  resource: LogoResourceName,
  id: string | number,
  opts: { expandLevel?: string } = {}
): Promise<T> {
  const session = await logoEnsureSession(cfg);
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  const query: Record<string, string> = {};
  if (opts.expandLevel) query.expandLevel = opts.expandLevel;

  const res = await logoHttp(baseUrl, 'GET', `/${resource}/${id}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    query,
  });
  if (!res.ok) throw new Error(`${resource}/${id} HTTP ${res.status}`);
  return res.data as T;
}

export async function logoCreateResource<T = unknown>(
  cfg: LogoRestConfig,
  resource: LogoResourceName,
  restRecord: Record<string, unknown>
): Promise<T> {
  const session = await logoEnsureSession(cfg);
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  const res = await logoHttp(baseUrl, 'POST', `/${resource}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ restRecord }),
  });
  if (!res.ok) {
    const err = res.data as { message?: string; error?: string };
    throw new Error(err?.message || err?.error || `${resource} oluşturma HTTP ${res.status}`);
  }
  return res.data as T;
}

export async function logoUpdateResource<T = unknown>(
  cfg: LogoRestConfig,
  resource: LogoResourceName,
  id: string | number,
  restRecord: Record<string, unknown>,
  method: 'PUT' | 'PATCH' = 'PUT'
): Promise<T> {
  const session = await logoEnsureSession(cfg);
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  const res = await logoHttp(baseUrl, method, `/${resource}/${id}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ restRecord }),
  });
  if (!res.ok) {
    const err = res.data as { message?: string; error?: string };
    throw new Error(err?.message || err?.error || `${resource}/${id} güncelleme HTTP ${res.status}`);
  }
  return res.data as T;
}

export async function logoDeleteResource(
  cfg: LogoRestConfig,
  resource: LogoResourceName,
  id: string | number
): Promise<void> {
  const session = await logoEnsureSession(cfg);
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  const res = await logoHttp(baseUrl, 'DELETE', `/${resource}/${id}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) throw new Error(`${resource}/${id} silme HTTP ${res.status}`);
}

export async function logoFetchAllPaginated<T = unknown>(
  cfg: LogoRestConfig,
  resource: LogoResourceName,
  opts: { pageSize?: number; maxPages?: number; q?: string } = {}
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 25;
  const maxPages = opts.maxPages ?? 200;
  const all: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const batch = await logoListResource<T>(cfg, resource, {
      limit: pageSize,
      offset: page * pageSize,
      q: opts.q,
    });
    all.push(...batch.items);
    if (batch.items.length < pageSize) break;
  }
  return all;
}

export async function logoGetDataPreview(cfg: LogoRestConfig): Promise<LogoDataPreview> {
  const { firmNr, periodNr } = getErpFirmPeriodLabel();
  const resources: Record<string, number | null> = {};
  const targets = ['items', 'Arps', 'salesInvoices', 'purchaseInvoices', 'salesOrders', 'purchaseOrders'];

  for (const name of targets) {
    try {
      const r = await logoListResource(cfg, name, { limit: 1, withCount: true });
      resources[name] = r.count;
    } catch {
      resources[name] = null;
    }
  }

  return {
    firmNr,
    periodNr,
    resources,
    fetchedAt: new Date().toISOString(),
  };
}

export async function logoHealthCheck(cfg: LogoRestConfig): Promise<boolean> {
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  const res = await logoHttp(baseUrl, 'GET', '/sys/healthcheck', {});
  return res.ok || res.status === 204;
}
