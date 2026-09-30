#!/usr/bin/env node
/**
 * apply-pesinat-sale-link.mjs
 * ----------------------------------------------------------------------------
 * Plan referansı:
 *   beauty-pesinat-sales-fatura-plani.md §2.1 / Adım 1
 *
 * Amaç:
 *   Tüm RetailEX kiracı (firma/period) `rex_<firmNr>_<periodNr>_sales`
 *   tablolarına aşağıdaki kolonları idempotent olarak ekler:
 *
 *     linked_appointment_id UUID
 *     deposit_sale_id      UUID
 *     parent_sale_id       UUID
 *     sale_group_id        UUID
 *     is_deposit           BOOLEAN NOT NULL DEFAULT false
 *
 *   ve bu kolonlar için 4 indeks oluşturur:
 *     <table>_appointment_idx (linked_appointment_id)
 *     <table>_group_idx      (sale_group_id)
 *     <table>_parent_idx     (parent_sale_id)
 *     <table>_isdeposit_idx  (is_deposit)
 *
 * Tasarım kararları:
 *   • Tauri uyumu — DDL ayrı `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` ve
 *     `CREATE INDEX IF NOT EXISTS …` ifadeleri olarak yazılır; `DO $$ … END $$`
 *     blokları **kullanılmaz**.
 *   • Idempotent — tüm ALTER/CREATE INDEX'ler `IF NOT EXISTS` korumalı;
 *     script birden fazla çalıştırılabilir.
 *   • Multi-tenant — config.db (yerel) + remote PG (uzak) için DB listesi
 *     `pg_database` üzerinden çekilir; RetailEX dışı DB'ler
 *     `non-retailex-databases.mjs` ile filtrelenir.
 *   • Dry-run — `--dry-run` modunda hiçbir ALTER çalıştırılmaz; sadece
 *     "ne yapılırdı" raporu yazılır.
 *
 * Kullanım:
 *   node database/scripts/apply-pesinat-sale-link.mjs              # dry-run (default)
 *   node database/scripts/apply-pesinat-sale-link.mjs --apply      # gerçek ALTER
 *   node database/scripts/apply-pesinat-sale-link.mjs --apply --target remote
 *   node database/scripts/apply-pesinat-sale-link.mjs --apply --db bestcom_db
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  loadRemotePgDefaults,
  parsePgEndpoint,
} from './pg-endpoint-parse.mjs';
import {
  filterRetailExDatabases,
  isNonRetailExDatabase,
} from './non-retailex-databases.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI argümanları ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isApply = args.includes('--apply') || args.includes('--run'); // apply > dry-run
const isDryRun = !isApply; // Varsayılan: dry-run (güvenli)
const isMock = args.includes('--mock'); // Bağlantı kurmadan mock DB listesi ile dry-run
const dbFlagIndex = args.indexOf('--db');
const dbOverride = dbFlagIndex >= 0 && args[dbFlagIndex + 1] ? args[dbFlagIndex + 1] : null;
const dbPositional = args.find((a) => !a.startsWith('-')) || null; // şimdilik yalnız --db override kullanılıyor
const targetArg = (() => {
  const i = args.indexOf('--target');
  return i >= 0 && args[i + 1] ? args[i + 1].toLowerCase() : 'all';
})(); // local | remote | all

if (!['local', 'remote', 'all'].includes(targetArg)) {
  console.error(`[pesinat] Geçersiz --target: ${targetArg}. local | remote | all olmalı.`);
  process.exit(2);
}

// ── Sabit: ALTER listesi (her tablo için, idempotent) ─────────────────────
const SALES_REGEX = /^rex_\d{3}_\d{2}_sales$/;

/**
 * Tek bir sales tablosu için uygulanacak SQL ifadeleri (string[]).
 * NOT: Tüm ifadeler `IF NOT EXISTS` korumalı → idempotent.
 */
function buildStatementsForTable(tableName) {
  const idxPrefix = tableName; // zaten rex_NNN_NN_sales; index adı = prefix + suffix
  return [
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS linked_appointment_id UUID`,
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS deposit_sale_id UUID`,
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS parent_sale_id UUID`,
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS sale_group_id UUID`,
    `ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS is_deposit BOOLEAN NOT NULL DEFAULT false`,
    `CREATE INDEX IF NOT EXISTS ${idxPrefix}_appointment_idx ON ${tableName} (linked_appointment_id)`,
    `CREATE INDEX IF NOT EXISTS ${idxPrefix}_group_idx ON ${tableName} (sale_group_id)`,
    `CREATE INDEX IF NOT EXISTS ${idxPrefix}_parent_idx ON ${tableName} (parent_sale_id)`,
    `CREATE INDEX IF NOT EXISTS ${idxPrefix}_isdeposit_idx ON ${tableName} (is_deposit)`,
  ];
}

// ── config.db çözümleme ────────────────────────────────────────────────────
function decodeConfigPass(s) {
  if (!s || typeof s !== 'string') return '';
  try {
    const b = Buffer.from(s, 'base64');
    if (b.length && /^[A-Za-z0-9+/=]+$/.test(s.replace(/\s/g, ''))) {
      const t = b.toString('utf8');
      if (t.length > 0 && !t.includes('\0')) return t;
    }
  } catch (_) {}
  return s;
}

function resolveConfigDbPath() {
  const env = process.env.CONFIG_DB;
  if (env && existsSync(env)) return env;
  const candidates = [
    'C:\\RetailEX\\config.db',
    'C:\\RetailEx\\config.db',
    join(process.cwd(), 'config.db'),
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  return null;
}

async function loadPgFromConfigDb(configPath) {
  let Database;
  try {
    const mod = await import('better-sqlite3');
    Database = mod.default;
  } catch (e) {
    throw new Error('better-sqlite3 yüklenemedi: npm i -D better-sqlite3');
  }
  const db = new Database(configPath, { readonly: true });
  const row = db.prepare('SELECT data FROM config WHERE id = 1').get();
  db.close();
  if (!row?.data) throw new Error('config.db içinde config satırı yok');
  const config = JSON.parse(row.data);
  config.pg_local_pass = decodeConfigPass(config.pg_local_pass);
  config.pg_remote_pass = decodeConfigPass(config.pg_remote_pass);

  const target = process.env.MIGRATE_TARGET ||
    (config.db_mode === 'online' ? 'remote' : 'local');

  const remoteDefaults = loadRemotePgDefaults();
  const localDefaultHost = '127.0.0.1';
  const localDefaultPort = 5432;

  if (target === 'remote') {
    const r = parsePgEndpoint(config.remote_db, {
      host: remoteDefaults.host,
      port: remoteDefaults.port,
      database: remoteDefaults.database,
    });
    return {
      kind: 'remote',
      host: r.host,
      port: r.port,
      database: process.env.PGDATABASE || r.database,
      user: config.pg_remote_user || remoteDefaults.user || 'postgres',
      password: config.pg_remote_pass || remoteDefaults.password || '',
    };
  }

  const l = parsePgEndpoint(config.local_db, {
    host: localDefaultHost,
    port: localDefaultPort,
    database: 'retailex_local',
  });
  return {
    kind: 'local',
    host: l.host,
    port: l.port,
    database: process.env.PGDATABASE || l.database,
    user: config.pg_local_user || 'postgres',
    password: config.pg_local_pass || '',
  };
}

function loadPgFromEnv() {
  return {
    kind: 'env',
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'retailex_local',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
  };
}

// ── DB listeleme ───────────────────────────────────────────────────────────
async function listDbsForPg(pg, maintenanceDb) {
  const { Client } = await import('pg');
  const c = new Client({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: maintenanceDb,
    connectionTimeoutMillis: 15000,
  });
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT datname FROM pg_database
       WHERE datistemplate = false AND datallowconn
       ORDER BY datname
    `);
    const all = rows.map((r) => r.datname).filter((n) => !['postgres', 'template0', 'template1', 'merkez_db'].includes(n));
    return { all, filtered: filterRetailExDatabases(all) };
  } finally {
    await c.end().catch(() => {});
  }
}

// ── Sales tablolarını listele ──────────────────────────────────────────────
async function listSalesTables(pg, dbName) {
  const { Client } = await import('pg');
  const c = new Client({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: dbName,
    connectionTimeoutMillis: 15000,
  });
  await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name ~ $1
        ORDER BY table_name`,
      ['^rex_[0-9]{3}_[0-9]{2}_sales$'],
    );
    return rows.map((r) => r.table_name).filter((n) => SALES_REGEX.test(n));
  } finally {
    await c.end().catch(() => {});
  }
}

// ── DDL uygula ─────────────────────────────────────────────────────────────
async function applyStatements(pg, dbName, statements, mode) {
  const { Client } = await import('pg');
  const c = new Client({
    host: pg.host,
    port: pg.port,
    user: pg.user,
    password: pg.password,
    database: dbName,
    connectionTimeoutMillis: 15000,
  });
  await c.connect();
  try {
    let okCount = 0;
    let failCount = 0;
    for (const sql of statements) {
      if (mode === 'dry') {
        console.log(`  [DRY-RUN] Would execute: ${sql}`);
        okCount++;
      } else {
        try {
          await c.query(sql);
          console.log(`  [OK] ${sql}`);
          okCount++;
        } catch (e) {
          console.error(`  [FAIL] ${sql}`);
          console.error(`         ${e?.message || e}`);
          failCount++;
        }
      }
    }
    return { okCount, failCount };
  } finally {
    await c.end().catch(() => {});
  }
}

// ── Mock (offline) dry-run ──────────────────────────────────────────────────
/**
 * PG bağlantısı kurmadan sentetik DB ve tablo listesi ile "ne yapılırdı"
 * raporu üretir. Örnek tenant kümeleri: bestcom_db (3 firma × 2 dönem),
 * aqua_db (1 firma × 2 dönem). RetailEX dışı DB'ler bilinçli olarak
 * listeye eklenir; script onları atlamalı.
 */
async function processTargetMock(pg) {
  console.log('[pesinat] MOCK modu — PG bağlantısı kurulmadı');

  const sampleDbs = [
    'bestcom_db',     // RetailEX tenant (3 firma × 2 dönem = 6 sales tablosu)
    'aqua_db',        // RetailEX tenant (1 firma × 2 dönem = 2 sales tablosu)
    'lovan_db',       // RetailEX tenant (2 firma × 1 dönem = 2 sales tablosu)
    'ilsasupport',    // RetailEX dışı → atlanmalı
    'pagetin_kurye',  // RetailEX dışı → atlanmalı
    'siti_pdks',      // RetailEX dışı → atlanmalı
    'aram',           // RetailEX dışı → atlanmalı
  ];

  // DB → sales tabloları (firm/period)
  const dbTables = {
    bestcom_db: [
      'rex_001_01_sales',
      'rex_001_02_sales',
      'rex_002_01_sales',
      'rex_002_02_sales',
      'rex_003_01_sales',
      'rex_003_02_sales',
    ],
    aqua_db: [
      'rex_001_01_sales',
      'rex_001_02_sales',
    ],
    lovan_db: [
      'rex_001_01_sales',
      'rex_002_01_sales',
    ],
  };

  const allDbs = sampleDbs.slice();
  const skippedNonRetail = allDbs.filter((n) => isNonRetailExDatabase(n));
  const retailDbs = filterRetailExDatabases(allDbs);

  console.log(`[pesinat] (mock) Taranan DB sayısı: ${allDbs.length}`);
  if (skippedNonRetail.length) {
    console.log(`[pesinat] (mock) RetailEX dışı atlanan DB'ler: ${skippedNonRetail.join(', ')}`);
  }

  let totalTables = 0;
  let totalOk = 0;
  let totalFail = 0;
  const dbResults = [];

  for (const db of retailDbs) {
    const tables = dbTables[db] || [];
    console.log(`\n[pesinat] -> DB: ${db}`);
    console.log(`[pesinat] ${db}: ${tables.length} sales tablosu bulundu`);
    totalTables += tables.length;
    if (tables.length === 0) {
      dbResults.push({ db, ok: true, tables: 0, okCount: 0, failCount: 0 });
      continue;
    }
    let dbOk = 0;
    let dbFail = 0;
    for (const tbl of tables) {
      const stmts = buildStatementsForTable(tbl);
      for (const sql of stmts) {
        if (isDryRun) {
          console.log(`  [DRY-RUN] Would execute: ${sql}`);
          dbOk++;
        } else {
          // Mock modda apply mantıksız; sadece dry-run.
          console.log(`  [MOCK-NOOP] ${sql}`);
          dbOk++;
        }
      }
    }
    totalOk += dbOk;
    totalFail += dbFail;
    dbResults.push({ db, ok: dbFail === 0, tables: tables.length, okCount: dbOk, failCount: dbFail });
  }

  return {
    target: pg.origin + (isMock ? ' (mock)' : ''),
    totalDbsScanned: allDbs.length,
    totalDbsProcessed: retailDbs.length,
    skippedNonRetail,
    totalTables,
    totalAlters: totalOk + totalFail,
    totalOk,
    totalFail,
    dbResults,
  };
}


// ── Ana akış ───────────────────────────────────────────────────────────────
async function resolveTargets() {
  /**
   * @returns {Promise<{kind:string,host:string,port:number,database:string,user:string,password:string,origin:string}[]>}
   */
  const envOnly = process.env.PESINAT_ENV_ONLY === '1';
  const configPath = !envOnly ? resolveConfigDbPath() : null;

  if (configPath) {
    console.log(`[pesinat] config.db: ${configPath}`);
    try {
      const pg = await loadPgFromConfigDb(configPath);
      console.log(`[pesinat] config.db türü: ${pg.kind}`);
      const want = targetArg === 'all' ? [pg.kind] : [targetArg];
      return want.map((kind) => ({ ...pg, kind, origin: `config.db(${kind})` }));
    } catch (e) {
      console.warn(`[pesinat] config.db okunamadı (${e.message}); ortam değişkenlerine düşülüyor.`);
    }
  } else {
    console.log('[pesinat] config.db bulunamadı; PG* ortam değişkenleri kullanılacak.');
  }

  // Env fallback
  const envPg = loadPgFromEnv();
  const want = targetArg === 'all' ? ['env'] : [targetArg === 'remote' ? 'env-remote' : 'env'];
  if (targetArg === 'remote') {
    const defaults = loadRemotePgDefaults();
    return [{
      ...envPg,
      kind: 'env-remote',
      host: process.env.PGHOST || defaults.host,
      port: parseInt(process.env.PGPORT || String(defaults.port || 5432), 10),
      database: process.env.PGDATABASE || defaults.database,
      user: process.env.PGUSER || defaults.user || 'postgres',
      password: process.env.PGPASSWORD || defaults.password || '',
      origin: 'env(remote)',
    }];
  }
  return [{ ...envPg, origin: `env(${envPg.kind})` }];
}

async function processTarget(pg) {
  console.log(`\n[pesinat] === Target: ${pg.origin} → ${pg.user}@${pg.host}:${pg.port}/${pg.database} ===`);
  console.log(`[pesinat] Mod: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);

  if (dbOverride) {
    console.log(`[pesinat] --db override: yalnız '${dbOverride}' işlenecek`);
    process.env.PGDATABASE = dbOverride;
    pg.database = dbOverride;
  }

  // MOCK: PG bağlantısı kurmadan tipik bir RetailEX tenant kümesi simüle et
  if (isMock) {
    return await processTargetMock(pg);
  }

  const maintenanceDb = process.env.PG_MAINTENANCE_DATABASE || 'postgres';

  // DB listesi çek
  let allDbs, retailDbs;
  try {
    const listed = await listDbsForPg(pg, maintenanceDb);
    allDbs = listed.all;
    retailDbs = listed.filtered;
  } catch (e) {
    console.error(`[pesinat] DB listesi alınamadı: ${e.message}`);
    throw e;
  }

  const skippedNonRetail = allDbs.filter((n) => isNonRetailExDatabase(n));
  console.log(`[pesinat] Taranan DB sayısı: ${allDbs.length}`);
  if (skippedNonRetail.length) {
    console.log(`[pesinat] RetailEX dışı atlanan DB'ler: ${skippedNonRetail.join(', ')}`);
  }

  let totalTables = 0;
  let totalAlters = 0;
  let totalOk = 0;
  let totalFail = 0;
  const dbResults = [];

  for (const db of retailDbs) {
    console.log(`\n[pesinat] -> DB: ${db}`);
    let salesTables = [];
    try {
      salesTables = await listSalesTables(pg, db);
    } catch (e) {
      console.error(`[pesinat] ${db}: sales tabloları listelenemedi: ${e.message}`);
      dbResults.push({ db, ok: false, tables: 0, okCount: 0, failCount: 0, error: e.message });
      continue;
    }
    console.log(`[pesinat] ${db}: ${salesTables.length} sales tablosu bulundu`);
    totalTables += salesTables.length;

    if (salesTables.length === 0) {
      dbResults.push({ db, ok: true, tables: 0, okCount: 0, failCount: 0 });
      continue;
    }

    // Her tablo için statement listesi üret
    let dbOk = 0;
    let dbFail = 0;
    for (const tbl of salesTables) {
      const stmts = buildStatementsForTable(tbl);
      const { okCount, failCount } = await applyStatements(pg, db, stmts, isDryRun ? 'dry' : 'apply');
      dbOk += okCount;
      dbFail += failCount;
    }
    totalAlters += dbOk + dbFail;
    totalOk += dbOk;
    totalFail += dbFail;
    dbResults.push({ db, ok: dbFail === 0, tables: salesTables.length, okCount: dbOk, failCount: dbFail });
  }

  return {
    target: pg.origin,
    totalDbsScanned: allDbs.length,
    totalDbsProcessed: retailDbs.length,
    skippedNonRetail,
    totalTables,
    totalAlters,
    totalOk,
    totalFail,
    dbResults,
  };
}

async function main() {
  console.log('[pesinat] === Peşinat Sale Link Migration ===');
  console.log(`[pesinat] Plan: beauty-pesinat-sales-fatura-plani.md §2.1`);
  console.log(`[pesinat] Mod: ${isDryRun ? 'DRY-RUN (güvenli)' : 'APPLY (gerçek ALTER)'}`);
  if (targetArg !== 'all') console.log(`[pesinat] Target filtre: --target ${targetArg}`);

  const targets = await resolveTargets();
  if (targets.length === 0) {
    console.error('[pesinat] Hiçbir PG bağlantısı çözümlenemedi.');
    process.exit(1);
  }

  const summary = [];
  for (const pg of targets) {
    try {
      const r = await processTarget(pg);
      summary.push(r);
    } catch (e) {
      console.error(`[pesinat] Target başarısız (${pg.origin}):`, e.message);
      summary.push({
        target: pg.origin,
        totalDbsScanned: 0,
        totalDbsProcessed: 0,
        skippedNonRetail: [],
        totalTables: 0,
        totalAlters: 0,
        totalOk: 0,
        totalFail: 0,
        dbResults: [],
        error: e.message,
      });
    }
  }

  // Rapor
  console.log('\n[pesinat] =================== ÖZET RAPOR ===================');
  console.log(`Mod                  : ${isDryRun ? 'DRY-RUN' : 'APPLY'}`);
  for (const s of summary) {
    console.log(`\nTarget               : ${s.target}`);
    console.log(`  Taranan DB         : ${s.totalDbsScanned}`);
    console.log(`  İşlenen DB         : ${s.totalDbsProcessed}`);
    console.log(`  Atlanan (non-RX)   : ${s.skippedNonRetail.length} ${s.skippedNonRetail.length ? '[' + s.skippedNonRetail.join(', ') + ']' : ''}`);
    console.log(`  Bulunan sales tab. : ${s.totalTables}`);
    console.log(`  Uygulanan/planlanan: ${s.totalOk} başarılı, ${s.totalFail} hatalı (toplam ${s.totalAlters})`);
    if (s.error) console.log(`  Hata               : ${s.error}`);
  }
  console.log('\n[pesinat] ================================================');

  if (isDryRun) {
    console.log('\n[pesinat] DRY-RUN tamamlandı. Gerçek uygulama için:');
    console.log('[pesinat]   npm run db:migrate:pesinat:apply');
    console.log('[pesinat] veya');
    console.log('[pesinat]   node database/scripts/apply-pesinat-sale-link.mjs --apply');
    if (!isMock) {
      console.log('[pesinat] PG erişimi yoksa mock rapor için: --mock bayrağı');
    }
  }

  // Apply modda hata varsa exit 1
  const hadFailure = summary.some((s) => s.totalFail > 0);
  if (!isDryRun && hadFailure) process.exit(1);
}

main().catch((e) => {
  console.error('[pesinat] Fatal:', e?.message || e);
  process.exit(1);
});
