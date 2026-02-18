/**
 * Marketplace Integration Module - Pazar Yeri Entegrasyonları
 * n11, Trendyol, Hepsiburada, Amazon entegrasyonları
 */

import { useState } from 'react';
import { ShoppingBag, TrendingUp, Package, RefreshCw } from 'lucide-react';

export function MarketplaceIntegrationModule() {
  const [marketplaces] = useState([
    { id: 'n11', name: 'n11', logo: '🛍️', status: 'active', orders: 145, products: 248, revenue: 12500000 },
    { id: 'trendyol', name: 'Trendyol', logo: '🛒', status: 'active', orders: 298, products: 312, revenue: 28900000 },
    { id: 'hepsiburada', name: 'Hepsiburada', logo: '🏪', status: 'inactive', orders: 0, products: 0, revenue: 0 },
    { id: 'amazon', name: 'Amazon', logo: '📦', status: 'inactive', orders: 0, products: 0, revenue: 0 },
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShoppingBag className="w-8 h-8 text-orange-600" />
          Pazar Yeri Entegrasyonları
        </h1>
        <button className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          Senkronize Et
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-orange-50 rounded-lg p-4">
          <ShoppingBag className="w-8 h-8 text-orange-600 mb-2" />
          <p className="text-sm text-orange-700">Aktif Platform</p>
          <p className="text-2xl font-bold text-orange-900">2</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <Package className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm text-green-700">Toplam Sipariş</p>
          <p className="text-2xl font-bold text-green-900">443</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <TrendingUp className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm text-blue-700">Toplam Ürün</p>
          <p className="text-2xl font-bold text-blue-900">560</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <TrendingUp className="w-8 h-8 text-purple-600 mb-2" />
          <p className="text-sm text-purple-700">Toplam Ciro</p>
          <p className="text-xl font-bold text-purple-900">41.4M IQD</p>
        </div>
      </div>

      {/* Marketplaces */}
      <div className="grid grid-cols-2 gap-6">
        {marketplaces.map(mp => (
          <div key={mp.id} className="bg-white rounded-lg shadow p-6 border-2 border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{mp.logo}</span>
                <h3 className="text-xl font-bold">{mp.name}</h3>
              </div>
              {mp.status === 'active' ? (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                  Bağlı
                </span>
              ) : (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                  Bağlı Değil
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-xs text-gray-600">Siparişler</p>
                <p className="text-2xl font-bold text-blue-900">{mp.orders}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Ürünler</p>
                <p className="text-2xl font-bold text-purple-900">{mp.products}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Ciro</p>
                <p className="text-lg font-bold text-green-900">{(mp.revenue / 1000000).toFixed(1)}M</p>
              </div>
            </div>

            {mp.status === 'active' ? (
              <div className="flex gap-2">
                <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                  Yönet
                </button>
                <button className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                  Ayarlar
                </button>
              </div>
            ) : (
              <button className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700">
                Bağlan
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">ğŸ’¡ Pazar Yeri Entegrasyonu</h4>
        <p className="text-sm text-blue-800">
          Tüm pazar yerlerindeki ürünlerinizi tek panelden yönetin. Stok, fiyat ve sipariş senkronizasyonu otomatiktir.
        </p>
      </div>
    </div>
  );
}

