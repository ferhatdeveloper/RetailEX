import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Web Login `db_mode`: offline≈local, online≈uzak. Mobil UI: local | online */
export type DbMode = 'local' | 'online';

/**
 * Cihaz ağ politikası (NetInfo + cache).
 * `dbMode` ile karıştırma: dbMode = hangi PG ucu; networkPolicy = canlı mı / cache mi.
 * Ayrıntı: `src/offline/HYBRID_POLICY.md`
 */
export type NetworkPolicy = 'online' | 'offline' | 'hybrid';

/**
 * Veri taşıma katmanı (web `connection_provider` benzeri).
 * `networkPolicy` ile karıştırma: apiMode = Bridge SQL mi / PostgREST mi.
 */
export type ApiMode = 'bridge' | 'postgrest' | 'hybrid';

export type PgEndpoint = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export type DbConfig = {
  bridgeHost: string;
  bridgePort: number;
  /** local = şube/yerel PG; online = merkez/uzak PG */
  dbMode: DbMode;
  /**
   * online = her zaman bridge/PG;
   * offline = yalnızca cache + kuyruk;
   * hybrid = net varken PG, yokken cache (varsayılan)
   */
  networkPolicy: NetworkPolicy;
  /**
   * bridge = yalnızca pg_bridge SQL;
   * postgrest = kiracı REST (`remote_rest_url`);
   * hybrid = okumada PostgREST tercih, başarısızsa bridge
   */
  apiMode: ApiMode;
  /** Web `remote_rest_url` — örn. https://api.retailex.app/aqua */
  remoteRestUrl: string;
  /** İsteğe bağlı JWT / anon key (Supabase-uyumlu PostgREST Apikey) */
  postgrestAnonKey: string;
  /** Kısa kiracı kodu (örn. ozbek) — uzun URL yerine */
  merkezTenantCode: string;
  /** tenant_registry.display_name */
  merkezDisplayName: string;
  local: PgEndpoint;
  remote: PgEndpoint;
  /** Kullanıcı en az bir kez Kaydet’e bastı */
  isConfigured: boolean;
};

function envString(value: string | undefined): string {
  return String(value ?? '').trim();
}

function envPort(value: string | undefined, fallback: number): number {
  const n = Number(envString(value));
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : fallback;
}

function envDbMode(value: string | undefined): DbMode {
  return envString(value) === 'online' ? 'online' : 'local';
}

function envNetworkPolicy(value: string | undefined): NetworkPolicy {
  const v = envString(value);
  return v === 'online' || v === 'offline' || v === 'hybrid' ? v : 'hybrid';
}

function envApiMode(value: string | undefined): ApiMode {
  const v = envString(value);
  return v === 'postgrest' || v === 'hybrid' || v === 'bridge' ? v : 'hybrid';
}

/** Varsayılan PostgREST port (web `DEFAULT_POSTGREST_PORT`) */
export const DEFAULT_POSTGREST_PORT = 3002;

/**
 * Web `normalizeCustomPostgrestUrl` / `normalizeStoredRemoteRestUrl`:
 * sondaki / temizlenir; LAN/IP http URL’de port yoksa :3002 eklenir.
 * SaaS (`api.retailex.app`) yollarına dokunulmaz.
 */
export function normalizeRemoteRestUrl(input: string | null | undefined): string {
  const raw = String(input ?? '').trim().replace(/\/+$/, '');
  if (!raw) return '';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
    const u = new URL(withProto);
    const host = u.hostname.toLowerCase();
    if (host === 'api.retailex.app' || host.endsWith('.retailex.app')) {
      // Protokolsüz SaaS girişi → https (fetch schemesiz URL kırılır)
      const saas = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      return saas.replace(/\/+$/, '');
    }
    if (u.port) return u.toString().replace(/\/+$/, '');
    if (u.protocol === 'http:') {
      const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
      const isLan =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
      if (isIp || isLan) {
        u.port = String(DEFAULT_POSTGREST_PORT);
        return u.toString().replace(/\/+$/, '');
      }
    }
    return u.toString().replace(/\/+$/, '');
  } catch {
    return raw;
  }
}

/**
 * Çalışma anı PostgREST tabanı: kayıtlı URL veya kiracı kodundan SaaS URL.
 * Web `resolveEffectiveRemoteRestUrl` + boş URL’de `buildSaaSTenantPostgrestUrl` tamamlayıcısı.
 */
export function resolveEffectiveRemoteRestUrl(
  remoteRestUrl?: string | null,
  merkezTenantCode?: string | null,
): string {
  const remote = normalizeRemoteRestUrl(remoteRestUrl);
  const tenant = String(merkezTenantCode ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');
  if (remote) {
    try {
      const u = new URL(/^https?:\/\//i.test(remote) ? remote : `https://${remote}`);
      if (u.hostname === 'api.retailex.app') {
        const segs = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
        if (segs.length === 0 && tenant && tenant !== 'merkez') {
          return normalizeRemoteRestUrl(`https://api.retailex.app/${tenant}`);
        }
      }
    } catch {
      /* olduğu gibi */
    }
    return remote;
  }
  if (tenant && tenant !== 'merkez') {
    return normalizeRemoteRestUrl(`https://api.retailex.app/${tenant}`);
  }
  return '';
}

/** Eski tek-uç alanlar (migration) */
type LegacyFlatConfig = Partial<{
  bridgeHost: string;
  bridgePort: number;
  pgHost: string;
  pgPort: number;
  database: string;
  user: string;
  password: string;
  dbMode: DbMode;
  networkPolicy: NetworkPolicy;
  apiMode: ApiMode;
  remoteRestUrl: string;
  remote_rest_url: string;
  postgrestAnonKey: string;
  postgrest_anon_key: string;
  merkezTenantCode: string;
  merkez_tenant_code: string;
  merkezDisplayName: string;
  merkez_display_name: string;
  local: Partial<PgEndpoint>;
  remote: Partial<PgEndpoint>;
  isConfigured: boolean;
}>;

const DEFAULT_LOCAL: PgEndpoint = {
  host: '127.0.0.1',
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: '',
};

const DEFAULT_REMOTE: PgEndpoint = {
  host: '127.0.0.1',
  port: 5432,
  database: 'retailex_local',
  user: 'postgres',
  password: '',
};

/** Emülatör: 10.0.2.2 = PC localhost. Fiziksel cihaz: LAN IP girilmeli. */
function defaultBridgeHost(): string {
  if (Platform.OS === 'android') return '10.0.2.2';
  return '127.0.0.1';
}

function publicPgEndpoint(which: 'local' | 'remote', fallback: PgEndpoint): PgEndpoint {
  const isRemote = which === 'remote';
  return {
    host:
      envString(
        isRemote
          ? process.env.EXPO_PUBLIC_REMOTE_PG_HOST || process.env.EXPO_PUBLIC_PG_HOST
          : process.env.EXPO_PUBLIC_LOCAL_PG_HOST || process.env.EXPO_PUBLIC_PG_HOST,
      ) || fallback.host,
    port: envPort(
      isRemote
        ? process.env.EXPO_PUBLIC_REMOTE_PG_PORT || process.env.EXPO_PUBLIC_PG_PORT
        : process.env.EXPO_PUBLIC_LOCAL_PG_PORT || process.env.EXPO_PUBLIC_PG_PORT,
      fallback.port,
    ),
    database:
      envString(
        isRemote
          ? process.env.EXPO_PUBLIC_REMOTE_PG_DATABASE || process.env.EXPO_PUBLIC_PG_DATABASE
          : process.env.EXPO_PUBLIC_LOCAL_PG_DATABASE || process.env.EXPO_PUBLIC_PG_DATABASE,
      ) || fallback.database,
    user:
      envString(
        isRemote
          ? process.env.EXPO_PUBLIC_REMOTE_PG_USER || process.env.EXPO_PUBLIC_PG_USER
          : process.env.EXPO_PUBLIC_LOCAL_PG_USER || process.env.EXPO_PUBLIC_PG_USER,
      ) || fallback.user,
    password:
      isRemote
        ? process.env.EXPO_PUBLIC_REMOTE_PG_PASSWORD ?? process.env.EXPO_PUBLIC_PG_PASSWORD ?? fallback.password
        : process.env.EXPO_PUBLIC_LOCAL_PG_PASSWORD ?? process.env.EXPO_PUBLIC_PG_PASSWORD ?? fallback.password,
  };
}

const DEFAULT_CONFIG: DbConfig = {
  bridgeHost: envString(process.env.EXPO_PUBLIC_BRIDGE_HOST) || defaultBridgeHost(),
  bridgePort: envPort(process.env.EXPO_PUBLIC_BRIDGE_PORT, 3001),
  dbMode: envDbMode(process.env.EXPO_PUBLIC_DB_MODE),
  networkPolicy: envNetworkPolicy(process.env.EXPO_PUBLIC_NETWORK_POLICY),
  /** Varsayılan hybrid; saf PostgREST + remoteRestUrl ile ana okumalar REST */
  apiMode: envApiMode(process.env.EXPO_PUBLIC_API_MODE),
  remoteRestUrl: normalizeRemoteRestUrl(process.env.EXPO_PUBLIC_REMOTE_REST_URL),
  postgrestAnonKey: process.env.EXPO_PUBLIC_POSTGREST_ANON_KEY ?? '',
  merkezTenantCode: envString(process.env.EXPO_PUBLIC_TENANT_CODE),
  merkezDisplayName: '',
  local: publicPgEndpoint('local', DEFAULT_LOCAL),
  remote: publicPgEndpoint('remote', DEFAULT_REMOTE),
  isConfigured: false,
};

export function parseApiMode(v: unknown): ApiMode {
  if (v === 'postgrest' || v === 'hybrid' || v === 'bridge') return v;
  return 'hybrid';
}

function mergeEndpoint(base: PgEndpoint, partial?: Partial<PgEndpoint> | null): PgEndpoint {
  if (!partial || typeof partial !== 'object') return { ...base };
  return {
    host: typeof partial.host === 'string' && partial.host.trim() ? partial.host.trim() : base.host,
    port: Number(partial.port) > 0 ? Number(partial.port) : base.port,
    database:
      typeof partial.database === 'string' && partial.database.trim()
        ? partial.database.trim()
        : base.database,
    user: typeof partial.user === 'string' && partial.user.trim() ? partial.user.trim() : base.user,
    password: typeof partial.password === 'string' ? partial.password : base.password,
  };
}

/** Eski flat `pgHost`… alanlarını local/remote’a taşı */
export function migrateDbConfig(raw: LegacyFlatConfig | DbConfig | null | undefined): DbConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG, local: { ...DEFAULT_LOCAL }, remote: { ...DEFAULT_REMOTE } };

  const flat = raw as LegacyFlatConfig;
  const hasNested = flat.local != null || flat.remote != null;

  let local = mergeEndpoint(DEFAULT_LOCAL, flat.local);
  let remote = mergeEndpoint(DEFAULT_REMOTE, flat.remote);

  if (!hasNested && flat.pgHost) {
    const legacy: PgEndpoint = {
      host: flat.pgHost,
      port: Number(flat.pgPort) > 0 ? Number(flat.pgPort) : 5432,
      database: flat.database || DEFAULT_LOCAL.database,
      user: flat.user || DEFAULT_LOCAL.user,
      password: flat.password ?? '',
    };
    local = { ...legacy };
    remote = { ...legacy };
  }

  const dbMode: DbMode = flat.dbMode === 'online' ? 'online' : 'local';
  const networkPolicy: NetworkPolicy =
    flat.networkPolicy === 'online' || flat.networkPolicy === 'offline'
      ? flat.networkPolicy
      : 'hybrid';
  const apiMode = parseApiMode(flat.apiMode);
  const remoteRestUrl = normalizeRemoteRestUrl(
    flat.remoteRestUrl ?? flat.remote_rest_url ?? '',
  );
  const postgrestAnonKey =
    typeof flat.postgrestAnonKey === 'string'
      ? flat.postgrestAnonKey
      : typeof flat.postgrest_anon_key === 'string'
        ? flat.postgrest_anon_key
        : '';
  const merkezTenantCode =
    typeof flat.merkezTenantCode === 'string' && flat.merkezTenantCode.trim()
      ? flat.merkezTenantCode.trim().toLowerCase()
      : typeof flat.merkez_tenant_code === 'string' && flat.merkez_tenant_code.trim()
        ? flat.merkez_tenant_code.trim().toLowerCase()
        : '';
  const merkezDisplayName =
    typeof flat.merkezDisplayName === 'string'
      ? flat.merkezDisplayName
      : typeof flat.merkez_display_name === 'string'
        ? flat.merkez_display_name
        : '';

  return {
    bridgeHost:
      typeof flat.bridgeHost === 'string' && flat.bridgeHost.trim()
        ? flat.bridgeHost.trim()
        : DEFAULT_CONFIG.bridgeHost,
    bridgePort: Number(flat.bridgePort) > 0 ? Number(flat.bridgePort) : DEFAULT_CONFIG.bridgePort,
    dbMode,
    networkPolicy,
    apiMode,
    remoteRestUrl,
    postgrestAnonKey,
    merkezTenantCode,
    merkezDisplayName,
    local,
    remote,
    isConfigured: flat.isConfigured === true,
  };
}

type ConfigState = {
  config: DbConfig;
  isHydrated: boolean;
  setConfig: (partial: Partial<DbConfig> | ((prev: DbConfig) => DbConfig)) => void;
  setEndpoint: (which: 'local' | 'remote', partial: Partial<PgEndpoint>) => void;
  resetConfig: () => void;
  setHydrated: (v: boolean) => void;
};

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: {
        ...DEFAULT_CONFIG,
        local: { ...DEFAULT_LOCAL },
        remote: { ...DEFAULT_REMOTE },
      },
      isHydrated: false,
      setConfig: (partial) =>
        set((s) => {
          const next =
            typeof partial === 'function'
              ? partial(s.config)
              : { ...s.config, ...partial };
          return { config: migrateDbConfig(next) };
        }),
      setEndpoint: (which, partial) =>
        set((s) => ({
          config: {
            ...s.config,
            [which]: mergeEndpoint(s.config[which], partial),
          },
        })),
      resetConfig: () =>
        set({
          config: {
            ...DEFAULT_CONFIG,
            local: { ...DEFAULT_CONFIG.local },
            remote: { ...DEFAULT_CONFIG.remote },
          },
        }),
      setHydrated: (v) => set({ isHydrated: v }),
    }),
    {
      name: 'retailex_mobile_config',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const p = (persisted as { config?: LegacyFlatConfig } | undefined)?.config;
        return {
          ...current,
          ...(persisted as object),
          config: migrateDbConfig(p ?? current.config),
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

/** Aktif PG ucu (dbMode’a göre) — bridge bu adrese bağlanır */
export function getActiveEndpoint(cfg: DbConfig): PgEndpoint {
  return cfg.dbMode === 'online' ? cfg.remote : cfg.local;
}

export function buildConnStr(cfg: DbConfig, endpoint?: PgEndpoint): string {
  const ep = endpoint ?? getActiveEndpoint(cfg);
  const host = ep.host === 'localhost' ? '127.0.0.1' : ep.host;
  const pass = encodeURIComponent(ep.password || '');
  return `postgresql://${ep.user}:${pass}@${host}:${ep.port}/${ep.database}`;
}

export function getBridgeBaseUrl(cfg: DbConfig): string {
  const host = cfg.bridgeHost.trim() || defaultBridgeHost();
  return `http://${host}:${cfg.bridgePort}`.replace(/\/+$/, '');
}

function isBridgeEndpointReady(cfg: DbConfig): boolean {
  if (!cfg.bridgeHost.trim() || !(cfg.bridgePort > 0)) return false;
  const ep = getActiveEndpoint(cfg);
  return Boolean(ep.host.trim() && ep.database.trim() && ep.user.trim());
}

/** Login öncesi: apiMode’a göre bridge ve/veya PostgREST alanları */
export function isConfigReady(cfg: DbConfig): boolean {
  if (!cfg.isConfigured) return false;
  const restOk = Boolean(
    resolveEffectiveRemoteRestUrl(cfg.remoteRestUrl, cfg.merkezTenantCode),
  );
  const bridgeOk = isBridgeEndpointReady(cfg);
  if (cfg.apiMode === 'postgrest') return restOk;
  /** hybrid: PostgREST veya Bridge yeter (Bridge yalnız kalan SQL için) */
  if (cfg.apiMode === 'hybrid') return bridgeOk || restOk;
  return bridgeOk;
}

/** Okuma için PostgREST denenmeli mi */
export function shouldPreferPostgrest(cfg: DbConfig = useConfigStore.getState().config): boolean {
  if (!resolveEffectiveRemoteRestUrl(cfg.remoteRestUrl, cfg.merkezTenantCode)) return false;
  return cfg.apiMode === 'postgrest' || cfg.apiMode === 'hybrid';
}

/** Bridge SQL kullanılabilir mi (auth / yazma / hybrid fallback) */
export function shouldUseBridgeSql(cfg: DbConfig = useConfigStore.getState().config): boolean {
  if (cfg.apiMode === 'postgrest') return false;
  return isBridgeEndpointReady(cfg);
}

export { DEFAULT_CONFIG, DEFAULT_LOCAL, DEFAULT_REMOTE };
