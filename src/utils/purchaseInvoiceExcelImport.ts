/**
 * Alış faturası kalem satırları — Excel şablonu ve içe aktarma.
 * Sütun başlıkları şablondaki ile aynı olmalı (ilk satır = başlık).
 */

import * as XLSX from 'xlsx';
import { parseDecimalStringForInput } from './numberFormatter';

export const PURCHASE_INVOICE_EXCEL_SHEET = 'Alış Kalemleri';

/** Şablonda ve içe aktarmada kullanılan sütun anahtarları (Türkçe, Excel ilk satır) */
export const PURCHASE_INVOICE_EXCEL_COLUMNS = {
  productKey: 'Ürün Kodu veya Barkod*',
  quantity: 'Miktar*',
  unitPrice: 'Birim Fiyat*',
  discountPercent: 'İskonto %',
  unit: 'Birim',
  lineNote: 'Satır Açıklaması',
} as const;

export interface ParsedPurchaseInvoiceExcelRow {
  /** Excel veri satırı (1 = başlık altı ilk satır) */
  excelRow: number;
  productKey: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  unitHint: string;
  lineNote: string;
}

function isTauriExcelRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

/** XLSX.write({ type: 'array' }) sürüme göre ArrayBuffer, Uint8Array veya number[] dönebilir */
function xlsxWriteOutputToBlobPart(buf: Uint8Array | ArrayBuffer | number[]): BlobPart {
  if (buf instanceof ArrayBuffer) return buf;
  if (buf instanceof Uint8Array) return buf;
  if (Array.isArray(buf)) return new Uint8Array(buf);
  return new Uint8Array(buf as ArrayLike<number>);
}

function triggerBrowserXlsxDownload(
  fileName: string,
  buf: Uint8Array | ArrayBuffer | number[]
): void {
  const blob = new Blob([xlsxWriteOutputToBlobPart(buf)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.replace(/[/\\?%*:|"<>]/g, '-');
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function strCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function numCell(v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).trim();
  if (!s) return NaN;
  const n = parseDecimalStringForInput(s);
  return Number.isFinite(n) ? n : NaN;
}

function pickProductKey(row: Record<string, unknown>): string {
  const keys = [
    PURCHASE_INVOICE_EXCEL_COLUMNS.productKey,
    'Ürün Kodu veya Barkod',
    'Ürün Kodu*',
    'Ürün Kodu',
    'Barkod',
    'SKU',
    'product_code',
  ];
  for (const k of keys) {
    const v = strCell(row[k]);
    if (v) return v;
  }
  for (const rk of Object.keys(row)) {
    const norm = rk.replace(/\*/g, '').trim().toLowerCase();
    if (norm.includes('barkod') || norm.includes('ürün kodu') || norm === 'sku') {
      const v = strCell(row[rk]);
      if (v) return v;
    }
  }
  return '';
}

function pickQuantity(row: Record<string, unknown>): number {
  const keys = [PURCHASE_INVOICE_EXCEL_COLUMNS.quantity, 'Miktar', 'Qty', 'Quantity'];
  for (const k of keys) {
    const n = numCell(row[k]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

function pickUnitPrice(row: Record<string, unknown>): number {
  const keys = [PURCHASE_INVOICE_EXCEL_COLUMNS.unitPrice, 'Birim Fiyat', 'Unit Price', 'Fiyat'];
  for (const k of keys) {
    const n = numCell(row[k]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return NaN;
}

function pickDiscount(row: Record<string, unknown>): number {
  const keys = [
    PURCHASE_INVOICE_EXCEL_COLUMNS.discountPercent,
    'İskonto (%)',
    'İskonto%',
    'Discount %',
    'Discount',
  ];
  for (const k of keys) {
    const n = numCell(row[k]);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

function pickUnitHint(row: Record<string, unknown>): string {
  const keys = [PURCHASE_INVOICE_EXCEL_COLUMNS.unit, 'Unit'];
  for (const k of keys) {
    const v = strCell(row[k]);
    if (v) return v;
  }
  return '';
}

function pickLineNote(row: Record<string, unknown>): string {
  const keys = [PURCHASE_INVOICE_EXCEL_COLUMNS.lineNote, 'Açıklama 2', 'Açıklama2'];
  for (const k of keys) {
    const v = strCell(row[k]);
    if (v) return v;
  }
  return '';
}

/** Hata mesajında göstermek için — ham hücre metni */
function rawCellFromKeys(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
      return String(row[k]).trim();
    }
  }
  return '';
}

/**
 * İlk uygun sayfayı okur: adı "Alış Kalemleri" ise onu, değilse ilk sayfayı.
 */
export function parsePurchaseInvoiceExcelWorkbook(wb: XLSX.WorkBook): {
  rows: ParsedPurchaseInvoiceExcelRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const name =
    wb.SheetNames.find((n) => n === PURCHASE_INVOICE_EXCEL_SHEET) || wb.SheetNames[0] || '';
  if (!name) {
    errors.push('Sayfa bulunamadı.');
    return { rows: [], errors };
  }
  const ws = wb.Sheets[name];
  if (!ws) {
    errors.push('Sayfa okunamadı.');
    return { rows: [], errors };
  }
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
  });
  const rows: ParsedPurchaseInvoiceExcelRow[] = [];
  rawRows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const productKey = pickProductKey(row);
    if (!productKey) return;
    const quantity = pickQuantity(row);
    const unitPrice = pickUnitPrice(row);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      const rawQ = rawCellFromKeys(row, [
        PURCHASE_INVOICE_EXCEL_COLUMNS.quantity,
        'Miktar',
        'Qty',
        'Quantity',
      ]);
      const qNote = rawQ ? `Miktar sütunu: "${rawQ}"` : 'Miktar sütunu boş veya okunamadı';
      errors.push(`Satır ${excelRow} — "${productKey}": Miktar geçersiz veya eksik (${qNote}).`);
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      const rawP = rawCellFromKeys(row, [
        PURCHASE_INVOICE_EXCEL_COLUMNS.unitPrice,
        'Birim Fiyat',
        'Unit Price',
        'Fiyat',
      ]);
      const pNote = rawP ? `Birim fiyat sütunu: "${rawP}"` : 'Birim fiyat sütunu boş veya okunamadı';
      errors.push(`Satır ${excelRow} — "${productKey}": Birim fiyat geçersiz veya eksik (${pNote}).`);
      return;
    }
    rows.push({
      excelRow,
      productKey,
      quantity,
      unitPrice,
      discountPercent: pickDiscount(row),
      unitHint: pickUnitHint(row),
      lineNote: pickLineNote(row),
    });
  });
  return { rows, errors };
}

export function parsePurchaseInvoiceExcelArrayBuffer(buf: ArrayBuffer): {
  rows: ParsedPurchaseInvoiceExcelRow[];
  errors: string[];
} {
  const wb = XLSX.read(buf, { type: 'array' });
  return parsePurchaseInvoiceExcelWorkbook(wb);
}

const TEMPLATE_SAMPLE = [
  {
    [PURCHASE_INVOICE_EXCEL_COLUMNS.productKey]: 'URN-001',
    [PURCHASE_INVOICE_EXCEL_COLUMNS.quantity]: 10,
    [PURCHASE_INVOICE_EXCEL_COLUMNS.unitPrice]: 25.5,
    [PURCHASE_INVOICE_EXCEL_COLUMNS.discountPercent]: 0,
    [PURCHASE_INVOICE_EXCEL_COLUMNS.unit]: '',
    [PURCHASE_INVOICE_EXCEL_COLUMNS.lineNote]: '',
  },
];

/** Şablon .xlsx indirir. Tauri’de kayıt diyalogu; tarayıcıda doğrudan indirme. @returns iptal=false */
export async function downloadPurchaseInvoiceImportTemplate(): Promise<boolean> {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE);
  const keys = Object.keys(TEMPLATE_SAMPLE[0] ?? {});
  ws['!cols'] = keys.map((k) => ({ wch: Math.min(Math.max(k.length + 2, 12), 40) }));
  XLSX.utils.book_append_sheet(wb, ws, PURCHASE_INVOICE_EXCEL_SHEET);
  const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as
    | Uint8Array
    | ArrayBuffer
    | number[];
  const fileName = `Alis_Fatura_Kalemleri_sablon_${new Date().toISOString().split('T')[0]}.xlsx`;

  if (!isTauriExcelRuntime()) {
    triggerBrowserXlsxDownload(fileName, outBuf);
    return true;
  }

  const [{ save }, { writeFile }] = await Promise.all([
    import('@tauri-apps/plugin-dialog'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const savePath = await save({
    defaultPath: fileName,
    filters: [{ name: 'Excel Dosyası', extensions: ['xlsx'] }],
  });
  if (!savePath) return false;
  await writeFile(savePath, outBuf);
  return true;
}
