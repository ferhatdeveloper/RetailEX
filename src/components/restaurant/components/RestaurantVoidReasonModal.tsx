import React from 'react';
import { X, Trash2, CheckCircle, Info } from 'lucide-react';
import { cn } from '../../ui/utils';

interface RestaurantVoidReasonModalProps {
    itemName: string;
    reason: string;
    onReasonChange: (reason: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}

export function RestaurantVoidReasonModal({
    itemName,
    reason,
    onReasonChange,
    onClose,
    onConfirm
}: RestaurantVoidReasonModalProps) {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div
                className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with Red Gradient */}
                <div className="bg-gradient-to-r from-red-600 to-rose-700 p-8 flex items-center justify-between text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />

                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg">
                            <Trash2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black uppercase tracking-tight">Ürün İptali</h3>
                            <p className="text-[10px] text-red-100 font-bold uppercase tracking-widest mt-0.5">İptal nedeni belirtin</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center text-red-600 shadow-sm">
                                <Info className="w-4 h-4" />
                            </div>
                            <span className="text-[11px] font-black uppercase tracking-tight text-red-500">İPTAL EDİLECEK ÜRÜN</span>
                        </div>
                        <p className="text-lg font-black text-red-700 leading-none pl-10 uppercase">{itemName}</p>
                    </div>

                    <div className="space-y-3">
                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">İptal Nedeni</label>
                        <textarea
                            autoFocus
                            value={reason}
                            onChange={(e) => onReasonChange(e.target.value)}
                            className="w-full h-32 p-5 bg-slate-50 border-2 border-slate-100 rounded-3xl focus:border-red-400 focus:bg-white outline-none transition-all font-bold text-slate-700 placeholder:text-slate-300 shadow-inner resize-none"
                            placeholder="Örn: Yanlış sipariş, Müşteri vazgeçti, Ürün tükendi..."
                        />
                    </div>
                </div>

                <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] transition-all hover:bg-slate-100 active:scale-95 shadow-sm"
                    >
                        VAZGEÇ
                    </button>
                    <button
                        disabled={!reason.trim()}
                        onClick={onConfirm}
                        className="flex-1 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase text-[12px] transition-all shadow-xl shadow-red-200 disabled:opacity-50 disabled:shadow-none active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-5 h-5" /> İPTAL ET
                    </button>
                </div>
            </div>
        </div>
    );
}
