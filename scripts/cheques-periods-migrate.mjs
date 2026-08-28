#!/usr/bin/env node
// RetailEX tenant DB migration runner — cheques (128) + periods.is_active
// Iraq, KDV yok. Sadece DDL + periods.is_active NULL update.

import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const HOST = '72.60.182.107';
const PORT = 5432;
const USER = 'postgres';
const PASSWORD = 'Yq7xwQpt6c';

const TARGET_DBS = [
  'aqua_beauty',
  'berzin_com',
  'kasap',
  'lovan',
  'ozbek',
  'pdks_demo',
  'retailex_demo',
  'testere',
  'zetem',
];

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  'database/migrations/128_cheques_tracking.sql'
);

// ---------- helpers ----------
function log(...args) {
  console.log(...args);
}

function section(title) {
  log('\n' + '='.repeat(72));
  log(title);
  log('='.repeat(72));
}

async function withClient(dbName, fn) {
  const client = new pg.Client({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: dbName,
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

// Split SQL into statements, respecting $$ ... $$ blocks and quoted strings.
function splitSqlStatements(sql) {
  const statements = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inDollar = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next2 = sql.substring(i, i + 2);

    if (!inSingle && !inDouble && !inDollar && next2 === '$$') {
      inDollar = true;
      buf += '$$';
      i += 2;
      continue;
    }
    if (inDollar && next2 === '$$') {
      inDollar = false;
      buf += '$$';
      i += 2;
      continue;
    }
    if (!inDouble && !inDollar && ch === "'" && sql[i - 1] !== '\\') {
      inSingle = !inSingle;
    } else if (!inSingle && !inDollar && ch === '"' && sql[i - 1] !== '\\') {
      inDouble = !inDouble;
    }
    if (ch === ';' && !inSingle && !inDouble && !inDollar) {
      const stmt = buf.trim();
      if (stmt.length) statements.push(stmt);
      buf = '';
    } else {
      buf += ch;
    }
    i++;
  }
  const tail = buf.trim();
  if (tail.length) statements.push(tail);
  return statements;
}

function stripComments(sql) {
  // Remove -- line comments
  return sql.replace(/^\s*--.*$/gm, '').replace(/\n--.*$/g, '');
}

// ---------- main per-DB logic ----------
async function applyChequesMigration(client) {
  // Detect existing rex_*_cheques tables
  const existsRes = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name ~ '^rex_[0-9]+_cheques$'
     ORDER BY table_name`
  );
  const existing = existsRes.rows.map((r) => r.table_name);
  if (existing.length) {
    return { created: 0, existing, indexes: 0 };
  }

  const rawSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const cleaned = stripComments(rawSql);
  const statements = splitSqlStatements(cleaned);

  let created = 0;
  let indexes = 0;
  for (const stmt of statements) {
    const upper = stmt.toUpperCase().trimStart();
    if (upper.startsWith('CREATE TABLE')) created += 1;
    else if (upper.startsWith('CREATE INDEX')) indexes += 1;
    await client.query(stmt);
  }
  return { created, existing: [], indexes };
}

async function detectFirmNumbers(client) {
  // firm_nr sayısı: rex_NNN_* tablolarındaki prefix'leri say
  const res = await client.query(
    `SELECT DISTINCT substring(table_name from '^rex_([0-9]+)_') AS firm_nr
     FROM information_schema.tables
     WHERE table_schema='public' AND table_name ~ '^rex_[0-9]+_'
     ORDER BY firm_nr`
  );
  return res.rows.map((r) => r.firm_nr).filter(Boolean);
}

async function ensurePeriodsIsActive(client) {
  // 1. Kolon var mı?
  const colRes = await client.query(
    `SELECT column_name, data_type, column_default
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='periods' AND column_name='is_active'`
  );
  let hadColumn = colRes.rows.length > 0;
  if (!hadColumn) {
    await client.query(
      `ALTER TABLE public.periods ADD COLUMN IF NOT EXISTS is_active BOOLEAN`
    );
    await client.query(
      `ALTER TABLE public.periods ALTER COLUMN is_active SET DEFAULT true`
    );
    hadColumn = true;
  }

  // 2. NULL olanları güncelle
  //  - geçmiş dönem (bugün > end_date) → false
  //  - mevcut / gelecek → true
  // Tabloda PK kolonu id (uuid), period_nr YOK — nr kullanılır
  const updPast = await client.query(
    `UPDATE public.periods
     SET is_active = false
     WHERE is_active IS NULL
       AND CURRENT_DATE > end_date
     RETURNING id, is_active`
  );
  const updFuture = await client.query(
    `UPDATE public.periods
     SET is_active = true
     WHERE is_active IS NULL
     RETURNING id, is_active`
  );

  // 3. Final SELECT (id, nr, beg_date, end_date, is_active)
  const final = await client.query(
    `SELECT id, nr, beg_date::text, end_date::text, is_active
     FROM public.periods
     ORDER BY beg_date`
  );

  return {
    addedColumn: !colRes.rows.length,
    nullPast: updPast.rowCount,
    nullFuture: updFuture.rowCount,
    rows: final.rows,
  };
}

async function processDb(dbName) {
  section(`## ${dbName}`);
  try {
    await withClient(dbName, async (client) => {
      // === D1. cheques migration ===
      log('### Migration 128 (cheques)');
      const beforeTables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name='rex_001_cheques' LIMIT 1`
      );
      const existedBefore = beforeTables.rows.length > 0;
      log('- Mevcut durum: ' + (existedBefore ? 'var' : 'yok'));

      const m = await applyChequesMigration(client);
      log(
        `- Uygulandı: ${m.created ? '✅' : '⏭️ atlandı (zaten var)'} ${m.created} tablo oluşturuldu`
      );
      log(`- İndeksler: ${m.indexes} indeks eklendi`);

      // === Multi-firma ===
      log('\n### Çoklu firma');
      const firms = await detectFirmNumbers(client);
      if (firms.length <= 1) {
        log('- Var mı: hayır (tek firma)');
        log('- Ek iş: yok');
      } else {
        log(`- Var mı: evet (${firms.length} firma)`);
        // Her ek firma için cheques tablosu + indeksler
        for (const fnr of firms) {
          if (fnr === '001') continue;
          const checkRes = await client.query(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
            [`rex_${fnr}_cheques`]
          );
          if (checkRes.rows.length === 0) {
            // Build table DDL from migration template
            const rawSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
            const cleaned = stripComments(rawSql).replace(/rex_001_/g, `rex_${fnr}_`);
            const statements = splitSqlStatements(cleaned);
            for (const stmt of statements) {
              await client.query(stmt);
            }
            log(`  - rex_${fnr}_cheques oluşturuldu`);
          } else {
            log(`  - rex_${fnr}_cheques zaten var`);
          }
        }
        log('- Ek iş: tamamlandı');
      }

      // === D2. periods.is_active ===
      log('\n### Periods.is_active');
      const beforeRes = await client.query(
        `SELECT id, nr, is_active
         FROM public.periods
         ORDER BY beg_date`
      );
      const beforeState = beforeRes.rows.map((r) =>
        r.is_active === null ? 'null' : r.is_active
      );
      log('- Mevcut durum: [' + beforeState.join(', ') + ']');

      const p = await ensurePeriodsIsActive(client);
      const summary = [
        p.addedColumn ? 'kolon eklendi' : 'kolon mevcut',
        `${p.nullPast} satır (false)`,
        `${p.nullFuture} satır (true)`,
      ].join(', ');
      log(`- Güncellendi: ✅ ${summary}`);

      const finalValues = p.rows.map((r) =>
        r.is_active === null ? 'null' : r.is_active
      );
      log('- Doğrulama: [' + finalValues.join(', ') + ']');
    });
  } catch (err) {
    log(`\n❌ ${dbName} HATA: ${err.message}`);
  }
}

async function main() {
  log(`Hedef DB sayısı: ${TARGET_DBS.length}`);
  log(`Migration dosyası: ${MIGRATION_PATH}`);
  for (const db of TARGET_DBS) {
    await processDb(db);
  }
  log('\n' + '='.repeat(72));
  log('TAMAMLANDI');
  log('='.repeat(72));
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
