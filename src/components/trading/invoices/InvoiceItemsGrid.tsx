import React, { useCallback, useMemo, useState } from 'react';
import { History, Trash2, Percent, Calendar, Barcode } from 'lucide-react';
import { moduleTranslations, type Language } from '../../../locales/module-translations';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useResponsive } from '../../../hooks/useResponsive';
import {
  buildUnitSelectOptions,
  withMissingUnitValue,
  type UnitMasterRow,
  type UnitSelectOption,
} from '../../../utils/unitOptions';
import { formatInvoiceLineQuantityDisplay } from '../../../utils/scaleQuantity';
import { formatWeightQuantityInput, parseInvoiceWeightQuantity } from '../../../utils/numberFormatter';
import { isWeightBasedUnit } from '../../../utils/productUnits';

function quantityInputPlaceholder(unit: string | undefined, tm: (k: string) => string): string {
  if (isWeightBasedUnit(unit)) {
    return tm('weightQuantityHint') || '2,500';
  }
  return '';
}

function quantityInputTitle(unit: string | undefined, tm: (k: string) => string): string {
  if (isWeightBasedUnit(unit)) {
    return tm('weightQuantityTitle') || 'KG: 2,500 (iki buçuk kilo)';
  }
  return '';
}

function rowAllowsWeightQuantity(item: InvoiceItem): boolean {
  return isWeightBasedUnit(item.unit) || item.type === 'scale' || Boolean((item as { isScaleProduct?: boolean }).isScaleProduct);
}

function useInvoiceQuantityField(
  updateItem: (index: number, field: keyof InvoiceItem, value: unknown) => void,
) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [draftByIndex, setDraftByIndex] = useState<Record<number, string>>({});

  const getDisplayValue = useCallback(
    (item: InvoiceItem, index: number) => {
      if (focusedIndex === index && draftByIndex[index] !== undefined) {
        return draftByIndex[index];
      }
      return formatInvoiceLineQuantityDisplay(item.quantity, item.unit);
    },
    [focusedIndex, draftByIndex],
  );

  const onFocus = useCallback((index: number, item: InvoiceItem) => {
    setFocusedIndex(index);
    setDraftByIndex((prev) => ({
      ...prev,
      [index]: formatInvoiceLineQuantityDisplay(item.quantity, item.unit),
    }));
  }, []);

  const commitQuantity = useCallback(
    (index: number, item: InvoiceItem, draft: string) => {
      const trimmed = String(draft ?? '').trim();
      if (!trimmed) {
        updateItem(index, 'quantity', 0);
        return;
      }
      if (rowAllowsWeightQuantity(item)) {
        const parsed = parseInvoiceWeightQuantity(trimmed);
        if (Number.isFinite(parsed) && parsed > 0) {
          updateItem(index, 'quantity', trimmed);
        }
        return;
      }
      const n = parseInt(trimmed.replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(n) && n > 0) {
        updateItem(index, 'quantity', n);
      }
    },
    [updateItem],
  );

  const onChange = useCallback(
    (index: number, item: InvoiceItem, raw: string) => {
      const nextDraft = rowAllowsWeightQuantity(item)
        ? formatWeightQuantityInput(raw)
        : raw.replace(/[^\d]/g, '');
      setDraftByIndex((prev) => ({ ...prev, [index]: nextDraft }));
      if (rowAllowsWeightQuantity(item)) {
        const parsed = parseInvoiceWeightQuantity(nextDraft);
        if (Number.isFinite(parsed) && parsed > 0) {
          updateItem(index, 'quantity', nextDraft);
        }
      } else {
        const n = parseInt(nextDraft, 10);
        if (Number.isFinite(n) && n > 0) {
          updateItem(index, 'quantity', n);
        } else if (!nextDraft) {
          updateItem(index, 'quantity', 0);
        }
      }
    },
    [updateItem],
  );

  const onBlur = useCallback(
    (index: number, item: InvoiceItem) => {
      const draft = draftByIndex[index];
      if (draft !== undefined) {
        commitQuantity(index, item, draft);
      }
      setFocusedIndex((cur) => (cur === index ? null : cur));
      setDraftByIndex((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    },
    [commitQuantity, draftByIndex],
  );

  return { getDisplayValue, onFocus, onChange, onBlur };
}

const formatNumber = (num: number | undefined, decimals: number = 2, thousandSeparator: boolean = true) => {
    if (num === undefined || num === null) return '0';
    return thousandSeparator
        ? num.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : num.toFixed(decimals);
};

interface InvoiceItem {
    id: string;
    type: string;
    code: string;
    description: string;
    description2: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    discountPercent: number;
    discountAmount: number;
    amount: number; // Brüt
    netAmount: number;
    expiryDate?: string;
    lastPurchasePrice?: number;
    priceDifference?: number;
    priceDifferencePercent?: number;
    profitMarginPercent?: number;
    batchNo?: string;
    productionDate?: string;
    unitCost?: number;
    totalCost?: number;
    grossProfit?: number;
    profitMargin?: number;
    cogs?: number;
    unitsetId?: string;
    multiplier?: number;
    baseQuantity?: number;
    unitPriceFC?: number;
}

interface InvoiceItemsGridProps {
    items: InvoiceItem[];
    invoiceType: any;
    itemColumnVisibility: any;
    filteredProducts: any[];
    currentRowIndex: number;
    setCurrentRowIndex: (index: number) => void;
    updateItem: (index: number, field: keyof InvoiceItem, value: any) => void;
    removeItem: (index: number) => void;
    selectProduct: (product: any, rowIndex: number) => void;
    handleProductSearchChange: (value: string, rowIndex: number) => void;
    handleProductKeyDown: (e: React.KeyboardEvent, rowIndex: number) => void;
    handleShowProductHistory: (code: string, name: string, id: string) => void;
    setSelectedRowForProduct: (index: number) => void;
    setShowProductCatalogModal: (show: boolean) => void;
    searchingRowIndex: number;
    productDropdownRef: React.RefObject<HTMLDivElement | null>;
    gridRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>;
    getProductCode: (code: string) => string;
    /** Kart birimleri (`unitAPI`); birim seti dışı satırlarda birleşik liste için */
    masterUnits?: UnitMasterRow[];
    unitSets?: any[];
    currency?: string;
    currencyRate?: number;
    /** Firma ana / yerel para (sütun etiketleri ve çeviri satırları) */
    ledgerCurrency?: string;
    /** Kod alanı odak: satır indeksi + inputta görünen metin (ürün arama state senkronu) */
    onCodeFieldFocus?: (rowIndex: number, displayCode: string) => void;
}

export const InvoiceItemsGrid = React.memo(({
    items,
    invoiceType,
    itemColumnVisibility,
    filteredProducts,
    currentRowIndex,
    setCurrentRowIndex,
    updateItem,
    removeItem,
    selectProduct,
    handleProductSearchChange,
    handleProductKeyDown,
    handleShowProductHistory,
    setSelectedRowForProduct,
    setShowProductCatalogModal,
    searchingRowIndex,
    productDropdownRef,
    gridRefs,
    getProductCode,
    masterUnits = [],
    unitSets = [],
    currency = 'IQD',
    currencyRate = 1,
    ledgerCurrency = 'IQD',
    onCodeFieldFocus
}: InvoiceItemsGridProps) => {
    const { language } = useLanguage();
    const { isMobile } = useResponsive();
    const tm = (key: string) => moduleTranslations[key]?.[language] || key;
    const qtyField = useInvoiceQuantityField(updateItem);

    const isColumnVisible = (columnId: string) => {
        return itemColumnVisibility[columnId] !== false;
    };

    const globalUnitOptions = useMemo(
        () => buildUnitSelectOptions(masterUnits, unitSets),
        [masterUnits, unitSets]
    );

    const unitSelectOptionsForItem = useCallback(
        (item: InvoiceItem): UnitSelectOption[] => {
            if (item.unitsetId) {
                const lines = unitSets.find((us: any) => us.id === item.unitsetId)?.lines || [];
                const fromSet: UnitSelectOption[] = (lines as any[]).map((line: any) => {
                    const name = String(line.name || '').trim();
                    const code = String(line.code || line.item_code || '').trim() || name;
                    return {
                        id: String(line.id || `${item.unitsetId}:${code || name}`),
                        code: code || name,
                        name,
                    };
                }).filter((o) => o.name);
                return withMissingUnitValue(fromSet, item.unit);
            }
            return withMissingUnitValue(globalUnitOptions, item.unit);
        },
        [globalUnitOptions, unitSets]
    );

    const cariTextColor = useMemo(() => {
        switch (invoiceType.category) {
            case 'Satis': return 'text-blue-600';
            case 'Alis': return 'text-teal-600';
            case 'Hizmet':
                if (invoiceType.code === 7) return 'text-blue-600';
                if (invoiceType.code === 8) return 'text-teal-600';
                return 'text-indigo-600';
            case 'Iade': return 'text-red-600';
            case 'Irsaliye': return 'text-orange-600';
            case 'Siparis': return 'text-purple-600';
            case 'Teklif': return 'text-indigo-600';
            default: return 'text-gray-600';
        }
    }, [invoiceType.category, invoiceType.code]);

    if (isMobile) {
        return (
            <div className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col min-h-0">
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 shrink-0">
                    <span className={`text-sm font-medium ${cariTextColor}`}>{tm('invoiceTypeLabel')} {invoiceType.name}</span>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain bg-gray-50/80 min-h-[100px] max-h-[min(58vh,520px)]">
                    {items.map((item, index) => (
                        <div
                            key={item.id}
                            className={`grid grid-cols-[auto_1fr] gap-2 pl-2 pr-3 py-2 border-b border-gray-100/90 items-start ${
                                currentRowIndex === index ? 'bg-blue-50/90' : 'bg-white'
                            }`}
                            onClick={() => setCurrentRowIndex(index)}
                        >
                            <div
                                className="flex flex-col items-center gap-1 pt-0.5 shrink-0"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeItem(index);
                                    }}
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg touch-manipulation"
                                    aria-label={tm('delete')}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                {invoiceType.category === 'Alis' && item.code && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleShowProductHistory(getProductCode(item.code), item.description, item.code)
                                        }
                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg touch-manipulation"
                                        title={tm('itemHistoryTooltip')}
                                    >
                                        <History className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <div className="min-w-0 flex flex-col gap-1.5">
                                {isColumnVisible('type') && (
                                    <select
                                        value={item.type}
                                        onChange={(e) => updateItem(index, 'type', e.target.value)}
                                        onFocus={() => setCurrentRowIndex(index)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full max-w-[12rem] text-[11px] font-medium border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-800"
                                    >
                                        <option value="Malzeme">{tm('itemTypeMaterial')}</option>
                                        <option value="Hizmet">{tm('itemTypeService')}</option>
                                        <option value="Promosyon">{tm('itemTypePromotion')}</option>
                                        <option value="İndirim">{tm('itemTypeDiscount')}</option>
                                    </select>
                                )}
                                <div className="flex items-start justify-between gap-2 min-w-0">
                                    <input
                                        type="text"
                                        value={item.description}
                                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                                        onFocus={() => setCurrentRowIndex(index)}
                                        onDoubleClick={() => {
                                            setSelectedRowForProduct(index);
                                            setShowProductCatalogModal(true);
                                        }}
                                        className="flex-1 min-w-0 border-0 bg-transparent font-semibold text-[13px] text-gray-900 leading-snug py-0.5 focus:ring-0 focus:outline-none placeholder:text-gray-400"
                                        placeholder={tm('itemDescription')}
                                    />
                                    <div className="shrink-0 text-right">
                                        <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wide leading-tight">
                                            {tm('itemNetTotal')}
                                        </div>
                                        <div className="text-[12px] font-bold tabular-nums text-blue-700 leading-tight">
                                            {formatNumber(item.netAmount, 2, true)}
                                        </div>
                                        {currency !== ledgerCurrency && item.netAmount > 0 && (
                                            <div className="text-[10px] text-blue-500/90 font-medium tabular-nums leading-tight mt-0.5">
                                                {formatNumber(item.netAmount * (currencyRate || 1), 2, true)} {ledgerCurrency}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="relative">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Barcode className="w-3.5 h-3.5 shrink-0 text-gray-400" aria-hidden />
                                        <input
                                            ref={(el) => {
                                                gridRefs.current[`code-${index}`] = el;
                                            }}
                                            type="text"
                                            value={getProductCode(item.code)}
                                            onChange={(e) => handleProductSearchChange(e.target.value, index)}
                                            onKeyDown={(e) => handleProductKeyDown(e, index)}
                                            onFocus={() => {
                                                setCurrentRowIndex(index);
                                                onCodeFieldFocus?.(index, getProductCode(items[index]?.code || ''));
                                            }}
                                            className="min-w-0 flex-1 border-0 bg-transparent text-[11px] font-mono text-gray-600 tracking-tight py-0.5 focus:ring-0 focus:outline-none placeholder:text-gray-400"
                                            placeholder={tm('itemCode')}
                                        />
                                    </div>
                                    {searchingRowIndex === index && filteredProducts.length > 0 && (
                                        <div
                                            ref={productDropdownRef}
                                            className="absolute left-0 right-0 top-full z-[60] mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-56 overflow-auto"
                                        >
                                            {filteredProducts.map((product) => (
                                                <div
                                                    key={product.code}
                                                    onClick={() => selectProduct(product, index)}
                                                    className="px-3 py-2 cursor-pointer text-sm hover:bg-gray-50 text-gray-900 border-b border-gray-50 last:border-0"
                                                >
                                                    <div className="font-medium truncate">{product.code}</div>
                                                    <div className="text-xs opacity-90 truncate">{product.name}</div>
                                                    <div className="text-xs opacity-75 mt-0.5">
                                                        {product.unit} • {formatNumber(product.price)} {ledgerCurrency}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {isColumnVisible('description2') && (
                                    <input
                                        type="text"
                                        value={item.description2}
                                        onChange={(e) => updateItem(index, 'description2', e.target.value)}
                                        onFocus={() => setCurrentRowIndex(index)}
                                        className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-800 bg-white"
                                        placeholder={tm('itemDescription2')}
                                    />
                                )}
                                <div className="grid grid-cols-3 gap-2">
                                    {isColumnVisible('quantity') && (
                                        <label className="flex flex-col gap-0.5 min-w-0">
                                            <span className="text-[10px] font-medium text-gray-500">{tm('itemQuantity')}</span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={qtyField.getDisplayValue(item, index)}
                                                onChange={(e) =>
                                                    qtyField.onChange(index, item, e.target.value)
                                                }
                                                onFocus={() => {
                                                    setCurrentRowIndex(index);
                                                    qtyField.onFocus(index, item);
                                                }}
                                                onBlur={() => qtyField.onBlur(index, item)}
                                                placeholder={quantityInputPlaceholder(item.unit, tm)}
                                                title={quantityInputTitle(item.unit, tm) || undefined}
                                                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-right tabular-nums bg-white"
                                            />
                                        </label>
                                    )}
                                    {isColumnVisible('unitPrice') && (
                                        <label className="flex flex-col gap-0.5 min-w-0">
                                            <span className="text-[10px] font-medium text-gray-500">
                                                {tm('itemPrice')}
                                                {currency !== ledgerCurrency ? ` (${currency})` : ''}
                                            </span>
                                            <input
                                                type="number"
                                                value={item.unitPrice || ''}
                                                onChange={(e) =>
                                                    updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)
                                                }
                                                onFocus={() => setCurrentRowIndex(index)}
                                                step="0.01"
                                                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-right tabular-nums bg-white"
                                            />
                                        </label>
                                    )}
                                    {isColumnVisible('discountPercent') && (
                                        <label className="flex flex-col gap-0.5 min-w-0">
                                            <span className="text-[10px] font-medium text-gray-500">% {tm('discount')}</span>
                                            <input
                                                type="number"
                                                value={item.discountPercent || ''}
                                                onChange={(e) =>
                                                    updateItem(index, 'discountPercent', parseFloat(e.target.value) || 0)
                                                }
                                                onFocus={() => setCurrentRowIndex(index)}
                                                className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs text-right tabular-nums bg-white"
                                                placeholder="%"
                                            />
                                        </label>
                                    )}
                                </div>
                                {isColumnVisible('unit') && (
                                    <label className="flex flex-col gap-0.5 min-w-0">
                                        <span className="text-[10px] font-medium text-gray-500">{tm('itemUnit')}</span>
                                        <select
                                            value={item.unit}
                                            onChange={(e) => updateItem(index, 'unit', e.target.value)}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-blue-800 bg-white"
                                        >
                                            {unitSelectOptionsForItem(item).map((o) => (
                                                <option key={o.id} value={o.name}>
                                                    {o.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                                {item.multiplier && item.multiplier !== 1 && item.quantity > 0 && isColumnVisible('quantity') && (
                                    <div className="text-[10px] text-orange-600 text-right leading-tight" title={tm('multiplierLogicDesc')}>
                                        →{' '}
                                        {formatNumber(
                                            item.baseQuantity ?? item.quantity * (item.multiplier || 1),
                                            0,
                                            false
                                        )}{' '}
                                        {tm('pieceUnitShort')}
                                    </div>
                                )}
                                {invoiceType.category === 'Alis' && isColumnVisible('expiryDate') && (
                                    <label className="flex flex-col gap-0.5 min-w-0">
                                        <span className="text-[10px] font-medium text-gray-500 flex items-center gap-1">
                                            <Calendar className="w-3 h-3 shrink-0" aria-hidden />
                                            {tm('itemExpiryDate')}
                                        </span>
                                        <input
                                            type="date"
                                            value={item.expiryDate || ''}
                                            onChange={(e) => updateItem(index, 'expiryDate', e.target.value)}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs bg-white"
                                        />
                                    </label>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-3 py-2">
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${cariTextColor}`}>{tm('invoiceTypeLabel')} {invoiceType.name}</span>
                </div>
            </div>
            <div className="overflow-auto" style={{ height: '400px' }}>
                <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                        <tr>
                            {isColumnVisible('type') && <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-20">{tm('itemType')}</th>}
                            {isColumnVisible('code') && <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-32">{tm('itemCode')}</th>}
                            {isColumnVisible('description') && <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-48">{tm('itemDescription')}</th>}
                            {isColumnVisible('description2') && <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-32">{tm('itemDescription2')}</th>}
                            {isColumnVisible('quantity') && <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-24">{tm('itemQuantity')}</th>}
                            {isColumnVisible('unit') && <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-16">{tm('itemUnit')}</th>}
                            {isColumnVisible('unitPrice') && <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-28">{tm('itemPrice')}{currency !== ledgerCurrency ? ` (${currency})` : ''}</th>}
                            {isColumnVisible('amount') && <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-28">{tm('itemGross')}{currency !== ledgerCurrency ? ` (${currency})` : ''}</th>}
                            {isColumnVisible('discountPercent') && <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-14">%</th>}
                            {isColumnVisible('discountAmount') && <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-24">{tm('itemDiscount')}</th>}
                            {isColumnVisible('netAmount') && <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-28">{tm('itemNetTotal')}{currency !== ledgerCurrency ? ` (${currency})` : ''}</th>}

                            {invoiceType.category === 'Alis' && (
                                <>
                                    {isColumnVisible('profitMarginPercent') && <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-20">{tm('itemProfitPercent')}</th>}
                                    {isColumnVisible('expiryDate') && <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-28">{tm('itemExpiryDate')}</th>}
                                </>
                            )}
                            {invoiceType.category === 'Irsaliye' && (
                                <>
                                    {isColumnVisible('batchNo') && <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-24">{tm('batchNo')}</th>}
                                    {isColumnVisible('expiryDate') && <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-28">{tm('itemExpiryDate')}</th>}
                                </>
                            )}
                            {(invoiceType.category === 'Satis' && invoiceType.code === 1) && (
                                <>
                                    {isColumnVisible('expiryDate') && <th className="px-2 py-2 text-left text-gray-700 border-r border-gray-200 w-28">{tm('itemExpiryDate')}</th>}
                                </>
                            )}
                            {invoiceType.category === 'Satis' && (
                                <>
                                    {isColumnVisible('profit') && <th className="px-2 py-2 text-right text-gray-700 border-r border-gray-200 w-24">{tm('itemProfit')}</th>}
                                </>
                            )}
                            <th className="px-2 py-2 text-center text-gray-700 w-12">{tm('itemActions')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr
                                key={item.id}
                                className={`border-b border-gray-100 transition-colors ${currentRowIndex === index ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                            >
                                {isColumnVisible('type') && (
                                    <td className="border-r border-gray-100 p-0 w-20">
                                        <select
                                            value={item.type}
                                            onChange={(e) => updateItem(index, 'type', e.target.value)}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent"
                                        >
                                            <option value="Malzeme">{tm('itemTypeMaterial')}</option>
                                            <option value="Hizmet">{tm('itemTypeService')}</option>
                                            <option value="Promosyon">{tm('itemTypePromotion')}</option>
                                            <option value="İndirim">{tm('itemTypeDiscount')}</option>
                                        </select>
                                    </td>
                                )}
                                {isColumnVisible('code') && (
                                    <td className="border-r border-gray-100 p-0 relative group w-32">
                                        <input
                                            ref={el => { gridRefs.current[`code-${index}`] = el; }}
                                            type="text"
                                            value={getProductCode(item.code)}
                                            onChange={(e) => handleProductSearchChange(e.target.value, index)}
                                            onKeyDown={(e) => handleProductKeyDown(e, index)}
                                            onFocus={() => {
                                                setCurrentRowIndex(index);
                                                onCodeFieldFocus?.(index, getProductCode(items[index]?.code || ''));
                                            }}
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent"
                                            placeholder={tm('itemSearchPlaceholder')}
                                        />
                                        {invoiceType.category === 'Alis' && item.code && (
                                            <button
                                                type="button"
                                                onClick={() => handleShowProductHistory(getProductCode(item.code), item.description, item.code)}
                                                className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-blue-600 hover:text-blue-700"
                                                title={tm('itemHistoryTooltip')}
                                            >
                                                <History className="w-3 h-3" />
                                            </button>
                                        )}
                                        {searchingRowIndex === index && filteredProducts.length > 0 && (
                                            <div
                                                ref={productDropdownRef}
                                                className="absolute top-full left-0 w-96 bg-white border border-gray-300 rounded shadow-lg z-50 max-h-64 overflow-auto"
                                            >
                                                {filteredProducts.map((product) => (
                                                    <div
                                                        key={product.code}
                                                        onClick={() => selectProduct(product, index)}
                                                        className="px-3 py-2 cursor-pointer text-sm hover:bg-gray-50 text-gray-900"
                                                    >
                                                        <div className="font-medium truncate">{product.code}</div>
                                                        <div className="text-xs opacity-90 truncate">{product.name}</div>
                                                        <div className="text-xs opacity-75 mt-0.5">{product.unit} • {formatNumber(product.price)} {ledgerCurrency}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                )}
                                {isColumnVisible('description') && (
                                    <td className="border-r border-gray-100 p-0 w-48">
                                        <input
                                            type="text"
                                            value={item.description}
                                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            onDoubleClick={() => {
                                                setSelectedRowForProduct(index);
                                                setShowProductCatalogModal(true);
                                            }}
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent cursor-pointer"
                                        />
                                    </td>
                                )}
                                {isColumnVisible('description2') && (
                                    <td className="border-r border-gray-100 p-0 w-32">
                                        <input
                                            type="text"
                                            value={item.description2}
                                            onChange={(e) => updateItem(index, 'description2', e.target.value)}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            onDoubleClick={() => {
                                                setSelectedRowForProduct(index);
                                                setShowProductCatalogModal(true);
                                            }}
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent cursor-pointer"
                                        />
                                    </td>
                                )}
                                {isColumnVisible('quantity') && (
                                    <td className="border-r border-gray-100 p-0 w-24">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={qtyField.getDisplayValue(item, index)}
                                            onChange={(e) => qtyField.onChange(index, item, e.target.value)}
                                            onFocus={() => {
                                                setCurrentRowIndex(index);
                                                qtyField.onFocus(index, item);
                                            }}
                                            onBlur={() => qtyField.onBlur(index, item)}
                                            placeholder={quantityInputPlaceholder(item.unit, tm)}
                                            title={quantityInputTitle(item.unit, tm) || undefined}
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm text-right bg-transparent"
                                        />
                                        {/* Çarpan göstergesi: 5 KOLI → 120 ADET */}
                                        {item.multiplier && item.multiplier !== 1 && item.quantity > 0 && (
                                            <div className="text-xs text-orange-600 text-right px-1.5 leading-tight" title={tm('multiplierLogicDesc')}>
                                                → {formatNumber(
                                                    item.baseQuantity ?? (item.quantity * (item.multiplier || 1)),
                                                    3,
                                                    false
                                                )}{' '}
                                                {tm('pieceUnitShort')}
                                            </div>
                                        )}
                                    </td>
                                )}
                                {isColumnVisible('unit') && (
                                    <td className="border-r border-gray-100 p-0 w-16">
                                        <select
                                            value={item.unit}
                                            onChange={(e) => {
                                                updateItem(index, 'unit', e.target.value);
                                            }}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm bg-transparent font-medium text-blue-700"
                                        >
                                            {unitSelectOptionsForItem(item).map((o) => (
                                                <option key={o.id} value={o.name}>{o.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                )}
                                {isColumnVisible('unitPrice') && (
                                    <td className="border-r border-gray-100 p-0 w-28">
                                        <input
                                            type="number"
                                            value={item.unitPrice || ''}
                                            onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            step="0.01"
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm text-right bg-transparent"
                                        />
                                    </td>
                                )}
                                {isColumnVisible('amount') && (
                                    <td className="border-r border-gray-100 px-1.5 py-1 text-right text-gray-700 bg-gray-50/30 w-28">
                                        {formatNumber(item.amount, 2, true)}
                                        {currency !== ledgerCurrency && item.amount > 0 && (
                                            <div className="text-xs text-gray-400 leading-tight">
                                                {formatNumber(item.amount * (currencyRate || 1), 2, true)} {ledgerCurrency}
                                            </div>
                                        )}
                                    </td>
                                )}
                                {isColumnVisible('discountPercent') && (
                                    <td className="border-r border-gray-100 p-0 w-14">
                                        <input
                                            type="number"
                                            value={item.discountPercent || ''}
                                            onChange={(e) => updateItem(index, 'discountPercent', parseFloat(e.target.value) || 0)}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm text-right bg-transparent"
                                            placeholder="%"
                                        />
                                    </td>
                                )}
                                {isColumnVisible('discountAmount') && (
                                    <td className="border-r border-gray-100 p-0 w-24">
                                        <input
                                            type="number"
                                            value={item.discountAmount || ''}
                                            onChange={(e) => updateItem(index, 'discountAmount', parseFloat(e.target.value) || 0)}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm text-right bg-transparent"
                                            placeholder={tm('itemAmountPlaceholder')}
                                        />
                                    </td>
                                )}
                                {isColumnVisible('netAmount') && (
                                    <td className="border-r border-gray-100 px-1.5 py-1 text-right font-semibold text-blue-700 bg-blue-50/30 w-28">
                                        {formatNumber(item.netAmount, 2, true)}
                                        {currency !== ledgerCurrency && item.netAmount > 0 && (
                                            <div className="text-xs text-blue-400 font-normal leading-tight">
                                                {formatNumber(item.netAmount * (currencyRate || 1), 2, true)} {ledgerCurrency}
                                            </div>
                                        )}
                                    </td>
                                )}
                                {invoiceType.category === 'Alis' && (
                                    <>
                                        {isColumnVisible('profitMarginPercent') && (
                                            <td className="border-r border-gray-100 p-1 text-right text-xs w-20">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number"
                                                            value={item.profitMarginPercent || ''}
                                                            onChange={(e) => updateItem(index, 'profitMarginPercent', parseFloat(e.target.value) || 0)}
                                                            onFocus={() => setCurrentRowIndex(index)}
                                                            className="flex-1 px-1.5 py-1 border-0 focus:outline-none text-sm text-right bg-transparent"
                                                            placeholder={tm('itemProfitPercent')}
                                                            step="0.1"
                                                        />
                                                        <Percent className="w-3 h-3 text-blue-600" />
                                                    </div>
                                                    {item.profitMarginPercent && item.profitMarginPercent > 0 && item.unitPrice > 0 && (
                                                        <div className="text-xs text-blue-600 text-right">
                                                            {tm('itemSellPrice')}: {formatNumber(item.unitPrice * (1 + item.profitMarginPercent / 100), 2, false)}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                        {isColumnVisible('expiryDate') && (
                                            <td className="border-r border-gray-100 p-0 w-28">
                                                {(() => {
                                                    const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
                                                    const today = new Date();
                                                    const isExpired = expiryDate && expiryDate < today;
                                                    const daysDiff = expiryDate ? Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24)) : null;
                                                    const isExpiringSoon = daysDiff !== null && daysDiff <= 30 && daysDiff > 0;

                                                    return (
                                                        <div className="space-y-1 p-1">
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="date"
                                                                    value={item.expiryDate || ''}
                                                                    onChange={(e) => updateItem(index, 'expiryDate', e.target.value)}
                                                                    onFocus={() => setCurrentRowIndex(index)}
                                                                    className={`w-full px-1 py-1 border-0 focus:outline-none text-xs bg-transparent ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-yellow-600' : ''}`}
                                                                />
                                                                <Calendar className={`w-3 h-3 ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-yellow-600' : 'text-gray-400'}`} />
                                                            </div>
                                                            {isExpired && <div className="text-[10px] text-red-600 text-center">{tm('itemExpired')}</div>}
                                                            {!isExpired && isExpiringSoon && <div className="text-[10px] text-yellow-600 text-center">{daysDiff} {tm('itemDaysRemaining')}!</div>}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        )}
                                    </>
                                )}
                                {invoiceType.category === 'Irsaliye' && (
                                    <>
                                        {isColumnVisible('batchNo') && (
                                            <td className="border-r border-gray-100 p-0 text-center w-24">
                                                <input
                                                    type="text"
                                                    value={item.batchNo || ''}
                                                    onChange={(e) => updateItem(index, 'batchNo', e.target.value)}
                                                    onFocus={() => setCurrentRowIndex(index)}
                                                    className="w-full px-1.5 py-1 border-0 focus:outline-none text-xs text-center bg-transparent"
                                                />
                                            </td>
                                        )}
                                        {isColumnVisible('expiryDate') && (
                                            <td className="border-r border-gray-100 p-0 text-center w-28">
                                                <input
                                                    type="date"
                                                    value={item.expiryDate || ''}
                                                    onChange={(e) => updateItem(index, 'expiryDate', e.target.value)}
                                                    onFocus={() => setCurrentRowIndex(index)}
                                                    className="w-full px-1.5 py-1 border-0 focus:outline-none text-xs bg-transparent"
                                                />
                                            </td>
                                        )}
                                    </>
                                )}
                                {(invoiceType.category === 'Satis' && invoiceType.code === 1) && (
                                    <>
                                        {isColumnVisible('expiryDate') && (
                                            <td className="border-r border-gray-100 p-0 text-center w-28">
                                                <input
                                                    type="date"
                                                    value={item.expiryDate || ''}
                                                    onChange={(e) => updateItem(index, 'expiryDate', e.target.value)}
                                                    onFocus={() => setCurrentRowIndex(index)}
                                                    className="w-full px-1.5 py-1 border-0 focus:outline-none text-xs bg-transparent"
                                                />
                                            </td>
                                        )}
                                    </>
                                )}
                                {invoiceType.category === 'Satis' && (
                                    <>
                                        {isColumnVisible('profit') && (
                                            <td className={`border-r border-gray-100 px-1.5 py-1 text-right font-medium w-24 ${(item.profitMargin || 0) < 0 ? 'text-red-600 bg-red-50/30' : 'text-green-600 bg-green-50/30'}`}>
                                                {formatNumber(item.grossProfit, 2, true)}
                                            </td>
                                        )}
                                    </>
                                )}
                                <td className="px-2 py-1 text-center w-12">
                                    <button
                                        onClick={() => removeItem(index)}
                                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
});


