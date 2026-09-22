#!/usr/bin/env node
/**
 * Orphan / hayalet stok onarımı
 *
 * Sorun: Fatura soft-delete (is_cancelled) sonrası ürün kartı stoğu geri alınmamış
 * faturalar (header_fields.stock_reverted yok). Kör reverse kısmi düzeltmede negatif
 * stok üretebilir — bu yüzden varsayılan strateji:
 *   1) Aktif (iptal edilmemiş) fatura + ambar hareketlerinden net miktarı hesapla
 *   2) products.stock = net (açılış/devreden hareket yoksa 0)
 *   3) İptal/silinmiş faturalara stock_reverted=true yaz (ileride çift reverse olmasın)
 *
 * Kullanım:
 *   npm run db:repair:orphan-stocks -- --dry-run
 *   npm run db:repair:orphan-stocks -- --apply
 *   npm run db:repair:orphan-stocks -- --db=guzel --apply
 *   TENANT_DBS=guzel,aqua_beauty npm run db:repair:orphan-stocks -- --apply
 *
 * Ortam: PGHOST, PGPORT, PGUSER, PGPASSWORD (yoksa config/remote-pg.defaults.json)
 * Şifre loglanmaz.
 */

import pg from 'pg';
import { loadRemotePgDefaults } from '../../database/scripts/pg-endpoint-parse.mjs';
import {
  filterRetailExDatabases,
  isNonRetailExDatabase,
} from '../../database/scripts/non-retailex-databases.mjs';

const defaults = loadRemotePgDefaults();
const host = process.env.PGHOST || defaults.host;
const port = Number(process.env.PGPORT || defaults.port);
const user = process.env.PGUSER || defaults.user;
const password = process.env.PGPASSWORD || defaults.password;
const maintenanceDb = process.env.PG_MAINTENANCE_DATABASE || 'postgres';

const PURCHASE_TRCODES = [1, 4, 5, 13, 26, 41, 42];
const SALES_TRCODES = [7, 8, 9, 14, 29, 30, 31, 32];
const RETURN_TRCODES = [2, 3, 6];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = !apply || args.includes('--dry-run');
const onlyDb =
  (args.find((a) => a.startsWith('--db=')) || '').slice(5) ||
  (() => {
    const i = args.indexOf('--database');
    return i >= 0 ? args[i + 1] : null;
  })() ||
  null;
const firmFilter =
  (args.find((a) => a.startsWith('--firm=')) || '').slice(7) ||
  process.env.FIRM_NR ||
  null;
const periodFilter =
  (args.find((a) => a.startsWith('--period=')) || '').slice(9) ||
  process.env.PERIOD_NR ||
  null;
const verbose = args.includes('--verbose');
/** true: tüm drift ürünleri; false (varsayılan): yalnızca yetim iptal faturası satırındaki ürünler */
const allDrift = args.includes('--all-drift');

function client(database) {
  return new pg.Client({
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis: 20000,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
}

async function listDatabases() {
  const envList = (process.env.TENANT_DBS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (onlyDb) {
    if (isNonRetailExDatabase(onlyDb)) {
      console.error(`[skip] ${onlyDb}: RetailEX kiracı veritabanı değil`);
      return [];
    }
    return [onlyDb];
  }
  if (envList.length) return filterRetailExDatabases(envList);

  const c = client(maintenanceDb);
  await c.connect();
  try {
    const { rows } = await c.query(`
      SELECT datname
      FROM pg_database
      WHERE datistemplate = false
        AND datallowconn
      ORDER BY datname
    `);
    return filterRetailExDatabases(
      rows.map((r) => r.datname).filter((n) => n !== 'postgres' && n !== 'merkez_db' && n !== 'template0' && n !== 'template1'),
    );
  } finally {
    await c.end().catch(() => {});
  }
}

/** rex_{firm}_{period}_sales → { firm, period } */
async function listSalesScopes(c) {
  const { rows } = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ~ '^rex_[0-9]+_[0-9]+_sales$'
    ORDER BY table_name
  `);
  const out = [];
  for (const r of rows) {
    const m = String(r.table_name).match(/^rex_(\d+)_(\d+)_sales$/);
    if (!m) continue;
    const firm = m[1];
    const period = m[2];
    if (firmFilter && String(firmFilter).padStart(3, '0') !== firm.padStart(3, '0')) continue;
    if (periodFilter && String(periodFilter).padStart(2, '0') !== period.padStart(2, '0')) continue;
    out.push({ firm, period, sales: r.table_name, products: `rex_${firm}_products` });
  }
  return out;
}

async function saleItemsHasColumn(c, saleItemsTable, column) {
  const { rows } = await c.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     LIMIT 1`,
    [saleItemsTable, column],
  );
  return rows.length > 0;
}

function buildRecomputeSql(
  productsTable,
  salesTable,
  saleItemsTable,
  movementsTable,
  movementItemsTable,
  qtyExpr,
) {
  const purchaseIn = PURCHASE_TRCODES.join(',');
  const salesIn = SALES_TRCODES.join(',');
  const returnIn = RETURN_TRCODES.join(',');
  const slipCte = movementsTable && movementItemsTable
    ? `,
slip_delta AS (
  SELECT p.id AS product_id,
    SUM(
      CASE
        WHEN sm.movement_type = 'in' THEN smi.quantity
        WHEN sm.movement_type IN ('out', 'adjustment') THEN -smi.quantity
        ELSE 0
      END
    ) AS delta
  FROM ${movementItemsTable} smi
  JOIN ${movementsTable} sm ON sm.id = smi.movement_id
  JOIN ${productsTable} p ON p.id = smi.product_id
  WHERE COALESCE(sm.status, 'completed') NOT IN ('cancelled', 'iptal')
    AND sm.movement_type NOT IN ('transfer', 'price_change')
  GROUP BY p.id
)`
    : `,
slip_delta AS (
  SELECT NULL::uuid AS product_id, 0::numeric AS delta WHERE false
)`;

  return `
WITH line_qty AS (
  SELECT
    si.product_id,
    si.item_code,
    s.trcode,
    s.fiche_type,
    (${qtyExpr}) AS base_qty,
    LOWER(TRIM(COALESCE(si.item_type, 'Malzeme'))) AS item_type
  FROM ${saleItemsTable} si
  JOIN ${salesTable} s ON s.id = si.invoice_id
  WHERE COALESCE(s.is_cancelled, false) = false
    AND LOWER(COALESCE(s.status, '')) NOT IN ('iptal', 'cancelled', 'canceled', 'deleted', 'silindi')
),
stock_lines AS (
  SELECT * FROM line_qty
  WHERE item_type NOT IN ('hizmet', 'service', 'indirim', 'discount')
),
invoice_delta AS (
  SELECT p.id AS product_id,
    SUM(
      CASE
        WHEN l.trcode IN (${returnIn}) OR l.fiche_type = 'return_invoice' THEN
          CASE WHEN l.trcode IN (2, 6) THEN -l.base_qty ELSE l.base_qty END
        WHEN l.trcode IN (${purchaseIn}) OR (l.fiche_type = 'purchase_invoice' AND COALESCE(l.trcode, 0) NOT IN (${returnIn})) THEN
          l.base_qty
        WHEN l.trcode IN (${salesIn}) OR l.fiche_type = 'sales_invoice' THEN
          -l.base_qty
        ELSE 0
      END
    ) AS delta
  FROM stock_lines l
  JOIN ${productsTable} p ON (
    p.id = l.product_id OR p.code = l.item_code OR p.id::text = l.item_code
  )
  GROUP BY p.id
)${slipCte},
combined AS (
  SELECT product_id, SUM(delta) AS delta
  FROM (
    SELECT product_id, delta FROM invoice_delta
    UNION ALL
    SELECT product_id, delta FROM slip_delta
  ) u
  GROUP BY product_id
)
SELECT p.id, p.code, p.name,
  ROUND(COALESCE(p.stock, 0)::numeric, 6) AS card_stock,
  ROUND(COALESCE(c.delta, 0)::numeric, 6) AS expected_stock,
  ROUND((COALESCE(p.stock, 0) - COALESCE(c.delta, 0))::numeric, 6) AS drift
FROM ${productsTable} p
LEFT JOIN combined c ON c.product_id = p.id
WHERE p.is_active IS DISTINCT FROM false
  AND ABS(COALESCE(p.stock, 0) - COALESCE(c.delta, 0)) >= 0.0001
  AND (
    $ORPHAN_FILTER$
  )
ORDER BY ABS(COALESCE(p.stock, 0) - COALESCE(c.delta, 0)) DESC
`;
}

async function tableExists(c, name) {
  const { rows } = await c.query(`SELECT to_regclass($1) AS t`, [name]);
  return Boolean(rows[0]?.t);
}

async function repairScope(c, dbName, scope) {
  const productsTable = scope.products;
  const salesTable = `rex_${scope.firm}_${scope.period}_sales`;
  const saleItemsTable = `rex_${scope.firm}_${scope.period}_sale_items`;
  const movementsTable = `rex_${scope.firm}_${scope.period}_stock_movements`;
  const movementItemsTable = `rex_${scope.firm}_${scope.period}_stock_movement_items`;

  if (!(await tableExists(c, productsTable)) || !(await tableExists(c, salesTable))) {
    return { skipped: true, reason: 'tables missing' };
  }
  const hasMovements =
    (await tableExists(c, movementsTable)) && (await tableExists(c, movementItemsTable));

  const hasBaseQty = await saleItemsHasColumn(c, saleItemsTable, 'base_quantity');
  const hasUnitMult = await saleItemsHasColumn(c, saleItemsTable, 'unit_multiplier');
  const hasItemType = await saleItemsHasColumn(c, saleItemsTable, 'item_type');
  let qtyExpr = 'si.quantity';
  if (hasBaseQty && hasUnitMult) {
    qtyExpr = 'COALESCE(NULLIF(si.base_quantity, 0), si.quantity * COALESCE(si.unit_multiplier, 1))';
  } else if (hasUnitMult) {
    qtyExpr = 'si.quantity * COALESCE(si.unit_multiplier, 1)';
  }

  const orphanProductFilter = allDrift
    ? 'TRUE'
    : `EXISTS (
      SELECT 1
      FROM ${saleItemsTable} si
      JOIN ${salesTable} s ON s.id = si.invoice_id
      WHERE (
          COALESCE(s.is_cancelled, false) = true
          OR LOWER(COALESCE(s.status, '')) IN ('iptal', 'silindi', 'cancelled', 'canceled', 'deleted')
        )
        AND COALESCE((s.header_fields->>'stock_reverted')::boolean, false) = false
        AND (
          si.product_id = p.id
          OR p.code = si.item_code
          OR p.id::text = si.item_code
        )
    )`;

  let sql = buildRecomputeSql(
    productsTable,
    salesTable,
    saleItemsTable,
    hasMovements ? movementsTable : null,
    hasMovements ? movementItemsTable : null,
    qtyExpr,
  ).replace('$ORPHAN_FILTER$', orphanProductFilter);

  if (!hasItemType) {
    sql = sql.replace(
      "LOWER(TRIM(COALESCE(si.item_type, 'Malzeme'))) AS item_type",
      "'malzeme'::text AS item_type",
    );
  }

  const { rows: drifts } = await c.query(sql);

  const orphanFlag = await c.query(
    `SELECT COUNT(*)::int AS n
     FROM ${salesTable} s
     WHERE (
         COALESCE(s.is_cancelled, false) = true
         OR LOWER(COALESCE(s.status, '')) IN ('iptal', 'silindi', 'cancelled', 'canceled', 'deleted')
       )
       AND COALESCE((s.header_fields->>'stock_reverted')::boolean, false) = false`,
  );
  const orphanCount = orphanFlag.rows[0]?.n ?? 0;

  if (verbose || drifts.length || orphanCount) {
    console.log(
      `  [${dbName}] firma=${scope.firm} dönem=${scope.period} drift=${drifts.length} orphan_flag=${orphanCount}`,
    );
  }

  const applied = [];
  if (!dryRun && drifts.length) {
    for (const row of drifts) {
      try {
        await c.query(
          `UPDATE ${productsTable}
           SET stock = $1::numeric, updated_at = NOW()
           WHERE id = $2::uuid`,
          [row.expected_stock, row.id],
        );
      } catch {
        await c.query(
          `UPDATE ${productsTable} SET stock = $1::numeric WHERE id = $2::uuid`,
          [row.expected_stock, row.id],
        );
      }
      applied.push({
        code: row.code,
        name: row.name,
        from: Number(row.card_stock),
        to: Number(row.expected_stock),
      });
      if (verbose) {
        console.log(
          `    ${row.code} ${row.name}: ${row.card_stock} → ${row.expected_stock} (drift ${row.drift})`,
        );
      }
    }
  } else if (dryRun && drifts.length) {
    for (const row of drifts.slice(0, 15)) {
      console.log(
        `    [dry] ${row.code} ${row.name}: ${row.card_stock} → ${row.expected_stock}`,
      );
    }
    if (drifts.length > 15) console.log(`    … +${drifts.length - 15} ürün`);
  }

  let flagged = 0;
  if (!dryRun && orphanCount > 0) {
    const r = await c.query(
      `UPDATE ${salesTable} s
       SET header_fields = COALESCE(s.header_fields, '{}'::jsonb) || '{"stock_reverted":true}'::jsonb,
           updated_at = NOW()
       WHERE (
           COALESCE(s.is_cancelled, false) = true
           OR LOWER(COALESCE(s.status, '')) IN ('iptal', 'silindi', 'cancelled', 'canceled', 'deleted')
         )
         AND COALESCE((s.header_fields->>'stock_reverted')::boolean, false) = false`,
    );
    flagged = r.rowCount || 0;
  }

  return {
    skipped: false,
    driftCount: drifts.length,
    orphanCount,
    applied: dryRun ? [] : applied,
    flagged: dryRun ? 0 : flagged,
    dryDrifts: dryRun ? drifts : [],
  };
}

async function main() {
  if (!password) {
    console.error('[repair-orphan-stocks] Eksik: PGPASSWORD (veya remote-pg.defaults.json)');
    process.exit(1);
  }

  const dbs = await listDatabases();
  console.log(
    `[repair-orphan-stocks] host=${host} user=${user} pass=[mask] mode=${dryRun ? 'DRY-RUN' : 'APPLY'} dbs=${dbs.length}`,
  );

  let totalDrift = 0;
  let totalFlagged = 0;
  let totalApplied = 0;
  const guzelSummary = [];

  for (const dbName of dbs) {
    const c = client(dbName);
    try {
      await c.connect();
      const scopes = await listSalesScopes(c);
      if (!scopes.length) {
        if (verbose) console.log(`  [${dbName}] sales scope yok — atlandı`);
        continue;
      }
      for (const scope of scopes) {
        const res = await repairScope(c, dbName, scope);
        if (res.skipped) continue;
        totalDrift += res.driftCount;
        totalFlagged += res.flagged || (dryRun ? res.orphanCount : 0);
        totalApplied += res.applied.length;
        if (dbName === 'guzel') {
          guzelSummary.push({
            firm: scope.firm,
            period: scope.period,
            drifts: res.dryDrifts?.length ? res.dryDrifts : res.applied,
            orphanCount: res.orphanCount,
            flagged: res.flagged,
          });
        }
      }
    } catch (e) {
      console.error(`  [${dbName}] HATA:`, e?.message || e);
    } finally {
      await c.end().catch(() => {});
    }
  }

  console.log('\n=== Özet ===');
  console.log(`Sapma (ürün): ${totalDrift}`);
  console.log(`Uygulanan stok düzeltmesi: ${totalApplied}`);
  console.log(`stock_reverted işaretlenecek/işaretlenen: ${totalFlagged}`);
  if (guzelSummary.length) {
    console.log('\n=== guzel ===');
    for (const g of guzelSummary) {
      console.log(`firma=${g.firm} dönem=${g.period} orphan=${g.orphanCount} flagged=${g.flagged}`);
      for (const d of g.drifts.slice(0, 20)) {
        if (d.from != null) {
          console.log(`  ${d.code} ${d.name}: ${d.from} → ${d.to}`);
        } else {
          console.log(`  ${d.code} ${d.name}: ${d.card_stock} → ${d.expected_stock}`);
        }
      }
    }
  }
  if (dryRun) {
    console.log('\nDry-run tamam. Uygulamak için: npm run db:repair:orphan-stocks -- --apply');
  } else {
    console.log('\nAPPLY tamam.');
  }
}

main().catch((e) => {
  console.error('[repair-orphan-stocks] fatal:', e?.message || e);
  process.exit(1);
});
