import { X, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import type { Product } from '../../core/types';

interface VariantSelectionPanelForCartProps {
  product: Product;
  currentVariant?: any;
  onSelect: (variant: any) => void;
  onClose: () => void;
}

export function VariantSelectionPanelForCart({
  product,
  currentVariant,
  onSelect,
  onClose
}: VariantSelectionPanelForCartProps) {
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  // Get color hex code helper
  const getColorHex = (colorName?: string, colorHex?: string) => {
    if (colorHex) return colorHex;
    if (!colorName) return '#9CA3AF';

    // Fallback renk haritası
    const colorMap: Record<string, string> = {
      'kırmızı': '#DC2626', 'kirmizi': '#DC2626', 'red': '#DC2626',
      'mavi': '#2563EB', 'blue': '#2563EB',
      'lacivert': '#1E40AF', 'navy': '#1E40AF',
      'yeşil': '#16A34A', 'yesil': '#16A34A', 'green': '#16A34A',
      'sarı': '#EAB308', 'sari': '#EAB308', 'yellow': '#EAB308',
      'turuncu': '#F97316', 'orange': '#F97316',
      'mor': '#9333EA', 'purple': '#9333EA',
      'pembe': '#EC4899', 'pink': '#EC4899',
      'siyah': '#000000', 'black': '#000000',
      'beyaz': '#FFFFFF', 'white': '#FFFFFF',
      'gri': '#6B7280', 'gray': '#6B7280', 'grey': '#6B7280',
      'kahverengi': '#92400E', 'brown': '#92400E',
      'bej': '#D4A574', 'beige': '#D4A574',
      'haki': '#8B8970', 'khaki': '#8B8970',
      'bordo': '#800020', 'burgundy': '#800020',
      'vizon': '#B5A699', 'mink': '#B5A699',
      'ekru': '#F5F5DC', 'ecru': '#F5F5DC', 'cream': '#F5F5DC',
      'füme': '#A9A9A9', 'fume': '#A9A9A9', 'smoke': '#A9A9A9',
      'mint': '#98FF98',
      'turkuaz': '#40E0D0', 'turquoise': '#40E0D0', 'cyan': '#00FFFF',
      'pudra': '#FFE4E1', 'powder': '#FFE4E1',
      'indigo': '#4B0082',
      'altın': '#FFD700', 'gold': '#FFD700',
      'gümüş': '#C0C0C0', 'silver': '#C0C0C0',
      'bakır': '#B87333', 'copper': '#B87333',
      'bronz': '#CD7F32', 'bronze': '#CD7F32',
    };

    const lowerColor = colorName.toLowerCase();
    return colorMap[lowerColor] || '#9CA3AF';
  };

  // Get unique colors
  const colors = [...new Set(product.variants?.map(v => v.color).filter(Boolean))];

  // Get variants for selected color
  const sizesForColor = selectedColor
    ? product.variants?.filter(v => v.color === selectedColor) || []
    : [];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <h2 className="text-lg font-semibold">Varyant Seçimi</h2>
      </div>

      {/* Content Area - Tam yükseklik */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Renk Seçimi - Sadece selectedColor null iken göster */}
        {!selectedColor && (
          <div>
            <h3 className="text-base font-semibold text-gray-800 mb-4">
              Renk Seçin
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {colors.map((color, index) => {
                const variantsInStock = product.variants?.filter(v => v.color === color && v.stock > 0).length || 0;
                const totalVariants = product.variants?.filter(v => v.color === color).length || 0;

                return (
                  <button
                    key={index}
                    onClick={() => setSelectedColor(color!)}
                    className="p-4 border-2 border-gray-200 hover:border-blue-500 hover:shadow-lg rounded-lg transition-all duration-200 bg-white hover:bg-blue-50"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-8 h-8 rounded-full border-2 border-gray-300 shadow-sm"
                        style={{ backgroundColor: getColorHex(color, undefined) }}
                      />
                      <span className="text-gray-900 text-base font-medium">{color}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {variantsInStock} / {totalVariants} stokta
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 p-3 bg-blue-50 border-l-4 border-blue-500 rounded">
              <p className="text-sm text-gray-700">
                💡 Renk seçin, ardından beden seçenekleri görünecek
              </p>
            </div>
          </div>
        )}

        {/* Beden Seçimi - Sadece selectedColor varken göster */}
        {selectedColor && (
          <div>
            {/* Geri Dön Butonu */}
            <button
              onClick={() => setSelectedColor(null)}
              className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-base font-medium">Geri Dön</span>
            </button>

            <h3 className="text-base font-semibold text-gray-800 mb-4">
              Beden Seçin ({selectedColor})
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {sizesForColor.map((variant, index) => {
                const isSelected = currentVariant?.id === variant.id;
                const isAvailable = variant.stock > 0;

                return (
                  <button
                    key={index}
                    onClick={() => {
                      if (isAvailable) {
                        onSelect(variant);
                      }
                    }}
                    disabled={!isAvailable}
                    className={`p-4 border-2 rounded-lg transition-all duration-200 ${isSelected
                      ? 'border-green-500 bg-green-50 shadow-lg'
                      : isAvailable
                        ? 'border-gray-200 hover:border-blue-500 hover:bg-blue-50 hover:shadow-lg'
                        : 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-lg font-bold ${isAvailable ? 'text-gray-900' : 'text-gray-400'
                        }`}>
                        {variant.size}
                      </span>
                      {isSelected && (
                        <span className="bg-green-600 text-white text-xs px-2 py-1 rounded uppercase font-medium">
                          Seçili
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={`font-bold ${isAvailable ? 'text-blue-600' : 'text-gray-400'
                        }`}>
                        {(variant.price || 0).toFixed(2)}
                      </span>
                      <span className={`font-medium ${isAvailable ? 'text-green-600' : 'text-red-500'
                        }`}>
                        {isAvailable ? `Stok: ${variant.stock}` : 'Stok Yok'}
                      </span>
                    </div>
                    {variant.barcode && (
                      <div className="text-xs text-gray-400 mt-2 font-mono">
                        {variant.barcode}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>


    </div>
  );
}
