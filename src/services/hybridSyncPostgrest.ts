/**
 * Hibrit senkron — uzak uç PostgREST (yerel: doğrudan PostgreSQL).
 */

import { fetchRetailexAware } from '../utils/retailexDevProxy';
import type { HybridSyncFilter, PgEndpointConfig, SyncQueueRow } from './hybridSyncEngine';
import { queryPgRows } from './hybridSyncEngine';

export const PG_SCHEMAS = ['public', 'wms', 'rest', 'beauty', 'auth', 'logic', 'pos'] as const;
export type PgSchemaName = (typeof PG_SCHEMAS)[number];

export function normalizeRestBase(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

function restUrl(base: string, path: string, query?: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return `${normalizeRestBase(base)}${p}${q}`;
}

function restHeaders(schema: PgSchemaName, prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Profile': schema,
    'Content-Profile': schema,
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

async function restError(res: Response, label: string): Promise<never> {
  const text = await res.text().catch(() => '');
  throw new Error(`${label}: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 400)}` : ''}`);
}

/** PostgREST PGRST204: uzak şemada olmayan kolon adını çıkarır */
function parseUnknownPostgrestColumn(body: string): string | null {
  const m = body.match(/Could not find the '([^']+)' column/);
  return m?.[1] ?? null;
}

/** Uzak şema eski ise bilinmeyen kolonları düşürerek UPSERT dener (PGRST204). */
async function postgrestUpsertWithSchemaFallback(
  url: string,
  schema: PgSchemaName,
  payload: Record<string, unknown>,
  label: string,
): Promise<void> {
  const body: Record<string, unknown> = { ...payload };
  for (let attempt = 0; attempt < 16; attempt++) {
    const res = await fetchRetailexAware(url, {
      method: 'POST',
      headers: restHeaders(schema, 'resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify(body),
    });
    if (res.ok) return;

    const text = await res.text().catch(() => '');
    const unknownCol = parseUnknownPostgrestColumn(text);
    if (res.status === 400 && unknownCol && Object.prototype.hasOwnProperty.call(body, unknownCol)) {
      delete body[unknownCol];
      continue;
    }
    throw new Error(
      `${label}: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 400)}` : ''}`,
    );
  }
  throw new Error(`${label}: uzak şemada çok sayıda bilinmeyen kolon`);
}

export function buildPostgrestQueueQuery(filter?: HybridSyncFilter, limit = 50): string {
  const parts = [
    'status=eq.pending',
    'retry_count=lt.10',
    'order=created_at.asc',
    `limit=${limit}`,
    'select=id,table_name,record_id,action,firm_nr,data,retry_count',
  ];
  if (filter?.firmNr) {
    parts.unshift(`firm_nr=eq.${encodeURIComponent(filter.firmNr)}`);
  }
  if (filter?.inboundMasterOnly && filter?.storeId) {
    const sid = encodeURIComponent(filter.storeId);
    parts.unshift(`target_store_id=eq.${sid}`);
    if (filter.terminalName?.trim()) {
      const tn = encodeURIComponent(filter.terminalName.trim());
      parts.unshift(`or=(terminal_name.is.null,terminal_name.eq.,terminal_name.eq.${tn})`);
    }
  } else if (filter?.storeId) {
    const sid = encodeURIComponent(filter.storeId);
    parts.unshift(`or=(source_store_id.eq.${sid},target_store_id.eq.${sid})`);
  }
  if (filter?.userId) {
    parts.unshift(`source_user_id=eq.${encodeURIComponent(filter.userId)}`);
  }
  return parts.join('&');
}

function mapQueueRows(raw: unknown[], filter?: HybridSyncFilter): SyncQueueRow[] {
  let rows = raw.map((r: any) => ({
    id: String(r.id),
    table_name: String(r.table_name),
    record_id: String(r.record_id),
    action: String(r.action),
    firm_nr: String(r.firm_nr ?? ''),
    data: r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>) : null,
    retry_count: Number(r.retry_count ?? 0),
  }));

  if (filter?.cashierUsername) {
    const u = filter.cashierUsername;
    rows = rows.filter(
      (row) =>
        String((row.data as Record<string, unknown> | null)?.cashier ?? '') === u ||
        String((row.data as Record<string, unknown> | null)?.username ?? '') === u,
    );
  }
  return rows;
}

export async function warmTableSchemaCache(
  local: PgEndpointConfig,
  cache: Map<string, PgSchemaName>,
): Promise<void> {
  if (cache.size > 0) return;
  const schemaList = PG_SCHEMAS.map((s) => `'${s.replace(/'/g, "''")}'`).join(', ');
  const rows = await queryPgRows(
    local,
    `SELECT table_name, table_schema
     FROM information_schema.tables
     WHERE table_schema IN (${schemaList})`,
  );
  for (const r of rows) {
    const name = String(r.table_name ?? '');
    const schema = String(r.table_schema ?? 'public') as PgSchemaName;
    if (name && !cache.has(name)) cache.set(name, schema);
  }
}

export function resolveTableSchema(tableName: string, cache: Map<string, PgSchemaName>): PgSchemaName {
  return cache.get(tableName) ?? 'public';
}

export async function fetchPendingQueuePostgrest(
  baseUrl: string,
  filter?: HybridSyncFilter,
): Promise<SyncQueueRow[]> {
  const url = restUrl(baseUrl, '/sync_queue', buildPostgrestQueueQuery(filter));
  const res = await fetchRetailexAware(url, {
    method: 'GET',
    headers: restHeaders('public'),
  });
  if (!res.ok) await restError(res, 'PostgREST sync_queue GET');
  const data = (await res.json()) as unknown[];
  return mapQueueRows(Array.isArray(data) ? data : [], filter);
}

export async function countPendingQueuePostgrest(
  baseUrl: string,
  filter?: HybridSyncFilter,
): Promise<number> {
  const query = buildPostgrestQueueQuery(filter, 1).replace(/limit=\d+/, 'limit=1');
  const url = restUrl(baseUrl, '/sync_queue', query);
  const res = await fetchRetailexAware(url, {
    method: 'GET',
    headers: { ...restHeaders('public'), Prefer: 'count=exact' },
  });
  if (!res.ok) await restError(res, 'PostgREST sync_queue COUNT');
  const range = res.headers.get('Content-Range') || '';
  const total = range.includes('/') ? Number(range.split('/').pop()) : NaN;
  if (Number.isFinite(total)) return total;
  const data = (await res.json()) as unknown[];
  return Array.isArray(data) ? data.length : 0;
}

export async function applyItemPostgrest(
  baseUrl: string,
  item: SyncQueueRow,
  schema: PgSchemaName,
): Promise<void> {
  const table = item.table_name;
  const id = item.record_id;
  const action = item.action.toUpperCase();

  if (action === 'DELETE') {
    const url = restUrl(baseUrl, `/${table}`, `id=eq.${encodeURIComponent(id)}`);
    const res = await fetchRetailexAware(url, {
      method: 'DELETE',
      headers: restHeaders(schema, 'return=minimal'),
    });
    if (!res.ok && res.status !== 404) await restError(res, `PostgREST DELETE ${table}`);
    return;
  }

  if (!item.data || typeof item.data !== 'object') return;

  const url = restUrl(baseUrl, `/${table}`);
  await postgrestUpsertWithSchemaFallback(url, schema, item.data as Record<string, unknown>, `PostgREST UPSERT ${table}`);
}

export async function markCompletedPostgrest(baseUrl: string, id: string): Promise<void> {
  const url = restUrl(baseUrl, '/sync_queue', `id=eq.${encodeURIComponent(id)}`);
  const res = await fetchRetailexAware(url, {
    method: 'PATCH',
    headers: restHeaders('public', 'return=minimal'),
    body: JSON.stringify({
      status: 'completed',
      synced_at: new Date().toISOString(),
      error_message: null,
    }),
  });
  if (!res.ok) await restError(res, 'PostgREST sync_queue PATCH completed');
}

export async function markFailedPostgrest(baseUrl: string, id: string, error: string): Promise<void> {
  const q = `id=eq.${encodeURIComponent(id)}&select=retry_count`;
  const getUrl = restUrl(baseUrl, '/sync_queue', q);
  const getRes = await fetchRetailexAware(getUrl, { method: 'GET', headers: restHeaders('public') });
  let retry = 0;
  if (getRes.ok) {
    const rows = (await getRes.json()) as Array<{ retry_count?: number }>;
    retry = Number(rows[0]?.retry_count ?? 0) + 1;
  }
  const url = restUrl(baseUrl, '/sync_queue', `id=eq.${encodeURIComponent(id)}`);
  const res = await fetchRetailexAware(url, {
    method: 'PATCH',
    headers: restHeaders('public', 'return=minimal'),
    body: JSON.stringify({
      retry_count: retry,
      error_message: error.slice(0, 2000),
    }),
  });
  if (!res.ok) await restError(res, 'PostgREST sync_queue PATCH failed');
}

export async function testPostgrestSyncEndpoint(baseUrl: string): Promise<{ ok: boolean; message: string }> {
  const base = normalizeRestBase(baseUrl);
  if (!base) return { ok: false, message: 'PostgREST URL boş' };
  try {
    const url = restUrl(base, '/sync_queue', 'select=id&limit=1');
    const res = await fetchRetailexAware(url, { method: 'GET', headers: restHeaders('public') });
    if (res.ok) return { ok: true, message: `${base} — sync_queue erişilebilir` };
    if (res.status === 404) {
      return { ok: false, message: `${base} — sync_queue tablosu PostgREST'te yok (migration 048+049)` };
    }
    const text = await res.text().catch(() => '');
    return { ok: false, message: `${base}: ${res.status} ${text.slice(0, 200)}` };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
