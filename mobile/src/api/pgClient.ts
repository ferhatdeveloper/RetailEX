/**
 * pg_bridge uyumlu API istemcisi — web `postgres.ts` /api/pg_query deseni.
 * Her istekte connection string gönderilir (web gibi).
 * WebView YOK; native fetch.
 */

import {
  buildConnStr,
  getActiveEndpoint,
  getBridgeBaseUrl,
  useConfigStore,
  type DbConfig,
  type PgEndpoint,
} from '../store/configStore';

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

/** Web loginVerify: logic.verify_login → public.users fallback */
export async function verifyLogin(
  username: string,
  password: string,
  firmNr: string,
): Promise<LoginRow | null> {
  const firm = normalizeFirmNr(firmNr) || firmNr;

  try {
    const rpc = await pgQuery<LoginRow>(
      `SELECT * FROM logic.verify_login($1, $2, $3) LIMIT 1`,
      [username, password, firm],
    );
    if (rpc.rowCount > 0 && rpc.rows[0]?.id) return rpc.rows[0];
  } catch {
    /* fallback */
  }

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
  } catch {
    /* ignore */
  }
  return null;
}

export type FirmRow = {
  firm_nr: string;
  name: string;
  title?: string | null;
};

export async function fetchFirms(): Promise<FirmRow[]> {
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
