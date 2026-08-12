/**
 * Tartı barkod testleri (code10: ilk 10 hane kod + gram)
 * Kullanım: PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=retailex_local npx tsx scripts/test/test-scale-barcode-1000000038.mjs
 */
import { ERP_SETTINGS, DB_SETTINGS, LOCAL_CONFIG } from '../../src/services/postgres.ts';
import { productAPI } from '../../src/services/api/products.ts';
import { resolveScaleBarcodeSale } from '../../src/utils/scaleBarcodeSale.ts';
import { parseBarcode } from '../../src/utils/barcodeParser.ts';

DB_SETTINGS.connectionProvider = 'db';
DB_SETTINGS.activeMode = 'offline';
if (process.env.PGPASSWORD) LOCAL_CONFIG.password = process.env.PGPASSWORD;
if (process.env.PGHOST) LOCAL_CONFIG.host = process.env.PGHOST;
if (process.env.PGUSER) LOCAL_CONFIG.user = process.env.PGUSER;
if (process.env.PGDATABASE) LOCAL_CONFIG.database = process.env.PGDATABASE;
ERP_SETTINGS.firmNr = '1';
ERP_SETTINGS.periodNr = '01';

const CASES = [
  { bc: '10000000381415', plu: '1000000038', qty: 1.415, grams: 1415 },
  { bc: '10000000441415', plu: '1000000044', qty: 1.415, grams: 1415 },
];

async function runCase({ bc, plu, qty, grams }) {
  console.log('\n---', bc, '---');
  console.log('parse:', parseBarcode(bc));

  const t0 = performance.now();
  const sale = await resolveScaleBarcodeSale(bc, 1310);
  const ms = Math.round(performance.now() - t0);

  if (!sale) {
    console.error('FAIL: resolveScaleBarcodeSale null');
    process.exit(1);
  }
  console.log(`OK (${ms}ms):`, {
    code: sale.product.code,
    qty: sale.quantity,
    unit: sale.unitName,
    unitPrice: sale.unitPrice,
    lineTotal: sale.lineTotal,
    weightGrams: sale.weightGrams,
  });
  if (sale.product.code !== plu) process.exit(1);
  if (Math.abs(sale.quantity - qty) > 0.001) process.exit(1);
  if (sale.weightGrams !== grams) process.exit(1);
  if (ms > 800) {
    console.warn(`WARN: ${ms}ms yavaş (>800ms)`);
  }
}

async function main() {
  for (const c of CASES) {
    await runCase(c);
  }
  console.log('\nTüm kontroller geçti.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
