import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  Column,
  FilterFn,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { useResponsive } from '../../hooks/useResponsive';
import { useLanguage } from '../../contexts/LanguageContext';
import { ColumnVisibilityMenu } from './ColumnVisibilityMenu';

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
      values?: string[];
    };

const EMPTY_FILTER_KEY = '__EMPTY__';

function cellToFilterKey(value: unknown): string {
  if (value == null || String(value).trim() === '') return EMPTY_FILTER_KEY;
  return String(value);
}

function formatFilterLabel(value: unknown, columnId: string): string {
  if (value == null || value === EMPTY_FILTER_KEY || String(value).trim() === '') return '(Boş)';
  if (columnId === 'created_at') {
    const d = new Date(String(value));
    if (Number.isFinite(d.getTime())) {
      return d.toLocaleString('tr-TR', {
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
    const fromMs = payload.from ? parseCellDate(payload.from) : null;
    const toMs = payload.to ? parseCellDate(payload.to) : null;
    if (fromMs == null && toMs == null) return true;
    const cellMs = parseCellDate(cellRaw);
    if (cellMs == null) return false;
    if (fromMs != null && cellMs < fromMs) return false;
    if (toMs != null) {
      const end = new Date(payload.to!);
      end.setHours(23, 59, 59, 999);
      if (cellMs > end.getTime()) return false;
    }
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

function FilterMenu({ column, onClose }: FilterMenuProps) {
  const { tm } = useLanguage();
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
        label: formatFilterLabel(key === EMPTY_FILTER_KEY ? null : key, columnId),
        count,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [column, columnId]);

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
    const q = listSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return valueEntries;
    return valueEntries.filter((e) => e.label.toLocaleLowerCase('tr-TR').includes(q));
  }, [valueEntries, listSearch]);

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

  return (
    <div
      className="bg-white border border-gray-300 rounded shadow-xl min-w-[280px] max-w-[320px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-1.5 border-b border-gray-200 bg-[#E3F2FD]">
        <span className="text-[10px] font-semibold text-gray-700">{tm('filterType')}</span>
      </div>

      <div className="p-2 space-y-2">
        <div>
          <input
            type="text"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            placeholder={`${tm('search')}...`}
            className="w-full px-2 py-1.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        </div>

        <label className="flex items-center gap-2 px-1 py-1 text-[11px] font-medium text-gray-700 border-b border-gray-100 cursor-pointer hover:bg-gray-50 rounded">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            ref={(el) => {
              if (el) el.indeterminate = someFilteredSelected;
            }}
            onChange={toggleSelectAllFiltered}
            className="w-3.5 h-3.5"
          />
          <span className="flex-1">(Tümünü Seç)</span>
          <span className="text-gray-400 tabular-nums">{filteredEntries.length}</span>
        </label>

        <div className="max-h-56 overflow-y-auto border border-gray-200 rounded">
          {filteredEntries.length === 0 ? (
            <div className="p-3 text-[10px] text-gray-400 text-center">{tm('noDataFound')}</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredEntries.map((entry) => (
                <label
                  key={entry.key}
                  className="flex items-center gap-2 px-2 py-1.5 text-[11px] hover:bg-blue-50/60 cursor-pointer"
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

        <button
          type="button"
          onClick={() => setShowTextFilter((v) => !v)}
          className="text-[10px] text-blue-600 hover:underline"
        >
          {showTextFilter ? '▾ Değer listesi' : '▸ Metin filtresi'}
        </button>

        {showTextFilter && (
          <div className="space-y-2 pt-1 border-t border-gray-100">
            <select
              value={textMode}
              onChange={(e) => setTextMode(e.target.value as typeof textMode)}
              className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded"
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
              className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded"
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

        <div className="flex gap-1 pt-1 border-t">
          <button
            type="button"
            onClick={handleApplyValues}
            className="flex-1 px-2 py-1.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
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
}: DevExDataGridProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>(selectedRowIds || {});
  const [internalColumnVisibility, setInternalColumnVisibility] = useState<Record<string, boolean>>(columnVisibility || {});
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const filterColumnsRef = useRef<Map<string, Column<any, unknown>>>(new Map());
  const { isMobile, isTablet } = useResponsive();
  const { tm } = useLanguage();

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

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = table.getSelectedRowModel().rows.map(row => row.original);
      onSelectionChange(selectedRows);
    }
  }, [rowSelection]);

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
              className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              title="Tümü (Ctrl+A)"
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
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
          />
        </div>
      ),
      size: 40,
    };

    return [selectionColumn, ...columns];
  }, [columns, enableSelection, setRowSelection]);

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      columnVisibility: resolvedColumnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    ...(enablePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    enableRowSelection: true,
    filterFns: {
      gridColumnFilter: gridColumnFilterFn,
    },
    defaultColumn: {
      filterFn: 'gridColumnFilter',
      enableColumnFilter: enableFiltering,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  // Mobile Card View
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Mobile Cards */}
        <div className="flex-1 overflow-auto p-3 space-y-3">
          {table.getRowModel().rows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">{tm('noDataFound')}</div>
          ) : (
            table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className="bg-white border border-gray-200 shadow-sm rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3 active:scale-[0.98] transition-transform"
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

  const openFilterForHeader = useCallback(
    (headerId: string, anchorEl: HTMLElement, column: Column<any, unknown>) => {
      if (openFilterColumn === headerId) {
        closeFilterMenu();
        return;
      }
      filterColumnsRef.current.set(headerId, column);
      const rect = anchorEl.getBoundingClientRect();
      const menuWidth = 300;
      const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
      setFilterMenuAnchor({ top: rect.bottom + 4, left });
      setOpenFilterColumn(headerId);
    },
    [openFilterColumn, closeFilterMenu]
  );

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
      {enableColumnVisibility && showColumnVisibilityToolbar && (
        <div className="flex items-center justify-end gap-2 px-3 py-1.5 bg-gray-50 border border-gray-300 border-b-0 shrink-0">
          {enableFiltering && columnFilters.length > 0 && (
            <button
              type="button"
              onClick={() => {
                table.resetColumnFilters();
                closeFilterMenu();
              }}
              className="px-2 py-1 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
            >
              {tm('clear')} ({columnFilters.length})
            </button>
          )}
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
        </div>
      )}

      {/* Table Container */}
      <div className="flex-1 overflow-auto border border-gray-300 bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-30 bg-[#E3F2FD] shadow-[0_1px_0_0_rgba(0,0,0,0.08)]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-[#E3F2FD] border-b border-gray-300">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300 last:border-r-0 relative bg-[#E3F2FD]"
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
                          className={`p-0.5 hover:bg-gray-200 rounded transition-colors ${header.column.getFilterValue() ? 'text-blue-600' : 'text-gray-500'
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
                className={`border-b border-gray-200 hover:bg-[#BBDEFB] transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                  } ${enableSelection && row.getIsSelected() ? 'bg-blue-100/60' : ''}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-2 py-0.5 text-[10px] text-gray-800 border-r border-gray-200 last:border-r-0"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
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
              {table.getFilteredRowModel().rows.length} {tm('records')}
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
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {tm('show')} {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
