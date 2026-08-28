// 3. dalga: eksik kontrolleri tamamla
import pg from 'pg';
const HOST = '72.60.182.107';
const TARGETS = ['ozbek', 'pdks_demo', 'retailex_demo', 'sitigroup', 'testere', 'zetem'];

async function q(c, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

const out = [];
for (const db of TARGETS) {
  const c = new pg.Client({
    host: HOST, port: 5432, user: 'postgres', password: 'Yq7xwQpt6c',
    database: db, connectionTimeoutMillis: 8000,
  });
  const rec = { db };
  try {
    await c.connect();

    // Tabloları al
    const tblsQ = await q(c, `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast') AND table_type='BASE TABLE'`);
    const tbls = tblsQ.ok ? tblsQ.rows : [];

    // === Cari (parties mi customers mi?) ===
    const partyTbl = tbls.find(t => /^parties$|^cari$|^partners$/i.test(t.table_name) && t.table_schema === 'public');
    const custTbl = tbls.find(t => /^customers$|^customer$/i.test(t.table_name) && t.table_schema === 'public');
    const supplierTbl = tbls.find(t => /^suppliers$|^supplier$/i.test(t.table_name) && t.table_schema === 'public');
    rec.partyTable = partyTbl ? `${partyTbl.table_schema}.${partyTbl.table_name}` : null;
    rec.customerTablePublic = custTbl ? `${custTbl.table_schema}.${custTbl.table_name}` : null;
    rec.supplierTable = supplierTbl ? `${supplierTbl.table_schema}.${supplierTbl.table_name}` : null;

    // parties tablosunun detayı
    if (partyTbl) {
      const pc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [partyTbl.table_schema, partyTbl.table_name]);
      rec.partyColumns = pc.ok ? pc.rows.map(r => r.column_name) : [];
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${partyTbl.table_schema}"."${partyTbl.table_name}"`);
      rec.partyRowCount = cnt.ok ? cnt.rows[0].n : 0;

      // type dağılımı + balance
      const balCol = rec.partyColumns.find(x => /balance/i.test(x));
      const typeCol = rec.partyColumns.find(x => /^(type|category|cari_turu|kind|party_type|is_customer|is_supplier)$/i.test(x));
      if (balCol && typeCol) {
        const tx = await q(c, `
          SELECT "${typeCol}"::text AS t, COUNT(*)::int AS n,
            AVG("${balCol}")::float AS avg_bal,
            SUM(CASE WHEN "${balCol}">0 THEN 1 ELSE 0 END)::int AS pos,
            SUM(CASE WHEN "${balCol}"<0 THEN 1 ELSE 0 END)::int AS neg,
            SUM(CASE WHEN "${balCol}"=0 THEN 1 ELSE 0 END)::int AS zero
          FROM "${partyTbl.table_schema}"."${partyTbl.table_name}" GROUP BY "${typeCol}" ORDER BY n DESC
        `);
        rec.partyByType = tx.ok ? tx.rows : null;
      }
      // sadece balance
      if (balCol) {
        const bsd = await q(c, `
          SELECT
            SUM(CASE WHEN "${balCol}">0 THEN 1 ELSE 0 END)::int AS pos_n,
            SUM(CASE WHEN "${balCol}"<0 THEN 1 ELSE 0 END)::int AS neg_n,
            SUM(CASE WHEN "${balCol}"=0 THEN 1 ELSE 0 END)::int AS zero_n,
            SUM(CASE WHEN "${balCol}">0 THEN "${balCol}" ELSE 0 END)::float AS pos_sum,
            SUM(CASE WHEN "${balCol}"<0 THEN "${balCol}" ELSE 0 END)::float AS neg_sum
          FROM "${partyTbl.table_schema}"."${partyTbl.table_name}"
        `);
        rec.partyBalanceSummary = bsd.ok ? bsd.rows[0] : null;
      }
    }

    // customers tablosu varsa
    if (custTbl && custTbl.table_name !== 'parties') {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${custTbl.table_schema}"."${custTbl.table_name}"`);
      rec.customerCount = cnt.ok ? cnt.rows[0].n : 0;
    }

    // suppliers
    if (supplierTbl) {
      const sc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [supplierTbl.table_schema, supplierTbl.table_name]);
      rec.supplierColumns = sc.ok ? sc.rows.map(r => r.column_name) : [];
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${supplierTbl.table_schema}"."${supplierTbl.table_name}"`);
      rec.supplierCount = cnt.ok ? cnt.rows[0].n : 0;
    }

    // === Items orphan (düzeltme) ===
    // gerçek sale_items tablosu bul
    const realItems = tbls.find(t => /^rex_\d+_\d+_sale_items$/.test(t.table_name) && t.table_schema === 'public');
    if (!realItems) {
      // fallback
      const cand = tbls.filter(t => /sale_items$/.test(t.table_name) && t.table_schema === 'public');
      rec.allItemsCandidates = cand.map(t => `${t.table_schema}.${t.table_name}`);
    }

    // her bir candidate için orphan
    const itemCand = tbls.filter(t => /_sale_items$/.test(t.table_name) && t.table_schema === 'public');
    const itemOrphanResults = [];
    for (const it of itemCand) {
      // kendi sales'ını bul (firm_nr eşleştirmesi gerekebilir)
      const firmMatch = it.table_name.match(/^rex_(\d+)_\d+_sale_items$/);
      let saleTbl = null;
      if (firmMatch) {
        const firm = firmMatch[1];
        saleTbl = tbls.find(t => new RegExp(`^rex_${firm}_\\d+_sales$`).test(t.table_name) && t.table_schema === 'public');
      }
      const cntQ = await q(c, `SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}"`);
      const cnt = cntQ.ok ? cntQ.rows[0].n : 0;
      let orphans = null;
      if (saleTbl && cnt > 0) {
        const o = await q(c, `
          SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}" i
          LEFT JOIN "${saleTbl.table_schema}"."${saleTbl.table_name}" s ON s.id = i.sale_id
          WHERE s.id IS NULL AND i.sale_id IS NOT NULL
        `);
        orphans = o.ok ? o.rows[0].n : null;
      }
      itemOrphanResults.push({
        items: `${it.table_schema}.${it.table_name}`,
        items_n: cnt,
        sales_link: saleTbl ? `${saleTbl.table_schema}.${saleTbl.table_name}` : null,
        orphans
      });
    }
    rec.itemsAnalysis = itemOrphanResults;

    // === Period kontrol düzeltme: is_active + is_closed ayrı mı, default ayrı mı ===
    const periodTbl = tbls.find(t => /^(period|periods|erm_periods)$/i.test(t.table_name) && t.table_schema === 'public');
    if (periodTbl) {
      const pcols = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [periodTbl.table_schema, periodTbl.table_name]);
      const cols = pcols.ok ? pcols.rows.map(r => r.column_name) : [];
      rec.periodColumns = cols;
      const nrCol = cols.find(x => /^nr$|^period_nr$/i.test(x));
      const firmCol = cols.find(x => /firm_id|firma/i.test(x));
      const activeCol = cols.find(x => /is_active|^active$/i.test(x));
      const closedCol = cols.find(x => /is_closed|^closed$/i.test(x));
      const lockCol = cols.find(x => /lock|kilit/i.test(x));
      rec.periodActiveCol = activeCol;
      rec.periodClosedCol = closedCol;
      rec.periodLockCol = lockCol;
      rec.periodNrCol = nrCol;
      rec.periodFirmCol = firmCol;

      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${periodTbl.table_schema}"."${periodTbl.table_name}"`);
      rec.periodCount = cnt.ok ? cnt.rows[0].n : 0;

      // aktif/pasif dağılım
      if (activeCol) {
        const dist = await q(c, `SELECT "${activeCol}"::text AS v, COUNT(*)::int AS n FROM "${periodTbl.table_schema}"."${periodTbl.table_name}" GROUP BY "${activeCol}"`);
        rec.periodActiveDist = dist.ok ? dist.rows : null;
      }

      // full period listesi (firm/nr/status)
      const selectCols = [nrCol, firmCol, activeCol, closedCol, lockCol].filter(Boolean);
      if (selectCols.length) {
        const colsSql = selectCols.map(c => `"${c}"::text AS ${c}`).join(', ');
        const list = await q(c, `SELECT ${colsSql} FROM "${periodTbl.table_schema}"."${periodTbl.table_name}" ORDER BY 1 LIMIT 30`);
        rec.periodFullList = list.ok ? list.rows : null;
      }
    }

    // === Sales kapalı period'da mı ===
    const realSales = tbls.find(t => /^rex_(\d+)_\d+_sales$/.test(t.table_name) && t.table_schema === 'public');
    if (realSales && periodTbl) {
      const firmMatch = realSales.table_name.match(/^rex_(\d+)_\d+_sales$/);
      const salesFirm = firmMatch ? firmMatch[1] : null;

      // Daha basit: period'daki active=false olanları "kapalı" kabul edelim
      // veya closed col varsa onu, lockCol varsa onu
      let closedWhere = null;
      if (rec.periodClosedCol) closedWhere = `"${rec.periodClosedCol}"::text ILIKE ANY (ARRAY['true','t','1','kilitli','evet'])`;
      else if (rec.periodLockCol) closedWhere = `"${rec.periodLockCol}"::text ILIKE ANY (ARRAY['true','t','1','kilitli','evet'])`;
      else if (rec.periodActiveCol) closedWhere = `(NOT "${rec.periodActiveCol}" OR "${rec.periodActiveCol}"::text='false' OR "${rec.periodActiveCol}"::text='f')`;
      if (closedWhere && rec.periodNrCol) {
        // firm_id ile eşleşirse
        const firmCond = rec.periodFirmCol && salesFirm
          ? ` AND "${rec.periodFirmCol}"::text = '${salesFirm}'`
          : '';
        const list = await q(c, `
          SELECT nr FROM (
            SELECT DISTINCT "${rec.periodNrCol}"::text AS nr, "${rec.periodFirmCol || 'firm_id'}"::text AS fid, "${rec.periodClosedCol || rec.periodLockCol || rec.periodActiveCol}"::text AS status
            FROM "${periodTbl.table_schema}"."${periodTbl.table_name}"
            WHERE ${closedWhere}${firmCond}
          ) AS x
        `);
        const closedNrs = list.ok ? list.rows.map(r => r.nr) : [];
        rec.closedPeriods = closedNrs;
        if (closedNrs.length) {
          const ph = closedNrs.map(() => '?').join(',');
          const sc = await q(c, `
            SELECT COUNT(*)::int AS n FROM "${realSales.table_schema}"."${realSales.table_name}"
            WHERE period_nr::text IN (${ph})
          `, closedNrs);
          rec.salesInClosedPeriod = sc.ok ? sc.rows[0].n : null;
        }
      }
    }

    // === Çek/Senet — şema tara ===
    // 'cheque', 'cek', 'senet' tabloları
    rec.chequeTables = tbls.filter(t => /cheque|check_|cek|senet|portföy|portfolio/i.test(t.table_name)).map(t => `${t.table_schema}.${t.table_name}`);

    // === firm_nr distinct (düzeltilmiş) ===
    // Geniş örnek
    const sampleTbls = tbls.filter(t => /^rex_\d+_\d+_/.test(t.table_name) && t.table_schema === 'public').slice(0, 30);
    const firmMap = {};
    for (const t of sampleTbls) {
      const tc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [t.table_schema, t.table_name]);
      const cols = tc.ok ? tc.rows.map(r => r.column_name) : [];
      if (cols.includes('firm_nr')) {
        const r = await q(c, `SELECT firm_nr::text AS f, COUNT(*)::int AS n FROM "${t.table_schema}"."${t.table_name}" GROUP BY firm_nr`);
        if (r.ok) firmMap[`${t.table_schema}.${t.table_name}`] = r.rows;
      }
    }
    rec.firmNrByTable = firmMap;

    // Tüm firm_nr distinct set
    const allFirms = new Set();
    for (const arr of Object.values(firmMap)) {
      for (const x of arr) allFirms.add(x.f);
    }
    rec.allFirms = [...allFirms].sort();

    // === sales tablosunda firm_nr distinct ===
    if (realSales) {
      const sf = await q(c, `SELECT firm_nr::int AS f, COUNT(*)::int AS n FROM "${realSales.table_schema}"."${realSales.table_name}" GROUP BY firm_nr`);
      rec.salesFirms = sf.ok ? sf.rows : null;
    }

    // === testere items 39 — orphan hesapla ===
    // (yukarda itemOrphanResults'ta var)

    // === WMS stock_movements ===
    const stockTbl = tbls.find(t => t.table_schema === 'public' && /stock_movements$|^stock_movements_/.test(t.table_name));
    rec.stockMovementsTable = stockTbl ? `${stockTbl.table_schema}.${stockTbl.table_name}` : null;
    if (!stockTbl) {
      // wms şemasında ara
      const w = tbls.filter(t => t.table_schema === 'wms' && /stock_movements|movement/.test(t.table_name));
      rec.wmsMovements = w.map(t => `${t.table_schema}.${t.table_name}`);
      if (w[0]) {
        const sm = w[0];
        const sc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [sm.table_schema, sm.table_name]);
        rec.wmsMovementsCols = sc.ok ? sc.rows.map(r => r.column_name) : [];
        const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${sm.table_schema}"."${sm.table_name}"`);
        rec.wmsMovementsCount = cnt.ok ? cnt.rows[0].n : 0;
      }
    } else {
      const sc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [stockTbl.table_schema, stockTbl.table_name]);
      rec.stockCols = sc.ok ? sc.rows.map(r => r.column_name) : [];
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${stockTbl.table_schema}"."${stockTbl.table_name}"`);
      rec.stockCount = cnt.ok ? cnt.rows[0].n : 0;
    }

    // === cash_lines orphan ===
    const cashTbl = tbls.find(t => /^cash_lines$/.test(t.table_name) && t.table_schema === 'public');
    rec.cashTable = cashTbl ? `${cashTbl.table_schema}.${cashTbl.table_name}` : null;
    if (cashTbl && realSales) {
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [cashTbl.table_schema, cashTbl.table_name]);
      rec.cashCols = cc.ok ? cc.rows.map(r => r.column_name) : [];
      if (rec.cashCols.includes('sale_id')) {
        const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${cashTbl.table_schema}"."${cashTbl.table_name}"`);
        rec.cashRowCount = cnt.ok ? cnt.rows[0].n : 0;
        if (rec.cashRowCount > 0) {
          const o = await q(c, `
            SELECT COUNT(*)::int AS n FROM "${cashTbl.table_schema}"."${cashTbl.table_name}" c
            LEFT JOIN "${realSales.table_schema}"."${realSales.table_name}" s ON s.id = c.sale_id
            WHERE s.id IS NULL AND c.sale_id IS NOT NULL
          `);
          rec.cashOrphans = o.ok ? o.rows[0].n : null;
        }
      }
    }

    // === Kasa/Banka tabloları (satır sayıları) ===
    const kasa = tbls.find(t => /^kasa$|^cash$|^cash_register/i.test(t.table_name) && t.table_schema === 'public');
    const bank = tbls.find(t => /^bank$|^bank_account/i.test(t.table_name) && t.table_schema === 'public');
    if (kasa) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${kasa.table_schema}"."${kasa.table_name}"`);
      rec.kasaTable = `${kasa.table_schema}.${kasa.table_name}`;
      rec.kasaCount = cnt.ok ? cnt.rows[0].n : 0;
    }
    if (bank) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${bank.table_schema}"."${bank.table_name}"`);
      rec.bankTable = `${bank.table_schema}.${bank.table_name}`;
      rec.bankCount = cnt.ok ? cnt.rows[0].n : 0;
    }

    // === firm_nr içermeyen rex_* tabloları (tüm hepsi için) ===
    const rexFirmCols = {};
    for (const t of tbls.filter(x => /^rex_\d+/.test(x.table_name))) {
      const tc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [t.table_schema, t.table_name]);
      const cols = tc.ok ? tc.rows.map(r => r.column_name) : [];
      const hasFirm = cols.includes('firm_nr') || cols.includes('firm_id');
      const hasPeriod = cols.includes('period_nr');
      const key = `${t.table_schema}.${t.table_name}`;
      rexFirmCols[key] = { hasFirmNr: hasFirm, hasPeriodNr: hasPeriod, cols_n: cols.length };
    }
    rec.rexTableMeta = rexFirmCols;
    const missingFirmNr = Object.entries(rexFirmCols).filter(([,v]) => !v.hasFirmNr).length;
    const missingPeriodNr = Object.entries(rexFirmCols).filter(([,v]) => !v.hasPeriodNr).length;
    rec.missingFirmNr = missingFirmNr;
    rec.missingPeriodNr = missingPeriodNr;

    // === iade oranını DETAYLI test et ===
    // testere'de neg_no_ret=1 var — bu gerçek bir sorun; incele
    if (realSales && rec.db === 'TESTERE') {
      const scols = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [realSales.table_schema, realSales.table_name]);
      const cols = scols.ok ? scols.rows.map(r => r.column_name) : [];
      const netCol = cols.find(x => /^net_amount$|^grand_total$/i.test(x));
      const ftCol = cols.find(x => /^fiche_type$/.test(x));
      if (netCol) {
        const suspect = await q(c, `
          SELECT id, fiche_no, fiche_type::text AS ft, net_amount, currency::text AS cur, date::date AS dt, customer_id
          FROM "${realSales.table_schema}"."${realSales.table_name}"
          WHERE net_amount < 0
          LIMIT 10
        `);
        rec.testereNegSales = suspect.ok ? suspect.rows : null;
        // fiche_type distinct
        const d = await q(c, `
          SELECT COALESCE(fiche_type::text,'(NULL)') AS ft, COUNT(*)::int AS n
          FROM "${realSales.table_schema}"."${realSales.table_name}"
          GROUP BY fiche_type ORDER BY n DESC
        `);
        rec.testereFicheTypeDist = d.ok ? d.rows : null;
      }
    }

    // OZBEK items_total > sales_total: neden?
    if (realSales && rec.db === 'OZBEK') {
      const scols = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [realSales.table_schema, realSales.table_name]);
      const sCols = scols.ok ? scols.rows.map(r => r.column_name) : [];
      const itTbl = tbls.find(t => /^rex_001_01_sale_items$/.test(t.table_name) && t.table_schema === 'public');
      if (itTbl) {
        const ic = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [itTbl.table_schema, itTbl.table_name]);
        const iCols = ic.ok ? ic.rows.map(r => r.column_name) : [];
        const amtCol = iCols.find(x => /^amount$|^total$|^net_amount$/i.test(x));
        const qtyCol = iCols.find(x => /^quantity$|^qty$|^adet$/i.test(x));
        const priceCol = iCols.find(x => /^price$|^unit_price$|^birim_fiyat$/i.test(x));
        // grupla: items by sale
        const dup = await q(c, `
          SELECT sale_id, COUNT(*)::int AS n, SUM(${amtCol ? '"'+amtCol+'"' : '1'})::float AS amt_sum
          FROM "${itTbl.table_schema}"."${itTbl.table_name}"
          GROUP BY sale_id HAVING COUNT(*) > 1
          ORDER BY n DESC LIMIT 5
        `);
        rec.ozbekItemsMulti = dup.ok ? dup.rows : null;
        rec.ozbekItemAmountCol = amtCol;
        rec.ozbekItemQtyCol = qtyCol;
        rec.ozbekItemPriceCol = priceCol;
      }
    }

    // TESTERE items_total << sales_total: neden?
    if (realSales && rec.db === 'TESTERE') {
      const itTbl = tbls.find(t => /^rex_001_01_sale_items$/.test(t.table_name) && t.table_schema === 'public');
      if (itTbl) {
        const ic = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [itTbl.table_schema, itTbl.table_name]);
        const iCols = ic.ok ? ic.rows.map(r => r.column_name) : [];
        rec.tstItemCols = iCols;
        const amtCol = iCols.find(x => /^amount$|^total$|^net_amount$|^line_total$/i.test(x));
        rec.tstItemAmountCol = amtCol;
        if (amtCol) {
          const dist = await q(c, `
            SELECT
              COUNT(*)::int AS n,
              SUM(NULLIF("${amtCol}",0))::int AS amt_sum,
              AVG("${amtCol}")::float AS amt_avg,
              COUNT(*) FILTER (WHERE "${amtCol}"=0)::int AS zero,
              COUNT(*) FILTER (WHERE "${amtCol}" IS NULL)::int AS null_n
            FROM "${itTbl.table_schema}"."${itTbl.table_name}"
          `);
          rec.tstItemSummary = dist.ok ? dist.rows[0] : null;
        }
      }
    }

    // === bakiyesi sıfır olmayan kullanılmayan cariler (parties ile) ===
    if (partyTbl) {
      const pc = rec.partyColumns || [];
      const balCol = pc.find(x => /balance/i.test(x));
      if (balCol && realSales) {
        // realtime: balance != 0 AND customer_id not in sales
        const realSalesCols = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [realSales.table_schema, realSales.table_name]);
        const sCols = realSalesCols.ok ? realSalesCols.rows.map(r => r.column_name) : [];
        if (sCols.includes('customer_id')) {
          const u = await q(c, `
            SELECT COUNT(*)::int AS n
            FROM "${partyTbl.table_schema}"."${partyTbl.table_name}" p
            WHERE "${balCol}" != 0
              AND NOT EXISTS (SELECT 1 FROM "${realSales.table_schema}"."${realSales.table_name}" s WHERE s.customer_id = p.id)
          `);
          rec.unusedCustomersWithBalance = u.ok ? u.rows[0].n : null;
        }
      }
    }

  } catch (e) {
    rec.err = e.message;
  } finally {
    await c.end().catch(() => {});
  }
  out.push(rec);
}

console.log(JSON.stringify(out, null, 2));
