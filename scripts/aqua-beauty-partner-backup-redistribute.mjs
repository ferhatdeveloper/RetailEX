#!/usr/bin/env node
/**
 * aqua_beauty — şirket ortağı (parties) yedek + isteğe bağlı dağıtım sıfırdan.
 *
 * Salt okunur yedek (varsayılan):
 *   node scripts/aqua-beauty-partner-backup-redistribute.mjs
 *   node scripts/aqua-beauty-partner-backup-redistribute.mjs --backup-only
 *
 * Yedek al + period_net_share dağıtımlarını silip güncel ciro−gider ile yeniden yaz:
 *   node scripts/aqua-beauty-partner-backup-redistribute.mjs --redistribute
 *
 * Yedeği geri yükle (ortak kart + ledger + dağıtım tabloları + bakiyeler):
 *   node scripts/aqua-beauty-partner-backup-redistribute.mjs --restore=./aqua_beauty_partner_backup_....sql
 *
 * Not:
 *   - SERMAYE / CH_ODEME_PARTNER / kasa satırlarına dokunulmaz.
 *   - Yalnızca source_module = period_net_share satırları silinir/yeniden yazılır.
 *   - Ciro: sales_invoice + eski tip 'S'; alış/açılış hariç. Gider: iptal dışı.
 */

import { Client } from 'pg';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DB = {
  host: process.env.PGHOST || '72.60.182.107',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'Yq7xwQpt6c',
  database: process.env.PGDATABASE || 'aqua_beauty',
};

const FIRM = String(process.env.FIRM_NR || '001').padStart(3, '0');
const PERIOD = String(process.env.PERIOD_NR || '01').padStart(2, '0');
const YEAR = Number(process.env.YEAR || new Date().getFullYear());

const PARTIES = `rex_${FIRM}_parties`;
const LEDGER = `rex_${FIRM}_${PERIOD}_party_ledger_movements`;
const DIST = `rex_${FIRM}_${PERIOD}_partner_distributions`;
const DIST_ITEMS = `rex_${FIRM}_${PERIOD}_partner_distribution_items`;
const SETTINGS = `rex_${FIRM}_partner_settings`;
const SALES = `rex_${FIRM}_${PERIOD}_sales`;
const EXPENSES = `rex_${FIRM}_expenses`;
const CASH = `rex_${FIRM}_${PERIOD}_cash_lines`;

const MONTH_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

const args = process.argv.slice(2);
const doRedistribute = args.includes('--redistribute');
const backupOnly = args.includes('--backup-only') || (!doRedistribute && !args.some((a) => a.startsWith('--restore=')));
const restoreArg = args.find((a) => a.startsWith('--restore='));
const restorePath = restoreArg ? restoreArg.slice('--restore='.length) : null;

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (v instanceof Date) return `'${v.toISOString().replace(/'/g, "''")}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function insertSql(table, rows, columns) {
  if (!rows.length) return `-- ${table}: 0 satır\n`;
  const cols = columns || Object.keys(rows[0]);
  const lines = rows.map((r) => `  (${cols.map((c) => sqlLiteral(r[c])).join(', ')})`);
  return (
    `INSERT INTO ${table} (${cols.join(', ')})\nVALUES\n` +
    lines.join(',\n') +
    ';\n'
  );
}

async function fetchPartners(c) {
  const { rows } = await c.query(
    `SELECT * FROM ${PARTIES} WHERE card_type = 'partner' ORDER BY share_pct DESC NULLS LAST, code`,
  );
  return rows;
}

async function backup(c) {
  const partners = await fetchPartners(c);
  const partnerIds = partners.map((p) => p.id);
  if (!partnerIds.length) throw new Error('Aktif/kayıtlı ortak bulunamadı');

  const ledger = await c.query(
    `SELECT * FROM ${LEDGER} WHERE party_id = ANY($1::uuid[]) ORDER BY date, created_at, id`,
    [partnerIds],
  );
  // Yalnızca ortak sermaye kasa satırları — CH_ODEME (tedarikçi) satırlarına DOKUNMA
  const partnerCashIds = [
    ...new Set(
      ledger.rows
        .filter(
          (r) =>
            r.cash_line_id &&
            (r.source_module === 'partner_cash' ||
              r.source_module === 'cash_delete' ||
              String(r.transaction_type || '').includes('SERMAYE') ||
              String(r.transaction_type || '').includes('ORTAK_PARA')),
        )
        .map((r) => r.cash_line_id),
    ),
  ];
  let cashRows = [];
  if (partnerCashIds.length) {
    const cr = await c.query(
      `SELECT * FROM ${CASH}
       WHERE id = ANY($1::uuid[])
         AND (
           transaction_type ILIKE 'ORTAK_%'
           OR transaction_type ILIKE '%SERMAYE%'
         )
       ORDER BY date, id`,
      [partnerCashIds],
    );
    cashRows = cr.rows;
  }
  const cashIds = cashRows.map((r) => r.id);

  let dist = { rows: [] };
  let distItems = { rows: [] };
  try {
    dist = await c.query(`SELECT * FROM ${DIST} ORDER BY distribution_date, id`);
    distItems = await c.query(`SELECT * FROM ${DIST_ITEMS} ORDER BY created_at, id`);
  } catch {
    /* tablo yoksa geç */
  }

  let settings = { rows: [] };
  try {
    settings = await c.query(`SELECT * FROM ${SETTINGS}`);
  } catch {
    /* yoksa geç */
  }

  const snap = {
    generated_at: new Date().toISOString(),
    db: DB.database,
    firm: FIRM,
    period: PERIOD,
    partners: partners.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      share_pct: p.share_pct,
      balance: p.balance,
      capital_contribution: p.capital_contribution,
    })),
    ledger_by_source: {},
  };

  const bySrc = await c.query(
    `SELECT source_module, transaction_type, COUNT(*)::int AS n, SUM(amount * sign)::float AS net
     FROM ${LEDGER}
     WHERE party_id = ANY($1::uuid[])
     GROUP BY 1, 2 ORDER BY 1, 2`,
    [partnerIds],
  );
  snap.ledger_by_source = bySrc.rows;

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const sqlPath = resolve(process.cwd(), `aqua_beauty_partner_backup_${ts}.sql`);
  const jsonPath = resolve(process.cwd(), `aqua_beauty_partner_backup_${ts}.json`);

  const partyCols = Object.keys(partners[0]);
  const ledgerCols = ledger.rows[0] ? Object.keys(ledger.rows[0]) : [];
  const cashCols = cashRows[0] ? Object.keys(cashRows[0]) : [];

  let sql = '';
  sql += `-- aqua_beauty partner backup ${snap.generated_at}\n`;
  sql += `-- Restore: psql -d aqua_beauty -f ${sqlPath}\n`;
  sql += `-- veya: node scripts/aqua-beauty-partner-backup-redistribute.mjs --restore=${sqlPath}\n`;
  sql += `BEGIN;\n\n`;
  sql += `-- 1) Ortak ledger + bağlı kasa satırlarını temizle (yalnızca yedekteki ortaklar)\n`;
  sql += `DELETE FROM ${LEDGER} WHERE party_id IN (${partnerIds.map(sqlLiteral).join(', ')});\n`;
  if (cashIds.length) {
    sql += `DELETE FROM ${CASH} WHERE id IN (${cashIds.map(sqlLiteral).join(', ')});\n`;
  }
  sql += `DELETE FROM ${DIST_ITEMS};\n`;
  sql += `DELETE FROM ${DIST};\n`;
  sql += `DELETE FROM ${PARTIES} WHERE id IN (${partnerIds.map(sqlLiteral).join(', ')});\n\n`;

  sql += `-- 2) Ortak kartları\n`;
  sql += insertSql(PARTIES, partners, partyCols);

  if (cashRows.length) {
    sql += `\n-- 3) Ortak kasa satırları\n`;
    sql += insertSql(CASH, cashRows, cashCols);
  }

  sql += `\n-- 4) Ortak ledger\n`;
  if (ledger.rows.length) sql += insertSql(LEDGER, ledger.rows, ledgerCols);
  else sql += `-- ledger boş\n`;

  if (dist.rows.length) {
    sql += `\n-- 5) partner_distributions\n`;
    sql += insertSql(DIST, dist.rows, Object.keys(dist.rows[0]));
  }
  if (distItems.rows.length) {
    sql += `\n-- 6) partner_distribution_items\n`;
    sql += insertSql(DIST_ITEMS, distItems.rows, Object.keys(distItems.rows[0]));
  }
  if (settings.rows.length) {
    sql += `\n-- 7) partner_settings (upsert benzeri: önce sil)\n`;
    sql += `DELETE FROM ${SETTINGS};\n`;
    sql += insertSql(SETTINGS, settings.rows, Object.keys(settings.rows[0]));
  }

  sql += `\nCOMMIT;\n`;

  writeFileSync(sqlPath, sql, 'utf8');
  writeFileSync(jsonPath, JSON.stringify(snap, null, 2), 'utf8');

  console.log('✅ Yedek alındı');
  console.log('   SQL :', sqlPath);
  console.log('   JSON:', jsonPath);
  console.log('   Ortak:', partners.length, '| Ledger:', ledger.rows.length, '| Kasa:', cashRows.length);
  console.table(snap.partners);
  console.table(snap.ledger_by_source);

  return { sqlPath, jsonPath, partners, partnerIds, beforeBalances: snap.partners };
}

/**
 * Aylık Gün Özeti ile aynı net:
 * ciro (normalizeSalesHeaderNetAmount) − birleşik masraf (gider + kasa çıkış).
 */
async function monthlyNets(c) {
  const { rows } = await c.query(
    `
    WITH sales AS (
      SELECT to_char((date AT TIME ZONE 'Asia/Baghdad'), 'YYYY-MM') AS ym,
             SUM(
               CASE
                 WHEN fiche_type NOT IN ('sales_invoice', 'S') THEN 0
                 /* invoices.normalizeSalesHeaderNetAmount */
                 WHEN NOT (COALESCE(net_amount, 0) > 0) AND COALESCE(total_gross, 0) > 0
                   THEN total_gross
                 WHEN COALESCE(total_discount, 0) > 0.001
                  AND COALESCE(total_net, 0) > 0
                  AND COALESCE(net_amount, 0) + 0.02 >= COALESCE(total_net, 0)
                  AND (COALESCE(total_net, 0) - COALESCE(total_discount, 0) + COALESCE(total_vat, 0)) + 0.02
                      < COALESCE(net_amount, 0)
                   THEN GREATEST(0, COALESCE(total_net, 0) - COALESCE(total_discount, 0) + COALESCE(total_vat, 0))
                 WHEN fiche_type = 'S' THEN COALESCE(NULLIF(net_amount, 0), total_net, 0)
                 ELSE COALESCE(net_amount, 0)
               END
             )::float AS rev
      FROM ${SALES}
      WHERE date >= $1::date AND date < ($2::text || '-01-01')::date
        AND COALESCE(is_cancelled, false) = false
        AND LOWER(COALESCE(status, '')) NOT IN ('cancelled', 'canceled', 'refunded', 'silindi', 'iptal')
        AND fiche_type IN ('sales_invoice', 'S')
      GROUP BY 1
    ),
    exp_cards AS (
      SELECT to_char(expense_date::date, 'YYYY-MM') AS ym,
             SUM(amount)::float AS e
      FROM ${EXPENSES}
      WHERE expense_date >= $1::date AND expense_date < ($2::text || '-01-01')::date
        AND COALESCE(LOWER(status), '') NOT IN ('cancelled', 'canceled', 'iptal')
      GROUP BY 1
    ),
    cash_out AS (
      SELECT to_char((cl.date AT TIME ZONE 'Asia/Baghdad'), 'YYYY-MM') AS ym,
             SUM(cl.amount)::float AS e
      FROM ${CASH} cl
      WHERE cl.date >= $1::date AND cl.date < ($2::text || '-01-01')::date
        AND cl.sign < 0
        AND UPPER(COALESCE(cl.transaction_type, '')) IN (
          'GIDER_PUSULASI', 'MAAS_ODEME', 'AVANS_ODEME', 'CH_ODEME',
          'KASA_CIKIS', 'ORTAK_DAGITIM_KAR', 'ORTAK_SERMAYE_ODEME'
        )
        AND NOT EXISTS (
          SELECT 1 FROM ${EXPENSES} e
          WHERE e.cash_line_id = cl.id
            AND COALESCE(LOWER(e.status), '') NOT IN ('cancelled', 'canceled', 'iptal')
        )
        AND NOT (
          UPPER(COALESCE(cl.transaction_type, '')) IN ('GIDER_PUSULASI', 'KASA_CIKIS')
          AND EXISTS (
            SELECT 1 FROM ${EXPENSES} e
            WHERE e.expense_date::date = (cl.date AT TIME ZONE 'Asia/Baghdad')::date
              AND lower(trim(COALESCE(e.description, '')))
                  = lower(trim(COALESCE(cl.definition, '')))
              AND COALESCE(LOWER(e.status), '') NOT IN ('cancelled', 'canceled', 'iptal')
          )
        )
      GROUP BY 1
    )
    SELECT COALESCE(s.ym, ec.ym, co.ym) AS ym,
           COALESCE(s.rev, 0)::float AS revenue,
           (COALESCE(ec.e, 0) + COALESCE(co.e, 0))::float AS expenses,
           (COALESCE(s.rev, 0) - COALESCE(ec.e, 0) - COALESCE(co.e, 0))::float AS net
    FROM sales s
    FULL OUTER JOIN exp_cards ec ON ec.ym = s.ym
    FULL OUTER JOIN cash_out co ON co.ym = COALESCE(s.ym, ec.ym)
    ORDER BY 1
    `,
    [`${YEAR}-01-01`, String(YEAR + 1)],
  );
  return rows.filter((r) => r.revenue !== 0 || r.expenses !== 0);
}

function splitShares(amount, partners) {
  const working = partners
    .slice()
    .sort(
      (a, b) =>
        Number(b.share_pct || 0) - Number(a.share_pct || 0) ||
        String(a.name).localeCompare(String(b.name), 'tr'),
    );
  const totalPct = working.reduce((s, p) => s + (Number(p.share_pct) || 0), 0);
  let allocated = 0;
  return working.map((p, i) => {
    let share;
    if (i === working.length - 1) share = amount - allocated;
    else {
      share = Math.round(((amount * (Number(p.share_pct) || 0)) / totalPct) * 100) / 100;
      allocated += share;
    }
    return { ...p, amount: share };
  });
}

function monthLastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 0).getDate();
  return `${ym}-${String(d).padStart(2, '0')}`;
}

async function redistribute(c, partners) {
  const nets = await monthlyNets(c);
  console.log('\n📊 Aylık net (ciro − gider):');
  console.table(nets);

  const del = await c.query(
    `DELETE FROM ${LEDGER}
     WHERE source_module = 'period_net_share'
       AND party_id = ANY($1::uuid[])
     RETURNING id`,
    [partners.map((p) => p.id)],
  );
  console.log(`🗑️  Silinen period_net_share satırı: ${del.rowCount}`);

  let inserted = 0;
  for (const month of nets) {
    const shares = splitShares(month.net, partners);
    const monthIdx = Number(month.ym.slice(5, 7)) - 1;
    const label = `${MONTH_TR[monthIdx] || month.ym} ${YEAR}`;
    const lastDay = monthLastDay(month.ym);
    const dateIso = `${lastDay}T12:00:00+03:00`;

    for (const share of shares) {
      const amt = Math.round((share.amount || 0) * 100) / 100;
      if (!amt) continue;
      const isProfit = amt > 0;
      const abs = Math.abs(amt);
      const txType = isProfit ? 'KAR_DAGITIMI' : 'ZARAR_DAGITIMI';
      const sign = isProfit ? 1 : -1;
      const pct = Number(share.share_pct) || 0;
      const definition = isProfit
        ? `${label} kâr payı (%${pct.toFixed(0)})`
        : `${label} zarar payı (%${pct.toFixed(0)})`;

      await c.query(
        `INSERT INTO ${LEDGER} (
           firm_nr, period_nr, party_id, card_type, trcode, transaction_type,
           date, amount, sign, definition, source_module, source_id, cash_line_id
         ) VALUES (
           $1,$2,$3::uuid,'partner',0,$4,
           $5::timestamptz,$6::numeric,$7,$8,'period_net_share',NULL,NULL
         )`,
        [FIRM, PERIOD, share.id, txType, dateIso, abs, sign, definition],
      );
      inserted += 1;
    }
  }

  const bal = await c.query(
    `SELECT party_id::text AS id, COALESCE(SUM(amount * sign), 0)::numeric AS bal
     FROM ${LEDGER}
     WHERE party_id = ANY($1::uuid[])
     GROUP BY party_id`,
    [partners.map((p) => p.id)],
  );
  const balMap = new Map(bal.rows.map((r) => [r.id, Number(r.bal)]));
  for (const p of partners) {
    const balance = balMap.get(p.id) ?? 0;
    await c.query(
      `UPDATE ${PARTIES} SET balance = $1::numeric, updated_at = NOW() WHERE id = $2::uuid`,
      [balance, p.id],
    );
  }

  console.log(`✅ Yeniden yazılan dağıtım satırı: ${inserted}`);
  const after = await c.query(
    `SELECT code, name, share_pct, balance::float AS balance
     FROM ${PARTIES} WHERE card_type='partner' ORDER BY share_pct DESC`,
  );
  console.log('\n📒 Güncel ortak bakiyeleri:');
  console.table(after.rows);

  const byMonth = await c.query(
    `SELECT to_char((date AT TIME ZONE 'Asia/Baghdad'),'YYYY-MM') AS ym,
            transaction_type,
            SUM(amount * sign)::float AS net
     FROM ${LEDGER}
     WHERE source_module='period_net_share'
     GROUP BY 1,2 ORDER BY 1,2`,
  );
  console.log('\n📌 Yeni period_net_share:');
  console.table(byMonth.rows);

  return after.rows;
}

async function restoreFromSql(c, path) {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) throw new Error(`Yedek bulunamadı: ${full}`);
  const sql = readFileSync(full, 'utf8');
  console.log('♻️  Geri yükleniyor:', full);
  await c.query(sql);
  console.log('✅ Geri yükleme tamam');
  const after = await c.query(
    `SELECT code, name, share_pct, balance::float AS balance
     FROM ${PARTIES} WHERE card_type='partner' ORDER BY share_pct DESC`,
  );
  console.table(after.rows);
}

async function main() {
  const c = new Client({ ...DB, connectionTimeoutMillis: 20000 });
  await c.connect();
  console.log(`🔗 ${DB.database}@${DB.host} firm=${FIRM} period=${PERIOD} year=${YEAR}`);

  try {
    if (restorePath) {
      await restoreFromSql(c, restorePath);
      return;
    }

    const { sqlPath, partners } = await backup(c);

    if (backupOnly && !doRedistribute) {
      console.log('\nℹ️  Yalnızca yedek alındı. Dağıtımı sıfırdan yazmak için:');
      console.log(`   node scripts/aqua-beauty-partner-backup-redistribute.mjs --redistribute`);
      console.log('Geri almak için:');
      console.log(`   node scripts/aqua-beauty-partner-backup-redistribute.mjs --restore=${sqlPath}`);
      return;
    }

    if (doRedistribute) {
      console.log('\n⚠️  period_net_share silinip güncel netten yeniden yazılacak…');
      await c.query('BEGIN');
      try {
        await redistribute(c, partners);
        await c.query('COMMIT');
        console.log('\n✅ Dağıtımlar sıfırdan yazıldı. Geri almak için:');
        console.log(`   node scripts/aqua-beauty-partner-backup-redistribute.mjs --restore=${sqlPath}`);
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
