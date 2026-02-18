import { Minus, Plus, Trash2 } from 'lucide-react';
import { memo } from 'react';
import type { CartItem } from './types';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface CartTableProps {
  cart: CartItem[];
  formatNumber: (num: number) => string;
  updateCartItemQuantity: (index: number, quantity: number) => void;
  handleItemDiscountClick: (index: number) => void;
  removeFromCart: (index: number) => void;
  isAdmin?: boolean;
  updateCartItemPrice?: (index: number, newPrice: number) => void;
}

export function CartTable({
  cart,
  formatNumber,
  updateCartItemQuantity,
  handleItemDiscountClick,
  removeFromCart,
  isAdmin,
  updateCartItemPrice
}: CartTableProps) {
  const { darkMode } = useTheme();
  const { t } = useLanguage();

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full border-collapse">
        <thead className={`border-b sticky top-0 ${darkMode ? 'bg-gradient-to-r from-gray-700 to-gray-600 border-gray-600' : 'bg-gradient-to-r from-blue-600 to-blue-700 border-blue-800'}`}>
          <tr>
            <th className={`px-3 py-2 text-start text-xs text-white border-ie ${darkMode ? 'border-gray-500' : 'border-blue-500'}`}>{t.rowOrder}</th>
            <th className={`px-3 py-2 text-start text-xs text-white border-ie ${darkMode ? 'border-gray-500' : 'border-blue-500'}`}>{t.barcode}</th>
            <th className={`px-3 py-2 text-start text-xs text-white border-ie ${darkMode ? 'border-gray-500' : 'border-blue-500'}`}>{t.productName}</th>
            <th className={`px-3 py-2 text-center text-xs text-white border-ie ${darkMode ? 'border-gray-500' : 'border-blue-500'}`}>{t.quantity}</th>
            <th className={`px-3 py-2 text-end text-xs text-white border-ie ${darkMode ? 'border-gray-500' : 'border-blue-500'}`}>{t.price}</th>
            <th className={`px-3 py-2 text-end text-xs text-white border-ie ${darkMode ? 'border-gray-500' : 'border-blue-500'}`}>{t.discount}</th>
            <th className={`px-3 py-2 text-end text-xs text-white border-ie ${darkMode ? 'border-gray-500' : 'border-blue-500'}`}>{t.total}</th>
            <th className="px-3 py-2 text-center text-xs text-white">{t.action}</th>
          </tr>
        </thead>
        <tbody>
          {cart.length === 0 ? (
            <tr>
              <td colSpan={8} className={`px-3 py-8 text-center ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {t.cartEmpty} - {t.scanToSearchPlaceholder}
              </td>
            </tr>
          ) : (
            cart.map((item, index) => {
              const price = item.price || item.variant?.price || item.product.price;
              return (
                <tr key={index} className={`border-b transition-colors ${darkMode ? 'border-gray-700 hover:bg-gray-700/50' : 'border-gray-100 hover:bg-blue-50/50'}`}>
                  <td className={`px-3 py-2.5 text-sm border-ie ${darkMode ? 'text-gray-300 border-gray-700' : 'text-gray-700 border-gray-100'}`}>{index + 1}</td>
                  <td className={`px-3 py-2.5 text-sm border-ie ${darkMode ? 'text-gray-300 border-gray-700' : 'text-gray-700 border-gray-100'}`}>{item.product.barcode}</td>
                  <td className={`px-3 py-2.5 text-sm border-ie ${darkMode ? 'text-white border-gray-700' : 'text-gray-900 border-gray-100'}`}>
                    {item.product.name}
                    {item.variant && (
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {item.variant.color} / {item.variant.size}
                      </div>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-center border-ie ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => updateCartItemQuantity(index, item.quantity - 1)}
                        className={`p-0.5 transition-colors ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                      >
                        <Minus className={`w-3.5 h-3.5 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
                      </button>
                      <div className="flex flex-col items-center min-w-[60px]">
                        <span className={`text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{formatNumber(item.quantity)}</span>
                        <span className={`text-[10px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{item.product.unit || t.pcs}</span>
                      </div>
                      <button
                        onClick={() => updateCartItemQuantity(index, item.quantity + 1)}
                        className={`p-0.5 transition-colors ${darkMode ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                      >
                        <Plus className={`w-3.5 h-3.5 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`} />
                      </button>
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 text-end text-sm border-ie ${darkMode ? 'text-white border-gray-700' : 'text-gray-900 border-gray-100'}`}>
                    {isAdmin ? (
                      <button
                        onClick={() => {
                          const val = prompt(t.enterNewPrice || 'Yeni Fiyat Girin:', price.toString());
                          if (val !== null && !isNaN(parseFloat(val)) && updateCartItemPrice) {
                            updateCartItemPrice(index, parseFloat(val));
                          }
                        }}
                        className={`hover:underline cursor-pointer ${darkMode ? 'text-blue-400 font-bold' : 'text-blue-700 font-bold'}`}
                        title={t.clickToChangePrice || 'Fiyatı değiştirmek için tıklayın'}
                      >
                        {price.toFixed(2)}
                      </button>
                    ) : (
                      price.toFixed(2)
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-center border-ie ${darkMode ? 'border-gray-700' : 'border-gray-100'}`}>
                    <button
                      onClick={() => handleItemDiscountClick(index)}
                      className={`text-xs ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'}`}
                    >
                      {item.discount > 0 ? `%${item.discount}` : '-'}
                    </button>
                  </td>
                  <td className={`px-3 py-2.5 text-end text-sm border-ie ${darkMode ? 'text-white border-gray-700' : 'text-gray-900 border-gray-100'}`}>{item.subtotal.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => removeFromCart(index)}
                      className={`p-1 transition-colors ${darkMode ? 'hover:bg-red-900/30' : 'hover:bg-red-50'}`}
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// Export memoized version for performance
export default memo(CartTable);
