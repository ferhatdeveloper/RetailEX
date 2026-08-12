import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Search, Check, Barcode } from 'lucide-react';
import type { Sale, SaleItem, Product } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { expandBarcodeLookupKeys } from '../../utils/barcodeParser';
import { resolveScaleBarcodeSale } from '../../utils/scaleBarcodeSale';
import { productAPI } from '../../services/api/products';
import { formatScaleQuantityDisplay, normalizeWeightProductQuantity } from '../../utils/scaleQuantity';
import { isWeightBasedUnit } from '../../utils/productUnits';
import { parsePosQuantityForProduct } from '../../utils/numberFormatter';

interface POSReturnModalProps {
  sales: Sale[];
  products?: Product[];
  onReturn?: (sale: Sale, returnItems: { item: SaleItem; quantity: number }[], reason: string) => void;
  onReturnComplete?: (returnData: any) => void;
  onClose: () => void;
}

export function POSReturnModal({
  sales,
  products = [],
  onReturn,
  onReturnComplete,
  onClose
}: POSReturnModalProps) {
  const { t, language } = useLanguage();
  const [returnType, setReturnType] = useState<'receipt' | 'product' | 'barcode'>('barcode');
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeHint, setBarcodeHint] = useState('');
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<{ [key: string]: number }>({});
  const [returnReason, setReturnReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  useEffect(() => {
    if (returnType === 'barcode') {
      setTimeout(() => barcodeRef.current?.focus(), 100);
    }
  }, [returnType]);

  const getItemKey = (item: SaleItem | (SaleItem & { saleId?: string }), saleId?: string, lineIndex?: number): string => {
    if (saleId != null && lineIndex != null) {
      return `${saleId}_${lineIndex}`;
    }
    if (item.variant?.id) {
      return `${item.productId}_${item.variant.id}`;
    }
    return item.productId;
  };

  const getReceiptLineKey = (saleId: string, lineIndex: number): string => `${saleId}_${lineIndex}`;

  const allItemsFromSales = sales.flatMap(sale =>
    sale.items.map(item => ({
      ...item,
      saleId: sale.id,
      saleReceiptNumber: sale.receiptNumber,
      saleDate: sale.date,
      saleCustomerName: sale.customerName
    }))
  );

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

  const filteredGroupedItems = Object.entries(groupedItems).filter(([key, group]) => {
    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase();
    const barcode = (group.item.barcode || '').toLowerCase();
    const code = (group.item.productCode || '').toLowerCase();
    return group.item.productName.toLowerCase().includes(query) ||
      group.item.productId.toLowerCase().includes(query) ||
      barcode.includes(query) ||
      code.includes(query);
  });

  const findProductByBarcode = async (raw: string): Promise<Product | undefined> => {
    const q = raw.trim();
    if (!q) return undefined;

    for (const key of expandBarcodeLookupKeys(q)) {
      const fromList = products.find(
        (p) =>
          (p.barcode || '').trim() === key ||
          (p.code || '').trim().toLowerCase() === key.toLowerCase() ||
          (p.barcode || '').toLowerCase() === key.toLowerCase(),
      );
      if (fromList) return fromList;
    }

    try {
      const lookup = await productAPI.lookupByBarcode(q);
      if (lookup?.product) return lookup.product;
    } catch {
      /* katalog yoksa devam */
    }

    return undefined;
  };

  const findSalesForBarcode = async (
    raw: string,
  ): Promise<{
    matches: Array<{ sale: Sale; item: SaleItem; itemKey: string; lineIndex: number }>;
    scaleQty?: number;
    scaleUnit?: string;
    product?: Product;
  }> => {
    const q = raw.trim();
    if (!q) return { matches: [] };

    let scaleQty: number | undefined;
    let scaleUnit: string | undefined;
    let product: Product | undefined;

    // Tartılı etiket: alış/POS ile aynı — miktar ve birim her okutmada etiketten alınır
    try {
      const scale = await resolveScaleBarcodeSale(q, 1);
      if (scale) {
        product = scale.product;
        scaleUnit = scale.unitName;
        scaleQty = normalizeWeightProductQuantity(scale.quantity, scaleUnit);
      }
    } catch {
      /* tartılı parse başarısız */
    }

    if (!product) {
      product = await findProductByBarcode(q);
    }

    const lookupKeys = new Set(expandBarcodeLookupKeys(q).map((k) => k.toLowerCase()));
    const hits: Array<{ sale: Sale; item: SaleItem; itemKey: string; lineIndex: number }> = [];

    for (const sale of sales) {
      sale.items.forEach((item, lineIndex) => {
        const itemBarcode = (item.barcode || '').toLowerCase();
        const itemCode = (item.productCode || '').toLowerCase();
        const matchProduct = product && item.productId === product.id;
        const matchBarcode = itemBarcode && lookupKeys.has(itemBarcode);
        const matchCode = itemCode && lookupKeys.has(itemCode);
        if (matchProduct || matchBarcode || matchCode) {
          hits.push({
            sale,
            item,
            itemKey: getReceiptLineKey(sale.id, lineIndex),
            lineIndex,
          });
        }
      });
    }

    return {
      matches: hits.sort((a, b) => new Date(b.sale.date).getTime() - new Date(a.sale.date).getTime()),
      scaleQty,
      scaleUnit,
      product,
    };
  };

  const handleBarcodeScan = async () => {
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeHint('Aranıyor…');
    const { matches, scaleQty, scaleUnit, product } = await findSalesForBarcode(code);
    if (matches.length === 0) {
      setBarcodeHint('Bu barkod/kod ile tamamlanmış satış bulunamadı.');
      return;
    }

    const best = matches[0];
    const unit = scaleUnit || product?.unit || best.item.unit || 'Adet';
    const parsedScaleQty =
      scaleQty && scaleQty > 0 ? normalizeWeightProductQuantity(scaleQty, unit) : undefined;
    const defaultQty = parsedScaleQty && parsedScaleQty > 0
      ? Math.min(parsedScaleQty, best.item.quantity)
      : (isWeightBasedUnit(unit) ? best.item.quantity : 1);

    setSelectedSale(best.sale);
    setReturnType('receipt');
    setReturnItems({ [best.itemKey]: defaultQty });
    setBarcodeHint(
      product
        ? `${product.name} — ${formatScaleQuantityDisplay(defaultQty, unit)} ${unit} — Fiş: ${best.sale.receiptNumber}`
        : `${best.item.productName} — Fiş: ${best.sale.receiptNumber}`,
    );
    setBarcodeInput('');
  };

  const handleQuantityChange = (itemKey: string, quantity: number, maxQty?: number) => {
    const capped = maxQty != null ? Math.min(Math.max(0, quantity), maxQty) : Math.max(0, quantity);
    if (capped <= 0) {
      const newItems = { ...returnItems };
      delete newItems[itemKey];
      setReturnItems(newItems);
    } else {
      setReturnItems({ ...returnItems, [itemKey]: capped });
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

    if (returnType === 'receipt' || (returnType === 'barcode' && selectedSale)) {
      const sale = selectedSale!;
      const returnItemsList = sale.items
        .map((item, lineIndex) => {
          const itemKey = getReceiptLineKey(sale.id, lineIndex);
          const qty = returnItems[itemKey];
          if (!qty || qty <= 0) return null;
          return { item, quantity: qty };
        })
        .filter(Boolean) as Array<{ item: SaleItem; quantity: number }>;

      const returnReceipt = {
        id: `RETURN-${Date.now()}`,
        returnNumber: `IADE-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        originalReceiptNumber: sale.receiptNumber,
        date: new Date().toISOString(),
        items: returnItemsList.map(({ item, quantity }) => ({
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode,
          barcode: item.barcode,
          quantity: quantity,
          unit: item.unit,
          multiplier: item.multiplier,
          price: item.price,
          total: quantity * item.price,
          variant: item.variant
        })),
        subtotal: totalReturnAmount,
        total: totalReturnAmount,
        refundMethod: sale.paymentMethod as 'cash' | 'card' | 'original',
        cashier: sale.cashier,
        customerName: sale.customerName,
        returnReason: finalReason
      };

      import('../../utils/thermalPrinter').then(({ printReturnReceipt }) => {
        printReturnReceipt(returnReceipt, 'ExRetailOS');
      });

      if (onReturn) {
        onReturn(sale, returnItemsList, finalReason);
      }
      if (onReturnComplete) {
        onReturnComplete(returnReceipt);
      }
    } else {
      const returnItemsList = Object.entries(returnItems)
        .filter(([key, qty]) => (qty as number) > 0)
        .map(([key, qty]) => {
          const group = groupedItems[key];
          if (!group) return null;

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
          productCode: item.productCode,
          barcode: item.barcode,
          quantity: quantity,
          unit: item.unit,
          multiplier: item.multiplier,
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

  const totalReturnAmount = (returnType === 'receipt' || returnType === 'barcode') && selectedSale
    ? selectedSale.items.reduce((sum, item, lineIndex) => {
      const itemKey = getReceiptLineKey(selectedSale.id, lineIndex);
      const returnQty = returnItems[itemKey] || 0;
      return sum + (returnQty * item.price);
    }, 0)
    : Object.entries(returnItems).reduce((sum, [key, qty]) => {
      const group = groupedItems[key];
      const qtyNum = qty as number;
      if (!group || qtyNum <= 0) return sum;
      const avgPrice = group.sales[0]?.price || group.item.price;
      return sum + (qtyNum * avgPrice);
    }, 0);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const key = e.key;
      if (key >= '1' && key <= '5') {
        const index = parseInt(key) - 1;
        if (index < returnReasons.length && ((returnType === 'receipt' || returnType === 'barcode') ? selectedSale : Object.keys(returnItems).length > 0)) {
          setReturnReason(returnReasons[index]);
        }
      } else if (key === 'Enter' && returnReason && Object.keys(returnItems).length > 0) {
        if ((returnType === 'receipt' || returnType === 'barcode') && selectedSale) {
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

  const showReturnDetails =
    (returnType === 'receipt' || returnType === 'barcode') && selectedSale
      ? true
      : returnType === 'product' && Object.keys(returnItems).length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl rounded-xl overflow-hidden">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
          <h3 className="text-base text-white flex items-center gap-2">
            <RotateCcw className="w-5 h-5" />
            {t.returnCancelTitle}
          </h3>
          <button onClick={onClose} className="text-white hover:text-gray-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-gray-200 bg-gray-50">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setReturnType('barcode');
                setSelectedSale(null);
                setReturnItems({});
                setBarcodeHint('');
              }}
              className={`flex-1 min-w-[120px] px-3 py-2 rounded border-2 text-sm transition-all flex items-center justify-center gap-1.5 ${returnType === 'barcode'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
            >
              <Barcode className="w-4 h-4" />
              Barkod ile
            </button>
            <button
              onClick={() => {
                setReturnType('receipt');
                setSelectedSale(null);
                setReturnItems({});
              }}
              className={`flex-1 min-w-[120px] px-3 py-2 rounded border-2 text-sm transition-all ${returnType === 'receipt'
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
              className={`flex-1 min-w-[120px] px-3 py-2 rounded border-2 text-sm transition-all ${returnType === 'product'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
            >
              {t.productBased}
            </button>
          </div>
        </div>

        {returnType === 'barcode' && (
          <div className="p-4 border-b border-gray-200 bg-blue-50/50">
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Barkod / ürün kodu okutun</label>
            <div className="flex gap-2">
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleBarcodeScan();
                  }
                }}
                placeholder="Barkod okutun veya yazın…"
                className="flex-1 px-3 py-2.5 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                autoFocus
              />
              <button
                type="button"
                onClick={handleBarcodeScan}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Bul
              </button>
            </div>
            {barcodeHint ? (
              <p className="mt-2 text-sm text-blue-800 font-medium">{barcodeHint}</p>
            ) : (
              <p className="mt-2 text-xs text-gray-500">Son satışlarda eşleşen ürün otomatik seçilir.</p>
            )}
          </div>
        )}

        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="w-1/2 border-r border-gray-200 flex flex-col">
            {returnType !== 'barcode' && (
              <div className="p-4 border-b border-gray-200">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder={returnType === 'receipt' ? t.searchReceiptPlaceholder : 'Ürün adı, kod veya barkod…'}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-auto p-3">
              {returnType === 'barcode' && !selectedSale ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
                  <Barcode className="w-14 h-14 mb-3 opacity-40" />
                  <p className="text-sm">İade için barkodu okutun</p>
                </div>
              ) : returnType === 'receipt' ? (
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
                          <span className="font-mono text-sm font-medium text-gray-900">{sale.receiptNumber}</span>
                          <span className="text-sm text-gray-900">{sale.total.toFixed(2)}</span>
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
              ) : returnType === 'product' ? (
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
                      const unit = group.item.unit || 'Adet';
                      const isWeight = isWeightBasedUnit(unit);

                      return (
                        <div key={key} className="p-3 rounded border-2 border-gray-200 bg-white">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h5 className="text-sm font-medium text-gray-900">
                                {group.item.productName}
                                {variantInfo && (
                                  <span className="ml-2 text-xs text-gray-500 font-normal">({variantInfo})</span>
                                )}
                              </h5>
                              {(group.item.productCode || group.item.barcode) && (
                                <p className="text-xs text-gray-500 font-mono mt-0.5">
                                  {group.item.productCode ? `Kod: ${group.item.productCode}` : ''}
                                  {group.item.barcode ? ` • ${group.item.barcode}` : ''}
                                </p>
                              )}
                              <p className="text-xs text-gray-600 mt-1">
                                {t.totalSale}: {formatScaleQuantityDisplay(group.totalQuantity, unit)} {unit} • {group.sales.length} {t.differentReceipts}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">İade miktarı:</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleQuantityChange(
                                  key,
                                  normalizeWeightProductQuantity((returnItems[key] || 0) - (isWeight ? 0.1 : 1), unit),
                                  group.totalQuantity,
                                )}
                                className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                              >
                                -
                              </button>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={returnItems[key] ? formatScaleQuantityDisplay(returnItems[key], unit) : ''}
                                onChange={(e) => {
                                  const val = parsePosQuantityForProduct(e.target.value, { unit });
                                  if (val <= group.totalQuantity) handleQuantityChange(key, val, group.totalQuantity);
                                }}
                                className="w-16 text-center border border-gray-300 rounded text-sm"
                              />
                              <button
                                onClick={() => handleQuantityChange(
                                  key,
                                  normalizeWeightProductQuantity((returnItems[key] || 0) + (isWeight ? 0.1 : 1), unit),
                                  group.totalQuantity,
                                )}
                                className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : selectedSale ? (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-xs text-orange-700 font-semibold mb-1">Seçili fiş</p>
                  <p className="font-mono text-sm font-bold">{selectedSale.receiptNumber}</p>
                  <p className="text-xs text-gray-600 mt-1">{new Date(selectedSale.date).toLocaleString('tr-TR')}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="w-1/2 flex flex-col">
            {!showReturnDetails ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <RotateCcw className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {returnType === 'barcode' ? 'Barkod okutun veya fiş seçin' : t.selectReceiptForReturn}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-auto p-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">
                    {returnType === 'product' ? t.selectedProducts : t.productsToReturn}
                  </h4>
                  <div className="space-y-2">
                    {selectedSale && (returnType === 'receipt' || returnType === 'barcode')
                      ? selectedSale.items.map((item, lineIndex) => {
                        const itemKey = getReceiptLineKey(selectedSale.id, lineIndex);
                        const unit = item.unit || 'Adet';
                        const isWeight = isWeightBasedUnit(unit);
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
                                    <span className="ml-2 text-xs text-gray-500 font-normal">({variantInfo})</span>
                                  )}
                                </h5>
                                <p className="text-xs text-gray-600">
                                  {t.saleQuantity}: {formatScaleQuantityDisplay(item.quantity, unit)} {unit} • {t.unitPrice}: {item.price.toFixed(2)} IQD
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-600">{t.returnQuantity}:</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleQuantityChange(
                                    itemKey,
                                    normalizeWeightProductQuantity((returnItems[itemKey] || 0) - (isWeight ? 0.1 : 1), unit),
                                    item.quantity,
                                  )}
                                  className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                                >
                                  -
                                </button>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={returnItems[itemKey] ? formatScaleQuantityDisplay(returnItems[itemKey], unit) : ''}
                                  onChange={(e) => {
                                    const val = parsePosQuantityForProduct(e.target.value, { unit });
                                    if (val <= item.quantity) handleQuantityChange(itemKey, val, item.quantity);
                                  }}
                                  className="w-16 text-center border border-gray-300 rounded text-sm"
                                />
                                <button
                                  onClick={() => handleQuantityChange(
                                    itemKey,
                                    normalizeWeightProductQuantity((returnItems[itemKey] || 0) + (isWeight ? 0.1 : 1), unit),
                                    item.quantity,
                                  )}
                                  className="w-6 h-6 bg-white hover:bg-gray-100 rounded flex items-center justify-center border border-gray-300"
                                >
                                  +
                                </button>
                                <button
                                  onClick={() => handleQuantityChange(itemKey, item.quantity, item.quantity)}
                                  className="ml-2 px-2 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
                                >
                                  {String(t.all)}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                      : null}
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
                    <span className="text-lg font-medium text-gray-900">{totalReturnAmount.toFixed(2)}</span>
                  </div>
                  <button
                    onClick={handleConfirmReturn}
                    disabled={Object.keys(returnItems).length === 0 || !returnReason}
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
