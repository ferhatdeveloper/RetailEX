#!/usr/bin/env node
/**
 * Tüm veritabanlarında PostgREST şema yenilemesi (şablon DB'ler hariç).
 * Kullanım: npm run db:postgrest:reload:tenants
 * Yalnızca kiracı: POSTGREST_SKIP_DBS=postgres,merkez_db
 */

import pg from 'pg';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';
import { notifyPostgrestReloadSchema } from '../database/scripts/postgrest-reload-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaults = loadRemotePgDefaults();

const host = process.env.PGHOST || defaults.host;
const port = Number(process.env.PGPORT || defaults.port);
const user = process.env.PGUSER || defaults.user;
const password = process.env.PGPASSWORD || defaults.password;
const maintenanceDb = process.env.PG_MAINTENANCE_DATABASE || 'postgres';

const SKIP_DBS = new Set(
  (process.env.POSTGREST_SKIP_DBS || 'template0,template1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

function pgClient(database) {
  return new pg.Client({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: 15000,
  });
}

async function listDatabases() {
  const envList = (process.env.TENANT_DBS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (envList.length) return envList;

  const c = pgClient(maintenanceDb);
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT datname FROM pg_database
      WHERE datistemplate = false AND datallowconn
      ORDER BY datname
    `);
    return rows.map((r) => r.datname).filter((n) => !SKIP_DBS.has(n));
  } finally {
    await c.end().catch(() => {});
  }
}

async function main() {
  if (!password) {
    console.error('[db:postgrest:reload:tenants] Eksik: PGPASSWORD');
    process.exit(1);
  }

  const dbs = await listDatabases();
  console.log(`[db:postgrest:reload:tenants] ${user}@${host}:${port} — ${dbs.length} DB`);

  let ok = 0;
  let fail = 0;
  for (const db of dbs) {
    const c = pgClient(db);
    try {
      await c.connect();
      const sent = await notifyPostgrestReloadSchema(c, { quiet: true });
      console.log(`  ${db}: ${sent ? 'NOTIFY gönderildi' : 'NOTIFY atlandı/hata'}`);
      if (sent) ok += 1;
      else fail += 1;
    } catch (e) {
      console.log(`  ${db}: bağlantı hatası — ${e?.message || e}`);
      fail += 1;
    } finally {
      await c.end().catch(() => {});
    }
  }

  console.log(`[db:postgrest:reload:tenants] Özet: ${ok} başarılı, ${fail} hatalı/atlandı`);
  if (fail > 0 && ok === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
