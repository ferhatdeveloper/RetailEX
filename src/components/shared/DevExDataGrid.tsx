import { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  Column,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { useResponsive } from '../../hooks/useResponsive';
import { useLanguage } from '../../contexts/LanguageContext';

interface DevExDataGridProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enableColumnResizing?: boolean;
  enablePagination?: boolean;
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
  column: any;
  onClose: () => void;
}

function FilterMenu({ column, onClose }: { column: Column<any, unknown>; onClose: () => void }) {
  const { tm } = useLanguage();
  const filterValue = (column.getFilterValue() ?? '') as string;
  const [inputValue, setInputValue] = useState(filterValue);
  const [filterMode, setFilterMode] = useState<'contains' | 'equals' | 'startsWith' | 'endsWith' | 'range' | 'multiselect'>('contains');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);

  // Get unique values for multi-select
  const uniqueValues = Array.from(
    new Set(
      column.getFacetedRowModel().rows.map(row => {
        const value = row.getValue(column.id);
        return value != null ? String(value) : '';
      }).filter(Boolean)
    )
  ).sort();

  const handleApply = () => {
    if (filterMode === 'range' && dateFrom && dateTo) {
      column.setFilterValue({ mode: 'range', from: dateFrom, to: dateTo });
    } else if (filterMode === 'multiselect' && selectedValues.length > 0) {
      column.setFilterValue({ mode: 'multiselect', values: selectedValues });
    } else if (inputValue) {
      column.setFilterValue({ mode: filterMode, value: inputValue });
    }
    onClose();
  };

  const handleClear = () => {
    column.setFilterValue(undefined);
    setInputValue('');
    setDateFrom('');
    setDateTo('');
    setSelectedValues([]);
    onClose();
  };

  const toggleValue = (value: string) => {
    setSelectedValues(prev =>
      prev.includes(value)
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  };

  return (
    <div
      className="absolute top-full right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 min-w-[220px] max-w-[300px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2 space-y-2">
        {/* Filter Mode Selector */}
        <div>
          <label className="text-[9px] text-gray-600 block mb-1">{tm('filterType')}</label>
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as any)}
            className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="contains">{tm('contains')}</option>
            <option value="equals">{tm('equals')}</option>
            <option value="startsWith">{tm('startsWith')}</option>
            <option value="endsWith">{tm('endsWith')}</option>
            <option value="range">{tm('dateRange')}</option>
            <option value="multiselect">{tm('multiSelect')}</option>
          </select>
        </div>

        {/* Text Input for basic filters */}
        {!['range', 'multiselect'].includes(filterMode) && (
          <div>
            <label className="text-[9px] text-gray-600 block mb-1">{tm('value')}</label>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApply()}
              placeholder={tm('search') + '...'}
              className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
        )}

        {/* Date Range Inputs */}
        {filterMode === 'range' && (
          <div className="space-y-2">
            <div>
              <label className="text-[9px] text-gray-600 block mb-1">{tm('startDate')}</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-[9px] text-gray-600 block mb-1">{tm('endDate')}</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2 py-1 text-[10px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* Multi-select Checkboxes */}
        {filterMode === 'multiselect' && (
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded p-2">
            <div className="space-y-1">
              {uniqueValues.slice(0, 50).map(value => (
                <label key={value} className="flex items-center gap-2 text-[10px] hover:bg-gray-50 p-1 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(value)}
                    onChange={() => toggleValue(value)}
                    className="w-3 h-3"
                  />
                  <span className="flex-1 truncate">{value}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-1 pt-1 border-t">
          <button
            onClick={handleApply}
            className="flex-1 px-2 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            {tm('apply')}
          </button>
          <button
            onClick={handleClear}
            className="flex-1 px-2 py-1 text-[10px] bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
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
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null);
  const { isMobile, isTablet } = useResponsive();
  const { tm } = useLanguage();

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

  // Custom filter function for DevExpress-style operators
  const customFilterFn = (row: any, columnId: string, filterValue: any) => {
    if (!filterValue || typeof filterValue !== 'object') {
      return true;
    }

    const { operator, value } = filterValue;
    const cellValue = String(row.getValue(columnId) || '').toLowerCase();
    const searchValue = String(value).toLowerCase();

    switch (operator) {
      case 'contains':
        return cellValue.includes(searchValue);
      case 'equals':
        return cellValue === searchValue;
      case 'startsWith':
        return cellValue.startsWith(searchValue);
      case 'endsWith':
        return cellValue.endsWith(searchValue);
      case 'notContains':
        return !cellValue.includes(searchValue);
      default:
        return true;
    }
  };

  const finalColumns = useMemo(() => {
    if (!enableSelection) return columns;

    const selectionColumn: ColumnDef<T, any> = {
      id: 'select',
      header: ({ table }) => (
        <div className="px-1">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        </div>
      ),
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
  }, [columns, enableSelection]);

  const table = useReactTable({
    data,
    columns: finalColumns,
    state: {
      sorting,
      columnFilters,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
    filterFns: {
      custom: customFilterFn,
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
      </div>
    );
  }

  // Desktop Table View
  return (
    <div className="flex flex-col h-full" style={{ height: height }}>
      {/* Table Container */}
      <div className="flex-1 overflow-auto border border-gray-300 bg-white">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-[1]">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-[#E3F2FD] border-b border-gray-300">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300 last:border-r-0 relative"
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

                      {/* Filter Icon */}
                      {header.column.getCanFilter() && header.id !== 'select' && header.id !== 'actions' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenFilterColumn(openFilterColumn === header.id ? null : header.id);
                          }}
                          className={`p-0.5 hover:bg-gray-200 rounded transition-colors ${header.column.getFilterValue() ? 'text-blue-600' : 'text-gray-500'
                            }`}
                          title="Filter"
                        >
                          <Filter className="w-2.5 h-2.5" />
                        </button>
                      )}

                      {/* Filter Menu */}
                      {openFilterColumn === header.id && (
                        <FilterMenu
                          column={header.column}
                          onClose={() => setOpenFilterColumn(null)}
                        />
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
                onClick={() => onRowClick?.(row.original)}
                onDoubleClick={() => onRowDoubleClick?.(row.original)}
                onContextMenu={(e) => onRowContextMenu?.(e, row.original)}
                className={`border-b border-gray-200 hover:bg-[#BBDEFB] transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                  }`}
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

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white border-t border-gray-200">
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
            {[10, 15, 20, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {tm('show')} {size}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
