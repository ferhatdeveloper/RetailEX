import React from 'react';
import { Input, Select, Segmented } from 'antd';
import { RetailExFlatFieldLabel } from '../../shared/RetailExFlatModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { BeautyCustomer } from '../../../types/beauty';

/** RetailExFlatModal (body portal) içindeki Select dropdown z-index */
const ANT_SELECT_POPUP_Z = 2147483647;
export const beautyCustomerFormSelectProps = {
    getPopupContainer: () => document.body,
    styles: { popup: { root: { zIndex: ANT_SELECT_POPUP_Z } as React.CSSProperties } },
} as const;

export const BEAUTY_CUSTOMER_EMPTY_FORM: Partial<BeautyCustomer> = {
    name: '',
    phone: '',
    phone2: '',
    age: null,
    birth_date: null,
    file_id: '',
    occupation: '',
    gender: null,
    customer_tier: 'normal',
    heard_from: '',
    email: '',
    address: '',
    city: '',
    notes: '',
};

export function normalizeBeautyCustomerGender(
    raw: unknown,
): 'female' | 'male' | 'other' | null {
    const s = String(raw ?? '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'female' || s === 'f' || s === 'kadın' || s === 'kadin' || s === 'k') return 'female';
    if (s === 'male' || s === 'm' || s === 'erkek' || s === 'e') return 'male';
    if (s === 'other' || s === 'diğer' || s === 'diger' || s === 'd') return 'other';
    return null;
}

function genderRawLabel(raw: unknown): string {
    return String(raw ?? '').trim();
}

export type BeautyCustomerEditFormFieldsProps = {
    value: Partial<BeautyCustomer>;
    onChange: (patch: Partial<BeautyCustomer>) => void;
    /** Düzenlemede randevu / son işlem özeti (salt okunur) */
    summary?: {
        appointmentCount?: number;
        lastServiceName?: string | null;
        lastAppointmentDate?: string | null;
    };
};

/**
 * Güzellik müşteri yeni/düzenle formu — CRM listesi ve müşteri detay sayfasında ortak.
 */
export function BeautyCustomerEditFormFields({
    value,
    onChange,
    summary,
}: BeautyCustomerEditFormFieldsProps) {
    const { tm } = useLanguage();
    const set = (patch: Partial<BeautyCustomer>) => onChange({ ...value, ...patch });
    const formatDate = (d?: string | null) =>
        d ? new Date(d).toLocaleDateString(tm('localeCode') || 'tr-TR') : '—';

    const showSummary =
        summary != null &&
        (summary.appointmentCount != null ||
            summary.lastServiceName != null ||
            summary.lastAppointmentDate != null);

    return (
        <div className="flex w-full flex-col gap-4">
            {showSummary ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            {tm('custColFileNo')}
                        </p>
                        <p className="text-sm font-bold text-slate-800">
                            {String(value.file_id ?? '').trim() || '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            {tm('bVisitsHeader')}
                        </p>
                        <p className="text-sm font-bold text-slate-800">
                            {summary?.appointmentCount ?? 0} {tm('bAppointmentWord')}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            {tm('bLastServiceHeader')}
                        </p>
                        <p className="text-sm font-bold text-slate-800 truncate">
                            {summary?.lastServiceName?.trim() || '—'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                            {formatDate(summary?.lastAppointmentDate)}
                        </p>
                    </div>
                </div>
            ) : null}

            <div>
                <RetailExFlatFieldLabel required>{tm('bCustomerName')}</RetailExFlatFieldLabel>
                <Input
                    className="!rounded-2xl !px-4 !py-2.5"
                    value={value.name ?? ''}
                    onChange={e => set({ name: e.target.value })}
                    placeholder={tm('bCustomerNamePlaceholder')}
                />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <RetailExFlatFieldLabel>{tm('custLabelPhone1')}</RetailExFlatFieldLabel>
                    <Input
                        className="!rounded-2xl !px-4 !py-2.5"
                        value={value.phone ?? ''}
                        onChange={e => set({ phone: e.target.value })}
                        placeholder={tm('bPlaceholderPhoneExample')}
                    />
                </div>
                <div>
                    <RetailExFlatFieldLabel>{tm('custLabelPhone2')}</RetailExFlatFieldLabel>
                    <Input
                        className="!rounded-2xl !px-4 !py-2.5"
                        value={value.phone2 ?? ''}
                        onChange={e => set({ phone2: e.target.value })}
                        placeholder={tm('custPhPhone2')}
                    />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <RetailExFlatFieldLabel>{tm('custLabelBirthDate')}</RetailExFlatFieldLabel>
                    <Input
                        className="!rounded-2xl !px-4 !py-2.5"
                        type="date"
                        value={value.birth_date ? String(value.birth_date).slice(0, 10) : ''}
                        onChange={e =>
                            set({
                                birth_date: e.target.value === '' ? null : e.target.value,
                                age: null,
                            })
                        }
                        placeholder={tm('custPhBirthDate')}
                    />
                </div>
                <div>
                    <RetailExFlatFieldLabel>{tm('custLabelFileId')}</RetailExFlatFieldLabel>
                    <Input
                        className="!rounded-2xl !px-4 !py-2.5"
                        value={value.file_id ?? ''}
                        onChange={e => set({ file_id: e.target.value })}
                        placeholder={tm('custPhFileIdAuto')}
                        autoComplete="off"
                    />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <RetailExFlatFieldLabel>{tm('bGender')}</RetailExFlatFieldLabel>
                    <Select
                        {...beautyCustomerFormSelectProps}
                        className="w-full [&_.ant-select-selector]:!rounded-2xl [&_.ant-select-selector]:!py-1"
                        allowClear
                        placeholder={tm('bGenderPlaceholder')}
                        value={normalizeBeautyCustomerGender(value.gender) ?? undefined}
                        onChange={v =>
                            set({
                                gender: (v as BeautyCustomer['gender']) ?? null,
                            })
                        }
                        options={[
                            { value: 'female', label: tm('bGenderFemale') },
                            { value: 'male', label: tm('bGenderMale') },
                            { value: 'other', label: tm('bGenderOther') },
                        ]}
                    />
                    {genderRawLabel(value.gender) &&
                        normalizeBeautyCustomerGender(value.gender) === null && (
                            <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                                DB'de kayıtlı değer: <b>"{genderRawLabel(value.gender)}"</b> — lütfen
                                listeden tekrar seçin.
                            </p>
                        )}
                </div>
                <div>
                    <RetailExFlatFieldLabel>{tm('bCustomerTier')}</RetailExFlatFieldLabel>
                    <Segmented
                        block
                        value={value.customer_tier === 'vip' ? 'vip' : 'normal'}
                        onChange={v =>
                            set({
                                customer_tier: v === 'vip' ? 'vip' : 'normal',
                            })
                        }
                        options={[
                            { label: tm('bCustomerTierNormal'), value: 'normal' },
                            { label: tm('bCustomerTierVip'), value: 'vip' },
                        ]}
                    />
                </div>
            </div>
            <div>
                <RetailExFlatFieldLabel>{tm('bAddress')}</RetailExFlatFieldLabel>
                <Input.TextArea
                    className="!rounded-2xl !px-4 !py-2.5"
                    value={value.address ?? ''}
                    onChange={e => set({ address: e.target.value })}
                    placeholder={tm('bPlaceholderAddress')}
                    rows={2}
                />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                    <RetailExFlatFieldLabel>{tm('custLabelOccupation')}</RetailExFlatFieldLabel>
                    <Input
                        className="!rounded-2xl !px-4 !py-2.5"
                        value={value.occupation ?? ''}
                        onChange={e => set({ occupation: e.target.value })}
                        placeholder={tm('custPhOccupation')}
                    />
                </div>
                <div>
                    <RetailExFlatFieldLabel>{tm('bEmail')}</RetailExFlatFieldLabel>
                    <Input
                        className="!rounded-2xl !px-4 !py-2.5"
                        type="email"
                        value={value.email ?? ''}
                        onChange={e => set({ email: e.target.value })}
                        placeholder={tm('bPlaceholderEmailExample')}
                    />
                </div>
            </div>
            <div>
                <RetailExFlatFieldLabel>{tm('bCity')}</RetailExFlatFieldLabel>
                <Input
                    className="!rounded-2xl !px-4 !py-2.5"
                    value={value.city ?? ''}
                    onChange={e => set({ city: e.target.value })}
                    placeholder={tm('bPlaceholderCity')}
                />
            </div>
            <div>
                <RetailExFlatFieldLabel>{tm('custLabelHeardFrom')}</RetailExFlatFieldLabel>
                <Input
                    className="!rounded-2xl !px-4 !py-2.5"
                    value={value.heard_from ?? ''}
                    onChange={e => set({ heard_from: e.target.value })}
                    placeholder={tm('custPhHeardFrom')}
                />
            </div>
            <div>
                <RetailExFlatFieldLabel>{tm('bNotes')}</RetailExFlatFieldLabel>
                <Input.TextArea
                    className="!rounded-2xl !px-4 !py-2.5"
                    value={value.notes ?? ''}
                    onChange={e => set({ notes: e.target.value })}
                    placeholder={tm('bFeedbackComment')}
                    rows={3}
                />
            </div>
        </div>
    );
}
