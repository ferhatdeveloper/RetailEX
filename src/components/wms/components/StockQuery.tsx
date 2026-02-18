// 🔍 StockQuery Component - Stok Sorgulama
// Real-time stock query with multi-location view

import { useState, useEffect } from 'react';
import {
  Search, Package, MapPin, Calendar, DollarSign,
  AlertCircle, TrendingUp, BarChart3, Grid, List,
  Eye, FileText, Printer, Download, BookOpen, Loader2
} from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { formatCurrency, formatNumber, formatDateTime } from '../utils';

interface StockQueryProps {
  darkMode: boolean;
  onBack: () => void;
}

export function StockQuery({ darkMode, onBack }: StockQueryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [stockData, setStockData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [activeLocationType, setActiveLocationType] = useState<string>('all');

  const LOCATION_TYPES = [
    { id: 'all', label: 'Tüm Depo' },
    { id: 'picking', label: 'Toplama Alanı (Picking)' },
    { id: 'bulk', label: 'Yığın (Bulk)' },
    { id: 'return', label: 'İade Alanı' },
    { id: 'virtual', label: 'Sanal Depo' },
    { id: 'staging', label: 'Sevkiyat (Staging)' }
  ];

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  const searchStock = async (query: string) => {
    if (!query.trim()) {
      setStockData([]);
      return;
    }

    setIsLoading(true);
    try {
      const warehouseId = localStorage.getItem('wms_warehouse_id');
      const supabaseUrl = `https://${projectId}.supabase.co`;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/make-server-eae94dc0/wms/inventory/stock?warehouse_id=${warehouseId}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
          }
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // Filter by search term and location type
          const filtered = (result.data || []).filter((item: any) => {
            const matchesSearch =
              item.product?.name?.toLowerCase().includes(query.toLowerCase()) ||
              item.product?.code?.toLowerCase().includes(query.toLowerCase()) ||
              item.product?.barcode?.toLowerCase().includes(query.toLowerCase());

            // Location Type Filter (Logic assume location object has type)
            // Default is 'all'
            if (activeLocationType === 'all') return matchesSearch;

            return matchesSearch && item.location?.type === activeLocationType;
          });
          setStockData(filtered);
        }
      }
    } catch (error) {
      console.error('Error searching stock:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStockData = async () => {
    // This function is a placeholder for the new "Stokları Listele" button's action.
    // It should likely trigger a search or fetch all stock data.
    // For now, it will just call searchStock with the current searchTerm.
    searchStock(searchTerm);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchStock(searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleBarcodeScanned = (barcode: string) => {
    setSearchTerm(barcode);
  };

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600"
          >
            ← Geri
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Stok Sorgulama</h1>
              <p className="text-gray-500">Ürün ara ve stok durumunu görüntüle</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className={`p-3 rounded-lg ${cardClass} border`}
              >
                {viewMode === 'grid' ? <List className="w-5 h-5" /> : <Grid className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {LOCATION_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => {
                setActiveLocationType(type.id);
                // Trigger re-search with new filter
                searchStock(searchTerm);
              }}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors border ${activeLocationType === type.id
                ? 'bg-blue-500 text-white border-blue-600'
                : `bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700`
                }`}
            >
              {type.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className={`${cardClass} border rounded-xl p-6 mb-6`}>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Ürün adı, kod veya barkod girin..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-12 pr-4 py-3 rounded-lg border-2 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                  } focus:border-blue-500 focus:outline-none text-lg`}
                autoFocus
              />
            </div>
            <div className="flex gap-4">
              <button
                onClick={loadStockData}
                className="flex items-center gap-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                Stokları Listele
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
          </div>
        ) : stockData.length === 0 ? (
          <div className={`${cardClass} border rounded-xl p-12 text-center`}>
            <Package className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h3 className={`text-xl font-semibold ${textClass} mb-2`}>
              {searchTerm ? 'Sonuç bulunamadı' : 'Arama yapmak için ürün girin'}
            </h3>
            <p className="text-gray-500">
              {searchTerm
                ? 'Farklı bir arama terimi deneyin'
                : 'Yukarıdaki arama kutusunu kullanarak ürün arayın'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className={`${cardClass} border rounded-xl overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                      Ürün
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">
                      Lokasyon
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      Miktar
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      Rezerve
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      Kullanılabilir
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      Birim Maliyet
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                      Toplam Değer
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {stockData.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                      onClick={() => setSelectedProduct(item)}
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className={`font-semibold ${textClass}`}>
                            {item.product?.name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {item.product?.code} • {item.product?.barcode}
                          </p>
                          {item.lot_number && (
                            <p className="text-xs text-blue-500">
                              Lot: {item.lot_number}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">
                            {item.location?.location_code || 'N/A'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-semibold ${textClass}`}>
                          {formatNumber(item.quantity)}
                        </span>
                        <span className="text-sm text-gray-500 ml-1">
                          {item.product?.unit || 'Adet'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-orange-600 dark:text-orange-400">
                          {formatNumber(item.reserved_quantity || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-green-600 dark:text-green-400 font-semibold">
                          {formatNumber(item.available_quantity || item.quantity)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm">
                          {formatCurrency(item.unit_cost)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-semibold ${textClass}`}>
                          {formatCurrency(item.total_value || 0)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stockData.map((item) => (
              <div
                key={item.id}
                className={`${cardClass} border rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer`}
                onClick={() => setSelectedProduct(item)}
              >
                <div className="flex items-start justify-between mb-4">
                  <Package className="w-12 h-12 text-blue-500" />
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${item.quality_status === 'good'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                    }`}>
                    {item.quality_status === 'good' ? 'İyi' : item.quality_status}
                  </span>
                </div>

                <h3 className={`text-lg font-bold ${textClass} mb-2`}>
                  {item.product?.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {item.product?.code} • {item.product?.barcode}
                </p>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Lokasyon:</span>
                    <span className="flex items-center gap-1 text-sm font-semibold">
                      <MapPin className="w-4 h-4" />
                      {item.location?.location_code}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Miktar:</span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {formatNumber(item.quantity)} {item.product?.unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Kullanılabilir:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400">
                      {formatNumber(item.available_quantity || item.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-500">Toplam Değer:</span>
                    <span className={`font-bold ${textClass}`}>
                      {formatCurrency(item.total_value || 0)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Product Detail Modal */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className={`${cardClass} rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto`}>
              <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className={`text-2xl font-bold ${textClass}`}>Stok Detayı</h2>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  ×
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Product Info */}
                <div>
                  <h3 className={`text-lg font-bold ${textClass} mb-3`}>Ürün Bilgileri</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Ürün Adı</p>
                      <p className={`font-semibold ${textClass}`}>{selectedProduct.product?.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Ürün Kodu</p>
                      <p className={`font-semibold ${textClass}`}>{selectedProduct.product?.code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Barkod</p>
                      <p className={`font-mono ${textClass}`}>{selectedProduct.product?.barcode}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Birim</p>
                      <p className={`font-semibold ${textClass}`}>{selectedProduct.product?.unit}</p>
                    </div>
                  </div>
                </div>

                {/* Stock Info */}
                <div>
                  <h3 className={`text-lg font-bold ${textClass} mb-3`}>Stok Bilgileri</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Lokasyon</p>
                      <p className={`font-semibold ${textClass} flex items-center gap-1`}>
                        <MapPin className="w-4 h-4" />
                        {selectedProduct.location?.location_code}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Kalite Durumu</p>
                      <p className={`font-semibold ${textClass}`}>{selectedProduct.quality_status}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Toplam Miktar</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatNumber(selectedProduct.quantity)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Kullanılabilir</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatNumber(selectedProduct.available_quantity || selectedProduct.quantity)}
                      </p>
                    </div>
                    {selectedProduct.lot_number && (
                      <div>
                        <p className="text-sm text-gray-500">Lot Numarası</p>
                        <p className={`font-semibold ${textClass}`}>{selectedProduct.lot_number}</p>
                      </div>
                    )}
                    {selectedProduct.expiry_date && (
                      <div>
                        <p className="text-sm text-gray-500">Son Kullanma</p>
                        <p className={`font-semibold ${textClass}`}>
                          {new Date(selectedProduct.expiry_date).toLocaleDateString('tr-TR')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Info */}
                <div>
                  <h3 className={`text-lg font-bold ${textClass} mb-3`}>Mali Bilgiler</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Birim Maliyet</p>
                      <p className={`text-xl font-bold ${textClass}`}>
                        {formatCurrency(selectedProduct.unit_cost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Toplam Değer</p>
                      <p className={`text-xl font-bold ${textClass}`}>
                        {formatCurrency(selectedProduct.total_value || 0)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div>
                  <h3 className={`text-lg font-bold ${textClass} mb-3`}>Tarihler</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Son Hareket</p>
                      <p className={`font-semibold ${textClass}`}>
                        {selectedProduct.last_movement_date
                          ? formatDateTime(selectedProduct.last_movement_date)
                          : 'Belirtilmemiş'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Son Sayım</p>
                      <p className={`font-semibold ${textClass}`}>
                        {selectedProduct.last_counted_date
                          ? formatDateTime(selectedProduct.last_counted_date)
                          : 'Belirtilmemiş'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-4">
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="flex-1 px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg"
                >
                  Kapat
                </button>
                <button className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2">
                  <Printer className="w-5 h-5" />
                  Yazdır
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barcode Scanner */}
      <BarcodeScanner
        darkMode={darkMode}
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleBarcodeScanned}
        title="Stok Sorgulamak için Tara"
      />
    </div>
  );
}

