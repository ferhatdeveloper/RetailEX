/**
 * pg_bridge uyumlu API istemcisi — web `postgres.ts` /api/pg_query deseni.
 * Her istekte connection string gönderilir (web gibi).
 * WebView YOK; native fetch.
 */

import {
  buildConnStr,
  getActiveEndpoint,
  getBridgeBaseUrl,
  shouldPreferPostgrest,
  useConfigStore,
  type DbConfig,
  type PgEndpoint,
} from '../store/configStore';
import { postgrestGet, postgrestPost } from './postgrestClient';

export type PgQueryResult<T = Record<string, unknown>> = {
  rows: T[];
  rowCount: number;
};

export function normalizeFirmNr(v: string | number | undefined | null): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length <= 3 ? d.padStart(3, '0') : d;
}

export async function pgQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  cfgOverride?: DbConfig,
  endpointOverride?: PgEndpoint,
): Promise<PgQueryResult<T>> {
  const cfg = cfgOverride ?? useConfigStore.getState().config;
  const bridgeUrl = getBridgeBaseUrl(cfg);
  const connStr = buildConnStr(cfg, endpointOverride);

  let response: Response;
  try {
    response = await fetch(`${bridgeUrl}/api/pg_query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connStr, sql, params }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/network|failed to fetch|network request failed/i.test(msg)) {
      throw new Error(
        `PostgreSQL köprüsüne ulaşılamadı (${bridgeUrl}/api/pg_query). PC'de npm run bridge çalışıyor mu? Fiziksel cihazda Bridge host = PC LAN IP (192.168.x.x) olmalı.`,
      );
    }
    throw e;
  }

  const data = (await response.json().catch(() => ({}))) as {
    rows?: T[];
    rowCount?: number;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || `pg_query HTTP ${response.status}`);
  }

  return {
    rows: data.rows ?? [],
    rowCount: data.rowCount ?? (data.rows?.length ?? 0),
  };
}

/** Web `testPostgresEndpoint` / `testDbConfig` — önce /api/status, sonra SELECT version() */
export async function testBridgeConnection(
  cfg?: DbConfig,
  which?: 'active' | 'local' | 'remote',
): Promise<{ ok: boolean; detail: string }> {
  const config = cfg ?? useConfigStore.getState().config;
  const bridgeUrl = getBridgeBaseUrl(config);

  try {
    const statusRes = await fetch(`${bridgeUrl}/api/status`);
    const statusBody = (await statusRes.json().catch(() => ({}))) as {
      status?: string;
    };
    if (!statusRes.ok || statusBody.status !== 'RUNNING') {
      return {
        ok: false,
        detail: `Köprü yanıt vermiyor (${bridgeUrl}/api/status). PC'de npm run bridge çalıştırın.`,
      };
    }
  } catch {
    return {
      ok: false,
      detail: `Köprüye ulaşılamadı (${bridgeUrl}). Bridge host/port ve aynı Wi‑Fi'yi kontrol edin.`,
    };
  }

  const endpoint =
    which === 'local'
      ? config.local
      : which === 'remote'
        ? config.remote
        : getActiveEndpoint(config);

  try {
    const result = await pgQuery<{ version?: string }>(
      'SELECT version() AS version',
      [],
      config,
      endpoint,
    );
    const version = result.rows[0]?.version;
    const target = `${endpoint.host}:${endpoint.port}/${endpoint.database}`;
    return {
      ok: true,
      detail: version
        ? `${target}\n${String(version).slice(0, 120)}`
        : `${target} — SELECT version() OK`,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export type LoginRow = {
  id: string;
  username: string;
  email?: string | null;
  full_name?: string | null;
  firm_nr?: string | null;
  store_id?: string | null;
  role_name?: string | null;
  allowed_firm_nrs?: unknown;
  allowed_periods?: unknown;
};

function parseLoginRpcRow(rpcRes: unknown): LoginRow | null {
  const row = Array.isArray(rpcRes)
    ? rpcRes[0]
    : (rpcRes as { 0?: unknown })?.[0] ?? rpcRes;
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (!r.id || !r.username) return null;
  return r as unknown as LoginRow;
}

/** apiMode postgrest|hybrid (+ remoteRestUrl): POST /rpc/verify_login (schema logic) */
async function verifyViaPostgrest(
  username: string,
  password: string,
  firmNr: string,
): Promise<LoginRow | null> {
  if (!shouldPreferPostgrest()) return null;
  try {
    const rpcRes = await postgrestPost(
      '/rpc/verify_login',
      { username, password, firm_nr: firmNr },
      { schema: 'logic' },
    );
    return parseLoginRpcRow(rpcRes);
  } catch (err) {
    if (__DEV__) {
      console.warn(
        '[verifyLogin] PostgREST verify_login başarısız',
        err instanceof Error ? err.message : err,
      );
    }
    return null;
  }
}

async function verifyViaSqlRpc(
  username: string,
  password: string,
  firmNr: string,
): Promise<LoginRow | null> {
  try {
    const rpc = await pgQuery<LoginRow>(
      `SELECT * FROM logic.verify_login($1, $2, $3) LIMIT 1`,
      [username, password, firmNr],
    );
    if (rpc.rowCount > 0 && rpc.rows[0]?.id) return rpc.rows[0];
  } catch (err) {
    if (__DEV__) {
      console.warn(
        '[verifyLogin] logic.verify_login SQL başarısız',
        err instanceof Error ? err.message : err,
      );
    }
  }
  return null;
}

async function verifyViaPublicUsers(
  username: string,
  password: string,
  firmNr: string,
): Promise<LoginRow | null> {
  const normalizedFirm = normalizeFirmNr(firmNr);
  const firmClause = normalizedFirm
    ? `AND (
        u.firm_nr = $3::text
        OR (
          COALESCE(jsonb_array_length(u.allowed_firm_nrs), 0) > 0
          AND u.allowed_firm_nrs @> jsonb_build_array($3::text)
        )
      )`
    : '';
  const sql = `
    SELECT u.id, u.email, u.username, u.full_name, u.firm_nr, u.store_id,
           r.name AS role_name, u.allowed_firm_nrs, u.allowed_periods
    FROM public.users u
    LEFT JOIN public.roles r ON r.id = u.role_id
    WHERE LOWER(u.username) = LOWER($1) AND u.is_active = true
      AND u.password_hash IS NOT NULL
      AND u.password_hash = crypt($2, u.password_hash)
      ${firmClause}
    LIMIT 1
  `;
  const params = normalizedFirm ? [username, password, normalizedFirm] : [username, password];
  try {
    const result = await pgQuery<LoginRow>(sql, params);
    if (result.rowCount > 0) return result.rows[0];
  } catch (err) {
    if (__DEV__) {
      console.warn(
        '[verifyLogin] public.users fallback başarısız',
        err instanceof Error ? err.message : err,
      );
    }
  }
  return null;
}

/**
 * Web `loginVerify.verifyLoginUser` sırası:
 * PostgREST logic.verify_login → bridge SQL logic.verify_login → public.users.
 * Firma adayları: verilen firmNr → firmasız ('').
 */
export async function verifyLogin(
  username: string,
  password: string,
  firmNr?: string,
): Promise<LoginRow | null> {
  const trimmedUsername = username.trim();
  const trimmedPassword = password.trim();
  if (!trimmedUsername || !trimmedPassword) return null;

  const candidates = [normalizeFirmNr(firmNr), ''].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );

  for (const fn of candidates) {
    const viaRest = await verifyViaPostgrest(trimmedUsername, trimmedPassword, fn);
    if (viaRest) return viaRest;

    const viaSql = await verifyViaSqlRpc(trimmedUsername, trimmedPassword, fn);
    if (viaSql) return viaSql;

    const viaPublic = await verifyViaPublicUsers(trimmedUsername, trimmedPassword, fn);
    if (viaPublic) return viaPublic;
  }

  return null;
}

export type FirmRow = {
  firm_nr: string;
  name: string;
  title?: string | null;
};

function mapFirmRows(
  rows: Array<{ firm_nr?: string | number; name?: string | null; title?: string | null; is_active?: boolean | null }>,
): FirmRow[] {
  return rows
    .filter((r) => r.is_active !== false)
    .map((r) => {
      const firm_nr = normalizeFirmNr(r.firm_nr) || String(r.firm_nr ?? '');
      const name = String(r.name || r.title || firm_nr || 'Firma');
      return { firm_nr, name, title: r.title ?? null };
    })
    .filter((r) => r.firm_nr);
}

/** Web Login: PostgREST `/firms` → bridge SQL `firms` */
export async function fetchFirms(): Promise<FirmRow[]> {
  if (shouldPreferPostgrest()) {
    try {
      const rows = await postgrestGet<
        Array<{
          firm_nr?: string | number;
          name?: string | null;
          title?: string | null;
          is_active?: boolean | null;
        }>
      >(
        '/firms',
        { select: 'firm_nr,name,title,is_active', order: 'firm_nr.asc', limit: 200 },
        { schema: 'public' },
      );
      const mapped = mapFirmRows(Array.isArray(rows) ? rows : []);
      if (mapped.length > 0) return mapped;
    } catch (err) {
      if (__DEV__) {
        console.warn(
          '[fetchFirms] PostgREST /firms başarısız, SQL fallback',
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  try {
    const res = await pgQuery<FirmRow>(
      `SELECT firm_nr, COALESCE(name, title, firm_nr) AS name, title
       FROM firms
       WHERE COALESCE(is_active, true) = true
       ORDER BY firm_nr ASC
       LIMIT 200`,
    );
    return res.rows.map((r) => ({
      ...r,
      firm_nr: normalizeFirmNr(r.firm_nr) || String(r.firm_nr),
    }));
  } catch {
    return [{ firm_nr: '001', name: 'Demo Firma' }];
  }
}

export type StoreRow = {
  id: string;
  name: string;
  region?: string | null;
};

export async function fetchStores(firmNr: string): Promise<StoreRow[]> {
  const firm = normalizeFirmNr(firmNr) || firmNr;
  try {
    const res = await pgQuery<{ id: string | number; name: string; region?: string | null }>(
      `SELECT id, name, region FROM stores
       WHERE firm_nr = $1 AND is_active = true
       ORDER BY name ASC`,
      [firm],
    );
    return res.rows.map((s) => ({
      id: String(s.id),
      name: s.name,
      region: s.region,
    }));
  } catch {
    return [{ id: '1', name: 'Merkez Mağaza', region: 'TR' }];
  }
}

export type PeriodRow = {
  nr: string;
  label: string;
};

export async function fetchPeriods(firmNr: string): Promise<PeriodRow[]> {
  const firm = normalizeFirmNr(firmNr) || firmNr;
  try {
    const res = await pgQuery<{ nr: string | number; name?: string | null }>(
      `SELECT nr, name FROM periods
       WHERE firm_nr = $1 AND COALESCE(active, true) = true
       ORDER BY nr ASC
       LIMIT 50`,
      [firm],
    );
    if (res.rows.length) {
      return res.rows.map((p) => ({
        nr: String(p.nr).padStart(2, '0'),
        label: p.name || `Dönem ${p.nr}`,
      }));
    }
  } catch {
    /* fallback */
  }
  return [
    { nr: '01', label: 'Dönem 01' },
    { nr: '02', label: 'Dönem 02' },
  ];
}
