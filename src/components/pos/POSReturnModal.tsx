import React, { useState, useEffect } from 'react';
import { X, RotateCcw, Search, AlertTriangle, Check } from 'lucide-react';
import type { Sale, SaleItem } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';

interface POSReturnModalProps {
  sales: Sale[];
  onReturn?: (sale: Sale, returnItems: { item: SaleItem; quantity: number }[], reason: string) => void;
  onReturnComplete?: (returnData: any) => void; // MarketPOS uyumluluğu için
  onClose: () => void;
}

export function POSReturnModal({
  sales,
  onReturn,
  onReturnComplete,
  onClose
}: POSReturnModalProps) {
  const { t, language } = useLanguage();
  const [returnType, setReturnType] = useState<'receipt' | 'product'>('receipt'); // 'receipt' = Fatura Bazında, 'product' = Ürün Bazında
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<{ [key: string]: number }>({});
  const [returnReason, setReturnReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  // Ürün için unique key oluştur (varyantlı ürünler için variantId dahil)
  const getItemKey = (item: SaleItem | (SaleItem & { saleId?: string })): string => {
    if (item.variant?.id) {
      return `${item.productId}_${item.variant.id}`;
    }
    return item.productId;
  };

  // Ürün bazında iade için tüm satışlardan ürün listesi
  const allItemsFromSales = sales.flatMap(sale =>
    sale.items.map(item => ({
      ...item,
      saleId: sale.id,
      saleReceiptNumber: sale.receiptNumber,
      saleDate: sale.date,
      saleCustomerName: sale.customerName
    }))
  );

  // Ürün bazında iade için unique ürünleri grupla
  const groupedItems = allItemsFromSales.reduce((acc, item) => {
    const itemKey = getItemKey(item);
    if (!acc[itemKey]) {
      acc[itemKey] = {
        item,
        totalQuantity: 0,
        sales: []
      };
    }
    acc[itemKey].totalQuantity += item.quantity;
    acc[itemKey].sales.push({
      saleId: item.saleId,
      receiptNumber: item.saleReceiptNumber,
      date: item.saleDate,
      customerName: item.saleCustomerName || '',
      quantity: item.quantity,
      price: item.price
    });
    return acc;
  }, {} as Record<string, {
    item: SaleItem & { saleId: string; saleReceiptNumber: string; saleDate: string; saleCustomerName: string | undefined };
    totalQuantity: number;
    sales: Array<{
      saleId: string;
      receiptNumber: string;
      date: string;
      customerName: string;
      quantity: number;
      price: number;
    }>;
  }>);

  const returnReasons = [
    t.productDefective,
    t.customerNotSatisfied,
    t.wrongProduct,
    t.sizeColorChange,
    t.otherReason
  ];

  const filteredSales = sales.filter(sale =>
    sale.receiptNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sale.customerName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Ürün bazında arama
  const filteredGroupedItems = Object.entries(groupedItems).filter(([key, group]) => {
    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase();
    return group.item.productName.toLowerCase().includes(query) ||
      group.item.productId.toLowerCase().includes(query);
  });

  const handleQuantityChange = (itemKey: string, quantity: number) => {
    if (quantity <= 0) {
      const newItems = { ...returnItems };
      delete newItems[itemKey];
      setReturnItems(newItems);
    } else {
      setReturnItems({ ...returnItems, [itemKey]: quantity });
    }
  };

  const handleConfirmReturn = () => {
    if (returnType === 'receipt' && !selectedSale) {
      alert(t.pleaseSelectReceipt);
      return;
    }

    if (Object.keys(returnItems).length === 0) {
      alert(t.pleaseSelectReturnProducts);
      return;
    }

    if (!returnReason) {
      alert(t.pleaseSelectReturnReason);
      return;
    }

    if (returnReason === t.other && !customReason.trim()) {
      alert(t.pleaseExplainReturnReason);
      return;
    }

    const finalReason = returnReason === t.other ? customReason : returnReason;

    if (returnType === 'receipt') {
      // Fatura bazında iade
      const returnItemsList = selectedSale!.items
        .filter(item => {
          const itemKey = getItemKey(item);
          return returnItems[itemKey] && returnItems[itemKey] > 0;
        })
        .map(item => {
          const itemKey = getItemKey(item);
          return {
            item,
            quantity: returnItems[itemKey]
          };
        });

      const returnReceipt = {
        id: `RETURN-${Date.now()}`,
        returnNumber: `IADE-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        originalReceiptNumber: selectedSale!.receiptNumber,
        date: new Date().toISOString(),
        items: returnItemsList.map(({ item, quantity }) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: quantity,
          price: item.price,
          total: quantity * item.price,
          variant: item.variant
        })),
        subtotal: totalReturnAmount,
        total: totalReturnAmount,
        refundMethod: selectedSale!.paymentMethod as 'cash' | 'card' | 'original',
        cashier: selectedSale!.cashier,
        customerName: selectedSale!.customerName,
        returnReason: finalReason
      };

      import('../../utils/thermalPrinter').then(({ printReturnReceipt }) => {
        printReturnReceipt(returnReceipt, 'ExRetailOS');
      });

      if (onReturn) {
        onReturn(selectedSale!, returnItemsList, finalReason);
      }
      if (onReturnComplete) {
        onReturnComplete(returnReceipt);
      }
    } else {
      // Ürün bazında iade
      const returnItemsList = Object.entries(returnItems)
        .filter(([key, qty]) => (qty as number) > 0)
        .map(([key, qty]) => {
          const group = groupedItems[key];
          if (!group) return null;

          // İade miktarını satışlara dağıt
          let remainingQty = qty as number;
          const distributedItems: Array<{ item: SaleItem; quantity: number; saleId: string; receiptNumber: string }> = [];

          for (const saleInfo of group.sales) {
            if (remainingQty <= 0) break;
            const qtyFromThisSale = Math.min(remainingQty, saleInfo.quantity);
            distributedItems.push({
              item: group.item,
              quantity: qtyFromThisSale,
              saleId: saleInfo.saleId,
              receiptNumber: saleInfo.receiptNumber
            });
            remainingQty -= qtyFromThisSale;
          }

          return distributedItems;
        })
        .flat()
        .filter(Boolean) as Array<{ item: SaleItem; quantity: number; saleId: string; receiptNumber: string }>;

      const returnReceipt = {
        id: `RETURN-${Date.now()}`,
        returnNumber: `IADE-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        originalReceiptNumber: 'ÜRÜN BAZINDA',
        date: new Date().toISOString(),
        items: returnItemsList.map(({ item, quantity }) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: quantity,
          price: item.price,
          total: quantity * item.price,
          variant: item.variant
        })),
        subtotal: totalReturnAmount,
        total: totalReturnAmount,
        refundMethod: 'cash' as const,
        cashier: 'Sistem',
        customerName: 'Ürün Bazında İade',
        returnReason: finalReason
      };

      import('../../utils/thermalPrinter').then(({ printReturnReceipt }) => {
        printReturnReceipt(returnReceipt, 'ExRetailOS');
      });

      if (onReturnComplete) {
        onReturnComplete(returnReceipt);
      }
    }

    onClose();
  };

  const totalReturnAmount = returnType === 'receipt' && selectedSale
    ? selectedSale.items.reduce((sum, item) => {
      const itemKey = getItemKey(item);
      const returnQty = returnItems[itemKey] || 0;
      return sum + (returnQty * item.price);
    }, 0)
    : Object.entries(returnItems).reduce((sum, [key, qty]) => {
      const group = groupedItems[key];
      const qtyNum = qty as number;
      if (!group || qtyNum <= 0) return sum;
      // Ortalama fiyat kullan (veya ilk satışın fiyatı)
      const avgPrice = group.sales[0]?.price || group.item.price;
      return sum + (qtyNum * avgPrice);
    }, 0);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const key = e.key;
      if (key >= '1' && key <= '5') {
        const index = parseInt(key) - 1;
        if (index < returnReasons.length && (returnType === 'receipt' ? selectedSale : Object.keys(returnItems).length > 0)) {
          setReturnReason(returnReasons[index]);
        }
      } else if (key === 'Enter' && returnReason && Object.keys(returnItems).length > 0) {
        if (returnType === 'receipt' && selectedSale) {
          handleConfirmReturn();
        } else if (returnType === 'product') {
          handleConfirmReturn();
        }
      } else if (key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [returnType, selectedSale, returnReason, returnItems, customReason]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            {t.returnCancelTitle}
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* İade Tipi Seçimi */}
        <div className="p-3 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setReturnType('receipt');
                setSelectedSale(null);
                setReturnItems({});
              }}
              className={`flex-1 px-4 py-2 rounded border-2 transition-all ${returnType === 'receipt'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
            >
              {t.receiptBased}
            </button>
            <button
              onClick={() => {
                setReturnType('product');
                setSelectedSale(null);
                setReturnItems({});
              }}
              className={`flex-1 px-4 py-2 rounded border-2 transition-all ${returnType === 'product'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
            >
              {t.productBased}
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Receipt/Product Selection */}
          <div className="w-1/2 border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={returnType === 'receipt' ? t.searchReceiptPlaceholder : t.searchProductByName}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600 text-sm"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3">
              {returnType === 'receipt' ? (
                // Fatura bazında - Fiş listesi
                filteredSales.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Search className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">{t.noSalesFound}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredSales.map((sale) => (
                      <button
                        key={sale.id}
                        onClick={() => {
                          setSelectedSale(sale);
                          setReturnItems({});
                        }}
                        className={`w-full p-3 rounded border-2 text-left transition-all ${selectedSale?.id === sale.id
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 bg-white hover:border-orange-300'
                          }`}
                      >
                        <div className="flex items-start justify-between mb-1">
                          <span className="font-mono text-sm font-medium text-gray-900">
                            {sale.receiptNumber}
                          </span>
                          <span className="text-sm text-gray-900">
                            {sale.total.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {new Date(sale.date).toLocaleString('tr-TR')}
                        </div>
                        <div className="text-xs text-gray-600">
                          {sale.customerName || t.generalSale} • {sale.items.length} {t.productCount}
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                // Ürün bazında - Ürün listesi
                filteredGroupedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <Search className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">{t.noProductsFound}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredGroupedItems.map(([key, group]) => {
                      const variantInfo = group.item.variant
                        ? `${group.item.variant.color || ''} ${group.item.variant.size || ''}`.trim()
                        : null;

                      return (
                        <div
                          key={key}
                          className="p-3 rounded border-2 border-gray-200 bg-white"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h5 className="text-sm font-medium text-gray-900">
                                {group.item.productName}
                                {variantInfo && (
                                  <span className="ml-2 text-xs text-gray-500 font-normal">
                                    ({variantInfo})
                                  </span>
                                )}
                              </h5>
                              <p className="text-xs text-gray-600 mt-1">
                                {t.totalSale}: {group.totalQuantity} {t.pieces} • {group.sales.length} {t.differentReceipts}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">İade miktarı:</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleQuantityChange(key, Math.max(0, (returnItems[key] || 0) - 1))}
                                className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="0"
                                max={group.totalQuantity}
                                value={returnItems[key] || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val <= group.totalQuantity) {
                                    handleQuantityChange(key, val);
                                  }
                                }}
                                className="w-12 text-center border border-gray-300 rounded text-sm"
                              />
                              <button
                                onClick={() => handleQuantityChange(key, Math.min((returnItems[key] || 0) + 1, group.totalQuantity))}
                                className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                              >
                                +
                              </button>
                              <button
                                onClick={() => handleQuantityChange(key, group.totalQuantity)}
                                className="ml-2 px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                              >
                                Tümü
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Right: Return Details */}
          <div className="w-1/2 flex flex-col">
            {returnType === 'receipt' && !selectedSale ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <RotateCcw className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t.selectReceiptForReturn}</p>
                </div>
              </div>
            ) : returnType === 'product' && Object.keys(returnItems).length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <RotateCcw className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{t.selectProductForReturn}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-auto p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">
                    {returnType === 'receipt' ? t.productsToReturn : t.selectedProducts}
                  </h4>
                  <div className="space-y-2">
                    {returnType === 'receipt' ? (
                      // Fatura bazında - seçili fişin ürünleri
                      selectedSale!.items.map((item) => {
                        const itemKey = getItemKey(item);
                        const variantInfo = item.variant
                          ? `${item.variant.color || ''} ${item.variant.size || ''}`.trim()
                          : null;

                        return (
                          <div key={itemKey} className="p-3 border border-gray-200 rounded bg-white">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <h5 className="text-sm font-medium text-gray-900 mb-1">
                                  {item.productName}
                                  {variantInfo && (
                                    <span className="ml-2 text-xs text-gray-500 font-normal">
                                      ({variantInfo})
                                    </span>
                                  )}
                                </h5>
                                <p className="text-xs text-gray-600">
                                  {t.saleQuantity}: {item.quantity} • {t.unitPrice}: {item.price.toFixed(2)} IQD
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600">{t.returnQuantity}:</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleQuantityChange(itemKey, Math.max(0, (returnItems[itemKey] || 0) - 1))}
                                  className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  max={item.quantity}
                                  value={returnItems[itemKey] || 0}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    if (val <= item.quantity) {
                                      handleQuantityChange(itemKey, val);
                                    }
                                  }}
                                  className="w-12 text-center border border-gray-300 rounded text-sm"
                                />
                                <button
                                  onClick={() => handleQuantityChange(itemKey, Math.min((returnItems[itemKey] || 0) + 1, item.quantity))}
                                  className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                                >
                                  +
                                </button>
                                <button
                                  onClick={() => handleQuantityChange(itemKey, item.quantity)}
                                  className="ml-2 px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                                >
                                  {t.all}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      // Ürün bazında - seçilen ürünler
                      Object.entries(returnItems)
                        .filter(([key, qty]) => (qty as number) > 0)
                        .map(([key, qty]) => {
                          const group = groupedItems[key];
                          if (!group) return null;
                          const itemKey = key;
                          const variantInfo = group.item.variant
                            ? `${group.item.variant.color || ''} ${group.item.variant.size || ''}`.trim()
                            : null;

                          return (
                            <div key={itemKey} className="p-3 border border-gray-200 rounded bg-white">
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <h5 className="text-sm font-medium text-gray-900 mb-1">
                                    {group.item.productName}
                                    {variantInfo && (
                                      <span className="ml-2 text-xs text-gray-500 font-normal">
                                        ({variantInfo})
                                      </span>
                                    )}
                                  </h5>
                                  <p className="text-xs text-gray-600">
                                    {t.totalSale}: {group.totalQuantity} {t.pieces} • {t.unitPrice}: {group.item.price.toFixed(2)} IQD • {t.return}: {qty} {t.pieces}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-600">{t.returnQuantity}:</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleQuantityChange(itemKey, Math.max(0, qty - 1))}
                                    className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    max={group.totalQuantity}
                                    value={qty}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      if (val <= group.totalQuantity) {
                                        handleQuantityChange(itemKey, val);
                                      }
                                    }}
                                    className="w-12 text-center border border-gray-300 rounded text-sm"
                                  />
                                  <button
                                    onClick={() => handleQuantityChange(itemKey, Math.min(qty + 1, group.totalQuantity))}
                                    className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                                  >
                                    +
                                  </button>
                                  <button
                                    onClick={() => handleQuantityChange(itemKey, group.totalQuantity)}
                                    className="ml-2 px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                                  >
                                    {t.all}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                        .filter(Boolean)
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">{t.returnReason}</h4>
                    <div className="space-y-2">
                      {returnReasons.map((reason, index) => (
                        <button
                          key={reason}
                          onClick={() => setReturnReason(reason)}
                          className={`w-full p-2.5 text-left border transition-all ${returnReason === reason
                            ? 'border-orange-600 bg-orange-50 text-orange-900'
                            : 'border-gray-300 bg-white hover:border-orange-400 hover:bg-orange-50'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 flex items-center justify-center border text-xs ${returnReason === reason
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-gray-100 text-gray-600 border-gray-300'
                              }`}>
                              {index + 1}
                            </div>
                            <span className="text-sm">{reason}</span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {returnReason === t.other && (
                      <textarea
                        value={customReason}
                        onChange={(e) => setCustomReason(e.target.value)}
                        placeholder={t.explainReturnReason}
                        className="mt-2 w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-orange-600 text-sm resize-none"
                        rows={3}
                      />
                    )}
                  </div>
                </div>

                <div className="p-4 border-t border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600">{t.returnAmount}:</span>
                    <span className="text-lg font-medium text-gray-900">
                      {totalReturnAmount.toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={handleConfirmReturn}
                    disabled={Object.keys(returnItems).length === 0}
                    className="w-full py-2.5 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {t.confirmReturn}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
