
import React from 'react';
import { Clock, User, Cpu, Users } from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautyAppointment } from '../../../types/beauty';
import '../ClinicStyles.css';

interface WeekMonthViewsProps {
    currentDate: Date;
    timeSlots: string[];
    onAppointmentClick: (apt: BeautyAppointment) => void;
    onNewAppointment: (time?: string, date?: string) => void;
    groupBy?: 'none' | 'staff' | 'device';
}

export function WeekView({ currentDate, timeSlots, onAppointmentClick, onNewAppointment, groupBy = 'none' }: WeekMonthViewsProps) {
    const { appointments, specialists } = useBeautyStore();

    const getWeekDays = () => {
        const days = [];
        const startOfWeek = new Date(currentDate);
        const dayOfWeek = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startOfWeek.setDate(diff);

        for (let i = 0; i < 7; i++) {
            const day = new Date(startOfWeek);
            day.setDate(startOfWeek.getDate() + i);
            days.push(day);
        }
        return days;
    };

    const weekDays = getWeekDays();

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <div className="min-w-[1000px]">
                    <div className="grid grid-cols-8 border-b border-gray-100 bg-gray-50">
                        <div className="p-3 border-r border-gray-100 flex items-center justify-center">
                            <Clock size={16} className="text-gray-400" />
                        </div>
                        {weekDays.map((day, idx) => {
                            const isToday = day.toDateString() === new Date().toDateString();
                            return (
                                <div key={idx} className={`p-3 text-center border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-purple-50' : ''}`}>
                                    <div className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-purple-600' : 'text-gray-500'}`}>
                                        {day.toLocaleDateString('tr-TR', { weekday: 'short' })}
                                    </div>
                                    <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-purple-600' : 'text-gray-900'}`}>
                                        {day.getDate()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {timeSlots.map((timeSlot) => (
                        <div key={timeSlot} className="grid grid-cols-8 border-b border-gray-100">
                            <div className="p-3 border-r border-gray-100 bg-gray-50/50 flex items-center justify-center font-medium text-xs text-gray-400">
                                {timeSlot}
                            </div>
                            {weekDays.map((day, idx) => {
                                const dateStr = day.toISOString().split('T')[0];
                                const dayAppointments = appointments.filter(apt => apt.date === dateStr && apt.time === timeSlot);
                                if (groupBy === 'staff' && dayAppointments.length > 0) {
                                    // Handle grouping if needed, but for general view we show all
                                }

                                return (
                                    <div
                                        key={idx}
                                        className="p-1 border-r border-gray-100 last:border-r-0 min-h-[80px] hover:bg-gray-50 transition-colors group relative"
                                        onClick={() => onNewAppointment(timeSlot, dateStr)}
                                    >
                                        {dayAppointments.length > 0 ? (
                                            <div className="space-y-1">
                                                {dayAppointments.map(apt => (
                                                    <div
                                                        key={apt.id}
                                                        onClick={(e) => { e.stopPropagation(); onAppointmentClick(apt); }}
                                                        className="p-2 rounded-lg border-l-4 shadow-sm cursor-pointer hover:shadow-md transition-all text-[10px]"
                                                        style={{
                                                            borderLeftColor: apt.service_color || '#9333ea',
                                                            backgroundColor: `${apt.service_color || '#9333ea'}10`
                                                        }}
                                                    >
                                                        <div className="font-bold text-gray-900 truncate uppercase">{apt.customer_name}</div>
                                                        <div className="text-gray-600 truncate mt-0.5">{apt.service_name}</div>
                                                        <div className="text-[8px] text-gray-400 mt-0.5 font-medium">{apt.staff_name}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">+</div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function MonthView({ currentDate, onAppointmentClick, onNewAppointment }: WeekMonthViewsProps) {
    const { appointments } = useBeautyStore();

    const getMonthDays = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const startDate = new Date(firstDay);
        const dayOfWeek = firstDay.getDay();
        const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
        startDate.setDate(firstDay.getDate() + diff);

        const days = [];
        let current = new Date(startDate);

        for (let week = 0; week < 6; week++) {
            const weekDays = [];
            for (let day = 0; day < 7; day++) {
                weekDays.push(new Date(current));
                current.setDate(current.getDate() + 1);
            }
            days.push(weekDays);
        }

        return days;
    };

    const monthDays = getMonthDays();
    const today = new Date();
    const currentMonth = currentDate.getMonth();

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
                {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(day => (
                    <div key={day} className="p-3 text-center border-r border-gray-100 last:border-r-0">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{day}</div>
                    </div>
                ))}
            </div>

            {monthDays.map((week, weekIdx) => (
                <div key={weekIdx} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
                    {week.map((day, dayIdx) => {
                        const dateStr = day.toISOString().split('T')[0];
                        const dayAppointments = appointments.filter(apt => apt.date === dateStr);
                        const isToday = day.toDateString() === today.toDateString();
                        const isCurrentMonth = day.getMonth() === currentMonth;

                        return (
                            <div
                                key={dayIdx}
                                onClick={() => onNewAppointment(undefined, dateStr)}
                                className={`p-2 min-h-[120px] border-r border-gray-100 last:border-r-0 cursor-pointer hover:bg-gray-50 transition-colors ${!isCurrentMonth ? 'bg-gray-50/30' : ''}`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className={`text-xs font-bold ${isToday
                                            ? 'w-7 h-7 bg-purple-600 text-white rounded-lg flex items-center justify-center shadow-lg shadow-purple-200'
                                            : isCurrentMonth ? 'text-gray-900' : 'text-gray-300'
                                        }`}>
                                        {day.getDate()}
                                    </div>
                                    {dayAppointments.length > 0 && isCurrentMonth && (
                                        <div className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-bold">
                                            {dayAppointments.length} randevu
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    {dayAppointments.slice(0, 3).map(apt => (
                                        <div
                                            key={apt.id}
                                            className="px-2 py-1 rounded-md text-[9px] font-medium border border-gray-100 bg-white shadow-sm truncate flex items-center gap-1"
                                            onClick={(e) => { e.stopPropagation(); onAppointmentClick(apt); }}
                                        >
                                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: apt.service_color || '#9333ea' }}></div>
                                            <span className="text-gray-400 font-bold">{apt.time}</span>
                                            <span className="text-gray-700 truncate">{apt.customer_name}</span>
                                        </div>
                                    ))}
                                    {dayAppointments.length > 3 && (
                                        <div className="text-[8px] font-bold text-gray-400 text-center uppercase mt-1">
                                            + {dayAppointments.length - 3} daha
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}


