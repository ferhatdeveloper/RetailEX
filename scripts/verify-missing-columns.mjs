#!/usr/bin/env node
/**
 * Eksik kolon doğrulama — kullanıcı bildirimi:
 *   - rest.rex_*_*_rest_kitchen_items.job_type
 *   - public.staff: department, position, employment_type, base_salary,
 *     hourly_rate, photo_url, rfid_card, pin_code, tc_kimlik
 *   - public.staff_shifts.color
 *
 * Her kiracı DB'de kolonun var olup olmadığını raporlar. Şifreleri loglamaz.
 */
import pg from 'pg';
import { loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';
import { isNonRetailExDatabase } from '../database/scripts/non-retailex-databases.mjs';

const def = loadRemotePgDefaults();

const admin = new pg.Client({
  host: def.host,
  port: def.port,
  user: def.user,
  password: def.password,
  database: 'postgres',
  connectionTimeoutMillis: 15000,
});
await admin.connect();
const { rows } = await admin.query(
  `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1`,
);
await admin.end();

const SKIP = new Set(['postgres', 'template0', 'template1', 'merkez_db']);
const targets = rows
  .map((r) => r.datname)
  .filter((n) => !SKIP.has(n) && !isNonRetailExDatabase(n));

console.log(`Hedef DB (${targets.length}):`, targets.join(', '));

// Kolon beklentileri: [table, column]
const STAFF_COLS = [
  ['public.staff', 'department'],
  ['public.staff', 'position'],
  ['public.staff', 'employment_type'],
  ['public.staff', 'base_salary'],
  ['public.staff', 'hourly_rate'],
  ['public.staff', 'photo_url'],
  ['public.staff', 'rfid_card'],
  ['public.staff', 'pin_code'],
  ['public.staff', 'tc_kimlik'],
  ['public.staff_shifts', 'color'],
];

// rest.rex_*_*_rest_kitchen_items.job_type — firma/dönem prefix'li tablolar
const KITCHEN_TABLE_PATTERN = `^rex_[0-9]+_[0-9]+_rest_kitchen_items$`;

const summary = [];
for (const db of targets) {
  const c = new pg.Client({
    host: def.host,
    port: def.port,
    user: def.user,
    password: def.password,
    database: db,
    connectionTimeoutMillis: 12000,
  });
  try {
    await c.connect();
    const missing = [];

    // 1) public.staff / public.staff_shifts kolonları
    for (const [table, col] of STAFF_COLS) {
      const [schema, tname] = table.split('.');
      const r = await c.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
        [schema, tname, col],
      );
      if (r.rows.length === 0) {
        missing.push(`${table}.${col}`);
      }
    }

    // 2) rest.rex_*_*_rest_kitchen_items.job_type
    // (tablo var mı ve job_type kolonu var mı?)
    const kitchenCheck = await c.query(
      `SELECT t.tablename,
              EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_schema='rest'
                   AND table_name=t.tablename
                   AND column_name='job_type'
              ) AS has_job_type
         FROM pg_tables t
        WHERE t.schemaname='rest'
          AND t.tablename ~ $1`,
      [KITCHEN_TABLE_PATTERN],
    );
    const kitchenTables = kitchenCheck.rows.length;
    const kitchenWithCol = kitchenCheck.rows.filter((r) => r.has_job_type).length;
    if (kitchenTables > 0 && kitchenTables !== kitchenWithCol) {
      const missingTables = kitchenCheck.rows
        .filter((r) => !r.has_job_type)
        .map((r) => `rest.${r.tablename}.job_type`);
      missing.push(...missingTables);
    }

    summary.push({
      db,
      kitchenTables,
      kitchenWithCol,
      missing,
    });
    await c.end();
  } catch (e) {
    summary.push({ db, error: e.message });
    try {
      await c.end();
    } catch {}
  }
}

console.log('\n=== Eksik kolon raporu ===');
let totalMissing = 0;
for (const s of summary) {
  if (s.error) {
    console.log(`SKIP ${s.db.padEnd(20)} ${s.error}`);
  } else {
    const ok = s.missing.length === 0;
    console.log(
      `${ok ? 'OK   ' : 'MISS '} ${s.db.padEnd(20)} kitchen=${s.kitchenWithCol}/${s.kitchenTables}` +
        (s.missing.length ? ` eksik=${s.missing.join(', ')}` : ''),
    );
    totalMissing += s.missing.length;
  }
}
console.log(`\nÖzet: ${totalMissing} eksik kolon (tüm kiracılar toplamı).`);
