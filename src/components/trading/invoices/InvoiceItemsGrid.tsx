import React, { useMemo } from 'react';
import { History, Trash2, Percent, Calendar } from 'lucide-react';
import { moduleTranslations, type Language } from '../../../locales/module-translations';
import { useLanguage } from '../../../contexts/LanguageContext';

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
    unitSets = [],
    currency = 'IQD',
    currencyRate = 1,
    ledgerCurrency = 'IQD',
    onCodeFieldFocus
}: InvoiceItemsGridProps) => {
    const { language } = useLanguage();
    const tm = (key: string) => moduleTranslations[key]?.[language] || key;

    const isColumnVisible = (columnId: string) => {
        return itemColumnVisibility[columnId] !== false;
    };

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
                                            type="number"
                                            value={item.quantity || ''}
                                            onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                                            onFocus={() => setCurrentRowIndex(index)}
                                            className="w-full px-1.5 py-1 border-0 focus:outline-none text-sm text-right bg-transparent"
                                        />
                                        {/* Çarpan göstergesi: 5 KOLI → 120 ADET */}
                                        {item.multiplier && item.multiplier !== 1 && item.quantity > 0 && (
                                            <div className="text-xs text-orange-600 text-right px-1.5 leading-tight" title={tm('multiplierLogicDesc')}>
                                                → {formatNumber(
                                                    item.baseQuantity ?? (item.quantity * (item.multiplier || 1)),
                                                    0,
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
                                            {item.unitsetId ? (
                                                unitSets.find(us => us.id === item.unitsetId)?.lines?.map((line: any) => (
                                                    <option key={line.id || line.code} value={line.name}>{line.name}</option>
                                                ))
                                            ) : unitSets.length > 0 ? (
                                                Array.from(new Set(
                                                    unitSets.flatMap((us: any) => us.lines || []).map((l: any) => l.name).filter(Boolean)
                                                )).sort().map((name: any) => (
                                                    <option key={name} value={name}>{name}</option>
                                                ))
                                            ) : (
                                                <>
                                                    <option>Adet</option>
                                                    <option>Kg</option>
                                                    <option>Metre</option>
                                                    <option>Litre</option>
                                                    <option>Koli</option>
                                                    <option>Set</option>
                                                    <option>Kutu</option>
                                                </>
                                            )}
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


