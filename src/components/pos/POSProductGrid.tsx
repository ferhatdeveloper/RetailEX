import { Search, Calculator, Package, Check } from 'lucide-react';
import { useState, memo, useRef, useEffect } from 'react';
import type { Product } from '../../App';
import { useLanguage } from '../../contexts/LanguageContext';
import { VirtualProductGrid } from './VirtualProductGrid';

// Color helper function
const getColorHex = (colorName?: string): string => {
  if (!colorName) return '#9CA3AF';

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

interface POSProductGridProps {
  products: Product[];
  selectedCategory: string;
  barcodeInput: string;
  viewMode: 'grid' | 'list';
  onProductClick: (product: Product) => void;
  onBarcodeInputChange: (value: string) => void;
  onBarcodeEnter: (e: React.KeyboardEvent) => void;
  onBarcodeSearch: () => void;
  onToggleNumpad: () => void;
  onStockQueryClick: () => void;
  gridColumns?: number;
}

export function POSProductGrid({
  products,
  selectedCategory,
  barcodeInput,
  viewMode,
  onProductClick,
  onBarcodeInputChange,
  onBarcodeEnter,
  onBarcodeSearch,
  onToggleNumpad,
  onStockQueryClick,
  gridColumns = 4
}: POSProductGridProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const filteredProducts = products.filter(p => {
    const categoryMatch = selectedCategory === 'Tümü' || p.category === selectedCategory;
    const searchMatch = searchTerm === '' ||
      (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.barcode || '').toLowerCase().includes(searchTerm.toLowerCase());
    return categoryMatch && searchMatch;
  });

  const handleSearch = () => {
    setSearchTerm(barcodeInput);
  };

  const { t } = useLanguage();

  // Measure container size for virtual scrolling
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Use virtual scrolling when product count > 100 for better performance
  const useVirtualScrolling = filteredProducts.length > 100;

  return (
    <div className="flex-1 flex flex-col bg-white border-r border-gray-200 min-w-0">
      {/* Search Bar */}
      <div className="p-3 border-b border-gray-200 bg-white">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Barkod okut veya ürün ara... (Enter ile hızlı satış)"
              value={barcodeInput}
              onChange={(e) => onBarcodeInputChange(e.target.value)}
              onKeyDown={onBarcodeEnter}
              className="w-full pl-4 pr-24 py-3 border border-gray-300 focus:outline-none focus:border-blue-600 bg-white"
              autoFocus
            />
            <button
              onClick={() => {
                handleSearch();
                onBarcodeSearch();
              }}
              className="absolute right-1 top-1 bottom-1 px-4 bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2"
              title={t.search}
            >
              <Search className="w-4 h-4" />
              <span className="text-sm">{t.search}</span>
            </button>
          </div>

          <button
            onClick={onToggleNumpad}
            className="px-3 py-3 bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Numerik Klavye"
          >
            <Calculator className="w-4 h-4" />
            <span className="text-sm">Numerik</span>
          </button>

          <button
            onClick={onStockQueryClick}
            className="px-3 py-3 bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 transition-colors flex items-center gap-1.5 whitespace-nowrap"
            title="Ürün Sorgula"
          >
            <Search className="w-4 h-4" />
            <span className="text-sm">Sorgula</span>
          </button>
        </div>
      </div>

      {/* Products Grid/List */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-2">
        {viewMode === 'grid' ? (
          useVirtualScrolling ? (
            <VirtualProductGrid
              products={filteredProducts}
              onProductClick={onProductClick}
              containerWidth={containerSize.width - 16}
              containerHeight={containerSize.height}
              gridColumns={gridColumns || 4}
            />
          ) : (
            <div
              className="grid gap-2 min-h-full"
              style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}
            >
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => onProductClick(product)}
                  className="bg-white border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all p-3 text-left group relative overflow-hidden"
                >
                  {/* Color Bar - Top of card */}
                  {(() => {
                    // Debug: Check variant data
                    if (product.variants && product.variants.length > 0) {
                      console.log('Product:', product.name, 'Variants:', product.variants);
                      console.log('First variant color:', product.variants[0].color);
                    }

                    return product.variants && product.variants.length > 0 && product.variants[0].color ? (
                      <div
                        className="absolute top-0 left-0 right-0 h-1.5"
                        style={{ backgroundColor: getColorHex(product.variants[0].color) }}
                      />
                    ) : null;
                  })()}

                  {/* Variant Count Badge - Left Side */}
                  {product.variants && product.variants.length > 0 && (
                    <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-bold shadow-md z-10">
                      {product.variants.length} varyant
                    </div>
                  )}

                  {/* Product Image */}
                  {(product.image_url_cdn || product.image_url) && (
                    <div className="mb-2 flex items-center justify-center bg-gray-50 rounded overflow-hidden" style={{ height: '80px' }}>
                      <img
                        src={product.image_url_cdn || product.image_url}
                        alt={product.name}
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500 mb-1 truncate">
                        {product.category}
                      </div>
                      <div className="text-sm text-gray-900 mb-1 line-clamp-2">
                        {product.name}
                      </div>
                    </div>
                    {product.variants && product.variants.length > 0 && (
                      <div className="ml-2 flex-shrink-0">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                          <Package className="w-3 h-3 text-blue-600" />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-base text-blue-600">
                      {product.price.toFixed(2)}
                    </div>
                    <div className={`text-xs px-2 py-0.5 rounded ${product.stock > 10 ? 'bg-green-100 text-green-700' :
                      product.stock > 0 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                      {product.stock} adet
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-1">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => onProductClick(product)}
                className="w-full bg-white border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all p-3 text-left flex items-center gap-3 relative overflow-hidden"
              >
                {/* Color Bar - Left side */}
                {product.variants && product.variants.length > 0 && product.variants[0].color && (
                  <div
                    className="absolute top-0 left-0 bottom-0 w-1.5"
                    style={{ backgroundColor: getColorHex(product.variants[0].color) }}
                  />
                )}

                {/* Product Image Thumbnail */}
                {(product.image_url_cdn || product.image_url) ? (
                  <div className="flex-shrink-0 w-16 h-16 bg-gray-50 rounded overflow-hidden flex items-center justify-center">
                    <img
                      src={product.image_url_cdn || product.image_url}
                      alt={product.name}
                      className="max-h-full max-w-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex-shrink-0 w-16 h-16 bg-gray-100 rounded flex items-center justify-center">
                    <Package className="w-8 h-8 text-gray-300" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500">{product.category}</span>
                    {product.variants && product.variants.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-xs">
                        <Package className="w-3 h-3" />
                        Varyantlı
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-900">
                    {product.name}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-base text-blue-600 mb-1">
                    {product.price.toFixed(2)}
                  </div>
                  <div className={`text-xs px-2 py-0.5 rounded inline-block ${product.stock > 10 ? 'bg-green-100 text-green-700' :
                    product.stock > 0 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                    {product.stock} adet
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {filteredProducts.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>Ürün bulunamadı</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Export memoized version for performance
export default memo(POSProductGrid);
