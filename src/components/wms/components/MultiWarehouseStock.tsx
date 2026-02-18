// ğŸ­ Multi-Warehouse Stock Management
// Depo 1 (Normal), Depo 2 (İade/Fire), Depo 3 (Hayali)

import { useState, useEffect } from 'react';
import {
  Warehouse, Package, AlertTriangle, Cloud, Search,
  Filter, TrendingUp, TrendingDown, BarChart3, RefreshCw,
  ArrowRightLeft, X, Check, Eye, History
} from 'lucide-react';

interface MultiWarehouseStockProps {
  darkMode: boolean;
  onBack: () => void;
}

interface StockItem {
  product_id: string;
  product_code: string;
  product_name: string;
  barcode: string;
  
  // Depo 1 - Normal Stok
  warehouse1_stock: number;
  warehouse1_reserved: number;
  warehouse1_available: number;
  
  // Depo 2 - İade/Fire
  warehouse2_stock: number;
  warehouse2_damaged: number;
  warehouse2_return: number;
  
  // Depo 3 - Hayali Depo
  warehouse3_stock: number;
  warehouse3_virtual: number;
  warehouse3_planned: number;
  
  // Common
  unit: string;
  category: string;
  last_updated: string;
}

const WAREHOUSE_TYPES = [
  {
    id: 'warehouse1',
    name: 'Depo 1 - Normal Stok',
    icon: Warehouse,
    color: 'blue',
    description: 'Satışa hazır ürünler ve aktif stok'
  },
  {
    id: 'warehouse2',
    name: 'Depo 2 - İade/Fire',
    icon: AlertTriangle,
    color: 'orange',
    description: 'İade, hasarlı ve fire ürünler'
  },
  {
    id: 'warehouse3',
    name: 'Depo 3 - Hayali Depo',
    icon: Cloud,
    color: 'purple',
    description: 'Planlanan ve sanal stok takibi'
  },
];

export function MultiWarehouseStock({ darkMode, onBack }: MultiWarehouseStockProps) {
  const [activeWarehouse, setActiveWarehouse] = useState('warehouse1');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<StockItem | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gray-50';
  const cardClass = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900';

  useEffect(() => {
    loadStockData();
  }, [activeWarehouse, categoryFilter]);

  const loadStockData = async () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      const mockData: StockItem[] = [
        {
          product_id: '1',
          product_code: 'PRD-001',
          product_name: 'Laptop Dell XPS 15',
          barcode: '1234567890123',
          warehouse1_stock: 150,
          warehouse1_reserved: 25,
          warehouse1_available: 125,
          warehouse2_stock: 8,
          warehouse2_damaged: 5,
          warehouse2_return: 3,
          warehouse3_stock: 50,
          warehouse3_virtual: 30,
          warehouse3_planned: 20,
          unit: 'Adet',
          category: 'Elektronik',
          last_updated: new Date().toISOString(),
        },
        {
          product_id: '2',
          product_code: 'PRD-002',
          product_name: 'iPhone 15 Pro Max',
          barcode: '9876543210987',
          warehouse1_stock: 280,
          warehouse1_reserved: 45,
          warehouse1_available: 235,
          warehouse2_stock: 12,
          warehouse2_damaged: 7,
          warehouse2_return: 5,
          warehouse3_stock: 100,
          warehouse3_virtual: 60,
          warehouse3_planned: 40,
          unit: 'Adet',
          category: 'Elektronik',
          last_updated: new Date().toISOString(),
        },
        {
          product_id: '3',
          product_code: 'PRD-003',
          product_name: 'Samsung 4K TV 55"',
          barcode: '5555555555555',
          warehouse1_stock: 45,
          warehouse1_reserved: 8,
          warehouse1_available: 37,
          warehouse2_stock: 3,
          warehouse2_damaged: 2,
          warehouse2_return: 1,
          warehouse3_stock: 25,
          warehouse3_virtual: 15,
          warehouse3_planned: 10,
          unit: 'Adet',
          category: 'Elektronik',
          last_updated: new Date().toISOString(),
        },
      ];
      setStockItems(mockData);
      setIsLoading(false);
    }, 500);
  };

  const getWarehouseConfig = (warehouseId: string) => {
    return WAREHOUSE_TYPES.find(w => w.id === warehouseId) || WAREHOUSE_TYPES[0];
  };

  const getStockValue = (item: StockItem, warehouseId: string) => {
    if (warehouseId === 'warehouse1') return item.warehouse1_stock;
    if (warehouseId === 'warehouse2') return item.warehouse2_stock;
    if (warehouseId === 'warehouse3') return item.warehouse3_stock;
    return 0;
  };

  const getTotalStockByWarehouse = (warehouseId: string) => {
    return stockItems.reduce((sum, item) => sum + getStockValue(item, warehouseId), 0);
  };

  const getWarehouseColor = (color: string) => {
    const colors: any = {
      blue: { bg: 'bg-blue-500', hover: 'hover:bg-blue-600', light: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600' },
      orange: { bg: 'bg-orange-500', hover: 'hover:bg-orange-600', light: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600' },
      purple: { bg: 'bg-purple-500', hover: 'hover:bg-purple-600', light: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600' },
    };
    return colors[color] || colors.blue;
  };

  const currentWarehouse = getWarehouseConfig(activeWarehouse);
  const colorConfig = getWarehouseColor(currentWarehouse.color);

  return (
    <div className={`min-h-screen ${bgClass} p-6`}>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 text-blue-500 hover:text-blue-600"
        >
          ← Geri
        </button>
        <div>
          <h1 className={`text-3xl font-bold ${textClass} mb-2`}>Çoklu Depo Yönetimi</h1>
          <p className="text-gray-500">Normal, İade/Fire ve Hayali depo stok takibi</p>
        </div>
      </div>

      {/* Warehouse Selector */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {WAREHOUSE_TYPES.map((warehouse) => {
          const Icon = warehouse.icon;
          const isActive = activeWarehouse === warehouse.id;
          const colors = getWarehouseColor(warehouse.color);
          const totalStock = getTotalStockByWarehouse(warehouse.id);

          return (
            <button
              key={warehouse.id}
              onClick={() => setActiveWarehouse(warehouse.id)}
              className={`${cardClass} border-2 rounded-xl p-6 text-left transition-all ${
                isActive 
                  ? `border-${warehouse.color}-500 ${colors.light}` 
                  : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 ${colors.bg} rounded-xl flex items-center justify-center`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className={`font-bold ${textClass} mb-1`}>{warehouse.name}</h3>
                  <p className="text-sm text-gray-500 mb-3">{warehouse.description}</p>
                  <div className="flex items-center gap-2">
                    <div className={`text-2xl font-bold ${colors.text}`}>
                      {totalStock.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500">adet</div>
                  </div>
                </div>
                {isActive && (
                  <Check className={`w-6 h-6 ${colors.text}`} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Warehouse Stats */}
      <div className={`${cardClass} border rounded-xl p-6 mb-6`}>
        <div className="flex items-center gap-3 mb-6">
          {(() => {
            const Icon = currentWarehouse.icon;
            return <Icon className={`w-6 h-6 ${colorConfig.text}`} />;
          })()}
          <h2 className={`text-xl font-bold ${textClass}`}>{currentWarehouse.name}</h2>
        </div>

        {/* Warehouse-specific stats */}
        {activeWarehouse === 'warehouse1' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Toplam Stok</div>
              <div className={`text-3xl font-bold ${textClass} mt-1`}>
                {stockItems.reduce((sum, item) => sum + item.warehouse1_stock, 0).toLocaleString()}
              </div>
            </div>
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Rezerve</div>
              <div className={`text-3xl font-bold ${textClass} mt-1`}>
                {stockItems.reduce((sum, item) => sum + item.warehouse1_reserved, 0).toLocaleString()}
              </div>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Kullanılabilir</div>
              <div className={`text-3xl font-bold ${textClass} mt-1`}>
                {stockItems.reduce((sum, item) => sum + item.warehouse1_available, 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {activeWarehouse === 'warehouse2' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Toplam İade/Fire</div>
              <div className={`text-3xl font-bold ${textClass} mt-1`}>
                {stockItems.reduce((sum, item) => sum + item.warehouse2_stock, 0).toLocaleString()}
              </div>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Hasarlı</div>
              <div className={`text-3xl font-bold ${textClass} mt-1`}>
                {stockItems.reduce((sum, item) => sum + item.warehouse2_damaged, 0).toLocaleString()}
              </div>
            </div>
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Müşteri İadesi</div>
              <div className={`text-3xl font-bold ${textClass} mt-1`}>
                {stockItems.reduce((sum, item) => sum + item.warehouse2_return, 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {activeWarehouse === 'warehouse3' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Hayali Stok</div>
              <div className={`text-3xl font-bold ${textClass} mt-1`}>
                {stockItems.reduce((sum, item) => sum + item.warehouse3_stock, 0).toLocaleString()}
              </div>
            </div>
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Sanal Stok</div>
              <div className={`text-3xl font-bold ${textClass} mt-1`}>
                {stockItems.reduce((sum, item) => sum + item.warehouse3_virtual, 0).toLocaleString()}
              </div>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Planlanan</div>
              <div className={`text-3xl font-bold ${textClass} mt-1`}>
                {stockItems.reduce((sum, item) => sum + item.warehouse3_planned, 0).toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className={`${cardClass} border rounded-xl p-4 mb-6`}>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[250px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Ürün ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                  darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
                }`}
              />
            </div>
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`px-4 py-2 rounded-lg border ${
              darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'
            }`}
          >
            <option value="all">Tüm Kategoriler</option>
            <option value="Elektronik">Elektronik</option>
            <option value="Giyim">Giyim</option>
            <option value="Gıda">Gıda</option>
          </select>
          <button
            onClick={loadStockData}
            className={`px-4 py-2 ${colorConfig.bg} ${colorConfig.hover} text-white rounded-lg flex items-center gap-2`}
          >
            <RefreshCw className="w-5 h-5" />
            Yenile
          </button>
        </div>
      </div>

      {/* Stock Table */}
      <div className={`${cardClass} border rounded-xl overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={darkMode ? 'bg-gray-700' : 'bg-gray-50'}>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ürün</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kod</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Barkod</th>
                {activeWarehouse === 'warehouse1' && (
                  <>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Toplam</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rezerve</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Kullanılabilir</th>
                  </>
                )}
                {activeWarehouse === 'warehouse2' && (
                  <>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Toplam</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hasarlı</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">İade</th>
                  </>
                )}
                {activeWarehouse === 'warehouse3' && (
                  <>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Toplam</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sanal</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Planlanan</th>
                  </>
                )}
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {stockItems
                .filter(item => 
                  (categoryFilter === 'all' || item.category === categoryFilter) &&
                  (searchTerm === '' || 
                    item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.barcode.includes(searchTerm)
                  )
                )
                .map((item) => (
                  <tr key={item.product_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4">
                      <div className={`font-medium ${textClass}`}>{item.product_name}</div>
                      <div className="text-xs text-gray-500">{item.category}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm">{item.product_code}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-mono text-sm">{item.barcode}</span>
                    </td>
                    {activeWarehouse === 'warehouse1' && (
                      <>
                        <td className="px-6 py-4 text-center">
                          <span className={`text-lg font-bold ${textClass}`}>{item.warehouse1_stock}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm text-yellow-600">{item.warehouse1_reserved}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm text-green-600 font-medium">{item.warehouse1_available}</span>
                        </td>
                      </>
                    )}
                    {activeWarehouse === 'warehouse2' && (
                      <>
                        <td className="px-6 py-4 text-center">
                          <span className={`text-lg font-bold ${textClass}`}>{item.warehouse2_stock}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm text-red-600">{item.warehouse2_damaged}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm text-orange-600">{item.warehouse2_return}</span>
                        </td>
                      </>
                    )}
                    {activeWarehouse === 'warehouse3' && (
                      <>
                        <td className="px-6 py-4 text-center">
                          <span className={`text-lg font-bold ${textClass}`}>{item.warehouse3_stock}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm text-blue-600">{item.warehouse3_virtual}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm text-purple-600">{item.warehouse3_planned}</span>
                        </td>
                      </>
                    )}
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedProduct(item)}
                          className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                          title="Detay"
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProduct(item);
                            setShowTransferModal(true);
                          }}
                          className="p-2 text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg"
                          title="Transfer"
                        >
                          <ArrowRightLeft className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && !showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`${cardClass} rounded-2xl max-w-3xl w-full`}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h3 className={`text-xl font-bold ${textClass}`}>Tüm Depolar - Stok Durumu</h3>
              <button onClick={() => setSelectedProduct(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <h4 className={`text-lg font-bold ${textClass} mb-1`}>{selectedProduct.product_name}</h4>
                <div className="text-sm text-gray-500">
                  Kod: {selectedProduct.product_code} | Barkod: {selectedProduct.barcode}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Warehouse 1 */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Warehouse className="w-5 h-5 text-blue-600" />
                    <h5 className={`font-bold ${textClass}`}>Depo 1</h5>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Toplam:</span>
                      <span className={`font-bold ${textClass}`}>{selectedProduct.warehouse1_stock}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Rezerve:</span>
                      <span className="font-medium text-yellow-600">{selectedProduct.warehouse1_reserved}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Kullanılabilir:</span>
                      <span className="font-medium text-green-600">{selectedProduct.warehouse1_available}</span>
                    </div>
                  </div>
                </div>

                {/* Warehouse 2 */}
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                    <h5 className={`font-bold ${textClass}`}>Depo 2</h5>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Toplam:</span>
                      <span className={`font-bold ${textClass}`}>{selectedProduct.warehouse2_stock}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Hasarlı:</span>
                      <span className="font-medium text-red-600">{selectedProduct.warehouse2_damaged}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">İade:</span>
                      <span className="font-medium text-orange-600">{selectedProduct.warehouse2_return}</span>
                    </div>
                  </div>
                </div>

                {/* Warehouse 3 */}
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Cloud className="w-5 h-5 text-purple-600" />
                    <h5 className={`font-bold ${textClass}`}>Depo 3</h5>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Toplam:</span>
                      <span className={`font-bold ${textClass}`}>{selectedProduct.warehouse3_stock}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Sanal:</span>
                      <span className="font-medium text-blue-600">{selectedProduct.warehouse3_virtual}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Planlanan:</span>
                      <span className="font-medium text-purple-600">{selectedProduct.warehouse3_planned}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grand Total */}
              <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className={`font-bold ${textClass}`}>Tüm Depolar Toplamı:</span>
                  <span className={`text-2xl font-bold ${textClass}`}>
                    {selectedProduct.warehouse1_stock + selectedProduct.warehouse2_stock + selectedProduct.warehouse3_stock}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

