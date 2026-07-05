import { Pool } from 'pg';

const POOL_MAX = Math.min(20, Math.max(2, Number(process.env.PG_BRIDGE_POOL_MAX || 5)));
const POOL_MAX_ENTRIES = Math.min(32, Math.max(4, Number(process.env.PG_BRIDGE_MAX_POOLS || 10)));

type PoolEntry = { pool: Pool; lastUsed: number };

const pools = new Map<string, PoolEntry>();

/** Bağlantı dizesini havuz anahtarına indirger (aynı PG için tek havuz). */
export function normalizePgPoolKey(connStr: string): string {
  try {
    const raw = connStr.trim();
    const u = new URL(raw.includes('://') ? raw : `postgresql://${raw}`);
    const db = decodeURIComponent(u.pathname.replace(/^\//, '') || 'postgres');
    const port = u.port || '5432';
    const user = decodeURIComponent(u.username || 'postgres');
    const host = u.hostname || '127.0.0.1';
    return `postgresql://${user}@${host}:${port}/${db}`;
  } catch {
    return connStr.trim();
  }
}

function evictOldestPool(): void {
  let oldestKey: string | null = null;
  let oldestTs = Infinity;
  for (const [key, entry] of pools) {
    if (entry.lastUsed < oldestTs) {
      oldestTs = entry.lastUsed;
      oldestKey = key;
    }
  }
  if (!oldestKey) return;
  const entry = pools.get(oldestKey);
  pools.delete(oldestKey);
  void entry?.pool.end().catch(() => {});
}

export function getSharedPgPool(connStr: string): Pool {
  const key = normalizePgPoolKey(connStr);
  const existing = pools.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.pool;
  }

  if (pools.size >= POOL_MAX_ENTRIES) {
    evictOldestPool();
  }

  const pool = new Pool({
    connectionString: connStr,
    max: POOL_MAX,
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 20_000,
    keepAlive: true,
    allowExitOnIdle: true,
  });

  pool.on('error', (err) => {
    console.error('[PG Pool] idle client error', err.message);
  });

  pools.set(key, { pool, lastUsed: Date.now() });
  return pool;
}
