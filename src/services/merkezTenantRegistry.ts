/**
 * merkez_db.tenant_registry üzerinden kiracı çözümleme (PostgREST).
 * Uygulama henüz hedef kiracıya bağlı değilken merkez URL'sine doğrudan fetch yapılır.
 */

import { fetchRetailexAware } from '../utils/retailexDevProxy';
import { normalizeLogoRestBaseUrl } from './logoRestApi';

export type TenantRegistryRow = {
  id: string;
  code: string;
  display_name: string;
  module: string;
  database_name: string;
  connection_provider: 'db' | 'rest_api';
  rest_base_url: string | null;
  db_host: string | null;
  db_port: number | null;
  db_user: string | null;
  db_pass: string | null;
  db_sslmode: string | null;
  scale_bridge_url?: string | null;
  scale_bridge_token?: string | null;
  logo_rest_api_url?: string | null;
  notes?: string | null;
  is_active?: boolean;
  eticaret_settings?: Record<string, unknown> | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedTenantConnection =
  | { kind: 'registry_code'; code: string }
  | { kind: 'direct_postgrest'; url: string; pathSlug: string | null };

/**
 * Tek satır giriş: kiracı kodu / UUID veya doğrudan kiracı PostgREST tabanı (`https://.../aqua`).
 * Merkez kayıt kökü (`.../merkez`) buraya yazılmamalı — ayrı "Gelişmiş" alanı kullanılır.
 */
export function parseTenantConnectionLine(raw: string): ParsedTenantConnection {
  const t = (raw || '').trim();
  if (!t) throw new Error('Kiracı bağlantısı boş olamaz.');

  if (/^https?:\/\//i.test(t)) {
    const sanitized = sanitizeMerkezRestUrlInput(t);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(sanitized);
    } catch {
      throw new Error('Geçerli bir http(s) adresi girin.');
    }
    const pathParts = parsedUrl.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (pathParts.length === 0) {
      throw new Error(
        'Adreste kiracı yolu yok. Örnek: https://api.retailex.app/aqua — veya yalnızca kiracı kodunu girin.'
      );
    }
    const last = pathParts[pathParts.length - 1]!;
    if (last === 'merkez') {
      throw new Error(
        'Bu adres merkez kayıt servisidir. Kiracı için kiracı kodunu girin veya tam kiracı API adresini (örn. .../aqua) yazın; merkez tabanını aşağıdaki Gelişmiş alanından ayarlayın.'
      );
    }
    const pathSlug =
      last && (UUID_RE.test(last) || /^[a-zA-Z0-9_.-]+$/.test(last)) ? last : null;
    const url = normalizeBaseUrl(parsedUrl.toString());
    return { kind: 'direct_postgrest', url, pathSlug };
  }

  return { kind: 'registry_code', code: t };
}

/** Doğrudan PostgREST URL ile config parçası (tenant_registry sorgusu yok). */
export function buildDirectPostgrestTenantPatch(input: {
  url: string;
  pathSlug: string | null;
}): Record<string, unknown> {
  const u = normalizeBaseUrl(input.url);
  const slug = (input.pathSlug || '').trim();
  const idFromSlug = slug && UUID_RE.test(slug) ? slug : '';
  const codeFromSlug = slug && !idFromSlug ? slug : '';
  let parsedHost = '';
  let parsedPort = 5432;
  try {
    const parsed = new URL(u);
    parsedHost = parsed.hostname;
    if (parsed.port) parsedPort = Number(parsed.port) || 5432;
    else if (parsed.protocol === 'https:') parsedPort = 443;
    else if (parsed.protocol === 'http:') parsedPort = 80;
  } catch {
    /* ignore */
  }
  const syncUrls = resolveTenantSyncUrls({
    merkez_tenant_code: codeFromSlug,
    remote_rest_url: u,
  });

  return {
    is_configured: true,
    db_mode: 'online',
    system_type: 'retail',
    enabled_modules: ['pos', 'wms'],
    connection_provider: 'rest_api',
    remote_rest_url: u,
    // Direct URL akışında URL slug'ı (örn. `/aqua`) gerçek PostgreSQL database_name olmayabilir.
    // Bu yüzden remote_db alanını slug'dan türetmiyoruz.
    remote_host: parsedHost || undefined,
    remote_port: parsedPort,
    remote_db: undefined,
    merkez_tenant_code: codeFromSlug || undefined,
    merkez_tenant_id: idFromSlug || undefined,
    merkez_display_name: codeFromSlug || idFromSlug || u,
    central_ws_url: syncUrls.central_ws_url || undefined,
    central_api_url: syncUrls.central_api_url || undefined,
  };
}

function normalizeBaseUrl(input: string): string {
  return (input || '').trim().replace(/\/+$/, '');
}

function ensureUrlProtocol(input: string): string {
  const s = (input || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${s}`;
  }
  return `http://${s}`;
}

/** RetailEX SaaS kiracı PostgREST kökü — Caddy’de `/kiracı_kodu` tek segment. */
export const DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN = 'https://api.retailex.app';

export type ParsedSaaSOrCustomPostgrestUrl =
  | { kind: 'saas_single_slug'; slug: string }
  | { kind: 'other'; url: string };

/**
 * Kayıtlı `remote_rest_url`: yalnızca `https://api.retailex.app/{kiracı}` ise slug’a ayrıştırır.
 * `/merkez` veya çok segmentli yollar “özel” kabul edilir.
 */
export function parseSaaSOrCustomPostgrestUrl(raw: string): ParsedSaaSOrCustomPostgrestUrl {
  const t = normalizeBaseUrl(String(raw || '').trim());
  if (!t) return { kind: 'other', url: '' };
  let urlObj: URL;
  try {
    urlObj = new URL(/^https?:\/\//i.test(t) ? t : ensureUrlProtocol(t));
  } catch {
    return { kind: 'other', url: t };
  }
  if (urlObj.hostname === 'api.retailex.app') {
    const segs = urlObj.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segs.length === 1 && segs[0] && segs[0] !== 'merkez') {
      return { kind: 'saas_single_slug', slug: segs[0] };
    }
  }
  return { kind: 'other', url: normalizeBaseUrl(urlObj.toString()) };
}

export function buildSaaSTenantPostgrestUrl(slug: string): string {
  const o = normalizeBaseUrl(DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN);
  const s = String(slug || '').trim().replace(/^\/+|\/+$/g, '');
  if (!s) return o;
  return `${o}/${s}`;
}

/**
 * Kök `https://api.retailex.app` + kiracı kodu → `.../lovan` (PostgREST/Caddy uyumu).
 */
export function resolveEffectiveRemoteRestUrl(
  remoteRestUrl?: string,
  merkezTenantCode?: string,
): string {
  const remote = normalizeBaseUrl(String(remoteRestUrl ?? '').trim());
  if (!remote) return remote;
  const parsed = parseSaaSOrCustomPostgrestUrl(remote);
  if (parsed.kind === 'saas_single_slug') return remote;

  const tenant = String(merkezTenantCode ?? '').trim();
  if (!tenant || tenant === 'merkez') return remote;

  try {
    const urlObj = new URL(/^https?:\/\//i.test(remote) ? remote : ensureUrlProtocol(remote));
    if (urlObj.hostname !== 'api.retailex.app') return remote;
    const segs = urlObj.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segs.length === 0) {
      return buildSaaSTenantPostgrestUrl(tenant);
    }
  } catch {
    /* geçersiz URL — olduğu gibi bırak */
  }
  return remote;
}

/** Kiracı kodundan merkez WebSocket URL — örn. lovan → wss://api.retailex.app/lovan/ws */
export function buildTenantCentralWsUrl(tenantCode: string): string {
  const code = String(tenantCode || '').trim().replace(/^\/+|\/+$/g, '');
  if (!code || code === 'merkez') return '';
  const origin = normalizeBaseUrl(DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN);
  const wsOrigin = origin.replace(/^http/i, 'ws');
  return `${wsOrigin}/${code}/ws`;
}

/** Kiracı kodundan merkez senkron REST API — örn. lovan → https://api.retailex.app/lovan/sync */
export function buildTenantCentralApiUrl(tenantCode: string): string {
  const code = String(tenantCode || '').trim().replace(/^\/+|\/+$/g, '');
  if (!code || code === 'merkez') return '';
  return `${normalizeBaseUrl(DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN)}/${code}/sync`;
}

export type TenantSyncUrlInput = {
  merkez_tenant_code?: string | null;
  remote_rest_url?: string | null;
  central_ws_url?: string | null;
  central_api_url?: string | null;
};

/** Kiracı kodu veya PostgREST slug ile merkez WS/REST adreslerini türetir. */
export function resolveTenantSyncUrls(input: TenantSyncUrlInput): {
  central_ws_url: string;
  central_api_url: string;
} {
  const explicitWs = String(input.central_ws_url || '').trim();
  const explicitApi = String(input.central_api_url || '').trim();
  if (explicitWs && explicitApi) {
    return { central_ws_url: explicitWs, central_api_url: explicitApi };
  }

  const code = String(input.merkez_tenant_code || '').trim();
  if (code) {
    return {
      central_ws_url: explicitWs || buildTenantCentralWsUrl(code),
      central_api_url: explicitApi || buildTenantCentralApiUrl(code),
    };
  }

  const rest = String(input.remote_rest_url || '').trim();
  if (rest) {
    const parsed = parseSaaSOrCustomPostgrestUrl(rest);
    if (parsed.kind === 'saas_single_slug') {
      return {
        central_ws_url: explicitWs || buildTenantCentralWsUrl(parsed.slug),
        central_api_url: explicitApi || buildTenantCentralApiUrl(parsed.slug),
      };
    }
  }

  return {
    central_ws_url: explicitWs,
    central_api_url: explicitApi,
  };
}

/**
 * Modal / .env satırı yanlış yapıştırıldığında: `VITE_MERKEZ_REST_URL=http://host:3002` → sadece URL.
 */
export function sanitizeMerkezRestUrlInput(input: string): string {
  let s = (input || '').trim();
  s = s.replace(/^['"]+|['"]+$/g, '');
  const m = s.match(/^VITE_MERKEZ_REST_URL\s*=\s*(.+)$/i);
  if (m) s = m[1].trim();
  s = s.replace(/^['"]+|['"]+$/g, '');
  return ensureUrlProtocol(s.trim());
}

/** SaaS’ta PostgREST çoğunlukla /merkez altında; sadece kök host yazıldıysa path eklenir (yerel :3002 kökü bozulmaz). */
const MERKEZ_SUBPATH_DEFAULT_HOSTS = new Set(['api.retailex.app']);

/**
 * Modal / .env değerini tenant_registry isteği için son biçime getirir.
 * Örn. `https://api.retailex.app` → `https://api.retailex.app/merkez` (Caddy / SaaS düzeni).
 */
export function finalizeMerkezRestBaseUrl(input: string): string {
  const sanitized = sanitizeMerkezRestUrlInput(input);
  if (!sanitized) return '';
  try {
    const u = new URL(sanitized);
    const pathOnly = u.pathname.replace(/\/+$/, '') || '/';
    if (MERKEZ_SUBPATH_DEFAULT_HOSTS.has(u.hostname) && pathOnly === '/') {
      u.pathname = '/merkez';
    }
    return normalizeBaseUrl(u.toString());
  } catch {
    return normalizeBaseUrl(sanitized);
  }
}

/**
 * Öncelik: VITE_MERKEZ_REST_URL → localStorage merkez_postgrest_base_url → localhost:3002
 * veya aynı hostname üzerinde :3002 (merkez varsayılan portu).
 */
export function getMerkezRestBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    ?.VITE_MERKEZ_REST_URL;
  if (env && String(env).trim()) {
    return finalizeMerkezRestBaseUrl(String(env));
  }

  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('merkez_postgrest_base_url');
    if (stored?.trim()) return finalizeMerkezRestBaseUrl(stored);

    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:3002';
    return `${window.location.protocol}//${host}:3002`;
  }

  return 'http://127.0.0.1:3002';
}

function moduleToSystemType(module: string): 'retail' | 'market' | 'wms' | 'restaurant' | 'beauty' | 'bayi' {
  const m = String(module || '').toLowerCase().trim();
  switch (m) {
    case 'clinic':
      return 'beauty';
    case 'restaurant':
      return 'restaurant';
    case 'wms':
      return 'wms';
    case 'all':
    case 'full':
    case 'complete':
      return 'bayi';
    case 'retail':
      return 'retail';
    case 'pdks':
    case 'hrm':
      return 'retail';
    default:
      return 'retail';
  }
}

/**
 * `tenant_registry.module` → ana kabukta hangi modül sekmeleri (mavi alan) açık olsun.
 * `retailex_enabled_modules` / web_config.enabled_modules ile uyumlu id'ler: pos, management, wms, mobile-pos, restaurant, beauty.
 * Yönetim sekmesi `isMainModuleVisible` ile her zaman görünür; burada listelemek isteğe bağlı (sıra için).
 */
/** tenant_registry.module → MainLayout başlangıç kabuğu */
export function preferredShellModuleForTenantModule(module: string): string {
  const m = String(module || '').toLowerCase();
  if (m === 'clinic') return 'beauty';
  if (m === 'restaurant') return 'restaurant';
  if (m === 'retail') return 'management';
  if (m === 'pdks' || m === 'hrm' || m === 'tenant_registry') return 'management';
  if (m === 'wms') return 'wms';
  if (m === 'all' || m === 'full' || m === 'complete' || m === 'demo') return 'management';
  return '';
}

async function queryTenantRegistryRows(filter: string): Promise<TenantRegistryRow[]> {
  const base = normalizeBaseUrl(getMerkezRestBaseUrl());
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && /^http:\/\//i.test(base)) {
    throw new Error(
      `HTTPS sayfada HTTP merkez adresi kullanılamaz: ${base}. HTTPS bir API domaini kullanın veya geçici test için HTTP web adresinden açın.`
    );
  }

  const url = `${base}/tenant_registry?${filter}&select=*`;
  let res: Response;
  try {
    res = await fetchRetailexAware(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      'Adres: ' +
      base +
      ' — Ağ/CORS: tarayıcıda localhost + Vite `__retailex-api` proxy; masaüstünde Tauri HTTP. Merkez URL https://api.../merkez; .env ile VITE_MERKEZ_REST_URL tanımlanabilir.';
    throw new Error(`Merkeze erişilemedi (${msg}). ${hint}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Merkez sorgusu başarısız (${res.status}): ${text || res.statusText}`);
  }

  const rows = (await res.json()) as TenantRegistryRow[];
  return Array.isArray(rows) ? rows : [];
}

function validateTenantRegistryRow(row: TenantRegistryRow): TenantRegistryRow {
  if (row.is_active === false) {
    throw new Error('Bu kiracı kaydı pasif (is_active = false).');
  }

  const provider = row.connection_provider === 'db' ? 'db' : 'rest_api';
  if (provider === 'rest_api') {
    const ru = (row.rest_base_url || '').trim();
    if (!ru) {
      throw new Error(
        'Kiracı için rest_base_url tanımlı değil. merkez_db.tenant_registry satırında rest_base_url doldurun.'
      );
    }
  } else if (!row.db_host?.trim() || !row.database_name?.trim()) {
    throw new Error('db modu için db_host ve database_name zorunludur.');
  }

  return { ...row, connection_provider: provider };
}

/**
 * Doğrudan PostgREST URL (/aqua) ile bağlanırken merkez kaydından modül çözümle.
 * Örn. aqua_beauty: module=clinic — aksi halde buildDirectPostgrestTenantPatch retail varsayar.
 */
export async function resolveTenantRegistryForDirectPostgrest(input: {
  url: string;
  pathSlug?: string | null;
}): Promise<TenantRegistryRow | null> {
  const normalizedUrl = normalizeBaseUrl(input.url);
  const slug = (input.pathSlug || '').trim();

  const attempts: string[] = [];
  if (normalizedUrl) {
    attempts.push(`rest_base_url=eq.${encodeURIComponent(normalizedUrl)}`);
  }
  if (slug) {
    if (UUID_RE.test(slug)) {
      attempts.push(`id=eq.${encodeURIComponent(slug)}`);
    } else {
      attempts.push(`code=eq.${encodeURIComponent(slug)}`);
      attempts.push(`database_name=eq.${encodeURIComponent(slug)}`);
    }
  }

  for (const filter of attempts) {
    const rows = await queryTenantRegistryRows(filter);
    const active = rows.find((r) => r.is_active !== false);
    if (active) return validateTenantRegistryRow(active);
  }

  return null;
}

/** Üst kabukta açılabilecek tüm iş + yönetim modülleri (demo / full kiracı). */
export const ALL_SHELL_MODULES = [
  'pos',
  'management',
  'wms',
  'mobile-pos',
  'restaurant',
  'beauty',
] as const;

export function shellEnabledModulesForTenantRegistryModule(module: string): string[] {
  const m = String(module || '').toLowerCase().trim();
  if (
    m === 'all' ||
    m === 'full' ||
    m === 'complete' ||
    m === 'demo' ||
    m.includes('all') ||
    m.includes('full')
  ) {
    return [...ALL_SHELL_MODULES];
  }
  switch (m) {
    case 'clinic':
      return ['beauty'];
    case 'restaurant':
      return ['pos', 'restaurant'];
    case 'wms':
      return ['wms'];
    case 'retail':
    case 'market':
      return ['pos', 'wms'];
    case 'pdks':
    case 'hrm':
      return ['management'];
    case 'tenant_registry':
      return ['management'];
    default:
      return ['pos', 'wms'];
  }
}

export async function fetchTenantRegistryRow(tenantInput: string): Promise<TenantRegistryRow> {
  const q = tenantInput.trim();
  if (!q) throw new Error('Kiracı kodu veya ID boş olamaz.');

  const filter = UUID_RE.test(q) ? `id=eq.${encodeURIComponent(q)}` : `code=eq.${encodeURIComponent(q)}`;
  const rows = await queryTenantRegistryRows(filter);
  if (rows.length === 0) {
    throw new Error('Kiracı bulunamadı (tenant_registry). Kod veya UUID kontrol edin.');
  }

  return validateTenantRegistryRow(rows[0]!);
}

/** Tauri + web localStorage ile uyumlu tam config parçası */
export function tenantRowToAppConfigPatch(
  row: TenantRegistryRow,
  options?: { preserveDbPassword?: string; forTauri?: boolean }
): Record<string, unknown> {
  const provider = row.connection_provider;
  const system_type = moduleToSystemType(row.module);
  const preserve = options?.preserveDbPassword ?? '';
  const forTauri = options?.forTauri === true;

  const patch: Record<string, unknown> = {
    is_configured: true,
    db_mode: 'online',
    system_type,
    tenant_module: row.module,
    enabled_modules: shellEnabledModulesForTenantRegistryModule(row.module),
    connection_provider: provider,
    merkez_tenant_code: row.code,
    merkez_tenant_id: row.id,
    merkez_display_name: row.display_name,
  };

  const logoRestUrl = (row.logo_rest_api_url || '').trim();
  if (logoRestUrl) patch.logo_rest_api_url = normalizeLogoRestBaseUrl(logoRestUrl);

  const host = (row.db_host || '').trim() || '127.0.0.1';
  const port = row.db_port && row.db_port > 0 ? row.db_port : 5432;
  const dbn = row.database_name;
  const user = (row.db_user || '').trim() || 'postgres';
  const pass =
    row.db_pass != null && String(row.db_pass) !== '' ? String(row.db_pass) : preserve;

  const syncUrls = resolveTenantSyncUrls({
    merkez_tenant_code: row.code,
    remote_rest_url: row.rest_base_url || '',
  });
  if (syncUrls.central_ws_url) patch.central_ws_url = syncUrls.central_ws_url;
  if (syncUrls.central_api_url) patch.central_api_url = syncUrls.central_api_url;

  if (provider === 'rest_api') {
    patch.remote_rest_url = normalizeBaseUrl(row.rest_base_url || '');
    patch.connection_provider = 'rest_api';
    patch.remote_host = host;
    patch.remote_port = port;
    patch.pg_remote_user = user;
    if (pass) patch.pg_remote_pass = pass;
    patch.remote_db = forTauri ? `${host}:${port}/${dbn}` : dbn;
  } else {
    patch.connection_provider = 'db';
    patch.remote_rest_url = '';
    patch.remote_host = (row.db_host || '').trim();
    patch.remote_port = port;
    patch.pg_remote_user = user;
    if (pass) patch.pg_remote_pass = pass;
    const h2 = String(patch.remote_host || '').trim();
    patch.remote_db = forTauri && h2 ? `${h2}:${port}/${row.database_name}` : row.database_name;
  }

  return patch;
}

/** PostgREST URL slug'ından kiracı alanlarını türetir (db_mode korunur). */
export function buildTenantFieldsFromRestUrl(
  restUrl: string,
  prev: Record<string, unknown> = {},
): Record<string, unknown> | null {
  const raw = normalizeBaseUrl(String(restUrl || '').trim());
  if (!raw) return null;

  let slug: string | null = null;
  const saas = parseSaaSOrCustomPostgrestUrl(raw);
  if (saas.kind === 'saas_single_slug') {
    slug = saas.slug;
  } else {
    try {
      const line = parseTenantConnectionLine(raw);
      if (line.kind === 'direct_postgrest' && line.pathSlug) {
        slug = line.pathSlug;
      }
    } catch {
      return null;
    }
  }
  if (!slug || slug === 'merkez') return null;

  const effectiveUrl =
    saas.kind === 'saas_single_slug' ? raw : buildSaaSTenantPostgrestUrl(slug);
  const syncUrls = resolveTenantSyncUrls({
    merkez_tenant_code: slug,
    remote_rest_url: effectiveUrl,
    central_ws_url: prev.central_ws_url,
    central_api_url: prev.central_api_url,
  });

  const idFromSlug = UUID_RE.test(slug) ? slug : '';
  const codeFromSlug = idFromSlug ? '' : slug;

  return {
    remote_rest_url: effectiveUrl,
    merkez_tenant_code: codeFromSlug || undefined,
    merkez_tenant_id: idFromSlug || undefined,
    merkez_display_name: codeFromSlug || idFromSlug || effectiveUrl,
    central_ws_url: syncUrls.central_ws_url || undefined,
    central_api_url: syncUrls.central_api_url || undefined,
    connection_provider: prev.connection_provider ?? 'rest_api',
    db_mode: prev.db_mode,
  };
}

/** DB ayarları kaydı sonrası kiracıyı uygular (web localStorage / Tauri config). */
export async function persistTenantFieldsFromRestUrl(
  restUrl: string,
  opts?: { forTauri?: boolean; preserveDbMode?: string },
): Promise<{ applied: boolean; tag?: string }> {
  const IS_TAURI = typeof window !== 'undefined' && !!(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

  let prev: Record<string, unknown> = {};
  if (IS_TAURI || opts?.forTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      prev = ((await invoke('get_app_config')) as Record<string, unknown>) || {};
    } catch {
      prev = {};
    }
  } else if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('retailex_web_config');
      prev = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      prev = {};
    }
  }

  const patch = buildTenantFieldsFromRestUrl(restUrl, {
    ...prev,
    db_mode: opts?.preserveDbMode ?? prev.db_mode,
  });
  if (!patch) return { applied: false };

  let merged: Record<string, unknown> = { ...prev, ...patch, is_configured: true };

  try {
    const effectiveUrl = String(patch.remote_rest_url ?? restUrl).trim();
    const slug = String(patch.merkez_tenant_code ?? '').trim() || null;
    const row = await resolveTenantRegistryForDirectPostgrest({
      url: effectiveUrl,
      pathSlug: slug,
    });
    if (row) {
      const regPatch = tenantRowToAppConfigPatch(row, {
        forTauri: IS_TAURI || opts?.forTauri === true,
        preserveDbPassword: String(prev.pg_remote_pass ?? ''),
      });
      merged = {
        ...merged,
        ...regPatch,
        remote_rest_url: effectiveUrl,
      };
    }
  } catch (e) {
    console.warn('[merkezTenantRegistry] persistTenantFieldsFromRestUrl registry:', e);
  }

  if (IS_TAURI || opts?.forTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('save_app_config', { config: merged });
  } else if (typeof window !== 'undefined') {
    window.localStorage.setItem('retailex_web_config', JSON.stringify(merged));
    window.localStorage.setItem('exretail_firma_donem_configured', 'true');
    const tag = String(
      merged.merkez_tenant_code || merged.merkez_tenant_id || patch.merkez_tenant_code || patch.merkez_tenant_id || '',
    );
    if (tag) window.localStorage.setItem('exretail_selected_tenant', tag);
  }

  const tag = String(
    merged.merkez_tenant_code || merged.merkez_tenant_id || patch.merkez_tenant_code || patch.merkez_tenant_id || '',
  );
  return { applied: true, tag };
}
