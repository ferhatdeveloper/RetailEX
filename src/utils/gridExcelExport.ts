import type { ColumnDef } from '@tanstack/react-table';
import * as XLSX from 'xlsx';
import { buildStyledWorksheet } from './excelStyles';
import { coerceReportNumber, excelCellDisplay, isReportSumColumnId } from './reportGridChrome';
import { printReportHtml } from './reportHtmlPrint';

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function headerLabel<T>(col: ColumnDef<T, unknown>): string {
  const h = col.header;
  if (typeof h === 'string') return h;
  return String(col.id || '');
}

/** Sayısal olabilecek değerleri number olarak al — string ise parse et. */
function coerceNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = coerceReportNumber(value);
    return n === 0 && String(value).trim() === '' ? null : n;
  }
  return null;
}

function columnIdOf<T>(col: ColumnDef<T, unknown>): string {
  if (col.id) return String(col.id);
  if ('accessorKey' in col && col.accessorKey != null) return String(col.accessorKey);
  return '';
}

function readExportValue<T>(col: ColumnDef<T, unknown>, row: T, rowIdx: number): unknown {
  if ('accessorKey' in col && col.accessorKey) {
    return (row as Record<string, unknown>)[String(col.accessorKey)];
  }
  if ('accessorFn' in col && typeof col.accessorFn === 'function') {
    try {
      return col.accessorFn(row, rowIdx);
    } catch {
      return '';
    }
  }
  return (row as Record<string, unknown>)[columnIdOf(col)];
}

function buildExportAoa<T>(
  rows: T[],
  columns: ColumnDef<T, unknown>[],
): { headers: string[]; aoa: unknown[][] } {
  const exportCols = columns.filter((c) => c.id !== 'select' && c.id !== 'actions');
  const headers = exportCols.map((c) => headerLabel(c));
  const accessorIds = exportCols.map((c) => columnIdOf(c));
  const aoa: unknown[][] = [headers];
  const sums = new Array(exportCols.length).fill(0);
  const summable = exportCols.map((c) => isReportSumColumnId(columnIdOf(c)));

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const aoaRow: unknown[] = [];
    for (let i = 0; i < exportCols.length; i++) {
      const col = exportCols[i]!;
      const id = accessorIds[i]!;
      const val = excelCellDisplay(
        id,
        readExportValue(col, row, rowIdx),
        row as Record<string, unknown>,
      );
      aoaRow.push(val);
      if (summable[i]) sums[i] += coerceReportNumber(val);
    }
    aoa.push(aoaRow);
  }

  if (rows.length > 0 && summable.some(Boolean)) {
    aoa.push(
      exportCols.map((_, i) => {
        if (i === 0) return 'Toplam';
        if (summable[i]) return sums[i];
        return '';
      }),
    );
  }

  return { headers, aoa };
}

/**
 * DevExDataGrid / TanStack tablosundan profesyonel stilde Excel (.xlsx) indirir.
 */
export function exportDataGridToExcel<T>(
  rows: T[],
  columns: ColumnDef<T, unknown>[],
  fileName = 'export',
): void {
  const { headers, aoa } = buildExportAoa(rows, columns);

  const currencyColumns = headers.filter((h) =>
    /(tutar|fiyat|toplam|harcama|amount|price|total|borç|alacak|bakiye|debt|credit|balance)/i.test(h),
  );

  const today = new Date();
  const dateStr = today.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const ws = buildStyledWorksheet(
    aoa.length > 1 ? aoa : [headers, headers.map(() => '')],
    {
      title: fileName.replace(/[^\w\-]+/g, ' ').slice(0, 80) || 'Veri Dışa Aktarım',
      subtitle: `RetailEX Veri Raporu • ${dateStr}`,
      headerRowIndex: 1,
      columnCount: headers.length,
      currencyColumns,
      dataStartIndex: 1,
    },
  );

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Veri');
  const safeName = fileName.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'export';
  XLSX.writeFile(wb, `${safeName}.xlsx`);
}

export async function printDataGridHtml<T>(
  rows: T[],
  columns: ColumnDef<T, unknown>[],
  title = 'Rapor',
): Promise<void> {
  const { headers, aoa } = buildExportAoa(rows, columns);
  const bodyRows = aoa.slice(1);
  const tableRows = bodyRows
    .map(
      (r, idx) =>
        `<tr class="${idx === bodyRows.length - 1 && rows.length > 0 ? 'total' : ''}">${r
          .map((c) => `<td>${escapeHtml(cellText(c))}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body{font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#0f172a;margin:16px}
  h1{font-size:16px;margin:0 0 12px}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}
  th{background:#e2e8f0}
  tr.total td{font-weight:700;background:#eff6ff}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
<tbody>${tableRows}</tbody></table>
</body></html>`;
  await printReportHtml(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { cellText, headerLabel, coerceNumber };
