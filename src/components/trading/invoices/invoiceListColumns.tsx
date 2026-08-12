import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import type { ComponentType } from 'react';
import type { Invoice } from '../../../core/types';
import { formatNumber } from '../../../utils/formatNumber';
import { paymentFormCodeTranslationKey } from '../../../utils/paymentMethodUtils';
import { getInvoiceHeaderField } from '../../../utils/invoiceHeaderFields';
import { Eye, Edit, FileText } from 'lucide-react';

export const INVOICE_LIST_COLUMN_VISIBILITY_KEY = 'retailex_invoiceList_columnVisibility_v1';

export type ListInvoice = Invoice & {
  trcode?: number;
  date?: string;
  document_no?: string;
  header_fields?: Record<string, unknown>;
};

export type InvoiceListColumnId =
  | 'invoice_no'
  | 'document_no'
  | 'customer_name'
  | 'invoice_date'
  | 'invoice_type'
  | 'special_code'
  | 'trading_group'
  | 'authorization'
  | 'payment_method'
  | 'warehouse'
  | 'workplace'
  | 'salesperson'
  | 'cashier'
  | 'subtotal'
  | 'discount'
  | 'tax'
  | 'total'
  | 'currency'
  | 'currency_rate'
  | 'total_cost'
  | 'gross_profit'
  | 'profit_margin'
  | 'notes'
  | 'created_at'
  | 'status';

type ColumnMeta = {
  id: InvoiceListColumnId;
  labelKey: string;
  defaultVisible: boolean;
};

export const INVOICE_LIST_COLUMN_META: Record<InvoiceListColumnId, ColumnMeta> = {
  invoice_no: { id: 'invoice_no', labelKey: 'invoiceNo', defaultVisible: true },
  document_no: { id: 'document_no', labelKey: 'documentNo', defaultVisible: false },
  customer_name: { id: 'customer_name', labelKey: 'customerSupplier', defaultVisible: true },
  invoice_date: { id: 'invoice_date', labelKey: 'date', defaultVisible: true },
  invoice_type: { id: 'invoice_type', labelKey: 'invoiceType', defaultVisible: true },
  special_code: { id: 'special_code', labelKey: 'specialCode', defaultVisible: false },
  trading_group: { id: 'trading_group', labelKey: 'tradingGroup', defaultVisible: false },
  authorization: { id: 'authorization', labelKey: 'authorization', defaultVisible: false },
  payment_method: { id: 'payment_method', labelKey: 'payments', defaultVisible: false },
  warehouse: { id: 'warehouse', labelKey: 'warehouseField', defaultVisible: false },
  workplace: { id: 'workplace', labelKey: 'workplace', defaultVisible: false },
  salesperson: { id: 'salesperson', labelKey: 'salespersonLabel', defaultVisible: false },
  cashier: { id: 'cashier', labelKey: 'cashier', defaultVisible: true },
  subtotal: { id: 'subtotal', labelKey: 'subtotal', defaultVisible: false },
  discount: { id: 'discount', labelKey: 'discount', defaultVisible: false },
  tax: { id: 'tax', labelKey: 'tax', defaultVisible: false },
  total: { id: 'total', labelKey: 'total', defaultVisible: true },
  currency: { id: 'currency', labelKey: 'currency', defaultVisible: false },
  currency_rate: { id: 'currency_rate', labelKey: 'exchangeRate', defaultVisible: false },
  total_cost: { id: 'total_cost', labelKey: 'cost', defaultVisible: false },
  gross_profit: { id: 'gross_profit', labelKey: 'profit', defaultVisible: false },
  profit_margin: { id: 'profit_margin', labelKey: 'profitPercent', defaultVisible: false },
  notes: { id: 'notes', labelKey: 'description', defaultVisible: false },
  created_at: { id: 'created_at', labelKey: 'createdAt', defaultVisible: false },
  status: { id: 'status', labelKey: 'status', defaultVisible: true },
};

export const INVOICE_LIST_COLUMN_ORDER = Object.keys(INVOICE_LIST_COLUMN_META) as InvoiceListColumnId[];

export function defaultInvoiceListColumnVisibility(): Record<string, boolean> {
  return Object.fromEntries(
    INVOICE_LIST_COLUMN_ORDER.map((id) => [id, INVOICE_LIST_COLUMN_META[id].defaultVisible]),
  );
}

export function loadInvoiceListColumnVisibility(): Record<string, boolean> {
  const defaults = defaultInvoiceListColumnVisibility();
  try {
    const raw = localStorage.getItem(INVOICE_LIST_COLUMN_VISIBILITY_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Object.fromEntries(
      INVOICE_LIST_COLUMN_ORDER.map((id) => [id, parsed[id] ?? defaults[id]]),
    );
  } catch {
    return defaults;
  }
}

export function invoiceListColumnVisibilityMenuItems(options: {
  columnVisibility: Record<string, boolean>;
  tm: (key: string) => string;
  cashierLabel?: string;
}): { id: string; label: string; visible: boolean }[] {
  const { columnVisibility, tm, cashierLabel } = options;
  return INVOICE_LIST_COLUMN_ORDER.map((id) => {
    const meta = INVOICE_LIST_COLUMN_META[id];
    let label = tm(meta.labelKey);
    if (id === 'cashier' && cashierLabel) label = cashierLabel;
    return {
      id,
      label,
      visible: columnVisibility[id] !== false,
    };
  });
}

type InvoiceTypeMeta = {
  code: number;
  name: string;
  category: string;
  icon: string;
  translationKey: string;
};

export type BuildInvoiceListColumnsOptions = {
  columnVisibility: Record<string, boolean>;
  tm: (key: string) => string;
  localeCode: string;
  invoiceTypes: InvoiceTypeMeta[];
  getIcon: (iconName: string) => ComponentType<{ className?: string }>;
  returnProcessorColumnLabel: string;
  resolveListRowCurrency: (inv: ListInvoice) => string;
  onViewDetail: (inv: ListInvoice) => void;
  onEdit: (inv: ListInvoice) => void;
};

const columnHelper = createColumnHelper<ListInvoice>();

function resolveInvoiceTypeCode(invoice: ListInvoice): number | undefined {
  let code = invoice.invoice_type;
  if (code === undefined || code === null) {
    if (invoice.source === 'pos' || invoice.cashier) code = 1;
    else code = 0;
  }
  return code;
}

export function buildInvoiceListColumns(options: BuildInvoiceListColumnsOptions): ColumnDef<ListInvoice, unknown>[] {
  const {
    columnVisibility,
    tm,
    localeCode,
    invoiceTypes,
    getIcon,
    returnProcessorColumnLabel,
    resolveListRowCurrency,
    onViewDetail,
    onEdit,
  } = options;

  const isVisible = (id: InvoiceListColumnId) => columnVisibility[id] !== false;

  const formatDate = (dateValue: string | undefined) => {
    if (!dateValue) return '—';
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return tm('invalidDate');
      return date.toLocaleDateString(localeCode, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const statusColors: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    unpaid: 'bg-amber-100 text-amber-800',
    paid: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    refunded: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-700',
  };

  const defs: ColumnDef<ListInvoice, unknown>[] = [];

  if (isVisible('invoice_no')) {
    defs.push(
      columnHelper.accessor('invoice_no', {
        id: 'invoice_no',
        header: tm('invoiceNo'),
        cell: (info) => <span className="text-blue-700 font-semibold">{info.getValue()}</span>,
      }),
    );
  }

  if (isVisible('document_no')) {
    defs.push(
      columnHelper.display({
        id: 'document_no',
        header: tm('documentNo'),
        cell: ({ row }) => {
          const inv = row.original;
          const doc =
            String(inv.document_no || '').trim() ||
            getInvoiceHeaderField(inv, 'documentNo') ||
            '—';
          return <span className="text-gray-800">{doc}</span>;
        },
      }),
    );
  }

  if (isVisible('customer_name')) {
    defs.push(
      columnHelper.accessor('customer_name', {
        id: 'customer_name',
        header: tm('customerSupplier'),
        cell: (info) => (
          <span className="text-gray-900 font-medium">{info.getValue() || tm('noCustomer')}</span>
        ),
      }),
    );
  }

  if (isVisible('invoice_date')) {
    defs.push(
      columnHelper.accessor('invoice_date', {
        id: 'invoice_date',
        header: tm('date'),
        cell: (info) => {
          const inv = info.row.original;
          return <span className="tabular-nums">{formatDate(info.getValue() || inv.date)}</span>;
        },
      }),
    );
  }

  if (isVisible('invoice_type')) {
    defs.push(
      columnHelper.display({
        id: 'invoice_type',
        header: () => <span className="font-semibold">{tm('invoiceType')}</span>,
        cell: ({ row }) => {
          const invoice = row.original;
          const invoiceTypeCode = resolveInvoiceTypeCode(invoice);
          const invoiceType = invoiceTypes.find((t) => t.code === invoiceTypeCode);
          if (invoiceType) {
            const IconComponent = getIcon(invoiceType.icon);
            return (
              <div className="flex items-center gap-2 min-w-[120px]">
                <IconComponent className="w-4 h-4 text-gray-600 flex-shrink-0" />
                <span className="text-sm font-medium text-gray-900">{invoiceType.name}</span>
              </div>
            );
          }
          if (invoice.invoice_category) {
            const categoryType = invoiceTypes.find((t) => t.category === invoice.invoice_category);
            if (categoryType) {
              const IconComponent = getIcon(categoryType.icon);
              return (
                <div className="flex items-center gap-2 min-w-[120px]">
                  <IconComponent className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900">{tm(categoryType.translationKey)}</span>
                </div>
              );
            }
          }
          return (
            <div className="flex items-center gap-2 min-w-[120px]">
              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-sm text-gray-600">{tm('salesInvoices')}</span>
            </div>
          );
        },
        enableSorting: false,
      }),
    );
  }

  const headerCol = (
    id: InvoiceListColumnId,
    field: Parameters<typeof getInvoiceHeaderField>[1],
    labelKey: string,
  ) => {
    if (!isVisible(id)) return;
    defs.push(
      columnHelper.display({
        id,
        header: tm(labelKey),
        cell: ({ row }) => {
          const val = getInvoiceHeaderField(row.original, field);
          return <span className="text-sm text-gray-800">{val || '—'}</span>;
        },
      }),
    );
  };

  headerCol('special_code', 'specialCode', 'specialCode');
  headerCol('trading_group', 'tradingGroup', 'tradingGroup');
  headerCol('authorization', 'authorizationCode', 'authorization');
  headerCol('warehouse', 'warehouse', 'warehouseField');
  headerCol('workplace', 'workplace', 'workplace');
  headerCol('salesperson', 'salespersonCode', 'salespersonLabel');

  if (isVisible('payment_method')) {
    defs.push(
      columnHelper.accessor('payment_method', {
        id: 'payment_method',
        header: tm('payments'),
        cell: (info) => {
          const raw = String(info.getValue() || '').trim();
          if (!raw) return <span>—</span>;
          const key = paymentFormCodeTranslationKey(raw);
          const label = key === 'openTerms' ? raw : tm(key);
          return <span className="text-sm text-gray-800">{label}</span>;
        },
      }),
    );
  }

  if (isVisible('cashier')) {
    defs.push(
      columnHelper.accessor('cashier', {
        id: 'cashier',
        header: returnProcessorColumnLabel,
        cell: (info) => <span className="text-sm font-medium text-gray-900">{info.getValue() || '—'}</span>,
      }),
    );
  }

  const moneyCol = (
    id: 'subtotal' | 'discount' | 'tax' | 'total' | 'total_cost' | 'gross_profit',
    labelKey: string,
    pick: (inv: ListInvoice) => number,
    bold = false,
  ) => {
    if (!isVisible(id)) return;
    defs.push(
      columnHelper.display({
        id,
        header: tm(labelKey),
        cell: ({ row }) => {
          const inv = row.original;
          const value = pick(inv);
          const cur = resolveListRowCurrency(inv);
          return (
            <span className={`tabular-nums ${bold ? 'font-bold text-gray-900' : 'text-gray-800'}`}>
              {formatNumber(value, 2, true)} {cur}
            </span>
          );
        },
      }),
    );
  };

  moneyCol('subtotal', 'subtotal', (inv) => Number(inv.subtotal || 0));
  moneyCol('discount', 'discount', (inv) => Number(inv.discount || 0));
  moneyCol('tax', 'tax', (inv) => Number(inv.tax || 0));
  moneyCol('total', 'total', (inv) => Number(inv.total_amount ?? inv.total ?? 0), true);
  moneyCol('total_cost', 'cost', (inv) => Number(inv.total_cost || 0));
  moneyCol('gross_profit', 'profit', (inv) => Number(inv.gross_profit || 0));

  if (isVisible('profit_margin')) {
    defs.push(
      columnHelper.accessor('profit_margin', {
        id: 'profit_margin',
        header: tm('profitPercent'),
        cell: (info) => {
          const v = Number(info.getValue() || 0);
          return <span className="tabular-nums">{formatNumber(v, 2, true)}%</span>;
        },
      }),
    );
  }

  if (isVisible('currency')) {
    defs.push(
      columnHelper.accessor('currency', {
        id: 'currency',
        header: tm('currency'),
        cell: (info) => <span>{info.getValue() || '—'}</span>,
      }),
    );
  }

  if (isVisible('currency_rate')) {
    defs.push(
      columnHelper.accessor('currency_rate', {
        id: 'currency_rate',
        header: tm('exchangeRate'),
        cell: (info) => <span className="tabular-nums">{formatNumber(Number(info.getValue() || 1), 4, true)}</span>,
      }),
    );
  }

  if (isVisible('notes')) {
    defs.push(
      columnHelper.accessor('notes', {
        id: 'notes',
        header: tm('description'),
        cell: (info) => (
          <span className="text-sm text-gray-700 max-w-[240px] truncate block" title={String(info.getValue() || '')}>
            {info.getValue() || '—'}
          </span>
        ),
      }),
    );
  }

  if (isVisible('created_at')) {
    defs.push(
      columnHelper.accessor('created_at', {
        id: 'created_at',
        header: tm('createdAt'),
        cell: (info) => <span className="tabular-nums text-sm">{formatDate(info.getValue())}</span>,
      }),
    );
  }

  if (isVisible('status')) {
    defs.push(
      columnHelper.accessor('status', {
        id: 'status',
        header: tm('status'),
        cell: (info) => {
          const status = info.getValue() ?? '';
          const colorClass = (status ? statusColors[status] : undefined) || 'bg-gray-100 text-gray-700';
          const localizedStatus = status ? tm(status) || status : '—';
          return (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}>{localizedStatus}</span>
          );
        },
      }),
    );
  }

  defs.push(
    columnHelper.display({
      id: 'actions',
      header: tm('actions'),
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetail(row.original);
            }}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title={tm('viewDetails')}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(row.original);
            }}
            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
            title={tm('edit')}
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      ),
    }),
  );

  return defs;
}
