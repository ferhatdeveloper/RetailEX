/**
 * PostgREST şema önbelleğini yeniler (migration / DDL sonrası).
 * @see https://postgrest.org/en/stable/references/schema_cache.html
 */

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<unknown> }} pg
 * @param {{ quiet?: boolean }} [opts]
 */
export async function notifyPostgrestReloadSchema(pg, opts = {}) {
  const quiet = opts.quiet === true;
  try {
    await pg.query(`NOTIFY pgrst, 'reload schema'`);
    if (!quiet) {
      console.log('[postgrest] NOTIFY pgrst, reload schema — gönderildi');
    }
    return true;
  } catch (err) {
    if (!quiet) {
      console.warn('[postgrest] NOTIFY başarısız (PostgREST dinlemiyor olabilir):', err?.message || err);
    }
    return false;
  }
}

/**
 * PG bağlantı bilgisi ile tek veritabanında NOTIFY gönderir.
 * @param {{ host: string; port?: number; user: string; password: string; database: string }} conn
 */
export async function notifyPostgrestReloadSchemaConn(conn) {
  const { Client } = await import('pg');
  const client = new Client({
    host: conn.host,
    port: conn.port ?? 5432,
    user: conn.user,
    password: conn.password,
    database: conn.database,
    connectionTimeoutMillis: 15000,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    return await notifyPostgrestReloadSchema(client);
  } finally {
    await client.end().catch(() => {});
  }
}

/** Tek DB — PGHOST, PGUSER, PGPASSWORD, PGDATABASE veya --db */
async function runCli() {
  const args = process.argv.slice(2);
  const dbFlag = args.indexOf('--db');
  const db =
    dbFlag >= 0 && args[dbFlag + 1]
      ? args[dbFlag + 1]
      : args.find((a) => !a.startsWith('-')) || process.env.PGDATABASE || 'retailex_local';

  const conn = {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: db,
  };

  if (!conn.password) {
    console.error('[postgrest] Eksik: PGPASSWORD');
    process.exit(1);
  }

  console.log(`[postgrest] ${conn.user}@${conn.host}:${conn.port}/${conn.database}`);
  const ok = await notifyPostgrestReloadSchemaConn(conn);
  process.exit(ok ? 0 : 1);
}

import { fileURLToPath } from 'url';

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  });
}
