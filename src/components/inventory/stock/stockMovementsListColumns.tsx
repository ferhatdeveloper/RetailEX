import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { Trash2 } from 'lucide-react';
import type { StockMovement } from '../../../services/stockMovementAPI';
import { labelStockSlipDocumentType } from '../../../services/stockMovementAPI';
import { formatShortDate } from '../../../utils/dateLocale';

export const STOCK_MOVEMENTS_COLUMN_VISIBILITY_KEY = 'retailex_stockMovements_columnVisibility_v1';
export const STOCK_MOVEMENTS_COLUMN_ORDER_KEY = 'retailex_stockMovements_columnOrder_v1';

export type StockMovementsListColumnId =
  | 'document_type'
  | 'document_no'
  | 'movement_date'
  | 'warehouse'
  | 'target_warehouse'
  | 'movement_type'
  | 'description'
  | 'status'
  | 'actions';

type ColumnMeta = {
  id: StockMovementsListColumnId;
  labelKey: string;
  fallback: string;
  defaultVisible: boolean;
};

export const STOCK_MOVEMENTS_COLUMN_META: Record<StockMovementsListColumnId, ColumnMeta> = {
  document_type: {
    id: 'document_type',
    labelKey: 'documentType',
    fallback: 'Belge Türü',
    defaultVisible: true,
  },
  document_no: {
    id: 'document_no',
    labelKey: 'slipNo',
    fallback: 'Fiş No',
    defaultVisible: true,
  },
  movement_date: {
    id: 'movement_date',
    labelKey: 'date',
    fallback: 'Tarih',
    defaultVisible: true,
  },
  warehouse: {
    id: 'warehouse',
    labelKey: 'warehouse',
    fallback: 'Depo',
    defaultVisible: true,
  },
  target_warehouse: {
    id: 'target_warehouse',
    labelKey: 'targetWarehouse',
    fallback: 'Hedef Depo',
    defaultVisible: false,
  },
  movement_type: {
    id: 'movement_type',
    labelKey: 'movementType',
    fallback: 'Hareket',
    defaultVisible: false,
  },
  description: {
    id: 'description',
    labelKey: 'description',
    fallback: 'Açıklama',
    defaultVisible: false,
  },
  status: {
    id: 'status',
    labelKey: 'status',
    fallback: 'Durum',
    defaultVisible: false,
  },
  actions: {
    id: 'actions',
    labelKey: 'actions',
    fallback: 'İşlemler',
    defaultVisible: true,
  },
};

export const STOCK_MOVEMENTS_COLUMN_ORDER = Object.keys(
  STOCK_MOVEMENTS_COLUMN_META,
) as StockMovementsListColumnId[];

export function defaultStockMovementsColumnVisibility(): Record<string, boolean> {
  return Object.fromEntries(
    STOCK_MOVEMENTS_COLUMN_ORDER.map((id) => [id, STOCK_MOVEMENTS_COLUMN_META[id].defaultVisible]),
  );
}

export function loadStockMovementsColumnVisibility(): Record<string, boolean> {
  const defaults = defaultStockMovementsColumnVisibility();
  try {
    const raw = localStorage.getItem(STOCK_MOVEMENTS_COLUMN_VISIBILITY_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Object.fromEntries(
      STOCK_MOVEMENTS_COLUMN_ORDER.map((id) => [id, parsed[id] ?? defaults[id]]),
    );
  } catch {
    return defaults;
  }
}

export function saveStockMovementsColumnVisibility(visibility: Record<string, boolean>): void {
  try {
    localStorage.setItem(STOCK_MOVEMENTS_COLUMN_VISIBILITY_KEY, JSON.stringify(visibility));
  } catch {
    /* quota / private mode */
  }
}

function warehouseName(row: StockMovement): string {
  return String((row as StockMovement & { warehouses?: { name?: string } }).warehouses?.name || '').trim();
}

function targetWarehouseName(row: StockMovement): string {
  const r = row as StockMovement & {
    target_warehouses?: { name?: string };
    target_warehouse_name?: string;
  };
  return String(r.target_warehouses?.name || r.target_warehouse_name || '').trim();
}

const columnHelper = createColumnHelper<StockMovement>();

export function buildStockMovementsListColumns(options: {
  tm: (key: string) => string;
  onDelete: (id: string) => void;
}): ColumnDef<StockMovement, any>[] {
  const { tm, onDelete } = options;
  const label = (id: StockMovementsListColumnId) =>
    tm(STOCK_MOVEMENTS_COLUMN_META[id].labelKey) || STOCK_MOVEMENTS_COLUMN_META[id].fallback;

  return [
    columnHelper.accessor(
      (row) => labelStockSlipDocumentType(tm, row.trcode, row.movement_type),
      {
        id: 'document_type',
        header: label('document_type'),
        cell: (info) => (
          <span className="font-medium text-gray-800 whitespace-nowrap">{info.getValue() || '—'}</span>
        ),
        size: 220,
      },
    ),
    columnHelper.accessor('document_no', {
      id: 'document_no',
      header: label('document_no'),
      cell: (info) => (
        <span className="font-mono font-medium text-gray-700 whitespace-nowrap">
          {info.getValue() || '—'}
        </span>
      ),
      size: 140,
    }),
    columnHelper.accessor('movement_date', {
      id: 'movement_date',
      header: label('movement_date'),
      cell: (info) => (
        <span className="text-gray-600 whitespace-nowrap">{formatShortDate(info.getValue())}</span>
      ),
      size: 110,
    }),
    columnHelper.accessor((row) => warehouseName(row) || '—', {
      id: 'warehouse',
      header: label('warehouse'),
      cell: (info) => <span className="text-gray-600">{info.getValue()}</span>,
      size: 160,
    }),
    columnHelper.accessor((row) => targetWarehouseName(row) || '—', {
      id: 'target_warehouse',
      header: label('target_warehouse'),
      cell: (info) => <span className="text-gray-600">{info.getValue()}</span>,
      size: 160,
    }),
    columnHelper.accessor('movement_type', {
      id: 'movement_type',
      header: label('movement_type'),
      cell: (info) => {
        const v = String(info.getValue() || '');
        const text =
          v === 'in'
            ? tm('in') || 'Giriş'
            : v === 'out'
              ? tm('out') || 'Çıkış'
              : v === 'transfer'
                ? tm('slipInterWarehouseTransfer') || 'Transfer'
                : v || '—';
        return <span className="text-gray-600 whitespace-nowrap">{text}</span>;
      },
      size: 100,
    }),
    columnHelper.accessor((row) => row.description || '—', {
      id: 'description',
      header: label('description'),
      cell: (info) => <span className="text-gray-600 truncate max-w-[240px] block">{info.getValue()}</span>,
      size: 200,
    }),
    columnHelper.accessor('status', {
      id: 'status',
      header: label('status'),
      cell: (info) => <span className="text-gray-600 whitespace-nowrap">{info.getValue() || '—'}</span>,
      size: 100,
    }),
    columnHelper.display({
      id: 'actions',
      header: label('actions'),
      enableColumnFilter: false,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <button
            type="button"
            className="h-7 w-7 p-0 inline-flex items-center justify-center rounded hover:bg-red-50 hover:text-red-600 text-gray-500 transition-colors"
            title={tm('delete') || 'Sil'}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row.original.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
      size: 80,
    }),
  ];
}
