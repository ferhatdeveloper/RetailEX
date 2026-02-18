import { useState } from 'react';
import { X, Percent, Calculator } from 'lucide-react';
import type { CartItem } from './types';
import { POSNumpad } from './POSNumpad';
import { formatNumber } from '../../utils/formatNumber';

interface POSItemDiscountModalProps {
  item: CartItem;
  onClose: () => void;
  onApplyDiscount: (productId: string, variantId: string | undefined, discountPercent: number) => void;
}

export function POSItemDiscountModal({ item, onClose, onApplyDiscount }: POSItemDiscountModalProps) {
  const [discountValue, setDiscountValue] = useState(item.discount.toString());
  const [showNumpad, setShowNumpad] = useState(false);
  const currentPrice = item.variant?.price || item.product.price;
  const itemTotal = item.quantity * currentPrice;
  const discountAmount = (itemTotal * parseFloat(discountValue || '0')) / 100;
  const newTotal = itemTotal - discountAmount;

  const handleApply = () => {
    const discount = parseFloat(discountValue) || 0;
    if (discount < 0 || discount > 100) {
      alert('İndirim yüzdesi 0-100 arasında olmalıdır!');
      return;
    }
    onApplyDiscount(item.product.id, item.variant?.id, discount);
    onClose();
  };

  const quickDiscounts = [0, 5, 10, 15, 20, 25, 30, 50];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white w-full ${showNumpad ? 'max-w-4xl' : 'max-w-md'} max-h-[90vh] flex flex-col shadow-2xl transition-all duration-300`}>
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-red-600 to-red-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Satır İndirimi
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNumpad(!showNumpad)}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1.5 transition-colors ${
                showNumpad 
                  ? 'bg-white/20 text-white' 
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              <Calculator className="w-4 h-4" />
              Numpad
            </button>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className={`grid ${showNumpad ? 'grid-cols-2' : 'grid-cols-1'} gap-6`}>
            {/* Sol Taraf - Form */}
            <div className="space-y-6">
              {/* Ürün Bilgisi */}
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="text-sm font-medium text-blue-900">{item.product.name}</div>
                {item.variant && (
                  <div className="text-xs text-blue-600 mt-1">
                    {item.variant.color}{item.variant.color && item.variant.size && '/'}{item.variant.size}
                  </div>
                )}
                <div className="flex justify-between mt-2 text-xs text-blue-700">
                  <span>Miktar: {item.quantity} {item.product.unit}</span>
                  <span>Birim: {formatNumber(currentPrice, 2, false)}</span>
                </div>
              </div>

              {/* İndirim Girişi */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">İndirim Yüzdesi:</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 px-4 py-3 border border-gray-300 rounded text-center text-2xl font-medium"
                      autoFocus
                    />
                    <div className="flex items-center justify-center w-12 bg-gray-100 rounded">
                      <Percent className="w-6 h-6 text-gray-600" />
                    </div>
                  </div>
                </div>

                {/* Hızlı İndirim Butonları */}
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Hızlı Seçim:</label>
                  <div className="grid grid-cols-4 gap-2">
                    {quickDiscounts.map(discount => (
                      <button
                        key={discount}
                        onClick={() => setDiscountValue(discount.toString())}
                        className={`px-3 py-2 rounded text-sm transition-colors ${
                          discountValue === discount.toString()
                            ? 'bg-orange-600 text-white'
                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        }`}
                      >
                        %{discount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hesaplama Özeti */}
                <div className="bg-gray-50 rounded p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Ara Toplam:</span>
                    <span className="font-medium">{formatNumber(itemTotal, 2, false)}</span>
                  </div>
                  {parseFloat(discountValue || '0') > 0 && (
                    <div className="flex justify-between text-sm text-orange-600">
                      <span>İndirim (%{discountValue}):</span>
                      <span>-{formatNumber(discountAmount, 2, false)}</span>
                    </div>
                  )}
                  <div className="border-t border-gray-300 pt-2 flex justify-between">
                    <span className="font-medium">Net Toplam:</span>
                    <span className="text-xl font-bold text-blue-600">{formatNumber(newTotal, 2, false)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sağ Taraf - Numpad */}
            {showNumpad && (
              <div>
                <POSNumpad
                  value={discountValue}
                  onChange={setDiscountValue}
                  showSubmitButton={false}
                  allowDecimal={false}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
          >
            Uygula
          </button>
        </div>
      </div>
    </div>
  );
}
