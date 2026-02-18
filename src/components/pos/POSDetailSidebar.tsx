import { X, Trash2, Plus, Minus } from 'lucide-react';
import type { SaleItem } from '../../core/types';

interface POSDetailSidebarProps {
  selectedItem: SaleItem | null;
  onClose: () => void;
  onUpdateQuantity: (itemId: string, newQuantity: number) => void;
  onRemoveItem: (itemId: string) => void;
  darkMode?: boolean;
}

export function POSDetailSidebar({
  selectedItem,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  darkMode = false
}: POSDetailSidebarProps) {
  if (!selectedItem) return null;

  const subtotal = selectedItem.price * selectedItem.quantity;
  const discountAmount = selectedItem.discount_amount || 0;
  const total = subtotal - discountAmount;

  return (
    <div className={`flex flex-col h-full ${darkMode ? 'bg-gray-900 text-white' : 'bg-white'} border-l ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${darkMode ? 'border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700' : 'border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRemoveItem(selectedItem.product_id)}
              className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors"
              title="Sil"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
            <span className="text-sm text-white/80 font-medium">Sil İtem</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barkod / Referans */}
      <div className={`px-4 py-2 border-b ${darkMode ? 'border-gray-700 bg-blue-900/20' : 'border-blue-200 bg-blue-50'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs ${darkMode ? 'text-blue-300' : 'text-blue-700'} font-medium`}>
            HBK 290125151 - 968713
          </span>
          <div className="flex items-center gap-1">
            <button className={`p-1 rounded hover:bg-blue-500/10 transition-colors`}>
              <span className="text-xs font-medium text-blue-600">Sil İtem</span>
            </button>
            <button className={`p-1 rounded hover:bg-blue-500/10 transition-colors`}>
              <span className="text-xs font-medium text-blue-600">Barkodu</span>
            </button>
            <button className={`p-1 rounded hover:bg-blue-500/10 transition-colors`}>
              <span className="text-xs font-medium text-blue-600">Fiyı Belirlet</span>
            </button>
          </div>
        </div>
      </div>

      {/* Product Name */}
      <div className={`px-4 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          {selectedItem.product_name}
        </h3>
        {selectedItem.variant_name && (
          <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {selectedItem.variant_name}
          </p>
        )}
      </div>

      {/* Quantity Control */}
      <div className={`px-4 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Miktar</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdateQuantity(selectedItem.product_id, Math.max(1, selectedItem.quantity - 1))}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                darkMode 
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className={`min-w-[3rem] text-center text-2xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {selectedItem.quantity}
            </span>
            <button
              onClick={() => onUpdateQuantity(selectedItem.product_id, selectedItem.quantity + 1)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                darkMode 
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-300' 
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Price Details */}
      <div className={`px-4 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex-1`}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Birim Fiyat</span>
            <span className={`text-base font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {selectedItem.price.toFixed(2)} IQD
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Ara Toplam</span>
            <span className={`text-base font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {subtotal.toFixed(2)} IQD
            </span>
          </div>

          {discountAmount > 0 && (
            <>
              <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${darkMode ? 'bg-green-900/20' : 'bg-green-50'}`}>
                <span className={`text-sm ${darkMode ? 'text-green-300' : 'text-green-700'}`}>
                  Kampanya İnd. ({selectedItem.discount_percentage || 10}%)
                </span>
                <span className={`text-base font-semibold ${darkMode ? 'text-green-400' : 'text-green-600'}`}>
                  -{discountAmount.toFixed(2)} IQD
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Total */}
      <div className={`px-4 py-4 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Toplam:</span>
          <span className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {total.toFixed(2)} IQD
          </span>
        </div>
      </div>
    </div>
  );
}
