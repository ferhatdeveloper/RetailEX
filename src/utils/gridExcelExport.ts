import type { ColumnDef } from '@tanstack/react-table';
import * as XLSX from 'xlsx';
import { buildStyledWorksheet } from './excelStyles';

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
    const cleaned = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * DevExDataGrid / TanStack tablosundan profesyonel stilde Excel (.xlsx) indirir.
 *
 * Stil özellikleri:
 * - Başlık (1. satır, merged): mavi arka plan, beyaz kalın yazı
 * - Alt başlık (2. satır): dosya adı + tarih
 * - Veri başlıkları (3. satır): kalın, mavi arka plan
 * - Zebra satırlar (alternatif slate-100)
 * - Para birimi sütunları: para birimi bazlı ondalık (IQD → 0, USD → 2, KWD → 3)
 * - Tarih sütunları: dd.mm.yyyy
 * - Sayfa düzeni: landscape, kenar boşlukları, yazdırma başlığı, autofilter, donmuş başlık
 */
export function exportDataGridToExcel<T>(
  rows: T[],
  columns: ColumnDef<T, unknown>[],
  fileName = 'export',
): void {
  const exportCols = columns.filter((c) => c.id !== 'select' && c.id !== 'actions');
  const headers = exportCols.map((c) => headerLabel(c));
  const accessorIds = exportCols.map((c) => String(c.id || ''));

  // AOA: [headers, ...data rows]
  const aoa: unknown[][] = [headers];

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const aoaRow: unknown[] = [];
    for (let i = 0; i < exportCols.length; i++) {
      const col = exportCols[i];
      const id = accessorIds[i];
      let val: unknown = '';
      if ('accessorKey' in col && col.accessorKey) {
        val = (row as Record<string, unknown>)[String(col.accessorKey)];
      } else if ('accessorFn' in col && typeof col.accessorFn === 'function') {
        try {
          val = col.accessorFn(row, rowIdx);
        } catch {
          val = '';
        }
      } else {
        val = (row as Record<string, unknown>)[id];
      }
      aoaRow.push(val);
    }
    aoa.push(aoaRow);
  }

  // Para birimi sütunları
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

// Eski davranışı korumak için re-export
export { cellText, headerLabel, coerceNumber };