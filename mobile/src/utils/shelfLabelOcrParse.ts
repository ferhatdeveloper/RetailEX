/**
 * Raf / ürün etiketi OCR metninden malzeme alanları.
 * Web `visionService.parseRetailShelfLabel` heuristics + birim / kod / KDV.
 * Kimlik parse'ından bağımsız; ham blok girişi `scanOcr` ile ortak.
 */

import { parseTrAmount } from './documentOcrParse';

export type ParsedProductFields = {
  code?: string;
  barcode?: string;
  name?: string;
  unit?: string;
  price?: number;
  /** KDV % (örn. 1, 10, 20) */
  vatRate?: number;
  /** Varyant / ikinci satır ipucu */
  variantHint?: string;
  rawText: string;
  ocrLines: string[];
};

const UNIT_RE =
  /\b(?:birim|unit)[:\s]*([A-Za-zğüşıöçĞÜŞİÖÇ]{1,12})\b|\b(adet|ad\.?|kg|gr|g\.?|lt|l\.?|ml|paket|pkt|koli|çuval|cuval|mt|m\.?)\b/i;

const CODE_RE =
  /(?:ürün\s*kodu|urun\s*kodu|stok\s*kodu|malzeme\s*kodu|sku|kod|plu)[:\s#]*([A-Za-z0-9\-_./]{2,24})/i;

/** Terazi / massa etiketi PLU (örn. PLU 67, P067) */
const PLU_RE = /\bPLU\s*[#:.]?\s*([A-Za-z]?\d{1,6})\b/i;

const VAT_RE = /(?:kdv|vat)\s*%?\s*[:\s]*(\d{1,2})(?:[.,]\d+)?/i;

const PRICE_LABEL_RE =
  /(?:fiyat|satış|satis|price|tutar|birim\s*fiyat)[\s:]*([\d.,]+)\s*(?:tl|try|₺)?(?:\s*\/?\s*kg)?/i;

function normalizeUnit(raw: string): string {
  const u = raw.trim().toLocaleLowerCase('tr-TR');
  if (/^ad(\.|et)?$|^adet$/.test(u)) return 'AD';
  if (/^kg$|^kilo/.test(u)) return 'KG';
  if (/^g(r)?$|^gram/.test(u)) return 'GR';
  if (/^l(t)?$|^litre/.test(u)) return 'LT';
  if (/^ml$/.test(u)) return 'ML';
  if (/^paket|^pkt/.test(u)) return 'PKT';
  if (/^koli/.test(u)) return 'KOLI';
  if (/^m(t)?$|^metre/.test(u)) return 'MT';
  return raw.trim().slice(0, 12).toUpperCase() || 'AD';
}

function blocksToLines(blocks: string[]): string[] {
  const lines: string[] = [];
  for (const b of blocks) {
    const parts = String(b || '')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (parts.length) lines.push(...parts);
    else if (String(b || '').trim()) lines.push(String(b).trim());
  }
  return lines;
}

function extractBarcode(flat: string, lines: string[]): string | undefined {
  const digitRuns = flat.match(/\d{8,14}/g) || [];
  if (digitRuns.length > 0) {
    return digitRuns.sort((a, b) => b.length - a.length)[0]?.slice(0, 32);
  }
  for (const line of lines) {
    const compact = line.replace(/\s/g, '');
    if (/^\d{8,14}$/.test(compact)) return compact.slice(0, 32);
  }
  return undefined;
}

function extractPrice(flat: string): number | undefined {
  const labeled = flat.match(PRICE_LABEL_RE);
  if (labeled?.[1]) {
    const n = parseTrAmount(labeled[1]);
    if (n != null && n > 0) return n;
  }
  const perKg = flat.match(/(\d{1,6})[.,](\d{2})\s*(?:tl|try|₺)?\s*\/?\s*kg/i);
  if (perKg) {
    const n = parseFloat(`${perKg[1]}.${perKg[2]}`);
    if (n > 0) return n;
  }
  const pr = flat.match(/(\d{1,6})[.,](\d{2})\s*(?:tl|try|₺)/i);
  if (pr) {
    const n = parseFloat(`${pr[1]}.${pr[2]}`);
    if (n > 0) return n;
  }
  const w = flat.match(/\b(\d{1,5})\s*(?:TL|TRY|₺)\b/i);
  if (w) {
    const n = parseFloat(w[1]);
    if (n > 0) return n;
  }
  return undefined;
}

function extractName(lines: string[], barcode?: string): { name?: string; variantHint?: string } {
  let nameHint = '';
  for (const line of lines) {
    const noSpace = line.replace(/\s/g, '');
    if (/^\d+([.,]\d+)?$/.test(noSpace)) continue;
    if (/^\d{8,14}$/.test(noSpace)) continue;
    if (barcode && noSpace === barcode) continue;
    if (/(?:fiyat|satış|satis|kdv|vat|tl|try|₺)/i.test(line) && line.length < 20) continue;
    if (line.length > nameHint.length && line.length >= 2) nameHint = line;
  }
  if (!nameHint && lines[0]) nameHint = lines[0];

  let variantHint = '';
  for (const line of lines) {
    if (line === nameHint) continue;
    if (line.length > 60 || line.length < 2) continue;
    if (/^\d{8,14}$/.test(line.replace(/\s/g, ''))) continue;
    if (line.length <= 40) {
      variantHint = line;
      break;
    }
  }

  let name = nameHint.slice(0, 200) || undefined;
  if (name && variantHint && !name.toLocaleLowerCase('tr-TR').includes(variantHint.toLocaleLowerCase('tr-TR'))) {
    // Kısa varyantı ada ekleme (kullanıcı modalda düzeltebilir)
    if (variantHint.length <= 24 && name.length + variantHint.length < 180) {
      name = `${name} ${variantHint}`.trim().slice(0, 200);
    }
  }
  return { name, variantHint: variantHint.slice(0, 120) || undefined };
}

/**
 * OCR bloklarından ürün / raf etiketi alanları.
 * Alias: parseProductFromOcr
 */
export function parseShelfLabelOcr(blocks: string[]): ParsedProductFields {
  const ocrLines = blocksToLines(blocks);
  const rawText = ocrLines.join('\n');
  const flat = ocrLines.join(' ');

  const barcode = extractBarcode(flat, ocrLines);
  const price = extractPrice(flat);
  const { name, variantHint } = extractName(ocrLines, barcode);

  let unit: string | undefined;
  const um = flat.match(UNIT_RE);
  if (um) unit = normalizeUnit(um[1] || um[2] || '');

  let code: string | undefined;
  const cm = flat.match(CODE_RE);
  if (cm?.[1]) code = cm[1].slice(0, 24);
  if (!code) {
    const plu = flat.match(PLU_RE);
    if (plu?.[1]) {
      const raw = plu[1].trim();
      code = /^[A-Za-z]/.test(raw)
        ? raw.toUpperCase().slice(0, 24)
        : `P${raw.padStart(3, '0')}`.slice(0, 24);
    }
  }

  let vatRate: number | undefined;
  const vm = flat.match(VAT_RE);
  if (vm?.[1]) {
    const v = parseInt(vm[1], 10);
    if (v >= 0 && v <= 100) vatRate = v;
  }

  return {
    code,
    barcode,
    name,
    unit,
    price,
    vatRate,
    variantHint,
    rawText,
    ocrLines,
  };
}

/** Kullanıcı / API adı — raf etiketi parse ile aynı */
export const parseProductFromOcr = parseShelfLabelOcr;
