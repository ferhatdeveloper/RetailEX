#!/usr/bin/env node
/**
 * Tüm RetailEX kiracılarında tedarikçi ödemelerinin doğru kolona yazılıp yazılmadığını denetler.
 *
 * Beklenen durum (yeni davranış):
 *   - CH_TAHSILAT → cash_lines.customer_id dolu (müşteri tahsilatı)
 *   - CH_ODEME tedarikçi/personel/ortak → cash_lines.party_id dolu, customer_id NULL
 *   - CH_ODEME müşteri iade/avans → cash_lines.customer_id dolu (müşteri borç azaltma)
 *
 * Hata durumu:
 *   - cash_lines.customer_id dolu VE customer tablosunda YOK VE suppliers tablosunda VAR
 *     → Tedarikçi UUID yanlış alanda → supplier.balance güncellenmiyor!
 */

import { Client } from 'pg';

const DB = {
  host: '72.60.182.107', port: 5432, user: 'postgres', password: 'Yq7xwQpt6c',
};

const EXCLUDE = new Set(['ilsasupport', 'pagetin_kurye', 'siti_pdks', 'aram', 'naw', 'postgres', 'template0', 'template1']);

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();

  const dbs = await c.query(`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`);
  const tenants = dbs.rows.map(r => r.datname).filter(n => !EXCLUDE.has(n));

  const totalErrors = { T2: 0, T_PARTY: 0, T1: 0, T3: 0 };
  const totalAmount = { T2: 0, T_PARTY: 0 };

  for (const db of tenants) {
    const c2 = new Client({ ...DB, database: db, connectionTimeoutMillis: 5000 });
    try {
      await c2.connect();
      const firm = await c2.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'rex_%_cash_registers' LIMIT 1
      `);
      if (firm.rows.length === 0) { await c2.end(); continue; }
      const m = firm.rows[0].table_name.match(/rex_(\d+)_/);
      if (!m) { await c2.end(); continue; }
      const firmNr = m[1];

      // cash_lines tablosu var mı?
      const cl = await c2.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name LIKE 'rex_${firmNr}_%_cash_lines' LIMIT 1
      `);
      if (cl.rows.length === 0) { await c2.end(); continue; }
      const periodMatch = cl.rows[0].table_name.match(/rex_\d+_(\d+)_cash_lines/);
      const periodNr = periodMatch ? periodMatch[1] : '01';
      const linesTbl = cl.rows[0].table_name;

      const r = await c2.query(`
        SELECT
          cl.fiche_no, cl.date, cl.amount, cl.transaction_type,
          cl.customer_id, cl.party_id,
          c.name AS cust_name,
          s.name AS supp_name, s.code AS supp_code,
          CASE
            WHEN cl.customer_id IS NOT NULL AND c.id IS NOT NULL THEN 'OK_C'
            WHEN cl.customer_id IS NOT NULL AND c.id IS NULL AND s.id IS NOT NULL THEN 'T2'
            WHEN cl.customer_id IS NOT NULL AND c.id IS NULL AND cl.party_id IS NOT NULL THEN 'PARTY_OK'
            WHEN cl.customer_id IS NOT NULL AND c.id IS NULL THEN 'T1'
            WHEN cl.party_id IS NOT NULL AND s.id IS NOT NULL THEN 'OK_S'
            WHEN cl.party_id IS NOT NULL AND cl.customer_id IS NULL THEN 'OK_S_NOJOIN'
            ELSE 'NONE'
          END AS classification
        FROM ${linesTbl} cl
        LEFT JOIN rex_${firmNr}_customers c ON cl.customer_id = c.id
        LEFT JOIN rex_${firmNr}_suppliers s ON cl.customer_id = s.id
        WHERE cl.transaction_type IN ('CH_ODEME', 'CH_TAHSILAT')
      `);

      const counts = {};
      const errAmount = {};
      for (const row of r.rows) {
        counts[row.classification] = (counts[row.classification] || 0) + 1;
        if (row.classification === 'T2') {
          totalErrors.T2++;
          totalAmount.T2 += Number(row.amount || 0);
          errAmount.T2 = (errAmount.T2 || 0) + Number(row.amount || 0);
        }
      }
      const summary = Object.entries(counts).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${v}×${k}`).join(' ');
      console.log(`${db.padEnd(20)} ${linesTbl.padEnd(28)} ${summary}`);
      if (counts.T2) {
        console.log(`  ❌ T2 (tedarikçi yanlış alanda): ${counts.T2} kayıt, toplam ${(errAmount.T2 || 0).toLocaleString('en-US')} IQD`);
      }
      await c2.end();
    } catch (e) {
      console.log(`${db.padEnd(20)} HATA: ${e.message}`);
      try { await c2.end(); } catch {}
    }
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('TOPLAM:');
  console.log(`   T2 (tedarikçi yanlış alanda): ${totalErrors.T2} kayıt, ${totalAmount.T2.toLocaleString('en-US')} IQD`);
  console.log('   Bu kayıtlar düzeltildikten sonra supplier.balance mutabakatı tamamlanır.');

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
