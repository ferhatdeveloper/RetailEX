import { X, Search, Package, Barcode, Tag, Boxes, TrendingUp, DollarSign, Building2, Shirt, Grid3x3, List } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Product, BranchStock } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSStockQueryModalProps {
  products: Product[];
  onClose: () => void;
  onAddToCart?: (product: Product) => void;
}

export function POSStockQueryModal({ products, onClose, onAddToCart }: POSStockQueryModalProps) {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(t.allCategories);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.category) {
        if (Array.isArray(p.category)) {
          p.category.forEach(c => cats.add(c));
        } else {
          cats.add(p.category);
        }
      }
    });
    return [t.allCategories, ...Array.from(cats).sort()];
  }, [products, language]);

  const filteredProducts = useMemo(() => {
    let filtered = products;

    // Category filter
    if (selectedCategory !== t.allCategories) {
      filtered = filtered.filter(p => {
        if (Array.isArray(p.category)) {
          return p.category.includes(selectedCategory);
        }
        return p.category === selectedCategory;
      });
    }

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(p =>
        (p.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.barcode || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (typeof p.category === 'string' && p.category.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    return filtered;
  }, [products, selectedCategory, searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (selectedProduct) {
        setSelectedProduct(null);
      } else {
        onClose();
      }
    }
  };

  const getStockStatus = (stock: number) => {
    if (stock === 0) return { label: 'Stok Yok', color: 'red', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
    if (stock < 10) return { label: 'Kritik Seviye', color: 'orange', bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' };
    if (stock < 30) return { label: 'Düşük Stok', color: 'yellow', bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200' };
    return { label: 'Yeterli Stok', color: 'green', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-blue-50/30 via-white to-blue-50/20 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between border-b-2 border-blue-800 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-white/20 rounded flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl flex items-center gap-2">
              {t.productCatalog}
            </h3>
            <p className="text-sm text-blue-100 mt-0.5">
              {filteredProducts.length} {t.productCount} • {selectedCategory}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Categories */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              {t.categories}
            </h4>
          </div>
          <div className="flex-1 overflow-y-auto">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`w-full px-4 py-3 text-left text-sm border-b border-gray-100 hover:bg-blue-50 transition-colors ${selectedCategory === cat
                  ? 'bg-blue-50 text-blue-700 border-l-4 border-l-blue-600'
                  : 'text-gray-700'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span>{cat}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {cat === t.allCategories
                      ? products.length
                      : products.filter(p => {
                        const productCategories = Array.isArray(p.category) ? p.category : [p.category];
                        return productCategories.includes(cat);
                      }).length
                    }
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder={t.searchProductBarcodeCategory}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                autoFocus
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>

            <div className="flex items-center gap-2 border border-gray-300 rounded overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-4 py-2.5 flex items-center gap-2 text-sm transition-colors ${viewMode === 'grid'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                <Grid3x3 className="w-4 h-4" />
                {t.grid}
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2.5 flex items-center gap-2 text-sm transition-colors border-l border-gray-300 ${viewMode === 'list'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                <List className="w-4 h-4" />
                {t.list}
              </button>
            </div>
          </div>

          {/* Products Display */}
          <div className="flex-1 overflow-y-auto p-4">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Package className="w-24 h-24 text-gray-300 mb-4" />
                <p className="text-xl text-gray-500 mb-2">{t.noProductsFound}</p>
                <p className="text-sm text-gray-400">{t.changeSearchCriteria}</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredProducts.map((product) => {
                  const status = getStockStatus(product.stock);
                  return (
                    <button
                      key={product.id}
                      onClick={() => setSelectedProduct(product)}
                      className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg hover:border-blue-400 transition-all duration-200 group"
                    >
                      {/* Product Image Placeholder */}
                      <div className="aspect-square bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center border-b border-gray-200 group-hover:from-blue-100 group-hover:to-gray-200 transition-colors">
                        <Package className="w-16 h-16 text-gray-400" />
                      </div>

                      {/* Product Info */}
                      <div className="p-3">
                        <h5 className="text-sm font-medium text-gray-900 line-clamp-2 mb-2 min-h-[40px]">
                          {product.name}
                        </h5>

                        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                          <Barcode className="w-3.5 h-3.5" />
                          <span className="truncate">{product.barcode}</span>
                        </div>

                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-500">{t.stock}</span>
                          <span className={`text-sm font-bold px-2 py-0.5 rounded ${status.bg} ${status.text}`}>
                            {product.stock}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-gray-100">
                          <span className="text-lg font-bold text-blue-600">
                            {product.price.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">{t.product}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">{t.barcode}</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">{t.categories}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">{t.stock}</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">{t.price}</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">{t.operation}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredProducts.map((product) => {
                      const status = getStockStatus(product.stock);
                      return (
                        <tr key={product.id} className="hover:bg-blue-50/50 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-900">{product.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 font-mono">{product.barcode}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{product.category}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-bold px-3 py-1 rounded ${status.bg} ${status.text}`}>
                              {product.stock}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-blue-600">
                            {product.price.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => setSelectedProduct(product)}
                              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                            >
                              {t.detail}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Product Detail (Modal Overlay) */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-8">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-lg shadow-2xl flex flex-col">
            <div className="p-4 border-b border-gray-300 bg-gradient-to-r from-blue-600 to-blue-700">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-xl font-medium text-white">
                    {selectedProduct.name}
                  </h4>
                  <p className="text-sm text-blue-100 mt-1">
                    {selectedProduct.category}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-2 hover:bg-white/10 rounded transition-colors"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Barcode */}
              <div className="bg-white p-4 border border-gray-300">
                <div className="flex items-center gap-2 mb-2">
                  <Barcode className="w-4 h-4 text-gray-600" />
                  <p className="text-sm text-gray-600">{t.barcode}</p>
                </div>
                <p className="text-xl font-mono text-gray-900">
                  {selectedProduct.barcode}
                </p>
              </div>

              {/* Stock Status */}
              <div className="bg-white p-4 border border-gray-300">
                <div className="flex items-center gap-2 mb-3">
                  <Boxes className="w-4 h-4 text-gray-600" />
                  <p className="text-sm text-gray-600">{t.stockStatus}</p>
                </div>

                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{t.currentStock}</p>
                    <p className="text-4xl font-bold text-blue-700">
                      {selectedProduct.stock}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600 mb-1">{t.unit}</p>
                    <p className="text-lg text-gray-900">
                      {selectedProduct.unit}
                    </p>
                  </div>
                </div>

                {(() => {
                  const status = getStockStatus(selectedProduct.stock);
                  return (
                    <div className={`px-3 py-2 ${status.bg} border ${status.border} text-center`}>
                      <p className={`text-sm font-medium ${status.text}`}>
                        {status.label}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Pricing */}
              <div className="bg-white p-4 border border-gray-300">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-gray-600" />
                  <p className="text-sm text-gray-600">{t.pricingInfo}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{t.salePrice}</p>
                    <p className="text-2xl font-bold text-green-600">
                      {selectedProduct.price.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{t.cost}</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {selectedProduct.cost.toFixed(2)}
                    </p>
                  </div>
                </div>

                {selectedProduct.price > selectedProduct.cost && (
                  <div className="mt-3 pt-3 border-t border-gray-300">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{t.profitMargin}:</span>
                      <span className="text-lg font-bold text-blue-600">
                        %{(((selectedProduct.price - selectedProduct.cost) / selectedProduct.cost) * 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Stock Value */}
              <div className="bg-white p-4 border border-gray-300">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-gray-600" />
                  <p className="text-sm text-gray-600">{t.stockValue}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{t.costValue}</p>
                    <p className="text-xl font-bold text-orange-600">
                      {(selectedProduct.stock * selectedProduct.cost).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{t.saleValue}</p>
                    <p className="text-xl font-bold text-green-600">
                      {(selectedProduct.stock * selectedProduct.price).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Branch Variant Stocks */}
              {selectedProduct.hasVariants && selectedProduct.branchVariantStocks && selectedProduct.branchVariantStocks.length > 0 && (
                <div className="bg-white p-4 border border-gray-300">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-4 h-4 text-gray-600" />
                    <p className="text-sm text-gray-600">{t.branchVariantStocks}</p>
                  </div>

                  <div className="space-y-4">
                    {selectedProduct.branchVariantStocks.map((branchData, branchIdx) => (
                      <div key={branchIdx} className="border border-blue-200 bg-blue-50 p-3">
                        {/* Branch Header */}
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-blue-200">
                          <Building2 className="w-4 h-4 text-blue-600" />
                          <span className="font-medium text-blue-900">{branchData.branchName}</span>
                          <span className="ml-auto text-sm text-blue-700">
                            Toplam: {branchData.variants.reduce((sum, v) => sum + v.stock, 0)} adet
                          </span>
                        </div>

                        {/* Variants for this branch */}
                        <div className="space-y-1">
                          {branchData.variants.map((variant, varIdx) => (
                            <div key={varIdx} className="flex items-center justify-between p-2 bg-white border border-gray-300">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium text-gray-900">{variant.color}</span>
                                <span className="text-gray-400">/</span>
                                <span className="text-sm font-medium text-gray-900">{variant.size}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-600">Stok:</span>
                                <span className={`text-sm font-bold px-2 py-0.5 ${variant.stock === 0 ? 'text-red-600 bg-red-100' :
                                  variant.stock < 2 ? 'text-orange-600 bg-orange-100' :
                                    'text-green-600 bg-green-100'
                                  }`}>
                                  {variant.stock}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Branch Stocks (for non-variant products) */}
              {!selectedProduct.hasVariants && selectedProduct.branchStocks && selectedProduct.branchStocks.length > 0 && (
                <div className="bg-white p-4 border border-gray-300">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="w-4 h-4 text-gray-600" />
                    <p className="text-sm text-gray-600">{t.branchStocks}</p>
                  </div>

                  <div className="space-y-2">
                    {selectedProduct.branchStocks.map((branch: BranchStock, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium text-gray-900">{branch.branchName}</span>
                        </div>
                        <span className="text-lg font-bold text-blue-700">
                          {branch.stock} {selectedProduct.unit}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-300">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{t.totalAllBranches}:</span>
                      <span className="text-xl font-bold text-blue-700">
                        {selectedProduct.branchStocks.reduce((sum: number, b: BranchStock) => sum + b.stock, 0)} {selectedProduct.unit}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
