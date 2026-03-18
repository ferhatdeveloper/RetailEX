
import React, { useState, useMemo } from 'react';
import { Clock, User, DollarSign, Activity } from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautyAppointment } from '../../../types/beauty';
import '../ClinicStyles.css';

interface StaffTimelineViewProps {
    currentDate: Date;
    onAppointmentClick: (apt: BeautyAppointment) => void;
    timeSlots?: string[];
    onNewAppointment?: (time?: string, date?: string) => void;
}

export function StaffTimelineView({ currentDate, onAppointmentClick, timeSlots, onNewAppointment }: StaffTimelineViewProps) {
    const { appointments, specialists } = useBeautyStore();
    const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());

    const dateStr = currentDate.toISOString().split('T')[0];
    const dayAppointments = appointments.filter(a => a.date === dateStr);

    const toggleStaffStats = (staffId: string) => {
        setExpandedStaff(prev => {
            const newSet = new Set(prev);
            if (newSet.has(staffId)) newSet.delete(staffId);
            else newSet.add(staffId);
            return newSet;
        });
    };

    const staffData = useMemo(() => {
        return specialists.map(staff => {
            const staffAppointments = dayAppointments
                .filter(a => a.staff_id === staff.id)
                .sort((a, b) => a.time.localeCompare(b.time));

            const revenue = staffAppointments
                .filter(a => a.status === 'completed')
                .reduce((sum, a) => sum + a.total_price, 0);

            const commission = (revenue * staff.commission_rate) / 100;

            return {
                ...staff,
                appointments: staffAppointments,
                revenue,
                commission
            };
        });
    }, [specialists, dayAppointments]);

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

    if (staffData.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg font-medium">Bu tarihte randevusu olan personel bulunamadı.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-100/50">
            <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="inline-flex min-w-full h-full gap-4 p-4">
                    {staffData.map((staff) => {
                        const isExpanded = expandedStaff.has(staff.id);

                        return (
                            <div
                                key={staff.id}
                                className="flex-shrink-0 w-80 bg-white border border-gray-200 rounded-2xl flex flex-col h-full shadow-sm overflow-hidden"
                            >
                                {/* Staff Header */}
                                <div
                                    onClick={() => toggleStaffStats(staff.id)}
                                    className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 cursor-pointer hover:brightness-110 transition-all border-b border-purple-700"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md">
                                                <User size={20} className="text-white" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-white uppercase tracking-tight">{staff.name}</div>
                                                <div className="text-[10px] text-white/70 font-bold uppercase tracking-widest">{staff.specialty || 'UZMAN'}</div>
                                            </div>
                                        </div>
                                        <div className="bg-white/20 px-2 py-1 rounded text-xs font-bold">
                                            {staff.appointments.length}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="text-xs space-y-1 mt-3 pt-3 border-t border-white/20 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="flex justify-between items-center">
                                                <span className="opacity-90">Toplam Ciro:</span>
                                                <span className="font-bold">{formatCurrency(staff.revenue)}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="opacity-90">Hakediş (%{staff.commission_rate}):</span>
                                                <span className="font-bold text-purple-200">{formatCurrency(staff.commission)}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Appointments List */}
                                <div className="p-3 space-y-3 bg-gray-50 flex-1 overflow-y-auto custom-scrollbar">
                                    {staff.appointments.map((apt) => {
                                        const [hours, minutes] = apt.time.split(':').map(Number);
                                        const endMinutes = hours * 60 + minutes + apt.duration;
                                        const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

                                        return (
                                            <div
                                                key={apt.id}
                                                onClick={() => onAppointmentClick(apt)}
                                                className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-200 group"
                                            >
                                                <div className="flex">
                                                    {/* Time Block */}
                                                    <div className="bg-teal-600 text-white p-3 flex flex-col items-center justify-center min-w-[70px]">
                                                        <div className="text-[10px] font-bold">{apt.time}</div>
                                                        <div className="text-[8px] opacity-75 my-0.5">-</div>
                                                        <div className="text-[10px] font-bold">{endTime}</div>
                                                    </div>

                                                    {/* Details Block */}
                                                    <div className="flex-1 bg-purple-500 text-white p-3 relative">
                                                        <div className="font-bold text-sm mb-1 uppercase truncate pr-8">{apt.customer_name}</div>
                                                        <div className="text-[10px] opacity-90 mb-2 truncate uppercase font-medium">{apt.service_name}</div>
                                                        <div className="flex items-center justify-between text-[10px] font-bold">
                                                            <span>{apt.duration} DK</span>
                                                            <span className="bg-white/20 px-1.5 py-0.5 rounded uppercase tracking-tighter">{apt.status}</span>
                                                        </div>

                                                        {/* Commission Info */}
                                                        <div className="mt-2 pt-2 border-t border-white/10 flex justify-between items-center text-[9px] font-black">
                                                            <span className="opacity-80">HAKEDİŞ:</span>
                                                            <span>{formatCurrency((apt.total_price * staff.commission_rate) / 100)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Status bar */}
                                                <div className={`h-1 ${apt.status === 'completed' ? 'bg-green-500' :
                                                    apt.status === 'cancelled' ? 'bg-red-500' :
                                                        apt.status === 'in_progress' ? 'bg-blue-400' :
                                                            'bg-yellow-400'
                                                    }`} />
                                            </div>
                                        );
                                    })}

                                    {staff.appointments.length === 0 && (
                                        <div className="flex flex-col items-center justify-center h-40 opacity-20">
                                            <Activity className="w-10 h-10 text-gray-400 mb-2" />
                                            <span className="text-[10px] font-bold uppercase tracking-widest">Randevu Yok</span>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => onNewAppointment?.(undefined, dateStr)}
                                        className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-purple-300 hover:text-purple-500 transition-all text-xs font-bold uppercase tracking-widest"
                                    >
                                        + YENİ RANDEVU
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}


