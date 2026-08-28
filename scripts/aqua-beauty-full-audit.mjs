#!/usr/bin/env node
/**
 * aqua-beauty-full-audit.mjs
 *
 * aqua_beauty DB için kapsamlı muhasebe denetimi.
 * Salt SELECT; herhangi bir değişiklik yapmaz.
 *
 * Bölümler:
 *  1) Kasa      (cash_registers + cash_lines, sign, negatives, duplicates)
 *  2) Banka     (bank_registers + bank_lines)
 *  3) Cari      (customers + suppliers + parties, balances, top 10)
 *  4) Fatura    (sales + partner_distributions + cheque)
 *  5) Stok      (products, negative stock, value)
 *  6) Riskler   (negatif bakiye, çift kayıt, dönem kapalı mı)
 *  7) KDV       (total_net vs total_gross, vat_rate dağılımı)
 *  8) DB Sağlık (disk, tablespace, pg_stat_user_tables)
 *
 * Çıktı: JSON dump + STDOUT'a özet rapor.
 */

import { Client } from 'pg';
import { writeFileSync } from 'node:fs';

const DB = {
  host: '72.60.182.107',
  port: 5432,
  user: 'postgres',
  password: 'Yq7xwQpt6c',
  database: 'aqua_beauty',
};

const FIRM = '001';
const PERIOD = '01';

const log = (...a) => console.log(...a);
const sep = () => log('━'.repeat(70));
const h = (t) => { sep(); log(`📌 ${t}`); sep(); };

async function q(c, sql, params = []) {
  try { const r = await c.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: e.message, sql: sql.slice(0, 80) }; }
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 8000 });
  await c.connect();
  log(`✅ Bağlantı: ${DB.database} @ ${DB.host}`);
  const T = new Date().toISOString();
  const out = { generated_at: T, db: DB.database, sections: {} };

  // ═══════════════════════════════════════════════════════════════════
  h('1) KASA — cash_registers + cash_lines');
  // ═══════════════════════════════════════════════════════════════════
  const cashReg = await q(c, `
    SELECT id, code, name, balance, currency_code, is_active,
           (SELECT COUNT(*) FROM rex_001_01_cash_lines WHERE register_id = cr.id)::int AS line_count
    FROM rex_001_cash_registers cr
    ORDER BY code
  `);
  out.sections.cashRegisters = cashReg.rows;

  const cashBalance = await q(c, `
    SELECT COALESCE(SUM(balance),0)::float AS total_balance,
           COUNT(*) FILTER (WHERE balance < 0)::int AS negative_count
    FROM rex_001_cash_registers
  `);
  out.sections.cashBalanceSummary = cashBalance.rows[0];

  const txTypes = await q(c, `
    SELECT transaction_type,
           COUNT(*)::int AS n,
           SUM(amount)::float AS toplam_borc,
           SUM(amount * sign)::float AS net_etki,
           COUNT(*) FILTER (WHERE sign > 0)::int AS pozitif_isaret,
           COUNT(*) FILTER (WHERE sign < 0)::int AS negatif_isaret
    FROM rex_001_01_cash_lines
    GROUP BY transaction_type
    ORDER BY n DESC
  `);
  out.sections.cashTxTypes = txTypes.rows;

  const negCashRegs = await q(c, `
    SELECT id::text, code, name, balance::float, currency_code
    FROM rex_001_cash_registers
    WHERE balance < 0
    ORDER BY balance ASC
  `);
  out.sections.negativeCashRegisters = negCashRegs.rows;

  const orphanCashLines = await q(c, `
    SELECT COUNT(*)::int AS n,
           COALESCE(SUM(amount * sign),0)::float AS net_amount
    FROM rex_001_01_cash_lines
    WHERE register_id IS NULL
  `);
  out.sections.orphanCashLines = orphanCashLines.rows[0];

  // ═══════════════════════════════════════════════════════════════════
  h('2) BANKA — bank_registers + bank_lines');
  // ═══════════════════════════════════════════════════════════════════
  const bankReg = await q(c, `
    SELECT id::text, code, name, balance::float, currency_code, iban, bank_name, is_active,
           (SELECT COUNT(*) FROM rex_001_01_bank_lines WHERE register_id = br.id)::int AS line_count
    FROM rex_001_bank_registers br
    ORDER BY code
  `);
  out.sections.bankRegisters = bankReg.rows;

  const bankTxTypes = await q(c, `
    SELECT transaction_type,
           COUNT(*)::int AS n,
           SUM(amount)::float AS toplam,
           SUM(amount * sign)::float AS net_etki
    FROM rex_001_01_bank_lines
    GROUP BY transaction_type
    ORDER BY n DESC
  `);
  out.sections.bankTxTypes = bankTxTypes.rows;

  const bankSummary = await q(c, `
    SELECT COALESCE(SUM(balance),0)::float AS total_balance,
           COUNT(*)::int AS n
    FROM rex_001_bank_registers
  `);
  out.sections.bankSummary = bankSummary.rows[0];

  // ═══════════════════════════════════════════════════════════════════
  h('3) CARİ — customers + suppliers + parties');
  // ═══════════════════════════════════════════════════════════════════
  const custSummary = await q(c, `
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE balance < 0)::int AS negative_balance,
           COUNT(*) FILTER (WHERE balance > 0)::int AS positive_balance,
           COALESCE(SUM(balance),0)::float AS total_balance,
           COALESCE(SUM(balance) FILTER (WHERE balance < 0),0)::float AS total_alacak_bizden,
           COALESCE(SUM(balance) FILTER (WHERE balance > 0),0)::float AS total_biz_alacagiz,
           COUNT(*) FILTER (WHERE is_active = false)::int AS pasif
    FROM rex_001_customers
  `);
  out.sections.customerSummary = custSummary.rows[0];

  const suppSummary = await q(c, `
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE balance < 0)::int AS negative_balance,
           COUNT(*) FILTER (WHERE balance > 0)::int AS positive_balance,
           COALESCE(SUM(balance),0)::float AS total_balance,
           COALESCE(SUM(balance) FILTER (WHERE balance < 0),0)::float AS total_alacak_bizden,
           COALESCE(SUM(balance) FILTER (WHERE balance > 0),0)::float AS total_biz_alacagiz,
           COUNT(*) FILTER (WHERE is_active = false)::int AS pasif
    FROM rex_001_suppliers
  `);
  out.sections.supplierSummary = suppSummary.rows[0];

  const topCustomers = await q(c, `
    SELECT id::text, code, name, balance::float, total_spent::float,
           CASE WHEN balance < 0 THEN 'MÜŞTERİ ALACAKLI (bizden)' ELSE 'BORÇLU' END AS durum
    FROM rex_001_customers
    ORDER BY ABS(balance) DESC
    LIMIT 10
  `);
  out.sections.topCustomers = topCustomers.rows;

  const topSuppliers = await q(c, `
    SELECT id::text, code, name, balance::float,
           CASE WHEN balance < 0 THEN 'TEDARİKÇİ ALACAKLI (bizden)' ELSE 'BORÇLU' END AS durum
    FROM rex_001_suppliers
    ORDER BY ABS(balance) DESC
    LIMIT 10
  `);
  out.sections.topSuppliers = topSuppliers.rows;

  const partyTypes = await q(c, `
    SELECT card_type, COUNT(*)::int AS n,
           COALESCE(SUM(balance),0)::float AS total_balance
    FROM rex_001_parties
    GROUP BY card_type
    ORDER BY n DESC
  `);
  out.sections.partyTypes = partyTypes.rows;

  // ═══════════════════════════════════════════════════════════════════
  h('4) FATURA — sales + partner_distributions');
  // ═══════════════════════════════════════════════════════════════════
  const salesSummary = await q(c, `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_cancelled = true)::int AS cancelled,
      COUNT(*) FILTER (WHERE is_cancelled = false OR is_cancelled IS NULL)::int AS aktif,
      COALESCE(SUM(total_gross) FILTER (WHERE is_cancelled = false OR is_cancelled IS NULL),0)::float AS aktif_ciro,
      COALESCE(SUM(total_net) FILTER (WHERE is_cancelled = false OR is_cancelled IS NULL),0)::float AS aktif_net,
      COALESCE(SUM(total_vat) FILTER (WHERE is_cancelled = false OR is_cancelled IS NULL),0)::float AS aktif_kdv,
      MIN(date)::date AS ilk_tarih,
      MAX(date)::date AS son_tarih
    FROM rex_001_01_sales
  `);
  out.sections.salesSummary = salesSummary.rows[0];

  const salesByType = await q(c, `
    SELECT COALESCE(fiche_type,'NULL') AS fiche_type, COUNT(*)::int AS n,
           COALESCE(SUM(total_gross),0)::float AS toplam,
           COALESCE(SUM(total_gross) FILTER (WHERE is_cancelled = false OR is_cancelled IS NULL),0)::float AS aktif_toplam
    FROM rex_001_01_sales
    GROUP BY fiche_type
    ORDER BY n DESC
  `);
  out.sections.salesByType = salesByType.rows;

  const salesByStatus = await q(c, `
    SELECT COALESCE(status,'NULL') AS status,
           payment_method,
           COUNT(*)::int AS n,
           COALESCE(SUM(total_gross),0)::float AS toplam
    FROM rex_001_01_sales
    GROUP BY status, payment_method
    ORDER BY n DESC
  `);
  out.sections.salesByStatus = salesByStatus.rows;

  const salesByCurrency = await q(c, `
    SELECT currency, COUNT(*)::int AS n,
           COALESCE(SUM(total_gross),0)::float AS toplam
    FROM rex_001_01_sales
    WHERE is_cancelled = false OR is_cancelled IS NULL
    GROUP BY currency
    ORDER BY n DESC
  `);
  out.sections.salesByCurrency = salesByCurrency.rows;

  // partner_distributions (tedarikçi ödemeleri / alımları temsil edebilir)
  const distSummary = await q(c, `
    SELECT COUNT(*)::int AS n,
           COALESCE(SUM(base_amount),0)::float AS toplam_tutar,
           MIN(distribution_date)::date AS ilk, MAX(distribution_date)::date AS son
    FROM rex_001_01_partner_distributions
  `);
  if (!distSummary.ok) log('  ⚠️ distSummary:', distSummary.err);
  out.sections.distSummary = distSummary.rows ? distSummary.rows[0] : null;

  // base_type / trigger_type dağılımı
  const distTypes = await q(c, `
    SELECT base_type, trigger_type, COUNT(*)::int AS n,
           COALESCE(SUM(base_amount),0)::float AS toplam
    FROM rex_001_01_partner_distributions
    GROUP BY base_type, trigger_type
    ORDER BY n DESC
  `);
  out.sections.distTypes = distTypes.rows;

  const chequeSummary = await q(c, `
    SELECT COUNT(*)::int AS n,
           COUNT(*) FILTER (WHERE status = 'cashed' OR status = 'paid' OR status = 'used')::int AS kullanilmis,
           COALESCE(SUM(amount),0)::float AS toplam_tutar
    FROM rex_001_cheques
  `);
  out.sections.chequeSummary = chequeSummary.rows[0];

  // ═══════════════════════════════════════════════════════════════════
  h('5) STOK — products');
  // ═══════════════════════════════════════════════════════════════════
  const productSummary = await q(c, `
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE stock < 0)::int AS negative_stock,
           COUNT(*) FILTER (WHERE stock = 0)::int AS zero_stock,
           COUNT(*) FILTER (WHERE is_active = true)::int AS aktif,
           COALESCE(SUM(stock * cost),0)::float AS stok_maliyet_degeri,
           COALESCE(SUM(stock * price),0)::float AS stok_satis_degeri
    FROM rex_001_products
  `);
  out.sections.productSummary = productSummary.rows[0];

  const negStock = await q(c, `
    SELECT code, name, stock::float, cost::float, price::float,
           (stock * cost)::float AS negatif_deger
    FROM rex_001_products
    WHERE stock < 0
    ORDER BY stock ASC
    LIMIT 20
  `);
  out.sections.negativeStockProducts = negStock.rows;

  const productStockTotals = await q(c, `
    SELECT
      COALESCE(SUM(stock),0)::float AS toplam_adet,
      COUNT(*) FILTER (WHERE stock > 0)::int AS stoklu_urun,
      COUNT(*) FILTER (WHERE stock < 0)::int AS negatif_stoklu,
      COUNT(*) FILTER (WHERE stock <= min_stock AND is_active = true)::int AS min_altinda
    FROM rex_001_products
    WHERE is_active = true
  `);
  out.sections.activeProductStock = productStockTotals.rows[0];

  // ═══════════════════════════════════════════════════════════════════
  h('6) RİSK — negatif + çift kayıt + dönem');
  // ═══════════════════════════════════════════════════════════════════
  // Çift KASA_GIRIS (mevcut durum)
  const dupCash = await q(c, `
    WITH dup AS (
      SELECT date::date AS d, amount, register_id, COUNT(*) AS adet
      FROM rex_001_01_cash_lines
      WHERE transaction_type = 'KASA_GIRIS'
      GROUP BY 1,2,3
      HAVING COUNT(*) > 1
    )
    SELECT COUNT(*)::int AS grup_sayisi,
           COALESCE(SUM((adet - 1) * amount),0)::float AS fazla_tutar,
           COALESCE(SUM(adet - 1),0)::int AS silinecek_satir
    FROM dup
  `);
  out.sections.duplicateKasaGiris = dupCash.rows[0];

  const dupCashByDate = await q(c, `
    SELECT date::date AS d, amount, COUNT(*)::int AS adet
    FROM rex_001_01_cash_lines
    WHERE transaction_type = 'KASA_GIRIS'
    GROUP BY 1,2
    HAVING COUNT(*) > 1
    ORDER BY adet DESC, amount DESC
    LIMIT 10
  `);
  out.sections.duplicateKasaGirisSamples = dupCashByDate.rows;

  // Genel çift kayıt taraması: cash_lines
  const dupCashAll = await q(c, `
    SELECT date::date AS d, amount, sign, transaction_type, register_id::text, COUNT(*)::int AS adet
    FROM rex_001_01_cash_lines
    GROUP BY 1,2,3,4,5
    HAVING COUNT(*) > 1
    ORDER BY adet DESC
    LIMIT 15
  `);
  out.sections.allDuplicateCashLines = dupCashAll.rows;

  // Dönemler
  const periods = await q(c, `
    SELECT id::text, firm_id::text, nr, beg_date, end_date, is_active, "default"
    FROM periods
    ORDER BY nr
  `);
  out.sections.periods = periods.rows;

  // Negatif kasa bakiyeli kasaların detayı
  const negCashDetail = await q(c, `
    SELECT cr.code, cr.name, cr.balance::float, cr.currency_code,
           (SELECT COUNT(*) FROM rex_001_01_cash_lines WHERE register_id = cr.id)::int AS hareket_sayisi,
           (SELECT COALESCE(SUM(amount * sign),0)::float FROM rex_001_01_cash_lines WHERE register_id = cr.id) AS hareket_net
    FROM rex_001_cash_registers cr
    WHERE cr.balance < 0
  `);
  out.sections.negativeCashDetail = negCashDetail.rows;

  // ═══════════════════════════════════════════════════════════════════
  h('7) KDV dağılımı');
  // ═══════════════════════════════════════════════════════════════════
  const vatDist = await q(c, `
    SELECT
      COUNT(*) FILTER (WHERE total_net IS NULL)::int AS net_null,
      COUNT(*) FILTER (WHERE total_gross IS NULL)::int AS gross_null,
      COUNT(*) FILTER (WHERE total_vat IS NULL)::int AS vat_null,
      COUNT(*) FILTER (WHERE total_net = 0 AND total_gross = 0)::int AS sifir_tutar,
      COUNT(*)::int AS toplam
    FROM rex_001_01_sales
  `);
  out.sections.vatNulls = vatDist.rows[0];

  // KDV oranı (sale_items üzerinden — daha doğru)
  const siVat = await q(c, `
    SELECT
      COUNT(*)::int AS kalem_sayisi,
      COUNT(*) FILTER (WHERE vat_rate IS NULL)::int AS vat_null_kalem,
      COUNT(*) FILTER (WHERE vat_rate = 0)::int AS vat_sifir_kalem,
      SUM(net_amount)::float AS kalem_net_toplam
    FROM rex_001_01_sale_items
  `);
  out.sections.vatSaleItems = siVat.rows[0];

  // ═══════════════════════════════════════════════════════════════════
  h('8) DB SAĞLIK');
  // ═══════════════════════════════════════════════════════════════════
  const dbSize = await q(c, `
    SELECT pg_size_pretty(pg_database_size(current_database())) AS db_size,
           pg_database_size(current_database())::bigint AS size_bytes
  `);
  out.sections.dbSize = dbSize.rows[0];

  const tblSizes = await q(c, `
    SELECT schemaname, relname,
           pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
           pg_total_relation_size(relid)::bigint AS size_bytes,
           n_live_tup AS rows,
           seq_scan, idx_scan
    FROM pg_stat_user_tables
    WHERE relname ~ '^rex_001'
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 15
  `);
  out.sections.topTables = tblSizes.rows;

  const slowTables = await q(c, `
    SELECT relname, seq_scan, idx_scan,
           n_live_tup AS rows,
           pg_size_pretty(pg_total_relation_size(relid)) AS size
    FROM pg_stat_user_tables
    WHERE relname ~ '^rex_001'
      AND n_live_tup > 100
      AND (seq_scan > idx_scan OR idx_scan IS NULL)
    ORDER BY n_live_tup DESC
    LIMIT 10
  `);
  out.sections.missingIndexCandidates = slowTables.rows;

  const deadTuples = await q(c, `
    SELECT relname, n_live_tup, n_dead_tup,
           ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup, 0), 2) AS dead_pct
    FROM pg_stat_user_tables
    WHERE relname ~ '^rex_001' AND n_dead_tup > 100
    ORDER BY n_dead_tup DESC
    LIMIT 10
  `);
  out.sections.deadTuples = deadTuples.rows;

  const activeConn = await q(c, `
    SELECT COUNT(*) FILTER (WHERE state = 'active') AS aktif,
           COUNT(*) FILTER (WHERE state = 'idle') AS idle,
           COUNT(*) AS toplam
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);
  out.sections.connections = activeConn.rows[0];

  await c.end();

  // ═══════════════════════════════════════════════════════════════════
  // DOSYA ÇIKTISI
  // ═══════════════════════════════════════════════════════════════════
  const fname = `./aqua_beauty_audit_${T.replace(/[:.]/g, '-')}.json`;
  writeFileSync(fname, JSON.stringify(out, null, 2));
  log(`\n💾 Detay JSON: ${fname}`);

  // ═══════════════════════════════════════════════════════════════════
  // KONSOL ÖZETİ
  // ═══════════════════════════════════════════════════════════════════
  log('\n\n');
  sep();
  log('📊 aqua_beauty DENETİM ÖZETİ');
  sep();

  log('\n## KASA');
  log('| Code | Name | Balance | Currency | Lines |');
  log('|------|------|---------|----------|-------|');
  for (const r of cashReg.rows || []) {
    const bal = Number(r.balance || 0).toLocaleString('tr-TR');
    const flag = r.balance < 0 ? ' ⚠️' : '';
    log(`| ${r.code} | ${r.name} | ${bal}${flag} | ${r.currency_code} | ${r.line_count} |`);
  }
  log(`\n  Toplam kasa bakiyesi: ${Number(cashBalance.rows[0].total_balance).toLocaleString('tr-TR')}`);
  log(`  Negatif kasa sayısı: ${cashBalance.rows[0].negative_count}`);

  log('\n## KASA transaction_type dağılımı');
  log('| Type | Adet | Toplam | Net (sign*amount) |');
  log('|------|------|--------|-------------------|');
  for (const r of txTypes.rows) {
    log(`| ${r.transaction_type || 'NULL'} | ${r.n} | ${Number(r.toplam_borc||0).toLocaleString('tr-TR')} | ${Number(r.net_etki||0).toLocaleString('tr-TR')} |`);
  }

  log('\n## BANKA');
  if (bankReg.rows.length === 0) {
    log('  ❌ HİÇ BANKA HESABI YOK');
  } else {
    log('| Code | Name | Balance | Currency | Lines |');
    log('|------|------|---------|----------|-------|');
    for (const r of bankReg.rows) {
      log(`| ${r.code} | ${r.name} | ${Number(r.balance||0).toLocaleString('tr-TR')} | ${r.currency_code} | ${r.line_count} |`);
    }
  }

  log('\n## CARİ');
  log('  Müşteri: ' + JSON.stringify(custSummary.rows[0]));
  log('  Tedarikçi: ' + JSON.stringify(suppSummary.rows[0]));

  log('\n  TOP 5 Müşteri (|balance|):');
  for (const r of topCustomers.rows.slice(0, 5)) {
    log(`    ${r.code} ${r.name} → ${Number(r.balance).toLocaleString('tr-TR')} (${r.durum})`);
  }
  log('\n  TOP 5 Tedarikçi (|balance|):');
  for (const r of topSuppliers.rows.slice(0, 5)) {
    log(`    ${r.code} ${r.name} → ${Number(r.balance).toLocaleString('tr-TR')} (${r.durum})`);
  }

  log('\n## FATURA');
  log(`  sales: ${JSON.stringify(salesSummary.rows[0])}`);
  log('  sales fiche_type dağılımı:');
  for (const r of salesByType.rows) {
    log(`    ${r.fiche_type} → ${r.n} adet / ${Number(r.toplam).toLocaleString('tr-TR')}`);
  }
  log('  partner_distributions: ' + JSON.stringify(distSummary.rows?.[0]));
  log('  cheques: ' + JSON.stringify(chequeSummary.rows?.[0]));
  if (distTypes.rows?.length) {
    log('  dist base_type / trigger_type:');
    for (const r of distTypes.rows) {
      log(`    ${r.base_type}/${r.trigger_type} → ${r.n} / ${Number(r.toplam).toLocaleString('tr-TR')}`);
    }
  }

  log('\n## STOK');
  log(`  products: ${JSON.stringify(productSummary.rows[0])}`);
  log(`  negatif stoklu ürünler:`);
  for (const r of (negStock.rows || []).slice(0, 5)) {
    log(`    ${r.code} ${r.name} → stok: ${r.stock}, negatif değer: ${Number(r.negatif_deger).toLocaleString('tr-TR')}`);
  }

  log('\n## RİSK');
  log(`  Çift KASA_GIRIS: ${JSON.stringify(dupCash.rows[0])}`);
  log('  Çift KASA_GIRIS örnekleri:');
  for (const r of dupCashByDate.rows.slice(0, 5)) {
    log(`    ${r.d} | ${Number(r.amount).toLocaleString('tr-TR')} x${r.adet}`);
  }
  log(`  Orphan cash_lines (register_id NULL): ${JSON.stringify(orphanCashLines.rows[0])}`);
  log('  Dönemler:');
  for (const p of periods.rows) {
    log(`    nr=${p.nr} ${p.beg_date?.toISOString().slice(0,10)} → ${p.end_date?.toISOString().slice(0,10)}  aktif=${p.is_active} default=${p.default}`);
  }

  log('\n## KDV');
  log(`  sales null kontrol: ${JSON.stringify(vatDist.rows[0])}`);
  log(`  sale_items: ${JSON.stringify(siVat.rows[0])}`);

  log('\n## DB');
  log(`  DB size: ${dbSize.rows[0].db_size}`);
  log(`  Connections: ${JSON.stringify(activeConn.rows[0])}`);
  log('  Top tables:');
  for (const r of tblSizes.rows.slice(0, 8)) {
    log(`    ${r.schemaname}.${r.relname} → ${r.total_size} (${r.rows} rows, seq=${r.seq_scan}, idx=${r.idx_scan})`);
  }
  log('  Dead tuples (VACUUM adayı):');
  for (const r of deadTuples.rows) {
    log(`    ${r.relname} → ${r.n_dead_tup} dead (${r.dead_pct}%)`);
  }
  log('  Missing index candidates (yüksek satır, çoğunlukla seq_scan):');
  for (const r of slowTables.rows) {
    log(`    ${r.relname} → ${r.rows} satır, seq=${r.seq_scan}, idx=${r.idx_scan}`);
  }

  sep();
  log(`Detay JSON: ${fname}`);
  sep();
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
