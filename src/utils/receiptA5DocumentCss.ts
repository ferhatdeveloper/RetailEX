/**
 * A5 satış fişi — A4 kurumsal düzenin kompakt sürümü.
 */
export const RECEIPT_A5_DOCUMENT_CSS = `
  @page { size: A5 portrait; margin: 10mm; }

  .rx-a5-doc {
    width: 100%;
    max-width: 128mm;
    margin: 0 auto;
    font-family: Inter, "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.4;
    color: #0f172a;
    background: #ffffff;
    box-sizing: border-box;
  }

  .rx-a5-doc * { box-sizing: border-box; }

  .rx-a5-accent-bar {
    height: 3px;
    background: linear-gradient(90deg, #0f172a 0%, #334155 55%, #64748b 100%);
    border-radius: 3px 3px 0 0;
  }

  .rx-a5-sheet {
    border: 1px solid #cbd5e1;
    border-top: none;
    border-radius: 0 0 10px 10px;
    padding: 7mm 8mm 9mm;
    background: #fff;
    box-shadow: 0 8px 22px rgba(15, 23, 42, 0.06);
  }

  .rx-a5-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    padding-bottom: 10px;
    border-bottom: 2px solid #0f172a;
    margin-bottom: 12px;
  }

  .rx-a5-brand {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    min-width: 0;
    flex: 1;
  }

  .rx-a5-logo {
    width: 52px;
    height: 52px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .rx-a5-company-name {
    font-size: 15pt;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.15;
    margin: 0 0 4px;
  }

  .rx-a5-company-meta {
    font-size: 8pt;
    color: #475569;
    line-height: 1.45;
  }

  .rx-a5-title-block { text-align: end; flex-shrink: 0; }

  .rx-a5-doc-title {
    font-size: 16pt;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: 0.05em;
    margin: 0;
    line-height: 1.1;
  }

  .rx-a5-doc-subtitle {
    margin-top: 4px;
    font-size: 7.5pt;
    color: #64748b;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .rx-a5-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 12px;
  }

  .rx-a5-info-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px 10px;
    background: #f8fafc;
  }

  .rx-a5-info-card h3 {
    margin: 0 0 6px;
    font-size: 7.5pt;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #334155;
  }

  .rx-a5-info-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 8.5pt;
    padding: 2px 0;
  }

  .rx-a5-info-row span:first-child { color: #64748b; font-weight: 600; flex-shrink: 0; }
  .rx-a5-info-row span:last-child { color: #0f172a; font-weight: 700; text-align: end; word-break: break-word; }

  .rx-a5-banner {
    border: 2px dashed #334155;
    border-radius: 6px;
    padding: 8px 10px;
    text-align: center;
    font-weight: 800;
    font-size: 9pt;
    color: #0f172a;
    margin-bottom: 10px;
    background: #f1f5f9;
  }

  .rx-a5-table-wrap {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .rx-a5-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .rx-a5-table thead th {
    background: #0f172a;
    color: #fff;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    padding: 7px 5px;
    text-align: start;
  }

  .rx-a5-table thead th.rx-a5-num,
  .rx-a5-table thead th.rx-a5-qty,
  .rx-a5-table thead th.rx-a5-money { text-align: end; }

  .rx-a5-table tbody td {
    padding: 7px 5px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
    font-size: 8.5pt;
  }

  .rx-a5-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .rx-a5-table tbody tr:last-child td { border-bottom: none; }

  .rx-a5-item-name { font-weight: 700; color: #0f172a; word-break: break-word; }
  .rx-a5-item-sub { margin-top: 3px; font-size: 7.5pt; color: #64748b; font-weight: 600; line-height: 1.3; }

  .rx-a5-num { width: 6%; text-align: center; color: #64748b; font-weight: 700; }
  .rx-a5-code { width: 11%; font-family: ui-monospace, monospace; font-size: 7pt; color: #475569; word-break: break-all; }
  .rx-a5-desc { width: 28%; }
  .rx-a5-unit { width: 17%; text-align: end; font-variant-numeric: tabular-nums; }
  .rx-a5-qty { width: 10%; text-align: center; font-weight: 700; }
  .rx-a5-money { width: 20%; text-align: end; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }

  .rx-a5-bottom {
    display: grid;
    grid-template-columns: 1fr 58mm;
    gap: 10px;
    align-items: start;
    margin-bottom: 12px;
  }

  .rx-a5-payments {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px 10px;
    background: #fff;
  }

  .rx-a5-payments h3 {
    margin: 0 0 8px;
    font-size: 7.5pt;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #334155;
  }

  .rx-a5-pay-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 0;
    font-size: 8.5pt;
    border-bottom: 1px dashed #e2e8f0;
  }

  .rx-a5-pay-row:last-child { border-bottom: none; }

  .rx-a5-totals {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    overflow: hidden;
    background: #f8fafc;
  }

  .rx-a5-total-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    font-size: 8.5pt;
    border-bottom: 1px solid #e2e8f0;
  }

  .rx-a5-total-row span:first-child { color: #475569; font-weight: 600; }
  .rx-a5-total-row span:last-child { font-weight: 800; font-variant-numeric: tabular-nums; text-align: end; }
  .rx-a5-total-row.discount span:last-child { color: #b91c1c; }
  .rx-a5-total-row.campaign span:last-child { color: #c2410c; }

  .rx-a5-grand-total {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    background: #0f172a;
    color: #fff;
    font-size: 11pt;
    font-weight: 800;
  }

  .rx-a5-grand-total span:last-child { font-variant-numeric: tabular-nums; }

  .rx-a5-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px solid #cbd5e1;
  }

  .rx-a5-thanks {
    font-size: 9pt;
    font-weight: 700;
    color: #0f172a;
    max-width: 62%;
    line-height: 1.35;
  }

  .rx-a5-barcode-box {
    text-align: center;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 6px 8px;
    background: #fff;
  }

  .rx-a5-barcode-no {
    margin-top: 4px;
    font-size: 7.5pt;
    font-weight: 800;
    letter-spacing: 0.03em;
    font-family: ui-monospace, monospace;
  }

  .rx-a5-legal {
    margin-top: 8px;
    font-size: 7pt;
    color: #94a3b8;
    text-align: center;
  }

  @media print {
    .rx-a5-sheet { box-shadow: none; border-radius: 0; border: none; padding: 0; }
    .rx-a5-accent-bar,
    .rx-a5-table thead th,
    .rx-a5-grand-total {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }

  [dir="rtl"] .rx-a5-title-block { text-align: start; }
  [dir="rtl"] .rx-a5-info-row span:last-child { text-align: start; }
  [dir="rtl"] .rx-a5-table thead th,
  [dir="rtl"] .rx-a5-table tbody td { text-align: start; }
  [dir="rtl"] .rx-a5-unit,
  [dir="rtl"] .rx-a5-money,
  [dir="rtl"] .rx-a5-table thead th.rx-a5-money,
  [dir="rtl"] .rx-a5-table thead th.rx-a5-qty,
  [dir="rtl"] .rx-a5-table thead th.rx-a5-num { text-align: start; }
`.trim();
