import type { SetupAppConfig, SetupDbMode, SetupDbTarget } from './setupTypes';

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

  if (dbMode === 'hybrid' && primary === 'local' && isRemoteDbConfigured(config.remote_db)) {
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

/** Merkez sunucu hibrit/online iken uzak bağlantı adımı gerekir */
export function needsRemoteDatabaseStep(config: Pick<SetupAppConfig, 'role' | 'db_mode'>): boolean {
  const dbMode = normalizeDbMode(config.db_mode, config.role);
  if (config.role !== 'center') {
    return dbMode === 'hybrid' || dbMode === 'online';
  }
  return dbMode === 'hybrid' || dbMode === 'online';
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

export function normalizeSetupConfig(config: SetupAppConfig): SetupAppConfig {
  const db_mode = normalizeDbMode(config.db_mode, config.role);
  const normalized: SetupAppConfig = {
    ...config,
    db_mode,
    hybrid_read_preference: config.hybrid_read_preference || 'local_first',
    hybrid_sync_direction: config.hybrid_sync_direction || 'local_to_remote',
  };

  if (db_mode === 'hybrid' || db_mode === 'offline') {
    normalized.connection_provider = normalized.connection_provider === 'rest_api' ? 'rest_api' : 'db';
  } else if (db_mode === 'online' && !normalized.connection_provider) {
    normalized.connection_provider = 'rest_api';
  }

  if (!normalized.remote_rest_url?.trim()) {
    normalized.remote_rest_url = 'https://api.retailex.app';
  }

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
