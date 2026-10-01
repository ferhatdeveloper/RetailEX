#!/usr/bin/env node
/**
 * Tüm RetailEX tenant DB'lerdeki public.schema_migrations tablosundan
 * son migration dosyalarını (180-186 arası) listeler.
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
  return new pg.Client({ host, port, user, password, database, connectionTimeoutMillis: 15000 });
}

(async () => {
  const c = client(maintenanceDb);
  await c.connect();
  const { rows } = await c.query(`
    SELECT datname FROM pg_database
    WHERE datistemplate=false AND datallowconn ORDER BY datname`);
  await c.end();
  const dbs = filterRetailExDatabases(
    rows.map(r => r.datname).filter(n => !['postgres','template0','template1','merkez_db'].includes(n))
  );
  console.log('DB'.padEnd(22) + '180  181  182  183  184  185  186');
  console.log('-'.repeat(60));
  for (const db of dbs) {
    const cc = client(db);
    await cc.connect();
    try {
      const r = await cc.query(`
        SELECT filename FROM public.schema_migrations
        WHERE filename ~ '^(180|181|182|183|184|185|186)_'
      `);
      const set = new Set(r.rows.map(x => x.filename));
      const mark = n => set.has(`${n}_${
        {180:'opening_invoice_unique_per_product',181:'beauty_appointment_pre_payment',
         182:'pesinat_sale_link',183:'missing_columns_for_runtime',
         184:'appointment_deposit_sale_link',185:'pdks_aqua_excel_import',
         186:'cash_lines_back_dated'}[n]
      }.sql`) ? ' ✓' : ' ·';
      console.log(db.padEnd(22) + '180'+mark(180)+' 181'+mark(181)+' 182'+mark(182)+' 183'+mark(183)+' 184'+mark(184)+' 185'+mark(185)+' 186'+mark(186));
    } catch (e) {
      console.log(db.padEnd(22) + ' HATA: ' + (e?.message || e).slice(0,60));
    } finally {
      await cc.end().catch(()=>{});
    }
  }
})().catch(e => { console.error(e?.message || e); process.exit(1); });
