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
import { parseStoredRetailexWebConfig } from '../utils/retailexWebConfigMerge';

const STORAGE_CONFIG = 'retailex_logo_rest_config';
const STORAGE_SESSION = 'retailex_logo_rest_session';
const STORAGE_MANUAL_URL = 'retailex_logo_rest_manual_url';

export const LOGO_API_URL_EXAMPLE = 'http://SUNUCU-IP:32001/api/v1';

/** Logo REST OAuth uygulama kaydı (RetailEX gömülü) */
export const LOGO_DEFAULT_CLIENT_ID = 'ARZEN';
export const LOGO_DEFAULT_CLIENT_SECRET = 'r1k1C+lyPK6BKFkrLdA3IFXawk2fiuFdCqbrMc5zQd8=';

/** Logo ERP oturum kullanıcısı (RetailEX gömülü) */
export const LOGO_DEFAULT_USERNAME = 'LOGO';
export const LOGO_DEFAULT_PASSWORD = '2661';

/** Logo Tiger REST — tek istekte en fazla 25 kayıt (sunucu doğrulaması) */
export const LOGO_REST_MAX_PAGE_SIZE = 25;

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
  /** Aktif Logo veritabanı (çoklu DB) */
  logoDb?: string;
  /** Bilinen Logo DB listesi — dropdown için */
  logoDbs?: string[];
  /** Manuel seçilen Logo firma no */
  selectedFirmNr?: number;
  /** Manuel seçilen Logo dönem no */
  selectedPeriodNr?: number;
  /** true: RetailEX ERP_SETTINGS; false: selectedFirmNr/selectedPeriodNr */
  useErpContext?: boolean;
}

export interface LogoFirmOption {
  firmNr: number;
  name: string;
  title: string;
  defaultPeriod?: number;
  periods: LogoPeriodOption[];
}

export interface LogoPeriodOption {
  number: number;
  beginDate?: string;
  endDate?: string;
  active: boolean;
}

export interface LogoContextSelection {
  logoDb: string;
  firmNr: number;
  periodNr: number;
  source: 'erp' | 'manual';
  firmLabel: string;
  periodLabel: string;
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
  logoDb?: string;
  resources: Record<string, number | null>;
  fetchedAt: string;
}

export interface LogoListResult<T = unknown> {
  count: number | null;
  items: T[];
  raw: unknown;
}

function normalizeBaseUrl(url: string): string {
  return normalizeLogoRestBaseUrl(url);
}

/** Logo REST API taban URL — sabit IP yok; kiracı / kullanıcı tanımlar */
export function normalizeLogoRestBaseUrl(url: string): string {
  let u = (url || '').trim().replace(/\/+$/, '');
  if (!u) return '';
  u = u.replace(/\/services\/help.*$/i, '');
  if (!u.endsWith('/api/v1')) {
    if (u.endsWith('/api')) u += '/v1';
    else if (!u.includes('/api/v1')) u += '/api/v1';
  }
  return u;
}

function requireBaseUrl(cfg: LogoRestConfig): string {
  const u = normalizeLogoRestBaseUrl(cfg.baseUrl);
  if (!u) {
    throw new Error(
      'Logo API URL tanımlı değil. Entegrasyonlar ekranından girin veya merkez tenant_registry.logo_rest_api_url alanını doldurun.'
    );
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

/** Çoklu DB / firma / dönem — ERP veya manuel seçim */
export function resolveLogoContext(cfg: LogoRestConfig): LogoContextSelection {
  const erp = getErpFirmPeriodLabel();
  const useErp = cfg.useErpContext !== false;

  const firmNr = useErp
    ? erp.firmNr
    : (cfg.selectedFirmNr != null && cfg.selectedFirmNr > 0 ? cfg.selectedFirmNr : erp.firmNr);
  const periodNr = useErp
    ? erp.periodNr
    : (cfg.selectedPeriodNr != null && cfg.selectedPeriodNr > 0 ? cfg.selectedPeriodNr : erp.periodNr);

  return {
    logoDb: (cfg.logoDb || '').trim(),
    firmNr,
    periodNr,
    source: useErp ? 'erp' : 'manual',
    firmLabel: useErp ? erp.firmLabel : String(firmNr).padStart(3, '0'),
    periodLabel: useErp ? erp.periodLabel : String(periodNr).padStart(2, '0'),
  };
}

function parseLogoPeriods(raw: unknown): LogoPeriodOption[] {
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const item = o.Item ?? o.item ?? o.items ?? o;
  const list = extractItems<Record<string, unknown>>(item);
  return list
    .map((p) => ({
      number: Number(p.number ?? p.Number ?? p.nr ?? 0),
      beginDate: String(p.BeginDate ?? p.beginDate ?? ''),
      endDate: String(p.endDate ?? p.EndDate ?? ''),
      active: Boolean(p.Active ?? p.active ?? false),
    }))
    .filter((p) => p.number > 0)
    .sort((a, b) => a.number - b.number);
}

export function parseLogoFirmsResponse(data: unknown): LogoFirmOption[] {
  if (!data || typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const item = root.Item ?? root.item ?? root;
  const firms = extractItems<Record<string, unknown>>(item);
  return firms
    .map((f) => {
      const firmNr = Number(f.FirmNr ?? f.firmNr ?? f.NR ?? f.nr ?? 0);
      return {
        firmNr,
        name: String(f.name ?? f.Name ?? ''),
        title: String(f.Title ?? f.title ?? f.name ?? ''),
        defaultPeriod: Number(f.DefaultPeriod ?? f.defaultPeriod ?? 0) || undefined,
        periods: parseLogoPeriods(f.Periods ?? f.periods),
      };
    })
    .filter((f) => f.firmNr > 0)
    .sort((a, b) => a.firmNr - b.firmNr);
}

export function periodsForFirm(firms: LogoFirmOption[], firmNr: number): LogoPeriodOption[] {
  return firms.find((f) => f.firmNr === firmNr)?.periods ?? [];
}

function sessionMatchesContext(session: LogoRestSession, ctx: LogoContextSelection, cfg: LogoRestConfig): boolean {
  const db = (cfg.logoDb || '').trim();
  return (
    session.firmNr === ctx.firmNr &&
    session.periodNr === ctx.periodNr &&
    (session.logoDb || '') === db
  );
}

export function isLogoRestUrlManualOverride(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_MANUAL_URL) === '1';
}

export function clearLogoRestUrlManualOverride(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_MANUAL_URL);
}

/** Kiracı girişinde tenant_registry.logo_rest_api_url → logo config */
export function syncLogoRestUrlFromWebConfig(force = false): void {
  if (typeof window === 'undefined') return;
  if (!force && isLogoRestUrlManualOverride()) return;
  const cfg = parseStoredRetailexWebConfig();
  const url = normalizeLogoRestBaseUrl(String(cfg.logo_rest_api_url || ''));
  if (!url) return;
  const current = loadLogoRestConfig();
  saveLogoRestConfig({ ...current, baseUrl: url });
}

export function setLogoRestBaseUrl(url: string, options?: { manual?: boolean }): void {
  const current = loadLogoRestConfig();
  saveLogoRestConfig({ ...current, baseUrl: normalizeLogoRestBaseUrl(url) });
  if (typeof window !== 'undefined') {
    if (options?.manual) localStorage.setItem(STORAGE_MANUAL_URL, '1');
    else if (!url.trim()) localStorage.removeItem(STORAGE_MANUAL_URL);
  }
}

export function resolveLogoRestUrlSource(): 'tenant' | 'manual' | 'none' {
  if (typeof window === 'undefined') return 'none';
  if (isLogoRestUrlManualOverride()) return 'manual';
  const cfg = parseStoredRetailexWebConfig();
  if (normalizeLogoRestBaseUrl(String(cfg.logo_rest_api_url || ''))) return 'tenant';
  if (normalizeLogoRestBaseUrl(loadLogoRestConfig().baseUrl)) return 'manual';
  return 'none';
}

export function loadLogoRestConfig(): LogoRestConfig {
  const defaults: LogoRestConfig = {
    baseUrl: '',
    username: LOGO_DEFAULT_USERNAME,
    password: LOGO_DEFAULT_PASSWORD,
    clientId: LOGO_DEFAULT_CLIENT_ID,
    clientSecret: LOGO_DEFAULT_CLIENT_SECRET,
    logoDb: '',
    logoDbs: [],
    useErpContext: true,
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG);
    const webCfg = parseStoredRetailexWebConfig();
    const tenantUrl = normalizeLogoRestBaseUrl(String(webCfg.logo_rest_api_url || ''));
    if (!raw) {
      return tenantUrl && !isLogoRestUrlManualOverride()
        ? { ...defaults, baseUrl: tenantUrl }
        : defaults;
    }
    const parsed = JSON.parse(raw) as Partial<LogoRestConfig>;
    const storedId = String(parsed.clientId ?? '').trim();
    const storedSecret = String(parsed.clientSecret ?? '').trim();
    const storedUser = String(parsed.username ?? '').trim();
    const storedPass = String(parsed.password ?? '');
    const storedUrl = normalizeLogoRestBaseUrl(String(parsed.baseUrl ?? ''));
    const baseUrl =
      storedUrl ||
      (!isLogoRestUrlManualOverride() && tenantUrl ? tenantUrl : '');
    return {
      ...defaults,
      ...parsed,
      baseUrl,
      logoDbs: Array.isArray(parsed.logoDbs) ? parsed.logoDbs.filter(Boolean) : [],
      username: storedUser || LOGO_DEFAULT_USERNAME,
      password: storedPass || LOGO_DEFAULT_PASSWORD,
      clientId:
        storedId && storedId !== 'logotigerrestservice' ? storedId : LOGO_DEFAULT_CLIENT_ID,
      clientSecret: storedSecret || LOGO_DEFAULT_CLIENT_SECRET,
    };
  } catch {
    return defaults;
  }
}

export function saveLogoRestConfig(cfg: LogoRestConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    STORAGE_CONFIG,
    JSON.stringify({ ...cfg, baseUrl: normalizeLogoRestBaseUrl(cfg.baseUrl) })
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

/** Senkron öncesi taze Logo oturumu (bayat token / firma-dönem kayması önlenir) */
export async function logoRefreshSession(cfg: LogoRestConfig): Promise<LogoRestSession> {
  saveLogoRestSession(null);
  const ctx = resolveLogoContext(cfg);
  return logoAuthenticate(cfg, ctx.firmNr, ctx.periodNr);
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
  if (typeof o.totalCount === 'number') return o.totalCount;
  if (typeof o.TotalCount === 'number') return o.TotalCount;
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

export async function logoObtainToken(
  cfg: LogoRestConfig,
  firmNrHint?: number
): Promise<LogoRestSession> {
  const baseUrl = requireBaseUrl(cfg);
  const ctx = resolveLogoContext(cfg);
  const fNr = firmNrHint ?? ctx.firmNr ?? 1;

  if (!cfg.username?.trim() || !cfg.password) {
    throw new Error('Logo kullanıcı adı ve şifre gerekli');
  }
  if (!cfg.clientId?.trim()) {
    throw new Error('Logo client_id gerekli');
  }

  const tokenBody = new URLSearchParams({
    grant_type: 'password',
    username: cfg.username.trim(),
    password: cfg.password,
    firmno: String(fNr),
  });
  if (ctx.logoDb) tokenBody.set('logodb', ctx.logoDb);

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
  const resolvedDb = tok.logoDB || ctx.logoDb;
  return {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000 - 30_000,
    firmNr: fNr,
    periodNr: ctx.periodNr,
    userName: tok.userName,
    logoDb: resolvedDb,
  };
}

async function logoGetCurrentFirmPeriod(
  cfg: LogoRestConfig,
  session: LogoRestSession
): Promise<{ firm: number | null; period: number | null }> {
  const baseUrl = requireBaseUrl(cfg);
  const auth = { Authorization: `Bearer ${session.accessToken}` };
  const firmRes = await logoHttp(baseUrl, 'GET', '/methods/CurrentFirm', { headers: auth });
  const periodRes = await logoHttp(baseUrl, 'GET', '/methods/CurrentPeriod', { headers: auth });
  const firm = typeof firmRes.data === 'number' ? firmRes.data : null;
  const period = typeof periodRes.data === 'number' ? periodRes.data : null;
  return { firm, period };
}

function isAlreadyConnectedError(text: string, data: unknown): boolean {
  const blob = `${text} ${JSON.stringify(data ?? '')}`.toLowerCase();
  return blob.includes('already connected');
}

export async function logoCompanyLogout(
  cfg: LogoRestConfig,
  session: LogoRestSession
): Promise<void> {
  const baseUrl = requireBaseUrl(cfg);
  await logoHttp(baseUrl, 'GET', '/methods/CompanyLogout', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  }).catch(() => {});
}

export async function logoCompanyLogin(
  cfg: LogoRestConfig,
  session: LogoRestSession,
  firmNr: number,
  periodNr: number
): Promise<LogoRestSession> {
  const baseUrl = requireBaseUrl(cfg);
  const auth = { Authorization: `Bearer ${session.accessToken}` };

  const current = await logoGetCurrentFirmPeriod(cfg, session);
  if (current.firm === firmNr && current.period === periodNr) {
    const next: LogoRestSession = { ...session, firmNr, periodNr };
    saveLogoRestSession(next);
    return next;
  }

  await logoCompanyLogout(cfg, session);

  const tryLogin = async (): Promise<{ ok: boolean; status: number; text: string; data: unknown }> => {
    const loginRes = await logoHttp(baseUrl, 'GET', `/methods/CompanyLogin/${firmNr}/${periodNr}`, {
      headers: auth,
    });
    return { ok: loginRes.ok, status: loginRes.status, text: loginRes.text, data: loginRes.data };
  };

  let login = await tryLogin();

  if (!login.ok && isAlreadyConnectedError(login.text, login.data)) {
    const after = await logoGetCurrentFirmPeriod(cfg, session);
    if (after.firm === firmNr && after.period === periodNr) {
      const next: LogoRestSession = { ...session, firmNr, periodNr };
      saveLogoRestSession(next);
      return next;
    }
    await logoCompanyLogout(cfg, session);
    login = await tryLogin();
  }

  if (!login.ok) {
    throw new Error(
      `CompanyLogin(${firmNr}/${periodNr}) HTTP ${login.status} — ${login.text?.slice(0, 300)}`
    );
  }

  const next: LogoRestSession = { ...session, firmNr, periodNr };
  saveLogoRestSession(next);
  return next;
}

export async function logoAuthenticate(
  cfg: LogoRestConfig,
  firmNr?: number,
  periodNr?: number
): Promise<LogoRestSession> {
  const ctx = resolveLogoContext(cfg);
  const fNr = firmNr ?? ctx.firmNr;
  const pNr = periodNr ?? ctx.periodNr;

  const session = await logoObtainToken(cfg, fNr);
  return logoCompanyLogin(cfg, session, fNr, pNr);
}

export async function logoEnsureSession(cfg: LogoRestConfig): Promise<LogoRestSession> {
  const ctx = resolveLogoContext(cfg);
  const existing = loadLogoRestSession();
  if (existing && Date.now() < existing.expiresAt && sessionMatchesContext(existing, ctx, cfg)) {
    return existing;
  }
  return logoAuthenticate(cfg, ctx.firmNr, ctx.periodNr);
}

export async function logoSwitchContext(
  cfg: LogoRestConfig,
  patch: { logoDb?: string; firmNr?: number; periodNr?: number; useErpContext?: boolean }
): Promise<LogoRestSession> {
  const nextCfg: LogoRestConfig = {
    ...cfg,
    ...patch,
    logoDb: patch.logoDb !== undefined ? patch.logoDb : cfg.logoDb,
    selectedFirmNr: patch.firmNr ?? cfg.selectedFirmNr,
    selectedPeriodNr: patch.periodNr ?? cfg.selectedPeriodNr,
    useErpContext: patch.useErpContext ?? cfg.useErpContext,
  };
  saveLogoRestConfig(nextCfg);
  saveLogoRestSession(null);
  return logoAuthenticate(nextCfg);
}

export async function logoListFirmCatalog(cfg: LogoRestConfig): Promise<LogoFirmOption[]> {
  const ctx = resolveLogoContext(cfg);
  const session = await logoObtainToken(cfg, ctx.firmNr || 1);
  const baseUrl = requireBaseUrl(cfg);
  const res = await logoHttp(baseUrl, 'GET', '/methods/CAPI/Firms', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Firma listesi HTTP ${res.status} — ${res.text?.slice(0, 200)}`);
  }
  return parseLogoFirmsResponse(res.data);
}

export async function logoCheckDatabase(cfg: LogoRestConfig, dbName: string): Promise<boolean> {
  const session = await logoObtainToken(cfg, 1);
  const baseUrl = requireBaseUrl(cfg);
  const res = await logoHttp(baseUrl, 'GET', `/methods/CheckLogoDB/${encodeURIComponent(dbName)}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  return res.ok && res.data === true;
}

export async function logoRevokeSession(cfg: LogoRestConfig): Promise<void> {
  const session = loadLogoRestSession();
  if (session?.accessToken) {
    await logoCompanyLogout(cfg, session).catch(() => {});
    await logoHttp(requireBaseUrl(cfg), 'GET', '/revoke', {
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
  context?: LogoContextSelection;
  error?: string;
}> {
  try {
    const ctx = resolveLogoContext(cfg);
    const session = await logoAuthenticate(cfg, ctx.firmNr, ctx.periodNr);
    const baseUrl = requireBaseUrl(cfg);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const firmRes = await logoHttp(baseUrl, 'GET', '/methods/CurrentFirm', { headers: auth });
    const periodRes = await logoHttp(baseUrl, 'GET', '/methods/CurrentPeriod', { headers: auth });

    return {
      ok: true,
      session,
      context: ctx,
      currentFirm: typeof firmRes.data === 'number' ? firmRes.data : undefined,
      currentPeriod: typeof periodRes.data === 'number' ? periodRes.data : undefined,
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function logoDescribeServices(cfg: LogoRestConfig): Promise<LogoDescribeEntry[]> {
  const session = await logoEnsureSession(cfg);
  const baseUrl = requireBaseUrl(cfg);
  const res = await logoHttp(baseUrl, 'GET', '/services/describe', {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    query: { api_key: cfg.clientId || LOGO_DEFAULT_CLIENT_ID },
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
  const baseUrl = requireBaseUrl(cfg);
  const query: Record<string, string> = {};
  const limit =
    opts.limit != null
      ? Math.min(Math.max(1, Math.floor(opts.limit)), LOGO_REST_MAX_PAGE_SIZE)
      : undefined;
  if (limit != null) query.limit = String(limit);
  if (opts.offset != null) {
    const off = Math.max(0, Math.floor(opts.offset));
    // Logo bazı sürümlerde offset=0 gönderilince 400 dönebiliyor — yalnızca >0 iken ekle
    if (off > 0) query.offset = String(off);
  }
  if (opts.q) query.q = opts.q;
  if (opts.withCount) query.withCount = 'true';
  if (opts.expandLevel) query.expandLevel = opts.expandLevel;

  const res = await logoHttp(baseUrl, 'GET', `/${resource}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    query,
  });
  if (!res.ok) {
    const err = res.data as {
      message?: string;
      Message?: string;
      error?: string;
      ModelState?: Record<string, string[]>;
    };
    const modelMsg = err?.ModelState
      ? Object.values(err.ModelState).flat().join('; ')
      : '';
    const detail =
      modelMsg ||
      err?.message ||
      err?.Message ||
      err?.error ||
      (typeof res.text === 'string' && res.text.trim() ? res.text.trim().slice(0, 400) : '');
    const qs = Object.keys(query).length
      ? ` (${Object.entries(query).map(([k, v]) => `${k}=${v}`).join('&')})`
      : '';
    throw new Error(detail || `${resource} listesi HTTP ${res.status}${qs}`);
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
  const baseUrl = requireBaseUrl(cfg);
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
  const baseUrl = requireBaseUrl(cfg);
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
  const baseUrl = requireBaseUrl(cfg);
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
  const baseUrl = requireBaseUrl(cfg);
  const res = await logoHttp(baseUrl, 'DELETE', `/${resource}/${id}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) throw new Error(`${resource}/${id} silme HTTP ${res.status}`);
}

function parseLogoNextQuery(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const next = o.next ?? o.Next;
  if (!next || typeof next !== 'object') return null;
  const href = (next as Record<string, unknown>).href;
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    const u = new URL(href);
    const q: Record<string, string> = {};
    u.searchParams.forEach((v, k) => {
      if (v !== '') q[k] = v;
    });
    return Object.keys(q).length > 0 ? q : null;
  } catch {
    return null;
  }
}

export async function logoFetchAllPaginated<T = unknown>(
  cfg: LogoRestConfig,
  resource: LogoResourceName,
  opts: { pageSize?: number; maxPages?: number; q?: string } = {}
): Promise<T[]> {
  const pageSize = Math.min(
    opts.pageSize ?? LOGO_REST_MAX_PAGE_SIZE,
    LOGO_REST_MAX_PAGE_SIZE
  );
  const maxPages = opts.maxPages ?? 200;
  const all: T[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const listOpts: {
      limit: number;
      offset?: number;
      q?: string;
    } = { limit: pageSize };
    if (offset > 0) listOpts.offset = offset;
    if (opts.q) listOpts.q = opts.q;

    const batch = await logoListResource<T>(cfg, resource, listOpts);
    all.push(...batch.items);

    if (batch.items.length === 0) break;
    if (batch.items.length < pageSize) break;

    const nextQ = parseLogoNextQuery(batch.raw);
    if (nextQ?.offset != null) {
      const nextOff = parseInt(nextQ.offset, 10);
      if (Number.isFinite(nextOff) && nextOff > offset) {
        offset = nextOff;
        continue;
      }
    }
    offset += batch.items.length;
  }
  return all;
}

export async function logoGetDataPreview(cfg: LogoRestConfig): Promise<LogoDataPreview> {
  const ctx = resolveLogoContext(cfg);
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
    firmNr: ctx.firmNr,
    periodNr: ctx.periodNr,
    logoDb: ctx.logoDb || undefined,
    resources,
    fetchedAt: new Date().toISOString(),
  };
}

export async function logoHealthCheck(cfg: LogoRestConfig): Promise<boolean> {
  const baseUrl = requireBaseUrl(cfg);
  const res = await logoHttp(baseUrl, 'GET', '/sys/healthcheck', {});
  return res.ok || res.status === 204;
}
