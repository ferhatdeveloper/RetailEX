import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/centralRpcService', () => ({
  isCentralPgConfigured: vi.fn(() => true),
  queryCentralPgRows: vi.fn(),
}));

import { DB_SETTINGS, REMOTE_CONFIG, LOCAL_CONFIG, getCentralRemotePgConfig, alignRemoteConfigDatabaseWithTenant } from '../../services/postgres';
import { resolveSyncPgEndpoint } from '../../services/enterpriseSyncService';

describe('resolveSyncPgEndpoint', () => {
  const prevMode = DB_SETTINGS.activeMode;
  const prevRest = DB_SETTINGS.remoteRestUrl;
  const prevDb = REMOTE_CONFIG.database;

  beforeEach(() => {
    DB_SETTINGS.activeMode = 'online';
    DB_SETTINGS.remoteRestUrl = 'https://api.retailex.app/lovan';
    REMOTE_CONFIG.database = 'retailex_demo';
    REMOTE_CONFIG.isConfigured = true;
  });

  afterEach(() => {
    DB_SETTINGS.activeMode = prevMode;
    DB_SETTINGS.remoteRestUrl = prevRest;
    REMOTE_CONFIG.database = prevDb;
  });

  it('online modda API varken doğrudan uzak PG kullanılmaz', () => {
    const central = getCentralRemotePgConfig();
    expect(central.database).toBe('lovan');

    const endpoint = resolveSyncPgEndpoint();
    expect(endpoint.database).not.toBe('lovan');
    expect(endpoint.database).toBe(LOCAL_CONFIG.database);
  });

  it('hybrid modda yerel PG döner', () => {
    DB_SETTINGS.activeMode = 'hybrid';
    const endpoint = resolveSyncPgEndpoint();
    expect(endpoint.database).not.toBe('lovan');
  });

  it('config yüklemede retailex_demo kiracı slug ile hizalanır', () => {
    DB_SETTINGS.merkezTenantCode = 'lovan';
    REMOTE_CONFIG.database = 'retailex_demo';
    alignRemoteConfigDatabaseWithTenant('https://api.retailex.app/lovan');
    expect(REMOTE_CONFIG.database).toBe('lovan');
    expect(getCentralRemotePgConfig().database).toBe('lovan');
  });
});
