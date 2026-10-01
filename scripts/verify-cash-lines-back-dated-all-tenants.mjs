#!/usr/bin/env node
/**
 * Tüm RetailEX tenant DB'lerinde `is_back_dated` kolonunun cash_lines tablolarında
 * var olup olmadığını doğrular ve özet tablo basar.
 *
 * Hariç liste: database/scripts/non-retailex-databases.mjs ile aynı.
 */
import pg from 'pg';
import { loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';
import { filterRetailExDatabases } from '../database/scripts/non-retailex-databases.mjs';

const defaults = loadRemotePgDefaults();
const host = process.env.PGHOST || defaults.host;
const port = Number(process.env.PGPORT || defaults.port);
const user = process.env.PGUSER || defaults.user;
const password = process.env.PGPASSWORD || defaults.password;
const maintenanceDb = process.env.PG_MAINTENANCE_DATABASE || 'postgres';

function client(database) {
  return new pg.Client({
    host, port, user, password, database,
    connectionTimeoutMillis: 15000,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
}

async function listDatabases() {
  const c = client(maintenanceDb);
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT datname FROM pg_database
      WHERE datistemplate = false AND datallowconn
      ORDER BY datname
    `);
    return filterRetailExDatabases(
      rows.map(r => r.datname).filter(n => !['postgres', 'template0', 'template1', 'merkez_db'].includes(n))
    );
  } finally {
    await c.end().catch(() => {});
  }
}

async function inspect(db) {
  const c = client(db);
  await c.connect();
  try {
    const tabs = await c.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND (tablename ~ '^rex_[0-9]+_cash_lines$' OR tablename ~ '^rex_[0-9]+_[0-9]+_cash_lines$')
      ORDER BY tablename
    `);
    const total = tabs.rows.length;
    let withCol = 0;
    const missing = [];
    for (const t of tabs.rows) {
      const col = await c.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name='is_back_dated'
      `, [t.tablename]);
      if (col.rowCount > 0) withCol++;
      else missing.push(t.tablename);
    }
    return { db, total, withCol, missing };
  } finally {
    await c.end().catch(() => {});
  }
}

(async () => {
  const dbs = await listDatabases();
  console.log(`\n=== RetailEX tenant DB: ${dbs.length} ===`);
  console.log('DB'.padEnd(24) + 'cash_lines'.padStart(11) + 'is_back_dated'.padStart(15) + '  eksik');
  console.log('-'.repeat(80));
  let grandTotal = 0, grandWith = 0;
  const failDb = [];
  for (const db of dbs) {
    try {
      const r = await inspect(db);
      grandTotal += r.total;
      grandWith += r.withCol;
      const missingTxt = r.missing.length ? r.missing.join(',') : '—';
      const okMark = (r.total === r.withCol && r.total > 0) ? '✓' : (r.total === 0 ? '∅' : '✗');
      console.log(
        `${okMark} ${db.padEnd(22)}` +
        String(r.total).padStart(11) +
        String(r.withCol).padStart(15) +
        `  ${missingTxt}`
      );
      if (r.total > 0 && r.total !== r.withCol) failDb.push(r);
    } catch (e) {
      console.log(`✗ ${db.padEnd(22)} HATA: ${e?.message || e}`);
      failDb.push({ db, total: 0, withCol: 0, missing: [String(e?.message || e)] });
    }
  }
  console.log('-'.repeat(80));
  console.log(`TOPLAM: ${grandTotal} cash_lines tablosu, ${grandWith} is_back_dated kolonlu`);
  if (failDb.length) {
    console.log('\nEksik/başarısız:', failDb.map(f => f.db).join(', '));
    process.exit(1);
  }
})().catch(e => { console.error(e?.message || e); process.exit(1); });
