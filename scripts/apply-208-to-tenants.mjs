#!/usr/bin/env node
/**
 * Migration 208 (payroll bonus/penalty) — TÜM RetailEX tenant DB'lere doğrudan uygula.
 *
 * Amaç: 206_dryrun_supplier_balance_recompute.sql, supplier_ledger CTE'sini
 * yalnızca kasap (001/01) için tasarlamış; diğer firmalarda hata veriyor.
 * Bu yüzden ana migrate-all-tenant-dbs.mjs 208'e ulaşamadan 206'da takılıyor.
 *
 * Bu script: tenant_registry'den DB listesi alır, NON_RETAILEX listesini
 * filtreler, ve 208_payroll_bonus_penalty.sql'i **yalnızca** uygular.
 * Public schema'da idempotent view + fonksiyon oluşturur.
 *
 * Kullanım:
 *   node scripts/apply-208-to-tenants.mjs           # çalıştır
 *   node scripts/apply-208-to-tenants.mjs --dry-run # listele
 */

import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
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
const merkezDb = process.env.PG_MERKEZ_DATABASE || 'merkez_db';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

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
      rows.map((r) => r.database_name).filter(Boolean),
    );
  } finally {
    await c.end().catch(() => {});
  }
}

async function isAlreadyApplied(dbName, filename) {
  const c = client(dbName);
  await c.connect();
  try {
    const r = await c.query(
      'SELECT 1 FROM public.schema_migrations WHERE filename = $1',
      [filename],
    );
    return (r.rowCount || 0) > 0;
  } catch (err) {
    const code = err?.code || '';
    const msg = String(err?.message || '');
    if (code === '42P01' || /schema_migrations.*does not exist/i.test(msg)) {
      return false;
    }
    throw err;
  } finally {
    await c.end().catch(() => {});
  }
}

async function ensureMigrationsTable(dbName) {
  const c = client(dbName);
  await c.connect();
  try {
    await c.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } finally {
    await c.end().catch(() => {});
  }
}

async function applyOne(dbName, sql) {
  const c = client(dbName);
  await c.connect();
  try {
    // SQL içinde DO $$ ... $$ ve CREATE FUNCTION AS $$ ... $$ blokları var;
    // pg-client tek sorgu olarak gönderebilir.
    await c.query(sql);
  } finally {
    await c.end().catch(() => {});
  }
}

async function recordMigration(dbName, filename) {
  const c = client(dbName);
  await c.connect();
  try {
    await c.query(
      'INSERT INTO public.schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
      [filename],
    );
  } finally {
    await c.end().catch(() => {});
  }
}

async function main() {
  if (!password) {
    console.error('[apply-208] Eksik: PGPASSWORD');
    process.exit(1);
  }

  console.log(`[apply-208] Sunucu: ${user}@${host}:${port}`);
  const FILENAME = '208_payroll_bonus_penalty.sql';
  const sqlPath = join(__dirname, '..', 'database', 'migrations', FILENAME);

  // Dosyayı oku (basit, BOM'suz UTF-8)
  const fs = await import('fs');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const dbs = await listFromRegistry();
  if (!dbs.length) {
    console.log('[apply-208] İşlenecek veritabanı yok.');
    return;
  }

  // Merkez DB ve PDKS shell DB'leri uygulamadan çıkar — 208 view/function
  // rex_001_01_party_ledger_movements tablosunu varsayar; merkez_db'de yok.
  const SKIP_DB_NAMES = new Set([merkezDb]);
  const applyDbs = dbs.filter((n) => !SKIP_DB_NAMES.has(n));
  const skippedSkipped = dbs.filter((n) => SKIP_DB_NAMES.has(n));

  console.log(`[apply-208] ${applyDbs.length} RetailEX kiracısı: ${applyDbs.join(', ')}`);
  if (skippedSkipped.length) {
    console.log(`[apply-208] Atlanan (altyapı): ${skippedSkipped.join(', ')}`);
  }
  if (dryRun) console.log('[apply-208] --dry-run modu');

  const results = [];
  const skipped = [];
  for (const db of applyDbs) {
    console.log(`\n[apply-208] === ${db} ===`);
    if (isNonRetailExDatabase(db)) {
      console.log(`[apply-208] ATLANDI: ${db} (${nonRetailExSkipReason(db)})`);
      skipped.push(db);
      continue;
    }
    if (dryRun) {
      console.log(`[apply-208] DRY: ${db} → 208 uygulanır`);
      continue;
    }
    try {
      await ensureMigrationsTable(db);
      const already = await isAlreadyApplied(db, FILENAME);
      if (already) {
        console.log(`[apply-208] Zaten uygulanmış: ${db} (schema_migrations kaydı var)`);
        results.push({ db, ok: true, already: true });
        continue;
      }
      await applyOne(db, sql);
      await recordMigration(db, FILENAME);
      console.log(`[apply-208] OK: ${db}`);
      results.push({ db, ok: true, already: false });
    } catch (e) {
      console.error(`[apply-208] HATA: ${db}`, e?.message || e);
      results.push({ db, ok: false, error: e?.message || String(e) });
    }
  }

  const ok = results.filter((r) => r.ok);
  const fail = results.filter((r) => !r.ok);
  console.log(`\n[apply-208] Özet: ${ok.length} başarılı (${ok.filter((r) => r.already).length} zaten uygulanmış), ${fail.length} hatalı, ${skipped.length} atlandı`);
  if (skipped.length) {
    console.log('[apply-208] Atlanan DB:', skipped.join(', '));
  }
  if (fail.length) {
    console.log('[apply-208] Hatalı DB:', fail.map((r) => r.db).join(', '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});