import React, { useState } from 'react';
import { X, FileText, Calendar, User, CreditCard, Search, Printer, Eye, ArrowLeft, Download, Filter } from 'lucide-react';
import type { Sale } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ThermalReceiptPreview } from './ThermalReceiptPreview';
import { PaymentReceiptPreview } from './PaymentReceiptPreview';

interface POSSalesHistoryModalProps {
  sales: Sale[];
  onClose: () => void;
  onPrintReceipt?: (sale: Sale) => void;
  onViewDetails?: (sale: Sale) => void;
  autoSelectLast?: boolean; // Otomatik son fişi göster
}

export function POSSalesHistoryModal({
  sales,
  onClose,
  onPrintReceipt,
  onViewDetails,
  autoSelectLast = false
}: POSSalesHistoryModalProps) {
  const { t } = useLanguage();
  const { darkMode } = useTheme();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState('all'); // all, today, week, month, custom
  const [selectedSale, setSelectedSale] = useState<Sale | null>(
    autoSelectLast && sales.length > 0 ? sales[0] : null
  );
  const [showDateRange, setShowDateRange] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Filter sales
  const filteredSales = sales.filter(sale => {
    const matchesSearch =
      sale.receiptNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesDate = true;
    if (filterDate !== 'all') {
      const saleDate = new Date(sale.date);
      saleDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (filterDate === 'today') {
        matchesDate = saleDate >= today;
      } else if (filterDate === 'week') {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        matchesDate = saleDate >= weekAgo;
      } else if (filterDate === 'month') {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        matchesDate = saleDate >= monthAgo;
      } else if (filterDate === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDate = saleDate >= start && saleDate <= end;
      }
    }

    return matchesSearch && matchesDate;
  });

  const totalSalesAmount = filteredSales.reduce((sum, sale) => sum + sale.total, 0);

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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50">
      <div className={`w-full h-full flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
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
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
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

            {/* Content - Minimal */}
            <div className="flex-1 overflow-auto">
              {filteredSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                  <FileText className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-sm">{t.noSalesRecordFound}</p>
                </div>
              ) : (
                <div className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {filteredSales.map((sale) => (
                    <div
                      key={sale.id}
                      className={`px-4 py-3 transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`font-mono text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {sale.receiptNumber}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs flex-shrink-0 ${sale.paymentMethod === 'cash'
                            ? 'bg-green-100 text-green-700'
                            : sale.paymentMethod === 'card'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-purple-100 text-purple-700'
                            }`}>
                            {sale.paymentMethod === 'cash' ? t.cash : sale.paymentMethod === 'card' ? t.card : t.other}
                          </span>
                          <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} flex-shrink-0`}>
                            {new Date(sale.date).toLocaleDateString('tr-TR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })} {new Date(sale.date).toLocaleTimeString('tr-TR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <span className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {sale.items.map(item => `${item.productName} (${item.quantity})`).join(', ')}
                          </span>
                          <span className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'} flex-shrink-0`}>
                            {sale.customerName || t.generalSale}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <div className="text-right">
                            <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {sale.total.toFixed(2)} IQD
                            </div>
                          </div>

                          <div className={`flex gap-1 border-l pl-3 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                            <button
                              onClick={() => setSelectedSale(sale)}
                              className={`p-1.5 rounded transition-colors ${darkMode ? 'text-blue-400 hover:bg-gray-700' : 'text-blue-600 hover:bg-blue-50'}`}
                              title={t.viewDetails}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {onPrintReceipt && (
                              <button
                                onClick={() => onPrintReceipt(sale)}
                                className={`p-1.5 rounded transition-colors ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                                title={t.printReceipt}
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-between px-4 py-3 border-t ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
              <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {t.totalSalesCount} <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{filteredSales.length}</span> {t.salesCount}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
