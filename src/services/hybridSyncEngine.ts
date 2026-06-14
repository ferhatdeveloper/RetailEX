import { IS_TAURI, safeInvoke, getBridgeUrl } from '../utils/env';
import type { HybridSyncDirection } from './postgres';

export type PgEndpointConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  isConfigured?: boolean;
};

/** Gönder = yerel→uzak, Al = uzak→yerel, Her ikisi = çift yönlü */
export type HybridSyncFlow = 'send' | 'receive' | 'both';

/** pending = bir parti; all = tüm bekleyenler bitene kadar */
export type HybridSyncScopeMode = 'pending' | 'all';

export type HybridSyncFilter = {
  storeId?: string | null;
  userId?: string | null;
  cashierUsername?: string | null;
  firmNr?: string | null;
};

export type SyncQueueRow = {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  firm_nr: string;
  data: Record<string, unknown> | null;
  retry_count: number;
};

export type HybridSyncResult = {
  success: boolean;
  totalSynced: number;
  failed: number;
  direction?: HybridSyncDirection;
  flow?: HybridSyncFlow;
  message?: string;
};

export type HybridSyncRunOptions = {
  direction?: HybridSyncDirection;
  flow?: HybridSyncFlow;
  scope?: HybridSyncScopeMode;
  filter?: HybridSyncFilter;
  local: PgEndpointConfig;
  remote: PgEndpointConfig;
  connectionProvider?: 'db' | 'rest_api';
};

const BATCH_LIMIT = 50;
const MAX_RETRY = 10;
const MAX_ALL_ROUNDS = 100;

function buildConnStr(config: PgEndpointConfig): string {
  const host = config.host === 'localhost' ? '127.0.0.1' : config.host;
  const u = encodeURIComponent(config.user);
  const p = encodeURIComponent(config.password);
  const d = encodeURIComponent(config.database);
  return `postgresql://${u}:${p}@${host}:${config.port}/${d}`;
}

export async function queryPgRows(
  config: PgEndpointConfig,
  sql: string,
  params: unknown[] = []
): Promise<any[]> {
  const connStr = buildConnStr(config);
  const normalizedParams = params.map((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  });

  if (IS_TAURI) {
    const resultJson: string = await safeInvoke('pg_query', {
      connStr,
      sql,
      params: normalizedParams,
    });
    return JSON.parse(resultJson);
  }

  const response = await fetch(`${getBridgeUrl()}/api/pg_query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connStr, sql, params: normalizedParams }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error((errData as { error?: string }).error || 'Veritabanı sorgusu başarısız');
  }
  const data = await response.json();
  return data.rows ?? [];
}

function flowToDirection(flow: HybridSyncFlow): HybridSyncDirection {
  if (flow === 'send') return 'local_to_remote';
  if (flow === 'receive') return 'remote_to_local';
  return 'bidirectional';
}

function buildQueueWhere(filter?: HybridSyncFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = [MAX_RETRY];
  let sql = `status = 'pending' AND retry_count < $1`;

  if (filter?.firmNr) {
    params.push(filter.firmNr);
    sql += ` AND firm_nr = $${params.length}`;
  }

  if (filter?.storeId) {
    params.push(filter.storeId);
    const i = params.length;
    sql += ` AND (
      source_store_id = $${i}::uuid
      OR target_store_id = $${i}::uuid
      OR (data->>'store_id')::uuid = $${i}::uuid
    )`;
  }

  if (filter?.userId) {
    params.push(filter.userId);
    sql += ` AND source_user_id = $${params.length}::uuid`;
  }

  if (filter?.cashierUsername) {
    params.push(filter.cashierUsername);
    sql += ` AND (
      data->>'cashier' = $${params.length}
      OR data->>'username' = $${params.length}
    )`;
  }

  return { sql, params };
}

async function fetchPendingQueue(
  source: PgEndpointConfig,
  filter?: HybridSyncFilter
): Promise<SyncQueueRow[]> {
  const where = buildQueueWhere(filter);
  const limitIdx = where.params.length + 1;
  const rows = await queryPgRows(
    source,
    `SELECT id::text, table_name, record_id::text, action, firm_nr, data, retry_count::text
     FROM sync_queue
     WHERE ${where.sql}
     ORDER BY created_at ASC
     LIMIT $${limitIdx}`,
    [...where.params, BATCH_LIMIT]
  );
  return rows.map((r: any) => ({
    id: String(r.id),
    table_name: String(r.table_name),
    record_id: String(r.record_id),
    action: String(r.action),
    firm_nr: String(r.firm_nr),
    data: r.data && typeof r.data === 'object' ? r.data : r.data ? JSON.parse(String(r.data)) : null,
    retry_count: Number(r.retry_count ?? 0),
  }));
}

async function applyItem(target: PgEndpointConfig, item: SyncQueueRow): Promise<void> {
  const dataJson = item.data ? JSON.stringify(item.data) : null;
  await queryPgRows(
    target,
    `SELECT public.apply_sync_queue_item($1, $2, $3::uuid, $4::jsonb)`,
    [item.table_name, item.action, item.record_id, dataJson]
  );
}

async function markCompleted(source: PgEndpointConfig, id: string): Promise<void> {
  await queryPgRows(
    source,
    `UPDATE sync_queue SET status = 'completed', synced_at = NOW(), error_message = NULL WHERE id = $1::uuid RETURNING id`,
    [id]
  );
}

async function markFailed(source: PgEndpointConfig, id: string, error: string): Promise<void> {
  const msg = error.slice(0, 2000);
  await queryPgRows(
    source,
    `UPDATE sync_queue SET retry_count = retry_count + 1, error_message = $2 WHERE id = $1::uuid RETURNING id`,
    [id, msg]
  );
}

async function ensureSyncFunctions(endpoint: PgEndpointConfig): Promise<void> {
  const rows = await queryPgRows(
    endpoint,
    `SELECT 1 AS ok FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'apply_sync_queue_item'
     LIMIT 1`
  );
  if (rows.length > 0) return;
  throw new Error(
    `${endpoint.host}:${endpoint.port}/${endpoint.database} üzerinde apply_sync_queue_item yok. ` +
      'npm run db:migrate ile 048 ve 049 migration dosyalarını her iki PG\'de çalıştırın.'
  );
}

export async function countPendingQueue(
  endpoint: PgEndpointConfig,
  filter?: HybridSyncFilter
): Promise<number> {
  const where = buildQueueWhere(filter);
  const rows = await queryPgRows(
    endpoint,
    `SELECT COUNT(*)::text AS cnt FROM sync_queue WHERE ${where.sql}`,
    where.params
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function syncOneDirection(
  source: PgEndpointConfig,
  target: PgEndpointConfig,
  label: string,
  opts?: { filter?: HybridSyncFilter; scope?: HybridSyncScopeMode }
): Promise<{ synced: number; failed: number; errors: string[] }> {
  await ensureSyncFunctions(source);
  await ensureSyncFunctions(target);

  const scope = opts?.scope ?? 'pending';
  const filter = opts?.filter;
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];
  let rounds = 0;

  do {
    const pending = await fetchPendingQueue(source, filter);
    if (pending.length === 0) break;

    for (const item of pending) {
      try {
        await applyItem(target, item);
        await markCompleted(source, item.id);
        synced += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed += 1;
        errors.push(`${label} ${item.table_name}/${item.record_id}: ${msg}`);
        try {
          await markFailed(source, item.id, msg);
        } catch {
          /* kaynak kuyruk güncellenemedi */
        }
      }
    }

    rounds += 1;
    if (scope !== 'all') break;
  } while (rounds < MAX_ALL_ROUNDS);

  return { synced, failed, errors };
}

export function getSyncLegs(
  direction: HybridSyncDirection,
  local: PgEndpointConfig,
  remote: PgEndpointConfig
): Array<{ source: PgEndpointConfig; target: PgEndpointConfig; label: string }> {
  if (direction === 'local_to_remote') {
    return [{ source: local, target: remote, label: 'yerel→uzak' }];
  }
  if (direction === 'remote_to_local') {
    return [{ source: remote, target: local, label: 'uzak→yerel' }];
  }
  return [
    { source: local, target: remote, label: 'yerel→uzak' },
    { source: remote, target: local, label: 'uzak→yerel' },
  ];
}

export async function runHybridSync(opts: HybridSyncRunOptions): Promise<HybridSyncResult> {
  if (opts.connectionProvider === 'rest_api') {
    return {
      success: false,
      totalSynced: 0,
      failed: 0,
      flow: opts.flow,
      message:
        'Hibrit PG senkronu yalnızca «Doğrudan PostgreSQL» bağlantısında çalışır. PostgREST modunda uzak uç SQL replikasyonu desteklenmiyor.',
    };
  }

  const flow = opts.flow ?? 'both';
  const direction = opts.direction ?? flowToDirection(flow);
  const scope = opts.scope ?? 'pending';
  const legs = getSyncLegs(direction, opts.local, opts.remote);
  let totalSynced = 0;
  let failed = 0;
  const allErrors: string[] = [];

  for (const leg of legs) {
    const r = await syncOneDirection(leg.source, leg.target, leg.label, {
      filter: opts.filter,
      scope,
    });
    totalSynced += r.synced;
    failed += r.failed;
    allErrors.push(...r.errors);
  }

  const flowLabel =
    flow === 'send' ? 'Gönder (yerel→uzak)' : flow === 'receive' ? 'Al (uzak→yerel)' : 'Gönder + Al';

  const scopeLabel = scope === 'all' ? 'tüm bekleyenler' : 'bekleyen parti';

  if (totalSynced === 0 && failed === 0) {
    return {
      success: true,
      totalSynced: 0,
      failed: 0,
      direction,
      flow,
      message: `${flowLabel}: ${scopeLabel} — eşlenecek kayıt yok.`,
    };
  }

  if (failed > 0 && totalSynced === 0) {
    return {
      success: false,
      totalSynced: 0,
      failed,
      direction,
      flow,
      message: `${flowLabel} başarısız. ${allErrors[0] ?? 'Bilinmeyen hata'}`,
    };
  }

  const partial = failed > 0 ? ` (${failed} hata)` : '';
  return {
    success: true,
    totalSynced,
    failed,
    direction,
    flow,
    message: `${flowLabel}: ${totalSynced} kayıt eşlendi (${scopeLabel})${partial}.`,
  };
}
