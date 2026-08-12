/**
 * Belge OCR metninden fatura alanları çıkarma (Türkçe fatura kalıpları).
 * Cihaz OCR yoksa / boşsa manuel wizard ile devam edilir.
 */

export type ParsedInvoiceLine = {
  name: string;
  qty: number;
  unitPrice: number;
  /** Ham satır (önizleme) */
  raw?: string;
};

export type ParsedInvoiceFields = {
  documentNo?: string;
  partyName?: string;
  /** Genel toplam (KDV dahil tahmini) */
  totalAmount?: number;
  vatRate?: number;
  lines: ParsedInvoiceLine[];
  /** Birleştirilmiş ham metin (küçük önizleme) */
  rawText: string;
  /** OCR satırları */
  ocrLines: string[];
};

const DOC_NO_RE =
  /(?:fatura\s*no|belge\s*no|fi[sş]\s*no|document\s*(?:no|number)|invoice\s*(?:no|number)|e[\s-]?fatura\s*no)[:\s#]*([A-Za-z0-9\-\/_.]{3,32})/i;

const ALT_DOC_NO_RE = /\b((?:GIB|GIBN|TRS|EF|SN|FN)[\w\-\/]{4,28})\b/i;

const TOTAL_RE =
  /(?:genel\s*toplam|öden(?:ecek|ecek)\s*tutar|toplam\s*tutar|net\s*toplam|grand\s*total|amount\s*due|toplam)[:\s]*([\d.,]+)\s*(?:₺|TL|TRY)?/i;

const VAT_RE = /(?:kdv|vat)\s*%?\s*[:\s]*(\d{1,2})(?:[.,]\d+)?/i;

const PARTY_RE =
  /(?:cari|mü[sş]teri|al[ıi]c[ıi]|sat[ıi]c[ıi]|tedarik[cç]i|unvan|ünvan|alıcı\s*ünvanı|satıcı\s*ünvanı)[:\s]+(.{3,80})/i;

/** TR sayı: 1.234,56 veya 1234.56 veya 1234,56 */
export function parseTrAmount(raw: string): number | undefined {
  const t = String(raw || '')
    .trim()
    .replace(/[₺\s]/g, '')
    .replace(/TL|TRY/gi, '');
  if (!t) return undefined;
  let cleaned = t;
  if (/,/.test(cleaned) && /\./.test(cleaned)) {
    // 1.234,56 → binlik nokta, ondalık virgül
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (/,/.test(cleaned)) {
    cleaned = cleaned.replace(',', '.');
  }
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

function joinOcr(blocks: string[]): { text: string; lines: string[] } {
  const lines = blocks
    .flatMap((b) => String(b || '').split(/\r?\n/))
    .map((l) => l.trim())
    .filter(Boolean);
  return { text: lines.join('\n'), lines };
}

/** Satır kalıbı: "Ürün adı  2  150,00" veya "Ürün  x2  @75" */
function tryParseLine(line: string): ParsedInvoiceLine | null {
  const s = line.trim();
  if (s.length < 4 || s.length > 120) return null;
  // Başlık / toplam satırlarını atla
  if (
    /(?:genel\s*toplam|öden(?:ecek)|kdv|ara\s*toplam|toplam\s*tutar|fatura\s*no|belge\s*no)/i.test(
      s,
    )
  ) {
    return null;
  }

  // "adet x birim = tutar" veya "name qty price"
  const mEq = s.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*[xX×]\s*([\d.,]+)\s*=?\s*([\d.,]+)?$/);
  if (mEq) {
    const name = mEq[1].trim();
    const qty = parseTrAmount(mEq[2]) ?? 1;
    const unitPrice = parseTrAmount(mEq[3]) ?? 0;
    if (name.length >= 2 && unitPrice > 0) {
      return { name, qty: qty || 1, unitPrice, raw: s };
    }
  }

  const mTrail = s.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s*$/);
  if (mTrail) {
    const name = mTrail[1].trim();
    const qty = parseTrAmount(mTrail[2]) ?? 1;
    const unitPrice = parseTrAmount(mTrail[3]) ?? 0;
    if (name.length >= 2 && unitPrice > 0 && !/^\d+$/.test(name)) {
      return { name, qty: qty || 1, unitPrice, raw: s };
    }
  }

  return null;
}

/**
 * OCR bloklarından fatura alanları çıkar.
 * Kullanıcı onayına sunulacak tahminler — kesin değil.
 */
export function parseInvoiceOcr(blocks: string[]): ParsedInvoiceFields {
  const { text, lines } = joinOcr(blocks);
  const result: ParsedInvoiceFields = {
    lines: [],
    rawText: text,
    ocrLines: lines,
  };

  const docMatch = text.match(DOC_NO_RE) || text.match(ALT_DOC_NO_RE);
  if (docMatch?.[1]) {
    result.documentNo = docMatch[1].trim();
  }

  const partyMatch = text.match(PARTY_RE);
  if (partyMatch?.[1]) {
    result.partyName = partyMatch[1].replace(/\s{2,}/g, ' ').trim().slice(0, 80);
  }

  const totalMatch = text.match(TOTAL_RE);
  if (totalMatch?.[1]) {
    result.totalAmount = parseTrAmount(totalMatch[1]);
  }
  // Yedek: metindeki en büyük sayısal tutarı genelde toplam say
  if (result.totalAmount == null) {
    const amounts = [...text.matchAll(/([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g)]
      .map((m) => parseTrAmount(m[1]))
      .filter((n): n is number => n != null && n >= 1);
    if (amounts.length) {
      result.totalAmount = Math.max(...amounts);
    }
  }

  const vatMatch = text.match(VAT_RE);
  if (vatMatch?.[1]) {
    const v = Number(vatMatch[1]);
    if (Number.isFinite(v) && v >= 0 && v <= 100) result.vatRate = v;
  }

  const parsedLines: ParsedInvoiceLine[] = [];
  for (const line of lines) {
    const p = tryParseLine(line);
    if (p) parsedLines.push(p);
  }
  // En fazla 12 öneri
  result.lines = parsedLines.slice(0, 12);

  return result;
}
