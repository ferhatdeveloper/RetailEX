import React, { useState, useEffect } from 'react';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { Staff } from '../types';
import { X, User, CheckCircle, Info } from 'lucide-react';
import { cn } from '../../ui/utils';

interface RestaurantStaffPinModalProps {
    onClose: () => void;
    onSelect: (staffName: string) => void;
}

export const RestaurantStaffPinModal: React.FC<RestaurantStaffPinModalProps> = ({ onClose, onSelect }) => {
    const { staffList, loadStaff, setCurrentStaff } = useRestaurantStore();
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
    const [confirmStaff, setConfirmStaff] = useState<Staff | null>(null);

    const handleConfirm = () => {
        if (confirmStaff) {
            setSelectedStaff(confirmStaff);
            setCurrentStaff(confirmStaff);
            onSelect(confirmStaff.name);
            onClose();
        }
    };

    useEffect(() => {
        loadStaff();
    }, [loadStaff]);

    return (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[48px] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col relative border border-white/10">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all flex items-center justify-center z-20 border border-slate-200 shadow-sm"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 flex flex-col gap-2 text-white relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />

                    <div className="relative z-10">
                        <h2 className="text-3xl font-black uppercase tracking-tight">Personel Erişimi</h2>
                        <p className="text-blue-100 font-bold text-sm tracking-widest mt-1 opacity-90 uppercase">
                            Hızlı geçiş için lütfen isminizi seçin
                        </p>
                    </div>
                </div>

                {/* Staff Grid */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {staffList.map((staff) => (
                            <button
                                key={staff.id}
                                onClick={() => setConfirmStaff(staff)}
                                className={cn(
                                    "flex items-center gap-4 p-5 rounded-[2rem] border transition-all duration-300 group text-left",
                                    confirmStaff?.id === staff.id
                                        ? "bg-blue-50 border-blue-400 shadow-md transform scale-[1.02]"
                                        : "bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-lg hover:shadow-blue-100/50"
                                )}
                            >
                                <div className={cn(
                                    "w-14 h-14 shrink-0 rounded-[1.25rem] flex items-center justify-center transition-colors shadow-sm",
                                    confirmStaff?.id === staff.id ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600"
                                )}>
                                    <User className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={cn(
                                        "font-black text-base uppercase tracking-tight truncate",
                                        confirmStaff?.id === staff.id ? "text-blue-900" : "text-slate-800"
                                    )}>
                                        {staff.name}
                                    </div>
                                    <div className={cn(
                                        "text-[10px] font-bold uppercase tracking-widest mt-0.5",
                                        confirmStaff?.id === staff.id ? "text-blue-600" : "text-slate-400 group-hover:text-blue-500/70"
                                    )}>
                                        {staff.role}
                                    </div>
                                </div>
                                {confirmStaff?.id === staff.id && (
                                    <CheckCircle className="w-5 h-5 shrink-0 text-blue-600 animate-in zoom-in duration-300" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Footer Brand */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 text-center shrink-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Hospitality Pro Suite</p>
                </div>

                {/* Confirmation Overlay */}
                {confirmStaff && (
                    <div className="absolute inset-0 z-[100] bg-white/95 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white p-10 rounded-[3rem] shadow-2xl border border-blue-100 w-full max-w-md text-center flex flex-col items-center">
                            <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6 shadow-inner border border-blue-100/50">
                                <Info className="w-12 h-12" />
                            </div>

                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Onaylıyor Musunuz?</h3>
                            <p className="text-slate-500 mt-3 font-medium text-sm leading-relaxed">
                                Bu cihazdaki işlemlere <br /><b className="text-blue-600 font-black text-lg">{confirmStaff.name}</b><br /> adına devam edilecektir.
                            </p>

                            <div className="flex gap-4 w-full mt-10">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setConfirmStaff(null); }}
                                    className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 text-slate-600 font-black uppercase text-sm hover:bg-slate-200 transition-colors"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                                    className="flex-1 px-6 py-4 rounded-2xl bg-blue-600 text-white font-black uppercase text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <CheckCircle className="w-5 h-5" />
                                    ONAYLA
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

