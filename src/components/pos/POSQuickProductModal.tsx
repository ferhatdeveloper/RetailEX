import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import type { Product } from '../../core/types';

interface POSQuickProductModalProps {
  products: Product[];
  slotNumber: number;
  onClose: () => void;
  onSelect: (product: Product) => void;
}

export function POSQuickProductModal({
  products,
  slotNumber,
  onClose,
  onSelect
}: POSQuickProductModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState(products);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredProducts(products);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = products.filter(p =>
      (p.name || '').toLowerCase().includes(term) ||
      (p.barcode || '').toLowerCase().includes(term) ||
      (p.sku || '').toLowerCase().includes(term)
    );
    setFilteredProducts(filtered);
  }, [searchTerm, products]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white w-[900px] max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <h2 className="text-lg">Hızlı Ürün Seç - Slot #{slotNumber + 1}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Barkod veya ürün adı ile ara..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 focus:outline-none focus:border-blue-400"
              autoFocus
            />
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="bg-gradient-to-r from-blue-600 to-blue-700 text-white sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-sm border-r border-blue-500">Barkod</th>
                <th className="px-4 py-2 text-left text-sm border-r border-blue-500">Ürün Adı</th>
                <th className="px-4 py-2 text-left text-sm border-r border-blue-500">Kategori</th>
                <th className="px-4 py-2 text-right text-sm border-r border-blue-500">Fiyat</th>
                <th className="px-4 py-2 text-center text-sm">Stok</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Ürün bulunamadı
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr
                    key={product.id}
                    onClick={() => onSelect(product)}
                    className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm border-r border-gray-100">{product.barcode}</td>
                    <td className="px-4 py-3 text-sm border-r border-gray-100">{product.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 border-r border-gray-100">
                      {Array.isArray(product.category) ? product.category.join(', ') : product.category}
                    </td>
                    <td className="px-4 py-3 text-sm text-right border-r border-gray-100">{product.price.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className={`px-2 py-1 text-xs ${product.stock > 10
                          ? 'bg-green-100 text-green-700'
                          : product.stock > 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                        {product.stock}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {filteredProducts.length} ürün gösteriliyor
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 bg-white hover:bg-gray-50 transition-colors"
          >
            İptal
          </button>
        </div>
      </div>
    </div>
  );
}
