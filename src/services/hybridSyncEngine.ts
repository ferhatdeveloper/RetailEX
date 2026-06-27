import { IS_TAURI, safeInvoke, getBridgeUrl } from '../utils/env';
import type { HybridSyncDirection } from './postgres';
import {
  applyItemPostgrest,
  countPendingQueuePostgrest,
  fetchPendingQueuePostgrest,
  markCompletedPostgrest,
  markFailedPostgrest,
  normalizeRestBase,
  resolveTableSchema,
  testPostgrestSyncEndpoint,
  warmTableSchemaCache,
  type PgSchemaName,
} from './hybridSyncPostgrest';

export type PgEndpointConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  isConfigured?: boolean;
};

/** Senkron uç noktası: yerel PG veya uzak PostgREST */
export type SyncEndpoint =
  | { kind: 'pg'; config: PgEndpointConfig }
  | { kind: 'postgrest'; baseUrl: string };

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
  remoteRestUrl?: string;
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
    if (typeof v === 'boolean' || typeof v === 'number') return v;
    if (Array.isArray(v)) return v;
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
    const fn = String(filter.firmNr).replace(/\D/g, '').padStart(3, '0');
    params.push(fn);
    const i = params.length;
    sql += ` AND (firm_nr = $${i} OR lpad(ltrim(firm_nr, '0'), 3, '0') = $${i})`;
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

async function fetchPendingQueuePg(
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

async function applyItemPg(target: PgEndpointConfig, item: SyncQueueRow): Promise<void> {
  const dataJson = item.data ? JSON.stringify(item.data) : null;
  await queryPgRows(
    target,
    `SELECT public.apply_sync_queue_item($1, $2, $3::uuid, $4::jsonb)`,
    [item.table_name, item.action, item.record_id, dataJson]
  );
}

async function markCompletedPg(source: PgEndpointConfig, id: string): Promise<void> {
  await queryPgRows(
    source,
    `UPDATE sync_queue SET status = 'completed', synced_at = NOW(), error_message = NULL WHERE id = $1::uuid RETURNING id`,
    [id]
  );
}

async function markFailedPg(source: PgEndpointConfig, id: string, error: string): Promise<void> {
  const msg = error.slice(0, 2000);
  await queryPgRows(
    source,
    `UPDATE sync_queue SET retry_count = retry_count + 1, error_message = $2 WHERE id = $1::uuid RETURNING id`,
    [id, msg]
  );
}

async function ensureSyncFunctionsPg(endpoint: PgEndpointConfig): Promise<void> {
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

export function buildSyncEndpoints(opts: HybridSyncRunOptions): {
  local: SyncEndpoint;
  remote: SyncEndpoint;
} {
  const local: SyncEndpoint = { kind: 'pg', config: opts.local };
  const restBase = normalizeRestBase(opts.remoteRestUrl || '');
  const usePostgrest = opts.connectionProvider === 'rest_api' || !!restBase;
  if (usePostgrest) {
    if (!restBase) {
      throw new Error('Hibrit senkron için merkez API adresi (PostgREST URL) zorunludur.');
    }
    return { local, remote: { kind: 'postgrest', baseUrl: restBase } };
  }
  return { local, remote: { kind: 'pg', config: opts.remote } };
}

async function ensureSyncFunctions(endpoint: SyncEndpoint, localPg: PgEndpointConfig): Promise<void> {
  if (endpoint.kind === 'pg') {
    await ensureSyncFunctionsPg(endpoint.config);
    return;
  }
  await ensureSyncFunctionsPg(localPg);
  const probe = await testPostgrestSyncEndpoint(endpoint.baseUrl);
  if (!probe.ok) {
    throw new Error(probe.message);
  }
}

async function fetchPendingQueue(endpoint: SyncEndpoint, filter?: HybridSyncFilter): Promise<SyncQueueRow[]> {
  if (endpoint.kind === 'pg') return fetchPendingQueuePg(endpoint.config, filter);
  return fetchPendingQueuePostgrest(endpoint.baseUrl, filter);
}

async function applyItem(
  target: SyncEndpoint,
  item: SyncQueueRow,
  schemaCache: Map<string, PgSchemaName>,
): Promise<void> {
  if (target.kind === 'pg') {
    await applyItemPg(target.config, item);
    return;
  }
  const schema = resolveTableSchema(item.table_name, schemaCache);
  await applyItemPostgrest(target.baseUrl, item, schema);
}

async function markCompleted(source: SyncEndpoint, id: string): Promise<void> {
  if (source.kind === 'pg') {
    await markCompletedPg(source.config, id);
    return;
  }
  await markCompletedPostgrest(source.baseUrl, id);
}

async function markFailed(source: SyncEndpoint, id: string, error: string): Promise<void> {
  if (source.kind === 'pg') {
    await markFailedPg(source.config, id, error);
    return;
  }
  await markFailedPostgrest(source.baseUrl, id, error);
}

export async function countPendingQueueEndpoint(
  endpoint: SyncEndpoint,
  filter?: HybridSyncFilter,
): Promise<number> {
  if (endpoint.kind === 'pg') return countPendingQueue(endpoint.config, filter);
  return countPendingQueuePostgrest(endpoint.baseUrl, filter);
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
  source: SyncEndpoint,
  target: SyncEndpoint,
  label: string,
  opts?: {
    filter?: HybridSyncFilter;
    scope?: HybridSyncScopeMode;
    localPg?: PgEndpointConfig;
    schemaCache?: Map<string, PgSchemaName>;
  }
): Promise<{ synced: number; failed: number; errors: string[] }> {
  const localPg = opts?.localPg;
  if (!localPg) throw new Error('syncOneDirection: localPg gerekli');
  const schemaCache = opts?.schemaCache ?? new Map<string, PgSchemaName>();
  await warmTableSchemaCache(localPg, schemaCache);
  await ensureSyncFunctions(source, localPg);
  await ensureSyncFunctions(target, localPg);

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
        await applyItem(target, item, schemaCache);
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
  local: SyncEndpoint,
  remote: SyncEndpoint
): Array<{ source: SyncEndpoint; target: SyncEndpoint; label: string }> {
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

export type PrepareSyncQueueResult = {
  enqueued: number;
  reset: number;
};

/** Yerelde olup sync_queue'da olmayan kayıtları kuyruğa al; tükenmiş denemeleri sıfırla. */
export async function prepareLocalSyncQueue(
  local: PgEndpointConfig,
  firmNr?: string,
): Promise<PrepareSyncQueueResult> {
  const fn = String(firmNr || '001')
    .replace(/\D/g, '')
    .padStart(3, '0');

  let reset = 0;
  let enqueued = 0;

  try {
    const resetRows = await queryPgRows(
      local,
      `SELECT public.reset_exhausted_sync_queue($1)::text AS cnt`,
      [fn],
    );
    reset = Number(resetRows[0]?.cnt ?? 0);
  } catch {
    /* migration 062 yok */
  }

  try {
    const rows = await queryPgRows(
      local,
      `SELECT public.enqueue_hybrid_backfill($1, $2)::text AS cnt`,
      [fn, 5000],
    );
    enqueued = Number(rows[0]?.cnt ?? 0);
  } catch {
    /* migration 062 yok */
  }

  return { enqueued, reset };
}

export async function runHybridSync(opts: HybridSyncRunOptions): Promise<HybridSyncResult> {
  const flow = opts.flow ?? 'both';
  const direction = opts.direction ?? flowToDirection(flow);
  const scope = opts.scope ?? 'pending';

  if (flow === 'send' || flow === 'both') {
    await prepareLocalSyncQueue(opts.local, opts.filter?.firmNr ?? undefined);
  }

  let endpoints: { local: SyncEndpoint; remote: SyncEndpoint };
  try {
    endpoints = buildSyncEndpoints(opts);
  } catch (err) {
    return {
      success: false,
      totalSynced: 0,
      failed: 0,
      flow,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const legs = getSyncLegs(direction, endpoints.local, endpoints.remote);
  const schemaCache = new Map<string, PgSchemaName>();
  let totalSynced = 0;
  let failed = 0;
  const allErrors: string[] = [];

  const remoteLabel = opts.connectionProvider === 'rest_api' ? 'PostgREST' : 'uzak PG';

  for (const leg of legs) {
    const r = await syncOneDirection(leg.source, leg.target, leg.label, {
      filter: opts.filter,
      scope,
      localPg: opts.local,
      schemaCache,
    });
    totalSynced += r.synced;
    failed += r.failed;
    allErrors.push(...r.errors);
  }

  const flowLabel =
    flow === 'send'
      ? `Gönder (yerel PG→${remoteLabel})`
      : flow === 'receive'
        ? `Al (${remoteLabel}→yerel PG)`
        : `Gönder + Al (yerel↔${remoteLabel})`;

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
