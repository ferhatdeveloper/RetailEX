import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Web Login `db_mode`: offline≈local, online≈uzak. Mobil UI: local | online */
export type DbMode = 'local' | 'online';

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
  local: PgEndpoint;
  remote: PgEndpoint;
  /** Kullanıcı en az bir kez Kaydet’e bastı */
  isConfigured: boolean;
};

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

const DEFAULT_CONFIG: DbConfig = {
  bridgeHost: defaultBridgeHost(),
  bridgePort: 3001,
  dbMode: 'local',
  local: { ...DEFAULT_LOCAL },
  remote: { ...DEFAULT_REMOTE },
  isConfigured: false,
};

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

  return {
    bridgeHost:
      typeof flat.bridgeHost === 'string' && flat.bridgeHost.trim()
        ? flat.bridgeHost.trim()
        : DEFAULT_CONFIG.bridgeHost,
    bridgePort: Number(flat.bridgePort) > 0 ? Number(flat.bridgePort) : DEFAULT_CONFIG.bridgePort,
    dbMode,
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
            bridgeHost: defaultBridgeHost(),
            local: { ...DEFAULT_LOCAL },
            remote: { ...DEFAULT_REMOTE },
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

/** Login öncesi: bridge + aktif PG temel alanları dolu ve kaydedilmiş mi */
export function isConfigReady(cfg: DbConfig): boolean {
  if (!cfg.isConfigured) return false;
  if (!cfg.bridgeHost.trim() || !(cfg.bridgePort > 0)) return false;
  const ep = getActiveEndpoint(cfg);
  return Boolean(ep.host.trim() && ep.database.trim() && ep.user.trim());
}

export { DEFAULT_CONFIG, DEFAULT_LOCAL, DEFAULT_REMOTE };
