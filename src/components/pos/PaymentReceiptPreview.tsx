import { useEffect, useRef } from 'react';
import type { Sale } from '../../App';
import { useTheme } from '../../contexts/ThemeContext';
import { Banknote } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import { formatNumber } from '../../utils/formatNumber';

interface PaymentReceiptPreviewProps {
  sale: Sale;
  companyName?: string;
  location?: string;
}

/**
 * Ödeme Fişi Önizleme Komponenti
 * Görüntüdeki formata uygun ödeme fişi gösterir
 */
export function PaymentReceiptPreview({ 
  sale, 
  companyName = 'ExRetailOS',
  location = 'Bağdat, Irak'
}: PaymentReceiptPreviewProps) {
  const { darkMode } = useTheme();
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (barcodeRef.current && sale.receiptNumber) {
      try {
        JsBarcode(barcodeRef.current, sale.receiptNumber, {
          format: 'CODE128',
          width: 2,
          height: 50,
          displayValue: true,
          fontSize: 12,
          margin: 5
        });
      } catch (error) {
        console.error('Barkod oluşturma hatası:', error);
      }
    }
  }, [sale.receiptNumber]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatMoney = (amount: number) => {
    // Türkiye formatı: binlik ayırıcı nokta (.), ondalık ayırıcı virgül (,)
    // Örnek: 1.800.000,00
    return formatNumber(amount, 2, true);
  };

  const getPaymentMethodName = (method: string) => {
    const methods: Record<string, string> = {
      'cash': 'Nakit',
      'card': 'Kredi Kartı',
      'credit_card': 'Kredi Kartı',
      'bank_transfer': 'Banka Transferi',
      'mixed': 'Karışık'
    };
    return methods[method] || method;
  };

  return (
    <div className={`w-full max-w-md mx-auto ${darkMode ? 'bg-white text-black' : 'bg-white text-black'} shadow-lg rounded-lg overflow-hidden`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 text-center">
        <h2 className="text-xl font-bold mb-1">Ödeme Fişi</h2>
        <div className="text-lg font-semibold mb-1">{companyName}</div>
        <div className="text-sm opacity-90">Profesyonel Satış Yönetim Sistemi</div>
        <div className="text-xs opacity-75 mt-1">{location}</div>
      </div>

      {/* Receipt Info */}
      <div className="p-4 space-y-2 border-b border-gray-200">
        <div className="flex justify-between">
          <span className="text-gray-600">FİŞ NO:</span>
          <span className="font-bold">{sale.receiptNumber}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">TARİH:</span>
          <span>{formatDate(sale.date)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">KASİYER:</span>
          <span>{sale.cashier || 'Sistem Yöneticisi'}</span>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 border-b border-gray-200">
        {sale.items.map((item, index) => {
          const itemTotal = (item.price * item.quantity) - (item.discount || 0);
          return (
            <div key={index} className="mb-3 last:mb-0">
              <div className="flex justify-between items-start mb-1">
                <div className="flex-1">
                  <div className="font-medium">{item.productName}</div>
                  {item.variant && (
                    <div className="text-sm text-gray-500">
                      {[item.variant.color, item.variant.size].filter(Boolean).join(' / ')}
                    </div>
                  )}
                </div>
                <div className="text-right ml-4">
                  <div className="font-semibold">{formatMoney(itemTotal)} IQD</div>
                </div>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>{item.quantity} x {formatMoney(item.price)} IQD</span>
                {item.discount && item.discount > 0 && (
                  <span className="text-red-600">-{formatMoney(item.discount)} IQD</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="p-4 border-b border-gray-200 space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600">ARA TOPLAM:</span>
          <span className="font-semibold">{formatMoney(sale.subtotal)} IQD</span>
        </div>
        
        {(sale.campaignDiscount && sale.campaignDiscount > 0) || sale.campaignName ? (
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 flex items-center gap-2">
                <span>KAMPANYA:</span>
                <span className="text-green-600">✓</span>
              </span>
              {sale.campaignDiscount && sale.campaignDiscount > 0 && (
                <span className="text-sm font-semibold text-orange-600">-{formatMoney(sale.campaignDiscount)} IQD</span>
              )}
            </div>
            {sale.campaignName && (
              <div className="text-xs text-gray-500 pl-2">
                ({sale.campaignName})
              </div>
            )}
          </div>
        ) : null}
        
        {sale.discount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>İNDİRİM:</span>
            <span>-{formatMoney(sale.discount)} IQD</span>
          </div>
        )}
        
        <div className="flex justify-between pt-2 border-t border-gray-300">
          <span className="text-lg font-bold">TOPLAM:</span>
          <span className="text-xl font-bold text-blue-600">{formatMoney(sale.total)} IQD</span>
        </div>
      </div>

      {/* Payment Details */}
      <div className="p-4 border-b border-gray-200">
        <div className="font-semibold mb-3 text-gray-700">ÖDEME DETAYLARI:</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {sale.paymentMethod === 'cash' || sale.paymentMethod === 'Nakit' ? (
                <Banknote className="w-5 h-5 text-green-600" />
              ) : null}
              <span className="font-medium">{getPaymentMethodName(sale.paymentMethod)}</span>
            </div>
            <span className="font-semibold">{formatMoney(sale.total)} IQD</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-200">
            <span className="font-semibold text-gray-700">ÖDENEN:</span>
            <span className="font-bold text-green-600">{formatMoney(sale.total)} IQD</span>
          </div>
        </div>
      </div>

      {/* Barcode */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-center">
          <div className="bg-white p-4 border border-gray-300 rounded">
            <svg ref={barcodeRef} className="mx-auto" />
            <div className="text-center text-xs font-mono mt-2">{sale.receiptNumber}</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 text-center bg-gray-50">
        <div className="text-sm font-semibold mb-2">
          ★★★ Bizi Tercih Ettiğiniz İçin Teşekkürler ★★★
        </div>
        <div className="text-xs text-gray-600">
          Bu fiş iade ve değişim işlemlerinde gereklidir.
        </div>
      </div>
    </div>
  );
}


