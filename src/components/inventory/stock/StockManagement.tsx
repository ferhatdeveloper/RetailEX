import { useState } from 'react';
import { Package, TrendingDown, AlertTriangle, Search, Download, Upload, BarChart3, Eye, Plus, Edit, FileText } from 'lucide-react';
import type { Product } from '../../../App';

interface StockManagementProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
}

interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'in' | 'out' | 'adjustment' | 'sale' | 'return';
  quantity: number;
  date: string;
  reason: string;
  user: string;
}

export function StockManagement({ products, setProducts }: StockManagementProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'overview' | 'movements' | 'count' | 'alerts'>('overview');
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  
  // Mock stock movements data
  const [stockMovements] = useState<StockMovement[]>([
    { id: '1', productId: '1', productName: 'Laptop HP', type: 'in', quantity: 50, date: new Date().toISOString(), reason: 'Yeni mal girişi', user: 'Admin' },
    { id: '2', productId: '2', productName: 'Mouse Logitech', type: 'sale', quantity: -5, date: new Date().toISOString(), reason: 'Satış', user: 'Kasiyer 1' },
    { id: '3', productId: '3', productName: 'Klavye Mekanik', type: 'adjustment', quantity: -2, date: new Date().toISOString(), reason: 'Fire', user: 'Admin' },
  ]);
  
  // Calculate statistics
  const totalProducts = products.length;
  const lowStockProducts = products.filter(p => p.stock <= 10);
  const outOfStockProducts = products.filter(p => p.stock === 0);
  const totalStockValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);
  
  // Filter products
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.barcode.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleAdjustment = () => {
    if (!selectedProduct || !adjustmentQuantity || !adjustmentReason) {
      alert('Lütfen tüm alanları doldurun');
      return;
    }
    
    const qty = parseInt(adjustmentQuantity);
    setProducts(products.map(p =>
      p.id === selectedProduct.id
        ? { ...p, stock: Math.max(0, p.stock + qty) }
        : p
    ));
    
    setShowAdjustmentModal(false);
    setSelectedProduct(null);
    setAdjustmentQuantity('');
    setAdjustmentReason('');
  };
  
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h2 className="text-2xl">Stok Yönetimi</h2>
        <p className="text-sm text-gray-600 mt-1">Stok takibi, sayım ve hareketler</p>
      </div>
      
      {/* Stats Cards */}
      <div className="px-6 py-4 grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Toplam Ürün</p>
              <p className="text-3xl text-blue-600 mt-1">{totalProducts}</p>
            </div>
            <Package className="w-12 h-12 text-blue-600 opacity-20" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-4 border-2 border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Düşük Stok</p>
              <p className="text-3xl text-orange-600 mt-1">{lowStockProducts.length}</p>
            </div>
            <TrendingDown className="w-12 h-12 text-orange-600 opacity-20" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-4 border-2 border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tükenen Ürün</p>
              <p className="text-3xl text-red-600 mt-1">{outOfStockProducts.length}</p>
            </div>
            <AlertTriangle className="w-12 h-12 text-red-600 opacity-20" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-4 border-2 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Stok Değeri</p>
              <p className="text-2xl text-green-600 mt-1">{totalStockValue.toFixed(2)}</p>
            </div>
            <BarChart3 className="w-12 h-12 text-green-600 opacity-20" />
          </div>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="px-6 py-2 bg-white border-b">
        <div className="flex gap-2">
          {(['overview', 'movements', 'count', 'alerts'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setSelectedTab(tab)}
              className={`px-4 py-2 rounded-t border-b-2 transition-colors ${
                selectedTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab === 'overview' ? 'Genel Bakış' :
               tab === 'movements' ? 'Stok Hareketleri' :
               tab === 'count' ? 'Sayım İşlemleri' :
               'Uyarılar'}
            </button>
          ))}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {selectedTab === 'overview' && (
          <div className="bg-white rounded-lg border">
            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ürün ara..."
                  className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            
            {/* Table */}
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm">Ürün Adı</th>
                    <th className="px-4 py-3 text-left text-sm">Barkod</th>
                    <th className="px-4 py-3 text-right text-sm">Stok</th>
                    <th className="px-4 py-3 text-right text-sm">Fiyat</th>
                    <th className="px-4 py-3 text-right text-sm">Değer</th>
                    <th className="px-4 py-3 text-left text-sm">Durum</th>
                    <th className="px-4 py-3 text-center text-sm">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProducts.map(product => {
                    const stockValue = product.stock * product.price;
                    const stockStatus = product.stock === 0 ? 'out' : product.stock <= 10 ? 'low' : 'ok';
                    
                    return (
                      <tr key={product.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p>{product.name}</p>
                            <p className="text-xs text-gray-500">{product.category}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{product.barcode}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`px-2 py-1 rounded text-sm ${
                            stockStatus === 'out' ? 'bg-red-100 text-red-700' :
                            stockStatus === 'low' ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {product.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">{product.price.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right text-sm">{stockValue.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${
                            stockStatus === 'out' ? 'bg-red-100 text-red-700' :
                            stockStatus === 'low' ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {stockStatus === 'out' ? '● Tükendi' :
                             stockStatus === 'low' ? '● Düşük' :
                             '● Normal'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              setSelectedProduct(product);
                              setShowAdjustmentModal(true);
                            }}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            <Edit className="w-4 h-4 inline mr-1" />
                            Düzelt
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {selectedTab === 'movements' && (
          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b">
              <h3 className="text-lg">Stok Hareketleri</h3>
            </div>
            
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm">Tarih</th>
                    <th className="px-4 py-3 text-left text-sm">Ürün</th>
                    <th className="px-4 py-3 text-left text-sm">Tip</th>
                    <th className="px-4 py-3 text-right text-sm">Miktar</th>
                    <th className="px-4 py-3 text-left text-sm">Neden</th>
                    <th className="px-4 py-3 text-left text-sm">Kullanıcı</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stockMovements.map(movement => (
                    <tr key={movement.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        {new Date(movement.date).toLocaleString('tr-TR')}
                      </td>
                      <td className="px-4 py-3 text-sm">{movement.productName}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          movement.type === 'in' ? 'bg-green-100 text-green-700' :
                          movement.type === 'out' ? 'bg-red-100 text-red-700' :
                          movement.type === 'sale' ? 'bg-blue-100 text-blue-700' :
                          movement.type === 'return' ? 'bg-purple-100 text-purple-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {movement.type === 'in' ? 'Giriş' :
                           movement.type === 'out' ? 'Çıkış' :
                           movement.type === 'sale' ? 'Satış' :
                           movement.type === 'return' ? 'İade' :
                           'Düzeltme'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right ${
                        movement.quantity > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                      </td>
                      <td className="px-4 py-3 text-sm">{movement.reason}</td>
                      <td className="px-4 py-3 text-sm">{movement.user}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {selectedTab === 'count' && (
          <div className="bg-white rounded-lg border p-6">
            <div className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-xl mb-2">Stok Sayım</h3>
              <p className="text-gray-600 mb-4">Fiziksel stok sayımı başlatın</p>
              <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Plus className="w-5 h-5 inline mr-2" />
                Yeni Sayım Başlat
              </button>
            </div>
          </div>
        )}
        
        {selectedTab === 'alerts' && (
          <div className="space-y-4">
            {lowStockProducts.length > 0 && (
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b bg-orange-50">
                  <h3 className="text-lg flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-orange-600" />
                    Düşük Stok Uyarıları ({lowStockProducts.length})
                  </h3>
                </div>
                <div className="p-4 space-y-2">
                  {lowStockProducts.map(product => (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-orange-50 rounded">
                      <div>
                        <p>{product.name}</p>
                        <p className="text-sm text-gray-600">Kalan: {product.stock} adet</p>
                      </div>
                      <button className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">
                        Sipariş Ver
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {outOfStockProducts.length > 0 && (
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b bg-red-50">
                  <h3 className="text-lg flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    Tükenen Ürünler ({outOfStockProducts.length})
                  </h3>
                </div>
                <div className="p-4 space-y-2">
                  {outOfStockProducts.map(product => (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-red-50 rounded">
                      <div>
                        <p>{product.name}</p>
                        <p className="text-sm text-gray-600">Stokta yok</p>
                      </div>
                      <button className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                        Acil Sipariş
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Adjustment Modal */}
      {showAdjustmentModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="p-6 border-b">
              <h3 className="text-xl">Stok Düzeltme</h3>
              <p className="text-sm text-gray-600 mt-1">{selectedProduct.name}</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm mb-2">Mevcut Stok:</label>
                <p className="text-2xl text-blue-600">{selectedProduct.stock}</p>
              </div>
              
              <div>
                <label className="block text-sm mb-2">Miktar Değişimi:</label>
                <input
                  type="number"
                  value={adjustmentQuantity}
                  onChange={(e) => setAdjustmentQuantity(e.target.value)}
                  placeholder="Örn: +10 veya -5"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Pozitif değer ekler, negatif değer çıkarır
                </p>
              </div>
              
              <div>
                <label className="block text-sm mb-2">Düzeltme Nedeni:</label>
                <select
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Neden seçin...</option>
                  <option value="fire">Fire/Kayıp</option>
                  <option value="damaged">Hasarlı Ürün</option>
                  <option value="count">Sayım Farkı</option>
                  <option value="transfer">Transfer</option>
                  <option value="other">Diğer</option>
                </select>
              </div>
            </div>
            
            <div className="p-6 border-t flex gap-2">
              <button
                onClick={() => {
                  setShowAdjustmentModal(false);
                  setSelectedProduct(null);
                  setAdjustmentQuantity('');
                  setAdjustmentReason('');
                }}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleAdjustment}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Düzelt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

