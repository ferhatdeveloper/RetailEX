import type { ColumnDef } from '@tanstack/react-table';
import * as XLSX from 'xlsx';
import { buildStyledWorksheet } from './excelStyles';
import { formatReportDateCell, type DateInput } from './dateLocale';
import { formatNumber } from './formatNumber';
import { coerceReportNumber, excelCellDisplay, isReportMoneyColumnId, isReportSumColumnId } from './reportGridChrome';
import { printReportHtml } from './reportHtmlPrint';
import {
  excelAmountCellValue,
  excelNumberCell,
  headerIsAmount,
  headerKeepsText,
  readExcelNumberCell,
  type ExcelDirection,
} from './excelCellValue';

/** Otomatik grup başlığı / alt toplam. Ham satır kopyası olduğu için Excel’e yazılmaz. */
const SYNTHETIC_ROW_KIND = '__devexRowKind';

function cellText(value: unknown): string {
  const marked = readExcelNumberCell(value);
  if (marked) {
    const text = formatGridExportAmount(marked.value);
    return marked.direction ? `${text} (${marked.direction})` : text;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return formatGridExportAmount(value);
  if (value == null) return '';
  if (typeof value === 'object') return '';
  return String(value);
}

function headerLabel<T>(col: ColumnDef<T, unknown>): string {
  const h = col.header;
  if (typeof h === 'string' && h.trim()) return h.trim();
  return columnIdOf(col);
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

type ColumnMeta = {
  type?: string;
  filterKind?: string;
  format?: string;
  /** Ekrandaki (A) / (B). Satır tutarını işaretli bakiyeye çevirmez. */
  excelDirection?: (row: unknown) => ExcelDirection | null | undefined;
};

function columnMeta<T>(col: ColumnDef<T, unknown>): ColumnMeta {
  return (col.meta as ColumnMeta | undefined) ?? {};
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

function isSyntheticGroupRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const kind = (row as Record<string, unknown>)[SYNTHETIC_ROW_KIND];
  return kind === 'group' || kind === 'subtotal';
}

function isDateColumn<T>(col: ColumnDef<T, unknown>): boolean {
  const meta = columnMeta(col);
  return meta.type === 'date' || meta.filterKind === 'date' || meta.format === 'date';
}

/** Ekrandaki tutar: 11250 → 11.250. Ondalık varsa korunur, ,00 yazılmaz. */
export function formatGridExportAmount(value: number): string {
  if (!Number.isFinite(value)) return '';
  return formatNumber(value, 2);
}

function isExportAmountColumn<T>(col: ColumnDef<T, unknown>, id: string): boolean {
  const header = headerLabel(col);
  if (headerKeepsText(header) || isDateColumn(col)) return false;
  const meta = columnMeta(col);
  if (meta.type === 'currency' || meta.format === 'currency') return true;
  if (isReportSumColumnId(id) || isReportMoneyColumnId(id)) return true;
  if (headerIsAmount(header)) return true;
  if (meta.type === 'number' || meta.filterKind === 'number' || meta.format === 'number') return true;
  return false;
}

function formatExportCell<T>(
  col: ColumnDef<T, unknown>,
  raw: unknown,
  row: T,
  amountColumnIds: Set<string>,
): unknown {
  const id = columnIdOf(col);
  const shown = excelCellDisplay(id, raw, row as Record<string, unknown>);
  if (isDateColumn(col)) {
    const text = formatReportDateCell(shown as DateInput, null, { fallback: '' });
    if (text) return text;
  }
  const header = headerLabel(col);
  const amountColumn = amountColumnIds.has(id) || isExportAmountColumn(col, id);
  if (amountColumn) {
    if (shown == null || shown === '') return '';
    const prepared = excelAmountCellValue(header, shown);
    const marked = readExcelNumberCell(prepared);
    const numeric = marked?.value ?? (typeof prepared === 'number' && Number.isFinite(prepared) ? prepared : null);
    if (numeric != null) {
      const fromMeta = columnMeta(col).excelDirection?.(row);
      const direction = marked?.direction ?? (fromMeta === 'A' || fromMeta === 'B' ? fromMeta : undefined);
      if (direction) return excelNumberCell(numeric, direction);
      return numeric;
    }
  }
  if (shown == null) return '';
  if (typeof shown === 'object') return '';
  return shown;
}

export type GridExportFooterSum<T> = {
  columnId: string;
  getValue: (row: T) => number;
};

export type GridExportOptions<T> = {
  /** Ekran dip toplamı ile aynı kolonlar ve aynı getValue. */
  footerSumColumns?: GridExportFooterSum<T>[];
  /** Dip toplam etiketi. Kayıt sayısı parantezle eklenir: TOPLAM (4). */
  footerLabel?: string;
  /** Görünür kolon id’leri, ekran sırası. */
  visibleColumnIds?: string[];
};

function selectExportColumns<T>(
  columns: ColumnDef<T, unknown>[],
  visibleColumnIds?: string[],
): ColumnDef<T, unknown>[] {
  const usable = columns.filter((c) => {
    const id = columnIdOf(c);
    return id !== 'select' && id !== 'actions';
  });
  if (!visibleColumnIds || visibleColumnIds.length === 0) return usable;
  const byId = new Map<string, ColumnDef<T, unknown>>();
  for (const col of usable) {
    const id = columnIdOf(col);
    if (id && !byId.has(id)) byId.set(id, col);
  }
  const ordered: ColumnDef<T, unknown>[] = [];
  for (const id of visibleColumnIds) {
    const col = byId.get(id);
    if (col) ordered.push(col);
  }
  return ordered.length > 0 ? ordered : usable;
}

function amountColumnIds<T>(
  columns: ColumnDef<T, unknown>[],
  footerSums: GridExportFooterSum<T>[],
): Set<string> {
  const ids = new Set<string>();
  for (const def of footerSums) {
    if (def.columnId) ids.add(def.columnId);
  }
  for (const col of columns) {
    const id = columnIdOf(col);
    if (!id) continue;
    if (isReportSumColumnId(id) || isReportMoneyColumnId(id)) ids.add(id);
  }
  return ids;
}

/**
 * Izgara Excel satırları. Başlıklar kolon başlığıdır; sentetik grup satırları yazılmaz.
 * Tutarlar gerçek sayıdır. Dip toplam, verilen getValue ile hesaplanır.
 */
export function buildDataGridExportAoa<T>(
  rows: T[],
  columns: ColumnDef<T, unknown>[],
  options?: GridExportOptions<T>,
): { headers: string[]; aoa: unknown[][] } {
  const exportCols = selectExportColumns(columns, options?.visibleColumnIds);
  const headers = exportCols.map((c) => headerLabel(c));
  const detailRows = rows.filter((row) => !isSyntheticGroupRow(row));
  const footerSums = (options?.footerSumColumns ?? []).filter((def) => def.columnId && typeof def.getValue === 'function');
  const amounts = amountColumnIds(exportCols, footerSums);
  const aoa: unknown[][] = [headers];

  for (let rowIdx = 0; rowIdx < detailRows.length; rowIdx++) {
    const row = detailRows[rowIdx]!;
    aoa.push(
      exportCols.map((col) => formatExportCell(col, readExportValue(col, row, rowIdx), row, amounts)),
    );
  }

  const sumById = new Map<string, number>();
  for (const def of footerSums) {
    let sum = 0;
    for (const row of detailRows) {
      const n = Number(def.getValue(row));
      sum += Number.isFinite(n) ? n : 0;
    }
    sumById.set(def.columnId, sum);
  }
  if (sumById.size === 0) {
    for (const col of exportCols) {
      const id = columnIdOf(col);
      if (!isReportSumColumnId(id)) continue;
      let sum = 0;
      for (let rowIdx = 0; rowIdx < detailRows.length; rowIdx++) {
        sum += coerceReportNumber(readExportValue(col, detailRows[rowIdx]!, rowIdx));
      }
      sumById.set(id, sum);
    }
  }

  if (detailRows.length > 0 && sumById.size > 0) {
    const label = (options?.footerLabel || 'Toplam').trim() || 'Toplam';
    let labelPlaced = false;
    aoa.push(
      exportCols.map((col) => {
        const id = columnIdOf(col);
        if (sumById.has(id)) return sumById.get(id) ?? 0;
        if (!labelPlaced) {
          labelPlaced = true;
          return `${label} (${detailRows.length})`;
        }
        return '';
      }),
    );
  }

  return { headers, aoa };
}

function coerceExcelAmountAoa(aoa: unknown[][]): unknown[][] {
  const headers = (aoa[0] ?? []).map((cell) => (cell == null ? '' : String(cell)));
  return aoa.map((row, rowIndex) => {
    if (rowIndex === 0) return row;
    return row.map((cell, colIndex) => excelAmountCellValue(headers[colIndex] ?? '', cell));
  });
}

function flattenExcelNumbers(aoa: unknown[][]): unknown[][] {
  return aoa.map((row) =>
    row.map((cell) => {
      const marked = readExcelNumberCell(cell);
      return marked ? marked.value : cell;
    }),
  );
}

/** (A) / (B) sayı değerinin üstüne biçim olarak yazılır. Toplam fonksiyonu sayıyı okur. */
export function applyExcelDirectionFormats(ws: XLSX.WorkSheet, source: unknown[][]): void {
  source.forEach((row, r) => {
    row.forEach((cell, c) => {
      const marked = readExcelNumberCell(cell);
      if (!marked?.direction) return;
      const ref = XLSX.utils.encode_cell({ r, c });
      const sheetCell = ws[ref];
      if (!sheetCell) return;
      sheetCell.t = 'n';
      sheetCell.v = marked.value;
      const base = Number.isInteger(marked.value) ? '#,##0' : '#,##0.00';
      sheetCell.z = `${base}" (${marked.direction})"`;
    });
  });
}

/**
 * Stil sayfası. Başlık ve alt başlık birleştirmesi yok:
 * o birleştirme kolon başlıklarını ve ilk veri satırını gizliyordu.
 */
export function buildGridExportWorksheet(aoa: unknown[][], headers: string[]): XLSX.WorkSheet {
  const columnCount = Math.max(headers.length, aoa[0]?.length ?? 0);
  const normalized = coerceExcelAmountAoa(aoa);
  const sheetAoa = flattenExcelNumbers(normalized.length > 1 ? normalized : [headers, headers.map(() => '')]);
  const currencyColumns = headers.filter((h) => headerIsAmount(h));
  const ws = buildStyledWorksheet(sheetAoa, {
    headerRowIndex: 1,
    columnCount,
    currencyColumns,
    dataStartIndex: 1,
  });
  applyExcelDirectionFormats(ws, normalized.length > 1 ? normalized : sheetAoa);
  return ws;
}

function writeAoaWorkbook(aoa: unknown[][], headers: string[], fileName: string): void {
  const ws = buildGridExportWorksheet(aoa, headers);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Veri');
  const safeName = fileName.replace(/[^\w\-]+/g, '_').slice(0, 80) || 'export';
  XLSX.writeFile(wb, `${safeName}.xlsx`);
}

/**
 * DevExDataGrid / TanStack tablosundan Excel (.xlsx) indirir.
 * Çıktı ekrandaki kolon başlıkları ve süzülmüş satırlardır.
 */
export function exportDataGridToExcel<T>(
  rows: T[],
  columns: ColumnDef<T, unknown>[],
  fileName = 'export',
  options?: GridExportOptions<T>,
): void {
  const { headers, aoa } = buildDataGridExportAoa(rows, columns, options);
  writeAoaWorkbook(aoa, headers, fileName);
}

/** Hazır satır matrisi (pivot / grup dashboard). İlk satır başlıktır. */
export function exportAoaToExcel(aoa: unknown[][], fileName = 'export'): void {
  const headers = (aoa[0] ?? []).map((cell) => (cell == null ? '' : String(cell)));
  writeAoaWorkbook(aoa, headers, fileName);
}

export async function printDataGridHtml<T>(
  rows: T[],
  columns: ColumnDef<T, unknown>[],
  title = 'Rapor',
  options?: GridExportOptions<T>,
): Promise<void> {
  const { headers, aoa } = buildDataGridExportAoa(rows, columns, options);
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
export { excelAmountCellValue } from './excelCellValue';
