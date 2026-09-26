import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Calendar, Package, TrendingUp, Plus, AlertTriangle,
  CheckSquare, Square, Flame, Banknote, Clock, LayoutGrid, RefreshCw,
} from 'lucide-react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatNumber } from '../../../utils/formatNumber';
import { invoicesAPI, type SupplierHistoryLine } from '../../../services/api/invoices';

interface SupplierHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Tedarikçi UUID — zorunlu; yoksa veya geçersizse liste boş kalır */
  supplierId: string;
  supplierName: string;
  onAddItems: (items: SupplierHistoryLine[]) => void;
}

type FilterType = 'all' | 'most_purchased' | 'high_value' | 'recent' | 'low_stock';

const FILTER_DEFS: Array<{
  type: FilterType;
  i18nKey: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}> = [
  { type: 'all', i18nKey: 'supplierHistoryFilterAll', icon: LayoutGrid, colorClass: 'blue' },
  { type: 'most_purchased', i18nKey: 'supplierHistoryFilterMost', icon: Flame, colorClass: 'orange' },
  { type: 'high_value', i18nKey: 'supplierHistoryFilterHighValue', icon: Banknote, colorClass: 'purple' },
  { type: 'recent', i18nKey: 'supplierHistoryFilterRecent', icon: Clock, colorClass: 'green' },
  { type: 'low_stock', i18nKey: 'supplierHistoryFilterLowStock', icon: AlertTriangle, colorClass: 'red' },
];

function formatDisplayDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

export function SupplierHistoryModal({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  onAddItems,
}: SupplierHistoryModalProps) {
  const { tm } = useLanguage();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [historyItems, setHistoryItems] = useState<SupplierHistoryLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedItems([]);
    setActiveFilter('all');
    setError(null);
    setHistoryItems([]);

    const sid = String(supplierId || '').trim();
    if (!sid) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    invoicesAPI
      .getSupplierPurchaseHistory(sid)
      .then((rows) => {
        if (!cancelled) setHistoryItems(rows || []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setHistoryItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, supplierId]);

  const filteredItems = useMemo(() => {
    const items = [...historyItems];
    const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

    switch (activeFilter) {
      case 'most_purchased':
        return items.sort((a, b) => b.quantity - a.quantity);
      case 'high_value':
        return items.sort((a, b) => b.total - a.total);
      case 'low_stock':
        return items.filter((item) => item.stockStatus === 'low');
      case 'recent':
        return items.filter((item) => {
          const t = item.date ? new Date(item.date).getTime() : 0;
          return t >= recentCutoff;
        });
      default:
        return items;
    }
  }, [historyItems, activeFilter]);

  if (!isOpen) return null;

  const toggleSelection = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === filteredItems.length && filteredItems.length > 0) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems.map((i) => i.id));
    }
  };

  const handleAddSelected = () => {
    const itemsToAdd = historyItems.filter((item) => selectedItems.includes(item.id));
    if (itemsToAdd.length === 0) return;
    onAddItems(itemsToAdd);
    onClose();
    setSelectedItems([]);
  };

  const FilterBadge = ({
    type,
    i18nKey,
    icon: Icon,
    colorClass,
  }: {
    type: FilterType;
    i18nKey: string;
    icon: React.ComponentType<{ className?: string }>;
    colorClass: string;
  }) => (
    <button
      type="button"
      onClick={() => setActiveFilter(type === activeFilter ? 'all' : type)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
        activeFilter === type
          ? `bg-${colorClass}-50 text-${colorClass}-700 border-${colorClass}-200 shadow-sm ring-1 ring-${colorClass}-200`
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      <Icon
        className={`w-3.5 h-3.5 ${activeFilter === type ? `text-${colorClass}-600` : 'text-gray-400'}`}
      />
      {tm(i18nKey)}
    </button>
  );

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={tm('supplierHistoryTitle')}>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide">
                {tm('supplierHistoryTitle')}
              </h3>
              <div className="text-xs text-blue-100 opacity-90 mt-0.5">
                {supplierName || tm('supplierHistoryNone')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-full transition-colors"
            aria-label="close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
        {FILTER_DEFS.map((def, idx) => (
          <React.Fragment key={def.type}>
            <FilterBadge
              type={def.type}
              i18nKey={def.i18nKey}
              icon={def.icon}
              colorClass={def.colorClass}
            />
            {(def.type === 'all' || def.type === 'recent') && idx < FILTER_DEFS.length - 1 && (
              <div className="w-px h-5 bg-slate-300 mx-1" />
            )}
          </React.Fragment>
        ))}
      </div>

      <PercentBodyModalScrollBody className="bg-slate-50/50 p-6">
        {loading && (
          <div className="flex items-center justify-center h-48 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin" />
          </div>
        )}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-48 text-rose-500">
            <AlertTriangle className="h-10 w-10 mb-2" />
            <p className="text-sm font-bold">{error}</p>
          </div>
        )}
        {!loading && !error && filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Package className="h-10 w-10 mb-2 opacity-50" />
            <p className="text-sm font-medium">{tm('historyNoData')}</p>
          </div>
        )}
        {!loading && !error && filteredItems.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold uppercase sticky top-0 z-10 shadow-sm border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-10 text-center bg-slate-50">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="flex items-center justify-center text-slate-500 hover:text-blue-600 focus:outline-none"
                      aria-label="select-all"
                    >
                      {selectedItems.length > 0 && selectedItems.length === filteredItems.length ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4 w-32 bg-slate-50">{tm('colDate')}</th>
                  <th className="py-3 px-4 bg-slate-50">{tm('rprColProduct')}</th>
                  <th className="py-3 px-4 text-right w-24 bg-slate-50">{tm('rprColQuantity')}</th>
                  <th className="py-3 px-4 text-right w-32 bg-slate-50">{tm('rprColUnitPrice')}</th>
                  <th className="py-3 px-4 text-right w-36 bg-slate-50">{tm('rprColInvoiceTotal')}</th>
                  <th className="py-3 px-4 text-center w-32 bg-slate-50">{tm('colStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs bg-white">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-blue-50/50 transition-colors cursor-pointer group ${selectedItems.includes(item.id) ? 'bg-blue-50/60' : ''}`}
                    onClick={() => toggleSelection(item.id)}
                  >
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleSelection(item.id)}
                        className="flex items-center justify-center focus:outline-none"
                        aria-label="select-row"
                      >
                        {selectedItems.includes(item.id) ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
                        )}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDisplayDate(item.date)}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                          <div>{item.product}</div>
                          {item.productCode ? (
                            <div className="text-[10px] text-slate-400 font-mono">{item.productCode}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 font-bold">
                      {formatNumber(item.quantity, 2, false)}{' '}
                      <span className="text-[10px] font-normal text-slate-400 ml-0.5">
                        {item.unit}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {formatNumber(item.price, 2, false)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-blue-600 font-mono">
                      {formatNumber(item.total, 2, false)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.stockStatus === 'low' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                          <AlertTriangle className="w-3 h-3" />
                          {tm('stockStatusLow')}
                        </span>
                      )}
                      {item.stockStatus === 'normal' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium text-slate-400 bg-slate-100">
                          {tm('stockStatusNormal')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PercentBodyModalScrollBody>

      <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider hover:bg-slate-100 active:scale-[0.98] py-3 transition-all"
        >
          {tm('cancel')}
        </button>
        <button
          type="button"
          onClick={handleAddSelected}
          disabled={selectedItems.length === 0}
          className="flex-1 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] py-3 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {tm('historyAddSelectedCount').replace('{n}', String(selectedItems.length))}
        </button>
      </div>
    </PercentBodyModal>
  );
}
