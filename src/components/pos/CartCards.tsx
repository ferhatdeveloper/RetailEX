import { Minus, Plus, Trash2, Percent, Package } from 'lucide-react';
import type { CartItem } from './types';
import { useState, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { POSCartItemActionModal } from './POSCartItemActionModal';
import { CampaignResult } from '../../utils/campaignEngine';

interface CartCardsProps {
  cart: CartItem[];
  formatNumber: (num: number) => string;
  updateCartItemQuantity: (index: number, quantity: number) => void;
  handleItemDiscountClick: (index: number) => void;
  removeFromCart: (index: number) => void;
  updateCartItemVariant?: (index: number, variant: any) => void;
  onVariantPanelOpen?: (index: number) => void; // Varyant paneli açıldığında parent'a bildir
  onApplyItemDiscount?: (index: number, discountPercent: number) => void; // Yeni modal için
  isAdmin?: boolean;
  updateCartItemPrice?: (index: number, newPrice: number) => void;
  campaignResult?: CampaignResult;
}

export function CartCards({
  cart,
  formatNumber,
  updateCartItemQuantity,
  handleItemDiscountClick,
  removeFromCart,
  updateCartItemVariant,
  onVariantPanelOpen,
  onApplyItemDiscount,
  isAdmin,
  updateCartItemPrice,
  campaignResult
}: CartCardsProps) {
  const { darkMode } = useTheme();
  const { t } = useLanguage();
  const [longPressIndex, setLongPressIndex] = useState<number | null>(null);
  const [actionModalIndex, setActionModalIndex] = useState<number | null>(null);
  const [variantPanelIndex, setVariantPanelIndex] = useState<number | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // Get color hex code helper
  const getColorHex = (colorName?: string, colorHex?: string) => {
    if (colorHex) return colorHex;
    if (!colorName) return '#9CA3AF';

    // Fallback renk haritası - tüm dillerde çalışır
    const colorMap: Record<string, string> = {
      // Türkçe
      'kırmızı': '#DC2626', 'kirmizi': '#DC2626',
      'mavi': '#2563EB', 'lacivert': '#1E40AF', 'navy': '#1E40AF',
      'yeşil': '#16A34A', 'yesil': '#16A34A', 'green': '#16A34A',
      'sarı': '#EAB308', 'sari': '#EAB308', 'yellow': '#EAB308',
      'turuncu': '#F97316', 'orange': '#F97316',
      'mor': '#9333EA', 'purple': '#9333EA', 'lila': '#C084FC',
      'pembe': '#EC4899', 'pink': '#EC4899',
      'siyah': '#000000', 'black': '#000000',
      'beyaz': '#FFFFFF', 'white': '#FFFFFF',
      'gri': '#6B7280', 'gray': '#6B7280', 'grey': '#6B7280',
      'kahverengi': '#92400E', 'brown': '#92400E',
      'bej': '#D4A574', 'beige': '#D4A574',
      'haki': '#8B8970', 'khaki': '#8B8970',
      'bordo': '#800020', 'burgundy': '#800020', 'wine': '#800020',
      'vizon': '#B5A699', 'mink': '#B5A699',
      'ekru': '#F5F5DC', 'ecru': '#F5F5DC', 'cream': '#F5F5DC',
      'füme': '#A9A9A9', 'fume': '#A9A9A9', 'smoke': '#A9A9A9',
      'mint': '#98FF98', 'nane yeşili': '#98FF98',
      'turkuaz': '#40E0D0', 'turquoise': '#40E0D0', 'cyan': '#00FFFF',
      'pudra': '#FFE4E1', 'powder': '#FFE4E1',
      'indigo': '#4B0082',
      'altın': '#FFD700', 'gold': '#FFD700',
      'gümüş': '#C0C0C0', 'silver': '#C0C0C0',
      'bakır': '#B87333', 'copper': '#B87333',
      'bronz': '#CD7F32', 'bronze': '#CD7F32',
      // İngilizce
      'red': '#DC2626', 'blue': '#2563EB',
      // Çoklu kelimeler
      'koyu mavi': '#1E3A8A', 'dark blue': '#1E3A8A',
      'açık mavi': '#93C5FD', 'light blue': '#93C5FD',
      'koyu yeşil': '#065F46', 'dark green': '#065F46',
      'açık yeşil': '#86EFAC', 'light green': '#86EFAC',
      'koyu gri': '#374151', 'dark gray': '#374151', 'dark grey': '#374151',
      'açık gri': '#D1D5DB', 'light gray': '#D1D5DB', 'light grey': '#D1D5DB',
    };

    const lowerColor = colorName.toLowerCase();
    return colorMap[lowerColor] || '#9CA3AF';
  };

  const handleMouseDown = (index: number) => {
    longPressTimer.current = setTimeout(() => {
      // Basılı tutulduğunda action modal aç
      setActionModalIndex(index);
    }, 500);
  };

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const closeLongPressMenu = () => {
    setLongPressIndex(null);
  };

  const handleApplyItemDiscount = (index: number, discountPercent: number) => {
    if (onApplyItemDiscount) {
      onApplyItemDiscount(index, discountPercent);
    } else {
      // Fallback to old method
      handleItemDiscountClick(index);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-3">
      {/* Action Modal */}
      {actionModalIndex !== null && cart[actionModalIndex] && (
        <POSCartItemActionModal
          item={cart[actionModalIndex]}
          itemIndex={actionModalIndex}
          onClose={() => setActionModalIndex(null)}
          onUpdateQuantity={updateCartItemQuantity}
          onApplyDiscount={handleApplyItemDiscount}
          onRemoveItem={removeFromCart}
          onUpdateVariant={updateCartItemVariant}
          formatNumber={formatNumber}
        />
      )}
      {cart.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-6xl mb-4 opacity-20">🛒</div>
            <p className={darkMode ? 'text-gray-500' : 'text-gray-400'}>{t.cartEmpty}</p>
            <p className={`text-sm mt-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{t.scanToSearchPlaceholder}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {cart.map((item, index) => {
              const price = item.price ?? item.variant?.price ?? item.product.price;
              const hasDiscount = item.discount > 0;
              const showLongPressMenu = longPressIndex === index;

              return (
                <div
                  key={index}
                  className={`rounded-lg border transition-all relative ${darkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-500' : 'bg-white border-gray-200 hover:border-blue-400'}`}
                  onMouseDown={() => handleMouseDown(index)}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={() => handleMouseDown(index)}
                  onTouchEnd={handleMouseUp}
                >
                  {/* Long Press Menu */}
                  {showLongPressMenu && (
                    <div className="absolute inset-0 bg-white rounded-lg z-10 flex items-center justify-center gap-2 p-3 border-2 border-blue-500">
                      <button
                        onClick={() => {
                          handleItemDiscountClick(index);
                          closeLongPressMenu();
                        }}
                        className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Percent className="w-4 h-4" />
                        {t.applyDiscount}
                      </button>
                      {item.product.variants && item.product.variants.length > 0 && (
                        <button
                          onClick={() => {
                            setVariantPanelIndex(index);
                            if (onVariantPanelOpen) onVariantPanelOpen(index);
                          }}
                          className="flex-1 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Package className="w-4 h-4" />
                          {t.changeVariant}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setDeleteConfirmIndex(index);
                          closeLongPressMenu();
                        }}
                        className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded font-medium transition-colors flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t.delete}
                      </button>
                      <button
                        onClick={closeLongPressMenu}
                        className="px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-medium transition-colors"
                      >
                        {t.cancel}
                      </button>
                    </div>
                  )}

                  {/* Main Content */}
                  <div
                    className="flex items-center gap-4 p-3 select-none"
                    onDoubleClick={() => updateCartItemQuantity(index, item.quantity + 1)}
                  >
                    {/* Left: Quantity Badge - Minimal */}
                    <div className={`flex-shrink-0 w-12 rounded-lg bg-blue-600 flex flex-col items-center justify-center text-white shadow-sm ${item.multiplier && item.multiplier > 1 ? 'h-14 py-1' : 'h-12'}`}>
                      <div className="text-lg font-bold leading-none">{formatNumber(item.quantity)}</div>
                      <div className="text-[7px] opacity-90 leading-none mt-0.5">{item.unit || item.product.unit || t.pcs}</div>
                      {item.multiplier && item.multiplier > 1 && (
                        <div className="text-[6px] opacity-80 leading-none mt-0.5 bg-white/20 rounded px-1">
                          ={item.quantity * item.multiplier} {item.product.unit}
                        </div>
                      )}
                    </div>

                    {/* Middle: Product Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate mb-0.5 text-sm">{item.product.name}</h4>
                      <p className="text-[10px] text-gray-500 font-mono mb-0.5">{item.product.barcode}</p>
                      {item.variant && (
                        <button
                          onClick={() => {
                            setVariantPanelIndex(index);
                            if (onVariantPanelOpen) onVariantPanelOpen(index);
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-[10px] font-medium transition-colors"
                        >
                          {item.variant.color && (
                            <>
                              <div
                                className="w-2 h-2 rounded-full border border-purple-300"
                                style={{ backgroundColor: getColorHex(item.variant.color, item.variant.colorHex) }}
                              />
                              {item.variant.color}
                            </>
                          )}
                          {item.variant.size && (
                            <>
                              {item.variant.color && ' · '}
                              {item.variant.size}
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Right: Price + Controls - Minimal & Responsive */}
                    <div className="flex items-center gap-2">
                      {/* Price - Compact */}
                      <div className="text-end min-w-[80px]">
                        <div className="text-lg font-bold text-blue-600 leading-none">
                          {formatNumber(item.subtotal)}
                        </div>
                        {isAdmin ? (
                          <button
                            onClick={() => {
                              const val = prompt(t.enterNewPrice || 'Yeni Fiyat Girin:', price.toString());
                              if (val !== null && !isNaN(parseFloat(val)) && updateCartItemPrice) {
                                updateCartItemPrice(index, parseFloat(val));
                              }
                            }}
                            className={`text-[10px] mt-1 hover:underline cursor-pointer ${darkMode ? 'text-blue-400 font-bold' : 'text-blue-700 font-bold'}`}
                            title={t.clickToChangePrice || 'Fiyatı değiştirmek için tıklayın'}
                          >
                            {formatNumber(price)} / {item.unit || item.product.unit || t.pcs}
                          </button>
                        ) : (
                          <div className="text-[10px] text-gray-500 mt-1">
                            {item.multiplier && item.multiplier > 1 ? (
                              <span className="text-orange-600 font-medium">
                                {formatNumber(price / item.multiplier)} / {item.product.unit} × {item.multiplier}
                              </span>
                            ) : (
                              <span>{formatNumber(price)} / {item.unit || item.product.unit || t.pcs}</span>
                            )}
                          </div>
                        )}
                        {hasDiscount && (
                          <div className="text-[10px] text-gray-400 line-through leading-none mt-0.5">
                            {formatNumber(price * item.quantity)}
                          </div>
                        )}
                        {campaignResult?.itemDiscounts?.find(d => d.index === index) && (
                          <div className={`text-[10px] font-bold leading-none mt-1 ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                            -{formatNumber(campaignResult.itemDiscounts.find(d => d.index === index)!.discountAmount)} (KMP)
                          </div>
                        )}
                      </div>

                      {/* Quantity Controls - Minimal */}
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCartItemQuantity(index, item.quantity - 1);
                          }}
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors flex items-center justify-center rounded"
                        >
                          <Minus className="w-3 h-3 text-gray-700" />
                        </button>
                        <div className="w-9 h-7 bg-white border border-gray-200 flex items-center justify-center rounded mx-0.5">
                          <span className="font-semibold text-gray-900 text-xs">{formatNumber(item.quantity)}</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateCartItemQuantity(index, item.quantity + 1);
                          }}
                          className="w-7 h-7 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors flex items-center justify-center rounded"
                        >
                          <Plus className="w-3 h-3 text-gray-700" />
                        </button>
                      </div>

                      {/* Discount Button - Sadece indirimli ise göster */}
                      {hasDiscount && (
                        <button
                          onClick={() => handleItemDiscountClick(index)}
                          className="px-2 h-7 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium transition-colors flex items-center gap-0.5 text-[10px]"
                        >
                          <Percent className="w-2.5 h-2.5" />
                          %{item.discount}
                        </button>
                      )}

                      {/* Discount Icon - İndirim yoksa yeşil % ikonu */}
                      {!hasDiscount && (
                        <button
                          onClick={() => handleItemDiscountClick(index)}
                          className="w-7 h-7 hover:bg-green-50 rounded transition-colors flex items-center justify-center"
                          title={t.applyDiscount}
                        >
                          <Percent className="w-3.5 h-3.5 text-green-600" />
                        </button>
                      )}

                      {/* Delete Button - Minimal */}
                      <button
                        onClick={() => setDeleteConfirmIndex(index)}
                        className="w-7 h-7 hover:bg-red-50 rounded transition-colors flex items-center justify-center"
                        title={t.delete}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      </button>
                    </div>
                  </div>

                  {/* Delete Confirmation Overlay */}
                  {deleteConfirmIndex === index && (
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-lg z-20 flex items-center justify-center p-4 border-2 border-red-500">
                      <div className="text-center">
                        <div className="mb-3">
                          <Trash2 className="w-8 h-8 text-red-600 mx-auto mb-2" />
                          <h3 className="font-semibold text-gray-900 mb-1">{t.confirmItemDelete}</h3>
                          <p className="text-sm text-gray-600 mb-1">{item.product.name}</p>
                          <p className="text-xs text-gray-500">
                            {formatNumber(item.quantity)} {item.unit || item.product.unit || t.pcs} × {formatNumber(item.variant?.price || item.product.price)} = {formatNumber(item.subtotal)}
                          </p>
                        </div>
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => setDeleteConfirmIndex(null)}
                            className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded font-medium transition-colors text-sm"
                          >
                            {t.cancel}
                          </button>
                          <button
                            onClick={() => {
                              removeFromCart(index);
                              setDeleteConfirmIndex(null);
                            }}
                            className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded font-medium transition-colors flex items-center gap-2 text-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                            {t.yesDelete}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline Variant Panel - C# Panel Mantığı */}
                  {variantPanelIndex === index && item.product.variants && item.product.variants.length > 0 && (
                    <div className="border-t border-gray-200 bg-gray-50 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900 text-sm">{t.selectVariant}</h3>
                        <button
                          onClick={() => setVariantPanelIndex(null)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Variant Grid */}
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                        {item.product.variants.map((variant, variantIndex) => {
                          const isSelected = item.variant?.id === variant.id;
                          const isAvailable = variant.stock > 0;

                          return (
                            <button
                              key={variantIndex}
                              onClick={() => {
                                if (isAvailable && updateCartItemVariant) {
                                  updateCartItemVariant(index, variant);
                                  setVariantPanelIndex(null);
                                }
                              }}
                              disabled={!isAvailable}
                              className={`p-2.5 rounded-lg border-2 transition-all text-left ${isSelected
                                ? 'border-purple-500 bg-purple-50'
                                : isAvailable
                                  ? 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50'
                                  : 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
                                }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                {variant.color && (
                                  <>
                                    <div
                                      className="w-4 h-4 rounded-full border border-gray-300"
                                      style={{ backgroundColor: getColorHex(variant.color, variant.colorHex) }}
                                    />
                                    <span className="text-xs font-medium text-gray-900">{variant.color}</span>
                                  </>
                                )}
                                {variant.size && (
                                  <span className="text-xs font-medium text-gray-900">
                                    {variant.color && ' · '}
                                    {variant.size}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center justify-between text-[10px]">
                                <span className={`font-semibold ${isAvailable ? 'text-blue-600' : 'text-gray-400'}`}>
                                  {formatNumber(variant.price || 0)}
                                </span>
                                <span className={`${isAvailable ? 'text-green-600' : 'text-red-500'}`}>
                                  {isAvailable ? `${t.stock}: ${variant.stock}` : t.outOfStock}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
