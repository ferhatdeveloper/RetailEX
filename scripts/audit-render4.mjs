import fs from 'fs';
const data = JSON.parse(fs.readFileSync('/tmp/audit-orphan.json', 'utf8'));

for (const r of data) {
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log(`## ${r.db.toUpperCase()}`);
  if (r.err) { console.log(`HATA: ${r.err}`); continue; }

  console.log(`\n── ITEMS ORPHAN (invoice_id / sale_id) ──`);
  for (const x of (r.itemsInvoiceAnalysis || [])) {
    console.log(`  ${x.items}: n=${x.count}`);
    console.log(`    orphans via invoice_id: ${x.orphans_invoice}`);
    console.log(`    orphans via sale_id:    ${x.orphans_sale_id}`);
  }

  console.log(`\n── CASH_LINES ORPHAN ──`);
  for (const x of (r.cashInvoiceAnalysis || [])) {
    console.log(`  ${x.cash}: n=${x.count}`);
    console.log(`    orphans via invoice_id: ${x.orphans_invoice}`);
    console.log(`    orphans via sale_id:    ${x.orphans_sale_id}`);
    if (x.cols?.includes('invoice_id') && !x.cols?.includes('sale_id')) {
      console.log(`    (bu tablo sale_id kullanmıyor, invoice_id ile bağlı)`);
    }
  }

  console.log(`\n── CUSTOMERS DETAY ──`);
  for (const x of (r.customersAnalysis || [])) {
    console.log(`  ${x.table}: n=${x.count}`);
    if (x.balance) {
      console.log(`    balance: pozitif=${x.balance.pos_n} negatif=${x.balance.neg_n} sıfır=${x.balance.zero_n} null=${x.balance.null_n}`);
      console.log(`    pozitif toplam: ${x.balance.pos_sum}`);
      console.log(`    negatif toplam: ${x.balance.neg_sum}`);
    }
    if (x.currency) console.log(`    currency:`, x.currency);
    if (x.typeDist) console.log(`    tip:`, x.typeDist);
  }

  console.log(`\n── SUPPLIERS DETAY ──`);
  for (const x of (r.suppliersAnalysis || [])) {
    console.log(`  ${x.table}: n=${x.count}`);
    if (x.balance) {
      console.log(`    balance: pozitif=${x.balance.pos_n} negatif=${x.balance.neg_n} sıfır=${x.balance.zero_n}`);
      console.log(`    pozitif toplam: ${x.balance.pos_sum}`);
      console.log(`    negatif toplam: ${x.balance.neg_sum}`);
    }
  }

  if (r.salesVsItemsTopDiff) {
    console.log(`\n── SALES vs ITEMS TOP-10 DIFF ──`);
    for (const x of r.salesVsItemsTopDiff) {
      console.log(`  ${JSON.stringify(x)}`);
    }
  }

  if (r.recentMigrations) {
    console.log(`\n── SON 10 MIGRATION ──`);
    for (const m of r.recentMigrations) console.log(`  ${m.applied_at?.substring(0,19)} — ${m.filename}`);
  }

  // cheque search
  const chequeKeys = Object.keys(r).filter(k => k.startsWith('chequeSearch_'));
  console.log(`\n── ÇEK/SENET arama ──`);
  if (chequeKeys.length === 0) {
    console.log(`  HİÇBİR çek/senet tablosu YOK (128 migration uygulanmamış)`);
  } else {
    for (const k of chequeKeys) console.log(`  ${k}: ${r[k].length} tablo`);
  }
}
