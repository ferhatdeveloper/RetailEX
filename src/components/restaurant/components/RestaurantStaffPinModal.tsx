import React, { useState, useEffect } from 'react';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { Staff } from '../types';
import { X, User, CheckCircle, Info } from 'lucide-react';
import { cn } from '../../ui/utils';

interface RestaurantStaffPinModalProps {
    onClose: () => void;
    onSelect: (staffName: string) => void;
    /** true ise personel seçildiğinde onay ekranı gösterilmez, doğrudan seçim uygulanır */
    skipConfirmation?: boolean;
    /** true: kapatma yok, garson seçmeden masalar kullanılamaz; Panele dön ile çıkış */
    mandatory?: boolean;
    /** mandatory iken dashboard'a dönmek için */
    onNavigateBack?: () => void;
}

/** Garson rolü sayılan değerler (küçük harfe göre) */
const WAITER_ROLE_KEYS = ['garson', 'görevli', 'waiter', 'servis', 'personel'];

function isWaiterRole(role: string | undefined): boolean {
    if (!role || !role.trim()) return false;
    const r = role.toLowerCase().trim();
    return WAITER_ROLE_KEYS.some(key => r === key || r.includes(key));
}

/** Her garson için kalıcı, ayırt edici çerçeve rengi (id üzerinden) */
const STAFF_ACCENT_PALETTE = [
    '#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0891b2',
    '#4f46e5', '#9333ea', '#db2777', '#0d9488', '#b45309',
    '#be123c', '#c2410c', '#a16207', '#15803d', '#0e7490',
];

export function getStaffAccentColor(staffId: string): string {
    let h = 0;
    const s = String(staffId || 'x');
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h) + s.charCodeAt(i);
        h |= 0;
    }
    return STAFF_ACCENT_PALETTE[Math.abs(h) % STAFF_ACCENT_PALETTE.length];
}

export const RestaurantStaffPinModal: React.FC<RestaurantStaffPinModalProps> = ({
    onClose,
    onSelect,
    skipConfirmation = false,
    mandatory = false,
    onNavigateBack,
}) => {
    const { staffList, loadStaff, setCurrentStaff } = useRestaurantStore();
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
    const [confirmStaff, setConfirmStaff] = useState<Staff | null>(null);
    const [loading, setLoading] = useState(true);

    const handleStaffSelect = (staff: Staff) => {
        if (skipConfirmation) {
            setCurrentStaff(staff);
            onSelect(staff.name);
            onClose();
            return;
        }
        setConfirmStaff(staff);
    };

    const waiterStaff = React.useMemo(
        () => staffList.filter(s => isWaiterRole(s.role)),
        [staffList]
    );
    const showAllAsFallback = waiterStaff.length === 0 && staffList.length > 0;
    const displayList = waiterStaff.length > 0 ? waiterStaff : staffList;

    const handleConfirm = () => {
        if (confirmStaff) {
            setSelectedStaff(confirmStaff);
            setCurrentStaff(confirmStaff);
            onSelect(confirmStaff.name);
            onClose();
        }
    };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        loadStaff().finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [loadStaff]);

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300"
            style={{ zIndex: 2147483647 }}
            onClick={mandatory ? undefined : onClose}
            role="presentation"
        >
            <div
                className="bg-white rounded-[48px] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col relative border border-white/10"
                onClick={(e) => e.stopPropagation()}
            >

                {!mandatory && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="absolute top-6 right-6 w-12 h-12 rounded-2xl bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all flex items-center justify-center z-20 border border-slate-200 shadow-sm"
                    >
                        <X className="w-6 h-6" />
                    </button>
                )}

                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-8 flex flex-col gap-2 text-white relative overflow-hidden shrink-0">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl opacity-50" />

                    <div className="relative z-10 pr-14">
                        <h2 className="text-3xl font-black uppercase tracking-tight">Personel Erişimi</h2>
                        <p className="text-blue-100 font-bold text-sm tracking-widest mt-1 opacity-90 uppercase">
                            {mandatory
                                ? 'Masaları kullanmak için kendi adınızı seçin'
                                : 'Hızlı geçiş için lütfen isminizi seçin'}
                        </p>
                    </div>
                </div>

                {/* Staff Grid — garson rolündekiler (yoksa tüm personel) */}
                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white min-h-[200px]">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-slate-400 font-bold uppercase tracking-wider">Yükleniyor...</div>
                    ) : displayList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center px-4">
                            <User className="w-12 h-12 text-slate-300 mb-4" />
                            <p className="font-black uppercase tracking-wide">Garson rolünde personel bulunamadı</p>
                            <p className="text-sm mt-2">Sistemde tanımlı ve aktif garson/görevli yok. Personel ekleyip rolünü &quot;Garson&quot; yapın.</p>
                            {mandatory && onNavigateBack && (
                                <button
                                    type="button"
                                    onClick={onNavigateBack}
                                    className="mt-8 px-6 py-3 rounded-2xl bg-slate-800 text-white font-black text-xs uppercase tracking-wider"
                                >
                                    Panele dön
                                </button>
                            )}
                        </div>
                    ) : (
                    <>
                        {showAllAsFallback && (
                            <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-4 px-1">Garson rolü tanımlı değil — tüm personel listeleniyor</p>
                        )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {displayList.map((staff) => {
                            const accent = getStaffAccentColor(staff.id);
                            const selected = confirmStaff?.id === staff.id;
                            return (
                            <button
                                key={staff.id}
                                type="button"
                                onClick={() => handleStaffSelect(staff)}
                                className={cn(
                                    "flex items-center gap-4 p-5 rounded-[2rem] border-[3px] transition-all duration-300 group text-left shadow-sm",
                                    selected
                                        ? "bg-blue-50 shadow-md transform scale-[1.02]"
                                        : "bg-white hover:bg-slate-50/80 hover:shadow-lg"
                                )}
                                style={{
                                    borderColor: selected ? accent : accent,
                                    boxShadow: selected ? `0 0 0 2px ${accent}40, 0 8px 24px ${accent}25` : `0 2px 8px ${accent}18`,
                                }}
                            >
                                <div
                                    className="w-14 h-14 shrink-0 rounded-[1.25rem] flex items-center justify-center transition-colors shadow-sm"
                                    style={{
                                        backgroundColor: selected ? accent : `${accent}22`,
                                        color: selected ? '#fff' : accent,
                                        boxShadow: selected ? `0 0 0 3px ${accent}44` : undefined,
                                    }}
                                >
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
                                    <CheckCircle className="w-5 h-5 shrink-0 animate-in zoom-in duration-300" style={{ color: accent }} />
                                )}
                            </button>
                            );
                        })}
                    </div>
                    </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 bg-slate-50 border-t border-slate-100 text-center shrink-0 flex flex-col gap-3 items-center">
                    {mandatory && onNavigateBack && (
                        <button
                            type="button"
                            onClick={onNavigateBack}
                            className="text-[11px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 underline underline-offset-2"
                        >
                            Panele dön (masaları kullanmadan)
                        </button>
                    )}
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

