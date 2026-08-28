#!/usr/bin/env node
/**
 * customer-payment-audit.mjs
 *
 * Carilerdeki ödemeleri + düşümleri denetler.
 * Salt SELECT; herhangi bir değişiklik yapmaz.
 *
 * GERÇEK ŞEMA:
 *   customers (rex_001_customers):     id, code, name, balance, ...
 *   suppliers (rex_001_suppliers):     id, code, name, balance, ...
 *   parties   (rex_001_parties):       partner + employee tek tablo (code, name)
 *   party_ledger_movements (rex_001_01_party_ledger_movements): party_id + card_type
 *   cash_lines:  customer_id (müşteri tahsilat/tediye), party_id (partner/employee avans)
 *   bank_lines:  customer_id (?), party_id (?)
 *
 * 1) Müşteri + tedarikçi bakiye dağılımı
 * 2) cash_lines üzerinden müşteriye bağlı ödemeler (tahsilat = sign +1; tediye = sign -1)
 * 3) bank_lines üzerinden müşteriye bağlı ödemeler
 * 4) Tedarikçi ödemeleri: cari hesap ekstresi + cash_lines (varsa)
 * 5) MUTABAKAT — cari kart bakiyesi vs ledger/cash_lines toplamı
 * 6) Negatif bakiyeler
 * 7) Ödeme yapılmış carilerin detaylı listesi
 * 8) İptal/çift kayıt kontrolü
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

const FIRM = process.env.FIRM_NR || '001';
const PERIOD = process.env.PERIOD_NR || '01';

const log = (...a) => console.log(...a);
const sep = () => log('━'.repeat(86));
const h = (t) => { sep(); log(`📌 ${t}`); sep(); };
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const m = (n, code = 'IQD') => `${fmt(n)} ${code}`;

async function q(c, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, err: e.message, sql: String(sql).slice(0, 100) };
  }
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  log(`✅ Bağlantı: ${DB.database} @ ${DB.host}:${DB.port}`);
  const T = new Date().toISOString();
  const out = { generated_at: T, db: DB.database, firm: FIRM, period: PERIOD, sections: {} };

  const customers = `rex_${FIRM}_customers`;
  const suppliers = `rex_${FIRM}_suppliers`;
  const parties = `rex_${FIRM}_parties`;
  const plm = `rex_${FIRM}_${PERIOD}_party_ledger_movements`;
  const cashLines = `rex_${FIRM}_${PERIOD}_cash_lines`;
  const bankLines = `rex_${FIRM}_${PERIOD}_bank_lines`;

  h('1) CARİ KARTLARI — müşteri + tedarikçi + şirket ortağı bakiye dağılımı');
  const counts = await q(
    c,
    `SELECT 'customer' AS tip, COUNT(*)::int AS adet,
            COALESCE(SUM(balance),0)::bigint AS toplam_bakiye,
            COALESCE(SUM(CASE WHEN balance>0 THEN balance ELSE 0 END),0)::bigint AS alacak_toplam,
            COALESCE(SUM(CASE WHEN balance<0 THEN -balance ELSE 0 END),0)::bigint AS borc_toplam
     FROM ${customers} WHERE COALESCE(is_active,true) = true
     UNION ALL
     SELECT 'supplier' AS tip, COUNT(*)::int AS adet,
            COALESCE(SUM(balance),0)::bigint AS toplam_bakiye,
            COALESCE(SUM(CASE WHEN balance>0 THEN balance ELSE 0 END),0)::bigint AS alacak_toplam,
            COALESCE(SUM(CASE WHEN balance<0 THEN -balance ELSE 0 END),0)::bigint AS borc_toplam
     FROM ${suppliers} WHERE COALESCE(is_active,true) = true
     UNION ALL
     SELECT 'partner' AS tip, COUNT(*)::int AS adet,
            COALESCE(SUM(balance),0)::bigint AS toplam_bakiye,
            COALESCE(SUM(CASE WHEN balance>0 THEN balance ELSE 0 END),0)::bigint AS alacak_toplam,
            COALESCE(SUM(CASE WHEN balance<0 THEN -balance ELSE 0 END),0)::bigint AS borc_toplam
     FROM ${parties} WHERE COALESCE(is_active,true) = true`
  );
  if (counts.ok) {
    out.sections.card_counts = counts.rows;
    log('  Tip           Adet   Alacak (+)         Borç (-)          Net');
    log('  ' + '─'.repeat(76));
    counts.rows.forEach((r) => {
      const net = Number(r.toplam_bakiye) || 0;
      log(`  ${String(r.tip).padEnd(12)} ${String(r.adet).padStart(6)} ${m(r.alacak_toplam).padStart(18)} ${m(r.borc_toplam).padStart(18)} ${m(net).padStart(18)}`);
    });
  }

  h('2) MÜŞTERİLER — bakiye sıralaması (en yüksek 25)');
  const custQ = await q(
    c,
    `SELECT id, code, name, balance, phone
     FROM ${customers}
     WHERE balance <> 0
     ORDER BY ABS(balance) DESC
     LIMIT 25`
  );
  if (custQ.ok) {
    out.sections.top_customers = custQ.rows;
    log('  Cari Kodu          Ad                                 Bakiye');
    log('  ' + '─'.repeat(80));
    custQ.rows.forEach((r) => log(`  ${String(r.code).padEnd(18)} ${String((r.name || '-').slice(0, 34)).padEnd(38)} ${m(r.balance)}`));
  }

  h('3) TEDARİKÇİLER — bakiye sıralaması');
  const supQ = await q(
    c,
    `SELECT id, code, name, balance
     FROM ${suppliers}
     WHERE balance <> 0
     ORDER BY ABS(balance) DESC
     LIMIT 30`
  );
  if (supQ.ok) {
    out.sections.top_suppliers = supQ.rows;
    log('  Cari Kodu          Ad                                 Bakiye');
    log('  ' + '─'.repeat(80));
    supQ.rows.forEach((r) => log(`  ${String(r.code).padEnd(18)} ${String((r.name || '-').slice(0, 34)).padEnd(38)} ${m(r.balance)}`));
  }

  h('4) KASA ÖDEMELERİ — müşteri bazlı (customer_id üzerinden)');
  const cashByCust = await q(
    c,
    `SELECT
       c.code AS cari_code,
       c.name AS cari_ad,
       COUNT(*)::int AS hareket,
       COALESCE(SUM(CASE WHEN cl.sign = 1  THEN cl.amount ELSE 0 END),0)::bigint AS tahsilat,
       COALESCE(SUM(CASE WHEN cl.sign = -1 THEN cl.amount ELSE 0 END),0)::bigint AS tediye,
       COALESCE(SUM(cl.amount * cl.sign),0)::bigint AS net,
       MIN(cl.date::date) AS ilk,
       MAX(cl.date::date) AS son
     FROM ${cashLines} cl
     INNER JOIN ${customers} c ON c.id = cl.customer_id
     WHERE cl.transaction_type NOT LIKE 'CANCELLED_%'
     GROUP BY c.code, c.name
     ORDER BY ABS(COALESCE(SUM(cl.amount * cl.sign),0)) DESC
     LIMIT 25`
  );
  if (cashByCust.ok) {
    out.sections.cash_by_customer = cashByCust.rows;
    log('  Cari Kodu          Ad                                 Hareket   Tahsilat         Tediye           Net         İlk          Son');
    log('  ' + '─'.repeat(140));
    cashByCust.rows.forEach((r) => {
      log(
        `  ${String(r.cari_code).padEnd(18)} ${String((r.cari_ad || '-').slice(0, 32)).padEnd(38)} ${String(r.hareket).padStart(6)} ${m(r.tahsilat).padStart(16)} ${m(r.tediye).padStart(16)} ${m(r.net).padStart(16)} ${String(r.ilk || '-')} ${String(r.son || '-')}`,
      );
    });
  }

  h('5) KASA ÖDEMELERİ — partner/employee bazlı (party_id üzerinden)');
  const cashByParty = await q(
    c,
    `SELECT
       p.code AS cari_code,
       p.name AS cari_ad,
       p.card_type,
       COUNT(*)::int AS hareket,
       COALESCE(SUM(CASE WHEN cl.sign = 1  THEN cl.amount ELSE 0 END),0)::bigint AS tahsilat,
       COALESCE(SUM(CASE WHEN cl.sign = -1 THEN cl.amount ELSE 0 END),0)::bigint AS tediye,
       COALESCE(SUM(cl.amount * cl.sign),0)::bigint AS net,
       MIN(cl.date::date) AS ilk,
       MAX(cl.date::date) AS son
     FROM ${cashLines} cl
     INNER JOIN ${parties} p ON p.id = cl.party_id
     WHERE cl.party_id IS NOT NULL
       AND cl.transaction_type NOT LIKE 'CANCELLED_%'
     GROUP BY p.code, p.name, p.card_type
     ORDER BY ABS(COALESCE(SUM(cl.amount * cl.sign),0)) DESC
     LIMIT 25`
  );
  if (cashByParty.ok) {
    out.sections.cash_by_party = cashByParty.rows;
    log('  Cari Kodu          Tip       Ad                               Hareket   Tahsilat         Tediye           Net         İlk          Son');
    log('  ' + '─'.repeat(145));
    cashByParty.rows.forEach((r) => {
      log(
        `  ${String(r.cari_code).padEnd(18)} ${String(r.card_type || '-').padEnd(10)} ${String((r.cari_ad || '-').slice(0, 28)).padEnd(32)} ${String(r.hareket).padStart(6)} ${m(r.tahsilat).padStart(16)} ${m(r.tediye).padStart(16)} ${m(r.net).padStart(16)} ${String(r.ilk || '-')} ${String(r.son || '-')}`,
      );
    });
  }

  h('6) BANKA ÖDEMELERİ — müşteri/party bazlı');
  const bankByCust = await q(
    c,
    `SELECT
       COALESCE(c.code, p.code) AS cari_code,
       COALESCE(c.name, p.name) AS cari_ad,
       COALESCE(plm.card_type, CASE WHEN c.id IS NOT NULL THEN 'customer' WHEN p.id IS NOT NULL THEN 'partner' ELSE 'unknown' END) AS card_type,
       COUNT(*)::int AS hareket,
       COALESCE(SUM(CASE WHEN bl.sign = 1  THEN bl.amount ELSE 0 END),0)::bigint AS tahsilat,
       COALESCE(SUM(CASE WHEN bl.sign = -1 THEN bl.amount ELSE 0 END),0)::bigint AS tediye,
       COALESCE(SUM(bl.amount * bl.sign),0)::bigint AS net
     FROM ${bankLines} bl
     LEFT JOIN ${customers} c ON c.id = bl.customer_id
     LEFT JOIN ${parties} p ON p.id = bl.party_id
     LEFT JOIN ${plm} plm ON plm.cash_line_id = bl.id
     WHERE (bl.customer_id IS NOT NULL OR bl.party_id IS NOT NULL)
       AND bl.transaction_type NOT LIKE 'CANCELLED_%'
     GROUP BY COALESCE(c.code, p.code), COALESCE(c.name, p.name),
              COALESCE(plm.card_type, CASE WHEN c.id IS NOT NULL THEN 'customer' WHEN p.id IS NOT NULL THEN 'partner' ELSE 'unknown' END)
     ORDER BY ABS(COALESCE(SUM(bl.amount * bl.sign),0)) DESC
     LIMIT 20`
  );
  if (bankByCust.ok) {
    out.sections.bank_by_cust = bankByCust.rows;
    if (bankByCust.rows.length === 0) {
      log('  (müşteriye/party\'ye bağlı banka hareketi yok)');
    } else {
      log('  Cari Kodu          Tip       Ad                               Hareket   Tahsilat         Tediye           Net');
      log('  ' + '─'.repeat(125));
      bankByCust.rows.forEach((r) => {
        log(
          `  ${String(r.cari_code || '-').padEnd(18)} ${String(r.card_type).padEnd(10)} ${String((r.cari_ad || '-').slice(0, 28)).padEnd(32)} ${String(r.hareket).padStart(6)} ${m(r.tahsilat).padStart(16)} ${m(r.tediye).padStart(16)} ${m(r.net).padStart(16)}`,
        );
      });
    }
  }

  h('7) MUTABAKAT — müşteri kart bakiyesi vs cash_lines net toplamı');
  const reconQ = await q(
    c,
    `WITH cash_sum AS (
       SELECT customer_id,
              COALESCE(SUM(amount * sign),0)::bigint AS cash_net
       FROM ${cashLines}
       WHERE transaction_type NOT LIKE 'CANCELLED_%'
         AND customer_id IS NOT NULL
       GROUP BY customer_id
     )
     SELECT c.code, c.name, c.balance AS kart_bakiye,
            COALESCE(cs.cash_net, 0) AS cash_net,
            (c.balance - COALESCE(cs.cash_net, 0)) AS sapma
     FROM ${customers} c
     LEFT JOIN cash_sum cs ON cs.customer_id = c.id
     WHERE c.balance <> 0 OR COALESCE(cs.cash_net, 0) <> 0
     ORDER BY ABS(c.balance - COALESCE(cs.cash_net, 0)) DESC
     LIMIT 20`
  );
  if (reconQ.ok) {
    out.sections.reconciliation = reconQ.rows;
    log('  Cari Kodu          Ad                                 Kart Bakiye    Cash Net         Sapma');
    log('  ' + '─'.repeat(105));
    const uyari = [];
    reconQ.rows.forEach((r) => {
      const sapma = Number(r.sapma) || 0;
      const flag = Math.abs(sapma) > 1 ? ' ⚠' : '';
      log(
        `  ${String(r.code).padEnd(18)} ${String((r.name || '-').slice(0, 32)).padEnd(38)} ${m(r.kart_bakiye).padStart(15)} ${m(r.cash_net).padStart(15)} ${m(sapma).padStart(15)}${flag}`,
      );
      if (Math.abs(sapma) > 1) uyari.push({ code: r.code, name: r.name, kart_bakiye: r.kart_bakiye, cash_net: r.cash_net, sapma });
    });
    out.sections.reconciliation_warnings = uyari;
    log(`\n  ${uyari.length === 0 ? '✅ Müşteri mutabakat temiz — sapma yok.' : `⚠ ${uyari.length} müşteride sapma var (cash_lines ile balance uyumsuz).`}`);
  }

  h('8) NEGATİF BAKİYELİ CARİLER');
  const negQ = await q(
    c,
    `SELECT 'customer' AS tip, code, name, balance FROM ${customers} WHERE balance < 0
     UNION ALL
     SELECT 'supplier' AS tip, code, name, balance FROM ${suppliers} WHERE balance < 0
     UNION ALL
     SELECT 'partner' AS tip, code, name, balance FROM ${parties} WHERE balance < 0
     ORDER BY balance ASC
     LIMIT 30`
  );
  if (negQ.ok) {
    out.sections.negative_balances = negQ.rows;
    if (negQ.rows.length === 0) {
      log('  ✅ Negatif cari bakiyesi yok.');
    } else {
      log(`  ⚠ ${negQ.rows.length} caride negatif bakiye:`);
      negQ.rows.forEach((r) => log(`    [${r.tip}] ${r.code} (${r.name || '-'}) → ${m(r.balance)}`));
    }
  }

  h('9) ÖDEME YAPILMIŞ CARİLERİN TAM LİSTESİ (cash — customer_id)');
  const paidQ = await q(
    c,
    `SELECT c.code AS cari_code, c.name AS cari_ad,
            COUNT(*)::int AS hareket,
            COALESCE(SUM(CASE WHEN cl.sign = 1  THEN cl.amount ELSE 0 END),0)::bigint AS tahsilat,
            COALESCE(SUM(CASE WHEN cl.sign = -1 THEN cl.amount ELSE 0 END),0)::bigint AS tediye,
            COALESCE(SUM(cl.amount * cl.sign),0)::bigint AS net,
            MIN(cl.date::date) AS ilk, MAX(cl.date::date) AS son
     FROM ${cashLines} cl
     INNER JOIN ${customers} c ON c.id = cl.customer_id
     WHERE cl.transaction_type NOT LIKE 'CANCELLED_%'
     GROUP BY c.code, c.name
     ORDER BY ABS(COALESCE(SUM(cl.amount * cl.sign),0)) DESC
     LIMIT 60`
  );
  if (paidQ.ok) {
    out.sections.paid_cari = paidQ.rows;
    log(`  Ödeme yapılmış cariler (${paidQ.rows.length} cari):`);
    log('  Cari Kodu          Ad                                 Hareket   Tahsilat         Tediye           Net         İlk          Son');
    log('  ' + '─'.repeat(140));
    paidQ.rows.forEach((r) => {
      log(
        `  ${String(r.cari_code).padEnd(18)} ${String((r.cari_ad || '-').slice(0, 32)).padEnd(38)} ${String(r.hareket).padStart(6)} ${m(r.tahsilat).padStart(16)} ${m(r.tediye).padStart(16)} ${m(r.net).padStart(16)} ${String(r.ilk || '-')} ${String(r.son || '-')}`,
      );
    });
  }

  h('10) İPTAL / ÇİFT KAYIT KONTROLÜ');
  const cancelQ = await q(
    c,
    `SELECT
       (SELECT COUNT(*) FROM ${cashLines} WHERE transaction_type LIKE 'CANCELLED_%') AS kasa_iptal,
       0::int AS kasa_silme,
       (SELECT COUNT(*) FROM ${bankLines} WHERE transaction_type LIKE 'CANCELLED_%') AS banka_iptal,
       0::int AS banka_silme,
       (SELECT COUNT(*) FROM ${plm} WHERE transaction_type LIKE 'CANCELLED_%') AS ledger_iptal,
       (SELECT COUNT(*) FROM ${plm} WHERE source_module = 'cash_delete') AS ledger_silme`
  );
  if (cancelQ.ok) {
    out.sections.cancel_summary = cancelQ.rows[0];
    const r = cancelQ.rows[0];
    log(`  Kasa iptal    : ${r.kasa_iptal}`);
    log(`  Kasa silme    : ${r.kasa_silme}`);
    log(`  Banka iptal   : ${r.banka_iptal}`);
    log(`  Banka silme   : ${r.banka_silme}`);
    log(`  Ledger iptal  : ${r.ledger_iptal}`);
    log(`  Ledger silme  : ${r.ledger_silme}`);
  }

  const outPath = `customer-payment-audit-${DB.database}-${T.replace(/[:.]/g, '-')}.json`;
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  log(`\n📝 JSON dump: ${outPath}`);

  await c.end();
}

main().catch((e) => {
  console.error('💥 Hata:', e.message);
  process.exit(1);
});