/**
 * RetailEX — Çok amaçlı rapor export yardımcıları.
 *
 *  - `exportReportToXlsx` → SheetJS (xlsx) ile Excel
 *  - `exportReportToCsv`  → UTF-8 BOM CSV (Excel TR uyumlu)
 *  - `exportReportToPDF`  → jspdf + jspdf-autotable
 *  - `exportReportPrint`  → window.print() için print-friendly HTML
 *
 * `gridExcelExport.ts` (DevExDataGrid odaklı) ile yan yana çalışır; bu modül
 * `ReportToolbar` ve `ExportMenu` için genel amaçlıdır (satır nesnesi + başlıklar).
 *
 * Not: jspdf-autotable 5.x `jsPDF` örneğini `(doc as any).autoTable(...)` ile
 * genişletir (proje genelinde kullanılan kalıp — `mizanService.ts`).
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/* -------------------------------------------------------------------------- */
/* Tipler                                                                      */
/* -------------------------------------------------------------------------- */

export type ReportExportFormat = 'xlsx' | 'csv' | 'pdf' | 'print';

export interface ReportExportMetadata {
  /** Üst başlık (firma adı) */
  companyName?: string;
  /** Dönem etiketi (örn. "Ocak 2026", "01.01.2026 - 31.01.2026") */
  period?: string;
  /** Üretim zamanı — verilmezse `new Date()` */
  generatedAt?: Date;
  /** Sağ üstte ekstra küçük bilgi satırı */
  note?: string;
}

export interface ReportExportOptions {
  /** Dosya adı (uzantısız) — sanitize uygulanır */
  fileName: string;
  /** Excel sheet adı (default: "Veri") */
  sheetName?: string;
  /** Kolon başlıkları (görünen sıra) */
  headers: string[];
  /** Veri satırları — her satır bir obj, anahtarlar headers ile aynı sırada */
  rows: Array<Record<string, unknown>>;
  /** Opsiyonel dip toplam satırı (son satır olarak eklenir) */
  totals?: Record<string, unknown>;
  /** PDF/Print başlık bilgisi */
  metadata?: ReportExportMetadata;
  /** Yön: 'l' landscape, 'p' portrait (default: landscape) */
  orientation?: 'l' | 'p';
}

/* -------------------------------------------------------------------------- */
/* Yardımcılar                                                                 */
/* -------------------------------------------------------------------------- */

function sanitizeFileName(input: string): string {
  return (input || 'export')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'export';
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function buildBodyRows(
  rows: Array<Record<string, unknown>>,
  headers: string[],
  includeTotals: boolean,
  totals?: Record<string, unknown>,
): unknown[][] {
  const out: unknown[][] = rows.map((r) => headers.map((h) => cellText(r[h])));
  if (includeTotals && totals) {
    out.push(headers.map((h) => cellText(totals[h])));
  }
  return out;
}

function dateLabel(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function metadataLines(meta?: ReportExportMetadata): string[] {
  if (!meta) return [];
  const lines: string[] = [];
  if (meta.companyName) lines.push(meta.companyName);
  if (meta.period) lines.push(meta.period);
  const gen = meta.generatedAt ?? new Date();
  lines.push(`${dateLabel(gen)}`);
  if (meta.note) lines.push(meta.note);
  return lines;
}

/* -------------------------------------------------------------------------- */
/* XLSX                                                                        */
/* -------------------------------------------------------------------------- */

export function exportReportToXlsx(opts: ReportExportOptions): void {
  const { fileName, sheetName = 'Veri', headers, rows, totals, metadata } = opts;
  const dataRows = buildBodyRows(rows, headers, Boolean(totals), totals);

  // Metadata üst satırlar (basit başlık bloğu)
  const metaLines = metadataLines(metadata);
  const aoa: unknown[][] = [];
  for (const l of metaLines) aoa.push([l]);
  aoa.push(headers);
  for (const r of dataRows) aoa.push(r);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Kolon genişlikleri (yaklaşık)
  const colWidths = headers.map((h) => ({ wch: Math.max(10, h.length + 2) }));
  (ws as any)['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Veri');
  XLSX.writeFile(wb, `${sanitizeFileName(fileName)}.xlsx`);
}

/* -------------------------------------------------------------------------- */
/* CSV                                                                         */
/* -------------------------------------------------------------------------- */

function csvEscape(value: string): string {
  if (value == null) return '';
  const needs = /[",;\n\r]/.test(value);
  if (!needs) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function exportReportToCsv(opts: ReportExportOptions): void {
  const { fileName, headers, rows, totals, metadata } = opts;
  const lines: string[] = [];

  // Metadata üst satırlar (Excel TR uyumlu, BOM ile)
  for (const l of metadataLines(metadata)) lines.push(csvEscape(l));
  lines.push(headers.map(csvEscape).join(';'));

  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(cellText(r[h]))).join(';'));
  }
  if (totals) {
    lines.push(headers.map((h) => csvEscape(cellText(totals[h]))).join(';'));
  }

  const csv = lines.join('\r\n');
  // UTF-8 BOM (Excel TR karakterleri doğru açar)
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${sanitizeFileName(fileName)}.csv`);
}

/* -------------------------------------------------------------------------- */
/* PDF                                                                         */
/* -------------------------------------------------------------------------- */

export function exportReportToPDF(opts: ReportExportOptions): void {
  const { fileName, headers, rows, totals, metadata, orientation = 'l' } = opts;

  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Başlık bloğu
  const metaLines = metadataLines(metadata);
  let cursorY = 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(metaLines[0] || 'RetailEX Rapor', margin, cursorY);
  cursorY += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  for (let i = 1; i < metaLines.length; i++) {
    doc.text(metaLines[i], margin, cursorY);
    cursorY += 12;
  }
  doc.setTextColor(0);

  const body = buildBodyRows(rows, headers, Boolean(totals), totals);

  (doc as any).autoTable({
    head: [headers],
    body: body as any,
    startY: cursorY + 8,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: () => {
      // Alt sayfa numarası
      const str = `${doc.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(str, pageWidth - margin, doc.internal.pageSize.getHeight() - 20, {
        align: 'right',
      });
    },
  });

  doc.save(`${sanitizeFileName(fileName)}.pdf`);
}

/* -------------------------------------------------------------------------- */
/* Print                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Yazdırma için print-friendly HTML açar (window.open) ve `window.print()` çağırır.
 * Kullanıcı tarayıcıdan "PDF olarak kaydet" seçebilir.
 */
export function exportReportPrint(opts: ReportExportOptions): void {
  const { headers, rows, totals, metadata, fileName } = opts;
  if (typeof window === 'undefined') return;
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) return;

  const meta = metadataLines(metadata).map((l) => `<div>${escapeHtml(l)}</div>`).join('');
  const head = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');

  const bodyRows = rows
    .map(
      (r) =>
        `<tr>${headers
          .map((h) => `<td>${escapeHtml(cellText(r[h]))}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  const totalsRow = totals
    ? `<tr class="totals">${headers
        .map((h) => `<td>${escapeHtml(cellText(totals[h]))}</td>`)
        .join('')}</tr>`
    : '';

  const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(fileName || 'Rapor')}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #d4d4d8; padding: 6px 8px; text-align: left; }
  th { background: #2563eb; color: #fff; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr.totals td { font-weight: 700; background: #f1f5f9; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
  .no-print { margin-bottom: 12px; }
  .no-print button { padding: 6px 12px; background: #2563eb; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
</style>
</head>
<body>
  <div class="no-print"><button onclick="window.print()">Yazdır</button></div>
  <h1>${escapeHtml(fileName || 'Rapor')}</h1>
  <div class="meta">${meta}</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${bodyRows}${totalsRow}</tbody>
  </table>
  <script>setTimeout(function(){ try { window.focus(); } catch (e) {} }, 50);</script>
</body>
</html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* -------------------------------------------------------------------------- */
/* Genel indirme yardımcısı                                                    */
/* -------------------------------------------------------------------------- */

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* -------------------------------------------------------------------------- */
/* Dispatcher                                                                   */
/* -------------------------------------------------------------------------- */

/** Format dispatch — toolbar/menu tek noktadan çağırsın */
export function exportReport(
  format: ReportExportFormat,
  opts: ReportExportOptions,
): void {
  switch (format) {
    case 'xlsx':
      exportReportToXlsx(opts);
      return;
    case 'csv':
      exportReportToCsv(opts);
      return;
    case 'pdf':
      exportReportToPDF(opts);
      return;
    case 'print':
      exportReportPrint(opts);
      return;
    default: {
      const _exhaustive: never = format;
      void _exhaustive;
    }
  }
}
