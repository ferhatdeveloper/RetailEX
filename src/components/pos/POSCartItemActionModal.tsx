import { useState, useEffect } from 'react';
import { X, Plus, Minus, Percent, Trash2, Package, Calculator } from 'lucide-react';
import type { CartItem, ProductVariant } from './types';
import { POSNumpad } from './POSNumpad';
import { formatNumber as formatNumberUtil } from '../../utils/formatNumber';
import { useTheme } from '../../contexts/ThemeContext';

interface POSCartItemActionModalProps {
  item: CartItem;
  itemIndex: number;
  onClose: () => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onApplyDiscount: (index: number, discountPercent: number) => void;
  onRemoveItem: (index: number) => void;
  onUpdateVariant?: (index: number, variant: ProductVariant) => void;
  formatNumber?: (num: number, decimals?: number, showDecimals?: boolean) => string;
}

export function POSCartItemActionModal({
  item,
  itemIndex,
  onClose,
  onUpdateQuantity,
  onApplyDiscount,
  onRemoveItem,
  onUpdateVariant,
  formatNumber
}: POSCartItemActionModalProps) {
  const { darkMode } = useTheme();
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [discount, setDiscount] = useState(item.discount.toString());
  const [activeTab, setActiveTab] = useState<'quantity' | 'discount' | 'variant' | 'remove'>('quantity');
  const [showNumpad, setShowNumpad] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(item.variant || null);
  const [numpadMode, setNumpadMode] = useState<'replace' | 'concat'>('replace');

  const currentPrice = item.variant?.price || item.product.price;
  const itemTotal = parseFloat(quantity || '0') * currentPrice;
  const discountAmount = (itemTotal * parseFloat(discount || '0')) / 100;
  const newTotal = itemTotal - discountAmount;

  // Get color hex code helper
  const getColorHex = (colorName?: string, colorHex?: string) => {
    if (colorHex) return colorHex;
    if (!colorName) return '#9CA3AF';
    
    const colorMap: Record<string, string> = {
      'kırmızı': '#DC2626', 'kirmizi': '#DC2626', 'red': '#DC2626',
      'mavi': '#2563EB', 'blue': '#2563EB',
      'yeşil': '#16A34A', 'yesil': '#16A34A', 'green': '#16A34A',
      'sarı': '#EAB308', 'sari': '#EAB308', 'yellow': '#EAB308',
      'turuncu': '#F97316', 'orange': '#F97316',
      'mor': '#9333EA', 'purple': '#9333EA',
      'pembe': '#EC4899', 'pink': '#EC4899',
      'siyah': '#000000', 'black': '#000000',
      'beyaz': '#FFFFFF', 'white': '#FFFFFF',
      'gri': '#6B7280', 'gray': '#6B7280', 'grey': '#6B7280',
    };
    
    return colorMap[colorName?.toLowerCase() || ''] || '#9CA3AF';
  };



  const handleApply = () => {
    const qty = parseFloat(quantity || '0');
    const disc = parseFloat(discount || '0');

    if (qty <= 0) {
      alert('Miktar 0\'dan büyük olmalıdır!');
      return;
    }

    if (disc < 0 || disc > 100) {
      alert('İndirim yüzdesi 0-100 arasında olmalıdır!');
      return;
    }

    // Update quantity
    if (qty !== item.quantity) {
      onUpdateQuantity(itemIndex, qty);
    }

    // Update discount (only if changed)
    if (Math.abs(disc - item.discount) > 0.01) {
      onApplyDiscount(itemIndex, disc);
    }

    // Update variant if changed
    if (onUpdateVariant && selectedVariant && selectedVariant.id !== item.variant?.id) {
      onUpdateVariant(itemIndex, selectedVariant);
    }

    onClose();
  };

  const handleRemove = () => {
    if (window.confirm(`${item.product.name} ürününü sepetten çıkarmak istediğinizden emin misiniz?`)) {
      onRemoveItem(itemIndex);
      onClose();
    }
  };

  const quickDiscounts = [0, 5, 10, 15, 20, 25, 30, 50];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl rounded-lg overflow-hidden`}>
        {/* Header */}
        <div className={`p-4 border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700'}`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-white'} flex items-center gap-2`}>
                <Package className="w-5 h-5" />
                Ürün İşlemleri
              </h3>
              <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-blue-100'}`}>
                {item.product.name}
              </p>
              {item.variant && (
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-blue-200'}`}>
                  {item.variant.color}{item.variant.color && item.variant.size && ' · '}{item.variant.size}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded transition-colors ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-white hover:bg-white/20'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <button
            onClick={() => setActiveTab('quantity')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'quantity'
                ? darkMode ? 'bg-gray-700 text-white border-b-2 border-blue-500' : 'bg-white text-blue-600 border-b-2 border-blue-600'
                : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" />
              Miktar
            </div>
          </button>
          <button
            onClick={() => setActiveTab('discount')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'discount'
                ? darkMode ? 'bg-gray-700 text-white border-b-2 border-blue-500' : 'bg-white text-blue-600 border-b-2 border-blue-600'
                : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Percent className="w-4 h-4" />
              İndirim
            </div>
          </button>
          {item.product.variants && item.product.variants.length > 0 && (
            <button
              onClick={() => setActiveTab('variant')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'variant'
                  ? darkMode ? 'bg-gray-700 text-white border-b-2 border-blue-500' : 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Package className="w-4 h-4" />
                Varyant
              </div>
            </button>
          )}
          <button
            onClick={() => setActiveTab('remove')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'remove'
                ? darkMode ? 'bg-gray-700 text-white border-b-2 border-red-500' : 'bg-white text-red-600 border-b-2 border-red-600'
                : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Trash2 className="w-4 h-4" />
              Sil
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className={`grid ${showNumpad ? 'grid-cols-2' : 'grid-cols-1'} gap-6`}>
            {/* Left Side - Form */}
            <div className="space-y-6">
              {/* Product Info Card */}
              <div className={`rounded-lg p-4 border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'}`}>
                <div className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-blue-900'}`}>
                  {item.product.name}
                </div>
                {item.variant && (
                  <div className={`text-sm mt-1 ${darkMode ? 'text-gray-300' : 'text-blue-600'}`}>
                    {item.variant.color}{item.variant.color && item.variant.size && ' · '}{item.variant.size}
                  </div>
                )}
                <div className={`flex justify-between mt-3 text-sm ${darkMode ? 'text-gray-300' : 'text-blue-700'}`}>
                  <span>Birim Fiyat: {formatNumber(currentPrice, 2, false)}</span>
                  <span>Barkod: {item.product.barcode}</span>
                </div>
              </div>

              {/* Quantity Tab */}
              {activeTab === 'quantity' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Miktar:
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const qty = parseFloat(quantity || '0');
                          if (qty > 1) setQuantity((qty - 1).toString());
                        }}
                        className={`px-4 py-3 rounded transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                      <input
                        type="text"
                        value={quantity}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          setQuantity(val);
                        }}
                        onFocus={(e) => {
                          e.target.select();
                          setNumpadMode('replace');
                        }}
                        className={`flex-1 px-4 py-3 border rounded text-center text-2xl font-bold ${
                          darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
                        }`}
                      />
                      <button
                        onClick={() => {
                          const qty = parseFloat(quantity || '0');
                          setQuantity((qty + 1).toString());
                        }}
                        className={`px-4 py-3 rounded transition-colors ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Birim: {item.product.unit || 'Adet'}
                    </p>
                  </div>

                  {/* Quick Quantity Buttons */}
                  <div>
                    <label className={`block text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Hızlı Seçim:
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 5, 10].map(num => (
                        <button
                          key={num}
                          onClick={() => setQuantity(num.toString())}
                          className={`px-3 py-2 rounded text-sm transition-colors ${
                            quantity === num.toString()
                              ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                              : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Discount Tab */}
              {activeTab === 'discount' && (
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      İndirim Yüzdesi:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discount}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          setDiscount(val);
                        }}
                        onFocus={(e) => {
                          e.target.select();
                          setNumpadMode('replace');
                        }}
                        className={`flex-1 px-4 py-3 border rounded text-center text-2xl font-bold ${
                          darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
                        }`}
                      />
                      <div className={`flex items-center justify-center w-12 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <Percent className={`w-6 h-6 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
                      </div>
                    </div>
                  </div>

                  {/* Quick Discount Buttons */}
                  <div>
                    <label className={`block text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Hızlı Seçim:
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {quickDiscounts.map(disc => (
                        <button
                          key={disc}
                          onClick={() => setDiscount(disc.toString())}
                          className={`px-3 py-2 rounded text-sm transition-colors ${
                            discount === disc.toString()
                              ? darkMode ? 'bg-orange-600 text-white' : 'bg-orange-600 text-white'
                              : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          %{disc}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Variant Tab */}
              {activeTab === 'variant' && item.product.variants && item.product.variants.length > 0 && (
                <div className="space-y-4">
                  <label className={`block text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Varyant Seç:
                  </label>
                  <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                    {item.product.variants.map((variant, idx) => {
                      const isSelected = selectedVariant?.id === variant.id;
                      const isAvailable = variant.stock > 0;
                      
                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            if (isAvailable) {
                              setSelectedVariant(variant);
                            }
                          }}
                          disabled={!isAvailable}
                          className={`p-3 rounded-lg border-2 transition-all text-left ${
                            isSelected
                              ? darkMode ? 'border-blue-500 bg-blue-900/30' : 'border-blue-500 bg-blue-50'
                              : isAvailable
                              ? darkMode ? 'border-gray-600 bg-gray-700 hover:border-blue-400 hover:bg-gray-600' : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                              : darkMode ? 'border-gray-700 bg-gray-800 opacity-50 cursor-not-allowed' : 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            {variant.color && (
                              <>
                                <div
                                  className="w-4 h-4 rounded-full border"
                                  style={{ 
                                    backgroundColor: getColorHex(variant.color, variant.colorHex),
                                    borderColor: darkMode ? '#4B5563' : '#D1D5DB'
                                  }}
                                />
                                <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                  {variant.color}
                                </span>
                              </>
                            )}
                            {variant.size && (
                              <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                {variant.color && ' · '}
                                {variant.size}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-semibold ${isAvailable ? (darkMode ? 'text-blue-400' : 'text-blue-600') : (darkMode ? 'text-gray-500' : 'text-gray-400')}`}>
                              {formatNumber(variant.price || 0)}
                            </span>
                            <span className={isAvailable ? (darkMode ? 'text-green-400' : 'text-green-600') : (darkMode ? 'text-red-400' : 'text-red-500')}>
                              {isAvailable ? `Stok: ${variant.stock}` : 'Stokta Yok'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Remove Tab */}
              {activeTab === 'remove' && (
                <div className="space-y-4">
                  <div className={`rounded-lg p-6 text-center ${darkMode ? 'bg-red-900/20 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
                    <Trash2 className={`w-12 h-12 mx-auto mb-3 ${darkMode ? 'text-red-400' : 'text-red-600'}`} />
                    <h4 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      Ürünü Sepetten Çıkar
                    </h4>
                    <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {item.product.name} ürününü sepetten çıkarmak istediğinizden emin misiniz?
                    </p>
                    <div className={`mt-4 text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {formatNumber(item.quantity, 0, false)} {item.product.unit || 'Adet'} × {formatNumber(currentPrice, 2, false)} = {formatNumber(item.subtotal, 2, false)}
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Card */}
              {(activeTab === 'quantity' || activeTab === 'discount') && (
                <div className={`rounded-lg p-4 space-y-2 ${darkMode ? 'bg-gray-700 border border-gray-600' : 'bg-gray-50 border border-gray-200'}`}>
                  <div className={`flex justify-between text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    <span>Ara Toplam:</span>
                    <span className="font-medium">{formatNumber(itemTotal, 2, false)}</span>
                  </div>
                  {parseFloat(discount || '0') > 0 && (
                    <div className={`flex justify-between text-sm ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                      <span>İndirim (%{discount}):</span>
                      <span>-{formatNumber(discountAmount, 2, false)}</span>
                    </div>
                  )}
                  <div className={`border-t pt-2 flex justify-between ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                    <span className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Net Toplam:</span>
                    <span className={`text-xl font-bold ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                      {formatNumber(newTotal, 2, false)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Side - Numpad */}
            {showNumpad && (activeTab === 'quantity' || activeTab === 'discount') && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Numpad Modu:
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNumpadMode('replace')}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        numpadMode === 'replace'
                          ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                          : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Değiştir
                    </button>
                    <button
                      onClick={() => setNumpadMode('concat')}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        numpadMode === 'concat'
                          ? darkMode ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                          : darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                      }`}
                    >
                      Ekle
                    </button>
                  </div>
                </div>
                <POSNumpad
                  value={activeTab === 'quantity' ? quantity : discount}
                  onChange={activeTab === 'quantity' ? setQuantity : setDiscount}
                  showSubmitButton={false}
                  allowDecimal={activeTab === 'discount'}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex gap-2 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <button
            onClick={() => setShowNumpad(!showNumpad)}
            className={`px-4 py-2 text-sm rounded transition-colors flex items-center gap-2 ${
              darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            <Calculator className="w-4 h-4" />
            {showNumpad ? 'Numpad Gizle' : 'Numpad Göster'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm rounded transition-colors bg-gray-200 hover:bg-gray-300 text-gray-700"
          >
            İptal
          </button>
          {activeTab === 'remove' ? (
            <button
              onClick={handleRemove}
              className="flex-1 px-4 py-2 text-sm rounded transition-colors bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Sil
            </button>
          ) : (
            <button
              onClick={handleApply}
              className="flex-1 px-4 py-2 text-sm rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
            >
              Uygula
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


