import type { ColumnDef } from '@tanstack/react-table';
import * as XLSX from 'xlsx';

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

/** DevExDataGrid / TanStack tablosundan Excel (.xlsx) indirir. */
export function exportDataGridToExcel<T>(
  rows: T[],
  columns: ColumnDef<T, unknown>[],
  fileName = 'export',
): void {
  const exportCols = columns.filter((c) => c.id !== 'select' && c.id !== 'actions');
  const headers = exportCols.map((c) => headerLabel(c));
  const accessorIds = exportCols.map((c) => String(c.id || ''));

  const data = rows.map((row) => {
    const record: Record<string, string> = {};
    exportCols.forEach((col, i) => {
      const id = accessorIds[i];
      const header = headers[i] || id;
      let val: unknown = '';
      if ('accessorKey' in col && col.accessorKey) {
        val = (row as Record<string, unknown>)[String(col.accessorKey)];
      } else if ('accessorFn' in col && typeof col.accessorFn === 'function') {
        try {
          val = col.accessorFn(row, i);
        } catch {
          val = '';
        }
      } else {
        val = (row as Record<string, unknown>)[id];
      }
      record[header] = cellText(val);
    });
    return record;
  });

  const ws = XLSX.utils.json_to_sheet(data.length ? data : [Object.fromEntries(headers.map((h) => [h, '']))]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Veri');
  const safeName = fileName.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'export';
  XLSX.writeFile(wb, `${safeName}.xlsx`);
}
