#!/usr/bin/env node
/**
 * aqua-beauty-supplier-payment-fix.mjs
 *
 * Tedarikçi ödemelerinde supplier UUID yanlışlıkla customer_id alanına yazılmış
 * kayıtları düzeltir. Transactional; otomatik yedek alır.
 *
 * 1) YEDEKLEME — pg_dump ile suppliers + cash_lines + party_ledger snapshot
 * 2) cash_lines.customer_id NULL yapılır, party_id supplier UUID yapılır
 * 3) suppliers.balance düşürülür (sign=-1 ödemeler için)
 * 4) party_ledger_movements'a CH_ODEME satırları yazılır (card_type='supplier')
 *
 * Modlar:
 *   DB_FIX_DRY_RUN=1  → Sadece rapor (default)
 *   DB_FIX_DRY_RUN=0  → Gerçek değişiklik (transactional)
 */

import { Client } from 'pg';
import { writeFileSync } from 'node:fs';
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
const sep = () => log('━'.repeat(86));
const h = (t) => { sep(); log(`📌 ${t}`); sep(); };
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const m = (n) => `${fmt(n)} IQD`;

async function q(c, sql, params = []) {
  try { const r = await c.query(sql, params); return { ok: true, rows: r.rows, rowCount: r.rowCount }; }
  catch (e) { return { ok: false, err: e.message }; }
}

function takeBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `aqua_beauty_supplier_fix_backup_${ts}.sql`;
  log(`\n💾 YEDEKLEME: ${filename}`);
  const cmd = `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -p ${DB.port} -U ${DB.user} -d ${DB.database} -t rex_${FIRM}_suppliers -t rex_${FIRM}_${PERIOD}_cash_lines -t rex_${FIRM}_${PERIOD}_party_ledger_movements -n public --no-owner --no-acl > ${filename}`;
  try {
    execSync(cmd, { stdio: 'pipe', shell: '/bin/bash' });
    log(`   ✓ Yedek alındı: ${filename}`);
    return filename;
  } catch (e) {
    log(`   ✗ Yedekleme hatası: ${e.message}`);
    log(`   Devam etmek için yedek kritik; durduruluyor.`);
    process.exit(2);
  }
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  log(`✅ Bağlantı: ${DB.database}`);
  log(`📋 MOD: ${DRY_RUN ? 'DRY-RUN (veri değişmez)' : 'GERÇEK DÜZELTME (transactional)'}\n`);

  const cashLines = `rex_${FIRM}_${PERIOD}_cash_lines`;
  const suppliers = `rex_${FIRM}_suppliers`;
  const plm = `rex_${FIRM}_${PERIOD}_party_ledger_movements`;

  h('1) ETKİLENEN KAYITLAR — customer_id = supplier UUID olan cash_lines');
  const affected = await q(c, `
    SELECT cl.id, cl.fiche_no, cl.date::date AS tarih, cl.amount, cl.sign, cl.transaction_type,
           cl.customer_id, cl.party_id, cl.definition,
           s.code AS supplier_code, s.name AS supplier_name, s.balance AS supplier_bakiye
    FROM ${cashLines} cl
    INNER JOIN ${suppliers} s ON s.id = cl.customer_id
    WHERE cl.transaction_type NOT LIKE 'CANCELLED_%'
    ORDER BY cl.date
  `);
  if (!affected.ok) { console.error('HATA:', affected.err); process.exit(1); }
  log(`Etkilenen kayıt sayısı: ${affected.rows.length}`);
  if (affected.rows.length === 0) {
    log('  ℹ Düzeltilecek kayıt yok.');
    await c.end();
    return;
  }

  affected.rows.forEach((r) => {
    log(`  ${String(r.fiche_no).padEnd(20)} ${String(r.tarih)} ${r.supplier_code.padEnd(12)} ${r.transaction_type.padEnd(12)} ${m(Number(r.amount) * r.sign).padStart(14)} | bal: ${m(r.supplier_bakiye)}`);
  });

  let totalReduction = 0;
  affected.rows.forEach((r) => { totalReduction += Number(r.amount); });

  h('2) UYGULAMA PLANI');
  log(`  - ${affected.rows.length} cash_lines düzeltilecek (customer_id → party_id)`);
  log(`  - ${affected.rows.length} suppliers.balance güncellenecek (toplam düşüş: ${m(totalReduction)})`);
  log(`  - ${affected.rows.length} party_ledger_movements satırı eklenecek`);

  if (DRY_RUN) {
    h('DRY-RUN TAMAMLANDI');
    log('  Gerçek değişiklik için: DB_FIX_DRY_RUN=0 node scripts/aqua-beauty-supplier-payment-fix.mjs');
    await c.end();
    return;
  }

  // Yedek
  const backupFile = takeBackup();

  h('3) TRANSACTION BAŞLATILIYOR');
  try {
    await c.query('BEGIN');

    h('3a) cash_lines: customer_id NULL, party_id = supplier UUID');
    const upd1 = await q(c, `
      UPDATE ${cashLines} cl
      SET customer_id = NULL,
          party_id = s.id
      FROM ${suppliers} s
      WHERE s.id = cl.customer_id
        AND cl.transaction_type NOT LIKE 'CANCELLED_%'
        AND cl.party_id IS NULL
        AND cl.transaction_type = 'CH_ODEME'
        AND cl.sign = -1
      RETURNING cl.id, cl.fiche_no, cl.party_id
    `);
    log(`   ✓ ${upd1.rowCount} cash_lines güncellendi (customer_id NULL, party_id=supplier)`);

    h('3b) suppliers.balance düşürülüyor (CH_ODEME ödemeleri)');
    const upd2 = await q(c, `
      UPDATE ${suppliers} s
      SET balance = s.balance - COALESCE(p.total_payment, 0)
      FROM (
        SELECT party_id, SUM(amount)::numeric AS total_payment
        FROM ${cashLines}
        WHERE transaction_type = 'CH_ODEME'
          AND sign = -1
          AND party_id IS NOT NULL
          AND transaction_type NOT LIKE 'CANCELLED_%'
        GROUP BY party_id
      ) p
      WHERE s.id = p.party_id
      RETURNING s.code, s.name, s.balance
    `);
    log(`   ✓ ${upd2.rowCount} suppliers.balance güncellendi:`);
    upd2.rows.forEach((r) => log(`     ${r.code} (${r.name}) → yeni bakiye: ${m(r.balance)}`));

    h('3c) party_ledger_movements: CH_ODEME kayıtları ekleniyor');
    // Önce bu ödemeler için ledger kaydı var mı kontrol et
    const existing = await q(c, `
      SELECT cash_line_id FROM ${plm}
      WHERE cash_line_id IS NOT NULL AND source_module = 'cash_payment_fix'
    `);
    const existingIds = new Set(existing.ok ? existing.rows.map((r) => r.cash_line_id) : []);
    log(`   Mevcut fix kayıtları: ${existingIds.size} (yeniden eklenmeyecek)`);

    const ins = await q(c, `
      INSERT INTO ${plm} (
        firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
        date, amount, sign, definition, source_module, source_id, cash_line_id, created_at
      )
      SELECT
        '${FIRM}', '${PERIOD}',
        cl.party_id,
        'supplier' AS card_type,
        0 AS trcode,
        'CH_ODEME' AS transaction_type,
        cl.date, cl.amount, cl.sign,
        COALESCE(cl.definition, 'CH_ODEME') AS definition,
        'cash_payment_fix' AS source_module,
        cl.id AS source_id,
        cl.id AS cash_line_id,
        NOW() AS created_at
      FROM ${cashLines} cl
      WHERE cl.transaction_type = 'CH_ODEME'
        AND cl.sign = -1
        AND cl.party_id IS NOT NULL
        AND cl.transaction_type NOT LIKE 'CANCELLED_%'
        AND NOT EXISTS (
          SELECT 1 FROM ${plm} pl
          WHERE pl.cash_line_id = cl.id AND pl.source_module = 'cash_payment_fix'
        )
      RETURNING id, party_id, amount, transaction_type
    `);
    log(`   ✓ ${ins.rowCount} ledger hareketi eklendi`);
    ins.rows.forEach((r) => log(`     ledger id=${String(r.id).slice(0, 8)}... party=${String(r.party_id).slice(0, 8)}... amount=${m(r.amount)} ${r.transaction_type}`));

    h('4) COMMIT');
    await c.query('COMMIT');
    log('   ✓ Transaction commit edildi.');
  } catch (e) {
    await c.query('ROLLBACK');
    log('   ✗ HATA — ROLLBACK:', e.message);
    log(`   Yedek: ${backupFile}`);
    await c.end();
    process.exit(1);
  }

  h('5) DOĞRULAMA — düzeltme sonrası');
  // cash_lines: artık bu supplier UUID'leri party_id'de olmalı, customer_id NULL olmalı
  const verify = await q(c, `
    SELECT cl.id, cl.fiche_no, cl.customer_id, cl.party_id,
           s.code AS supplier_code, s.balance AS new_bakiye
    FROM ${cashLines} cl
    LEFT JOIN ${suppliers} s ON s.id = cl.party_id
    WHERE cl.transaction_type = 'CH_ODEME'
      AND cl.sign = -1
      AND cl.party_id IS NOT NULL
    ORDER BY cl.date
  `);
  log('   Düzeltme sonrası cash_lines:');
  log('   Fiş No              customer_id  party_id (sup)              Yeni Bakiye');
  log('   ' + '─'.repeat(95));
  verify.rows.forEach((r) => {
    log(`   ${String(r.fiche_no).padEnd(20)} ${r.customer_id ? 'DOLU' : 'NULL'.padEnd(11)} ${String(r.supplier_code || '?').padEnd(12)} ${m(r.new_bakiye)}`);
  });

  // Ledger toplamı vs supplier balance
  const ledgerTotals = await q(c, `
    SELECT s.code, s.name, s.balance AS supplier_bakiye,
           COALESCE((SELECT SUM(pl.amount * pl.sign)
                     FROM ${plm} pl
                     WHERE pl.party_id = s.id AND pl.card_type='supplier'
                       AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)::bigint AS ledger_net
    FROM ${suppliers} s
    WHERE s.balance <> 0 OR EXISTS (SELECT 1 FROM ${plm} pl WHERE pl.party_id=s.id AND pl.card_type='supplier')
    ORDER BY ABS(s.balance) DESC
  `);
  h('6) MUTABAKAT — supplier.balance vs ledger net');
  log('   Tedarikçi      Bakiye     Ledger Net    Fark');
  log('   ' + '─'.repeat(80));
  let totBakiye = 0, totLedger = 0, totDiff = 0;
  ledgerTotals.rows.forEach((r) => {
    const diff = Number(r.supplier_bakiye) - Number(r.ledger_net);
    totBakiye += Number(r.supplier_bakiye);
    totLedger += Number(r.ledger_net);
    totDiff += diff;
    const flag = Math.abs(diff) > 1 ? '⚠' : '✓';
    log(`   ${r.code.padEnd(15)} ${m(r.supplier_bakiye).padStart(12)} ${m(r.ledger_net).padStart(12)} ${m(diff).padStart(12)} ${flag}`);
  });
  log('   ' + '─'.repeat(80));
  log(`   ${'TOPLAM'.padEnd(15)} ${m(totBakiye).padStart(12)} ${m(totLedger).padStart(12)} ${m(totDiff).padStart(12)}`);

  if (Math.abs(totDiff) > 100) {
    log('\n   ⚠ UYARI: Hâlâ önemli fark var. Düzeltme yetersiz olabilir.');
  } else {
    log('\n   ✅ Mutabakat yakalandı.');
  }

  log(`\n📦 Yedek dosyası: ${backupFile}`);
  log(`\n✅ DÜZELTME TAMAMLANDI.`);
  await c.end();
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});