import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Calendar, History, Percent, Loader2, X } from 'lucide-react';
import { invoicesAPI } from '../../../services/api/invoices';
import { formatNumber } from '../../../utils/formatNumber';

interface PurchaseInvoiceLine {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  expiryDate?: string;
  lastPurchasePrice?: number;
  profitMarginPercent?: number;
}

interface PurchaseInvoiceLineEnhancedProps {
  line: PurchaseInvoiceLine;
  index: number;
  onChange: (index: number, field: string, value: any) => void;
  onShowHistory?: (productCode: string, productName: string, productId: string) => void;
}

export function PurchaseInvoiceLineEnhanced({
  line,
  index,
  onChange,
  onShowHistory
}: PurchaseInvoiceLineEnhancedProps) {
  const [showExpiryInput, setShowExpiryInput] = useState(false);

  // Fiyat farkı hesaplama
  const priceDifference = line.lastPurchasePrice
    ? line.unitPrice - line.lastPurchasePrice
    : 0;

  const priceDifferencePercent = line.lastPurchasePrice && line.lastPurchasePrice > 0
    ? ((priceDifference / line.lastPurchasePrice) * 100)
    : 0;

  // Renk belirleme (fiyat artışı/azalışı)
  const getPriceChangeColor = () => {
    if (priceDifference > 0) return 'text-red-600 bg-red-50';
    if (priceDifference < 0) return 'text-green-600 bg-green-50';
    return 'text-gray-600 bg-gray-50';
  };

  const getPriceChangeIcon = () => {
    if (priceDifference > 0) return <TrendingUp className="w-3 h-3" />;
    if (priceDifference < 0) return <TrendingDown className="w-3 h-3" />;
    return null;
  };

  // Son kullanma tarihi kontrolü
  const isExpiringSoon = () => {
    if (!line.expiryDate) return false;
    const expiryDate = new Date(line.expiryDate);
    const today = new Date();
    const daysDiff = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
    return daysDiff <= 30 && daysDiff > 0;
  };

  const isExpired = () => {
    if (!line.expiryDate) return false;
    return new Date(line.expiryDate) < new Date();
  };

  return (
    <tr className="border-t hover:bg-gray-50 group">
      {/* Ürün Kodu */}
      <td className="p-2">
        <input
          type="text"
          value={line.productCode}
          onChange={(e) => onChange(index, 'productCode', e.target.value)}
          className="w-full px-2 py-1 border rounded text-sm"
          placeholder="Kod"
        />
        {/* Geçmiş hareketler butonu */}
        {line.id && onShowHistory && (
          <button
            type="button"
            onClick={() => onShowHistory(line.productCode, line.productName, line.id)}
            className="mt-1 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <History className="w-3 h-3" />
            Geçmiş
          </button>
        )}
      </td>

      {/* Ürün Adı */}
      <td className="p-2">
        <input
          type="text"
          value={line.productName}
          onChange={(e) => onChange(index, 'productName', e.target.value)}
          className="w-full px-2 py-1 border rounded text-sm"
          placeholder="Ürün adı"
        />
      </td>

      {/* Miktar */}
      <td className="p-2">
        <input
          type="number"
          value={line.quantity || ''}
          onChange={(e) => onChange(index, 'quantity', parseFloat(e.target.value) || 0)}
          className="w-full px-2 py-1 border rounded text-right text-sm"
          step="0.001"
        />
      </td>

      {/* Birim Fiyat + Fiyat Farkı */}
      <td className="p-2">
        <div className="space-y-1">
          <input
            type="number"
            value={line.unitPrice || ''}
            onChange={(e) => onChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
            className="w-full px-2 py-1 border rounded text-right text-sm"
            step="0.01"
          />

          {/* Fiyat farkı göstergesi */}
          {line.lastPurchasePrice && line.lastPurchasePrice > 0 && (
            <div className={`text-xs px-2 py-0.5 rounded flex items-center justify-between gap-1 ${getPriceChangeColor()}`}>
              <div className="flex items-center gap-1">
                {getPriceChangeIcon()}
                <span>{priceDifference > 0 ? '+' : ''}{formatNumber(priceDifference, 2, false)}</span>
              </div>
              <span className="font-medium">
                {priceDifference > 0 ? '+' : ''}{priceDifferencePercent.toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </td>

      {/* İndirim % */}
      <td className="p-2">
        <input
          type="number"
          value={line.discount || ''}
          onChange={(e) => onChange(index, 'discount', parseFloat(e.target.value) || 0)}
          className="w-full px-2 py-1 border rounded text-right text-sm"
          max="100"
          step="0.1"
        />
      </td>

      {/* Kar Marjı % (Satış fiyatı için) */}
      <td className="p-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={line.profitMarginPercent || ''}
            onChange={(e) => onChange(index, 'profitMarginPercent', parseFloat(e.target.value) || 0)}
            className="w-full px-2 py-1 border rounded text-right text-sm bg-blue-50"
            placeholder="0"
            step="0.1"
          />
          <Percent className="w-3 h-3 text-blue-600" />
        </div>
        {line.profitMarginPercent && line.profitMarginPercent > 0 && line.unitPrice > 0 && (
          <div className="text-xs text-blue-600 mt-1 text-right">
            Sat: {formatNumber(line.unitPrice * (1 + line.profitMarginPercent / 100), 2, false)}
          </div>
        )}
      </td>

      {/* Son Kullanma Tarihi */}
      <td className="p-2">
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={line.expiryDate || ''}
            onChange={(e) => onChange(index, 'expiryDate', e.target.value)}
            className={`w-full px-2 py-1 border rounded text-sm ${isExpired()
                ? 'border-red-500 bg-red-50'
                : isExpiringSoon()
                  ? 'border-yellow-500 bg-yellow-50'
                  : ''
              }`}
          />
          <Calendar className={`w-3 h-3 ${isExpired()
              ? 'text-red-600'
              : isExpiringSoon()
                ? 'text-yellow-600'
                : 'text-gray-400'
            }`} />
        </div>
        {isExpired() && (
          <div className="text-xs text-red-600 mt-1">Süresi dolmuş!</div>
        )}
        {!isExpired() && isExpiringSoon() && (
          <div className="text-xs text-yellow-600 mt-1">30 gün içinde!</div>
        )}
      </td>

      {/* Toplam */}
      <td className="p-2 text-right font-medium text-sm">
        {formatNumber(line.total, 2, false)}
      </td>
    </tr>
  );
}

// Geçmiş hareketler modal component
interface ProductHistoryModalProps {
  productCode: string;
  productName: string;
  productId: string;
  onClose: () => void;
}

export function ProductHistoryModal({ productCode, productName, productId, onClose }: ProductHistoryModalProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const data = await invoicesAPI.getProductHistory(productId);
        setHistory(data);
      } catch (error) {
        console.error('Failed to fetch product history:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (productId) {
      fetchHistory();
    }
  }, [productId]);

  // Statistics calculation
  const totalQuantity = history.reduce((sum, item) => sum + item.quantity, 0);
  const averagePrice = history.length > 0
    ? history.reduce((sum, item) => sum + item.unitPrice, 0) / history.length
    : 0;
  const lastPrice = history.length > 0 ? history[0].unitPrice : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg text-white font-medium flex items-center gap-2">
                <History className="w-5 h-5" />
                Ürün Geçmiş Hareketleri
              </h3>
              <p className="text-sm text-blue-100 mt-1">
                {productCode} - {productName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/10 p-2 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 bg-gray-50">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded border">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
              <p className="text-gray-500 text-sm">Hareketler yükleniyor...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded border">
              <History className="w-12 h-12 text-gray-300 mb-2" />
              <p className="text-gray-500 text-sm">Geçmiş hareket bulunamadı.</p>
            </div>
          ) : (
            <div className="bg-white rounded border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Tarih</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Belge No</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Tedarikçi/Müşteri</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Miktar</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Birim Fiyat</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Toplam</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((item, idx) => (
                    <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(item.date).toLocaleDateString('tr-TR')}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs">
                          {item.documentNo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 truncate max-w-[200px]" title={item.supplier}>
                        {item.supplier}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-800">
                        {formatNumber(item.quantity, 0, false)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-800">
                        {formatNumber(item.unitPrice, 2, false)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 text-base">
                        {formatNumber(item.total, 2, false)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* İstatistikler */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="bg-white border border-blue-100 rounded-xl p-5 shadow-sm">
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Ortalama Alış Fiyatı</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatNumber(averagePrice, 2, false)} <span className="text-sm font-normal text-gray-500">IQD</span>
              </div>
            </div>
            <div className="bg-white border border-green-100 rounded-xl p-5 shadow-sm">
              <div className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Son Alış Fiyatı</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatNumber(lastPrice, 2, false)} <span className="text-sm font-normal text-gray-500">IQD</span>
              </div>
            </div>
            <div className="bg-white border border-purple-100 rounded-xl p-5 shadow-sm">
              <div className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-2">Toplam Miktar</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatNumber(totalQuantity, 0, false)} <span className="text-sm font-normal text-gray-500">Birim</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end rounded-b-lg">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

