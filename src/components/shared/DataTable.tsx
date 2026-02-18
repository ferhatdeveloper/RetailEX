// Advanced DataTable Component - Enterprise Grade

import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  ChevronDown, 
  ChevronUp,
  ChevronsUpDown,
  Filter,
  X,
  Download,
  Settings,
  Search,
  Check,
  ArrowUpDown,
  Eye,
  EyeOff,
  Maximize2
} from 'lucide-react';

export interface Column<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => any);
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  sortable?: boolean;
  filterable?: boolean;
  pinned?: 'left' | 'right';
  hidden?: boolean;
  cell?: (value: any, row: T) => React.ReactNode;
  footer?: (data: T[]) => React.ReactNode;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  virtualScroll?: boolean;
  rowHeight?: number;
  maxHeight?: string;
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  onSelectionChange?: (selectedRows: T[]) => void;
  exportable?: boolean;
  searchable?: boolean;
  columnResizable?: boolean;
  stickyHeader?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns: initialColumns,
  virtualScroll = true,
  rowHeight = 48,
  maxHeight = '600px',
  onRowClick,
  selectable = false,
  onSelectionChange,
  exportable = true,
  searchable = true,
  columnResizable = true,
  stickyHeader = true,
  loading = false,
  emptyMessage = 'Veri bulunamadı',
  className = ''
}: DataTableProps<T>) {
  const [columns, setColumns] = useState(initialColumns);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [resizingColumn, setResizingColumn] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  
  const tableRef = useRef<HTMLDivElement>(null);
  const resizeStartX = useRef<number>(0);
  const resizeStartWidth = useRef<number>(0);

  // Get cell value
  const getCellValue = (row: T, column: Column<T>) => {
    if (typeof column.accessor === 'function') {
      return column.accessor(row);
    }
    return row[column.accessor];
  };

  // Filtered data
  const filteredData = useMemo(() => {
    let filtered = [...data];

    // Search
    if (searchQuery) {
      filtered = filtered.filter(row =>
        columns.some(col => {
          const value = getCellValue(row, col);
          return String(value).toLowerCase().includes(searchQuery.toLowerCase());
        })
      );
    }

    // Column filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        filtered = filtered.filter(row => {
          const column = columns.find(c => c.id === key);
          if (!column) return true;
          const cellValue = getCellValue(row, column);
          return String(cellValue).toLowerCase().includes(value.toLowerCase());
        });
      }
    });

    return filtered;
  }, [data, columns, searchQuery, filters]);

  // Sorted data
  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;

    return [...filteredData].sort((a, b) => {
      const column = columns.find(c => c.id === sortConfig.key);
      if (!column) return 0;

      const aValue = getCellValue(a, column);
      const bValue = getCellValue(b, column);

      if (aValue === bValue) return 0;

      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return (aValue - bValue) * direction;
      }

      return String(aValue).localeCompare(String(bValue), 'tr') * direction;
    });
  }, [filteredData, sortConfig, columns]);

  // Handle sort
  const handleSort = (columnId: string) => {
    setSortConfig(current => {
      if (!current || current.key !== columnId) {
        return { key: columnId, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key: columnId, direction: 'desc' };
      }
      return null;
    });
  };

  // Handle row selection
  const handleRowSelect = (index: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
    
    if (onSelectionChange) {
      const selectedData = Array.from(newSelected).map(i => sortedData[i]);
      onSelectionChange(selectedData);
    }
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedRows.size === sortedData.length) {
      setSelectedRows(new Set());
      onSelectionChange?.([]);
    } else {
      const allIndexes = new Set(sortedData.map((_, i) => i));
      setSelectedRows(allIndexes);
      onSelectionChange?.(sortedData);
    }
  };

  // Toggle column visibility
  const toggleColumn = (columnId: string) => {
    setColumns(prev =>
      prev.map(col =>
        col.id === columnId ? { ...col, hidden: !col.hidden } : col
      )
    );
  };

  // Export to CSV
  const exportToCSV = () => {
    const visibleColumns = columns.filter(c => !c.hidden);
    const headers = visibleColumns.map(c => c.header).join(',');
    const rows = sortedData.map(row =>
      visibleColumns.map(col => {
        const value = getCellValue(row, col);
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',')
    );

    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `export-${Date.now()}.csv`;
    link.click();
  };

  // Column resize handlers
  const startResize = (columnId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnId);
    resizeStartX.current = e.clientX;
    const column = columns.find(c => c.id === columnId);
    resizeStartWidth.current = columnWidths[columnId] || column?.width || 150;
  };

  useEffect(() => {
    if (!resizingColumn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX.current;
      const newWidth = Math.max(80, resizeStartWidth.current + diff);
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    };

    const handleMouseUp = () => {
      setResizingColumn(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn]);

  const visibleColumns = columns.filter(c => !c.hidden);

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      {/* Toolbar */}
      <div className="p-4 border-b flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          {/* Search */}
          {searchable && (
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tabloda ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Selected count */}
          {selectable && selectedRows.size > 0 && (
            <div className="text-sm text-gray-600">
              {selectedRows.size} seçili
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {exportable && (
            <button
              onClick={exportToCSV}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm"
            >
              <Download className="h-4 w-4" />
              <span>Export</span>
            </button>
          )}

          <button
            onClick={() => setShowColumnSettings(!showColumnSettings)}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm"
          >
            <Settings className="h-4 w-4" />
            <span>Sütunlar</span>
          </button>
        </div>
      </div>

      {/* Column Settings Dropdown */}
      {showColumnSettings && (
        <div className="absolute right-4 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-3">
          <div className="text-sm font-medium text-gray-900 mb-2">Sütun Görünürlüğü</div>
          <div className="space-y-1 max-h-64 overflow-auto">
            {columns.map(col => (
              <label
                key={col.id}
                className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!col.hidden}
                  onChange={() => toggleColumn(col.id)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">{col.header}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div 
        ref={tableRef}
        className="overflow-auto"
        style={{ maxHeight }}
      >
        <table className="w-full">
          {/* Header */}
          <thead className={`bg-gray-50 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            <tr>
              {selectable && (
                <th className="w-12 px-4 py-3 border-b">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === sortedData.length && sortedData.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600"
                  />
                </th>
              )}
              {visibleColumns.map(column => (
                <th
                  key={column.id}
                  className="px-4 py-3 border-b text-left relative group"
                  style={{ 
                    width: columnWidths[column.id] || column.width,
                    minWidth: column.minWidth,
                    maxWidth: column.maxWidth
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">
                      {column.header}
                    </span>
                    
                    {/* Sort */}
                    {column.sortable !== false && (
                      <button
                        onClick={() => handleSort(column.id)}
                        className="p-1 hover:bg-gray-200 rounded"
                      >
                        {sortConfig?.key === column.id ? (
                          sortConfig.direction === 'asc' ? (
                            <ChevronUp className="h-4 w-4 text-blue-600" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-blue-600" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    )}

                    {/* Filter */}
                    {column.filterable && (
                      <button
                        className="p-1 hover:bg-gray-200 rounded"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Filter className={`h-4 w-4 ${filters[column.id] ? 'text-blue-600' : 'text-gray-400'}`} />
                      </button>
                    )}
                  </div>

                  {/* Column Resize Handle */}
                  {columnResizable && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500 opacity-0 group-hover:opacity-100"
                      onMouseDown={(e) => startResize(column.id, e)}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span>Yükleniyor...</span>
                  </div>
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length + (selectable ? 1 : 0)}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row, index) => (
                <tr
                  key={index}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b hover:bg-gray-50 transition-colors ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${selectedRows.has(index) ? 'bg-blue-50' : ''}`}
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(index)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleRowSelect(index);
                        }}
                        className="w-4 h-4 text-blue-600"
                      />
                    </td>
                  )}
                  {visibleColumns.map(column => {
                    const value = getCellValue(row, column);
                    return (
                      <td
                        key={column.id}
                        className="px-4 py-3 text-sm text-gray-900"
                      >
                        {column.cell ? column.cell(value, row) : value}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between text-sm text-gray-600">
        <div>
          Toplam {sortedData.length} kayıt
          {searchQuery || Object.keys(filters).length > 0 ? (
            <span> ({data.length} kayıttan filtrelendi)</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

