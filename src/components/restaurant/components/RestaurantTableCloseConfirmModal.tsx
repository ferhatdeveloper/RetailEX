import React from 'react';
import { X, LogOut, Trash2, ArrowLeft } from 'lucide-react';
import { cn } from '../../ui/utils';

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
                            <h3 className="text-white font-black text-xl uppercase tracking-tight">Masa Boş</h3>
                            <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest opacity-70">Masa No: {tableNumber}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-xl bg-black/10 hover:bg-black/20 text-white flex items-center justify-center transition-all active:scale-95 relative z-10"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6">
                    <div className="text-center space-y-2">
                        <p className="text-slate-600 font-bold text-lg leading-relaxed px-4">
                            Masaya ürün eklemediniz. Çıkarken masayı kapatmak (boşaltmak) ister misiniz?
                        </p>
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                            Kapalı masalar "Boş" (Mavi) durumuna döner.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-3 pt-2">
                        <button
                            onClick={onConfirmClose}
                            className="w-full flex items-center justify-center gap-3 py-4.5 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white rounded-[1.5rem] font-black uppercase tracking-tighter text-[14px] transition-all shadow-xl shadow-rose-500/20 active:scale-[0.97] border border-white/10"
                        >
                            <Trash2 className="w-5 h-5 drop-shadow-sm" />
                            <span>Masayı Kapat (Boşalt)</span>
                        </button>

                        <button
                            onClick={onJustLeave}
                            className="w-full flex items-center justify-center gap-3 py-4.5 bg-slate-50 hover:bg-white text-slate-800 rounded-[1.5rem] font-black uppercase tracking-tighter text-[14px] transition-all active:scale-[0.97] border border-slate-200 shadow-sm hover:shadow-md"
                        >
                            <LogOut className="w-5 h-5 opacity-70" />
                            <span>Sadece Çık (Dolu Kalsın)</span>
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full flex items-center justify-center gap-2 py-3.5 text-slate-400 hover:text-blue-600 font-black uppercase tracking-widest text-[11px] transition-all group"
                        >
                            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                            <span>Masaya Geri Dön</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
