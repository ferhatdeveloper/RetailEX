/**
 * Merkez PostgREST RPC çağrıları (cihaz kaydı, firma şema provision vb.)
 */

import { getPostgrestBaseUrl } from '../config/postgrest.config';
import { DB_SETTINGS, getCentralRemotePgConfig, shouldUseCentralApi } from './postgres';
import { IS_TAURI, safeInvoke, getBridgeUrl } from '../utils/env';
import { fetchRetailexAware } from '../utils/retailexDevProxy';

export function isCentralRestAvailable(): boolean {
  if (DB_SETTINGS.activeMode === 'offline') return false;
  return String(DB_SETTINGS.remoteRestUrl || '').trim().length > 0;
}

export function isCentralPgConfigured(): boolean {
  if (isCentralRestAvailable()) return true;
  if (shouldUseCentralApi()) return false;
  const cfg = getCentralRemotePgConfig();
  return Boolean(cfg.host?.trim() && cfg.database?.trim() && cfg.user?.trim());
}

export async function queryCentralPgRows<T = Record<string, unknown>>(
  sql: string,
  params: unknown[],
): Promise<T[]> {
  if (shouldUseCentralApi()) {
    throw new Error(
      'Merkez doğrudan PostgreSQL devre dışı. İşlemler PostgREST/API (remote_rest_url) üzerinden yapılmalı.',
    );
  }
  const config = getCentralRemotePgConfig();
  const normalizedParams = params.map((p) => {
    if (p === null || p === undefined) return null;
    if (typeof p === 'object' && !(p instanceof Date)) {
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    }
    return p;
  });

  const effectiveHost = config.host === 'localhost' ? '127.0.0.1' : config.host;
  const connStr = `postgresql://${config.user}:${config.password}@${effectiveHost}:${config.port}/${config.database}`;

  if (IS_TAURI) {
    const resultJson: string = await safeInvoke('pg_query', {
      connStr,
      sql,
      params: normalizedParams,
    });
    return JSON.parse(resultJson) as T[];
  }

  const response = await fetch(`${getBridgeUrl()}/api/pg_query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connStr, sql, params: normalizedParams }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(String((errData as { error?: string }).error || 'Merkez PG sorgusu başarısız'));
  }
  const res = (await response.json()) as { rows?: T[] };
  return res.rows ?? [];
}

/** Merkez PostgREST üzerinden RPC (tercihen) */
export async function centralRpcCall<T = Record<string, unknown>>(
  fn: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!isCentralRestAvailable()) {
    if (shouldUseCentralApi()) {
      throw new Error(`Merkez RPC ${fn}: PostgREST URL yapılandırılmamış.`);
    }
  }

  if (isCentralRestAvailable()) {
    const base = getPostgrestBaseUrl().replace(/\/+$/, '');
    const url = `${base}/rpc/${fn}`;
    const res = await fetchRetailexAware(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Merkez RPC ${fn}: ${res.status}${text ? ` — ${text.slice(0, 400)}` : ''}`);
    }
    const data = (await res.json()) as unknown;
    const row = Array.isArray(data) ? data[0] : data;
    return row as T;
  }

  if (!isCentralPgConfigured()) {
    throw new Error('Merkez PostgREST URL veya remote_db yapılandırılmamış.');
  }

  const keys = Object.keys(body);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `SELECT * FROM public.${fn}(${placeholders})`;
  const params = keys.map((k) => body[k]);
  const rows = await queryCentralPgRows<T>(sql, params);
  return (rows[0] ?? {}) as T;
}
