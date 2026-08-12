import { ShoppingCart, Plus, Minus, Percent, Trash2, Tag } from 'lucide-react';
import type { CartItem } from './types';
import type { Campaign } from '../../App';
import { formatNumber } from '../../utils/formatNumber';

interface POSCartProps {
  cart: CartItem[];
  receiptNumber: string;
  selectedCampaign: Campaign | null;
  subtotal: number;
  totalDiscount: number;
  campaignDiscount: number;
  finalTotal: number;
  onUpdateQuantity: (productId: string, variantId: string | undefined, quantity: number) => void;
  onRemoveItem: (productId: string, variantId: string | undefined) => void;
  onDiscountItem: (productId: string, variantId: string | undefined) => void;
}

export function POSCart({
  cart,
  receiptNumber,
  selectedCampaign,
  subtotal,
  totalDiscount,
  campaignDiscount,
  finalTotal,
  onUpdateQuantity,
  onRemoveItem,
  onDiscountItem
}: POSCartProps) {
  return (
    <div className="w-[450px] bg-white flex flex-col">
      {/* Fatura No */}
      <div className="px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 border-b border-blue-800">
        <div className="flex items-center justify-between text-white">
          <span className="text-xs opacity-90">Fiş No:</span>
          <span className="text-sm font-mono font-medium">{receiptNumber}</span>
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-auto p-1.5 space-y-1 bg-gray-50 border-b border-gray-200">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <ShoppingCart className="w-12 h-12 mb-2" />
            <p className="text-sm">Sepet boş</p>
          </div>
        ) : (
          cart.map((item, index) => (
            <div key={`${item.product.id}-${item.variant?.id || index}`} className="bg-white px-1.5 py-1 border-b border-gray-100">
              {/* Başlık ve Aksiyonlar */}
              <div className="flex items-start justify-between gap-1.5 mb-1">
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-medium text-gray-900 leading-tight">{item.product.name}</h4>
                  {item.variant && (
                    <p className="text-[10px] text-blue-600 mt-0.5">
                      {item.variant.color}{item.variant.color && item.variant.size && '/'}{item.variant.size}
                    </p>
                  )}
                </div>
                <div className="flex gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => onDiscountItem(item.product.id, item.variant?.id)}
                    className="text-orange-600 hover:bg-orange-50 p-0.5"
                    title="İndirim"
                  >
                    <Percent className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onRemoveItem(item.product.id, item.variant?.id)}
                    className="text-red-500 hover:bg-red-50 p-0.5"
                    title="Sil"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              
              {/* Alt Bilgiler */}
              <div className="flex items-center justify-between">
                {/* Miktar Kontrolleri */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, item.variant?.id, item.quantity - 1)}
                    className="w-5 h-5 bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                  >
                    <Minus className="w-2.5 h-2.5 text-gray-600" />
                  </button>
                  <span className="w-6 text-center text-xs font-medium font-mono">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(item.product.id, item.variant?.id, item.quantity + 1)}
                    className="w-5 h-5 bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                  >
                    <Plus className="w-2.5 h-2.5 text-gray-600" />
                  </button>
                </div>
                
                {/* Birim Fiyat */}
                <div className="text-[10px] text-gray-500">
                  {(item.variant?.price || item.product.price).toFixed(2)}
                </div>
                
                {/* Toplam Fiyat */}
                <div className="text-right">
                  {item.discount > 0 && (
                    <div className="text-[9px] text-orange-500 font-medium leading-tight">-%{item.discount.toFixed(0)}</div>
                  )}
                  <div className="text-sm font-semibold text-blue-600">{item.subtotal.toFixed(2)}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Campaign Info */}
      {selectedCampaign && (
        <div className="px-3 py-2 bg-green-50 border-b border-green-200">
          <p className="text-sm text-green-700 font-medium flex items-center gap-1.5">
            <Tag className="w-4 h-4" />
            {selectedCampaign.name}
          </p>
        </div>
      )}

      {/* Totals - Mobil stil */}
      <div className="bg-white border-t-2 border-gray-200">
        <div className="px-3 py-2 space-y-1.5 text-sm">
          {/* Ara Toplam */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600">ARA TOPLAM:</span>
            <span className="font-medium">{formatNumber(subtotal, 2, true)}</span>
          </div>
          
          {/* Kampanya İndirimi */}
          {campaignDiscount > 0 && (
            <div className="flex justify-between items-center text-orange-600">
              <span>Kampanya İndirimi:</span>
              <span className="font-semibold">-{formatNumber(campaignDiscount, 2, true)}</span>
            </div>
          )}
          
          {/* Ürün İndirimleri */}
          {totalDiscount > 0 && (
            <div className="flex justify-between items-center text-red-600">
              <span>İndirim:</span>
              <span>-{formatNumber(totalDiscount, 2, true)}</span>
            </div>
          )}
        </div>
        
        {/* Genel Toplam - Koyu arka plan */}
        <div className="px-3 py-3 bg-gray-900 text-white flex justify-between items-center">
          <span className="text-lg">TOPLAM:</span>
          <span className="text-2xl font-bold">{formatNumber(finalTotal, 2, true)}</span>
        </div>
      </div>
    </div>
  );
}
