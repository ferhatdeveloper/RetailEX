#!/usr/bin/env node
/**
 * Tedarikçi mutabakatı:
 *   suppliers.balance (DB'deki güncel bakiye)
 *   vs
 *   cash_lines (CH_ODEME) + party_ledger_movements (CH_ODEME_PARTNER) net toplamı
 *
 * Eğer fark varsa → ya supplier.balance yanlış, ya cash_lines party_id'de değil,
 * ya da ledger kaydı eksik.
 *
 * SONUÇ: Tedarikçi kodu (code) bazında tablo.
 */

import { Client } from 'pg';

const DB = {
  host: '72.60.182.107', port: 5432, user: 'postgres', password: 'Yq7xwQpt6c',
  database: 'aqua_beauty',
};
const FIRM = '001';

const m = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  console.log('✅ Bağlantı: ' + DB.database + '\n');

  // Dönemleri bul
  const periods = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'rex_${FIRM}_%_cash_lines'
    ORDER BY table_name
  `);
  const periodList = periods.rows.map(r => {
    const m = r.table_name.match(/rex_\d+_(\d+)_cash_lines/);
    return m ? m[1] : null;
  }).filter(Boolean);

  console.log('═══ TEDARİKÇİ BAKİYE MUTABAKATI ═══\n');
  console.log('Tedarikçi kodu bazında:');
  console.log('   balance (DB)         : suppliers.balance güncel');
  console.log('   cash_lines net       : CH_ODEME toplamı (party_id veya customer_id üzerinden)');
  console.log('   ledger net           : party_ledger_movements CH_ODEME_PARTNER net');
  console.log('   beklenen = 0 - cash  : mutabakat için balance bu olmalıydı');
  console.log('   FARK (DB - beklenen) : pozitif = balance fazla, negatif = eksik\n');

  // Tedarikçi listesi
  const sups = await c.query(`
    SELECT id, code, name, balance FROM rex_${FIRM}_suppliers
    WHERE balance != 0
       OR id IN (SELECT party_id FROM rex_${FIRM}_01_party_ledger_movements WHERE card_type = 'supplier')
       OR id IN (SELECT party_id FROM rex_${FIRM}_${periodList[0] || '01'}_cash_lines WHERE party_id IS NOT NULL)
    ORDER BY code
  `);

  let totalDiff = 0;
  let errorCount = 0;

  console.log('KOD                 TEDARİKÇİ                       balance (DB)        cash net         ledger net        beklenen         FARK');
  console.log('─'.repeat(160));

  for (const s of sups.rows) {
    let cashNet = 0;
    let ledgerNet = 0;
    let cashInWrongCol = 0;

    // cash_lines tüm dönemlerde CH_ODEME net toplamı
    for (const p of periodList) {
      // party_id ile (doğru kolon)
      const r1 = await c.query(`
        SELECT COALESCE(SUM(amount*sign), 0) AS net FROM rex_${FIRM}_${p}_cash_lines
        WHERE party_id = $1::uuid AND transaction_type = 'CH_ODEME'
          AND transaction_type NOT LIKE 'CANCELLED_%'
      `, [s.id]);
      cashNet += Number(r1.rows[0]?.net || 0);

      // customer_id ile (eski/hatalı konum — tedarikçi UUID buraya yazılmışsa)
      const r2 = await c.query(`
        SELECT COALESCE(SUM(amount*sign), 0) AS net FROM rex_${FIRM}_${p}_cash_lines
        WHERE customer_id = $1::uuid AND transaction_type = 'CH_ODEME'
          AND transaction_type NOT LIKE 'CANCELLED_%'
      `, [s.id]);
      cashInWrongCol += Number(r2.rows[0]?.net || 0);

      // ledger
      const r3 = await c.query(`
        SELECT COALESCE(SUM(amount*sign), 0) AS net FROM rex_${FIRM}_${p}_party_ledger_movements
        WHERE party_id = $1::uuid AND card_type = 'supplier'
          AND transaction_type NOT LIKE 'CANCELLED_%'
      `, [s.id]);
      ledgerNet += Number(r3.rows[0]?.net || 0);
    }

    // Beklenen: bize ödenen miktar = kasa çıkışı (negatif işaretli)
    // suppliers.balance = pozitif = bize olan borç (firma bakışından alacak)
    // Tedarikçiye ödeme = cash_lines (sign=-1) → suppliers.balance azalmalı
    // Yani: balance = 0 - cashNet (eğer sadece ödemeler varsa)
    // Daha doğru: balance = ledgerNet (her tedarikçi hareketi ledger'a yazılmalı)
    const beklenen = -cashNet;
    const fark = Number(s.balance) - beklenen;

    const code = String(s.code || '?').padEnd(20);
    const name = String(s.name || '?').slice(0, 30).padEnd(30);
    const bal = String(m(s.balance)).padStart(15);
    const cash = String(m(cashNet)).padStart(13);
    const led = String(m(ledgerNet)).padStart(15);
    const bek = String(m(beklenen)).padStart(15);
    const fk = String(m(fark)).padStart(13);
    const marker = Math.abs(fark) > 0.01 ? '❌' : '✅';
    console.log(`${code} ${name} ${bal} ${cash} ${led} ${bek} ${fk} ${marker}`);

    if (cashInWrongCol !== 0) {
      console.log(`  ⚠️  customer_id'de CH_ODEME: ${m(cashInWrongCol)} IQD (yanlış alanda!)`);
    }

    if (Math.abs(fark) > 0.01) {
      totalDiff += fark;
      errorCount++;
    }
  }

  console.log('─'.repeat(160));
  console.log(`\nÖZET:`);
  console.log(`   Sorgulanan tedarikçi: ${sups.rows.length}`);
  console.log(`   Mutabakat hatası: ${errorCount}`);
  console.log(`   Toplam fark: ${m(totalDiff)} IQD`);
  if (errorCount > 0) {
    console.log(`\n⚠️  Bu tedarikçilerin balance alanı ya cash_lines toplamıyla uyumsuz.`);
    console.log(`   Yeni kod (resolveCariAccountKind) gelecekte bu sorunu önler.`);
  } else {
    console.log(`\n✅ Tüm tedarikçi bakiyeleri mutabık.`);
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
