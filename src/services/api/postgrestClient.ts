/**
 * PostgREST REST API istemcisi
 * PostgreSQL tablolarına REST üzerinden erişim (GET/POST/PATCH/DELETE).
 * @see https://postgrest.org/en/stable/references/api.html
 */

import { getPostgrestUrl, postgrestConfig } from '../../config/postgrest.config';

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

function toQueryString(params: PostgrestQueryParams): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') search.set(k, String(v));
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
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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
  const res = await fetch(url, { method: 'DELETE', headers });
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
  return `${table}?${column}=eq.${encodeURIComponent(value)}`;
}

/** PostgREST istemci nesnesi (kolay import) */
export const postgrest = {
  get: postgrestGet,
  post: postgrestPost,
  patch: postgrestPatch,
  delete: postgrestDelete,
  pathOne: postgrestPathOne,
};

export default postgrest;
