import React from 'react';
import { X, RotateCcw, Info } from 'lucide-react';
import { cn } from '../../ui/utils';
import { Table } from '../types';
import { translate } from '../../../shared/i18n';

interface RestaurantMoveTableModalProps {
    currentTable?: Table;
    tables: Table[];
    targetTableId: string | null;
    onTargetSelect: (id: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}

export function RestaurantMoveTableModal({
    currentTable,
    tables,
    targetTableId,
    onTargetSelect,
    onClose,
    onConfirm
}: RestaurantMoveTableModalProps) {
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Amber Gradient */}
                <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-8 py-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center justify-between relative z-10 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                                <RotateCcw className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight">{translate('moveTable')}</h3>
                                <p className="text-[10px] text-amber-100 font-bold uppercase tracking-widest mt-0.5">{translate('selectTargetTable')}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-90"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="p-8 space-y-6 flex-1 flex flex-col min-h-0">
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-amber-600 shadow-sm">
                            <Info className="w-4 h-4" />
                        </div>
                        <p className="text-[11px] font-bold text-amber-700 leading-tight uppercase tracking-wider">
                            {currentTable ? translate('transferAllItems').replace('{number}', String(currentTable.number)) : translate('selectTargetTable')}
                        </p>
                    </div>

                    <div className="grid grid-cols-4 gap-3 overflow-y-auto pr-2 custom-scrollbar max-h-[360px]">
                        {tables.filter(t => t.id !== currentTable?.id).map(t => (
                            <button
                                key={t.id}
                                onClick={() => onTargetSelect(t.id)}
                                className={cn(
                                    "aspect-square rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-sm",
                                    targetTableId === t.id
                                        ? "bg-amber-50 border-amber-500 text-amber-600 shadow-lg shadow-amber-500/10"
                                        : "bg-slate-50 border-slate-100 text-slate-400 hover:border-amber-200 hover:text-slate-600 hover:bg-white"
                                )}
                            >
                                <span className="text-[9px] font-black opacity-50 uppercase tracking-widest">{translate('product')}</span>
                                <span className="text-xl font-black">{t.number}</span>
                                {t.status !== 'empty' && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                        <span className="text-[8px] font-black text-red-500 uppercase">{translate('tableOccupied')}</span>
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] transition-all hover:bg-slate-100 active:scale-95 shadow-sm"
                    >
                        {translate('cancel')}
                    </button>
                    <button
                        disabled={!targetTableId}
                        onClick={onConfirm}
                        className="flex-1 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black uppercase text-[12px] transition-all shadow-xl shadow-amber-200 disabled:opacity-50 disabled:shadow-none active:scale-95 flex items-center justify-center gap-2"
                    >
                        <RotateCcw className="w-4 h-4" /> {translate('confirmMove')}
                    </button>
                </div>
            </div>
        </div>
    );
}
