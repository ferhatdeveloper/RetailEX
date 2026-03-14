import React, { useState, useMemo } from 'react';
import { X, Search, Grid3x3, List, Package } from 'lucide-react';
import type { Product } from '../../core/types';
import { POSProductDetailModal } from './POSProductDetailModal';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSProductCatalogModalProps {
  products: Product[];
  slotNumber?: number;
  mode?: 'add-to-cart' | 'assign-to-slot';
  initialSearchQuery?: string;
  onSelect?: (product: Product) => void;
  onClose: () => void;
  onAddToCart?: (product: Product, variant?: any) => void;
}

export function POSProductCatalogModal({
  products,
  slotNumber,
  mode = 'add-to-cart',
  initialSearchQuery = '',
  onSelect,
  onClose,
  onAddToCart
}: POSProductCatalogModalProps) {
  const { t } = useLanguage();
  const { darkMode } = useTheme();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const ALL_CAT = t.allBtn || 'Tümü';
  const [selectedCategory, setSelectedCategory] = useState(ALL_CAT);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);

  // Get categories with counts
  const categoriesWithCounts = useMemo(() => {
    const categoryMap = new Map<string, number>();

    products.forEach(product => {
      if (product.category) {
        if (Array.isArray(product.category)) {
          product.category.forEach(cat => {
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
          });
        } else {
          categoryMap.set(product.category, (categoryMap.get(product.category) || 0) + 1);
        }
      }
    });

    const categories = [
      { name: ALL_CAT, count: products.length },
      ...Array.from(categoryMap.entries()).map(([name, count]) => ({ name, count }))
    ];

    return categories;
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Category filter
      if (selectedCategory !== ALL_CAT) {
        const productCategories = Array.isArray(product.category) ? product.category : [product.category];
        if (!productCategories.includes(selectedCategory)) {
          return false;
        }
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          (product.name || '').toLowerCase().includes(query) ||
          (product.barcode || '').toLowerCase().includes(query) ||
          (product.category?.toString() || '').toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white w-full h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg">
                {mode === 'assign-to-slot' ? `${t.quickProductSlot} #${(slotNumber || 0) + 1} - ${t.productSelection}` : t.productQuery}
              </h2>
              <p className="text-sm text-blue-100">
                {filteredProducts.length} {t.productCount} · {selectedCategory}
                {mode === 'assign-to-slot' && ' · Shift + Tıkla veya Çift Tıkla'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar - Categories */}
          <div className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm text-gray-600">{t.categories}</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {categoriesWithCounts.map((category) => (
                <button
                  key={category.name}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors ${selectedCategory === category.name
                    ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600'
                    : 'text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <span>{category.name}</span>
                  <span className="text-xs text-gray-500">{category.count}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Center - Product List */}
          <div className="flex-1 flex flex-col bg-gray-50">
            {/* Search Bar */}
            <div className="bg-white px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchProductBarcodeCategory}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 focus:outline-none focus:border-blue-400 transition-colors text-xs"
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-1 bg-white border border-gray-300">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-2.5 text-sm transition-colors ${viewMode === 'grid'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <Grid3x3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-2.5 text-sm transition-colors ${viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Products */}
            <div className="flex-1 overflow-y-auto p-6">
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => {
                        if (mode === 'assign-to-slot' && onSelect) {
                          onSelect(product);
                        } else if (mode === 'add-to-cart') {
                          if (product.variants && product.variants.length > 0) {
                            setSelectedProduct(product);
                            setSelectedVariant(null);
                          } else if (onAddToCart) {
                            onAddToCart(product);
                          }
                        }
                      }}
                      className="bg-white border border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all flex flex-col p-3 group"
                    >
                      <div className="w-full aspect-square bg-gray-100 flex items-center justify-center mb-3">
                        <Package className="w-12 h-12 text-gray-400 group-hover:text-blue-500 transition-colors" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                          {product.name}
                        </h3>
                        <p className="text-xs text-gray-500 mb-2">
                          {product.barcode}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">{(product.stock || 0) > 0 ? t.stock : t.outOfStock}</span>
                          <span className={`text-xs px-2 py-0.5 ${(product.stock || 0) > 50
                            ? 'bg-green-100 text-green-700'
                            : (product.stock || 0) > 0
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                            }`}>
                            {product.stock || 0}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-blue-700 mt-1">
                          {(product.price || 0).toFixed(2)}
                        </p>
                        {product.variants && product.variants.length > 0 && (
                          <div className="mt-1 text-xs text-purple-600 font-medium">
                            {product.variants.length} Varyant
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      onClick={() => {
                        if (mode === 'assign-to-slot' && onSelect) {
                          onSelect(product);
                        } else if (mode === 'add-to-cart') {
                          if (product.variants && product.variants.length > 0) {
                            setSelectedProduct(product);
                            setSelectedVariant(null);
                          } else if (onAddToCart) {
                            onAddToCart(product);
                          }
                        }
                      }}
                      className="w-full bg-white border border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all p-4 flex items-center gap-4 cursor-pointer relative overflow-hidden"
                    >
                      {/* Color Bar - Left side */}
                      {product.variants && product.variants.length > 0 && product.variants[0].color && (
                        <div
                          className="absolute top-0 left-0 bottom-0 w-1.5"
                          style={{ backgroundColor: product.variants[0].color || '#9CA3AF' }}
                        />
                      )}

                      {/* Product Image */}
                      {product.image_url ? (
                        <div className="w-16 h-16 bg-gray-50 rounded overflow-hidden flex items-center justify-center flex-shrink-0">
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="max-h-full max-w-full object-contain"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-16 h-16 bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Package className="w-8 h-8 text-gray-400" />
                        </div>
                      )}

                      <div className="flex-1 text-left">
                        <h3 className="text-sm font-medium text-gray-900 mb-1">{product.name}</h3>
                        <p className="text-xs text-gray-500">{product.barcode}</p>
                        {product.variants && product.variants.length > 0 && (
                          <div className="mt-1 text-xs text-purple-600 font-medium">
                            {product.variants.length} {t.variantAvailable}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-base font-medium text-blue-700">{(product.price || 0).toFixed(2)}</p>
                        <span className={`text-xs px-2 py-0.5 inline-block mt-1 ${(product.stock || 0) > 50
                          ? 'bg-green-100 text-green-700'
                          : (product.stock || 0) > 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                          }`}>
                          {t.stock}: {product.stock || 0}
                        </span>
                      </div>

                      {mode === 'add-to-cart' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(product);
                            setShowDetailModal(true);
                          }}
                          className="px-4 py-2 border border-blue-600 text-blue-600 hover:bg-blue-50 text-xs transition-colors flex-shrink-0"
                        >
                          {t.detail}
                        </button>
                      )}

                      {mode === 'assign-to-slot' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelect) {
                              onSelect(product);
                            }
                          }}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs transition-colors flex-shrink-0"
                        >
                          {t.assignToSlot}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Variant Selector - Bottom Panel */}
            {selectedProduct && selectedProduct.variants && selectedProduct.variants.length > 0 && mode === 'add-to-cart' && (
              <div className="bg-white border-t-2 border-blue-600 p-4 flex-shrink-0">
                <div className="flex items-start gap-4">
                  {/* Product Info */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-12 h-12 bg-blue-600 flex items-center justify-center">
                      <Package className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{selectedProduct.name}</h3>
                      <p className="text-xs text-gray-500">{selectedProduct.barcode}</p>
                    </div>
                  </div>

                  {/* Variant Grid */}
                  <div className="flex-1">
                    <div className="text-xs text-gray-600 mb-2">{t.selectVariantLabel}</div>
                    <div className="grid grid-cols-6 gap-2">
                      {selectedProduct.variants.map((variant: any) => {
                        const isSelected = selectedVariant?.id === variant.id;
                        const isAvailable = variant.stock > 0;

                        return (
                          <button
                            key={variant.id}
                            onClick={() => {
                              if (isAvailable) {
                                setSelectedVariant(variant);
                              }
                            }}
                            disabled={!isAvailable}
                            className={`
                              p-2 border-2 transition-all text-left text-xs
                              ${isSelected
                                ? 'border-blue-600 bg-blue-50'
                                : isAvailable
                                  ? 'border-gray-200 bg-white hover:border-blue-400'
                                  : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                              }
                            `}
                          >
                            {/* Color */}
                            {variant.color && (
                              <div className="flex items-center gap-1 mb-1">
                                <div
                                  className="w-3 h-3 rounded border border-gray-300"
                                  style={{ backgroundColor: variant.colorHex || '#ccc' }}
                                />
                                <span className="text-xs font-medium truncate">{variant.color}</span>
                              </div>
                            )}

                            {/* Size */}
                            {variant.size && (
                              <div className="text-xs text-gray-600 truncate">
                                {variant.size}
                              </div>
                            )}

                            {/* Price */}
                            <div className="text-xs font-bold text-blue-600 mt-1">
                              {(variant.price || 0).toFixed(2)}
                            </div>

                            {/* Stock */}
                            <div className="text-[10px] text-gray-500">
                              {isAvailable ? `${t.stock}: ${variant.stock || 0}` : t.outOfStock}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        setSelectedProduct(null);
                        setSelectedVariant(null);
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm transition-colors"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={() => {
                        if (selectedVariant && onAddToCart) {
                          onAddToCart(selectedProduct, selectedVariant);
                          setSelectedProduct(null);
                          setSelectedVariant(null);
                        }
                      }}
                      disabled={!selectedVariant}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t.addToCart}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Detail Modal */}
      {showDetailModal && selectedProduct && (
        <POSProductDetailModal
          product={selectedProduct}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedProduct(null);
          }}
        />
      )}
    </div>
  );
}
