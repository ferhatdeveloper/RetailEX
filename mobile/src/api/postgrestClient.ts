/**
 * PostgREST REST istemcisi — web `src/services/api/postgrestClient.ts` deseni.
 * Base URL: config `remoteRestUrl` (web `remote_rest_url`).
 * İsteğe bağlı `postgrestAnonKey` → Authorization Bearer + apikey.
 */

import {
  normalizeRemoteRestUrl,
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
  return normalizeRemoteRestUrl(config.remoteRestUrl);
}

export function getPostgrestUrl(path: string, cfg?: DbConfig): string {
  const base = getPostgrestBaseUrl(cfg);
  if (!base) throw new Error('PostgREST URL boş (remote_rest_url / remoteRestUrl)');
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

function toQueryString(params: PostgrestQueryParams): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : '';
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatHttpError(method: string, path: string, status: number, statusText: string): Error {
  if (RETRYABLE_STATUS.has(status)) {
    return new Error(
      `Sunucu geçici olarak yanıt vermedi (${status}). Yenile’yi deneyin.`,
    );
  }
  const shortPath = path.length > 64 ? `${path.slice(0, 61)}…` : path;
  return new Error(`PostgREST ${method} ${shortPath}: ${status}${statusText ? ` ${statusText}` : ''}`);
}

async function parseError(res: Response, method: string, path: string): Promise<never> {
  await res.text().catch(() => '');
  throw formatHttpError(method, path, res.status, res.statusText);
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
  const ct = res.headers.get('Content-Type');
  if (ct?.includes('application/json')) return res.json() as Promise<T>;
  return undefined as unknown as T;
}

/**
 * Web `testPostgrestUrl` — `GET {url}/firms?select=firm_nr&limit=1`
 */
export async function testPostgrestConnection(
  cfg?: DbConfig,
): Promise<{ ok: boolean; detail: string; baseUrl?: string; httpStatus?: number }> {
  const config = cfg ?? useConfigStore.getState().config;
  const base = normalizeRemoteRestUrl(config.remoteRestUrl);
  if (!base) {
    return { ok: false, detail: 'PostgREST URL boş (web: remote_rest_url)' };
  }

  try {
    const rows = await postgrestGet<{ firm_nr?: string }[]>(
      '/firms',
      { select: 'firm_nr', limit: 1 },
      { schema: 'public', cfg: config },
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
  test: testPostgrestConnection,
  getBaseUrl: getPostgrestBaseUrl,
};

export default postgrest;
