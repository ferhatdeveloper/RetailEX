/**
 * Tauri `print_html_silent` için Windows yazıcı adı.
 * `retailos-printer-settings` JSON içinde `windowsPrinterName` veya `defaultPrinterName` (opsiyonel).
 * Boşsa Rust tarafı Get-Printer ile varsayılan yazıcı adını çözümler.
 */
export function getStoredWindowsPrinterNameForPrint(): string | null {
  try {
    const raw = localStorage.getItem('retailos-printer-settings');
    if (!raw) return null;
    const j = JSON.parse(raw) as Record<string, unknown>;
    const n = j.windowsPrinterName ?? j.defaultPrinterName;
    if (typeof n === 'string' && n.trim()) return n.trim();
  } catch {
    /* ignore */
  }
  return null;
}

/** Restoran «Sistem Yazıcısı» kaydında seçilen Windows adını fiş (Tauri) ile paylaşır; mevcut JSON ile birleştirir. */
export function mergeWindowsPrinterNameIntoLocalStorage(printerName: string | undefined): void {
  const t = printerName?.trim();
  if (!t) return;
  try {
    const key = 'retailos-printer-settings';
    const prev = localStorage.getItem(key);
    const base: Record<string, unknown> = prev ? (JSON.parse(prev) as Record<string, unknown>) : {};
    base.windowsPrinterName = t;
    localStorage.setItem(key, JSON.stringify(base));
  } catch {
    /* ignore */
  }
}
