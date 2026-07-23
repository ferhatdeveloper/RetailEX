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
import { getBridgeUrl, IS_TAURI, isRetailExProductionWeb } from '../utils/env';
import { parseStoredRetailexWebConfig } from '../utils/retailexWebConfigMerge';

const STORAGE_CONFIG = 'retailex_logo_rest_config';
const STORAGE_SESSION = 'retailex_logo_rest_session';
const STORAGE_MANUAL_URL = 'retailex_logo_rest_manual_url';

export const LOGO_API_URL_EXAMPLE = 'http://185.206.175.241:32001';

/** Bu kurulumdaki internet üzerinden erişilebilir Logo REST (kiracı kaydı boşsa önerilen) */
export const LOGO_DEFAULT_PUBLIC_BASE_URL = LOGO_API_URL_EXAMPLE;

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
  /** Manuel seçilen Logo firma no (eski — firmMappings tercih edilir) */
  selectedFirmNr?: number;
  /** Manuel seçilen Logo dönem no */
  selectedPeriodNr?: number;
  /** true: RetailEX ERP_SETTINGS; false: selectedFirmNr/selectedPeriodNr */
  useErpContext?: boolean;
  /** RetailEX firma kodu (001) → Logo firma/dönem/DB eşlemesi */
  firmMappings?: Record<string, LogoFirmMapping>;
  /** Logo CAPI firmaları önbelleği */
  firmCatalog?: LogoFirmOption[];
}

/** RetailEX firma başına Logo bağlamı */
export interface LogoFirmMapping {
  logoFirmNr: number;
  logoPeriodNr: number;
  logoDb?: string;
  logoFirmName?: string;
  logoFirmTitle?: string;
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

/** Logo REST host localhost / RFC1918 mi? */
export function isPrivateOrLocalLogoHost(baseUrl: string): boolean {
  try {
    const raw = (baseUrl || '').trim();
    if (!raw) return false;
    const u = new URL(raw.startsWith('http') ? raw : `http://${raw}`);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')) return true;
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

/**
 * retailex.app (bulut) üzerinden yerel Logo adresine köprü ile gidilemez.
 * Masaüstü veya erişilebilir public URL gerekir.
 */
export function assertLogoReachableInWebContext(baseUrl: string): void {
  if (IS_TAURI || typeof window === 'undefined') return;
  if (!isRetailExProductionWeb()) return;
  if (!isPrivateOrLocalLogoHost(baseUrl)) return;
  throw new Error(
    'Logo REST adresi yerel ağda (localhost / 192.168.x.x / 10.x). ' +
      'retailex.app bulut köprüsü bu adrese erişemez; /api/status çalışsa bile Logo senkronu başarısız olur. ' +
      'Çözüm: RetailEX masaüstü (Logo ile aynı ağ), Logo için VPN/tünel, veya internetten erişilebilir API Base URL.'
  );
}

export function getLogoCloudWebPrivateUrlHint(baseUrl: string): string | null {
  if (IS_TAURI || typeof window === 'undefined' || !isRetailExProductionWeb()) return null;
  if (!isPrivateOrLocalLogoHost(baseUrl)) return null;
  return (
    'Bu Logo adresi yerel ağda. retailex.app üzerinden senkron yapılamaz; masaüstü uygulaması veya public URL kullanın.'
  );
}

function formatLogoUpstreamError(baseUrl: string, detail?: string): string {
  const host = (() => {
    try {
      return new URL(normalizeBaseUrl(baseUrl)).hostname;
    } catch {
      return baseUrl;
    }
  })();
  const privateHint = isPrivateOrLocalLogoHost(baseUrl)
    ? ' Adres yerel ağda görünüyor; bulut köprüsü (retailex.app) bu sunucuya ulaşamaz.'
    : '';
  const tail = detail ? ` (${detail})` : '';
  return `Logo REST sunucusuna köprü üzerinden ulaşılamadı (${host}).${privateHint}${tail}`;
}

/** Önce reklam engelleyici dostu yol; /api/logo/* bazı eklentilerde bloklanır */
export const LOGO_BRIDGE_PROXY_PATHS = ['/api/erp-logo-proxy', '/api/logo/proxy'] as const;

function formatLogoBridgeFetchError(bridge: string, raw: string, triedPaths: readonly string[]): string {
  const paths = triedPaths.join(', ');
  const aborted = raw.includes('aborted') || raw.includes('AbortError');
  if (aborted) {
    return `Logo REST köprüsü zaman aşımına uğradı (${paths}).`;
  }
  return (
    `Logo REST köprüsüne ulaşılamadı (${paths}). ` +
    `${bridge}/api/status çalışıyorsa köprü ayaktadır; sorun büyük olasılıkla tarayıcı reklam engelleyicisi ` +
    '(/api/logo/ yolunu keser) veya ağ güvenlik duvarıdır. Gizli pencerede veya eklentisiz deneyin. ' +
    'Sorun sürerse retailex_bridge ve retailex_frontend imajlarını yeniden deploy edin.'
  );
}

async function fetchLogoBridgeStatus(bridge: string): Promise<{ ok: boolean; logoProxy?: boolean }> {
  try {
    const res = await fetch(`${bridge}/api/status`, { method: 'GET', credentials: 'same-origin' });
    if (!res.ok) return { ok: false };
    const data = (await res.json().catch(() => ({}))) as { status?: string; logoProxy?: boolean };
    return { ok: data.status === 'RUNNING', logoProxy: data.logoProxy };
  } catch {
    return { ok: false };
  }
}

async function postLogoBridgeProxy(
  bridge: string,
  proxyPath: string,
  payload: Record<string, unknown>,
  signal: AbortSignal
): Promise<Response> {
  return fetch(`${bridge}${proxyPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
    credentials: 'same-origin',
    mode: 'cors',
  });
}

function formatLogoHttpFailure(baseUrl: string, status: number, data: unknown, text: string): string {
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (typeof o.upstreamError === 'string' && o.upstreamError) {
      return formatLogoUpstreamError(baseUrl, o.upstreamError);
    }
    if (typeof o.error === 'string' && o.error) {
      if (o.error === 'fetch failed' || String(o.error).includes('fetch failed')) {
        return formatLogoUpstreamError(baseUrl, o.error);
      }
      return String(o.error);
    }
    const err = o as { error_description?: string; message?: string };
    if (err.error_description) return err.error_description;
    if (err.message) return err.message;
  }
  const blob = `${text || ''}`.trim();
  if (blob && blob.length < 240) return blob;
  return `Logo REST hatası HTTP ${status}`;
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

export function getErpFirmKey(raw?: string | null): string {
  const d = String(raw ?? ERP_SETTINGS.firmNr ?? '001').replace(/\D/g, '') || '1';
  return d.padStart(3, '0').slice(0, 3);
}

export function getLogoMappingForErp(cfg: LogoRestConfig, erpFirmKey?: string): LogoFirmMapping | null {
  const key = erpFirmKey ?? getErpFirmKey();
  const m = cfg.firmMappings?.[key];
  if (!m || !(m.logoFirmNr > 0)) return null;
  return m;
}

/** Aktif RetailEX firması için Logo eşlemesini kaydeder */
export function saveLogoFirmMappingForErp(
  cfg: LogoRestConfig,
  mapping: LogoFirmMapping,
  erpFirmKey?: string
): LogoRestConfig {
  const key = erpFirmKey ?? getErpFirmKey();
  const next: LogoRestConfig = {
    ...cfg,
    firmMappings: {
      ...(cfg.firmMappings || {}),
      [key]: {
        logoFirmNr: mapping.logoFirmNr,
        logoPeriodNr: mapping.logoPeriodNr > 0 ? mapping.logoPeriodNr : 1,
        logoDb: mapping.logoDb?.trim() || cfg.logoDb,
        logoFirmName: mapping.logoFirmName,
        logoFirmTitle: mapping.logoFirmTitle,
      },
    },
    selectedFirmNr: mapping.logoFirmNr,
    selectedPeriodNr: mapping.logoPeriodNr,
    logoDb: mapping.logoDb?.trim() || cfg.logoDb,
    useErpContext: true,
  };
  saveLogoRestConfig(next);
  return next;
}

export function saveLogoFirmCatalog(cfg: LogoRestConfig, firms: LogoFirmOption[]): LogoRestConfig {
  const next = { ...cfg, firmCatalog: firms };
  saveLogoRestConfig(next);
  return next;
}

function migrateLegacyLogoMapping(cfg: LogoRestConfig): LogoRestConfig {
  const key = getErpFirmKey();
  if (cfg.firmMappings?.[key]?.logoFirmNr) return cfg;
  if (cfg.useErpContext === false && cfg.selectedFirmNr != null && cfg.selectedFirmNr > 0) {
    return {
      ...cfg,
      firmMappings: {
        ...(cfg.firmMappings || {}),
        [key]: {
          logoFirmNr: cfg.selectedFirmNr,
          logoPeriodNr: cfg.selectedPeriodNr && cfg.selectedPeriodNr > 0 ? cfg.selectedPeriodNr : 1,
          logoDb: cfg.logoDb,
        },
      },
      useErpContext: true,
    };
  }
  return cfg;
}

/** Çoklu DB / firma / dönem — önce kayıtlı eşleme, sonra ERP/manuel */
export function resolveLogoContext(cfg: LogoRestConfig): LogoContextSelection {
  const erp = getErpFirmPeriodLabel();
  const erpKey = getErpFirmKey();
  const mapping = getLogoMappingForErp(cfg, erpKey);

  if (mapping) {
    const periodNr = mapping.logoPeriodNr > 0 ? mapping.logoPeriodNr : erp.periodNr;
    return {
      logoDb: (mapping.logoDb || cfg.logoDb || '').trim(),
      firmNr: mapping.logoFirmNr,
      periodNr,
      source: 'erp',
      firmLabel: erp.firmLabel,
      periodLabel: String(periodNr).padStart(2, '0'),
    };
  }

  const useErp = cfg.useErpContext !== false;

  const firmNr = useErp
    ? erp.firmNr
    : cfg.selectedFirmNr != null && cfg.selectedFirmNr > 0
      ? cfg.selectedFirmNr
      : erp.firmNr;
  const periodNr = useErp
    ? erp.periodNr
    : cfg.selectedPeriodNr != null && cfg.selectedPeriodNr > 0
      ? cfg.selectedPeriodNr
      : erp.periodNr;

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
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((p) => {
        if (!p || typeof p !== 'object') return null;
        const row = p as Record<string, unknown>;
        const number = Number(row.number ?? row.Number ?? row.nr ?? row.NR ?? row.period ?? row.Period ?? 0);
        if (!(number > 0)) return null;
        return {
          number,
          beginDate: String(row.BeginDate ?? row.beginDate ?? row.BEGDATE ?? ''),
          endDate: String(row.endDate ?? row.EndDate ?? row.ENDDATE ?? ''),
          active: Boolean(row.Active ?? row.active ?? row.ACTIVE ?? false),
        };
      })
      .filter((p): p is LogoPeriodOption => p != null)
      .sort((a, b) => a.number - b.number);
  }
  if (typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const item = o.Item ?? o.item ?? o.items ?? o.Items ?? o.List ?? o.list ?? o.Period ?? o.periods ?? o;
  return parseLogoPeriods(item);
}

export function parseLogoFirmsResponse(data: unknown): LogoFirmOption[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((f) => parseOneLogoFirm(f))
      .filter((f): f is LogoFirmOption => f != null);
  }
  if (typeof data !== 'object') return [];

  const single = parseOneLogoFirm(data);
  if (single) return [single];

  const root = data as Record<string, unknown>;
  const candidates = [
    root.Item,
    root.item,
    root.items,
    root.Items,
    root.List,
    root.list,
    root.firms,
    root.Firms,
    root.FIRM,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const parsed = parseLogoFirmsResponse(c);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function parseOneLogoFirm(raw: unknown): LogoFirmOption | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;
  const firmNr = Number(
    f.FirmNr ?? f.firmNr ?? f.FIRMNR ?? f.firmno ?? f.FirmNo ?? f.NR ?? f.nr ?? f.Number ?? f.number ?? 0
  );
  if (!(firmNr > 0)) return null;
  const name = String(f.name ?? f.Name ?? f.FIRMNAME ?? '');
  const title = String(f.Title ?? f.title ?? f.DEFINITION_ ?? f.definition ?? name);
  const defaultPeriod = Number(f.DefaultPeriod ?? f.defaultPeriod ?? f.ACTIVEPERIOD ?? 0) || undefined;
  return {
    firmNr,
    name,
    title,
    defaultPeriod,
    periods: parseLogoPeriods(f.Periods ?? f.periods ?? f.PeriodList ?? f.periodList),
  };
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
      (!isLogoRestUrlManualOverride() && tenantUrl ? tenantUrl : '') ||
      LOGO_DEFAULT_PUBLIC_BASE_URL;
    return migrateLegacyLogoMapping({
      ...defaults,
      ...parsed,
      baseUrl,
      logoDbs: Array.isArray(parsed.logoDbs) ? parsed.logoDbs.filter(Boolean) : [],
      firmMappings:
        parsed.firmMappings && typeof parsed.firmMappings === 'object'
          ? (parsed.firmMappings as Record<string, LogoFirmMapping>)
          : {},
      firmCatalog: Array.isArray(parsed.firmCatalog) ? parsed.firmCatalog : [],
      username: storedUser || LOGO_DEFAULT_USERNAME,
      password: storedPass || LOGO_DEFAULT_PASSWORD,
      clientId:
        storedId && storedId !== 'logotigerrestservice' ? storedId : LOGO_DEFAULT_CLIENT_ID,
      clientSecret: storedSecret || LOGO_DEFAULT_CLIENT_SECRET,
    });
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
    logoContextValidatedAt = 0;
    logoLastValidatedContextKey = '';
    return;
  }
  sessionStorage.setItem(STORAGE_SESSION, JSON.stringify(session));
}

/** Paralel logoListResource çağrılarında tek oturum doğrulaması */
let logoEnsureSessionInflight: Promise<LogoRestSession> | null = null;
let logoContextValidatedAt = 0;
let logoLastValidatedContextKey = '';
const LOGO_CONTEXT_VALIDATE_TTL_MS = 90_000;

function logoContextValidationKey(ctx: LogoContextSelection, cfg: LogoRestConfig): string {
  return `${normalizeBaseUrl(cfg.baseUrl)}|${ctx.logoDb}|${ctx.firmNr}|${ctx.periodNr}`;
}

function markLogoContextValidated(ctx: LogoContextSelection, cfg: LogoRestConfig): void {
  logoContextValidatedAt = Date.now();
  logoLastValidatedContextKey = logoContextValidationKey(ctx, cfg);
}

function isLogoContextRecentlyValidated(ctx: LogoContextSelection, cfg: LogoRestConfig): boolean {
  return (
    logoLastValidatedContextKey === logoContextValidationKey(ctx, cfg) &&
    Date.now() - logoContextValidatedAt < LOGO_CONTEXT_VALIDATE_TTL_MS
  );
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 240_000);
  const payload = {
    baseUrl: normalizeBaseUrl(baseUrl),
    method,
    path: path.startsWith('/') ? path : `/${path}`,
    headers: opts.headers || {},
    body: opts.body,
    query: opts.query || {},
  };
  const triedPaths: string[] = [];
  let lastNetworkError = 'Failed to fetch';

  try {
    for (const proxyPath of LOGO_BRIDGE_PROXY_PATHS) {
      triedPaths.push(`${bridge}${proxyPath}`);
      try {
        const res = await postLogoBridgeProxy(bridge, proxyPath, payload, controller.signal);
        if (res.status === 404) continue;
        return res;
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : String(e);
        const isNetwork =
          raw === 'Failed to fetch' ||
          raw.includes('NetworkError') ||
          raw.includes('aborted') ||
          raw.includes('AbortError');
        if (!isNetwork) throw e instanceof Error ? e : new Error(raw);
        lastNetworkError = raw;
      }
    }

    const status = await fetchLogoBridgeStatus(bridge);
    if (!status.ok) {
      throw new Error(
        `PostgreSQL köprüsü yanıt vermiyor (${bridge}/api/status). retailex_bridge konteynerini yeniden başlatın.`
      );
    }
    throw new Error(formatLogoBridgeFetchError(bridge, lastNetworkError, triedPaths));
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('PostgreSQL köprüsü')) throw e;
    if (e instanceof Error && e.message.includes('Logo REST köprüsüne')) throw e;
    const raw = e instanceof Error ? e.message : String(e);
    const isNetwork =
      raw === 'Failed to fetch' ||
      raw.includes('NetworkError') ||
      raw.includes('aborted') ||
      raw.includes('AbortError');
    if (isNetwork) {
      const status = await fetchLogoBridgeStatus(bridge);
      if (!status.ok) {
        throw new Error(
          `PostgreSQL köprüsü yanıt vermiyor (${bridge}/api/status). retailex_bridge konteynerini yeniden başlatın.`
        );
      }
      throw new Error(formatLogoBridgeFetchError(bridge, raw, triedPaths.length ? triedPaths : LOGO_BRIDGE_PROXY_PATHS.map((p) => `${bridge}${p}`)));
    }
    throw e instanceof Error ? e : new Error(raw);
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Web modunda senkron öncesi köprü erişilebilirliği */
export async function ensureLogoBridgeReachable(): Promise<void> {
  if (IS_TAURI) return;
  const bridge = getBridgeUrl();
  const status = await fetchLogoBridgeStatus(bridge);
  if (!status.ok) {
    throw new Error(
      `PostgreSQL köprüsü yanıt vermiyor (${bridge}/api/status). retailex_bridge konteynerini yeniden başlatın.`
    );
  }
  if (status.logoProxy === false) {
    throw new Error('Köprü sürümü Logo proxy desteklemiyor. retailex_bridge redeploy edin.');
  }

  const probeBody = {
    baseUrl: 'http://127.0.0.1:1/api/v1',
    method: 'GET',
    path: '/',
  };
  let proxyOk = false;
  for (const proxyPath of LOGO_BRIDGE_PROXY_PATHS) {
    try {
      const probe = await postLogoBridgeProxy(bridge, proxyPath, probeBody, AbortSignal.timeout(15_000));
      if (probe.status !== 404) {
        proxyOk = true;
        break;
      }
    } catch {
      /* sonraki yolu dene */
    }
  }
  if (!proxyOk) {
    throw new Error(
      `Logo proxy route bulunamadı (${LOGO_BRIDGE_PROXY_PATHS.join(', ')}). retailex_bridge güncelleyin.`
    );
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

  if (useBridge && data && typeof data === 'object' && data !== null && 'proxy' in data) {
    const wrapped = data as { proxy: { ok: boolean; status: number; data: unknown; text: string } };
    return wrapped.proxy;
  }

  if (useBridge && !res.ok && data && typeof data === 'object' && data !== null && 'error' in data) {
    return { ok: false, status: res.status, data, text };
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

  const clientId = cfg.clientId.trim();
  const clientSecret = cfg.clientSecret || '';

  const tokenBody = new URLSearchParams({
    grant_type: 'password',
    username: cfg.username.trim(),
    password: cfg.password,
    firmno: String(fNr),
  });
  if (ctx.logoDb) tokenBody.set('logodb', ctx.logoDb);

  const tokenHeaders: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  /**
   * Logo REST token (Postman: grant_type=password&username&firmno&password).
   * 185.206.80.132 kurulumu Secret Post ister: client_id + client_secret gövdede.
   * Eski kurulumlar için Basic Authorization yedek denenir.
   */
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
      headers: { ...tokenHeaders, Authorization: basicAuth(clientId, clientSecret) },
      body: tokenBody.toString(),
    });
  }

  if (!tokenRes.ok && clientId && clientSecret) {
    const err = tokenRes.data as { error?: string };
    if (err?.error === 'invalid_client') {
      const basicBody = new URLSearchParams(tokenBody);
      tokenRes = await logoHttp(baseUrl, 'POST', '/token', {
        headers: {
          ...tokenHeaders,
          Authorization: basicAuth(clientId, clientSecret),
        },
        body: basicBody.toString(),
      });
    }
  }

  if (!tokenRes.ok) {
    throw new Error(formatLogoHttpFailure(baseUrl, tokenRes.status, tokenRes.data, tokenRes.text));
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
    markLogoContextValidated(resolveLogoContext(cfg), cfg);
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
      markLogoContextValidated(resolveLogoContext(cfg), cfg);
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
  markLogoContextValidated(resolveLogoContext(cfg), cfg);
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

async function logoEnsureSessionInner(cfg: LogoRestConfig): Promise<LogoRestSession> {
  const baseUrl = requireBaseUrl(cfg);
  assertLogoReachableInWebContext(baseUrl);
  const ctx = resolveLogoContext(cfg);
  const existing = loadLogoRestSession();
  if (existing && Date.now() < existing.expiresAt && sessionMatchesContext(existing, ctx, cfg)) {
    if (isLogoContextRecentlyValidated(ctx, cfg)) {
      return existing;
    }
    // Firma kataloğu (CAPI/Firms) CompanyLogout sonrası token geçerli kalır; Logo tarafında firma oturumu kapanmış olabilir.
    try {
      const current = await logoGetCurrentFirmPeriod(cfg, existing);
      if (current.firm === ctx.firmNr && current.period === ctx.periodNr) {
        markLogoContextValidated(ctx, cfg);
        return existing;
      }
    } catch {
      /* CurrentFirm/Period okunamadı — yeniden CompanyLogin */
    }
    return logoCompanyLogin(cfg, existing, ctx.firmNr, ctx.periodNr);
  }
  return logoAuthenticate(cfg, ctx.firmNr, ctx.periodNr);
}

/** Logo REST oturumunu hazırlar; paralel isteklerde tek doğrulama paylaşılır. */
export async function logoEnsureSession(cfg: LogoRestConfig): Promise<LogoRestSession> {
  if (logoEnsureSessionInflight) {
    const session = await logoEnsureSessionInflight;
    const ctx = resolveLogoContext(cfg);
    if (sessionMatchesContext(session, ctx, cfg)) return session;
  }

  const task = logoEnsureSessionInner(cfg);
  logoEnsureSessionInflight = task;
  try {
    return await task;
  } finally {
    if (logoEnsureSessionInflight === task) logoEnsureSessionInflight = null;
  }
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
  const baseUrl = requireBaseUrl(cfg);
  assertLogoReachableInWebContext(baseUrl);
  const tokenFirm = getLogoMappingForErp(cfg)?.logoFirmNr ?? logoFirmNrFromErp();
  const session = await logoObtainToken(cfg, tokenFirm > 0 ? tokenFirm : 1);
  const auth = { Authorization: `Bearer ${session.accessToken}` };
  const apiKey = cfg.clientId || LOGO_DEFAULT_CLIENT_ID;
  const query = { api_key: apiKey, expandLevel: 'full' };
  const path = '/methods/CAPI/Firms';

  // CAPI firma listesi firma oturumundan bağımsız; aktif CompanyLogin bazen yanıtı geciktirir.
  await logoCompanyLogout(cfg, session);
  saveLogoRestSession(null);

  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await logoHttp(baseUrl, 'GET', path, { headers: auth, query });
    if (res.ok) {
      const firms = parseLogoFirmsResponse(res.data);
      if (firms.length > 0) return firms;
      lastErr = `${path} boş firma listesi`;
      break;
    }

    const upstream =
      res.data && typeof res.data === 'object'
        ? String((res.data as { upstreamError?: string; Message?: string }).upstreamError
            || (res.data as { Message?: string }).Message
            || '')
        : '';
    const statusLabel = res.status > 0 ? String(res.status) : '0';
    lastErr = upstream
      ? `${path} HTTP ${statusLabel} — ${upstream}`
      : `${path} HTTP ${statusLabel}`;

    if (attempt === 0 && (res.status === 0 || res.status >= 500)) {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    break;
  }

  throw new Error(
    lastErr
      ? `Logo firma listesi alınamadı: ${lastErr}. Bu Logo kurulumunda doğru uç GET /methods/CAPI/Firms; GetFirms yoktur. Logo LObjects (REST servisi) çalışıyor mu kontrol edin.`
      : 'Logo firma listesi boş döndü. GET /methods/CAPI/Firms yanıtını kontrol edin.'
  );
}

export async function logoCheckDatabase(cfg: LogoRestConfig, dbName: string): Promise<boolean> {
  const session = await logoObtainToken(cfg, 1);
  const baseUrl = requireBaseUrl(cfg);
  const res = await logoHttp(baseUrl, 'GET', `/methods/CheckLogoDB/${encodeURIComponent(dbName)}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  return res.ok && res.data === true;
}

function parseLogoDbList(data: unknown): string[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (!item || typeof item !== 'object') return '';
        const o = item as Record<string, unknown>;
        return String(o.Name ?? o.name ?? o.DBName ?? o.dbName ?? o.Database ?? o.database ?? '').trim();
      })
      .filter(Boolean);
  }
  if (typeof data !== 'object') return [];
  const root = data as Record<string, unknown>;
  const candidates = [root.Item, root.item, root.items, root.Items, root.List, root.list, root.databases, root.Databases];
  for (const c of candidates) {
    const parsed = parseLogoDbList(c);
    if (parsed.length > 0) return parsed;
  }
  const single = String(root.Name ?? root.name ?? root.DBName ?? '').trim();
  return single ? [single] : [];
}

/** Logo REST üzerinden bilinen veritabanı adlarını toplar (çoklu DB). */
export async function logoListDatabases(cfg: LogoRestConfig): Promise<string[]> {
  const baseUrl = requireBaseUrl(cfg);
  assertLogoReachableInWebContext(baseUrl);
  const tokenFirm = getLogoMappingForErp(cfg)?.logoFirmNr ?? logoFirmNrFromErp();
  const session = await logoObtainToken(cfg, tokenFirm > 0 ? tokenFirm : 1);
  const auth = { Authorization: `Bearer ${session.accessToken}` };
  const discovered = new Set<string>();
  if (session.logoDb?.trim()) discovered.add(session.logoDb.trim());
  if (cfg.logoDb?.trim()) discovered.add(cfg.logoDb.trim());
  (cfg.logoDbs || []).forEach((d) => d?.trim() && discovered.add(d.trim()));

  const paths = ['/methods/CAPI/Databases', '/methods/GetLogoDBs', '/methods/CAPI/LogoDBs'];
  for (const path of paths) {
    try {
      const res = await logoHttp(baseUrl, 'GET', path, { headers: auth });
      if (!res.ok) continue;
      parseLogoDbList(res.data).forEach((n) => discovered.add(n));
      if (discovered.size > 0) break;
    } catch {
      /* sonraki uç */
    }
  }

  return [...discovered].filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr'));
}

export function saveLogoDatabaseList(cfg: LogoRestConfig, dbs: string[]): LogoRestConfig {
  const merged = Array.from(
    new Set([...(cfg.logoDbs || []), ...(dbs || []), cfg.logoDb].filter((x) => x && String(x).trim()))
  ) as string[];
  const next: LogoRestConfig = {
    ...cfg,
    logoDbs: merged,
    logoDb: cfg.logoDb || merged[0] || '',
  };
  saveLogoRestConfig(next);
  return next;
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
  databases?: string[];
  error?: string;
}> {
  try {
    const ctx = resolveLogoContext(cfg);
    const session = await logoAuthenticate(cfg, ctx.firmNr, ctx.periodNr);
    const baseUrl = requireBaseUrl(cfg);
    const auth = { Authorization: `Bearer ${session.accessToken}` };

    const firmRes = await logoHttp(baseUrl, 'GET', '/methods/CurrentFirm', { headers: auth });
    const periodRes = await logoHttp(baseUrl, 'GET', '/methods/CurrentPeriod', { headers: auth });

    let databases: string[] = [];
    try {
      databases = await logoListDatabases(cfg);
      if (databases.length > 0) {
        saveLogoDatabaseList(cfg, databases);
      }
    } catch {
      /* DB listesi opsiyonel */
    }

    return {
      ok: true,
      session,
      context: ctx,
      databases,
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

export type LogoArpBalanceRow = {
  balance: number;
  debit: number;
  credit: number;
};

function logoNumVal(v: unknown, fallback = 0): number {
  if (v == null || v === '') return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function logoSqlLit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function logoSqlFirmPeriod(firmNr: number, periodNr: number): { firm: string; period: string } {
  return {
    firm: String(firmNr).replace(/\D/g, '').padStart(3, '0') || '001',
    period: String(periodNr).replace(/\D/g, '').padStart(2, '0') || '01',
  };
}

function parseLogoTsqlRows(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  if (Array.isArray(data)) {
    return data.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
  }
  if (typeof data !== 'object') return [];
  const o = data as Record<string, unknown>;
  for (const key of ['rows', 'Rows', 'items', 'Items', 'data', 'Data', 'result', 'Result']) {
    const parsed = parseLogoTsqlRows(o[key]);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

/** Logo REST TSQL sorgusu — stok (STINVTOT) ve cari bakiye (CLFLINE) için */
export async function logoRunTsql(
  cfg: LogoRestConfig,
  tsql: string
): Promise<Record<string, unknown>[]> {
  const session = await logoEnsureSession(cfg);
  const baseUrl = requireBaseUrl(cfg);
  const paths = ['/queries', '/methods/queries'];
  let lastErr = '';

  for (const path of paths) {
    const res = await logoHttp(baseUrl, 'GET', path, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      query: { tsql },
    });
    if (res.ok) return parseLogoTsqlRows(res.data);
    const err = res.data as { message?: string; Message?: string };
    lastErr = err?.message || err?.Message || `HTTP ${res.status}`;
    if (res.status !== 404) break;
  }

  throw new Error(lastErr || 'Logo TSQL sorgusu başarısız');
}

/** Malzeme eldeki miktar — Logo items REST kartında ONHAND yok; STINVTOT görünümünden okunur */
export async function logoFetchItemStockMap(
  cfg: LogoRestConfig,
  codes?: string[]
): Promise<Map<string, number>> {
  const ctx = resolveLogoContext(cfg);
  const { firm, period } = logoSqlFirmPeriod(ctx.firmNr, ctx.periodNr);
  const itemsTable = `LG_${firm}_ITEMS`;
  const stockTables = [`LV_${firm}_${period}_STINVTOT`, `LG_${firm}_${period}_STINVTOT`];

  let codeFilter = '';
  if (codes?.length) {
    const safe = codes.map((c) => logoSqlLit(c.trim())).join(',');
    codeFilter = ` AND I.CODE IN (${safe})`;
  }

  for (const stockTable of stockTables) {
    const tsql = `SELECT I.CODE AS CODE, SUM(ISNULL(S.ONHAND,0)) AS ONHAND
      FROM ${stockTable} S
      INNER JOIN ${itemsTable} I ON S.STOCKREF = I.LOGICALREF
      WHERE 1=1${codeFilter}
      GROUP BY I.CODE`;
    try {
      const rows = await logoRunTsql(cfg, tsql);
      const map = new Map<string, number>();
      for (const row of rows) {
        const code = String(row.CODE ?? row.code ?? '').trim();
        if (!code) continue;
        map.set(code, logoNumVal(row.ONHAND ?? row.onhand ?? row.STOCK ?? row.stock, 0));
      }
      if (map.size > 0 || !codes?.length) return map;
    } catch {
      /* sonraki tablo adı */
    }
  }

  return new Map();
}

/** Cari bakiye — Logo Arps REST kartında bakiye yok; CLFLINE hareketlerinden hesaplanır */
export async function logoFetchArpBalanceMap(
  cfg: LogoRestConfig,
  codes?: string[]
): Promise<Map<string, LogoArpBalanceRow>> {
  const ctx = resolveLogoContext(cfg);
  const { firm, period } = logoSqlFirmPeriod(ctx.firmNr, ctx.periodNr);
  const clcard = `LG_${firm}_CLCARD`;
  const clfline = `LG_${firm}_${period}_CLFLINE`;

  let codeFilter = '';
  if (codes?.length) {
    const safe = codes.map((c) => logoSqlLit(c.trim())).join(',');
    codeFilter = ` AND C.CODE IN (${safe})`;
  }

  const tsql = `SELECT C.CODE AS CODE,
      SUM(CASE WHEN L.SIGN = 0 THEN L.AMOUNT ELSE 0 END) AS DEBIT,
      SUM(CASE WHEN L.SIGN = 1 THEN L.AMOUNT ELSE 0 END) AS CREDIT,
      SUM(CASE WHEN L.SIGN = 0 THEN L.AMOUNT ELSE -L.AMOUNT END) AS BALANCE
    FROM ${clcard} C
    INNER JOIN ${clfline} L ON L.CLIENTREF = C.LOGICALREF
    WHERE ISNULL(L.CANCELLED,0) = 0${codeFilter}
    GROUP BY C.CODE`;

  try {
    const rows = await logoRunTsql(cfg, tsql);
    const map = new Map<string, LogoArpBalanceRow>();
    for (const row of rows) {
      const code = String(row.CODE ?? row.code ?? '').trim();
      if (!code) continue;
      map.set(code, {
        debit: logoNumVal(row.DEBIT ?? row.debit, 0),
        credit: logoNumVal(row.CREDIT ?? row.credit, 0),
        balance: logoNumVal(row.BALANCE ?? row.balance, 0),
      });
    }
    return map;
  } catch {
    return new Map();
  }
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
