import { ERP_SETTINGS, LOCAL_CONFIG, REMOTE_CONFIG, DB_SETTINGS } from './postgres';
import {
  countPendingQueue,
  queryPgRows,
  type HybridSyncFilter,
  type PgEndpointConfig,
} from './hybridSyncEngine';

export type BranchSyncStats = {
  localPending: number;
  remotePending: number;
  lastSyncedAt: string | null;
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

  const [localPending, remotePending] = await Promise.all([
    countPendingQueue(LOCAL_CONFIG, baseFilter),
    countPendingQueue(REMOTE_CONFIG, baseFilter).catch(() => -1),
  ]);

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

export function buildSyncFilter(opts: {
  storeId?: string | null;
  userId?: string | null;
  cashierUsername?: string | null;
  scopeCashierOnly?: boolean;
}): HybridSyncFilter {
  return {
    firmNr: ERP_SETTINGS.firmNr,
    storeId: opts.storeId || null,
    userId: opts.scopeCashierOnly ? opts.userId || null : opts.userId || null,
    cashierUsername: opts.scopeCashierOnly ? opts.cashierUsername || null : null,
  };
}
