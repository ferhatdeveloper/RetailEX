/**
 * A4 satış fişi / fatura — ekran önizleme ve yazdırma stilleri.
 */
export const RECEIPT_A4_DOCUMENT_CSS = `
  @page { size: A4 portrait; margin: 12mm; }

  .rx-a4-doc {
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
    font-family: Inter, "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #0f172a;
    background: #ffffff;
    box-sizing: border-box;
  }

  .rx-a4-doc * { box-sizing: border-box; }

  .rx-a4-accent-bar {
    height: 4px;
    background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 55%, #60a5fa 100%);
    border-radius: 4px 4px 0 0;
    margin-bottom: 0;
  }

  .rx-a4-sheet {
    border: 1px solid #dbeafe;
    border-top: none;
    border-radius: 0 0 14px 14px;
    padding: 10mm 11mm 12mm;
    background: #fff;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  }

  .rx-a4-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 2px solid #1e3a8a;
    margin-bottom: 16px;
  }

  .rx-a4-brand {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    min-width: 0;
    flex: 1;
  }

  .rx-a4-logo {
    width: 72px;
    height: 72px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .rx-a4-company-name {
    font-size: 20pt;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
    line-height: 1.15;
    margin: 0 0 6px;
  }

  .rx-a4-company-meta {
    font-size: 9.5pt;
    color: #475569;
    line-height: 1.5;
  }

  .rx-a4-title-block {
    text-align: end;
    flex-shrink: 0;
  }

  .rx-a4-doc-title {
    font-size: 22pt;
    font-weight: 800;
    color: #1d4ed8;
    letter-spacing: 0.06em;
    margin: 0;
    line-height: 1.1;
  }

  .rx-a4-doc-subtitle {
    margin-top: 6px;
    font-size: 9pt;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .rx-a4-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 18px;
  }

  .rx-a4-info-card {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    background: #f8fafc;
  }

  .rx-a4-info-card h3 {
    margin: 0 0 8px;
    font-size: 8.5pt;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #1e40af;
  }

  .rx-a4-info-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 10pt;
    padding: 3px 0;
  }

  .rx-a4-info-row span:first-child {
    color: #64748b;
    font-weight: 600;
    flex-shrink: 0;
  }

  .rx-a4-info-row span:last-child {
    color: #0f172a;
    font-weight: 700;
    text-align: end;
    word-break: break-word;
  }

  .rx-a4-banner {
    border: 2px dashed #1d4ed8;
    border-radius: 8px;
    padding: 10px 12px;
    text-align: center;
    font-weight: 800;
    color: #1e3a8a;
    margin-bottom: 14px;
    background: #eff6ff;
  }

  .rx-a4-table-wrap {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  .rx-a4-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .rx-a4-table thead th {
    background: #1e3a8a;
    color: #fff;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 10px 8px;
    text-align: start;
  }

  .rx-a4-table thead th.rx-a4-num,
  .rx-a4-table thead th.rx-a4-qty,
  .rx-a4-table thead th.rx-a4-money {
    text-align: end;
  }

  .rx-a4-table tbody td {
    padding: 10px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
    font-size: 10pt;
  }

  .rx-a4-table tbody tr:nth-child(even) td {
    background: #f8fafc;
  }

  .rx-a4-table tbody tr:last-child td {
    border-bottom: none;
  }

  .rx-a4-item-name {
    font-weight: 700;
    color: #0f172a;
    word-break: break-word;
  }

  .rx-a4-item-sub {
    margin-top: 4px;
    font-size: 8.5pt;
    color: #64748b;
    font-weight: 600;
    line-height: 1.35;
  }

  .rx-a4-num { width: 5%; text-align: center; color: #64748b; font-weight: 700; }
  .rx-a4-code { width: 12%; font-family: ui-monospace, monospace; font-size: 8pt; color: #475569; word-break: break-all; }
  .rx-a4-desc { width: 29%; }
  .rx-a4-unit { width: 16%; text-align: end; font-variant-numeric: tabular-nums; }
  .rx-a4-qty { width: 10%; text-align: center; font-weight: 700; }
  .rx-a4-money { width: 18%; text-align: end; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .rx-a4-bottom {
    display: grid;
    grid-template-columns: 1fr 78mm;
    gap: 16px;
    align-items: start;
    margin-bottom: 18px;
  }

  .rx-a4-payments {
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 12px 14px;
    background: #fff;
  }

  .rx-a4-payments h3 {
    margin: 0 0 10px;
    font-size: 9pt;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #1e40af;
  }

  .rx-a4-pay-row {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 0;
    font-size: 10pt;
    border-bottom: 1px dashed #e2e8f0;
  }

  .rx-a4-pay-row:last-child { border-bottom: none; }

  .rx-a4-totals {
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    overflow: hidden;
    background: #f8fafc;
  }

  .rx-a4-total-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 14px;
    font-size: 10pt;
    border-bottom: 1px solid #e2e8f0;
  }

  .rx-a4-total-row span:first-child {
    color: #475569;
    font-weight: 600;
  }

  .rx-a4-total-row span:last-child {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-align: end;
  }

  .rx-a4-total-row.discount span:last-child { color: #b91c1c; }
  .rx-a4-total-row.campaign span:last-child { color: #c2410c; }

  .rx-a4-grand-total {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: #1e3a8a;
    color: #fff;
    font-size: 13pt;
    font-weight: 800;
  }

  .rx-a4-grand-total span:last-child {
    font-variant-numeric: tabular-nums;
  }

  .rx-a4-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    padding-top: 14px;
    border-top: 1px solid #cbd5e1;
  }

  .rx-a4-thanks {
    font-size: 11pt;
    font-weight: 700;
    color: #1e3a8a;
    max-width: 65%;
    line-height: 1.4;
  }

  .rx-a4-barcode-box {
    text-align: center;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 8px 12px;
    background: #fff;
  }

  .rx-a4-barcode-no {
    margin-top: 6px;
    font-size: 9pt;
    font-weight: 800;
    letter-spacing: 0.04em;
    font-family: ui-monospace, monospace;
  }

  .rx-a4-legal {
    margin-top: 12px;
    font-size: 8pt;
    color: #94a3b8;
    text-align: center;
  }

  @media print {
    .rx-a4-sheet {
      box-shadow: none;
      border-radius: 0;
      border: none;
      padding: 0;
    }
    .rx-a4-accent-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .rx-a4-table thead th,
    .rx-a4-grand-total {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }

  [dir="rtl"] .rx-a4-title-block { text-align: start; }
  [dir="rtl"] .rx-a4-info-row span:last-child { text-align: start; }
  [dir="rtl"] .rx-a4-table thead th,
  [dir="rtl"] .rx-a4-table tbody td { text-align: start; }
  [dir="rtl"] .rx-a4-unit,
  [dir="rtl"] .rx-a4-money,
  [dir="rtl"] .rx-a4-table thead th.rx-a4-money,
  [dir="rtl"] .rx-a4-table thead th.rx-a4-qty,
  [dir="rtl"] .rx-a4-table thead th.rx-a4-num { text-align: start; }
`.trim();
