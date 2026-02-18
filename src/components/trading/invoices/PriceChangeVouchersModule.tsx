/**
 * Price Change Vouchers Module
 * Fiyat Değişim Fişleri Yönetimi
 */

import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Printer, CheckCircle, XCircle, Search, Eye, Plus, Trash2, Calendar, Filter } from 'lucide-react';
import { priceChangeVouchersAPI, type PriceChangeVoucher, type PriceChangeVoucherItem } from '../../../services/api/priceChangeVouchers';
import { useFirmaDonem } from '../../../contexts/FirmaDonemContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { printPriceChangeVoucher } from '../../../utils/priceChangeVoucherPrint';
import { toast } from 'sonner';
import type { Product } from '../../../core/types';
import { DevExDataGrid } from '../../shared/DevExDataGrid';
import { createColumnHelper } from '@tanstack/react-table';
import { formatNumber } from '../../../utils/formatNumber';

interface PriceChangeVouchersModuleProps {
  products?: Product[];
}

// Create Product Item Component to fix hooks issue
function CreateProductItem({
  item,
  index,
  products,
  productSearch,
  onProductSearchChange,
  onItemChange,
  onRemove,
  canRemove,
  darkMode
}: {
  item: { product: Product | null; oldPrice: number; newPrice: number };
  index: number;
  products: Product[];
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  onItemChange: (index: number, field: 'product' | 'oldPrice' | 'newPrice', value: any) => void;
  onRemove: () => void;
  canRemove: boolean;
  darkMode: boolean;
}) {
  const filteredProducts = useMemo(() => {
    if (!productSearch || productSearch.length < 1) return [];
    const query = productSearch.toLowerCase();
    return products.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.code?.toLowerCase().includes(query) ||
      p.barcode?.toLowerCase().includes(query)
    ).slice(0, 10);
  }, [productSearch, products]);

  const difference = item.newPrice - item.oldPrice;
  const differencePercent = item.oldPrice > 0 ? ((difference / item.oldPrice) * 100) : 0;

  return (
    <div className={`${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg p-4 border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between mb-4">
        <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Ürün {index + 1}
        </h4>
        {canRemove && (
          <button
            onClick={onRemove}
            className={`p-1 rounded ${darkMode ? 'hover:bg-gray-600 text-red-400' : 'hover:bg-gray-200 text-red-600'}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Ürün Seçimi */}
        <div className="relative">
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Ürün
          </label>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-400'}`} />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => onProductSearchChange(e.target.value)}
              onFocus={() => {
                if (!productSearch) {
                  onProductSearchChange('');
                }
              }}
              placeholder="Ürün ara (kod, barkod, isim)..."
              className={`w-full pl-10 pr-4 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            {filteredProducts.length > 0 && (
              <div className={`absolute z-10 w-full mt-1 ${darkMode ? 'bg-gray-700' : 'bg-white'} border ${darkMode ? 'border-gray-600' : 'border-gray-300'} rounded-lg shadow-lg max-h-60 overflow-auto`}>
                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => {
                      onItemChange(index, 'product', product);
                      onProductSearchChange('');
                    }}
                    className={`w-full text-left px-4 py-2 hover:${darkMode ? 'bg-gray-600' : 'bg-gray-100'} ${darkMode ? 'text-white' : 'text-gray-900'}`}
                  >
                    <div className="font-medium">{product.name}</div>
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {product.code || product.barcode} - {product.price?.toLocaleString('tr-TR')} IQD
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {item.product && (
            <div className={`mt-2 p-2 rounded ${darkMode ? 'bg-gray-600/50' : 'bg-blue-50'}`}>
              <div className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {item.product.name}
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {item.product.code || item.product.barcode}
              </div>
            </div>
          )}
        </div>

        {/* Eski Fiyat */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Eski Fiyat (IQD)
          </label>
          <input
            type="number"
            value={item.oldPrice || ''}
            onChange={(e) => onItemChange(index, 'oldPrice', parseFloat(e.target.value) || 0)}
            className={`w-full px-4 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            placeholder="0"
            step="0.01"
          />
        </div>

        {/* Yeni Fiyat */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Yeni Fiyat (IQD)
          </label>
          <input
            type="number"
            value={item.newPrice || ''}
            onChange={(e) => onItemChange(index, 'newPrice', parseFloat(e.target.value) || 0)}
            className={`w-full px-4 py-2 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
            placeholder="0"
            step="0.01"
          />
        </div>

        {/* Fark */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Fark
          </label>
          <div className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
            <div className={`text-lg font-semibold ${
              difference > 0 
                ? darkMode ? 'text-red-400' : 'text-red-600'
                : difference < 0
                ? darkMode ? 'text-green-400' : 'text-green-600'
                : darkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              {difference > 0 ? '+' : ''}{difference.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} IQD
            </div>
            <div className={`text-sm ${
              differencePercent > 0 
                ? darkMode ? 'text-red-400' : 'text-red-600'
                : differencePercent < 0
                ? darkMode ? 'text-green-400' : 'text-green-600'
                : darkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              {differencePercent > 0 ? '+' : ''}{differencePercent.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PriceChangeVouchersModule({ products = [] }: PriceChangeVouchersModuleProps) {
  const [vouchers, setVouchers] = useState<PriceChangeVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedVoucher, setSelectedVoucher] = useState<PriceChangeVoucher | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createItems, setCreateItems] = useState<Array<{
    product: Product | null;
    oldPrice: number;
    newPrice: number;
  }>>([{ product: null, oldPrice: 0, newPrice: 0 }]);
  const [productSearch, setProductSearch] = useState<string[]>(['']);
  const { selectedFirma, selectedDonem } = useFirmaDonem();
  const { darkMode } = useTheme();

  useEffect(() => {
    loadVouchers();
  }, [dateFilter, statusFilter]);

  const loadVouchers = async () => {
    setLoading(true);
    try {
      const data = await priceChangeVouchersAPI.getAll();
      
      // Filter by date
      let filtered = data;
      if (dateFilter !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        switch (dateFilter) {
          case 'today':
            filtered = data.filter(v => {
              const voucherDate = new Date(v.date);
              voucherDate.setHours(0, 0, 0, 0);
              return voucherDate.getTime() === today.getTime();
            });
            break;
          case 'week':
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            filtered = data.filter(v => new Date(v.date) >= weekStart);
            break;
          case 'month':
            const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
            filtered = data.filter(v => new Date(v.date) >= monthStart);
            break;
        }
      }
      
      // Filter by status
      if (statusFilter !== 'all') {
        filtered = filtered.filter(v => {
          if (statusFilter === 'printed') return v.printed === true;
          if (statusFilter === 'not_printed') return v.printed === false;
          return true;
        });
      }
      
      setVouchers(filtered);
    } catch (error) {
      console.error('Fiyat değişim fişleri yüklenirken hata:', error);
      toast.error('Fişler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (voucher: PriceChangeVoucher) => {
    try {
      await printPriceChangeVoucher(voucher, {
        companyName: selectedFirma?.firma_adi || 'RetailOS',
        companyAddress: '',
        companyPhone: '',
        companyTaxNo: ''
      });

      // Mark as printed
      if (voucher.id) {
        await priceChangeVouchersAPI.markAsPrinted(voucher.id);
        await loadVouchers(); // Reload to update status
        toast.success('Fiş yazdırıldı');
      }
    } catch (error) {
      console.error('Yazdırma hatası:', error);
      toast.error('Fiş yazdırılamadı');
    }
  };

  const handleView = (voucher: PriceChangeVoucher) => {
    setSelectedVoucher(voucher);
  };

  const filteredVouchers = useMemo(() => {
    if (!searchQuery) return vouchers;
    const query = searchQuery.toLowerCase();
    return vouchers.filter(v =>
      v.voucher_no.toLowerCase().includes(query) ||
      v.invoice_no.toLowerCase().includes(query) ||
      v.items.some(item =>
        item.code.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query)
      )
    );
  }, [vouchers, searchQuery]);

  const stats = {
    total: vouchers.length,
    printed: vouchers.filter(v => v.printed).length,
    notPrinted: vouchers.filter(v => !v.printed).length,
    totalItems: vouchers.reduce((sum, v) => sum + v.items.length, 0)
  };

  // Table columns
  const columnHelper = createColumnHelper<PriceChangeVoucher>();
  const columns = [
    columnHelper.accessor('voucher_no', {
      header: 'Fiş No',
      cell: info => <span className="text-blue-600 font-medium font-mono">{info.getValue()}</span>
    }),
    columnHelper.accessor('invoice_no', {
      header: 'Fatura No',
      cell: info => <span className="text-gray-700">{info.getValue()}</span>
    }),
    columnHelper.accessor('date', {
      header: 'Tarih',
      cell: info => {
        const dateValue = info.getValue();
        if (!dateValue) return <span className="text-gray-400">-</span>;
        try {
          const date = new Date(dateValue);
          return date.toLocaleDateString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
        } catch {
          return <span className="text-gray-400">-</span>;
        }
      }
    }),
    columnHelper.accessor('items', {
      header: 'Ürün Sayısı',
      cell: info => <span className="text-gray-700">{info.getValue().length} ürün</span>
    }),
    columnHelper.accessor('printed', {
      header: 'Durum',
      cell: info => {
        const printed = info.getValue();
        return printed ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            <CheckCircle className="w-3 h-3" />
            Yazdırıldı
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
            <XCircle className="w-3 h-3" />
            Yazdırılmadı
          </span>
        );
      }
    }),
    columnHelper.display({
      id: 'actions',
      header: 'İşlemler',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleView(row.original);
            }}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Detay Görüntüle"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handlePrint(row.original);
            }}
            className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
            title="Yazdır"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      )
    }),
  ];

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-[#2196F3]'} px-6 py-3 flex items-center justify-between flex-shrink-0`}>
        <div className="flex items-center gap-4">
          <TrendingUp className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-white'}`} />
          <div>
            <h2 className={`text-base ${darkMode ? 'text-white' : 'text-white'}`}>Fiyat Değişim Fişleri</h2>
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-blue-100'}`}>Alış faturalarından oluşturulan fiyat değişim fişleri</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className={`px-4 py-2 ${darkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-white text-blue-600 hover:bg-gray-50'} rounded-lg transition-colors flex items-center gap-2 text-sm font-medium`}
          >
            <Plus className="w-4 h-4" />
            Yeni Fiş Oluştur
          </button>
          <span className={`text-sm px-3 py-1 rounded-lg ${darkMode ? 'bg-gray-700/50 text-gray-300' : 'bg-white/20 text-white'}`}>
            {stats.total} Fiş
          </span>
          <span className={`text-sm px-3 py-1 rounded-lg ${darkMode ? 'bg-gray-700/50 text-gray-300' : 'bg-white/20 text-white'}`}>
            {stats.totalItems} Ürün
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} px-6 py-4 space-y-3`}>
        <div className="flex items-center gap-4 flex-wrap">
          {/* Arama */}
          <div className="flex-1 min-w-[300px]">
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-400' : 'text-gray-400'} w-5 h-5`} />
              <input
                type="text"
                placeholder="Fiş no, fatura no veya ürün ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
              />
            </div>
          </div>

          {/* Tarih Filtresi */}
          <div className="flex items-center gap-2">
            <Calendar className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className={`px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <option value="all">Tümü</option>
              <option value="today">Bugün</option>
              <option value="week">Bu Hafta</option>
              <option value="month">Bu Ay</option>
            </select>
          </div>

          {/* Durum Filtresi */}
          <div className="flex items-center gap-2">
            <Filter className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-3 py-2 border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'} rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
            >
              <option value="all">Tüm Durumlar</option>
              <option value="printed">Yazdırıldı</option>
              <option value="not_printed">Yazdırılmadı</option>
            </select>
          </div>
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-hidden">
        <DevExDataGrid
          data={filteredVouchers}
          columns={columns}
          enableSorting={true}
          enableFiltering={true}
          enablePagination={true}
          pageSize={20}
        />
      </div>

      {/* View Modal */}
      {selectedVoucher && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
            <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} px-6 py-4 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'} flex items-center justify-between`}>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Fiyat Değişim Fişi Detayı
              </h3>
              <button
                onClick={() => setSelectedVoucher(null)}
                className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-600 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Fiş No</p>
                    <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{selectedVoucher.voucher_no}</p>
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Fatura No</p>
                    <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{selectedVoucher.invoice_no}</p>
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Tarih</p>
                    <p className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {new Date(selectedVoucher.date).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Durum</p>
                    {selectedVoucher.printed ? (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'}`}>
                        <CheckCircle className="w-3 h-3" />
                        Yazdırıldı
                        {selectedVoucher.printed_at && ` - ${new Date(selectedVoucher.printed_at).toLocaleString('tr-TR')}`}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${darkMode ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-100 text-orange-700'}`}>
                        <XCircle className="w-3 h-3" />
                        Yazdırılmadı
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className={`font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Ürünler</h4>
                <div className={`${darkMode ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg overflow-hidden`}>
                  <table className="w-full">
                    <thead className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                      <tr>
                        <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          Kod
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-medium uppercase ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          Ürün Adı
                        </th>
                        <th className={`px-4 py-3 text-right text-xs font-medium uppercase ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          Eski Fiyat
                        </th>
                        <th className={`px-4 py-3 text-right text-xs font-medium uppercase ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          Yeni Fiyat
                        </th>
                        <th className={`px-4 py-3 text-right text-xs font-medium uppercase ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          Fark
                        </th>
                        <th className={`px-4 py-3 text-right text-xs font-medium uppercase ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          Fark %
                        </th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                      {selectedVoucher.items.map((item, index) => (
                        <tr key={index} className={darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}>
                          <td className={`px-4 py-3 font-mono text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {item.code}
                          </td>
                          <td className={`px-4 py-3 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {item.name}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                            {item.oldPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} IQD
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {item.newPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} IQD
                          </td>
                          <td className={`px-4 py-3 text-sm text-right ${
                            item.difference > 0 
                              ? darkMode ? 'text-red-400' : 'text-red-600'
                              : item.difference < 0
                              ? darkMode ? 'text-green-400' : 'text-green-600'
                              : darkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {item.difference > 0 ? '+' : ''}{item.difference.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} IQD
                          </td>
                          <td className={`px-4 py-3 text-sm text-right ${
                            item.differencePercent > 0 
                              ? darkMode ? 'text-red-400' : 'text-red-600'
                              : item.differencePercent < 0
                              ? darkMode ? 'text-green-400' : 'text-green-600'
                              : darkMode ? 'text-gray-400' : 'text-gray-600'
                          }`}>
                            {item.differencePercent > 0 ? '+' : ''}{item.differencePercent.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} px-6 py-4 border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'} flex justify-end gap-2`}>
              <button
                onClick={() => setSelectedVoucher(null)}
                className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
              >
                Kapat
              </button>
              <button
                onClick={() => {
                  handlePrint(selectedVoucher);
                  setSelectedVoucher(null);
                }}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${darkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
              >
                <Printer className="w-4 h-4" />
                Yazdır
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col`}>
            <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} px-6 py-4 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'} flex items-center justify-between`}>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Yeni Fiyat Değişim Fişi Oluştur
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateItems([{ product: null, oldPrice: 0, newPrice: 0 }]);
                  setProductSearch(['']);
                }}
                className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-600 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`}
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                {createItems.map((item, index) => (
                  <CreateProductItem
                    key={index}
                    item={item}
                    index={index}
                    products={products}
                    productSearch={productSearch[index] || ''}
                    onProductSearchChange={(value) => {
                      const newSearch = [...productSearch];
                      newSearch[index] = value;
                      setProductSearch(newSearch);
                    }}
                    onItemChange={(idx, field, value) => {
                      const newItems = [...createItems];
                      if (field === 'product') {
                        newItems[idx] = {
                          product: value,
                          oldPrice: value?.price || 0,
                          newPrice: value?.price || 0
                        };
                      } else {
                        newItems[idx] = { ...newItems[idx], [field]: value };
                      }
                      setCreateItems(newItems);
                    }}
                    onRemove={() => {
                      setCreateItems(prev => prev.filter((_, i) => i !== index));
                      setProductSearch(prev => prev.filter((_, i) => i !== index));
                    }}
                    canRemove={createItems.length > 1}
                    darkMode={darkMode}
                  />
                ))}

                {/* Ürün Ekle Butonu */}
                <button
                  onClick={() => {
                    setCreateItems([...createItems, { product: null, oldPrice: 0, newPrice: 0 }]);
                    setProductSearch([...productSearch, '']);
                  }}
                  className={`w-full py-2 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 ${darkMode ? 'border-gray-600 hover:border-gray-500 text-gray-300' : 'border-gray-300 hover:border-gray-400 text-gray-600'}`}
                >
                  <Plus className="w-4 h-4" />
                  Ürün Ekle
                </button>
              </div>
            </div>
            <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-50'} px-6 py-4 border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'} flex justify-end gap-2`}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateItems([{ product: null, oldPrice: 0, newPrice: 0 }]);
                  setProductSearch(['']);
                }}
                className={`px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-600 hover:bg-gray-500 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
              >
                İptal
              </button>
              <button
                onClick={async () => {
                  // Validate
                  const validItems = createItems.filter(item =>
                    item.product && item.oldPrice > 0 && item.newPrice > 0
                  );

                  if (validItems.length === 0) {
                    toast.error('Lütfen en az bir geçerli ürün ekleyin');
                    return;
                  }

                  // Create voucher items
                  const voucherItems: PriceChangeVoucherItem[] = validItems.map(item => {
                    const difference = item.newPrice - item.oldPrice;
                    const differencePercent = item.oldPrice > 0 ? ((difference / item.oldPrice) * 100) : 0;
                    return {
                      code: item.product!.code || item.product!.barcode || item.product!.id,
                      name: item.product!.name,
                      oldPrice: item.oldPrice,
                      newPrice: item.newPrice,
                      difference,
                      differencePercent
                    };
                  });

                  // Generate voucher number
                  const voucherNo = `FD-MAN-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

                  try {
                    const savedVoucher = await priceChangeVouchersAPI.create({
                      voucher_no: voucherNo,
                      invoice_no: 'MANUAL',
                      date: new Date().toISOString(),
                      items: voucherItems,
                      printed: false,
                      firma_id: selectedFirma?.id,
                      donem_id: selectedDonem?.id
                    });

                    toast.success('Fiyat değişim fişi oluşturuldu!', {
                      description: `${voucherItems.length} ürün için fiyat değişim fişi oluşturuldu.`,
                      duration: 5000
                    });

                    setShowCreateModal(false);
                    setCreateItems([{ product: null, oldPrice: 0, newPrice: 0 }]);
                    setProductSearch(['']);
                    await loadVouchers();
                  } catch (error) {
                    console.error('Fiş oluşturma hatası:', error);
                    toast.error('Fiş oluşturulamadı');
                  }
                }}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${darkMode ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
              >
                <Plus className="w-4 h-4" />
                Fiş Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

