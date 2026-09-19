import { useEffect, useState } from 'react';
import { AlertTriangle, FileMinus, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { createColumnHelper } from '@tanstack/react-table';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { REPORT_GRID_DEFAULTS } from './shared/ReportDataGrid';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../shared/PercentBodyModal';
import {
  EXPIRY_REPORT_ALL_FUTURE,
  EXPIRY_REPORT_ALL_RECORDED,
  EXPIRY_REPORT_DEFAULT_DAYS,
  expiryReportsAPI,
  type ExpiringPurchaseItem,
} from '../../services/api/expiryReports';
import { useLanguage } from '../../contexts/LanguageContext';
import { displayItemCode } from '../../utils/lastPurchaseCostSql';
import { formatNumber } from '../../utils/formatNumber';
import { expiryReturnLineAmounts } from '../../utils/expiryPurchaseReturn';

export function PurchaseExpiryReport() {
  const { tm } = useLanguage();
  const [rows, setRows] = useState<ExpiringPurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysAhead, setDaysAhead] = useState(EXPIRY_REPORT_DEFAULT_DAYS);
  const [pending, setPending] = useState<ExpiringPurchaseItem | null>(null);
  const [returnQty, setReturnQty] = useState('');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await expiryReportsAPI.getExpiringPurchaseItems(daysAhead));
    } catch (e: unknown) {
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [daysAhead]);

  const rowKey = (row: ExpiringPurchaseItem) =>
    `${row.invoiceId}|${row.saleItemId || ''}|${row.itemCode}|${row.expiryDate}|${row.batchNo || ''}`;

  const openReturn = async (row: ExpiringPurchaseItem) => {
    const key = rowKey(row);
    setResolvingId(key);
    try {
      const source = await expiryReportsAPI.resolveReturnSource(row);
      if (!source?.supplierId) {
        toast.error(tm('expiryReturnNoSupplier'));
        return;
      }
      setPending(source);
      setReturnQty(String(source.quantity || row.quantity || ''));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : tm('expiryReturnFailed'));
    } finally {
      setResolvingId(null);
    }
  };

  const closeReturn = () => {
    if (saving) return;
    setPending(null);
    setReturnQty('');
  };

  const confirmReturn = async () => {
    if (!pending) return;
    const qty = Number(String(returnQty).replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error(tm('expiryReturnQtyInvalid'));
      return;
    }
    setSaving(true);
    try {
      const saved = await expiryReportsAPI.createPurchaseReturn(pending, qty);
      toast.success(tm('expiryReturnSaved').replace('{no}', saved.invoice_no || ''));
      window.dispatchEvent(new CustomEvent('invoiceCreated', {
        detail: { category: 'Iade', invoiceNo: saved.invoice_no, invoiceType: 6 },
      }));
      setPending(null);
      setReturnQty('');
      await load();
    } catch (e: unknown) {
      const code = e instanceof Error ? e.message : '';
      if (code === 'NO_SUPPLIER') toast.error(tm('expiryReturnNoSupplier'));
      else if (code === 'INVALID_QTY') toast.error(tm('expiryReturnQtyInvalid'));
      else toast.error(tm('expiryReturnFailed'));
    } finally {
      setSaving(false);
    }
  };

  const preview = pending
    ? expiryReturnLineAmounts({
        quantity: Number(String(returnQty).replace(',', '.')) || 0,
        unitPrice: Number(pending.unitPrice) || 0,
        discountRate: pending.discountRate,
        vatRate: pending.vatRate,
      })
    : null;

  const columnHelper = createColumnHelper<ExpiringPurchaseItem>();
  const columns = [
    columnHelper.accessor('expiryDate', {
      header: 'SKT',
      cell: info => {
        const row = info.row.original;
        const expired = row.daysLeft < 0;
        const urgent = row.daysLeft <= 1;
        const label = expired ? `${Math.abs(row.daysLeft)} g. geçti` : `${row.daysLeft} gün`;
        return (
          <span className={`rounded-full px-2 py-1 text-xs font-black ${expired || urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
            {info.getValue()} · {label}
          </span>
        );
      },
      size: 150,
    }),
    columnHelper.accessor('itemName', {
      header: tm('product'),
      cell: info => {
        const code = displayItemCode(info.row.original.itemCode);
        return (
          <div className="flex flex-col">
            <span className="font-semibold text-slate-900">{info.getValue()}</span>
            {code !== '—' ? (
              <span className="font-mono text-xs text-slate-500">{code}</span>
            ) : null}
          </div>
        );
      },
    }),
    columnHelper.accessor('quantity', {
      header: tm('quantity'),
      cell: info => `${info.getValue()} ${info.row.original.unit}`,
      size: 110,
    }),
    columnHelper.accessor('supplierName', {
      header: tm('expirySupplierAccount'),
      cell: info => info.getValue() || '-',
      size: 180,
    }),
    columnHelper.accessor('invoiceNo', {
      header: tm('expiryPurchaseInvoice'),
      cell: info => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-blue-700">{info.getValue() || '-'}</span>
          <span className="text-xs text-slate-500">{info.row.original.invoiceDate}</span>
        </div>
      ),
      size: 150,
    }),
    columnHelper.accessor('batchNo', {
      header: tm('expiryBatch'),
      cell: info => info.getValue() || '-',
      size: 100,
    }),
    columnHelper.display({
      id: 'returnHint',
      header: tm('purchaseReturn'),
      cell: ({ row }) => {
        const busy = resolvingId === rowKey(row.original);
        return (
          <button
            type="button"
            disabled={busy || saving}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void openReturn(row.original);
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
            title={tm('expiryReturnHint')}
          >
            <FileMinus className="h-3.5 w-3.5" />
            {busy ? tm('expiryReturnResolving') : tm('expiryReturnButton')}
          </button>
        );
      },
      size: 110,
    }),
  ];

  const rangeLabel =
    daysAhead === EXPIRY_REPORT_ALL_RECORDED
      ? tm('expiryAllRecorded')
      : daysAhead === EXPIRY_REPORT_ALL_FUTURE
        ? tm('expiryAllFuture')
        : daysAhead === 0
          ? tm('expiryToday')
          : daysAhead === 3
            ? tm('expiryNext3')
            : daysAhead === 7
              ? tm('expiryNext7')
              : daysAhead === 30
                ? tm('expiryNext30')
                : daysAhead === 90
                  ? tm('expiryNext90')
                  : daysAhead === 365
                    ? tm('expiryNext365')
                    : `${daysAhead} gün`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="border-b border-red-200 bg-gradient-to-r from-red-500 to-orange-500 px-5 py-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">{tm('purchaseExpiryReportTitle')}</h2>
              <p className="text-xs font-semibold text-red-100">{tm('purchaseExpiryReportSubtitle')}</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-xs font-bold hover:bg-white/25">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 p-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              {tm('expiryRange')}
              <select
                value={daysAhead}
                onChange={e => setDaysAhead(Number(e.target.value))}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value={EXPIRY_REPORT_ALL_RECORDED}>{tm('expiryAllRecorded')}</option>
                <option value={EXPIRY_REPORT_ALL_FUTURE}>{tm('expiryAllFuture')}</option>
                <option value={0}>{tm('expiryToday')}</option>
                <option value={3}>{tm('expiryNext3')}</option>
                <option value={7}>{tm('expiryNext7')}</option>
                <option value={30}>{tm('expiryNext30')}</option>
                <option value={90}>{tm('expiryNext90')}</option>
                <option value={365}>{tm('expiryNext365')}</option>
              </select>
            </label>
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-500">{tm('expiryRangeHint')}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {!loading && error ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="text-sm font-bold text-slate-700">{tm('noDataFound')}</p>
              <p className="max-w-lg text-xs font-medium text-red-600">{error}</p>
            </div>
          ) : !loading && rows.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm font-bold text-slate-700">{tm('noDataFound')}</p>
              <p className="max-w-lg text-xs font-medium text-slate-500">
                {tm('expiryEmptyHint').replace('{range}', rangeLabel)}
              </p>
            </div>
          ) : (
            <DevExDataGrid data={rows} columns={columns} {...REPORT_GRID_DEFAULTS} height="100%" />
          )}
        </div>
      </div>

      {pending ? (
        <PercentBodyModal size="form" onClose={closeReturn} ariaLabel={tm('expiryReturnConfirmTitle')}>
          <div className="flex min-h-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 bg-orange-600 px-4 py-3 text-white">
              <div>
                <h3 className="text-sm font-black uppercase tracking-tight">{tm('expiryReturnConfirmTitle')}</h3>
                <p className="text-[11px] font-medium text-orange-100">{tm('expiryReturnConfirmHint')}</p>
              </div>
              <button type="button" onClick={closeReturn} className="rounded-lg p-1 hover:bg-white/10" aria-label={tm('cancel')}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <PercentBodyModalScrollBody className="space-y-3 p-4 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="font-bold text-slate-500">{tm('expirySupplierAccount')}</div>
                  <div className="font-semibold text-slate-900">{pending.supplierName || '-'}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="font-bold text-slate-500">{tm('expiryReturnSourceInvoice')}</div>
                  <div className="font-mono font-semibold text-blue-700">{pending.invoiceNo || '-'}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 col-span-2">
                  <div className="font-bold text-slate-500">{tm('product')}</div>
                  <div className="font-semibold text-slate-900">{pending.itemName}</div>
                  <div className="font-mono text-[11px] text-slate-500">{displayItemCode(pending.itemCode)}</div>
                </div>
              </div>
              <label className="block text-xs font-bold text-slate-600">
                {tm('quantity')}
                <input
                  type="text"
                  inputMode="decimal"
                  value={returnQty}
                  onChange={(e) => setReturnQty(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                />
              </label>
              {preview ? (
                <p className="text-xs font-medium text-slate-600">
                  {tm('expiryReturnAmount')}: {formatNumber(preview.total, 2, false)}
                </p>
              ) : null}
            </PercentBodyModalScrollBody>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                disabled={saving}
                onClick={closeReturn}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-white"
              >
                {tm('cancel')}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void confirmReturn()}
                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {saving ? tm('expiryReturnSaving') : tm('confirm')}
              </button>
            </div>
          </div>
        </PercentBodyModal>
      ) : null}
    </div>
  );
}
