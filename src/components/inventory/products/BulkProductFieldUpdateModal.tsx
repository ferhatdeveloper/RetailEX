import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, SlidersHorizontal, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '../../../core/types';
import { useLanguage } from '../../../contexts/LanguageContext';
import { productAPI } from '../../../services/api/products';
import {
  PRODUCT_BULK_UPDATE_FIELDS,
  parseBulkUpdateRawValue,
  type BulkUpdateFieldKind,
} from './productBulkUpdateFields';

export function BulkProductFieldUpdateModal({
  products,
  showPurchasePricing,
  onClose,
  onApplied,
}: {
  products: Product[];
  showPurchasePricing: boolean;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { tm } = useLanguage();
  const fieldOptions = useMemo(
    () =>
      PRODUCT_BULK_UPDATE_FIELDS.filter((f) => !f.purchaseOnly || showPurchasePricing).map((f) => ({
        ...f,
        label:
          f.id.startsWith('specialCode')
            ? `${tm('specialCode')} ${f.id.replace('specialCode', '')}`
            : f.id.startsWith('priceList')
              ? `${tm('priceList')} ${f.id.replace('priceList', '')}`
              : tm(f.labelKey),
      })),
    [showPurchasePricing, tm]
  );

  const [fieldId, setFieldId] = useState(fieldOptions[0]?.id ?? 'category');
  const [rawValue, setRawValue] = useState('');
  const [busy, setBusy] = useState(false);

  const selectedField = fieldOptions.find((f) => f.id === fieldId) ?? fieldOptions[0];
  const kind: BulkUpdateFieldKind = selectedField?.kind ?? 'text';

  const renderValueInput = () => {
    if (kind === 'bool') {
      return (
        <select
          value={rawValue}
          onChange={(e) => setRawValue(e.target.value)}
          className="w-full px-3 py-2.5 border-2 border-blue-100 rounded-xl focus:outline-none focus:border-blue-500 bg-white text-sm font-medium"
        >
          <option value="">{tm('productBulkUpdateChooseValue')}</option>
          <option value="1">{tm('gridBoolYes')}</option>
          <option value="0">{tm('gridBoolNo')}</option>
        </select>
      );
    }
    if (kind === 'date') {
      return (
        <input
          type="date"
          value={rawValue}
          onChange={(e) => setRawValue(e.target.value)}
          className="w-full px-3 py-2.5 border-2 border-blue-100 rounded-xl focus:outline-none focus:border-blue-500 text-sm"
        />
      );
    }
    return (
      <input
        type={kind === 'text' ? 'text' : 'number'}
        step={kind === 'currency' || kind === 'percent' ? '0.01' : kind === 'number' ? '1' : undefined}
        value={rawValue}
        onChange={(e) => setRawValue(e.target.value)}
        placeholder={tm('productBulkUpdateValuePlaceholder')}
        className="w-full px-3 py-2.5 border-2 border-blue-100 rounded-xl focus:outline-none focus:border-blue-500 text-sm"
      />
    );
  };

  const handleApply = async () => {
    if (!selectedField) return;
    const parsed = parseBulkUpdateRawValue(kind, rawValue);
    if (parsed === undefined) {
      toast.error(tm('productBulkUpdateInvalidValue'));
      return;
    }
    setBusy(true);
    try {
      const ids = products.map((p) => p.id).filter(Boolean);
      const patch: Partial<Product> = { [selectedField.id]: parsed as never };
      const updated = await productAPI.bulkUpdate(ids, patch);
      toast.success(
        tm('productBulkUpdateSuccess')
          .replace('{count}', String(updated))
          .replace('{field}', selectedField.label)
      );
      onApplied();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || tm('productBulkUpdateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const panel = (
    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-4 border-b bg-blue-50 flex items-center justify-between gap-2">
          <h3 className="font-bold text-blue-900 flex items-center gap-2 text-sm sm:text-base">
            <SlidersHorizontal className="w-5 h-5 shrink-0" />
            {tm('productBulkUpdateTitle').replace('{count}', String(products.length))}
          </h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-blue-100 rounded-lg text-blue-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">{tm('productBulkUpdateHint')}</p>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{tm('productBulkUpdateField')}</label>
            <select
              value={fieldId}
              onChange={(e) => {
                setFieldId(e.target.value);
                setRawValue('');
              }}
              className="w-full px-3 py-2.5 border-2 border-gray-100 rounded-xl focus:outline-none focus:border-blue-500 bg-white text-sm font-medium"
            >
              {fieldOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{tm('productBulkUpdateNewValue')}</label>
            {renderValueInput()}
          </div>
        </div>

        <div className="p-4 bg-gray-50 flex gap-3 justify-end border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 font-medium">
            {tm('cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleApply()}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold shadow-lg shadow-blue-200 disabled:opacity-60 flex items-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {tm('apply')}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(panel, document.body) : null;
}
