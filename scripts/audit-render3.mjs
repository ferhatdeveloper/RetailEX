import fs from 'fs';
const data = JSON.parse(fs.readFileSync('/tmp/audit-final2.json', 'utf8'));

for (const r of data) {
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log(`## ${r.db.toUpperCase()}`);
  if (r.err) { console.log(`HATA: ${r.err}`); continue; }

  console.log(`\n── CARİ (candidates) ──`);
  if (r.partyTablesFound) {
    for (const [t, info] of Object.entries(r.partyTablesFound)) {
      console.log(`  ${t}: ${info.count} satır`);
      if (info.count > 0) console.log(`    kolonlar: ${info.columns.join(', ')}`);
    }
  }
  if (r.rexParties?.length) {
    console.log(`\nrex_*_parties:`);
    for (const p of r.rexParties) {
      console.log(`  ${p.table}: ${p.count} satır | kolonlar: ${p.columns.join(', ')}`);
    }
  }

  console.log(`\n── TÜM party/cari/customer benzeri tablolar (${(r.allPartyLikeTables||[]).length}) ──`);
  if (r.allPartyLikeTables?.length) console.log(`  ${r.allPartyLikeTables.join(', ')}`);

  console.log(`\n── CASH_LINES ──`);
  for (const ct of (r.cashTablesFound || [])) {
    console.log(`  ${ct.table}: ${ct.count} satır, orphan: ${ct.orphanSales}`);
  }

  console.log(`\n── SALE_ITEMS DETAYLI ──`);
  for (const it of (r.itemsTablesFound || [])) {
    console.log(`  ${it.table}:`);
    console.log(`    satır: ${it.count}`);
    console.log(`    amount_col: ${it.amount_col}, qty_col: ${it.qty_col}, price_col: ${it.price_col}`);
    console.log(`    orphans: ${it.orphans}`);
    if (it.count > 0 && it.amount_col) {
      console.log(`    kolonlar: ${it.columns.join(', ')}`);
    }
  }

  if (r.testereFicheType) console.log(`\n── TESTERE fiche_type:`, r.testereFicheType);
  if (r.testereNegRows) console.log(`\n── TESTERE neg satırlar:`, r.testereNegRows);
  if (r.testereTrcode) console.log(`\n── TESTERE trcode:`, r.testereTrcode);

  if (r.ozbek_diff) {
    console.log(`\n── OZBEK sales vs items FARK (en büyük 10):`);
    for (const x of r.ozbek_diff) console.log(`  ${JSON.stringify(x)}`);
    console.log(`  itemAmountSummary: ${JSON.stringify(r.ozbek_itemAmountSummary)}`);
    console.log(`  zeroAmountItems: ${r.ozbek_zeroAmountItems}`);
  }
  if (r.testere_diff) {
    console.log(`\n── TESTERE sales vs items FARK (en büyük 10):`);
    for (const x of r.testere_diff) console.log(`  ${JSON.stringify(x)}`);
    console.log(`  itemAmountSummary: ${JSON.stringify(r.testere_itemAmountSummary)}`);
    console.log(`  zeroAmountItems: ${r.testere_zeroAmountItems}`);
  }

  if (r.testerePeriodFull) {
    console.log(`\n── TESTERE Period Full ──`);
    for (const p of r.testerePeriodFull) console.log(`  ${JSON.stringify(p)}`);
  }

  if (r.demoCustomerTables?.length) {
    console.log(`\n── Demo customer tabloları ──`);
    for (const x of r.demoCustomerTables) console.log(`  ${x.table}: ${x.count}`);
  }
}
