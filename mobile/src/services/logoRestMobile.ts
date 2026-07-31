/**
 * Logo Tiger Objects REST — mobil (AsyncStorage).
 * Web `logoRestApi` oturum sözleşmesi ile uyumlu (POST /token + CompanyLogin).
 * Köprü: configStore bridge host → `/api/erp-logo-proxy` (web ile aynı kalıp).
 * SaaS / public HTTPS: doğrudan fetch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createProduct, fetchProducts, updateProduct } from '../api/productsApi';
import { createCustomer, fetchCustomers, updateCustomer } from '../api/customersApi';
import { getBridgeBaseUrl, useConfigStore } from '../store/configStore';

const STORAGE_CONFIG = 'retailex_logo_rest_config';
const STORAGE_SESSION = 'retailex_logo_rest_session';

export const LOGO_API_URL_EXAMPLE = 'http://185.206.175.241:32001';
export const LOGO_DEFAULT_CLIENT_ID = 'ARZEN';
export const LOGO_DEFAULT_CLIENT_SECRET = 'r1k1C+lyPK6BKFkrLdA3IFXawk2fiuFdCqbrMc5zQd8=';
export const LOGO_DEFAULT_USERNAME = 'LOGO';
export const LOGO_DEFAULT_PASSWORD = '2661';

/** Logo Tiger REST — tek istekte en fazla 25 kayıt */
export const LOGO_REST_MAX_PAGE_SIZE = 25;

export const LOGO_BRIDGE_PROXY_PATHS = ['/api/erp-logo-proxy', '/api/logo/proxy'] as const;

export type LogoRestConfig = {
  baseUrl: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  logoDb: string;
  selectedFirmNr: number;
  selectedPeriodNr: number;
};

export type LogoRestSession = {
  accessToken: string;
  tokenType: string;
  expiresAt: number;
  firmNr: number;
  periodNr: number;
  logoDb?: string;
};

export type LogoListResult<T = unknown> = {
  count: number | null;
  items: T[];
  raw: unknown;
};

export type LogoItemPreview = {
  code: string;
  name: string;
  barcode: string;
  unit: string;
  price: number;
  vatRate: number;
};

export type LogoArpPreview = {
  code: string;
  name: string;
  phone: string;
  email: string;
  city: string;
};

export type LogoImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
};

export const DEFAULT_LOGO_REST_CONFIG: LogoRestConfig = {
  baseUrl: '',
  username: LOGO_DEFAULT_USERNAME,
  password: LOGO_DEFAULT_PASSWORD,
  clientId: LOGO_DEFAULT_CLIENT_ID,
  clientSecret: LOGO_DEFAULT_CLIENT_SECRET,
  logoDb: '',
  selectedFirmNr: 0,
  selectedPeriodNr: 1,
};

/** Logo REST API taban URL — `/api/v1` ekler */
export function normalizeLogoRestBaseUrl(url: string): string {
  let u = String(url || '')
    .trim()
    .replace(/\/+$/, '');
  if (!u) return '';
  u = u.replace(/\/services\/help.*$/i, '');
  if (!u.endsWith('/api/v1')) {
    if (u.endsWith('/api')) u += '/v1';
    else if (!u.includes('/api/v1')) u += '/api/v1';
  }
  return u;
}

function normalizeBaseUrl(url: string): string {
  return normalizeLogoRestBaseUrl(url);
}

function requireBaseUrl(cfg: LogoRestConfig): string {
  const u = normalizeBaseUrl(cfg.baseUrl);
  if (!u) {
    throw new Error(
      'Logo API URL tanımlı değil. Entegrasyonlar ekranından girin (örn. http://sunucu:32001).',
    );
  }
  return u;
}

function encodeBasicAuth(clientId: string, clientSecret: string): string {
  const raw = `${clientId}:${clientSecret}`;
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(raw);
  }
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let binary = '';
  for (let i = 0; i < raw.length; i++) {
    binary += String.fromCharCode(raw.charCodeAt(i) & 0xff);
  }
  let result = '';
  let i = 0;
  while (i < binary.length) {
    const a = binary.charCodeAt(i++);
    const b = i < binary.length ? binary.charCodeAt(i++) : NaN;
    const c = i < binary.length ? binary.charCodeAt(i++) : NaN;
    const bitmap = (a << 16) | ((Number.isNaN(b) ? 0 : b) << 8) | (Number.isNaN(c) ? 0 : c);
    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += Number.isNaN(b) ? '=' : chars.charAt((bitmap >> 6) & 63);
    result += Number.isNaN(c) ? '=' : chars.charAt(bitmap & 63);
  }
  return result;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${encodeBasicAuth(clientId.trim(), clientSecret)}`;
}

/** Köprü host tanımlıysa Logo proxy URL (web kalıbı — `/api/erp-logo-proxy`) */
export function resolveLogoBridgeBaseUrl(): string | null {
  try {
    const cfg = useConfigStore.getState().config;
    if (!cfg.bridgeHost?.trim() || !(cfg.bridgePort > 0)) return null;
    return getBridgeBaseUrl(cfg);
  } catch {
    return null;
  }
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url.startsWith('http') ? url : `http://${url}`).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Bridge proxy: bridge host varsa.
 * Doğrudan: bridge yok veya SaaS HTTPS (köprü yerel Logo’ya erişemezse yine doğrudan).
 */
export function shouldUseLogoBridgeProxy(logoBaseUrl: string): boolean {
  const bridge = resolveLogoBridgeBaseUrl();
  if (!bridge) return false;
  // Public HTTPS SaaS Logo — doğrudan tercih (köprü gereksiz / CORS yok RN’de)
  if (isHttpsUrl(logoBaseUrl) && !isPrivateOrLocalLogoHost(logoBaseUrl)) {
    return false;
  }
  return true;
}

export function isPrivateOrLocalLogoHost(baseUrl: string): boolean {
  try {
    const raw = (baseUrl || '').trim();
    if (!raw) return false;
    const u = new URL(raw.startsWith('http') ? raw : `http://${raw}`);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')) {
      return true;
    }
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  } catch {
    return false;
  }
}

export async function loadLogoRestConfig(): Promise<LogoRestConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_CONFIG);
    if (!raw) return { ...DEFAULT_LOGO_REST_CONFIG };
    const parsed = JSON.parse(raw) as Partial<LogoRestConfig>;
    return {
      ...DEFAULT_LOGO_REST_CONFIG,
      ...parsed,
      baseUrl: normalizeBaseUrl(String(parsed.baseUrl || '')),
      selectedFirmNr: Math.max(0, Number(parsed.selectedFirmNr) || 0),
      selectedPeriodNr: Math.max(1, Number(parsed.selectedPeriodNr) || 1),
    };
  } catch {
    return { ...DEFAULT_LOGO_REST_CONFIG };
  }
}

export async function saveLogoRestConfig(
  patch: Partial<LogoRestConfig>,
): Promise<LogoRestConfig> {
  const prev = await loadLogoRestConfig();
  const next: LogoRestConfig = {
    ...prev,
    ...patch,
    baseUrl: normalizeBaseUrl(String(patch.baseUrl ?? prev.baseUrl)),
    selectedFirmNr:
      patch.selectedFirmNr !== undefined
        ? Math.max(0, Number(patch.selectedFirmNr) || 0)
        : prev.selectedFirmNr,
    selectedPeriodNr:
      patch.selectedPeriodNr !== undefined
        ? Math.max(1, Number(patch.selectedPeriodNr) || 1)
        : prev.selectedPeriodNr,
  };
  await AsyncStorage.setItem(STORAGE_CONFIG, JSON.stringify(next));
  return next;
}

export async function loadLogoRestSession(): Promise<LogoRestSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_SESSION);
    if (!raw) return null;
    const s = JSON.parse(raw) as LogoRestSession;
    if (!s.accessToken || !s.expiresAt || s.expiresAt < Date.now() + 30_000) return null;
    return s;
  } catch {
    return null;
  }
}

export async function saveLogoRestSession(session: LogoRestSession | null): Promise<void> {
  if (!session) {
    await AsyncStorage.removeItem(STORAGE_SESSION);
    return;
  }
  await AsyncStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
}

function resolveFirmPeriod(cfg: LogoRestConfig): { firmNr: number; periodNr: number } {
  return {
    firmNr: cfg.selectedFirmNr > 0 ? cfg.selectedFirmNr : 1,
    periodNr: cfg.selectedPeriodNr > 0 ? cfg.selectedPeriodNr : 1,
  };
}

async function logoHttpDirect(
  baseUrl: string,
  method: string,
  path: string,
  opts: {
    headers?: Record<string, string>;
    body?: string | null;
    query?: Record<string, string>;
  } = {},
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
  return fetch(`${base}${p}${qs}`, {
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
  } = {},
): Promise<Response> {
  const bridge = resolveLogoBridgeBaseUrl();
  if (!bridge) {
    throw new Error('Köprü adresi yok — Ayarlar’dan bridge host girin veya public Logo URL kullanın.');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  const payload = {
    baseUrl: normalizeBaseUrl(baseUrl),
    method,
    path: path.startsWith('/') ? path : `/${path}`,
    headers: opts.headers || {},
    body: opts.body,
    query: opts.query || {},
  };
  try {
    let last404: Response | null = null;
    for (const proxyPath of LOGO_BRIDGE_PROXY_PATHS) {
      try {
        const res = await fetch(`${bridge}${proxyPath}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (res.status === 404) {
          last404 = res;
          continue;
        }
        return res;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('aborted') || msg.includes('AbortError')) {
          throw new Error(`Logo REST köprüsü zaman aşımı (${bridge}${proxyPath})`);
        }
        // sonraki yolu dene
      }
    }
    if (last404) return last404;
    throw new Error(
      `Logo REST köprüsüne ulaşılamadı (${LOGO_BRIDGE_PROXY_PATHS.join(', ')} · ${bridge}).`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function logoHttp(
  baseUrl: string,
  method: string,
  path: string,
  opts: {
    headers?: Record<string, string>;
    body?: string | null;
    query?: Record<string, string>;
  } = {},
): Promise<{ ok: boolean; status: number; data: unknown; text: string }> {
  const useBridge = shouldUseLogoBridgeProxy(baseUrl);
  let res: Response;
  try {
    res = useBridge
      ? await logoHttpViaBridge(baseUrl, method, path, opts)
      : await logoHttpDirect(baseUrl, method, path, opts);
  } catch (e) {
    // Köprü başarısız ve yerel değilse doğrudan dene
    if (useBridge) {
      try {
        res = await logoHttpDirect(baseUrl, method, path, opts);
      } catch {
        throw e instanceof Error ? e : new Error(String(e));
      }
    } else {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (useBridge && data && typeof data === 'object' && data !== null && 'proxy' in data) {
    const wrapped = data as {
      proxy: { ok: boolean; status: number; data: unknown; text: string };
    };
    return wrapped.proxy;
  }

  if (useBridge && !res.ok && data && typeof data === 'object' && data !== null && 'error' in data) {
    return { ok: false, status: res.status, data, text };
  }

  return { ok: res.ok, status: res.status, data, text };
}

function formatLogoHttpFailure(status: number, data: unknown, text: string): string {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.upstreamError === 'string' && o.upstreamError) {
      return String(o.upstreamError).slice(0, 280);
    }
    const errCode = typeof o.error === 'string' ? o.error : '';
    const errDesc =
      typeof o.error_description === 'string'
        ? o.error_description
        : typeof o.message === 'string'
          ? o.message
          : '';
    if (errDesc) return errDesc.slice(0, 280);
    if (errCode) return errCode.slice(0, 280);
  }
  const blob = `${text || ''}`.trim();
  if (blob && blob.length < 240) return blob;
  return `Logo REST hatası HTTP ${status}`;
}

function extractCount(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  if (typeof o.totalCount === 'number') return o.totalCount;
  if (typeof o.TotalCount === 'number') return o.TotalCount;
  if (typeof o.count === 'number') return o.count;
  if (typeof o.Count === 'number') return o.Count;
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

function logoField(rec: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') return rec[k];
  }
  const lower = new Set(keys.map((k) => k.toLowerCase()));
  for (const [rk, rv] of Object.entries(rec)) {
    if (lower.has(rk.toLowerCase()) && rv !== undefined && rv !== null && rv !== '') return rv;
  }
  return undefined;
}

function numVal(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function trunc(v: unknown, max: number): string {
  const s = String(v ?? '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

function unwrapLogoRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const nested = o.restRecord ?? o.RestRecord ?? o.data ?? o.Data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return o;
}

function nestedItems(bag: unknown): Record<string, unknown>[] {
  if (!bag || typeof bag !== 'object') return [];
  const o = bag as Record<string, unknown>;
  const items = o.items ?? o.Items ?? o.item ?? o.Item;
  if (!Array.isArray(items)) return [];
  return items.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
}

export function mapLogoItemPreview(raw: unknown): LogoItemPreview | null {
  const rec = unwrapLogoRecord(raw);
  const code = trunc(logoField(rec, 'CODE', 'code'), 100);
  if (!code) return null;
  const name =
    trunc(logoField(rec, 'NAME', 'DEFINITION_', 'TITLE', 'name', 'title'), 255) || code;

  let barcode = trunc(logoField(rec, 'BARCODE', 'barcode', 'BARCODE_CODE'), 100);
  if (!barcode) {
    for (const unit of nestedItems(logoField(rec, 'UNITS', 'units'))) {
      barcode = trunc(logoField(unit, 'BARCODE', 'barcode'), 100);
      if (barcode) break;
      for (const bc of nestedItems(logoField(unit, 'BARCODE_LIST', 'barcode_list'))) {
        barcode = trunc(logoField(bc, 'BARCODE', 'barcode'), 100);
        if (barcode) break;
      }
      if (barcode) break;
    }
  }

  let unit = trunc(
    logoField(rec, 'UNIT', 'unit', 'UNIT_CODE', 'unit_code', 'UNITSET_CODE'),
    50,
  );
  if (!unit) {
    const units = nestedItems(logoField(rec, 'UNITS', 'units'));
    if (units[0]) {
      unit = trunc(logoField(units[0], 'UNIT_CODE', 'unit_code', 'UNIT', 'CODE'), 50);
    }
  }
  if (unit === '05' || unit === 'AD') unit = 'Adet';
  if (!unit) unit = 'Adet';

  let price = numVal(logoField(rec, 'PRICE', 'SELLPRICE', 'price', 'sellprice'), 0);
  if (price <= 0) {
    for (const p of nestedItems(logoField(rec, 'PRCLIST', 'prclist', 'PRICE_LIST'))) {
      const pr = numVal(logoField(p, 'PRICE', 'price'), 0);
      const ptype = Math.round(numVal(logoField(p, 'PTYPE', 'ptype'), 0));
      if (pr > 0 && (ptype === 2 || ptype === 0 || price <= 0)) {
        price = pr;
        if (ptype === 2) break;
      }
    }
  }

  const vatRate = numVal(logoField(rec, 'VAT', 'SELLVAT', 'SELVAT', 'vat'), 20);

  return { code, name, barcode, unit, price, vatRate: vatRate >= 0 ? vatRate : 20 };
}

export function mapLogoArpPreview(raw: unknown): LogoArpPreview | null {
  const rec = unwrapLogoRecord(raw);
  const code = trunc(logoField(rec, 'CODE', 'code'), 50);
  if (!code) return null;
  const name =
    trunc(logoField(rec, 'TITLE', 'DEFINITION_', 'NAME', 'title', 'definition', 'name'), 255) ||
    code;
  return {
    code,
    name,
    phone: trunc(logoField(rec, 'TELNRS', 'TELNRS2', 'PHONE', 'phone'), 50),
    email: trunc(logoField(rec, 'EMAILADDR', 'EMAIL', 'email'), 255),
    city: trunc(logoField(rec, 'CITY', 'city'), 100),
  };
}

/**
 * Logo REST token al — POST /token (client_id gövdede veya Basic).
 */
export async function logoObtainToken(
  cfg: LogoRestConfig,
  firmNrHint?: number,
): Promise<LogoRestSession> {
  const baseUrl = requireBaseUrl(cfg);
  const { firmNr, periodNr } = resolveFirmPeriod(cfg);
  const fNr = firmNrHint ?? firmNr;

  if (!cfg.username?.trim() || !cfg.password) {
    throw new Error('Logo kullanıcı adı ve şifre gerekli');
  }
  if (!cfg.clientId?.trim()) {
    throw new Error('Logo client_id gerekli');
  }

  const clientId = cfg.clientId.trim();
  const clientSecret = cfg.clientSecret || '';

  const tokenBody = new URLSearchParams({
    grant_type: 'password',
    username: cfg.username.trim(),
    password: cfg.password,
    firmno: String(fNr),
  });
  if (cfg.logoDb?.trim()) {
    tokenBody.set('logodb', cfg.logoDb.trim());
    tokenBody.set('dbname', cfg.logoDb.trim());
  }

  const tokenHeaders: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  let tokenRes: Awaited<ReturnType<typeof logoHttp>>;
  if (clientId && clientSecret) {
    const bodyPost = new URLSearchParams(tokenBody);
    bodyPost.set('client_id', clientId);
    bodyPost.set('client_secret', clientSecret);
    tokenRes = await logoHttp(baseUrl, 'POST', '/token', {
      headers: tokenHeaders,
      body: bodyPost.toString(),
    });
  } else {
    tokenRes = await logoHttp(baseUrl, 'POST', '/token', {
      headers: { ...tokenHeaders, Authorization: basicAuthHeader(clientId, clientSecret) },
      body: tokenBody.toString(),
    });
  }

  if (!tokenRes.ok && clientId && clientSecret) {
    const err = tokenRes.data as { error?: string };
    if (err?.error === 'invalid_client') {
      tokenRes = await logoHttp(baseUrl, 'POST', '/token', {
        headers: {
          ...tokenHeaders,
          Authorization: basicAuthHeader(clientId, clientSecret),
        },
        body: tokenBody.toString(),
      });
    }
  }

  if (!tokenRes.ok) {
    throw new Error(formatLogoHttpFailure(tokenRes.status, tokenRes.data, tokenRes.text));
  }

  const tok = tokenRes.data as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    logoDB?: string;
  };
  if (!tok?.access_token) throw new Error('Logo access_token alınamadı');

  const expiresIn = typeof tok.expires_in === 'number' ? tok.expires_in : 3600;
  return {
    accessToken: tok.access_token,
    tokenType: String(tok.token_type || 'Bearer'),
    expiresAt: Date.now() + expiresIn * 1000 - 30_000,
    firmNr: fNr,
    periodNr,
    logoDb: tok.logoDB || cfg.logoDb || undefined,
  };
}

/** Alias — görev sözleşmesi */
export async function getToken(
  cfg?: LogoRestConfig,
  firmNrHint?: number,
): Promise<LogoRestSession> {
  const c = cfg ?? (await loadLogoRestConfig());
  return logoObtainToken(c, firmNrHint);
}

export async function logoCompanyLogin(
  cfg: LogoRestConfig,
  session: LogoRestSession,
  firmNr?: number,
  periodNr?: number,
): Promise<LogoRestSession> {
  const baseUrl = requireBaseUrl(cfg);
  const ctx = resolveFirmPeriod(cfg);
  const fNr = firmNr ?? ctx.firmNr;
  const pNr = periodNr ?? ctx.periodNr;
  const auth = { Authorization: `Bearer ${session.accessToken}` };

  const loginRes = await logoHttp(baseUrl, 'GET', `/methods/CompanyLogin/${fNr}/${pNr}`, {
    headers: auth,
  });

  if (!loginRes.ok) {
    const blob = `${loginRes.text} ${JSON.stringify(loginRes.data ?? '')}`.toLowerCase();
    if (!blob.includes('already connected')) {
      throw new Error(
        `CompanyLogin(${fNr}/${pNr}) — ${formatLogoHttpFailure(loginRes.status, loginRes.data, loginRes.text)}`,
      );
    }
  }

  const next: LogoRestSession = { ...session, firmNr: fNr, periodNr: pNr };
  await saveLogoRestSession(next);
  return next;
}

/** Alias */
export async function companyLogin(
  cfg?: LogoRestConfig,
  session?: LogoRestSession,
  firmNr?: number,
  periodNr?: number,
): Promise<LogoRestSession> {
  const c = cfg ?? (await loadLogoRestConfig());
  const s = session ?? (await loadLogoRestSession());
  if (!s) {
    const token = await logoObtainToken(c, firmNr);
    return logoCompanyLogin(c, token, firmNr, periodNr);
  }
  return logoCompanyLogin(c, s, firmNr, periodNr);
}

export async function logoEnsureSession(cfg: LogoRestConfig): Promise<LogoRestSession> {
  requireBaseUrl(cfg);
  const ctx = resolveFirmPeriod(cfg);
  const existing = await loadLogoRestSession();
  if (
    existing &&
    existing.firmNr === ctx.firmNr &&
    existing.periodNr === ctx.periodNr &&
    (existing.logoDb || '') === (cfg.logoDb || '').trim()
  ) {
    return existing;
  }
  const token = await logoObtainToken(cfg, ctx.firmNr);
  return logoCompanyLogin(cfg, token, ctx.firmNr, ctx.periodNr);
}

export async function logoListResource<T = unknown>(
  cfg: LogoRestConfig,
  resource: string,
  opts: { limit?: number; offset?: number; q?: string; withCount?: boolean } = {},
): Promise<LogoListResult<T>> {
  const session = await logoEnsureSession(cfg);
  const baseUrl = requireBaseUrl(cfg);
  const query: Record<string, string> = {};
  const limit =
    opts.limit != null
      ? Math.min(Math.max(1, Math.floor(opts.limit)), LOGO_REST_MAX_PAGE_SIZE)
      : LOGO_REST_MAX_PAGE_SIZE;
  query.limit = String(limit);
  if (opts.offset != null) {
    const off = Math.max(0, Math.floor(opts.offset));
    if (off > 0) query.offset = String(off);
  }
  if (opts.q) query.q = opts.q;
  if (opts.withCount) query.withCount = 'true';

  const res = await logoHttp(baseUrl, 'GET', `/${resource}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    query,
  });
  if (!res.ok) {
    throw new Error(
      formatLogoHttpFailure(res.status, res.data, res.text) ||
        `${resource} listesi HTTP ${res.status}`,
    );
  }
  return {
    count: extractCount(res.data),
    items: extractItems<T>(res.data),
    raw: res.data,
  };
}

export async function listItems(
  cfg?: LogoRestConfig,
  opts: { limit?: number; offset?: number; q?: string } = {},
): Promise<LogoListResult<unknown>> {
  const c = cfg ?? (await loadLogoRestConfig());
  return logoListResource(c, 'items', {
    limit: opts.limit ?? LOGO_REST_MAX_PAGE_SIZE,
    offset: opts.offset,
    q: opts.q,
  });
}

export async function listArps(
  cfg?: LogoRestConfig,
  opts: { limit?: number; offset?: number; q?: string } = {},
): Promise<LogoListResult<unknown>> {
  const c = cfg ?? (await loadLogoRestConfig());
  return logoListResource(c, 'Arps', {
    limit: opts.limit ?? LOGO_REST_MAX_PAGE_SIZE,
    offset: opts.offset,
    q: opts.q,
  });
}

export async function pullLogoItemsPreview(
  cfg?: LogoRestConfig,
): Promise<{ items: LogoItemPreview[]; totalHint: number | null }> {
  const c = cfg ?? (await loadLogoRestConfig());
  await saveLogoRestConfig(c);
  const list = await listItems(c, { limit: LOGO_REST_MAX_PAGE_SIZE });
  const items = list.items
    .map(mapLogoItemPreview)
    .filter((x): x is LogoItemPreview => x != null);
  return { items, totalHint: list.count };
}

export async function pullLogoArpsPreview(
  cfg?: LogoRestConfig,
): Promise<{ items: LogoArpPreview[]; totalHint: number | null }> {
  const c = cfg ?? (await loadLogoRestConfig());
  await saveLogoRestConfig(c);
  const list = await listArps(c, { limit: LOGO_REST_MAX_PAGE_SIZE });
  const items = list.items
    .map(mapLogoArpPreview)
    .filter((x): x is LogoArpPreview => x != null);
  return { items, totalHint: list.count };
}

async function findProductByCode(code: string) {
  const rows = await fetchProducts(code, 40);
  const target = code.trim().toLocaleUpperCase('en-US');
  return (
    rows.find((r) => (r.code || '').trim().toLocaleUpperCase('en-US') === target) ?? null
  );
}

async function findCustomerByCode(code: string) {
  const rows = await fetchCustomers(code, 40);
  const target = code.trim().toLocaleUpperCase('en-US');
  return (
    rows.find((r) => (r.code || '').trim().toLocaleUpperCase('en-US') === target) ?? null
  );
}

export async function importLogoItems(
  items: LogoItemPreview[],
): Promise<LogoImportResult> {
  const result: LogoImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (const it of items) {
    if (!it.code || !it.name) {
      result.skipped += 1;
      continue;
    }
    try {
      const existing = await findProductByCode(it.code);
      const input = {
        code: it.code,
        barcode: it.barcode || undefined,
        name: it.name,
        unit: it.unit || 'Adet',
        price: it.price,
        vat_rate: it.vatRate,
      };
      if (existing?.id) {
        await updateProduct(existing.id, input);
        result.updated += 1;
      } else {
        await createProduct(input);
        result.created += 1;
      }
    } catch (e) {
      result.errors.push(
        `${it.code}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160),
      );
    }
  }
  return result;
}

export async function importLogoArps(items: LogoArpPreview[]): Promise<LogoImportResult> {
  const result: LogoImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  for (const it of items) {
    if (!it.code || !it.name) {
      result.skipped += 1;
      continue;
    }
    try {
      const existing = await findCustomerByCode(it.code);
      const input = {
        code: it.code,
        name: it.name,
        phone: it.phone || undefined,
        email: it.email || undefined,
        city: it.city || undefined,
      };
      if (existing?.id) {
        await updateCustomer(existing.id, input, { forceLive: true });
        result.updated += 1;
      } else {
        await createCustomer(input, { forceLive: true });
        result.created += 1;
      }
    } catch (e) {
      result.errors.push(
        `${it.code}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160),
      );
    }
  }
  return result;
}

/**
 * Logo REST bağlantı testi — token + CompanyLogin.
 */
export async function testLogoRestConnection(
  cfg?: LogoRestConfig,
): Promise<{ ok: boolean; detail: string }> {
  const c = cfg ?? (await loadLogoRestConfig());
  const base = normalizeBaseUrl(c.baseUrl);
  if (!base) {
    return { ok: false, detail: 'Logo REST URL boş (örn. http://sunucu:32001)' };
  }
  if (!c.username || !c.password) {
    return { ok: false, detail: 'Kullanıcı / şifre gerekli' };
  }

  try {
    const via = shouldUseLogoBridgeProxy(base)
      ? `köprü ${resolveLogoBridgeBaseUrl()}`
      : 'doğrudan';
    const session = await logoEnsureSession(c);
    await saveLogoRestConfig(c);
    return {
      ok: true,
      detail: `Logo REST oturum açıldı · firma ${session.firmNr} / dönem ${session.periodNr}${
        c.logoDb ? ` · DB ${c.logoDb}` : ''
      } · ${via}`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}
