import { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  PaginationState,
  Column,
  FilterFn,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp, Filter, Download } from 'lucide-react';
import { useResponsive } from '../../hooks/useResponsive';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';
import { exportDataGridToExcel } from '../../utils/gridExcelExport';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 15, 20, 25, 50, 100];
const FILTER_MENU_Z_INDEX = 12000;

interface DevExDataGridProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enableColumnResizing?: boolean;
  enablePagination?: boolean;
  /** Sayfa başına satır seçenekleri (masaüstü alt çubuk). Varsayılan: 10…100 */
  pageSizeOptions?: number[];
  /** Kolon göster/gizle menüsü (masaüstü) */
  enableColumnVisibility?: boolean;
  /** false ise kolon menüsü grid üstünde gösterilmez (harici toolbar kullanımı) */
  showColumnVisibilityToolbar?: boolean;
  columnVisibility?: Record<string, boolean>;
  onColumnVisibilityChange?: (visibility: any) => void;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  onRowContextMenu?: (e: React.MouseEvent, row: T) => void;
  height?: string | number;
  enableSelection?: boolean;
  onSelectionChange?: (selectedRows: T[]) => void;
  selectedRowIds?: Record<string, boolean>;
  /** compact: 10px (varsayılan), comfortable: 13px — fatura listesi vb. okunabilirlik */
  density?: 'compact' | 'comfortable';
  /** true ise filtrelenmiş satırları Excel olarak indirir */
  enableExcelExport?: boolean;
  excelFileName?: string;
  /**
   * Tablo altında sticky dip toplam satırı.
   * Toplamlar `getFilteredRowModel` satırları üzerinden hesaplanır.
   */
  footerSumColumns?: Array<{
    columnId: string;
    getValue: (row: T) => number;
    format?: (sum: number, rows: T[]) => ReactNode;
  }>;
  /** Dip toplam etiketi (ör. "Dip Toplam") — ilk uygun metin kolonuna yazılır */
  footerLabel?: ReactNode;
}

interface FilterMenuProps {
  column: Column<any, unknown>;
  onClose: () => void;
}

type GridFilterPayload =
  | string
  | {
      mode?: string;
      operator?: string;
      value?: string;
      from?: string;
      to?: string;
      /** Tarih aralığında saat sınırı kullan */
      includeTime?: boolean;
      values?: string[];
    };

const EMPTY_FILTER_KEY = '__EMPTY__';

function cellToFilterKey(value: unknown): string {
  if (value == null || String(value).trim() === '') return EMPTY_FILTER_KEY;
  return String(value);
}

const BOOL_FILTER_COLUMNS = new Set(['hasVariants', 'isScaleProduct']);

function formatFilterLabel(
  value: unknown,
  columnId: string,
  tm?: (key: string) => string,
  localeCode?: string
): string {
  if (value == null || value === EMPTY_FILTER_KEY || String(value).trim() === '') {
    return tm ? tm('gridFilterEmpty') : '(Boş)';
  }
  const boolLike =
    BOOL_FILTER_COLUMNS.has(columnId) &&
    (typeof value === 'boolean' || value === 'true' || value === 'false' || value === 1 || value === 0);
  if (boolLike) {
    const yes = value === true || value === 'true' || value === 1;
    if (tm) return yes ? tm('gridBoolYes') : tm('gridBoolNo');
    return yes ? 'Evet' : 'Hayır';
  }
  if (columnId === 'created_at' || columnId === 'updated_at') {
    const d = new Date(String(value));
    if (Number.isFinite(d.getTime())) {
      return d.toLocaleString(localeCode || 'tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }
  return String(value);
}

function parseCellDate(value: unknown): number | null {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

const DATE_FILTER_COLUMN_IDS = new Set(['created_at', 'updated_at', 'expiry_date']);

function isDateFilterColumn(columnId: string, column: Column<any, unknown>): boolean {
  if (DATE_FILTER_COLUMN_IDS.has(columnId)) return true;
  const meta = column.columnDef.meta as { filterKind?: string; format?: string } | undefined;
  return meta?.filterKind === 'date' || meta?.format === 'date';
}

function splitDateTimeInput(raw?: string): { date: string; time: string } {
  if (!raw || !String(raw).trim()) return { date: '', time: '' };
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { date: s, time: '' };
  const d = new Date(s.includes('T') ? s : `${s}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return { date: '', time: '' };
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

function combineDateTimeInput(
  date: string,
  time: string,
  includeTime: boolean,
  bound: 'start' | 'end'
): string | undefined {
  const d = date.trim();
  if (!d) return undefined;
  if (!includeTime) return d;
  const t = time.trim() || (bound === 'start' ? '00:00' : '23:59');
  return `${d}T${t}`;
}

function parseRangeBoundMs(value: string, bound: 'start' | 'end', includeTime: boolean): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!includeTime && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, day] = trimmed.split('-').map(Number);
    const dt = new Date(y, m - 1, day);
    if (bound === 'end') dt.setHours(23, 59, 59, 999);
    else dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  }
  const dt = new Date(trimmed.includes('T') ? trimmed : `${trimmed}T${bound === 'start' ? '00:00' : '23:59'}`);
  if (!Number.isFinite(dt.getTime())) return null;
  if (!includeTime && bound === 'end') dt.setHours(23, 59, 59, 999);
  if (!includeTime && bound === 'start') dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

/** Kolon huni filtresi — FilterMenu `{ mode, value }` ile uyumlu */
export const gridColumnFilterFn: FilterFn<any> = (row, columnId, filterValue) => {
  const payload = filterValue as GridFilterPayload | undefined;
  if (payload == null || payload === '') return true;

  if (typeof payload === 'string') {
    const cellValue = String(row.getValue(columnId) ?? '').toLowerCase();
    return cellValue.includes(payload.toLowerCase());
  }

  const mode = payload.mode ?? payload.operator ?? 'contains';
  const cellRaw = row.getValue(columnId);

  if (mode === 'range') {
    const includeTime = !!payload.includeTime;
    const fromMs = payload.from ? parseRangeBoundMs(payload.from, 'start', includeTime) : null;
    const toMs = payload.to ? parseRangeBoundMs(payload.to, 'end', includeTime) : null;
    if (fromMs == null && toMs == null) return true;
    const cellMs = parseCellDate(cellRaw);
    if (cellMs == null) return false;
    if (fromMs != null && cellMs < fromMs) return false;
    if (toMs != null && cellMs > toMs) return false;
    return true;
  }

  if (mode === 'multiselect') {
    const values = payload.values ?? [];
    if (values.length === 0) return false;
    const cellStr = cellToFilterKey(cellRaw);
    return values.includes(cellStr);
  }

  const searchValue = String(payload.value ?? '').toLowerCase();
  if (!searchValue) return true;
  const cellValue = String(cellRaw ?? '').toLowerCase();

  switch (mode) {
    case 'equals':
      return cellValue === searchValue;
    case 'startsWith':
      return cellValue.startsWith(searchValue);
    case 'endsWith':
      return cellValue.endsWith(searchValue);
    case 'notContains':
      return !cellValue.includes(searchValue);
    case 'contains':
    default:
      return cellValue.includes(searchValue);
  }
};

function DateRangeFilterMenu({ column, onClose }: FilterMenuProps) {
  const { tm } = useLanguage();
  const existing = column.getFilterValue() as GridFilterPayload | undefined;
  const existingRange =
    existing && typeof existing === 'object' && existing.mode === 'range' ? existing : undefined;

  const initFrom = splitDateTimeInput(existingRange?.from);
  const initTo = splitDateTimeInput(existingRange?.to);

  const [includeTime, setIncludeTime] = useState(!!existingRange?.includeTime);
  const [fromDate, setFromDate] = useState(initFrom.date);
  const [fromTime, setFromTime] = useState(initFrom.time || '00:00');
  const [toDate, setToDate] = useState(initTo.date);
  const [toTime, setToTime] = useState(initTo.time || '23:59');

  const handleApply = () => {
    const from = combineDateTimeInput(fromDate, fromTime, includeTime, 'start');
    const to = combineDateTimeInput(toDate, toTime, includeTime, 'end');
    if (!from && !to) {
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue({ mode: 'range', from, to, includeTime });
    }
    onClose();
  };

  const handleClear = () => {
    column.setFilterValue(undefined);
    onClose();
  };

  return (
    <div
      className="bg-white border border-gray-300 rounded shadow-xl w-[300px] flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 px-2 py-1.5 border-b border-gray-200 bg-[#E3F2FD]">
        <span className="text-[10px] font-semibold text-gray-700">{tm('gridFilterDateRange')}</span>
      </div>

      <div className="p-3 space-y-3">
        <label className="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={includeTime}
            onChange={(e) => setIncludeTime(e.target.checked)}
            className="w-3.5 h-3.5 shrink-0"
          />
          <span>{tm('gridFilterIncludeTime')}</span>
        </label>

        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold text-gray-600 uppercase">{tm('dateFrom')}</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--asin-accent,#1FA8A0)]"
          />
          {includeTime && (
            <input
              type="time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--asin-accent,#1FA8A0)]"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold text-gray-600 uppercase">{tm('dateTo')}</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--asin-accent,#1FA8A0)]"
          />
          {includeTime && (
            <input
              type="time"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--asin-accent,#1FA8A0)]"
            />
          )}
        </div>

        <p className="text-[10px] text-gray-500 leading-snug">{tm('gridFilterDateRangeHint')}</p>
      </div>

      <div className="shrink-0 p-2 flex gap-1 border-t border-gray-200 bg-gray-50/80">
        <button
          type="button"
          onClick={handleApply}
          className="flex-1 px-2 py-1.5 text-[11px] bg-[var(--asin-accent,#1FA8A0)] text-white rounded hover:bg-[#178f88] font-medium"
        >
          {tm('apply')}
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="flex-1 px-2 py-1.5 text-[11px] bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          {tm('clear')}
        </button>
      </div>
    </div>
  );
}

function ValueListFilterMenu({ column, onClose }: FilterMenuProps) {
  const { tm } = useLanguage();
  const localeCode = tm('localeCode');
  const sortLocale = localeCode.split('-')[0] || 'tr';
  const existing = column.getFilterValue() as GridFilterPayload | undefined;
  const columnId = column.id;

  const valueEntries = useMemo(() => {
    const counts = new Map<string, number>();
    try {
      const faceted = column.getFacetedUniqueValues?.();
      if (faceted && faceted.size > 0) {
        faceted.forEach((count, raw) => {
          const key = cellToFilterKey(raw);
          counts.set(key, (counts.get(key) ?? 0) + count);
        });
      }
    } catch {
      /* fallback */
    }
    if (counts.size === 0) {
      column.getPreFilteredRowModel().rows.forEach((row) => {
        const key = cellToFilterKey(row.getValue(column.id));
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        label: formatFilterLabel(key === EMPTY_FILTER_KEY ? null : key, columnId, tm, localeCode),
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, sortLocale));
  }, [column, columnId, tm, localeCode, sortLocale]);

  const allKeys = useMemo(() => valueEntries.map((e) => e.key), [valueEntries]);

  const [listSearch, setListSearch] = useState('');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [showTextFilter, setShowTextFilter] = useState(
    () => !!(existing && typeof existing === 'object' && existing.mode && existing.mode !== 'multiselect')
  );
  const [textMode, setTextMode] = useState<'contains' | 'equals' | 'startsWith' | 'endsWith'>(
    existing && typeof existing === 'object' && existing.mode && existing.mode !== 'multiselect' && existing.mode !== 'range'
      ? (existing.mode as 'contains' | 'equals' | 'startsWith' | 'endsWith')
      : 'contains'
  );
  const [textValue, setTextValue] = useState(
    existing && typeof existing === 'object' && existing.value ? String(existing.value) : ''
  );

  useEffect(() => {
    if (existing && typeof existing === 'object' && existing.mode === 'multiselect' && existing.values) {
      setSelectedValues(existing.values);
      return;
    }
    setSelectedValues(allKeys);
  }, [columnId, allKeys, existing]);

  const filteredEntries = useMemo(() => {
    const locale = tm('localeCode');
    const q = listSearch.trim().toLocaleLowerCase(locale);
    if (!q) return valueEntries;
    return valueEntries.filter((e) => e.label.toLocaleLowerCase(locale).includes(q));
  }, [valueEntries, listSearch, tm]);

  const filteredKeys = filteredEntries.map((e) => e.key);
  const allFilteredSelected =
    filteredKeys.length > 0 && filteredKeys.every((k) => selectedValues.includes(k));
  const someFilteredSelected =
    filteredKeys.some((k) => selectedValues.includes(k)) && !allFilteredSelected;

  const toggleValue = (key: string) => {
    setSelectedValues((prev) =>
      prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key]
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedValues((prev) => prev.filter((k) => !filteredKeys.includes(k)));
    } else {
      setSelectedValues((prev) => Array.from(new Set([...prev, ...filteredKeys])));
    }
  };

  const handleApplyValues = () => {
    if (selectedValues.length === 0) {
      column.setFilterValue({ mode: 'multiselect', values: [] });
    } else if (selectedValues.length >= allKeys.length) {
      column.setFilterValue(undefined);
    } else {
      column.setFilterValue({ mode: 'multiselect', values: selectedValues });
    }
    onClose();
  };

  const handleApplyText = () => {
    if (textValue.trim()) {
      column.setFilterValue({ mode: textMode, value: textValue.trim() });
    } else {
      column.setFilterValue(undefined);
    }
    onClose();
  };

  const handleClear = () => {
    column.setFilterValue(undefined);
    setSelectedValues(allKeys);
    setListSearch('');
    setTextValue('');
    onClose();
  };

  const FILTER_MENU_HEIGHT = 440;
  const filterListHeight = showTextFilter ? 120 : 220;

  return (
    <div
      className="bg-white border border-gray-300 rounded shadow-xl w-[300px] flex flex-col overflow-hidden"
      style={{ height: Math.min(FILTER_MENU_HEIGHT, window.innerHeight - 16) }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 px-2 py-1.5 border-b border-gray-200 bg-[#E3F2FD]">
        <span className="text-[10px] font-semibold text-gray-700">{tm('filterType')}</span>
      </div>

      <div className="shrink-0 p-2 space-y-2 border-b border-gray-100">
        <input
          type="text"
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
          placeholder={`${tm('search')}...`}
          className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[var(--asin-accent,#1FA8A0)]"
          autoFocus
        />

        <label className="flex items-center gap-2 px-1 py-1 text-[11px] font-medium text-gray-700 cursor-pointer hover:bg-gray-50 rounded">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            ref={(el) => {
              if (el) el.indeterminate = someFilteredSelected;
            }}
            onChange={toggleSelectAllFiltered}
            className="w-3.5 h-3.5 shrink-0"
          />
          <span className="flex-1">({tm('catalogSelectAll')})</span>
          <span className="text-gray-400 tabular-nums">{filteredEntries.length}</span>
        </label>
      </div>

      <div
        className="panel-menu-scroll shrink-0 border-b border-gray-200 bg-white"
        style={{ height: filterListHeight }}
      >
        {filteredEntries.length === 0 ? (
          <div className="p-4 text-[10px] text-gray-400 text-center">{tm('noDataFound')}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filteredEntries.map((entry) => (
              <label
                key={entry.key}
                className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-[var(--asin-accent-muted,#D5F0EE)]/80 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedValues.includes(entry.key)}
                  onChange={() => toggleValue(entry.key)}
                  className="w-3.5 h-3.5 shrink-0"
                />
                <span className="flex-1 truncate" title={entry.label}>
                  {entry.label}
                </span>
                <span className="text-gray-400 tabular-nums shrink-0">({entry.count})</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 p-2 space-y-2 bg-gray-50/80">
        <button
          type="button"
          onClick={() => setShowTextFilter((v) => !v)}
          className="text-[10px] text-[var(--asin-accent,#1FA8A0)] hover:underline"
        >
          {showTextFilter ? `▾ ${tm('gridFilterValueList')}` : `▸ ${tm('gridFilterTextFilter')}`}
        </button>

        {showTextFilter && (
          <div className="space-y-2 pt-1 border-t border-gray-200">
            <select
              value={textMode}
              onChange={(e) => setTextMode(e.target.value as typeof textMode)}
              className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded bg-white"
            >
              <option value="contains">{tm('contains')}</option>
              <option value="equals">{tm('equals')}</option>
              <option value="startsWith">{tm('startsWith')}</option>
              <option value="endsWith">{tm('endsWith')}</option>
            </select>
            <input
              type="text"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              placeholder={tm('value')}
              className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded bg-white"
            />
            <button
              type="button"
              onClick={handleApplyText}
              className="w-full px-2 py-1 text-[10px] bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              {tm('apply')} ({tm('contains')})
            </button>
          </div>
        )}

        <div className="flex gap-1 pt-1 border-t border-gray-200">
          <button
            type="button"
            onClick={handleApplyValues}
            className="flex-1 px-2 py-1.5 text-[11px] bg-[var(--asin-accent,#1FA8A0)] text-white rounded hover:bg-[#178f88] font-medium"
          >
            {tm('apply')}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex-1 px-2 py-1.5 text-[11px] bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            {tm('clear')}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterMenu({ column, onClose }: FilterMenuProps) {
  if (isDateFilterColumn(column.id, column)) {
    return <DateRangeFilterMenu column={column} onClose={onClose} />;
  }
  return <ValueListFilterMenu column={column} onClose={onClose} />;
}

export function DevExDataGrid<T>({
  data,
  columns,
  enableSorting = true,
  enableFiltering = true,
  enableColumnResizing = true,
  enablePagination = true,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  enableColumnVisibility = false,
  showColumnVisibilityToolbar = true,
  columnVisibility,
  onColumnVisibilityChange,
  pageSize = 20,
  onRowClick,
  onRowDoubleClick,
  onRowContextMenu,
  height,
  enableSelection,
  onSelectionChange,
  selectedRowIds,
  density = 'compact',
  enableExcelExport = true,
  excelFileName = 'retailex_export',
  footerSumColumns,
  footerLabel,
}: DevExDataGridProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>(() => ({
    pageIndex: 0,
    pageSize,
  }));
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>(selectedRowIds || {});
  const [internalColumnVisibility, setInternalColumnVisibility] = useState<Record<string, boolean>>(columnVisibility || {});
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const filterColumnsRef = useRef<Map<string, Column<any, unknown>>>(new Map());
  const { isMobile, isTablet } = useResponsive();
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const headerBg = darkMode ? 'bg-gray-700' : 'bg-[#E3F2FD]';
  const rowHover = darkMode ? 'hover:bg-gray-700' : 'hover:bg-[#BBDEFB]';
  const rowStripeEven = darkMode ? 'bg-gray-800' : 'bg-white';
  const rowStripeOdd = darkMode ? 'bg-gray-700' : 'bg-slate-50';
  const cellTextSize = density === 'comfortable' ? 'text-[13px] leading-snug' : 'text-[10px] leading-tight';
  const cellWeight = density === 'comfortable' ? 'font-medium' : '';
  const cellColor = darkMode ? 'text-gray-50' : 'text-gray-900';
  const cellBorder = darkMode ? 'border-gray-600' : 'border-gray-200';

  const closeFilterMenu = useCallback(() => {
    setOpenFilterColumn(null);
    setFilterMenuAnchor(null);
  }, []);

  useEffect(() => {
    if (!openFilterColumn) return;
    const onScrollOrResize = () => closeFilterMenu();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [openFilterColumn, closeFilterMenu]);

  useEffect(() => {
    if (columnVisibility) {
      setInternalColumnVisibility(columnVisibility);
    }
  }, [columnVisibility]);

  useEffect(() => {
    setPagination((prev) => (prev.pageSize === pageSize ? prev : { ...prev, pageSize, pageIndex: 0 }));
  }, [pageSize]);

  useEffect(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
  }, [data.length]);

  const resolvedPageSizeOptions = useMemo(() => {
    const total = data.length;
    const merged = [...pageSizeOptions];
    if (total > 0 && total > Math.max(...merged, 0) && !merged.includes(total)) {
      merged.push(total);
    }
    return [...new Set(merged.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  }, [pageSizeOptions, data.length]);

  const resolvedColumnVisibility = columnVisibility ?? internalColumnVisibility;

  const handleColumnVisibilityChange = (updater: any) => {
    const nextVisibility =
      typeof updater === 'function'
        ? updater(resolvedColumnVisibility)
        : updater;
    if (!columnVisibility) {
      setInternalColumnVisibility(nextVisibility);
    }
    onColumnVisibilityChange?.(nextVisibility);
  };

  // Sync internal selection with prop if provided
  useEffect(() => {
    if (selectedRowIds) {
      setRowSelection(selectedRowIds);
    }
  }, [selectedRowIds]);

  const finalColumns = useMemo(() => {
    if (!enableSelection) return columns;

    const selectionColumn: ColumnDef<T, any> = {
      id: 'select',
      header: ({ table }) => {
        const filtered = table.getFilteredRowModel().rows;
        const allSelected = filtered.length > 0 && filtered.every((row) => row.getIsSelected());
        return (
          <div className="px-1">
            <input
              type="checkbox"
              className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--asin-accent,#1FA8A0)] focus:ring-[var(--asin-accent,#1FA8A0)]"
              title={tm('gridSelectAllTitle')}
              checked={allSelected}
              onChange={(e) => {
                if (e.target.checked) {
                  setRowSelection(
                    Object.fromEntries(filtered.map((row) => [row.id, true]))
                  );
                } else {
                  setRowSelection({});
                }
              }}
            />
          </div>
        );
      },
      cell: ({ row }) => (
        <div className="px-1" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            className="w-3.5 h-3.5 rounded border-gray-300 text-[var(--asin-accent,#1FA8A0)] focus:ring-[var(--asin-accent,#1FA8A0)]"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        </div>
      ),
      size: 40,
    };

    return [selectionColumn, ...columns];
  }, [columns, enableSelection, setRowSelection, tm]);

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      columnVisibility: resolvedColumnVisibility,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(enablePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    autoResetPageIndex: false,
    enableRowSelection: true,
    filterFns: {
      gridColumnFilter: gridColumnFilterFn,
    },
    defaultColumn: {
      filterFn: 'gridColumnFilter',
      enableColumnFilter: enableFiltering,
    },
  });

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
      onSelectionChange(selectedRows);
    }
  }, [rowSelection]);

  const maxPageSizeOption = resolvedPageSizeOptions[resolvedPageSizeOptions.length - 1] ?? pagination.pageSize;

  const openFilterForHeader = useCallback(
    (headerId: string, anchorEl: HTMLElement, column: Column<any, unknown>) => {
      if (openFilterColumn === headerId) {
        closeFilterMenu();
        return;
      }
      filterColumnsRef.current.set(headerId, column);
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = 300;
      const menuHeight = 440;
      let top = rect.bottom + 4;
      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - 4);
      }
      const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
      setFilterMenuAnchor({ top, left });
      setOpenFilterColumn(headerId);
    },
    [openFilterColumn, closeFilterMenu]
  );

  const filteredRowsForFooter = table.getFilteredRowModel().rows;
  const showFooterRow = Boolean(footerLabel) || Boolean(footerSumColumns?.length);
  const footerSumByColumnId = useMemo(() => {
    if (!footerSumColumns?.length) return new Map<string, ReactNode>();
    const originals = filteredRowsForFooter.map((r) => r.original);
    const map = new Map<string, ReactNode>();
    for (const def of footerSumColumns) {
      const sum = originals.reduce((acc, row) => acc + (Number(def.getValue(row)) || 0), 0);
      map.set(def.columnId, def.format ? def.format(sum, originals) : sum);
    }
    return map;
  }, [footerSumColumns, data, columnFilters, sorting]);

  // Mobile Card View
  if (isMobile) {
    return (
      <div className={`flex flex-col h-full ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {/* Mobile Cards */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {table.getRowModel().rows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">{tm('noDataFound')}</div>
          ) : (
            table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className="bg-white border border-gray-200 shadow-sm rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3 active:scale-[0.98] transition-transform cursor-pointer"
                onClick={() => onRowClick?.(row.original)}
                onDoubleClick={() => onRowDoubleClick?.(row.original)}
                onContextMenu={(e) => onRowContextMenu?.(e, row.original)}
              >
                {/* Card Content */}
                {row.getVisibleCells().map((cell) => {
                  const header = cell.column.columnDef.header;
                  if (cell.column.id === 'select' || cell.column.id === 'actions') return null;

                  return (
                    <div key={cell.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-2 py-1 sm:py-0">
                      <span className="text-xs sm:text-sm text-gray-500 font-medium sm:min-w-[100px]">
                        {typeof header === 'function' ? '' : header}
                      </span>
                      <span className="text-sm sm:text-base text-gray-900 sm:text-right flex-1 break-words">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Mobile Pagination */}
        {enablePagination && (
          <div className="bg-white border-t border-gray-200 p-3 sm:p-4 space-y-2">
            <div className="text-xs sm:text-sm text-gray-600 text-center">
              {tm('page')} {table.getState().pagination.pageIndex + 1} {tm('of')} {table.getPageCount()} • {table.getFilteredRowModel().rows.length} {tm('records')}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base font-medium rounded-lg min-h-[44px] active:scale-95"
              >
                {tm('previous')}
              </button>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm sm:text-base font-medium rounded-lg min-h-[44px] active:scale-95"
              >
                {tm('next')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const portalFilterColumn =
    openFilterColumn != null ? filterColumnsRef.current.get(openFilterColumn) : undefined;

  // Desktop Table View
  const leafColumnsForVisibility = table
    .getAllLeafColumns()
    .filter((col) => col.id !== 'select' && col.id !== 'actions' && col.getCanHide());

  return (
    <div
      className="flex flex-col h-full outline-none"
      style={{ height: height }}
      data-datagrid-root
      tabIndex={enableSelection ? 0 : undefined}
      onKeyDown={
        enableSelection
          ? (e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                const rows = table.getFilteredRowModel().rows;
                setRowSelection(Object.fromEntries(rows.map((row) => [row.id, true])));
              }
            }
          : undefined
      }
    >
      {((enableColumnVisibility && showColumnVisibilityToolbar) || enableExcelExport) && (
        <div className="flex items-center justify-end gap-2 px-3 py-1.5 bg-gray-50 border border-gray-300 border-b-0 shrink-0">
          {enableFiltering && columnFilters.length > 0 && (
            <button
              type="button"
              onClick={() => {
                table.resetColumnFilters();
                closeFilterMenu();
              }}
              className="px-2 py-1 text-[10px] text-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)] border border-[var(--asin-accent-muted,#D5F0EE)] rounded hover:bg-[var(--asin-accent-muted,#D5F0EE)]"
            >
              {tm('clear')} ({columnFilters.length})
            </button>
          )}
          {enableColumnVisibility && showColumnVisibilityToolbar && (
          <ColumnVisibilityMenu
            columns={leafColumnsForVisibility.map((col) => {
              const header = col.columnDef.header;
              const label = typeof header === 'string' ? header : col.id;
              return {
                id: col.id,
                label,
                visible: col.getIsVisible(),
              };
            })}
            onToggle={(columnId) => {
              handleColumnVisibilityChange((prev: Record<string, boolean>) => ({
                ...prev,
                [columnId]: !(prev[columnId] !== false),
              }));
            }}
            onShowAll={() => {
              handleColumnVisibilityChange(
                Object.fromEntries(leafColumnsForVisibility.map((col) => [col.id, true]))
              );
            }}
            onHideAll={() => {
              handleColumnVisibilityChange(
                Object.fromEntries(leafColumnsForVisibility.map((col) => [col.id, false]))
              );
            }}
          />
          )}
          {enableExcelExport && (
            <button
              type="button"
              onClick={() =>
                exportDataGridToExcel(
                  table.getFilteredRowModel().rows.map((r) => r.original),
                  columns,
                  excelFileName,
                )
              }
              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
              title={tm('exportExcel') || 'Excel'}
            >
              <Download className="w-3 h-3" />
              Excel
            </button>
          )}
        </div>
      )}

      {/* Table Container */}
      <div className={`flex-1 overflow-auto border ${darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'}`}>
        <table className="w-full border-collapse">
          <thead className={`sticky top-0 z-30 shadow-[0_1px_0_0_rgba(0,0,0,0.08)] ${headerBg}`}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className={`border-b ${darkMode ? 'border-gray-600' : 'border-gray-300'} ${headerBg}`}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`px-2 py-1 text-left border-r last:border-r-0 relative ${headerBg} ${darkMode ? 'text-gray-100 border-gray-600' : 'text-gray-800 border-gray-300'} ${density === 'comfortable' ? 'text-xs font-semibold py-1.5' : 'text-[10px] font-medium'}`}
                    style={{ width: header.getSize() }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      {/* Header Text + Sort */}
                      <div
                        className="flex items-center gap-1 cursor-pointer select-none flex-1"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() && (
                          <span className="text-gray-600">
                            {header.column.getIsSorted() === 'asc' ? (
                              <ChevronUp className="w-2.5 h-2.5" />
                            ) : (
                              <ChevronDown className="w-2.5 h-2.5" />
                            )}
                          </span>
                        )}
                      </div>

                      {/* Filter Icon (huni) */}
                      {enableFiltering && header.column.getCanFilter() && header.id !== 'select' && header.id !== 'actions' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openFilterForHeader(header.id, e.currentTarget, header.column);
                          }}
                          className={`p-0.5 hover:bg-gray-200 rounded transition-colors ${header.column.getFilterValue() ? 'text-[var(--asin-accent,#1FA8A0)]' : 'text-gray-500'
                            }`}
                          title={tm('filterType')}
                        >
                          <Filter className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row, idx) => (
              <tr
                key={row.id}
                onClick={(e) => {
                  if (enableSelection && (e.ctrlKey || e.metaKey)) {
                    row.toggleSelected(!row.getIsSelected());
                    return;
                  }
                  onRowClick?.(row.original);
                }}
                onDoubleClick={() => onRowDoubleClick?.(row.original)}
                onContextMenu={(e) => onRowContextMenu?.(e, row.original)}
                className={`border-b transition-colors cursor-pointer ${darkMode ? 'border-gray-700' : 'border-gray-200'} ${rowHover} ${idx % 2 === 0 ? rowStripeEven : rowStripeOdd} ${enableSelection && row.getIsSelected() ? (darkMode ? 'bg-[var(--asin-accent,#1FA8A0)]/25' : 'bg-[var(--asin-accent-muted,#D5F0EE)]') : ''}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`px-2 py-1 border-r last:border-r-0 ${cellTextSize} ${cellWeight} ${cellColor} ${cellBorder}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {showFooterRow && (
            <tfoot
              className={`sticky bottom-0 z-20 border-t-2 ${
                darkMode ? 'bg-gray-900 border-[var(--asin-accent,#1FA8A0)]' : 'bg-[var(--asin-accent-muted,#D5F0EE)] border-[var(--asin-accent,#1FA8A0)]/50'
              }`}
            >
              <tr>
                {(() => {
                  const visibleCols = table.getVisibleLeafColumns();
                  const labelColId = visibleCols.find(
                    (c) => c.id !== 'select' && c.id !== 'actions' && !footerSumByColumnId.has(c.id),
                  )?.id;
                  return visibleCols.map((col) => {
                    const sumNode = footerSumByColumnId.get(col.id);
                    return (
                      <td
                        key={`footer-${col.id}`}
                        className={`px-2 py-1.5 border-r last:border-r-0 ${cellTextSize} font-bold tabular-nums ${
                          darkMode ? 'text-[var(--asin-accent-muted,#D5F0EE)] border-gray-600' : 'text-[var(--asin-primary,#0E2433)] border-[var(--asin-accent-muted,#D5F0EE)]'
                        }`}
                      >
                        {sumNode != null ? (
                          sumNode
                        ) : col.id === labelColId && footerLabel != null ? (
                          <span className={darkMode ? 'text-[var(--asin-accent-muted,#D5F0EE)]' : 'text-[var(--asin-primary,#0E2433)]'}>
                            {footerLabel}
                            <span className={`ml-1 font-semibold ${darkMode ? 'text-gray-400' : 'text-[var(--asin-accent,#1FA8A0)]/80'}`}>
                              ({filteredRowsForFooter.length})
                            </span>
                          </span>
                        ) : null}
                      </td>
                    );
                  });
                })()}
              </tr>
            </tfoot>
          )}
        </table>

        {/* No Data */}
        {table.getRowModel().rows.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            {tm('noDataFound')}
          </div>
        )}
      </div>

      {openFilterColumn && filterMenuAnchor && portalFilterColumn &&
        createPortal(
          <div
            className="fixed inset-0"
            style={{ zIndex: FILTER_MENU_Z_INDEX }}
            onMouseDown={closeFilterMenu}
          >
            <div
              className="absolute"
              style={{ top: filterMenuAnchor.top, left: filterMenuAnchor.left }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <FilterMenu key={openFilterColumn} column={portalFilterColumn} onClose={closeFilterMenu} />
            </div>
          </div>,
          document.body
        )}

      {/* Pagination */}
      {enablePagination && (
        <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border-t border-gray-200">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>
              {tm('page')} {table.getState().pagination.pageIndex + 1} {tm('of')} {table.getPageCount()}
            </span>
            <span className="text-gray-400">|</span>
            <span>
              {table.getRowModel().rows.length} / {table.getFilteredRowModel().rows.length} {tm('records')}
            </span>
            <span className="text-gray-400">|</span>
            <span>
              {tm('show')} {pagination.pageSize}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
            >
              {tm('first')}
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
            >
              {tm('previous')}
            </button>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
            >
              {tm('next')}
            </button>
            <button
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
            >
              {tm('last')}
            </button>

            <select
              value={pagination.pageSize}
              onChange={(e) => {
                const nextSize = Number(e.target.value);
                if (!Number.isFinite(nextSize) || nextSize <= 0) return;
                setPagination({ pageIndex: 0, pageSize: nextSize });
              }}
              className="px-3 py-1.5 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[var(--asin-accent,#1FA8A0)] text-sm"
            >
              {resolvedPageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size === data.length && size === maxPageSizeOption && size > 100
                    ? `${tm('showAllColumns')} (${size})`
                    : `${tm('show')} ${size}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
