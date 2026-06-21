/**
 * Tartı barkod test: 10000000381415 → kod 1000000038, 1415 g = 1,415 kg
 * Kullanım: PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=retailex_local node scripts/test/test-scale-barcode-1000000038.mjs
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

const bc = '10000000381415';
const plu = '1000000038';

async function main() {
  console.log('parse:', parseBarcode(bc));

  const byPlu = await productAPI.getScaleProductByPlu(plu);
  console.log(
    'getScaleProductByPlu:',
    byPlu
      ? { id: byPlu.id, code: byPlu.code, unit: byPlu.unit, price: byPlu.price, isScale: byPlu.isScaleProduct }
      : 'BULUNAMADI',
  );

  const byFull = await productAPI.lookupByBarcode(bc);
  console.log('lookupByBarcode(tam):', byFull?.product?.code ?? 'yok');

  const sale = await resolveScaleBarcodeSale(bc, 1310);
  if (!sale) {
    console.error('FAIL: resolveScaleBarcodeSale null');
    process.exit(1);
  }
  console.log('OK resolveScaleBarcodeSale:', {
    code: sale.product.code,
    qty: sale.quantity,
    unit: sale.unitName,
    unitPrice: sale.unitPrice,
    lineTotal: sale.lineTotal,
    weightGrams: sale.weightGrams,
  });
  if (sale.product.code !== plu) process.exit(1);
  if (Math.abs(sale.quantity - 1.415) > 0.001) process.exit(1);
  if (sale.weightGrams !== 1415) process.exit(1);
  console.log('Tüm kontroller geçti.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
