#!/usr/bin/env node
/**
 * customer-payment-audit-all-tenants.mjs
 *
 * Uzak PG'deki TÜM RetailEX tenant DB'lerde cari hesap ödeme/düşüm denetimi.
 * Hariç DB'ler: ilsasupport, pagetin_kurye, siti_pdks, aram, naw (database-non-retailex-exclude.mdc)
 *
 * Salt SELECT; herhangi bir değişiklik yapmaz.
 */

import { Client } from 'pg';
import { writeFileSync } from 'node:fs';

const HOST = process.env.PGHOST || '72.60.182.107';
const PORT = parseInt(process.env.PGPORT || '5432', 10);
const USER = process.env.PGUSER || 'postgres';
const PASS = process.env.PGPASSWORD || 'Yq7xwQpt6c';

const NON_RETAILEX_DBS = new Set([
  'postgres',
  'ilsasupport',
  'pagetin_kurye',
  'siti_pdks',
  'aram',
  'aram_pre_rebuild',
  'aram_pre_rebuild_20260827',
  'aram_shift_test',
  'naw',
]);

const log = (...a) => console.log(...a);
const sep = () => log('━'.repeat(86));
const h = (t) => { sep(); log(`📌 ${t}`); sep(); };
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const m = (n, code = 'IQD') => `${fmt(n)} ${code}`;

async function q(c, sql, params = []) {
  try { const r = await c.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: e.message, sql: String(sql).slice(0, 100) }; }
}

async function auditDatabase(dbName) {
  const c = new Client({ host: HOST, port: PORT, user: USER, password: PASS, database: dbName, connectionTimeoutMillis: 5000 });
  await c.connect();
  const result = { db: dbName, sections: {}, errors: [] };

  // tenant tablo var mı?
  const tablesExist = await q(
    c,
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'rex_%'`
  );
  if (!tablesExist.ok || tablesExist.rows.length === 0) {
    result.errors.push('rex_* tablosu yok — RetailEX tenant değil');
    await c.end();
    return result;
  }

  // firm/period tespit — customers tablosundan
  const firmPer = await q(
    c,
    `SELECT DISTINCT firm_nr FROM rex_001_customers LIMIT 5`
  );
  const firm = firmPer.ok && firmPer.rows.length > 0 ? String(firmPer.rows[0].firm_nr).padStart(3, '0') : '001';

  const customers = `rex_${firm}_customers`;
  const suppliers = `rex_${firm}_suppliers`;
  const parties = `rex_${firm}_parties`;

  // period tablo isimleri
  const pl = await q(
    c,
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'rex_${firm}_%_party_ledger_movements' LIMIT 5`
  );
  if (!pl.ok || pl.rows.length === 0) {
    result.errors.push('party_ledger_movements tablosu yok');
    await c.end();
    return result;
  }
  // İlk periyodu al
  const periodMatch = pl.rows[0].table_name.match(new RegExp(`rex_${firm}_(\\d+)_party_ledger_movements`));
  const period = periodMatch ? periodMatch[1] : '01';

  const plm = `rex_${firm}_${period}_party_ledger_movements`;
  const cashLines = `rex_${firm}_${period}_cash_lines`;
  const bankLines = `rex_${firm}_${period}_bank_lines`;

  result.firm = firm;
  result.period = period;

  // 1) cari dağılımı
  const counts = await q(
    c,
    `SELECT 'customer' AS tip, COUNT(*)::int AS adet,
            COALESCE(SUM(balance),0)::bigint AS toplam
     FROM ${customers} WHERE COALESCE(is_active,true)=true
     UNION ALL
     SELECT 'supplier', COUNT(*)::int, COALESCE(SUM(balance),0)::bigint FROM ${suppliers} WHERE COALESCE(is_active,true)=true
     UNION ALL
     SELECT 'partner', COUNT(*)::int, COALESCE(SUM(balance),0)::bigint FROM ${parties} WHERE COALESCE(is_active,true)=true`
  );
  if (counts.ok) result.sections.counts = counts.rows;

  // 2) müşteri bakiye toplamı + borçlu müşteri sayısı
  const custSummary = await q(
    c,
    `SELECT COUNT(*) FILTER (WHERE balance < 0)::int AS negatif_musteri,
            COUNT(*) FILTER (WHERE balance > 0)::int AS alacakli_musteri,
            COUNT(*) FILTER (WHERE balance <> 0)::int AS bakiyeli_musteri,
            COALESCE(SUM(balance),0)::bigint AS toplam_bakiye
     FROM ${customers}`
  );
  if (custSummary.ok) result.sections.customer_summary = custSummary.rows[0];

  // 3) tedarikçi bakiye
  const supSummary = await q(
    c,
    `SELECT COUNT(*) FILTER (WHERE balance < 0)::int AS negatif_tedarikci,
            COUNT(*) FILTER (WHERE balance > 0)::int AS alacakli_tedarikci,
            COALESCE(SUM(balance),0)::bigint AS toplam_bakiye
     FROM ${suppliers}`
  );
  if (supSummary.ok) result.sections.supplier_summary = supSummary.rows[0];

  // 4) Kasa müşteri ödemeleri
  const cashByCust = await q(
    c,
    `SELECT COUNT(*)::int AS hareket_sayisi,
            COALESCE(SUM(CASE WHEN sign = 1 THEN amount ELSE 0 END),0)::bigint AS tahsilat,
            COALESCE(SUM(CASE WHEN sign = -1 THEN amount ELSE 0 END),0)::bigint AS tediye,
            COALESCE(SUM(amount * sign),0)::bigint AS net
     FROM ${cashLines}
     WHERE customer_id IS NOT NULL
       AND transaction_type NOT LIKE 'CANCELLED_%'`
  );
  if (cashByCust.ok) result.sections.cash_customer_summary = cashByCust.rows[0];

  // 5) MUTABAKAT: customer.balance vs cash_lines net toplamı
  const recon = await q(
    c,
    `WITH cash_sum AS (
       SELECT customer_id, COALESCE(SUM(amount * sign),0)::bigint AS cash_net
       FROM ${cashLines}
       WHERE transaction_type NOT LIKE 'CANCELLED_%' AND customer_id IS NOT NULL
       GROUP BY customer_id
     )
     SELECT COUNT(*)::int AS sapma_sayisi,
            COALESCE(SUM(ABS(c.balance - COALESCE(cs.cash_net,0))),0)::bigint AS toplam_sapma
     FROM ${customers} c
     LEFT JOIN cash_sum cs ON cs.customer_id = c.id
     WHERE c.balance <> 0 OR COALESCE(cs.cash_net,0) <> 0
       AND ABS(c.balance - COALESCE(cs.cash_net,0)) > 1`
  );
  if (recon.ok) result.sections.reconciliation = recon.rows[0];

  // 6) Partner bakiye (negatif mi)
  const partnerSummary = await q(
    c,
    `SELECT code, name, balance, card_type FROM ${parties} WHERE balance < 0 ORDER BY balance ASC LIMIT 5`
  );
  if (partnerSummary.ok) result.sections.partner_negatives = partnerSummary.rows;

  // 7) Negatif tedarikçi bakiyeleri
  const negSuppliers = await q(
    c,
    `SELECT code, name, balance FROM ${suppliers} WHERE balance < 0 ORDER BY balance ASC LIMIT 5`
  );
  if (negSuppliers.ok) result.sections.negative_suppliers = negSuppliers.rows;

  // 8) Negatif müşteri bakiyeleri
  const negCustomers = await q(
    c,
    `SELECT code, name, balance FROM ${customers} WHERE balance < 0 ORDER BY balance ASC LIMIT 5`
  );
  if (negCustomers.ok) result.sections.negative_customers = negCustomers.rows;

  // 9) Tedarikçilere yapılan kasa ödemeleri (supplier_id ile?)
  const supPay = await q(
    c,
    `SELECT COUNT(*) FILTER (WHERE customer_id IS NOT NULL)::int AS musteri_odeme,
            COUNT(*) FILTER (WHERE party_id IS NOT NULL)::int AS party_odeme,
            COUNT(*)::int AS toplam_hareket
     FROM ${cashLines}
     WHERE transaction_type NOT LIKE 'CANCELLED_%'`
  );
  if (supPay.ok) result.sections.cash_lines_breakdown = supPay.rows[0];

  await c.end();
  return result;
}

async function main() {
  // tüm DB'leri listele
  const c = new Client({ host: HOST, port: PORT, user: USER, password: PASS, database: 'postgres', connectionTimeoutMillis: 5000 });
  await c.connect();
  const dbs = await c.query(`SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY datname`);
  await c.end();

  const all = dbs.rows.map((r) => r.datname);
  const tenants = all.filter((d) => !NON_RETAILEX_DBS.has(d));

  log(`✅ Uzak PG: ${HOST}:${PORT}`);
  log(`📊 Toplam DB: ${all.length}, RetailEX tenant aday: ${tenants.length}`);
  log(`⏭  Hariç tutulan: ${[...NON_RETAILEX_DBS].filter((d) => all.includes(d)).join(', ') || '(yok)'}`);
  log('');

  const out = { generated_at: new Date().toISOString(), tenants: [] };
  for (const dbName of tenants) {
    try {
      log(`▶ ${dbName}...`);
      const r = await auditDatabase(dbName);
      if (r.errors.length === 0) {
        const cs = r.sections.customer_summary || {};
        const ss = r.sections.supplier_summary || {};
        const rc = r.sections.reconciliation || {};
        const cn = r.sections.cash_customer_summary || {};
        log(`  ✓ Müşteri: ${cs.negatif_musteri || 0} borçlu, ${cs.alacakli_musteri || 0} alacaklı, toplam ${m(cs.toplam_bakiye || 0)}`);
        log(`    Tedarikçi: ${ss.negatif_tedarikci || 0} borçlu, ${ss.alacakli_tedarikci || 0} alacaklı, toplam ${m(ss.toplam_bakiye || 0)}`);
        log(`    Kasa müşteri ödeme: tahsilat ${m(cn.tahsilat || 0)} / tediye ${m(cn.tediye || 0)} / net ${m(cn.net || 0)}`);
        log(`    Mutabakat sapma: ${rc.sapma_sayisi || 0} müşteri (toplam sapma: ${m(rc.toplam_sapma || 0)})`);
        if (r.sections.partner_negatives?.length > 0) {
          log(`    ⚠ Negatif partner: ${r.sections.partner_negatives.map((p) => `${p.code}=${m(p.balance)}`).join(', ')}`);
        }
        if (r.sections.negative_suppliers?.length > 0) {
          log(`    ⚠ Negatif tedarikçi: ${r.sections.negative_suppliers.map((p) => `${p.code}=${m(p.balance)}`).join(', ')}`);
        }
        out.tenants.push(r);
      } else {
        log(`  ⏭ ${r.errors.join('; ')}`);
        out.tenants.push(r);
      }
    } catch (e) {
      log(`  💥 ${e.message}`);
      out.tenants.push({ db: dbName, errors: [e.message] });
    }
    log('');
  }

  h('GENEL ÖZET — TÜM TENANTLAR');
  log('DB                       Müş.Bakiye     Ted.Bakiye       Kasa Net     Sapma#   Sapma Tutarı');
  log('─'.repeat(110));
  let totalCustBal = 0, totalSupBal = 0, totalCashNet = 0, totalSapma = 0;
  out.tenants.forEach((t) => {
    if (t.errors?.length > 0) return;
    const cs = t.sections?.customer_summary || {};
    const ss = t.sections?.supplier_summary || {};
    const cn = t.sections?.cash_customer_summary || {};
    const rc = t.sections?.reconciliation || {};
    log(`  ${String(t.db).padEnd(24)} ${m(cs.toplam_bakiye || 0).padStart(15)} ${m(ss.toplam_bakiye || 0).padStart(15)} ${m(cn.net || 0).padStart(15)} ${String(rc.sapma_sayisi || 0).padStart(8)} ${m(rc.toplam_sapma || 0).padStart(16)}`);
    totalCustBal += Number(cs.toplam_bakiye || 0);
    totalSupBal += Number(ss.toplam_bakiye || 0);
    totalCashNet += Number(cn.net || 0);
    totalSapma += Number(rc.toplam_sapma || 0);
  });
  log('─'.repeat(110));
  log(`  ${'TOPLAM'.padEnd(24)} ${m(totalCustBal).padStart(15)} ${m(totalSupBal).padStart(15)} ${m(totalCashNet).padStart(15)} ${' '.padStart(8)} ${m(totalSapma).padStart(16)}`);

  const outPath = `customer-payment-audit-all-tenants-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  log(`\n📝 JSON dump: ${outPath}`);
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});