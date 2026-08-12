import remotePgJson from '../../config/remote-pg.defaults.json';

export type RemotePgEndpoint = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

/** Tek kaynak: config/remote-pg.defaults.json (Tauri config.rs ile senkron tutulmalı) */
export const REMOTE_PG_DEFAULTS: RemotePgEndpoint = {
  host: remotePgJson.host,
  port: remotePgJson.port,
  database: remotePgJson.database,
  user: remotePgJson.user,
  password: remotePgJson.password,
};

export const DEFAULT_REMOTE_REST_URL =
  (remotePgJson as { remoteRestUrl?: string }).remoteRestUrl || 'https://api.retailex.app';

export const DEFAULT_CONNECTION_PROVIDER =
  (remotePgJson as { defaultConnectionProvider?: string }).defaultConnectionProvider === 'db'
    ? 'db'
    : 'rest_api';

export function formatRemotePgEndpoint(
  host: string = REMOTE_PG_DEFAULTS.host,
  port: number = REMOTE_PG_DEFAULTS.port,
  database: string = REMOTE_PG_DEFAULTS.database,
): string {
  return `${host}:${port}/${database}`;
}

export function formatRemotePgHostPort(
  host: string = REMOTE_PG_DEFAULTS.host,
  port: number = REMOTE_PG_DEFAULTS.port,
): string {
  return `${host}:${port}`;
}

/** `host:port/db` veya yalnızca veritabanı adı */
export function parsePgEndpointString(
  endpoint: string,
  fallback: Partial<Pick<RemotePgEndpoint, 'host' | 'port' | 'database'>> = {},
): Pick<RemotePgEndpoint, 'host' | 'port' | 'database'> {
  const out = {
    host: fallback.host ?? REMOTE_PG_DEFAULTS.host,
    port: fallback.port ?? REMOTE_PG_DEFAULTS.port,
    database: fallback.database ?? REMOTE_PG_DEFAULTS.database,
  };
  const raw = String(endpoint ?? '').trim();
  if (!raw) return out;

  if (!raw.includes(':') && !raw.includes('/')) {
    return { ...out, database: raw };
  }

  const host = raw.split(':')[0] || out.host;
  out.host = host;
  if (raw.includes(':')) {
    const after = raw.split(':')[1] || '';
    const portStr = after.split('/')[0];
    if (portStr) out.port = parseInt(portStr, 10) || out.port;
    if (raw.includes('/')) {
      const dbPart = raw.split('/').slice(1).join('/');
      if (dbPart) out.database = dbPart;
    }
  }
  return out;
}
