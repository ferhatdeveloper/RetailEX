import { X, Save, Trash2, Eye, RotateCcw, Coffee } from 'lucide-react';
import type { CartItem } from './types';
import { useLanguage } from '../../contexts/LanguageContext';

export interface ParkedReceipt {
  id: string;
  receiptNumber: string;
  cart: CartItem[];
  customerName?: string;
  campaignName?: string;
  parkedAt: string;
  parkedBy: string;
}

interface POSParkedReceiptsModalProps {
  parkedReceipts: ParkedReceipt[];
  onRestore: (receipt: ParkedReceipt) => void;
  onDelete: (receiptId: string) => void;
  onClose: () => void;
}

export function POSParkedReceiptsModal({
  parkedReceipts,
  onRestore,
  onDelete,
  onClose
}: POSParkedReceiptsModalProps) {
  const { t, language } = useLanguage();
  
  // Safe fallback for parkedReceipts
  const safeReceipts = parkedReceipts || [];
  
  const calculateReceiptTotal = (cart: CartItem[]) => {
    if (!cart || !Array.isArray(cart)) return 0;
    return cart.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <Coffee className="w-5 h-5" />
            {t.parkedReceiptsTitle}
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {safeReceipts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Save className="w-16 h-16 mb-3 opacity-50" />
              <p className="text-lg mb-1">{t.noParkedReceipts}</p>
              <p className="text-sm">{t.noParkedReceiptsDescription}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {safeReceipts.map((receipt) => {
                const total = calculateReceiptTotal(receipt.cart);
                const itemCount = (receipt.cart && Array.isArray(receipt.cart)) 
                  ? receipt.cart.reduce((sum, item) => sum + (item.quantity || 0), 0)
                  : 0;

                return (
                  <div
                    key={receipt.id}
                    className="p-4 border-2 border-gray-200 rounded bg-white hover:border-purple-300 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-medium text-gray-900">
                            {receipt.receiptNumber}
                          </span>
                          {receipt.campaignName && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                              {receipt.campaignName}
                            </span>
                          )}
                        </div>
                        
                        <div className="text-xs text-gray-600 space-y-0.5">
                          <div>
                            {t.parkedAt}: {new Date(receipt.parkedAt).toLocaleString(language === 'ar' ? 'ar-SA' : language === 'ku' ? 'ar-IQ' : language === 'en' ? 'en-US' : 'tr-TR')}
                          </div>
                          <div>
                            {t.parkedBy}: {receipt.parkedBy}
                          </div>
                          {receipt.customerName && (
                            <div>
                              {t.customerLabel}: {receipt.customerName}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right ml-4">
                        <div className="text-xs text-gray-500 mb-0.5">{itemCount} {t.itemsCount}</div>
                        <div className="text-lg font-medium text-gray-900">
                          {total.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Receipt Items Preview */}
                    <div className="mb-3 p-2 bg-gray-50 rounded max-h-24 overflow-auto">
                      <div className="space-y-1 text-xs text-gray-600">
                        {(receipt.cart && Array.isArray(receipt.cart)) && receipt.cart.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="truncate flex-1">
                              {item.product.name}
                              {item.variant && ` (${item.variant.color}${item.variant.size ? ` - ${item.variant.size}` : ''})`}
                            </span>
                            <span className="ml-2 whitespace-nowrap">
                              {item.quantity} x {(item.variant?.price || item.product.price).toFixed(2)} = {item.subtotal.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          onRestore(receipt);
                          onClose();
                        }}
                        className="flex-1 px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 text-sm"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {t.continueReceipt}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`${receipt.receiptNumber} ${t.confirmDelete}`)) {
                            onDelete(receipt.id);
                          }
                        }}
                        className="px-3 py-2 bg-white border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors flex items-center gap-2 text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        {t.deleteReceipt}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}


