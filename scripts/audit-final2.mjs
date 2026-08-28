// 4. dalga: kesin cari/items/cash_lines kontrolleri
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

    // tüm tablolar
    const tblsQ = await q(c, `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast') AND table_type='BASE TABLE'`);
    const tbls = tblsQ.ok ? tblsQ.rows : [];

    // === PARTIES tam olarak ===
    // Hem "parties" hem "customers" arar
    const partyVariants = tbls.filter(t => /^parties$|^customers$|^customer$|^party$|^cari$|^partners$/i.test(t.table_name));
    const partyTables = {};
    for (const p of partyVariants) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${p.table_schema}"."${p.table_name}"`);
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [p.table_schema, p.table_name]);
      partyTables[`${p.table_schema}.${p.table_name}`] = {
        count: cnt.ok ? cnt.rows[0].n : 0,
        columns: cc.ok ? cc.rows.map(r => r.column_name) : []
      };
    }
    rec.partyTablesFound = partyTables;

    // rex_NNN_parties (firmalı kart)
    const rexParties = tbls.filter(t => /^rex_\d+_parties$/.test(t.table_name));
    rec.rexParties = [];
    for (const p of rexParties) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${p.table_schema}"."${p.table_name}"`);
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [p.table_schema, p.table_name]);
      rec.rexParties.push({
        table: `${p.table_schema}.${p.table_name}`,
        count: cnt.ok ? cnt.rows[0].n : 0,
        columns: cc.ok ? cc.rows.map(r => r.column_name) : []
      });
    }

    // === rex_NNN_periods (firmalı dönem) — zaten periods var ===
    // === Cash_lines: rex_NNN_NN_cash_lines (zaten var) ===
    const cashTables = tbls.filter(t => /^rex_\d+_\d+_cash_lines$/.test(t.table_name));
    rec.cashTablesFound = [];
    for (const ct of cashTables) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}"`);
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [ct.table_schema, ct.table_name]);
      const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];
      rec.cashTablesFound.push({
        table: `${ct.table_schema}.${ct.table_name}`,
        count: cnt.ok ? cnt.rows[0].n : 0,
        columns: cols
      });
      // orphan kontrol
      const firmMatch = ct.table_name.match(/^rex_(\d+)_(\d+)_cash_lines$/);
      if (firmMatch && cols.includes('sale_id')) {
        const firmId = firmMatch[1];
        const periodId = firmMatch[2];
        const saleTbl = tbls.find(t => new RegExp(`^rex_${firmId}_${periodId}_sales$`).test(t.table_name));
        if (saleTbl && cnt.ok && cnt.rows[0].n > 0) {
          const o = await q(c, `
            SELECT COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}" c
            LEFT JOIN "${saleTbl.table_schema}"."${saleTbl.table_name}" s ON s.id = c.sale_id
            WHERE s.id IS NULL AND c.sale_id IS NOT NULL
          `);
          rec.cashTablesFound[rec.cashTablesFound.length-1].orphanSales = o.ok ? o.rows[0].n : null;
        }
      }
    }

    // === Items detaylı (sale_items) — amount kolonu bul ===
    const itemsTables = tbls.filter(t => /^rex_\d+_\d+_sale_items$/.test(t.table_name));
    rec.itemsTablesFound = [];
    for (const it of itemsTables) {
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [it.table_schema, it.table_name]);
      const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}"`);
      const n = cnt.ok ? cnt.rows[0].n : 0;
      // amount veya total kolonu
      const amountCol = cols.find(x => /^amount$|^total$|^net_amount$|^line_total$|^subtotal$/i.test(x));
      const qtyCol = cols.find(x => /^quantity$|^qty$|^adet$/i.test(x));
      const priceCol = cols.find(x => /^price$|^unit_price$|^birim_fiyat$|^sale_price$/i.test(x));

      let orphan = null;
      const firmMatch = it.table_name.match(/^rex_(\d+)_(\d+)_sale_items$/);
      if (firmMatch) {
        const firmId = firmMatch[1];
        const periodId = firmMatch[2];
        const saleTbl = tbls.find(t => new RegExp(`^rex_${firmId}_${periodId}_sales$`).test(t.table_name));
        if (saleTbl && cols.includes('sale_id') && n > 0) {
          const o = await q(c, `
            SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}" i
            LEFT JOIN "${saleTbl.table_schema}"."${saleTbl.table_name}" s ON s.id = i.sale_id
            WHERE s.id IS NULL AND i.sale_id IS NOT NULL
          `);
          orphan = o.ok ? o.rows[0].n : null;
        }
      }
      rec.itemsTablesFound.push({
        table: `${it.table_schema}.${it.table_name}`,
        count: n,
        columns: cols,
        amount_col: amountCol,
        qty_col: qtyCol,
        price_col: priceCol,
        orphans: orphan
      });
    }

    // === TESTERE negatif sales detay ===
    if (db === 'testere') {
      const st = tbls.find(t => /^rex_001_01_sales$/.test(t.table_name) && t.table_schema === 'public');
      if (st) {
        const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [st.table_schema, st.table_name]);
        const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];
        // fiche_type distinct
        const ft = await q(c, `SELECT COALESCE(fiche_type::text,'(NULL)') AS ft, COUNT(*)::int AS n, MIN(net_amount)::float AS minv, MAX(net_amount)::float AS maxv FROM "${st.table_schema}"."${st.table_name}" GROUP BY fiche_type ORDER BY n DESC`);
        rec.testereFicheType = ft.ok ? ft.rows : null;
        // neg satırlar
        const neg = await q(c, `SELECT id, fiche_no, fiche_type::text AS ft, net_amount::float AS amt, currency::text AS cur, date::date AS dt, customer_id, notes FROM "${st.table_schema}"."${st.table_name}" WHERE net_amount < 0`);
        rec.testereNegRows = neg.ok ? neg.rows : null;
        // trcode distinct
        const tc = await q(c, `SELECT COALESCE(trcode::int,'-1') AS tc, COUNT(*)::int AS n FROM "${st.table_schema}"."${st.table_name}" GROUP BY trcode ORDER BY n DESC`);
        rec.testereTrcode = tc.ok ? tc.rows : null;
      }
    }

    // === OZBEK & TESTERE items analizi (items_total vs sales_total farkı) ===
    for (const targetDb of ['ozbek', 'testere']) {
      if (db !== targetDb) continue;
      const st = tbls.find(t => /^rex_001_01_sales$/.test(t.table_name) && t.table_schema === 'public');
      const it = tbls.find(t => /^rex_001_01_sale_items$/.test(t.table_name) && t.table_schema === 'public');
      if (st && it) {
        const sc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [st.table_schema, st.table_name]);
        const ic = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [it.table_schema, it.table_name]);
        const sCols = sc.ok ? sc.rows.map(r => r.column_name) : [];
        const iCols = ic.ok ? ic.rows.map(r => r.column_name) : [];
        const amountCol = sCols.find(x => /^net_amount$|^grand_total$/i.test(x));
        const itemAmtCol = iCols.find(x => /^amount$|^total$|^line_total$/i.test(x));
        const itemQtyCol = iCols.find(x => /^quantity$|^qty$/i.test(x));
        const itemPriceCol = iCols.find(x => /^price$|^unit_price$/i.test(x));

        if (amountCol && itemAmtCol) {
          // her sales için items toplamı, sales.net_amount ile karşılaştır
          const cmp = await q(c, `
            WITH item_totals AS (
              SELECT sale_id, SUM("${itemAmtCol}")::float AS items_amt, COUNT(*)::int AS items_n
              FROM "${it.table_schema}"."${it.table_name}" GROUP BY sale_id
            )
            SELECT
              s.id, s.fiche_no,
              s."${amountCol}"::float AS sales_amt,
              COALESCE(i.items_amt, 0) AS items_amt,
              COALESCE(i.items_n, 0) AS items_n,
              (s."${amountCol}"::float - COALESCE(i.items_amt, 0)) AS diff
            FROM "${st.table_schema}"."${st.table_name}" s
            LEFT JOIN item_totals i ON i.sale_id = s.id
            WHERE ABS(s."${amountCol}"::float - COALESCE(i.items_amt, 0)) > 0.01
            ORDER BY ABS(s."${amountCol}"::float - COALESCE(i.items_amt, 0)) DESC
            LIMIT 10
          `);
          rec[`${targetDb}_diff`] = cmp.ok ? cmp.rows : null;
        }

        // items amount=0 olanları say
        if (itemAmtCol) {
          const zeroItems = await q(c, `SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}" WHERE "${itemAmtCol}"=0 OR "${itemAmtCol}" IS NULL`);
          rec[`${targetDb}_zeroAmountItems`] = zeroItems.ok ? zeroItems.rows[0].n : null;
        }

        // items tüm amount toplamı (net_amount değil)
        if (itemAmtCol) {
          const sum = await q(c, `SELECT SUM("${itemAmtCol}")::float AS t, AVG("${itemAmtCol}")::float AS a, COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}"`);
          rec[`${targetDb}_itemAmountSummary`] = sum.ok ? sum.rows[0] : null;
        }
      }
    }

    // === Period: firm_id text olarak saklanıyor — distinct period listesini firm_id ile görelim ===
    if (db === 'testere') {
      const pt = tbls.find(t => /^periods$/.test(t.table_name) && t.table_schema === 'public');
      if (pt) {
        const list = await q(c, `SELECT nr::int AS nr, firm_id::text AS fid, beg_date::date, end_date::date, is_active::text, "default"::text FROM "${pt.table_schema}"."${pt.table_name}"`);
        rec.testerePeriodFull = list.ok ? list.rows : null;
      }
    }

    // === parties.full arama — daha geniş ===
    const allPartyLike = tbls.filter(t => /party|customer|cari|supplier|partner/i.test(t.table_name));
    rec.allPartyLikeTables = allPartyLike.map(t => `${t.table_schema}.${t.table_name}`);

    // === demo customers içeriği (eğer varsa) ===
    // Genelde demo veride customer yok, ama kontrol edelim
    const demoCustomers = tbls.filter(t => /customer/i.test(t.table_name));
    rec.demoCustomerTables = [];
    for (const ct of demoCustomers.slice(0, 5)) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}"`);
      rec.demoCustomerTables.push({
        table: `${ct.table_schema}.${ct.table_name}`,
        count: cnt.ok ? cnt.rows[0].n : 0
      });
    }

  } catch (e) {
    rec.err = e.message;
  } finally {
    await c.end().catch(() => {});
  }
  out.push(rec);
}

console.log(JSON.stringify(out, null, 2));
