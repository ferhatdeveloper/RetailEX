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
      width: 80mm !important;
      max-width: 80mm !important;
      min-width: 0 !important;
      height: auto !important;
      min-height: 0 !important;
      margin: 0 auto !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      overflow: visible !important;
    }
  }
  html, body {
    width: 80mm;
    max-width: 80mm;
    height: auto;
    min-height: 0;
    margin: 0 auto;
    padding: 0;
    box-sizing: border-box;
    color: #000;
    font-weight: 800;
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: geometricPrecision;
    -webkit-text-stroke: 0.25px #000;
  }
`.trim();

/** Termal fiş gövdesi: dar, ortalı, satır tutarları sağa yaslı. Tailwind’siz yazdırmada da durur. */
export const RECEIPT_80MM_SLIP_CSS = `
  .rx-slip, .rx-slip .receipt-80mm, .rx-slip #receipt-content {
    width: 72mm !important;
    max-width: 72mm !important;
    margin-left: auto !important;
    margin-right: auto !important;
    height: auto !important;
    min-height: 0 !important;
    box-sizing: border-box !important;
    page-break-after: avoid;
    break-after: avoid;
    transform: none !important;
  }
  .rx-slip table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
  }
  .rx-slip [data-section="header"],
  .rx-slip [data-section="header"] div,
  .rx-slip [data-section="footer"],
  .rx-slip [data-section="footer"] * {
    text-align: center !important;
  }
  .rx-slip table th:first-child,
  .rx-slip table td:first-child {
    text-align: start !important;
  }
  .rx-slip table th:last-child,
  .rx-slip table td:last-child {
    text-align: end !important;
  }
  .rx-slip table th:nth-child(2):not(:last-child),
  .rx-slip table td:nth-child(2):not(:last-child) {
    text-align: center !important;
  }
  .rx-slip .flex { display: flex !important; }
  .rx-slip .justify-between { justify-content: space-between !important; }
  .text-center { text-align: center; }
  .text-right, .text-end { text-align: right; }
  .text-left, .text-start { text-align: left; }
  .w-full { width: 100%; }
  .table-fixed { table-layout: fixed; }
  .font-bold, .font-extrabold, .font-black { font-weight: 800; }
`.trim();
