import { useState, useEffect } from 'react';
import { Package, TrendingDown, AlertTriangle, ArrowLeftRight, FileText, Download, Upload, Printer } from 'lucide-react';
import type { Product } from '../../../App';
import { formatNumber } from '../../../utils/formatNumber';
import { WarehouseTransferModule } from '../warehouse/WarehouseTransferModule';
import { stockMovementAPI } from '../../../services/stockMovementAPI';
import { WavePickingModule } from '../../wms/WavePickingModule';

interface StockModuleProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
}

export function StockModule({ products, setProducts }: StockModuleProps) {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'movements' | 'count' | 'transfer' | 'picking'>('overview');
  const [showStockUpdateModal, setShowStockUpdateModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [updateQuantity, setUpdateQuantity] = useState(0);
  const [updateType, setUpdateType] = useState<'add' | 'subtract' | 'set'>('add');
  const [updateNote, setUpdateNote] = useState('');

  // Transfer states
  const [transferProduct, setTransferProduct] = useState<Product | null>(null);
  const [transferQuantity, setTransferQuantity] = useState(0);
  const [sourceStore, setSourceStore] = useState('store1');
  const [targetStore, setTargetStore] = useState('store2');
  const [transferNote, setTransferNote] = useState('');

  // Calculate stock statistics
  const totalItems = products.reduce((sum, p) => sum + p.stock, 0);
  const totalCostValue = products.reduce((sum, p) => sum + (p.stock * p.cost), 0);
  const totalSaleValue = products.reduce((sum, p) => sum + (p.stock * p.price), 0);
  const lowStockCount = products.filter(p => p.stock < 30).length;
  const criticalStockCount = products.filter(p => p.stock < 10).length;
  const outOfStockCount = products.filter(p => p.stock === 0).length;

  // Stock movements (mock data for demo)
  // Stock movements
  const [stockMovements, setStockMovements] = useState<any[]>([]);

  useEffect(() => {
    loadRecentMovements();
  }, []);

  const loadRecentMovements = async () => {
    try {
      const data = await stockMovementAPI.getAll();
      setStockMovements(data);
    } catch (error) {
      console.error('Error loading movements:', error);
    }
  };

  const handleStockUpdate = () => {
    if (!selectedProduct) return;

    const updatedProducts = products.map(p => {
      if (p.id === selectedProduct.id) {
        let newStock = p.stock;
        if (updateType === 'add') newStock += updateQuantity;
        else if (updateType === 'subtract') newStock -= updateQuantity;
        else newStock = updateQuantity;

        return { ...p, stock: Math.max(0, newStock) };
      }
      return p;
    });

    setProducts(updatedProducts);
    setShowStockUpdateModal(false);
    setSelectedProduct(null);
    setUpdateQuantity(0);
    setUpdateNote('');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header - Minimal */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            <h2 className="text-sm">Stok & Envanter</h2>
            <span className="text-orange-100 text-[10px] ml-2">• {totalItems} ürün</span>
          </div>
          <div className="flex gap-1.5">
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <Download className="w-3 h-3" />
              Dışa Aktar
            </button>
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <Upload className="w-3 h-3" />
              İçe Aktar
            </button>
            <button className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-[10px]">
              <Printer className="w-3 h-3" />
              Yazdır
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="flex gap-1 px-6">
          <button
            onClick={() => setSelectedTab('overview')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'overview'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            Stok Durumu
          </button>
          <button
            onClick={() => setSelectedTab('movements')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'movements'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            Stok Hareketleri
          </button>
          <button
            onClick={() => setSelectedTab('count')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'count'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            Sayım & Fire
          </button>
          <button
            onClick={() => setSelectedTab('transfer')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'transfer'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            Depo Transferi
          </button>
          <button
            onClick={() => setSelectedTab('picking')}
            className={`px-6 py-3 border-b-2 transition-colors ${selectedTab === 'picking'
              ? 'border-orange-600 text-orange-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
          >
            Sipariş Toplama (Picking)
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {selectedTab === 'overview' && (
          <>
            {/* Kurumsal Özet Panel */}
            <div className="bg-white border border-gray-300 rounded mb-3">
              <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
                <h3 className="text-[11px] text-gray-700">Stok Durumu Özeti</h3>
              </div>
              <div className="grid grid-cols-4 divide-x divide-gray-200">
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span className="text-[10px] text-gray-600">Toplam Stok Miktarı</span>
                  </div>
                  <div className="text-base text-gray-900">{formatNumber(totalItems, 0, false)}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{products.length} farklı ürün</div>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-green-600" />
                    <span className="text-[10px] text-gray-600">Toplam Stok Değeri</span>
                  </div>
                  <div className="text-base text-green-600">{formatNumber(totalCostValue, 0, false)} IQD</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">Maliyet bazlı</div>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-purple-600" />
                    <span className="text-[10px] text-gray-600">Düşük Stok</span>
                  </div>
                  <div className="text-base text-purple-600">{lowStockCount}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">Ürün sipariş gerekiyor</div>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowLeftRight className="w-4 h-4 text-red-600" />
                    <span className="text-[10px] text-gray-600">Kritik Stok</span>
                  </div>
                  <div className="text-base text-red-600">{criticalStockCount}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">Acil sipariş gerekli</div>
                </div>
              </div>
            </div>

            {/* Stock Status Table - Minimal */}
            <div className="bg-white border border-gray-300">
              <div className="bg-[#E3F2FD] border-b border-gray-300 px-3 py-1.5">
                <h3 className="text-[11px] text-gray-700">Detaylı Stok Durumu</h3>
              </div>
              <div className="overflow-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#E3F2FD] border-b border-gray-300">
                      <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">ÜRÜN KODU</th>
                      <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">ÜRÜN ADI</th>
                      <th className="px-2 py-1 text-left text-[10px] text-gray-700 border-r border-gray-300">KATEGORİ</th>
                      <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">MEVCUT STOK</th>
                      <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">BİRİM MALİYET</th>
                      <th className="px-2 py-1 text-right text-[10px] text-gray-700 border-r border-gray-300">STOK DEĞERİ</th>
                      <th className="px-2 py-1 text-center text-[10px] text-gray-700 border-r border-gray-300">DURUM</th>
                      <th className="px-2 py-1 text-center text-[10px] text-gray-700">İŞLEM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(product => {
                      const stockValue = product.stock * product.cost;
                      let status = 'normal';
                      let statusColor = 'bg-green-100 text-green-700';
                      let statusText = 'Normal';

                      if (product.stock === 0) {
                        status = 'out';
                        statusColor = 'bg-gray-100 text-gray-700';
                        statusText = 'Tükendi';
                      } else if (product.stock < 10) {
                        status = 'critical';
                        statusColor = 'bg-red-100 text-red-700';
                        statusText = 'Kritik';
                      } else if (product.stock < 30) {
                        status = 'low';
                        statusColor = 'bg-yellow-100 text-yellow-700';
                        statusText = 'Düşük';
                      }

                      return (
                        <tr key={product.id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="px-2 py-0.5 text-[10px] text-gray-600 border-r border-gray-200">{product.barcode}</td>
                          <td className="px-2 py-0.5 border-r border-gray-200">
                            <div>
                              <p className="text-[10px]">{product.name}</p>
                              <p className="text-[9px] text-gray-500">{product.barcode}</p>
                            </div>
                          </td>
                          <td className="px-2 py-0.5 border-r border-gray-200">
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                              {product.category}
                            </span>
                          </td>
                          <td className="px-2 py-0.5 text-center border-r border-gray-200">
                            <span className="text-lg">{product.stock}</span>
                            <span className="text-xs text-gray-500 ml-1">{product.unit}</span>
                          </td>
                          <td className="px-2 py-0.5 text-right border-r border-gray-200 text-gray-700">{formatNumber(product.cost, 2, false)} IQD</td>
                          <td className="px-2 py-0.5 text-right border-r border-gray-200 text-blue-600">{formatNumber(stockValue, 2, false)} IQD</td>
                          <td className="px-2 py-0.5 text-center border-r border-gray-200">
                            <span className={`px-3 py-1 text-xs rounded-full ${statusColor}`}>
                              {statusText}
                            </span>
                          </td>
                          <td className="px-2 py-0.5 text-center">
                            <button
                              onClick={() => {
                                setSelectedProduct(product);
                                setShowStockUpdateModal(true);
                              }}
                              className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 text-xs"
                            >
                              Güncelle
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h4 className="text-sm text-gray-600 mb-4">Stok Değer Özeti</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Maliyet Değeri:</span>
                    <span className="text-blue-600">{formatNumber(totalCostValue, 2, false)} IQD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Satış Değeri:</span>
                    <span className="text-green-600">{formatNumber(totalSaleValue, 2, false)} IQD</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm">Potansiyel Kar:</span>
                    <span className="text-purple-600">{formatNumber(totalSaleValue - totalCostValue, 2, false)} IQD</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h4 className="text-sm text-gray-600 mb-4">Stok Durumu Dağılımı</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Normal Stok:</span>
                    <span className="text-green-600">{products.filter(p => p.stock >= 30).length} ürün</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Düşük Stok:</span>
                    <span className="text-yellow-600">{lowStockCount} ürün</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Kritik Stok:</span>
                    <span className="text-red-600">{criticalStockCount} ürün</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-sm">Tükenen:</span>
                    <span className="text-gray-600">{outOfStockCount} ürün</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
                <h4 className="text-sm text-gray-600 mb-4">Kategori Dağılımı</h4>
                <div className="space-y-3">
                  {Array.from(new Set(products.map(p => p.category))).slice(0, 4).map((category, index) => {
                    const categoryProducts = products.filter(p => p.category === category);
                    const categoryStock = categoryProducts.reduce((sum, p) => sum + p.stock, 0);
                    return (
                      <div key={`category-${category}-${index}`} className="flex justify-between">
                        <span className="text-sm text-gray-600">{category}:</span>
                        <span className="text-blue-600">{categoryStock} adet</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {selectedTab === 'movements' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl">Stok Hareketleri</h3>
              <p className="text-sm text-gray-600 mt-1">Tüm giriş-çıkış kayıtları</p>
            </div>
            <div className="overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-300">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm text-gray-700">HAREKET NO</th>
                    <th className="px-4 py-3 text-left text-sm text-gray-700">TARİH/SAAT</th>
                    <th className="px-4 py-3 text-left text-sm text-gray-700">ÜRÜN</th>
                    <th className="px-4 py-3 text-left text-sm text-gray-700">İŞLEM TİPİ</th>
                    <th className="px-4 py-3 text-center text-sm text-gray-700">MİKTAR</th>
                    <th className="px-4 py-3 text-left text-sm text-gray-700">AÇIKLAMA</th>
                    <th className="px-4 py-3 text-left text-sm text-gray-700">KULLANICI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stockMovements.map((item: any) => {
                    const movement = item.movement || {};
                    const product = item.products || {};
                    const isIncoming = movement.movement_type === 'in';
                    const isOutgoing = movement.movement_type === 'out';

                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{movement.document_no || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {movement.movement_date ? new Date(movement.movement_date).toLocaleString('tr-TR') : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">{product.name || 'Bilinmeyen Ürün'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded ${isIncoming ? 'bg-green-100 text-green-700' :
                            isOutgoing ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                            {isIncoming ? 'Giriş' : isOutgoing ? 'Çıkış' : movement.movement_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={item.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                            {item.quantity > 0 ? '+' : ''}{item.quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{item.notes || movement.description || '-'}</td>
                        <td className="px-4 py-3 text-sm">{movement.created_by || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedTab === 'count' && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl">Stok Sayımı & Fire Yönetimi</h3>
              <p className="text-sm text-gray-600 mt-1">Envanter sayımı ve fire kayıtları</p>
            </div>
            <div className="p-6">
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600">Stok sayım modülü yakında eklenecek</p>
                <p className="text-sm text-gray-500 mt-2">Bu özellik geliştirilme aşamasında</p>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'transfer' && (
          <WarehouseTransferModule />
        )}

        {selectedTab === 'picking' && (
          <div className="h-[600px] border rounded-xl overflow-hidden shadow-inner bg-gray-100">
            <WavePickingModule />
          </div>
        )}
      </div>

      {/* Stock Update Modal */}
      {showStockUpdateModal && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md">
            <div className="p-6 border-b bg-gradient-to-r from-orange-600 to-orange-700 text-white">
              <h3 className="text-xl">Stok Güncelle</h3>
              <p className="text-sm text-orange-100 mt-1">{selectedProduct.name}</p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Mevcut Stok</label>
                <p className="text-2xl text-blue-600">{selectedProduct.stock} {selectedProduct.unit}</p>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">İşlem Tipi</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setUpdateType('add')}
                    className={`px-4 py-2 rounded-lg border-2 transition-colors ${updateType === 'add'
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-300 hover:border-green-600'
                      }`}
                  >
                    Ekle
                  </button>
                  <button
                    onClick={() => setUpdateType('subtract')}
                    className={`px-4 py-2 rounded-lg border-2 transition-colors ${updateType === 'subtract'
                      ? 'border-red-600 bg-red-50 text-red-700'
                      : 'border-gray-300 hover:border-red-600'
                      }`}
                  >
                    Çıkar
                  </button>
                  <button
                    onClick={() => setUpdateType('set')}
                    className={`px-4 py-2 rounded-lg border-2 transition-colors ${updateType === 'set'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-blue-600'
                      }`}
                  >
                    Ayarla
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Miktar</label>
                <input
                  type="number"
                  value={updateQuantity}
                  onChange={(e) => setUpdateQuantity(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-1">Açıklama</label>
                <textarea
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="İşlem açıklaması (opsiyonel)"
                />
              </div>

              {updateQuantity > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-gray-700">
                    Yeni Stok:{' '}
                    <span className="text-blue-600">
                      {updateType === 'add'
                        ? selectedProduct.stock + updateQuantity
                        : updateType === 'subtract'
                          ? Math.max(0, selectedProduct.stock - updateQuantity)
                          : updateQuantity
                      } {selectedProduct.unit}
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={handleStockUpdate}
                disabled={updateQuantity <= 0}
                className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Güncelle
              </button>
              <button
                onClick={() => {
                  setShowStockUpdateModal(false);
                  setSelectedProduct(null);
                  setUpdateQuantity(0);
                  setUpdateNote('');
                }}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
