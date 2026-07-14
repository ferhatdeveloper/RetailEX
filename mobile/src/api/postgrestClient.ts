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

async function parseError(res: Response, method: string, path: string): Promise<never> {
  const text = await res.text().catch(() => '');
  throw new Error(
    `PostgREST ${method} ${path}: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 240)}` : ''}`,
  );
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

/** GET — liste veya tek kayıt */
export async function postgrestGet<T = unknown>(
  path: string,
  query?: PostgrestQueryParams,
  options?: PostgrestClientOptions,
): Promise<T> {
  const url = getPostgrestUrl(path, options?.cfg) + (query ? toQueryString(query) : '');
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(options),
    });
  } catch (e) {
    networkError(e, options?.cfg);
  }
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
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    networkError(e, options?.cfg);
  }
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
