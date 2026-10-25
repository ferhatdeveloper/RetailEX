import { Banknote } from 'lucide-react';

type Props = {
  tm: (key: string) => string;
  showPurchasePricing: boolean;
  currency: string;
  purchasePrice: number;
  salePrice: number;
  autoCalculateUSD: boolean;
  minStock: number;
  maxStock: number;
  safeStock: number;
  profitMarginValue: string;
  profitMarginDisabled: boolean;
  onChange: (field: string, value: unknown) => void;
  onProfitMarginFocus: () => void;
  onProfitMarginChange: (raw: string) => void;
  onProfitMarginBlur: () => void;
};

function levelValue(value: number): number | string {
  return Number.isFinite(Number(value)) ? value : 0;
}

function onLevelChange(onChange: Props['onChange'], field: string, raw: string) {
  if (raw.trim() === '') {
    onChange(field, 0);
    return;
  }
  const n = Number(raw);
  onChange(field, Number.isFinite(n) ? n : raw);
}

const labelCls = 'text-xs font-semibold text-gray-800';
const inputCls =
  'w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500';

/**
 * Fiyat sekmesi — Temel Fiyatlandırma.
 * Sağ blok: minimum, maksimum, güvenli stok. Vergi tipi, TAX % ve tevkifat bu blokta yok.
 */
export function ProductBasicPricingPanel({
  tm,
  showPurchasePricing,
  currency,
  purchasePrice,
  salePrice,
  autoCalculateUSD,
  minStock,
  maxStock,
  safeStock,
  profitMarginValue,
  profitMarginDisabled,
  onChange,
  onProfitMarginFocus,
  onProfitMarginChange,
  onProfitMarginBlur,
}: Props) {
  return (
    <div className="bg-white border border-gray-300" data-section="product-price-basic">
      <div className="px-3 py-1.5 bg-gray-100 border-b border-gray-300">
        <span className="text-xs text-gray-700">{tm('basicPricing')}</span>
      </div>
      <div className="grid grid-cols-12 gap-px bg-gray-300 max-lg:grid-cols-1">
        <div className="col-span-3 max-lg:col-span-1 bg-gray-100 px-2 py-1.5 flex items-center">
          <label className="text-xs text-gray-700" htmlFor="product-currency">{tm('currency')}</label>
        </div>
        <div className="col-span-3 max-lg:col-span-1 bg-white px-2 py-1.5">
          <select
            id="product-currency"
            value={currency || 'IQD'}
            onChange={(e) => onChange('currency', e.target.value)}
            className="w-full px-2 py-1 border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="IQD">IQD - {tm('iraqiDinar')}</option>
            <option value="USD">USD - {tm('usDollar')}</option>
            <option value="EUR">EUR - {tm('euro')}</option>
            <option value="GBP">GBP - {tm('britishPound')}</option>
          </select>
        </div>
        <div className="col-span-3 max-lg:col-span-1 bg-gray-100 px-2 py-1.5 flex items-center">
          <label className={labelCls} htmlFor="product-min-stock">{tm('productMinStockLevel')}</label>
        </div>
        <div className="col-span-3 max-lg:col-span-1 bg-white px-2 py-1.5">
          <input
            id="product-min-stock"
            type="number"
            min={0}
            step="0.01"
            value={levelValue(minStock)}
            onChange={(e) => onLevelChange(onChange, 'minStock', e.target.value)}
            className={inputCls}
          />
        </div>

        {showPurchasePricing ? (
          <>
            <div className="col-span-3 max-lg:col-span-1 bg-gray-100 px-2 py-1.5 flex items-center">
              <label className="text-xs text-gray-700 font-bold" htmlFor="product-purchase-price">{tm('purchasePrice')}</label>
            </div>
            <div className="col-span-3 max-lg:col-span-1 bg-white px-2 py-1.5 relative">
              <input
                id="product-purchase-price"
                type="number"
                step="0.01"
                value={purchasePrice || 0}
                onChange={(e) => onChange('purchasePrice', Number(e.target.value))}
                readOnly={autoCalculateUSD}
                className={`w-full px-2 py-1 border border-gray-300 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500 ${autoCalculateUSD ? 'bg-blue-50 cursor-not-allowed text-blue-700' : ''}`}
              />
              {autoCalculateUSD && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 font-bold flex items-center gap-1 bg-blue-50/50 px-1 rounded">
                  <Banknote className="w-2.5 h-2.5" /> {tm('auto')}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="col-span-6 max-lg:hidden bg-white" aria-hidden />
        )}
        <div className="col-span-3 max-lg:col-span-1 bg-gray-100 px-2 py-1.5 flex items-center">
          <label className={labelCls} htmlFor="product-max-stock">{tm('productMaxStockLevel')}</label>
        </div>
        <div className="col-span-3 max-lg:col-span-1 bg-white px-2 py-1.5">
          <input
            id="product-max-stock"
            type="number"
            min={0}
            step="0.01"
            value={levelValue(maxStock)}
            onChange={(e) => onLevelChange(onChange, 'maxStock', e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="col-span-3 max-lg:col-span-1 bg-gray-100 px-2 py-1.5 flex items-center">
          <label className="text-xs text-gray-700 font-bold" htmlFor="product-sale-price">{tm('salePrice')}</label>
        </div>
        <div className="col-span-3 max-lg:col-span-1 bg-green-50 px-2 py-1.5 relative">
          <input
            id="product-sale-price"
            type="number"
            step="0.01"
            value={salePrice || 0}
            onChange={(e) => onChange('salePrice', Number(e.target.value))}
            readOnly={autoCalculateUSD}
            className={`w-full px-2 py-1 border border-green-300 text-xs text-right bg-green-50 font-bold focus:outline-none focus:ring-1 focus:ring-green-500 ${autoCalculateUSD ? 'text-blue-700' : ''}`}
          />
          {autoCalculateUSD && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] text-blue-500 font-bold flex items-center gap-1 bg-blue-50/50 px-1 rounded border border-blue-200">
              <Banknote className="w-2.5 h-2.5" /> {tm('auto')}
            </span>
          )}
        </div>
        <div className="col-span-3 max-lg:col-span-1 bg-gray-100 px-2 py-1.5 flex items-center">
          <label className={labelCls} htmlFor="product-safe-stock">{tm('productSafeStockLevel')}</label>
        </div>
        <div className="col-span-3 max-lg:col-span-1 bg-white px-2 py-1.5">
          <input
            id="product-safe-stock"
            type="number"
            min={0}
            step="0.01"
            value={levelValue(safeStock)}
            onChange={(e) => onLevelChange(onChange, 'safeStock', e.target.value)}
            className={inputCls}
          />
        </div>

        {showPurchasePricing ? (
          <>
            <div className="col-span-3 max-lg:col-span-1 bg-gray-100 px-2 py-1.5 flex items-center">
              <label className="text-xs text-gray-700" htmlFor="product-profit-margin">{tm('profitMargin')}</label>
            </div>
            <div className="col-span-3 max-lg:col-span-1 bg-white px-2 py-1.5">
              <input
                id="product-profit-margin"
                type="number"
                step="0.01"
                disabled={profitMarginDisabled}
                value={profitMarginValue}
                onFocus={onProfitMarginFocus}
                onChange={(e) => onProfitMarginChange(e.target.value)}
                onBlur={onProfitMarginBlur}
                className="w-full px-2 py-1 border border-gray-300 text-xs text-right bg-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              />
            </div>
            <div className="col-span-6 max-lg:col-span-1 bg-gray-50 flex items-center px-4">
              <span className="text-[10px] text-gray-500">{tm('productStockLevelHint')}</span>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
