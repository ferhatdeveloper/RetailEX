/**
 * Cari (müşteri + tedarikçi) devir / açılış bakiyesi — Excel şablonu ve içe aktarma.
 *
 * Excel sütunları (ilk satır başlıktır):
 *   - "Hesap Kodu*" (zorunlu) — müşteri/tedarikçi kodu
 *   - "Hesap Adı" (opsiyonel) — doğrulama için; eşleşmezse uyarı verir
 *   - "Bakiye*" (zorunlu) — sayısal devir bakiyesi
 *   - "Yön" (opsiyonel) — "Borç"/"Alacak" veya "B"/"A"/"+"/"-" — boşsa bakiye işaretinden otomatik
 *
 * Sonuç: her satır için hesap kodu → cari.id çözümlemesi + sayı doğrulaması.
 * Yön mantığı (müşteri):
 *   - Borç  (bize borçlu) → net_amount pozitif
 *   - Alacak (bize alacaklı) → net_amount negatif
 * Tedarikçi:
 *   - Borç  (biz borçluyuz) → net_amount pozitif
 *   - Alacak → net_amount negatif
 */

import * as XLSX from 'xlsx';
import { parseDecimalStringForInput } from './numberFormatter';

export const CARI_DEVIR_EXCEL_SHEET = 'Cari Devir';

export const CARI_DEVIR_EXCEL_COLUMNS = {
  accountCode: 'Hesap Kodu*',
  accountName: 'Hesap Adı',
  balance: 'Bakiye*',
  direction: 'Yön',
} as const;

export type CariDevirExcelDirection = 'borc' | 'alacak';

export interface ParsedCariDevirExcelRow {
  /** Excel veri satırı (1 = başlık altı ilk satır) */
  excelRow: number;
  accountCode: string;
  accountName: string;
  /** Bakiye — yön çözümlemesi öncesi imzalı değer */
  signedBalance: number;
  /** Çözümlenen yön */
  direction: CariDevirExcelDirection;
  /** Mutlak tutar (0'dan büyük) */
  amount: number;
}

export interface ParsedCariDevirExcelFile {
  rows: ParsedCariDevirExcelRow[];
  errors: string[];
}

function isTauriExcelRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

function xlsxWriteOutputToBlobPart(buf: Uint8Array | ArrayBuffer | number[]): BlobPart {
  if (buf instanceof ArrayBuffer) return buf;
  if (buf instanceof Uint8Array) return buf as unknown as BlobPart;
  if (Array.isArray(buf)) return new Uint8Array(buf);
  return new Uint8Array(buf as ArrayLike<number>);
}

function triggerBrowserXlsxDownload(fileName: string, buf: Uint8Array | ArrayBuffer | number[]): void {
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

function pickAccountCode(row: Record<string, unknown>): string {
  const keys = [
    CARI_DEVIR_EXCEL_COLUMNS.accountCode,
    'Hesap Kodu',
    'Cari Kodu',
    'Müşteri Kodu',
    'Tedarikçi Kodu',
    'Code',
    'code',
    'account_code',
  ];
  for (const k of keys) {
    const v = strCell(row[k]);
    if (v) return v;
  }
  for (const rk of Object.keys(row)) {
    const norm = rk.replace(/\*/g, '').trim().toLowerCase();
    if (norm.includes('hesap kodu') || norm.includes('cari kodu') || norm.includes('müşteri kodu') || norm.includes('tedarikçi kodu')) {
      const v = strCell(row[rk]);
      if (v) return v;
    }
  }
  return '';
}

function pickAccountName(row: Record<string, unknown>): string {
  const keys = [
    CARI_DEVIR_EXCEL_COLUMNS.accountName,
    'Hesap Adı',
    'Cari Adı',
    'Müşteri Adı',
    'Tedarikçi Adı',
    'Ünvan',
    'Unvan',
    'Name',
  ];
  for (const k of keys) {
    const v = strCell(row[k]);
    if (v) return v;
  }
  return '';
}

function pickBalance(row: Record<string, unknown>): number {
  const keys = [
    CARI_DEVIR_EXCEL_COLUMNS.balance,
    'Bakiye',
    'Devir',
    'Devir Bakiyesi',
    'Açılış Bakiyesi',
    'Balance',
  ];
  for (const k of keys) {
    const n = numCell(row[k]);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function pickDirection(row: Record<string, unknown>): string {
  const keys = [
    CARI_DEVIR_EXCEL_COLUMNS.direction,
    'Yön',
    'Direction',
    'Borç/Alacak',
    'B/A',
  ];
  for (const k of keys) {
    const v = strCell(row[k]);
    if (v) return v;
  }
  return '';
}

function parseDirection(raw: string, signedBalance: number): CariDevirExcelDirection | null {
  const norm = raw
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace('ı', 'i');
  if (['borc', 'borç', 'b', '+', 'pozitif', 'positive', 'debt'].includes(norm)) {
    return 'borc';
  }
  if (['alacak', 'a', '-', 'negatif', 'negative', 'credit'].includes(norm)) {
    return 'alacak';
  }
  // İşaret yoksa bakiye işaretinden otomatik
  if (!raw.trim()) {
    if (signedBalance < 0) return 'alacak';
    if (signedBalance > 0) return 'borc';
  }
  return null;
}

/**
 * İlk uygun sayfayı okur: adı "Cari Devir" ise onu, değilse ilk sayfayı.
 */
export function parseCariDevirExcelWorkbook(wb: XLSX.WorkBook): ParsedCariDevirExcelFile {
  const errors: string[] = [];
  const name =
    wb.SheetNames.find((n) => n === CARI_DEVIR_EXCEL_SHEET) || wb.SheetNames[0] || '';
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
  const rows: ParsedCariDevirExcelRow[] = [];
  rawRows.forEach((row, idx) => {
    const excelRow = idx + 2;
    const accountCode = pickAccountCode(row);
    const accountName = pickAccountName(row);
    const signedBalance = pickBalance(row);
    const directionRaw = pickDirection(row);

    if (!accountCode) return;

    if (!Number.isFinite(signedBalance)) {
      errors.push(`Satır ${excelRow} — "${accountCode}": Bakiye sütunu geçersiz veya boş.`);
      return;
    }

    const direction = parseDirection(directionRaw, signedBalance);
    if (!direction) {
      errors.push(
        `Satır ${excelRow} — "${accountCode}": Yön sütunu geçersiz "${directionRaw || '(boş)'}" (Borç/Alacak veya B/A olmalı).`,
      );
      return;
    }

    const amount = Math.abs(signedBalance);
    if (amount === 0) {
      // Sıfır bakiye → atla (devir yok)
      return;
    }

    rows.push({
      excelRow,
      accountCode,
      accountName,
      signedBalance,
      direction,
      amount,
    });
  });
  return { rows, errors };
}

export function parseCariDevirExcelArrayBuffer(buf: ArrayBuffer): ParsedCariDevirExcelFile {
  const wb = XLSX.read(buf, { type: 'array' });
  return parseCariDevirExcelWorkbook(wb);
}

const TEMPLATE_SAMPLE = [
  {
    [CARI_DEVIR_EXCEL_COLUMNS.accountCode]: 'CARI-001',
    [CARI_DEVIR_EXCEL_COLUMNS.accountName]: 'Örnek Müşteri A.Ş.',
    [CARI_DEVIR_EXCEL_COLUMNS.balance]: 1500,
    [CARI_DEVIR_EXCEL_COLUMNS.direction]: 'Borç',
  },
  {
    [CARI_DEVIR_EXCEL_COLUMNS.accountCode]: 'CARI-002',
    [CARI_DEVIR_EXCEL_COLUMNS.accountName]: 'Tedarikçi Ltd.',
    [CARI_DEVIR_EXCEL_COLUMNS.balance]: -800,
    [CARI_DEVIR_EXCEL_COLUMNS.direction]: 'Alacak',
  },
];

/** Şablon .xlsx indirir. Tauri'de kayıt diyalogu; tarayıcıda doğrudan indirme. */
export async function downloadCariDevirImportTemplate(): Promise<boolean> {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE);
  const keys = Object.keys(TEMPLATE_SAMPLE[0] ?? {});
  ws['!cols'] = keys.map((k) => ({ wch: Math.min(Math.max(k.length + 2, 14), 36) }));
  XLSX.utils.book_append_sheet(wb, ws, CARI_DEVIR_EXCEL_SHEET);
  const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as
    | Uint8Array
    | ArrayBuffer
    | number[];
  const fileName = `Cari_Devir_sablon_${new Date().toISOString().split('T')[0]}.xlsx`;

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
  await writeFile(savePath, outBuf as unknown as Uint8Array);
  return true;
}
