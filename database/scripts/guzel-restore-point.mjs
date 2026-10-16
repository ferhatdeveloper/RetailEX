#!/usr/bin/env node
/**
 * guzel DB geri dönüşüm noktası yönetimi
 *
 * Komutlar:
 *   list                                    Tüm noktaları listele
 *   create --label <etiket> --note <metin>  Şu anki DB yedeğini al + manifest'e nokta ekle
 *   restore --label <etiket>                Noktaya geri dön (DB sıfırlanır + restore)
 *   restore --default                       Default (is_default=true) noktaya dön
 *
 * Kullanım:
 *   PGPASSWORD='...' node database/scripts/guzel-restore-point.mjs list
 *   PGPASSWORD='...' node database/scripts/guzel-restore-point.mjs create --label fresh --note "yeni sıfır"
 *   PGPASSWORD='...' node database/scripts/guzel-restore-point.mjs restore --default
 *   PGPASSWORD='...' node database/scripts/guzel-restore-point.mjs restore --label fresh-install-2026-10-16
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { Client } from 'pg';

const HOST = process.env.PGHOST || '72.60.182.107';
const PORT = parseInt(process.env.PGPORT || '5432', 10);
const USER = process.env.PGUSER || 'postgres';
const PASSWORD = process.env.PGPASSWORD || '';
const DB = process.env.PGDATABASE || 'guzel';

const argv = process.argv.slice(2);
const cmd = argv[0];
const argMap = (key) => {
  const idx = argv.indexOf(key);
  return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : null;
};
const LABEL = argMap('--label');
const NOTE = argMap('--note');
const DEFAULT_RESTORE = argv.includes('--default');

const MANIFEST = resolve('database/scripts/guzel-restore-points.json');

if (!PASSWORD) {
  console.error('PGPASSWORD gerekli (env).');
  process.exit(2);
}

if (!cmd || !['list', 'create', 'restore'].includes(cmd)) {
  console.error('Komut gerekli: list | create | restore');
  process.exit(2);
}

const COLORS = {
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m', reset: '\x1b[0m',
};
const log = (m, c = '') => console.log(`${c}${m}${c ? COLORS.reset : ''}`);

function loadManifest() {
  if (!existsSync(MANIFEST)) return { version: 1, db: DB, default_host: HOST, default_port: PORT, default_user: USER, points: [] };
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}
function saveManifest(m) {
  const dir = dirname(MANIFEST);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n', 'utf8');
}

function listPoints() {
  const m = loadManifest();
  log(`\n[guzel Restore Points] DB: ${m.db || DB} @ ${m.default_host || HOST}:${m.default_port || PORT}`, COLORS.cyan);
  log(`Manifest: ${MANIFEST}\n`, COLORS.gray);
  const points = m.points || [];
  if (points.length === 0) {
    log('  (henüz nokta yok)', COLORS.gray);
    return;
  }
  const rows = points.map(p => ({
    label: p.label,
    default: p.is_default ? '⭐' : '',
    size: `${Math.round((p.size_bytes || 0) / 1024)} KB`,
    tables: p.tables ?? '?',
    inserts: p.inserts ?? '?',
    created: p.created_at,
    note: (p.note || '').slice(0, 60) + ((p.note || '').length > 60 ? '…' : ''),
  }));
  const widths = {
    label: Math.max(5, ...rows.map(r => r.label.length)),
    default: 3, size: 10, tables: 8, inserts: 8, created: 24,
  };
  const sep = (w, c = '-') => '-'.repeat(w);
  log('  ' + Object.keys(widths).map(k => k.padEnd(widths[k])).join(' '), COLORS.gray);
  log('  ' + Object.values(widths).map(sep).join(' '), COLORS.gray);
  for (const r of rows) {
    const cells = [
      r.label.padEnd(widths.label),
      r.default.padEnd(widths.default),
      r.size.padEnd(widths.size),
      String(r.tables).padEnd(widths.tables),
      String(r.inserts).padEnd(widths.inserts),
      r.created.padEnd(widths.created),
    ];
    log('  ' + cells.join(' '));
    if (r.note) log('    → ' + r.note, COLORS.gray);
  }
  log('');
}

async function createPoint() {
  if (!LABEL) {
    console.error('--label <etiket> gerekli');
    process.exit(2);
  }
  const m = loadManifest();
  if ((m.points || []).some(p => p.label === LABEL)) {
    console.error(`Etiket zaten var: ${LABEL}. Farklı bir etiket seç veya restore --label ile kullan.`);
    process.exit(1);
  }

  log(`\n[Yeni Nokta] Yedek alınıyor → "${LABEL}"`, COLORS.cyan);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = resolve(`database/backups/guzel-${LABEL}-${ts}.sql`);
  const outDir = dirname(out);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const dump = spawnSync('pg_dump', [
    '-h', HOST, '-p', String(PORT), '-U', USER, '-d', DB,
    '--no-owner', '--no-privileges',
    '--file=' + out,
    '--format=plain', '--inserts', '--column-inserts',
  ], { env: { ...process.env, PGPASSWORD: PASSWORD }, stdio: 'inherit' });
  if (dump.status !== 0) {
    console.error('pg_dump başarısız, status=' + dump.status);
    process.exit(dump.status || 1);
  }

  const size = statSync(out).size;
  // Tablo / INSERT sayımı (hızlı)
  const sql = readFileSync(out, 'utf8');
  const tables = (sql.match(/^CREATE TABLE/gm) || []).length;
  const inserts = (sql.match(/^INSERT INTO/gm) || []).length;

  m.points = m.points || [];
  m.points.unshift({
    label: LABEL,
    note: NOTE || '(açıklama yok)',
    file: path_relative(out),
    size_bytes: size,
    tables,
    inserts,
    created_at: new Date().toISOString(),
    created_by: 'guzel-restore-point.mjs create',
    is_default: false,
  });
  saveManifest(m);
  log(`\n✅ Nokta eklendi: ${LABEL}`, COLORS.green);
  log(`   dosya: ${path_relative(out)} (${Math.round(size / 1024)} KB, ${tables} tablo, ${inserts} INSERT)`, COLORS.gray);
}

function path_relative(p) {
  const cwd = process.cwd();
  const abs = resolve(p);
  if (abs.startsWith(cwd)) return abs.slice(cwd.length + 1);
  return abs;
}

async function restorePoint() {
  const m = loadManifest();
  const points = m.points || [];
  let point = null;
  if (DEFAULT_RESTORE) {
    point = points.find(p => p.is_default);
    if (!point) { console.error('is_default=true nokta yok'); process.exit(1); }
  } else if (LABEL) {
    point = points.find(p => p.label === LABEL);
    if (!point) { console.error(`Etiket bulunamadı: ${LABEL}`); process.exit(1); }
  } else {
    console.error('--label <etiket> veya --default gerekli');
    process.exit(2);
  }

  const file = resolve(point.file);
  if (!existsSync(file)) {
    console.error(`Yedek dosyası yok: ${file}`);
    process.exit(1);
  }
  const size = statSync(file).size;

  log(`\n[Restore] Nokta: ${point.label}`, COLORS.cyan);
  log(`  dosya: ${point.file} (${Math.round(size / 1024)} KB)`, COLORS.gray);
  log(`  oluşturma: ${point.created_at}`, COLORS.gray);
  log(`  not: ${point.note || '(yok)'}`, COLORS.gray);
  log(`\n⚠️  Bu işlem DB'yi ("${DB}") mevcut durumdan farklı olarak TAMAMEN sıfırlayıp`, COLORS.yellow);
  log(`   yedek dosyasındaki yapıya döndürür. Geri alınamaz!`, COLORS.yellow);

  // Onay için ENV ile çift adım
  if (process.env.GUZEL_RESTORE_CONFIRM !== 'YES') {
    log(`\nOnaylamak için GUZEL_RESTORE_CONFIRM=YES env ile tekrar çalıştırın:`, COLORS.red);
    log(`  GUZEL_RESTORE_CONFIRM=YES PGPASSWORD='...' node database/scripts/guzel-restore-point.mjs restore --label ${point.label}`, COLORS.gray);
    process.exit(3);
  }

  // 1) DB'de tüm şemaları drop
  log(`\n[1/2] Şemalar drop ediliyor...`, COLORS.red);
  const c = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DB, connectionTimeoutMillis: 15000 });
  await c.connect();
  const schRes = await c.query(
    `SELECT n.nspname FROM pg_namespace n WHERE n.nspname IN ('public','auth','beauty','wms','rest','logic','logistics','pos')`
  );
  for (const r of schRes.rows) {
    const sch = r.nspname;
    if (sch === 'public') {
      const t = await c.query(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='public' AND c.relkind IN ('r','p')`
      );
      for (const x of t.rows) {
        await c.query(`DROP TABLE IF EXISTS public."${x.relname}" CASCADE`);
      }
    } else {
      await c.query(`DROP SCHEMA IF EXISTS "${sch}" CASCADE`);
    }
    log(`  ${sch} ✅`, COLORS.green);
  }
  await c.end();

  // 2) psql ile restore
  log(`\n[2/2] Restore: psql -d ${DB} -f ${point.file}`, COLORS.cyan);
  // ON_ERROR_STOP=1 YOK: yedek dosyasında CREATE SCHEMA (IF NOT EXISTS olmadan)
  // ve bazı CREATE INDEX'ler var; var olan objeleri CREATE TABLE/INDEX
  // komutlarının alt kümeleri tolere edilir. Hatayı yine de kullanıcıya gösteririz.
  const psql = spawnSync('psql', [
    '-h', HOST, '-p', String(PORT), '-U', USER, '-d', DB,
    '-q', '-f', file,
  ], { env: { ...process.env, PGPASSWORD: PASSWORD }, stdio: 'inherit' });
  if (psql.status !== 0) {
    console.error('psql başarısız, status=' + psql.status);
    process.exit(psql.status || 1);
  }

  // 3) auth.users ek kolonları (yedek zaten içermiş olmalı, ama güvenlik)
  const c3 = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: DB });
  await c3.connect();
  try {
    await c3.query(`ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data JSONB DEFAULT '{}'`);
    await c3.query(`ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password TEXT`);
  } catch (e) { /* tablo yoksa yoksay */ }
  await c3.end();

  log(`\n✅ Restore tamamlandı → ${point.label}`, COLORS.green);
}

(async () => {
  try {
    if (cmd === 'list') listPoints();
    else if (cmd === 'create') await createPoint();
    else if (cmd === 'restore') await restorePoint();
  } catch (e) {
    console.error('FATAL:', e.message);
    process.exit(1);
  }
})();