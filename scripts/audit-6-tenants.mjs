// 6 RetailEX tenant DB denetimi — yalnız SELECT
import pg from 'pg';

const TARGETS = ['ozbek', 'pdks_demo', 'retailex_demo', 'sitigroup', 'testere', 'zetem'];
const HOST = '72.60.182.107';

async function q(c, sql, params = []) {
  try {
    const r = await c.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

async function audit(dbName) {
  const client = new pg.Client({
    host: HOST, port: 5432, user: 'postgres', password: 'Yq7xwQpt6c',
    database: dbName, connectionTimeoutMillis: 8000,
  });
  const out = { dbName, errors: [], findings: { red: [], yellow: [], green: [] }, score: 0 };
  try {
    await client.connect();
  } catch (e) {
    out.errors.push(`CONNECT: ${e.message}`);
    return out;
  }

  try {
    // === 1. ŞEMA ENVANTERİ ===
    const tablesRes = await q(client, `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);
    const tables = tablesRes.ok ? tablesRes.rows : [];
    out.totalTables = tables.length;
    out.rexTableCount = tables.filter(t => /^rex_\d/.test(t.table_name) || /^rex_\d+_\d+/.test(t.table_name)).length;
    out.schemas = {};
    for (const t of tables) {
      out.schemas[t.table_schema] = (out.schemas[t.table_schema] || 0) + 1;
    }

    // === 2. Tenant kart tabloları (firmalar — erm_master / erm_settings / firm kart) ===
    const firmQ = await q(client, `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name ILIKE ANY (ARRAY['erm_master','erm_settings','firm','firms','companies','erp_settings'])
        AND table_schema NOT IN ('pg_catalog','information_schema')
    `);
    out.firmTables = firmQ.ok ? firmQ.rows : [];
    let firmCount = 0;
    for (const f of out.firmTables) {
      const c2 = await q(client, `SELECT COUNT(*)::int AS n FROM "${f.table_schema}"."${f.table_name}"`);
      if (c2.ok) f.rowCount = c2.rows[0].n;
      firmCount += (f.rowCount || 0);
    }
    out.firmCount = firmCount;

    // === 3. Dönem (period) tabloları ===
    const periodQ = await q(client, `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name ILIKE ANY (ARRAY['period','periods','erm_periods','accounting_periods','period_control'])
        AND table_schema NOT IN ('pg_catalog','information_schema')
    `);
    out.periodTables = periodQ.ok ? periodQ.rows : [];

    let periodClosedExists = false;
    let periodWriteToClosed = 0;
    for (const pt of out.periodTables) {
      const cnt = await q(client, `SELECT COUNT(*)::int AS n FROM "${pt.table_schema}"."${pt.table_name}"`);
      if (cnt.ok) pt.totalRows = cnt.rows[0].n;
      // kapalı/aktif alanları dene
      const cols = await q(client, `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema=$1 AND table_name=$2
      `, [pt.table_schema, pt.table_name]);
      const colNames = cols.ok ? cols.rows.map(r => r.column_name) : [];
      pt.columns = colNames;
      const hasClosed = colNames.some(c => /closed|is_closed|status|active/i.test(c));
      if (hasClosed) {
        const closedCol = colNames.find(c => /closed|is_closed|status/i.test(c));
        const sample = await q(client, `
          SELECT DISTINCT "${closedCol}" AS v, COUNT(*)::int AS n
          FROM "${pt.table_schema}"."${pt.table_name}"
          GROUP BY "${closedCol}"
          ORDER BY n DESC LIMIT 5
        `);
        if (sample.ok) {
          pt.distinctValues = sample.rows;
          for (const r of sample.rows) {
            if (/closed|kilitli|kilit|kapali|t/.test(String(r.v).toLowerCase()) && /true|kilitli|t/.test(String(r.v).toLowerCase())) {
              periodClosedExists = true;
            }
          }
        }
      }
    }
    out.periodClosedExists = periodClosedExists;

    // === 4. Sales ve iade (net_amount < 0) ===
    const salesExist = tables.some(t => /sales$/.test(t.table_name) && t.table_schema === 'public');
    // Daha geniş bul
    const salesTbl = tables.find(t => /sales_invoice$|^sales$|_sales$/.test(t.table_name) && t.table_schema === 'public')
                    || tables.find(t => /sales$/.test(t.table_name));
    out.salesTable = salesTbl ? `${salesTbl.table_schema}.${salesTbl.table_name}` : null;

    if (salesTbl) {
      const salesCols = await q(client, `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema=$1 AND table_name=$2
      `, [salesTbl.table_schema, salesTbl.table_name]);
      const sCols = salesCols.ok ? salesCols.rows.map(r => r.column_name) : [];
      out.salesColumns = sCols;

      // net_amount / grand_total / total var mı
      const hasNet = sCols.includes('net_amount') || sCols.includes('grand_total') || sCols.includes('total');
      const hasReturn = sCols.includes('is_return') || sCols.includes('fiche_type') || sCols.includes('invoice_type');

      out.returnAnalysis = null;
      if (hasNet && hasReturn) {
        const amountCol = sCols.includes('net_amount') ? 'net_amount'
          : sCols.includes('grand_total') ? 'grand_total' : 'total';
        const typeCol = sCols.includes('is_return') ? 'is_return'
          : sCols.includes('fiche_type') ? 'fiche_type' : 'invoice_type';

        const ret = await q(client, `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "${amountCol}" < 0)::int AS negative_amount,
            COUNT(*) FILTER (WHERE "${amountCol}" > 0)::int AS positive_amount,
            COUNT(*) FILTER (WHERE "${amountCol}" = 0)::int AS zero_amount,
            COUNT(*) FILTER (WHERE "${typeCol}"::text ILIKE ANY (ARRAY['%return%','%iade%','%credit%','%refund%']))::int AS return_flagged,
            COUNT(*) FILTER (WHERE "${amountCol}" < 0 AND "${typeCol}"::text NOT ILIKE ANY (ARRAY['%return%','%iade%','%credit%','%refund%']))::int AS negative_without_return_flag,
            COUNT(*) FILTER (WHERE "${amountCol}" >= 0 AND "${typeCol}"::text ILIKE ANY (ARRAY['%return%','%iade%','%credit%','%refund%']))::int AS return_flagged_positive
          FROM "${salesTbl.table_schema}"."${salesTbl.table_name}"
        `);
        out.returnAnalysis = ret.ok ? ret.rows[0] : { error: ret.err };
      }
    }

    // === 5. sales_invoice_items var mı çift yazım kontrolü ===
    const itemsTbl = tables.find(t => /sales_invoice_items$/.test(t.table_name))
                    || tables.find(t => /sale_items$|_items$/.test(t.table_name) && /sale|invoice|fatura/i.test(t.table_name));
    out.itemsTable = itemsTbl ? `${itemsTbl.table_schema}.${itemsTbl.table_name}` : null;

    if (salesTbl && itemsTbl) {
      // amount kolonu bul
      const ic = await q(client, `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema=$1 AND table_name=$2
      `, [itemsTbl.table_schema, itemsTbl.table_name]);
      const itemCols = ic.ok ? ic.rows.map(r => r.column_name) : [];
      const itemHasAmount = itemCols.some(c => /amount|total|price|net/i.test(c));
      out.itemColumns = itemCols;

      // FK link kontrol
      const salesHasSaleId = (out.salesColumns || []).some(c => /id$/.test(c));
      if (salesHasSaleId && itemCols.includes('sale_id')) {
        const orphan = await q(client, `
          SELECT COUNT(*)::int AS orphans
          FROM "${itemsTbl.table_schema}"."${itemsTbl.table_name}" i
          LEFT JOIN "${salesTbl.table_schema}"."${salesTbl.table_name}" s ON s.id = i.sale_id
          WHERE s.id IS NULL AND i.sale_id IS NOT NULL
        `);
        out.salesItemsOrphans = orphan.ok ? orphan.rows[0].orphans : null;

        // toplam karşılaştırma (her 100 satır için)
        const sum = await q(client, `
          SELECT
            (SELECT COUNT(*)::int FROM "${salesTbl.table_schema}"."${salesTbl.table_name}") AS sales_n,
            (SELECT COUNT(*)::int FROM "${itemsTbl.table_schema}"."${itemsTbl.table_name}") AS items_n
        `);
        if (sum.ok) out.countCompare = sum.rows[0];
      }
    }

    // === 6. Customers (cari) bakiye analizi ===
    const custTbl = tables.find(t => /^customers$/.test(t.table_name) && t.table_schema === 'public')
                  || tables.find(t => /^customer$/.test(t.table_name))
                  || tables.find(t => /customer/.test(t.table_name) && /account|cari/i.test(t.table_name));
    out.customerTable = custTbl ? `${custTbl.table_schema}.${custTbl.table_name}` : null;

    if (custTbl) {
      const cc = await q(client, `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema=$1 AND table_name=$2
      `, [custTbl.table_schema, custTbl.table_name]);
      const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];
      out.customerColumns = cols;
      const hasType = cols.some(c => /type|category|cari_turu|kind/i.test(c));
      const hasBalance = cols.some(c => /balance/i.test(c));

      if (hasType && hasBalance) {
        const balCol = cols.find(c => /balance/i.test(c));
        const typeCol = cols.find(c => /type|category|cari_turu|kind/i.test(c));
        const analysis = await q(client, `
          SELECT
            "${typeCol}"::text AS t,
            COUNT(*)::int AS n,
            AVG("${balCol}")::float AS avg_bal,
            SUM(CASE WHEN "${balCol}" > 0 THEN 1 ELSE 0 END)::int AS pozitif,
            SUM(CASE WHEN "${balCol}" < 0 THEN 1 ELSE 0 END)::int AS negatif,
            SUM(CASE WHEN "${balCol}" = 0 THEN 1 ELSE 0 END)::int AS sifir
          FROM "${custTbl.table_schema}"."${custTbl.table_name}"
          GROUP BY "${typeCol}"
        `);
        out.customerTypeAnalysis = analysis.ok ? analysis.rows : null;
      }

      // Currency dağılımı
      if (cols.includes('currency')) {
        const cur = await q(client, `
          SELECT COALESCE(currency, '(NULL)') AS cur, COUNT(*)::int AS n
          FROM "${custTbl.table_schema}"."${custTbl.table_name}"
          GROUP BY currency
        `);
        out.customerCurrency = cur.ok ? cur.rows : null;
      }
    }

    // === 7. firm_nr sızıntısı kontrolü (rex_* tablolarında) ===
    const firmNrRes = await q(client, `
      SELECT t.table_schema, t.table_name, c.column_name
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
      WHERE (t.table_name ~ '^rex_[0-9]+' OR t.table_name ~ '^rex_[0-9]+_[0-9]+')
        AND c.column_name IN ('firm_nr','firm_id','company_id','tenant_id')
        AND t.table_schema NOT IN ('pg_catalog','information_schema')
    `);
    out.firmNrLeakage = firmNrRes.ok ? firmNrRes.rows : [];
    out.firmNrLeakageCount = out.firmNrLeakage.length;

    // === 8. schema_migrations (hangi migration uygulanmış?) ===
    const sm = await q(client, `
      SELECT column_name FROM information_schema.tables t
      JOIN information_schema.columns c ON c.table_schema=t.table_schema AND c.table_name=t.table_name
      WHERE t.table_name='schema_migrations' AND t.table_schema='public'
    `);
    if (sm.ok && sm.rows.length > 0) {
      const mig = await q(client(`
        SELECT 1
      `) ? null : null); // dummy
    }
    const migQ = await q(client, `
      SELECT to_regclass('public.schema_migrations') AS exists
    `);
    if (migQ.ok && migQ.rows[0].exists) {
      const applied = await q(client, `
        SELECT filename FROM public.schema_migrations ORDER BY id ASC
      `);
      if (applied.ok) {
        out.appliedMigrations = applied.rows.map(r => r.filename);
        out.checksMigration128 = out.appliedMigrations.some(f => /128_cheques/i.test(f));
      }
    } else {
      out.appliedMigrations = [];
      out.checksMigration128 = false;
    }

    // === 9. Beauty: cancelled ama used_sessions artmış paket ===
    const beautyPkgTbl = tables.find(t => /package/.test(t.table_name) && /beauty/i.test(t.table_schema));
    const beautyUsedTbl = tables.find(t => /session/.test(t.table_name) && /beauty/i.test(t.table_schema));
    out.beautyPackageTable = beautyPkgTbl ? `${beautyPkgTbl.table_schema}.${beautyPkgTbl.table_name}` : null;

    // genel arama
    const pkgCand = tables.find(t => /package/.test(t.table_name));
    const sessCand = tables.find(t => /session/.test(t.table_name));
    out.beautyPackageAny = pkgCand ? `${pkgCand.table_schema}.${pkgCand.table_name}` : null;
    out.beautySessionAny = sessCand ? `${sessCand.table_schema}.${sessCand.table_name}` : null;
    if (sessCand) {
      const sc = await q(client, `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema=$1 AND table_name=$2
      `, [sessCand.table_schema, sessCand.table_name]);
      out.beautySessionColumns = sc.ok ? sc.rows.map(r => r.column_name) : [];
    }

    // === 10. Sales currency dağılımı ===
    if (salesTbl && (out.salesColumns || []).includes('currency')) {
      const cur = await q(client, `
        SELECT COALESCE(currency, '(NULL)') AS cur, COUNT(*)::int AS n
        FROM "${salesTbl.table_schema}"."${salesTbl.table_name}"
        GROUP BY currency
      `);
      out.salesCurrency = cur.ok ? cur.rows : null;
    }

    // === 11. WMS / stock_movements ===
    const stockTbl = tables.find(t => /^stock_movements$/.test(t.table_name));
    out.stockMovementsTable = stockTbl ? `${stockTbl.table_schema}.${stockTbl.table_name}` : null;
    if (stockTbl) {
      const sm2 = await q(client, `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema=$1 AND table_name=$2
      `, [stockTbl.table_schema, stockTbl.table_name]);
      const cols = sm2.ok ? sm2.rows.map(r => r.column_name) : [];
      out.stockMovementsColumns = cols;
      if (cols.includes('movement_type')) {
        const dist = await q(client, `
          SELECT COALESCE(movement_type, '(NULL)')::text AS t, COUNT(*)::int AS n,
            SUM(CASE WHEN quantity < 0 THEN 1 ELSE 0 END)::int AS neg_qty
          FROM "${stockTbl.table_schema}"."${stockTbl.table_name}"
          GROUP BY movement_type
          ORDER BY n DESC
        `);
        out.stockMovementsDist = dist.ok ? dist.rows : null;

        // Negatif quantity
        if (cols.includes('quantity')) {
          const neg = await q(client, `
            SELECT COUNT(*)::int AS n FROM "${stockTbl.table_schema}"."${stockTbl.table_name}"
            WHERE quantity < 0
          `);
          out.stockNegativeQty = neg.ok ? neg.rows[0].n : null;
        }
      }
    }

    // === 12. cash_lines orphan ===
    const cashTbl = tables.find(t => /^cash_lines$/.test(t.table_name) || /^kasa_lines$/.test(t.table_name));
    out.cashLinesTable = cashTbl ? `${cashTbl.table_schema}.${cashTbl.table_name}` : null;
    if (cashTbl && salesTbl) {
      const cc = await q(client, `
        SELECT column_name FROM information_schema.columns
        WHERE table_schema=$1 AND table_name=$2
      `, [cashTbl.table_schema, cashTbl.table_name]);
      const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];
      if (cols.includes('sale_id')) {
        const o = await q(client, `
          SELECT COUNT(*)::int AS orphan
          FROM "${cashTbl.table_schema}"."${cashTbl.table_name}" c
          LEFT JOIN "${salesTbl.table_schema}"."${salesTbl.table_name}" s ON s.id = c.sale_id
          WHERE s.id IS NULL AND c.sale_id IS NOT NULL
        `);
        out.cashLinesOrphans = o.ok ? o.rows[0].orphan : null;
      }
    }

    // === 13. Para birimi kodları (genel tarama) ===
    const currenciesRes = await q(client, `
      SELECT DISTINCT t.table_schema, t.table_name, c.column_name
      FROM information_schema.tables t
      JOIN information_schema.columns c ON c.table_schema=t.table_schema AND c.table_name=t.table_name
      WHERE c.column_name IN ('currency','currency_code','para_birimi','doviz_kodu')
        AND t.table_schema NOT IN ('pg_catalog','information_schema')
        AND t.table_type='BASE TABLE'
      ORDER BY t.table_schema, t.table_name
    `);
    out.currencyColumns = currenciesRes.ok ? currenciesRes.rows : [];

    // === 14. iptal edilmiş iade (is_cancelled + return) ===
    if (salesTbl) {
      const cols = out.salesColumns || [];
      const hasCancel = cols.includes('is_cancelled') || cols.includes('cancelled') || cols.includes('cancel_status');
      const hasReturn = cols.includes('is_return') || cols.includes('fiche_type');
      if (hasCancel && hasReturn) {
        const cancelCol = cols.find(c => /cancel/i.test(c));
        const returnCol = cols.find(c => /return|fiche_type|is_return/i.test(c));
        const isReturnBool = returnCol === 'is_return';
        const whereR = isReturnBool
          ? `"${returnCol}" = true`
          : `"${returnCol}"::text ILIKE ANY (ARRAY['%return%','%iade%','%credit%','%refund%'])`;
        const sql = `
          SELECT COUNT(*)::int AS n
          FROM "${salesTbl.table_schema}"."${salesTbl.table_name}"
          WHERE ${cancelCol}::text ILIKE ANY (ARRAY['true','t','1','yes','evet'])
            AND ${whereR}
        `;
        const r2 = await q(client, sql);
        out.cancelledReturns = r2.ok ? r2.rows[0].n : null;
      }
    }

    // === DERLEME / SKORLAMA ===
    const f = out.findings;
    // Skor: 100'den başla, negatif/uyarıları düş
    let score = 100;

    // Kritikler
    if (out.returnAnalysis && out.returnAnalysis.negative_without_return_flag > 0) {
      f.red.push(`[${out.salesTable}] ${out.returnAnalysis.negative_without_return_flag} satırda negatif tutar ama iade bayrağı YOK — iade dışı negatife izin verilmemeli`);
      score -= 15;
    }
    if (out.returnAnalysis && out.returnAnalysis.return_flagged_positive > 0) {
      f.red.push(`[${out.salesTable}] ${out.returnAnalysis.return_flagged_positive} satır iade bayraklı ama tutar POZİTİF — işaret tutarsız`);
      score -= 5;
    }
    if (out.salesItemsOrphans && out.salesItemsOrphans > 0) {
      f.red.push(`[${out.itemsTable}] ${out.salesItemsOrphans} orphan satır (sale_id mevcut değil) — FK ihlali`);
      score -= 10;
    }
    if (out.cashLinesOrphans && out.cashLinesOrphans > 0) {
      f.red.push(`[${out.cashLinesTable}] ${out.cashLinesOrphans} orphan satır (sale_id NULL)`);
      score -= 10;
    }
    if (out.firmNrLeakageCount > 0) {
      f.red.push(`[firm_nr sızıntısı] ${out.firmNrLeakageCount} rex_* tablosunda firm_nr/firm_id kolonu var — multi-tenant riski`);
      score -= 15;
    }
    if (out.cancelledReturns && out.cancelledReturns > 0) {
      f.red.push(`[iptal+iade] ${out.cancelledReturns} kayıt hem iptal hem iade — çift etki riski`);
      score -= 10;
    }

    // Önemliler
    if (out.returnAnalysis && out.returnAnalysis.negative_amount > 0) {
      const ratio = out.returnAnalysis.negative_amount / Math.max(1, out.returnAnalysis.total);
      if (ratio > 0.5) {
        f.yellow.push(`[iade oranı] %${(ratio*100).toFixed(0)} satırda negatif tutar — çok yüksek`);
        score -= 5;
      }
    }
    if (out.stockNegativeQty && out.stockNegativeQty > 0) {
      f.yellow.push(`[stok] ${out.stockNegativeQty} hareket negatif quantity — kontrol gerekli`);
      score -= 5;
    }
    if (out.customerTypeAnalysis) {
      // müşteri tipi analizinde simetri bozuksa
      for (const r of out.customerTypeAnalysis) {
        const tt = String(r.t || '').toLowerCase();
        if (/müşteri|musteri|customer/i.test(tt)) {
          // müşteri genelde negatif borç (bizden alacak) olur; ama IRak için balance işareti farklı olabilir
          // sadece uyarı ver
        }
      }
    }
    if (!out.checksMigration128) {
      f.yellow.push(`[migration 128] Çek/Senet tracking henüz uygulanmamış (128_cheques_tracking.sql)`);
      // Bu kritik değil, çek takibi gerekli değilse
    }
    if (Object.keys(out.schemas).filter(s => /wms|beauty|rest/.test(s)).length > 0) {
      f.green.push(`[şema] Modül şemaları mevcut: ${Object.keys(out.schemas).filter(s => /wms|beauty|rest/.test(s)).join(', ')}`);
    }
    if (out.totalTables > 30) {
      f.green.push(`[şema] Tablo sayısı: ${out.totalTables} (geniş kapsam)`);
    }

    out.score = Math.max(0, score);
  } catch (e) {
    out.errors.push(`FATAL: ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
  return out;
}

const main = async () => {
  const results = [];
  for (const t of TARGETS) {
    const r = await audit(t);
    results.push(r);
  }
  console.log(JSON.stringify(results, null, 2));
};

main().catch(e => { console.error(e); process.exit(1); });
