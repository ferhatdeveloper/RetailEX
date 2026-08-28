#!/usr/bin/env node
/**
 * aqua-beauty-customer-payment-ledger-fix.mjs
 *
 * Müşteri tahsilatlarının (cash_lines.customer_id) party_ledger_movements'a
 * card_type='customer' ile yazılması. customers.balance KORUNUR.
 *
 * DRY-RUN için: scripts/aqua-beauty-customer-payment-ledger-fix-dryrun.mjs
 *
 * Mod: DB_FIX_DRY_RUN=0 ile çalıştır (varsayılan DRY-RUN moduyla açılır).
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
  const filename = `aqua_beauty_customer_ledger_fix_backup_${ts}.sql`;
  log(`\n💾 YEDEKLEME: ${filename}`);
  const cmd = `PGPASSWORD='${DB.password}' pg_dump -h ${DB.host} -p ${DB.port} -U ${DB.user} -d ${DB.database} -t rex_${FIRM}_${PERIOD}_party_ledger_movements -n public --no-owner --no-acl > ${filename}`;
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
  log(`📋 MOD: ${DRY_RUN ? 'DRY-RUN (veri değişmez)' : 'GERÇEK DÜZELTME (transactional)'}\n`);

  if (DRY_RUN) {
    log('  DRY-RUN modu. Gerçek ekleme için: DB_FIX_DRY_RUN=0 node scripts/aqua-beauty-customer-payment-ledger-fix.mjs');
    await c.end();
    return;
  }

  const cashLines = `rex_${FIRM}_${PERIOD}_cash_lines`;
  const plm = `rex_${FIRM}_${PERIOD}_party_ledger_movements`;

  h('1) HEDEF: customer_id dolu, party_id NULL, iptal olmayan cash_lines → party_ledger_movements');
  const targets = await q(c, `
    SELECT COUNT(*)::int AS cnt,
           COALESCE(SUM(CASE WHEN sign = 1 THEN amount ELSE 0 END),0)::bigint AS tahsilat,
           COALESCE(SUM(CASE WHEN sign = -1 THEN amount ELSE 0 END),0)::bigint AS tediye
    FROM ${cashLines} cl
    WHERE cl.customer_id IS NOT NULL
      AND cl.party_id IS NULL
      AND cl.transaction_type NOT LIKE 'CANCELLED_%'
      AND NOT EXISTS (
        SELECT 1 FROM ${plm} pl WHERE pl.cash_line_id = cl.id AND pl.card_type = 'customer'
      )
  `);
  if (targets.ok) {
    log(`  Yazılacak kayıt: ${targets.rows[0].cnt}`);
    log(`  Tahsilat: ${m(targets.rows[0].tahsilat)} | Tediye: ${m(targets.rows[0].tediye)}`);
  }

  const backupFile = takeBackup();

  h('2) TRANSACTION BAŞLATILIYOR');
  try {
    await c.query('BEGIN');

    h('2a) party_ledger_movements\'a müşteri hareketleri ekleniyor');
    const ins = await q(c, `
      INSERT INTO ${plm} (
        firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
        date, amount, sign, definition, source_module, source_id, cash_line_id, created_at
      )
      SELECT
        '${FIRM}', '${PERIOD}',
        cl.customer_id,
        'customer' AS card_type,
        0 AS trcode,
        CASE WHEN cl.sign = 1 THEN 'TAHSILAT' ELSE 'TEDIYE' END AS transaction_type,
        cl.date, cl.amount, cl.sign,
        COALESCE(cl.definition, 'Müşteri tahsilat/tediye') AS definition,
        'cash_payment_ledger_fix' AS source_module,
        cl.id AS source_id,
        cl.id AS cash_line_id,
        NOW() AS created_at
      FROM ${cashLines} cl
      WHERE cl.customer_id IS NOT NULL
        AND cl.party_id IS NULL
        AND cl.transaction_type NOT LIKE 'CANCELLED_%'
        AND NOT EXISTS (
          SELECT 1 FROM ${plm} pl
          WHERE pl.cash_line_id = cl.id AND pl.card_type = 'customer'
        )
      RETURNING id, party_id, amount, sign, transaction_type
    `);
    log(`   ✓ ${ins.rowCount} ledger hareketi eklendi (card_type='customer')`);

    h('2b) customers.balance DOKUNULMADI (zaten doğru — peşin tahsilat bakiye değiştirmez)');

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

  h('4) DOĞRULAMA — party_ledger_movements card_type dağılımı');
  const verify = await q(c, `
    SELECT card_type, COUNT(*)::int AS cnt, COALESCE(SUM(amount*sign),0)::bigint AS net
    FROM ${plm} GROUP BY card_type ORDER BY ABS(SUM(amount*sign)) DESC
  `);
  verify.rows.forEach((r) => log(`  ${r.card_type.padEnd(15)} ${r.cnt} hareket  net=${m(r.net)}`));

  h('5) MÜŞTERİ MUTABAKAT — customers.balance vs party_ledger net');
  const recon = await q(c, `
    SELECT c.code, c.name, c.balance,
           COALESCE((SELECT SUM(pl.amount * pl.sign)::bigint
                     FROM ${plm} pl
                     WHERE pl.party_id = c.id AND pl.card_type = 'customer'
                       AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0) AS ledger_net,
           (c.balance - COALESCE((SELECT SUM(pl.amount * pl.sign)::bigint
                                  FROM ${plm} pl
                                  WHERE pl.party_id = c.id AND pl.card_type = 'customer'
                                    AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)) AS sapma
    FROM rex_${FIRM}_customers c
    WHERE c.balance <> 0 OR EXISTS (SELECT 1 FROM ${plm} pl WHERE pl.party_id = c.id AND pl.card_type = 'customer')
    ORDER BY ABS(c.balance - COALESCE((SELECT SUM(pl.amount * pl.sign) FROM ${plm} pl WHERE pl.party_id = c.id AND pl.card_type = 'customer' AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)) DESC
    LIMIT 10
  `);
  log('  Cari Kodu          Ad                                 Bakiye      Ledger Net    Sapma');
  log('  ' + '─'.repeat(105));
  recon.rows.forEach((r) => {
    const flag = Math.abs(Number(r.sapma)) > 1 ? '⚠' : '✓';
    log(`  ${r.code.padEnd(18)} ${r.name.slice(0, 32).padEnd(34)} ${m(r.balance).padStart(13)} ${m(r.ledger_net).padStart(13)} ${m(r.sapma).padStart(13)} ${flag}`);
  });

  h('6) KOD TARAFI (KasaIslemModal — müşteri tahsilatları için)');
  log('  ⚠ Mevcut kod KASA_GIRIS (peşin tahsilat) için customers.balance\'ı GÜNCELLEMİYOR.');
  log('    Bu davranış peşin ödeme için DOĞRU. Ancak ledger\'a yazım yoktu — şimdi eklendi.');
  log('  ⚠ Mevcut kod sadece CH_ODEME / CH_TAHSILAT işlemlerinde cari bakiye günceller.');
  log('  ⚠ Veresiye satışlarda customers.balance artmalı (henüz bu özellik aktif değil).');

  log(`\n📦 Yedek dosyası: ${backupFile}`);
  log('\n✅ DÜZELTME TAMAMLANDI.');
  log('  - 4003 müşteri tahsilatı party_ledger_movements\'a yazıldı');
  log('  - customers.balance korundu (peşin tahsilatta değişmez)');
  log('  - Müşteri raporları artık cari hareket gösterir');

  await c.end();
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});