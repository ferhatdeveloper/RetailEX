import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileMinus, RefreshCw, Search } from 'lucide-react';
import { createColumnHelper } from '@tanstack/react-table';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import {
  EXPIRY_REPORT_ALL_FUTURE,
  EXPIRY_REPORT_ALL_RECORDED,
  expiryReportsAPI,
  type ExpiringPurchaseItem,
} from '../../services/api/expiryReports';
import { useLanguage } from '../../contexts/LanguageContext';

export function PurchaseExpiryReport() {
  const { tm } = useLanguage();
  const [rows, setRows] = useState<ExpiringPurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Varsayılan: kayıtlı tüm SKT (geçmiş dahil) — berzin gibi süresi geçmiş kayıtlar da görünsün
  const [daysAhead, setDaysAhead] = useState(EXPIRY_REPORT_ALL_RECORDED);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return rows;
    return rows.filter(row =>
      row.itemName.toLocaleLowerCase('tr-TR').includes(q) ||
      row.itemCode.toLocaleLowerCase('tr-TR').includes(q) ||
      row.supplierName.toLocaleLowerCase('tr-TR').includes(q) ||
      row.invoiceNo.toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [rows, search]);

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
      cell: info => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{info.getValue()}</span>
          <span className="font-mono text-xs text-slate-500">{info.row.original.itemCode}</span>
        </div>
      ),
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
          <span className="font-mono text-xs font-bold text-blue-700">{info.getValue()}</span>
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
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700" title={tm('expiryReturnHint')}>
          <FileMinus className="h-3.5 w-3.5" />
          {tm('expiryReturnCandidate')}
        </span>
      ),
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
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tm('expirySearchPlaceholder')}
                className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
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
          ) : !loading && filtered.length === 0 ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-400" />
              <p className="text-sm font-bold text-slate-700">{tm('noDataFound')}</p>
              <p className="max-w-lg text-xs font-medium text-slate-500">
                {tm('expiryEmptyHint').replace('{range}', rangeLabel)}
              </p>
            </div>
          ) : (
            <DevExDataGrid data={filtered} columns={columns} enableSorting enableFiltering={false} enableColumnResizing pageSize={50} />
          )}
        </div>
      </div>
    </div>
  );
}
