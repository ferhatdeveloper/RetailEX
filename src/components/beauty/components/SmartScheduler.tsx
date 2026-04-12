
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    ChevronLeft, ChevronRight, Plus, Clock,
    User, Cpu, List, Search, X,
    CheckCircle2, CalendarDays,
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import {
    BeautyAppointment,
    AppointmentStatus,
    BeautySatisfactionQuestion,
    BeautySatisfactionSurvey,
    BeautySurveyAnswer,
} from '../../../types/beauty';
import type { Language } from '../../../locales/translations';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import { WeekView, MonthView, AgendaView } from './WeekMonthViews';
import { DaySchedulerGrid } from './DaySchedulerGrid';
import { ResourceGroupedDayView, ResourceGroupedWeekMatrix } from './ResourceGroupedViews';
import { StaffTimelineView } from './StaffTimelineView';
import { AppointmentPOS } from './AppointmentPOS';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { safeInvoke } from '../../../utils/env';
import {
    beautyAppointmentDateKey,
    formatLocalYmd,
    getWeekRangeLocal,
    getMonthRangeLocal,
    getWorkWeekRangeLocal,
    getAgendaRangeLocal,
} from '../../../utils/dateLocal';
import '../ClinicStyles.css';
import { CLINIC } from '../clinicDesignTokens';
import { buildBeautySpanPlacements, isBeautySpanContinuation } from '../../../utils/beautyScheduleGrid';

type ViewType = 'day' | 'workweek' | 'week' | 'month' | 'agenda' | 'timeline' | 'device' | 'list';
type GroupMode = 'none' | 'staff' | 'device';
const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;

// ─── Main Scheduler ────────────────────────────────────────────────────────────
export function SmartScheduler() {
    const {
        appointments, loadAppointmentsInRange, updateAppointmentStatus, isLoading,
        specialists, services, customers, devices,
        loadSpecialists, loadServices, loadCustomers, loadDevices,
    } = useBeautyStore();
    const { tm, language } = useLanguage();

    const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
        scheduled:   { label: tm('bAppointmentScheduled'), color: '#6366f1', bg: '#eef2ff' },
        confirmed:   { label: tm('bAppointmentConfirmed'), color: '#0284c7', bg: '#e0f2fe' },
        in_progress: { label: tm('bAppointmentStarted'),   color: '#d97706', bg: '#fef3c7' },
        completed:   { label: tm('bAppointmentCompleted'), color: '#059669', bg: '#d1fae5' },
        cancelled:   { label: tm('bAppointmentCancelled'), color: '#dc2626', bg: '#fee2e2' },
        no_show:     { label: tm('bAppointmentNoShow'),    color: '#9ca3af', bg: '#f3f4f6' },
    };

    const [currentDate, setCurrentDate] = useState(new Date());
    const [view,        setView]        = useState<ViewType>('device');
    /** DevExpress WPF benzeri kaynak gruplaması (gün / hafta / iş haftası) */
    const [groupMode,   setGroupMode]   = useState<GroupMode>('none');
    const [searchTerm,  setSearchTerm]  = useState('');

    useEffect(() => {
        const onPrefill = (ev: Event) => {
            const phone = (ev as CustomEvent<{ phone?: string }>).detail?.phone?.trim();
            if (phone) setSearchTerm(phone);
        };
        window.addEventListener('beauty-callerid-prefill-search', onPrefill);
        return () => window.removeEventListener('beauty-callerid-prefill-search', onPrefill);
    }, []);
    const [slotIntervalMin, setSlotIntervalMin] = useState<number>(15);
    const [selectedApt, setSelectedApt] = useState<BeautyAppointment | null>(null);
    /** Tamamlanmış (ödemesi alınmış) randevu: tam ekran POS yerine sağ panel */
    const [paidInfoApt, setPaidInfoApt] = useState<BeautyAppointment | null>(null);

    // Full-page new appointment state
    const [showNewPage,     setShowNewPage]     = useState(false);
    const [prefillTime,     setPrefillTime]     = useState('09:00');
    const [newPrefillDate,  setNewPrefillDate]  = useState<string | null>(null);
    /** Kaynak sütunundan (personel/cihaz) tıklanınca AppointmentPOS ön doldurma */
    const [prefillStaffId,  setPrefillStaffId]  = useState<string | undefined>(undefined);
    const [prefillDeviceId, setPrefillDeviceId] = useState<string | undefined>(undefined);
    /** CRM / sihirbaz: randevudaki hizmeti sepete bir kez eklemek için */
    const [prefillServiceId, setPrefillServiceId] = useState<string | undefined>(undefined);
    const [editingApt,      setEditingApt]      = useState<BeautyAppointment | null>(null);

    // Feedback state (shown after marking appointment as completed)
    const [feedbackApt,      setFeedbackApt]      = useState<BeautyAppointment | null>(null);
    const [feedbackRatings,  setFeedbackRatings]  = useState({ service: 5, staff: 5, overall: 5 });
    const [feedbackComment,  setFeedbackComment]  = useState('');
    const [feedbackSaving,   setFeedbackSaving]   = useState(false);
    const [activeSurvey, setActiveSurvey] = useState<BeautySatisfactionSurvey | null>(null);
    const [surveyQuestions, setSurveyQuestions] = useState<BeautySatisfactionQuestion[]>([]);
    const [dynAnswers, setDynAnswers] = useState<Record<string, number | string | boolean>>({});

    const questionLabel = (q: BeautySatisfactionQuestion, lang: Language) => {
        const j = q.labels_json || {};
        return j[lang] || j.tr || j.en || j.ar || j.ku || '';
    };

    useEffect(() => {
        if (!feedbackApt) {
            setActiveSurvey(null);
            setSurveyQuestions([]);
            setDynAnswers({});
            return;
        }
        let cancelled = false;
        void beautyService.getActiveSatisfactionSurveyWithQuestions().then(({ survey, questions }) => {
            if (cancelled) return;
            setActiveSurvey(survey);
            setSurveyQuestions(questions);
            const init: Record<string, number | string | boolean> = {};
            for (const q of questions) {
                if (q.question_type === 'rating') {
                    init[q.id] = Math.min(5, q.scale_max || 5);
                } else if (q.question_type === 'text') {
                    init[q.id] = '';
                } else {
                    init[q.id] = true;
                }
            }
            setDynAnswers(init);
        }).catch(() => {
            if (!cancelled) {
                setActiveSurvey(null);
                setSurveyQuestions([]);
                setDynAnswers({});
            }
        });
        return () => { cancelled = true; };
    }, [feedbackApt?.id]);

    useEffect(() => {
        loadSpecialists();
        loadServices();
        loadCustomers();
        loadDevices();
    }, []);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const cfg: any = await safeInvoke('get_app_config');
                const v = Number(cfg?.beauty_slot_interval_min ?? 15);
                if (!cancelled && SLOT_INTERVAL_OPTIONS.includes(v as (typeof SLOT_INTERVAL_OPTIONS)[number])) {
                    setSlotIntervalMin(v);
                }
            } catch {
                // no-op: fallback to default interval
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        void (async () => {
            try {
                const cfg: any = await safeInvoke('get_app_config');
                await safeInvoke('save_app_config', {
                    config: {
                        ...cfg,
                        beauty_slot_interval_min: slotIntervalMin,
                    },
                });
            } catch {
                // no-op in browser mode
            }
        })();
    }, [slotIntervalMin]);

    useEffect(() => {
        if (view === 'week') {
            const { start, end } = getWeekRangeLocal(currentDate);
            void loadAppointmentsInRange(start, end);
        } else if (view === 'workweek') {
            const { start, end } = getWorkWeekRangeLocal(currentDate);
            void loadAppointmentsInRange(start, end);
        } else if (view === 'month') {
            const { start, end } = getMonthRangeLocal(currentDate);
            void loadAppointmentsInRange(start, end);
        } else if (view === 'agenda') {
            const { start, end } = getAgendaRangeLocal(currentDate, 7);
            void loadAppointmentsInRange(start, end);
        } else {
            const day = formatLocalYmd(currentDate);
            void loadAppointmentsInRange(day, day);
        }
    }, [currentDate, view, loadAppointmentsInRange]);

    useEffect(() => {
        if (!showNewPage) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [showNewPage]);

    const visibleAppointments = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        if (!q) return appointments;
        return appointments.filter(a =>
            (a.customer_name ?? '').toLowerCase().includes(q) ||
            (a.service_name ?? '').toLowerCase().includes(q) ||
            (a.specialist_name ?? a.staff_name ?? '').toLowerCase().includes(q)
        );
    }, [appointments, searchTerm]);

    /** Personel ve cihaz aynı anda (sihirbaz) veya tek sütun (takvim) ile doldurulabilir */
    type NewAptPrefill = { staffId?: string; deviceId?: string; serviceId?: string };

    const openNewApt = useCallback((time?: string, dateYmd?: string, prefill?: NewAptPrefill) => {
        if (dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
            const [y, mo, da] = dateYmd.split('-').map(Number);
            setCurrentDate(new Date(y, mo - 1, da));
        }
        setPrefillTime(time ?? '09:00');
        setNewPrefillDate(dateYmd ?? null);
        setEditingApt(null);
        setSelectedApt(null);
        setPrefillStaffId(prefill?.staffId);
        setPrefillDeviceId(prefill?.deviceId);
        const svc = prefill?.serviceId?.trim();
        setPrefillServiceId(svc || undefined);
        setShowNewPage(true);
    }, []);

    /** Güzellik kabuğu üst çubuğu: sihirbazdan tam ekran randevu (POS) aç */
    const openNewAptRef = useRef(openNewApt);
    openNewAptRef.current = openNewApt;
    useEffect(() => {
        const onShellOpen = (ev: Event) => {
            const ce = ev as CustomEvent<{
                dateYmd?: string;
                time?: string;
                staffId?: string;
                deviceId?: string;
                serviceId?: string;
            }>;
            const d = ce.detail;
            if (!d?.dateYmd) return;
            openNewAptRef.current(d.time, d.dateYmd, {
                staffId: d.staffId?.trim() || undefined,
                deviceId: d.deviceId?.trim() || undefined,
                serviceId: d.serviceId?.trim() || undefined,
            });
        };
        window.addEventListener('beauty-open-new-appointment', onShellOpen);
        return () => window.removeEventListener('beauty-open-new-appointment', onShellOpen);
    }, []);

    const openExistingAptInPos = (apt: BeautyAppointment) => {
        const isPaidDone = apt.status === AppointmentStatus.COMPLETED || apt.status === 'completed';
        if (isPaidDone) {
            setPaidInfoApt(apt);
            setSelectedApt(null);
            return;
        }
        setPrefillTime((apt.appointment_time ?? apt.time ?? '09:00').slice(0, 5));
        setNewPrefillDate(beautyAppointmentDateKey(apt) || null);
        setPrefillStaffId(undefined);
        setPrefillDeviceId(undefined);
        setPrefillServiceId(undefined);
        setEditingApt(apt);
        setSelectedApt(null);
        setShowNewPage(true);
    };

    const handlePrevious = () => {
        const d = new Date(currentDate);
        if (view === 'day') d.setDate(d.getDate() - 1);
        else if (view === 'week' || view === 'workweek') d.setDate(d.getDate() - 7);
        else if (view === 'month') d.setMonth(d.getMonth() - 1);
        else if (view === 'agenda') d.setDate(d.getDate() - 7);
        else d.setDate(d.getDate() - 1);
        setCurrentDate(d);
    };
    const handleNext = () => {
        const d = new Date(currentDate);
        if (view === 'day') d.setDate(d.getDate() + 1);
        else if (view === 'week' || view === 'workweek') d.setDate(d.getDate() + 7);
        else if (view === 'month') d.setMonth(d.getMonth() + 1);
        else if (view === 'agenda') d.setDate(d.getDate() + 7);
        else d.setDate(d.getDate() + 1);
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
            let payload: Parameters<typeof beautyService.addFeedback>[0];
            if (activeSurvey && surveyQuestions.length > 0) {
                const answers: BeautySurveyAnswer[] = [];
                for (const q of surveyQuestions) {
                    const v = dynAnswers[q.id];
                    const label_snapshot = questionLabel(q, language);
                    if (q.question_type === 'rating') {
                        const rating = typeof v === 'number' ? v : Math.min(5, q.scale_max || 5);
                        answers.push({ question_id: q.id, rating, label_snapshot });
                    } else if (q.question_type === 'text') {
                        answers.push({
                            question_id: q.id,
                            text: typeof v === 'string' ? v : '',
                            label_snapshot,
                        });
                    } else {
                        answers.push({
                            question_id: q.id,
                            yes_no: typeof v === 'boolean' ? v : true,
                            label_snapshot,
                        });
                    }
                }
                const ratingVals = surveyQuestions
                    .filter(q => q.question_type === 'rating')
                    .map(q => dynAnswers[q.id] as number)
                    .filter(v => typeof v === 'number');
                const avg = ratingVals.length
                    ? Math.round(ratingVals.reduce((a, b) => a + b, 0) / ratingVals.length)
                    : 5;
                const r1 = ratingVals[0] ?? avg;
                const r2 = ratingVals[1] ?? avg;
                const r3 = ratingVals[2] ?? avg;
                payload = {
                    appointment_id: feedbackApt.id,
                    customer_id: feedbackApt.customer_id ?? feedbackApt.client_id,
                    service_rating: r1,
                    staff_rating: r2,
                    cleanliness_rating: r3,
                    overall_rating: avg,
                    comment: feedbackComment || null,
                    would_recommend: avg >= 4,
                    survey_id: activeSurvey.id,
                    survey_answers: answers,
                };
            } else {
                payload = {
                    appointment_id: feedbackApt.id,
                    customer_id: feedbackApt.customer_id ?? feedbackApt.client_id,
                    service_rating: feedbackRatings.service,
                    staff_rating: feedbackRatings.staff,
                    cleanliness_rating: 5,
                    overall_rating: feedbackRatings.overall,
                    comment: feedbackComment || null,
                    would_recommend: feedbackRatings.overall >= 4,
                };
            }
            await beautyService.addFeedback(payload);
        } catch (e) { logger.crudError('SmartScheduler', 'saveFeedback', e); }
        finally {
            setFeedbackSaving(false);
            setFeedbackApt(null);
        }
    };

    const timeSlots = useMemo(() => {
        const startMin = 9 * 60;
        const endMin = 21 * 60;
        const slots: string[] = [];
        for (let m = startMin; m <= endMin; m += slotIntervalMin) {
            const hh = Math.floor(m / 60).toString().padStart(2, '0');
            const mm = (m % 60).toString().padStart(2, '0');
            slots.push(`${hh}:${mm}`);
        }
        return slots;
    }, [slotIntervalMin]);

    const slotBucket = useCallback((raw: string, interval: number): string => {
        const s = String(raw ?? '').trim();
        const m = s.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return '';
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (Number.isNaN(hh) || Number.isNaN(mm)) return '';
        const total = hh * 60 + mm;
        const buck = Math.floor(total / interval) * interval;
        const bh = Math.floor(buck / 60).toString().padStart(2, '0');
        const bm = (buck % 60).toString().padStart(2, '0');
        return `${bh}:${bm}`;
    }, []);

    const toolbarDateLabel = useMemo(() => {
        if (view === 'agenda') {
            const end = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
            end.setDate(end.getDate() + 6);
            const a = currentDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
            const b = end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
            return `${a} – ${b}`;
        }
        if (view === 'workweek') {
            const { start, end } = getWorkWeekRangeLocal(currentDate);
            const [ys, ms, ds] = start.split('-').map(Number);
            const [ye, me, de] = end.split('-').map(Number);
            const da = new Date(ys, ms - 1, ds);
            const db = new Date(ye, me - 1, de);
            return `${da.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${db.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
        return currentDate.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }, [view, currentDate]);

    const renderAptCard = (apt: BeautyAppointment) => {
        const color = apt.service_color ?? '#7c3aed';
        const cfg   = STATUS_CFG[apt.status] ?? STATUS_CFG.scheduled;
        const done  = apt.status === AppointmentStatus.COMPLETED || apt.status === 'completed';
        return (
            <div
                key={apt.id}
                onClick={() => openExistingAptInPos(apt)}
                style={{
                    background: done ? cfg.bg : '#fff',
                    border: `1px solid ${done ? cfg.color + '55' : '#e8e4f0'}`,
                    borderLeft: `3px solid ${done ? cfg.color : color}`,
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

    // ── Yeni randevu: uygulama penceresini kaplayan tam ekran (güzellik modülü çerçevesi dışında) ──
    if (showNewPage) {
        const prefillDateStr = newPrefillDate ?? formatLocalYmd(currentDate);
        return createPortal(
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 100000,
                    background: '#f7f6fb',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100dvh',
                    width: '100vw',
                    maxWidth: '100vw',
                    overflow: 'hidden',
                }}
            >
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <AppointmentPOS
                        prefillDate={prefillDateStr}
                        prefillTime={prefillTime}
                        prefillStaffId={prefillStaffId}
                        prefillDeviceId={prefillDeviceId}
                        prefillServiceId={prefillServiceId}
                        existingAppointment={editingApt}
                        onBack={() => {
                            setShowNewPage(false);
                            setNewPrefillDate(null);
                            setPrefillStaffId(undefined);
                            setPrefillDeviceId(undefined);
                            setPrefillServiceId(undefined);
                            setEditingApt(null);
                            const r = useBeautyStore.getState().lastAppointmentRange;
                            if (r) void loadAppointmentsInRange(r.start, r.end);
                        }}
                    />
                </div>
            </div>,
            document.body
        );
    }

    const showGroupBar = view === 'day' || view === 'week' || view === 'workweek';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f7f6fb', overflow: 'hidden' }}>

            {/* ── TOOLBAR ──────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 16 }}>

                {/* Date nav */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={handlePrevious} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}>
                        <ChevronLeft size={14} />
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111827', minWidth: 220, textAlign: 'center' }}>{toolbarDateLabel}</span>
                    <label
                        title={tm('bJumpToDate')}
                        aria-label={tm('bJumpToDate')}
                        style={{
                            width: 28,
                            height: 28,
                            border: '1px solid #e5e7eb',
                            borderRadius: 5,
                            background: '#f9fafb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#7c3aed',
                            position: 'relative',
                            flexShrink: 0,
                        }}
                    >
                        <input
                            type="date"
                            value={formatLocalYmd(currentDate)}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (!v) return;
                                const [y, mo, da] = v.split('-').map(Number);
                                if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da)) return;
                                setCurrentDate(new Date(y, mo - 1, da));
                            }}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                opacity: 0,
                                cursor: 'pointer',
                                width: '100%',
                                height: '100%',
                                margin: 0,
                            }}
                        />
                        <CalendarDays size={14} style={{ pointerEvents: 'none' }} />
                    </label>
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
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', background: '#f3f4f6', borderRadius: 7, padding: 3, gap: 2, maxWidth: 560 }}>
                    {([
                        { id: 'day',      label: tm('bDay') },
                        { id: 'workweek', label: tm('bWorkWeek') },
                        { id: 'week',     label: tm('bWeek') },
                        { id: 'month',    label: tm('bMonth') },
                        { id: 'agenda',   label: tm('bAgendaView') },
                        { id: 'timeline', label: tm('bStaffView') },
                        { id: 'device',   label: tm('bDeviceView') },
                        { id: 'list',     label: tm('bListView') },
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 5, padding: '0 8px', height: 30 }}>
                        <Clock size={12} color="#9ca3af" />
                        <select
                            value={slotIntervalMin}
                            onChange={e => setSlotIntervalMin(Number(e.target.value))}
                            title={tm('bSchedulerSlotIntervalTitle')}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 11, fontWeight: 700, color: '#6b7280', cursor: 'pointer' }}
                        >
                            {SLOT_INTERVAL_OPTIONS.map(min => (
                                <option key={min} value={min}>{tm('bSchedulerMinutesAbbr').replace('{n}', String(min))}</option>
                            ))}
                        </select>
                    </div>
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

            {/* ── Gruplama (WPF Scheduler Group by Resource) ───────── */}
            {showGroupBar && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 20px',
                        borderBottom: `1px solid ${CLINIC.border}`,
                        background: CLINIC.bg,
                        flexShrink: 0,
                        flexWrap: 'wrap',
                    }}
                >
                    <span style={{ fontSize: 11, fontWeight: 800, color: CLINIC.textSub, letterSpacing: '0.02em' }}>{tm('bGroupByLabel')}</span>
                    <div style={{ display: 'flex', background: CLINIC.borderMuted, borderRadius: 8, padding: 3, gap: 2 }}>
                        {([
                            { id: 'none' as const, label: tm('bGroupNone') },
                            { id: 'staff' as const, label: tm('bGroupByStaffCol') },
                            { id: 'device' as const, label: tm('bGroupByDeviceCol') },
                        ]).map(({ id: g, label }) => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setGroupMode(g)}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: groupMode === g ? CLINIC.surface : 'transparent',
                                    color: groupMode === g ? CLINIC.violet : CLINIC.textSub,
                                    fontSize: 11,
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    boxShadow: groupMode === g ? CLINIC.shadowSm : 'none',
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── CALENDAR BODY ─────────────────────────────────────── */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }} className="custom-scrollbar">
                {isLoading ? (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>{tm('bLoading')}</p>
                    </div>
                ) : (
                    <>
                        {/* ── DAY VIEW ─ */}
                        {view === 'day' && groupMode === 'none' && (
                            <DaySchedulerGrid
                                currentDate={currentDate}
                                appointments={visibleAppointments}
                                renderAppointment={renderAptCard}
                                onEmptySlotClick={(timeHHmm, dateYmd) => {
                                    if (dateYmd) {
                                        const [y, mo, day] = dateYmd.split('-').map(Number);
                                        setCurrentDate(new Date(y, mo - 1, day));
                                    }
                                    openNewApt(timeHHmm, dateYmd);
                                }}
                            />
                        )}
                        {view === 'day' && groupMode !== 'none' && (
                            <ResourceGroupedDayView
                                currentDate={currentDate}
                                appointments={visibleAppointments}
                                specialists={specialists}
                                devices={devices}
                                mode={groupMode}
                                unassignedLabel={tm('bUnassignedResource')}
                                emptyResourcesMessage={tm('bNoResourcesForGroup')}
                                timeColumnLabel={tm('bSchedulerTimeColumn')}
                                renderAppointment={renderAptCard}
                                onEmptySlotClick={(timeHHmm, dateYmd, resourceColumnId) => {
                                    if (dateYmd) {
                                        const [y, mo, day] = dateYmd.split('-').map(Number);
                                        setCurrentDate(new Date(y, mo - 1, day));
                                    }
                                    openNewApt(timeHHmm, dateYmd, groupMode === 'staff'
                                        ? { staffId: resourceColumnId }
                                        : { deviceId: resourceColumnId });
                                }}
                            />
                        )}

                        {view === 'workweek' && groupMode === 'none' && (
                            <WeekView
                                currentDate={currentDate}
                                timeSlots={timeSlots}
                                workWeekOnly
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={openExistingAptInPos}
                                onNewAppointment={(t, d) => {
                                    if (d) {
                                        const [y, mo, day] = d.split('-').map(Number);
                                        setCurrentDate(new Date(y, mo - 1, day));
                                    }
                                    openNewApt(t, d);
                                }}
                            />
                        )}
                        {view === 'workweek' && groupMode !== 'none' && (
                            <ResourceGroupedWeekMatrix
                                currentDate={currentDate}
                                appointments={visibleAppointments}
                                specialists={specialists}
                                devices={devices}
                                mode={groupMode}
                                workWeekOnly
                                unassignedLabel={tm('bUnassignedResource')}
                                resourceColumnLabel={tm('bSchedulerResourceColumn')}
                                emptyResourcesMessage={tm('bNoResourcesForGroup')}
                                onAppointmentClick={openExistingAptInPos}
                                onCellNew={(dateYmd, resourceColumnId) => {
                                    const [y, mo, day] = dateYmd.split('-').map(Number);
                                    setCurrentDate(new Date(y, mo - 1, day));
                                    openNewApt(undefined, dateYmd, groupMode === 'staff'
                                        ? { staffId: resourceColumnId }
                                        : { deviceId: resourceColumnId });
                                }}
                            />
                        )}

                        {view === 'week' && groupMode === 'none' && (
                            <WeekView
                                currentDate={currentDate}
                                timeSlots={timeSlots}
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={openExistingAptInPos}
                                onNewAppointment={(t, d) => {
                                    if (d) {
                                        const [y, mo, day] = d.split('-').map(Number);
                                        setCurrentDate(new Date(y, mo - 1, day));
                                    }
                                    openNewApt(t, d);
                                }}
                            />
                        )}
                        {view === 'week' && groupMode !== 'none' && (
                            <ResourceGroupedWeekMatrix
                                currentDate={currentDate}
                                appointments={visibleAppointments}
                                specialists={specialists}
                                devices={devices}
                                mode={groupMode}
                                workWeekOnly={false}
                                unassignedLabel={tm('bUnassignedResource')}
                                resourceColumnLabel={tm('bSchedulerResourceColumn')}
                                emptyResourcesMessage={tm('bNoResourcesForGroup')}
                                onAppointmentClick={openExistingAptInPos}
                                onCellNew={(dateYmd, resourceColumnId) => {
                                    const [y, mo, day] = dateYmd.split('-').map(Number);
                                    setCurrentDate(new Date(y, mo - 1, day));
                                    openNewApt(undefined, dateYmd, groupMode === 'staff'
                                        ? { staffId: resourceColumnId }
                                        : { deviceId: resourceColumnId });
                                }}
                            />
                        )}
                        {view === 'month' && (
                            <MonthView
                                currentDate={currentDate}
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={openExistingAptInPos}
                                onDayNavigate={day => { setCurrentDate(day); setView('day'); }}
                                onNewAppointment={(_t, d) => { if (d) openNewApt(undefined, d); }}
                            />
                        )}
                        {view === 'agenda' && (
                            <AgendaView
                                currentDate={currentDate}
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={openExistingAptInPos}
                                onDayNavigate={day => { setCurrentDate(day); setView('day'); }}
                            />
                        )}
                        {view === 'timeline' && (
                            <StaffTimelineView
                                currentDate={currentDate}
                                timeSlots={timeSlots}
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={openExistingAptInPos}
                                onNewAppointment={(t, d) => {
                                    if (d) {
                                        const [y, mo, day] = d.split('-').map(Number);
                                        setCurrentDate(new Date(y, mo - 1, day));
                                    }
                                    openNewApt(t, d);
                                }}
                            />
                        )}

                        {/* ── DEVICE VIEW ───────────────────────────────── */}
                        {view === 'device' && (
                            <div style={{ display: 'flex', gap: 12, overflowX: 'auto', height: '100%' }} className="custom-scrollbar">
                                {devices.length === 0 ? (
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', gap: 8 }}>
                                        <Cpu size={36} />
                                        <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bNoDevicesDefined')}</p>
                                    </div>
                                ) : [...devices, { id: '__unassigned__', name: tm('bUnassignedResource'), is_active: true } as any].map(device => {
                                    const dayStr = formatLocalYmd(currentDate);
                                    const devApts = visibleAppointments.filter(a =>
                                        beautyAppointmentDateKey(a) === dayStr &&
                                        (device.id === '__unassigned__'
                                            ? !a.device_id
                                            : String(a.device_id ?? '') === String(device.id))
                                    );
                                    return (
                                        <div key={device.id} style={{ flexShrink: 0, width: 260, background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e4f0', background: '#f5f3ff', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 28, height: 28, background: '#7c3aed', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Cpu size={13} color="#fff" />
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: 12, fontWeight: 800, color: '#111827' }}>{device.name}</p>
                                                    <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>
                                                        {tm('bDeviceColumnAppointmentCount').replace('{n}', String(devApts.length))}
                                                    </p>
                                                </div>
                                            </div>
                                            <div style={{ flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                                                {(() => {
                                                    const SLOT_H = 52;
                                                    const spanPlacements = buildBeautySpanPlacements(devApts, timeSlots, slotIntervalMin, slotBucket);
                                                    return (
                                                        <div style={{ display: 'flex', minHeight: timeSlots.length * SLOT_H }}>
                                                            <div style={{ width: 44, flexShrink: 0, borderRight: '1px solid #f3f4f6' }}>
                                                                {timeSlots.map(time => (
                                                                    <div
                                                                        key={time}
                                                                        style={{
                                                                            minHeight: SLOT_H,
                                                                            borderBottom: '1px solid #f3f4f6',
                                                                            display: 'flex',
                                                                            alignItems: 'flex-start',
                                                                            justifyContent: 'center',
                                                                            paddingTop: 8,
                                                                        }}
                                                                    >
                                                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', fontFamily: 'monospace' }}>{time}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div
                                                                style={{
                                                                    flex: 1,
                                                                    display: 'grid',
                                                                    gridTemplateRows: `repeat(${timeSlots.length}, minmax(${SLOT_H}px, auto))`,
                                                                    alignContent: 'start',
                                                                }}
                                                            >
                                                                {timeSlots.map((time, i) => {
                                                                    const p = spanPlacements.find(pl => pl.startIdx === i);
                                                                    if (p) {
                                                                        return (
                                                                            <div
                                                                                key={p.apt.id}
                                                                                style={{
                                                                                    gridRow: `${i + 1} / span ${p.span}`,
                                                                                    padding: '2px 4px',
                                                                                    minHeight: 0,
                                                                                    boxSizing: 'border-box',
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    onClick={() => openExistingAptInPos(p.apt)}
                                                                                    style={{
                                                                                        height: '100%',
                                                                                        minHeight: p.span * SLOT_H - 8,
                                                                                        boxSizing: 'border-box',
                                                                                        padding: '6px 8px',
                                                                                        borderRadius: 4,
                                                                                        background: (p.apt.status === AppointmentStatus.COMPLETED || p.apt.status === 'completed')
                                                                                            ? (STATUS_CFG.completed?.bg ?? '#d1fae5')
                                                                                            : '#ede9fe',
                                                                                        borderLeft: `3px solid ${(p.apt.status === AppointmentStatus.COMPLETED || p.apt.status === 'completed')
                                                                                            ? (STATUS_CFG.completed?.color ?? '#059669')
                                                                                            : (p.apt.service_color ?? '#7c3aed')}`,
                                                                                        fontSize: 11,
                                                                                        cursor: 'pointer',
                                                                                        display: 'flex',
                                                                                        flexDirection: 'column',
                                                                                        justifyContent: 'flex-start',
                                                                                        overflow: 'hidden',
                                                                                    }}
                                                                                >
                                                                                    <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>{p.apt.customer_name ?? '—'}</p>
                                                                                    <p style={{ color: '#6b7280', margin: 0, flex: 1 }}>{p.apt.service_name ?? '—'}</p>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    }
                                                                    if (isBeautySpanContinuation(i, spanPlacements)) return null;
                                                                    return (
                                                                        <div
                                                                            key={`add-${time}`}
                                                                            style={{
                                                                                gridRow: i + 1,
                                                                                padding: '4px 6px',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                borderBottom: '1px solid #f3f4f6',
                                                                                boxSizing: 'border-box',
                                                                            }}
                                                                        >
                                                                            <div
                                                                                onClick={() => openNewApt(time, formatLocalYmd(currentDate), {
                                                                                    deviceId: String(device.id),
                                                                                })}
                                                                                style={{
                                                                                    height: 36,
                                                                                    width: '100%',
                                                                                    borderRadius: 4,
                                                                                    border: '1px dashed #e5e7eb',
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    cursor: 'pointer',
                                                                                    color: '#d1d5db',
                                                                                }}
                                                                            >
                                                                                <Plus size={12} />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
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
                                {visibleAppointments.length === 0 ? (
                                    <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#d1d5db', gap: 8 }}>
                                        <List size={32} />
                                        <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bNoAppointments')}</p>
                                    </div>
                                ) : [...visibleAppointments]
                                    .sort((a, b) => (a.appointment_time ?? a.time ?? '').localeCompare(b.appointment_time ?? b.time ?? ''))
                                    .map(apt => {
                                        const cfg = STATUS_CFG[apt.status] ?? STATUS_CFG.scheduled;
                                        return (
                                            <div
                                                key={apt.id}
                                                onClick={() => openExistingAptInPos(apt)}
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

            {/* ── ÖDENMİŞ RANDEVU — sağ panel (POS açılmaz) ───────── */}
            {paidInfoApt && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 85, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
                    onClick={() => setPaidInfoApt(null)}
                >
                    <div
                        style={{ width: 360, height: '100%', background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '14px 18px', borderBottom: '1px solid #bbf7d0', background: '#ecfdf5', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <CheckCircle2 size={22} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 800, color: '#065f46', margin: 0 }}>{tm('bBeautyPaidPanelTitle')}</p>
                                <p style={{ fontSize: 10, fontWeight: 600, color: '#047857', margin: '4px 0 0' }}>{tm('bBeautyPaidPanelSubtitle')}</p>
                            </div>
                            <button type="button" onClick={() => setPaidInfoApt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', flexShrink: 0 }} aria-label="close"><X size={18} /></button>
                        </div>
                        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }} className="custom-scrollbar">
                            <p style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>{paidInfoApt.customer_name ?? '—'}</p>
                            <p style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, margin: '0 0 16px' }}>{paidInfoApt.service_name ?? '—'}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                                {[
                                    {
                                        label: tm('bDate'),
                                        value: (() => {
                                            const ymd = beautyAppointmentDateKey(paidInfoApt);
                                            if (!ymd) return '—';
                                            const [y, mo, d] = ymd.split('-').map(Number);
                                            return new Date(y, mo - 1, d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
                                        })(),
                                    },
                                    { label: tm('bTimeHeader'), value: (paidInfoApt.appointment_time ?? paidInfoApt.time ?? '—').toString().slice(0, 5) },
                                    { label: tm('bSpecialist'), value: paidInfoApt.specialist_name ?? paidInfoApt.staff_name ?? '—' },
                                    { label: tm('bDuration'), value: `${paidInfoApt.duration ?? 30}${tm('bDkSuffix')}` },
                                    {
                                        label: tm('bDeviceView'),
                                        value: paidInfoApt.device_id
                                            ? (devices.find(d => String(d.id) === String(paidInfoApt.device_id))?.name ?? '—')
                                            : '—',
                                    },
                                    {
                                        label: tm('bPriceHeader'),
                                        value: (paidInfoApt.total_price ?? 0) > 0 ? formatMoneyAmount(paidInfoApt.total_price!, { minFrac: 0, maxFrac: 0 }) : '—',
                                    },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ background: '#f7f6fb', borderRadius: 6, padding: '10px 12px' }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{value}</p>
                                    </div>
                                ))}
                            </div>
                            {paidInfoApt.notes && (
                                <div style={{ background: '#f7f6fb', borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
                                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{tm('bNotes')}</p>
                                    <p style={{ fontSize: 12, color: '#374151' }}>{paidInfoApt.notes}</p>
                                </div>
                            )}
                            <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.45, margin: 0, padding: '10px 12px', background: '#f9fafb', borderRadius: 6, border: '1px solid #e5e7eb' }}>
                                {tm('bBeautyPaidNoNewSale')}
                            </p>
                        </div>
                    </div>
                </div>
            )}

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
                    <div style={{
                        background: '#fff',
                        borderRadius: 14,
                        width: '100%',
                        maxWidth: activeSurvey && surveyQuestions.length ? 520 : 400,
                        maxHeight: '90vh',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                    }}>
                        <div style={{ padding: '16px 20px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <CheckCircle2 size={20} color="#059669" />
                            <div>
                                <p style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{tm('bAppointmentCompletedTitle')}</p>
                                <p style={{ fontSize: 11, color: '#6b7280' }}>{feedbackApt.customer_name} — {feedbackApt.service_name}</p>
                            </div>
                        </div>
                        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
                                {activeSurvey && surveyQuestions.length ? tm('bSurveyFillDynamic') : tm('bFeedbackOptional')}
                            </p>
                            {activeSurvey && surveyQuestions.length > 0
                                ? surveyQuestions.map(q => {
                                    const label = questionLabel(q, language);
                                    if (q.question_type === 'rating') {
                                        const max = Math.min(10, Math.max(2, q.scale_max || 5));
                                        const cur = (dynAnswers[q.id] as number) ?? max;
                                        return (
                                            <div key={q.id} style={{ marginBottom: 12 }}>
                                                <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{label || '—'}</p>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                    {Array.from({ length: max }, (_, i) => i + 1).map(star => (
                                                        <button
                                                            key={star}
                                                            type="button"
                                                            onClick={() => setDynAnswers(r => ({ ...r, [q.id]: star }))}
                                                            style={{
                                                                width: 30,
                                                                height: 30,
                                                                borderRadius: 6,
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                background: star <= cur ? '#fbbf24' : '#f3f4f6',
                                                                color: star <= cur ? '#fff' : '#9ca3af',
                                                                fontSize: 12,
                                                                fontWeight: 800,
                                                                transition: 'all 0.1s',
                                                            }}
                                                        >{star}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    if (q.question_type === 'text') {
                                        return (
                                            <div key={q.id} style={{ marginBottom: 12 }}>
                                                <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{label || '—'}</p>
                                                <textarea
                                                    value={(dynAnswers[q.id] as string) ?? ''}
                                                    onChange={e => setDynAnswers(r => ({ ...r, [q.id]: e.target.value }))}
                                                    rows={2}
                                                    style={{
                                                        width: '100%',
                                                        border: '1px solid #e5e7eb',
                                                        borderRadius: 6,
                                                        padding: '8px 10px',
                                                        fontSize: 12,
                                                        resize: 'none',
                                                        outline: 'none',
                                                        boxSizing: 'border-box',
                                                    }}
                                                />
                                            </div>
                                        );
                                    }
                                    const yn = dynAnswers[q.id] as boolean;
                                    return (
                                        <div key={q.id} style={{ marginBottom: 12 }}>
                                            <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{label || '—'}</p>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setDynAnswers(r => ({ ...r, [q.id]: true }))}
                                                    style={{
                                                        flex: 1,
                                                        height: 34,
                                                        borderRadius: 6,
                                                        border: yn === true ? '2px solid #059669' : '1px solid #e5e7eb',
                                                        background: yn === true ? '#ecfdf5' : '#f9fafb',
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        color: '#374151',
                                                    }}
                                                >{tm('bSurveyYes')}</button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDynAnswers(r => ({ ...r, [q.id]: false }))}
                                                    style={{
                                                        flex: 1,
                                                        height: 34,
                                                        borderRadius: 6,
                                                        border: yn === false ? '2px solid #dc2626' : '1px solid #e5e7eb',
                                                        background: yn === false ? '#fef2f2' : '#f9fafb',
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        color: '#374151',
                                                    }}
                                                >{tm('bSurveyNo')}</button>
                                            </div>
                                        </div>
                                    );
                                })
                                : ([
                                    { key: 'service' as const, label: tm('bFeedbackService') },
                                    { key: 'staff' as const, label: tm('bFeedbackSpecialist') },
                                    { key: 'overall' as const, label: tm('bFeedbackGeneral') },
                                ]).map(({ key, label }) => (
                                    <div key={key} style={{ marginBottom: 12 }}>
                                        <p style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>{label}</p>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <button
                                                    key={star}
                                                    type="button"
                                                    onClick={() => setFeedbackRatings(r => ({ ...r, [key]: star }))}
                                                    style={{
                                                        width: 32,
                                                        height: 32,
                                                        borderRadius: 6,
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        background: star <= feedbackRatings[key] ? '#fbbf24' : '#f3f4f6',
                                                        color: star <= feedbackRatings[key] ? '#fff' : '#9ca3af',
                                                        fontSize: 14,
                                                        fontWeight: 800,
                                                        transition: 'all 0.1s',
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
                                style={{
                                    width: '100%',
                                    border: '1px solid #e5e7eb',
                                    borderRadius: 6,
                                    padding: '8px 10px',
                                    fontSize: 12,
                                    resize: 'none',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    marginTop: 8,
                                }}
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
