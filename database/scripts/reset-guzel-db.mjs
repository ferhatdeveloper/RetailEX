#!/usr/bin/env node
/**
 * guzel DB Sıfırlama
 *
 * DİKKAT: Bu script GERİ DÖNÜŞÜMSÜZ!
 * Önce:  PGPASSWORD='...' node database/scripts/backup-guzel-db.mjs
 *
 * 1. Tüm şemaları DROP (auth, beauty, wms, rest, public.tables)
 *    (public şeması Postgres default olduğu için sadece tabloları DROP)
 * 2. master schema + auth kolonları yükle
 *
 * Kullanım:
 *   node database/scripts/reset-guzel-db.mjs              # dry-run
 *   node database/scripts/reset-guzel-db.mjs --apply      # gerçekten sıfırla
 */

import { Client } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const HOST = process.env.PGHOST || '72.60.182.107';
const PORT = parseInt(process.env.PGPORT || '5432', 10);
const USER = process.env.PGUSER || 'postgres';
const PASSWORD = process.env.PGPASSWORD || '';
const DB = process.env.PGDATABASE || 'guzel';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');

if (!PASSWORD) {
  console.error('PGPASSWORD gerekli (env).');
  process.exit(2);
}

const MASTER_SCHEMA = resolve('database/migrations/000_master_schema.sql');
const DEMO_DATA = resolve('database/migrations/001_demo_data.sql');

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
};
const log = (m, c = '') => console.log(`${c}${m}${c ? COLORS.reset : ''}`);

const pgConfig = {
  host: HOST, port: PORT, user: USER, password: PASSWORD, database: DB,
  connectionTimeoutMillis: 15000,
};

async function listSchemasAndTables(client) {
  // Sadece bilinen RetailEX şemaları + public'in kendi tabloları
  const schemas = await client.query(
    `SELECT n.nspname
       FROM pg_namespace n
      WHERE n.nspname IN ('public','auth','beauty','wms','rest','logic')
      ORDER BY n.nspname`,
  );
  const out = {};
  for (const r of schemas.rows) {
    const t = await client.query(
      `SELECT c.relname AS name
         FROM pg_class c
         JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = $1 AND c.relkind IN ('r','p')`,
      [r.nspname],
    );
    out[r.nspname] = t.rows.map(x => x.name);
  }
  return out;
}

async function main() {
  log(`\n[guzel RESET] DB: ${DB} @ ${HOST}:${PORT}`, COLORS.cyan);
  log(`Mode: ${APPLY ? 'APPLY (GERİ DÖNÜŞÜMSÜZ!)' : 'DRY-RUN'}`, COLORS.yellow);

  if (!APPLY) {
    log('  (--apply vermeden sadece rapor)', COLORS.gray);
  }

  const c = new Client(pgConfig);
  await c.connect();

  const target = await listSchemasAndTables(c);
  log('\nMevcut şema/tablo durumu:', COLORS.cyan);
  for (const [sch, tbls] of Object.entries(target)) {
    log(`  ${sch}: ${tbls.length} tablo`, COLORS.gray);
    tbls.forEach(t => log(`    - ${sch}.${t}`, COLORS.gray));
  }

  if (!APPLY) {
    await c.end();
    log('\nDRY-RUN bitti. Gerçekten sıfırlamak için --apply ekleyin.', COLORS.yellow);
    process.exit(0);
  }

  log('\n[Sıfırla] DROP başlıyor...', COLORS.red);
  for (const sch of Object.keys(target).reverse()) {
    try {
      if (sch === 'public') {
        // public için: tüm tabloları cascade ile düşür, sonra şema bırak
        for (const t of target[sch]) {
          await c.query(`DROP TABLE IF EXISTS public."${t}" CASCADE`);
        }
      } else {
        await c.query(`DROP SCHEMA IF EXISTS "${sch}" CASCADE`);
      }
      log(`  ${sch} ✅ dropped`, COLORS.green);
    } catch (e) {
      log(`  ${sch} ❌ ${e.message}`, COLORS.red);
    }
  }

  log('\n[Sıfırla] master schema yükleniyor...', COLORS.cyan);
  if (!existsSync(MASTER_SCHEMA)) {
    log(`  ❌ master schema yok: ${MASTER_SCHEMA}`, COLORS.red);
    await c.end();
    process.exit(1);
  }
  const sql = readFileSync(MASTER_SCHEMA, 'utf8');
  try {
    await c.query(sql);
    log('  master schema ✅', COLORS.green);
  } catch (e) {
    log(`  ❌ master hata: ${e.message}`, COLORS.red);
    await c.end();
    process.exit(1);
  }

  log('[Sıfırla] auth.users kolonları ekleniyor...', COLORS.cyan);
  try {
    await c.query(`ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data JSONB DEFAULT '{}'`);
    await c.query(`ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password TEXT`);
    log('  auth.users ✅', COLORS.green);
  } catch (e) {
    log(`  ❌ auth.users: ${e.message}`, COLORS.red);
  }

  log('\n✅ guzel sıfırlandı. Yeniden giriş: admin / admin', COLORS.green);
  await c.end();
}

main().catch(e => {
  log(`FATAL: ${e.message}`, COLORS.red);
  process.exit(1);
});
