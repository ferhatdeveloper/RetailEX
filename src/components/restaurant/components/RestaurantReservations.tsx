import React, { useState, useEffect } from 'react';
import {
    Calendar, Clock, Users, Phone, User,
    Plus, Search, Filter, X, Check, Trash2,
    ChevronRight, MoreVertical, Edit2, History
} from 'lucide-react';
import { useRestaurantStore } from '../store/useRestaurantStore';
import { Reservation } from '../types';
import { cn } from '@/components/ui/utils';
import { v4 as uuidv4 } from 'uuid';

interface RestaurantReservationsProps {
    onBack: () => void;
}

export function RestaurantReservations({ onBack }: RestaurantReservationsProps) {
    const { reservations, loadReservations, addReservation, updateReservation, deleteReservation, tables } = useRestaurantStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingRes, setEditingRes] = useState<Reservation | null>(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        loadReservations(selectedDate);
    }, [selectedDate, loadReservations]);

    const filteredReservations = reservations.filter(res =>
        res.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        res.phone.includes(searchTerm)
    );

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const data: any = {
            customerName: formData.get('customerName') as string,
            phone: formData.get('phone') as string,
            reservationDate: formData.get('reservationDate') as string,
            reservationTime: formData.get('reservationTime') as string,
            guestCount: parseInt(formData.get('guestCount') as string),
            note: formData.get('note') as string,
            status: editingRes?.status || 'pending',
            tableId: formData.get('tableId') as string || undefined,
        };

        if (data.tableId) {
            const table = tables.find(t => t.id === data.tableId);
            if (table) data.tableName = table.number;
        }

        if (editingRes) {
            await updateReservation({ ...editingRes, ...data });
        } else {
            await addReservation({ ...data, id: uuidv4() });
        }
        setIsAddModalOpen(false);
        setEditingRes(null);
    };

    const getStatusColor = (status: Reservation['status']) => {
        switch (status) {
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'confirmed': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'seated': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'cancelled': return 'bg-rose-100 text-rose-700 border-rose-200';
            case 'noshow': return 'bg-slate-100 text-slate-700 border-slate-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#f8f9fa] overflow-hidden">
            {/* Header */}
            <div
                className="p-6 pb-24 relative overflow-hidden shrink-0 border-b shadow-lg"
                style={{ backgroundColor: '#2563eb', borderColor: 'rgba(96,165,250,0.4)' }}
            >
                {/* Decorative Elements */}
                <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-[-20%] left-[-5%] w-48 h-48 bg-white/5 rounded-full blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="flex items-center justify-center w-10 h-10 bg-white/15 hover:bg-white/25 border border-white/20 rounded-xl transition-all active:scale-95 shadow-inner group"
                        >
                            <X className="w-5 h-5 text-white group-hover:scale-110 transition-transform" />
                        </button>
                        <div>
                            <h1 className="text-xl font-black italic tracking-tighter text-white uppercase leading-none flex items-center gap-3">
                                <Calendar className="w-6 h-6" />
                                Rezervasyon Yönetimi
                            </h1>
                            <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest mt-1.5">
                                {selectedDate} Tarihli Rezervasyonlar • {reservations.length} Kayıt
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60 group-focus-within:text-white transition-colors" />
                            <input
                                type="text"
                                placeholder="Müşteri veya Telefon..."
                                className="bg-white/10 border border-white/20 text-white placeholder:text-white/50 pl-10 pr-4 h-10 rounded-xl w-64 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all text-xs font-bold sm:flex hidden shadow-inner"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <input
                            type="date"
                            className="h-10 bg-white/10 border border-white/20 text-white px-4 rounded-xl focus:outline-none focus:ring-2 focus:ring-white/30 transition-all text-xs font-bold shadow-inner"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                        <button
                            onClick={() => { setEditingRes(null); setIsAddModalOpen(true); }}
                            className="bg-[#2ecc71] hover:bg-[#27ae60] text-white h-10 px-5 rounded-xl font-black text-[11px] uppercase transition-all shadow-sm shadow-green-500/20 active:scale-95 flex items-center gap-2 border border-white/20 group"
                        >
                            <Plus className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
                            Yeni Rezervasyon
                        </button>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 -mt-16 px-8 pb-8 relative z-20 overflow-hidden flex flex-col">
                <div className="flex-1 bg-white/80 backdrop-blur-xl border border-white shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-[2.5rem] overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                        {filteredReservations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 py-12">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                    <History className="w-10 h-10 opacity-20" />
                                </div>
                                <p className="text-lg font-medium opacity-60">Seçili tarihte rezervasyon bulunmuyor</p>
                                <p className="text-sm opacity-40">Yeni bir kayıt eklemek için butona tıklayın</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {filteredReservations.map((res) => (
                                    <div
                                        key={res.id}
                                        className="group bg-white border border-slate-100 rounded-3xl p-5 hover:border-blue-200 hover:shadow-2xl transition-all duration-300 relative"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border", getStatusColor(res.status))}>
                                                {res.status === 'pending' ? 'Beklemede' :
                                                    res.status === 'confirmed' ? 'Onaylı' :
                                                        res.status === 'seated' ? 'Oturtuldu' :
                                                            res.status === 'cancelled' ? 'İptal' : 'Gelmedi'}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => { setEditingRes(res); setIsAddModalOpen(true); }}
                                                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => deleteReservation(res.id)}
                                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <div>
                                                <div className="text-sm font-semibold text-slate-800 line-clamp-1">{res.customerName}</div>
                                                <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                                    <Phone className="w-3 h-3" />
                                                    {res.phone}
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between bg-slate-50/50 rounded-2xl p-3 border border-slate-100/50">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center">
                                                        <Clock className="w-4 h-4 text-blue-600" />
                                                    </div>
                                                    <div className="text-sm font-bold text-slate-700">{res.reservationTime}</div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center">
                                                        <Users className="w-4 h-4 text-blue-600" />
                                                    </div>
                                                    <div className="text-sm font-bold text-slate-700">{res.guestCount} Kişi</div>
                                                </div>
                                            </div>

                                            {res.tableName && (
                                                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/50 text-blue-700 rounded-xl border border-blue-100 text-xs font-semibold">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                    Masa: {res.tableName}
                                                </div>
                                            )}

                                            {res.note && (
                                                <p className="text-xs text-slate-500 italic line-clamp-2 px-1">
                                                    "{res.note}"
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)} />
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg relative z-10 shadow-3xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-gradient-to-r from-[#2563eb] to-[#3b82f6] p-6 flex justify-between items-center text-white">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                {editingRes ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                {editingRes ? 'Rezervasyonu Düzenle' : 'Yeni Rezervasyon'}
                            </h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2 col-span-2 md:col-span-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Müşteri Adı</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            name="customerName"
                                            required
                                            defaultValue={editingRes?.customerName}
                                            className="w-full bg-slate-50 border-none rounded-2xl py-3.5 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                                            placeholder="Ad Soyad"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2 col-span-2 md:col-span-1">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Telefon</label>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            name="phone"
                                            required
                                            defaultValue={editingRes?.phone}
                                            className="w-full bg-slate-50 border-none rounded-2xl py-3.5 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                                            placeholder="05..."
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Tarih</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            name="reservationDate"
                                            type="date"
                                            required
                                            defaultValue={editingRes?.reservationDate || selectedDate}
                                            className="w-full bg-slate-50 border-none rounded-2xl py-3.5 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Saat</label>
                                    <div className="relative">
                                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            name="reservationTime"
                                            type="time"
                                            required
                                            defaultValue={editingRes?.reservationTime || "19:00"}
                                            className="w-full bg-slate-50 border-none rounded-2xl py-3.5 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Kişi Sayısı</label>
                                    <div className="relative">
                                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            name="guestCount"
                                            type="number"
                                            required
                                            defaultValue={editingRes?.guestCount || 2}
                                            className="w-full bg-slate-50 border-none rounded-2xl py-3.5 pl-12 pr-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Masa Bağla (Opsiyonel)</label>
                                    <select
                                        name="tableId"
                                        defaultValue={editingRes?.tableId}
                                        className="w-full bg-slate-50 border-none rounded-2xl py-3.5 px-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2220%22%20height%3D%2220%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cpath%20d%3D%22M5%207.5L10%2012.5L15%207.5%22%20stroke%3D%22%2394A3B8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E')] bg-[length:20px] bg-[right_1rem_center] bg-no-repeat"
                                    >
                                        <option value="">Masa Seçilmedi</option>
                                        {tables.map(table => (
                                            <option key={table.id} value={table.id}>Masa {table.number}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2 col-span-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Notlar</label>
                                    <textarea
                                        name="note"
                                        defaultValue={editingRes?.note}
                                        rows={2}
                                        className="w-full bg-slate-50 border-none rounded-2xl py-3.5 px-4 focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-800 resize-none"
                                        placeholder="Eklemek istediğiniz notlar..."
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-colors active:scale-95"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    type="submit"
                                    className="flex-[2] bg-gradient-to-r from-blue-600 to-blue-500 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-200 hover:shadow-xl hover:translate-y-[-2px] transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    <Check className="w-5 h-5" />
                                    {editingRes ? 'Güncelle' : 'Kaydet'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
