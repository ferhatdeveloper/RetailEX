import React from 'react';
import { X, LogOut, Trash2, ArrowLeft } from 'lucide-react';
import { cn } from '../../ui/utils';
import { useRestaurantModuleTm } from '../hooks/useRestaurantModuleTm';

interface RestaurantTableCloseConfirmModalProps {
    tableNumber: string;
    onClose: () => void;
    onConfirmClose: () => void;
    onJustLeave: () => void;
}

export const RestaurantTableCloseConfirmModal: React.FC<RestaurantTableCloseConfirmModalProps> = ({
    tableNumber,
    onClose,
    onConfirmClose,
    onJustLeave
}) => {
    const tm = useRestaurantModuleTm();
    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-blue-600 px-8 py-6 flex items-center justify-between relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10">
                            <Trash2 className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-black text-xl uppercase tracking-tight">{tm('resTableEmptyTitle')}</h3>
                            <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest opacity-70">{tm('resTableEmptySubtitle').replace('{n}', tableNumber)}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-12 h-12 min-h-[48px] min-w-[48px] rounded-xl bg-black/10 hover:bg-black/20 active:bg-black/30 text-white flex items-center justify-center transition-all active:scale-95 relative z-10 touch-manipulation cursor-pointer select-none"
                        aria-label={tm('resCallerClose')}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6">
                    <div className="text-center space-y-2">
                        <p className="text-slate-600 font-bold text-lg leading-relaxed px-4">
                            {tm('resTableEmptyBody')}
                        </p>
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                            {tm('resTableEmptyHint')}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 pt-2">
                        <button
                            type="button"
                            onClick={onConfirmClose}
                            className="w-full flex items-center justify-center gap-3 min-h-[64px] py-6 px-5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-[1.5rem] font-black uppercase tracking-tighter text-[15px] transition-all shadow-lg active:scale-[0.97] border border-rose-700 touch-manipulation cursor-pointer select-none"
                        >
                            <Trash2 className="w-6 h-6 drop-shadow-sm shrink-0" />
                            <span>{tm('resTableEmptyCloseClear')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={onJustLeave}
                            className="w-full flex items-center justify-center gap-3 min-h-[64px] py-6 px-5 bg-slate-50 hover:bg-white active:bg-slate-100 text-slate-800 rounded-[1.5rem] font-black uppercase tracking-tighter text-[15px] transition-all active:scale-[0.97] border-2 border-slate-200 shadow-sm hover:shadow-md touch-manipulation cursor-pointer select-none"
                        >
                            <LogOut className="w-6 h-6 opacity-70 shrink-0" />
                            <span>{tm('resTableEmptyLeaveFull')}</span>
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full flex items-center justify-center gap-2 min-h-[56px] py-5 px-5 rounded-2xl text-slate-500 hover:text-blue-600 hover:bg-slate-50 active:text-blue-600 active:bg-slate-100 font-black uppercase tracking-widest text-[13px] transition-all group touch-manipulation cursor-pointer select-none border border-slate-200"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform shrink-0" />
                            <span>{tm('resTableEmptyBack')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
