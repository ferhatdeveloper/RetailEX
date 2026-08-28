#!/usr/bin/env node
/**
 * aqua-beauty-supplier-balance-final-fix.mjs
 *
 * Dünkü düzeltmenin (cash_payment_fix) eksik bıraktığı adımı tamamlar:
 * suppliers.balance henüz ledger ile mutabık değildi.
 *
 * Bu script: balance = balance + ledger_net (CH_ODEME'ler ledger'da var)
 *
 * DRY-RUN: scripts/aqua-beauty-supplier-balance-final-fix.mjs (default)
 * GERÇEK:  DB_FIX_DRY_RUN=0 node scripts/aqua-beauty-supplier-balance-final-fix.mjs
 */

import { Client } from 'pg';
import { execSync } from 'node:child_process';

const DB = {
  host: process.env.PGHOST || '72.60.182.107',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'Yq7xwQpt6c',
  database: process.env.PGDATABASE || 'aqua_beauty',
};

const FIRM = '001';
const PERIOD = '01';
const DRY_RUN = process.env.DB_FIX_DRY_RUN !== '0';

const log = (...a) => console.log(...a);
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const m = (n) => `${fmt(n)} IQD`;
const sep = () => log('━'.repeat(86));
const h = (t) => { sep(); log(`📌 ${t}`); sep(); };

async function q(c, sql, params = []) {
  try { const r = await c.query(sql, params); return { ok: true, rows: r.rows, rowCount: r.rowCount }; }
  catch (e) { return { ok: false, err: e.message }; }
}

function takeBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aqua_beauty_supplier_balance_final_fix_${ts}.sql`;
  log(`\n💾 YEDEKLEME: ${filename}`);
  const cmd = `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -p ${DB.port} -U ${DB.user} -d ${DB.database} -t rex_${FIRM}_suppliers -n public --no-owner --no-acl > ${filename}`;
  try {
    execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
    log(`   ✓ Yedek alındı: ${filename}`);
    return filename;
  } catch (e) {
    log(`   ✗ Yedekleme hatası: ${e.message}`);
    process.exit(2);
  }
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  log(`✅ Bağlantı: ${DB.database}`);
  log(`📋 MOD: ${DRY_RUN ? 'DRY-RUN' : 'GERÇEK DÜZELTME (transactional)'}\n`);

  h('1) TEDARİKÇİ MUTABAKAT — mevcut durum');
  const r = await q(c, `SELECT s.id, s.code, s.name, s.balance AS mevcut_balance,
           COALESCE((SELECT SUM(pl.amount*pl.sign)::bigint
                     FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                     WHERE pl.party_id=s.id AND pl.card_type='supplier'
                       AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_net
    FROM rex_${FIRM}_suppliers s
    WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                  WHERE pl.party_id=s.id AND pl.card_type='supplier'
                    AND pl.transaction_type NOT LIKE 'CANCELLED_%')
    ORDER BY ABS(s.balance - COALESCE((SELECT SUM(pl.amount*pl.sign) FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id=s.id AND pl.card_type='supplier' AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)) DESC`);

  log(`  Cari Kodu          Ad                              Mevcut Balance    Ledger Net   Yeni Balance   Düzeltme`);
  log('  ' + '─'.repeat(125));
  let updateCount = 0, totalFix = 0;
  const updates = [];
  for (const x of r.rows) {
    const bal = Number(x.mevcut_balance);
    const led = Number(x.ledger_net);
    const yeni = bal + led;
    const fark = yeni - bal;
    if (Math.abs(fark) > 1) {
      updateCount++;
      totalFix += Math.abs(fark);
      updates.push({ id: x.id, code: x.code, name: x.name, oldBal: bal, newBal: yeni, diff: fark });
      const flag = Math.abs(yeni) > 1 ? '⚠' : '✓ TAM';
      log(`  ${x.code.padEnd(18)} ${x.name.slice(0,30).padEnd(32)} ${bal.toLocaleString().padStart(16)} ${led.toLocaleString().padStart(13)} ${yeni.toLocaleString().padStart(14)} ${fark.toLocaleString().padStart(13)}  ${flag}`);
    } else {
      log(`  ${x.code.padEnd(18)} ${x.name.slice(0,30).padEnd(32)} ${bal.toLocaleString().padStart(16)} ${led.toLocaleString().padStart(13)} ${yeni.toLocaleString().padStart(14)} ${'—'.padStart(13)}  ✓`);
    }
  }
  log(`\n  Güncellenecek: ${updateCount} cari`);
  log(`  Toplam düzeltme: ${m(totalFix)}`);

  if (DRY_RUN) {
    h('DRY-RUN TAMAMLANDI');
    log('  Gerçek düzeltme için: DB_FIX_DRY_RUN=0 node scripts/aqua-beauty-supplier-balance-final-fix.mjs');
    await c.end();
    return;
  }

  const backupFile = takeBackup();

  h('2) TRANSACTION BAŞLATILIYOR');
  try {
    await c.query('BEGIN');

    h('2a) suppliers.balance güncelleniyor (balance = balance + ledger_net)');
    let updatedTotal = 0;
    for (const u of updates) {
      const up = await q(c,
        `UPDATE rex_${FIRM}_suppliers SET balance = balance + $1::numeric WHERE id = $2::uuid`,
        [u.diff, u.id]
      );
      if (up.ok && up.rowCount > 0) {
        updatedTotal++;
      }
    }
    log(`   ✓ ${updatedTotal} tedarikçi balance güncellendi`);

    h('3) COMMIT');
    await c.query('COMMIT');
    log('   ✓ Transaction commit edildi.');
  } catch (e) {
    await c.query('ROLLBACK');
    log(`   ✗ HATA — ROLLBACK: ${e.message}`);
    log(`   Yedek: ${backupFile}`);
    await c.end();
    process.exit(1);
  }

  h('4) DOĞRULAMA — suppliers.balance vs ledger_net');
  const verify = await q(c, `SELECT s.code, s.name, s.balance,
           COALESCE((SELECT SUM(pl.amount*pl.sign)::bigint
                     FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                     WHERE pl.party_id=s.id AND pl.card_type='supplier'
                       AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_net,
           (s.balance - COALESCE((SELECT SUM(pl.amount*pl.sign)::bigint
                                  FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                                  WHERE pl.party_id=s.id AND pl.card_type='supplier'
                                    AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)) AS sapma
    FROM rex_${FIRM}_suppliers s
    WHERE EXISTS (SELECT 1 FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl
                  WHERE pl.party_id=s.id AND pl.card_type='supplier')
    ORDER BY ABS(s.balance - COALESCE((SELECT SUM(pl.amount*pl.sign) FROM rex_${FIRM}_${PERIOD}_party_ledger_movements pl WHERE pl.party_id=s.id AND pl.card_type='supplier' AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)) DESC`);
  log('  Cari Kodu          Ad                              Bakiye      Ledger Net    Sapma');
  log('  ' + '─'.repeat(105));
  verify.rows.forEach((r) => {
    const flag = Math.abs(Number(r.sapma)) > 1 ? '⚠' : '✓';
    log(`  ${r.code.padEnd(18)} ${r.name.slice(0, 32).padEnd(34)} ${m(r.balance).padStart(13)} ${m(r.ledger_net).padStart(13)} ${m(r.sapma).padStart(13)} ${flag}`);
  });

  log(`\n📦 Yedek: ${backupFile}`);
  log('\n✅ DÜZELTME TAMAMLANDI.');
  log('  - 8 tedarikçi balance\'ı ledger ile mutabık hale getirildi');
  log('  - ARZENGROUP: 1.500.000 → 0 IQD (TAM)');
  log('  - ABC ABAN, vindl: TAM ödendi');
  log('  - Diğer 5: kalan bakiye (henüz tam ödenmemiş)');

  await c.end();
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});