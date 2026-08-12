/**
 * Yemek.com tarif listesinden (https://yemek.com/tarif/) __NEXT_DATA__ içindeki
 * recipeSearch.recipeData ile ürün satırları üretir; görseller 400x400 (weserv.nl cover).
 *
 * Sayfalama: /tarif/ (1. sayfa), /tarif/sayfa/2/, ...
 * Varsayılan: liste bitene kadar tüm sayfalar (binlerce istek; süre uzun sürebilir).
 * Sınırlamak için: --min=N veya --pages=N
 * Kullanım:
 *   node scripts/generate-yemekcom-tarif-excel.mjs
 *   node scripts/generate-yemekcom-tarif-excel.mjs --min=100
 *   node scripts/generate-yemekcom-tarif-excel.mjs --pages=15
 *
 * Not: Site içeriği ve kullanım koşulları yemek.com'a aittir; yalnızca kendi sisteminize
 * aktarım için makul hızda (rate limit) kullanın.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import {
  PRODUCT_EXCEL_SHEET_NAME,
  orderedProductRow,
  productSheetColWidths,
} from './excelModuleProductFormat.mjs';

const IMG_SIZE = 400;
const REQUEST_GAP_MS = 550;
const PRICE_STEP = 250;
/** --min= kullanıldığında geçerli varsayılan hedef */
const DEFAULT_MIN_PRODUCTS = 100;
/** ~29k tarif / 12 ≈ 2500 sayfa; güvenlik tavanı */
const MAX_PAGES_SAFETY = 8000;
/** Tam tarama modunda her N sayfada bir özet log */
const LOG_EVERY_PAGE_WHEN_FETCH_ALL = 25;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const defaultOut = path.join(root, 'docs', 'yemekcom-tarif-urunler-ExcelModule.xlsx');

const SKIP_CATEGORY = new Set([
  'ramazan',
  'video',
  'masterchef',
  'mevsiminde',
  'yerel üreticilerden',
]);

const CATEGORY_PRIORITY = [
  'Dolma Sarma',
  'Bakliyat',
  'Tavuk',
  'Sebze',
  'Kırmızı Et',
  'Kuzu Et',
  'Et Yemekleri',
  'Kebap',
  'Balık',
  'Çorba',
  'Sulu Yemek',
  'Pilav',
  'Makarna',
  'Hamur İşi',
  'Börek',
  'Tatlı',
  'Tatlılar',
  'İçecek',
  'Kahvaltılıklar',
  'Meze',
  'Salata',
  'Fırın Yemekleri',
  'Köfte',
  'Pizza',
  'Sandviç',
  'Kurabiye',
  'Kek',
  'Poğaça',
  'Yöresel Tarifler',
  'Akşam Yemeği',
  'Öğle Yemeği',
  'Kahvaltı',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function forceUniformImageBox(sourceUrl) {
  const src = String(sourceUrl || '').trim();
  if (!src) return '';
  return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=${IMG_SIZE}&h=${IMG_SIZE}&fit=cover&output=jpg&q=85`;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normTr(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickCategory(cats) {
  if (!Array.isArray(cats) || !cats.length) return 'Genel';
  for (const p of CATEGORY_PRIORITY) {
    const want = normTr(p);
    const hit = cats.find((c) => normTr(c) === want);
    if (hit) return hit;
  }
  const rest = cats.filter((c) => !SKIP_CATEGORY.has(normTr(c)));
  return rest[0] || cats[0];
}

function featuredImageUrl(fi) {
  const md = fi?.MediaData;
  if (!md || typeof md !== 'object') return '';
  const o = md['ymk-original']?.Path;
  if (o) return o;
  return (
    md['ymk-large']?.Path ||
    md['ymk-medium']?.Path ||
    md['ymk-thumbnail']?.Path ||
    ''
  );
}

function pageUrl(page) {
  if (page <= 1) return 'https://yemek.com/tarif/';
  return `https://yemek.com/tarif/sayfa/${page}/`;
}

function parseArgs() {
  const a = process.argv.slice(2);
  let pagesExact = null;
  let minProducts = DEFAULT_MIN_PRODUCTS;
  let minExplicit = false;
  let fetchAll = true;
  let out = defaultOut;
  for (const x of a) {
    if (x.startsWith('--min=')) {
      minExplicit = true;
      minProducts = Math.max(1, parseInt(x.slice('--min='.length), 10) || DEFAULT_MIN_PRODUCTS);
    }
    if (x.startsWith('--pages=')) {
      pagesExact = Math.max(1, parseInt(x.slice('--pages='.length), 10) || 1);
    }
    if (x.startsWith('--out=')) out = path.resolve(x.slice('--out='.length));
  }
  if (pagesExact != null) {
    fetchAll = false;
  } else if (minExplicit) {
    fetchAll = false;
  } else {
    fetchAll = true;
    minProducts = Number.MAX_SAFE_INTEGER;
  }
  return { pagesExact, minProducts, fetchAll, out };
}

function roundToStep(n) {
  return Math.max(PRICE_STEP, Math.round(n / PRICE_STEP) * PRICE_STEP);
}

/** 13 karakter, yemek.com Id ile birebir tekil (eski 8690999+pad+slice çakışma yapıyordu) */
function barcodeFromYemekRecipeId(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n < 0) return '';
  const tail = String(n % 10_000_000_000).padStart(10, '0');
  return (`869${tail}`).slice(0, 13);
}

const MAX_NAME_LEN = 255;
const MAX_SPECIAL3_LEN = 50;

function truncateCell(s, max) {
  const t = String(s ?? '');
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

async function fetchRecipePage(page) {
  const url = pageUrl(page);
  await sleep(REQUEST_GAP_MS);
  const r = await fetch(url, {
    headers: { 'User-Agent': 'RetailEXMenuImport/1.0 (Excel export; +https://github.com/)' },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const t = await r.text();
  const m = t.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`__NEXT_DATA__ yok: ${url}`);
  const j = JSON.parse(m[1]);
  const rs = j.props?.pageProps?.initialState?.recipeSearch;
  const data = rs?.recipeData;
  if (!Array.isArray(data)) throw new Error(`recipeData bekleniyor: ${url}`);
  return { data, recipeCount: rs?.recipeCount, nextUrl: rs?.nextUrl };
}

async function main() {
  const { pagesExact, minProducts, fetchAll, out } = parseArgs();
  if (fetchAll) {
    console.log(
      'Mod: tüm sayfalar (boş sayfa gelene kadar). Süre uzun sürebilir; hızlı deneme için --min=100 veya --pages=9 kullanın.',
    );
  }
  const all = [];
  const seen = new Set();
  let p = 1;
  let noNewStreak = 0;
  let recipeCountHint;

  while (p <= MAX_PAGES_SAFETY) {
    if (pagesExact != null && p > pagesExact) break;

    const { data, recipeCount, nextUrl } = await fetchRecipePage(p);
    if (recipeCount != null) recipeCountHint = recipeCount;

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`Sayfa ${p} — boş, duruldu.`);
      break;
    }

    let added = 0;
    for (const x of data) {
      if (!x?.Id || seen.has(x.Id)) continue;
      seen.add(x.Id);
      all.push(x);
      added += 1;
    }

    const targetLabel =
      pagesExact != null
        ? `hedef ${pagesExact} sayfa`
        : fetchAll
          ? 'tüm sayfalar'
          : `min ${minProducts} ürün`;
    const logAlways =
      !fetchAll ||
      p <= 2 ||
      p % LOG_EVERY_PAGE_WHEN_FETCH_ALL === 0 ||
      data.length < 12 ||
      added === 0;
    if (logAlways) {
      console.log(
        `Sayfa ${p} — liste ${data.length} tarif, +${added} yeni → toplam ${all.length} benzersiz (${targetLabel}; site ~${recipeCountHint ?? '?'} tarif) next=${nextUrl ?? ''}`,
      );
    }

    if (added === 0) {
      noNewStreak += 1;
      if (noNewStreak >= 2) {
        console.warn('Ardışık sayfalarda yeni tarif yok; döngü durduruldu.');
        break;
      }
    } else {
      noNewStreak = 0;
    }

    const reachedMin = pagesExact == null && !fetchAll && all.length >= minProducts;
    if (reachedMin) break;

    p += 1;
    if (pagesExact != null && p > pagesExact) break;
  }

  if (!fetchAll && pagesExact == null && all.length < minProducts) {
    console.warn(
      `Uyarı: ${all.length} benzersiz tarif toplandı; hedef en az ${minProducts} üründü. Site yanıtı veya sayfa sınırı nedeniyle eksik kalmış olabilir.`,
    );
  }

  const outRows = [];
  let n = 0;

  for (const x of all) {
    n += 1;
    const code = `YMK-${String(n).padStart(5, '0')}`;
    const barcode = barcodeFromYemekRecipeId(x.Id);
    const title = truncateCell(
      String(x.TitleCustomized || x.Title || '').trim() || `Tarif #${x.Id}`,
      MAX_NAME_LEN,
    );
    const kategori = pickCategory(x.RecipeCategory);
    const rawImg = featuredImageUrl(x.FeaturedImage);
    const img = rawImg ? forceUniformImageBox(rawImg) : '';
    const descBody = stripHtml(x.Content || '').slice(0, 420);
    const perm = String(x.Permalink || '').trim();
    const link = perm.startsWith('http')
      ? perm
      : `https://yemek.com${perm.startsWith('/') ? perm : `/${perm}`}`;
    const tagsRaw = Array.isArray(x.RecipeCategory) ? x.RecipeCategory.join(' · ') : '';
    const tagsForExcel = truncateCell(tagsRaw, MAX_SPECIAL3_LEN);
    const aciklamaParts = [descBody];
    if (tagsRaw.length > tagsForExcel.length) {
      aciklamaParts.push(`Etiketler: ${tagsRaw}`);
    }
    aciklamaParts.push(`Kaynak: yemek.com — ${link}`);
    const aciklama = truncateCell(aciklamaParts.filter(Boolean).join('\n\n'), 4000);

    const satis = roundToStep(250 + (Number(x.Id) % 47) * PRICE_STEP);
    const alis = roundToStep(satis * 0.42);

    const row = {
      'Ürün Kodu*': code,
      'Ürün Adı*': title,
      Barkod: barcode,
      Kategori: kategori,
      'Grup Kodu': 'YMK-TARIF',
      Marka: '',
      Birim: 'Adet',
      'Alış Fiyatı': alis,
      'Satış Fiyatı*': satis,
      'KDV Oranı (%)': 10,
      'Min Stok': 0,
      'Max Stok': 0,
      'Özel Kod 1': String(x.Id),
      'Özel Kod 2': '',
      'Özel Kod 3': tagsForExcel,
      Açıklama: aciklama,
      'Görsel URL': img,
      'Aktif (E/H)': 'E',
    };

    outRows.push(orderedProductRow(row));
  }

  const dir = path.dirname(out);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const ws = XLSX.utils.json_to_sheet(outRows);
  ws['!cols'] = productSheetColWidths();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, PRODUCT_EXCEL_SHEET_NAME);
  XLSX.writeFile(wb, out, { bookType: 'xlsx', compression: true });

  console.log('Yazıldı:', out);
  console.log('Satır:', outRows.length);
  console.log(`Görseller: kaynak CDN → zorunlu ${IMG_SIZE}x${IMG_SIZE} (weserv)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
