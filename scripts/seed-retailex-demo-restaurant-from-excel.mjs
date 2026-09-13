#!/usr/bin/env node
/**
 * retailex_demo firma 010 — docs/yemekcom-tarif-urunler-ExcelModule.xlsx → rex_010_products
 *
 * Kullanım (seed-retailex-demo-full.mjs çağırır):
 *   PGHOST=... PGUSER=postgres PGPASSWORD=... PGDATABASE=retailex_demo \
 *     node scripts/seed-retailex-demo-restaurant-from-excel.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const host = process.env.PGHOST || '127.0.0.1';
const port = Number(process.env.PGPORT || 5432);
const user = process.env.PGUSER || 'postgres';
const password = process.env.PGPASSWORD || '';
const database = process.env.PGDATABASE || 'retailex_demo';
const dry = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');

const xlsxPath =
  process.env.RESTAURANT_EXCEL ||
  path.join(root, 'docs', 'yemekcom-tarif-urunler-ExcelModule.xlsx');

if (!password) {
  console.error('PGPASSWORD gerekli');
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error(`Excel yok: ${xlsxPath}`);
  process.exit(1);
}

const CAT_MAP = [
  { re: /çorba|corba/i, code: 'REST-CORBA' },
  { re: /salata/i, code: 'REST-SALATA' },
  { re: /tatlı|tatli|dessert|sütlaç|baklava|künefe/i, code: 'REST-TATLI' },
  { re: /içecek|icecek|çay|ayran|kahve|cola|su |şerbet/i, code: 'REST-ICECEK' },
  { re: /ara |mez[eé]|patates|börek/i, code: 'REST-ARA' },
];

function categoryCode(excelCat, name) {
  const blob = `${excelCat || ''} ${name || ''}`;
  for (const m of CAT_MAP) {
    if (m.re.test(blob)) return m.code;
  }
  return 'REST-ANA';
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`[excel] ${rows.length} satır ← ${path.basename(xlsxPath)}`);

  if (dry) {
    console.log('[dry-run] ilk 3:', rows.slice(0, 3).map((r) => r['Ürün Kodu*']));
    return;
  }

  const client = new pg.Client({ host, port, user, password, database });
  await client.connect();
  try {
    const { rows: catRows } = await client.query(
      `SELECT id, code FROM public.rex_010_categories WHERE is_restaurant IS TRUE`,
    );
    const catByCode = Object.fromEntries(catRows.map((r) => [r.code, r.id]));

    let inserted = 0;
    let skipped = 0;
    for (const r of rows) {
      const code = String(r['Ürün Kodu*'] || '').trim();
      const name = String(r['Ürün Adı*'] || '').trim();
      if (!code || !name) {
        skipped += 1;
        continue;
      }
      const barcode = String(r['Barkod'] || '').trim() || null;
      const excelCat = String(r['Kategori'] || '').trim();
      const unit = String(r['Birim'] || 'Porsiyon').trim() || 'Porsiyon';
      const cost = num(r['Alış Fiyatı'], 0);
      const price = num(r['Satış Fiyatı*'], 0);
      const vat = num(r['KDV Oranı (%)'], 10);
      const desc = String(r['Açıklama'] || '').trim();
      const name2 = (desc || excelCat || '').slice(0, 255) || null;
      const activeRaw = String(r['Aktif (E/H)'] || 'E').trim().toUpperCase();
      const isActive = activeRaw !== 'H' && activeRaw !== 'N' && activeRaw !== '0';
      const catCode = categoryCode(excelCat, name);
      const categoryId = catByCode[catCode] || catByCode['REST-ANA'] || null;

      const res = await client.query(
        `INSERT INTO public.rex_010_products
          (firm_nr, code, barcode, name, name2, category_id, vat_rate, price, cost, stock, min_stock, unit, currency, is_active)
         VALUES ('010', $1, $2, $3, $4, $5, $6, $7, $8, 999, 1, $9, 'TRY', $10)
         ON CONFLICT (code) DO UPDATE SET
           barcode = EXCLUDED.barcode,
           name = EXCLUDED.name,
           name2 = EXCLUDED.name2,
           category_id = EXCLUDED.category_id,
           vat_rate = EXCLUDED.vat_rate,
           price = EXCLUDED.price,
           cost = EXCLUDED.cost,
           unit = EXCLUDED.unit,
           is_active = EXCLUDED.is_active
         RETURNING (xmax = 0) AS inserted`,
        [code.slice(0, 50), barcode ? barcode.slice(0, 64) : null, name.slice(0, 255), name2, categoryId, vat, price, cost, unit.slice(0, 50), isActive],
      );
      if (res.rows[0]?.inserted) inserted += 1;
    }

    const { rows: cnt } = await client.query(
      `SELECT count(*)::int AS n FROM public.rex_010_products WHERE firm_nr = '010'`,
    );
    console.log(`[excel] yeni/ilk insert≈${inserted} atlanan=${skipped} toplam ürün=${cnt[0]?.n}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
