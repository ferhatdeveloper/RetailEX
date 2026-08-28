// /tmp/audit-deep.json'u oku ve okunabilir özet üret
import fs from 'fs';
const data = JSON.parse(fs.readFileSync('/tmp/audit-deep.json', 'utf8'));

for (const r of data) {
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log(`## ${r.db.toUpperCase()}`);
  if (r.err) { console.log(`HATA: ${r.err}`); continue; }

  console.log(`\n[TABLOLAR] toplam=${r.allTables?.length || 0}`);
  console.log(`[SALES] tablo=${r.realSalesTable} satır=${r.realSalesRowCount}`);
  if (r.realSalesColumns?.length) {
    console.log(`  Kolonlar: ${r.realSalesColumns.join(', ')}`);
  }
  if (r.realSalesAnalysis) {
    const a = r.realSalesAnalysis;
    console.log(`  Analiz:`, a);
  }
  if (r.cancelledReturns !== undefined) console.log(`  İptal+iade: ${r.cancelledReturns}`);
  if (r.salesCurrency) console.log(`  Currency:`, r.salesCurrency);
  if (r.salesDateRange) console.log(`  Tarih: ${r.salesDateRange.dmin} → ${r.salesDateRange.dmax}`);
  if (r.salesByFirm) console.log(`  firm_nr dağılımı:`, r.salesByFirm);
  if (r.salesByPeriod) console.log(`  period_nr dağılımı:`, r.salesByPeriod);

  console.log(`\n[ITEMS] tablo=${r.realItemsTable} satır=${r.realItemsRowCount} orphan=${r.itemsOrphans}`);
  if (r.dualWriteCompare) console.log(`  sales vs items toplam karşılaştırma:`, r.dualWriteCompare);

  console.log(`\n[PERIOD] tablo=${r.realSalesTable?.split('.')[0] === 'public' ? 'bulundu' : 'bilinmiyor'}`);
  if (r.periodCols) {
    console.log(`  Period kolonlar: ${r.periodCols.join(', ')}`);
    console.log(`  Kilit sütunu: ${r.periodClosedCol}`);
    if (r.periodDistribution) console.log(`  Dağılım:`, r.periodDistribution);
    if (r.periodList) console.log(`  Period listesi:`, r.periodList);
  }
  if (r.closedPeriodNumbers?.length) console.log(`  Kapalı period_nr: ${r.closedPeriodNumbers.join(', ')}`);
  if (r.salesInClosedPeriod !== undefined) console.log(`  Kapalı dönemdeki sales: ${r.salesInClosedPeriod}`);

  console.log(`\n[CUSTOMER] tablo=${r.realCustomerTable} adet=${r.customerCount}`);
  if (r.customerCols) console.log(`  Kolonlar: ${r.customerCols.join(', ')}`);

  console.log(`\n[BEAUTY] beautyPkgSales=${r.beautyPkgSales} satır=${r.beautyPkgSalesRowCount}`);
  if (r.beautyPkgSalesCols) console.log(`  Kolonlar: ${r.beautyPkgSalesCols.join(', ')}`);
  if (r.beautySessionCols) console.log(`  Sessions kolonlar: ${r.beautySessionCols.join(', ')}`);
  if (r.beautyCancelledWithUsed) console.log(`  İptal+used>0:`, r.beautyCancelledWithUsed);

  console.log(`\n[ÇEK/SENET TABLOLARI] ${r.checksTables?.length || 0}`);
  if (r.checksTables?.length) r.checksTables.forEach(t => console.log(`  - ${t}`));

  console.log(`\n[MIGRATION] toplam=${r.appliedMigrations?.length || 0} 128=${r.checksMig128}`);
  if (r.lastMigration) console.log(`  Son: ${r.lastMigration}`);

  console.log(`\n[FIRMA] distinct: ${JSON.stringify(r.totalDistinctFirms)}`);
  if (r.distinctFirmsInTables) {
    console.log(`  Örnek tablolar:`);
    for (const [k, v] of Object.entries(r.distinctFirmsInTables).slice(0, 5)) {
      console.log(`    ${k}: ${v.join(', ')}`);
    }
  }
}
