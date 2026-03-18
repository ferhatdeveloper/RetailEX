
import React, { useState, useEffect, useMemo } from 'react';
import {
    ChevronLeft, ChevronRight, Plus, Clock,
    User, Cpu, List, Search, X,
    CalendarDays, CheckCircle2, ArrowLeft, Sparkles, Star
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import { BeautyAppointment, AppointmentStatus } from '../../../types/beauty';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import { WeekView, MonthView } from './WeekMonthViews';
import { StaffTimelineView } from './StaffTimelineView';
import { AppointmentPOS } from './AppointmentPOS';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import '../ClinicStyles.css';

type ViewType = 'day' | 'week' | 'month' | 'timeline' | 'device' | 'list';

const EMPTY_FORM = {
    customer_id: '', service_id: '', staff_id: '', device_id: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00', duration: 30, total_price: 0,
    status: AppointmentStatus.SCHEDULED, notes: '', type: 'regular', is_package_session: false,
};

// ─── New Appointment Full Page ────────────────────────────────────────────────
function NewAppointmentPage({
    prefillDate,
    prefillTime,
    onBack,
    onSaved,
}: {
    prefillDate: string;
    prefillTime: string;
    onBack: () => void;
    onSaved: () => void;
}) {
    const { specialists, services, customers, devices, createAppointment } = useBeautyStore();
    const { tm } = useLanguage();
    const [form, setForm] = useState({ ...EMPTY_FORM, date: prefillDate, time: prefillTime });
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState(false);

    const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
        scheduled:   { label: tm('bAppointmentScheduled'), color: '#6366f1', bg: '#eef2ff' },
        confirmed:   { label: tm('bAppointmentConfirmed'), color: '#0284c7', bg: '#e0f2fe' },
        in_progress: { label: tm('bAppointmentStarted'),   color: '#d97706', bg: '#fef3c7' },
        completed:   { label: tm('bAppointmentCompleted'), color: '#059669', bg: '#d1fae5' },
        cancelled:   { label: tm('bAppointmentCancelled'), color: '#dc2626', bg: '#fee2e2' },
        no_show:     { label: tm('bAppointmentNoShow'),    color: '#9ca3af', bg: '#f3f4f6' },
    };

    const selectedService  = services.find(s => s.id === form.service_id);
    const selectedCustomer = customers.find(c => c.id === form.customer_id);
    const selectedStaff    = specialists.find(s => s.id === form.staff_id);

    const onServiceChange = (id: string) => {
        const svc = services.find(s => s.id === id);
        setForm(p => ({ ...p, service_id: id, duration: svc?.duration_min ?? 30, total_price: svc?.price ?? 0 }));
    };

    const handleSave = async () => {
        if (!form.customer_id || !form.service_id) return;
        setSaving(true);
        try {
            await createAppointment({ ...form });
            setDone(true);
            setTimeout(() => { onSaved(); }, 1200);
        } finally { setSaving(false); }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', height: 38, padding: '0 12px',
        border: '1px solid #e5e7eb', borderRadius: 6,
        fontSize: 13, fontWeight: 500, color: '#111827',
        background: '#fafafa', outline: 'none', boxSizing: 'border-box',
    };
    const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
    const labelStyle: React.CSSProperties = {
        fontSize: 11, fontWeight: 700, color: '#6b7280',
        textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5,
    };
    const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column' };

    if (done) return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#f7f6fb' }}>
            <CheckCircle2 size={56} style={{ color: '#059669' }} />
            <p style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{tm('bAppointmentCreated')}</p>
        </div>
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f7f6fb', overflow: 'hidden' }}>

            {/* Top bar */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                <button
                    onClick={onBack}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                    <ArrowLeft size={14} /> {tm('bBackToCalendar')}
                </button>
                <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
                <div>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#111827', lineHeight: 1 }}>{tm('bNewAppointment')}</p>
                    <p style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af', marginTop: 2 }}>{tm('bFillAppointmentInfo')}</p>
                </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignContent: 'start' }} className="custom-scrollbar">

                {/* LEFT: Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Section: Kişi */}
                    <div style={{ background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, padding: 20 }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <User size={13} /> {tm('bCustomerAndStaff')}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bCustomerLabel')} <span style={{ color: '#ef4444' }}>*</span></label>
                                <select value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))} style={selectStyle}>
                                    <option value="">{tm('bSelect')}</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ''}</option>)}
                                </select>
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bSpecialistLabel')}</label>
                                <select value={form.staff_id} onChange={e => setForm(p => ({ ...p, staff_id: e.target.value }))} style={selectStyle}>
                                    <option value="">{tm('bSelect')}</option>
                                    {specialists.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}{s.specialty ? ` (${s.specialty})` : ''}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Section: Hizmet */}
                    <div style={{ background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, padding: 20 }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Sparkles size={13} /> {tm('bServiceAndDevice')}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bServiceLabel')} <span style={{ color: '#ef4444' }}>*</span></label>
                                <select value={form.service_id} onChange={e => onServiceChange(e.target.value)} style={selectStyle}>
                                    <option value="">{tm('bSelect')}</option>
                                    {services.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name} — {formatMoneyAmount(s.price, { minFrac: 0, maxFrac: 0 })}</option>)}
                                </select>
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bDeviceOptional')}</label>
                                <select value={form.device_id} onChange={e => setForm(p => ({ ...p, device_id: e.target.value }))} style={selectStyle}>
                                    <option value="">{tm('bSelect')}</option>
                                    {devices.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Section: Tarih & Zaman */}
                    <div style={{ background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, padding: 20 }}>
                        <p style={{ fontSize: 12, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CalendarDays size={13} /> {tm('bDateAndTime')}
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bDate')}</label>
                                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={inputStyle} />
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bTime')}</label>
                                <input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} style={inputStyle} />
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bDurationMin')}</label>
                                <input type="number" min={5} step={5} value={form.duration} onChange={e => setForm(p => ({ ...p, duration: Number(e.target.value) }))} style={inputStyle} />
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bPriceLira')}</label>
                                <input type="number" min={0} value={form.total_price} onChange={e => setForm(p => ({ ...p, total_price: Number(e.target.value) }))} style={inputStyle} />
                            </div>
                        </div>
                    </div>

                    {/* Section: Durum & Notlar */}
                    <div style={{ background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, padding: 20 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bStatus')}</label>
                                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as AppointmentStatus }))} style={selectStyle}>
                                    {Object.entries(STATUS_CFG).map(([v, cfg]) => (
                                        <option key={v} value={v}>{cfg.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>{tm('bNotes')}</label>
                                <textarea
                                    value={form.notes}
                                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                                    placeholder={tm('bFillAppointmentInfo')}
                                    rows={2}
                                    style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'none', lineHeight: 1.5 }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {/* Preview card */}
                    <div style={{ background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ background: selectedService?.color ?? '#7c3aed', padding: '14px 16px' }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{tm('bAppointmentSummary')}</p>
                            <p style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                                {selectedService?.name ?? tm('bServiceNotSelected')}
                            </p>
                        </div>
                        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: tm('bCustomerLabel'),    value: selectedCustomer?.name ?? '—' },
                                { label: tm('bSpecialistLabel'),  value: selectedStaff?.name ?? '—' },
                                { label: tm('bDate'),             value: form.date ? new Date(form.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                                { label: tm('bTime'),             value: form.time },
                                { label: tm('bDuration'),         value: `${form.duration} ${tm('bMinutes')}` },
                                { label: tm('bPriceHeader'),      value: form.total_price > 0 ? formatMoneyAmount(form.total_price, { minFrac: 0, maxFrac: 0 }) : '—' },
                            ].map(({ label, value }) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{value}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Status badge preview */}
                    {form.status && (() => {
                        const cfg = STATUS_CFG[form.status];
                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.color}20` }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                            </div>
                        );
                    })()}

                    {/* Save button */}
                    <button
                        onClick={handleSave}
                        disabled={!form.customer_id || !form.service_id || saving}
                        style={{
                            width: '100%', height: 44, borderRadius: 6, border: 'none',
                            background: (!form.customer_id || !form.service_id) ? '#e5e7eb' : '#7c3aed',
                            color: (!form.customer_id || !form.service_id) ? '#9ca3af' : '#fff',
                            fontSize: 13, fontWeight: 800, cursor: (!form.customer_id || !form.service_id) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => { if (form.customer_id && form.service_id) e.currentTarget.style.background = '#6d28d9'; }}
                        onMouseLeave={e => { if (form.customer_id && form.service_id) e.currentTarget.style.background = '#7c3aed'; }}
                    >
                        <CalendarDays size={15} />
                        {saving ? tm('bSaving') : tm('bAppointmentCreate')}
                    </button>

                    <button
                        onClick={onBack}
                        style={{ width: '100%', height: 36, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                        {tm('cancel')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Scheduler ────────────────────────────────────────────────────────────
export function SmartScheduler() {
    const {
        appointments, loadAppointments, updateAppointmentStatus, isLoading,
        specialists, services, customers, devices,
        loadSpecialists, loadServices, loadCustomers, loadDevices,
    } = useBeautyStore();
    const { tm } = useLanguage();

    const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
        scheduled:   { label: tm('bAppointmentScheduled'), color: '#6366f1', bg: '#eef2ff' },
        confirmed:   { label: tm('bAppointmentConfirmed'), color: '#0284c7', bg: '#e0f2fe' },
        in_progress: { label: tm('bAppointmentStarted'),   color: '#d97706', bg: '#fef3c7' },
        completed:   { label: tm('bAppointmentCompleted'), color: '#059669', bg: '#d1fae5' },
        cancelled:   { label: tm('bAppointmentCancelled'), color: '#dc2626', bg: '#fee2e2' },
        no_show:     { label: tm('bAppointmentNoShow'),    color: '#9ca3af', bg: '#f3f4f6' },
    };

    const [currentDate, setCurrentDate] = useState(new Date());
    const [view,        setView]        = useState<ViewType>('day');
    const [searchTerm,  setSearchTerm]  = useState('');
    const [selectedApt, setSelectedApt] = useState<BeautyAppointment | null>(null);

    // Full-page new appointment state
    const [showNewPage,  setShowNewPage]  = useState(false);
    const [prefillTime,  setPrefillTime]  = useState('09:00');

    // Feedback state (shown after marking appointment as completed)
    const [feedbackApt,      setFeedbackApt]      = useState<BeautyAppointment | null>(null);
    const [feedbackRatings,  setFeedbackRatings]  = useState({ service: 5, staff: 5, overall: 5 });
    const [feedbackComment,  setFeedbackComment]  = useState('');
    const [feedbackSaving,   setFeedbackSaving]   = useState(false);

    useEffect(() => {
        loadSpecialists();
        loadServices();
        loadCustomers();
        loadDevices();
    }, []);

    useEffect(() => {
        const dateStr = currentDate.toISOString().split('T')[0];
        loadAppointments(dateStr);
    }, [currentDate]);

    const openNewApt = (time?: string) => {
        setPrefillTime(time ?? '09:00');
        setShowNewPage(true);
    };

    const handlePrevious = () => {
        const d = new Date(currentDate);
        if (view === 'day') d.setDate(d.getDate() - 1);
        else if (view === 'week') d.setDate(d.getDate() - 7);
        else if (view === 'month') d.setMonth(d.getMonth() - 1);
        setCurrentDate(d);
    };
    const handleNext = () => {
        const d = new Date(currentDate);
        if (view === 'day') d.setDate(d.getDate() + 1);
        else if (view === 'week') d.setDate(d.getDate() + 7);
        else if (view === 'month') d.setMonth(d.getMonth() + 1);
        setCurrentDate(d);
    };

    const handleStatusChange = async (apt: BeautyAppointment, newStatus: AppointmentStatus) => {
        await updateAppointmentStatus(apt.id, newStatus);
        if (newStatus === AppointmentStatus.COMPLETED) {
            setFeedbackApt({ ...apt, status: newStatus });
            setFeedbackRatings({ service: 5, staff: 5, overall: 5 });
            setFeedbackComment('');
        }
        setSelectedApt(null);
    };

    const handleFeedbackSubmit = async () => {
        if (!feedbackApt) return;
        setFeedbackSaving(true);
        try {
            await beautyService.addFeedback({
                appointment_id:     feedbackApt.id,
                customer_id:        feedbackApt.customer_id ?? feedbackApt.client_id,
                service_rating:     feedbackRatings.service,
                staff_rating:       feedbackRatings.staff,
                cleanliness_rating: 5,
                overall_rating:     feedbackRatings.overall,
                comment:            feedbackComment || null,
                would_recommend:    feedbackRatings.overall >= 4,
            });
        } catch (e) { logger.crudError('SmartScheduler', 'saveFeedback', e); }
        finally {
            setFeedbackSaving(false);
            setFeedbackApt(null);
        }
    };

    const timeSlots = Array.from({ length: 13 }, (_, i) => `${(i + 9).toString().padStart(2, '0')}:00`);

    const formatDate = (d: Date) => d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const renderAptCard = (apt: BeautyAppointment) => {
        const color = apt.service_color ?? '#7c3aed';
        const cfg   = STATUS_CFG[apt.status] ?? STATUS_CFG.scheduled;
        return (
            <div
                key={apt.id}
                onClick={() => setSelectedApt(apt)}
                style={{
                    background: '#fff', border: '1px solid #e8e4f0',
                    borderLeft: `3px solid ${color}`,
                    borderRadius: 6, padding: '10px 12px', cursor: 'pointer',
                    transition: 'box-shadow 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{apt.customer_name ?? '—'}</p>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: '#6b7280' }}>{(apt.appointment_time ?? apt.time ?? '').slice(0, 5)}</span>
                </div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>{apt.service_name ?? '—'}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9ca3af' }}>
                        <User size={10} />
                        <span style={{ fontSize: 10, fontWeight: 600 }}>{apt.specialist_name ?? apt.staff_name ?? '—'}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                </div>
            </div>
        );
    };

    // ── Render new appointment full page ──────────────────────────────────
    if (showNewPage) {
        return (
            <AppointmentPOS
                prefillDate={currentDate.toISOString().split('T')[0]}
                prefillTime={prefillTime}
                onBack={() => {
                    setShowNewPage(false);
                    loadAppointments(currentDate.toISOString().split('T')[0]);
                }}
            />
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f7f6fb', overflow: 'hidden' }}>

            {/* ── TOOLBAR ──────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 16 }}>

                {/* Date nav */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={handlePrevious} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}>
                        <ChevronLeft size={14} />
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', minWidth: 200, textAlign: 'center' }}>{formatDate(currentDate)}</span>
                    <button onClick={handleNext} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}>
                        <ChevronRight size={14} />
                    </button>
                    <button
                        onClick={() => setCurrentDate(new Date())}
                        style={{ padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', fontSize: 11, fontWeight: 700, color: '#7c3aed', cursor: 'pointer' }}
                    >
                        {tm('bToday')}
                    </button>
                </div>

                {/* View tabs */}
                <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 7, padding: 3, gap: 2 }}>
                    {([
                        { id: 'day',      label: tm('bDay')       },
                        { id: 'week',     label: tm('bWeek')      },
                        { id: 'month',    label: tm('bMonth')     },
                        { id: 'timeline', label: tm('bStaffView') },
                        { id: 'device',   label: tm('bDeviceView')},
                        { id: 'list',     label: tm('bListView')  },
                    ] as { id: ViewType; label: string }[]).map(({ id: v, label }) => (
                        <button
                            key={v}
                            onClick={() => setView(v)}
                            style={{
                                padding: '5px 10px', borderRadius: 5, border: 'none',
                                background: view === v ? '#fff' : 'transparent',
                                color: view === v ? '#7c3aed' : '#6b7280',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition: 'all 0.1s',
                            }}
                        >{label}</button>
                    ))}
                </div>

                {/* Right actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input
                            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            placeholder={tm('bSearch')}
                            style={{ height: 30, paddingLeft: 26, paddingRight: 10, border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 12, background: '#f9fafb', outline: 'none', width: 150 }}
                        />
                    </div>
                    <button
                        onClick={() => openNewApt()}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            height: 32, padding: '0 14px',
                            background: '#7c3aed', color: '#fff',
                            border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#6d28d9')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#7c3aed')}
                    >
                        <Plus size={14} /> {tm('bNewAppointment')}
                    </button>
                </div>
            </div>

            {/* ── CALENDAR BODY ─────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }} className="custom-scrollbar">
                {isLoading ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>{tm('bLoading')}</p>
                    </div>
                ) : (
                    <>
                        {/* ── DAY VIEW ──────────────────────────────────── */}
                        {view === 'day' && (
                            <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {timeSlots.map(time => {
                                    const slotApts = appointments.filter(a => (a.appointment_time ?? a.time ?? '').startsWith(time.split(':')[0]));
                                    return (
                                        <div key={time} style={{ display: 'flex', gap: 12, minHeight: 72 }}>
                                            <div style={{ width: 48, paddingTop: 8, flexShrink: 0, textAlign: 'right' }}>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', fontFamily: 'monospace' }}>{time}</span>
                                            </div>
                                            <div style={{ width: 1, background: '#e8e4f0', flexShrink: 0, marginTop: 12 }} />
                                            <div style={{ flex: 1, paddingTop: 4, paddingBottom: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                {slotApts.length === 0 ? (
                                                    <div
                                                        onClick={() => openNewApt(time)}
                                                        style={{ flex: 1, border: '1px dashed #e5e7eb', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 56, color: '#d1d5db', transition: 'border-color 0.1s, color 0.1s' }}
                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#c4b5fd'; e.currentTarget.style.color = '#a78bfa'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#d1d5db'; }}
                                                    >
                                                        <Plus size={16} />
                                                    </div>
                                                ) : slotApts.map(renderAptCard)}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {view === 'week'  && <WeekView currentDate={currentDate} appointments={appointments} onAppointmentClick={setSelectedApt} />}
                        {view === 'month' && <MonthView currentDate={currentDate} appointments={appointments} onDayClick={d => { setCurrentDate(d); setView('day'); }} />}
                        {view === 'timeline' && <StaffTimelineView currentDate={currentDate} appointments={appointments} />}

                        {/* ── DEVICE VIEW ───────────────────────────────── */}
                        {view === 'device' && (
                            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', height: '100%' }} className="custom-scrollbar">
                                {devices.length === 0 ? (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', gap: 8 }}>
                                        <Cpu size={36} />
                                        <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bNoDevicesDefined')}</p>
                                    </div>
                                ) : devices.map(device => {
                                    const devApts = appointments.filter(a => a.device_id === device.id);
                                    return (
                                        <div key={device.id} style={{ flexShrink: 0, width: 260, background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e4f0', background: '#f5f3ff', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 28, height: 28, background: '#7c3aed', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Cpu size={13} color="#fff" />
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: 12, fontWeight: 800, color: '#111827' }}>{device.name}</p>
                                                    <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{devApts.length} {tm('bAppointmentWord')}</p>
                                                </div>
                                            </div>
                                            <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                                                {timeSlots.map(time => {
                                                    const slot = devApts.filter(a => (a.appointment_time ?? a.time ?? '').startsWith(time.split(':')[0]));
                                                    return (
                                                        <div key={time} style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', minHeight: 52 }}>
                                                            <div style={{ width: 44, flexShrink: 0, borderRight: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 8 }}>
                                                                <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', fontFamily: 'monospace' }}>{time}</span>
                                                            </div>
                                                            <div style={{ flex: 1, padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                                {slot.map(apt => (
                                                                    <div key={apt.id} style={{ padding: '4px 8px', borderRadius: 4, background: '#ede9fe', borderLeft: `3px solid ${apt.service_color ?? '#7c3aed'}`, fontSize: 11 }}>
                                                                        <p style={{ fontWeight: 700, color: '#111827' }}>{apt.customer_name ?? '—'}</p>
                                                                        <p style={{ color: '#6b7280' }}>{apt.service_name ?? '—'}</p>
                                                                    </div>
                                                                ))}
                                                                {slot.length === 0 && (
                                                                    <div onClick={() => openNewApt(time)} style={{ height: 36, borderRadius: 4, border: '1px dashed #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#d1d5db' }}>
                                                                        <Plus size={12} />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── LIST VIEW ─────────────────────────────────── */}
                        {view === 'list' && (
                            <div style={{ background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, overflow: 'hidden' }}>
                                {/* Header */}
                                <div style={{ display: 'grid', gridTemplateColumns: '52px 10px 1fr 120px 64px 88px 80px', gap: 8, padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                                    {[tm('bTimeHeader'), '', tm('bCustomerServiceHeader'), tm('bSpecialist'), tm('bDurationHeader'), tm('bStatus'), tm('bPriceHeader')].map((h, i) => (
                                        <span key={i} style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
                                    ))}
                                </div>
                                {appointments.length === 0 ? (
                                    <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#d1d5db', gap: 8 }}>
                                        <List size={32} />
                                        <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bNoAppointments')}</p>
                                    </div>
                                ) : [...appointments]
                                    .sort((a, b) => (a.appointment_time ?? '').localeCompare(b.appointment_time ?? ''))
                                    .filter(a => !searchTerm || (a.customer_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) || (a.service_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()))
                                    .map(apt => {
                                        const cfg = STATUS_CFG[apt.status] ?? STATUS_CFG.scheduled;
                                        return (
                                            <div
                                                key={apt.id}
                                                onClick={() => setSelectedApt(apt)}
                                                style={{ display: 'grid', gridTemplateColumns: '52px 10px 1fr 120px 64px 88px 80px', gap: 8, padding: '11px 16px', borderBottom: '1px solid #f3f4f6', alignItems: 'center', cursor: 'pointer', transition: 'background 0.08s' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#faf9fd')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{(apt.appointment_time ?? apt.time ?? '--:--').slice(0, 5)}</span>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: apt.service_color ?? '#7c3aed', display: 'inline-block' }} />
                                                <div>
                                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{apt.customer_name ?? '—'}</p>
                                                    <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{apt.service_name ?? '—'}</p>
                                                </div>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>{apt.specialist_name ?? '—'}</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#9ca3af' }}>
                                                    <Clock size={10} /><span style={{ fontSize: 11, fontWeight: 600 }}>{apt.duration}{tm('bDkSuffix')}</span>
                                                </div>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                                                <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', textAlign: 'right' }}>{(apt.total_price ?? 0) > 0 ? formatMoneyAmount(apt.total_price ?? 0, { minFrac: 0, maxFrac: 0 }) : '—'}</span>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ── APPOINTMENT DETAIL PANEL ─────────────────────────── */}
            {selectedApt && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
                    onClick={() => setSelectedApt(null)}
                >
                    <div
                        style={{ width: 360, height: '100%', background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f7f6fb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <p style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{selectedApt.customer_name ?? '—'}</p>
                                <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{selectedApt.service_name ?? '—'} · {(selectedApt.appointment_time ?? selectedApt.time ?? '').slice(0, 5)}</p>
                            </div>
                            <button onClick={() => setSelectedApt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
                        </div>
                        <div style={{ padding: 20, flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                                {[
                                    { label: tm('bSpecialist'),    value: selectedApt.specialist_name ?? selectedApt.staff_name ?? '—' },
                                    { label: tm('bDuration'),      value: `${selectedApt.duration ?? 30}${tm('bDkSuffix')}` },
                                    { label: tm('bDeviceView'),    value: selectedApt.device_name ?? '—' },
                                    { label: tm('bPriceHeader'),   value: (selectedApt.total_price ?? 0) > 0 ? formatMoneyAmount(selectedApt.total_price!, { minFrac: 0, maxFrac: 0 }) : '—' },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ background: '#f7f6fb', borderRadius: 6, padding: '10px 12px' }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{value}</p>
                                    </div>
                                ))}
                            </div>
                            {selectedApt.notes && (
                                <div style={{ background: '#f7f6fb', borderRadius: 6, padding: '10px 12px', marginBottom: 18 }}>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{tm('bNotes')}</p>
                                    <p style={{ fontSize: 12, color: '#374151' }}>{selectedApt.notes}</p>
                                </div>
                            )}
                            <div style={{ marginBottom: 14 }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{tm('bUpdateStatus')}</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {([
                                        { status: AppointmentStatus.CONFIRMED,   label: tm('bStatusConfirm'),                color: '#0284c7', bg: '#e0f2fe' },
                                        { status: AppointmentStatus.IN_PROGRESS, label: tm('bStatusStarted'),                color: '#d97706', bg: '#fef3c7' },
                                        { status: AppointmentStatus.COMPLETED,   label: `✓ ${tm('bAppointmentCompleted')}`, color: '#059669', bg: '#d1fae5' },
                                        { status: AppointmentStatus.CANCELLED,   label: tm('bStatusCancel'),                 color: '#dc2626', bg: '#fee2e2' },
                                        { status: AppointmentStatus.NO_SHOW,     label: tm('bStatusNoShow'),                 color: '#9ca3af', bg: '#f3f4f6' },
                                    ] as { status: AppointmentStatus; label: string; color: string; bg: string }[]).map(opt => {
                                        const isCurrent = selectedApt.status === opt.status;
                                        return (
                                            <button
                                                key={opt.status}
                                                onClick={() => handleStatusChange(selectedApt, opt.status)}
                                                disabled={isCurrent}
                                                style={{
                                                    width: '100%', padding: '9px 14px', borderRadius: 6, border: 'none',
                                                    background: isCurrent ? opt.bg : '#f9fafb',
                                                    color: isCurrent ? opt.color : '#6b7280',
                                                    fontSize: 12, fontWeight: 700, cursor: isCurrent ? 'default' : 'pointer',
                                                    textAlign: 'left',
                                                    outline: isCurrent ? `2px solid ${opt.color}40` : 'none',
                                                    transition: 'all 0.1s',
                                                }}
                                            >
                                                {isCurrent ? `● ${opt.label} (${tm('bCurrentLabel')})` : opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── FEEDBACK MODAL (after completion) ───────────────────── */}
            {feedbackApt && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 400, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ padding: '16px 20px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <CheckCircle2 size={20} color="#059669" />
                            <div>
                                <p style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{tm('bAppointmentCompletedTitle')}</p>
                                <p style={{ fontSize: 11, color: '#6b7280' }}>{feedbackApt.customer_name} — {feedbackApt.service_name}</p>
                            </div>
                        </div>
                        <div style={{ padding: 20 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 14 }}>{tm('bFeedbackOptional')}</p>
                            {([
                                { key: 'service' as const, label: tm('bFeedbackService')    },
                                { key: 'staff'   as const, label: tm('bFeedbackSpecialist') },
                                { key: 'overall' as const, label: tm('bFeedbackGeneral')    },
                            ]).map(({ key, label }) => (
                                <div key={key} style={{ marginBottom: 12 }}>
                                    <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{label}</p>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <button
                                                key={star}
                                                onClick={() => setFeedbackRatings(r => ({ ...r, [key]: star }))}
                                                style={{
                                                    width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
                                                    background: star <= feedbackRatings[key] ? '#fbbf24' : '#f3f4f6',
                                                    color: star <= feedbackRatings[key] ? '#fff' : '#9ca3af',
                                                    fontSize: 14, fontWeight: 800, transition: 'all 0.1s',
                                                }}
                                            >★</button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                            <textarea
                                value={feedbackComment}
                                onChange={e => setFeedbackComment(e.target.value)}
                                placeholder={tm('bFeedbackComment')}
                                rows={2}
                                style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 12, resize: 'none', outline: 'none', boxSizing: 'border-box', marginTop: 8 }}
                            />
                        </div>
                        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
                            <button onClick={() => setFeedbackApt(null)} style={{ flex: 1, height: 38, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                {tm('bFeedbackSkip')}
                            </button>
                            <button onClick={handleFeedbackSubmit} disabled={feedbackSaving} style={{ flex: 2, height: 38, borderRadius: 6, border: 'none', background: '#059669', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                                {feedbackSaving ? tm('bSaving') : tm('bSaveFeedback')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
