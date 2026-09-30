#!/usr/bin/env node
/**
 * Migration 184 — Beauty Appointment + Deposit/Sale bağlantı kolonları
 *
 * TÜM RetailEX tenant DB'lerinde şu işlemleri yapar:
 *
 * 1) beauty.rex_<firmNr>_<periodNr>_beauty_appointments
 *      → deposit_sale_id        UUID         (peşinat sales fişi)
 *      → deposit_sale_fiche_no  TEXT         (BEAUTY-PESINAT-... no)
 *      → sale_group_id          TEXT         (peşinat + ana satışı gruplar)
 *      → remainder_paid_amount  NUMERIC(15,2) NOT NULL DEFAULT 0
 *
 * 2) beauty.rex_<firmNr>_<periodNr>_beauty_appointments (indeksler):
 *      → <tbl>_deposit_idx (deposit_sale_id)
 *      → <tbl>_group_idx   (sale_group_id)
 *
 * Hariç tutulanlar: NON_RETAILEX_DATABASES + finpos_crm + merkez_db + pdks_demo.
 *
 * Kullanım:
 *   node database/scripts/apply-appointment-deposit-link-184.mjs           # dry-run
 *   node database/scripts/apply-appointment-deposit-link-184.mjs --apply   # uygula
 *
 * Notlar:
 *   - Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS
 *   - DO $$ ... $$ YOK (Tauri Rust parser uyumu)
 *   - Her ALTER/CREATE ayrı statement (kısmi başarı kabul)
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

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

async function listDatabases(client) {
  const r = await client.query(
    `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;`,
  );
  return r.rows.map((row) => row.datname);
}

async function columnExists(client, schema, table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 LIMIT 1`,
    [schema, table, column],
  );
  return r.rowCount > 0;
}

async function indexExists(client, schema, indexName) {
  const r = await client.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2 LIMIT 1`,
    [schema, indexName],
  );
  return r.rowCount > 0;
}

async function listAppointmentTables(client) {
  const r = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'beauty'
        AND table_name ~ '^rex_[0-9]+_[0-9]+_beauty_appointments$'
      ORDER BY table_name`,
  );
  return r.rows.map((row) => row.table_name);
}

const REQUIRED_COLUMNS = [
  { name: 'deposit_sale_id', ddl: 'UUID' },
  { name: 'deposit_sale_fiche_no', ddl: 'TEXT' },
  { name: 'sale_group_id', ddl: 'TEXT' },
  { name: 'remainder_paid_amount', ddl: 'NUMERIC(15,2) NOT NULL DEFAULT 0' },
];

async function ensureAppointmentColumns(client, tableName, dry) {
  const out = { changes: 0, skipped: 0, errors: [] };
  for (const col of REQUIRED_COLUMNS) {
    const exists = await columnExists(client, 'beauty', tableName, col.name);
    if (exists) {
      out.skipped += 1;
      continue;
    }
    const ddl = `ALTER TABLE beauty.${tableName} ADD COLUMN IF NOT EXISTS ${col.name} ${col.ddl}`;
    if (dry) {
      log(`    ${tableName}.${col.name}: ALTER (dry)`, COLORS.yellow);
      out.changes += 1;
      continue;
    }
    try {
      await client.query(ddl);
      log(`    ${tableName}.${col.name}: ALTER ✅`, COLORS.green);
      out.changes += 1;
    } catch (e) {
      log(`    [ERROR] ${tableName}.${col.name}: ${e.message}`, COLORS.red);
      out.errors.push(e.message);
    }
  }
  // İndeksler
  const idxNames = [
    `${tableName}_deposit_idx`,
    `${tableName}_group_idx`,
  ];
  for (const idx of idxNames) {
    const col = idx.endsWith('deposit_idx') ? 'deposit_sale_id' : 'sale_group_id';
    const exists = await indexExists(client, 'beauty', idx);
    if (exists) {
      out.skipped += 1;
      continue;
    }
    const ddl = `CREATE INDEX IF NOT EXISTS ${idx} ON beauty.${tableName} (${col})`;
    if (dry) {
      log(`    ${idx}: CREATE (dry)`, COLORS.yellow);
      out.changes += 1;
      continue;
    }
    try {
      await client.query(ddl);
      log(`    ${idx}: CREATE ✅`, COLORS.green);
      out.changes += 1;
    } catch (e) {
      log(`    [ERROR] ${idx}: ${e.message}`, COLORS.red);
      out.errors.push(e.message);
    }
  }
  return out;
}

async function main() {
  if (!PASSWORD && !PASSWORD_OVERRIDE && !process.env.PGPASSWORD) {
    log('PGPASSWORD gerekli (env, --password veya ortam değişkeni).', COLORS.red);
    process.exit(2);
  }
  log(`\n[Migration 184] Beauty appointment + deposit/sale bağlantı kolonları`, COLORS.cyan);
  log(`Mode: ${APPLY ? 'APPLY (uygulandı)' : 'DRY-RUN (sadece rapor)'}`, COLORS.yellow);

  const adminClient = new Client(pgConfig);
  await adminClient.connect();
  const databases = await listDatabases(adminClient);
  await adminClient.end();

  let totalChanges = 0;
  let totalErrors = 0;
  let totalSkipped = 0;

  for (const db of databases) {
    log(`\n=== ${db} ===`, COLORS.cyan);
    if (NON_RETAILEX_DATABASES.includes(db) || ADDITIONAL_SKIP.includes(db)) {
      log('  [SKIP] RetailEX kiracı veritabanı değil (hariç liste)', COLORS.gray);
      continue;
    }
    const dbConfig = { ...pgConfig, database: db };
    const client = new Client(dbConfig);
    try {
      await client.connect();
      const tables = await listAppointmentTables(client);
      if (tables.length === 0) {
        log('  [SKIP] appointments tablosu yok (beauty hiç başlatılmamış)', COLORS.gray);
        await client.end();
        continue;
      }
      log(`  appointments tablo: ${tables.length}`, COLORS.gray);
      for (const t of tables) {
        const r = await ensureAppointmentColumns(client, t, !APPLY);
        totalChanges += r.changes;
        totalSkipped += r.skipped;
        totalErrors += r.errors.length;
      }
      log(`  [${APPLY ? 'APPLY' : 'DRY'}] changes=${totalChanges}, skipped=${totalSkipped}, errors=${totalErrors}`,
        COLORS.yellow);
      await client.end();
    } catch (e) {
      log(`  [ERROR] DB bağlantı: ${e.message}`, COLORS.red);
      totalErrors += 1;
    }
  }

  log(`\n=== Özet ===`, COLORS.cyan);
  log(`Toplam değişiklik: ${totalChanges}`);
  log(`Toplam hata: ${totalErrors}`);
  log(`Mode: ${APPLY ? 'APPLY (uygulandı)' : 'DRY-RUN (sadece rapor)'}`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((e) => {
  log(`FATAL: ${e.message}`, COLORS.red);
  console.error(e);
  process.exit(1);
});