#!/usr/bin/env node
/**
 * aqua-beauty-supplier-payment-fix-dryrun.mjs
 *
 * DRY-RUN — Tedarikçi ödemelerinde supplier UUID yanlışlıkla customer_id alanına
 * yazılmış kayıtları tespit eder. Gerçek veri değiştirmez.
 *
 * Hedef: cash_lines.customer_id içinde rex_001_suppliers.id olan satırlar.
 * Bunların party_id NULL — doğrusu customer_id yerine party_id olmalıydı.
 *
 * Çıktı: hangi cash_lines taşınacak, hangi supplier balance'ları düşecek,
 * kaç ledger hareketi geriye dönük yazılacak — hepsi rapor.
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

const log = (...a) => console.log(...a);
const sep = () => log('━'.repeat(86));
const h = (t) => { sep(); log(`📌 ${t}`); sep(); };
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const m = (n) => `${fmt(n)} IQD`;

async function q(c, sql, params = []) {
  try { const r = await c.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: e.message }; }
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  log(`✅ Bağlantı: ${DB.database}`);
  log(`📋 MOD: DRY-RUN — veri değiştirmez.\n`);

  const cashLines = `rex_${FIRM}_${PERIOD}_cash_lines`;
  const suppliers = `rex_${FIRM}_suppliers`;
  const plm = `rex_${FIRM}_${PERIOD}_party_ledger_movements`;

  h('1) ETKİLENEN KAYITLAR — customer_id = supplier UUID olan cash_lines');
  const sql = `
    SELECT cl.id, cl.fiche_no, cl.date::date AS tarih, cl.amount, cl.sign, cl.transaction_type,
           cl.customer_id, cl.party_id, cl.definition,
           s.code AS supplier_code, s.name AS supplier_name, s.balance AS supplier_bakiye
    FROM ${cashLines} cl
    INNER JOIN ${suppliers} s ON s.id = cl.customer_id
    WHERE cl.transaction_type NOT LIKE 'CANCELLED_%'
    ORDER BY cl.date
  `;
  const affected = await q(c, sql);
  if (!affected.ok) { console.error('HATA:', affected.err); process.exit(1); }
  log(`Etkilenen kayıt sayısı: ${affected.rows.length}`);
  log(`  Fiş No              Tarih      Hareket     Tutar        Tedarikçi                    Mevcut Bakiye`);
  log('  ' + '─'.repeat(110));
  let totalPayment = 0;
  for (const r of affected.rows) {
    const tutar = Number(r.amount) * r.sign;
    totalPayment += Math.abs(tutar);
    log(`  ${String(r.fiche_no).padEnd(20)} ${String(r.tarih)} ${r.transaction_type.padEnd(12)} ${m(tutar).padStart(14)} ${(r.supplier_code + ' ' + r.supplier_name).slice(0, 28).padEnd(28)} ${m(r.supplier_bakiye).padStart(15)}`);
  }
  log(`\n  TOPLAM ÖDEME: ${m(totalPayment)} (negatif = kasadan çıkan para)`);

  h('2) DÜZELTME SONRASI TEDARİKÇİ BAKİYELERİ (beklenen)');
  log('  Tedarikçi Kodu  Ad                                Mevcut     Düşülecek    Yeni Bakiye');
  log('  ' + '─'.repeat(95));
  let totalReduction = 0;
  for (const r of affected.rows) {
    const tutar = Number(r.amount); // sign=-1, abs = ödeme tutarı
    totalReduction += tutar;
    const newBalance = Number(r.supplier_bakiye) - tutar;
    log(`  ${r.supplier_code.padEnd(16)} ${r.supplier_name.slice(0, 32).padEnd(34)} ${m(r.supplier_bakiye).padStart(12)} ${m(tutar).padStart(12)} ${m(newBalance).padStart(12)}`);
  }
  log(`\n  TOPLAM DÜŞÜM: ${m(totalReduction)}`);

  h('3) PARTY_LEDGER HAREKETİ YAZILACAK KAYITLAR (geriye dönük)');
  log('  Fiş No              Tarih      Tedarikçi       Hareket      sign    amount');
  log('  ' + '─'.repeat(95));
  for (const r of affected.rows) {
    log(`  ${String(r.fiche_no).padEnd(20)} ${String(r.tarih)} ${r.supplier_code.padEnd(16)} CH_ODEME       ${String(r.sign).padStart(8)} ${m(r.amount).padStart(13)}`);
  }

  h('4) ÖNEMLİ UYARILAR');
  log('  ⚠ Bu düzeltme sonrası:');
  log('    - cash_lines.party_id tedarikçi UUID olacak');
  log('    - cash_lines.customer_id NULL olacak');
  log('    - suppliers.balance düşecek (borç gerçekten azalmış olacak)');
  log('    - party_ledger_movements\'a CH_ODEME satırları eklenecek');
  log('');
  log('  ⚠ AYRICA: cash_lines.customer_id NULL olan başka kayıtlar varsa onlar etkilenmez.');
  log('  ⚠ AYRICA: Eğer bir supplier için HEM customer_id hem party_id doluysa (nadir durum)');
  log('     sadece customer_id NULL yapılır; party_id olduğu gibi kalır.');

  h('5) MEVCUT PARTİCİPANT BAKİYE TUTARLILIĞI');
  // suppliers.balance eşit mi party_ledger toplamı?
  const recon = await q(c, `
    SELECT s.code, s.name, s.balance AS supplier_bakiye,
           COALESCE((SELECT SUM(pl.amount * pl.sign)
                     FROM ${plm} pl
                     WHERE pl.party_id = s.id AND pl.card_type='supplier'
                       AND pl.transaction_type NOT LIKE 'CANCELLED_%'), 0)::bigint AS ledger_net
    FROM ${suppliers} s
    WHERE s.balance <> 0 OR EXISTS (SELECT 1 FROM ${plm} pl WHERE pl.party_id=s.id AND pl.card_type='supplier')
  `);
  if (recon.ok) {
    log('  Tedarikçi      Mevcut Bakiye     Ledger Net (CH_ODEME sonrası beklenen)');
    log('  ' + '─'.repeat(90));
    let bakiyeTotal = 0, ledgerTotal = 0;
    recon.rows.forEach(r => {
      bakiyeTotal += Number(r.supplier_bakiye);
      ledgerTotal += Number(r.ledger_net);
    });
    log(`  TOPLAM          ${m(bakiyeTotal).padStart(15)}    ${m(ledgerTotal).padStart(15)}`);
    log(`  FARK            ${m(bakiyeTotal - ledgerTotal).padStart(15)} ← Düzeltme sonrası bu kapanmalı`);
  }

  h('DRY-RUN TAMAMLANDI — HİÇBİR VERİ DEĞİŞMEDİ');
  log('  Çalıştırmak için: DB_FIX_DRY_RUN=0 node scripts/aqua-beauty-supplier-payment-fix.mjs');

  const outPath = `supplier-payment-fix-dryrun-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(outPath, JSON.stringify({ affected_rows: affected.rows, total_payment: totalPayment, total_reduction: totalReduction }, null, 2));
  log(`\n📝 JSON dump: ${outPath}`);

  await c.end();
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});