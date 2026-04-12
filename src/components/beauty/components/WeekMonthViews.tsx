
import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, CalendarDays, X } from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { AppointmentStatus, BeautyAppointment } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd } from '../../../utils/dateLocal';
import { useLanguage } from '../../../contexts/LanguageContext';
import { CLINIC } from '../clinicDesignTokens';
import '../ClinicStyles.css';

function aptTimeRaw(apt: BeautyAppointment): string {
    return apt.appointment_time ?? apt.time ?? '';
}

export interface WeekMonthViewsProps {
    currentDate: Date;
    timeSlots?: string[];
    onAppointmentClick: (apt: BeautyAppointment) => void;
    onNewAppointment?: (time?: string, date?: string) => void;
    groupBy?: 'none' | 'staff' | 'device';
    /** Pazartesi–Cuma (DevExpress work week). */
    workWeekOnly?: boolean;
    /** Ay görünümünde güne tıklanınca gün takvimine geçiş (verilen Date yerel). */
    onDayNavigate?: (day: Date) => void;
    /** Verilirse store yerine bu liste (ör. üst bileşenden arama filtresi). */
    appointmentsOverride?: BeautyAppointment[];
}

export function WeekView({ currentDate, timeSlots = [], onAppointmentClick, onNewAppointment, groupBy = 'none', workWeekOnly = false, appointmentsOverride }: WeekMonthViewsProps) {
    const { appointments: storeApts } = useBeautyStore();
    const appointments = appointmentsOverride ?? storeApts;

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
        return workWeekOnly ? days.slice(0, 5) : days;
    };

    const weekDays = getWeekDays();
    const colCount = weekDays.length + 1;

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <div className={workWeekOnly ? 'min-w-[780px]' : 'min-w-[1000px]'}>
                    <div className="border-b border-gray-100 bg-gray-50 grid" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                        <div className="p-3 border-r border-gray-100 flex items-center justify-center">
                            <Clock size={16} className="text-gray-400" />
                        </div>
                        {weekDays.map((day, idx) => {
                            const isToday = day.toDateString() === new Date().toDateString();
                            return (
                                <div key={idx} className={`p-3 text-center border-r border-gray-100 last:border-r-0 ${isToday ? 'bg-[#ede9fe]' : ''}`}>
                                    <div className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? 'text-[#7c3aed]' : 'text-gray-500'}`}>
                                        {day.toLocaleDateString('tr-TR', { weekday: 'short' })}
                                    </div>
                                    <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-[#7c3aed]' : 'text-gray-900'}`}>
                                        {day.getDate()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {timeSlots.map((timeSlot) => (
                        <div key={timeSlot} className="border-b border-gray-100 grid" style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}>
                            <div className="p-3 border-r border-gray-100 bg-gray-50/50 flex items-center justify-center font-medium text-xs text-gray-400">
                                {timeSlot}
                            </div>
                            {weekDays.map((day, idx) => {
                                const dateStr = formatLocalYmd(day);
                                const slotHour = timeSlot.split(':')[0];
                                const dayAppointments = appointments.filter(apt => {
                                    if (beautyAppointmentDateKey(apt) !== dateStr) return false;
                                    const raw = aptTimeRaw(apt);
                                    return raw.startsWith(slotHour);
                                });
                                if (groupBy === 'staff' && dayAppointments.length > 0) {
                                    // Handle grouping if needed, but for general view we show all
                                }

                                return (
                                    <div
                                        key={idx}
                                        className="p-1 border-r border-gray-100 last:border-r-0 min-h-[80px] hover:bg-gray-50 transition-colors group relative"
                                        onClick={() => onNewAppointment?.(timeSlot, dateStr)}
                                    >
                                        {dayAppointments.length > 0 ? (
                                            <div className="space-y-1">
                                                {dayAppointments.map(apt => {
                                                    const done = apt.status === AppointmentStatus.COMPLETED || apt.status === 'completed';
                                                    const accent = apt.service_color || '#9333ea';
                                                    return (
                                                    <div
                                                        key={apt.id}
                                                        onClick={(e) => { e.stopPropagation(); onAppointmentClick(apt); }}
                                                        className="p-2 rounded-lg border-l-4 shadow-sm cursor-pointer hover:shadow-md transition-all text-[10px]"
                                                        style={{
                                                            borderLeftColor: done ? '#059669' : accent,
                                                            backgroundColor: done ? 'rgba(5, 150, 105, 0.16)' : `${accent}10`,
                                                        }}
                                                    >
                                                        <div className="font-bold text-gray-900 truncate uppercase">{apt.customer_name ?? '—'}</div>
                                                        <div className="text-gray-600 truncate mt-0.5">{apt.service_name ?? '—'}</div>
                                                        <div className="text-[8px] text-gray-400 mt-0.5 font-medium">{apt.specialist_name ?? apt.staff_name ?? '—'}</div>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="w-6 h-6 rounded-full bg-[#ede9fe] text-[#7c3aed] flex items-center justify-center text-sm font-bold">+</div>
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

const LOCALE_BY_LANG: Record<string, string> = { tr: 'tr-TR', en: 'en-US', ar: 'ar-SA', ku: 'ku-IQ' };

const POPOVER_W = 300;
const POPOVER_MAX_H = 320;

function computePopoverPosition(rect: DOMRect) {
    const margin = 8;
    let left = rect.left + rect.width / 2 - POPOVER_W / 2;
    let top = rect.bottom + margin;
    if (left < margin) left = margin;
    if (left + POPOVER_W > window.innerWidth - margin) left = window.innerWidth - margin - POPOVER_W;
    if (top + POPOVER_MAX_H > window.innerHeight - margin) {
        top = rect.top - margin - POPOVER_MAX_H;
        if (top < margin) top = margin;
    }
    return { top, left };
}

export function MonthView({ currentDate, onAppointmentClick, onNewAppointment, onDayNavigate, appointmentsOverride }: WeekMonthViewsProps) {
    const { appointments: storeApts } = useBeautyStore();
    const appointments = appointmentsOverride ?? storeApts;
    const { tm, language } = useLanguage();

    const monthTitle = useMemo(() => {
        const loc = LOCALE_BY_LANG[language] ?? 'tr-TR';
        return currentDate.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
    }, [currentDate, language]);

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

    const [monthPopover, setMonthPopover] = useState<{ day: Date; rect: DOMRect } | null>(null);

    useEffect(() => {
        if (!monthPopover) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMonthPopover(null);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [monthPopover]);

    const popoverApts = useMemo(() => {
        if (!monthPopover) return [];
        return appointments
            .filter(apt => beautyAppointmentDateKey(apt) === formatLocalYmd(monthPopover.day))
            .sort((a, b) => aptTimeRaw(a).localeCompare(aptTimeRaw(b)));
    }, [monthPopover, appointments]);

    const popoverTitle = useMemo(() => {
        if (!monthPopover) return '';
        const loc = LOCALE_BY_LANG[language] ?? 'tr-TR';
        return monthPopover.day.toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }, [monthPopover, language]);

    const weekDayShortLabels = useMemo(
        () => [tm('bWeekdayMonShort'), tm('bWeekdayTueShort'), tm('bWeekdayWedShort'), tm('bWeekdayThuShort'), tm('bWeekdayFriShort'), tm('bWeekdaySatShort'), tm('bWeekdaySunShort')],
        [language],
    );

    return (
        <>
        <div
            className="overflow-hidden rounded-[10px] shadow-sm"
            style={{
                background: CLINIC.surface,
                border: `1px solid ${CLINIC.border}`,
                boxShadow: CLINIC.shadowSm,
            }}
        >
            {/* Ay / yıl başlığı (DevExpress ay görünümü üst şeridi) */}
            <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: CLINIC.border, background: CLINIC.violetSurface }}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <CalendarDays size={18} style={{ color: CLINIC.violet, flexShrink: 0 }} />
                    <span
                        className="text-base font-extrabold capitalize truncate"
                        style={{ color: CLINIC.textPrimary, letterSpacing: '-0.02em' }}
                    >
                        {monthTitle}
                    </span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline" style={{ color: CLINIC.textMuted }}>
                    {tm('bMonth')}
                </span>
            </div>

            {/* Hafta günleri — Pazartesi başlangıç */}
            <div className="grid grid-cols-7 border-b" style={{ borderColor: CLINIC.border, background: CLINIC.surfaceMuted }}>
                {weekDayShortLabels.map((day, i) => (
                    <div
                        key={`wd-${i}`}
                        className={`p-2.5 text-center border-r last:border-r-0 ${i >= 5 ? 'bg-[#faf9fd]' : ''}`}
                        style={{ borderColor: CLINIC.border }}
                    >
                        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: i >= 5 ? CLINIC.violet : CLINIC.textMuted }}>
                            {day}
                        </div>
                    </div>
                ))}
            </div>

            {monthDays.map((week, weekIdx) => (
                <div key={weekIdx} className="grid grid-cols-7 border-b last:border-b-0" style={{ borderColor: CLINIC.border }}>
                    {week.map((day, dayIdx) => {
                        const dateStr = formatLocalYmd(day);
                        const dayAppointments = appointments.filter(apt => beautyAppointmentDateKey(apt) === dateStr);
                        const isToday = day.toDateString() === today.toDateString();
                        const isCurrentMonth = day.getMonth() === currentMonth;
                        const isWeekend = dayIdx >= 5;

                        return (
                            <div
                                key={dayIdx}
                                role="button"
                                tabIndex={0}
                                title={day.toLocaleDateString(LOCALE_BY_LANG[language] ?? 'tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                onClick={() => {
                                    if (onDayNavigate) onDayNavigate(day);
                                    else onNewAppointment?.(undefined, dateStr);
                                }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        if (onDayNavigate) onDayNavigate(day);
                                        else onNewAppointment?.(undefined, dateStr);
                                    }
                                }}
                                className="p-2 min-h-[128px] sm:min-h-[140px] border-r last:border-r-0 cursor-pointer transition-colors"
                                style={{
                                    borderColor: CLINIC.border,
                                    background: !isCurrentMonth
                                        ? 'rgba(249, 250, 251, 0.85)'
                                        : isWeekend
                                            ? 'rgba(250, 249, 253, 0.9)'
                                            : CLINIC.surface,
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = CLINIC.violetLight;
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = !isCurrentMonth
                                        ? 'rgba(249, 250, 251, 0.85)'
                                        : isWeekend
                                            ? 'rgba(250, 249, 253, 0.9)'
                                            : CLINIC.surface;
                                }}
                            >
                                <div className="flex items-start justify-between gap-1 mb-1.5">
                                    <div
                                        className={`text-xs font-bold flex items-center justify-center shrink-0 ${isToday
                                            ? 'w-7 h-7 text-white rounded-lg shadow-md'
                                            : isCurrentMonth
                                                ? ''
                                                : 'text-gray-300'
                                            }`}
                                        style={
                                            isToday
                                                ? { background: CLINIC.violet, boxShadow: `0 4px 12px ${CLINIC.borderHover}66` }
                                                : isCurrentMonth
                                                    ? { color: CLINIC.textPrimary }
                                                    : undefined
                                        }
                                    >
                                        {day.getDate()}
                                    </div>
                                    {dayAppointments.length > 0 && isCurrentMonth && (
                                        <div
                                            className="text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0"
                                            style={{ background: CLINIC.violetLight, color: CLINIC.violetHover }}
                                        >
                                            {dayAppointments.length} {tm('bAppointmentWord')}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    {dayAppointments.slice(0, 3).map(apt => (
                                        <div
                                            key={apt.id}
                                            className="px-1.5 py-1 rounded-md text-[9px] font-medium truncate flex items-center gap-1"
                                            style={{
                                                border: `1px solid ${CLINIC.border}`,
                                                background: CLINIC.surfaceMuted,
                                                borderLeftWidth: 3,
                                                borderLeftColor: apt.service_color || CLINIC.violet,
                                            }}
                                            onClick={(e) => { e.stopPropagation(); onAppointmentClick(apt); }}
                                        >
                                            <span className="font-mono font-bold shrink-0" style={{ color: CLINIC.textMuted }}>
                                                {(aptTimeRaw(apt)).slice(0, 5)}
                                            </span>
                                            <span className="truncate" style={{ color: CLINIC.textPrimary }}>
                                                {apt.customer_name}
                                            </span>
                                        </div>
                                    ))}
                                    {dayAppointments.length > 3 && (
                                        <button
                                            type="button"
                                            className="text-[8px] font-bold text-center py-0.5 rounded w-full cursor-pointer hover:opacity-90"
                                            style={{ color: CLINIC.violet, background: CLINIC.violetLight, border: 'none' }}
                                            onClick={e => {
                                                e.stopPropagation();
                                                setMonthPopover({ day: new Date(day), rect: e.currentTarget.getBoundingClientRect() });
                                            }}
                                        >
                                            +{dayAppointments.length - 3}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>

        {monthPopover &&
            createPortal(
                <>
                    <div
                        className="fixed inset-0"
                        style={{ zIndex: 10040, background: 'rgba(17,24,39,0.25)' }}
                        onClick={() => setMonthPopover(null)}
                        aria-hidden
                    />
                    <div
                        className="fixed rounded-[10px] overflow-hidden flex flex-col"
                        style={{
                            zIndex: 10041,
                            ...computePopoverPosition(monthPopover.rect),
                            width: POPOVER_W,
                            maxHeight: POPOVER_MAX_H,
                            background: CLINIC.surface,
                            border: `1px solid ${CLINIC.border}`,
                            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="month-popover-title"
                    >
                        <div
                            className="flex items-start justify-between gap-2 px-3 py-2.5 border-b shrink-0"
                            style={{ borderColor: CLINIC.border, background: CLINIC.violetSurface }}
                        >
                            <div className="min-w-0">
                                <p id="month-popover-title" className="text-[11px] font-extrabold leading-tight" style={{ color: CLINIC.textPrimary }}>
                                    {tm('bMonthDayAppointmentsTitle')}
                                </p>
                                <p className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: CLINIC.textSub }}>
                                    {popoverTitle}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="p-1 rounded-md shrink-0"
                                style={{ color: CLINIC.textMuted }}
                                onClick={() => setMonthPopover(null)}
                                aria-label={tm('close')}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-1.5 custom-scrollbar" style={{ maxHeight: POPOVER_MAX_H - 56 }}>
                            {popoverApts.map(apt => (
                                <button
                                    key={apt.id}
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 rounded-md text-[10px] font-medium transition-colors"
                                    style={{
                                        border: `1px solid ${CLINIC.border}`,
                                        background: CLINIC.surfaceMuted,
                                        borderLeftWidth: 3,
                                        borderLeftColor: apt.service_color || CLINIC.violet,
                                    }}
                                    onClick={() => {
                                        onAppointmentClick(apt);
                                        setMonthPopover(null);
                                    }}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono font-bold" style={{ color: CLINIC.textMuted }}>
                                            {(aptTimeRaw(apt)).slice(0, 5)}
                                        </span>
                                        <span className="truncate font-bold" style={{ color: CLINIC.textPrimary }}>
                                            {apt.customer_name ?? '—'}
                                        </span>
                                    </div>
                                    <div className="truncate mt-0.5" style={{ color: CLINIC.textSub }}>
                                        {apt.service_name ?? '—'}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
}

export interface AgendaViewProps {
    currentDate: Date;
    appointmentsOverride?: BeautyAppointment[];
    onAppointmentClick: (apt: BeautyAppointment) => void;
    /** Tarih başlığına tıklanınca gün görünümüne geçiş */
    onDayNavigate?: (day: Date) => void;
    agendaDuration?: number;
}

/** DevExpress Agenda benzeri: tarihe göre gruplanmış kompakt liste */
export function AgendaView({
    currentDate,
    appointmentsOverride,
    onAppointmentClick,
    onDayNavigate,
    agendaDuration = 7,
}: AgendaViewProps) {
    const { appointments: storeApts } = useBeautyStore();
    const appointments = appointmentsOverride ?? storeApts;
    const { tm } = useLanguage();

    const days = useMemo(() => {
        const out: Date[] = [];
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        for (let i = 0; i < agendaDuration; i++) {
            out.push(new Date(d));
            d.setDate(d.getDate() + 1);
        }
        return out;
    }, [currentDate, agendaDuration]);

    const byDay = useMemo(() => {
        const m = new Map<string, BeautyAppointment[]>();
        for (const day of days) {
            m.set(formatLocalYmd(day), []);
        }
        for (const apt of appointments) {
            const k = beautyAppointmentDateKey(apt);
            if (!k || !m.has(k)) continue;
            m.get(k)!.push(apt);
        }
        for (const k of m.keys()) {
            m.get(k)!.sort((a, b) => aptTimeRaw(a).localeCompare(aptTimeRaw(b)));
        }
        return m;
    }, [appointments, days]);

    const hasAny = useMemo(() => [...byDay.values()].some(arr => arr.length > 0), [byDay]);

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm max-w-3xl mx-auto">
            {!hasAny ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300 gap-2">
                    <CalendarDays size={36} />
                    <p className="text-xs font-bold uppercase tracking-wider">{tm('bAgendaEmpty')}</p>
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {days.map(day => {
                        const key = formatLocalYmd(day);
                        const list = byDay.get(key) ?? [];
                        if (list.length === 0) return null;
                        const isToday = day.toDateString() === new Date().toDateString();
                        return (
                            <div key={key}>
                                <button
                                    type="button"
                                    onClick={() => onDayNavigate?.(day)}
                                    className={`w-full text-left px-4 py-2.5 flex items-center gap-2 border-b border-gray-100 ${isToday ? 'bg-[#ede9fe]' : 'bg-gray-50'}`}
                                >
                                    <CalendarDays size={14} className={isToday ? 'text-[#7c3aed]' : 'text-gray-400'} />
                                    <span className={`text-[11px] font-black uppercase tracking-wider ${isToday ? 'text-[#6d28d9]' : 'text-gray-600'}`}>
                                        {day.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </span>
                                    {isToday && (
                                        <span className="text-[9px] font-bold text-[#7c3aed] bg-white px-1.5 py-0.5 rounded">{tm('bToday')}</span>
                                    )}
                                </button>
                                <ul className="py-1">
                                    {list.map(apt => (
                                        <li key={apt.id}>
                                            <button
                                                type="button"
                                                onClick={() => onAppointmentClick(apt)}
                                                className="w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-[#ede9fe]/70 transition-colors border-b border-gray-50 last:border-0"
                                            >
                                                <span className="text-xs font-mono font-bold text-gray-500 tabular-nums shrink-0 pt-0.5">
                                                    {(aptTimeRaw(apt)).slice(0, 5)}
                                                </span>
                                                <span className="w-1 self-stretch rounded-full shrink-0 mt-0.5" style={{ background: apt.service_color || '#9333ea' }} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-xs font-bold text-gray-900 truncate">{apt.customer_name ?? '—'}</div>
                                                    <div className="text-[10px] text-gray-500 font-medium truncate">{apt.service_name ?? '—'}</div>
                                                    <div className="text-[9px] text-gray-400 mt-0.5 truncate">{apt.specialist_name ?? apt.staff_name ?? '—'}</div>
                                                </div>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

