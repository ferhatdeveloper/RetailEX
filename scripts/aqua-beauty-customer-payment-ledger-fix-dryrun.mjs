#!/usr/bin/env node
/**
 * aqua-beauty-customer-payment-ledger-fix-dryrun.mjs
 *
 * Müşteri tahsilatlarının (cash_lines KASA_GIRIS, customer_id dolu)
 * party_ledger_movements tablosuna card_type='customer' ile yazılması.
 *
 * Tedarikçi düzeltmesinden farkı: customers.balance GÜNCELLENMİYOR (zaten
 * doğru — peşin tahsilatta bakiye değişmez). Yalnızca cari hareket
 * (ledger) takibi için kayıt oluşturuluyor.
 *
 * Modlar:
 *   DB_FIX_DRY_RUN=1  → Sadece rapor (default)
 *   DB_FIX_DRY_RUN=0  → Gerçek değişiklik (transactional)
 */

import { Client } from 'pg';
import { writeFileSync } from 'node:fs';

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

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  log(`✅ Bağlantı: ${DB.database}`);
  log(`📋 MOD: ${DRY_RUN ? 'DRY-RUN (veri değişmez)' : 'GERÇEK DÜZELTME (transactional)'}\n`);

  const cashLines = `rex_${FIRM}_${PERIOD}_cash_lines`;
  const plm = `rex_${FIRM}_${PERIOD}_party_ledger_movements`;

  h('1) MÜŞTERİ TAHSİLATLARI — party_ledger\'a yazılacak (cash_lines KASA_GIRIS, customer_id dolu)');
  // Önce customer hareketi olarak yazılmış olanları çıkar
  const sql = `
    SELECT cl.id, cl.fiche_no, cl.date::date AS tarih, cl.amount, cl.sign, cl.transaction_type,
           cl.customer_id, cl.party_id, cl.definition,
           c.code AS cust_code, c.name AS cust_name, c.balance AS cust_bakiye
    FROM ${cashLines} cl
    INNER JOIN rex_${FIRM}_customers c ON c.id = cl.customer_id
    WHERE cl.customer_id IS NOT NULL
      AND cl.party_id IS NULL
      AND cl.transaction_type NOT LIKE 'CANCELLED_%'
      AND NOT EXISTS (
        SELECT 1 FROM ${plm} pl
        WHERE pl.cash_line_id = cl.id AND pl.card_type = 'customer'
      )
    ORDER BY cl.date
    LIMIT 10
  `;
  const sample = await q(c, sql);
  log(`İlk 10 örnek:`);
  if (sample.ok) {
    sample.rows.forEach((r) => {
      log(`  ${String(r.fiche_no).padEnd(20)} ${String(r.tarih)} sign=${r.sign > 0 ? '+' : '-'}${m(r.amount)} | ${r.cust_code} (${(r.cust_name || '').slice(0, 25)}) bal=${m(r.cust_bakiye)} | ${r.transaction_type}`);
    });
  }

  h('2) TOPLAM YAZILACAK KAYITLAR');
  const totalSql = `
    SELECT COUNT(*)::int AS toplam,
           COALESCE(SUM(CASE WHEN sign = 1 THEN amount ELSE 0 END),0)::bigint AS tahsilat,
           COALESCE(SUM(CASE WHEN sign = -1 THEN amount ELSE 0 END),0)::bigint AS tediye,
           COALESCE(SUM(amount * sign),0)::bigint AS net
    FROM ${cashLines} cl
    WHERE cl.customer_id IS NOT NULL
      AND cl.party_id IS NULL
      AND cl.transaction_type NOT LIKE 'CANCELLED_%'
      AND NOT EXISTS (
        SELECT 1 FROM ${plm} pl
        WHERE pl.cash_line_id = cl.id AND pl.card_type = 'customer'
      )
  `;
  const tot = await q(c, totalSql);
  if (tot.ok) {
    const r = tot.rows[0];
    log(`  Yazılacak kayıt: ${r.toplam}`);
    log(`  Tahsilat (sign=+1): ${m(r.tahsilat)}`);
    log(`  Tediye (sign=-1): ${m(r.tediye)}`);
    log(`  Net (müşteri hareketi): ${m(r.net)}`);
  }

  h('3) CARİ BAZLI ÖZET — yazılacak kayıtlar');
  const byCust = await q(c, `
    SELECT c.code, c.name,
           COUNT(*)::int AS hareket,
           COALESCE(SUM(CASE WHEN cl.sign = 1 THEN cl.amount ELSE 0 END),0)::bigint AS tahsilat,
           COALESCE(SUM(CASE WHEN cl.sign = -1 THEN cl.amount ELSE 0 END),0)::bigint AS tediye,
           COALESCE(SUM(cl.amount * cl.sign),0)::bigint AS net,
           c.balance AS mevcut_bakiye
    FROM ${cashLines} cl
    INNER JOIN rex_${FIRM}_customers c ON c.id = cl.customer_id
    WHERE cl.customer_id IS NOT NULL
      AND cl.party_id IS NULL
      AND cl.transaction_type NOT LIKE 'CANCELLED_%'
      AND NOT EXISTS (
        SELECT 1 FROM ${plm} pl
        WHERE pl.cash_line_id = cl.id AND pl.card_type = 'customer'
      )
    GROUP BY c.code, c.name, c.balance
    ORDER BY ABS(COALESCE(SUM(cl.amount * cl.sign), 0)) DESC
    LIMIT 20
  `);
  if (byCust.ok) {
    log(`  Cari Kodu          Ad                              Hareket  Tahsilat       Tediye         Net       Mevcut Bakiye`);
    log('  ' + '─'.repeat(125));
    byCust.rows.forEach((r) => {
      log(`  ${r.code.padEnd(18)} ${r.name.slice(0, 28).padEnd(32)} ${String(r.hareket).padStart(7)} ${m(r.tahsilat).padStart(14)} ${m(r.tediye).padStart(14)} ${m(r.net).padStart(14)} ${m(r.mevcut_bakiye).padStart(14)}`);
    });
  }

  h('4) UYARI — customers.balance DOKUNULMAYACAK');
  log('  Bu düzeltme SADECE party_ledger_movements\'a kayıt ekler.');
  log('  customers.balance KORUNUR (peşin tahsilatta bakiye değişmez — NORMAL muhasebe kuralı).');
  log('  Müşteri bakiyeleri sadece veresiye satışlarda veya CH_ODEME/CH_TAHSILAT işlemlerinde değişir.');

  if (DRY_RUN) {
    h('DRY-RUN TAMAMLANDI');
    log('  Gerçek değişiklik için: DB_FIX_DRY_RUN=0 node scripts/aqua-beauty-customer-payment-ledger-fix.mjs');
    await c.end();
    return;
  }

  h('5) TRANSACTION — ledger\'a yazılıyor');
  try {
    await c.query('BEGIN');

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
    log(`  ✓ ${ins.rowCount} ledger hareketi eklendi (card_type='customer')`);

    await c.query('COMMIT');
    log('  ✓ Transaction commit edildi.');
  } catch (e) {
    await c.query('ROLLBACK');
    log(`  ✗ HATA — ROLLBACK: ${e.message}`);
    await c.end();
    process.exit(1);
  }

  h('6) DOĞRULAMA');
  const verify = await q(c, `
    SELECT card_type, COUNT(*)::int AS cnt, COALESCE(SUM(amount*sign),0)::bigint AS net
    FROM ${plm}
    GROUP BY card_type
    ORDER BY ABS(SUM(amount*sign)) DESC
  `);
  log('  party_ledger_movements card_type dağılımı (düzeltme sonrası):');
  verify.rows.forEach((r) => log(`    ${r.card_type.padEnd(15)} ${r.cnt} hareket  net=${m(r.net)}`));

  log('\n✅ DÜZELTME TAMAMLANDI.');
  log('  - customers.balance DOKUNULMADI (zaten doğru)');
  log('  - party_ledger_movements\'a müşteri kart hareketleri eklendi');
  log('  - Raporlarda müşteri tahsilatları artık görünecek');

  await c.end();
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});