// Son kontroller: cash_lines orphan + OZBEK net_amount=0 analizi
import pg from 'pg';
const HOST = '72.60.182.107';

async function q(c, sql, params = []) {
  try { const r = await c.query(sql, params); return { ok: true, rows: r.rows }; }
  catch (e) { return { ok: false, err: e.message }; }
}

async function checkCashOrphan(db) {
  const c = new pg.Client({ host: HOST, port: 5432, user: 'postgres', password: 'Yq7xwQpt6c', database: db, connectionTimeoutMillis: 8000 });
  await c.connect();
  const out = { db };
  // cash_lines kolonlarını bul
  const tbls = await q(c, `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ~ '^rex_[0-9]+_[0-9]+_cash_lines$'`);
  out.cashTables = [];
  for (const t of (tbls.ok ? tbls.rows : [])) {
    const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${t.table_schema}"."${t.table_name}"`);
    const n = cnt.ok ? cnt.rows[0].n : 0;
    const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [t.table_schema, t.table_name]);
    const cols = cc.ok ? cc.rows.map(r => r.column_name) : [];
    if (n === 0) continue;
    // sale_id veya invoice_id hangisi?
    const linkCol = cols.includes('invoice_id') ? 'invoice_id' : cols.includes('sale_id') ? 'sale_id' : null;
    if (!linkCol) continue;
    const firmMatch = t.table_name.match(/^rex_(\d+)_(\d+)_cash_lines$/);
    const firm = firmMatch[1];
    const period = firmMatch[2];
    const saleTbl = await q(c, `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name ~ $1
    `, [`^rex_${firm}_${period}_sales$`]);
    if (!saleTbl.ok || !saleTbl.rows[0]) continue;
    const st = saleTbl.rows[0].table_name;
    const o = await q(c, `
      SELECT COUNT(*)::int AS n FROM "${t.table_schema}"."${t.table_name}" c
      LEFT JOIN "${t.table_schema}"."${st}" s ON s.id = c.${linkCol}
      WHERE s.id IS NULL AND c.${linkCol} IS NOT NULL
    `);
    out.cashTables.push({ table: t.table_name, count: n, cols: cols, link_col: linkCol, sale_table: st, orphan: o.ok ? o.rows[0].n : null });
  }
  await c.end();
  return out;
}

async function checkOzbekNetZero(db) {
  const c = new pg.Client({ host: HOST, port: 5432, user: 'postgres', password: 'Yq7xwQpt6c', database: db, connectionTimeoutMillis: 8000 });
  await c.connect();
  const out = { db };
  const st = `public.rex_001_01_sales`;
  // net_amount=0 ama fiche_type='S' olanlar
  const r = await q(c, `
    SELECT id, fiche_no, fiche_type::text, net_amount::float, currency::text, date::date, customer_id, status::text, payment_method::text, notes
    FROM ${st}
    WHERE net_amount = 0 AND fiche_type::text = 'S'
    ORDER BY date DESC
  `);
  out.ozbekZeroSales = r.ok ? r.rows : null;
  // bu sales'in item'larındaki tutarların toplamı
  if (r.ok && r.rows.length) {
    const ids = r.rows.map(x => x.id);
    const ph = ids.map(() => '?').join(',');
    const items = await q(c, `
      SELECT invoice_id::text, SUM(net_amount)::float AS amt, COUNT(*)::int AS n
      FROM public.rex_001_01_sale_items
      WHERE invoice_id::text IN (${ph})
      GROUP BY invoice_id
    `, ids);
    out.ozbekZeroSalesItems = items.ok ? items.rows : null;
  }
  // sales.net_amount > 0 ama items=0 olanların sayısı
  const x = await q(c, `
    SELECT COUNT(*)::int AS n FROM ${st} s
    WHERE s.net_amount > 0
      AND NOT EXISTS (SELECT 1 FROM public.rex_001_01_sale_items i WHERE i.invoice_id = s.id)
  `);
  out.ozbekSalesNoItems = x.ok ? x.rows[0].n : null;

  await c.end();
  return out;
}

const cashResults = [];
for (const db of ['ozbek', 'pdks_demo', 'retailex_demo', 'testere', 'zetem']) {
  cashResults.push(await checkCashOrphan(db));
}

const ozbekResult = await checkOzbekNetZero('ozbek');

console.log(JSON.stringify({ cashResults, ozbekResult }, null, 2));
