/**
 * Hibrit senkron — uzak uç PostgREST (yerel: doğrudan PostgreSQL).
 */

import { fetchRetailexAware } from '../utils/retailexDevProxy';
import type { HybridSyncFilter, PgEndpointConfig, SyncQueueRow } from './hybridSyncEngine';
import { queryPgRows } from './hybridSyncEngine';
import { normalizeSyncRow } from './hybridSyncNormalize';

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

/** 409 / 23505: ref_id unique ihlali */
function parseRefIdFromConflict(body: string): number | null {
  const m = body.match(/\(ref_id\)=\((\d+)\)/i);
  if (m) return Number(m[1]);
  const j = body.match(/"ref_id"[^\d]*(\d+)/i);
  return j ? Number(j[1]) : null;
}

async function lookupPostgrestRowId(
  baseUrl: string,
  table: string,
  schema: PgSchemaName,
  column: string,
  value: string | number,
): Promise<string | null> {
  const q = `${column}=eq.${encodeURIComponent(String(value))}&select=id&limit=1`;
  const lookupUrl = restUrl(baseUrl, `/${table}`, q);
  const lookupRes = await fetchRetailexAware(lookupUrl, {
    method: 'GET',
    headers: restHeaders(schema),
  });
  if (!lookupRes.ok) return null;
  const rows = (await lookupRes.json()) as Array<{ id?: string }>;
  const existingId = rows[0]?.id;
  return existingId ? String(existingId) : null;
}

/** Logo ref_id ile merkezdeki mevcut ürün UUID'sine hizala */
async function remapPayloadByRefId(
  baseUrl: string,
  table: string,
  schema: PgSchemaName,
  payload: Record<string, unknown>,
  incomingId: string,
): Promise<Record<string, unknown>> {
  const rawRef = payload.ref_id;
  const refId =
    typeof rawRef === 'number'
      ? rawRef
      : rawRef != null && String(rawRef).trim() !== ''
        ? Number(String(rawRef).replace(/\D/g, ''))
        : NaN;
  if (!Number.isFinite(refId) || refId <= 0) return payload;

  const existingId = await lookupPostgrestRowId(baseUrl, table, schema, 'ref_id', refId);
  if (!existingId || existingId === incomingId) return payload;
  return { ...payload, id: existingId };
}

/** Müşteri/tedarikçi: code ile mevcut UUID */
async function remapPayloadByCode(
  baseUrl: string,
  table: string,
  schema: PgSchemaName,
  payload: Record<string, unknown>,
  incomingId: string,
): Promise<Record<string, unknown>> {
  const code = String(payload.code ?? '').trim();
  if (!code) return payload;
  const existingId = await lookupPostgrestRowId(baseUrl, table, schema, 'code', code);
  if (!existingId || existingId === incomingId) return payload;
  return { ...payload, id: existingId };
}

/** Uzak şema eski ise bilinmeyen kolonları düşürerek UPSERT dener (PGRST204). */
async function postgrestUpsertWithSchemaFallback(
  url: string,
  schema: PgSchemaName,
  payload: Record<string, unknown>,
  label: string,
  opts?: {
    onRefIdConflict?: (
      conflictBody: string,
      currentPayload: Record<string, unknown>,
    ) => Promise<Record<string, unknown> | null>;
  },
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

    const isRefConflict =
      res.status === 409 ||
      (res.status === 400 && /23505/.test(text) && /ref_id/i.test(text));
    if (isRefConflict && opts?.onRefIdConflict) {
      const remapped = await opts.onRefIdConflict(text, body);
      if (remapped) {
        Object.keys(body).forEach((k) => delete body[k]);
        Object.assign(body, remapped);
        opts = undefined;
        continue;
      }
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
  if (filter?.inboundMasterOnly) {
    if (!filter?.storeId?.trim()) {
      parts.unshift('id=eq.00000000-0000-0000-0000-000000000000');
    } else {
      const sid = encodeURIComponent(filter.storeId);
      parts.unshift(`target_store_id=eq.${sid}`);
      if (filter.terminalName?.trim()) {
        const tn = encodeURIComponent(filter.terminalName.trim());
        // Boş terminal_name=eq. PostgREST'te 400 üretir; yalnızca null veya eşleşen ad.
        parts.unshift(`or=(terminal_name.is.null,terminal_name.eq.${tn})`);
      } else {
        parts.unshift('terminal_name=is.null');
      }
    }
  } else if (filter?.storeId) {
    const sid = encodeURIComponent(filter.storeId);
    parts.unshift(`or=(source_store_id.eq.${sid},target_store_id.eq.${sid})`);
  }
  if (filter?.userId) {
    parts.unshift(`source_user_id=eq.${encodeURIComponent(filter.userId)}`);
  }
  if (filter?.changedSince?.trim()) {
    parts.unshift(`created_at=gte.${encodeURIComponent(filter.changedSince.trim())}`);
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
  if (res.status === 400 || res.status === 404) return -1;
  if (!res.ok) await restError(res, 'PostgREST sync_queue COUNT');
  const total = parsePostgrestContentRangeTotal(res.headers.get('Content-Range'));
  if (total !== null) return total;
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

  let payload = normalizeSyncRow(table, item.data as Record<string, unknown>, id);

  if (/_products$/i.test(table)) {
    payload = await remapPayloadByRefId(baseUrl, table, schema, payload, id);
  } else if (/_((customers|suppliers))$/i.test(table)) {
    payload = await remapPayloadByCode(baseUrl, table, schema, payload, id);
  }

  const url = restUrl(baseUrl, `/${table}`);
  const upsertLabel = `PostgREST UPSERT ${table}`;
  await postgrestUpsertWithSchemaFallback(url, schema, payload, upsertLabel, {
    onRefIdConflict: /_products$/i.test(table)
      ? async (conflictBody, currentPayload) => {
          const parsedRef = parseRefIdFromConflict(conflictBody);
          const rawRef = currentPayload.ref_id;
          const refId =
            parsedRef ??
            (typeof rawRef === 'number'
              ? rawRef
              : rawRef != null && String(rawRef).trim() !== ''
                ? Number(String(rawRef).replace(/\D/g, ''))
                : NaN);
          if (!Number.isFinite(refId) || refId <= 0) return null;
          const existingId = await lookupPostgrestRowId(baseUrl, table, schema, 'ref_id', refId);
          if (!existingId) return null;
          return { ...currentPayload, id: existingId };
        }
      : undefined,
  });
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

/** PostgREST uç doğrulama: kuyruk okuma (receive) veya veri yazma (send hedefi). */
export type PostgrestSyncProbeMode = 'queue' | 'write';

/** PostgREST Content-Range: 0-0/1018 → 1018 */
export function parsePostgrestContentRangeTotal(rangeHeader: string | null): number | null {
  const range = String(rangeHeader ?? '').trim();
  const m = range.match(/\/(\d+)\s*$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Merkez tablo satır sayısı (PostgREST Prefer: count=exact). Erişilemezse null. */
export async function countPostgrestTableRows(
  baseUrl: string,
  tableName: string,
  schema: PgSchemaName = 'public',
): Promise<number | null> {
  const tbl = String(tableName || '').trim();
  if (!tbl || !/^[a-z][a-z0-9_]*$/i.test(tbl)) return null;
  const url = restUrl(baseUrl, `/${tbl}`, 'select=id&limit=1');
  const res = await fetchRetailexAware(url, {
    method: 'GET',
    headers: { ...restHeaders(schema), Prefer: 'count=exact' },
  });
  if (!res.ok) return null;
  const total = parsePostgrestContentRangeTotal(res.headers.get('Content-Range'));
  if (total !== null) return total;
  try {
    const data = (await res.json()) as unknown[];
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return null;
  }
}

export async function testPostgrestSyncEndpoint(
  baseUrl: string,
  mode: PostgrestSyncProbeMode = 'queue',
): Promise<{ ok: boolean; message: string }> {
  const base = normalizeRestBase(baseUrl);
  if (!base) return { ok: false, message: 'PostgREST URL boş' };
  try {
    if (mode === 'write') {
      const url = restUrl(base, '/firms', 'select=id&limit=1');
      const res = await fetchRetailexAware(url, { method: 'GET', headers: restHeaders('public') });
      if (res.ok) return { ok: true, message: `${base} — PostgREST veri tabloları erişilebilir` };
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        message: `${base}: ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`,
      };
    }

    const url = restUrl(base, '/sync_queue', 'select=id&limit=1');
    const res = await fetchRetailexAware(url, { method: 'GET', headers: restHeaders('public') });
    if (res.ok) return { ok: true, message: `${base} — sync_queue erişilebilir` };
    if (res.status === 404 || res.status === 400) {
      const firmsProbe = await fetchRetailexAware(restUrl(base, '/firms', 'select=id&limit=1'), {
        method: 'GET',
        headers: restHeaders('public'),
      });
      const routingHint =
        firmsProbe.ok
          ? ' API gateway yönlendirmesi hatalı olabilir: /{kiracı}/sync* kuralı sync_queue yolunu sync servisine gönderir. Caddy\'de /sync/* kullanın (database/docker/Caddyfile.api-gateway).'
          : '';
      return {
        ok: false,
        message:
          `${base} — sync_queue PostgREST'te yok veya erişilemiyor (migration 048+049+088).` +
          ' Merkezden alım (receive) için merkez DB\'de sync_queue gerekir.' +
          routingHint,
      };
    }
    const text = await res.text().catch(() => '');
    return { ok: false, message: `${base}: ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}` };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
