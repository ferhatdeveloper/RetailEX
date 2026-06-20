import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, Plus } from 'lucide-react';
import type { Product } from '../../core/types';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatPosQuantityInput, parsePosQuantityForProduct } from '../../utils/numberFormatter';
import { productUnitLabel, productUsesDecimalQuantity } from '../../utils/productUnits';
import { formatMoneyWithCode, getGlobalCurrency } from '../../utils/currency';

interface POSProductQuantityModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (product: Product, quantity: number) => void;
  darkMode?: boolean;
}

export function POSProductQuantityModal({
  product,
  onClose,
  onConfirm,
  darkMode = false,
}: POSProductQuantityModalProps) {
  const { tm } = useLanguage();
  const decimalQty = productUsesDecimalQuantity(product);
  const unitLabel = productUnitLabel(product.unit);
  const [quantityInput, setQuantityInput] = useState(decimalQty ? '' : '1');

  useEffect(() => {
    setQuantityInput(decimalQty ? '' : '1');
  }, [product.id, decimalQty]);

  const qtyHint = decimalQty
    ? unitLabel === 'GR'
      ? tm('posQtyHintGram')
      : tm('posQtyHintWeight').replace('{unit}', unitLabel || 'KG')
    : tm('posQtyHintPiece');

  const qtyPlaceholder = decimalQty
    ? unitLabel === 'GR'
      ? '350'
      : '1,250'
    : '1';

  const title = decimalQty
    ? tm('posQtyTitleWeight').replace('{unit}', unitLabel || 'KG')
    : tm('posQtyTitlePiece');

  const apply = () => {
    const n = parsePosQuantityForProduct(quantityInput, product);
    if (!Number.isFinite(n)) return;
    onConfirm(product, n);
    onClose();
  };

  const priceText = formatMoneyWithCode(
    product.price ?? 0,
    product.currency || getGlobalCurrency()
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[6000] flex items-center justify-center p-4">
      <div
        className={`w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden ${
          darkMode ? 'bg-gray-800 text-white' : 'bg-white text-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 flex items-start justify-between text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-lg truncate">{product.name}</h3>
              <p className="text-xs text-white/80 font-bold mt-0.5">{priceText}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div
            className={`rounded-xl border-2 p-4 space-y-3 ${
              darkMode ? 'border-blue-800 bg-blue-950/40' : 'border-blue-100 bg-blue-50/50'
            }`}
          >
            <div
              className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                darkMode ? 'text-blue-300' : 'text-blue-800/80'
              }`}
            >
              <Plus className="w-4 h-4 shrink-0" /> {title}
            </div>
            <div className="flex gap-2 items-stretch">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={quantityInput}
                onChange={(e) => setQuantityInput(formatPosQuantityInput(e.target.value, decimalQty))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    apply();
                  }
                }}
                placeholder={qtyPlaceholder}
                className={`flex-1 min-w-0 px-4 py-3 rounded-xl border-2 text-center text-lg font-black tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                  darkMode
                    ? 'border-blue-700 bg-gray-900 text-white'
                    : 'border-blue-100 bg-white text-slate-900'
                }`}
                aria-label={tm('posQtyAria')}
              />
              {unitLabel ? (
                <span
                  className={`shrink-0 self-center px-3 text-sm font-black uppercase tabular-nums ${
                    darkMode ? 'text-blue-300' : 'text-blue-700'
                  }`}
                >
                  {unitLabel}
                </span>
              ) : null}
            </div>
            <p className={`text-[10px] font-medium leading-tight ${darkMode ? 'text-gray-400' : 'text-slate-500'}`}>
              {qtyHint}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-wide border-2 ${
                darkMode
                  ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {tm('giveUp')}
            </button>
            <button
              type="button"
              onClick={apply}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-wide shadow-md"
            >
              {tm('posNumpadOk')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
