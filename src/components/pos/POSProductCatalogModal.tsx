import React, { useState, useMemo } from 'react';
import { X, Search, Grid3x3, List, Package, Check } from 'lucide-react';
import type { Product } from '../../core/types';
import { POSProductDetailModal } from './POSProductDetailModal';
import { POSProductQuantityModal } from './POSProductQuantityModal';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { FullscreenBodyPortal, MODAL_OVERLAY_Z } from '../shared/FullscreenBodyPortal';
import { useLongPressHandlers } from '../../hooks/useLongPress';

interface POSProductCatalogModalProps {
  products: Product[];
  slotNumber?: number;
  mode?: 'add-to-cart' | 'assign-to-slot' | 'invoice-multi-select';
  initialSearchQuery?: string;
  onSelect?: (product: Product) => void;
  onClose: () => void;
  onAddToCart?: (product: Product, variant?: any, quantity?: number) => void;
  onAddMultiple?: (products: Product[]) => void;
}

function CatalogProductPressable({
  as = 'button',
  className,
  children,
  onShortPress,
  onLongPress,
  disabled,
}: {
  as?: 'button' | 'div';
  className?: string;
  children: React.ReactNode;
  onShortPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {
  const handlers = useLongPressHandlers(
    () => {
      if (!disabled) onShortPress();
    },
    () => {
      if (!disabled && onLongPress) onLongPress();
    }
  );

  if (as === 'div') {
    return (
      <div className={className} {...handlers} role="button" tabIndex={0}>
        {children}
      </div>
    );
  }

  return (
    <button type="button" className={className} disabled={disabled} {...handlers}>
      {children}
    </button>
  );
}

export function POSProductCatalogModal({
  products,
  slotNumber,
  mode = 'add-to-cart',
  initialSearchQuery = '',
  onSelect,
  onClose,
  onAddToCart,
  onAddMultiple
}: POSProductCatalogModalProps) {
  const { t, tm } = useLanguage();
  const { darkMode } = useTheme();
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const moduleSearchPlaceholder = tm('itemSearchPlaceholder');
  const searchPlaceholder = moduleSearchPlaceholder === 'itemSearchPlaceholder' ? t.searchProductBarcodeCategory : moduleSearchPlaceholder;
  const moduleCodeLabel = tm('code');
  const productCodeLabel = moduleCodeLabel === 'code' ? 'Kod' : moduleCodeLabel;
  const ALL_CAT = t.allBtn || 'Tümü';
  const [selectedCategory, setSelectedCategory] = useState(ALL_CAT);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  const [quantityModalProduct, setQuantityModalProduct] = useState<Product | null>(null);
  const [pendingAddQuantity, setPendingAddQuantity] = useState<number | null>(null);

  const isInvoiceMultiSelect = mode === 'invoice-multi-select';
  const multiSelectHint = tm('invoiceCatalogMultiSelectHint');
  const multiSelectHintText = multiSelectHint === 'invoiceCatalogMultiSelectHint'
    ? 'Çoklu seçim · Ctrl+Click ile işaretleyin'
    : multiSelectHint;
  const selectAllLabel = tm('catalogSelectAll');
  const selectAllText = selectAllLabel === 'catalogSelectAll' ? 'Tümünü Seç' : selectAllLabel;
  const clearSelectionLabel = tm('catalogClearSelection');
  const clearSelectionText = clearSelectionLabel === 'catalogClearSelection' ? 'Seçimi Kaldır' : clearSelectionLabel;
  const addSelectedLabel = tm('catalogAddSelected');
  const addSelectedFallback = 'Seçilenleri Ekle ({count})';
  const productsSelectedLabel = tm('catalogProductsSelected');
  const productsSelectedFallback = '{count} ürün seçildi';

  const toggleMultiSelect = (productId: string) => {
    setMultiSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleProductPrimaryClick = (e: React.MouseEvent, product: Product) => {
    if (isInvoiceMultiSelect) {
      if (e.ctrlKey || e.metaKey) {
        toggleMultiSelect(product.id);
      }
      return;
    }
    if (mode === 'assign-to-slot' && onSelect) {
      onSelect(product);
    } else if (mode === 'add-to-cart') {
      if (product.variants && product.variants.length > 0) {
        setSelectedProduct(product);
        setSelectedVariant(null);
        setPendingAddQuantity(null);
      } else if (onAddToCart) {
        onAddToCart(product);
      }
    }
  };

  const handleProductLongPress = (product: Product) => {
    if (isInvoiceMultiSelect || mode !== 'add-to-cart') return;
    setQuantityModalProduct(product);
  };

  const handleQuantityModalConfirm = (product: Product, qty: number) => {
    if (product.variants && product.variants.length > 0) {
      setPendingAddQuantity(qty);
      setSelectedProduct(product);
      setSelectedVariant(null);
    } else if (onAddToCart) {
      onAddToCart(product, undefined, qty);
      onClose();
    }
    setQuantityModalProduct(null);
  };

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
          (product.code || '').toLowerCase().includes(query) ||
          (product.barcode || '').toLowerCase().includes(query) ||
          (product.category?.toString() || '').toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  const allFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => multiSelectedIds.has(p.id));

  const handleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setMultiSelectedIds((prev) => {
        const next = new Set(prev);
        filteredProducts.forEach((p) => next.delete(p.id));
        return next;
      });
      return;
    }
    setMultiSelectedIds((prev) => {
      const next = new Set(prev);
      filteredProducts.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const handleAddMultiple = () => {
    if (!onAddMultiple || multiSelectedIds.size === 0) return;
    const ordered = products.filter((p) => multiSelectedIds.has(p.id));
    onAddMultiple(ordered);
    setMultiSelectedIds(new Set());
  };

  return (
    <FullscreenBodyPortal
      zIndex={MODAL_OVERLAY_Z}
      className="overflow-y-auto overflow-x-hidden bg-black/60 backdrop-blur-md flex items-stretch justify-center"
      role="dialog"
      aria-modal
    >
      <div className="bg-white w-full h-full min-h-[100dvh] flex flex-col shadow-2xl relative isolate">
        {/* Header */}
        <div className="relative z-30 bg-[var(--asin-primary,#0E2433)] text-white px-4 py-3 flex items-center justify-between flex-shrink-0 shadow-md">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--asin-accent,#1FA8A0)] flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg">
                {isInvoiceMultiSelect
                  ? (tm('productSelection') === 'productSelection' ? 'Ürün Seçimi' : tm('productSelection'))
                  : mode === 'assign-to-slot'
                    ? `${t.quickProductSlot} #${(slotNumber || 0) + 1} - ${t.productSelection}`
                    : t.productQuery}
              </h2>
              <p className="text-sm text-[var(--asin-accent-muted,#D5F0EE)]">
                {filteredProducts.length} {t.productCount} · {selectedCategory}
                {isInvoiceMultiSelect && ` · ${multiSelectHintText}`}
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
        <div className="flex-1 flex overflow-hidden min-h-0 relative z-0">
          {/* Left Sidebar - Categories */}
          <div className="w-56 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 relative z-10">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm text-gray-600">{t.categories}</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {categoriesWithCounts.map((category) => (
                <button
                  key={category.name}
                  onClick={() => setSelectedCategory(category.name)}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors ${selectedCategory === category.name
                    ? 'bg-[var(--asin-accent-muted,#D5F0EE)] text-[var(--asin-primary,#0E2433)] border-l-2 border-[var(--asin-accent,#1FA8A0)]'
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
          <div className="flex-1 flex flex-col bg-gray-50 min-w-0 relative z-0">
            {/* Search Bar */}
            <div className="sticky top-0 z-20 bg-white px-4 py-3 border-b border-gray-200 flex-shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 focus:outline-none focus:border-[var(--asin-accent,#1FA8A0)] transition-colors text-xs"
                    autoFocus
                  />
                </div>
                {isInvoiceMultiSelect && (
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="px-3 py-2 text-xs font-semibold text-[var(--asin-primary,#0E2433)] border border-[var(--asin-accent,#1FA8A0)]/40 bg-[var(--asin-accent-muted,#D5F0EE)] hover:bg-[var(--asin-accent-muted,#D5F0EE)] transition-colors whitespace-nowrap"
                  >
                    {allFilteredSelected ? clearSelectionText : selectAllText}
                  </button>
                )}
                <div className="flex items-center gap-1 bg-white border border-gray-300">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-3 py-2.5 text-sm transition-colors ${viewMode === 'grid'
                      ? 'bg-[var(--asin-accent,#1FA8A0)] text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <Grid3x3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`px-3 py-2.5 text-sm transition-colors ${viewMode === 'list'
                      ? 'bg-[var(--asin-accent,#1FA8A0)] text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Products */}
            <div className="flex-1 overflow-y-auto p-6 relative z-0">
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                  {filteredProducts.map((product) => {
                    const isMultiSelected = multiSelectedIds.has(product.id);
                    return (
                    <CatalogProductPressable
                      key={product.id}
                      className={`bg-white border transition-all flex flex-col p-3 group relative ${
                        isInvoiceMultiSelect && isMultiSelected
                          ? 'border-[var(--asin-accent,#1FA8A0)] ring-2 ring-[var(--asin-accent-muted,#D5F0EE)] shadow-md'
                          : 'border-gray-200 hover:border-[var(--asin-accent,#1FA8A0)] hover:shadow-lg'
                      }`}
                      onShortPress={() => handleProductPrimaryClick({ ctrlKey: false, metaKey: false } as React.MouseEvent, product)}
                      onLongPress={() => handleProductLongPress(product)}
                      disabled={isInvoiceMultiSelect}
                    >
                      {isInvoiceMultiSelect && (
                        <div
                          role="checkbox"
                          aria-checked={isMultiSelected}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMultiSelect(product.id);
                          }}
                          className={`absolute top-2 right-2 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer ${
                            isMultiSelected ? 'bg-[var(--asin-accent,#1FA8A0)] border-[var(--asin-accent,#1FA8A0)]' : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isMultiSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      )}
                      <div className="w-full aspect-square bg-gray-100 flex items-center justify-center mb-3">
                        <Package className="w-12 h-12 text-gray-400 group-hover:text-[var(--asin-accent,#1FA8A0)] transition-colors" />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                          {product.name}
                        </h3>
                        <div className="text-[11px] text-gray-500 mb-2 space-y-0.5">
                          <p className="font-mono truncate">{productCodeLabel}: {product.code || '-'}</p>
                          <p className="font-mono truncate">{t.barcode}: {product.barcode || '-'}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-600">{(product.stock || 0) > 0 ? t.stock : t.outOfStock}</span>
                          <span className={`text-xs px-2 py-0.5 ${(product.stock || 0) > 50
                            ? 'bg-green-100 text-green-700'
                            : (product.stock || 0) > 0
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                            }`}>
                            {product.stock || 0} {tm('pieceUnitShort')}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-[var(--asin-primary,#0E2433)] mt-1">
                          {(product.price || 0).toFixed(2)}
                        </p>
                        {product.variants && product.variants.length > 0 && (
                          <div className="mt-1 text-xs text-[var(--asin-primary,#0E2433)] font-medium">
                            {product.variants.length} Varyant
                          </div>
                        )}
                      </div>
                    </CatalogProductPressable>
                  );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredProducts.map((product) => {
                    const isMultiSelected = multiSelectedIds.has(product.id);
                    return (
                    <CatalogProductPressable
                      key={product.id}
                      as="div"
                      className={`w-full bg-white border transition-all p-4 flex items-center gap-4 cursor-pointer relative overflow-hidden ${
                        isInvoiceMultiSelect && isMultiSelected
                          ? 'border-[var(--asin-accent,#1FA8A0)] ring-2 ring-[var(--asin-accent-muted,#D5F0EE)] shadow-md'
                          : 'border-gray-200 hover:border-[var(--asin-accent,#1FA8A0)] hover:shadow-lg'
                      }`}
                      onShortPress={() => handleProductPrimaryClick({ ctrlKey: false, metaKey: false } as React.MouseEvent, product)}
                      onLongPress={() => handleProductLongPress(product)}
                      disabled={isInvoiceMultiSelect}
                    >
                      {isInvoiceMultiSelect && (
                        <div
                          role="checkbox"
                          aria-checked={isMultiSelected}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMultiSelect(product.id);
                          }}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 cursor-pointer ${
                            isMultiSelected ? 'bg-[var(--asin-accent,#1FA8A0)] border-[var(--asin-accent,#1FA8A0)]' : 'border-gray-300 bg-white'
                          }`}
                        >
                          {isMultiSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                      )}
                      {product.variants && product.variants.length > 0 && product.variants[0].color && (
                        <div
                          className="absolute top-0 left-0 bottom-0 w-1.5"
                          style={{ backgroundColor: product.variants[0].color || '#9CA3AF' }}
                        />
                      )}

                      {(product.image_url_cdn || product.image_url) ? (
                        <div className="w-16 h-16 bg-gray-50 rounded overflow-hidden flex items-center justify-center flex-shrink-0">
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
                        <div className="w-16 h-16 bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <Package className="w-8 h-8 text-gray-400" />
                        </div>
                      )}

                      <div className="flex-1 text-left">
                        <h3 className="text-sm font-medium text-gray-900 mb-1">{product.name}</h3>
                        <div className="text-xs text-gray-500 space-y-0.5">
                          <p className="font-mono">{productCodeLabel}: {product.code || '-'}</p>
                          <p className="font-mono">{t.barcode}: {product.barcode || '-'}</p>
                        </div>
                        {product.variants && product.variants.length > 0 && (
                          <div className="mt-1 text-xs text-[var(--asin-primary,#0E2433)] font-medium">
                            {product.variants.length} {t.variantAvailable}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-base font-medium text-[var(--asin-primary,#0E2433)]">{(product.price || 0).toFixed(2)}</p>
                        <span className={`text-xs px-2 py-0.5 inline-block mt-1 ${(product.stock || 0) > 50
                          ? 'bg-green-100 text-green-700'
                          : (product.stock || 0) > 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                          }`}>
                          {t.stock}: {product.stock || 0} {tm('pieceUnitShort')}
                        </span>
                      </div>

                      {mode === 'add-to-cart' && !isInvoiceMultiSelect && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(product);
                            setShowDetailModal(true);
                          }}
                          className="px-4 py-2 border border-[var(--asin-accent,#1FA8A0)] text-[var(--asin-accent,#1FA8A0)] hover:bg-[var(--asin-accent-muted,#D5F0EE)] text-xs transition-colors flex-shrink-0"
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
                          className="px-4 py-2 bg-[var(--asin-accent,#1FA8A0)] hover:bg-[#178f88] text-white text-xs transition-colors flex-shrink-0"
                        >
                          {t.assignToSlot}
                        </button>
                      )}
                    </CatalogProductPressable>
                  );
                  })}
                </div>
              )}
            </div>

            {/* Variant Selector - Bottom Panel */}
            {selectedProduct && selectedProduct.variants && selectedProduct.variants.length > 0 && mode === 'add-to-cart' && !isInvoiceMultiSelect && (
              <div className="relative z-20 bg-white border-t-2 border-[var(--asin-accent,#1FA8A0)] p-4 flex-shrink-0 shadow-[0_-8px_24px_rgba(15,23,42,0.08)]">
                <div className="flex items-start gap-4">
                  {/* Product Info */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="w-12 h-12 bg-[var(--asin-accent,#1FA8A0)] flex items-center justify-center">
                      <Package className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">{selectedProduct.name}</h3>
                      <p className="text-xs text-gray-500 font-mono">{productCodeLabel}: {selectedProduct.code || '-'}</p>
                      <p className="text-xs text-gray-500 font-mono">{t.barcode}: {selectedProduct.barcode || '-'}</p>
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
                                ? 'border-[var(--asin-accent,#1FA8A0)] bg-[var(--asin-accent-muted,#D5F0EE)]'
                                : isAvailable
                                  ? 'border-gray-200 bg-white hover:border-[var(--asin-accent,#1FA8A0)]'
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
                            <div className="text-xs font-bold text-[var(--asin-accent,#1FA8A0)] mt-1">
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
                        setPendingAddQuantity(null);
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm transition-colors"
                    >
                      {t.cancel}
                    </button>
                    <button
                      onClick={() => {
                        if (selectedVariant && onAddToCart && selectedProduct) {
                          onAddToCart(selectedProduct, selectedVariant, pendingAddQuantity ?? undefined);
                          setSelectedProduct(null);
                          setSelectedVariant(null);
                          setPendingAddQuantity(null);
                        }
                      }}
                      disabled={!selectedVariant}
                      className="px-6 py-2 bg-[var(--asin-accent,#1FA8A0)] hover:bg-[#178f88] text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t.addToCart}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {isInvoiceMultiSelect && (
          <div className="relative z-20 px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-shrink-0 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
            <span className="text-sm text-gray-600">
              {(productsSelectedLabel === 'catalogProductsSelected' ? productsSelectedFallback : productsSelectedLabel)
                .replace('{count}', String(multiSelectedIds.size))}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 text-sm transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleAddMultiple}
                disabled={multiSelectedIds.size === 0}
                className="px-6 py-2 bg-[var(--asin-accent,#1FA8A0)] hover:bg-[#178f88] text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {(addSelectedLabel === 'catalogAddSelected' ? addSelectedFallback : addSelectedLabel)
                  .replace('{count}', String(multiSelectedIds.size))}
              </button>
            </div>
          </div>
        )}
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

      {quantityModalProduct && (
        <POSProductQuantityModal
          product={quantityModalProduct}
          darkMode={darkMode}
          onClose={() => setQuantityModalProduct(null)}
          onConfirm={handleQuantityModalConfirm}
        />
      )}
    </FullscreenBodyPortal>
  );
}
