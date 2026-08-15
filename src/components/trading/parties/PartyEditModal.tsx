import React, { useEffect, useState } from 'react';
import { useNestedT } from './useNestedT';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../../shared/PercentBodyModal';
import { ChevronDown, X, Loader2 } from 'lucide-react';
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

const CARD_TYPE_OPTIONS: { value: PartyCardType; labelKey: string; color: string }[] = [
  { value: 'customer', labelKey: 'party.cardType.customer', color: 'bg-blue-100 text-blue-700' },
  { value: 'supplier', labelKey: 'party.cardType.supplier', color: 'bg-amber-100 text-amber-700' },
  { value: 'employee', labelKey: 'party.cardType.employee', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'partner', labelKey: 'party.cardType.partner', color: 'bg-purple-100 text-purple-700' },
];

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

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const handleCardTypeChange = async (ct: PartyCardType) => {
    if (ct === form.card_type) return;
    update({ card_type: ct });
    if (!form.code && !isEdit) {
      try {
        const nextCode = await partyAPI.getNextCode(ct, ct.toUpperCase().slice(0, 3));
        update({ code: nextCode });
      } catch {
        // ignore
      }
    }
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
      const payload: any = {
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
      const saved = isEdit && initial
        ? await partyAPI.update(initial.id, payload)
        : await partyAPI.create(payload);
      onSaved(saved);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={t('party.editModal.title')}>
      <form onSubmit={handleSubmit} className="flex flex-col min-h-0 max-h-full">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {isEdit ? t('party.editModal.titleEdit') : t('party.editModal.titleNew')}
            </h2>
            <p className="text-blue-100 text-sm mt-1">{t('party.editModal.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/10 transition"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <PercentBodyModalScrollBody className="p-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('party.fields.cardType')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {CARD_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleCardTypeChange(opt.value)}
                    className={`px-3 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition border-2 ${
                      form.card_type === opt.value
                        ? `${opt.color} border-transparent shadow-md`
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <Field
              label={t('party.fields.code')}
              value={form.code}
              onChange={(v) => update({ code: v })}
              placeholder={t('party.fields.codePlaceholder')}
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

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('party.fields.address')}
              </label>
              <textarea
                value={form.address}
                onChange={(e) => update({ address: e.target.value })}
                rows={2}
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium resize-none"
              />
            </div>

            {form.card_type === 'employee' && (
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div className="sm:col-span-2 text-sm font-bold text-emerald-700 uppercase tracking-wider">
                  {t('party.employeeSection')}
                </div>
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
            )}

            {form.card_type === 'partner' && (
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div className="sm:col-span-2 text-sm font-bold text-purple-700 uppercase tracking-wider">
                  {t('party.partnerSection')}
                </div>
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
            )}

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                {t('party.fields.notes')}
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => update({ notes: e.target.value })}
                rows={2}
                className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium resize-none"
              />
            </div>

            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={(e) => update({ is_active: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-slate-700">
                {t('party.fields.active')}
              </label>
            </div>

            {error && (
              <div className="sm:col-span-2 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                {error}
              </div>
            )}
          </div>
        </PercentBodyModalScrollBody>

        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex gap-4 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider py-3 hover:bg-slate-100 active:scale-[0.98] transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider py-3 shadow-lg shadow-blue-200/50 hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? t('common.update') : t('common.create')}
          </button>
        </div>
      </form>
    </PercentBodyModal>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  className?: string;
}

function Field({ label, value, onChange, type = 'text', required, placeholder, hint, className = '' }: FieldProps) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium"
      />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}

function SelectField({ label, value, onChange, options, required }: SelectFieldProps) {
  return (
    <div className="relative">
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-4 py-3 pr-11 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium appearance-none bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-[42px] -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
    </div>
  );
}
