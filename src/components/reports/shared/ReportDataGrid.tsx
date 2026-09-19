import { useMemo, type ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  DevExDataGrid,
  type DevExDataGridProps,
} from '../../shared/DevExDataGrid';
import { formatReportFooterSum, isReportSumColumnId } from '../../../utils/reportGridChrome';
import { formatReportDateCell } from '../../../utils/dateLocale';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { getFirmLedgerCurrency, getGlobalCurrency } from '../../../utils/currency';
import { getAppDefaultCurrency } from '../../../services/postgres';

/** Malzeme / Envanter Listesi ile aynı sayfa boyutu. */
export const REPORT_GRID_PAGE_SIZE = 50;
export const REPORT_GRID_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200, 500, 1000];

/** Malzeme listesi ile aynı DevExDataGrid varsayılanları. */
export const REPORT_GRID_DEFAULTS = {
  enableFiltering: true as const,
  enablePagination: true as const,
  enableColumnVisibility: true as const,
  showColumnVisibilityToolbar: true as const,
  enableExcelExport: true as const,
  enablePrint: true as const,
  autoFooterSums: true as const,
  /** Toolbar + kolon başlığında kolona göre grupla */
  enableGrouping: true as const,
  /** Kolon başlığı sürükle-bırak; sıra localStorage’da otomatik kalıcı (veya `columnOrderStorageKey` / `storageNamespace`) */
  enableColumnReorder: true as const,
  density: 'compact' as const,
  pageSize: REPORT_GRID_PAGE_SIZE,
  pageSizeOptions: REPORT_GRID_PAGE_SIZE_OPTIONS,
};

function alignClass(align?: 'left' | 'right' | 'center'): string {
  if (align === 'right') return 'text-right tabular-nums';
  if (align === 'center') return 'text-center';
  return '';
}

export type ReportGridColumn<T> = {
  id: string;
  header: string;
  accessor?: (row: T) => unknown;
  cell?: (row: T) => ReactNode;
  size?: number;
  minSize?: number;
  maxSize?: number;
  align?: 'left' | 'right' | 'center';
  enableColumnFilter?: boolean;
  filterKind?: 'date' | 'text' | 'number';
  /** number | currency → sağ hiza + dar genişlik (DevEx ortak kural) */
  type?: 'text' | 'number' | 'currency' | 'date';
};

/** Kolon başlığında huni filtresi üreten factory — Malzeme listesi ile aynı FilterMenu. */
export function buildReportGridColumns<T>(cols: ReportGridColumn<T>[]): ColumnDef<T, unknown>[] {
  return cols.map((c) => {
    const resolvedType = c.type ?? (c.filterKind === 'number' ? 'number' : c.filterKind === 'date' ? 'date' : undefined);
    const align =
      c.align ??
      (resolvedType === 'number' || resolvedType === 'currency' || c.filterKind === 'number' ? 'right' : undefined);
    const filterKind =
      c.filterKind ??
      (resolvedType === 'date' ? 'date' : resolvedType === 'number' || resolvedType === 'currency' ? 'number' : undefined);
    return {
      id: c.id,
      accessorFn: c.accessor ?? ((row: T) => (row as Record<string, unknown>)[c.id]),
      header: c.header,
      size: c.size,
      minSize: c.minSize,
      maxSize: c.maxSize,
      enableColumnFilter: c.enableColumnFilter !== false,
      filterFn: 'gridColumnFilter',
      meta: {
        ...(filterKind
          ? {
              filterKind,
              format:
                resolvedType === 'currency'
                  ? 'currency'
                  : filterKind === 'date'
                    ? 'date'
                    : filterKind === 'number'
                      ? 'number'
                      : undefined,
              type: resolvedType,
            }
          : {}),
        ...(align ? { align } : {}),
        ...(resolvedType ? { type: resolvedType } : {}),
      },
      cell: (info) => {
        const row = info.row.original as T;
        const inner = c.cell ? c.cell(row) : (() => {
          const v = info.getValue();
          if (v == null || v === '') return '—';
          if (filterKind === 'date') {
            return formatReportDateCell(v as string | number | Date);
          }
          return v as ReactNode;
        })();
        return <div className={alignClass(align)}>{inner}</div>;
      },
    };
  });
}

export type ReportDataGridProps<T> = DevExDataGridProps<T>;

/**
 * Rapor ızgarası — Malzeme / Envanter Listesi `DevExDataGrid` sarmalayıcısı.
 * Kolon başlığı filtresi, compact yoğunluk, sayfalama ve sütun araçları.
 */
export function ReportDataGrid<T>(props: ReportDataGridProps<T>) {
  return (
    <DevExDataGrid<T>
      {...REPORT_GRID_DEFAULTS}
      {...props}
    />
  );
}

export type ReportColumnTableCol<T> = {
  key: string;
  header: string;
  type?: 'text' | 'number' | 'date' | 'currency';
  align?: 'left' | 'right' | 'center';
  size?: number;
  cell?: (row: T) => ReactNode;
  footerSum?: boolean;
  footerFormat?: (sum: number, rows: T[]) => ReactNode;
};

/**
 * HTML &lt;table&gt; + ReportColumnFilters yerine Malzeme ızgarası.
 * Başlık ikonu, sayfalama ve dip toplam (opsiyonel).
 */
export function ReportColumnTable<T extends object>({
  data,
  columns,
  onRowClick,
  height = 520,
  footerLabel,
  storageNamespace,
  columnOrderStorageKey,
  groupByColumnId,
}: {
  data: T[];
  columns: ReportColumnTableCol<T>[];
  onRowClick?: (row: T) => void;
  height?: string | number;
  footerLabel?: ReactNode;
  /** Aynı ekranda birden fazla tablo için sabit ad alanı */
  storageNamespace?: string;
  columnOrderStorageKey?: string;
  /** Varsayılan grup kolonu (kullanıcı kolon başlığından değiştirebilir) */
  groupByColumnId?: string | null;
}) {
  const { selectedFirm } = useFirmaDonem();
  const footerCurrency = useMemo(
    () => getFirmLedgerCurrency(selectedFirm, getAppDefaultCurrency() || getGlobalCurrency()),
    [selectedFirm],
  );

  const gridColumns = useMemo(
    () =>
      buildReportGridColumns<T>(
        columns.map((c) => ({
          id: c.key,
          header: c.header,
          align: c.align,
          size: c.size,
          filterKind: c.type === 'date' ? 'date' : c.type === 'number' || c.type === 'currency' ? 'number' : 'text',
          type: c.type === 'currency' ? 'currency' : c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : undefined,
          cell: c.cell,
        })),
      ),
    [columns],
  );

  const footerSumColumns = useMemo(
    () =>
      columns
        .filter((c) => c.footerSum || (c.type === 'number' && isReportSumColumnId(c.key)))
        .map((c) => ({
          columnId: c.key,
          getValue: (row: T) => {
            const n = Number((row as Record<string, unknown>)[c.key]);
            return Number.isFinite(n) ? n : 0;
          },
          format:
            c.footerFormat ??
            ((sum: number) => formatReportFooterSum(sum, c.key, footerCurrency)),
        })),
    [columns, footerCurrency],
  );

  const heightStyle = typeof height === 'number' ? `${height}px` : height;

  return (
    <div className="min-h-[280px]" style={{ height: heightStyle }}>
      <DevExDataGrid<T>
        {...REPORT_GRID_DEFAULTS}
        data={data}
        columns={gridColumns}
        onRowClick={onRowClick}
        footerSumColumns={footerSumColumns.length > 0 ? footerSumColumns : undefined}
        footerLabel={footerLabel}
        storageNamespace={storageNamespace}
        columnOrderStorageKey={columnOrderStorageKey}
        groupByColumnId={groupByColumnId}
        height="100%"
      />
    </div>
  );
}

export default ReportDataGrid;
