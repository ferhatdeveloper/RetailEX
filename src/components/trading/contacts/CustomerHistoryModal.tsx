import React, { useEffect, useMemo, useState } from 'react';
import {
  X, FileText, Package, TrendingUp, AlertTriangle,
  CheckSquare, Square, RefreshCw, Calendar, ShoppingCart,
} from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  invoicesAPI,
  CustomerRecentInvoice,
  CustomerPurchaseProduct,
} from '../../../services/api/invoices';
import { formatNumber } from '../../../utils/formatNumber';

export interface CustomerHistoryAddItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

interface CustomerHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  onAddItems: (items: CustomerHistoryAddItem[]) => void;
  onRepeatInvoice?: (invoiceId: string) => void;
}

type TabKey = 'invoices' | 'products' | 'forecast';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

function TabButton({ active, onClick, icon: Icon, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-700'
          : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

function FicheTypeBadge({ type, label }: { type: string | null; label: string }) {
  const t = (type || '').toLowerCase();
  let cls = 'bg-slate-100 text-slate-600 border-slate-200';
  if (t.includes('purchase')) cls = 'bg-amber-100 text-amber-700 border-amber-200';
  else if (t.includes('return')) cls = 'bg-rose-100 text-rose-700 border-rose-200';
  else if (t.includes('sale')) cls = 'bg-emerald-100 text-emerald-700 border-emerald-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>
      {label}
    </span>
  );
}

export function CustomerHistoryModal({
  isOpen,
  onClose,
  customerId,
  customerName,
  onAddItems,
  onRepeatInvoice,
}: CustomerHistoryModalProps) {
  const { tm } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>('invoices');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<CustomerRecentInvoice[]>([]);
  const [products, setProducts] = useState<CustomerPurchaseProduct[]>([]);
  const [forecast, setForecast] = useState<CustomerPurchaseProduct[]>([]);

  const [selectedProductKeys, setSelectedProductKeys] = useState<Set<string>>(new Set());
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedProductKeys(new Set());
    setSelectedInvoiceId(null);
    setActiveTab('invoices');
    setError(null);
    setLoading(true);
    invoicesAPI
      .getCustomerPurchaseFullHistory(customerId)
      .then((res) => {
        setInvoices(res.invoices || []);
        setProducts(res.products || []);
        setForecast(res.forecast || []);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setInvoices([]);
        setProducts([]);
        setForecast([]);
      })
      .finally(() => setLoading(false));
  }, [isOpen, customerId]);

  const productKey = (p: CustomerPurchaseProduct) =>
    p.productId || p.productCode || p.productName;

  const toggleProduct = (key: string) => {
    setSelectedProductKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllProducts = (list: CustomerPurchaseProduct[]) => {
    const keys = list.map(productKey);
    setSelectedProductKeys((prev) => {
      const allSelected = keys.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const handleAddSelectedProducts = (list: CustomerPurchaseProduct[]) => {
    const selected = list.filter((p) => selectedProductKeys.has(productKey(p)));
    if (selected.length === 0) return;
    const items: CustomerHistoryAddItem[] = selected.map((p) => ({
      productId: p.productId,
      productCode: p.productCode,
      productName: p.productName,
      unit: p.unit,
      quantity: Math.max(1, p.recommendedQty || 1),
      unitPrice: p.totalSpent > 0 && p.totalQuantity > 0
        ? Number((p.totalSpent / p.totalQuantity).toFixed(2))
        : 0,
    }));
    onAddItems(items);
    onClose();
  };

  const handleRepeatSelectedInvoice = () => {
    if (!selectedInvoiceId || !onRepeatInvoice) return;
    onRepeatInvoice(selectedInvoiceId);
    onClose();
  };

  const renderEmptyState = (message: string) => (
    <div className="flex flex-col items-center justify-center h-48 text-slate-400">
      <Package className="h-10 w-10 mb-2 opacity-50" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );

  const renderErrorState = () => (
    <div className="flex flex-col items-center justify-center h-48 text-rose-500">
      <AlertTriangle className="h-10 w-10 mb-2" />
      <p className="text-sm font-bold">{error}</p>
    </div>
  );

  const invoiceRows = useMemo(() => invoices, [invoices]);
  const productRows = useMemo(() => products, [products]);
  const forecastRows = useMemo(() => forecast, [forecast]);

  const allProductsSelected =
    productRows.length > 0 && productRows.every((p) => selectedProductKeys.has(productKey(p)));
  const allForecastSelected =
    forecastRows.length > 0 && forecastRows.every((p) => selectedProductKeys.has(productKey(p)));

  const productTable = (
    list: CustomerPurchaseProduct[],
    allSelected: boolean,
    onToggleAll: () => void,
    isForecast: boolean
  ) => (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase sticky top-0 z-10 shadow-sm border-b border-slate-200">
          <tr>
            <th className="py-3 px-4 w-10 text-center bg-slate-50">
              <button
                onClick={onToggleAll}
                className="flex items-center justify-center text-slate-500 hover:text-blue-600 focus:outline-none"
                aria-label="select-all"
              >
                {allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
              </button>
            </th>
            <th className="py-3 px-4 bg-slate-50">{tm('rprColProduct')}</th>
            <th className="py-3 px-4 w-32 bg-slate-50">{tm('colDate')}</th>
            {isForecast && (
              <th className="py-3 px-4 w-28 text-center bg-slate-50">
                {tm('historyRecommended')}
              </th>
            )}
            <th className="py-3 px-4 w-24 text-right bg-slate-50">{tm('rprColQuantity')}</th>
            <th className="py-3 px-4 w-32 text-right bg-slate-50">{tm('rprColInvoiceTotal')}</th>
            <th className="py-3 px-4 w-32 text-right bg-slate-50">{tm('historyAvgPerDay')}</th>
            <th className="py-3 px-4 w-28 text-right bg-slate-50">{tm('historyDaysSinceLast')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs bg-white">
          {list.map((p) => {
            const key = productKey(p);
            const selected = selectedProductKeys.has(key);
            const isOverdue =
              p.averageIntervalDays != null &&
              p.daysSinceLastPurchase >= p.averageIntervalDays;
            return (
              <tr
                key={key}
                className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${selected ? 'bg-blue-50/60' : ''}`}
                onClick={() => toggleProduct(key)}
              >
                <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => toggleProduct(key)}
                    className="flex items-center justify-center focus:outline-none"
                    aria-label="select-row"
                  >
                    {selected ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                    )}
                  </button>
                </td>
                <td className="py-3 px-4 font-medium text-slate-800">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="font-bold">{p.productName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{p.productCode}</div>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-slate-600 font-mono">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    {p.lastPurchaseDate}
                  </div>
                </td>
                {isForecast && (
                  <td className="py-3 px-4 text-center">
                    {p.recommendedQty > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <TrendingUp className="w-3 h-3" />
                        {formatNumber(p.recommendedQty, 0, false)} {p.unit}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                )}
                <td className="py-3 px-4 text-right text-slate-600 font-bold">
                  {formatNumber(p.totalQuantity, 2, false)} <span className="text-[10px] font-normal text-slate-400 ml-0.5">{p.unit}</span>
                </td>
                <td className="py-3 px-4 text-right font-bold text-blue-600 font-mono">
                  {formatNumber(p.totalSpent, 2, false)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-slate-700">
                  {formatNumber(p.averageDailyConsumption, 2, false)}
                </td>
                <td className="py-3 px-4 text-right font-mono">
                  <div className="flex items-center justify-end gap-1">
                    {isOverdue && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200"
                        title={tm('historyMayBeOut')}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {formatNumber(p.daysSinceLastPurchase, 0, false)}
                      </span>
                    )}
                    {!isOverdue && (
                      <span className="text-slate-600">{formatNumber(p.daysSinceLastPurchase, 0, false)}</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('customerHistoryTitle')}>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide">
                {tm('customerHistoryTitle')}
              </h3>
              <div className="text-xs text-blue-100 opacity-90 mt-0.5">{customerName}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            aria-label="close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200 px-6 pt-2 shrink-0">
        <TabButton active={activeTab === 'invoices'} onClick={() => setActiveTab('invoices')} icon={FileText}>
          {tm('historyTabInvoices')}
        </TabButton>
        <TabButton active={activeTab === 'products'} onClick={() => setActiveTab('products')} icon={Package}>
          {tm('historyTabProducts')}
        </TabButton>
        <TabButton active={activeTab === 'forecast'} onClick={() => setActiveTab('forecast')} icon={TrendingUp}>
          {tm('historyTabForecast')}
        </TabButton>
      </div>

      <PercentBodyModalScrollBody className="bg-slate-50/50 p-6">
        {loading && (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
        )}
        {!loading && error && renderErrorState()}
        {!loading && !error && activeTab === 'invoices' && (
          invoiceRows.length === 0 ? (
            renderEmptyState(tm('historyNoData'))
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase sticky top-0 z-10 shadow-sm border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 bg-slate-50">{tm('colDate')}</th>
                    <th className="py-3 px-4 bg-slate-50">{tm('rprColInvoiceNo')}</th>
                    <th className="py-3 px-4 text-center w-28 bg-slate-50">{tm('colStatus')}</th>
                    <th className="py-3 px-4 text-right w-24 bg-slate-50">{tm('rprColQuantity')}</th>
                    <th className="py-3 px-4 text-right w-36 bg-slate-50">{tm('rprColInvoiceTotal')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs bg-white">
                  {invoiceRows.map((inv) => {
                    const isSelected = selectedInvoiceId === inv.id;
                    const type = inv.ficheType || '';
                    const label = type.includes('purchase')
                      ? tm('ficheTypeBadgePurchase')
                      : type.includes('return')
                        ? tm('ficheTypeBadgeReturn')
                        : tm('ficheTypeBadgeSale');
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => setSelectedInvoiceId(isSelected ? null : inv.id)}
                        className={`hover:bg-blue-50/50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/60' : ''}`}
                      >
                        <td className="py-3 px-4 text-slate-600 font-mono">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {inv.date}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-700">
                          {inv.invoiceNo || '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <FicheTypeBadge type={inv.ficheType} label={label} />
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600 font-bold">
                          {formatNumber(inv.itemCount, 0, false)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-blue-600 font-mono">
                          {formatNumber(inv.totalNet, 2, false)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
        {!loading && !error && activeTab === 'products' && (
          productRows.length === 0 ? renderEmptyState(tm('historyNoData')) : productTable(productRows, allProductsSelected, () => toggleSelectAllProducts(productRows), false)
        )}
        {!loading && !error && activeTab === 'forecast' && (
          forecastRows.length === 0 ? renderEmptyState(tm('historyNoData')) : productTable(forecastRows, allForecastSelected, () => toggleSelectAllProducts(forecastRows), true)
        )}
      </PercentBodyModalScrollBody>

      <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
        {activeTab === 'invoices' && (
          <>
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98] py-3 transition-all"
            >
              {tm('cancel')}
            </button>
            <button
              onClick={handleRepeatSelectedInvoice}
              disabled={!selectedInvoiceId || !onRepeatInvoice}
              className="flex-1 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] py-3 transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              {tm('historyRepeatInvoice')}
            </button>
          </>
        )}
        {(activeTab === 'products' || activeTab === 'forecast') && (
          <>
            <button
              onClick={onClose}
              className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98] py-3 transition-all"
            >
              {tm('cancel')}
            </button>
            <button
              onClick={() =>
                handleAddSelectedProducts(activeTab === 'products' ? productRows : forecastRows)
              }
              disabled={selectedProductKeys.size === 0}
              className="flex-1 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] py-3 transition-all flex items-center justify-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" />
              {tm('historyAddToInvoice')} ({selectedProductKeys.size})
            </button>
          </>
        )}
      </div>
    </PercentBodyModal>
  );
}
