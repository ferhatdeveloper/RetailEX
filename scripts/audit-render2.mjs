import fs from 'fs';
const data = JSON.parse(fs.readFileSync('/tmp/audit-final.json', 'utf8'));

function dump(v, prefix = '') {
  if (v === null || v === undefined) return `${prefix}${v}`;
  if (typeof v !== 'object') return `${prefix}${v}`;
  if (Array.isArray(v)) {
    if (!v.length) return `${prefix}[]`;
    return v.map(x => `${prefix}- ${typeof x === 'object' ? JSON.stringify(x).slice(0,200) : x}`).join('\n');
  }
  return Object.entries(v).map(([k,val]) => {
    if (val === null) return `${prefix}${k}: null`;
    if (typeof val === 'object') {
      if (Array.isArray(val)) {
        if (!val.length) return `${prefix}${k}: []`;
        return `${prefix}${k}:\n${val.slice(0,15).map(x => `  ${prefix}${typeof x === 'object' ? JSON.stringify(x) : x}`).join('\n')}`;
      }
      const inner = Object.entries(val);
      if (!inner.length) return `${prefix}${k}: {}`;
      return `${prefix}${k}:\n${inner.slice(0,8).map(([k2,v2]) => `  ${prefix}${k2}: ${typeof v2 === 'object' ? JSON.stringify(v2) : v2}`).join('\n')}`;
    }
    return `${prefix}${k}: ${val}`;
  }).join('\n');
}

for (const r of data) {
  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log(`## ${r.db.toUpperCase()}`);
  if (r.err) { console.log(`HATA: ${r.err}`); continue; }

  console.log(`\n── CARİ/PARTY ──`);
  console.log(`parties tablosu: ${r.partyTable}`);
  console.log(`parties satır:   ${r.partyRowCount}`);
  console.log(`parties kolonlar: ${(r.partyColumns||[]).join(', ')}`);
  if (r.partyByType) console.log(`parties tip dağılımı:\n${dump(r.partyByType, '  ')}`);
  if (r.partyBalanceSummary) console.log(`parties bakiye özeti: ${JSON.stringify(r.partyBalanceSummary)}`);
  console.log(`\ncustomer tablosu (public): ${r.customerTablePublic || 'YOK'}`);
  console.log(`supplier tablosu:           ${r.supplierTable || 'YOK'} (satır: ${r.supplierCount || 0})`);
  console.log(`Kullanılmayan ama bakiyeli party: ${r.unusedCustomersWithBalance}`);

  console.log(`\n── ITEMS / ORPHAN ──`);
  console.log(dump(r.itemsAnalysis, ''));

  console.log(`\n── PERIOD ──`);
  console.log(`period kolonlar: ${(r.periodColumns||[]).join(', ')}`);
  console.log(`period count: ${r.periodCount}`);
  console.log(`nrCol: ${r.periodNrCol} | firmCol: ${r.periodFirmCol} | activeCol: ${r.periodActiveCol} | closedCol: ${r.periodClosedCol} | lockCol: ${r.periodLockCol}`);
  if (r.periodActiveDist) console.log(`active dağılımı: ${JSON.stringify(r.periodActiveDist)}`);
  if (r.periodFullList) console.log(`period listesi:\n${dump(r.periodFullList, '  ')}`);
  console.log(`kapalı periodlar: ${(r.closedPeriods||[]).join(', ')}`);
  console.log(`kapalı perioddaki sales: ${r.salesInClosedPeriod}`);

  console.log(`\n── ÇEK/SENET ──`);
  console.log(`tablolar: ${r.chequeTables || 'YOK'}`);

  console.log(`\n── FİRMALAR (firm_nr distinct) ──`);
  console.log(`toplam distinct: ${(r.allFirms||[]).join(', ')}`);
  if (r.salesFirms) console.log(`sales firm_nr dağılımı: ${JSON.stringify(r.salesFirms)}`);
  if (r.firmNrByTable && Object.keys(r.firmNrByTable).length) {
    console.log(`firm_nr dağılımı örnekleri:`);
    for (const [t, d] of Object.entries(r.firmNrByTable).slice(0, 8)) {
      console.log(`  ${t}: ${d.map(x=>`${x.f}=${x.n}`).join(', ')}`);
    }
  }
  console.log(`\nfirm_nr eksik rex_* tabloları: ${r.missingFirmNr} tablo`);
  console.log(`period_nr eksik rex_* tabloları: ${r.missingPeriodNr} tablo`);

  console.log(`\n── WMS / STOCK ──`);
  console.log(`stock_movements: ${r.stockMovementsTable || 'YOK'}`);
  if (r.wmsMovements?.length) console.log(`wms movements: ${r.wmsMovements.join(', ')} (count: ${r.wmsMovementsCount})`);
  if (r.wmsMovementsCols) console.log(`  kolonlar: ${r.wmsMovementsCols.join(', ')}`);
  if (r.stockCols) console.log(`  kolonlar: ${r.stockCols.join(', ')}`);
  console.log(`  satır: ${r.stockCount}`);

  console.log(`\n── KASA ──`);
  console.log(`cash lines: ${r.cashTable} (satır: ${r.cashRowCount}, orphan: ${r.cashOrphans})`);
  if (r.kasaTable) console.log(`kasa tablosu: ${r.kasaTable} (${r.kasaCount})`);
  if (r.bankTable) console.log(`bank tablosu: ${r.bankTable} (${r.bankCount})`);

  console.log(`\n── DETAYLI ARAŞTIRMA ──`);
  if (r.testereNegSales) console.log(`TESTERE negatif sales:\n${dump(r.testereNegSales, '  ')}`);
  if (r.testereFicheTypeDist) console.log(`TESTERE fiche_type:\n${dump(r.testereFicheTypeDist, '  ')}`);
  if (r.ozbekItemsMulti) console.log(`OZBEK çoklu items/sale:\n${dump(r.ozbekItemsMulti, '  ')}`);
  console.log(`OZBEK item kolonları: amount=${r.ozbekItemAmountCol} qty=${r.ozbekItemQtyCol} price=${r.ozbekItemPriceCol}`);
  if (r.tstItemCols) console.log(`TESTERE item kolonları: ${r.tstItemCols.join(', ')}`);
  console.log(`TESTERE item amount col: ${r.tstItemAmountCol}`);
  if (r.tstItemSummary) console.log(`TESTERE item özeti: ${JSON.stringify(r.tstItemSummary)}`);
}
