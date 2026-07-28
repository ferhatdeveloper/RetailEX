/**
 * PostgREST REST API istemcisi
 * PostgreSQL tablolarına REST üzerinden erişim (GET/POST/PATCH/DELETE).
 * @see https://postgrest.org/en/stable/references/api.html
 */

import { getPostgrestUrl, postgrestConfig } from '../../config/postgrest.config';
import { fetchRetailexAware } from '../../utils/retailexDevProxy';

export type PostgrestSchema = typeof postgrestConfig.schemas[number];

export interface PostgrestClientOptions {
  schema?: PostgrestSchema;
  headers?: Record<string, string>;
  /** JWT Bearer token (kimlik doğrulama kullanılıyorsa) */
  jwt?: string;
}

export interface PostgrestQueryParams {
  select?: string;
  order?: string;
  limit?: number;
  offset?: number;
  [key: string]: string | number | undefined;
}

function buildHeaders(options: PostgrestClientOptions = {}): Record<string, string> {
  const schema = options.schema ?? postgrestConfig.defaultSchema;
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Profile': schema,
    'Content-Profile': schema,
    ...options.headers,
  };
  if (options.jwt) h.Authorization = `Bearer ${options.jwt}`;
  return h;
}

/**
 * Filtre değerine yanlışlıkla yapışmış PostgREST operatörünü temizler.
 * Örn. `eq.cf3b-…` → `cf3b-…` (çift `eq.eq.` 22P02 uuid hatasını önler).
 */
export function stripPostgrestOpPrefix(value: string): string {
  let s = String(value ?? '').trim();
  while (/^(eq|neq|gt|gte|lt|lte|like|ilike|match|imatch|in|is)\./i.test(s)) {
    s = s.replace(/^(eq|neq|gt|gte|lt|lte|like|ilike|match|imatch|in|is)\./i, '');
  }
  return s;
}

/** Güvenli `eq.<değer>` — değer zaten `eq.` ile geliyorsa tekrar eklemez. */
export function postgrestEq(value: string | number | boolean): string {
  if (typeof value === 'boolean' || typeof value === 'number') return `eq.${value}`;
  return `eq.${stripPostgrestOpPrefix(value)}`;
}

/** Query param: `eq.eq.uuid` gibi çift operatörü tekile indir. */
function normalizeQueryParamValue(v: string): string {
  const m = v.match(
    /^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|match|imatch|in|is|cs|cd|ov|sl|sr|nxr|nxl|adj)\.(.+)$/i,
  );
  if (!m) return v;
  const notPrefix = m[1] ?? '';
  const op = m[2];
  const rest = stripPostgrestOpPrefix(m[3]);
  return `${notPrefix}${op}.${rest}`;
}

function toQueryString(params: PostgrestQueryParams): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') search.set(k, normalizeQueryParamValue(String(v)));
  });
  const s = search.toString();
  return s ? `?${s}` : '';
}

/**
 * GET isteği — liste veya tek kayıt
 * Örnek: get('/firms', { select: 'id,name', order: 'name.asc', limit: 10 })
 * Örnek: get('/rex_001_products', { select: '*', firm_nr: 'eq.001' })
 */
export async function postgrestGet<T = unknown>(
  path: string,
  query?: PostgrestQueryParams,
  options?: PostgrestClientOptions
): Promise<T> {
  const url = getPostgrestUrl(path) + (query ? toQueryString(query) : '');
  const res = await fetchRetailexAware(url, {
    method: 'GET',
    headers: buildHeaders(options),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostgREST GET ${path}: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  return res.json() as Promise<T>;
}

/**
 * POST upsert — on_conflict ile birleştirme (Logo senkron gibi toplu yazımlar)
 */
export async function postgrestUpsert<T = unknown>(
  path: string,
  body: Record<string, unknown> | unknown[],
  onConflict: string,
  options?: PostgrestClientOptions & { prefer?: 'return=representation' | 'return=minimal' }
): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const url = getPostgrestUrl(`${path}${sep}on_conflict=${encodeURIComponent(onConflict)}`);
  const headers = buildHeaders(options);
  headers.Prefer = options?.prefer ?? 'resolution=merge-duplicates,return=minimal';
  const res = await fetchRetailexAware(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostgREST UPSERT ${path}: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  const ct = res.headers.get('Content-Type');
  if (ct?.includes('application/json')) return res.json() as Promise<T>;
  return undefined as unknown as T;
}

/**
 * POST — yeni kayıt (Prefer: return=representation ile oluşturulan satır döner)
 */
export async function postgrestPost<T = unknown>(
  path: string,
  body: Record<string, unknown> | unknown[],
  options?: PostgrestClientOptions & { prefer?: 'return=representation' | 'return=minimal' }
): Promise<T> {
  const url = getPostgrestUrl(path);
  const headers = buildHeaders(options);
  headers.Prefer = options?.prefer ?? 'return=representation';
  const res = await fetchRetailexAware(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostgREST POST ${path}: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  const ct = res.headers.get('Content-Type');
  if (ct?.includes('application/json')) return res.json() as Promise<T>;
  return undefined as unknown as T;
}

/**
 * PATCH — güncelleme (Prefer: return=representation ile güncellenen satır(lar) döner)
 */
export async function postgrestPatch<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  options?: PostgrestClientOptions & { prefer?: 'return=representation' | 'return=minimal' }
): Promise<T> {
  const url = getPostgrestUrl(path);
  const headers = buildHeaders(options);
  headers.Prefer = options?.prefer ?? 'return=representation';
  const res = await fetchRetailexAware(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostgREST PATCH ${path}: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  const ct = res.headers.get('Content-Type');
  if (ct?.includes('application/json')) return res.json() as Promise<T>;
  return undefined as unknown as T;
}

/**
 * DELETE — silme (Prefer: return=representation ile silinen satır(lar) döner)
 */
export async function postgrestDelete<T = unknown>(
  path: string,
  options?: PostgrestClientOptions & { prefer?: 'return=representation' | 'return=minimal' }
): Promise<T> {
  const url = getPostgrestUrl(path);
  const headers = buildHeaders(options);
  headers.Prefer = options?.prefer ?? 'return=minimal';
  const res = await fetchRetailexAware(url, { method: 'DELETE', headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostgREST DELETE ${path}: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`);
  }
  const ct = res.headers.get('Content-Type');
  if (ct?.includes('application/json')) return res.json() as Promise<T>;
  return undefined as unknown as T;
}

/**
 * Tek kayıt için path (örn. /firms?id=eq.uuid)
 * Örnek: getOne('/firms', 'id', 'uuid-değeri')
 */
export function postgrestPathOne(table: string, column: string, value: string): string {
  const t = table.startsWith('/') ? table : `/${table}`;
  const raw = stripPostgrestOpPrefix(String(value));
  return `${t}?${column}=eq.${encodeURIComponent(raw)}`;
}

/** PostgREST istemci nesnesi (kolay import) */
export const postgrest = {
  get: postgrestGet,
  post: postgrestPost,
  upsert: postgrestUpsert,
  patch: postgrestPatch,
  delete: postgrestDelete,
  pathOne: postgrestPathOne,
  eq: postgrestEq,
  stripOp: stripPostgrestOpPrefix,
};

export default postgrest;
