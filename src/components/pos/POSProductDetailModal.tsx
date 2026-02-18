import React from 'react';
import { X, Package, MapPin, TrendingUp } from 'lucide-react';
import type { Product } from '../../core/types';

import { useLanguage } from '../../contexts/LanguageContext';

interface POSProductDetailModalProps {
  product: Product;
  onClose: () => void;
}

export function POSProductDetailModal({ product, onClose }: POSProductDetailModalProps) {
  const { t } = useLanguage();

  // Mock şube stok verileri
  const branchStocks = [
    { branchName: 'Baghdad Merkez Mağazası', stock: 145, reserved: 12, available: 133 },
    { branchName: 'Erbil Merkez Çarşı Mağazası', stock: 89, reserved: 5, available: 84 },
    { branchName: 'Basra Merkez AVM Mağazası', stock: 67, reserved: 8, available: 59 },
    { branchName: 'Mosul Sanayi Mağazası', stock: 34, reserved: 2, available: 32 },
    { branchName: 'Sulaymaniyah Çarşı Mağazası', stock: 0, reserved: 0, available: 0 },
  ];

  // Mock son hareketler
  const recentMovements = [
    { date: '2024-12-14 14:32', type: t.sales, quantity: -3, branch: 'Baghdad Merkez Mağazası' },
    { date: '2024-12-14 11:15', type: t.sales, quantity: -5, branch: 'Erbil Merkez Çarşı Mağazası' },
    { date: '2024-12-13 16:45', type: t.incomingTransfer, quantity: +20, branch: 'Baghdad Merkez Mağazası' },
    { date: '2024-12-13 10:20', type: t.sales, quantity: -2, branch: 'Basra Merkez AVM Mağazası' },
    { date: '2024-12-12 15:30', type: t.purchase, quantity: +100, branch: 'Baghdad Merkez Mağazası' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 flex items-center justify-center">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg">{t.productDetails}</h2>
              <p className="text-sm text-blue-100">{product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-6">
            {/* Left - Product Info */}
            <div className="space-y-4">
              <div className="bg-white border border-gray-200 p-4">
                <h3 className="text-sm text-gray-600 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  {t.productInfo}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.productName}:</span>
                    <span className="text-gray-900 font-medium">{product.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.barcodeLabel}:</span>
                    <span className="text-gray-900">{product.barcode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.categoryLabel}:</span>
                    <span className="text-gray-900">{product.category || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.costPrice}:</span>
                    <span className="text-gray-900">{product.cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t.salePrice}:</span>
                    <span className="text-gray-900">{product.price.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Son Hareketler */}
              <div className="bg-white border border-gray-200 p-4">
                <h3 className="text-sm text-gray-600 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  {t.recentMovements}
                </h3>
                <div className="space-y-1.5 text-xs">
                  {recentMovements.map((movement, index) => (
                    <div key={index} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                      <div>
                        <div className="text-gray-900">{movement.type}</div>
                        <div className="text-gray-500">{movement.date}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-medium ${movement.quantity > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                          {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                        </div>
                        <div className="text-gray-500">{movement.branch}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right - Şube Stok Durumu */}
            <div>
              <h3 className="text-sm font-semibold text-blue-700 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                {t.branchStockStatus}
              </h3>
              <div className="space-y-3">
                {branchStocks.map((branch, index) => (
                  <div key={index} className="border border-gray-200 p-3 hover:border-blue-400 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">{branch.branchName}</span>
                      <span className={`text-sm font-medium ${branch.available > 50
                        ? 'text-green-600'
                        : branch.available > 0
                          ? 'text-yellow-600'
                          : 'text-red-600'
                        }`}>
                        {branch.available} {t.piece}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500">{t.totalStock}</div>
                        <div className="text-gray-900 font-medium">{branch.stock}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">{t.reserved}</div>
                        <div className="text-orange-600 font-medium">{branch.reserved}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">{t.available}</div>
                        <div className="text-blue-600 font-medium">{branch.available}</div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Toplam */}
                <div className="pt-3 border-t border-gray-300">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{t.totalStock}</span>
                    <span className="text-lg font-medium text-blue-700">
                      {branchStocks.reduce((sum, b) => sum + b.available, 0)} {t.piece}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
