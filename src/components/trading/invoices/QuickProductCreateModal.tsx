import React, { useEffect, useMemo, useState } from 'react';
import { PercentBodyModal, PercentBodyModalScrollBody } from '../../shared/PercentBodyModal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { moduleTranslations } from '../../../locales/module-translations';
import type { UnitMasterRow } from '../../../utils/unitOptions';

export interface QuickCreateFormValue {
    code: string;
    name: string;
    unit: string;
    price: number;
    vatRate: number;
    barcode?: string;
}

interface QuickProductCreateModalProps {
    kind: 'product' | 'service';
    initialCode: string;
    initialName: string;
    saving: boolean;
    onClose: () => void;
    onSave: (value: QuickCreateFormValue) => void;
    /** Mevcut birim listesi (kullanıcıya öneri olarak); opsiyonel */
    masterUnits?: UnitMasterRow[];
}

const DEFAULT_UNITS = ['Adet', 'Kg', 'Lt', 'Mt', 'Paket', 'Koli', 'Kutu', 'Şişe', 'Çuval'];

/**
 * Kod alanında eşleşme yokken açılan minimal ürün/hizmet ekleme modalı.
 * Yalnızca kod, ad, birim, satış fiyatı, KDV (ve opsiyonel barkod) alanlarını içerir.
 * Kayıt başarılıysa parent satıra seçili olarak yerleştirir.
 */
export const QuickProductCreateModal: React.FC<QuickProductCreateModalProps> = ({
    kind,
    initialCode,
    initialName,
    saving,
    onClose,
    onSave,
    masterUnits,
}) => {
    const { language } = useLanguage();
    const tm = (key: string) => moduleTranslations[key]?.[language] || key;

    const [code, setCode] = useState(initialCode);
    const [name, setName] = useState(initialName);
    const [unit, setUnit] = useState('Adet');
    const [price, setPrice] = useState<string>('');
    const [vatRate, setVatRate] = useState<string>('');
    const [barcode, setBarcode] = useState<string>('');
    const [touched, setTouched] = useState(false);

    // Modal her açıldığında initial değerlerle sıfırla
    useEffect(() => {
        setCode(initialCode);
        setName(initialName);
        setUnit('Adet');
        setPrice('');
        setVatRate('');
        setBarcode('');
        setTouched(false);
    }, [initialCode, initialName]);

    const unitOptions = useMemo(() => {
        const fromMaster = (masterUnits || [])
            .map((u) => (u.name || u.code || '').trim())
            .filter(Boolean);
        const merged = Array.from(new Set([...DEFAULT_UNITS, ...fromMaster]));
        if (unit && !merged.includes(unit)) merged.unshift(unit);
        return merged;
    }, [masterUnits, unit]);

    const title = kind === 'service'
        ? tm('quickCreateServiceTitle') || 'Yeni Hizmet'
        : tm('quickCreateProductTitle') || 'Yeni Ürün';

    const codeMissing = touched && !code.trim();
    const nameMissing = touched && !name.trim();

    const handleSubmit = () => {
        setTouched(true);
        if (!code.trim() || !name.trim()) return;
        onSave({
            code: code.trim(),
            name: name.trim(),
            unit: unit.trim() || 'Adet',
            price: parseFloat(price.replace(',', '.')) || 0,
            vatRate: parseFloat(vatRate.replace(',', '.')) || 0,
            barcode: barcode.trim() || undefined,
        });
    };

    return (
        <PercentBodyModal onClose={onClose} size="form" ariaLabel={title}>
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-white shrink-0 rounded-t-2xl">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                            {kind === 'service'
                                ? (tm('itemTypeService') || 'Hizmet')
                                : (tm('itemTypeMaterial') || 'Malzeme')}
                        </div>
                        <h3 className="text-lg font-bold truncate">{title}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white"
                        aria-label="Kapat"
                        title="Kapat"
                    >
                        <span className="text-xl leading-none">&times;</span>
                    </button>
                </div>
            </div>

            <PercentBodyModalScrollBody className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            {tm('quickCreateFieldCode') || 'Kod'} <span className="text-red-500">*</span>
                        </span>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            autoFocus
                            className={`px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium ${codeMissing ? 'border-red-400 bg-red-50/40' : 'border-slate-200 bg-white'}`}
                            placeholder={kind === 'service' ? 'SRV-001' : 'PRD-001'}
                        />
                    </label>

                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            {tm('quickCreateFieldName') || 'Ad'} <span className="text-red-500">*</span>
                        </span>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={`px-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium ${nameMissing ? 'border-red-400 bg-red-50/40' : 'border-slate-200 bg-white'}`}
                            placeholder={kind === 'service' ? 'Danışmanlık Hizmeti' : 'Yeni Ürün'}
                        />
                    </label>

                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            {tm('quickCreateFieldUnit') || 'Birim'}
                        </span>
                        <input
                            type="text"
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            list="quick-create-units"
                            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium bg-white"
                        />
                        <datalist id="quick-create-units">
                            {unitOptions.map((u) => (
                                <option key={u} value={u} />
                            ))}
                        </datalist>
                    </label>

                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            {tm('quickCreateFieldPrice') || 'Satış Fiyatı'}
                        </span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-right tabular-nums focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium bg-white"
                            placeholder="0,00"
                        />
                    </label>

                    {kind === 'product' && (
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                {tm('quickCreateFieldBarcode') || 'Barkod'}
                            </span>
                            <input
                                type="text"
                                value={barcode}
                                onChange={(e) => setBarcode(e.target.value)}
                                className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium bg-white"
                                placeholder="—"
                            />
                        </label>
                    )}

                    <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            {tm('quickCreateFieldVat') || 'KDV (%)'}
                        </span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={vatRate}
                            onChange={(e) => setVatRate(e.target.value)}
                            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-right tabular-nums focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none text-slate-800 font-medium bg-white"
                            placeholder="0"
                        />
                    </label>
                </div>
            </PercentBodyModalScrollBody>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 shrink-0 rounded-b-2xl">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={saving}
                    className="rounded-2xl border-2 border-slate-200 text-slate-600 font-bold uppercase text-sm tracking-wider px-5 py-2.5 hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50"
                >
                    {tm('cancel') || 'İptal'}
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving}
                    className="rounded-2xl bg-blue-600 text-white font-bold uppercase text-sm tracking-wider px-5 py-2.5 shadow-lg shadow-blue-200/50 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 inline-flex items-center gap-2 justify-center"
                >
                    {saving && (
                        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
                    )}
                    <span>
                        {saving
                            ? (tm('quickCreateSaving') || 'Kaydediliyor…')
                            : (tm('quickCreateSave') || 'Kaydet ve Satıra Ekle')}
                    </span>
                </button>
            </div>
        </PercentBodyModal>
    );
};
