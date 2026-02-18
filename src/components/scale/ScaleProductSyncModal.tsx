import { useState } from 'react';
import { X, Send, CheckCircle2, XCircle, Loader2, Filter } from 'lucide-react';
import type { Product } from '../../App';
import type { ScaleDevice } from '../../utils/scaleProtocol';
import { sendProductsToScale } from '../../utils/scaleProtocol';

interface ScaleProductSyncModalProps {
  device: ScaleDevice;
  products: Product[];
  onClose: () => void;
  onSyncComplete: (device: ScaleDevice) => void;
}

export function ScaleProductSyncModal({ device, products, onClose, onSyncComplete }: ScaleProductSyncModalProps) {
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [pluStartIndex, setPluStartIndex] = useState(1);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterUnit, setFilterUnit] = useState<string>('all');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    sentCount?: number;
    failedCount?: number;
  } | null>(null);

  // Filter products by weight-based units (KG, GR, LT)
  const weightBasedProducts = products.filter(p => {
    const unit = p.unit.toUpperCase();
    return unit === 'KG' || unit === 'GR' || unit === 'GRAM' || unit === 'LT' || unit === 'LİTRE';
  });

  // Get unique categories
  const categories = Array.from(new Set(weightBasedProducts.map(p => p.category)));

  // Get unique units
  const units = Array.from(new Set(weightBasedProducts.map(p => p.unit)));

  // Apply filters
  const filteredProducts = weightBasedProducts.filter(p => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (filterUnit !== 'all' && p.unit !== filterUnit) return false;
    return true;
  });

  const handleToggleProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const handleSync = async () => {
    const productsToSync = filteredProducts.filter(p => selectedProducts.has(p.id));
    
    if (productsToSync.length === 0) {
      return;
    }

    setSyncing(true);
    setSyncResult(null);

    try {
      const result = await sendProductsToScale(device, productsToSync, pluStartIndex);
      setSyncResult(result);

      if (result.success) {
        // Update device last sync time
        const updatedDevice: ScaleDevice = {
          ...device,
          lastSync: new Date().toISOString(),
          productCount: (device.productCount || 0) + (result.sentCount || 0)
        };
        
        setTimeout(() => {
          onSyncComplete(updatedDevice);
        }, 2000);
      }
    } catch (error) {
      setSyncResult({
        success: false,
        message: error instanceof Error ? error.message : 'Bilinmeyen hata'
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white">Ürün Senkronizasyonu</h2>
              <p className="text-xs text-white/80 mt-0.5">
                {device.name} - {device.ipAddress}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={syncing}
            className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* PLU Settings */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm text-gray-900 mb-1">PLU Kodu Başlangıcı</h3>
                <p className="text-xs text-gray-600">
                  Ürünler bu PLU kodundan başlayarak sırayla gönderilecek
                </p>
              </div>
              <input
                type="number"
                value={pluStartIndex}
                onChange={(e) => setPluStartIndex(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={syncing}
                className="w-32 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                min="1"
                max="99999"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="mb-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-700">Filtrele:</span>
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              disabled={syncing}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="all">Tüm Kategoriler</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              value={filterUnit}
              onChange={(e) => setFilterUnit(e.target.value)}
              disabled={syncing}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="all">Tüm Birimler</option>
              {units.map(unit => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>

            <div className="flex-1" />

            <button
              onClick={handleSelectAll}
              disabled={syncing}
              className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {selectedProducts.size === filteredProducts.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
            </button>
          </div>

          {/* Product List */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
                  {filteredProducts.length} ürün bulundu (Tartılı ürünler)
                </span>
                <span className="text-sm text-gray-600">
                  {selectedProducts.size} ürün seçildi
                </span>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100 hover:scrollbar-thumb-gray-500">
              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>Tartılı ürün bulunamadı (KG, GR, LT)</p>
                  <p className="text-sm mt-1">Sadece ağırlık bazlı ürünler teraziye gönderilebilir</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredProducts.map((product, index) => {
                    const pluCode = pluStartIndex + index;
                    const isSelected = selectedProducts.has(product.id);
                    
                    return (
                      <div
                        key={product.id}
                        className={`p-4 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                        }`}
                        onClick={() => handleToggleProduct(product.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                          }`}>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <h4 className="text-gray-900 truncate">{product.name}</h4>
                              <span className="text-sm text-gray-500 ml-4">PLU: {String(pluCode).padStart(5, '0')}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                              <span>{product.category}</span>
                              <span>•</span>
                              <span>{product.price.toFixed(2)} / {product.unit}</span>
                              <span>•</span>
                              <span className="font-mono text-xs">{product.barcode}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sync Result */}
          {syncResult && (
            <div className={`mt-4 p-4 rounded-lg border ${
              syncResult.success 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start gap-3">
                {syncResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`text-sm ${syncResult.success ? 'text-green-700' : 'text-red-700'}`}>
                    {syncResult.message}
                  </p>
                  {syncResult.sentCount !== undefined && (
                    <div className="mt-2 text-xs text-gray-600">
                      <p>Gönderilen: {syncResult.sentCount} ürün</p>
                      {syncResult.failedCount !== undefined && syncResult.failedCount > 0 && (
                        <p className="text-red-600">Başarısız: {syncResult.failedCount} ürün</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedProducts.size > 0 && (
              <span>
                PLU {pluStartIndex} - {pluStartIndex + selectedProducts.size - 1} arası kullanılacak
              </span>
            )}
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={syncing}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
            >
              {syncResult?.success ? 'Kapat' : 'İptal'}
            </button>
            {!syncResult?.success && (
              <button
                onClick={handleSync}
                disabled={syncing || selectedProducts.size === 0}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gönderiliyor...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Gönder ({selectedProducts.size})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
