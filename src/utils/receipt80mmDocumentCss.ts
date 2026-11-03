/**
 * 80 mm termal fiş — Edge/Chrome headless `--print-to-pdf` + Sumatra.
 *
 * Sayfa genişliği 80 mm, yükseklik içeriğe göre. Kenar boşluğu yok;
 * gövde dolgusu yaklaşık 2 mm. Uzun boş fiş üreten min-height yok.
 *
 * Logo üst sınırı tek kaynak: yaklaşık 32 mm (128 px). 36 mm'i geçmez.
 */
export const RECEIPT_80MM_LOGO_MAX_PX = 128;

/** Yazdırma HTML img style. Boşluksuz; RTL logoyu sola itmesin. */
export const RECEIPT_80MM_LOGO_IMG_INLINE_STYLE =
  `display:block;margin-left:auto;margin-right:auto;float:none;max-height:${RECEIPT_80MM_LOGO_MAX_PX}px;max-width:${RECEIPT_80MM_LOGO_MAX_PX}px;width:auto;height:auto;object-fit:contain`;

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
      padding: 2mm !important;
      box-sizing: border-box !important;
      overflow: visible !important;
      color: #000 !important;
      background: #fff !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      line-height: 1.2 !important;
    }
  }
  html, body {
    width: 80mm;
    max-width: 80mm;
    height: auto;
    min-height: 0;
    margin: 0 auto;
    padding: 2mm;
    box-sizing: border-box;
    color: #000;
    background: #fff;
    font-family: 'Courier New', Courier, monospace;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.2;
    -webkit-font-smoothing: none;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: geometricPrecision;
  }
  .rx-firm-header,
  .rx-firm-logo {
    display: block;
    width: 100%;
    max-width: 100%;
    float: none;
    text-align: center;
  }
  .rx-firm-logo {
    direction: ltr;
  }
  .rx-firm-name {
    display: block;
    width: 100%;
    max-width: 100%;
    float: none;
    color: #000;
    font-weight: 600;
    font-size: 14px;
    text-align: center;
    line-height: 1.15;
  }
  .rx-firm-logo img {
    display: block;
    margin-left: auto;
    margin-right: auto;
    float: none;
    max-height: ${RECEIPT_80MM_LOGO_MAX_PX}px;
    max-width: ${RECEIPT_80MM_LOGO_MAX_PX}px;
    width: auto;
    height: auto;
    object-fit: contain;
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
    padding: 0 !important;
    box-sizing: border-box !important;
    page-break-after: avoid;
    break-after: avoid;
    transform: none !important;
    color: #000 !important;
    font-size: 13px !important;
    font-weight: 500 !important;
    line-height: 1.2 !important;
  }
  .rx-slip, .rx-slip * {
    color: #000 !important;
    font-size: 13px !important;
    line-height: 1.2 !important;
    font-weight: 500 !important;
  }
  .rx-slip .rx-firm-name {
    font-size: 14px !important;
    font-weight: 600 !important;
    color: #000 !important;
  }
  .rx-slip .rx-total,
  .rx-slip .rx-total *,
  .rx-slip [data-section="totals"],
  .rx-slip [data-section="totals"] *,
  .rx-slip [data-section="footer"],
  .rx-slip [data-section="footer"] * {
    font-weight: 600 !important;
    color: #000 !important;
  }
  .rx-slip .rx-firm-logo img {
    display: block !important;
    margin-left: auto !important;
    margin-right: auto !important;
    float: none !important;
    max-height: ${RECEIPT_80MM_LOGO_MAX_PX}px !important;
    max-width: ${RECEIPT_80MM_LOGO_MAX_PX}px !important;
    width: auto !important;
    height: auto !important;
  }
  .rx-slip > div {
    margin-top: 2px !important;
    margin-bottom: 2px !important;
  }
  .rx-slip [data-section="header"] {
    padding-bottom: 2px !important;
    margin-bottom: 2px !important;
  }
  .rx-slip [data-section="footer"] {
    margin-top: 2px !important;
    padding-top: 2px !important;
    font-weight: 600 !important;
  }
  .rx-slip table {
    width: 100% !important;
    max-width: 100% !important;
    table-layout: fixed !important;
    border-collapse: collapse !important;
    margin-top: 0 !important;
    margin-bottom: 2px !important;
  }
  .rx-slip td, .rx-slip th {
    padding-top: 1px !important;
    padding-bottom: 1px !important;
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
  .rx-slip .rx-firm-header,
  .rx-slip .rx-firm-logo,
  .rx-slip .rx-firm-name,
  .rx-slip [data-section="header"] {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    float: none !important;
    text-align: center !important;
  }
  .rx-slip .rx-firm-logo {
    direction: ltr !important;
  }
  .rx-slip .rx-firm-logo img {
    display: block !important;
    margin-left: auto !important;
    margin-right: auto !important;
    float: none !important;
    max-height: ${RECEIPT_80MM_LOGO_MAX_PX}px !important;
    max-width: ${RECEIPT_80MM_LOGO_MAX_PX}px !important;
  }
  .rx-slip .justify-between { justify-content: space-between !important; }
  .text-center { text-align: center; }
  .text-right, .text-end { text-align: right; }
  .text-left, .text-start { text-align: left; }
  .w-full { width: 100%; }
  .table-fixed { table-layout: fixed; }
  .font-bold, .font-extrabold, .font-black, .font-semibold { font-weight: 600; }
`.trim();
