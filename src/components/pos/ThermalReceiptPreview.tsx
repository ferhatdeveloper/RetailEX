import type { Sale } from '../../core/types';
import { useTheme } from '../../contexts/ThemeContext';
import { formatNumber } from '../../utils/formatNumber';

interface ThermalReceiptPreviewProps {
  sale: Sale;
  companyName?: string;
}

/**
 * 80mm Termal Fiş Önizleme Komponenti
 * Gerçek fiş görünümünü ekranda gösterir
 */
export function ThermalReceiptPreview({
  sale,
  companyName = 'ExRetailOS'
}: ThermalReceiptPreviewProps) {
  const { darkMode } = useTheme();

  return (
    <div className={`w-[302px] mx-auto font-mono text-xs leading-tight ${darkMode ? 'bg-white text-black' : 'bg-white text-black'} shadow-xl border-4 border-gray-300 p-4`}>
      {/* Header */}
      <div className="text-center font-bold text-sm mb-1">
        {companyName}
      </div>
      <div className="text-center text-[9px] mb-2">
        Tel: 0850 XXX XX XX
      </div>

      <div className="border-t-2 border-black my-2"></div>

      {/* Receipt Info */}
      <div className="flex justify-between mb-1">
        <span>Fiş No:</span>
        <span className="font-bold">{sale.receiptNumber}</span>
      </div>
      <div className="flex justify-between mb-1">
        <span>Tarih:</span>
        <span>{new Date(sale.date).toLocaleString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}</span>
      </div>
      <div className="flex justify-between mb-1">
        <span>Kasiyer:</span>
        <span>{sale.cashier}</span>
      </div>
      {sale.table && (
        <div className="flex justify-between mb-1 font-bold">
          <span>Masa:</span>
          <span>{sale.table}</span>
        </div>
      )}
      {sale.customerName && (
        <div className="flex justify-between mb-1">
          <span>Müşteri:</span>
          <span>{sale.customerName}</span>
        </div>
      )}

      <div className="border-t border-dashed border-black my-2"></div>

      {/* Items Header */}
      <div className="flex justify-between font-bold mb-1">
        <span className="w-[60%]">Ürün</span>
        <span className="w-[15%] text-center">Adet</span>
        <span className="w-[25%] text-right">Tutar</span>
      </div>

      {/* Items */}
      {sale.items.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        const variantInfo = item.variant
          ? [item.variant.color, item.variant.size].filter(Boolean).join(' / ')
          : '';

        return (
          <div key={index} className="mb-1">
            <div className="flex justify-between">
              <div className="w-[60%] break-words">
                {item.productName}
                {variantInfo && (
                  <div className="text-[9px] text-gray-600">{variantInfo}</div>
                )}
              </div>
              <div className="w-[15%] text-center">{item.quantity}</div>
              <div className="w-[25%] text-right">{formatNumber(itemTotal, 2, true)}</div>
            </div>
          </div>
        );
      })}

      <div className="border-t border-dashed border-black my-2"></div>

      {/* Totals */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>ARA TOPLAM:</span>
          <span>{formatNumber(sale.subtotal, 2, true)}</span>
        </div>

        {sale.campaignDiscount && sale.campaignDiscount > 0 && (
          <>
            <div className="flex justify-between">
              <span>KAMPANYA:</span>
              <span className="font-bold text-orange-600">-{formatNumber(sale.campaignDiscount, 2, true)}</span>
            </div>
            {sale.campaignName && (
              <div className="text-[9px] text-gray-600 pl-2">
                ({sale.campaignName})
              </div>
            )}
          </>
        )}

        {sale.discount > 0 && (
          <>
            <div className="flex justify-between">
              <span>İNDİRİM:</span>
              <span>-{formatNumber(sale.discount, 2, true)}</span>
            </div>
            {sale.discountReason && (
              <div className="text-[9px] text-gray-600 pl-2">
                ({sale.discountReason})
              </div>
            )}
          </>
        )}
        <div className="flex justify-between font-bold text-sm pt-1 border-t border-black">
          <span>TOPLAM:</span>
          <span>{formatNumber(sale.total, 2, true)}</span>
        </div>
      </div>

      <div className="border-t border-dashed border-black my-2"></div>

      {/* Payment Info */}
      <div className="flex justify-between py-1 border-b border-dashed border-gray-400">
        <span>Ödeme Yöntemi:</span>
        <span className="font-bold">
          {sale.paymentMethod === 'cash' ? 'Nakit' :
            sale.paymentMethod === 'card' ? 'Kredi Kartı' :
              'Cash&CreditCard'}
        </span>
      </div>
      {sale.paymentMethod === 'cash' && sale.cashAmount && (
        <>
          <div className="flex justify-between mb-1">
            <span>Nakit:</span>
            <span>{formatNumber(sale.cashAmount, 2, true)}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>Para Üstü:</span>
            <span className="font-bold">{sale.change ? formatNumber(sale.change, 2, true) : '0,00'}</span>
          </div>
        </>
      )}

      <div className="border-t-2 border-black my-2"></div>

      {/* Footer */}
      <div className="text-center text-[10px] my-2">
        Bizi Tercih Ettiğiniz İçin Teşekkür Ederiz!
      </div>

      <div className="text-center text-[10px] tracking-widest my-2">
        * {sale.receiptNumber} *
      </div>

      <div className="text-center text-[8px] mt-2 text-gray-500">
        ExRetailOS - Profesyonel Satış Yönetimi
      </div>
    </div>
  );
}
