
import React, { useState, useEffect } from 'react';
import {
    ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
    Clock, User, Users, Cpu, ShoppingCart, List, Grid, Columns,
    Search, Filter
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { useLanguage } from '@/contexts/LanguageContext';
import { BeautyAppointment, AppointmentStatus } from '../../../types/beauty';
import { WeekView, MonthView } from './WeekMonthViews';
import { StaffTimelineView } from './StaffTimelineView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';
import '../ClinicStyles.css';

type ViewType = 'day' | 'week' | 'month' | 'timeline';

export function SmartScheduler() {
    const { appointments, loadAppointments, isLoading } = useBeautyStore();
    const { t } = useLanguage();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<ViewType>('day');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const dateStr = currentDate.toISOString().split('T')[0];
        loadAppointments(dateStr);
    }, [currentDate]);

    const handlePrevious = () => {
        const newDate = new Date(currentDate);
        if (view === 'day') newDate.setDate(newDate.getDate() - 1);
        else if (view === 'week') newDate.setDate(newDate.getDate() - 7);
        else if (view === 'month') newDate.setMonth(newDate.getMonth() - 1);
        setCurrentDate(newDate);
    };

    const handleNext = () => {
        const newDate = new Date(currentDate);
        if (view === 'day') newDate.setDate(newDate.getDate() + 1);
        else if (view === 'week') newDate.setDate(newDate.getDate() + 7);
        else if (view === 'month') newDate.setMonth(newDate.getMonth() + 1);
        setCurrentDate(newDate);
    };

    const handleToday = () => setCurrentDate(new Date());

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('tr-TR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const timeSlots = Array.from({ length: 13 }, (_, i) => {
        const hour = i + 9;
        return `${hour.toString().padStart(2, '0')}:00`;
    });

    const getStatusStyles = (status: AppointmentStatus) => {
        const styles = {
            scheduled: 'bg-blue-50 text-blue-700 border-blue-100',
            confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
            in_progress: 'bg-purple-50 text-purple-700 border-purple-100',
            completed: 'bg-gray-50 text-gray-700 border-gray-100',
            cancelled: 'bg-red-50 text-red-700 border-red-100',
            no_show: 'bg-orange-50 text-orange-700 border-orange-100'
        };
        return styles[status] || 'bg-gray-50 text-gray-700 border-gray-100';
    };

    const renderAppointmentCard = (apt: BeautyAppointment) => {
        const color = apt.service_color || '#9333ea';
        return (
            <div
                key={apt.id}
                className="group p-4 rounded-2xl border border-gray-100 bg-white hover:shadow-xl transition-all cursor-pointer relative overflow-hidden"
            >
                <div
                    className="absolute left-0 top-0 bottom-0 w-1.5"
                    style={{ backgroundColor: color }}
                ></div>
                <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                        <h4 className="font-black text-gray-900 uppercase text-sm truncate">{apt.customer_name}</h4>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{apt.service_name}</p>
                    </div>
                    <span className="text-[10px] font-black text-gray-900 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                        {apt.appointment_time}
                    </span>
                </div>
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                            <User size={12} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase">{apt.specialist_name}</span>
                    </div>
                    <span className={cn(
                        "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border",
                        getStatusStyles(apt.status)
                    )}>
                        {apt.status}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
            {/* Control Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 z-20 shadow-sm">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <button onClick={handlePrevious} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400">
                            <ChevronLeft size={20} />
                        </button>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest min-w-[200px] text-center">
                            {formatDate(currentDate)}
                        </h3>
                        <button onClick={handleNext} className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-400">
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    <Button
                        onClick={handleToday}
                        variant="ghost"
                        className="text-[10px] font-black uppercase tracking-widest text-purple-600 hover:bg-purple-50"
                    >
                        BUGÜN
                    </Button>
                </div>

                <div className="flex items-center bg-gray-100 p-1 rounded-2xl">
                    {(['day', 'week', 'month', 'timeline'] as ViewType[]).map((v) => (
                        <button
                            key={v}
                            onClick={() => setView(v)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                view === v
                                    ? "bg-white text-purple-600 shadow-sm"
                                    : "text-gray-400 hover:text-gray-600"
                            )}
                        >
                            {v === 'day' ? 'GÜN' : v === 'week' ? 'HAFTA' : v === 'month' ? 'AY' : 'TİMELİNE'}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <Input
                            placeholder="RANDEVU ARA..."
                            className="pl-10 h-10 w-48 bg-gray-50 border-gray-100 rounded-xl text-[10px] font-black"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button className="bg-purple-600 hover:bg-purple-700 text-white font-black text-[10px] tracking-widest px-4 h-10 rounded-xl shadow-lg shadow-purple-600/20 active:scale-95 transition-all">
                        <Plus size={16} className="mr-2" />
                        YENİ RANDEVU
                    </Button>
                </div>
            </div>

            {/* Calendar Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                {isLoading ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-4">
                        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Randevular Yükleniyor...</p>
                    </div>
                ) : (
                    <>
                        {view === 'day' && (
                            <div className="space-y-6 max-w-5xl mx-auto">
                                {timeSlots.map(time => {
                                    const slotApts = appointments.filter(a => a.appointment_time.startsWith(time.split(':')[0]));
                                    return (
                                        <div key={time} className="flex gap-6 group">
                                            <div className="w-20 pt-1 shrink-0">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-purple-600 transition-colors">{time}</span>
                                            </div>
                                            <div className="flex-1 min-h-[100px] border-l-2 border-gray-100 pl-6 space-y-3 group-hover:border-purple-200 transition-colors">
                                                {slotApts.length === 0 ? (
                                                    <div className="h-full border border-dashed border-gray-200 rounded-2xl flex items-center justify-center text-gray-300 hover:bg-gray-50 transition-colors cursor-pointer group/btn">
                                                        <Plus size={20} className="group-hover/btn:scale-125 transition-transform" />
                                                    </div>
                                                ) : (
                                                    slotApts.map(renderAppointmentCard)
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {view === 'week' && (
                            <WeekView
                                currentDate={currentDate}
                                appointments={appointments}
                                onAppointmentClick={() => { }}
                            />
                        )}

                        {view === 'month' && (
                            <MonthView
                                currentDate={currentDate}
                                appointments={appointments}
                                onDayClick={(day) => {
                                    setCurrentDate(day);
                                    setView('day');
                                }}
                            />
                        )}

                        {view === 'timeline' && (
                            <StaffTimelineView
                                currentDate={currentDate}
                                appointments={appointments}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}



