#!/usr/bin/env node
/**
 * retailex_demo: tüm kabuk modüllerini aç + 001_demo_data + ekstra örnek veri.
 *
 * Kullanım:
 *   PGHOST=... PGUSER=postgres PGPASSWORD=... PGDATABASE=retailex_demo \
 *     node scripts/seed-retailex-demo-full.mjs
 *
 * Opsiyonel:
 *   MERKEZ_PGDATABASE=merkez_db  — tenant_registry.module = all
 *   SKIP_001=1                   — yalnızca extras + merkez
 *   DRY_RUN=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const host = process.env.PGHOST || '127.0.0.1';
const port = Number(process.env.PGPORT || 5432);
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || '';
const database = process.env.PGDATABASE || 'retailex_demo';
const merkezDb = process.env.MERKEZ_PGDATABASE || 'merkez_db';
const dry = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
const skip001 = process.env.SKIP_001 === '1' || process.argv.includes('--skip-001');

if (!password) {
  console.error('PGPASSWORD gerekli');
  process.exit(1);
}

function runPsql(db, filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Dosya yok: ${abs}`);
  }
  if (dry) {
    console.log(`[dry-run] psql -d ${db} -f ${abs}`);
    return;
  }
  const r = spawnSync(
    'psql',
    ['-h', host, '-p', String(port), '-U', user, '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', abs],
    {
      env: { ...process.env, PGPASSWORD: password, PGOPTIONS: '-c client_min_messages=warning' },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`psql başarısız (${db}): ${abs} exit=${r.status}`);
  }
}

async function withClient(db, fn) {
  const client = new pg.Client({ host, port, user, password, database: db });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function unlockMerkez() {
  const alterSql = path.join(root, 'database/scripts/merkez_tenant_registry_allow_module_all.sql');
  runPsql(merkezDb, alterSql);
}

async function shouldApply001(client) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM public.rex_001_products WHERE code = 'PHONE-001'`,
  );
  return (rows[0]?.n ?? 0) === 0;
}

function preparePatched001() {
  const demoSql = path.join(root, 'database/migrations/001_demo_data.sql');
  let sql = fs.readFileSync(demoSql, 'utf8');
  // Stok UPDATE'leri tekrar çalışınca bakiyeyi bozar — atla
  sql = sql.replace(
    /-- =+\n-- 10\. DEMO STOK GÜNCELLEMELERİ[\s\S]*?(?=-- =+\n-- 11\. WMS)/m,
    '-- 10. DEMO STOK GÜNCELLEMELERİ — seed-retailex-demo-full: atlandı (idempotent)\n\n',
  );
  const tmp = path.join(root, 'database/scripts/.tmp-001-demo-no-stock.sql');
  fs.writeFileSync(tmp, sql, 'utf8');
  return tmp;
}

async function printCounts(client) {
  const checks = [
    ['products', `SELECT count(*) FROM rex_001_products`],
    ['customers', `SELECT count(*) FROM rex_001_customers`],
    ['suppliers', `SELECT count(*) FROM rex_001_suppliers`],
    ['sales', `SELECT count(*) FROM rex_001_01_sales`],
    ['cash_lines', `SELECT count(*) FROM rex_001_01_cash_lines`],
    ['bank_reg', `SELECT count(*) FROM rex_001_bank_registers`],
    ['bank_lines', `SELECT count(*) FROM rex_001_01_bank_lines`],
    ['campaigns', `SELECT count(*) FROM rex_001_campaigns`],
    ['rest_tables', `SELECT count(*) FROM rest.rex_001_rest_tables`],
    ['rest_staff', `SELECT count(*) FROM rest.rex_001_rest_staff`],
    ['beauty_svc', `SELECT count(*) FROM beauty.rex_001_beauty_services`],
    ['beauty_appt', `SELECT count(*) FROM beauty.rex_001_01_beauty_appointments`],
    ['wms_count', `SELECT count(*) FROM wms.counting_slips WHERE firm_nr='001'`],
    ['wms_recv', `SELECT count(*) FROM wms.receiving_slips WHERE firm_nr='001'`],
    ['logistics_dlv', `SELECT count(*) FROM logistics.deliveries WHERE firm_nr='001'`],
    ['eticaret', `SELECT count(*) FROM eticaret_web_orders WHERE tenant_code='demo'`],
    ['butcher', `SELECT count(*) FROM rex_001_butcher_recipes WHERE firm_nr='001'`],
    ['menu_presets', `SELECT COALESCE(jsonb_array_length(menu_preferences->'presets'),0) FROM system_settings WHERE id=1`],
  ];
  const out = {};
  for (const [k, q] of checks) {
    try {
      const { rows } = await client.query(q);
      out[k] = rows[0]?.count ?? rows[0]?.coalesce ?? Object.values(rows[0] || {})[0];
    } catch (e) {
      out[k] = `ERR: ${e.message}`;
    }
  }
  console.log('[doğrulama]', out);
}

async function main() {
  console.log(`[seed] hedef ${host}:${port}/${database}`);
  await unlockMerkez();

  if (skip001) {
    console.log('[demo] SKIP_001 — 001 atlandı');
  } else {
    const hasPhone = await withClient(database, async (client) => !(await shouldApply001(client)));
    if (hasPhone) {
      console.log('[demo] PHONE-001 mevcut — 001 yine uygulanır (ON CONFLICT / NOT EXISTS)');
    }
    const patched = preparePatched001();
    try {
      console.log('[demo] 001_demo_data.sql (stok update yok)...');
      runPsql(database, patched);
    } finally {
      try {
        fs.unlinkSync(patched);
      } catch {
        /* ignore */
      }
    }
  }

  const extras = path.join(root, 'database/scripts/seed-retailex-demo-full-extras.sql');
  runPsql(database, extras);

  if (!dry) {
    await withClient(database, printCounts);
  }
  console.log('[seed] tamam');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
