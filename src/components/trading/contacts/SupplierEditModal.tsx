import React, { useEffect, useState } from 'react';
import { X, Loader2, CalendarClock, Truck, Users, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '../../../contexts/LanguageContext';
import { supplierAPI } from '../../../services/api/suppliers';
import type { Supplier } from '../../../core/types/models';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import {
  CUSTOMER_CALL_WEEKDAYS,
  normalizeCustomerCallWeekdays,
  customerCallWeekdaysLabel,
} from '../../../utils/customerCallPlan';

export type SupplierCardType = 'customer' | 'supplier';

export interface SupplierEditModalProps {
  initial?: Supplier | null;
  /** Yeni kayıt için başlangıç kart tipi (CallerID genelde customer). */
  defaultCardType?: SupplierCardType;
  /** CallerID vb. ile önceden doldurulmuş telefon. */
  initialPhone?: string;
  onClose: () => void;
  onSaved: (supplier: Supplier, cardType: SupplierCardType) => void;
}

interface FormState {
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  payment_terms: number;
  credit_limit: number;
  tax_number: string;
  tax_office: string;
  notes: string;
  call_plan_enabled: boolean;
  call_plan_weekdays: number[];
  call_plan_note: string;
  cardType: SupplierCardType;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  payment_terms: 30,
  credit_limit: 0,
  tax_number: '',
  tax_office: '',
  notes: '',
  call_plan_enabled: false,
  call_plan_weekdays: [],
  call_plan_note: '',
  cardType: 'supplier',
};

export function SupplierEditModal({
  initial,
  defaultCardType,
  initialPhone,
  onClose,
  onSaved,
}: SupplierEditModalProps) {
  const { t, tm } = useLanguage();
  const isEdit = !!initial;
  const [formData, setFormData] = useState<FormState>(() => {
    if (initial) {
      return {
        code: initial.code || '',
        name: initial.name || '',
        phone: initial.phone || '',
        email: initial.email || '',
        address: initial.address || '',
        city: initial.city || '',
        payment_terms: typeof initial.payment_terms === 'number' ? initial.payment_terms : 30,
        credit_limit: initial.credit_limit || 0,
        tax_number: initial.tax_number || '',
        tax_office: initial.tax_office || '',
        notes: initial.notes || '',
        call_plan_enabled: initial.call_plan_enabled === true,
        call_plan_weekdays: normalizeCustomerCallWeekdays(initial.call_plan_weekdays),
        call_plan_note: initial.call_plan_note || '',
        cardType: (initial.cardType as SupplierCardType) || 'supplier',
      };
    }
    return {
      ...EMPTY_FORM,
      cardType: defaultCardType || 'supplier',
      phone: initialPhone || '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  /** Yeni kayıtlarda otomatik kod üret. */
  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    void supplierAPI
      .generateCode(formData.cardType)
      .then((code) => {
        if (!cancelled) setFormData((prev) => ({ ...prev, code }));
      })
      .catch(() => {
        // no-op
      });
    return () => {
      cancelled = true;
    };
  }, [formData.cardType, initial]);

  const toggleWeekday = (day: number) => {
    const selected = formData.call_plan_weekdays.includes(day);
    setFormData((prev) => ({
      ...prev,
      call_plan_weekdays: selected
        ? prev.call_plan_weekdays.filter((v) => v !== day)
        : [...prev.call_plan_weekdays, day].sort((a, b) => a - b),
    }));
  };

  const handleCardTypeChange = (target: SupplierCardType) => {
    if (target === formData.cardType) return;
    setFormData((prev) => ({ ...prev, cardType: target }));
  };

  const handleCopyCode = async () => {
    if (!formData.code) return;
    try {
      await navigator.clipboard.writeText(formData.code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      toast.error('Kod kopyalanamadı');
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Ad zorunludur');
      return;
    }
    const saveData = {
      ...formData,
      call_plan_enabled:
        formData.cardType === 'customer' &&
        formData.call_plan_enabled === true &&
        normalizeCustomerCallWeekdays(formData.call_plan_weekdays).length > 0,
      call_plan_weekdays:
        formData.cardType === 'customer' && formData.call_plan_enabled
          ? normalizeCustomerCallWeekdays(formData.call_plan_weekdays)
          : [],
      call_plan_note:
        formData.cardType === 'customer' && formData.call_plan_enabled
          ? formData.call_plan_note.trim() || null
          : null,
    };
    setSaving(true);
    try {
      if (initial) {
        const prevType = (initial.cardType as SupplierCardType) || 'supplier';
        if (prevType !== saveData.cardType) {
          const updated = await supplierAPI.transferCardType(
            initial.id,
            prevType,
            saveData.cardType,
            saveData
          );
          toast.success(tm('accountTypeChanged') || 'Cari tipi değiştirildi');
          onSaved(updated, saveData.cardType);
        } else {
          const updated = await supplierAPI.update(initial.id, saveData);
          toast.success('Güncellendi');
          onSaved(updated, saveData.cardType);
        }
      } else {
        const created = await supplierAPI.create(saveData);
        toast.success(
          saveData.cardType === 'customer'
            ? 'Müşteri cari hesabı eklendi'
            : 'Satıcı cari hesabı eklendi'
        );
        onSaved(created, saveData.cardType);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = isEdit ? tm('edit') : tm('newCurrentAccount');
  const submitLabel = isEdit ? tm('save') : tm('add');

  return (
    <PercentBodyModal
      onClose={onClose}
      size="wide"
      ariaLabel={modalTitle}
      shellClassName="bg-white dark:bg-gray-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100 uppercase tracking-tighter truncate">
            {modalTitle}
          </h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase mt-0.5">
            {formData.cardType === 'customer' ? tm('customer') : tm('supplierLabel')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          aria-label={tm('cancel')}
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <PercentBodyModalScrollBody className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleCardTypeChange('customer')}
            className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
              formData.cardType === 'customer'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
            }`}
          >
            <Users
              className={`w-5 h-5 ${formData.cardType === 'customer' ? 'text-blue-600' : 'text-gray-400'}`}
            />
            <span
              className={`text-sm font-bold ${
                formData.cardType === 'customer' ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500'
              }`}
            >
              {tm('customer')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleCardTypeChange('supplier')}
            className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
              formData.cardType === 'supplier'
                ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30'
                : 'border-gray-200 dark:border-gray-700 hover:border-orange-300'
            }`}
          >
            <Truck
              className={`w-5 h-5 ${formData.cardType === 'supplier' ? 'text-orange-500' : 'text-gray-400'}`}
            />
            <span
              className={`text-sm font-bold ${
                formData.cardType === 'supplier' ? 'text-orange-700 dark:text-orange-300' : 'text-gray-500'
              }`}
            >
              {tm('supplierLabel')}
            </span>
          </button>
        </div>

        {initial && initial.cardType !== formData.cardType && (
          <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            {tm('accountTypeChanged') || 'Kayıt yeni tipe taşınacak; fişler yeni cari kartına aktarılır.'}
          </div>
        )}

        {formData.cardType === 'customer' && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20 p-4">
            <div className="mb-3 flex items-start gap-2">
              <CalendarClock className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-400" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  Müşteri arama planı
                </p>
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  Bu müşteri haftanın hangi günü aranacak?
                </p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-amber-900 dark:text-amber-200">
                Aranacak günler
              </p>
              <div className="flex flex-wrap gap-2">
                {CUSTOMER_CALL_WEEKDAYS.map((day) => {
                  const selected = formData.call_plan_weekdays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWeekday(day.value)}
                      aria-pressed={selected}
                      className={`rounded-full border px-3 py-1.5 text-xs font-black transition-all ${
                        selected
                          ? 'border-blue-600 bg-blue-600 text-white shadow-md ring-2 ring-blue-200'
                          : 'border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                      }`}
                    >
                      {selected ? `✓ ${day.tr}` : day.tr}
                    </button>
                  );
                })}
              </div>
              {formData.call_plan_weekdays.length > 0 ? (
                <p className="mt-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 px-3 py-2 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                  Seçili günler: {customerCallWeekdaysLabel(formData.call_plan_weekdays)}
                </p>
              ) : null}
              <div className="mt-3">
                <label className="mb-1 block text-[11px] font-black uppercase tracking-wide text-amber-900 dark:text-amber-200">
                  Plan notu
                </label>
                <textarea
                  value={formData.call_plan_note}
                  onChange={(e) => setFormData({ ...formData, call_plan_note: e.target.value })}
                  rows={2}
                  placeholder="Örn. Kampanya, rutin kontrol veya özel arama sebebi"
                  className="w-full rounded-lg border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                Birden fazla gün seçebilirsiniz; seçili müşteriler Arama Listesi ekranında görünür.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label={tm('code')}>
            <div className="flex">
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="Otomatik"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {formData.code ? (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Kodu kopyala"
                  aria-label="Kodu kopyala"
                >
                  {codeCopied ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              ) : null}
            </div>
          </Field>
          <Field label={`${tm('currentAccountTitle')} *`}>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={tm('phoneLabel')}>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          <Field label={tm('emailLabel')}>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
        </div>

        <Field label={tm('address')}>
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={tm('city')}>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
          {formData.cardType === 'supplier' && (
            <Field label={tm('paymentTermDays')}>
              <input
                type="number"
                value={formData.payment_terms}
                onChange={(e) =>
                  setFormData({ ...formData, payment_terms: parseInt(e.target.value) || 30 })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          )}
        </div>

        {formData.cardType === 'supplier' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label={tm('creditLimit')}>
              <input
                type="number"
                value={formData.credit_limit}
                onChange={(e) =>
                  setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
            <Field label={tm('taxNumberLabel')}>
              <input
                type="text"
                value={formData.tax_number}
                onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </Field>
          </div>
        )}

        {formData.cardType === 'customer' && (
          <Field label={tm('taxNumberLabel')}>
            <input
              type="text"
              value={formData.tax_number}
              onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </Field>
        )}

        <Field label={tm('notesLabel')}>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Field>
      </PercentBodyModalScrollBody>

      <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex gap-3 justify-end shrink-0">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {tm('cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors disabled:opacity-50 inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {submitLabel}
        </button>
      </div>
    </PercentBodyModal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
