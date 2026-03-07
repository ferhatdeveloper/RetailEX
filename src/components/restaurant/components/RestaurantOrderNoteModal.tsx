import React from 'react';
import { X, StickyNote, CheckCircle, Trash2, Info } from 'lucide-react';
import { cn } from '../../ui/utils';
import { translate } from '../../../shared/i18n';

interface RestaurantOrderNoteModalProps {
    note: string;
    onNoteChange: (note: string) => void;
    onClose: () => void;
    onSave: () => void;
    onClear: () => void;
}

export function RestaurantOrderNoteModal({
    note,
    onNoteChange,
    onClose,
    onSave,
    onClear
}: RestaurantOrderNoteModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Amber Gradient */}
                <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-8 flex items-center justify-between text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                            <StickyNote className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight">{translate('orderNote')}</h3>
                            <p className="text-[10px] text-white/70 font-black uppercase tracking-widest mt-0.5 tracking-widest">{translate('specialRequests')}</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    {/* Context Bar */}
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-amber-600 shadow-sm">
                            <Info className="w-4 h-4" />
                        </div>
                        <p className="text-[11px] font-bold text-amber-700 leading-tight uppercase tracking-wider">
                            {translate('orderNoteDescription')}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">{translate('orderNote')}</label>
                        <textarea
                            autoFocus
                            rows={4}
                            value={note}
                            onChange={e => onNoteChange(e.target.value)}
                            placeholder={translate('orderNotePlaceholder')}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl px-6 py-5 text-[15px] font-bold text-slate-700 outline-none focus:border-amber-400 focus:bg-white transition-all resize-none placeholder:text-slate-300 shadow-inner"
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={onClear}
                        className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95 shadow-sm"
                    >
                        <Trash2 className="w-4 h-4" /> {translate('clear').toUpperCase()}
                    </button>
                    <button
                        onClick={onSave}
                        className="flex-1 px-6 py-4 bg-amber-600 text-white rounded-2xl font-black uppercase text-[12px] flex items-center justify-center gap-2 shadow-xl shadow-amber-200 hover:bg-amber-700 active:scale-95 transition-all"
                    >
                        <CheckCircle className="w-5 h-5" /> {translate('save').toUpperCase()}
                    </button>
                </div>
            </div>
        </div>
    );
}
