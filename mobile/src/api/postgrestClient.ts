/**
 * PostgREST REST istemcisi — web `src/services/api/postgrestClient.ts` deseni.
 * Base URL: config `remoteRestUrl` veya kiracı kodundan SaaS URL.
 * İsteğe bağlı `postgrestAnonKey` → Authorization Bearer + apikey.
 */

import {
  normalizeRemoteRestUrl,
  resolveEffectiveRemoteRestUrl,
  useConfigStore,
  type DbConfig,
} from '../store/configStore';

export type PostgrestSchema =
  | 'public'
  | 'logic'
  | 'wms'
  | 'rest'
  | 'beauty'
  | 'pos'
  | 'logistics';

export type PostgrestClientOptions = {
  schema?: PostgrestSchema;
  headers?: Record<string, string>;
  /** JWT / anon key override */
  jwt?: string;
  cfg?: DbConfig;
};

export type PostgrestQueryParams = {
  select?: string;
  order?: string;
  limit?: number;
  offset?: number;
  [key: string]: string | number | undefined;
};

export function getPostgrestBaseUrl(cfg?: DbConfig): string {
  const config = cfg ?? useConfigStore.getState().config;
  return resolveEffectiveRemoteRestUrl(config.remoteRestUrl, config.merkezTenantCode);
}

export function getPostgrestUrl(path: string, cfg?: DbConfig): string {
  const base = getPostgrestBaseUrl(cfg);
  if (!base) throw new Error('PostgREST URL boş (remote_rest_url / remoteRestUrl / kiracı kodu)');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function resolveJwt(options: PostgrestClientOptions = {}): string {
  if (options.jwt) return options.jwt;
  const cfg = options.cfg ?? useConfigStore.getState().config;
  return String(cfg.postgrestAnonKey || '').trim();
}

function buildHeaders(options: PostgrestClientOptions = {}): Record<string, string> {
  const schema = options.schema ?? 'public';
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Profile': schema,
    'Content-Profile': schema,
    ...options.headers,
  };
  const jwt = resolveJwt(options);
  if (jwt) {
    h.Authorization = `Bearer ${jwt}`;
    h.apikey = jwt;
  }
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

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateBody(text: string, max = 180): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function formatHttpError(
  method: string,
  path: string,
  status: number,
  statusText: string,
  bodyText?: string,
): Error {
  if (RETRYABLE_STATUS.has(status)) {
    return new Error(
      `Sunucu geçici olarak yanıt vermedi (${status}). Yenile’yi deneyin.`,
    );
  }
  const shortPath = path.length > 64 ? `${path.slice(0, 61)}…` : path;
  const body = truncateBody(bodyText || '');
  const base = `PostgREST ${method} ${shortPath}: ${status}${statusText ? ` ${statusText}` : ''}`;
  return new Error(body ? `${base} — ${body}` : base);
}

async function parseError(res: Response, method: string, path: string): Promise<never> {
  const text = await res.text().catch(() => '');
  throw formatHttpError(method, path, res.status, res.statusText, text);
}

function networkError(e: unknown, cfg?: DbConfig): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/network|failed to fetch|network request failed/i.test(msg)) {
    throw new Error(
      `PostgREST’e ulaşılamadı (${getPostgrestBaseUrl(cfg)}). URL ve cihaz ağını kontrol edin.`,
    );
  }
  throw e;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  method: string,
  path: string,
  cfg?: DbConfig,
): Promise<Response> {
  let lastRes: Response | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      networkError(e, cfg);
    }
    if (res.ok || !RETRYABLE_STATUS.has(res.status) || attempt === MAX_RETRIES) {
      return res;
    }
    lastRes = res;
    await sleep(300 * 2 ** attempt);
  }
  return lastRes!;
}

async function parseJsonBody<T>(res: Response): Promise<T> {
  const ct = res.headers.get('Content-Type');
  if (ct?.includes('application/json')) return res.json() as Promise<T>;
  return undefined as unknown as T;
}

/** GET — liste veya tek kayıt */
export async function postgrestGet<T = unknown>(
  path: string,
  query?: PostgrestQueryParams,
  options?: PostgrestClientOptions,
): Promise<T> {
  const url = getPostgrestUrl(path, options?.cfg) + (query ? toQueryString(query) : '');
  const res = await fetchWithRetry(
    url,
    { method: 'GET', headers: buildHeaders(options) },
    'GET',
    path,
    options?.cfg,
  );
  if (!res.ok) await parseError(res, 'GET', path);
  return res.json() as Promise<T>;
}

/**
 * POST — kayıt veya RPC (örn. `/rpc/verify_login`, schema: `logic`).
 * Web `postgrestPost` ile aynı Prefer: return=representation.
 */
export async function postgrestPost<T = unknown>(
  path: string,
  body: Record<string, unknown> | unknown[],
  options?: PostgrestClientOptions & { prefer?: 'return=representation' | 'return=minimal' },
): Promise<T> {
  const url = getPostgrestUrl(path, options?.cfg);
  const headers = buildHeaders(options);
  headers.Prefer = options?.prefer ?? 'return=representation';
  const res = await fetchWithRetry(
    url,
    { method: 'POST', headers, body: JSON.stringify(body) },
    'POST',
    path,
    options?.cfg,
  );
  if (!res.ok) await parseError(res, 'POST', path);
  return parseJsonBody<T>(res);
}

/** PATCH — güncelleme (web ile aynı Prefer) */
export async function postgrestPatch<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  options?: PostgrestClientOptions & { prefer?: 'return=representation' | 'return=minimal' },
): Promise<T> {
  const url = getPostgrestUrl(path, options?.cfg);
  const headers = buildHeaders(options);
  headers.Prefer = options?.prefer ?? 'return=representation';
  const res = await fetchWithRetry(
    url,
    { method: 'PATCH', headers, body: JSON.stringify(body) },
    'PATCH',
    path,
    options?.cfg,
  );
  if (!res.ok) await parseError(res, 'PATCH', path);
  return parseJsonBody<T>(res);
}

/** DELETE — silme */
export async function postgrestDelete<T = unknown>(
  path: string,
  options?: PostgrestClientOptions & { prefer?: 'return=representation' | 'return=minimal' },
): Promise<T> {
  const url = getPostgrestUrl(path, options?.cfg);
  const headers = buildHeaders(options);
  headers.Prefer = options?.prefer ?? 'return=minimal';
  const res = await fetchWithRetry(
    url,
    { method: 'DELETE', headers },
    'DELETE',
    path,
    options?.cfg,
  );
  if (!res.ok) await parseError(res, 'DELETE', path);
  return parseJsonBody<T>(res);
}

/** POST upsert — on_conflict ile birleştirme */
export async function postgrestUpsert<T = unknown>(
  path: string,
  body: Record<string, unknown> | unknown[],
  onConflict: string,
  options?: PostgrestClientOptions & { prefer?: 'return=representation' | 'return=minimal' },
): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const url =
    getPostgrestUrl(path, options?.cfg) +
    `${sep}on_conflict=${encodeURIComponent(onConflict)}`;
  const headers = buildHeaders(options);
  headers.Prefer = options?.prefer ?? 'resolution=merge-duplicates,return=minimal';
  const res = await fetchWithRetry(
    url,
    { method: 'POST', headers, body: JSON.stringify(body) },
    'UPSERT',
    path,
    options?.cfg,
  );
  if (!res.ok) await parseError(res, 'UPSERT', path);
  return parseJsonBody<T>(res);
}

/** Tek kayıt path yardımcısı — örn. `/rex_001_products?id=eq.uuid` */
export function postgrestPathOne(table: string, column: string, value: string): string {
  const t = table.startsWith('/') ? table : `/${table}`;
  const raw = stripPostgrestOpPrefix(String(value));
  return `${t}?${column}=eq.${encodeURIComponent(raw)}`;
}

/**
 * Web `testPostgrestUrl` — `GET {url}/firms?select=firm_nr&limit=1`
 */
export async function testPostgrestConnection(
  cfg?: DbConfig,
): Promise<{ ok: boolean; detail: string; baseUrl?: string; httpStatus?: number }> {
  const config = cfg ?? useConfigStore.getState().config;
  const resolved = {
    ...config,
    remoteRestUrl: resolveEffectiveRemoteRestUrl(config.remoteRestUrl, config.merkezTenantCode),
  };
  const base = normalizeRemoteRestUrl(resolved.remoteRestUrl);
  if (!base) {
    return {
      ok: false,
      detail: 'PostgREST URL boş (web: remote_rest_url veya kiracı kodu)',
    };
  }

  try {
    const rows = await postgrestGet<{ firm_nr?: string }[]>(
      '/firms',
      { select: 'firm_nr', limit: 1 },
      { schema: 'public', cfg: resolved },
    );
    const n = Array.isArray(rows) ? rows.length : 0;
    return {
      ok: true,
      baseUrl: base,
      httpStatus: 200,
      detail: `${base}\nfirms ok (${n} satır)`,
    };
  } catch (e) {
    return {
      ok: false,
      baseUrl: base,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export const postgrest = {
  get: postgrestGet,
  post: postgrestPost,
  patch: postgrestPatch,
  delete: postgrestDelete,
  upsert: postgrestUpsert,
  pathOne: postgrestPathOne,
  eq: postgrestEq,
  stripOp: stripPostgrestOpPrefix,
  test: testPostgrestConnection,
  getBaseUrl: getPostgrestBaseUrl,
};

export default postgrest;
