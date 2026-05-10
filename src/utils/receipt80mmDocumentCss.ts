/**
 * 80 mm termal fiş — Edge/Chrome headless `--print-to-pdf` + Sumatra.
 *
 * `html/body` 80mm ile kilitli; headless pencere 302px ile uyumlu (≈80mm @96dpi).
 * `@page size: 80mm` PDF sayfa genişliğini termale yaklaştırır.
 */
export const RECEIPT_80MM_VIEWPORT_FOR_HEADLESS =
  '<meta name="viewport" content="width=302, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no">';

export const RECEIPT_80MM_DOCUMENT_CSS = `
  @page { size: 80mm auto; margin: 0; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
    html, body {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }
  }
  html, body {
    width: 80mm;
    max-width: 80mm;
    margin: 0 auto;
    padding: 0;
    box-sizing: border-box;
  }
`.trim();
