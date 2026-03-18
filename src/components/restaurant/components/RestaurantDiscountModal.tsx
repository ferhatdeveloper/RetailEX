import React from 'react';
import { X, Percent, CheckCircle, Info } from 'lucide-react';
import { cn } from '../../ui/utils';
import { translate } from '../../../shared/i18n';

interface RestaurantDiscountModalProps {
    discountInput: string;
    onDiscountInputChange: (val: string) => void;
    onClose: () => void;
    onApply: () => void;
}

export function RestaurantDiscountModal({
    discountInput,
    onDiscountInputChange,
    onClose,
    onApply
}: RestaurantDiscountModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[5000] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Orange Gradient */}
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 p-8 flex items-center justify-between text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                            <Percent className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight">{translate('orderDiscount')}</h3>
                            <p className="text-[10px] text-white/70 font-black uppercase tracking-widest mt-0.5 tracking-widest">{translate('applyRatioDiscount')}</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-orange-600 shadow-sm">
                            <Info className="w-4 h-4" />
                        </div>
                        <p className="text-[11px] font-bold text-orange-700 leading-tight uppercase tracking-wider">
                            {translate('discountRatioApplied')}
                        </p>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">{translate('discount')} (%)</label>
                        <input
                            autoFocus
                            type="number"
                            min={0}
                            max={100}
                            value={discountInput}
                            onChange={e => onDiscountInputChange(e.target.value)}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl h-20 px-6 text-[32px] font-black text-center outline-none focus:border-orange-400 focus:bg-white transition-all text-slate-800 shadow-inner"
                            placeholder="0"
                        />

                        <div className="grid grid-cols-4 gap-2 mt-4">
                            {[5, 10, 15, 20, 25, 30, 50, 0].map(v => (
                                <button
                                    key={v}
                                    onClick={() => onDiscountInputChange(String(v))}
                                    className="py-3 rounded-2xl border-2 border-slate-100 text-[13px] font-black text-slate-700 hover:bg-orange-50 hover:border-orange-300 transition-all active:scale-95 bg-white"
                                >
                                    {v === 0 ? translate('reset') : `%${v}`}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] hover:bg-slate-100 transition-all active:scale-95 shadow-sm"
                    >
                        {translate('cancel')}
                    </button>
                    <button
                        onClick={onApply}
                        className="flex-1 px-6 py-4 bg-orange-600 text-white rounded-2xl font-black uppercase text-[12px] flex items-center justify-center gap-2 shadow-xl shadow-orange-200 hover:bg-orange-700 active:scale-95 transition-all"
                    >
                        <CheckCircle className="w-5 h-5" /> {translate('apply')}
                    </button>
                </div>
            </div>
        </div>
    );
}
