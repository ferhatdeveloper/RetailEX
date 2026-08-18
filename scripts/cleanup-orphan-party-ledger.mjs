#!/usr/bin/env node
/**
 * Aqua DB — Orphan party_ledger_movements temizleyici.
 *
 * Sorun: Eski sürümlerde deleteKasaIslemi cash_lines + cash_registers.balance + parties.balance
 *        geri alıyordu ama party_ledger_movements'taki maaş/avans/ortak satırı yetim kalıyordu.
 *        Bu satırlar hâlâ personel/ortak ekstresinde görünüyor ("kasada silindi ama hesapta kaldı").
 *
 * Yeni sürüm (commit 11bfe6f3) silinen kasa işlemleri için ters CANCELLED_* ledger satırı açıyor.
 * Bu script **mevcut yetim** ledger satırlarını temizler ve parties.balance'ı yeniden hesaplar.
 *
 * Mantık:
 *   - cash_line_id dolu ve source_module <> 'cash_delete' olan party_ledger_movements satırı,
 *   - cash_lines tablosunda karşılığı yoksa → yetim (orphan)
 *   - Silindikten sonra parties.balance ledger toplamından yeniden hesaplanır.
 *
 * Bu script yalnızca yetimleri temizler; geçerli (cash_line_id NULL veya eşleşen) kayıtlara
 * dokunmaz. CANCELLED_* ters kayıtları (yeni düzeltme tarafından açılan) korunur — onlar audit
 * trail'in parçası.
 *
 * Kullanım:
 *   node scripts/cleanup-orphan-party-ledger.mjs --dry-run            # tüm tenant DB'lerde yetimleri listele
 *   node scripts/cleanup-orphan-party-ledger.mjs --db=DB --dry-run
 *   node scripts/cleanup-orphan-party-ledger.mjs --apply              # tüm tenant DB'lerde uygula
 *   node scripts/cleanup-orphan-party-ledger.mjs --db=DB --apply
 *
 * Ortam: PGHOST, PGPORT, PGUSER, PGPASSWORD (yoksa local pg-endpoint-parse.mjs)
 */

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadRemotePgDefaults } from '../database/scripts/pg-endpoint-parse.mjs';
import {
  filterRetailExDatabases,
  isNonRetailExDatabase,
} from '../database/scripts/non-retailex-databases.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaults = loadRemotePgDefaults();

const host = process.env.PGHOST || defaults.host;
const port = Number(process.env.PGPORT || defaults.port);
const user = process.env.PGUSER || defaults.user;
const password = process.env.PGPASSWORD || defaults.password;
const maintenanceDb = process.env.PG_MAINTENANCE_DATABASE || 'postgres';
const merkezDb = process.env.PG_MERKEZ_DATABASE || 'merkez_db';

const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const onlyDb = (args.find((a) => a.startsWith('--db=')) || '').slice(5) || null;
const verbose = args.includes('--verbose');

function client(database) {
  return new pg.Client({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: 15000,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
}

async function listDatabases() {
  if (onlyDb) {
    if (isNonRetailExDatabase(onlyDb)) {
      console.error(`[skip] ${onlyDb}: RetailEX kiracı veritabanı değil`);
      return [];
    }
    return [onlyDb];
  }
  const c = client(maintenanceDb);
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT datname
      FROM pg_database
      WHERE datistemplate = false
        AND datallowconn
      ORDER BY datname
    `);
    return filterRetailExDatabases(
      rows.map((r) => r.datname).filter((n) => n !== 'postgres' && n !== 'merkez_db'),
    );
  } finally {
    await c.end().catch(() => {});
  }
}

/**
 * Verilen DB'deki tüm (firm, period) scope'larını döndürür.
 * Tablolar public şemada ama isimleri rex_<firm>_<period>_party_ledger_movements formatında.
 * cash_lines olmayan scope'lar atlanır.
 */
async function listTenantScopes(c) {
  const { rows } = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ~ '^rex_[0-9]{3}_[0-9]{2}_party_ledger_movements$'
  `);
  const scopes = [];
  for (const r of rows) {
    const tn = r.table_name;
    const base = tn.replace(/_party_ledger_movements$/, '');
    const cashTable = `${base}_cash_lines`;
    const chk = await c.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
      [cashTable],
    );
    if (chk.rows.length) scopes.push(base);
  }
  return scopes;
}

async function scanOrphans(c, scope) {
  const ledger = `${scope}_party_ledger_movements`;
  const cash = `${scope}_cash_lines`;
  const { rows: orphans } = await c.query(
    `SELECT
        pl.id::text AS ledger_id,
        pl.party_id::text AS party_id,
        pl.card_type,
        pl.transaction_type,
        pl.amount,
        pl.sign,
        pl.date,
        pl.definition,
        pl.cash_line_id::text AS cash_line_id,
        pl.source_module,
        pl.created_at
      FROM ${ledger} pl
      WHERE pl.cash_line_id IS NOT NULL
        AND COALESCE(pl.source_module, '') <> 'cash_delete'
        AND NOT EXISTS (
          SELECT 1 FROM ${cash} cl WHERE cl.id = pl.cash_line_id
        )
      ORDER BY pl.date DESC
    `,
  );
  return orphans;
}

async function cleanupDatabase(dbName) {
  const c = client(dbName);
  await c.connect();
  try {
    const scopes = await listTenantScopes(c);
    if (!scopes.length) {
      console.log(`  [skip] ${dbName}: party_ledger_movements tablosu bulunamadı`);
      return { scopes: 0, orphans: 0, deleted: 0, samples: [], recomputed: 0, zeroed: 0 };
    }

    let totalOrphans = 0;
    let totalDeleted = 0;
    const samples = [];

    for (const scope of scopes) {
      const orphans = await scanOrphans(c, scope);
      if (!orphans.length) continue;
      totalOrphans += orphans.length;
      console.log(`  [${dbName}/${scope}] yetim ledger satırı: ${orphans.length}`);
      if (verbose && orphans.length) {
        for (const o of orphans.slice(0, 5)) {
          console.log(
            `    · ${o.date} | party=${o.party_id} (${o.card_type}) | ${o.transaction_type} | ${o.amount} sign=${o.sign} | cash_line_id=${o.cash_line_id} | "${o.definition}"`,
          );
        }
        if (orphans.length > 5) console.log(`    · ... ve ${orphans.length - 5} satır daha`);
      }
      samples.push({ scope, count: orphans.length, first: orphans[0] });

      if (!dryRun && orphans.length) {
        await c.query('BEGIN');
        try {
          const ids = orphans.map((o) => o.ledger_id);
          const { rowCount } = await c.query(
            `DELETE FROM ${scope}_party_ledger_movements WHERE id = ANY($1::text::uuid[])`,
            [ids],
          );
          await c.query('COMMIT');
          totalDeleted += rowCount || 0;
          console.log(`  [${dbName}/${scope}] silindi: ${rowCount}`);
        } catch (err) {
          await c.query('ROLLBACK').catch(() => {});
          console.error(`  [${dbName}/${scope}] silme hatası: ${err.message}`);
          throw err;
        }
      }
    }

    // Recompute: silinen yetim kayıtlar sonrası parties.balance ledger toplamından
    // yeniden hesaplanmalı. Bu adım yalnız employee + partner kartlarını etkiler
    // (customer/supplier farklı bakiye yönetir). İki aşamalı:
    //   1) Ledger toplamı olan partilerin balance'ı SUM(amount*sign)'a güncellenir.
    //   2) Ledger'ı tamamen boşalan (silinen yetimlerin hepsi bu party'ye ait) ve
    //      bakiyesi ≠0 olan partiler 0'a çekilir.
    let recomputed = 0;
    let zeroed = 0;
    if (!dryRun && totalDeleted > 0) {
      const firmNrs = new Set();
      for (const scope of scopes) {
        const m = scope.match(/^rex_(\d{3})_\d{2}$/);
        if (m) firmNrs.add(m[1]);
      }
      for (const firmNr of firmNrs) {
        const partiesTable = `rex_${firmNr}_parties`;
        const chk = await c.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
          [partiesTable],
        );
        if (!chk.rows.length) continue;

        const firmScopes = scopes.filter((s) => s.startsWith(`rex_${firmNr}_`));
        const unionSql = firmScopes
          .map(
            (s) =>
              `SELECT party_id, amount, sign FROM ${s}_party_ledger_movements WHERE COALESCE(source_module,'')<>'cash_delete'`,
          )
          .join(' UNION ALL ');
        if (!unionSql) continue;

        // 1) Ledger toplamı olan partilerin balance'ı güncelle
        const { rowCount: upCount } = await c.query(
          `WITH all_ledger AS (${unionSql})
           UPDATE ${partiesTable} p
           SET balance = COALESCE(src.ledger_total, 0), updated_at = NOW()
           FROM (
             SELECT party_id::text AS pid, SUM(amount*sign) AS ledger_total
             FROM all_ledger GROUP BY party_id
           ) src
           WHERE p.id::text = src.pid
             AND p.card_type IN ('employee','partner')`,
        );
        recomputed += upCount || 0;

        // 2) Ledger boşalan + bakiyesi ≠0 olanları 0'a çek
        const firstScope = firmScopes[0];
        const { rowCount: zeroCount } = await c.query(
          `UPDATE ${partiesTable} p
           SET balance = 0, updated_at = NOW()
           WHERE p.card_type IN ('employee','partner')
             AND COALESCE(p.balance, 0) <> 0
             AND NOT EXISTS (
               SELECT 1 FROM ${firstScope}_party_ledger_movements pl
               WHERE pl.party_id = p.id
                 AND COALESCE(pl.source_module,'') <> 'cash_delete'
             )`,
        );
        zeroed += zeroCount || 0;
      }
      if (recomputed || zeroed) {
        console.log(
          `  [${dbName}] recompute: ${recomputed} party güncellendi, ${zeroed} ledger boş parti 0'a çekildi`,
        );
      }
    }

    return { scopes: scopes.length, orphans: totalOrphans, deleted: totalDeleted, samples, recomputed, zeroed };
  } finally {
    await c.end().catch(() => {});
  }
}

async function main() {
  console.log(`[${dryRun ? 'DRY-RUN' : 'APPLY'}] Orphan party_ledger_movements temizleyici`);
  console.log(`Bağlantı: ${user}@${host}:${port}/${maintenanceDb}`);
  console.log(`Mod: ${dryRun ? 'dry-run (silme yok)' : 'APPLY (silecek)'}`);
  console.log('');

  const dbs = await listDatabases();
  console.log(`Taranacak veritabanı: ${dbs.length} adet\n`);

  let grandTotal = { scopes: 0, orphans: 0, deleted: 0, recomputed: 0, zeroed: 0 };
  const dbReports = [];

  for (const db of dbs) {
    process.stdout.write(`→ ${db} ... `);
    try {
      const r = await cleanupDatabase(db);
      grandTotal.scopes += r.scopes;
      grandTotal.orphans += r.orphans;
      grandTotal.deleted += r.deleted;
      grandTotal.recomputed += r.recomputed;
      grandTotal.zeroed += r.zeroed;
      dbReports.push({ db, ...r });
      if (r.orphans === 0) console.log('temiz ✓');
      else console.log(`${r.orphans} yetim`);
    } catch (err) {
      console.log(`HATA: ${err.message}`);
    }
  }

  console.log('\n=== ÖZET ===');
  console.log(`Tenant scope:           ${grandTotal.scopes}`);
  console.log(`Yetim ledger satırı:    ${grandTotal.orphans}`);
  if (!dryRun) {
    console.log(`Silinen satır:          ${grandTotal.deleted}`);
    console.log(`Recompute edilen party: ${grandTotal.recomputed}`);
    console.log(`Sıfıra çekilen party:   ${grandTotal.zeroed}`);
  } else {
    console.log('(dry-run modu — silme yok. Uygulamak için --apply ekleyin)');
  }

  if (grandTotal.orphans > 0) {
    console.log('\n=== ETKİLENEN DB ===');
    for (const r of dbReports.filter((x) => x.orphans > 0)) {
      console.log(`  ${r.db}: ${r.orphans} yetim (${r.scopes} scope)`);
      for (const s of r.samples.slice(0, 3)) {
        console.log(
          `    ${s.scope}: ${s.count} satır — ilk: ${s.first?.transaction_type} ${s.first?.amount} (party=${s.first?.party_id?.slice(0, 8)}…)`,
        );
      }
    }
  }
}

main().catch((err) => {
  console.error('Script hatası:', err);
  process.exit(1);
});
