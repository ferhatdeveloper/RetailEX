// Her DB'nin kritik alanlarını okunabilir tablo formatında yazdır
import pg from 'pg';

const HOST = '72.60.182.107';
const TARGETS = ['ozbek', 'pdks_demo', 'retailex_demo', 'sitigroup', 'testere', 'zetem'];

async function q(c, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    return r.rows;
  } catch (e) {
    return null;
  }
}

const out = [];

for (const db of TARGETS) {
  const c = new pg.Client({
    host: HOST, port: 5432, user: 'postgres', password: 'Yq7xwQpt6c',
    database: db, connectionTimeoutMillis: 8000,
  });

  const rec = { db, ok: false, err: null };
  try {
    await c.connect();
    rec.ok = true;

    // Şema
    const tbls = await q(c, `
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
        AND table_type='BASE TABLE'
    `);
    rec.tables = tbls || [];
    const schemas = {};
    for (const t of rec.tables) schemas[t.table_schema] = (schemas[t.table_schema] || 0) + 1;
    rec.schemas = schemas;
    rec.rexTables = rec.tables.filter(t => /^rex_\d/.test(t.table_name)).map(t => `${t.table_schema}.${t.table_name}`);

    // Firmalar
    const firmT = rec.tables.find(t => /^(erm_master|erm_settings|firm|firms|companies|erp_settings)$/i.test(t.table_name));
    if (firmT) {
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${firmT.table_schema}"."${firmT.table_name}"`);
      rec.firmTable = `${firmT.table_schema}.${firmT.table_name}`;
      rec.firmCount = cnt ? cnt[0].n : null;
    }

    // Dönemler
    const pt = rec.tables.find(t => /^(period|periods|erm_periods|accounting_periods)$/i.test(t.table_name));
    rec.periodTable = pt ? `${pt.table_schema}.${pt.table_name}` : null;
    if (pt) {
      const pcols = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [pt.table_schema, pt.table_name]);
      rec.periodColumns = pcols ? pcols.map(r => r.column_name) : [];
      const closedCol = rec.periodColumns.find(x => /^(closed|is_closed|status)$/i.test(x));
      if (closedCol) {
        const dist = await q(c, `SELECT "${closedCol}"::text AS v, COUNT(*)::int AS n FROM "${pt.table_schema}"."${pt.table_name}" GROUP BY "${closedCol}" ORDER BY n DESC`);
        rec.periodDistribution = dist;
      }
    }

    // Sales tablosu ve iade analizi
    const st = rec.tables.find(t => /^(sales|sales_invoice|faturalar)$/i.test(t.table_name) || /sales$/i.test(t.table_name));
    rec.salesTable = st ? `${st.table_schema}.${st.table_name}` : null;
    if (st) {
      const sc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [st.table_schema, st.table_name]);
      rec.salesColumns = sc ? sc.map(r => r.column_name) : [];

      const amountCol = rec.salesColumns.find(x => /^(net_amount|grand_total|total)$/i.test(x));
      const typeCol = rec.salesColumns.find(x => /^(is_return|fiche_type|invoice_type)$/i.test(x));
      const cancelCol = rec.salesColumns.find(x => /^(is_cancelled|cancelled|cancel_status)$/i.test(x));
      const curCol = rec.salesColumns.find(x => /^currency$/i.test(x));
      const periodCol = rec.salesColumns.find(x => /^period_nr$/i.test(x));
      rec.salesDateCol = rec.salesColumns.find(x => /^(date|created_at|transaction_date|sale_date|invoice_date)$/i.test(x));

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
          FROM "${st.table_schema}"."${st.table_name}"
        `;
        const r = await q(c, sql);
        rec.salesAnalysis = r ? r[0] : null;
      }
      if (cancelCol && typeCol) {
        const isReturnBool = typeCol === 'is_return';
        const whereR = isReturnBool ? `"${typeCol}"=true` : `"${typeCol}"::text ILIKE ANY (ARRAY['%return%','%iade%','%credit%','%refund%'])`;
        const sql = `
          SELECT COUNT(*)::int AS n
          FROM "${st.table_schema}"."${st.table_name}"
          WHERE "${cancelCol}"::text ILIKE ANY (ARRAY['true','t','1','yes','evet'])
            AND ${whereR}
        `;
        const r = await q(c, sql);
        rec.cancelledReturns = r ? r[0].n : null;
      }
      if (curCol) {
        const cur = await q(c, `
          SELECT COALESCE("${curCol}",'(NULL)')::text AS cur, COUNT(*)::int AS n
          FROM "${st.table_schema}"."${st.table_name}" GROUP BY "${curCol}" ORDER BY n DESC LIMIT 10
        `);
        rec.salesCurrency = cur;
      }
      // Sales row count
      const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${st.table_schema}"."${st.table_name}"`);
      rec.salesRowCount = cnt ? cnt[0].n : null;
    }

    // Items orphan
    const it = rec.tables.find(t => /sales_invoice_items$|sale_items$/i.test(t.table_name));
    rec.itemsTable = it ? `${it.table_schema}.${it.table_name}` : null;
    if (it && st) {
      const ic = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [it.table_schema, it.table_name]);
      rec.itemsColumns = ic ? ic.map(r => r.column_name) : [];
      if (rec.itemsColumns.includes('sale_id')) {
        const o = await q(c, `
          SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}" i
          LEFT JOIN "${st.table_schema}"."${st.table_name}" s ON s.id = i.sale_id
          WHERE s.id IS NULL AND i.sale_id IS NOT NULL
        `);
        rec.itemsOrphans = o ? o[0].n : null;
        const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${it.table_schema}"."${it.table_name}"`);
        rec.itemsRowCount = cnt ? cnt[0].n : null;
      }
    }

    // Customers
    const cust = rec.tables.find(t => /^(customers|customer)$/i.test(t.table_name));
    rec.customerTable = cust ? `${cust.table_schema}.${cust.table_name}` : null;
    if (cust) {
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [cust.table_schema, cust.table_name]);
      const cols = cc ? cc.map(r => r.column_name) : [];
      rec.customerColumns = cols;
      const balCol = cols.find(x => /balance/i.test(x));
      const typeCol = cols.find(x => /^(type|category|cari_turu|kind)$/i.test(x));
      if (balCol && typeCol) {
        const tx = await q(c, `
          SELECT "${typeCol}"::text AS t, COUNT(*)::int AS n,
            AVG("${balCol}")::float AS avg_bal,
            SUM(CASE WHEN "${balCol}">0 THEN 1 ELSE 0 END)::int AS pos,
            SUM(CASE WHEN "${balCol}"<0 THEN 1 ELSE 0 END)::int AS neg,
            SUM(CASE WHEN "${balCol}"=0 THEN 1 ELSE 0 END)::int AS zero
          FROM "${cust.table_schema}"."${cust.table_name}" GROUP BY "${typeCol}"
        `);
        rec.customerByType = tx;
      }
      if (cols.includes('currency')) {
        const cur = await q(c, `SELECT COALESCE(currency,'(NULL)')::text AS cur, COUNT(*)::int AS n FROM "${cust.table_schema}"."${cust.table_name}" GROUP BY currency ORDER BY n DESC LIMIT 10`);
        rec.customerCurrency = cur;
      }
    }

    // firm_nr leakage
    const leak = await q(c, `
      SELECT t.table_schema, t.table_name
      FROM information_schema.tables t
      WHERE (t.table_name ~ '^rex_[0-9]+' OR t.table_name ~ '^rex_[0-9]+_[0-9]+')
        AND t.table_schema NOT IN ('pg_catalog','information_schema')
        AND t.table_type='BASE TABLE'
        AND EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema=t.table_schema AND c.table_name=t.table_name
            AND c.column_name IN ('firm_nr','firm_id','company_id','tenant_id')
        )
    `);
    rec.firmNrLeakage = leak || [];
    rec.firmNrLeakageCount = rec.firmNrLeakage.length;

    // schema_migrations
    const sm = await q(c, `SELECT to_regclass('public.schema_migrations') AS t`);
    if (sm && sm[0]?.t) {
      const m = await q(c, `SELECT filename FROM public.schema_migrations ORDER BY id`);
      rec.appliedMigrations = m ? m.map(r => r.filename) : [];
      rec.checksMig128 = rec.appliedMigrations.some(f => /128_cheques/i.test(f));
    } else {
      rec.appliedMigrations = [];
      rec.checksMig128 = false;
    }

    // Beauty: sessions & packages
    const beautys = rec.tables.filter(t => t.table_schema === 'beauty');
    rec.beautyTables = beautys.map(t => `${t.table_schema}.${t.table_name}`);
    const sessTbl = beautys.find(t => /session/i.test(t.table_name));
    if (sessTbl) {
      const sc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [sessTbl.table_schema, sessTbl.table_name]);
      rec.beautySessionColumns = sc ? sc.map(r => r.column_name) : [];
    }

    // WMS stock movements
    const smTbl = rec.tables.find(t => /^stock_movements$/.test(t.table_name));
    rec.stockMovementsTable = smTbl ? `${smTbl.table_schema}.${smTbl.table_name}` : null;
    if (smTbl) {
      const sc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [smTbl.table_schema, smTbl.table_name]);
      const cols = sc ? sc.map(r => r.column_name) : [];
      rec.stockColumns = cols;
      if (cols.includes('movement_type')) {
        const d = await q(c, `
          SELECT COALESCE(movement_type::text,'(NULL)') AS t, COUNT(*)::int AS n,
            SUM(CASE WHEN quantity<0 THEN 1 ELSE 0 END)::int AS neg_qty
          FROM "${smTbl.table_schema}"."${smTbl.table_name}" GROUP BY movement_type ORDER BY n DESC LIMIT 15
        `);
        rec.stockDistribution = d;
        if (cols.includes('quantity')) {
          const n = await q(c, `SELECT COUNT(*)::int AS n FROM "${smTbl.table_schema}"."${smTbl.table_name}" WHERE quantity<0`);
          rec.stockNegativeQty = n ? n[0].n : null;
        }
        if (cols.includes('source_warehouse_id') && cols.includes('target_warehouse_id')) {
          const xfer = await q(c, `
            SELECT COUNT(*)::int AS n,
              SUM(CASE WHEN COALESCE(source_warehouse_id, target_warehouse_id) IS NULL THEN 1 ELSE 0 END)::int AS null_warehouse
            FROM "${smTbl.table_schema}"."${smTbl.table_name}"
            WHERE movement_type::text ILIKE ANY (ARRAY['%transfer%','%xfer%','%sevkiyat%','%giden%'])
          `);
          rec.stockTransfers = xfer ? xfer[0] : null;
        }
      }
    }

    // cash_lines orphan
    const cl = rec.tables.find(t => /^cash_lines$/.test(t.table_name) || /^kasa_lines$/.test(t.table_name));
    rec.cashLinesTable = cl ? `${cl.table_schema}.${cl.table_name}` : null;
    if (cl && st) {
      const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [cl.table_schema, cl.table_name]);
      const cols = cc ? cc.map(r => r.column_name) : [];
      if (cols.includes('sale_id')) {
        const o = await q(c, `
          SELECT COUNT(*)::int AS n FROM "${cl.table_schema}"."${cl.table_name}" c
          LEFT JOIN "${st.table_schema}"."${st.table_name}" s ON s.id = c.sale_id
          WHERE s.id IS NULL AND c.sale_id IS NOT NULL
        `);
        rec.cashLinesOrphans = o ? o[0].n : null;
      }
    }

    // Bakiyesi sıfır olmayan ama hiç işlem görmemiş cariler
    if (cust) {
      const cc = rec.customerColumns || [];
      const balCol = cc.find(x => /balance/i.test(x));
      if (balCol) {
        const unused = await q(c, `
          SELECT COUNT(*)::int AS n FROM "${cust.table_schema}"."${cust.table_name}" c
          WHERE "${balCol}" != 0
            AND NOT EXISTS (
              SELECT 1 FROM "${st?.table_schema || 'public'}"."${st?.table_name || 'sales'}" s
              WHERE s.customer_id = c.id
            )
        `).catch(() => null);
        rec.unusedCustomersWithBalance = unused ? unused[0].n : null;
      }
    }

    // Tarih aralığı (sales tarih kolonu)
    if (st && rec.salesDateCol) {
      const dt = await q(c, `
        SELECT MIN("${rec.salesDateCol}")::date AS dmin, MAX("${rec.salesDateCol}")::date AS dmax, COUNT(*)::int AS n
        FROM "${st.table_schema}"."${st.table_name}"
        WHERE "${rec.salesDateCol}" IS NOT NULL
      `);
      rec.salesDateRange = dt ? dt[0] : null;
    }

    // Dönem dışı kayıt (sales_period_nr !== period.actual_period vs) — dönem tablosu yoksa skip
    if (pt && st && rec.salesColumns?.includes('period_nr')) {
      const cols = rec.periodColumns || [];
      const nrCol = cols.find(x => /^nr$|number|period_nr|period_id/i.test(x));
      if (nrCol) {
        const periods = await q(c, `SELECT "${nrCol}"::int AS p, "${closedCol || 'nr'}"::text AS c FROM "${pt.table_schema}"."${pt.table_name}"`);
        const closed = (periods || []).filter(p => /true|t|kilitli|kapali|closed|1/i.test(String(p.c))).map(p => p.p);
        if (closed.length) {
          const ph = closed.map(() => '?').join(',');
          const w = await q(c, `
            SELECT COUNT(*)::int AS n FROM "${st.table_schema}"."${st.table_name}"
            WHERE period_nr IN (${ph})
          `, closed);
          rec.salesInClosedPeriod = w ? w[0].n : null;
          rec.closedPeriods = closed;
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

// Sonuçları güzelce yazdır
console.log('═'.repeat(80));
for (const r of out) {
  console.log(`\n## ${r.db.toUpperCase()}${r.err ? '  [HATA: '+r.err+']' : ''}`);
  if (!r.ok) continue;
  console.log(`Toplam tablo: ${r.tables.length} | rex_* tablo: ${r.rexTables.length} | Şemalar: ${Object.entries(r.schemas).map(([k,v])=>`${k}=${v}`).join(' ')}`);
  if (r.firmTable) console.log(`Firma tablosu: ${r.firmTable} (firma sayısı: ${r.firmCount})`);
  if (r.periodTable) {
    console.log(`Period tablosu: ${r.periodTable}`);
    if (r.periodDistribution) console.log(`  Period dağılım:`, r.periodDistribution);
  }
  if (r.salesTable) {
    console.log(`Sales tablosu: ${r.salesTable} (satır: ${r.salesRowCount})`);
    console.log(`  Sales kolonlar: ${(r.salesColumns||[]).slice(0,12).join(', ')}${r.salesColumns?.length > 12 ? '...' : ''}`);
    if (r.salesAnalysis) console.log(`  İade analizi:`, r.salesAnalysis);
    if (r.cancelledReturns !== undefined) console.log(`  İptal+iade sayısı: ${r.cancelledReturns}`);
    if (r.salesCurrency) console.log(`  Para birimi dağılımı:`, r.salesCurrency);
    if (r.salesDateRange) console.log(`  Tarih aralığı: ${r.salesDateRange.dmin} → ${r.salesDateRange.dmax}`);
    if (r.salesInClosedPeriod !== undefined) console.log(`  Kapalı dönemdeki sales: ${r.salesInClosedPeriod} (kapalı dönemler: ${(r.closedPeriods||[]).join(',')})`);
  }
  if (r.itemsTable) {
    console.log(`Items tablosu: ${r.itemsTable} (satır: ${r.itemsRowCount}, orphan: ${r.itemsOrphans})`);
  }
  if (r.customerTable) {
    console.log(`Customer tablosu: ${r.customerTable}`);
    if (r.customerByType) console.log(`  Tip başına:`, r.customerByType);
    if (r.customerCurrency) console.log(`  Para birimi:`, r.customerCurrency);
  }
  console.log(`firm_nr sızıntısı: ${r.firmNrLeakageCount} tablo`);
  console.log(`Migration 128 (çek): ${r.checksMig128 ? 'EVET' : 'HAYIR'}`);
  console.log(`Toplam migration: ${r.appliedMigrations.length}`);
  if (r.beautyTables?.length) console.log(`Beauty tabloları: ${r.beautyTables.length}`);
  if (r.stockMovementsTable) {
    console.log(`Stock movements: ${r.stockMovementsTable}`);
    if (r.stockDistribution) console.log(`  Dağılım:`, r.stockDistribution.slice(0,5));
    if (r.stockNegativeQty !== undefined) console.log(`  Negatif quantity: ${r.stockNegativeQty}`);
    if (r.stockTransfers) console.log(`  Transferler:`, r.stockTransfers);
  }
  if (r.cashLinesTable) console.log(`Cash lines: ${r.cashLinesTable} (orphan: ${r.cashLinesOrphans})`);
  if (r.unusedCustomersWithBalance !== undefined) console.log(`Kullanılmayan ama bakiyeli cari: ${r.unusedCustomersWithBalance}`);
}
