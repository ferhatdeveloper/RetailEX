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
  const { tm } = useLanguage();
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
    const weekdays =
      formData.cardType === 'customer' && formData.call_plan_weekdays.length > 0
        ? normalizeCustomerCallWeekdays(formData.call_plan_weekdays)
        : [];
    const saveData = {
      ...formData,
      call_plan_enabled: weekdays.length > 0,
      call_plan_weekdays: weekdays,
      call_plan_note:
        formData.cardType === 'customer' && weekdays.length > 0
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

  const modalTitle = isEdit
    ? formData.cardType === 'customer'
      ? tm('editCustomer') || 'Müşteri düzenle'
      : tm('editSupplier') || 'Tedarikçi düzenle'
    : tm('newCurrentAccount') || 'Yeni cari hesap';
  const submitLabel = isEdit ? tm('save') || 'Kaydet' : tm('add') || 'Ekle';
  const isCustomer = formData.cardType === 'customer';
  const headerGrad = isCustomer
    ? 'bg-gradient-to-r from-blue-600 to-indigo-600'
    : 'bg-gradient-to-r from-orange-500 to-amber-600';
  const inputClass =
    'w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium bg-white';

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={modalTitle}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSave();
        }}
        className="flex flex-col min-h-0 max-h-full"
      >
        <div className={`${headerGrad} px-8 py-6 text-white shrink-0 flex items-center justify-between`}>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold truncate">{modalTitle}</h2>
            <p className="text-white/80 text-sm mt-1">
              {isCustomer
                ? tm('customer') || 'Müşteri (Alıcı)'
                : tm('supplierLabel') || 'Tedarikçi (Satıcı)'}
              {formData.code ? ` · ${formData.code}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 transition shrink-0"
            aria-label={tm('cancel')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <PercentBodyModalScrollBody className="p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <p className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {tm('accountType') || 'Cari tipi'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCardTypeChange('customer')}
                  className={`flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition border-2 ${
                    isCustomer
                      ? 'bg-blue-100 text-blue-700 border-transparent shadow-md'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  {tm('customer') || 'Müşteri'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCardTypeChange('supplier')}
                  className={`flex items-center justify-center gap-2 px-3 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition border-2 ${
                    !isCustomer
                      ? 'bg-amber-100 text-amber-800 border-transparent shadow-md'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <Truck className="w-4 h-4" />
                  {tm('supplierLabel') || 'Tedarikçi'}
                </button>
              </div>
            </div>

            {initial && initial.cardType !== formData.cardType && (
              <div className="sm:col-span-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                {tm('accountTypeChanged') ||
                  'Kayıt yeni tipe taşınacak; fişler yeni cari kartına aktarılır.'}
              </div>
            )}

            <Field label={tm('code') || 'Kod'}>
              <div className="flex">
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="Otomatik"
                  className={`${inputClass} rounded-r-none`}
                />
                {formData.code ? (
                  <button
                    type="button"
                    onClick={() => void handleCopyCode()}
                    className="px-4 border border-l-0 border-slate-200 rounded-r-2xl text-slate-500 hover:bg-slate-50 transition-colors"
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
            <Field label={`${tm('currentAccountTitle') || 'Unvan'} *`}>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={tm('namePlaceholder') || 'Ad / ünvan'}
                className={inputClass}
              />
            </Field>

            <Field label={tm('phoneLabel') || 'Telefon'}>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={tm('emailLabel') || 'E-posta'}>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={inputClass}
              />
            </Field>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {tm('address') || 'Adres'}
              </label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            <Field label={tm('city') || 'Şehir'}>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={tm('taxNumberLabel') || 'Vergi no'}>
              <input
                type="text"
                value={formData.tax_number}
                onChange={(e) => setFormData({ ...formData, tax_number: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label={tm('taxOffice') || 'Vergi dairesi'}>
              <input
                type="text"
                value={formData.tax_office}
                onChange={(e) => setFormData({ ...formData, tax_office: e.target.value })}
                className={inputClass}
              />
            </Field>

            {!isCustomer && (
              <>
                <Field label={tm('paymentTermDays') || 'Vade (gün)'}>
                  <input
                    type="number"
                    value={formData.payment_terms}
                    onChange={(e) =>
                      setFormData({ ...formData, payment_terms: parseInt(e.target.value, 10) || 30 })
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label={tm('creditLimit') || 'Kredi limiti'}>
                  <input
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) =>
                      setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })
                    }
                    className={inputClass}
                  />
                </Field>
              </>
            )}

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {tm('notesLabel') || 'Notlar'}
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className={`${inputClass} resize-none`}
              />
            </div>

            {isCustomer && (
              <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="mb-3 flex items-start gap-2">
                  <CalendarClock className="mt-0.5 h-4 w-4 text-blue-600" />
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                      Müşteri arama planı
                    </p>
                    <p className="text-[11px] font-medium text-slate-500">
                      Haftanın hangi günü aranacak? Birden fazla gün seçilebilir.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {CUSTOMER_CALL_WEEKDAYS.map((day) => {
                    const selected = formData.call_plan_weekdays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleWeekday(day.value)}
                        aria-pressed={selected}
                        className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all ${
                          selected
                            ? 'border-blue-600 bg-blue-600 text-white shadow-md'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {day.tr}
                      </button>
                    );
                  })}
                </div>
                {formData.call_plan_weekdays.length > 0 ? (
                  <p className="mt-2 text-[11px] font-bold text-blue-700">
                    Seçili: {customerCallWeekdaysLabel(formData.call_plan_weekdays)}
                  </p>
                ) : null}
                <label className="mt-3 mb-1 block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Plan notu
                </label>
                <textarea
                  value={formData.call_plan_note}
                  onChange={(e) => setFormData({ ...formData, call_plan_note: e.target.value })}
                  rows={2}
                  placeholder="Örn. Kampanya, rutin kontrol"
                  className={`${inputClass} resize-none`}
                />
              </div>
            )}
          </div>
        </PercentBodyModalScrollBody>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider py-3 hover:bg-slate-100 active:scale-[0.98] transition disabled:opacity-50"
          >
            {tm('cancel') || 'İptal'}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider py-3 shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] transition inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {submitLabel}
          </button>
        </div>
      </form>
    </PercentBodyModal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}
