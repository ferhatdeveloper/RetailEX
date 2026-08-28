// Final orphan ve cari analiz — invoice_id ile bağlantı + customers analizi
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

    const tblsQ = await q(c, `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast') AND table_type='BASE TABLE'`);
    const tbls = tblsQ.ok ? tblsQ.rows : [];

    // === ITEMS ORPHAN — invoice_id üzerinden ===
    const itemTables = tbls.filter(t => /^rex_\d+_\d+_sale_items$/.test(t.table_name) && t.table_schema === 'public');
    rec.itemsInvoiceAnalysis = [];
    for (const it of itemTables) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}"`);
      const n = cnt.ok ? cnt.rows[0].n : 0;
      if (n === 0) continue;
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [it.table_schema, it.table_name]);
      const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];

      const firmMatch = it.table_name.match(/^rex_(\d+)_(\d+)_sale_items$/);
      const firm = firmMatch[1];
      const period = firmMatch[2];
      const saleTbl = tbls.find(t => new RegExp(`^rex_${firm}_${period}_sales$`).test(t.table_name));

      // invoice_id ile orphan
      if (saleTbl && cols.includes('invoice_id')) {
        const o = await q(c, `
          SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}" i
          LEFT JOIN "${saleTbl.table_schema}"."${saleTbl.table_name}" s ON s.id = i.invoice_id
          WHERE s.id IS NULL AND i.invoice_id IS NOT NULL
        `);
        rec.itemsInvoiceAnalysis.push({
          items: it.table_name,
          count: n,
          orphans_invoice: o.ok ? o.rows[0].n : null
        });
      }

      // sale_id var mı?
      if (cols.includes('sale_id')) {
        const o2 = await q(c, `
          SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}" i
          LEFT JOIN "${saleTbl.table_schema}"."${saleTbl.table_name}" s ON s.id = i.sale_id
          WHERE s.id IS NULL AND i.sale_id IS NOT NULL
        `);
        rec.itemsInvoiceAnalysis[rec.itemsInvoiceAnalysis.length-1].orphans_sale_id = o2.ok ? o2.rows[0].n : null;
      }
    }

    // === cash_lines invoice_id/sale_id ===
    const cashTables = tbls.filter(t => /^rex_\d+_\d+_cash_lines$/.test(t.table_name) && t.table_schema === 'public');
    rec.cashInvoiceAnalysis = [];
    for (const ct of cashTables) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}"`);
      const n = cnt.ok ? cnt.rows[0].n : 0;
      if (n === 0) continue;
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [ct.table_schema, ct.table_name]);
      const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];
      const firmMatch = ct.table_name.match(/^rex_(\d+)_(\d+)_cash_lines$/);
      if (!firmMatch) continue;
      const firm = firmMatch[1];
      const period = firmMatch[2];
      const saleTbl = tbls.find(t => new RegExp(`^rex_${firm}_${period}_sales$`).test(t.table_name));

      const result = { cash: ct.table_name, count: n, cols: cols };
      if (saleTbl) {
        if (cols.includes('invoice_id')) {
          const o = await q(c, `
            SELECT COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}" c
            LEFT JOIN "${saleTbl.table_schema}"."${saleTbl.table_name}" s ON s.id = c.invoice_id
            WHERE s.id IS NULL AND c.invoice_id IS NOT NULL
          `);
          result.orphans_invoice = o.ok ? o.rows[0].n : null;
        }
        if (cols.includes('sale_id')) {
          const o2 = await q(c, `
            SELECT COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}" c
            LEFT JOIN "${saleTbl.table_schema}"."${saleTbl.table_name}" s ON s.id = c.sale_id
            WHERE s.id IS NULL AND c.sale_id IS NOT NULL
          `);
          result.orphans_sale_id = o2.ok ? o2.rows[0].n : null;
        }
      }
      rec.cashInvoiceAnalysis.push(result);
    }

    // === CUSTOMERS (rex_NNN_customers) detaylı analiz ===
    const customerTables = tbls.filter(t => /^rex_\d+_customers$/.test(t.table_name) && t.table_schema === 'public');
    rec.customersAnalysis = [];
    for (const ct of customerTables) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}"`);
      const n = cnt.ok ? cnt.rows[0].n : 0;
      if (n === 0) continue;
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [ct.table_schema, ct.table_name]);
      const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];

      const info = { table: ct.table_name, count: n, columns: cols };

      // balance dağılımı
      const balCol = cols.find(x => /balance/i.test(x));
      if (balCol) {
        const bsd = await q(c, `
          SELECT
            COUNT(*)::int AS n,
            SUM(CASE WHEN "${balCol}">0 THEN 1 ELSE 0 END)::int AS pos_n,
            SUM(CASE WHEN "${balCol}"<0 THEN 1 ELSE 0 END)::int AS neg_n,
            SUM(CASE WHEN "${balCol}"=0 THEN 1 ELSE 0 END)::int AS zero_n,
            SUM(CASE WHEN "${balCol}">0 THEN "${balCol}" ELSE 0 END)::float AS pos_sum,
            SUM(CASE WHEN "${balCol}"<0 THEN "${balCol}" ELSE 0 END)::float AS neg_sum,
            SUM(CASE WHEN "${balCol}" IS NULL THEN 1 ELSE 0 END)::int AS null_n
          FROM "${ct.table_schema}"."${ct.table_name}"
        `);
        info.balance = bsd.ok ? bsd.rows[0] : null;
      }
      // currency
      if (cols.includes('currency')) {
        const cur = await q(c, `SELECT COALESCE(currency::text,'(NULL)') AS c, COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}" GROUP BY currency`);
        info.currency = cur.ok ? cur.rows : null;
      }
      // tip/card_type
      const typeCol = cols.find(x => /type|category|cari_turu|kind|card_type/i.test(x));
      if (typeCol) {
        const tx = await q(c, `SELECT COALESCE("${typeCol}"::text,'(NULL)') AS t, COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}" GROUP BY "${typeCol}"`);
        info.typeDist = tx.ok ? tx.rows : null;
      }
      rec.customersAnalysis.push(info);
    }

    // === SUPPLIERS aynı ===
    const supplierTables = tbls.filter(t => /^rex_\d+_suppliers$/.test(t.table_name) && t.table_schema === 'public');
    rec.suppliersAnalysis = [];
    for (const ct of supplierTables) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${ct.table_schema}"."${ct.table_name}"`);
      const n = cnt.ok ? cnt.rows[0].n : 0;
      if (n === 0) continue;
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [ct.table_schema, ct.table_name]);
      const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];
      const info = { table: ct.table_name, count: n };
      const balCol = cols.find(x => /balance/i.test(x));
      if (balCol) {
        const bsd = await q(c, `
          SELECT
            SUM(CASE WHEN "${balCol}">0 THEN 1 ELSE 0 END)::int AS pos_n,
            SUM(CASE WHEN "${balCol}"<0 THEN 1 ELSE 0 END)::int AS neg_n,
            SUM(CASE WHEN "${balCol}"=0 THEN 1 ELSE 0 END)::int AS zero_n,
            SUM(CASE WHEN "${balCol}">0 THEN "${balCol}" ELSE 0 END)::float AS pos_sum,
            SUM(CASE WHEN "${balCol}"<0 THEN "${balCol}" ELSE 0 END)::float AS neg_sum
          FROM "${ct.table_schema}"."${ct.table_name}"
        `);
        info.balance = bsd.ok ? bsd.rows[0] : null;
      }
      rec.suppliersAnalysis.push(info);
    }

    // === OZBEK odağı: items vs sales toplam farkı (HER sales için) ===
    if (db === 'ozbek' || db === 'testere') {
      const firmNr = db === 'testere' ? '001' : '001';
      const st = tbls.find(t => /^rex_001_01_sales$/.test(t.table_name));
      const it = tbls.find(t => /^rex_001_01_sale_items$/.test(t.table_name));
      if (st && it) {
        const ic = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [it.table_schema, it.table_name]);
        const iCols = ic.ok ? ic.rows.map(r => r.column_name) : [];
        if (iCols.includes('invoice_id') && iCols.includes('net_amount')) {
          const cmp = await q(c, `
            WITH item_totals AS (
              SELECT invoice_id AS sid, SUM(net_amount)::float AS items_amt, COUNT(*)::int AS items_n
              FROM "${it.table_schema}"."${it.table_name}" GROUP BY invoice_id
            )
            SELECT
              s.id::text, s.fiche_no, s.fiche_type::text,
              s.net_amount::float AS sales_amt,
              COALESCE(i.items_amt, 0) AS items_amt,
              COALESCE(i.items_n, 0) AS items_n,
              (s.net_amount::float - COALESCE(i.items_amt, 0)) AS diff
            FROM "${st.table_schema}"."${st.table_name}" s
            LEFT JOIN item_totals i ON i.sid = s.id
            ORDER BY ABS(s.net_amount::float - COALESCE(i.items_amt, 0)) DESC
            LIMIT 10
          `);
          rec.salesVsItemsTopDiff = cmp.ok ? cmp.rows : null;
        }
      }
    }

    // === schema_migrations tam liste ===
    const sm = await q(c, `SELECT to_regclass('public.schema_migrations') AS t`);
    if (sm.ok && sm.rows[0]?.t) {
      const m = await q(c, `SELECT filename, applied_at::timestamp FROM public.schema_migrations ORDER BY id DESC LIMIT 10`);
      rec.recentMigrations = m.ok ? m.rows : null;
    }

    // === Çek/Senet tablolarını 128 için şema kontrol ===
    // 128_cheques_tracking.sql ne oluşturmalı — pg_class'ta ara
    const candidates = ['cheques_tracking','cheque_tracking','cheques','cheque','cek','cekler','senet','senetler','tracking_cheques','payment_cheques'];
    for (const cand of candidates) {
      const r = await q(c, `
        SELECT table_schema, table_name FROM information_schema.tables
        WHERE table_name ILIKE $1
          AND table_schema NOT IN ('pg_catalog','information_schema')
          AND table_type='BASE TABLE'
      `, [`%${cand}%`]);
      if (r.ok && r.rows.length) {
        rec[`chequeSearch_${cand}`] = r.rows.map(x => `${x.table_schema}.${x.table_name}`);
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
