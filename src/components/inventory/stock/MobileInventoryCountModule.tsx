/**
 * Mobile Inventory Count Module - Mobil Sayım
 */

import { Smartphone, Scan, CheckCircle } from 'lucide-react';

export function MobileInventoryCountModule() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Smartphone className="w-8 h-8 text-purple-600" />
          Mobil Stok Sayım
        </h1>
      </div>

      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-8 text-center">
        <Scan className="w-16 h-16 text-purple-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-purple-900 mb-2">Mobil Uygulama ile Sayım</h2>
        <p className="text-gray-700 mb-6">
          Mobil cihazınızdan barkod okutarak hızlı ve kolay stok sayımı yapın
        </p>
        <button 
          onClick={() => window.open('/?mode=mobile', '_blank')}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 inline-flex items-center gap-2"
        >
          <Smartphone className="w-5 h-5" />
          Mobil Uygulamayı Aç
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <CheckCircle className="w-8 h-8 text-green-600 mb-2" />
          <p className="text-sm text-gray-600">Tamamlanan Sayımlar</p>
          <p className="text-2xl font-bold text-gray-900">12</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <Scan className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-sm text-gray-600">Okutulan Ürün</p>
          <p className="text-2xl font-bold text-gray-900">1,247</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <Smartphone className="w-8 h-8 text-purple-600 mb-2" />
          <p className="text-sm text-gray-600">Aktif Cihaz</p>
          <p className="text-2xl font-bold text-gray-900">3</p>
        </div>
      </div>
    </div>
  );
}

