import { useState, useEffect } from 'react';
import { X, Plus, Minus, Percent, Trash2, Package, Calculator, DollarSign, Scale } from 'lucide-react';
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
  onUpdatePrice?: (index: number, newPrice: number) => void;
  onUpdateUnit?: (index: number, unit: string, multiplier: number) => void;
  formatNumber?: (num: number, decimals?: number, showDecimals?: boolean) => string;
  unitSets?: any[];
}

export function POSCartItemActionModal({
  item,
  itemIndex,
  onClose,
  onUpdateQuantity,
  onApplyDiscount,
  onRemoveItem,
  onUpdateVariant,
  onUpdatePrice,
  onUpdateUnit,
  formatNumber = formatNumberUtil,
  unitSets = []
}: POSCartItemActionModalProps) {
  const { darkMode } = useTheme();
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [discount, setDiscount] = useState(item.discount.toString());
  const [price, setPrice] = useState((item.price ?? item.variant?.price ?? item.product.price).toString());
  const [activeTab, setActiveTab] = useState<'main' | 'discount' | 'variant' | 'remove'>('main');
  const [showNumpad, setShowNumpad] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(item.variant || null);
  const [numpadMode, setNumpadMode] = useState<'replace' | 'concat'>('replace');
  const [focusedInput, setFocusedInput] = useState<'quantity' | 'price' | 'discount'>('quantity');

  const currentPrice = parseFloat(price || '0');
  const itemTotal = parseFloat(quantity || '0') * currentPrice;
  const discountPercent = parseFloat(discount || '0');
  const discountAmount = (itemTotal * discountPercent) / 100;
  const newTotal = itemTotal - discountAmount;

  // Sync state if item changes
  useEffect(() => {
    setQuantity(item.quantity.toString());
    setPrice((item.price ?? item.variant?.price ?? item.product.price).toString());
    setDiscount(item.discount.toString());
  }, [item]);

  // Handle Numpad input routing
  const handleNumpadChange = (val: string) => {
    if (focusedInput === 'quantity') setQuantity(val);
    else if (focusedInput === 'price') setPrice(val);
    else if (focusedInput === 'discount') setDiscount(val);
  };

  const currentNumpadValue = focusedInput === 'quantity' ? quantity : focusedInput === 'price' ? price : discount;

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
    const prc = parseFloat(price || '0');

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

    // Update price
    if (onUpdatePrice && prc !== (item.price ?? item.variant?.price ?? item.product.price)) {
      onUpdatePrice(itemIndex, prc);
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
      <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} w-full max-w-5xl max-h-[95vh] flex flex-col shadow-2xl rounded-2xl overflow-hidden`}>
        {/* Header */}
        <div className={`p-5 border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gradient-to-r from-blue-700 to-indigo-800'}`}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-white'} flex items-center gap-2`}>
                <Package className="w-6 h-6" />
                Ürün Düzenle
              </h3>
              <p className={`text-base mt-1 font-medium ${darkMode ? 'text-gray-400' : 'text-blue-100'}`}>
                {item.product.name}
              </p>
              {item.variant && (
                <p className={`text-sm mt-0.5 ${darkMode ? 'text-gray-500' : 'text-blue-200'}`}>
                  {item.variant.color}{item.variant.color && item.variant.size && ' · '}{item.variant.size}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className={`p-2.5 rounded-full transition-all ${darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-white hover:bg-white/20'}`}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
          <button
            onClick={() => { setActiveTab('main'); setFocusedInput('quantity'); }}
            className={`flex-1 px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === 'main'
                ? darkMode ? 'bg-gray-700 text-blue-400 border-b-4 border-blue-500' : 'bg-white text-blue-600 border-b-4 border-blue-600'
                : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Plus className="w-5 h-5" />
              Miktar & Fiyat
            </div>
          </button>
          <button
            onClick={() => { setActiveTab('discount'); setFocusedInput('discount'); }}
            className={`flex-1 px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === 'discount'
                ? darkMode ? 'bg-gray-700 text-orange-400 border-b-4 border-orange-500' : 'bg-white text-orange-600 border-b-4 border-orange-600'
                : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Percent className="w-5 h-5" />
              İndirim
            </div>
          </button>
          {item.product.variants && item.product.variants.length > 0 && (
            <button
              onClick={() => setActiveTab('variant')}
              className={`flex-1 px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all ${
                activeTab === 'variant'
                  ? darkMode ? 'bg-gray-700 text-purple-400 border-b-4 border-purple-500' : 'bg-white text-purple-600 border-b-4 border-purple-600'
                  : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Package className="w-5 h-5" />
                Varyant
              </div>
            </button>
          )}
          <button
            onClick={() => setActiveTab('remove')}
            className={`flex-1 px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all ${
              activeTab === 'remove'
                ? darkMode ? 'bg-gray-700 text-red-400 border-b-4 border-red-500' : 'bg-white text-red-600 border-b-4 border-red-600'
                : darkMode ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Trash2 className="w-5 h-5" />
              Sil
            </div>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 flex overflow-hidden">
            {/* Left Side - Form Controls */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Product Info Summary */}
              <div className={`rounded-xl p-4 border flex items-center justify-between ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-blue-50 border-blue-100 text-blue-900'}`}>
                <div>
                  <h4 className="font-bold text-lg leading-tight">{item.product.name}</h4>
                  <p className="text-sm opacity-70 font-medium">Barkod: {item.product.barcode}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase font-black opacity-50 tracking-widest">Birim Fiyat</p>
                  <p className="text-xl font-black">{formatNumber(currentPrice, 2, false)} <span className="text-base font-bold">₺</span></p>
                </div>
              </div>

              {/* Main Tab: Combined Quantity, Price and Units */}
              {activeTab === 'main' && (
                <div className="space-y-6">
                  {/* Quantity and Price Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Quantity Control */}
                    <div className="space-y-2">
                      <label className={`block text-xs font-black uppercase tracking-widest ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        MİKTAR
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            const qty = parseFloat(quantity || '0');
                            if (qty > 1) setQuantity((qty - 1).toString());
                            setFocusedInput('quantity');
                          }}
                          className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${
                            darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          <Minus className="w-6 h-6" />
                        </button>
                        <div className="flex-1">
                          <input
                            type="text"
                            value={quantity}
                            readOnly
                            onClick={() => setFocusedInput('quantity')}
                            className={`w-full h-14 border-2 rounded-xl text-center text-3xl font-black transition-all outline-none ${
                              focusedInput === 'quantity'
                                ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/5'
                                : darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-200 text-gray-900'
                            }`}
                          />
                        </div>
                        <button
                          onClick={() => {
                            const qty = parseFloat(quantity || '0');
                            setQuantity((qty + 1).toString());
                            setFocusedInput('quantity');
                          }}
                          className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${
                            darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          <Plus className="w-6 h-6" />
                        </button>
                      </div>
                    </div>

                    {/* Price Control */}
                    <div className="space-y-2">
                      <label className={`block text-xs font-black uppercase tracking-widest ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        FİYAT
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={price}
                          readOnly
                          onClick={() => setFocusedInput('price')}
                          className={`w-full h-14 px-8 border-2 rounded-xl text-center text-3xl font-black transition-all outline-none ${
                            focusedInput === 'price'
                              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/5'
                              : darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-200 text-gray-900'
                          }`}
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <span className={`text-xl font-black ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>₺</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Unit Selection Integration */}
                  <div className="space-y-2 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700">
                    <label className={`block text-xs font-black uppercase tracking-widest ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      BİRİM SEÇİMİ
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {(() => {
                        const pUnitsetId = (item.product as any).unitset_id || (item.product as any).unitsetId;
                        const productUnits = unitSets.find(us => us.id === pUnitsetId)?.lines || (item.product as any).unitSets?.[0]?.units;
                        
                        if (!productUnits || productUnits.length === 0) {
                          return (
                            <div className={`col-span-full p-4 text-center border-2 border-dashed rounded-xl ${darkMode ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-400'}`}>
                              Birim tanımlanmamış.
                            </div>
                          );
                        }

                        return productUnits.map((u: any) => {
                          const isCurrent = (item.unit || item.product.unit) === (u.name || u.name);
                          return (
                            <button
                              key={u.id}
                              onClick={() => {
                                if (onUpdateUnit) {
                                  onUpdateUnit(itemIndex, u.name, u.multiplier || u.conv_fact1 || 1);
                                }
                              }}
                              className={`p-3 rounded-xl border-2 transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                                isCurrent
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 ring-2 ring-blue-500/10'
                                  : darkMode
                                    ? 'border-gray-700 bg-gray-700 hover:border-gray-500 text-gray-400'
                                    : 'border-gray-200 bg-white hover:border-blue-200 text-gray-600'
                              }`}
                            >
                              <span className="text-base font-black">{u.name}</span>
                              <span className="text-[10px] uppercase font-black opacity-50">x {u.multiplier || u.conv_fact1 || 1}</span>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Discount Tab */}
              {activeTab === 'discount' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className={`block text-xs font-black uppercase tracking-widest ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      İNDİRİM YÜZDESİ
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={discount}
                        readOnly
                        onClick={() => setFocusedInput('discount')}
                        className={`w-full h-16 border-2 rounded-xl text-center text-4xl font-black transition-all outline-none ${
                          focusedInput === 'discount'
                            ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/5'
                            : darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-200 text-gray-900'
                        }`}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <Percent className={`w-6 h-6 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {quickDiscounts.map(disc => (
                      <button
                        key={disc}
                        onClick={() => { setDiscount(disc.toString()); setFocusedInput('discount'); }}
                        className={`h-12 rounded-xl text-lg font-black transition-all ${
                          discount === disc.toString()
                            ? 'bg-orange-600 text-white'
                            : darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        %{disc}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Variant selection */}
              {activeTab === 'variant' && item.product.variants && item.product.variants.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2">
                  {item.product.variants.map((v, idx) => {
                    const isSelected = selectedVariant?.id === v.id;
                    const isAvailable = v.stock > 0;
                    return (
                      <button
                        key={idx}
                        onClick={() => isAvailable && setSelectedVariant(v)}
                        disabled={!isAvailable}
                        className={`p-3 rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500/10'
                            : isAvailable
                            ? darkMode ? 'border-gray-700 bg-gray-700 hover:border-purple-500/50' : 'border-gray-100 bg-white hover:border-purple-200'
                            : 'border-gray-200 bg-gray-50 opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {v.color && (
                            <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: getColorHex(v.color, v.colorHex) }} />
                          )}
                          <span className={`font-black text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{v.color}{v.color && v.size && '/'}{v.size}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-purple-600">{formatNumber(v.price || 0)}₺</span>
                          <span className={v.stock > 0 ? 'text-green-600' : 'text-red-500'}>Stok: {v.stock}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeTab === 'remove' && (
                <div className="text-center p-8 space-y-4">
                  <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                    <Trash2 className="w-10 h-10 text-red-600" />
                  </div>
                  <h4 className="text-xl font-black">Ürünü Kaldır</h4>
                  <p className="opacity-70 font-medium">Bu ürünü sepetten silmek istediğinizden emin misiniz?</p>
                  <button onClick={handleRemove} className="w-full py-4 bg-red-600 text-white rounded-xl font-black text-lg">SİL</button>
                </div>
              )}

              {/* Subtotal Summary */}
              {activeTab !== 'remove' && (
                <div className={`rounded-xl p-4 space-y-1 ${darkMode ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
                  <div className="flex justify-between items-center text-[10px] font-black opacity-50 uppercase tracking-widest">
                    <span>Ara Toplam</span>
                    <span>{formatNumber(itemTotal, 2, false)} ₺</span>
                  </div>
                  {discountPercent > 0 && (
                    <div className="flex justify-between items-center text-[10px] font-black text-orange-600 uppercase tracking-widest">
                      <span>İndirim (%{discount})</span>
                      <span>-{formatNumber(discountAmount, 2, false)} ₺</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-800 flex justify-between items-baseline">
                    <span className="text-xs font-black uppercase tracking-widest opacity-80">NET TOPLAM</span>
                    <span className="text-3xl font-black text-blue-600">{formatNumber(newTotal, 2, false)} <span className="text-lg">₺</span></span>
                  </div>
                </div>
              )}
            </div>

            {/* Right Side - Numpad */}
            {showNumpad && activeTab !== 'variant' && activeTab !== 'remove' && (
              <div className={`w-[340px] border-l p-6 flex flex-col justify-center ${darkMode ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50/50 border-gray-100'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-blue-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Tuş Takımı</span>
                  </div>
                  <div className="flex bg-gray-200 dark:bg-gray-700 p-0.5 rounded-lg">
                    <button
                      onClick={() => setNumpadMode('replace')}
                      className={`px-3 py-1 text-[9px] font-black rounded-md transition-all ${
                        numpadMode === 'replace' ? 'bg-white dark:bg-gray-600 text-blue-600' : 'text-gray-500'
                      }`}
                    >
                      SİL
                    </button>
                    <button
                      onClick={() => setNumpadMode('concat')}
                      className={`px-3 py-1 text-[9px] font-black rounded-md transition-all ${
                        numpadMode === 'concat' ? 'bg-white dark:bg-gray-600 text-blue-600' : 'text-gray-500'
                      }`}
                    >
                      EKLE
                    </button>
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <POSNumpad
                    value={currentNumpadValue}
                    onChange={handleNumpadChange}
                    showSubmitButton={false}
                    allowDecimal={focusedInput !== 'quantity'}
                    darkMode={darkMode}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className={`p-6 border-t flex gap-4 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
          <button
            onClick={() => setShowNumpad(!showNumpad)}
            className={`h-16 px-6 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center gap-3 ${
              darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
          >
            <Calculator className="w-6 h-6" />
            {showNumpad ? 'Klavye' : 'Pad'}
          </button>
          
          <div className="flex-1 flex gap-4">
            <button
              onClick={onClose}
              className={`flex-1 h-16 rounded-2xl font-black text-lg uppercase tracking-widest transition-all border-2 ${
                darkMode ? 'border-gray-700 text-gray-400 hover:bg-gray-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              Vazgeç
            </button>
            <button
              onClick={handleApply}
              className="flex-[2] h-16 rounded-2xl font-black text-xl uppercase tracking-widest transition-all bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/20 active:scale-[0.98]"
            >
              GÜNCELLE VE KAPAT
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


