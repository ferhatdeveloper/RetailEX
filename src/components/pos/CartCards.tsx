import { Minus, Plus, Trash2, Percent, Package } from 'lucide-react';
import type { CartItem } from './types';
import { useState, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { POSCartItemActionModal } from './POSCartItemActionModal';
import { CampaignResult } from '../../utils/campaignEngine';
import { cn } from '../ui/utils';

interface CartCardsProps {
  cart: CartItem[];
  formatNumber: (num: number) => string;
  updateCartItemQuantity: (index: number, quantity: number) => void;
  handleItemDiscountClick: (index: number) => void;
  removeFromCart: (index: number) => void;
  updateCartItemVariant?: (index: number, variant: any) => void;
  onVariantPanelOpen?: (index: number) => void; // Varyant paneli açıldığında parent'a bildir
  onApplyItemDiscount?: (index: number, discountPercent: number) => void; // Yeni modal için
  updateCartItemPrice?: (index: number, newPrice: number) => void;
  updateCartItemUnit?: (index: number, unit: string, multiplier: number) => void;
  campaignResult?: CampaignResult;
  unitSets?: any[];
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
  updateCartItemPrice,
  updateCartItemUnit,
  campaignResult,
  unitSets = []
}: CartCardsProps) {
  const { darkMode } = useTheme();
  const { t } = useLanguage();
  const [actionModalIndex, setActionModalIndex] = useState<number | null>(null);
  const [variantPanelIndex, setVariantPanelIndex] = useState<number | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [editingPriceIndex, setEditingPriceIndex] = useState<number | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');
  const priceInputRef = useRef<HTMLInputElement | null>(null);
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

  const handleApplyItemDiscount = (index: number, discountPercent: number) => {
    if (onApplyItemDiscount) {
      onApplyItemDiscount(index, discountPercent);
    } else {
      // Fallback to old method
      handleItemDiscountClick(index);
    }
  };

  const startEditingPrice = (index: number, currentUnitPrice: number) => {
    setEditingPriceIndex(index);
    setEditingPriceValue(currentUnitPrice.toString());
    setTimeout(() => priceInputRef.current?.focus(), 0);
  };

  const commitPriceEdit = (index: number) => {
    if (editingPriceIndex !== index || !updateCartItemPrice) {
      setEditingPriceIndex(null);
      return;
    }
    const raw = editingPriceValue.replace(',', '.');
    const newUnitPrice = parseFloat(raw);
    if (!Number.isNaN(newUnitPrice) && newUnitPrice >= 0 && cart[index]) {
      updateCartItemPrice(index, newUnitPrice);
    }
    setEditingPriceIndex(null);
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
          onUpdatePrice={updateCartItemPrice}
          onUpdateUnit={updateCartItemUnit}
          formatNumber={formatNumber}
          unitSets={unitSets}
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
              const canEditPrice = Boolean(updateCartItemPrice);
              const stripeColor = darkMode ? '#3b82f6' : '#2563eb';
              const editingUnitPrice = editingPriceIndex === index
                ? parseFloat(editingPriceValue.replace(',', '.'))
                : price;
              const computedLineTotal = Number.isNaN(editingUnitPrice)
                ? item.subtotal
                : item.quantity * editingUnitPrice * (1 - (item.discount || 0) / 100);

              return (
                <div
                  key={index}
                  className={cn(
                    'rounded-[16px] border transition-all relative overflow-hidden select-none',
                    darkMode
                      ? 'bg-gray-800/95 border-gray-600 hover:border-blue-500/70'
                      : 'bg-white border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300'
                  )}
                  onMouseDown={() => handleMouseDown(index)}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onTouchStart={() => handleMouseDown(index)}
                  onTouchEnd={handleMouseUp}
                >
                  <div
                    className="absolute top-0 left-0 bottom-0 w-1 z-[1] shadow-[2px_0_10px_rgba(0,0,0,0.06)]"
                    style={{ backgroundColor: stripeColor }}
                    aria-hidden
                  />

                  {/* Main Content — RestPOS tarzı kompakt kart */}
                  <div
                    className="flex items-center gap-3 p-2.5 pl-4 select-none relative z-0"
                    onDoubleClick={() => updateCartItemQuantity(index, item.quantity + 1)}
                  >
                    {/* Sol: miktar rozeti */}
                    <div
                      className={cn(
                        'flex-shrink-0 w-11 rounded-[12px] flex flex-col items-center justify-center text-white shadow-md transition-transform active:scale-95',
                        item.multiplier && item.multiplier > 1 ? 'h-[52px] py-1' : 'h-11'
                      )}
                      style={{
                        backgroundColor: stripeColor,
                        boxShadow: darkMode ? `0 4px 12px ${stripeColor}44` : `0 4px 10px ${stripeColor}33`
                      }}
                    >
                      <div className="text-[16px] font-black leading-none drop-shadow-sm">{formatNumber(item.quantity)}</div>
                      <div className="text-[8px] font-bold opacity-90 leading-none mt-0.5 uppercase tracking-tighter">
                        {item.unit || item.product.unit || t.pcs}
                      </div>
                      {item.multiplier && item.multiplier > 1 && (
                        <div className="text-[6px] opacity-90 leading-none mt-0.5 bg-white/20 rounded px-1 font-bold">
                          ={item.quantity * item.multiplier} {item.product.unit}
                        </div>
                      )}
                    </div>

                    {/* Orta: ürün bilgisi */}
                    <div className="flex-1 min-w-0">
                      <h4
                        className={cn(
                          'font-extrabold truncate mb-0.5 text-[14px] leading-tight tracking-tight',
                          darkMode ? 'text-gray-100' : 'text-slate-900'
                        )}
                      >
                        {item.product.name}
                      </h4>
                      <p className={cn('text-[10px] font-mono mb-0.5', darkMode ? 'text-gray-500' : 'text-slate-500')}>
                        {item.product.barcode}
                      </p>
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

                    {/* Sağ: satır tutarı + kontroller */}
                    <div className="flex items-center gap-2">
                      {/* Tutar: tek dokunuşta düzenle (modal / uzun basış gerekmez) */}
                      <div
                        className="text-end min-w-[76px]"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        {canEditPrice && editingPriceIndex === index ? (
                          <input
                            ref={priceInputRef}
                            type="text"
                            inputMode="decimal"
                            value={editingPriceValue}
                            onChange={(e) => setEditingPriceValue(e.target.value)}
                            onBlur={() => commitPriceEdit(index)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitPriceEdit(index);
                              }
                              if (e.key === 'Escape') {
                                setEditingPriceIndex(null);
                              }
                            }}
                            className={cn(
                              'w-full text-[15px] font-black leading-none bg-transparent border-b-2 border-blue-500 outline-none text-right py-0 tabular-nums',
                              darkMode ? 'text-blue-400' : 'text-blue-600'
                            )}
                          />
                        ) : canEditPrice ? (
                          <button
                            type="button"
                            title={t.clickToChangePrice || 'Fiyatı değiştirmek için tıklayın'}
                            onClick={() => startEditingPrice(index, price)}
                            className={cn(
                              'text-left w-full rounded-lg px-1 -mx-1 py-0.5 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40',
                              darkMode ? 'hover:bg-gray-700/80' : 'hover:bg-blue-50/90'
                            )}
                          >
                            <div
                              className={cn(
                                'text-[15px] font-black leading-none tabular-nums',
                                darkMode ? 'text-blue-400' : 'text-blue-600'
                              )}
                            >
                              {formatNumber(item.subtotal)}
                            </div>
                          </button>
                        ) : (
                          <div
                            className={cn(
                              'text-[15px] font-black leading-none tabular-nums',
                              darkMode ? 'text-gray-200' : 'text-slate-800'
                            )}
                          >
                            {formatNumber(item.subtotal)}
                          </div>
                        )}
                        {editingPriceIndex === index && (
                          <div className={cn('text-[10px] mt-0.5 font-semibold', darkMode ? 'text-blue-300' : 'text-blue-700')}>
                            {formatNumber(item.quantity)} × {formatNumber(editingUnitPrice || 0)} = {formatNumber(computedLineTotal || 0)}
                          </div>
                        )}
                        {editingPriceIndex !== index && (
                          <>
                            <div
                              className={cn(
                                'text-[10px] mt-0.5 font-semibold',
                                canEditPrice
                                  ? darkMode
                                    ? 'text-blue-400/90'
                                    : 'text-blue-700'
                                  : darkMode
                                    ? 'text-gray-500'
                                    : 'text-slate-500'
                              )}
                            >
                              {item.multiplier && item.multiplier > 1 ? (
                                <span className={darkMode ? 'text-orange-400' : 'text-orange-600'}>
                                  {formatNumber(price / item.multiplier)} / {item.product.unit} × {item.multiplier}
                                </span>
                              ) : (
                                <span>
                                  {formatNumber(price)} / {item.unit || item.product.unit || t.pcs}
                                </span>
                              )}
                            </div>
                          </>
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

                  {/* Delete Confirmation Modal */}
                  {deleteConfirmIndex === index && (
                    <div
                      className="fixed inset-0 z-[9999] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4"
                      onClick={() => setDeleteConfirmIndex(null)}
                    >
                      <div
                        className={cn(
                          'w-full max-w-md rounded-2xl border shadow-2xl p-5',
                          darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-red-200'
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-center">
                          <Trash2 className="w-8 h-8 text-red-600 mx-auto mb-2" />
                          <h3 className={cn('font-bold mb-1', darkMode ? 'text-gray-100' : 'text-gray-900')}>{t.confirmItemDelete}</h3>
                          <p className={cn('text-sm mb-1 font-semibold', darkMode ? 'text-gray-300' : 'text-gray-700')}>{item.product.name}</p>
                          <p className={cn('text-xs', darkMode ? 'text-gray-400' : 'text-gray-500')}>
                            {formatNumber(item.quantity)} {item.unit || item.product.unit || t.pcs} × {formatNumber(price)} = {formatNumber(item.subtotal)}
                          </p>
                        </div>
                        <div className="flex gap-2 justify-center mt-4">
                          <button
                            onClick={() => setDeleteConfirmIndex(null)}
                            className={cn(
                              'px-6 py-2.5 rounded-lg font-medium transition-colors text-sm',
                              darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                            )}
                          >
                            {t.cancel}
                          </button>
                          <button
                            onClick={() => {
                              removeFromCart(index);
                              setDeleteConfirmIndex(null);
                            }}
                            className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
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
