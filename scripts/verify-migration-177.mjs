#!/usr/bin/env node
// 177_beauty_service_staff_commissions uygulamasını tüm RetailEX kiracılarında doğrular.
import pg from 'pg';
import { loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';
import { isNonRetailExDatabase } from '../database/scripts/non-retailex-databases.mjs';

const def = loadRemotePgDefaults();
const admin = new pg.Client({
  host: def.host, port: def.port, user: def.user, password: def.password,
  database: 'postgres', connectionTimeoutMillis: 15000,
});
await admin.connect();
const { rows } = await admin.query(
  `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1`
);
await admin.end();

const SKIP = new Set(['postgres', 'template0', 'template1', 'merkez_db']);
const targets = rows
  .map((r) => r.datname)
  .filter((n) => !SKIP.has(n) && !isNonRetailExDatabase(n));

console.log(`Hedef DB (${targets.length}):`, targets.join(', '));

const summary = [];
for (const db of targets) {
  const c = new pg.Client({
    host: def.host, port: def.port, user: def.user, password: def.password,
    database: db, connectionTimeoutMillis: 12000,
  });
  try {
    await c.connect();
    // Firmalara göre dinamik tablo kontrolü
    const r = await c.query(
      `WITH firms AS (
         SELECT lpad(trim(firm_nr::text), 3, '0') AS fkey
           FROM public.firms
          WHERE COALESCE(is_active, true) = true
       )
       SELECT bool_and(to_regclass('beauty.rex_' || fkey || '_service_staff_commissions') IS NOT NULL) AS all_tables,
              count(*)::int AS firm_count
         FROM firms`
    );
    const funcR = await c.query(
      `SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'upsert_service_staff_commission') AS has_upsert,
              EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delete_service_staff_commission') AS has_delete`
    );
    const migration = await c.query(
      `SELECT filename FROM public.schema_migrations WHERE filename LIKE '%177%' OR filename LIKE '%beauty_service_staff%'`
    );
    summary.push({
      db,
      firms: r.rows[0]?.firm_count || 0,
      allTables: !!r.rows[0]?.all_tables,
      upsert: funcR.rows[0]?.has_upsert || false,
      del: funcR.rows[0]?.has_delete || false,
      registered: migration.rows.map((x) => x.filename),
    });
    await c.end();
  } catch (e) {
    summary.push({ db, error: e.message });
    try { await c.end(); } catch {}
  }
}

for (const s of summary) {
  if (s.error) {
    console.log(`SKIP ${s.db}: ${s.error}`);
  } else {
    const ok = s.allTables && s.upsert && s.del && s.registered.length > 0;
    console.log(
      `${ok ? 'OK   ' : 'MISS '} ${s.db.padEnd(14)} firms=${s.firms} tables_ok=${s.allTables} upsert=${s.upsert} del=${s.del} reg=${s.registered.join(',') || '-'}`
    );
  }
}

const okCount = summary.filter((s) => s.allTables && s.upsert && s.del && s.registered.length > 0).length;
console.log(`\nÖzet: ${okCount}/${summary.length} kiracıda 177 uygulandı.`);