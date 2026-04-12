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
const REQUEST_GAP_MS = 400;
const PRICE_MULTIPLIER = 10;
const PRICE_STEP = 250;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'docs', 'restoran-turk-mutfak-icecek-listesi.csv');
const outXlsx = path.join(root, 'docs', 'restoran-turk-mutfak-urunler-ExcelModule.xlsx');

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function forceUniformImageBox(sourceUrl){
  const src = String(sourceUrl || '').trim();
  if(!src) return '';
  return `https://images.weserv.nl/?url=${encodeURIComponent(src)}&w=${IMG_SIZE}&h=${IMG_SIZE}&fit=cover&output=jpg&q=85`;
}

function normalizeUnsplash(u){
  if(!u || typeof u !== 'string') return '';
  const base = u.split('?')[0];
  return forceUniformImageBox(`${base}?auto=format&q=82`);
}

function fileNameFromSpecialFilePath(url){
  if(!url || !url.includes('Special:FilePath')) return '';
  try{
    const m = url.match(/Special:FilePath\/([^?#]+)/);
    if(!m) return '';
    return decodeURIComponent(m[1]);
  }catch{ return ''; }
}

const apiCache = new Map();

async function commonsThumbFromFileName(fileName){
  const key = `file:${fileName}`;
  if(apiCache.has(key)) return apiCache.get(key);
  await sleep(REQUEST_GAP_MS);
  const title = fileName.startsWith('File:') ? fileName : `File:${fileName}`;
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&iiurlwidth=${IMG_SIZE}&format=json&origin=*`;
  try{
    const r = await fetch(api, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const pages = j.query?.pages;
    const p = pages && Object.values(pages)[0];
    const ii = p?.imageinfo?.[0];
    const out = ii?.thumburl || ii?.url || '';
    apiCache.set(key, out);
    return out;
  }catch{
    apiCache.set(key, '');
    return '';
  }
}

async function commonsSearchThumb400(searchQuery){
  const q = String(searchQuery || '').trim();
  if(!q) return '';
  const key = `search:${q}`;
  if(apiCache.has(key)) return apiCache.get(key);
  await sleep(REQUEST_GAP_MS);
  const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url&iiurlwidth=${IMG_SIZE}&format=json&origin=*`;
  try{
    const r = await fetch(api, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    const pages = j.query?.pages;
    const p = pages && Object.values(pages).find(x => x && x.imageinfo);
    const ii = p?.imageinfo?.[0];
    const out = ii?.thumburl || ii?.url || '';
    apiCache.set(key, out);
    return out;
  }catch{
    apiCache.set(key, '');
    return '';
  }
}

function buildSearchQuery(kategori, urunAdi, nameEn, hint){
  if(hint && String(hint).trim()) return String(hint).trim();
  const u = String(urunAdi || '').trim();
  const en = String(nameEn || '').trim();
  const k = String(kategori || '').toLowerCase();
  if(k.includes('tatlı')) return `${u} ${en} Turkish dessert`.trim();
  if(k.includes('içecek') || k.includes('alkollü')) return `${u} ${en} beverage drink`.trim();
  if(k.includes('çorba')) return `${u} ${en} Turkish soup`.trim();
  if(k.includes('kebap') || k.includes('ızgara')) return `${u} ${en} Turkish kebab`.trim();
  return `${u} ${en} Turkish cuisine`.trim();
}

async function resolveImageUrl(parts){
  const [kategori, urunAdi, nameEn, , gorselUrl, temsili, wikimediaHint, stokUnsplash] = parts;

  if(stokUnsplash && String(stokUnsplash).trim().startsWith('http')){
    return normalizeUnsplash(String(stokUnsplash).trim());
  }

  const isHayir = String(temsili || '').toLowerCase().includes('hayır');
  const hasFile = String(gorselUrl || '').includes('Special:FilePath');

  if(isHayir && hasFile){
    const fn = fileNameFromSpecialFilePath(String(gorselUrl));
    if(fn){
      const thumb = await commonsThumbFromFileName(fn);
      if(thumb) return forceUniformImageBox(thumb);
    }
  }

  const found = await commonsSearchThumb400(buildSearchQuery(kategori, urunAdi, nameEn, wikimediaHint));
  if(found) return forceUniformImageBox(found);

  if(hasFile){
    const fn = fileNameFromSpecialFilePath(String(gorselUrl));
    if(fn){
      const thumb = await commonsThumbFromFileName(fn);
      if(thumb) return forceUniformImageBox(thumb);
    }
  }

  return '';
}

const raw = fs.readFileSync(src, { encoding: 'utf8' }).replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);

async function main(){
  if(lines.length < 2) throw new Error('Kaynak CSV boş veya yetersiz.');

  const outRows = [];
  let n = 0;

  for(let i=1;i<lines.length;i++){
    const p = lines[i].split(';');
    if(p.length < 10) continue;

    const [kategori, urunAdi, nameEn, aciklama, , , , , fiyat, birim] = p;
    const basePrice = parseFloat(String(fiyat).replace(',', '.')) || 0;
    const rawPrice = Math.max(PRICE_STEP, Math.round(basePrice * PRICE_MULTIPLIER));
    const price = Math.max(PRICE_STEP, Math.round(rawPrice / PRICE_STEP) * PRICE_STEP);
    const rawCost = Math.max(PRICE_STEP, Math.round(price * 0.4));
    const cost = Math.max(PRICE_STEP, Math.round(rawCost / PRICE_STEP) * PRICE_STEP);

    n += 1;
    const code = `REST-${String(n).padStart(3,'0')}`;
    const barcode = `8690000${String(n).padStart(6,'0')}`;
    const img = await resolveImageUrl(p);

    const row = {
      'Ürün Kodu*': code,
      'Ürün Adı*': urunAdi,
      'Barkod': barcode,
      'Kategori': kategori,
      'Grup Kodu': 'REST-MENU',
      'Marka': '',
      'Birim': birim || 'Adet',
      'Alış Fiyatı': cost,
      'Satış Fiyatı*': price,
      'KDV Oranı (%)': 10,
      'Min Stok': 0,
      'Max Stok': 0,
      'Özel Kod 1': '',
      'Özel Kod 2': nameEn || '',
      'Özel Kod 3': '',
      'Açıklama': aciklama || '',
      'Görsel URL': img,
      'Aktif (E/H)': 'E',
    };

    outRows.push(orderedProductRow(row));
    if(n % 20 === 0) console.log(`... ${n} ürün işlendi`);
  }

  const ws = XLSX.utils.json_to_sheet(outRows);
  ws['!cols'] = productSheetColWidths();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, PRODUCT_EXCEL_SHEET_NAME);
  XLSX.writeFile(wb, outXlsx, { bookType: 'xlsx', compression: true });

  console.log('Yazıldı:', outXlsx);
  console.log('Satır:', outRows.length);
  console.log('Fiyat çarpanı:', PRICE_MULTIPLIER);
  console.log(`Görseller: zorunlu ${IMG_SIZE}x${IMG_SIZE}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

