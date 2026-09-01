#!/usr/bin/env node
/**
 * Tek dosya migration uygulama — tüm RetailEX tenant DB'lerine.
 *
 * Kullanım:
 *   node scripts/apply-single-migration-to-tenants.mjs <NNN_dosya.sql> [--dry-run]
 *
 * Uzak PG: PGHOST, PGPORT, PGUSER, PGPASSWORD ortam değişkenleri
 *          veya config/remote-pg.defaults.json
 *
 * Hariç liste (RetailEX dışı DB'ler atlanır):
 *   database/scripts/non-retailex-databases.mjs
 */

import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';
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

const migrationFile = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!migrationFile) {
  console.error('Kullanım: node scripts/apply-single-migration-to-tenants.mjs <NNN_dosya.sql> [--dry-run]');
  process.exit(2);
}

const SKIP_DBS = new Set(['postgres', 'template0', 'template1', 'merkez_db']);

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

async function listRetailExDbs() {
  const c = client(maintenanceDb);
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT datname FROM pg_database
       WHERE datistemplate = false AND datallowconn
       ORDER BY datname
    `);
    const all = rows
      .map((r) => r.datname)
      .filter((n) => !SKIP_DBS.has(n));
    return filterRetailExDatabases(all);
  } finally {
    await c.end().catch(() => {});
  }
}

function applyMigration(dbName, sqlPath) {
  const args = [
    '-h', host,
    '-p', String(port),
    '-U', user,
    '-d', dbName,
    '-v', 'ON_ERROR_STOP=0',
    '-f', sqlPath,
  ];
  const env = {
    ...process.env,
    PGPASSWORD: password,
    PGHOST: host,
    PGPORT: String(port),
    PGUSER: user,
    PGDATABASE: dbName,
  };
  return spawnSync('psql', args, { env, stdio: 'pipe', encoding: 'utf8', shell: false });
}

async function main() {
  if (!password) {
    console.error('[apply-single] Eksik: PGPASSWORD');
    process.exit(1);
  }
  const sqlPath = join(__dirname, '..', 'database', 'migrations', migrationFile);
  console.log(`[apply-single] Sunucu: ${user}@${host}:${port} (mask'lendi)`);
  console.log(`[apply-single] Migration: ${migrationFile}`);
  if (dryRun) console.log('[apply-single] --dry-run modu');

  const dbs = await listRetailExDbs();
  console.log(`[apply-single] ${dbs.length} RetailEX tenant DB bulundu`);

  const results = [];
  for (const db of dbs) {
    if (isNonRetailExDatabase(db)) {
      console.log(`[apply-single] ATLANDI: ${db} (${nonRetailExSkipReason(db)})`);
      continue;
    }
    if (dryRun) {
      console.log(`[apply-single] DRY: ${db}`);
      continue;
    }
    process.stdout.write(`[apply-single] ${db} ... `);
    const r = applyMigration(db, sqlPath);
    const ok = r.status === 0;
    const code = typeof r.status === 'number' ? r.status : -1;
    console.log(ok ? 'OK' : `HATA (çıkış ${code})`);
    if (!ok && (r.stderr || r.stdout)) {
      const errOut = (r.stderr || r.stdout).trim().split('\n').slice(0, 4).join('\n');
      console.log(errOut);
    }
    results.push({ dbName: db, ok, code });
  }

  if (dryRun) {
    console.log(`\n[apply-single] DRY-RUN özet: ${dbs.length} DB listelendi`);
    return;
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;
  console.log(`\n[apply-single] Özet: ${okCount} başarılı, ${failCount} hatalı`);
  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error('[apply-single] Hata:', e?.message || e);
  process.exit(1);
});