import { IS_TAURI, safeInvoke, getBridgeUrl, isRetailExProductionWeb } from '../utils/env';
import { isCapacitorNative } from '../utils/capacitorPlatform';
import { fetchRetailexAware } from '../utils/retailexDevProxy';
import { logger } from './loggingService';
import { setGlobalCurrency } from '../utils/currency';
import { runHybridSync, type HybridSyncFilter, type HybridSyncFlow, type HybridSyncScopeMode } from './hybridSyncEngine';
import { applyTerminalRuntimeFromConfig } from './terminalRuntimeService';
import {
  startUnifiedHybridAutoSync,
  stopUnifiedHybridAutoSync,
} from './mposKasaAutoPullService';
import {
  REMOTE_PG_DEFAULTS,
  parsePgEndpointString,
  DEFAULT_REMOTE_REST_URL,
} from '../core/remotePgDefaults';
import {
  DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN,
  buildSaaSTenantPostgrestUrl,
  parseSaaSOrCustomPostgrestUrl,
  resolveTenantSyncUrls,
} from './merkezTenantRegistry';
import { DEFAULT_POSTGREST_PORT } from '../core/postgrestDefaults';

export { DEFAULT_POSTGREST_PORT };

const IS_PRODUCTION = isRetailExProductionWeb();

export type { HybridSyncFlow, HybridSyncScopeMode, HybridSyncFilter } from './hybridSyncEngine';
export type ConnectionMode = 'online' | 'offline' | 'hybrid';
export type ConnectionProvider = 'db' | 'rest_api';
/** Hibrit modda SQL sorgularında denenecek PG sırası (bağlantı hatasında yedek uca geçiş). */
export type HybridReadPreference = 'local_first' | 'remote_first';
/** Planlanan senkron yönü (`sync()` ve ilerideki çoğaltma için). */
export type HybridSyncDirection = 'local_to_remote' | 'remote_to_local' | 'bidirectional';
/** Hibrit senkron taşıma: periyodik (sync_queue), WebSocket anlık çekim, veya ikisi */
export type HybridSyncTransport = 'polling' | 'websocket' | 'both';

/** Hibrit senkron uzak uç: `remote_rest_url` doluysa doğrudan PG yerine PostgREST kullanılır. */
export function resolveHybridSyncConnectionProvider(): ConnectionProvider {
  if (DB_SETTINGS.activeMode === 'hybrid' && DB_SETTINGS.remoteRestUrl?.trim()) {
    return 'rest_api';
  }
  return DB_SETTINGS.connectionProvider;
}

/** `sync()` — şube/kasiyer gönder-al ve kapsam seçenekleri */
export type PostgresSyncOptions = {
  mode?: ConnectionMode;
  hybridSyncDirection?: HybridSyncDirection;
  flow?: HybridSyncFlow;
  scope?: HybridSyncScopeMode;
  filter?: HybridSyncFilter;
};

export function normalizeHybridReadPreference(raw: unknown): HybridReadPreference {
  return String(raw || '').trim() === 'remote_first' ? 'remote_first' : 'local_first';
}

export function normalizeHybridSyncDirection(raw: unknown): HybridSyncDirection {
  const s = String(raw || '').trim();
  if (s === 'remote_to_local') return 'remote_to_local';
  if (s === 'bidirectional') return 'bidirectional';
  return 'local_to_remote';
}

/** Hibrit otomatik senkron aralığı (saniye): 5–3600, varsayılan 30 */
export function normalizeHybridSyncIntervalSec(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  return Math.min(3600, Math.max(5, Math.round(n)));
}

export function normalizeHybridSyncTransport(raw: unknown): HybridSyncTransport {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'websocket' || s === 'ws') return 'websocket';
  if (s === 'polling' || s === 'periodic' || s === 'interval') return 'polling';
  return 'both';
}

function isLikelyConnectivityFailure(err: unknown): boolean {
  const msg = String((err as { message?: unknown })?.message ?? err ?? '').toLowerCase();
  const code = String((err as { code?: unknown })?.code ?? '').toUpperCase();
  if (/^(08|57P01|53300)/.test(code)) return true;
  if (/too many clients/i.test(msg)) return true;
  return /connect|connection refused|econnrefused|etimedout|enetunreach|enotfound|timeout|connection terminated|could not|broken pipe|closed unexpectedly|no route|network|unreachable|refused|fetch failed/i.test(
    msg
  );
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Tarayıcı → köprü: ağ / PG soğuk başlangıç / havuz yenilemesi için sınırlı yeniden deneme */
const PG_WEB_QUERY_MAX_ATTEMPTS = 4;
const PG_WEB_QUERY_RETRY_BASE_MS = 600;
const PG_WEB_QUERY_MAX_CONCURRENT = 8;

let pgQueryInFlight = 0;
const pgQueryWaitQueue: Array<() => void> = [];

function acquirePgQuerySlot(): Promise<void> {
  if (pgQueryInFlight < PG_WEB_QUERY_MAX_CONCURRENT) {
    pgQueryInFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    pgQueryWaitQueue.push(() => {
      pgQueryInFlight++;
      resolve();
    });
  });
}

function releasePgQuerySlot(): void {
  pgQueryInFlight = Math.max(0, pgQueryInFlight - 1);
  const next = pgQueryWaitQueue.shift();
  if (next) next();
}

// Remote PostgreSQL (Global/Main Server) — varsayılanlar: config/remote-pg.defaults.json
export let REMOTE_CONFIG = {
  host: REMOTE_PG_DEFAULTS.host,
  port: REMOTE_PG_DEFAULTS.port,
  database: REMOTE_PG_DEFAULTS.database,
  user: REMOTE_PG_DEFAULTS.user,
  password: REMOTE_PG_DEFAULTS.password,
  isConfigured: false,
};

// Local PostgreSQL (Branch/Local Offline Server)
export let LOCAL_CONFIG = {
  host: '127.0.0.1', // Use 127.0.0.1 for better stability on Windows
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: 'Yq7xwQpt6c',
  isConfigured: false
};

// System Settings — Asin: yalnızca online + PostgREST (yerel/offline kapalı)
export let DB_SETTINGS = {
  activeMode: 'online' as ConnectionMode,
  systemType: 'retail' as 'retail' | 'market' | 'wms',
  // Remote tarafı DB mi yoksa PostgREST mü kullanacak?
  connectionProvider: 'rest_api' as ConnectionProvider,
  remoteRestUrl: DEFAULT_REMOTE_REST_URL as string,
  lastSync: null as string | null,
  hybridReadPreference: 'remote_first' as HybridReadPreference,
  hybridSyncDirection: 'remote_to_local' as HybridSyncDirection,
  hybridSyncIntervalSec: 30,
  hybridSyncTransport: 'both' as HybridSyncTransport,
  merkezTenantCode: '' as string,
  centralWsUrl: '' as string,
  centralApiUrl: '' as string,
};

type PgEndpointConfig = typeof LOCAL_CONFIG;

/**
 * SaaS web: köprü konteyneri tarayıcıdaki 127.0.0.1'e erişemez.
 * Production'da localhost hedefini Docker iç ağındaki `saas_postgres` ile değiştir.
 */
function normalizeBridgePgEndpoint(cfg: PgEndpointConfig): PgEndpointConfig {
  if (IS_TAURI || !IS_PRODUCTION) return cfg;
  const host = cfg.host === 'localhost' ? '127.0.0.1' : cfg.host;
  if (host !== '127.0.0.1') return cfg;
  const tenantDb = resolveEffectiveTenantDatabaseName();
  const fallbackDb =
    tenantDb ||
    (cfg.database && cfg.database !== 'retailex_local' ? cfg.database : LOCAL_CONFIG.database);
  return {
    ...cfg,
    host: 'saas_postgres',
    database: fallbackDb,
  };
}

/** Hibrit modda yazım (INSERT/UPDATE/…) yalnızca yerel PG — uzak uca düşme. */
function isSqlWriteStatement(sql: string): boolean {
  const head = sql
    .trim()
    .replace(/^\/\*[\s\S]*?\*\//, '')
    .trim()
    .slice(0, 24)
    .toUpperCase();
  return /^(INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|MERGE|CALL|DO\s)/.test(
    head,
  );
}

/** Online/Offline tek uç; hibritte yalnızca yerel PG (merkez = API). */
export function getDbSqlTargetChain(opts?: { write?: boolean }): PgEndpointConfig[] {
  if (DB_SETTINGS.activeMode === 'hybrid') {
    return [LOCAL_CONFIG];
  }
  if (shouldUseCentralApi()) {
    // Online + API: veri çoğunlukla PostgREST; legacy SQL (raporlar vb.) için uzak PG.
    // SaaS web'de LOCAL_CONFIG (127.0.0.1) köprüden erişilemez — kiracı uzak ucunu kullan.
    if (DB_SETTINGS.activeMode === 'online') {
      const cfg =
        !IS_TAURI && IS_PRODUCTION
          ? getCentralRemotePgConfig()
          : LOCAL_CONFIG.isConfigured
            ? LOCAL_CONFIG
            : getCentralRemotePgConfig();
      return [normalizeBridgePgEndpoint(cfg)];
    }
    return [normalizeBridgePgEndpoint(LOCAL_CONFIG)];
  }
  const remoteCfg = normalizeBridgePgEndpoint(getCentralRemotePgConfig());
  if (DB_SETTINGS.activeMode === 'online') return [remoteCfg];
  if (DB_SETTINGS.activeMode === 'offline') return [normalizeBridgePgEndpoint(LOCAL_CONFIG)];
  return [normalizeBridgePgEndpoint(LOCAL_CONFIG), remoteCfg];
}

/** Birincil SQL ucu — pg_bridge `pg_dump` ve benzeri için bağlantı dizesi (özel karakterler URI-encode). */
export function getPrimarySqlConnectionString(): string {
  const config = normalizeBridgePgEndpoint(getDbSqlTargetChain()[0]);
  const effectiveHost = config.host === 'localhost' ? '127.0.0.1' : config.host;
  const u = encodeURIComponent(config.user);
  const p = encodeURIComponent(config.password);
  const d = encodeURIComponent(config.database);
  return `postgresql://${u}:${p}@${effectiveHost}:${config.port}/${d}`;
}

/** Aktif uçtaki PostgreSQL veritabanı adı (köprü iç yedek için). */
export function getPrimaryDatabaseName(): string {
  return getDbSqlTargetChain()[0].database;
}

/**
 * Tarayıcıda tam yedek: api.*:443 veya PostgREST modunda harici connStr ile pg_dump başarısız olur;
 * köprü `/api/pg_dump_internal` (PostgREST ile aynı Docker postgres) kullanılmalı.
 * VITE_PG_DUMP_INTERNAL: 1 = yalnız iç yol, 0 = yalnız harici connStr, boş = otomatik (443 / rest_api / api.retailex → iç).
 */
export function shouldPreferBridgeInternalPgDump(): boolean {
  if (typeof window === 'undefined') return false;
  const v = String((import.meta as any).env?.VITE_PG_DUMP_INTERNAL || '').trim();
  if (v === '0') return false;
  if (v === '1') return true;
  const cfg = getDbSqlTargetChain()[0];
  if (DB_SETTINGS.connectionProvider === 'rest_api') return true;
  if (Number(cfg.port) === 443) return true;
  const h = String(cfg.host || '').toLowerCase();
  if (h === 'api.retailex.app' || h.includes('api.retailex')) return true;
  return false;
}

async function executePgQueryRows(
  resolvedSql: string,
  normalizedParams: any[],
  config: PgEndpointConfig
): Promise<any[]> {
  await acquirePgQuerySlot();
  try {
  const bridgeCfg = normalizeBridgePgEndpoint(config);
  const effectiveHost = bridgeCfg.host === 'localhost' ? '127.0.0.1' : bridgeCfg.host;
  const connStr = `postgresql://${bridgeCfg.user}:${bridgeCfg.password}@${effectiveHost}:${bridgeCfg.port}/${bridgeCfg.database}`;
  if (IS_TAURI) {
    const resultJson: string = await safeInvoke('pg_query', { connStr, sql: resolvedSql, params: normalizedParams });
    return JSON.parse(resultJson);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= PG_WEB_QUERY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${getBridgeUrl()}/api/pg_query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connStr, sql: resolvedSql, params: normalizedParams }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || 'Database query failed');
      }
      const data = await response.json();
      return data.rows;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'Failed to fetch') {
        lastError = new Error(
          `PostgreSQL köprüsüne ulaşılamadı (${getBridgeUrl()}/api/pg_query). retailex_bridge çalışıyor mu?`
        );
      }
      const canRetry =
        attempt < PG_WEB_QUERY_MAX_ATTEMPTS &&
        (isLikelyConnectivityFailure(err) || /too many clients/i.test(msg));
      if (canRetry) {
        const wait = PG_WEB_QUERY_RETRY_BASE_MS * attempt;
        console.warn(
          `[Postgres] pg_query denemesi ${attempt}/${PG_WEB_QUERY_MAX_ATTEMPTS} başarısız (${String((err as Error)?.message || err)}), ${wait}ms sonra tekrar…`,
        );
        await sleepMs(wait);
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'Database query failed'));
  } finally {
    releasePgQuerySlot();
  }
}

// ERP Settings (Logo integration)
export let ERP_SETTINGS = {
  firmNr: '001', // Default to 001
  periodNr: '01',
  selected_cash_registers: [] as string[]
};

function isTenantResolvedForWeb(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (window.localStorage.getItem('exretail_firma_donem_configured') === 'true') return true;
    const raw = window.localStorage.getItem('retailex_web_config');
    if (!raw) return false;
    const cfg = JSON.parse(raw);
    const code = String(cfg?.merkez_tenant_code ?? '').trim();
    const id = String(cfg?.merkez_tenant_id ?? '').trim();
    if (code || id) return true;
    const rest = String(cfg?.remote_rest_url ?? '').trim();
    if (rest && parseSaaSOrCustomPostgrestUrl(rest).kind === 'saas_single_slug') return true;
    return false;
  } catch {
    return false;
  }
}

/** Kurulum / config.db varsayılan para (firma yokken ve başlangıç) */
export let APP_DEFAULT_CURRENCY = 'IQD';

export function getAppDefaultCurrency(): string {
  const c = (APP_DEFAULT_CURRENCY || 'IQD').trim().toUpperCase();
  return c.length >= 3 ? c.slice(0, 10) : 'IQD';
}

function applyDefaultCurrencyFromConfig(config: any): void {
  const raw = config?.default_currency ?? config?.base_currency;
  if (raw != null && String(raw).trim() !== '') {
    APP_DEFAULT_CURRENCY = String(raw).trim().toUpperCase().slice(0, 10);
  }
  setGlobalCurrency(getAppDefaultCurrency(), getAppDefaultCurrency());
}

/** Merkez (uzak) işlemler yalnızca PostgREST/API ile yapılır; şube/kasa doğrudan uzak PG'ye bağlanmaz. */
export function shouldUseCentralApi(): boolean {
  if (DB_SETTINGS.activeMode === 'offline') return false;
  if (DB_SETTINGS.connectionProvider !== 'rest_api') return false;
  return Boolean(String(DB_SETTINGS.remoteRestUrl ?? '').trim());
}

/** Asin: yerel/hibrit kapalı — her zaman online + PostgREST. */
function applyTauriHybridDbOverride(): void {
  if (DB_SETTINGS.activeMode === 'offline' || DB_SETTINGS.activeMode === 'hybrid') {
    DB_SETTINGS.activeMode = 'online';
  }
  DB_SETTINGS.connectionProvider = 'rest_api';
}

/**
 * `host:port/dbname` biçimi (Tauri + Login web — `remote_db` tek alanda).
 */
function applyRemoteFromHostPortDbString(remoteDb: string): void {
  const parsed = parsePgEndpointString(remoteDb);
  REMOTE_CONFIG.host = parsed.host;
  REMOTE_CONFIG.port = parsed.port;
  REMOTE_CONFIG.database = parsed.database;
}

function syncRemoteConfigFromRestUrl(restUrl: unknown): void {
  const raw = String(restUrl ?? '').trim();
  if (!raw) return;
  try {
    // Rest API URL'sindeki yol parçası (örn. `/aqua`) PostgreSQL veritabanı adı olmak zorunda değildir.
    // Özellikle SaaS kurulumunda slug ve gerçek database_name farklı olabildiğinden burada
    // REMOTE_CONFIG.database alanını URL'den türetmeyiz.
    // Bu alan yalnızca config.remote_db / tenant registry database_name üzerinden set edilmelidir.
    void new URL(raw);
  } catch {
    /* ignore invalid URL */
  }
}

export function alignRemoteConfigWithRestUrl(): void {
  if (DB_SETTINGS.connectionProvider !== 'rest_api') return;
  syncRemoteConfigFromRestUrl(DB_SETTINGS.remoteRestUrl);
}

/** PostgREST URL slug → kiracı PostgreSQL veritabanı adı (ör. /lovan → lovan). */
export function resolveTenantDatabaseFromRestUrl(restUrl?: string): string | null {
  const raw = String(restUrl ?? DB_SETTINGS.remoteRestUrl ?? '').trim();
  if (!raw) return null;
  const parsed = parseSaaSOrCustomPostgrestUrl(raw);
  return parsed.kind === 'saas_single_slug' ? parsed.slug : null;
}

/** tenant_registry'den çözülen gerçek PostgreSQL DB adı (örn. aqua_beauty). */
let registryResolvedTenantDatabase: string | null = null;

export function setRegistryResolvedTenantDatabaseName(name: string | null): void {
  registryResolvedTenantDatabase = String(name ?? '').trim() || null;
  if (registryResolvedTenantDatabase) {
    REMOTE_CONFIG.database = registryResolvedTenantDatabase;
  }
}

/**
 * PostgREST URL slug'ı (örn. /aqua) ile PostgreSQL database_name (örn. aqua_beauty) farklı olabilir.
 * Köprü SQL yalnızca kayıtlı remote_db veya tenant_registry çözümünü kullanır — slug asla DB adı sayılmaz.
 */
export function resolveEffectiveTenantDatabaseName(restUrl?: string): string | null {
  if (registryResolvedTenantDatabase) {
    return registryResolvedTenantDatabase;
  }
  const configuredDb = String(REMOTE_CONFIG.database || '').trim();
  const slug = resolveTenantDatabaseFromRestUrl(restUrl ?? DB_SETTINGS.remoteRestUrl);
  if (
    configuredDb &&
    configuredDb !== 'retailex_local' &&
    configuredDb !== 'retailex_demo'
  ) {
    // Kayıtlı remote_db URL slug ile aynıysa (aqua) gerçek DB adı olmayabilir — registry beklenir.
    if (slug && configuredDb === slug) {
      return null;
    }
    return configuredDb;
  }
  // Varsayılan retailex_demo veya boş yapılandırmada PostgREST slug'ından kiracı DB adını çöz.
  if (slug) return slug;
  return null;
}

/** Web girişinde tenant_registry → gerçek database_name (aqua → aqua_beauty). */
export async function ensureTenantDatabaseFromRegistry(): Promise<void> {
  const restUrl = String(DB_SETTINGS.remoteRestUrl ?? '').trim();
  if (!restUrl) return;
  try {
    const { resolveTenantRegistryForDirectPostgrest, parseSaaSOrCustomPostgrestUrl } = await import(
      './merkezTenantRegistry'
    );
    const parsed = parseSaaSOrCustomPostgrestUrl(restUrl);
    const slug =
      parsed.kind === 'saas_single_slug'
        ? parsed.slug
        : String(DB_SETTINGS.merkezTenantCode ?? '').trim() || null;
    const row = await resolveTenantRegistryForDirectPostgrest({ url: restUrl, pathSlug: slug });
    if (!row?.database_name?.trim()) return;

    const dbName = row.database_name.trim();
    setRegistryResolvedTenantDatabaseName(dbName);
    if (row.code?.trim()) {
      DB_SETTINGS.merkezTenantCode = row.code.trim();
    }

    if (typeof window === 'undefined') return;
    for (const key of ['exretail_pg_config', 'retailex_web_config'] as const) {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const obj = JSON.parse(raw) as Record<string, unknown>;
        const prevDb = String(obj.remote_db ?? '').trim();
        const prevCode = String(obj.merkez_tenant_code ?? '').trim();
        if (prevDb === dbName && prevCode === row.code) continue;
        obj.remote_db = dbName;
        if (row.code) obj.merkez_tenant_code = row.code;
        window.localStorage.setItem(key, JSON.stringify(obj));
      } catch {
        /* tek cache */
      }
    }
    console.log(`[Postgres] Kiracı DB adı tenant_registry: ${dbName}`);
  } catch (e) {
    console.warn('[Postgres] tenant_registry database_name çözülemedi:', e);
  }
}

/** Kayıtlı remote_db veya tenant_registry çözümü ile merkez PG DB adını hizalar. */
export function alignRemoteConfigDatabaseWithTenant(restUrl?: string): void {
  const tenantDb = resolveEffectiveTenantDatabaseName(restUrl);
  if (!tenantDb || REMOTE_CONFIG.database === tenantDb) return;
  const prev = REMOTE_CONFIG.database;
  REMOTE_CONFIG.database = tenantDb;
  console.log(
    `[Postgres] Uzak veritabanı kiracıya hizalandı: ${prev} → ${tenantDb}`,
  );
}

/** Merkez PG ucu — remote_db yanlış olsa bile PostgREST slug / kiracı kodu ile DB adını hizalar. */
export function getCentralRemotePgConfig(): typeof REMOTE_CONFIG {
  const tenantDb = resolveEffectiveTenantDatabaseName();
  if (tenantDb) {
    return { ...REMOTE_CONFIG, database: tenantDb };
  }
  return REMOTE_CONFIG;
}

/**
 * Web: `exretail_pg_config` ve/veya `retailex_web_config` nesnesini uygular.
 * Birden fazla çağrıda son çağrı üstte kalır (tam kiracı + düz PG overlay sırası initializeFromSQLite’da).
 */
function applyWebLocalStorageConfig(config: any): void {
  if (!config || typeof config !== 'object') return;
  const dm = config.db_mode;
  // Asin: offline/hybrid → online (yerel PG kullanılmaz)
  const rawMode =
    dm === 'online' || dm === 'offline' || dm === 'hybrid' ? (dm as ConnectionMode) : 'online';
  DB_SETTINGS.activeMode =
    rawMode === 'offline' || rawMode === 'hybrid' ? 'online' : rawMode;
  const rawRest =
    typeof config.remote_rest_url === 'string' ? String(config.remote_rest_url).trim() : '';
  const normalizedRest = rawRest ? normalizeStoredRemoteRestUrl(rawRest) : '';
  // Asin: her zaman PostgREST (yerel köprüye düşme)
  DB_SETTINGS.connectionProvider = 'rest_api';
  DB_SETTINGS.remoteRestUrl = normalizedRest || normalizeStoredRemoteRestUrl(DEFAULT_REMOTE_REST_URL);
  if (
    typeof localStorage !== 'undefined' &&
    DB_SETTINGS.remoteRestUrl &&
    (rawRest !== DB_SETTINGS.remoteRestUrl ||
      config.connection_provider !== DB_SETTINGS.connectionProvider)
  ) {
    try {
      const key = 'retailex_web_config';
      const prev = localStorage.getItem(key);
      if (prev) {
        const obj = JSON.parse(prev) as Record<string, unknown>;
        obj.remote_rest_url = DB_SETTINGS.remoteRestUrl;
        obj.connection_provider = DB_SETTINGS.connectionProvider;
        if (!String(obj.merkez_tenant_code || '').trim()) {
          const slug = saasTenantSlugFromUrl(DB_SETTINGS.remoteRestUrl);
          if (slug) obj.merkez_tenant_code = slug;
        }
        localStorage.setItem(key, JSON.stringify(obj));
      }
    } catch {
      /* ignore migrate errors */
    }
  }
  DB_SETTINGS.hybridReadPreference = normalizeHybridReadPreference(
    config.hybrid_read_preference ?? (config as { hybridReadPreference?: unknown }).hybridReadPreference
  );
  DB_SETTINGS.hybridSyncDirection = normalizeHybridSyncDirection(
    config.hybrid_sync_direction ?? (config as { hybridSyncDirection?: unknown }).hybridSyncDirection
  );
  DB_SETTINGS.hybridSyncIntervalSec = normalizeHybridSyncIntervalSec(
    config.hybrid_sync_interval_sec ?? (config as { hybridSyncIntervalSec?: unknown }).hybridSyncIntervalSec
  );
  DB_SETTINGS.hybridSyncTransport = normalizeHybridSyncTransport(
    config.hybrid_sync_transport ?? (config as { hybridSyncTransport?: unknown }).hybridSyncTransport
  );
  DB_SETTINGS.merkezTenantCode = String(
    config.merkez_tenant_code ?? (config as { merkezTenantCode?: unknown }).merkezTenantCode ?? ''
  ).trim();
  if (!DB_SETTINGS.merkezTenantCode) {
    const slug = saasTenantSlugFromUrl(DB_SETTINGS.remoteRestUrl);
    if (slug) DB_SETTINGS.merkezTenantCode = slug;
  }
  const syncUrls = resolveTenantSyncUrls({
    merkez_tenant_code: DB_SETTINGS.merkezTenantCode,
    remote_rest_url: DB_SETTINGS.remoteRestUrl || rawRest,
    central_ws_url: config.central_ws_url ?? (config as { centralWsUrl?: unknown }).centralWsUrl,
    central_api_url: config.central_api_url ?? (config as { centralApiUrl?: unknown }).centralApiUrl,
  });
  DB_SETTINGS.centralWsUrl = syncUrls.central_ws_url;
  DB_SETTINGS.centralApiUrl = syncUrls.central_api_url;

  if (config.local_host) {
    LOCAL_CONFIG.host = config.local_host;
  } else if (config.local_db && typeof config.local_db === 'string' && config.local_db.includes(':')) {
    LOCAL_CONFIG.host = config.local_db.split(':')[0] || '127.0.0.1';
    const portPart = config.local_db.split(':')[1] || '';
    if (portPart) LOCAL_CONFIG.port = parseInt(portPart.split('/')[0], 10) || 5432;
    if (config.local_db.includes('/')) {
      LOCAL_CONFIG.database = config.local_db.split('/').slice(1).join('/') || LOCAL_CONFIG.database;
    }
  }
  if (config.local_port != null) LOCAL_CONFIG.port = Number(config.local_port) || LOCAL_CONFIG.port;
  if (config.local_db && typeof config.local_db === 'string' && !config.local_db.includes(':')) {
    LOCAL_CONFIG.database = config.local_db;
  }
  if (config.pg_local_user) LOCAL_CONFIG.user = config.pg_local_user;
  if (config.pg_local_pass != null && config.pg_local_pass !== '') LOCAL_CONFIG.password = config.pg_local_pass;
  if (config.is_configured === true) LOCAL_CONFIG.isConfigured = true;

  if (config.remote_host) {
    REMOTE_CONFIG.host = config.remote_host;
    if (config.remote_port != null) REMOTE_CONFIG.port = Number(config.remote_port) || REMOTE_CONFIG.port;
    if (config.remote_db && typeof config.remote_db === 'string' && !config.remote_db.includes(':')) {
      REMOTE_CONFIG.database = config.remote_db;
    }
  } else if (config.remote_db && typeof config.remote_db === 'string') {
    if (config.remote_db.includes(':') && config.remote_db.includes('/')) {
      applyRemoteFromHostPortDbString(config.remote_db);
    } else {
      REMOTE_CONFIG.database = config.remote_db;
    }
  }
  if (config.pg_remote_user) REMOTE_CONFIG.user = config.pg_remote_user;
  if (config.pg_remote_pass != null && config.pg_remote_pass !== '') REMOTE_CONFIG.password = config.pg_remote_pass;
  if (DB_SETTINGS.connectionProvider === 'rest_api') {
    syncRemoteConfigFromRestUrl(DB_SETTINGS.remoteRestUrl);
  }
  alignRemoteConfigDatabaseWithTenant(
    typeof config.remote_rest_url === 'string' ? config.remote_rest_url : DB_SETTINGS.remoteRestUrl,
  );

  // Production web'de bridge, container içinden DB'ye bağlanır.
  // 127.0.0.1/localhost bridge konteynerinin kendisini işaret ettiği için ECONNREFUSED üretir.
  if (
    IS_PRODUCTION &&
    (REMOTE_CONFIG.host === '127.0.0.1' || REMOTE_CONFIG.host === 'localhost')
  ) {
    REMOTE_CONFIG.host = 'saas_postgres';
    const tenantDb = resolveEffectiveTenantDatabaseName();
    if (tenantDb) {
      REMOTE_CONFIG.database = tenantDb;
    } else if (!REMOTE_CONFIG.database || REMOTE_CONFIG.database === 'retailex_local') {
      REMOTE_CONFIG.database = LOCAL_CONFIG.database;
    }
  }

  const dFw = String(config.erp_firm_nr ?? '').replace(/\D/g, '');
  const dPw = String(config.erp_period_nr ?? '').replace(/\D/g, '');
  if (dFw) ERP_SETTINGS.firmNr = dFw.length <= 3 ? dFw.padStart(3, '0') : dFw;
  if (dPw) ERP_SETTINGS.periodNr = dPw.length <= 2 ? dPw.padStart(2, '0') : dPw;

  // Tenant_registry ile bağlanılmışsa web guard bayrağını kalıcılaştır.
  if (typeof window !== 'undefined') {
    const tenantCode = String(config.merkez_tenant_code ?? '').trim();
    const tenantId = String(config.merkez_tenant_id ?? '').trim();
    if (tenantCode || tenantId) {
      window.localStorage.setItem('exretail_firma_donem_configured', 'true');
    }
  }

  applyDefaultCurrencyFromConfig(config);
  applyTerminalRuntimeFromConfig(config);
}

/**
 * Initialize all configurations from SQLite backend.
 * @param preloadedConfig - Optional config from App startup (Tauri); avoids duplicate get_app_config call.
 */
export async function initializeFromSQLite(preloadedConfig?: any) {
  if (!IS_TAURI) {
    const pgFlat = localStorage.getItem('exretail_pg_config');
    const webFull = localStorage.getItem('retailex_web_config');
    try {
      // Web'de tek kaynak gibi davran: iki cache birlikte varsa önce flat, üstüne full.
      // Böylece tenant/connection_provider/remote_rest_url gibi kritik alanlarda retailex_web_config öncelikli kalır.
      if (webFull || pgFlat) {
        const flatObj = pgFlat ? JSON.parse(pgFlat) : {};
        const fullObj = webFull ? JSON.parse(webFull) : {};
        const merged = { ...flatObj, ...fullObj };
        applyWebLocalStorageConfig(merged);
        // Registry çözümlemesi ağda takılırsa startup'ı sonsuza kilitlemesin
        await Promise.race([
          ensureTenantDatabaseFromRegistry(),
          new Promise<void>((resolve) => setTimeout(resolve, 5000)),
        ]);
      } else if (isCapacitorNative()) {
        // Android/iOS: doğrudan PG yok — yalnızca PostgREST (LAN veya bulut).
        DB_SETTINGS.activeMode = 'online';
        DB_SETTINGS.connectionProvider = 'rest_api';
        DB_SETTINGS.remoteRestUrl = '';
        DB_SETTINGS.hybridReadPreference = 'local_first';
        DB_SETTINGS.hybridSyncDirection = 'local_to_remote';
        DB_SETTINGS.hybridSyncTransport = 'both';
        LOCAL_CONFIG.isConfigured = false;
        console.log('📱 Capacitor: varsayılan bağlantı REST (PostgREST) — LAN URL girişi gerekli');
      } else {
        // Web: yapılandırma yoksa varsayılan SaaS PostgREST (retailex_demo) — yerel köprüye düşme.
        DB_SETTINGS.activeMode = 'online';
        DB_SETTINGS.connectionProvider = 'rest_api';
        DB_SETTINGS.remoteRestUrl = normalizeStoredRemoteRestUrl(DEFAULT_REMOTE_REST_URL);
        DB_SETTINGS.merkezTenantCode =
          DB_SETTINGS.merkezTenantCode ||
          saasTenantSlugFromUrl(DB_SETTINGS.remoteRestUrl) ||
          String(REMOTE_PG_DEFAULTS.database || 'retailex_demo');
        DB_SETTINGS.hybridReadPreference = 'local_first';
        DB_SETTINGS.hybridSyncDirection = 'local_to_remote';
        DB_SETTINGS.hybridSyncTransport = 'both';
        LOCAL_CONFIG.isConfigured = true;
        try {
          const seed = {
            is_configured: true,
            db_mode: 'online',
            connection_provider: 'rest_api',
            remote_rest_url: DB_SETTINGS.remoteRestUrl,
            merkez_tenant_code: DB_SETTINGS.merkezTenantCode,
            erp_firm_nr: '001',
            erp_period_nr: '01',
            system_type: 'retail',
          };
          localStorage.setItem('retailex_web_config', JSON.stringify(seed));
          localStorage.setItem('exretail_firma_donem_configured', 'true');
        } catch {
          /* ignore */
        }
      }
      if (pgFlat || webFull) {
        console.log('🌐 Web Config Loaded (exretail_pg_config + retailex_web_config)');
      } else if (isCapacitorNative()) {
        console.log('📱 Capacitor: REST modu — veritabanı ayarlarından LAN PostgREST URL girin');
      } else {
        console.log(`🌐 Web Mode: PostgREST varsayılanı (${DB_SETTINGS.remoteRestUrl})`);
      }
    } catch (e) {
      console.warn('Failed to parse web localStorage config', e);
    }
    return;
  }

  try {
    const config: any = preloadedConfig ?? (await safeInvoke('get_app_config'));
    if (config) {
      // Load System Settings
      DB_SETTINGS.activeMode = config.db_mode as ConnectionMode;
      DB_SETTINGS.systemType = config.system_type || 'retail';
      DB_SETTINGS.connectionProvider = (config.connection_provider === 'rest_api' ? 'rest_api' : 'db') as ConnectionProvider;
      DB_SETTINGS.remoteRestUrl =
        typeof config.remote_rest_url === 'string'
          ? normalizeStoredRemoteRestUrl(config.remote_rest_url)
          : '';
      DB_SETTINGS.hybridReadPreference = normalizeHybridReadPreference(config.hybrid_read_preference);
      DB_SETTINGS.hybridSyncDirection = normalizeHybridSyncDirection(config.hybrid_sync_direction);
      DB_SETTINGS.hybridSyncIntervalSec = normalizeHybridSyncIntervalSec(config.hybrid_sync_interval_sec);
      DB_SETTINGS.hybridSyncTransport = normalizeHybridSyncTransport(config.hybrid_sync_transport);

      DB_SETTINGS.merkezTenantCode = String(config.merkez_tenant_code ?? '').trim();
      const syncUrls = resolveTenantSyncUrls({
        merkez_tenant_code: config.merkez_tenant_code,
        remote_rest_url: config.remote_rest_url,
        central_ws_url: config.central_ws_url,
        central_api_url: config.central_api_url,
      });
      DB_SETTINGS.centralWsUrl = syncUrls.central_ws_url;
      DB_SETTINGS.centralApiUrl = syncUrls.central_api_url;
      alignRemoteConfigWithRestUrl();

      // Tauri hibrit: POS ve sync_queue yazımları yerel PG'de; PostgREST yalnızca senkron hedefi.
      applyTauriHybridDbOverride();
      if (
        DB_SETTINGS.connectionProvider === 'db' &&
        config.connection_provider === 'rest_api' &&
        !shouldUseCentralApi()
      ) {
        console.warn(
          '[Postgres] Tauri hibrit: connection_provider rest_api → db (yalnızca remote_rest_url yokken).',
        );
      }

      // Load ERP Settings — firma/dönem biçimi Logo/SQLite ile aynı (2 ↔ 002; cari tablo rex_{nr}_customers)
      const dF = String(config.erp_firm_nr ?? '').replace(/\D/g, '');
      const dP = String(config.erp_period_nr ?? '').replace(/\D/g, '');
      ERP_SETTINGS.firmNr = !dF ? '001' : (dF.length <= 3 ? dF.padStart(3, '0') : dF);
      ERP_SETTINGS.periodNr = !dP ? '01' : (dP.length <= 2 ? dP.padStart(2, '0') : dP);
      ERP_SETTINGS.selected_cash_registers = config.selected_cash_registers || [];

      console.log('📦 SQLite Config Loaded:', JSON.stringify(config, null, 2));
      console.log('🏢 Applied ERP Settings:', ERP_SETTINGS);

      // Load Local DB Settings
      if (config.local_db && typeof config.local_db === 'string') {
          LOCAL_CONFIG.host = config.local_db.split(':')[0] || 'localhost';
          if (config.local_db.includes(':')) {
            const portPart = config.local_db.split(':')[1];
            if (portPart) LOCAL_CONFIG.port = parseInt(portPart.split('/')[0]) || 5432;
            if (config.local_db.includes('/')) LOCAL_CONFIG.database = config.local_db.split('/')[1];
          }
      }

      if (config.pg_local_user) LOCAL_CONFIG.user = config.pg_local_user;
      if (config.pg_local_pass) LOCAL_CONFIG.password = config.pg_local_pass;

      // Load Remote DB Settings
      if (config.remote_db && typeof config.remote_db === 'string') {
          const parsed = parsePgEndpointString(config.remote_db);
          REMOTE_CONFIG.host = parsed.host;
          REMOTE_CONFIG.port = parsed.port;
          REMOTE_CONFIG.database = parsed.database;
      }
      if (config.pg_remote_user) REMOTE_CONFIG.user = config.pg_remote_user;
      if (config.pg_remote_pass) REMOTE_CONFIG.password = config.pg_remote_pass;

      const remoteDbBeforeAlign = String(config.remote_db ?? '');
      alignRemoteConfigDatabaseWithTenant(config.remote_rest_url);
      const remoteDbAfterAlign = `${REMOTE_CONFIG.host}:${REMOTE_CONFIG.port}/${REMOTE_CONFIG.database}`;
      if (
        !shouldUseCentralApi() &&
        config.is_configured === true &&
        remoteDbBeforeAlign.trim() &&
        remoteDbBeforeAlign !== remoteDbAfterAlign
      ) {
        try {
          await safeInvoke('save_app_config', {
            config: { ...config, remote_db: remoteDbAfterAlign },
          });
          console.log(`[Postgres] config.db remote_db güncellendi: ${remoteDbAfterAlign}`);
        } catch (persistErr) {
          console.warn('[Postgres] remote_db kiracı hizalaması config.db\'ye yazılamadı:', persistErr);
        }
      }

      LOCAL_CONFIG.isConfigured = config.is_configured === true;

      applyDefaultCurrencyFromConfig(config);
      applyTerminalRuntimeFromConfig(config);

      console.log('✅ Configurations Loaded from SQLite:', {
        mode: DB_SETTINGS.activeMode,
        firm: ERP_SETTINGS.firmNr,
        local_db: LOCAL_CONFIG.host,
        local_user: LOCAL_CONFIG.user,
        default_currency: getAppDefaultCurrency(),
      });
    }
  } catch (err) {
    console.error('Failed to load SQL config:', err);
  }
}

/**
 * Update configurations and persist (Now syncs to SQLite/localStorage too)
 */
export async function updateConfigs(updates: {
  local?: Partial<typeof LOCAL_CONFIG>,
  remote?: Partial<typeof REMOTE_CONFIG>,
  settings?: Partial<typeof DB_SETTINGS>,
  erp?: Partial<typeof ERP_SETTINGS>,
  storeId?: string,
}) {
  if (updates.local) LOCAL_CONFIG = { ...LOCAL_CONFIG, ...updates.local };
  if (updates.remote) REMOTE_CONFIG = { ...REMOTE_CONFIG, ...updates.remote };
  if (updates.settings) {
    const next = { ...updates.settings };
    if (typeof next.remoteRestUrl === 'string' && next.remoteRestUrl.trim()) {
      next.remoteRestUrl = normalizeStoredRemoteRestUrl(next.remoteRestUrl);
    }
    DB_SETTINGS = { ...DB_SETTINGS, ...next };
  }
  if (updates.erp) ERP_SETTINGS = { ...ERP_SETTINGS, ...updates.erp };
  // Asin: hibrit/yerel → online + rest_api
  if (DB_SETTINGS.activeMode === 'hybrid' || DB_SETTINGS.activeMode === 'offline') {
    DB_SETTINGS.activeMode = 'online';
  }
  applyTauriHybridDbOverride();
  alignRemoteConfigWithRestUrl();
  alignRemoteConfigDatabaseWithTenant();

  const syncUrls = resolveTenantSyncUrls({
    merkez_tenant_code: DB_SETTINGS.merkezTenantCode,
    remote_rest_url: DB_SETTINGS.remoteRestUrl,
    central_ws_url: DB_SETTINGS.centralWsUrl,
    central_api_url: DB_SETTINGS.centralApiUrl,
  });
  DB_SETTINGS.centralWsUrl = syncUrls.central_ws_url;
  DB_SETTINGS.centralApiUrl = syncUrls.central_api_url;

  const storeIdPatch =
    updates.storeId?.trim() && updates.storeId !== 'all' && updates.storeId !== '001'
      ? updates.storeId.trim()
      : undefined;

  if (!IS_TAURI) {
    // Web: Sync to localStorage
    const webConfig = {
      db_mode: DB_SETTINGS.activeMode,
      system_type: DB_SETTINGS.systemType,
      connection_provider: DB_SETTINGS.connectionProvider,
      remote_rest_url: DB_SETTINGS.remoteRestUrl,
      hybrid_read_preference: DB_SETTINGS.hybridReadPreference,
      hybrid_sync_direction: DB_SETTINGS.hybridSyncDirection,
      hybrid_sync_interval_sec: DB_SETTINGS.hybridSyncIntervalSec,
      hybrid_sync_transport: DB_SETTINGS.hybridSyncTransport,
      merkez_tenant_code: DB_SETTINGS.merkezTenantCode,
      central_ws_url: DB_SETTINGS.centralWsUrl,
      central_api_url: DB_SETTINGS.centralApiUrl,
      erp_firm_nr: ERP_SETTINGS.firmNr,
      erp_period_nr: ERP_SETTINGS.periodNr,
      ...(storeIdPatch ? { store_id: storeIdPatch } : {}),
      default_currency: getAppDefaultCurrency(),
      is_configured: LOCAL_CONFIG.isConfigured,
      local_host: LOCAL_CONFIG.host,
      local_port: LOCAL_CONFIG.port,
      local_db: LOCAL_CONFIG.database,
      pg_local_user: LOCAL_CONFIG.user,
      pg_local_pass: LOCAL_CONFIG.password,
      remote_host: REMOTE_CONFIG.host,
      remote_port: REMOTE_CONFIG.port,
      pg_remote_user: REMOTE_CONFIG.user,
      pg_remote_pass: REMOTE_CONFIG.password,
      remote_db: REMOTE_CONFIG.database
    };
    localStorage.setItem('exretail_pg_config', JSON.stringify(webConfig));
    try {
      const existing = localStorage.getItem('retailex_web_config');
      if (existing) {
        const prev = JSON.parse(existing) as Record<string, unknown>;
        localStorage.setItem('retailex_web_config', JSON.stringify({ ...prev, ...webConfig }));
      } else {
        localStorage.setItem('retailex_web_config', JSON.stringify(webConfig));
      }
    } catch {
      /* retailex_web_config birleştirilemedi; exretail_pg_config yeterli */
    }
    console.log('🌐 Web Config Saved to localStorage');
    return;
  }

  // Sync back to SQLite
  try {
    const currentConfig: any = await safeInvoke('get_app_config');
    const localDbStr = `${LOCAL_CONFIG.host}:${LOCAL_CONFIG.port}/${LOCAL_CONFIG.database}`;
    const remoteDbStr = `${REMOTE_CONFIG.host}:${REMOTE_CONFIG.port}/${REMOTE_CONFIG.database}`;
    const newConfig = {
      ...currentConfig,
      db_mode: DB_SETTINGS.activeMode,
      system_type: DB_SETTINGS.systemType,
      connection_provider: DB_SETTINGS.connectionProvider,
      remote_rest_url: DB_SETTINGS.remoteRestUrl,
      hybrid_read_preference: DB_SETTINGS.hybridReadPreference,
      hybrid_sync_direction: DB_SETTINGS.hybridSyncDirection,
      hybrid_sync_interval_sec: DB_SETTINGS.hybridSyncIntervalSec,
      hybrid_sync_transport: DB_SETTINGS.hybridSyncTransport,
      merkez_tenant_code: DB_SETTINGS.merkezTenantCode,
      central_ws_url: DB_SETTINGS.centralWsUrl,
      central_api_url: DB_SETTINGS.centralApiUrl,
      local_db: localDbStr,
      remote_db: remoteDbStr,
      pg_local_user: LOCAL_CONFIG.user,
      pg_local_pass: LOCAL_CONFIG.password,
      pg_remote_user: REMOTE_CONFIG.user,
      pg_remote_pass: REMOTE_CONFIG.password,
      erp_firm_nr: ERP_SETTINGS.firmNr,
      erp_period_nr: ERP_SETTINGS.periodNr,
      selected_cash_registers: ERP_SETTINGS.selected_cash_registers,
      is_configured: LOCAL_CONFIG.isConfigured,
      ...(storeIdPatch ? { store_id: storeIdPatch } : {}),
    };
    await safeInvoke('save_app_config', {
      config: {
        ...newConfig,
        default_currency: getAppDefaultCurrency(),
      },
    });
  } catch (err) {
    console.error('Failed to sync config to SQLite:', err);
  }
}

export type PostgresStatus = {
  connected: boolean;
  host: string;
  port: number;
  database: string;
  mode: ConnectionMode;
  error?: string;
  version?: string;
};

/**
 * Test a specific configuration
 */
export async function testDbConfig(config: typeof LOCAL_CONFIG | typeof REMOTE_CONFIG): Promise<PostgresStatus> {
  try {
    if (!IS_TAURI) {
      // Browser: Check bridge status first
      try {
        const bridgeStatus = await fetch(`${getBridgeUrl()}/api/status`).then(r => r.json());
        if (bridgeStatus.status !== 'RUNNING') throw new Error('Bridge is not running');
      } catch (e) {
        throw new Error(
          'PostgreSQL Bridge yanıt vermiyor (port 3001). Proje kökünde ayrı terminalde `npm run bridge` çalıştırın veya `npm run dev:with-bridge` kullanın.'
        );
      }

      // Connectivity test via bridge (try a simple query)
      const effectiveHost = config.host === 'localhost' ? '127.0.0.1' : config.host;
      const connStr = `postgresql://${config.user}:${config.password}@${effectiveHost}:${config.port}/${config.database}`;
      
      const response = await fetch(`${getBridgeUrl()}/api/pg_query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connStr, sql: 'SELECT version()', params: [] })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Bağlantı hatası');
      }

      const res = await response.json();
      return {
        connected: true,
        host: config.host,
        port: config.port,
        database: config.database,
        mode: DB_SETTINGS.activeMode,
        version: res.rows[0].version,
      };
    }

    // Use backend to check connection (Browser cannot check TCP ports reliably)
    const currentConfig = await safeInvoke('get_app_config');
    const status: string = await safeInvoke('check_db_status', {
      config: currentConfig
    });

    if (status === 'RUNNING') {
      return {
        connected: true,
        host: config.host,
        port: config.port,
        database: config.database,
        mode: DB_SETTINGS.activeMode,
        version: 'PostgreSQL 16.x',
      };
    } else {
      throw new Error(status);
    }
  } catch (error: any) {
    return {
      connected: false,
      host: config.host,
      port: config.port,
      database: config.database,
      mode: DB_SETTINGS.activeMode,
      error: error.message || 'Bağlantı başarısız',
    };
  }
}

/**
 * Kayıt etmeden önce: verilen host/kimlik bilgileriyle doğrudan `SELECT version()` çalıştırır.
 * Tauri: `pg_query`; tarayıcı: bridge. (Mevcut `testDbConfig` Tauri’de yalnızca kayıtlı local_db’ye bakıyordu.)
 */
export async function testPostgresEndpoint(config: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): Promise<PostgresStatus> {
  const effectiveHost = config.host === 'localhost' ? '127.0.0.1' : config.host;
  const connStr = `postgresql://${config.user}:${config.password}@${effectiveHost}:${config.port}/${config.database}`;

  try {
    if (!IS_TAURI) {
      try {
        const bridgeStatus = await fetch(`${getBridgeUrl()}/api/status`).then((r) => r.json());
        if (bridgeStatus.status !== 'RUNNING') throw new Error('Bridge is not running');
      } catch (e) {
        throw new Error(
          'PostgreSQL Bridge yanıt vermiyor (port 3001). Proje kökünde ayrı terminalde `npm run bridge` çalıştırın veya `npm run dev:with-bridge` kullanın.'
        );
      }

      const response = await fetch(`${getBridgeUrl()}/api/pg_query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connStr, sql: 'SELECT version() AS version', params: [] }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).error || 'Bağlantı hatası');
      }

      const res = await response.json();
      const row = res.rows?.[0];
      const version = row?.version != null ? String(row.version) : undefined;
      return {
        connected: true,
        host: config.host,
        port: config.port,
        database: config.database,
        mode: DB_SETTINGS.activeMode,
        version,
      };
    }

    const resultJson: string = await safeInvoke('pg_query', {
      connStr,
      sql: 'SELECT version() AS version',
      params: [],
    });
    const rows = JSON.parse(resultJson) as { version?: string }[];
    const version = rows[0]?.version != null ? String(rows[0].version) : undefined;
    return {
      connected: true,
      host: config.host,
      port: config.port,
      database: config.database,
      mode: DB_SETTINGS.activeMode,
      version,
    };
  } catch (error: any) {
    return {
      connected: false,
      host: config.host,
      port: config.port,
      database: config.database,
      mode: DB_SETTINGS.activeMode,
      error: error.message || 'Bağlantı başarısız',
    };
  }
}

export type PostgrestStatus = {
  connected: boolean;
  baseUrl: string;
  error?: string;
  httpStatus?: number;
};

function normalizeBaseUrl(input: string): string {
  const raw = (input || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

/** LAN / IP ile özel URL'de port yoksa varsayılan PostgREST 3002 (APK sık hata). */
export function normalizeCustomPostgrestUrl(input: string): string {
  const raw = normalizeBaseUrl(input);
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.port) return raw;
    if (u.protocol === 'http:') {
      const host = u.hostname.toLowerCase();
      const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
      const isLan =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
      if (isIp || isLan) {
        u.port = String(DEFAULT_POSTGREST_PORT);
        return normalizeBaseUrl(u.toString());
      }
    }
    return raw;
  } catch {
    return raw;
  }
}

/**
 * SaaS kökü (`https://api.retailex.app`) kiracı yolu olmadan login RPC vermez.
 * Varsayılan demo DB adı (`retailex_demo`) ile tamamla.
 */
export function ensureSaasTenantRemoteRestUrl(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const parsed = parseSaaSOrCustomPostgrestUrl(raw);
  if (parsed.kind === 'saas_single_slug') return normalizeBaseUrl(raw);
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    if (u.hostname === 'api.retailex.app') {
      const segs = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      if (segs.length === 0) {
        const slug = String(REMOTE_PG_DEFAULTS.database || 'retailex_demo').trim() || 'retailex_demo';
        return buildSaaSTenantPostgrestUrl(slug);
      }
    }
  } catch {
    /* özel URL */
  }
  return normalizeBaseUrl(raw);
}

/** Kayıtlı / çalışma anı PostgREST URL — SaaS yollarına dokunmaz, LAN IP’ye :3002 ekler. */
export function normalizeStoredRemoteRestUrl(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const parsed = parseSaaSOrCustomPostgrestUrl(raw);
  if (parsed.kind === 'saas_single_slug') return normalizeBaseUrl(raw);
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    if (u.hostname === 'api.retailex.app') {
      return ensureSaasTenantRemoteRestUrl(raw);
    }
  } catch {
    /* özel URL */
  }
  return normalizeCustomPostgrestUrl(raw);
}

function isRetailexSaasPostgrestHost(host: string): boolean {
  const h = String(host || '').toLowerCase();
  return h === 'api.retailex.app' || h.endsWith('.retailex.app');
}

function saasTenantSlugFromUrl(url: string): string {
  const parsed = parseSaaSOrCustomPostgrestUrl(url);
  return parsed.kind === 'saas_single_slug' ? parsed.slug : '';
}

/** Mobil / LAN veya Asin bulutu PostgREST hataları için Türkçe yönlendirme metni. */
export function explainPostgrestConnectionError(
  url: string,
  opts?: { error?: string; httpStatus?: number; bodySnippet?: string },
): string {
  const raw = String(url || '').trim();
  let host = '';
  let port = '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    host = u.hostname.toLowerCase();
    port = u.port || (u.protocol === 'https:' ? '443' : '80');
  } catch {
    /* geçersiz URL */
  }

  const saas = isRetailexSaasPostgrestHost(host);
  const slug = saasTenantSlugFromUrl(raw);
  const body = String(opts?.bodySnippet || opts?.error || '');
  const gatewayNotFound = /"not_found"|not_found/i.test(body);

  if (saas) {
    const httpStatus = opts?.httpStatus;
    if (httpStatus === 404 || gatewayNotFound) {
      const kod = slug || 'kiracı_kodu';
      return (
        `Asin bulutu: https://api.retailex.app/${kod} yolu bulunamadı (HTTP 404` +
        `${gatewayNotFound ? ', gateway not_found' : ''}). ` +
        `LAN Wi‑Fi / port 3002 bu mod için geçerli değildir. ` +
        `Kiracı kodunu kontrol edin. ` +
        `Kod doğruysa sunucuda postgrest_${kod} ve API gateway yeniden yayınlanmalı.`
      );
    }
    if (httpStatus === 503) {
      return (
        `Asin bulutu: kiracı API'si geçici olarak yanıt vermiyor (HTTP 503). ` +
        `postgrest_${slug || '…'} veya veritabanı kontrol edilmeli. LAN / port 3002 ile ilgili değildir.`
      );
    }
    if (httpStatus === 406) {
      return (
        `Asin bulutu: PostgREST Accept başlığı reddedildi (HTTP 406). ` +
        `Kiracı URL'si doğru mu kontrol edin: https://api.retailex.app/${slug || 'kiracı'}.`
      );
    }

    const msg = String(opts?.error || '').trim();
    const isNetwork =
      !httpStatus &&
      (msg.includes('Failed to fetch') ||
        msg.includes('Network') ||
        msg.includes('timeout') ||
        msg.includes('Unable to resolve') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('Connection refused'));
    if (isNetwork) {
      return (
        'Asin bulutuna (api.retailex.app) ulaşılamadı. İnternet bağlantınızı kontrol edin. ' +
        'LAN Wi‑Fi / TCP 3002 bu ekran için geçerli değildir.'
      );
    }
    return msg || 'Asin bulutu PostgREST erişilemedi';
  }

  if (port === '3001') {
    return 'Port 3001 SQL Bridge servisidir (pg_bridge), PostgREST değil. Adres: http://PC_WiFi_IP:3002';
  }

  const httpStatus = opts?.httpStatus;
  if (httpStatus === 404) {
    return 'PostgREST firms tablosuna erişilemedi (404). Port 3002 ve Windows hizmeti AsinERP_PostgREST kontrol edin.';
  }
  if (httpStatus === 406) {
    return 'PostgREST yanıt vermiyor (HTTP 406). Port 3002 ve Windows hizmeti AsinERP_PostgREST kontrol edin.';
  }

  const msg = String(opts?.error || '').trim();
  const isNetwork =
    !httpStatus &&
    (msg.includes('Failed to fetch') ||
      msg.includes('Network') ||
      msg.includes('timeout') ||
      msg.includes('Unable to resolve') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('Connection refused'));

  if (isNetwork) {
    const hints = [
      'Telefon ve merkez PC aynı Wi‑Fi ağında olmalı — mobil veri (4G/5G) ile LAN IP çalışmaz.',
    ];
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      hints.push(
        `${host} genelde WSL sanal ağıdır; Windows'ta cmd → ipconfig ile Wi‑Fi IPv4 (192.168.x.x) adresini kullanın.`,
      );
    }
    hints.push('Merkez PC: PostgREST servisi çalışıyor olmalı; güvenlik duvarında TCP 3002 açık olmalı.');
    hints.push('Örnek: http://192.168.1.10:3002');
    return hints.join(' ');
  }

  return msg || 'PostgREST erişilemedi';
}

/** SaaS 404: merkez tenant_registry ile «yanlış kod» vs «kayıtlı ama gateway yok» ayrımı. */
async function enrichSaasPostgrest404Error(
  url: string,
  baseError: string,
): Promise<string> {
  const slug = saasTenantSlugFromUrl(url);
  if (!slug) return baseError;
  try {
    const regUrl =
      `${DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN}/merkez/tenant_registry` +
      `?code=eq.${encodeURIComponent(slug)}&select=code,display_name,is_active&limit=1`;
    const res = await fetchRetailexAware(regUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return baseError;
    const rows = (await res.json()) as Array<{
      code?: string;
      display_name?: string;
      is_active?: boolean;
    }>;
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (row?.code) {
      const name = String(row.display_name || row.code).trim();
      const active = row.is_active === false ? ' (pasif)' : '';
      return (
        `Kiracı «${slug}» merkez kayıtta var (${name}${active}), ancak ` +
        `https://api.retailex.app/${slug} API gateway'de 404 (not_found). ` +
        `Kod doğru (berzin_com başka firmadır). Sunucuda: ` +
        `docker compose -f docker-compose.dokploy.yml up -d postgrest_${slug} sync_${slug} retailex_api_gateway`
      );
    }
    return (
      `Kiracı kodu «${slug}» api.retailex.app üzerinde yok ve merkez tenant_registry'de bulunamadı. ` +
      `Doğru kodu operatörden alın (Özbek Restoran için beklenen: ozbek).`
    );
  } catch {
    return baseError;
  }
}

/**
 * PostgREST için erişilebilirlik testi — gerçek tablo sorgusu (/firms).
 * Kök yol 406 dönebilir; bu tek başına yeterli değildir.
 */
export async function testPostgrestUrl(baseUrl: string): Promise<PostgrestStatus> {
  const url = normalizeStoredRemoteRestUrl(baseUrl);
  if (!url) return { connected: false, baseUrl: baseUrl, error: 'PostgREST URL boş' };
  const probeHeaders = {
    Accept: 'application/json',
    'Accept-Profile': 'public',
  };
  try {
    const res = await fetchRetailexAware(`${url}/firms?select=firm_nr&limit=1`, {
      method: 'GET',
      headers: probeHeaders,
    });
    if (res.ok) {
      return { connected: true, baseUrl: url, httpStatus: res.status };
    }
    const text = (await res.text()).slice(0, 240);
    if (res.status === 404 || res.status === 406) {
      let error = explainPostgrestConnectionError(url, {
        httpStatus: res.status,
        bodySnippet: text,
      });
      const parsed = parseSaaSOrCustomPostgrestUrl(url);
      if (res.status === 404 && parsed.kind === 'saas_single_slug') {
        error = await enrichSaasPostgrest404Error(url, error);
      }
      return {
        connected: false,
        baseUrl: url,
        httpStatus: res.status,
        error,
      };
    }
    return {
      connected: false,
      baseUrl: url,
      httpStatus: res.status,
      error: explainPostgrestConnectionError(url, {
        httpStatus: res.status,
        bodySnippet: text,
        error: `HTTP ${res.status}${text ? ` — ${text}` : ''}`,
      }),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      connected: false,
      baseUrl: url,
      error: explainPostgrestConnectionError(url, { error: msg }),
    };
  }
}

/**
 * Web / çok istemci: `public.system_settings` (tek satır) üzerinden açılış varsayılanlarını PG’den alır,
 * çalışma zamanına ve (web’de) localStorage’a yazar. PostgREST-only modda atlanır.
 */
async function syncRuntimeSettingsFromPostgres(): Promise<void> {
  if (DB_SETTINGS.connectionProvider === 'rest_api') return;

  const pg = PostgresConnection.getInstance();
  let rows: { default_currency?: string; primary_firm_nr?: string | null; primary_period_nr?: string | null }[];
  try {
    const res = await pg.query(
      `SELECT default_currency, primary_firm_nr, primary_period_nr FROM public.system_settings WHERE id = 1`,
      []
    );
    rows = res.rows as typeof rows;
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    if (e?.code === '42P01' || msg.includes('system_settings') || msg.includes('does not exist')) {
      console.warn('[syncRuntimeSettingsFromPostgres] system_settings tablosu yok; migration 010 çalıştırın.');
      return;
    }
    throw e;
  }

  const row = rows[0];
  if (!row) return;

  const cur = String(row.default_currency || 'IQD').trim().toUpperCase().slice(0, 10) || 'IQD';
  APP_DEFAULT_CURRENCY = cur;
  setGlobalCurrency(getAppDefaultCurrency(), getAppDefaultCurrency());

  // Masaüstü: firma/dönem kurulum (config.db erp_firm_nr) esas; yerel system_settings şablonu (001) ezmesin.
  if (IS_TAURI) {
    console.log('[syncRuntimeSettingsFromPostgres] Tauri: para birimi güncellendi; firma/dönem config korundu:', {
      default_currency: cur,
      firmNr: ERP_SETTINGS.firmNr,
      periodNr: ERP_SETTINGS.periodNr,
    });
    return;
  }

  const fn = String(row.primary_firm_nr || ERP_SETTINGS.firmNr || '001').trim().padStart(3, '0').slice(0, 10);
  const pn = String(row.primary_period_nr || ERP_SETTINGS.periodNr || '01').trim().padStart(2, '0').slice(0, 10);
  ERP_SETTINGS = { ...ERP_SETTINGS, firmNr: fn, periodNr: pn };

  await updateConfigs({ erp: { firmNr: fn, periodNr: pn } });
  console.log('[syncRuntimeSettingsFromPostgres] PG → runtime:', { default_currency: cur, firmNr: fn, periodNr: pn });
}

export class PostgresConnection {
  private static instance: PostgresConnection;
  private hybridSyncTimer: ReturnType<typeof setInterval> | null = null;
  private hybridSyncInProgress = false;
  private status: PostgresStatus = {
    connected: false,
    host: '',
    port: 0,
    database: '',
    mode: 'hybrid'
  };

  private startHybridAutoSync(): void {
    if (typeof window === 'undefined') return;
    // Tauri: Rust BackgroundSyncService (sync.rs) zaten sync_queue işler; JS timer pg_query mutex'ini POS ödemesiyle çakıştırır.
    if (IS_TAURI) return;
    stopUnifiedHybridAutoSync();
    if (DB_SETTINGS.activeMode !== 'hybrid') return;
    void import('./syncTransportDiagnostics').then(({ logSyncTransportDiagnostics }) => {
      logSyncTransportDiagnostics('HybridAutoSync');
    });
    startUnifiedHybridAutoSync({
      storeId: undefined,
      intervalSec: normalizeHybridSyncIntervalSec(DB_SETTINGS.hybridSyncIntervalSec),
    });
  }

  private constructor() { }

  static getInstance(): PostgresConnection {
    if (!PostgresConnection.instance) {
      PostgresConnection.instance = new PostgresConnection();
    }
    return PostgresConnection.instance;
  }

  async connect(): Promise<PostgresStatus> {
    // Ensure we have latest config before connecting
    await initializeFromSQLite();

    // Rest API modunda veya hibrit+remote_rest_url: merkez API, yerel PG ayrı test edilir.
    if (shouldUseCentralApi() && DB_SETTINGS.activeMode !== 'offline') {
      const pr = await testPostgrestUrl(DB_SETTINGS.remoteRestUrl);
      let localOk = true;
      if (DB_SETTINGS.activeMode === 'hybrid') {
        const localSt = await testDbConfig(LOCAL_CONFIG);
        localOk = localSt.connected;
      }
      this.status = {
        connected: pr.connected && localOk,
        host: pr.baseUrl,
        port: 0,
        database: DB_SETTINGS.activeMode === 'hybrid' ? 'hybrid:local-pg+postgrest' : 'postgrest',
        mode: DB_SETTINGS.activeMode,
        error: !pr.connected ? pr.error : !localOk ? 'Yerel PostgreSQL bağlantısı yok' : undefined,
      };
      console.log(
        `🔌 ${DB_SETTINGS.activeMode} + PostgREST: uzak=${pr.baseUrl}, yerel PG=${localOk ? 'ok' : 'hata'}`,
      );
      if (this.status.connected) this.startHybridAutoSync();
      return this.status;
    }

    if (DB_SETTINGS.activeMode === 'hybrid' && !shouldUseCentralApi()) {
      const chain = getDbSqlTargetChain();
      let lastSt: PostgresStatus | undefined;
      for (const cfg of chain) {
        lastSt = await testDbConfig(cfg);
        if (lastSt.connected) {
          this.status = { ...lastSt, mode: 'hybrid' };
          console.log(
            `🔌 Hybrid (${DB_SETTINGS.hybridReadPreference}) → ${lastSt.host}:${lastSt.port}/${lastSt.database}`
          );
          break;
        }
      }
      if (lastSt && !lastSt.connected) {
        this.status = { ...lastSt, mode: 'hybrid', connected: false };
      }
    } else {
      const targetConfig = DB_SETTINGS.activeMode === 'online' ? REMOTE_CONFIG : LOCAL_CONFIG;
      this.status = await testDbConfig(targetConfig);
      console.log(`🔌 Connected in ${DB_SETTINGS.activeMode} mode to ${this.status.host}`);
    }

    if (this.status.connected && (DB_SETTINGS.connectionProvider === 'db' || DB_SETTINGS.activeMode === 'hybrid')) {
      try {
        await syncRuntimeSettingsFromPostgres();
      } catch (e: any) {
        console.warn('[connect] syncRuntimeSettingsFromPostgres:', e?.message || String(e));
      }
    }

    this.startHybridAutoSync();
    return this.status;
  }

  getStatus() { return this.status; }

  private static CARD_TABLES = [
    'products', 'customers', 'suppliers', 'sales_reps', 'cash_registers', 'cash_register_transactions',
    'categories', 'brands', 'units', 'tax_rates', 'special_codes',
    'unitsets', 'unitsetl',
    'campaigns', 'product_variants', 'product_barcodes', 'product_unit_conversions', 'lots', 'bank_registers', 'expense_cards',
    'services',
    // Restaurant card tables (rest schema)
    'rest_tables', 'rest_recipes', 'rest_recipe_ingredients', 'rest_staff',
    // Beauty card tables (beauty schema)
    'beauty_specialists', 'beauty_services', 'beauty_packages', 'beauty_devices', 'beauty_leads',
    'beauty_satisfaction_surveys', 'beauty_satisfaction_questions',
    'beauty_branches', 'beauty_rooms', 'beauty_portal_settings', 'beauty_corporate_accounts',
    'beauty_consent_templates', 'beauty_memberships', 'beauty_service_consumables', 'beauty_customer_health',
    'beauty_product_batches',     'beauty_marketing_campaigns', 'beauty_integration_settings',
    'messaging_settings'
  ];
  private static MOVEMENT_TABLES = [
    'sales', 'sale_items', 'stock_moves', 'cash_lines', 'stock_movements', 'stock_movement_items', 'invoices', 'invoice_items', 'bank_lines',
    'virman_operations', 'virman_items',
    // Restaurant movement tables (rest schema)
    'rest_orders', 'rest_order_items', 'rest_kitchen_orders', 'rest_kitchen_items', 'rest_reservations',
    'kitchen_print_jobs', 'print_jobs',
    // Beauty movement tables (beauty schema)
    'beauty_appointments', 'beauty_sessions', 'beauty_session_logs',
    'beauty_package_purchases', 'beauty_package_sales', 'beauty_device_usage',
    'beauty_device_alerts', 'beauty_customer_feedback', 'beauty_sales', 'beauty_sale_items',
    'beauty_waitlist', 'beauty_booking_requests', 'beauty_notification_queue', 'beauty_consent_submissions',
    'beauty_clinical_notes', 'beauty_patient_photos', 'beauty_membership_subscriptions', 'beauty_audit_log',
    'beauty_consumable_usage_log',
    'notification_queue'
  ];

  // Tables that live in a dedicated schema (not public)
  private static TABLE_SCHEMA: Record<string, string> = {
    'rest_tables': 'rest', 'rest_recipes': 'rest', 'rest_recipe_ingredients': 'rest', 'rest_staff': 'rest',
    'rest_orders': 'rest', 'rest_order_items': 'rest', 'rest_kitchen_orders': 'rest', 'rest_kitchen_items': 'rest', 'rest_reservations': 'rest',
    'kitchen_print_jobs': 'rest', 'print_jobs': 'rest',
    'beauty_specialists': 'beauty', 'beauty_services': 'beauty', 'beauty_packages': 'beauty', 'beauty_devices': 'beauty',
    'beauty_appointments': 'beauty', 'beauty_sessions': 'beauty', 'beauty_session_logs': 'beauty',
    'beauty_package_purchases': 'beauty', 'beauty_package_sales': 'beauty', 'beauty_device_usage': 'beauty',
    'beauty_leads': 'beauty', 'beauty_satisfaction_surveys': 'beauty', 'beauty_satisfaction_questions': 'beauty',
    'beauty_device_alerts': 'beauty', 'beauty_customer_feedback': 'beauty',
    'beauty_sales': 'beauty', 'beauty_sale_items': 'beauty',
    'beauty_branches': 'beauty', 'beauty_rooms': 'beauty', 'beauty_portal_settings': 'beauty',
    'beauty_corporate_accounts': 'beauty', 'beauty_consent_templates': 'beauty', 'beauty_memberships': 'beauty',
    'beauty_service_consumables': 'beauty', 'beauty_customer_health': 'beauty', 'beauty_product_batches': 'beauty',
    'beauty_marketing_campaigns': 'beauty', 'beauty_integration_settings': 'beauty',
    'beauty_waitlist': 'beauty', 'beauty_booking_requests': 'beauty', 'beauty_notification_queue': 'beauty',
    'beauty_consent_submissions': 'beauty', 'beauty_clinical_notes': 'beauty', 'beauty_patient_photos': 'beauty',
    'beauty_membership_subscriptions': 'beauty', 'beauty_audit_log': 'beauty', 'beauty_consumable_usage_log': 'beauty',
    'products': 'public', 'customers': 'public', 'suppliers': 'public', 'categories': 'public'
  };

  /** Returns schema-qualified prefixed name for a firm-level card table.
   *  e.g. getCardTableName('rest_tables', 'rest') → 'rest.rex_001_rest_tables'
   */
  getCardTableName(table: string, schema = 'public'): string {
    const firmRaw = String(ERP_SETTINGS.firmNr || '001').trim();
    const firm = firmRaw.padStart(3, '0').slice(0, 10);
    const prefixed = `rex_${firm}_${table}`;
    return schema === 'public' ? prefixed : `${schema}.${prefixed}`;
  }

  /** Returns schema-qualified prefixed name for a period movement table.
   *  e.g. getMovementTableName('beauty_appointments', 'beauty') → 'beauty.rex_001_01_beauty_appointments'
   */
  getMovementTableName(table: string, schema = 'public'): string {
    const firmRaw = String(ERP_SETTINGS.firmNr || '001').trim();
    const firm = firmRaw.padStart(3, '0').slice(0, 10);
    const periodRaw = String(ERP_SETTINGS.periodNr || '01').trim();
    const period = periodRaw.padStart(2, '0').slice(0, 10);
    const prefixed = `rex_${firm}_${period}_${table}`;
    return schema === 'public' ? prefixed : `${schema}.${prefixed}`;
  }

  async query<T = any>(sql: string, params: any[] = [], options?: { firmNr?: string, periodNr?: string }): Promise<{ rows: T[]; rowCount: number }> {
    // Production webte tenant_registry çözülmeden tablo/sorgu trafiğini başlatma.
    if (!IS_TAURI && IS_PRODUCTION && !isTenantResolvedForWeb()) {
      throw new Error('Kiracı bağlantısı yapılmadan sorgu çalıştırılamaz. Önce "Merkezden bağlan" ile tenant_registry kaydını uygulayın.');
    }

    // rest_api modunda bile bu method çağrılabilir (legacy akışlar).
    // Şimdilik burada hard-stop yapmıyoruz; SQL tarafı erişilebilir değilse hata dönecektir.

    // 1. Resolve Dynamic Table Names (Query Rewriting)
    let resolvedSql = sql;

    // Normalizasyon: Postgres bridge için tipleri koru (booleans/numbers ham iletilir).
    // Dizileri stringify etme — ANY($1) ve array parametreleri için gerçek dizi gönderilmeli (Tauri/Rust tarafında doğru bind edilsin).
    const normalizedParams = params.map((p: any) => {
      if (p === null || p === undefined) return null;
      if (typeof p === 'boolean' || typeof p === 'number') return p;
      if (typeof p === 'bigint') return p.toString();
      if (Array.isArray(p)) return p;

      if (typeof p === 'object') {
        if (p instanceof Date) return p.toISOString();
        if (typeof (p as any).toISOString === 'function') return (p as any).toISOString();
        try { return JSON.stringify(p); } catch (e) { return String(p); }
      }

      return String(p);
    });

    const effectiveFirmNr = (options?.firmNr || ERP_SETTINGS.firmNr || '001')
      .toString().padStart(3, '0');
    const effectivePeriodNr = (options?.periodNr || ERP_SETTINGS.periodNr || '01')
      .toString().padStart(2, '0');

    PostgresConnection.CARD_TABLES.forEach(table => {
      const schema = PostgresConnection.TABLE_SCHEMA[table] || 'public';
      const prefixed = `rex_${effectiveFirmNr}_${table}`;
      const fullName = schema === 'public' ? prefixed : `${schema}.${prefixed}`;
      // 1. Rewrite plain table name: rest_tables → rest.rex_001_rest_tables
      const plainRegex = new RegExp(`(?<!\\.)\\b${table}\\b`, 'gi');
      resolvedSql = resolvedSql.replace(plainRegex, fullName);
      // 2. Rewrite explicit schema.tablename: rest.rest_tables → rest.rex_001_rest_tables
      const schemaRegex = new RegExp(`\\b${schema}\\.${table}\\b`, 'gi');
      resolvedSql = resolvedSql.replace(schemaRegex, `${schema}.${prefixed}`);
    });

    PostgresConnection.MOVEMENT_TABLES.forEach(table => {
      const schema = PostgresConnection.TABLE_SCHEMA[table];
      const prefixed = `rex_${effectiveFirmNr}_${effectivePeriodNr}_${table}`;
      const fullName = schema ? `${schema}.${prefixed}` : prefixed;
      // 1. Rewrite plain table name
      const plainRegex = new RegExp(`(?<!\\.)\\b${table}\\b`, 'gi');
      resolvedSql = resolvedSql.replace(plainRegex, fullName);
      // 2. Rewrite explicit schema.tablename
      if (schema) {
        const schemaRegex = new RegExp(`\\b${schema}\\.${table}\\b`, 'gi');
        resolvedSql = resolvedSql.replace(schemaRegex, `${schema}.${prefixed}`);
      }
    });

    // Attempt to log to a file for AI to read (no-op if Tauri backend has no log_to_file command)
    if (IS_TAURI) {
      void safeInvoke('log_to_file', {
        fileName: 'pg_queries.log',
        content: `[${new Date().toISOString()}] SQL: ${resolvedSql} PARAMS: ${JSON.stringify(normalizedParams)}\n`
      }, null as any);
    }

    const startTime = Date.now();
    try {
      const chain = getDbSqlTargetChain({ write: isSqlWriteStatement(resolvedSql) });
      let lastError: unknown;
      let rows: any[] | undefined;

      for (let i = 0; i < chain.length; i++) {
        const cfg = chain[i];
        try {
          rows = await executePgQueryRows(resolvedSql, normalizedParams, cfg);
          lastError = undefined;
          break;
        } catch (err: unknown) {
          lastError = err;
          const canTryNext = i < chain.length - 1 && isLikelyConnectivityFailure(err);
          if (canTryNext) {
            console.warn(
              `[Postgres] Hibrit yedek: ${cfg.host}:${cfg.port} başarısız (${String((err as Error)?.message || err)}), sıradaki uç deneniyor…`
            );
            continue;
          }
          throw err;
        }
      }

      if (rows === undefined) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Database query failed'));
      }

      const duration = Date.now() - startTime;
      logger.sql('Postgres', resolvedSql, normalizedParams, duration);

      return {
        rows: rows as T[],
        rowCount: rows.length
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[Postgres] Query Detail Error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      logger.error('Postgres', `Query Failed: ${resolvedSql}`, {
        message: error.message,
        stack: error.stack,
        code: error.code,
        detail: error.detail,
        hint: error.hint,
        params,
        duration
      });
      throw error;
    }
  }

  /**
   * Run migrations using the backend's migration system
   */
  async runMigrations(loadDemo: boolean = false): Promise<{ success: boolean; message: string }> {
    try {
      if (!IS_TAURI) {
        return { success: true, message: 'Web environment: Migrations handled via bridge or pre-configured' };
      }
      console.log(`🛠 Running Database Migrations (Demo: ${loadDemo ? 'YES' : 'NO'})...`);

      const config: any = await safeInvoke('get_app_config');
      const target = DB_SETTINGS.activeMode === 'online' ? 'remote' : 'local';

      const message: string = await safeInvoke('run_migrations', {
        config,
        target,
        loadDemoData: loadDemo
      });

      return { success: true, message };
    } catch (error: any) {
      console.error('Migration error:', error);
      return { success: false, message: `Hata: ${error}` };
    }
  }

  /**
   * Şema migrasyonları (demo verisi değil). Örnek veri yalnızca açıkça `runMigrations(true)` veya Demo Veri ekranından istenir.
   */
  async initializeDatabase(): Promise<{ success: boolean; message: string }> {
    return this.runMigrations(false);
  }

  /**
   * Get unique device ID (Hardware based if possible)
   */
  async getDeviceId(): Promise<string> {
    try {
      // In Tauri, we'd use something like:
      // return await invoke('get_device_hwid');

      // Fallback: Persistent UUID in localStorage
      let deviceId = localStorage.getItem('retailex_device_id');
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('retailex_device_id', deviceId);
      }
      return deviceId;
    } catch (e) {
      return 'RE-GLOBAL-001';
    }
  }

  /**
   * Register this device to a store (masaüstü → merkez onay kuyruğu)
   */
  async registerDevice(name: string, storeId: string): Promise<{ success: boolean; message: string }> {
    try {
      const {
        registerDesktopTerminal,
        collectDesktopDeviceMetadata,
        isHybridDeviceRegistrationMode,
      } = await import('./deviceRegistrationService');
      const deviceInfo = await collectDesktopDeviceMetadata();

      if (deviceInfo.role !== 'client') {
        return { success: true, message: 'Merkez/sunucu rolü — cihaz kaydı atlandı.' };
      }

      if (!isHybridDeviceRegistrationMode()) {
        return { success: true, message: 'Hibrit mod dışında cihaz kaydı gerekmez.' };
      }

      console.log(`📡 Registering device ${name} (${deviceInfo.deviceId}) to store ${storeId}`);

      const result = await registerDesktopTerminal({
        deviceId: deviceInfo.deviceId,
        terminalName: name || deviceInfo.terminalName,
        storeId,
        firmNr: deviceInfo.firmNr,
        role: deviceInfo.role,
        deviceInfo,
      });

      localStorage.setItem(
        'retailex_registered_device',
        JSON.stringify({
          name,
          storeId,
          deviceId: deviceInfo.deviceId,
          status: result.status,
          deviceInfo,
        }),
      );

      return {
        success: result.ok,
        message: result.message,
      };
    } catch (error: unknown) {
      console.error('Device registration error:', error);
      return {
        success: false,
        message: `Hata: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get active firm details
   */
  async getFirmDetails(firmNr: string): Promise<any> {
    try {
      const result = await this.query(
        'SELECT * FROM firms WHERE firm_nr = $1 AND is_active = true',
        [firmNr]
      );
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (e) {
      console.error('Failed to get firm details:', e);
      return null;
    }
  }

  /**
   * Verify local database password
   */
  async verifyPassword(password: string): Promise<boolean> {
    // In a real implementation, this would try to connect with the given password
    // For now, we compare with the local config password
    return password === LOCAL_CONFIG.password;
  }

  async sync(opts?: PostgresSyncOptions): Promise<{
    success: boolean;
    totalSynced: number;
    direction?: HybridSyncDirection;
    message?: string;
  }> {
    const mode = opts?.mode ?? DB_SETTINGS.activeMode;
    const direction = opts?.hybridSyncDirection ?? DB_SETTINGS.hybridSyncDirection;
    if (mode !== 'hybrid') {
      return {
        success: false,
        totalSynced: 0,
        message:
          'Senkron yalnızca hibrit bağlantı modunda kullanılabilir. Modu «Hybrid» yapın veya ayarı kaydedin.',
      };
    }

    const result = await runHybridSync({
      direction,
      flow: opts?.flow,
      scope: opts?.scope ?? 'all',
      filter: opts?.filter,
      local: LOCAL_CONFIG,
      remote: getCentralRemotePgConfig(),
      connectionProvider: resolveHybridSyncConnectionProvider(),
      remoteRestUrl: DB_SETTINGS.remoteRestUrl,
    });

    if (result.success && result.totalSynced > 0) {
      DB_SETTINGS.lastSync = new Date().toISOString();
      await updateConfigs({ settings: { lastSync: DB_SETTINGS.lastSync } });
    }

    return {
      success: result.success,
      totalSynced: result.totalSynced,
      direction: result.direction,
      message: result.message,
    };
  }
}

export const postgres = PostgresConnection.getInstance();
postgres.connect().catch(console.error);

// Legacy exports for compatibility
export const DB_CONFIG = REMOTE_CONFIG;
export const CONNECTION_STRING = `postgresql://${REMOTE_CONFIG.user}:***@${REMOTE_CONFIG.host}:${REMOTE_CONFIG.port}/${REMOTE_CONFIG.database}`;

export const TABLES = {
  USERS: 'users',
  STORES: 'stores',
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  SALES: 'sales',
  SALE_ITEMS: 'sale_items',
  CUSTOMERS: 'customers',
  INVOICES: 'invoices',
  CAMPAIGNS: 'campaigns',
} as const;
