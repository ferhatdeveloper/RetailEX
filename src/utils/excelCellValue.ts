/**
 * Excel / CSV hücre değeri.
 *
 * Türkçe "75.000" metin olarak yazılırsa İngilizce Excel bunu 75 okur.
 * Tutar hücresi gerçek sayıdır. Başlık ve metin kolonları metin kalır.
 * "25.000 IQD (A)" tutarı 25000 sayıdır; (A) / (B) biçim son eki olarak durur, yutulmaz.
 * Tarih (26.10.2026) sayıya çevrilmez.
 */

export type ExcelDirection = 'A' | 'B';

export type ExcelNumberCell = {
  __excelNumber: true;
  value: number;
  direction?: ExcelDirection;
};

export type PreparedExcelCell = {
  value: unknown;
  direction?: ExcelDirection;
};

const DATE_TEXT = /^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;
const TR_THOUSANDS = /^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/;
const TR_DECIMAL = /^-?\d+(,\d{1,2})$/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const LEADING_ZERO_CODE = /^0\d+$/;
const CURRENCY_WORD = /\b(IQD|USD|EUR|TRY|TL|GBP|IRR|AED|KWD|JPY)\b/gi;

const AMOUNT_HEADER =
  /(tutar|indirim|iskonto|prim|toplam|fiyat|bakiye|borc|borç|alacak|harcama|amount|price|total|balance|debt|credit|ciro|net|brut|brüt|masraf|gider|tahsil|miktar|adet|qty|quantity|gelen|giden|kumulatif|kümülatif|deger|değer|commission)/;

const IDENTIFIER_HEADER =
  /(tarih|^date$|uzman|fiş\s*no|fis\s*no|fatura\s*no|belge\s*no|invoice\s*no|telefon|phone|aciklama|açıklama|para\s*birimi|^birim$|durum|status|barkod)/;

const NAME_HEADER = /(musteri|müşteri|cari|tedarik|unvan|ünvan|adi|adı|^ad$|name|kod|personel|kasiyer)/;

function foldHeader(header: string): string {
  return header.trim().toLocaleLowerCase('tr-TR');
}

export function headerIsAmount(header: string): boolean {
  return AMOUNT_HEADER.test(foldHeader(header));
}

/** Cari, fiş no, uzman, tarih: sayıya çevrilmez. Tutar içeren başlık (Cari Bakiye) sayıdır. */
export function headerKeepsText(header: string): boolean {
  const folded = foldHeader(header);
  if (!folded) return true;
  if (IDENTIFIER_HEADER.test(folded)) return true;
  if (NAME_HEADER.test(folded) && !AMOUNT_HEADER.test(folded)) return true;
  return false;
}

export function readExcelNumberCell(value: unknown): { value: number; direction?: ExcelDirection } | null {
  if (!value || typeof value !== 'object') return null;
  const cell = value as ExcelNumberCell;
  if (cell.__excelNumber !== true || typeof cell.value !== 'number' || !Number.isFinite(cell.value)) return null;
  return { value: cell.value, direction: cell.direction };
}

export function excelNumberCell(value: number, direction?: ExcelDirection): ExcelNumberCell {
  return direction ? { __excelNumber: true, value, direction } : { __excelNumber: true, value };
}

function normalizeDirection(token: string | null | undefined): ExcelDirection | undefined {
  const mark = String(token ?? '').trim().toUpperCase();
  if (mark === 'A' || mark === '(A)') return 'A';
  if (mark === 'B' || mark === '(B)') return 'B';
  return undefined;
}

/**
 * Görünen tutar metnini sayıya çevirir.
 * Tarih, fiş kodu ve ad eşleşmez. Para birimi ve (A)/(B) sayıdan ayrılır.
 */
export function parseDisplayedAmount(raw: string): { amount: number; direction?: ExcelDirection } | null {
  let text = raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (DATE_TEXT.test(text) || ISO_DATE.test(text)) return null;

  let direction: ExcelDirection | undefined;
  const dir = text.match(/\(([ABab])\)\s*$/);
  if (dir) {
    direction = normalizeDirection(dir[1]);
    text = text.slice(0, dir.index).trim();
  }
  text = text.replace(CURRENCY_WORD, '').replace(/\s+/g, ' ').trim();
  if (!text || DATE_TEXT.test(text) || ISO_DATE.test(text)) return null;
  if (LEADING_ZERO_CODE.test(text)) return null;

  let amount: number | null = null;
  if (TR_THOUSANDS.test(text)) {
    amount = Number(text.replace(/\./g, '').replace(',', '.'));
  } else if (TR_DECIMAL.test(text)) {
    amount = Number(text.replace(',', '.'));
  } else if (PLAIN_NUMBER.test(text)) {
    amount = Number(text);
  }
  if (amount == null || !Number.isFinite(amount)) return null;
  return direction ? { amount, direction } : { amount };
}

export function prepareExcelCell(header: string, value: unknown): PreparedExcelCell {
  const marked = readExcelNumberCell(value);
  if (marked) return { value: marked.value, direction: marked.direction };
  if (typeof value === 'number' && Number.isFinite(value)) return { value };
  if (typeof value !== 'string') return { value: value ?? '' };
  const text = value.trim();
  if (!text) return { value: '' };
  if (headerKeepsText(header) || !headerIsAmount(header)) return { value: text };
  const parsed = parseDisplayedAmount(text);
  if (!parsed) return { value: text };
  return { value: parsed.amount, direction: parsed.direction };
}

/**
 * Tutar başlığında "75.000" → 75000. Metin ve tarih aynen kalır.
 * Yön varsa sayı hücresi döner; (A) kaybolmaz.
 */
export function excelAmountCellValue(header: string, value: unknown): unknown {
  const prepared = prepareExcelCell(header, value);
  if (typeof prepared.value === 'number' && prepared.direction) {
    return excelNumberCell(prepared.value, prepared.direction);
  }
  return prepared.value;
}

export function csvTextCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  const escaped = text.replace(/"/g, '""');
  // Baştaki sıfır ve ekran tarihi Excel'de sayıya veya başka güne dönmesin.
  if (LEADING_ZERO_CODE.test(text) || DATE_TEXT.test(text) || ISO_DATE.test(text)) {
    return `"=""${escaped}"""`;
  }
  if (/[";,\n\r]/.test(text)) return `"${escaped}"`;
  return text;
}

/** CSV hücresi. Tutar binlik noktasız sayıdır. Yön varsa "25000 (A)" olarak durur. */
export function csvCell(header: string, value: unknown): string {
  const prepared = prepareExcelCell(header, value);
  if (typeof prepared.value === 'number' && Number.isFinite(prepared.value)) {
    const digits = String(prepared.value);
    return prepared.direction ? `${digits} (${prepared.direction})` : digits;
  }
  return csvTextCell(prepared.value);
}

export function downloadCsvTable(fileName: string, headers: readonly string[], rows: unknown[][]): void {
  const lines = [headers.map((header) => csvTextCell(header)).join(';')];
  for (const row of rows) {
    lines.push(headers.map((header, index) => csvCell(header, row[index])).join(';'));
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsvRecords(
  fileName: string,
  headers: readonly string[],
  rows: Array<Record<string, unknown>>,
): void {
  downloadCsvTable(
    fileName,
    headers,
    rows.map((row) => headers.map((header) => row[header])),
  );
}
