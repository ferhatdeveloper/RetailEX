import { useMemo, useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Calendar, History, Percent, Loader2, X } from 'lucide-react';
import { invoicesAPI } from '../../../services/api/invoices';
import { formatNumber } from '../../../utils/formatNumber';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { moduleTranslations, type Language } from '../../../locales/module-translations';
import {
  isPurchaseHistoryType,
} from '../../../utils/lastPurchaseCostSql';

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

function formatPriceOrEmpty(value: number | null, emptyLabel: string): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return emptyLabel;
  return formatNumber(value, 2, false);
}

export function ProductHistoryModal({ productCode, productName, productId, onClose }: ProductHistoryModalProps) {
  const { language } = useLanguage();
  const tm = (key: string) =>
    moduleTranslations[key]?.[language as Language] || moduleTranslations[key]?.tr || key;

  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        if (!productId?.trim()) {
          setHistory([]);
          return;
        }
        const data = await invoicesAPI.getProductHistory(productId.trim(), {
          code: productCode?.trim() || undefined,
        });
        if (!cancelled) setHistory(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to fetch product history:', error);
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [productId, productCode]);

  /** Alış/satış ayrı; ortalama = toplam tutar / toplam miktar (ağırlıklı). Satış alışa katılmaz. */
  const stats = useMemo(() => {
    const lineAmount = (item: any) => {
      const qty = Math.abs(Number(item.quantity) || 0);
      const total = Number(item.total);
      if (Number.isFinite(total) && Math.abs(total) > 0.0000001) return Math.abs(total);
      return (Number(item.unitPrice) || 0) * qty;
    };
    const weightedAvg = (rows: any[]) => {
      let amountSum = 0;
      let qtySum = 0;
      for (const item of rows) {
        const qty = Math.abs(Number(item.quantity) || 0);
        if (qty <= 0) continue;
        amountSum += lineAmount(item);
        qtySum += qty;
      }
      if (qtySum <= 0) return null;
      return amountSum / qtySum;
    };

    const purchases = history.filter((item) => isPurchaseHistoryType(item?.type));
    // Ortalama/son satış: yalnızca satış (iade hariç)
    const sales = history.filter((item) => String(item?.type || '') === 'sales');

    const purchaseQty = purchases.reduce(
      (sum, item) => sum + (Math.abs(Number(item.quantity)) || 0),
      0
    );
    const salesQty = sales.reduce(
      (sum, item) => sum + (Math.abs(Number(item.quantity)) || 0),
      0
    );

    return {
      avgPurchase: weightedAvg(purchases),
      lastPurchase: purchases.length > 0 ? Number(purchases[0].unitPrice) || null : null,
      purchaseQty,
      avgSale: weightedAvg(sales),
      lastSale: sales.length > 0 ? Number(sales[0].unitPrice) || null : null,
      salesQty,
    };
  }, [history]);

  const typeLabel = (type: string) => {
    switch (type) {
      case 'purchase':
        return tm('prodHistTypePurchase');
      case 'purchase_return':
        return tm('prodHistTypePurchaseReturn');
      case 'sales_return':
        return tm('prodHistTypeSalesReturn');
      default:
        return tm('prodHistTypeSales');
    }
  };

  const typeBadgeClass = (type: string) => {
    switch (type) {
      case 'purchase':
        return 'bg-blue-50 text-blue-700';
      case 'purchase_return':
        return 'bg-amber-50 text-amber-700';
      case 'sales_return':
        return 'bg-orange-50 text-orange-700';
      default:
        return 'bg-emerald-50 text-emerald-700';
    }
  };

  const isPurchaseSide = (type: string) =>
    type === 'purchase' || type === 'purchase_return';

  const empty = tm('prodHistNoValue');

  const summaryMetric = (
    label: string,
    value: number | null,
    opts?: { isQty?: boolean }
  ) => (
    <div className="rounded-lg bg-white/80 border border-black/5 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </div>
      <div className="text-xl font-bold text-gray-900 tabular-nums">
        {opts?.isQty ? (
          <>
            {formatNumber(value ?? 0, 0, false)}{' '}
            <span className="text-sm font-normal text-gray-500">{tm('prodHistUnit')}</span>
          </>
        ) : (
          <>
            {formatPriceOrEmpty(value, empty)}
            {value != null && value > 0 && (
              <span className="text-sm font-normal text-gray-500"> IQD</span>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('prodHistTitle')}>
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-600 to-blue-700 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg text-white font-medium flex items-center gap-2">
              <History className="w-5 h-5" />
              {tm('prodHistTitle')}
            </h3>
            <p className="text-sm text-blue-100 mt-1">
              {productCode} - {productName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:bg-white/10 p-2 rounded transition-colors"
            aria-label={tm('close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <PercentBodyModalScrollBody className="p-6 bg-gray-50">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded border">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
            <p className="text-gray-500 text-sm">{tm('prodHistLoading')}</p>
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded border">
            <History className="w-12 h-12 text-gray-300 mb-2" />
            <p className="text-gray-500 text-sm">{tm('prodHistEmpty')}</p>
          </div>
        ) : (
          <div className="bg-white rounded border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{tm('prodHistDate')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{tm('prodHistDocNo')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{tm('prodHistType')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{tm('prodHistSupplier')}</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">{tm('prodHistCustomer')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">{tm('prodHistQty')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">{tm('prodHistUnitPrice')}</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">{tm('prodHistTotal')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((item, idx) => {
                  const t = String(item.type || 'sales');
                  const purchaseSide = isPurchaseSide(t);
                  const partner = String(item.supplier || '').trim();
                  return (
                    <tr
                      key={idx}
                      className={`transition-colors ${
                        purchaseSide ? 'hover:bg-blue-50/50' : 'hover:bg-emerald-50/50'
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-600">
                        {item.date ? new Date(item.date).toLocaleDateString('tr-TR') : empty}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-mono px-2 py-0.5 rounded text-xs ${
                            purchaseSide
                              ? 'text-blue-600 bg-blue-50'
                              : 'text-emerald-700 bg-emerald-50'
                          }`}
                        >
                          {item.documentNo || empty}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${typeBadgeClass(t)}`}>
                          {typeLabel(t)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 truncate max-w-[140px]" title={purchaseSide ? partner : undefined}>
                        {purchaseSide ? partner || empty : empty}
                      </td>
                      <td className="px-4 py-3 text-gray-700 truncate max-w-[140px]" title={!purchaseSide ? partner : undefined}>
                        {!purchaseSide ? partner || empty : empty}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Sol: alış özeti | Sağ: satış özeti — bağımsız */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
            <h4 className="text-sm font-bold text-blue-800 uppercase tracking-wide mb-3">
              {tm('prodHistSectionPurchase')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {summaryMetric(tm('prodHistAvgPurchase'), stats.avgPurchase)}
              {summaryMetric(tm('prodHistLastPurchase'), stats.lastPurchase)}
              {summaryMetric(tm('prodHistPurchaseQty'), stats.purchaseQty, { isQty: true })}
            </div>
          </section>
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
            <h4 className="text-sm font-bold text-emerald-800 uppercase tracking-wide mb-3">
              {tm('prodHistSectionSales')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {summaryMetric(tm('prodHistAvgSale'), stats.avgSale)}
              {summaryMetric(tm('prodHistLastSale'), stats.lastSale)}
              {summaryMetric(tm('prodHistSalesQty'), stats.salesQty, { isQty: true })}
            </div>
          </section>
        </div>
      </PercentBodyModalScrollBody>

      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium"
        >
          {tm('close')}
        </button>
      </div>
    </PercentBodyModal>
  );
}

