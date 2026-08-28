#!/usr/bin/env node
/**
 * Tedarikçi ödemelerinin cash_lines'ta doğru kolona yazılıp yazılmadığını denetler.
 *
 * Yeni davranış:
 *   - customer_id   ↔ customers tablosunda var
 *   - party_id NULL  → CH_TAHSILAT (müşteri tahsilatı) veya eski/hatalı tedarikçi kaydı
 *   - party_id dolu  → CH_ODEME tedarikçi/personel/ortak
 *
 * Hata tipleri:
 *   - T1: customer_id dolu + customers tablosunda YOK (orphan müşteri ID)
 *   - T2: customer_id dolu + suppliers tablosunda VAR (tedarikçi UUID yanlış alanda)
 *   - T3: party_id dolu + suppliers/parties tablosunda YOK (orphan party ID)
 *   - T4: customer_id NULL ama suppliers/parties'de var (tedarikçi ödemesi düzgün yazılmış ✓)
 *
 * Yeni kod resolveCariAccountKind() bu testin DB karşılığıdır.
 */

import { Client } from 'pg';

const DB = {
  host: '72.60.182.107', port: 5432, user: 'postgres', password: 'Yq7xwQpt6c', database: 'aqua_beauty',
};
const FIRM = '001';

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  console.log('✅ Bağlantı: ' + DB.database + '\n');

  const periods = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE 'rex_${FIRM}_%_cash_lines'
    ORDER BY table_name
  `);
  const periodList = periods.rows.map(r => {
    // rex_001_01_cash_lines → 01
    const m = r.table_name.match(/rex_\d+_(\d+)_cash_lines/);
    return m ? m[1] : null;
  }).filter(Boolean);

  console.log('📋 TÜM cash_lines CH_ODEME/CH_TAHSILAT kayıtları sınıflandırma:\n');

  let t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0;
  let totalAmount = 0;

  for (const period of periodList) {
    console.log(`\n═══ DÖNEM ${period} ═══`);

    const r = await c.query(`
      SELECT
        cl.id, cl.fiche_no, cl.date, cl.amount, cl.sign,
        cl.transaction_type,
        cl.customer_id, cl.party_id,
        c.name AS customer_name, c.code AS customer_code,
        s.name AS supplier_name, s.code AS supplier_code,
        p.name AS party_name, p.code AS party_code, p.card_type AS party_card_type,
        CASE
          WHEN cl.customer_id IS NOT NULL AND c.id IS NOT NULL THEN 'T_OK_CUSTOMER'
          WHEN cl.customer_id IS NOT NULL AND c.id IS NULL AND s.id IS NOT NULL THEN 'T2_SUPPLIER_IN_CUSTOMER_ID'
          WHEN cl.customer_id IS NOT NULL AND c.id IS NULL AND p.id IS NOT NULL THEN 'T_PARTY_IN_CUSTOMER_ID'
          WHEN cl.customer_id IS NOT NULL AND c.id IS NULL THEN 'T1_ORPHAN_CUSTOMER_ID'
          WHEN cl.party_id IS NOT NULL AND s.id IS NOT NULL THEN 'T_OK_SUPPLIER'
          WHEN cl.party_id IS NOT NULL AND p.id IS NOT NULL THEN 'T_OK_PARTY'
          WHEN cl.party_id IS NOT NULL THEN 'T3_ORPHAN_PARTY_ID'
          ELSE 'T_NONE'
        END AS classification
      FROM rex_${FIRM}_${period}_cash_lines cl
      LEFT JOIN rex_${FIRM}_customers c ON cl.customer_id = c.id
      LEFT JOIN rex_${FIRM}_suppliers s ON cl.party_id = s.id AND cl.transaction_type = 'CH_ODEME'
      LEFT JOIN rex_${FIRM}_parties p ON cl.party_id = p.id AND cl.transaction_type <> 'CH_ODEME'
      WHERE cl.transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
      ORDER BY cl.date DESC
    `);

    const counts = {};
    let sumAmount = 0;
    for (const row of r.rows) {
      counts[row.classification] = (counts[row.classification] || 0) + 1;
      sumAmount += Number(row.amount || 0) * Number(row.sign || 0);
      totalAmount += Number(row.amount || 0) * Number(row.sign || 0);
    }

    for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      const lbl = {
        T_OK_CUSTOMER: '✅ Müşteri (doğru)',
        T_OK_SUPPLIER: '✅ Tedarikçi (doğru — yeni davranış)',
        T_OK_PARTY: '✅ Personel/Ortak (doğru)',
        T2_SUPPLIER_IN_CUSTOMER_ID: '❌ Tedarikçi yanlış alanda (ESKİ HATA)',
        T_PARTY_IN_CUSTOMER_ID: '⚠️ Personel/Ortak customer_id\'de (ESKİ HATA)',
        T1_ORPHAN_CUSTOMER_ID: '⚠️ Orphan customer_id (silinmiş müşteri?)',
        T3_ORPHAN_PARTY_ID: '⚠️ Orphan party_id',
        T_NONE: '— Boş (anlamsız işlem)',
      }[k] || k;
      console.log(`   ${String(v).padStart(4)} × ${lbl}`);
    }
    console.log(`   Net akış: ${sumAmount.toLocaleString('en-US')} IQD`);

    // Detay: T2 — Tedarikçi yanlış alanda
    const t2rows = r.rows.filter(x => x.classification === 'T2_SUPPLIER_IN_CUSTOMER_ID');
    if (t2rows.length > 0) {
      console.log(`\n   ⚠️ T2 DETAY (${t2rows.length} kayıt — supplier.balance etkilenmemiş!):`);
      for (const row of t2rows.slice(0, 10)) {
        console.log(
          `     ${String(row.fiche_no).padEnd(22)} ${String(row.date).slice(0, 10)} ` +
          `${Number(row.amount).toLocaleString().padStart(13)} ${row.transaction_type} ` +
          `→ ${row.supplier_code || '?'} ${row.supplier_name || '?'}`
        );
      }
      if (t2rows.length > 10) console.log(`     ... ve ${t2rows.length - 10} kayıt daha`);
    }
  }

  console.log('\n\n══════════════════════════════════════════════════════════════');
  console.log('ÖZET:');
  console.log(`   Toplam cash hareketi net: ${totalAmount.toLocaleString('en-US')} IQD`);
  console.log('   ⚠️ T2: Tedarikçi UUID customer_id alanında → supplier.balance güncellenmedi');
  console.log('   ⚠️ Bu kayıtlar yeni kod ile düzeltildikten sonra supplier.balance doğru olur.');

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
