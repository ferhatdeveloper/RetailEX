import { ERP_SETTINGS, LOCAL_CONFIG, DB_SETTINGS, resolveHybridSyncConnectionProvider, getCentralRemotePgConfig } from './postgres';
import {
  buildSyncEndpoints,
  countPendingQueue,
  countPendingQueueEndpoint,
  countRemoteMasterTables,
  masterTableNamesForFirm,
  queryPgRows,
  type HybridSyncFilter,
  type PgEndpointConfig,
  type RemoteTableCountRow,
} from './hybridSyncEngine';

export type BranchSyncStats = {
  localPending: number;
  /** Merkez sync_queue bekleyen; -1 = kuyruk erişilemiyor (PostgREST sync_queue yok) */
  remotePending: number;
  lastSyncedAt: string | null;
};

export type RemoteMasterSnapshot = {
  /** sync_queue sayılabildi mi */
  queueAvailable: boolean;
  queuePending: number;
  tables: RemoteTableCountRow[];
};

export type BranchStoreOption = {
  id: string;
  code: string;
  name: string;
};

export type BranchCashierOption = {
  id: string;
  username: string;
  full_name: string;
};

function primaryEndpoint(): PgEndpointConfig {
  return LOCAL_CONFIG;
}

export async function listActiveStores(firmNr?: string): Promise<BranchStoreOption[]> {
  const fn = (firmNr || ERP_SETTINGS.firmNr || '001').toString().padStart(3, '0');
  const rows = await queryPgRows(
    primaryEndpoint(),
    `SELECT id::text, code, name FROM stores
     WHERE firm_nr = $1 AND COALESCE(is_active, true) = true
     ORDER BY name`,
    [fn]
  );
  return rows.map((r: any) => ({
    id: String(r.id),
    code: String(r.code ?? ''),
    name: String(r.name ?? ''),
  }));
}

export async function listStoreCashiers(storeId: string): Promise<BranchCashierOption[]> {
  const rows = await queryPgRows(
    primaryEndpoint(),
    `SELECT id::text, username, full_name FROM users
     WHERE store_id = $1::uuid AND COALESCE(is_active, true) = true
     ORDER BY full_name, username`,
    [storeId]
  );
  return rows.map((r: any) => ({
    id: String(r.id),
    username: String(r.username ?? ''),
    full_name: String(r.full_name ?? ''),
  }));
}

export async function getBranchSyncStats(filter?: HybridSyncFilter): Promise<BranchSyncStats> {
  const baseFilter: HybridSyncFilter = {
    firmNr: filter?.firmNr ?? ERP_SETTINGS.firmNr,
    storeId: filter?.storeId ?? null,
    userId: filter?.userId ?? null,
    cashierUsername: filter?.cashierUsername ?? null,
  };

  let remotePending = -1;
  try {
    const { remote } = buildSyncEndpoints({
      local: LOCAL_CONFIG,
      remote: getCentralRemotePgConfig(),
      connectionProvider: resolveHybridSyncConnectionProvider(),
      remoteRestUrl: DB_SETTINGS.remoteRestUrl,
    });
    remotePending = await countPendingQueueEndpoint(remote, baseFilter);
  } catch {
    remotePending = -1;
  }

  const localPending = await countPendingQueue(LOCAL_CONFIG, baseFilter);

  let lastSyncedAt: string | null = null;
  try {
    const where = baseFilter.storeId
      ? `status = 'completed' AND source_store_id = $1::uuid`
      : `status = 'completed'`;
    const params = baseFilter.storeId ? [baseFilter.storeId] : [];
    const rows = await queryPgRows(
      primaryEndpoint(),
      `SELECT synced_at::text FROM sync_queue WHERE ${where} ORDER BY synced_at DESC NULLS LAST LIMIT 1`,
      params
    );
    lastSyncedAt = rows[0]?.synced_at ? String(rows[0].synced_at) : null;
  } catch {
    lastSyncedAt = DB_SETTINGS.lastSync;
  }

  return { localPending, remotePending, lastSyncedAt };
}

/** Merkez master tablolarındaki gerçek kayıt sayıları (PostgREST count=exact veya PG). */
export async function getRemoteMasterSnapshot(firmNr?: string): Promise<RemoteMasterSnapshot> {
  const fn = String(firmNr || ERP_SETTINGS.firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');
  let queuePending = -1;
  let tables: RemoteTableCountRow[] = [];

  try {
    const { remote } = buildSyncEndpoints({
      local: LOCAL_CONFIG,
      remote: getCentralRemotePgConfig(),
      connectionProvider: resolveHybridSyncConnectionProvider(),
      remoteRestUrl: DB_SETTINGS.remoteRestUrl,
    });
    queuePending = await countPendingQueueEndpoint(remote, { firmNr: fn });
    tables = await countRemoteMasterTables(remote, masterTableNamesForFirm(fn));
  } catch {
    queuePending = -1;
  }

  return {
    queueAvailable: queuePending >= 0,
    queuePending: Math.max(0, queuePending),
    tables,
  };
}

export function buildSyncFilter(opts: {
  storeId?: string | null;
  userId?: string | null;
  cashierUsername?: string | null;
  scopeCashierOnly?: boolean;
  terminalName?: string | null;
  inboundMasterOnly?: boolean;
}): HybridSyncFilter {
  return {
    firmNr: ERP_SETTINGS.firmNr,
    storeId: opts.storeId || null,
    userId: opts.scopeCashierOnly ? opts.userId || null : opts.userId || null,
    cashierUsername: opts.scopeCashierOnly ? opts.cashierUsername || null : null,
    terminalName: opts.terminalName ?? null,
    inboundMasterOnly: opts.inboundMasterOnly ?? false,
  };
}

/** Kasa terminali: merkezden gelen master kuyruk filtresi */
export function buildKasaInboundFilter(opts: {
  storeId?: string | null;
  terminalName?: string | null;
}): HybridSyncFilter {
  return buildSyncFilter({
    storeId: opts.storeId,
    inboundMasterOnly: true,
    terminalName: opts.terminalName,
  });
}
