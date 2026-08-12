#!/usr/bin/env node
/**
 * Stok doğrulama — kart stoku (products.stock) ile fatura + ambar fişi hareketlerini karşılaştırır.
 *
 * Kullanım:
 *   npm run db:validate:stock
 *   PGDATABASE=kasap FIRM_NR=001 PERIOD_NR=01 node scripts/db/validate-stock.mjs
 *   node scripts/db/validate-stock.mjs --database kasap --firm 001 --period 01 --repair-product-id
 */

import { loadRemotePgDefaults } from '../../database/scripts/pg-endpoint-parse.mjs';

const PURCHASE_TRCODES = [1, 4, 5, 13, 26, 41, 42];
const SALES_TRCODES = [7, 8, 9, 14, 29, 30, 31, 32];
const RETURN_TRCODES = [2, 3, 6];

function parseArgs(argv) {
  const out = {
    repairProductId: false,
    json: false,
    limit: 20,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repair-product-id') out.repairProductId = true;
    else if (a === '--json') out.json = true;
    else if (a === '--database') out.database = argv[++i];
    else if (a === '--firm') out.firm = argv[++i];
    else if (a === '--period') out.period = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]) || 20;
  }
  return out;
}

function padFirm(v) {
  return String(v || '001').trim().padStart(3, '0').slice(0, 10);
}

function padPeriod(v) {
  return String(v || '01').trim().padStart(2, '0').slice(0, 10);
}

function buildValidationSql(productsTable, salesTable, saleItemsTable, movementsTable, movementItemsTable) {
  const purchaseIn = PURCHASE_TRCODES.join(',');
  const salesIn = SALES_TRCODES.join(',');
  const returnIn = RETURN_TRCODES.join(',');

  return `
WITH line_qty AS (
  SELECT
    si.product_id,
    si.item_code,
    s.trcode,
    s.fiche_type,
    COALESCE(NULLIF(si.base_quantity, 0), si.quantity * COALESCE(si.unit_multiplier, 1)) AS base_qty
  FROM ${saleItemsTable} si
  JOIN ${salesTable} s ON s.id = si.invoice_id
  WHERE COALESCE(s.is_cancelled, false) = false
    AND LOWER(COALESCE(s.status, '')) NOT IN ('iptal', 'cancelled', 'canceled', 'deleted', 'silindi')
),
invoice_delta AS (
  SELECT p.id AS product_id,
    SUM(
      CASE
        WHEN l.trcode IN (${returnIn}) OR l.fiche_type = 'return_invoice' THEN
          CASE WHEN l.trcode IN (2, 6) THEN -l.base_qty ELSE l.base_qty END
        WHEN l.trcode IN (${purchaseIn}) OR (l.fiche_type = 'purchase_invoice' AND COALESCE(l.trcode, 0) NOT IN (${returnIn})) THEN l.base_qty
        WHEN l.trcode IN (${salesIn}) OR l.fiche_type = 'sales_invoice' THEN -l.base_qty
        ELSE 0
      END
    ) AS delta
  FROM line_qty l
  JOIN ${productsTable} p ON (
    p.id = l.product_id OR p.code = l.item_code OR p.id::text = l.item_code
  )
  GROUP BY p.id
),
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
),
combined AS (
  SELECT product_id, SUM(delta) AS delta
  FROM (
    SELECT product_id, delta FROM invoice_delta
    UNION ALL
    SELECT product_id, delta FROM slip_delta
  ) u
  GROUP BY product_id
),
unmatched AS (
  SELECT COUNT(*)::int AS n
  FROM line_qty l
  WHERE NOT EXISTS (
    SELECT 1 FROM ${productsTable} p
    WHERE p.id = l.product_id OR p.code = l.item_code OR p.id::text = l.item_code
  )
)
SELECT
  (SELECT n FROM unmatched) AS unmatched_lines,
  COUNT(*) FILTER (WHERE p.stock < 0)::int AS negative_stock,
  COUNT(*) FILTER (WHERE ABS(p.stock - COALESCE(c.delta, 0)) < 0.001)::int AS exact_match,
  COUNT(*) FILTER (WHERE ABS(p.stock - COALESCE(c.delta, 0)) >= 0.001)::int AS opening_or_drift,
  COUNT(*) FILTER (WHERE (p.stock - COALESCE(c.delta, 0)) < -0.001)::int AS oversold_vs_movements,
  COUNT(*) FILTER (WHERE COALESCE(p.stock, 0) > 0 AND COALESCE(p.cost, 0) = 0)::int AS zero_cost_with_stock,
  ROUND(COALESCE(SUM(p.stock * p.cost), 0)::numeric, 2) AS total_cost_value,
  ROUND(COALESCE(SUM(p.stock * p.price), 0)::numeric, 2) AS total_retail_value,
  ROUND(COALESCE(SUM(p.stock), 0)::numeric, 3) AS total_qty,
  COUNT(*)::int AS active_products
FROM ${productsTable} p
LEFT JOIN combined c ON c.product_id = p.id
WHERE p.is_active IS DISTINCT FROM false;
`;
}

function buildDriftSql(productsTable, salesTable, saleItemsTable, movementsTable, movementItemsTable, limit) {
  const purchaseIn = PURCHASE_TRCODES.join(',');
  const salesIn = SALES_TRCODES.join(',');
  const returnIn = RETURN_TRCODES.join(',');
  return `
WITH line_qty AS (
  SELECT si.product_id, si.item_code, s.trcode, s.fiche_type,
    COALESCE(NULLIF(si.base_quantity, 0), si.quantity * COALESCE(si.unit_multiplier, 1)) AS base_qty
  FROM ${saleItemsTable} si
  JOIN ${salesTable} s ON s.id = si.invoice_id
  WHERE COALESCE(s.is_cancelled, false) = false
    AND LOWER(COALESCE(s.status, '')) NOT IN ('iptal', 'cancelled', 'canceled', 'deleted', 'silindi')
),
invoice_delta AS (
  SELECT p.id AS product_id,
    SUM(CASE
      WHEN l.trcode IN (${returnIn}) OR l.fiche_type = 'return_invoice' THEN
        CASE WHEN l.trcode IN (2, 6) THEN -l.base_qty ELSE l.base_qty END
      WHEN l.trcode IN (${purchaseIn}) OR (l.fiche_type = 'purchase_invoice' AND COALESCE(l.trcode, 0) NOT IN (${returnIn})) THEN l.base_qty
      WHEN l.trcode IN (${salesIn}) OR l.fiche_type = 'sales_invoice' THEN -l.base_qty
      ELSE 0 END) AS delta
  FROM line_qty l
  JOIN ${productsTable} p ON (p.id = l.product_id OR p.code = l.item_code OR p.id::text = l.item_code)
  GROUP BY p.id
),
slip_delta AS (
  SELECT p.id AS product_id,
    SUM(CASE
      WHEN sm.movement_type = 'in' THEN smi.quantity
      WHEN sm.movement_type IN ('out', 'adjustment') THEN -smi.quantity
      ELSE 0 END) AS delta
  FROM ${movementItemsTable} smi
  JOIN ${movementsTable} sm ON sm.id = smi.movement_id
  JOIN ${productsTable} p ON p.id = smi.product_id
  WHERE sm.movement_type NOT IN ('transfer', 'price_change')
  GROUP BY p.id
),
combined AS (
  SELECT product_id, SUM(delta) AS delta FROM (
    SELECT * FROM invoice_delta UNION ALL SELECT * FROM slip_delta
  ) x GROUP BY product_id
)
SELECT p.code, p.name,
  ROUND(p.stock::numeric, 3) AS card_stock,
  ROUND(COALESCE(c.delta, 0)::numeric, 3) AS net_movements,
  ROUND((p.stock - COALESCE(c.delta, 0))::numeric, 3) AS implied_opening,
  ROUND((p.stock * p.cost)::numeric, 2) AS cost_value
FROM ${productsTable} p
LEFT JOIN combined c ON c.product_id = p.id
WHERE p.is_active IS DISTINCT FROM false
  AND ABS(p.stock - COALESCE(c.delta, 0)) >= 0.001
ORDER BY ABS(p.stock - COALESCE(c.delta, 0)) DESC
LIMIT ${limit};
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const remote = loadRemotePgDefaults();
  const firm = padFirm(args.firm || process.env.FIRM_NR || '001');
  const period = padPeriod(args.period || process.env.PERIOD_NR || '01');

  const dbName = args.database || process.env.PGDATABASE || remote.database || 'retailex_local';
  const defaultHost =
    dbName === 'retailex_local' || dbName.endsWith('_local') ? '127.0.0.1' : remote.host || '127.0.0.1';

  const clientOpts = {
    host: process.env.PGHOST || defaultHost,
    port: Number(process.env.PGPORT || remote.port || 5432),
    database: dbName,
    user: process.env.PGUSER || remote.user || 'postgres',
    password: process.env.PGPASSWORD || remote.password,
    connectionTimeoutMillis: 15000,
  };

  const productsTable = `rex_${firm}_products`;
  const salesTable = `rex_${firm}_${period}_sales`;
  const saleItemsTable = `rex_${firm}_${period}_sale_items`;
  const movementsTable = `rex_${firm}_${period}_stock_movements`;
  const movementItemsTable = `rex_${firm}_${period}_stock_movement_items`;

  const { Client } = await import('pg');
  const client = new Client(clientOpts);

  try {
    await client.connect();
    console.log(`[validate-stock] ${clientOpts.user}@${clientOpts.host}:${clientOpts.port}/${clientOpts.database} firma=${firm} dönem=${period}`);

    const tableCheck = await client.query(
      `SELECT to_regclass($1) AS products, to_regclass($2) AS sales`,
      [productsTable, salesTable]
    );
    if (!tableCheck.rows[0]?.products) {
      throw new Error(`Tablo bulunamadı: ${productsTable}`);
    }
    if (!tableCheck.rows[0]?.sales) {
      throw new Error(`Tablo bulunamadı: ${salesTable}`);
    }

    if (args.repairProductId) {
      const repair = await client.query(
        `UPDATE ${saleItemsTable} si
         SET product_id = p.id
         FROM ${productsTable} p
         WHERE si.product_id IS NULL
           AND (p.id::text = btrim(si.item_code) OR p.code = btrim(si.item_code))`
      );
      console.log(`[validate-stock] product_id backfill: ${repair.rowCount} satır güncellendi`);
    }

    const summaryRes = await client.query(
      buildValidationSql(productsTable, salesTable, saleItemsTable, movementsTable, movementItemsTable)
    );
    const summary = summaryRes.rows[0];

    const driftRes = await client.query(
      buildDriftSql(productsTable, salesTable, saleItemsTable, movementsTable, movementItemsTable, args.limit)
    );

    if (args.json) {
      console.log(JSON.stringify({ summary, topDrifts: driftRes.rows }, null, 2));
      return;
    }

    console.log('\n=== Stok doğrulama özeti ===');
    console.log(`Aktif ürün           : ${summary.active_products}`);
    console.log(`Toplam miktar        : ${summary.total_qty}`);
    console.log(`Maliyet değeri       : ${summary.total_cost_value}`);
    console.log(`Perakende değeri     : ${summary.total_retail_value}`);
    console.log(`Eşleşmeyen fatura satırı : ${summary.unmatched_lines}`);
    console.log(`Negatif stok         : ${summary.negative_stock}`);
    console.log(`Hareketlerle birebir : ${summary.exact_match} (açılış stok ≈ 0)`);
    console.log(`Açılış stok / sapma  : ${summary.opening_or_drift}`);
    console.log(`Fazla satış (kritik) : ${summary.oversold_vs_movements}`);
    console.log(`Maliyeti 0, stok > 0 : ${summary.zero_cost_with_stock}`);

    const ok =
      Number(summary.unmatched_lines) === 0 &&
      Number(summary.negative_stock) === 0 &&
      Number(summary.oversold_vs_movements) === 0;

    if (driftRes.rows.length) {
      console.log(`\n=== En yüksek sapma (ilk ${args.limit}) ===`);
      console.log('Kod | Kart | Net hareket | Açılış stok* | Maliyet değer');
      for (const r of driftRes.rows) {
        console.log(
          `${r.code} | ${r.card_stock} | ${r.net_movements} | ${r.implied_opening} | ${r.cost_value}`
        );
      }
      console.log('* Açılış stok = kart_stok − net_hareket (ürün oluşturulurken girilen başlangıç stoku olabilir)');
    }

    if (ok) {
      console.log('\n[validate-stock] Sonuç: OK — kritik stok tutarsızlığı yok.');
    } else {
      console.log('\n[validate-stock] Sonuç: UYARI — kritik kontrollerde sorun var.');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('[validate-stock] Hata:', err?.message || err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
