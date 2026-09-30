#!/usr/bin/env node
/**
 * Migration 183 — Eksik şema kolonları (canlı sistem hata düzeltmeleri)
 *
 * TÜM RetailEX tenant DB'lerinde şu işlemleri yapar:
 *
 * 1) public.rex_<firmNr>_<periodNr>_sales
 *      → paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0 EKLE
 *      → eski satırlarda: paid_amount = total_gross − credit_amount
 *      → credit_amount zaten master şemada VAR, bu migration geriye
 *        dönük uyumlu doldurma yapar.
 *
 * 2) beauty.rex_<firmNr>_<periodNr>_beauty_sales
 *      → currency VARCHAR(10) NOT NULL DEFAULT 'IQD' EKLE
 *      → master şema eklendi ama eski CREATE TABLE IF NOT EXISTS
 *        yeni kurulumda bile sıfır kurulumda yoktu.
 *
 * 3) beauty.rex_<firmNr>_service_staff_commissions
 *      → Bazı tenant'larda INIT_BEAUTY_FIRM_TABLES çağrılmamış
 *        (kısmi kurulum, erken kurulum, snapshot). Bu tablo
 *        PostgREST 400 + komisyon sorgularını kırıyor.
 *      → Eksikse CREATE TABLE; INIT_BEAUTY_FIRM_TABLES ile bire bir.
 *
 * Hariç tutulanlar: NON_RETAILEX_DATABASES + finpos_crm + merkez_db
 * (boş kabuk; rex_ tabloları yok).
 *
 * Kullanım:
 *   node database/scripts/apply-missing-columns-183.mjs                 # dry-run
 *   node database/scripts/apply-missing-columns-183.mjs --apply         # uygula
 *   node database/scripts/apply-missing-columns-183.mjs --apply --host ... --user ... --port 5432 --database retailex_demo
 *
 * Notlar:
 *   - Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS
 *   - DO $$ ... $$ YOK (Tauri Rust parser uyumu)
 *   - Her ALTER/CREATE ayrı transaction'da (kısmi başarı kabul)
 */

import { Client } from 'pg';
import { NON_RETAILEX_DATABASES } from './non-retailex-databases.mjs';

const HOST = process.env.PGHOST || '72.60.182.107';
const PORT = parseInt(process.env.PGPORT || '5432', 10);
const USER = process.env.PGUSER || 'postgres';
const PASSWORD = process.env.PGPASSWORD || '';
const DEFAULT_DB = process.env.PGDATABASE || 'retailex_demo';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const argMap = (key) => {
  const idx = argv.indexOf(key);
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : null;
};
const HOST_OVERRIDE = argMap('--host');
const PORT_OVERRIDE = argMap('--port');
const USER_OVERRIDE = argMap('--user');
const PASSWORD_OVERRIDE = argMap('--password');
const DB_OVERRIDE = argMap('--database');

// finpos_crm + merkez_db: schema yok (public.users/rex_* tablosu boş),
// RetailEX ERP kiracısı değil. NON_RETAILEX_DATABASES ile senkron.
const ADDITIONAL_SKIP = ['finpos_crm', 'merkez_db', 'pdks_demo'];

const pgConfig = {
  host: HOST_OVERRIDE || HOST,
  port: parseInt(PORT_OVERRIDE || PORT, 10),
  user: USER_OVERRIDE || USER,
  password: PASSWORD_OVERRIDE || PASSWORD,
  database: DB_OVERRIDE || DEFAULT_DB,
  connectionTimeoutMillis: 15000,
};

const log = (msg, color = '') => {
  const c = color || '';
  const r = c ? '\x1b[0m' : '';
  console.log(`${c}${msg}${r}`);
};

const COLORS = { red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m', gray: '\x1b[90m' };

async function listDatabases(client) {
  const r = await client.query(`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;`);
  return r.rows.map((row) => row.datname);
}

async function listTables(client, schemaPattern, tablePattern) {
  const r = await client.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_schema LIKE $1
        AND table_name LIKE $2
      ORDER BY table_schema, table_name`,
    [schemaPattern, tablePattern]
  );
  return r.rows;
}

async function columnExists(client, schema, table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1`,
    [schema, table, column]
  );
  return r.rowCount > 0;
}

async function listFirmsAndPeriods(client) {
  // rex_<firmNr>_<periodNr>_sales tablosu varsa ondan firm/period çıkar.
  // Yoksa schema_migrations / tenant_registry'ye düşme (basit yaklaşım).
  const r = await client.query(
    `SELECT DISTINCT
        substring(table_name FROM '^rex_([0-9]+)_([0-9]+)_sales$') AS fp
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name ~ '^rex_[0-9]+_[0-9]+_sales$'
      ORDER BY fp`
  );
  const out = [];
  for (const row of r.rows) {
    const m = row.fp && row.fp.match(/^(\d+)_(\d+)$/);
    if (m) out.push({ firmNr: m[1], periodNr: m[2] });
  }
  return out;
}

async function listFirms(client) {
  const r = await client.query(
    `SELECT DISTINCT
        substring(table_name FROM '^rex_([0-9]+)_beauty_services$') AS f
       FROM information_schema.tables
      WHERE table_schema = 'beauty'
        AND table_name ~ '^rex_[0-9]+_beauty_services$'
      ORDER BY f`
  );
  const out = [];
  for (const row of r.rows) {
    const m = row.f && row.f.match(/^(\d+)$/);
    if (m) out.push(m[1]);
  }
  return out;
}

async function ensureSalesPaidAmount(client, firmNr, periodNr, dry) {
  const table = `rex_${firmNr}_${periodNr}_sales`;
  const schema = 'public';
  const hasCol = await columnExists(client, schema, table, 'paid_amount');
  if (hasCol) return { ok: true, skipped: true };
  const ddl = `ALTER TABLE ${schema}.${table}
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0`;
  if (dry) return { ok: true, skipped: false, ddl };
  await client.query(ddl);
  // Geriye dönük doldurma
  const upd = `UPDATE ${schema}.${table}
                  SET paid_amount = GREATEST(0, COALESCE(total_gross, 0) - COALESCE(credit_amount, 0))
                WHERE paid_amount = 0
                  AND (COALESCE(total_gross, 0) - COALESCE(credit_amount, 0)) > 0.005`;
  await client.query(upd);
  return { ok: true, skipped: false, ddl, upd };
}

async function ensureBeautySalesCurrency(client, firmNr, periodNr, dry) {
  const table = `rex_${firmNr}_${periodNr}_beauty_sales`;
  const schema = 'beauty';
  // Tablo yoksa önce INIT_BEAUTY_PERIOD_TABLES çağrılmamış demektir; bu tenant
  // için güzellik hiç başlatılmamış — atla.
  const t = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table]
  );
  if (t.rowCount === 0) return { ok: true, skipped: true, reason: 'beauty_sales tablosu yok — INIT_BEAUTY_PERIOD_TABLES gerekli' };
  const hasCol = await columnExists(client, schema, table, 'currency');
  if (hasCol) return { ok: true, skipped: true };
  const ddl = `ALTER TABLE ${schema}.${table}
    ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'IQD'`;
  if (dry) return { ok: true, skipped: false, ddl };
  await client.query(ddl);
  return { ok: true, skipped: false, ddl };
}

async function ensureStaffCommissions(client, firmNr, dry) {
  const table = `rex_${firmNr}_service_staff_commissions`;
  const schema = 'beauty';
  // beauty_specialists + beauty_services referansları var mı?
  const refs = await client.query(
    `SELECT
        (SELECT 1 FROM information_schema.tables WHERE table_schema='beauty' AND table_name=$1 LIMIT 1) AS has_services,
        (SELECT 1 FROM information_schema.tables WHERE table_schema='beauty' AND table_name=$2 LIMIT 1) AS has_specialists`,
    [`rex_${firmNr}_beauty_services`, `rex_${firmNr}_beauty_specialists`]
  );
  if (refs.rows[0].has_services !== 1 || refs.rows[0].has_specialists !== 1) {
    return { ok: true, skipped: true, reason: 'beauty_services veya beauty_specialists tablosu yok' };
  }
  const t = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table]
  );
  if (t.rowCount > 0) return { ok: true, skipped: true };
  const ddl = `CREATE TABLE IF NOT EXISTS ${schema}.${table} (
    service_id UUID NOT NULL REFERENCES ${schema}.rex_${firmNr}_beauty_services(id) ON DELETE CASCADE,
    staff_id   UUID NOT NULL REFERENCES ${schema}.rex_${firmNr}_beauty_specialists(id) ON DELETE CASCADE,
    percent    NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percent >= 0 AND percent <= 100),
    is_active  BOOLEAN NOT NULL DEFAULT true,
    notes      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (service_id, staff_id)
  )`;
  const idx = `CREATE INDEX IF NOT EXISTS rex_${firmNr}_service_staff_commissions_srv_active_idx
    ON ${schema}.${table} (service_id) WHERE is_active = true`;
  if (dry) return { ok: true, skipped: false, ddl, idx };
  await client.query(ddl);
  await client.query(idx);
  return { ok: true, skipped: false, ddl, idx };
}

async function applyToDatabase(client, dbName, dry) {
  log(`\n=== ${dbName} ===`, COLORS.cyan);
  if (NON_RETAILEX_DATABASES.includes(dbName) || ADDITIONAL_SKIP.includes(dbName)) {
    log(`  [SKIP] RetailEX kiracı veritabanı değil (hariç liste)`, COLORS.gray);
    return { db: dbName, status: 'skipped', reason: 'non-retailex' };
  }
  // Önce tablo var mı kontrolü
  const probe = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'rex_001_01_sales' LIMIT 1`
  );
  if (probe.rowCount === 0) {
    log(`  [SKIP] public.rex_001_01_sales yok — bu DB RetailEX ERP kiracısı değil`, COLORS.gray);
    return { db: dbName, status: 'skipped', reason: 'no-rex-tables' };
  }
  const fps = await listFirmsAndPeriods(client);
  const firms = await listFirms(client);
  if (fps.length === 0 && firms.length === 0) {
    log(`  [SKIP] rex_* tablosu yok`, COLORS.gray);
    return { db: dbName, status: 'skipped', reason: 'empty' };
  }
  log(`  firm/period: ${fps.length} • beauty firm: ${firms.length}`, COLORS.gray);
  let changes = 0;
  let skipped = 0;
  for (const fp of fps) {
    const r = await ensureSalesPaidAmount(client, fp.firmNr, fp.periodNr, dry);
    if (r.skipped) skipped++; else changes++;
    if (!r.skipped) log(`    sales.${fp.firmNr}_${fp.periodNr}.paid_amount: ALTER ✅`, COLORS.green);
    const r2 = await ensureBeautySalesCurrency(client, fp.firmNr, fp.periodNr, dry);
    if (r2.skipped) skipped++; else changes++;
    if (!r2.skipped) log(`    beauty_sales.${fp.firmNr}_${fp.periodNr}.currency: ALTER ✅`, COLORS.green);
    else if (r2.reason) log(`    beauty_sales.${fp.firmNr}_${fp.periodNr}: [SKIP] ${r2.reason}`, COLORS.gray);
  }
  for (const f of firms) {
    const r = await ensureStaffCommissions(client, f, dry);
    if (r.skipped) skipped++; else changes++;
    if (!r.skipped) log(`    service_staff_commissions.${f}: CREATE ✅`, COLORS.green);
    else if (r.reason) log(`    service_staff_commissions.${f}: [SKIP] ${r.reason}`, COLORS.gray);
  }
  log(`  [${dry ? 'DRY' : 'APPLY'}] changes=${changes}, skipped=${skipped}`, COLORS.yellow);
  return { db: dbName, status: 'done', changes, skipped };
}

async function main() {
  if (!PASSWORD && !PASSWORD_OVERRIDE && !process.env.PGPASSWORD) {
    log('PGPASSWORD gerekli (env, --password veya ortam değişkeni).', COLORS.red);
    process.exit(2);
  }
  log(`\n[Migration 183] RetailEX eksik kolon düzeltici`, COLORS.cyan);
  log(`Host: ${pgConfig.host}:${pgConfig.port} • DB: ${pgConfig.database} • Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  const client = new Client(pgConfig);
  await client.connect();
  let databases;
  try {
    databases = await listDatabases(client);
  } catch (err) {
    log(`pg_database okunamadı: ${err?.message || err}`, COLORS.red);
    await client.end().catch(() => {});
    process.exit(2);
  }
  log(`Taranacak DB sayısı: ${databases.length}`);
  const results = [];
  for (const db of databases) {
    try {
      const r = await applyToDatabase(client, db, !APPLY);
      results.push(r);
    } catch (err) {
      log(`  [ERROR] ${err?.message || err}`, COLORS.red);
      results.push({ db, status: 'error', error: err?.message || String(err) });
    }
  }
  await client.end();
  // Özet
  log('\n=== Özet ===', COLORS.cyan);
  let totalChanges = 0;
  let totalErrors = 0;
  for (const r of results) {
    if (r.status === 'done') {
      totalChanges += r.changes || 0;
    }
    if (r.status === 'error') totalErrors++;
  }
  log(`Toplam değişiklik: ${totalChanges}`);
  log(`Toplam hata: ${totalErrors}`);
  log(`Mode: ${APPLY ? 'APPLY (uygulandı)' : 'DRY-RUN (sadece rapor)'}`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`Beklenmeyen hata: ${err?.message || err}`, COLORS.red);
  process.exit(2);
});