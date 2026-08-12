import React, { useState } from 'react';
import { X, Trash2, Info } from 'lucide-react';
import { cn } from '../../ui/utils';
import { moduleTranslations } from '../../../locales/module-translations';
import { useRestaurantModuleTm } from '../hooks/useRestaurantModuleTm';

/** Hazır iptal sebepleri — kayıt için Türkçe etiket `moduleTranslations.*.tr` ile tutulur */
export const VOID_REASON_OPTIONS = [
    { value: 'wrong_order', tmKey: 'resVoidReasonWrongOrder' as const },
    { value: 'customer_cancelled', tmKey: 'resVoidReasonCustomerCancelled' as const },
    { value: 'out_of_stock', tmKey: 'resVoidReasonOutOfStock' as const },
    { value: 'wrong_item_served', tmKey: 'resVoidReasonWrongItem' as const },
    { value: 'quality_issue', tmKey: 'resVoidReasonQuality' as const },
    { value: 'delay', tmKey: 'resVoidReasonDelay' as const },
    { value: 'duplicate', tmKey: 'resVoidReasonDuplicate' as const },
    { value: 'customer_not_satisfied', tmKey: 'resVoidReasonNotSatisfied' as const },
    { value: 'other', tmKey: 'resVoidReasonOther' as const },
] as const;

function storageLabelForReason(selectedOption: string, otherText: string): string {
    if (selectedOption === 'other') return otherText.trim();
    const row = VOID_REASON_OPTIONS.find((o) => o.value === selectedOption);
    if (!row || row.value === 'other') return selectedOption;
    return moduleTranslations[row.tmKey].tr;
}

interface RestaurantVoidReasonModalProps {
    itemName: string;
    /** Siparişteki toplam adet — 2+ ise "1 adet iptal" veya "Tümü" seçilebilir */
    quantity?: number;
    reason: string;
    onReasonChange: (reason: string) => void;
    onClose: () => void;
    /** (reason, voidQuantity) — voidQuantity: iptal edilecek adet; verilmezse quantity kadar (tümü) */
    onConfirm: (reason: string, voidQuantity: number) => void;
}

export function RestaurantVoidReasonModal({
    itemName,
    quantity = 1,
    reason: _reason,
    onReasonChange,
    onClose,
    onConfirm
}: RestaurantVoidReasonModalProps) {
    const tm = useRestaurantModuleTm();
    const [selectedOption, setSelectedOption] = useState<string>('');
    const [otherText, setOtherText] = useState('');
    /** Kaç adet iptal — quantity > 1 ise 1..quantity veya tümü */
    const [voidQty, setVoidQty] = useState<number>(quantity);

    const reasonValid = selectedOption === 'other' ? otherText.trim().length > 0 : selectedOption.length > 0;
    const isValid = reasonValid;

    const handleConfirm = () => {
        if (!isValid) return;
        const finalReason = storageLabelForReason(selectedOption, otherText);
        onReasonChange(finalReason);
        onConfirm(finalReason, voidQty);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="bg-gradient-to-r from-red-600 to-rose-700 p-8 flex items-center justify-between text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                            <Trash2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight">{tm('resVoidModalTitle')}</h3>
                            <p className="text-[10px] text-red-100 font-bold uppercase tracking-widest mt-0.5">{tm('resVoidModalSubtitle')}</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-red-600 shadow-sm">
                                <Info className="w-4 h-4" />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-tight text-red-500">{tm('resVoidModalProductLabel')}</span>
                        </div>
                        <p className="text-lg font-black text-red-700 leading-none pl-10 uppercase">{itemName}</p>
                        {quantity > 1 && (
                            <p className="text-[11px] font-bold text-red-600 pl-10">{tm('resVoidModalQtyHint').replace('{n}', String(quantity))}</p>
                        )}
                    </div>

                    {quantity > 1 && (
                        <div className="space-y-2">
                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">{tm('resVoidModalHowMany')}</label>
                            <div className="flex flex-wrap gap-2">
                                {Array.from({ length: quantity }, (_, i) => i + 1).map((n) => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setVoidQty(n)}
                                        className={cn(
                                            "py-2.5 px-4 rounded-xl text-[12px] font-bold border-2 transition-all",
                                            voidQty === n
                                                ? "border-red-500 bg-red-50 text-red-700"
                                                : "border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200"
                                        )}
                                    >
                                        {n} {tm('resVoidModalUnit')}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setVoidQty(quantity)}
                                    className={cn(
                                        "py-2.5 px-4 rounded-xl text-[12px] font-bold border-2 transition-all",
                                        voidQty === quantity
                                            ? "border-red-500 bg-red-50 text-red-700"
                                            : "border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200"
                                    )}
                                >
                                    {tm('resVoidModalAll').replace('{n}', String(quantity))}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">
                            {tm('resVoidModalPresetLabel')}
                        </label>
                        <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
                            {VOID_REASON_OPTIONS.filter(o => o.value !== 'other').map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => { setSelectedOption(opt.value); setOtherText(''); }}
                                    className={cn(
                                        "py-3 px-4 rounded-xl text-left text-[12px] font-bold border-2 transition-all",
                                        selectedOption === opt.value
                                            ? "border-red-500 bg-red-50 text-red-700 ring-2 ring-red-200"
                                            : "border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200"
                                    )}
                                >
                                    {tm(opt.tmKey)}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setSelectedOption('other')}
                                className={cn(
                                    "py-3 px-4 rounded-xl text-left text-[12px] font-bold border-2 transition-all col-span-2",
                                    selectedOption === 'other'
                                        ? "border-red-500 bg-red-50 text-red-700 ring-2 ring-red-200"
                                        : "border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200"
                                )}
                            >
                                {tm('resVoidReasonOther')}
                            </button>
                        </div>
                        {selectedOption === 'other' && (
                            <div className="pt-1">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">{tm('resVoidModalNoteLabel')}</span>
                                <textarea
                                    autoFocus
                                    value={otherText}
                                    onChange={(e) => setOtherText(e.target.value)}
                                    placeholder={tm('resVoidModalNotePlaceholder')}
                                    className="w-full min-h-[80px] p-4 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-red-400 outline-none text-sm font-medium resize-none"
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] transition-all hover:bg-slate-100 active:scale-95 shadow-sm"
                    >
                        {tm('resVoidModalCancel')}
                    </button>
                    <button
                        type="button"
                        disabled={!isValid}
                        onClick={handleConfirm}
                        className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase text-[12px] transition-all shadow-xl shadow-red-200 disabled:opacity-50 disabled:shadow-none active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-5 h-5" /> {tm('resVoidModalConfirm')}
                    </button>
                </div>
            </div>
        </div>
    );
}
