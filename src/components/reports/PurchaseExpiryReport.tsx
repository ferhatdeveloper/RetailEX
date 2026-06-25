import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileMinus, RefreshCw, Search } from 'lucide-react';
import { createColumnHelper } from '@tanstack/react-table';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { expiryReportsAPI, type ExpiringPurchaseItem } from '../../services/api/expiryReports';

export function PurchaseExpiryReport() {
  const [rows, setRows] = useState<ExpiringPurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [daysAhead, setDaysAhead] = useState(3);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await expiryReportsAPI.getExpiringPurchaseItems(daysAhead));
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
        const urgent = row.daysLeft <= 1;
        return (
          <span className={`rounded-full px-2 py-1 text-xs font-black ${urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
            {info.getValue()} · {row.daysLeft} gün
          </span>
        );
      },
      size: 150,
    }),
    columnHelper.accessor('itemName', {
      header: 'Ürün',
      cell: info => (
        <div className="flex flex-col">
          <span className="font-semibold text-slate-900">{info.getValue()}</span>
          <span className="font-mono text-xs text-slate-500">{info.row.original.itemCode}</span>
        </div>
      ),
    }),
    columnHelper.accessor('quantity', {
      header: 'Miktar',
      cell: info => `${info.getValue()} ${info.row.original.unit}`,
      size: 110,
    }),
    columnHelper.accessor('supplierName', {
      header: 'Tedarikçi/Cari',
      cell: info => info.getValue() || '-',
      size: 180,
    }),
    columnHelper.accessor('invoiceNo', {
      header: 'Alış Faturası',
      cell: info => (
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-blue-700">{info.getValue()}</span>
          <span className="text-xs text-slate-500">{info.row.original.invoiceDate}</span>
        </div>
      ),
      size: 150,
    }),
    columnHelper.accessor('batchNo', {
      header: 'Parti',
      cell: info => info.getValue() || '-',
      size: 100,
    }),
    columnHelper.display({
      id: 'returnHint',
      header: 'Alış İadesi',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2 py-1 text-xs font-bold text-orange-700" title="Alış iadesi oluştururken bu tedarikçi ve ürünü seçin">
          <FileMinus className="h-3.5 w-3.5" />
          İade adayı
        </span>
      ),
      size: 110,
    }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="border-b border-red-200 bg-gradient-to-r from-red-500 to-orange-500 px-5 py-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6" />
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight">Son Kullanma Tarihi Raporu</h2>
              <p className="text-xs font-semibold text-red-100">Bugünden itibaren seçilen gün aralığında SKT’si gelen alış ürünleri</p>
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
              Gün aralığı
              <select value={daysAhead} onChange={e => setDaysAhead(Number(e.target.value))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-red-500">
                <option value={0}>Bugün</option>
                <option value={3}>Sonraki 3 gün</option>
                <option value={7}>Sonraki 7 gün</option>
                <option value={30}>Sonraki 30 gün</option>
              </select>
            </label>
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ürün, cari veya fatura ara..." className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-red-500" />
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <DevExDataGrid data={filtered} columns={columns} enableSorting enableFiltering={false} enableColumnResizing pageSize={50} />
        </div>
      </div>
    </div>
  );
}
