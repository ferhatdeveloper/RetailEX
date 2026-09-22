import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Calendar, Search, Printer, Eye, ArrowLeft, Download, Filter } from 'lucide-react';
import { createColumnHelper } from '@tanstack/react-table';
import type { Sale } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { saleCollectedSplit } from '../../utils/saleCollectedAmounts';
import { normalizePaymentMethodBucket } from '../../utils/paymentMethodUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { MODAL_OVERLAY_Z } from '../shared/FullscreenBodyPortal';
import { DevExDataGrid } from '../shared/DevExDataGrid';
import { addDaysToLocalYmd, formatLocalYmd } from '../../utils/dateLocal';
import { formatCurrency } from '../../utils/currency';
import { ThermalReceiptPreview } from './ThermalReceiptPreview';
import { PaymentReceiptPreview } from './PaymentReceiptPreview';

/**
 * Fatura `date` alanı gün sınırı için `…T12:00:00` (UTC öğle) yazılır;
 * UTC+3’te her satır 15:00 görünür. Duvar saati `created_at`’te.
 */
function saleWallClockRaw(sale: Sale): string {
  const created = String(sale.created_at || '').trim();
  if (created) return created;
  return String(sale.date || '').trim();
}

function saleLocalDateKey(sale: Sale): string {
  const raw = String(sale.date || sale.created_at || '').trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : formatLocalYmd(d);
}

function saleTimestamp(sale: Sale): number {
  const t = new Date(saleWallClockRaw(sale)).getTime();
  return Number.isFinite(t) ? t : 0;
}

function formatSaleDateTime(sale: Sale): string {
  const d = new Date(saleWallClockRaw(sale));
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Aynı takvim gününde zamana göre 1…n (günlük fiş sırası). */
function buildDailySeqBySaleId(sales: Sale[]): Map<string, number> {
  const byDay = new Map<string, Sale[]>();
  for (const sale of sales) {
    const ymd = saleLocalDateKey(sale);
    if (!ymd) continue;
    const list = byDay.get(ymd);
    if (list) list.push(sale);
    else byDay.set(ymd, [sale]);
  }
  const seq = new Map<string, number>();
  for (const daySales of byDay.values()) {
    daySales.sort((a, b) => saleTimestamp(a) - saleTimestamp(b));
    daySales.forEach((sale, index) => {
      const id = String(sale.id || '').trim();
      if (id) seq.set(id, index + 1);
    });
  }
  return seq;
}

function ymdInRange(ymd: string, startYmd: string, endYmd: string): boolean {
  if (!ymd || !startYmd || !endYmd) return false;
  return ymd >= startYmd && ymd <= endYmd;
}

interface POSSalesHistoryModalProps {
  sales: Sale[];
  onClose: () => void;
  onPrintReceipt?: (sale: Sale) => void;
  onViewDetails?: (sale: Sale) => void;
  autoSelectLast?: boolean; // Otomatik son fişi göster
  isLoading?: boolean;
}

export function POSSalesHistoryModal({
  sales,
  onClose,
  onPrintReceipt,
  onViewDetails,
  autoSelectLast = false,
  isLoading = false,
}: POSSalesHistoryModalProps) {
  const { t, tm } = useLanguage();
  const { darkMode } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('today'); // varsayılan: bugün
  const [selectedSale, setSelectedSale] = useState<Sale | null>(
    autoSelectLast && sales.length > 0 ? sales[0] : null
  );
  const [showDateRange, setShowDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const todayYmd = formatLocalYmd(new Date());

  const dailySeqById = useMemo(() => buildDailySeqBySaleId(sales), [sales]);

  // Filter + tarih desc (en yeni üstte)
  const filteredSales = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = sales.filter((sale) => {
      const dailySeq = dailySeqById.get(String(sale.id || '')) ?? 0;
      const matchesSearch =
        !q ||
        sale.receiptNumber?.toLowerCase().includes(q) ||
        sale.customerName?.toLowerCase().includes(q) ||
        String(dailySeq).includes(q);

      let matchesDate = true;
      if (filterDate !== 'all') {
        const saleYmd = saleLocalDateKey(sale);

        if (filterDate === 'today') {
          matchesDate = saleYmd === todayYmd;
        } else if (filterDate === 'week') {
          const weekStart = addDaysToLocalYmd(todayYmd, -6);
          matchesDate = ymdInRange(saleYmd, weekStart, todayYmd);
        } else if (filterDate === 'month') {
          const monthStart = addDaysToLocalYmd(todayYmd, -29);
          matchesDate = ymdInRange(saleYmd, monthStart, todayYmd);
        } else if (filterDate === 'custom' && startDate && endDate) {
          matchesDate = ymdInRange(saleYmd, startDate, endDate);
        }
      }

      return matchesSearch && matchesDate;
    });

    return [...list].sort((a, b) => saleTimestamp(b) - saleTimestamp(a));
  }, [sales, searchTerm, filterDate, startDate, endDate, todayYmd, dailySeqById]);

  const totalSalesAmount = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
  const totalCollectedAmount = filteredSales.reduce(
    (sum, sale) => sum + saleCollectedSplit(sale).collected,
    0,
  );
  const totalVeresiyeAmount = filteredSales.reduce(
    (sum, sale) => sum + (Number(saleCollectedSplit(sale).remaining) || 0),
    0,
  );

  const paymentLabel = useCallback(
    (sale: Sale) => {
      const bucket = normalizePaymentMethodBucket(sale.paymentMethod);
      if (bucket === 'cash') return t.cash;
      if (bucket === 'card') return t.card;
      if (bucket === 'credit') return t.veresiyeLabel || tm('veresiye');
      return t.other;
    },
    [t, tm],
  );

  const columns = useMemo(() => {
    const col = createColumnHelper<Sale>();
    return [
      col.accessor((row) => dailySeqById.get(String(row.id || '')) ?? 0, {
        id: 'dailySeq',
        header: 'Sıra',
        size: 72,
        minSize: 56,
        sortingFn: 'basic',
        cell: (info) => {
          const n = Number(info.getValue() || 0);
          return (
            <span
              className={`font-mono text-sm font-semibold tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}
              title="Günlük fiş sırası"
            >
              {n > 0 ? n : '—'}
            </span>
          );
        },
      }),
      col.accessor('receiptNumber', {
        id: 'receiptNumber',
        header: t.receiptNumber || 'Fiş No',
        size: 220,
        minSize: 140,
        cell: (info) => (
          <span className={`font-mono text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {info.getValue() || '—'}
          </span>
        ),
      }),
      col.accessor((row) => normalizePaymentMethodBucket(row.paymentMethod), {
        id: 'paymentMethod',
        header: t.paymentMethod || 'Ödeme',
        size: 110,
        minSize: 80,
        cell: (info) => {
          const bucket = String(info.getValue() || '');
          const cls =
            bucket === 'cash'
              ? 'bg-green-100 text-green-700'
              : bucket === 'card'
                ? 'bg-blue-100 text-blue-700'
                : bucket === 'credit'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-purple-100 text-purple-700';
          return (
            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
              {paymentLabel(info.row.original)}
            </span>
          );
        },
      }),
      col.accessor((row) => saleTimestamp(row), {
        id: 'date',
        header: t.date || 'Tarih',
        size: 140,
        minSize: 110,
        sortingFn: 'basic',
        cell: (info) => (
          <span className={`text-xs tabular-nums ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {formatSaleDateTime(info.row.original)}
          </span>
        ),
      }),
      col.accessor((row) => row.customerName || t.generalSale || '', {
        id: 'customerName',
        header: t.customer || 'Müşteri',
        size: 160,
        minSize: 100,
        cell: (info) => (
          <span className={`text-xs truncate ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {info.getValue() || t.generalSale}
          </span>
        ),
      }),
      col.accessor('total', {
        id: 'total',
        header: t.total || 'Tutar',
        size: 150,
        minSize: 110,
        meta: { type: 'currency', align: 'right' },
        cell: (info) => {
          const sale = info.row.original;
          const split = saleCollectedSplit(sale);
          return (
            <div className="text-right">
              <div className={`text-sm font-medium tabular-nums ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {formatCurrency(Number(info.getValue() || 0))}
              </div>
              {split.remaining > 0.009 ? (
                <div
                  className="text-[11px] text-amber-700 cursor-help"
                  title={`${tm('tahsilEdilen')}: ${formatCurrency(split.collected)} · ${tm('kalanCari')}: ${formatCurrency(split.remaining)}`}
                >
                  {`T: ${formatCurrency(split.collected)} · K: ${formatCurrency(split.remaining)}`}
                </div>
              ) : null}
            </div>
          );
        },
      }),
      col.display({
        id: 'actions',
        header: t.actions || '',
        size: 88,
        minSize: 72,
        maxSize: 100,
        enableSorting: false,
        enableColumnFilter: false,
        enableResizing: false,
        cell: ({ row }) => {
          const sale = row.original;
          return (
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setSelectedSale(sale)}
                className={`p-1.5 rounded transition-colors ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'}`}
                title={t.viewDetails}
              >
                <Eye className="w-4 h-4" />
              </button>
              {onPrintReceipt ? (
                <button
                  type="button"
                  onClick={() => onPrintReceipt(sale)}
                  className={`p-1.5 rounded transition-colors ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                  title={t.printReceipt}
                >
                  <Printer className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          );
        },
      }),
    ];
  }, [t, tm, darkMode, paymentLabel, onPrintReceipt, dailySeqById]);

  // Detay görünümü render fonksiyonu
  const renderDetailView = () => {
    if (!selectedSale) return null;

    // autoSelectLast durumunda ödeme fişi formatı
    if (autoSelectLast) {
      return (
        <div className={`flex flex-col h-full ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
          {/* Header - Yazdır, İndir ve Kapat */}
          <div className={`p-3 border-b flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
            <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t.lastReceipt}</h3>
            <div className="flex gap-2">
              {onPrintReceipt && (
                <>
                  <button
                    onClick={() => onPrintReceipt(selectedSale)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    {t.printReceipt}
                  </button>
                  <button
                    onClick={() => {
                      // PDF indirme işlevi (ileride eklenebilir)
                      window.print();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t.download}
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'
                  }`}
              >
                <X className="w-3.5 h-3.5" />
                {t.close}
              </button>
            </div>
          </div>

          {/* Ödeme Fişi Önizleme */}
          <div className="flex-1 overflow-auto p-4">
            <div className="flex justify-center">
              <PaymentReceiptPreview sale={selectedSale} companyName="ExRetailOS" location="Bağdat, Irak" />
            </div>
          </div>
        </div>
      );
    }

    // Normal detay görünümü (liste görünümünden açıldığında)
    return (
      <div className={`flex flex-col h-full ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
        {/* Detay Header */}
        <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
          <button
            onClick={() => setSelectedSale(null)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded ${darkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">{t.backToList}</span>
          </button>
          <div className="flex gap-2">
            {onPrintReceipt && (
              <button
                onClick={() => onPrintReceipt(selectedSale)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
              >
                <Printer className="w-4 h-4" />
                Yazdır
              </button>
            )}
          </div>
        </div>

        {/* Detay İçeriği - Sadece 80mm Önizleme */}
        <div className="flex-1 overflow-auto p-6">
          <div className="flex justify-center">
            <ThermalReceiptPreview sale={selectedSale} companyName="ExRetailOS" />
          </div>
        </div>
      </div>
    );
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 flex flex-col min-h-0 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}
      style={{ zIndex: MODAL_OVERLAY_Z }}
      role="dialog"
      aria-modal="true"
      aria-label={t.salesHistory}
    >
      <div className={`w-full h-full flex flex-col min-h-0 ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {/* Header */}
        <div className="p-3 border-b flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-base text-white">
                {selectedSale ? t.receiptDetails : t.salesHistory}
              </h3>
              {!selectedSale && (
                <p className="text-xs text-blue-100 mt-0.5">
                  {filteredSales.length} {t.salesCount} • {t.totalSales}: {totalSalesAmount.toFixed(2)}
                  {' · '}{tm('tahsilEdilen')}: {totalCollectedAmount.toFixed(2)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-white/20 hover:bg-white/30 text-white rounded transition-colors"
          >
            {t.close}
          </button>
        </div>

        {/* Ana içerik */}
        {selectedSale ? (
          renderDetailView()
        ) : (
          <>
            {/* Filters */}
            <div className={`p-4 border-b flex items-center gap-3 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex-1 relative">
                <Search className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <input
                  type="text"
                  placeholder={t.receiptNumberOrCustomerSearch}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-9 pr-4 py-2 border rounded focus:outline-none focus:border-blue-600 text-sm ${darkMode
                    ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-900'
                    }`}
                />
              </div>
              <div className={`flex gap-1 border rounded overflow-hidden ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
                <button
                  onClick={() => {
                    setFilterDate('all');
                    setShowDateRange(false);
                  }}
                  className={`px-3 py-2 text-xs transition-colors ${filterDate === 'all'
                    ? 'bg-blue-600 text-white'
                    : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {t.allButton}
                </button>
                <button
                  onClick={() => {
                    setFilterDate('today');
                    setShowDateRange(false);
                  }}
                  className={`px-3 py-2 text-xs border-l transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-300'} ${filterDate === 'today'
                    ? 'bg-blue-600 text-white'
                    : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {t.todayButton}
                </button>
                <button
                  onClick={() => {
                    setFilterDate('week');
                    setShowDateRange(false);
                  }}
                  className={`px-3 py-2 text-xs border-l transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-300'} ${filterDate === 'week'
                    ? 'bg-blue-600 text-white'
                    : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {t.sevenDaysButton}
                </button>
                <button
                  onClick={() => {
                    setFilterDate('month');
                    setShowDateRange(false);
                  }}
                  className={`px-3 py-2 text-xs border-l transition-colors ${darkMode ? 'border-gray-700' : 'border-gray-300'} ${filterDate === 'month'
                    ? 'bg-blue-600 text-white'
                    : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  {t.thirtyDaysButton}
                </button>
                <button
                  onClick={() => {
                    setFilterDate('custom');
                    setShowDateRange(!showDateRange);
                  }}
                  className={`px-3 py-2 text-xs border-l transition-colors flex items-center gap-1 ${darkMode ? 'border-gray-700' : 'border-gray-300'} ${filterDate === 'custom'
                    ? 'bg-blue-600 text-white'
                    : darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {t.dateRange}
                </button>
              </div>
            </div>

            {/* Date Range Picker */}
            {showDateRange && filterDate === 'custom' && (
              <div className={`px-4 py-3 border-b flex items-center gap-3 ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <Calendar className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t.startDate}</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={`px-3 py-1.5 border rounded text-sm focus:outline-none focus:border-blue-600 ${darkMode
                      ? 'bg-gray-800 border-gray-700 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                      }`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t.endDate}</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={`px-3 py-1.5 border rounded text-sm focus:outline-none focus:border-blue-600 ${darkMode
                      ? 'bg-gray-800 border-gray-700 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                      }`}
                  />
                </div>
                {(startDate || endDate) && (
                  <button
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                    className={`ml-auto px-3 py-1.5 text-xs rounded transition-colors ${darkMode
                      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                  >
                    {t.clear}
                  </button>
                )}
              </div>
            )}

            {/* Content — DevEx grid, tarih desc */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm">{t.loading ?? 'Yükleniyor...'}</p>
                </div>
              ) : filteredSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                  <FileText className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-sm">{t.noSalesRecordFound}</p>
                </div>
              ) : (
                <DevExDataGrid
                  data={filteredSales}
                  columns={columns}
                  initialSorting={[{ id: 'date', desc: true }]}
                  enableSorting
                  enableFiltering
                  enablePagination
                  enableColumnResizing
                  enableColumnVisibility
                  enableExcelExport
                  enablePrint
                  autoFooterSums={false}
                  density="comfortable"
                  pageSize={50}
                  pageSizeOptions={[25, 50, 100, 200]}
                  storageNamespace="posSalesHistory"
                  height="100%"
                  onRowDoubleClick={(sale) => setSelectedSale(sale)}
                  excelFileName="pos_sales_history"
                />
              )}
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-between gap-4 px-4 py-3 border-t ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {t.totalSalesCount}{' '}
                <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{filteredSales.length}</span>{' '}
                {t.salesCount}
              </div>
              <div className={`text-sm tabular-nums ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <span className="mr-3">
                  {t.total || 'Toplam'}:{' '}
                  <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatCurrency(totalSalesAmount)}
                  </span>
                </span>
                <span className="mr-3">
                  {tm('tahsilEdilen') || 'Tahsil'}:{' '}
                  <span className={`font-semibold ${darkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>
                    {formatCurrency(totalCollectedAmount)}
                  </span>
                </span>
                <span>
                  {tm('veresiyeVerilen') || tm('veresiye') || 'Veresiye'}:{' '}
                  <span className={`font-semibold ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                    {formatCurrency(totalVeresiyeAmount)}
                  </span>
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
