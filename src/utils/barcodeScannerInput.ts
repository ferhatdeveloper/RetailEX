/** USB barkod okuyucu: Enter gelmese bile otomatik arama için debounce (ms). */
export const BARCODE_SCANNER_DEBOUNCE_MS = 45;

/** Tamamlanmış sayısal barkod uzunlukları (EAN-13, 10+ ağırlık tartı vb.). */
const AUTO_SUBMIT_LENGTHS = new Set([8, 11, 12, 13, 14, 15, 16, 18]);

/** Okuyucu girişi bittiğinde otomatik gönderim yapılabilir mi? */
export function isBarcodeReadyForAutoSubmit(value: string): boolean {
  const trimmed = String(value ?? '').trim().replace(/\s/g, '');
  if (!/^\d+$/.test(trimmed)) return false;
  if (AUTO_SUBMIT_LENGTHS.has(trimmed.length)) return true;
  return trimmed.length >= 11 && trimmed.length <= 16;
}
