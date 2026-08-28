import pg from 'pg';
const HOST = '72.60.182.107';

async function q(c, sql, params = []) {
  try { const r = await c.query(sql, params); return r.rows; }
  catch (e) { return null; }
}

async function chk(db) {
  const c = new pg.Client({ host: HOST, port: 5432, user: 'postgres', password: 'Yq7xwQpt6c', database: db, connectionTimeoutMillis: 8000 });
  await c.connect();
  const tbls = await q(c, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ~ '^rex_[0-9]+_[0-9]+_cash_lines$'`);
  const out = { db, cash_tables: [] };
  for (const t of tbls || []) {
    const cc = await q(c, `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [t.table_name]);
    const cols = (cc || []).map(r => r.column_name);
    const cnt = await q(c, `SELECT COUNT(*)::int AS n FROM "${t.table_name}"`);
    const link = cols.includes('invoice_id') ? 'invoice_id' : cols.includes('sale_id') ? 'sale_id' : null;
    const info = { table: t.table_name, count: cnt ? cnt[0].n : 0, link, cols: cols.filter(c => /sale|invoice|fk|refer/i.test(c)) };
    if (link) {
      const m = t.table_name.match(/^rex_(\d+)_(\d+)_cash_lines$/);
      const firm = m[1], per = m[2];
      const saleTbl = await q(c, `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name ~ $1 LIMIT 1`, [`^rex_${firm}_${per}_sales$`]);
      if (saleTbl && saleTbl[0]) {
        const st = saleTbl[0].table_name;
        const o = await q(c, `SELECT COUNT(*)::int AS n FROM "${t.table_name}" c LEFT JOIN "${st}" s ON s.id=c."${link}" WHERE s.id IS NULL AND c."${link}" IS NOT NULL`);
        info.orphan = o ? o[0].n : null;
      }
    }
    out.cash_tables.push(info);
  }
  await c.end();
  return out;
}

for (const db of ['ozbek','pdks_demo','retailex_demo','testere','zetem']) {
  console.log(JSON.stringify(await chk(db)));
}
