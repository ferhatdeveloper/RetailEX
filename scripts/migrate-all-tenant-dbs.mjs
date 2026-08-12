#!/usr/bin/env node
/**
 * Uzak sunucudaki tüm kiracı PostgreSQL veritabanlarına bekleyen migration'ları uygular.
 *
 * Kaynak liste (varsayılan):
 *   1) pg_database (postgres/template* hariç, merkez_db hariç, non-retailex hariç)
 *   2) TENANT_DBS=db1,db2 ile sınırla
 *   3) --from-registry: yalnızca merkez_db.tenant_registry (aktif, merkez_db hariç)
 *
 * Ortam: PGHOST, PGPORT, PGUSER, PGPASSWORD
 * Kullanım:
 *   npm run db:migrate:tenants
 *   npm run db:migrate:tenants -- --dry-run
 *   npm run db:migrate:tenants -- --from-registry
 */

import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';
import { notifyPostgrestReloadSchemaConn } from '../database/scripts/postgrest-reload-schema.mjs';
import {
  filterRetailExDatabases,
  isNonRetailExDatabase,
  nonRetailExSkipReason,
} from '../database/scripts/non-retailex-databases.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaults = loadRemotePgDefaults();

const host = process.env.PGHOST || defaults.host;
const port = Number(process.env.PGPORT || defaults.port);
const user = process.env.PGUSER || defaults.user;
const password = process.env.PGPASSWORD || defaults.password;
const maintenanceDb = process.env.PG_MAINTENANCE_DATABASE || 'postgres';
const merkezDb = process.env.PG_MERKEZ_DATABASE || 'merkez_db';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const fromRegistry = args.includes('--from-registry');
const skipMerkez = !args.includes('--include-merkez');
const forceAll = args.includes('--force-all');

const SKIP_DBS = new Set(['postgres', 'template0', 'template1']);
if (skipMerkez) SKIP_DBS.add('merkez_db');

function client(database) {
  return new pg.Client({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: 15000,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
}

async function listFromPgDatabase() {
  const c = client(maintenanceDb);
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT datname
      FROM pg_database
      WHERE datistemplate = false
        AND datallowconn
      ORDER BY datname
    `);
    return filterRetailExDatabases(
      rows.map((r) => r.datname).filter((n) => !SKIP_DBS.has(n)),
    );
  } finally {
    await c.end().catch(() => {});
  }
}

async function listFromRegistry() {
  const c = client(merkezDb);
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT DISTINCT database_name
      FROM tenant_registry
      WHERE is_active = true
        AND database_name IS NOT NULL
        AND btrim(database_name) <> ''
      ORDER BY database_name
    `);
    return filterRetailExDatabases(
      rows
        .map((r) => r.database_name)
        .filter((n) => !SKIP_DBS.has(n)),
    );
  } finally {
    await c.end().catch(() => {});
  }
}

async function resolveTenantDbs() {
  const envList = (process.env.TENANT_DBS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (envList.length) return envList;
  if (fromRegistry) return listFromRegistry();
  return listFromPgDatabase();
}

async function updateRegistryHosts() {
  const c = client(merkezDb);
  await c.connect();
  try {
    const r = await c.query(
      `UPDATE tenant_registry
       SET db_host = $1,
           db_port = $2,
           db_user = COALESCE(NULLIF(btrim(db_user), ''), $3),
           updated_at = now()
       WHERE is_active = true`,
      [host, port, user],
    );
    console.log(`[db:migrate:tenants] tenant_registry db_host güncellendi: ${r.rowCount} satır → ${host}:${port}`);
  } finally {
    await c.end().catch(() => {});
  }
}

async function isRetailExTenantDb(dbName) {
  if (forceAll) return true;
  const c = client(dbName);
  await c.connect();
  try {
    const mig = await c.query(
      `SELECT count(*)::int AS n FROM public.schema_migrations`,
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if ((mig.rows[0]?.n ?? 0) > 0) return true;
    const sq = await c.query(`SELECT to_regclass('public.sync_queue') AS reg`);
    return Boolean(sq.rows[0]?.reg);
  } finally {
    await c.end().catch(() => {});
  }
}

function migrateOneDb(dbName) {
  const script = join(__dirname, '..', 'database', 'scripts', 'run-pending-migrations.mjs');
  const spawnArgs = [script, '--env-only', '--db', dbName];
  if (dryRun) spawnArgs.push('--dry-run');

  const env = {
    ...process.env,
    PGHOST: host,
    PGPORT: String(port),
    PGUSER: user,
    PGPASSWORD: password,
    PGDATABASE: dbName,
  };

  const result = spawnSync(process.execPath, spawnArgs, { stdio: 'pipe', env, encoding: 'utf8' });
  const out = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return { dbName, ok: result.status === 0, code: result.status ?? 1, out };
}

async function main() {
  if (!password) {
    console.error('[db:migrate:tenants] Eksik: PGPASSWORD');
    process.exit(1);
  }

  console.log(`[db:migrate:tenants] Sunucu: ${user}@${host}:${port}`);

  try {
    await updateRegistryHosts();
  } catch (err) {
    console.warn('[db:migrate:tenants] tenant_registry güncellenemedi:', err?.message || err);
  }

  const dbs = await resolveTenantDbs();
  if (!dbs.length) {
    console.log('[db:migrate:tenants] İşlenecek veritabanı yok.');
    return;
  }

  console.log(`[db:migrate:tenants] ${dbs.length} veritabanı: ${dbs.join(', ')}`);
  if (dryRun) console.log('[db:migrate:tenants] --dry-run modu');

  const results = [];
  const skipped = [];
  for (const db of dbs) {
    console.log(`\n[db:migrate:tenants] === ${db} ===`);
    if (isNonRetailExDatabase(db)) {
      console.log(`[db:migrate:tenants] ATLANDI: ${db} (${nonRetailExSkipReason(db)})`);
      skipped.push(db);
      continue;
    }
    const retail = await isRetailExTenantDb(db);
    if (!retail) {
      console.log(`[db:migrate:tenants] ATLANDI: ${db} (RetailEX şeması / schema_migrations yok)`);
      skipped.push(db);
      continue;
    }
    const r = migrateOneDb(db);
    if (r.out) console.log(r.out);
    if (r.ok && !dryRun && process.env.SKIP_POSTGREST_RELOAD !== '1') {
      try {
        await notifyPostgrestReloadSchemaConn({
          host,
          port,
          user,
          password,
          database: db,
        });
        console.log(`[db:migrate:tenants] PostgREST reload: ${db}`);
      } catch (e) {
        console.warn(`[db:migrate:tenants] PostgREST reload uyarı (${db}):`, e?.message || e);
      }
    }
    results.push(r);
    console.log(r.ok ? `[db:migrate:tenants] OK: ${db}` : `[db:migrate:tenants] HATA: ${db} (çıkış ${r.code})`);
  }

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`\n[db:migrate:tenants] Özet: ${ok.length} başarılı, ${fail.length} hatalı, ${skipped.length} atlandı`);
  if (skipped.length) {
    console.log('[db:migrate:tenants] Atlanan DB:', skipped.join(', '));
  }
  if (fail.length) {
    console.log('[db:migrate:tenants] Hatalı DB:', fail.map((r) => r.dbName).join(', '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
