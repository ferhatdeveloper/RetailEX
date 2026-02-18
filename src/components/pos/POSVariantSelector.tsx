import { X, Check, Package } from 'lucide-react';
import type { Product } from '../../core/types';
import { getProductColors, getProductSizes, getVariantStock } from './types';

interface POSVariantSelectorProps {
  product: Product;
  selectedColor: string | null;
  selectedSize: string | null;
  onColorSelect: (color: string) => void;
  onSizeSelect: (size: string) => void;
  onClose: () => void;
}

export function POSVariantSelector({
  product,
  selectedColor,
  selectedSize,
  onColorSelect,
  onSizeSelect,
  onClose
}: POSVariantSelectorProps) {
  const colors = getProductColors(product);
  const sizes = getProductSizes(product, selectedColor);

  return (
    <div className="h-full flex flex-col bg-white p-4">
      {/* Product Info Header */}
      <div className="bg-white border border-gray-200 rounded p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex-1">
            <div className="text-sm text-gray-600 mb-1">{product.category}</div>
            <h3 className="text-base text-gray-900 mb-1">{product.name}</h3>
            <div className="text-base text-blue-600">{product.price.toFixed(2)}</div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Color Selection */}
        {!selectedColor && colors.length > 0 && (
          <div>
            <label className="block text-sm text-gray-700 mb-2">Renk Seç:</label>
            <div className="grid grid-cols-3 gap-2">
              {colors.map(color => (
                <button
                  key={color}
                  onClick={() => onColorSelect(color)}
                  className="px-4 py-3 text-sm rounded border border-gray-300 transition-all bg-white text-gray-900 hover:border-blue-500 hover:bg-blue-50"
                >
                  {color}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Size Selection */}
        {selectedColor && sizes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm text-gray-700">
                Beden Seç: <span className="text-blue-600">{selectedColor}</span>
              </label>
              <button
                onClick={() => {
                  onColorSelect('');
                  onSizeSelect('');
                }}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Renk Değiştir
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {sizes.map(size => {
                const variantStock = getVariantStock(product, selectedColor, size);
                const hasStock = variantStock > 0;

                return (
                  <button
                    key={size}
                    onClick={() => hasStock && onSizeSelect(size)}
                    disabled={!hasStock}
                    className={`px-3 py-3 text-sm rounded border transition-all relative ${hasStock
                        ? 'bg-white border-gray-300 text-gray-900 hover:border-blue-500 hover:bg-blue-50'
                        : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                      }`}
                  >
                    <div className="font-medium">{size}</div>
                    <div className={`text-xs mt-1 ${hasStock ? 'text-green-600' : 'text-red-500'}`}>
                      {hasStock ? `${variantStock} adet` : 'Stok Yok'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded p-3">
        <div className="flex items-start gap-2">
          <Package className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            {!selectedColor && colors.length > 0 && (
              <p>Lütfen önce renk seçiniz.</p>
            )}
            {selectedColor && sizes.length > 0 && (
              <p>Lütfen beden seçiniz. Sadece stokta olan bedenler seçilebilir.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

