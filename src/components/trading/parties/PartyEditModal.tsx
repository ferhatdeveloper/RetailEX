import React, { useEffect, useState } from 'react';
import { useNestedT } from './useNestedT';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import {
  Briefcase,
  ChevronDown,
  HandCoins,
  Loader2,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { partyAPI } from '../../../services/api/parties';
import type { Party, PartyCardType } from '../../../core/types/models';

export interface PartyEditModalProps {
  initial?: Party | null;
  defaultCardType?: PartyCardType;
  onClose: () => void;
  onSaved: (party: Party) => void;
}

interface FormState {
  card_type: PartyCardType;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  tax_nr: string;
  tax_office: string;
  notes: string;
  is_active: boolean;
  salary_base: string;
  hire_date: string;
  department: string;
  position: string;
  share_pct: string;
  capital_contribution: string;
  partner_role: string;
  partner_since: string;
  iban: string;
}

const CARD_TYPE_OPTIONS: {
  value: PartyCardType;
  labelKey: string;
  active: string;
  icon: typeof Users;
}[] = [
  { value: 'customer', labelKey: 'party.cardType.customer', active: 'bg-blue-100 text-blue-700', icon: Users },
  { value: 'supplier', labelKey: 'party.cardType.supplier', active: 'bg-amber-100 text-amber-800', icon: Truck },
  { value: 'employee', labelKey: 'party.cardType.employee', active: 'bg-emerald-100 text-emerald-800', icon: Briefcase },
  { value: 'partner', labelKey: 'party.cardType.partner', active: 'bg-purple-100 text-purple-800', icon: HandCoins },
];

const HEADER_GRAD: Record<PartyCardType, string> = {
  customer: 'bg-gradient-to-r from-blue-600 to-indigo-600',
  supplier: 'bg-gradient-to-r from-orange-500 to-amber-600',
  employee: 'bg-gradient-to-r from-emerald-600 to-teal-600',
  partner: 'bg-gradient-to-r from-violet-600 to-purple-600',
};

const CODE_PREFIX: Record<PartyCardType, string> = {
  customer: 'MUS',
  supplier: 'TED',
  employee: 'PER',
  partner: 'ORT',
};

export function PartyEditModal({ initial, defaultCardType, onClose, onSaved }: PartyEditModalProps) {
  const t = useNestedT();
  const isEdit = !!initial;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(() => ({
    card_type: initial?.card_type || defaultCardType || 'customer',
    code: initial?.code || '',
    name: initial?.name || '',
    phone: initial?.phone || '',
    email: initial?.email || '',
    address: initial?.address || '',
    tax_nr: initial?.tax_nr || '',
    tax_office: initial?.tax_office || '',
    notes: initial?.notes || '',
    is_active: initial?.is_active !== false,
    salary_base: initial?.salary_base != null ? String(initial.salary_base) : '',
    hire_date: initial?.hire_date || '',
    department: initial?.department || '',
    position: initial?.position || '',
    share_pct: initial?.share_pct != null ? String(initial.share_pct) : '',
    capital_contribution: initial?.capital_contribution != null ? String(initial.capital_contribution) : '',
    partner_role: initial?.partner_role || '',
    partner_since: initial?.partner_since || '',
    iban: initial?.iban || '',
  }));

  useEffect(() => {
    if (defaultCardType && !isEdit) {
      setForm((f) => ({ ...f, card_type: defaultCardType }));
    }
  }, [defaultCardType, isEdit]);

  useEffect(() => {
    if (isEdit || form.code) return;
    let cancelled = false;
    void partyAPI
      .getNextCode(form.card_type, CODE_PREFIX[form.card_type])
      .then((code) => {
        if (!cancelled) setForm((f) => (f.code ? f : { ...f, code }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.card_type, form.code, isEdit]);

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const handleCardTypeChange = (ct: PartyCardType) => {
    if (ct === form.card_type) return;
    if (isEdit) {
      update({ card_type: ct });
      return;
    }
    update({ card_type: ct, code: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError(t('party.error.nameRequired'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        card_type: form.card_type,
        code: form.code || null,
        name: form.name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        tax_nr: form.tax_nr || null,
        tax_office: form.tax_office || null,
        notes: form.notes || null,
        is_active: form.is_active,
      };
      if (form.card_type === 'employee') {
        payload.salary_base = form.salary_base ? parseFloat(form.salary_base) : 0;
        payload.hire_date = form.hire_date || null;
        payload.department = form.department || null;
        payload.position = form.position || null;
      }
      if (form.card_type === 'partner') {
        payload.share_pct = form.share_pct ? parseFloat(form.share_pct) : 0;
        payload.capital_contribution = form.capital_contribution ? parseFloat(form.capital_contribution) : 0;
        payload.partner_role = form.partner_role || null;
        payload.partner_since = form.partner_since || null;
        payload.iban = form.iban || null;
      }
      const saved =
        isEdit && initial
          ? await partyAPI.update(initial.id, payload)
          : await partyAPI.create(payload);
      onSaved(saved);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const typeLabel = t(`party.cardType.${form.card_type}`);
  const title = isEdit
    ? t('party.editModal.titleEdit') || 'Cari düzenle'
    : t('party.editModal.titleNew') || 'Yeni cari';

  return (
    <PercentBodyModal onClose={onClose} size="form" ariaLabel={title}>
      <form onSubmit={handleSubmit} className="contents">
        <div
          className={`${HEADER_GRAD[form.card_type]} px-6 py-4 text-white shrink-0 flex items-center justify-between gap-3`}
        >
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{title}</h2>
            <p className="text-white/80 text-sm mt-0.5 truncate">
              {typeLabel}
              {form.code ? ` · ${form.code}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 transition shrink-0"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <PercentBodyModalScrollBody className="p-4 sm:p-5 space-y-4">
          <section>
            <p className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              {t('party.fields.cardType')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CARD_TYPE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = form.card_type === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleCardTypeChange(opt.value)}
                    className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wide transition border-2 ${
                      selected
                        ? `${opt.active} border-transparent shadow-sm`
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{t(opt.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label={t('party.fields.code')}
              value={form.code}
              onChange={(v) => update({ code: v })}
              placeholder={t('party.fields.codePlaceholder') || 'Otomatik'}
            />
            <Field
              label={t('party.fields.name')}
              value={form.name}
              onChange={(v) => update({ name: v })}
              required
              placeholder={t('party.fields.namePlaceholder')}
            />
            <Field
              label={t('party.fields.phone')}
              value={form.phone}
              onChange={(v) => update({ phone: v })}
            />
            <Field
              label={t('party.fields.email')}
              value={form.email}
              onChange={(v) => update({ email: v })}
              type="email"
            />
            <Field
              label={t('party.fields.taxNr')}
              value={form.tax_nr}
              onChange={(v) => update({ tax_nr: v })}
            />
            <Field
              label={t('party.fields.taxOffice')}
              value={form.tax_office}
              onChange={(v) => update({ tax_office: v })}
            />
            <Field
              label={t('party.fields.address')}
              value={form.address}
              onChange={(v) => update({ address: v })}
              className="sm:col-span-2"
            />
          </section>

          {form.card_type === 'employee' && (
            <section className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-800 mb-3">
                {t('party.employeeSection')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label={t('party.employee.salaryBase')}
                  value={form.salary_base}
                  onChange={(v) => update({ salary_base: v })}
                  type="number"
                />
                <Field
                  label={t('party.employee.hireDate')}
                  value={form.hire_date}
                  onChange={(v) => update({ hire_date: v })}
                  type="date"
                />
                <Field
                  label={t('party.employee.department')}
                  value={form.department}
                  onChange={(v) => update({ department: v })}
                />
                <Field
                  label={t('party.employee.position')}
                  value={form.position}
                  onChange={(v) => update({ position: v })}
                />
              </div>
            </section>
          )}

          {form.card_type === 'partner' && (
            <section className="rounded-2xl border border-purple-100 bg-purple-50/60 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-purple-800 mb-3">
                {t('party.partnerSection')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label={t('party.partner.sharePct')}
                  value={form.share_pct}
                  onChange={(v) => update({ share_pct: v })}
                  type="number"
                  hint="%"
                />
                <Field
                  label={t('party.partner.capitalContribution')}
                  value={form.capital_contribution}
                  onChange={(v) => update({ capital_contribution: v })}
                  type="number"
                />
                <SelectField
                  label={t('party.partner.role')}
                  value={form.partner_role}
                  onChange={(v) => update({ partner_role: v })}
                  options={[
                    { value: '', label: '—' },
                    { value: 'major', label: t('party.partner.roleMajor') },
                    { value: 'minor', label: t('party.partner.roleMinor') },
                  ]}
                />
                <Field
                  label={t('party.partner.partnerSince')}
                  value={form.partner_since}
                  onChange={(v) => update({ partner_since: v })}
                  type="date"
                />
                <Field
                  label={t('party.partner.iban')}
                  value={form.iban}
                  onChange={(v) => update({ iban: v })}
                  className="sm:col-span-2"
                />
              </div>
            </section>
          )}

          <section>
            <Field
              label={t('party.fields.notes')}
              value={form.notes}
              onChange={(v) => update({ notes: v })}
            />
            <label className="mt-4 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => update({ is_active: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-700">{t('party.fields.active')}</span>
            </label>
          </section>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm break-words">
              {error}
            </div>
          )}
        </PercentBodyModalScrollBody>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0 mt-auto">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider py-3 hover:bg-slate-100 active:scale-[0.98] transition"
          >
            {t('common.cancel', 'İptal')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider py-3 shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] transition inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isEdit ? t('common.update', 'Güncelle') : t('common.create', 'Kaydet')}
          </button>
        </div>
      </form>
    </PercentBodyModal>
  );
}

const INPUT_CLASS =
  'w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium bg-white';

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  placeholder,
  hint,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={INPUT_CLASS}
      />
      {hint ? <p className="text-xs text-slate-400 mt-1">{hint}</p> : null}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={`${INPUT_CLASS} pr-11 appearance-none`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
          aria-hidden
        />
      </div>
    </div>
  );
}
