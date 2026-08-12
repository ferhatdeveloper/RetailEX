import { isCapacitorNative } from './capacitorPlatform';
import { printHtmlInHiddenIframe } from './restaurantReceiptPrint';

const PRINT_HOST_ID = 'retailex-report-print-host';

/** Dar ekran veya native WebView — yazdırmadan önce önizleme göster. */
export function shouldPreviewReportPrint(isMobileViewport: boolean): boolean {
  return isMobileViewport || isCapacitorNative();
}

/**
 * Mobil WebView’da gizli iframe.print() çoğu zaman ana SPA sayfasını basar.
 * Rapor HTML’ini ana belgeye geçici kök olarak ekleyip yalnızca onu yazdırır.
 */
export function printHtmlInMainDocument(html: string): void {
  const prev = document.getElementById(PRINT_HOST_ID);
  if (prev) prev.remove();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const styleText = Array.from(doc.querySelectorAll('style'))
    .map((el) => el.textContent || '')
    .join('\n');
  const bodyHtml = doc.body?.innerHTML ?? '';

  const host = document.createElement('div');
  host.id = PRINT_HOST_ID;
  host.className = 'retailex-report-print-host';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = `<style>
@media screen {
  .retailex-report-print-host {
    position: fixed !important;
    left: -99999px !important;
    top: 0 !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
}
@media print {
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }
  body > *:not(.retailex-report-print-host) {
    visibility: hidden !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 0 !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    pointer-events: none !important;
  }
  .retailex-report-print-host {
    visibility: visible !important;
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    right: auto !important;
    bottom: auto !important;
    width: auto !important;
    height: auto !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    opacity: 1 !important;
    background: #fff !important;
    z-index: 2147483647 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .retailex-report-print-host,
  .retailex-report-print-host * {
    visibility: visible !important;
  }
}
${styleText}
</style><div class="retailex-report-print-body">${bodyHtml}</div>`;

  document.body.appendChild(host);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('afterprint', cleanup);
    try {
      host.remove();
    } catch {
      /* ignore */
    }
  };

  window.addEventListener('afterprint', cleanup);
  requestAnimationFrame(() => {
    try {
      window.focus();
      window.print();
    } catch {
      cleanup();
      return;
    }
    setTimeout(cleanup, 3000);
  });
}

/** Masaüstü: gizli iframe; mobil/native: ana belge kökü (yalnızca rapor). */
export async function printReportHtml(
  html: string,
  opts?: { preferMainDocument?: boolean }
): Promise<void> {
  if (opts?.preferMainDocument || isCapacitorNative()) {
    printHtmlInMainDocument(html);
    return;
  }
  await printHtmlInHiddenIframe(html);
}
