import type { SetupAppConfig, SetupDbMode, SetupDbTarget } from './setupTypes';
import { DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN, resolveTenantSyncUrls, parseSaaSOrCustomPostgrestUrl } from '../../../services/merkezTenantRegistry';
import { normalizeHybridSyncTransport } from '../../../services/postgres';

const VALID_DB_MODES: SetupDbMode[] = ['online', 'offline', 'hybrid'];

export function normalizeDbMode(raw: string | undefined, role: SetupAppConfig['role']): SetupDbMode {
  const value = String(raw || '').trim().toLowerCase();
  if (VALID_DB_MODES.includes(value as SetupDbMode)) {
    return value as SetupDbMode;
  }
  if (value === 'local') {
    return role === 'center' ? 'offline' : 'hybrid';
  }
  return role === 'center' ? 'hybrid' : 'hybrid';
}

export function isRemoteDbConfigured(remoteDb?: string): boolean {
  const value = String(remoteDb || '').trim();
  if (!value) return false;
  return !value.includes('127.0.0.1') && !value.includes('localhost');
}

/** Migration / create_database birincil hedefi */
export function resolvePrimaryMigrationTarget(dbMode: SetupDbMode): SetupDbTarget {
  return dbMode === 'online' ? 'remote' : 'local';
}

/** Firma kart tabloları (cari, stok) hangi PG uçlarında oluşturulsun */
export function resolveFirmSchemaTargets(
  config: Pick<SetupAppConfig, 'db_mode' | 'local_db' | 'remote_db'>,
  primary: SetupDbTarget,
): SetupDbTarget[] {
  const targets: SetupDbTarget[] = [primary];
  const dbMode = normalizeDbMode(config.db_mode, 'client');

  if (primary === 'remote' && config.local_db?.trim()) {
    targets.push('local');
  }

  if (
    dbMode === 'hybrid' &&
    primary === 'local' &&
    config.connection_provider !== 'rest_api' &&
    isRemoteDbConfigured(config.remote_db)
  ) {
    targets.push('remote');
  }

  return [...new Set(targets)];
}

/** PostgREST + uzak mod: yerel PG DDL atlanır */
export function shouldSkipRemotePgBootstrap(
  config: Pick<SetupAppConfig, 'connection_provider' | 'db_mode'>,
  primaryTarget: SetupDbTarget,
): boolean {
  return config.connection_provider === 'rest_api' && primaryTarget === 'remote';
}

/** Hibrit modda merkeze senkron yalnızca PostgREST/API ile gider (uzak PG zorunlu değil). */
export function usesPostgrestForHybridSync(
  config: Pick<SetupAppConfig, 'db_mode' | 'role'>,
): boolean {
  return normalizeDbMode(config.db_mode, config.role) === 'hybrid';
}

/** Doğrudan uzak PostgreSQL host/port/şifre adımı (online + db sağlayıcı). */
export function needsRemotePgStep(
  config: Pick<SetupAppConfig, 'role' | 'db_mode' | 'connection_provider'>,
): boolean {
  const dbMode = normalizeDbMode(config.db_mode, config.role);
  if (dbMode === 'hybrid' || dbMode === 'offline') return false;
  if (dbMode === 'online') {
    return (config.connection_provider || 'rest_api') === 'db';
  }
  return false;
}

/** PostgREST / kiracı API adresi adımı (hibrit veya online+rest_api). */
export function needsPostgrestApiStep(
  config: Pick<SetupAppConfig, 'role' | 'db_mode' | 'connection_provider'>,
): boolean {
  const dbMode = normalizeDbMode(config.db_mode, config.role);
  if (dbMode === 'hybrid') return true;
  if (dbMode === 'online') {
    return (config.connection_provider || 'rest_api') !== 'db';
  }
  return false;
}

/** @deprecated needsRemotePgStep + needsPostgrestApiStep kullanın */
export function needsRemoteDatabaseStep(
  config: Pick<SetupAppConfig, 'role' | 'db_mode' | 'connection_provider'>,
): boolean {
  return needsRemotePgStep(config) || needsPostgrestApiStep(config);
}

/** Yerel PG kurulumu gerekir (offline, hybrid veya online+local mirror) */
export function needsLocalDatabaseStep(
  config: Pick<SetupAppConfig, 'role' | 'db_mode' | 'skip_integration'>,
  skipStandaloneFirmStep: boolean,
): boolean {
  if (skipStandaloneFirmStep) return false;
  const dbMode = normalizeDbMode(config.db_mode, config.role);
  return dbMode !== 'online' || config.role === 'center';
}

function normalizeSetupSyncInterval(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  return Math.min(3600, Math.max(5, Math.round(n)));
}

export function normalizeSetupConfig(config: SetupAppConfig): SetupAppConfig {
  const db_mode = normalizeDbMode(config.db_mode, config.role);
  const normalized: SetupAppConfig = {
    ...config,
    db_mode,
    hybrid_read_preference: config.hybrid_read_preference || 'local_first',
    hybrid_sync_direction: config.hybrid_sync_direction || 'local_to_remote',
    hybrid_sync_interval_sec: normalizeSetupSyncInterval(config.hybrid_sync_interval_sec),
    hybrid_sync_transport: normalizeHybridSyncTransport(config.hybrid_sync_transport),
  };

  if (db_mode === 'hybrid') {
    // Hibrit: yerel PG + merkeze yalnızca PostgREST/API; uzak PG bilgisi gerekmez.
    normalized.connection_provider = 'rest_api';
  } else if (db_mode === 'offline') {
    normalized.connection_provider = 'db';
  } else if (db_mode === 'online' && !normalized.connection_provider) {
    normalized.connection_provider = 'rest_api';
  }

  if (!normalized.remote_rest_url?.trim()) {
    normalized.remote_rest_url = DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN;
  }

  const syncUrls = resolveTenantSyncUrls({
    merkez_tenant_code: (normalized as { merkez_tenant_code?: string }).merkez_tenant_code,
    remote_rest_url: normalized.remote_rest_url,
    central_ws_url: normalized.central_ws_url,
    central_api_url: normalized.central_api_url,
  });
  if (syncUrls.central_ws_url) normalized.central_ws_url = syncUrls.central_ws_url;
  if (syncUrls.central_api_url) normalized.central_api_url = syncUrls.central_api_url;

  const parsedRest = parseSaaSOrCustomPostgrestUrl(normalized.remote_rest_url || '');
  if (parsedRest.kind === 'saas_single_slug' && !normalized.merkez_tenant_code?.trim()) {
    normalized.merkez_tenant_code = parsedRest.slug;
  }

  // SaaS slug (örn. aqua) ≠ PostgreSQL database_name (örn. aqua_beauty) — remote_db slug'dan türetilmez.

  if (normalized.role === 'client' && db_mode === 'online') {
    const central = String(normalized.central_api_url || '').trim();
    if (central && !isRemoteDbConfigured(normalized.remote_db)) {
      // Kullanıcı yalnızca merkez adresi girdiyse remote_db boş kalmasın (PostgREST URL veya host)
      if (/^https?:\/\//i.test(central) && !central.includes('postgres')) {
        if (!normalized.remote_rest_url?.trim() || normalized.remote_rest_url === 'https://api.retailex.app') {
          normalized.remote_rest_url = central.replace(/\/$/, '');
        }
      }
    }
  }

  if (normalized.skip_integration) {
    normalized.erp_firm_nr = (normalized.erp_firm_nr || '001').padStart(3, '0');
    normalized.erp_period_nr = (normalized.erp_period_nr || '01').padStart(2, '0');
  }

  return normalized;
}

export function finalizeSetupConfig(config: SetupAppConfig): SetupAppConfig {
  return normalizeSetupConfig({ ...config, is_configured: true });
}
