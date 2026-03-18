import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Utensils, Plus, Minus, Users, CheckCircle, Info, Calendar, RefreshCcw } from 'lucide-react';
import { cn } from '../../ui/utils';
import { Table, Reservation } from '../types';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { RestaurantStaffPinModal } from './RestaurantStaffPinModal';

interface RestaurantTableOpenModalProps {
    table: Table;
    onClose: () => void;
    onConfirm: (covers: number, reservationId?: string) => void;
    currentStaff: string;
}

export function RestaurantTableOpenModal({
    table,
    onClose,
    onConfirm,
    currentStaff
}: RestaurantTableOpenModalProps) {
    const { reservations, loadReservations } = useRestaurantStore();
    const [covers, setCovers] = useState(table.seats || 2);
    const [selectedResId, setSelectedResId] = useState<string | undefined>(undefined);

    const [showStaffModal, setShowStaffModal] = useState(false);
    const [localStaffName, setLocalStaffName] = useState(currentStaff);

    useEffect(() => {
        setLocalStaffName(currentStaff);
    }, [currentStaff]);

    useEffect(() => {
        loadReservations(); // Load today's reservations
    }, [loadReservations]);

    const handleIncrement = () => {
        if (covers < 20) setCovers(prev => prev + 1);
    };

    const handleDecrement = () => {
        if (covers > 1) setCovers(prev => prev - 1);
    };

    const handleSelectReservation = (res: Reservation) => {
        if (selectedResId === res.id) {
            setSelectedResId(undefined);
        } else {
            setSelectedResId(res.id);
            if (res.guestCount) setCovers(res.guestCount);
        }
    };

    // Filter reservations for this table or unassigned ones
    const availableReservations = reservations.filter(r =>
        (r.status === 'pending' || r.status === 'confirmed') &&
        (!r.tableId || r.tableId === table.id)
    );

    const modalContent = (
        <div
            className="fixed inset-0 flex items-center justify-center p-4 animate-in fade-in duration-300"
            style={{
                zIndex: 2147483647,
                isolation: 'isolate',
                transform: 'translateZ(0)',
            }}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden style={{ zIndex: 0 }} />
                <div
                    className="relative bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 max-h-[90vh]"
                    style={{ zIndex: 10 }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header with Gradient */}
                    <div className="relative z-10 bg-gradient-to-r from-blue-600 to-blue-700 p-6 flex items-center justify-between text-white overflow-hidden shrink-0">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none" />

                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20">
                                <Utensils className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black uppercase tracking-tight">Masa {table.number}</h3>
                                <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">{table.location || 'Genel Alan'}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="relative z-20 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-90"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
                        {/* Session Info Bar - Clickable to change staff */}
                        <div
                            onClick={() => setShowStaffModal(true)}
                            className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:bg-blue-100/50 transition-colors group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                                    <Users className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-blue-600/60 uppercase leading-none mb-1">Garson</span>
                                    <span className="text-sm font-black text-blue-900 leading-none uppercase">{localStaffName}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-blue-400">
                                <span className="text-[10px] font-black uppercase tracking-wider">Değiştir</span>
                                <RefreshCcw className="w-4 h-4" />
                            </div>
                        </div>

                        {/* Reservations Section */}
                        {availableReservations.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5" /> Rezervasyon Seçimi
                                </p>
                                <div className="flex flex-col gap-2">
                                    {availableReservations.map(res => (
                                        <button
                                            key={res.id}
                                            onClick={() => handleSelectReservation(res)}
                                            className={cn(
                                                "flex items-center justify-between p-3 rounded-2xl border transition-all text-left",
                                                selectedResId === res.id
                                                    ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-[1.02]"
                                                    : "bg-white border-slate-100 text-slate-600 hover:border-blue-200"
                                            )}
                                        >
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold leading-none mb-1">{res.customerName}</span>
                                                <span className={cn("text-[10px] font-medium opacity-60", selectedResId === res.id ? "text-white" : "text-slate-400")}>
                                                    {res.reservationTime} • {res.guestCount} Kişi
                                                </span>
                                            </div>
                                            {selectedResId === res.id && <CheckCircle className="w-5 h-5 text-white" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Guest Counter Segment */}
                        <div className="flex flex-col items-center py-2 border-t border-slate-50 mt-4">
                            <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em] mb-6 pt-4">Kişi Sayısı</p>

                            <div className="flex items-center justify-center gap-10">
                                <button
                                    onClick={handleDecrement}
                                    className={cn(
                                        "w-14 h-14 rounded-2xl flex items-center justify-center transition-all border-2 active:scale-90",
                                        covers > 1
                                            ? "bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:text-blue-600 shadow-lg"
                                            : "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                                    )}
                                >
                                    <Minus className="w-6 h-6" />
                                </button>

                                <div className="flex flex-col items-center min-w-[100px]">
                                    <span className="text-7xl font-black text-slate-900 leading-none tracking-tighter tabular-nums">
                                        {covers}
                                    </span>
                                    <div className="flex items-center gap-1 text-blue-600 mt-2">
                                        <Users className="w-3.5 h-3.5" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Kişi</span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleIncrement}
                                    className="w-14 h-14 bg-blue-600 text-white rounded-2xl flex items-center justify-center transition-all shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-90"
                                >
                                    <Plus className="w-6 h-6" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions — yüksek z-index ile grid'in üstünde */}
                    <div className="relative z-20 p-6 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
                        <button
                            onClick={onClose}
                            className="flex-1 px-6 py-4 bg-white border border-slate-200 text-slate-500 rounded-2xl font-black uppercase text-[12px] hover:bg-slate-100 transition-colors active:scale-95"
                        >
                            VAZGEÇ
                        </button>
                        <button
                            onClick={() => onConfirm(covers, selectedResId)}
                            className="relative z-20 flex-1 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[12px] flex items-center justify-center gap-3 shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
                        >
                            <CheckCircle className="w-5 h-5" />
                            <span>MASAYI AÇ</span>
                        </button>
                    </div>
                </div>
            {showStaffModal && (
                <RestaurantStaffPinModal
                    onClose={() => setShowStaffModal(false)}
                    onSelect={(staffName) => {
                        setLocalStaffName(staffName);
                        setShowStaffModal(false);
                    }}
                    skipConfirmation
                />
            )}
        </div>
    );

    return typeof document !== 'undefined' && document.body
        ? createPortal(modalContent, document.body)
        : modalContent;
}
