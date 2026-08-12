// 🚚 TRANSFER MODULE - Depo ⇄ Şube & Şube ⇄ Şube Transferleri
// Fazla Stok Analizi + Akıllı Transfer Önerileri

import { useState, useEffect } from 'react';
import {
  ArrowLeft, Truck, Package, Building2, Warehouse, Search,
  Plus, Trash2, Send, X, Check, AlertTriangle, TrendingUp,
  BarChart3, ArrowRight, Clock, MapPin, Box, CheckCircle,
  RefreshCw, Filter, ChevronDown, Sparkles, Archive
} from 'lucide-react';
import { formatCurrency, formatNumber, formatDateTime } from '../utils';

interface Branch {
  id: string;
  name: string;
  city: string;
  type: 'warehouse' | 'branch';
  icon: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  currentStock: number;
  avgDailySales: number;
  daysOfStock: number;
  status: 'critical' | 'low' | 'optimal' | 'excess';
  price: number;
}

interface TransferItem {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  reason?: string;
}

interface TransferRecord {
  id: string;
  from: string;
  to: string;
  items: TransferItem[];
  totalItems: number;
  status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
  createdAt: string;
  createdBy: string;
  estimatedDelivery?: string;
}

interface TransferProps {
  darkMode: boolean;
  onNavigate: (page: string, data?: any) => void;
}

export default function Transfer({ darkMode, onNavigate }: TransferProps) {
  const [sourceLocation, setSourceLocation] = useState<Branch | null>(null);
  const [targetLocation, setTargetLocation] = useState<Branch | null>(null);
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [showSourceDropdown, setShowSourceDropdown] = useState(false);
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [activeTab, setActiveTab] = useState<'create' | 'excess' | 'history'>('create');
  const [excessStockAnalysis, setExcessStockAnalysis] = useState<any[]>([]);
  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';
  const textMutedClass = darkMode ? 'text-gray-400' : 'text-gray-600';

  // Mock branches - Production'da API'den gelecek
  const branches: Branch[] = [
    { id: 'WH001', name: 'Ana Depo', city: 'Baghdad', type: 'warehouse', icon: '🏢' },
    { id: 'BR001', name: 'Karrada Şubesi', city: 'Baghdad', type: 'branch', icon: '🏢' },
    { id: 'BR002', name: 'Mansour Şubesi', city: 'Baghdad', type: 'branch', icon: '🏢' },
    { id: 'BR003', name: 'Erbil Merkez', city: 'Erbil', type: 'branch', icon: '🏢' },
    { id: 'BR004', name: 'Basra Liman', city: 'Basra', type: 'branch', icon: '🏢' },
    { id: 'BR005', name: 'Sulaymaniyah', city: 'Sulaymaniyah', type: 'branch', icon: '🏢' },
  ];

  useEffect(() => {
    loadMockData();
  }, []);

  const loadMockData = async () => {
    setIsLoading(true);

    // Mock products
    const mockProducts: Product[] = [
      {
        id: 'PRD001',
        code: 'IPHONE15-BLK',
        name: 'iPhone 15 Pro Max 256GB Black',
        category: 'Telefon',
        currentStock: 150,
        avgDailySales: 5,
        daysOfStock: 30,
        status: 'optimal',
        price: 35000000
      },
      {
        id: 'PRD002',
        code: 'SAM-S24-WHT',
        name: 'Samsung Galaxy S24 Ultra White',
        category: 'Telefon',
        currentStock: 200,
        avgDailySales: 4,
        daysOfStock: 50,
        status: 'excess',
        price: 28000000
      },
      {
        id: 'PRD003',
        code: 'MAC-M3-SLV',
        name: 'MacBook Pro M3 14" Silver',
        category: 'Laptop',
        currentStock: 85,
        avgDailySales: 2,
        daysOfStock: 42,
        status: 'excess',
        price: 55000000
      },
    ];

    // Mock excess stock analysis
    const mockExcessStock = [
      {
        branchId: 'BR001',
        branchName: 'Karrada Şubesi',
        branchCity: 'Baghdad',
        productId: 'PRD002',
        productCode: 'SAM-S24-WHT',
        productName: 'Samsung Galaxy S24 Ultra White',
        currentStock: 45,
        avgDailySales: 1.2,
        optimalStock: 18,
        excessQuantity: 27,
        daysOfExcess: 22.5,
        recommendation: 'Fazla stok tespit edildi. Düşük stoklu şubelere transfer önerilir.',
        priority: 'high'
      },
      {
        branchId: 'BR003',
        branchName: 'Erbil Merkez',
        branchCity: 'Erbil',
        productId: 'PRD003',
        productCode: 'MAC-M3-SLV',
        productName: 'MacBook Pro M3 14" Silver',
        currentStock: 15,
        avgDailySales: 0.5,
        optimalStock: 7,
        excessQuantity: 8,
        daysOfExcess: 16,
        recommendation: 'Orta düzey fazla stok. Talebin yüksek olduğu şubelere transfer edilebilir.',
        priority: 'medium'
      }
    ];

    // Mock transfer history
    const mockHistory: TransferRecord[] = [
      {
        id: 'TRF-2024-001',
        from: 'Ana Depo',
        to: 'Karrada Şubesi',
        items: [
          { productId: 'PRD001', productCode: 'IPHONE15-BLK', productName: 'iPhone 15 Pro Max 256GB Black', quantity: 20 }
        ],
        totalItems: 20,
        status: 'completed',
        createdAt: '2024-12-25T10:30:00',
        createdBy: 'Depo Yöneticisi',
        estimatedDelivery: '2024-12-25T14:00:00'
      },
      {
        id: 'TRF-2024-002',
        from: 'Karrada Şubesi',
        to: 'Erbil Merkez',
        items: [
          { productId: 'PRD002', productCode: 'SAM-S24-WHT', productName: 'Samsung Galaxy S24 Ultra White', quantity: 15, reason: 'Fazla stok transferi' }
        ],
        totalItems: 15,
        status: 'in_transit',
        createdAt: '2024-12-26T09:15:00',
        createdBy: 'Depo Yöneticisi',
        estimatedDelivery: '2024-12-27T16:00:00'
      }
    ];

    setAvailableProducts(mockProducts);
    setExcessStockAnalysis(mockExcessStock);
    setTransferHistory(mockHistory);
    setIsLoading(false);
  };

  const handleAddProduct = (product: Product) => {
    if (!transferItems.find(item => item.productId === product.id)) {
      setTransferItems([...transferItems, {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        quantity: 1
      }]);
    }
    setShowProductSearch(false);
    setSearchQuery('');
  };

  const handleRemoveProduct = (productId: string) => {
    setTransferItems(transferItems.filter(item => item.productId !== productId));
  };

  const handleQuantityChange = (productId: string, quantity: number) => {
    setTransferItems(transferItems.map(item =>
      item.productId === productId ? { ...item, quantity: Math.max(1, quantity) } : item
    ));
  };

  const handleCreateTransfer = () => {
    if (!sourceLocation || !targetLocation || transferItems.length === 0) {
      alert('Lütfen kaynak, hedef ve ürünleri seçin!');
      return;
    }

    // TODO: API call to create transfer
    alert(`Transfer oluşturuldu!\n\nKaynak: ${sourceLocation.name}\nHedef: ${targetLocation.name}\nÜrün Sayısı: ${transferItems.length}\nToplam Miktar: ${transferItems.reduce((sum, item) => sum + item.quantity, 0)}`);

    // Reset form
    setTransferItems([]);
    setSourceLocation(null);
    setTargetLocation(null);
  };

  const handleExcessTransfer = (excessItem: any) => {
    // Otomatik transfer formu oluştur
    const sourceBranch = branches.find(b => b.id === excessItem.branchId);
    if (sourceBranch) {
      setSourceLocation(sourceBranch);
      setTransferItems([{
        productId: excessItem.productId,
        productCode: excessItem.productCode,
        productName: excessItem.productName,
        quantity: excessItem.excessQuantity,
        reason: 'Fazla stok dengel emesi'
      }]);
      setActiveTab('create');
    }
  };

  const filteredProducts = availableProducts.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-gray-50 to-blue-50'} p-4 md:p-6`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onNavigate('dashboard')}
              className={`p-2 rounded-lg ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} transition-colors`}
            >
              <ArrowLeft className={`w-5 h-5 ${textClass}`} />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <Truck className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className={`text-2xl md:text-3xl ${textClass}`}>Transfer Yönetimi</h1>
                <p className={textMutedClass}>Depo ⇄ Şube & Şube ⇄ Şube Transferleri</p>
              </div>
            </div>
          </div>

          <button
            onClick={loadMockData}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white hover:bg-gray-50'} border ${darkMode ? 'border-gray-700' : 'border-gray-200'} transition-colors`}
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden md:inline">Yenile</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('create')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === 'create'
              ? 'bg-blue-600 text-white shadow-lg'
              : darkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
          >
            <Plus className="w-4 h-4" />
            <span>Yeni Transfer</span>
          </button>

          <button
            onClick={() => setActiveTab('excess')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === 'excess'
              ? 'bg-orange-600 text-white shadow-lg'
              : darkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Fazla Stok Analizi</span>
            {excessStockAnalysis.length > 0 && (
              <span className="px-2 py-0.5 bg-orange-500 text-white rounded-full text-xs">
                {excessStockAnalysis.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === 'history'
              ? 'bg-purple-600 text-white shadow-lg'
              : darkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
          >
            <Clock className="w-4 h-4" />
            <span>Transfer Geçmişi</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'create' && (
        <div className="space-y-6">
          {/* Location Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Source Location */}
            <div className={`${cardClass} border rounded-xl p-6`}>
              <h3 className={`text-lg ${textClass} mb-4 flex items-center gap-2`}>
                <Archive className="w-5 h-5" />
                Kaynak Lokasyon
              </h3>

              <div className="relative">
                <button
                  onClick={() => {
                    setShowSourceDropdown(!showSourceDropdown);
                    setShowTargetDropdown(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} text-left flex items-center justify-between`}
                >
                  {sourceLocation ? (
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{sourceLocation.icon}</span>
                      <div>
                        <p className={textClass}>{sourceLocation.name}</p>
                        <p className={`text-xs ${textMutedClass}`}>{sourceLocation.city} • {sourceLocation.type === 'warehouse' ? 'Depo' : 'Şube'}</p>
                      </div>
                    </div>
                  ) : (
                    <span className={textMutedClass}>Kaynak seçin...</span>
                  )}
                  <ChevronDown className="w-5 h-5" />
                </button>

                {showSourceDropdown && (
                  <div className={`absolute top-full mt-2 w-full ${cardClass} border rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto`}>
                    {branches.map(branch => (
                      <button
                        key={branch.id}
                        onClick={() => {
                          setSourceLocation(branch);
                          setShowSourceDropdown(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors border-b last:border-b-0 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{branch.icon}</span>
                          <div>
                            <p className={textClass}>{branch.name}</p>
                            <p className={`text-xs ${textMutedClass}`}>{branch.city} • {branch.type === 'warehouse' ? 'Depo' : 'Şube'}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Target Location */}
            <div className={`${cardClass} border rounded-xl p-6`}>
              <h3 className={`text-lg ${textClass} mb-4 flex items-center gap-2`}>
                <MapPin className="w-5 h-5" />
                Hedef Lokasyon
              </h3>

              <div className="relative">
                <button
                  onClick={() => {
                    setShowTargetDropdown(!showTargetDropdown);
                    setShowSourceDropdown(false);
                  }}
                  className={`w-full px-4 py-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'} text-left flex items-center justify-between`}
                >
                  {targetLocation ? (
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{targetLocation.icon}</span>
                      <div>
                        <p className={textClass}>{targetLocation.name}</p>
                        <p className={`text-xs ${textMutedClass}`}>{targetLocation.city} • {targetLocation.type === 'warehouse' ? 'Depo' : 'Şube'}</p>
                      </div>
                    </div>
                  ) : (
                    <span className={textMutedClass}>Hedef seçin...</span>
                  )}
                  <ChevronDown className="w-5 h-5" />
                </button>

                {showTargetDropdown && (
                  <div className={`absolute top-full mt-2 w-full ${cardClass} border rounded-lg shadow-xl z-10 max-h-64 overflow-y-auto`}>
                    {branches
                      .filter(b => b.id !== sourceLocation?.id)
                      .map(branch => (
                        <button
                          key={branch.id}
                          onClick={() => {
                            setTargetLocation(branch);
                            setShowTargetDropdown(false);
                          }}
                          className={`w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors border-b last:border-b-0 ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{branch.icon}</span>
                            <div>
                              <p className={textClass}>{branch.name}</p>
                              <p className={`text-xs ${textMutedClass}`}>{branch.city} • {branch.type === 'warehouse' ? 'Depo' : 'Şube'}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Product Selection */}
          <div className={`${cardClass} border rounded-xl p-6`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg ${textClass} flex items-center gap-2`}>
                <Package className="w-5 h-5" />
                Transfer Edilecek Ürünler
              </h3>

              <button
                onClick={() => setShowProductSearch(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Ürün Ekle</span>
              </button>
            </div>

            {transferItems.length === 0 ? (
              <div className="text-center py-12">
                <Box className={`w-16 h-16 ${textMutedClass} mx-auto mb-4`} />
                <p className={textMutedClass}>Henüz ürün eklenmedi</p>
                <p className={`text-sm ${textMutedClass} mt-2`}>Transfer için ürün ekleyin</p>
              </div>
            ) : (
              <div className="space-y-3">
                {transferItems.map(item => (
                  <div key={item.productId} className={`flex items-center gap-4 p-4 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex-1">
                      <p className={textClass}>{item.productName}</p>
                      <p className={`text-sm ${textMutedClass}`}>{item.productCode}</p>
                      {item.reason && (
                        <p className="text-xs text-orange-500 mt-1">📍 {item.reason}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(item.productId, parseInt(e.target.value) || 1)}
                        className={`w-20 px-3 py-2 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                      />
                      <button
                        onClick={() => handleRemoveProduct(item.productId)}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <button
              onClick={() => {
                setTransferItems([]);
                setSourceLocation(null);
                setTargetLocation(null);
              }}
              className={`px-6 py-3 rounded-lg ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'} transition-colors`}
            >
              Temizle
            </button>
            <button
              onClick={handleCreateTransfer}
              disabled={!sourceLocation || !targetLocation || transferItems.length === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-colors ${!sourceLocation || !targetLocation || transferItems.length === 0
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
            >
              <Send className="w-4 h-4" />
              <span>Transfer Oluştur</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'excess' && (
        <div className="space-y-4">
          <div className={`${cardClass} border rounded-xl p-6`}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className={`text-lg ${textClass}`}>Fazla Stok Analizi</h3>
                <p className={textMutedClass}>Uzun süredir fazla stok olan şubeler</p>
              </div>
            </div>

            {excessStockAnalysis.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h3 className={`text-xl ${textClass} mb-2`}>Tüm Şubeler Optimal Seviyede!</h3>
                <p className={textMutedClass}>Fazla stok tespit edilmedi</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {excessStockAnalysis.map((item, index) => (
                  <div
                    key={index}
                    className={`p-6 rounded-xl border ${item.priority === 'high'
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                      : 'bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700'
                      }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${item.priority === 'high'
                            ? 'bg-red-500 text-white'
                            : 'bg-orange-500 text-white'
                            }`}>
                            {item.priority === 'high' ? 'YÜKSEK ÖNCELİK' : 'ORTA ÖNCELİK'}
                          </span>
                          <span className="text-xs text-gray-500">{item.daysOfExcess.toFixed(1)} gün fazla</span>
                        </div>

                        <h4 className={`text-lg font-semibold mb-1 ${textClass}`}>
                          {item.productName}
                        </h4>
                        <p className={`text-sm ${textMutedClass} mb-3`}>
                          {item.productCode} • {item.branchName}, {item.branchCity}
                        </p>

                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div>
                            <p className="text-xs text-gray-500">Mevcut Stok</p>
                            <p className={`${textClass} font-semibold`}>{formatNumber(item.currentStock)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Optimal Stok</p>
                            <p className="text-green-600 font-semibold">{formatNumber(item.optimalStock)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Fazla Miktar</p>
                            <p className="text-red-600 font-semibold">{formatNumber(item.excessQuantity)}</p>
                          </div>
                        </div>

                        <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900/50' : 'bg-white/50'}`}>
                          <p className="text-sm">
                            <strong>Öneri:</strong> {item.recommendation}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 md:min-w-[180px]">
                        <button
                          onClick={() => handleExcessTransfer(item)}
                          className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-lg active:scale-95"
                        >
                          <Send className="w-4 h-4" />
                          <span>Transfer Et</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-4">
          {transferHistory.map((record) => (
            <div key={record.id} className={`${cardClass} border rounded-xl p-6`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className={`text-lg ${textClass}`}>{record.id}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${record.status === 'completed'
                      ? 'bg-green-500 text-white'
                      : record.status === 'in_transit'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-500 text-white'
                      }`}>
                      {record.status === 'completed' ? 'TAMAMLANDI' : record.status === 'in_transit' ? 'YOLDA' : 'BEKLİYOR'}
                    </span>
                  </div>
                  <p className={textMutedClass}>{formatDateTime(record.createdAt)} • {record.createdBy}</p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <p className={textMutedClass}>Kaynak</p>
                    <p className={textClass}>{record.from}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-blue-500" />
                  <div className="text-center">
                    <p className={textMutedClass}>Hedef</p>
                    <p className={textClass}>{record.to}</p>
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                {record.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2">
                    <div>
                      <p className={textClass}>{item.productName}</p>
                      <p className={`text-sm ${textMutedClass}`}>{item.productCode}</p>
                    </div>
                    <p className={textClass}>{formatNumber(item.quantity)} adet</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product Search Modal */}
      {showProductSearch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`${cardClass} border rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col`}>
            <div className="p-6 border-b dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-xl ${textClass}`}>Ürün Seç</h3>
                <button
                  onClick={() => {
                    setShowProductSearch(false);
                    setSearchQuery('');
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 ${textMutedClass}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ürün ara..."
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 placeholder-gray-500'}`}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-12">
                  <Package className={`w-16 h-16 ${textMutedClass} mx-auto mb-4`} />
                  <p className={textMutedClass}>Ürün bulunamadı</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => handleAddProduct(product)}
                      className={`p-4 rounded-lg border text-left hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'}`}
                      disabled={transferItems.some(item => item.productId === product.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className={textClass}>{product.name}</p>
                          <p className={`text-sm ${textMutedClass}`}>{product.code} • {product.category}</p>
                          <p className={`text-sm mt-2 ${textMutedClass}`}>
                            Stok: {formatNumber(product.currentStock)} • {formatCurrency(product.price)}
                          </p>
                        </div>
                        {transferItems.some(item => item.productId === product.id) && (
                          <Check className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

