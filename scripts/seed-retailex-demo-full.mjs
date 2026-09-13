#!/usr/bin/env node
/**
 * retailex_demo: kabuk (WMS/mobile-pos pasif) + 001_demo_data + firma ayrımı + restoran Excel.
 *
 * Firmalar:
 *   001 Demo Market   — pos + management (varyant ürün yok)
 *   010 Demo Restoran — restaurant + pos (+ yemekcom Excel menü)
 *   020 Demo Güzellik — beauty
 *   030 Demo Varyant  — pos + management (TSHIRT-VAR / PHONE-VAR)
 *
 * Kullanım:
 *   PGHOST=... PGUSER=postgres PGPASSWORD=... PGDATABASE=retailex_demo \
 *     node scripts/seed-retailex-demo-full.mjs
 *
 * Opsiyonel:
 *   MERKEZ_PGDATABASE=merkez_db  — tenant_registry.module = all
 *   SKIP_001=1                   — 001_demo_data atla
 *   SKIP_EXCEL=1                 — restoran Excel menü atla
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
const skipExcel = process.env.SKIP_EXCEL === '1' || process.argv.includes('--skip-excel');

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

function runNode(scriptRel) {
  const abs = path.join(root, scriptRel);
  if (dry) {
    console.log(`[dry-run] node ${scriptRel}`);
    return;
  }
  const r = spawnSync(process.execPath, [abs], {
    env: {
      ...process.env,
      PGPASSWORD: password,
      PGHOST: host,
      PGPORT: String(port),
      PGUSER: user,
      PGDATABASE: database,
    },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`node başarısız: ${scriptRel} exit=${r.status}`);
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
    [
      'firms',
      `SELECT string_agg(firm_nr || ':' || name || '/' || coalesce(enabled_modules::text,'null'), ', ' ORDER BY firm_nr) FROM firms WHERE firm_nr IN ('001','010','020','030')`,
    ],
    ['p001', `SELECT count(*) FROM rex_001_products`],
    ['p001_var', `SELECT count(*) FROM rex_001_products WHERE has_variants OR code LIKE '%-VAR'`],
    ['p030', `SELECT count(*) FROM rex_030_products`],
    ['p030_var', `SELECT count(*) FROM rex_030_product_variants`],
    ['p010', `SELECT count(*) FROM rex_010_products`],
    ['p020_cust', `SELECT count(*) FROM rex_020_customers`],
    ['rest_tables', `SELECT count(*) FROM rest.rex_010_rest_tables`],
    ['beauty_svc', `SELECT count(*) FROM beauty.rex_020_beauty_services`],
    ['beauty_appt', `SELECT count(*) FROM beauty.rex_020_01_beauty_appointments`],
    ['menu_on_001', `SELECT count(*) FROM rex_001_products WHERE code LIKE 'MENU-%'`],
  ];
  const out = {};
  for (const [k, q] of checks) {
    try {
      const { rows } = await client.query(q);
      out[k] = rows[0]?.count ?? rows[0]?.string_agg ?? Object.values(rows[0] || {})[0];
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

  console.log('[demo] modül firmaları 001/010/020/030...');
  runPsql(database, path.join(root, 'database/scripts/seed-retailex-demo-module-firms.sql'));

  if (skipExcel) {
    console.log('[demo] SKIP_EXCEL — restoran menü atlandı');
  } else {
    console.log('[demo] restoran Excel → firma 010...');
    runNode('scripts/seed-retailex-demo-restaurant-from-excel.mjs');
  }

  if (!dry) {
    await withClient(database, printCounts);
  }
  console.log('[seed] tamam');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
