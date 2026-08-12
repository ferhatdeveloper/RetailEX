/**
 * `host:port/database` veya yalnızca `host` biçimindeki PG uç noktasını ayrıştırır.
 * config/remote-pg.defaults.json ile uyumlu varsayılanlar.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedRemoteDefaults = null;

export function loadRemotePgDefaults() {
  if (cachedRemoteDefaults) return cachedRemoteDefaults;
  const path = join(__dirname, '..', '..', 'config', 'remote-pg.defaults.json');
  if (existsSync(path)) {
    cachedRemoteDefaults = JSON.parse(readFileSync(path, 'utf8'));
    return cachedRemoteDefaults;
  }
  cachedRemoteDefaults = {
    host: '72.60.182.107',
    port: 5432,
    database: 'retailex_demo',
    user: 'postgres',
    password: 'Yq7xwQpt6c',
    endpoint: '72.60.182.107:5432/retailex_demo',
  };
  return cachedRemoteDefaults;
}

/**
 * @param {string | undefined | null} endpoint
 * @param {{ host?: string; port?: number; database?: string }} [fallback]
 */
export function parsePgEndpoint(endpoint, fallback = {}) {
  const remote = loadRemotePgDefaults();
  const out = {
    host: fallback.host || remote.host || '127.0.0.1',
    port: fallback.port ?? remote.port ?? 5432,
    database: fallback.database || remote.database || 'retailex_local',
  };
  if (!endpoint || typeof endpoint !== 'string') return out;

  const trimmed = endpoint.trim();
  if (!trimmed) return out;

  const host = trimmed.split(':')[0] || out.host;
  out.host = host;

  if (trimmed.includes(':')) {
    const after = trimmed.split(':')[1] || '';
    const portPart = after.split('/')[0];
    if (portPart) out.port = parseInt(portPart, 10) || out.port;
    if (trimmed.includes('/')) {
      const dbPart = trimmed.split('/').slice(1).join('/');
      if (dbPart) out.database = dbPart;
    }
  } else if (!trimmed.includes('/') && !trimmed.includes(':')) {
    out.database = trimmed;
  }

  return out;
}
