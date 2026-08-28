// 2. dalga: düzeltilmiş ve daha derin analiz
import pg from 'pg';

const HOST = '72.60.182.107';
const TARGETS = ['ozbek', 'pdks_demo', 'retailex_demo', 'sitigroup', 'testere', 'zetem'];

async function q(c, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    return r.rows;
  } catch (e) {
    return { __err: e.message };
  }
}

const out = [];
for (const db of TARGETS) {
  const c = new pg.Client({
    host: HOST, port: 5432, user: 'postgres', password: 'Yq7xwQpt6c',
    database: db, connectionTimeoutMillis: 8000,
  });

  const rec = { db, ok: false };
  try {
    await c.connect();
    rec.ok = true;

    const tbls = await q(c, `
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
        AND table_type='BASE TABLE'
    `);
    rec.allTables = tbls;

    // === GERÇEK sales tablosu bul ===
    // Öncelik: public.rex_*_sales (firmalı, hareket)
    const realSales = tbls.find(t =>
      t.table_schema === 'public' &&
      /^rex_\d+_\d+_sales$/i.test(t.table_name) // rex_001_01_sales
    ) || tbls.find(t =>
      t.table_schema === 'public' &&
      /^sales$/i.test(t.table_name)
    ) || tbls.find(t =>
      t.table_schema === 'public' &&
      /^rex_\d+_sales$/i.test(t.table_name)
    );

    rec.realSalesTable = realSales ? `${realSales.table_schema}.${realSales.table_name}` : null;
    rec.realSalesColumns = [];
    rec.realSalesRowCount = 0;

    if (realSales) {
      const sc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [realSales.table_schema, realSales.table_name]);
      rec.realSalesColumns = sc.map(r => r.column_name);

      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${realSales.table_schema}"."${realSales.table_name}"`);
      rec.realSalesRowCount = cnt[0]?.n || 0;

      if (rec.realSalesRowCount > 0) {
        const amountCol = rec.realSalesColumns.find(x => /^net_amount$|^grand_total$|^total$/i.test(x));
        const typeCol = rec.realSalesColumns.find(x => /^is_return$|^fiche_type$|^invoice_type$/i.test(x));
        const cancelCol = rec.realSalesColumns.find(x => /^is_cancelled$|^cancelled$|^cancel_status$/i.test(x));
        const curCol = rec.realSalesColumns.find(x => /^currency$/i.test(x));
        const dateCol = rec.realSalesColumns.find(x => /^(date|created_at|transaction_date|sale_date|invoice_date|document_date)$/i.test(x));
        const periodCol = rec.realSalesColumns.find(x => /^period_nr$/i.test(x));
        const firmCol = rec.realSalesColumns.find(x => /^firm_nr$/i.test(x));

        if (amountCol && typeCol) {
          const isReturnBool = typeCol === 'is_return';
          const whereR = isReturnBool ? `"${typeCol}"=true` : `"${typeCol}"::text ILIKE ANY (ARRAY['%return%','%iade%','%credit%','%refund%'])`;
          const sql = `
            SELECT
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE "${amountCol}"<0)::int AS neg,
              COUNT(*) FILTER (WHERE "${amountCol}"=0)::int AS zero,
              COUNT(*) FILTER (WHERE ${whereR})::int AS ret_flag,
              COUNT(*) FILTER (WHERE "${amountCol}"<0 AND NOT (${whereR}))::int AS neg_no_ret,
              COUNT(*) FILTER (WHERE "${amountCol}">=0 AND ${whereR})::int AS ret_pos
            FROM "${realSales.table_schema}"."${realSales.table_name}"
          `;
          const r = await q(c, sql);
          rec.realSalesAnalysis = r[0];
        }

        if (cancelCol && typeCol) {
          const isReturnBool = typeCol === 'is_return';
          const whereR = isReturnBool ? `"${typeCol}"=true` : `"${typeCol}"::text ILIKE ANY (ARRAY['%return%','%iade%','%credit%','%refund%'])`;
          const sql = `
            SELECT COUNT(*)::int AS n
            FROM "${realSales.table_schema}"."${realSales.table_name}"
            WHERE "${cancelCol}"::text ILIKE ANY (ARRAY['true','t','1','yes','evet'])
              AND ${whereR}
          `;
          const r = await q(c, sql);
          rec.cancelledReturns = r[0]?.n;
        }

        if (curCol) {
          const cur = await q(c, `SELECT COALESCE("${curCol}"::text,'(NULL)') AS cur, COUNT(*)::int AS n FROM "${realSales.table_schema}"."${realSales.table_name}" GROUP BY "${curCol}" ORDER BY n DESC LIMIT 10`);
          rec.salesCurrency = cur;
        }

        if (dateCol) {
          const dt = await q(c, `SELECT MIN("${dateCol}"::date) AS dmin, MAX("${dateCol}"::date) AS dmax FROM "${realSales.table_schema}"."${realSales.table_name}" WHERE "${dateCol}" IS NOT NULL`);
          rec.salesDateRange = dt[0];
        }

        if (firmCol) {
          const firm = await q(c, `SELECT "${firmCol}"::int AS f, COUNT(*)::int AS n FROM "${realSales.table_schema}"."${realSales.table_name}" GROUP BY "${firmCol}" ORDER BY f`);
          rec.salesByFirm = firm;
        }

        if (periodCol) {
          const byP = await q(c, `SELECT "${periodCol}"::int AS p, COUNT(*)::int AS n FROM "${realSales.table_schema}"."${realSales.table_name}" GROUP BY "${periodCol}" ORDER BY p`);
          rec.salesByPeriod = byP;
        }
      }
    }

    // === GERÇEK items tablosu ===
    const realItems = tbls.find(t =>
      t.table_schema === 'public' &&
      /^rex_\d+_\d+_sale_items$/i.test(t.table_name)
    ) || tbls.find(t =>
      t.table_schema === 'public' &&
      /^sale_items$|^sales_invoice_items$/i.test(t.table_name)
    );
    rec.realItemsTable = realItems ? `${realItems.table_schema}.${realItems.table_name}` : null;

    if (realItems && realSales) {
      const ic = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [realItems.table_schema, realItems.table_name]);
      rec.realItemsColumns = ic.map(r => r.column_name);
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${realItems.table_schema}"."${realItems.table_name}"`);
      rec.realItemsRowCount = cnt[0]?.n || 0;

      if (rec.realItemsColumns.includes('sale_id')) {
        const o = await q(c, `
          SELECT COUNT(*)::int AS n FROM "${realItems.table_schema}"."${realItems.table_name}" i
          LEFT JOIN "${realSales.table_schema}"."${realSales.table_name}" s ON s.id = i.sale_id
          WHERE s.id IS NULL AND i.sale_id IS NOT NULL
        `);
        rec.itemsOrphans = o[0]?.n;
      }

      // Toplam tutar: items.toplami vs sales.net_amount
      const itemAmount = rec.realItemsColumns.find(x => /^(amount|total|line_total|net_amount)$/i.test(x));
      const salesAmount = rec.realSalesColumns.find(x => /^(net_amount|grand_total|total)$/i.test(x));
      if (itemAmount && salesAmount) {
        const cmp = await q(c, `
          SELECT
            (SELECT SUM("${salesAmount}")::float FROM "${realSales.table_schema}"."${realSales.table_name}") AS sales_total,
            (SELECT SUM("${itemAmount}")::float FROM "${realItems.table_schema}"."${realItems.table_name}") AS items_total,
            (SELECT COUNT(*)::int FROM "${realSales.table_schema}"."${realSales.table_name}") AS sales_n,
            (SELECT COUNT(*)::int FROM "${realItems.table_schema}"."${realItems.table_name}") AS items_n
        `);
        rec.dualWriteCompare = cmp[0];
      }
    }

    // === Period dağılımı (düzeltilmiş) ===
    const pt = tbls.find(t => /^(period|periods|erm_periods|accounting_periods)$/i.test(t.table_name));
    if (pt) {
      const pc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [pt.table_schema, pt.table_name]);
      const cols = pc.map(r => r.column_name);
      rec.periodCols = cols;
      const closedCol = cols.find(x => /^(is_closed|closed|status|kilitli)$/i.test(x));
      const nrCol = cols.find(x => /^nr$|^period_nr$|^period_id$|^number$/i.test(x));
      rec.periodClosedCol = closedCol;
      rec.periodNrCol = nrCol;
      rec.periodClosedExists = !!closedCol;
      if (closedCol) {
        const dist = await q(c, `SELECT "${closedCol}"::text AS v, COUNT(*)::int AS n FROM "${pt.table_schema}"."${pt.table_name}" GROUP BY "${closedCol}" ORDER BY n DESC LIMIT 10`);
        rec.periodDistribution = dist;
      }
      if (nrCol && closedCol) {
        const all = await q(c, `SELECT "${nrCol}"::text AS nr, "${closedCol}"::text AS cs FROM "${pt.table_schema}"."${pt.table_name}" ORDER BY "${nrCol}"`);
        rec.periodList = all;
      }
    }

    // Kapalı dönemde yazma kontrolü
    if (realSales && pt && rec.periodClosedCol && rec.realSalesColumns.includes('period_nr')) {
      const closed = (rec.periodList || []).filter(p => /true|t|1|kilitli|evet|closed/i.test(String(p.cs))).map(p => p.nr);
      rec.closedPeriodNumbers = closed;
      if (closed.length) {
        const ph = closed.map(() => '?').join(',');
        const w = await q(c, `
          SELECT COUNT(*)::int AS n FROM "${realSales.table_schema}"."${realSales.table_name}"
          WHERE period_nr::text IN (${ph})
        `, closed);
        rec.salesInClosedPeriod = w[0]?.n;
      }
    }

    // === Customer detay ===
    const cust = tbls.find(t => /^customers$|^customer$/i.test(t.table_name) && t.table_schema === 'public');
    rec.realCustomerTable = cust ? `${cust.table_schema}.${cust.table_name}` : null;
    if (cust) {
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [cust.table_schema, cust.table_name]);
      rec.customerCols = cc.map(r => r.column_name);
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${cust.table_schema}"."${cust.table_name}"`);
      rec.customerCount = cnt[0]?.n;
    }

    // === Beauty cancelled ama used_sessions ===
    // Beauty schema'da package+sessions var
    const beautyPackageSaleTbl = tbls.find(t => t.table_schema === 'beauty' && /beauty_package_sales$|_package_sales$/i.test(t.table_name));
    const beautySessionTbl = tbls.find(t => t.table_schema === 'beauty' && /beauty_sessions$|_sessions$/i.test(t.table_name));
    rec.beautyPkgSales = beautyPackageSaleTbl ? `${beautyPackageSaleTbl.table_schema}.${beautyPackageSaleTbl.table_name}` : null;
    rec.beautySessions = beautySessionTbl ? `${beautySessionTbl.schema}.${beautySessionTbl.table_name}` : null;
    rec.beautySessions = beautySessionTbl ? `${beautySessionTbl.table_schema}.${beautySessionTbl.table_name}` : null;

    if (beautyPackageSaleTbl) {
      const pc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [beautyPackageSaleTbl.table_schema, beautyPackageSaleTbl.table_name]);
      rec.beautyPkgSalesCols = pc.map(r => r.column_name);
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${beautyPackageSaleTbl.table_schema}"."${beautyPackageSaleTbl.table_name}"`);
      rec.beautyPkgSalesRowCount = cnt[0]?.n;
    }

    if (beautySessionTbl) {
      const sc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [beautySessionTbl.table_schema, beautySessionTbl.table_name]);
      rec.beautySessionCols = sc.map(r => r.column_name);
    }

    // İptal edilmiş ama used_sessions > 0 olan paketler
    if (beautyPackageSaleTbl) {
      const usedCol = rec.beautyPkgSalesCols.find(x => /used_sessions|consumed/i.test(x));
      const cancelCol = rec.beautyPkgSalesCols.find(x => /cancel|cancelled|is_cancel/i.test(x));
      const statusCol = rec.beautyPkgSalesCols.find(x => /^status$/i.test(x));
      if (usedCol && (cancelCol || statusCol)) {
        const where = cancelCol
          ? `"${cancelCol}"::text ILIKE ANY (ARRAY['true','t','1','yes'])` 
          : `"${statusCol}"::text ILIKE ANY (ARRAY['%cancel%','%iptal%','%void%']) AND "${usedCol}">0`;
        const r = await q(c, `
          SELECT COUNT(*)::int AS n, SUM("${usedCol}")::int AS total_used
          FROM "${beautyPackageSaleTbl.table_schema}"."${beautyPackageSaleTbl.table_name}"
          WHERE ${where}
        `);
        rec.beautyCancelledWithUsed = r[0];
      }
    }

    // === Çek/Senet yeni migration ===
    rec.checksTables = tbls.filter(t => /cheque|check_|cek|senet/i.test(t.table_name)).map(t => `${t.table_schema}.${t.table_name}`);

    // === schema_migrations ===
    const sm = await q(c, `SELECT to_regclass('public.schema_migrations') AS t`);
    if (sm[0]?.t) {
      const m = await q(c, `SELECT filename FROM public.schema_migrations ORDER BY id`);
      rec.appliedMigrations = m.map(r => r.filename);
      rec.checksMig128 = rec.appliedMigrations.some(f => /128_cheques/i.test(f));
      rec.lastMigration = rec.appliedMigrations[rec.appliedMigrations.length - 1];
    } else {
      rec.appliedMigrations = [];
      rec.checksMig128 = false;
    }

    // === Çoklu firma sayısı (firm_nr distinct) ===
    // Çekilen verili tablolar içinden firm_nr distinct
    const firmNrTables = tbls.filter(t => /^rex_\d+_/.test(t.table_name) && t.table_schema === 'public').slice(0, 10);
    const firmDistinct = {};
    for (const t of firmNrTables) {
      const tc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [t.table_schema, t.table_name]);
      const tcCols = tc.map(r => r.column_name);
      if (tcCols.includes('firm_nr')) {
        const r = await q(c, `SELECT DISTINCT firm_nr::text AS f FROM "${t.table_schema}"."${t.table_name}" WHERE firm_nr IS NOT NULL ORDER BY f LIMIT 20`);
        firmDistinct[`${t.table_schema}.${t.table_name}`] = r.map(x => x.f);
      }
    }
    rec.distinctFirmsInTables = firmDistinct;

    // === period dağılımı sales'de ===
    // zaten yukarıda var

    // === firm_nr ile başlayan tablolarda düşük sayıda firm olması ===
    const allFirmsDistinct = new Set();
    for (const vals of Object.values(firmDistinct)) {
      vals.forEach(v => allFirmsDistinct.add(v));
    }
    rec.totalDistinctFirms = [...allFirmsDistinct];

  } catch (e) {
    rec.err = e.message;
  } finally {
    await c.end().catch(() => {});
  }
  out.push(rec);
}

// Çıktı
console.log(JSON.stringify(out, null, 2));
