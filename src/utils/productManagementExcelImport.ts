/**
 * Malzeme / Ürün Yönetimi Excel içe aktarımı.
 *
 * Dışa Aktar dosyasının kolon başlıkları (ızgara etiketlerinin büyük harfi)
 * ve ürün şablonundaki Türkçe / İngilizce başlıklar aynı ürün kartı alanlarına
 * yazılır. Alış/satış toplamı ve ortalamalar fiş toplamıdır; kart fiyatına yazılmaz.
 * Stok, ürün kartındaki eldeki miktardır; fiş veya defter hareketi açılmaz.
 */
import * as XLSX from 'xlsx';

export const PRODUCT_EXCEL_FILE_ACCEPT =
  '.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type ProductExcelImportError = { row: number; message: string };

export type ProductExcelWriteValues = {
  category?: string;
  unit?: string;
  price?: number;
  cost?: number;
  stock?: number;
  specialCode1?: string;
  specialCode2?: string;
  specialCode3?: string;
  specialCode4?: string;
  specialCode5?: string;
  specialCode6?: string;
  brand?: string;
  groupCode?: string;
  subGroupCode?: string;
  minStock?: number;
  maxStock?: number;
  criticalStock?: number;
  taxRate?: number;
  salePriceUSD?: number;
  purchasePriceUSD?: number;
  salePriceEUR?: number;
  purchasePriceEUR?: number;
  currency?: string;
  name2?: string;
  description?: string;
  description_tr?: string;
  description_en?: string;
  description_ar?: string;
  description_ku?: string;
  model?: string;
  manufacturer?: string;
  supplier?: string;
  origin?: string;
  materialType?: string;
  priceList1?: number;
  priceList2?: number;
  priceList3?: number;
  priceList4?: number;
  priceList5?: number;
  priceList6?: number;
  isActive?: boolean;
  hasVariants?: boolean;
  isScaleProduct?: boolean;
  followUpReminderDays?: number;
};

export type ProductExcelDraft = {
  excelRow: number;
  code: string;
  name: string;
  barcode: string;
  values: ProductExcelWriteValues;
};

export type ProductExcelParseResult = {
  drafts: ProductExcelDraft[];
  errors: ProductExcelImportError[];
  skipped: number;
  fileError?: string;
};

export type ProductExcelIdentity = { id: string; barcode?: string | null; code?: string | null };

export type ProductExcelApi = {
  getByCode: (code: string) => Promise<ProductExcelIdentity | null>;
  getByBarcode: (barcode: string) => Promise<ProductExcelIdentity | null>;
  create: (payload: Record<string, unknown>) => Promise<unknown>;
  update: (id: string, payload: Record<string, unknown>) => Promise<unknown>;
};

export type ProductExcelImportOutcome = {
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  errors: ProductExcelImportError[];
  fileError?: string;
};

type FieldKey = 'code' | 'name' | 'barcode' | keyof ProductExcelWriteValues;

const FIELD_ALIASES: Record<FieldKey, string[]> = {
  code: ['URUN KODU', 'PRODUCT CODE', 'ITEM CODE', 'STOK KODU', 'MALZEME KODU', 'SKU', 'CODE'],
  name: ['URUN ADI', 'PRODUCT NAME', 'MALZEME ADI', 'ITEM NAME', 'NAME'],
  barcode: ['BARKOD', 'BARCODE', 'BARKOD NO', 'BARCODE NO'],
  category: ['KATEGORI', 'CATEGORY'],
  unit: ['BIRIM', 'UNIT'],
  price: ['SATIS FIYATI', 'SALE PRICE', 'SELLING PRICE', 'BIRIM FIYAT', 'UNIT PRICE', 'PRICE'],
  cost: ['ALIS FIYATI', 'PURCHASE PRICE', 'BUY PRICE', 'COST', 'MALIYET'],
  stock: ['MEVCUT STOK', 'CURRENT STOCK', 'ON HAND', 'STOK', 'STOCK', 'QUANTITY', 'QTY'],
  specialCode1: ['OZEL KOD 1', 'SPECIAL CODE 1'],
  specialCode2: ['OZEL KOD 2', 'SPECIAL CODE 2'],
  specialCode3: ['OZEL KOD 3', 'SPECIAL CODE 3'],
  specialCode4: ['OZEL KOD 4', 'SPECIAL CODE 4'],
  specialCode5: ['OZEL KOD 5', 'SPECIAL CODE 5'],
  specialCode6: ['OZEL KOD 6', 'SPECIAL CODE 6'],
  brand: ['MARKA', 'BRAND'],
  groupCode: ['GRUP KODU', 'GROUP CODE'],
  subGroupCode: ['ALT GRUP', 'ALT GRUP KODU', 'SUB GROUP', 'SUBGROUP'],
  minStock: ['MIN STOK', 'MINIMUM STOCK', 'MIN STOCK'],
  maxStock: ['MAX STOK', 'MAXIMUM STOCK', 'MAX STOCK'],
  criticalStock: ['KRITIK STOK', 'CRITICAL STOCK'],
  taxRate: ['KDV ORANI (%)', 'KDV ORANI', 'KDV (%)', 'KDV', 'VAT RATE', 'TAX RATE', 'VAT'],
  salePriceUSD: ['FIYAT (USD)', 'SATIS FIYATI (USD)', 'SALE PRICE USD', 'PRICE USD'],
  purchasePriceUSD: ['ALIS (USD)', 'ALIS FIYATI (USD)', 'PURCHASE PRICE USD', 'PURCHASE USD'],
  salePriceEUR: ['FIYAT (EUR)', 'SATIS FIYATI (EUR)', 'SALE PRICE EUR', 'PRICE EUR'],
  purchasePriceEUR: ['ALIS (EUR)', 'ALIS FIYATI (EUR)', 'PURCHASE PRICE EUR', 'PURCHASE EUR'],
  currency: ['PARA BIRIMI', 'CURRENCY'],
  name2: ['AD 2', 'NAME 2', 'URUN ADI 2'],
  description: ['ACIKLAMA', 'DESCRIPTION'],
  description_tr: ['ACIKLAMA (TR)', 'DESCRIPTION (TR)'],
  description_en: ['ACIKLAMA (EN)', 'DESCRIPTION (EN)'],
  description_ar: ['ACIKLAMA (AR)', 'DESCRIPTION (AR)'],
  description_ku: ['ACIKLAMA (KU)', 'DESCRIPTION (KU)'],
  model: ['MODEL'],
  manufacturer: ['URETICI', 'MANUFACTURER'],
  supplier: ['TEDARIKCI', 'SUPPLIER'],
  origin: ['MENSEI', 'ORIGIN'],
  materialType: ['MALZEME TURU', 'MATERIAL TYPE'],
  priceList1: ['FIYAT LISTESI 1', 'PRICE LIST 1'],
  priceList2: ['FIYAT LISTESI 2', 'PRICE LIST 2'],
  priceList3: ['FIYAT LISTESI 3', 'PRICE LIST 3'],
  priceList4: ['FIYAT LISTESI 4', 'PRICE LIST 4'],
  priceList5: ['FIYAT LISTESI 5', 'PRICE LIST 5'],
  priceList6: ['FIYAT LISTESI 6', 'PRICE LIST 6'],
  isActive: ['AKTIF (E/H)', 'AKTIF', 'ACTIVE'],
  hasVariants: ['VARYANTLI', 'HAS VARIANTS'],
  isScaleProduct: ['TARTILI URUN', 'SCALE PRODUCT'],
  followUpReminderDays: ['TAKIP GUNU', 'FOLLOW UP DAYS'],
};

const NUMERIC_FIELDS = new Set<FieldKey>([
  'price',
  'cost',
  'stock',
  'minStock',
  'maxStock',
  'criticalStock',
  'taxRate',
  'salePriceUSD',
  'purchasePriceUSD',
  'salePriceEUR',
  'purchasePriceEUR',
  'priceList1',
  'priceList2',
  'priceList3',
  'priceList4',
  'priceList5',
  'priceList6',
  'followUpReminderDays',
]);

const BOOL_FIELDS = new Set<FieldKey>(['isActive', 'hasVariants', 'isScaleProduct']);

const NON_NEGATIVE_FIELDS = new Set<FieldKey>([
  'price',
  'cost',
  'stock',
  'minStock',
  'maxStock',
  'criticalStock',
  'salePriceUSD',
  'purchasePriceUSD',
  'salePriceEUR',
  'purchasePriceEUR',
  'priceList1',
  'priceList2',
  'priceList3',
  'priceList4',
  'priceList5',
  'priceList6',
  'taxRate',
  'followUpReminderDays',
]);

const FIELD_LABEL: Partial<Record<FieldKey, string>> = {
  price: 'Birim fiyat',
  cost: 'Alış fiyatı',
  stock: 'Stok',
  minStock: 'Min stok',
  maxStock: 'Max stok',
  criticalStock: 'Kritik stok',
  taxRate: 'KDV',
  salePriceUSD: 'Fiyat (USD)',
  purchasePriceUSD: 'Alış (USD)',
  salePriceEUR: 'Fiyat (EUR)',
  purchasePriceEUR: 'Alış (EUR)',
};

/** Başlık eşlemesi. Ürün adı ve açıklama metnine uygulanmaz. */
export function foldProductExcelHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\*+\s*$/u, '')
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C');
}

function expandScientificDigits(input: string): string {
  const s = input.trim().replace(/\s/g, '');
  const match = s.match(/^([+-]?\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
  if (!match) return input.trim();
  let mantissa = match[1];
  const exponent = Number.parseInt(match[2], 10);
  if (!Number.isFinite(exponent)) return input.trim();
  const negative = mantissa.startsWith('-');
  mantissa = mantissa.replace(/^[+-]/, '');
  const [intPartRaw, decPartRaw = ''] = mantissa.split('.');
  const digits = `${intPartRaw}${decPartRaw}`;
  const decimalIndex = intPartRaw.length + exponent;
  let plain: string;
  if (decimalIndex <= 0) {
    plain = `0.${'0'.repeat(Math.abs(decimalIndex))}${digits}`;
  } else if (decimalIndex >= digits.length) {
    plain = `${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  } else {
    plain = `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  }
  const cleaned = plain.replace(/^0+(?=\d)/, '').replace(/\.0+$/, '').replace(/\.$/, '');
  if (!cleaned) return '0';
  return negative ? `-${cleaned}` : cleaned;
}

export function excelBarcodeText(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isSafeInteger(value)) return String(value);
    return expandScientificDigits(String(value));
  }
  let text = String(value).replace(/\uFEFF/g, '').trim();
  if (/[eE][+-]?\d+$/.test(text.replace(/\s/g, ''))) {
    text = expandScientificDigits(text);
  }
  if (/^\d+\.0+$/.test(text)) return text.replace(/\.0+$/, '');
  return text;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.replace(/\uFEFF/g, '').trim();
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isSafeInteger(value)) return String(value);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return '';
  return String(value).trim();
}

/** TR (1.250,50 / 5.000) ve EN (1,250.50) sayı. Boş hücre NaN değildir; çağıran ayırır. */
export function parseProductExcelNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let s = String(value ?? '')
    .trim()
    .replace(/\u00A0/g, '')
    .replace(/\s/g, '');
  if (!s) return Number.NaN;
  s = s.replace(/[^\d,.\-]/g, '');
  if (!s || s === '-' || s === ',' || s === '.') return Number.NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalAt = Math.max(lastComma, lastDot);
    const thousands = decimalAt === lastComma ? '.' : ',';
    const intPart = s.slice(0, decimalAt).split(thousands).join('').replace(/[.,]/g, '');
    const decPart = s.slice(decimalAt + 1).replace(/[^\d]/g, '');
    return Number(`${intPart || '0'}.${decPart}`);
  }
  if (lastComma >= 0) {
    const parts = s.split(',');
    if (parts.length > 1 && parts.slice(1).every((part) => /^\d{3}$/.test(part))) {
      return Number(parts.join(''));
    }
    const intPart = s.slice(0, lastComma).replace(/\./g, '');
    const decPart = s.slice(lastComma + 1).replace(/[^\d]/g, '');
    return Number(`${intPart || '0'}.${decPart}`);
  }
  if (lastDot >= 0) {
    const parts = s.split('.');
    const last = parts[parts.length - 1] ?? '';
    if (parts.length === 2 && (last.length <= 2 || parts[0] === '0')) return Number(s);
    if (/^\d{3}$/.test(last) && parts.length >= 2) return Number(s.replace(/\./g, ''));
    return Number(s);
  }
  return Number(s);
}

function isBlankCell(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'number') return false;
  if (typeof value === 'boolean') return false;
  const text = cellText(value);
  return text === '' || text === '—' || text === '-';
}

function isFooterLabel(value: unknown): boolean {
  const folded = foldProductExcelHeader(value);
  if (!folded) return false;
  return folded === 'TOPLAM' || folded.startsWith('TOPLAM ') || folded.startsWith('TOPLAM(')
    || folded === 'TOTAL' || folded.startsWith('TOTAL ') || folded.startsWith('TOTAL(');
}

function findAliasColumn(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseBool(value: unknown): boolean | undefined {
  const folded = foldProductExcelHeader(value);
  if (!folded) return undefined;
  if (folded === 'E' || folded === 'EVET' || folded === 'TRUE' || folded === '1' || folded === 'YES' || folded === 'Y') {
    return true;
  }
  if (folded === 'H' || folded === 'HAYIR' || folded === 'FALSE' || folded === '0' || folded === 'NO' || folded === 'N') {
    return false;
  }
  return undefined;
}

function findHeaderRow(matrix: unknown[][]): number {
  const limit = Math.min(matrix.length, 8);
  for (let i = 0; i < limit; i += 1) {
    const folded = (matrix[i] ?? []).map((cell) => foldProductExcelHeader(cell));
    if (findAliasColumn(folded, FIELD_ALIASES.code) >= 0 && findAliasColumn(folded, FIELD_ALIASES.name) >= 0) {
      return i;
    }
  }
  return -1;
}

export function parseProductExcelMatrix(matrix: unknown[][]): ProductExcelParseResult {
  const errors: ProductExcelImportError[] = [];
  const drafts: ProductExcelDraft[] = [];
  let skipped = 0;

  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { drafts, errors, skipped, fileError: 'Dosyada aktarılacak satır yok.' };
  }

  const headerRowIndex = findHeaderRow(matrix);
  if (headerRowIndex < 0) {
    return {
      drafts,
      errors,
      skipped,
      fileError: 'Ürün Kodu ve Ürün Adı kolonları bulunamadı. Dışa Aktar dosyası veya ürün şablonunu kullanın.',
    };
  }

  const foldedHeaders = (matrix[headerRowIndex] ?? []).map((cell) => foldProductExcelHeader(cell));
  const columnOf = new Map<FieldKey, number>();
  (Object.keys(FIELD_ALIASES) as FieldKey[]).forEach((field) => {
    const idx = findAliasColumn(foldedHeaders, FIELD_ALIASES[field]);
    if (idx >= 0) columnOf.set(field, idx);
  });

  for (let r = headerRowIndex + 1; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    const excelRow = r + 1;
    const cells = row as unknown[];
    if (cells.every((cell) => isBlankCell(cell))) {
      skipped += 1;
      continue;
    }
    if (cells.some((cell) => isFooterLabel(cell))) {
      skipped += 1;
      continue;
    }

    const code = cellText(cells[columnOf.get('code') ?? -1]).trim();
    const name = cellText(cells[columnOf.get('name') ?? -1]).trim();
    if (!code || !name) {
      if (!code && !name) {
        errors.push({ row: excelRow, message: 'Ürün Kodu ve Ürün Adı zorunludur.' });
      } else if (!code) {
        errors.push({ row: excelRow, message: 'Ürün Kodu zorunludur.' });
      } else {
        errors.push({ row: excelRow, message: 'Ürün Adı zorunludur.' });
      }
      continue;
    }

    const values: ProductExcelWriteValues = {};
    const rowErrors: string[] = [];
    for (const [field, index] of columnOf) {
      if (field === 'code' || field === 'name' || field === 'barcode') continue;
      const raw = cells[index];
      if (isBlankCell(raw)) continue;
      if (NUMERIC_FIELDS.has(field)) {
        const parsed = typeof raw === 'number' && Number.isFinite(raw) ? raw : parseProductExcelNumber(raw);
        if (!Number.isFinite(parsed)) {
          rowErrors.push(`${FIELD_LABEL[field] ?? field} okunamadı: "${cellText(raw)}"`);
          continue;
        }
        if (NON_NEGATIVE_FIELDS.has(field) && parsed < 0) {
          rowErrors.push(`${FIELD_LABEL[field] ?? field} negatif olamaz.`);
          continue;
        }
        (values as Record<string, number>)[field] = parsed;
        continue;
      }
      if (BOOL_FIELDS.has(field)) {
        const flag = parseBool(raw);
        if (flag === undefined) {
          rowErrors.push(`${field} değeri okunamadı: "${cellText(raw)}"`);
          continue;
        }
        (values as Record<string, boolean>)[field] = flag;
        continue;
      }
      const text = cellText(raw);
      if (!text) continue;
      (values as Record<string, string>)[field] = text;
    }

    if (rowErrors.length > 0) {
      errors.push({ row: excelRow, message: rowErrors.join(' ') });
      continue;
    }

    drafts.push({
      excelRow,
      code,
      name,
      barcode: excelBarcodeText(cells[columnOf.get('barcode') ?? -1]),
      values,
    });
  }

  if (drafts.length === 0 && errors.length === 0) {
    return { drafts, errors, skipped, fileError: 'Dosyada aktarılacak satır yok.' };
  }

  return { drafts, errors, skipped };
}

export function readProductExcelMatrix(data: ArrayBuffer | Uint8Array): unknown[][] {
  const workbook = XLSX.read(data, { type: 'array', cellDates: false });
  if (!workbook.SheetNames.length) {
    throw new Error('Excel dosyasında sayfa yok.');
  }
  const preferred = workbook.SheetNames.find((name) => {
    const folded = foldProductExcelHeader(name);
    return folded === 'VERI' || folded === 'URUNLER' || folded === 'PRODUCTS';
  });
  const sheetName = preferred ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Excel sayfası okunamadı.');
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
}

export function isProductExcelFileName(fileName: string): boolean {
  const name = fileName.trim().toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'Kayıt yazılamadı.';
}

function extractId(row: unknown): string {
  if (!row || typeof row !== 'object') return '';
  const id = (row as { id?: unknown }).id;
  return id == null ? '' : String(id).trim();
}

type Remembered = { id: string; barcode: string };

function createPayload(draft: ProductExcelDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    code: draft.code,
    name: draft.name,
    ...draft.values,
  };
  if (payload.stock === undefined) payload.stock = 0;
  if (draft.barcode) payload.barcode = draft.barcode;
  return payload;
}

function updatePayload(draft: ProductExcelDraft): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: draft.name,
    ...draft.values,
  };
  if (draft.barcode) payload.barcode = draft.barcode;
  return payload;
}

/**
 * Aynı ürün kodu güncellenir. Barkod başka karttaysa yalnız o satır hata alır.
 */
export async function applyProductExcelDrafts(
  drafts: ProductExcelDraft[],
  api: ProductExcelApi,
): Promise<Pick<ProductExcelImportOutcome, 'created' | 'updated' | 'failed' | 'errors'>> {
  const errors: ProductExcelImportError[] = [];
  let created = 0;
  let updated = 0;
  const byCode = new Map<string, Remembered>();
  const byBarcode = new Map<string, string>();

  const remember = (code: string, id: string, barcode: string) => {
    const previous = byCode.get(code);
    if (previous?.barcode && previous.barcode !== barcode && byBarcode.get(previous.barcode) === id) {
      byBarcode.delete(previous.barcode);
    }
    byCode.set(code, { id, barcode });
    if (barcode) byBarcode.set(barcode, id);
  };

  const lookupCode = async (code: string): Promise<Remembered | null> => {
    const local = byCode.get(code);
    if (local) return local;
    const found = await api.getByCode(code);
    if (!found?.id) return null;
    const ident = { id: String(found.id), barcode: String(found.barcode ?? '').trim() };
    remember(code, ident.id, ident.barcode);
    return ident;
  };

  const lookupBarcodeOwner = async (barcode: string): Promise<string | null> => {
    if (!barcode) return null;
    const local = byBarcode.get(barcode);
    if (local) return local;
    const found = await api.getByBarcode(barcode);
    if (!found?.id) return null;
    const id = String(found.id);
    byBarcode.set(barcode, id);
    return id;
  };

  for (const draft of drafts) {
    try {
      const existing = await lookupCode(draft.code);
      if (existing) {
        if (draft.barcode) {
          const ownerId = await lookupBarcodeOwner(draft.barcode);
          if (ownerId && ownerId !== existing.id) {
            errors.push({ row: draft.excelRow, message: `Barkod başka üründe var: ${draft.barcode}` });
            continue;
          }
        }
        const saved = await api.update(existing.id, updatePayload(draft));
        if (saved == null) {
          errors.push({ row: draft.excelRow, message: 'Ürün güncellenemedi.' });
          continue;
        }
        remember(draft.code, extractId(saved) || existing.id, draft.barcode || existing.barcode);
        updated += 1;
        continue;
      }

      if (draft.barcode) {
        const ownerId = await lookupBarcodeOwner(draft.barcode);
        if (ownerId) {
          errors.push({ row: draft.excelRow, message: `Barkod başka üründe var: ${draft.barcode}` });
          continue;
        }
      }

      const saved = await api.create(createPayload(draft));
      const id = extractId(saved);
      if (!id) {
        errors.push({ row: draft.excelRow, message: 'Ürün kaydedilemedi.' });
        continue;
      }
      remember(draft.code, id, draft.barcode);
      created += 1;
    } catch (error) {
      errors.push({ row: draft.excelRow, message: errorMessage(error) });
    }
  }

  return { created, updated, failed: errors.length, errors };
}

export async function importProductExcelBuffer(
  data: ArrayBuffer | Uint8Array,
  api: ProductExcelApi,
): Promise<ProductExcelImportOutcome> {
  let matrix: unknown[][];
  try {
    matrix = readProductExcelMatrix(data);
  } catch (error) {
    return {
      created: 0,
      updated: 0,
      failed: 1,
      skipped: 0,
      errors: [],
      fileError: errorMessage(error) || 'Excel dosyası okunamadı.',
    };
  }

  const parsed = parseProductExcelMatrix(matrix);
  if (parsed.fileError) {
    return {
      created: 0,
      updated: 0,
      failed: 0,
      skipped: parsed.skipped,
      errors: parsed.errors,
      fileError: parsed.fileError,
    };
  }

  const applied = parsed.drafts.length
    ? await applyProductExcelDrafts(parsed.drafts, api)
    : { created: 0, updated: 0, failed: 0, errors: [] as ProductExcelImportError[] };

  const errors = [...parsed.errors, ...applied.errors];
  return {
    created: applied.created,
    updated: applied.updated,
    failed: errors.length,
    skipped: parsed.skipped,
    errors,
  };
}

export function formatProductExcelImportSummary(outcome: Pick<ProductExcelImportOutcome, 'created' | 'updated' | 'failed'>): string {
  const counts = `${outcome.created} yeni, ${outcome.updated} güncellendi, ${outcome.failed} hatalı satır.`;
  if (outcome.created + outcome.updated === 0) return `Aktarılamadı: ${counts}`;
  return `İçe aktarıldı: ${counts}`;
}
