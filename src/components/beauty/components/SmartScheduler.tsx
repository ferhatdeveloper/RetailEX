
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    ChevronLeft, ChevronRight, Plus, Clock,
    User, Cpu, List, Search, X,
    CalendarDays, Banknote, Undo2,
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import {
    BeautyAppointment,
    AppointmentStatus,
} from '../../../types/beauty';
import { useLanguage } from '../../../contexts/LanguageContext';
import { logger } from '../../../services/loggingService';
import { WeekView, MonthView, AgendaView } from './WeekMonthViews';
import { DaySchedulerGrid } from './DaySchedulerGrid';
import { ResourceGroupedDayView, ResourceGroupedWeekMatrix } from './ResourceGroupedViews';
import { StaffTimelineView } from './StaffTimelineView';
import { QueueModeResourceList } from './QueueModeResourceList';
import { AppointmentPOS } from './AppointmentPOS';
import { formatMoneyAmount } from '../../../utils/formatMoney';
import { safeInvoke, IS_BROWSER } from '../../../utils/env';
import {
    beautyAppointmentDateKey,
    formatLocalYmd,
    getWeekRangeLocal,
    getMonthRangeLocal,
    getWorkWeekRangeLocal,
    getAgendaRangeLocal,
} from '../../../utils/dateLocal';
import { compareBeautyQueueOrder, groupBeautyQueueByCustomer, suggestQueuePrefillTime } from '../../../utils/beautyQueueOrder';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';
import '../ClinicStyles.css';
import { CLINIC } from '../clinicDesignTokens';
import { buildBeautySpanPlacements, isBeautySpanContinuation } from '../../../utils/beautyScheduleGrid';
import {
    buildBeautyResourceMovePatch,
    beautySchedulerResourceColumnDropHandlers,
    beautySchedulerResourceDragStartHandler,
} from '../../../utils/beautySchedulerDragDrop';
import { RetailExFlatModal } from '../../shared/RetailExFlatModal';
import { BeautyFeedbackSurveyModal } from './BeautyFeedbackSurveyModal';
import { usePermission } from '../../../shared/hooks/usePermission';

type ViewType = 'day' | 'workweek' | 'week' | 'month' | 'agenda' | 'timeline' | 'device' | 'list';
type GroupMode = 'none' | 'staff' | 'device';
const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;

const LS_BEAUTY_SLOT = 'retailex.beauty.slotIntervalMin';
const LS_BEAUTY_QUEUE = 'retailex.beauty.queueMode';
const LS_BEAUTY_SEP = 'retailex.beauty.separateLineInvoices';

function readBeautyToolbarPrefs(): { slot: number; queue: boolean; sep: boolean } | null {
    if (typeof window === 'undefined' || !IS_BROWSER) return null;
    try {
        const slotRaw = window.localStorage.getItem(LS_BEAUTY_SLOT);
        const queueRaw = window.localStorage.getItem(LS_BEAUTY_QUEUE);
        const sepRaw = window.localStorage.getItem(LS_BEAUTY_SEP);
        if (slotRaw == null && queueRaw == null && sepRaw == null) return null;
        const nv = slotRaw != null ? Number(slotRaw) : 15;
        const slot = SLOT_INTERVAL_OPTIONS.includes(nv as (typeof SLOT_INTERVAL_OPTIONS)[number]) ? nv : 15;
        const parseBool = (s: string | null, def: boolean) => {
            if (s === null || s === '') return def;
            return s === '1' || s === 'true';
        };
        return {
            slot,
            queue: parseBool(queueRaw, true),
            sep: parseBool(sepRaw, true),
        };
    } catch {
        return null;
    }
}

// ─── Main Scheduler ────────────────────────────────────────────────────────────
export function SmartScheduler() {
    const {
        appointments, loadAppointmentsInRange, updateAppointment, updateAppointmentStatus, isLoading,
        specialists, services, customers, devices,
        loadSpecialists, loadServices, loadCustomers, loadDevices,
    } = useBeautyStore();
    const { tm } = useLanguage();
    const { isAdmin } = usePermission();

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
    const [slotIntervalMin, setSlotIntervalMin] = useState<number>(() => readBeautyToolbarPrefs()?.slot ?? 15);
    /** Sıra öncelikli işletmeler: saat sütunu yok, liste sırası */
    const [beautyQueueMode, setBeautyQueueMode] = useState(() => readBeautyToolbarPrefs()?.queue ?? true);
    /** POS: her sepet kalemi ayrı güzellik satışı / ERP fişi */
    const [beautySeparateLineInvoices, setBeautySeparateLineInvoices] = useState(
        () => readBeautyToolbarPrefs()?.sep ?? true,
    );
    /** Takvim kartından işlem tutarı düzenleme */
    const [priceEditApt, setPriceEditApt] = useState<BeautyAppointment | null>(null);
    const [priceEditDraft, setPriceEditDraft] = useState('');
    const [priceEditSaving, setPriceEditSaving] = useState(false);
    const [selectedApt, setSelectedApt] = useState<BeautyAppointment | null>(null);

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

    /** Sağ panelden “Anket yap” ile açılan memnuniyet anketi */
    const [feedbackApt, setFeedbackApt] = useState<BeautyAppointment | null>(null);
    /** Tamamlamayı geri al — onay modali için anlık randevu kopyası */
    const [revertModalApt, setRevertModalApt] = useState<BeautyAppointment | null>(null);
    const [revertSaving, setRevertSaving] = useState(false);
    const [treatmentDegreeDraft, setTreatmentDegreeDraft] = useState('');
    const [treatmentShotsDraft, setTreatmentShotsDraft] = useState('');
    const [treatmentFieldsSaving, setTreatmentFieldsSaving] = useState(false);

    useEffect(() => {
        setSelectedApt(prev => {
            if (!prev) return null;
            const next = appointments.find(a => a.id === prev.id);
            return next ? { ...next } : prev;
        });
    }, [appointments]);

    useEffect(() => {
        if (!selectedApt) {
            setTreatmentDegreeDraft('');
            setTreatmentShotsDraft('');
            return;
        }
        setTreatmentDegreeDraft(String(selectedApt.treatment_degree ?? ''));
        setTreatmentShotsDraft(String(selectedApt.treatment_shots ?? ''));
    }, [selectedApt?.id, selectedApt?.treatment_degree, selectedApt?.treatment_shots]);

    useEffect(() => {
        loadSpecialists();
        loadServices();
        loadCustomers();
        loadDevices();
    }, []);

    useEffect(() => {
        if (IS_BROWSER) return;
        let cancelled = false;
        void (async () => {
            try {
                const cfg: any = await safeInvoke('get_app_config');
                const v = Number(cfg?.beauty_slot_interval_min ?? 15);
                if (!cancelled && SLOT_INTERVAL_OPTIONS.includes(v as (typeof SLOT_INTERVAL_OPTIONS)[number])) {
                    setSlotIntervalMin(v);
                }
                const qm = cfg?.beauty_queue_mode;
                if (!cancelled) {
                    setBeautyQueueMode(
                        qm === undefined || qm === null
                            ? true
                            : qm === true || qm === 'true' || qm === 1 || qm === '1',
                    );
                }
                const sep = cfg?.beauty_queue_separate_sale_per_line;
                if (!cancelled) {
                    setBeautySeparateLineInvoices(
                        sep === undefined || sep === null
                            ? true
                            : sep === true || sep === 'true' || sep === 1 || sep === '1',
                    );
                }
            } catch {
                // no-op: fallback to default interval
            }
        })();
        return () => { cancelled = true; };
    }, []);

    /** Tauri: config.db (SQLite) — tarayıcı: localStorage */
    useEffect(() => {
        if (IS_BROWSER) {
            try {
                window.localStorage.setItem(LS_BEAUTY_SLOT, String(slotIntervalMin));
                window.localStorage.setItem(LS_BEAUTY_QUEUE, beautyQueueMode ? 'true' : 'false');
                window.localStorage.setItem(LS_BEAUTY_SEP, beautySeparateLineInvoices ? 'true' : 'false');
            } catch {
                // no-op
            }
            return;
        }
        void (async () => {
            try {
                const cfg: any = await safeInvoke('get_app_config');
                await safeInvoke('save_app_config', {
                    config: {
                        ...cfg,
                        beauty_slot_interval_min: slotIntervalMin,
                        beauty_queue_mode: beautyQueueMode,
                        beauty_queue_separate_sale_per_line: beautySeparateLineInvoices,
                    },
                });
            } catch {
                // no-op
            }
        })();
    }, [slotIntervalMin, beautyQueueMode, beautySeparateLineInvoices]);

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
        const base = appointments.filter(beautyAptVisibleOnSchedule);
        const q = searchTerm.trim().toLowerCase();
        if (!q) return base;
        return base.filter(a =>
            (a.customer_name ?? '').toLowerCase().includes(q) ||
            (a.service_name ?? '').toLowerCase().includes(q) ||
            (a.specialist_name ?? a.staff_name ?? '').toLowerCase().includes(q)
        );
    }, [appointments, searchTerm]);

    const applyBeautyResourceDrop = useCallback(
        async (
            appointmentIds: string[],
            kind: 'device' | 'staff',
            targetColumnId: string,
            targetDateYmd?: string,
        ) => {
            const uniq = [...new Set(appointmentIds.map(String).filter(Boolean))];
            const tasks: Promise<void>[] = [];
            for (const id of uniq) {
                const apt = visibleAppointments.find(a => a.id === id);
                if (!apt) continue;
                const patch = buildBeautyResourceMovePatch(apt, kind, targetColumnId, targetDateYmd);
                if (patch) tasks.push(updateAppointment(id, patch));
            }
            if (!tasks.length) return;
            try {
                await Promise.all(tasks);
            } catch (e: unknown) {
                logger.crudError('SmartScheduler', 'applyBeautyResourceDrop', e);
            }
        },
        [updateAppointment, visibleAppointments],
    );

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
        setPrefillTime((apt.appointment_time ?? apt.time ?? '09:00').slice(0, 5));
        setNewPrefillDate(beautyAppointmentDateKey(apt) || null);
        setPrefillStaffId(undefined);
        setPrefillDeviceId(undefined);
        setPrefillServiceId(undefined);
        setEditingApt(apt);
        setSelectedApt(null);
        setShowNewPage(true);
    };

    const isBeautyAppointmentDone = (apt: BeautyAppointment) =>
        apt.status === AppointmentStatus.COMPLETED || apt.status === 'completed';

    /** Tamamlanan: sağ detay paneli; diğerleri: POS tam ekran */
    const handleAppointmentPrimaryClick = (apt: BeautyAppointment) => {
        if (isBeautyAppointmentDone(apt)) setSelectedApt(apt);
        else openExistingAptInPos(apt);
    };

    const openAppointmentDetailPanel = (apt: BeautyAppointment, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedApt(apt);
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
            setSelectedApt({ ...apt, status: newStatus });
        } else {
            setSelectedApt(null);
        }
    };

    const openSurveyFromDetailPanel = () => {
        if (!selectedApt) return;
        const cid = selectedApt.customer_id ?? selectedApt.client_id;
        if (!cid) return;
        setFeedbackApt(selectedApt);
        setSelectedApt(null);
    };

    const saveTreatmentFieldsFromPanel = async () => {
        if (!selectedApt) return;
        setTreatmentFieldsSaving(true);
        try {
            await updateAppointment(selectedApt.id, {
                treatment_degree: treatmentDegreeDraft.trim() || null,
                treatment_shots: treatmentShotsDraft.trim() || null,
            });
        } catch (e: unknown) {
            logger.crudError('SmartScheduler', 'saveTreatmentFields', e);
        } finally {
            setTreatmentFieldsSaving(false);
        }
    };

    const openRevertConfirmModal = () => {
        if (!selectedApt) return;
        const done =
            selectedApt.status === AppointmentStatus.COMPLETED || selectedApt.status === 'completed';
        if (!done) return;
        setRevertModalApt(selectedApt);
    };

    const closeRevertModal = () => {
        if (revertSaving) return;
        setRevertModalApt(null);
    };

    const executeRevertCompletion = async () => {
        if (!revertModalApt) return;
        const apt = revertModalApt;
        setRevertSaving(true);
        try {
            await updateAppointmentStatus(apt.id, AppointmentStatus.IN_PROGRESS);
            setSelectedApt(prev => (prev?.id === apt.id ? null : prev));
            setRevertModalApt(null);
        } catch (e: unknown) {
            logger.crudError('SmartScheduler', 'revertCompletion', e);
        } finally {
            setRevertSaving(false);
        }
    };

    /** Sıra modunda görünüm her zaman 15 dk adım (işlemler aynı hizada) */
    const schedulerSlotMin = beautyQueueMode ? 15 : slotIntervalMin;

    const timeSlots = useMemo(() => {
        const startMin = 9 * 60;
        const endMin = 21 * 60;
        const slots: string[] = [];
        for (let m = startMin; m <= endMin; m += schedulerSlotMin) {
            const hh = Math.floor(m / 60).toString().padStart(2, '0');
            const mm = (m % 60).toString().padStart(2, '0');
            slots.push(`${hh}:${mm}`);
        }
        return slots;
    }, [schedulerSlotMin]);

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

    const saveAppointmentPriceFromCard = useCallback(async () => {
        if (!isAdmin()) return;
        if (!priceEditApt) return;
        const oldPrice = Number(priceEditApt.total_price ?? 0);
        const raw = String(priceEditDraft).replace(/\s/g, '').replace(',', '.');
        const newPrice = Math.max(0, Number(raw) || 0);
        if (Number.isNaN(newPrice)) return;
        if (newPrice === oldPrice) {
            setPriceEditApt(null);
            return;
        }
        setPriceEditSaving(true);
        try {
            await updateAppointment(priceEditApt.id, { total_price: newPrice });
            logger.info('SmartScheduler', 'beauty_appointment_price_update', {
                action: 'appointment_total_price_change',
                appointmentId: priceEditApt.id,
                oldTotalPrice: oldPrice,
                newTotalPrice: newPrice,
                customerName: priceEditApt.customer_name,
                serviceName: priceEditApt.service_name,
                appointmentDate: beautyAppointmentDateKey(priceEditApt),
            });
            setSelectedApt(prev =>
                prev && prev.id === priceEditApt.id ? { ...prev, total_price: newPrice } : prev
            );
            setPriceEditApt(null);
        } catch (e: unknown) {
            logger.crudError('SmartScheduler', 'updateAppointmentPrice', e, { id: priceEditApt.id });
        } finally {
            setPriceEditSaving(false);
        }
    }, [isAdmin, priceEditApt, priceEditDraft, updateAppointment]);

    const renderAptCard = (apt: BeautyAppointment) => {
        const color = apt.service_color ?? '#7c3aed';
        const cfg   = STATUS_CFG[apt.status] ?? STATUS_CFG.scheduled;
        const done  = apt.status === AppointmentStatus.COMPLETED || apt.status === 'completed';
        return (
            <div
                key={apt.id}
                onClick={() => handleAppointmentPrimaryClick(apt)}
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
                    {!beautyQueueMode && (
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', color: '#6b7280' }}>{(apt.appointment_time ?? apt.time ?? '').slice(0, 5)}</span>
                    )}
                </div>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>{apt.service_name ?? '—'}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9ca3af', minWidth: 0, flex: 1 }}>
                            <User size={10} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.specialist_name ?? apt.staff_name ?? '—'}</span>
                        </div>
                        {isAdmin() ? (
                        <button
                            type="button"
                            title={tm('bAppointmentEditPriceTitleBtn')}
                            aria-label={tm('bAppointmentEditPriceTitleBtn')}
                            onClick={e => {
                                e.stopPropagation();
                                setPriceEditApt(apt);
                                setPriceEditDraft(String(Number(apt.total_price ?? 0)));
                            }}
                            style={{
                                flexShrink: 0,
                                width: 26,
                                height: 26,
                                borderRadius: 6,
                                border: '1px solid #e8e4f0',
                                background: '#faf9fd',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#7c3aed',
                            }}
                        >
                            <Banknote size={12} strokeWidth={2.25} />
                        </button>
                        ) : null}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: cfg.bg, color: cfg.color, flexShrink: 0 }}>{cfg.label}</span>
                </div>
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        marginTop: 8,
                        paddingTop: 8,
                        borderTop: '1px solid rgba(15, 23, 42, 0.06)',
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={e => openAppointmentDetailPanel(apt, e)}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            padding: 0,
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#4f46e5',
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textUnderlineOffset: 2,
                        }}
                    >
                        {tm('bCardDetailView')}
                    </button>
                    {done ? (
                        <button
                            type="button"
                            onClick={e => {
                                e.stopPropagation();
                                openExistingAptInPos(apt);
                            }}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                padding: 0,
                                fontSize: 10,
                                fontWeight: 600,
                                color: '#6b7280',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                textUnderlineOffset: 2,
                            }}
                        >
                            {tm('bCardOpenInPos')}
                        </button>
                    ) : null}
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
                            disabled={beautyQueueMode}
                            title={beautyQueueMode ? tm('bBeautyQueueSlotLockedTitle') : tm('bSchedulerSlotIntervalTitle')}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                outline: 'none',
                                fontSize: 11,
                                fontWeight: 700,
                                color: beautyQueueMode ? '#d1d5db' : '#6b7280',
                                cursor: beautyQueueMode ? 'not-allowed' : 'pointer',
                                opacity: beautyQueueMode ? 0.85 : 1,
                            }}
                        >
                            {SLOT_INTERVAL_OPTIONS.map(min => (
                                <option key={min} value={min}>{tm('bSchedulerMinutesAbbr').replace('{n}', String(min))}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={beautyQueueMode}
                        title={tm('bBeautyQueueModeTitle')}
                        onClick={() => setBeautyQueueMode(v => !v)}
                        style={{
                            padding: '5px 10px',
                            borderRadius: 5,
                            border: '1px solid #e5e7eb',
                            background: beautyQueueMode ? '#fff' : '#f3f4f6',
                            color: beautyQueueMode ? '#7c3aed' : '#6b7280',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: beautyQueueMode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 0.1s',
                            userSelect: 'none',
                            maxWidth: 160,
                            lineHeight: 1.25,
                            textAlign: 'left',
                        }}
                    >
                        {tm('bBeautyQueueMode')}
                    </button>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={beautySeparateLineInvoices}
                        title={tm('bBeautyQueueSeparateLineInvoicesTitle')}
                        onClick={() => setBeautySeparateLineInvoices(v => !v)}
                        style={{
                            padding: '5px 10px',
                            borderRadius: 5,
                            border: '1px solid #e5e7eb',
                            background: beautySeparateLineInvoices ? '#fff' : '#f3f4f6',
                            color: beautySeparateLineInvoices ? '#7c3aed' : '#6b7280',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: beautySeparateLineInvoices ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            transition: 'all 0.1s',
                            userSelect: 'none',
                            maxWidth: 200,
                            lineHeight: 1.25,
                            textAlign: 'left',
                        }}
                    >
                        {tm('bBeautyQueueSeparateLineInvoices')}
                    </button>
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
                                queueMode={beautyQueueMode}
                                queueSnapMinutes={schedulerSlotMin}
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
                                queueMode={beautyQueueMode}
                                queueSnapMinutes={schedulerSlotMin}
                                unassignedLabel={tm('bUnassignedResource')}
                                emptyResourcesMessage={tm('bNoResourcesForGroup')}
                                timeColumnLabel={tm('bSchedulerTimeColumn')}
                                renderAppointment={renderAptCard}
                                resourceDragKind={groupMode}
                                dragResourceTitle={tm('bBeautyDragToResourceColumnTitle')}
                                onResourceColumnDrop={(ids, colId) => {
                                    void applyBeautyResourceDrop(ids, groupMode, colId);
                                }}
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
                                queueMode={beautyQueueMode}
                                queueSnapMinutes={schedulerSlotMin}
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={handleAppointmentPrimaryClick}
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
                                queueMode={beautyQueueMode}
                                unassignedLabel={tm('bUnassignedResource')}
                                resourceColumnLabel={tm('bSchedulerResourceColumn')}
                                emptyResourcesMessage={tm('bNoResourcesForGroup')}
                                onAppointmentClick={handleAppointmentPrimaryClick}
                                resourceDragKind={groupMode}
                                dragResourceTitle={tm('bBeautyDragToResourceColumnTitle')}
                                onResourceCellDrop={(ids, colId, dateYmd) => {
                                    void applyBeautyResourceDrop(ids, groupMode, colId, dateYmd);
                                }}
                                onCellNew={(dateYmd, resourceColumnId) => {
                                    const [y, mo, day] = dateYmd.split('-').map(Number);
                                    setCurrentDate(new Date(y, mo - 1, day));
                                    const t = beautyQueueMode
                                        ? suggestQueuePrefillTime(visibleAppointments, dateYmd, {
                                            resource:
                                                groupMode === 'staff'
                                                    ? { kind: 'staff', id: resourceColumnId === '__unassigned__' ? null : String(resourceColumnId) }
                                                    : { kind: 'device', id: resourceColumnId === '__unassigned__' ? null : String(resourceColumnId) },
                                            snapMinutes: schedulerSlotMin,
                                        })
                                        : undefined;
                                    openNewApt(t, dateYmd, groupMode === 'staff'
                                        ? { staffId: resourceColumnId }
                                        : { deviceId: resourceColumnId });
                                }}
                            />
                        )}

                        {view === 'week' && groupMode === 'none' && (
                            <WeekView
                                currentDate={currentDate}
                                timeSlots={timeSlots}
                                queueMode={beautyQueueMode}
                                queueSnapMinutes={schedulerSlotMin}
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={handleAppointmentPrimaryClick}
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
                                queueMode={beautyQueueMode}
                                unassignedLabel={tm('bUnassignedResource')}
                                resourceColumnLabel={tm('bSchedulerResourceColumn')}
                                emptyResourcesMessage={tm('bNoResourcesForGroup')}
                                onAppointmentClick={handleAppointmentPrimaryClick}
                                resourceDragKind={groupMode}
                                dragResourceTitle={tm('bBeautyDragToResourceColumnTitle')}
                                onResourceCellDrop={(ids, colId, dateYmd) => {
                                    void applyBeautyResourceDrop(ids, groupMode, colId, dateYmd);
                                }}
                                onCellNew={(dateYmd, resourceColumnId) => {
                                    const [y, mo, day] = dateYmd.split('-').map(Number);
                                    setCurrentDate(new Date(y, mo - 1, day));
                                    const t = beautyQueueMode
                                        ? suggestQueuePrefillTime(visibleAppointments, dateYmd, {
                                            resource:
                                                groupMode === 'staff'
                                                    ? { kind: 'staff', id: resourceColumnId === '__unassigned__' ? null : String(resourceColumnId) }
                                                    : { kind: 'device', id: resourceColumnId === '__unassigned__' ? null : String(resourceColumnId) },
                                            snapMinutes: schedulerSlotMin,
                                        })
                                        : undefined;
                                    openNewApt(t, dateYmd, groupMode === 'staff'
                                        ? { staffId: resourceColumnId }
                                        : { deviceId: resourceColumnId });
                                }}
                            />
                        )}
                        {view === 'month' && (
                            <MonthView
                                currentDate={currentDate}
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={handleAppointmentPrimaryClick}
                                onDayNavigate={day => { setCurrentDate(day); setView('day'); }}
                                onNewAppointment={(_t, d) => { if (d) openNewApt(undefined, d); }}
                            />
                        )}
                        {view === 'agenda' && (
                            <AgendaView
                                currentDate={currentDate}
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={handleAppointmentPrimaryClick}
                                onDayNavigate={day => { setCurrentDate(day); setView('day'); }}
                            />
                        )}
                        {view === 'timeline' && (
                            <StaffTimelineView
                                currentDate={currentDate}
                                timeSlots={timeSlots}
                                queueMode={beautyQueueMode}
                                queueSnapMinutes={schedulerSlotMin}
                                appointmentsOverride={visibleAppointments}
                                onAppointmentClick={handleAppointmentPrimaryClick}
                                resourceDragKind="staff"
                                dragResourceTitle={tm('bBeautyDragToResourceColumnTitle')}
                                onResourceColumnDrop={(ids, colId) => {
                                    void applyBeautyResourceDrop(ids, 'staff', colId);
                                }}
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
                                    const devQueueRows = beautyQueueMode ? groupBeautyQueueByCustomer(devApts).length : devApts.length;
                                    return (
                                        <div key={device.id} style={{ flexShrink: 0, width: 260, background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8e4f0', background: '#f5f3ff', display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ width: 28, height: 28, background: '#7c3aed', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Cpu size={13} color="#fff" />
                                                </div>
                                                <div>
                                                    <p style={{ fontSize: 12, fontWeight: 800, color: '#111827' }}>{device.name}</p>
                                                    <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>
                                                        {tm('bDeviceColumnAppointmentCount').replace('{n}', String(devQueueRows))}
                                                    </p>
                                                </div>
                                            </div>
                                            <div
                                                style={{ flex: 1, overflowY: 'auto' }}
                                                className="custom-scrollbar"
                                                {...beautySchedulerResourceColumnDropHandlers({
                                                    acceptKind: 'device',
                                                    targetColumnId: String(device.id),
                                                    onDrop: ids => {
                                                        void applyBeautyResourceDrop(ids, 'device', String(device.id));
                                                    },
                                                })}
                                            >
                                                {beautyQueueMode ? (
                                                    <QueueModeResourceList
                                                        appointments={devApts}
                                                        accent="#7c3aed"
                                                        useStatusTint
                                                        resourceDragKind="device"
                                                        dragResourceTitle={tm('bBeautyDragToResourceColumnTitle')}
                                                        onAppointmentClick={handleAppointmentPrimaryClick}
                                                        onAddClick={() => {
                                                            const dayYmd = formatLocalYmd(currentDate);
                                                            const t = suggestQueuePrefillTime(visibleAppointments, dayYmd, {
                                                                resource: {
                                                                    kind: 'device',
                                                                    id: device.id === '__unassigned__' ? null : String(device.id),
                                                                },
                                                                snapMinutes: schedulerSlotMin,
                                                            });
                                                            openNewApt(t, dayYmd, {
                                                                deviceId: device.id === '__unassigned__' ? undefined : String(device.id),
                                                            });
                                                        }}
                                                    />
                                                ) : (() => {
                                                    const SLOT_H = 52;
                                                    const spanPlacements = buildBeautySpanPlacements(devApts, timeSlots, schedulerSlotMin, slotBucket);
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
                                                                {...beautySchedulerResourceColumnDropHandlers({
                                                                    acceptKind: 'device',
                                                                    targetColumnId: String(device.id),
                                                                    onDrop: ids => {
                                                                        void applyBeautyResourceDrop(ids, 'device', String(device.id));
                                                                    },
                                                                })}
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
                                                                                    {...beautySchedulerResourceColumnDropHandlers({
                                                                                        acceptKind: 'device',
                                                                                        targetColumnId: String(device.id),
                                                                                        onDrop: ids => {
                                                                                            void applyBeautyResourceDrop(ids, 'device', String(device.id));
                                                                                        },
                                                                                    })}
                                                                                    draggable
                                                                                    title={tm('bBeautyDragToResourceColumnTitle')}
                                                                                    onDragStart={beautySchedulerResourceDragStartHandler('device', [p.apt.id])}
                                                                                    onClick={() => handleAppointmentPrimaryClick(p.apt)}
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
                                                                                        cursor: 'grab',
                                                                                        display: 'flex',
                                                                                        flexDirection: 'column',
                                                                                        justifyContent: 'flex-start',
                                                                                        overflow: 'hidden',
                                                                                    }}
                                                                                >
                                                                                    <p style={{ fontWeight: 700, color: '#111827', margin: 0 }}>{p.apt.customer_name ?? '—'}</p>
                                                                                    <p style={{ color: '#6b7280', margin: 0, flex: 1, minHeight: 0 }}>{p.apt.service_name ?? '—'}</p>
                                                                                    <div
                                                                                        style={{
                                                                                            display: 'flex',
                                                                                            flexWrap: 'wrap',
                                                                                            justifyContent: 'space-between',
                                                                                            gap: 4,
                                                                                            marginTop: 'auto',
                                                                                            paddingTop: 4,
                                                                                            borderTop: '1px solid rgba(15,23,42,0.08)',
                                                                                        }}
                                                                                        onClick={e => e.stopPropagation()}
                                                                                    >
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={e => openAppointmentDetailPanel(p.apt, e)}
                                                                                            style={{
                                                                                                border: 'none',
                                                                                                background: 'transparent',
                                                                                                padding: 0,
                                                                                                fontSize: 9,
                                                                                                fontWeight: 700,
                                                                                                color: '#4f46e5',
                                                                                                cursor: 'pointer',
                                                                                                textDecoration: 'underline',
                                                                                            }}
                                                                                        >
                                                                                            {tm('bCardDetailView')}
                                                                                        </button>
                                                                                        {(p.apt.status === AppointmentStatus.COMPLETED || p.apt.status === 'completed') ? (
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={e => {
                                                                                                    e.stopPropagation();
                                                                                                    openExistingAptInPos(p.apt);
                                                                                                }}
                                                                                                style={{
                                                                                                    border: 'none',
                                                                                                    background: 'transparent',
                                                                                                    padding: 0,
                                                                                                    fontSize: 9,
                                                                                                    fontWeight: 600,
                                                                                                    color: '#6b7280',
                                                                                                    cursor: 'pointer',
                                                                                                    textDecoration: 'underline',
                                                                                                }}
                                                                                            >
                                                                                                {tm('bCardOpenInPos')}
                                                                                            </button>
                                                                                        ) : null}
                                                                                    </div>
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
                                <div style={{ display: 'grid', gridTemplateColumns: beautyQueueMode ? '40px 10px 1fr 120px 64px 88px 80px' : '52px 10px 1fr 120px 64px 88px 80px', gap: 8, padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                                    {(beautyQueueMode
                                        ? [tm('bOrderIndexHeader'), '', tm('bCustomerServiceHeader'), tm('bSpecialist'), tm('bDurationHeader'), tm('bStatus'), tm('bPriceHeader')]
                                        : [tm('bTimeHeader'), '', tm('bCustomerServiceHeader'), tm('bSpecialist'), tm('bDurationHeader'), tm('bStatus'), tm('bPriceHeader')]
                                    ).map((h, i) => (
                                        <span key={i} style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
                                    ))}
                                </div>
                                {visibleAppointments.length === 0 ? (
                                    <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#d1d5db', gap: 8 }}>
                                        <List size={32} />
                                        <p style={{ fontSize: 12, fontWeight: 600 }}>{tm('bNoAppointments')}</p>
                                    </div>
                                ) : [...visibleAppointments]
                                    .sort((a, b) =>
                                        beautyQueueMode
                                            ? compareBeautyQueueOrder(a, b)
                                            : (a.appointment_time ?? a.time ?? '').localeCompare(b.appointment_time ?? b.time ?? '')
                                    )
                                    .map((apt, rowIdx) => {
                                        const cfg = STATUS_CFG[apt.status] ?? STATUS_CFG.scheduled;
                                        const rowDone = isBeautyAppointmentDone(apt);
                                        return (
                                            <div
                                                key={apt.id}
                                                onClick={() => handleAppointmentPrimaryClick(apt)}
                                                style={{ display: 'grid', gridTemplateColumns: beautyQueueMode ? '40px 10px 1fr 120px 64px 88px 80px' : '52px 10px 1fr 120px 64px 88px 80px', gap: 8, padding: '11px 16px', borderBottom: '1px solid #f3f4f6', alignItems: 'center', cursor: 'pointer', transition: 'background 0.08s' }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#faf9fd')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', fontFamily: beautyQueueMode ? 'inherit' : 'monospace' }}>
                                                    {beautyQueueMode ? rowIdx + 1 : (apt.appointment_time ?? apt.time ?? '--:--').slice(0, 5)}
                                                </span>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: apt.service_color ?? '#7c3aed', display: 'inline-block' }} />
                                                <div>
                                                    <p style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{apt.customer_name ?? '—'}</p>
                                                    <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{apt.service_name ?? '—'}</p>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                                                        <button
                                                            type="button"
                                                            onClick={e => openAppointmentDetailPanel(apt, e)}
                                                            style={{
                                                                border: 'none',
                                                                background: 'transparent',
                                                                padding: 0,
                                                                fontSize: 10,
                                                                fontWeight: 700,
                                                                color: '#4f46e5',
                                                                cursor: 'pointer',
                                                                textDecoration: 'underline',
                                                            }}
                                                        >
                                                            {tm('bCardDetailView')}
                                                        </button>
                                                        {rowDone ? (
                                                            <button
                                                                type="button"
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    openExistingAptInPos(apt);
                                                                }}
                                                                style={{
                                                                    border: 'none',
                                                                    background: 'transparent',
                                                                    padding: 0,
                                                                    fontSize: 10,
                                                                    fontWeight: 600,
                                                                    color: '#6b7280',
                                                                    cursor: 'pointer',
                                                                    textDecoration: 'underline',
                                                                }}
                                                            >
                                                                {tm('bCardOpenInPos')}
                                                            </button>
                                                        ) : null}
                                                    </div>
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
                        <div
                            style={{ padding: 20, flex: 1, minHeight: 0, overflowY: 'auto' }}
                            className="custom-scrollbar"
                        >
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{tm('bPanelOperationDetails')}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                                {(() => {
                                    const dk = beautyAppointmentDateKey(selectedApt);
                                    let dateShown = '—';
                                    if (dk) {
                                        try {
                                            dateShown = new Date(`${dk}T12:00:00`).toLocaleDateString('tr-TR', {
                                                weekday: 'short',
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric',
                                            });
                                        } catch {
                                            dateShown = dk;
                                        }
                                    }
                                    const st = STATUS_CFG[String(selectedApt.status)]?.label ?? String(selectedApt.status ?? '');
                                    const created =
                                        selectedApt.created_at &&
                                        (() => {
                                            try {
                                                return new Date(selectedApt.created_at!).toLocaleString('tr-TR', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                });
                                            } catch {
                                                return selectedApt.created_at;
                                            }
                                        })();
                                    return (
                                        <>
                                            {[
                                                { label: tm('bPanelAppointmentDate'), value: dateShown },
                                                {
                                                    label: tm('bPanelAppointmentTime'),
                                                    value: (selectedApt.appointment_time ?? selectedApt.time ?? '—').slice(0, 5),
                                                },
                                                { label: tm('bPanelAppointmentStatus'), value: st || '—' },
                                                {
                                                    label: tm('bPanelAppointmentId'),
                                                    value: (
                                                        <span style={{ fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                                                            {selectedApt.id}
                                                        </span>
                                                    ),
                                                },
                                                ...(created ? [{ label: tm('createdAt'), value: created }] : []),
                                            ].map(({ label, value }) => (
                                                <div key={label} style={{ background: '#f7f6fb', borderRadius: 6, padding: '10px 12px' }}>
                                                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{value}</div>
                                                </div>
                                            ))}
                                        </>
                                    );
                                })()}
                            </div>
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
                            <div style={{ marginBottom: 18 }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{tm('bPanelTreatmentFieldsTitle')}</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div>
                                        <label htmlFor="beauty-panel-treatment-degree" style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>{tm('bReceiptTreatmentDegree')}</label>
                                        <input
                                            id="beauty-panel-treatment-degree"
                                            type="text"
                                            value={treatmentDegreeDraft}
                                            onChange={e => setTreatmentDegreeDraft(e.target.value)}
                                            autoComplete="off"
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: 6,
                                                padding: '8px 10px',
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: '#111827',
                                                outline: 'none',
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="beauty-panel-treatment-shots" style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>{tm('bReceiptTreatmentShots')}</label>
                                        <input
                                            id="beauty-panel-treatment-shots"
                                            type="text"
                                            inputMode="numeric"
                                            value={treatmentShotsDraft}
                                            onChange={e => setTreatmentShotsDraft(e.target.value)}
                                            autoComplete="off"
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: 6,
                                                padding: '8px 10px',
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: '#111827',
                                                outline: 'none',
                                            }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void saveTreatmentFieldsFromPanel()}
                                        disabled={treatmentFieldsSaving}
                                        style={{
                                            width: '100%',
                                            height: 36,
                                            borderRadius: 8,
                                            border: '1px solid #c4b5fd',
                                            background: '#f5f3ff',
                                            color: '#5b21b6',
                                            fontSize: 12,
                                            fontWeight: 800,
                                            cursor: treatmentFieldsSaving ? 'wait' : 'pointer',
                                        }}
                                    >
                                        {treatmentFieldsSaving ? tm('bSaving') : tm('save')}
                                    </button>
                                </div>
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
                            {!isBeautyAppointmentDone(selectedApt) ? (
                                <div style={{ marginBottom: 4 }}>
                                    <button
                                        type="button"
                                        onClick={() => openExistingAptInPos(selectedApt)}
                                        style={{
                                            width: '100%',
                                            height: 40,
                                            borderRadius: 8,
                                            border: '1px solid #a5b4fc',
                                            background: '#eef2ff',
                                            color: '#312e81',
                                            fontSize: 13,
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {tm('bCardDetailView')}
                                    </button>
                                </div>
                            ) : null}
                        </div>
                        {(() => {
                            const done =
                                selectedApt.status === AppointmentStatus.COMPLETED || selectedApt.status === 'completed';
                            if (!done) return null;
                            const hasCustomer = !!(selectedApt.customer_id ?? selectedApt.client_id);
                            return (
                                <div
                                    style={{
                                        padding: '14px 20px 18px',
                                        borderTop: '1px solid #e5e7eb',
                                        background: '#fafafa',
                                        flexShrink: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 10,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => openExistingAptInPos(selectedApt)}
                                        style={{
                                            width: '100%',
                                            height: 40,
                                            borderRadius: 8,
                                            border: '1px solid #a5b4fc',
                                            background: '#eef2ff',
                                            color: '#312e81',
                                            fontSize: 13,
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {tm('bCardDetailView')}
                                    </button>
                                    <p style={{ fontSize: 10, color: '#6b7280', margin: 0, lineHeight: 1.45 }}>{tm('bPanelRevertCompletionHint')}</p>
                                    <button
                                        type="button"
                                        onClick={openSurveyFromDetailPanel}
                                        disabled={!hasCustomer}
                                        title={!hasCustomer ? tm('bPanelSurveyNeedCustomer') : undefined}
                                        style={{
                                            width: '100%',
                                            height: 40,
                                            borderRadius: 8,
                                            border: 'none',
                                            background: !hasCustomer ? '#d1d5db' : '#059669',
                                            color: '#fff',
                                            fontSize: 13,
                                            fontWeight: 800,
                                            cursor: !hasCustomer ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {tm('bPanelRunSurvey')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={openRevertConfirmModal}
                                        style={{
                                            width: '100%',
                                            height: 40,
                                            borderRadius: 8,
                                            border: '1px solid #fecaca',
                                            background: '#fff',
                                            color: '#b91c1c',
                                            fontSize: 13,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {tm('bPanelRevertCompletion')}
                                    </button>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            <RetailExFlatModal
                open={!!priceEditApt && isAdmin()}
                onClose={() => {
                    if (!priceEditSaving) setPriceEditApt(null);
                }}
                title={tm('bAppointmentEditPriceTitle')}
                subtitle={priceEditApt ? `${priceEditApt.customer_name ?? '—'} · ${priceEditApt.service_name ?? '—'}` : undefined}
                headerIcon={<Banknote size={22} />}
                maxWidthClass="max-w-md"
                cancelLabel={tm('cancel')}
                confirmLabel={tm('save')}
                onConfirm={saveAppointmentPriceFromCard}
                confirmDisabled={priceEditSaving}
                confirmLoading={priceEditSaving}
            >
                <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200" htmlFor="beauty-apt-price-edit">
                        {tm('bAppointmentEditPriceHint')}
                    </label>
                    <input
                        id="beauty-apt-price-edit"
                        type="number"
                        min={0}
                        step={0.01}
                        value={priceEditDraft}
                        onChange={e => setPriceEditDraft(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                </div>
            </RetailExFlatModal>

            <RetailExFlatModal
                open={!!revertModalApt}
                onClose={closeRevertModal}
                title={tm('bPanelRevertCompletion')}
                subtitle={
                    revertModalApt
                        ? `${revertModalApt.customer_name ?? '—'} · ${revertModalApt.service_name ?? '—'}`
                        : undefined
                }
                headerIcon={<Undo2 size={22} />}
                maxWidthClass="max-w-md"
                cancelLabel={tm('cancel')}
                confirmLabel={tm('approve')}
                onConfirm={() => void executeRevertCompletion()}
                confirmDisabled={revertSaving}
                confirmLoading={revertSaving}
                closeOnBackdrop={!revertSaving}
            >
                <div className="space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    <p>{tm('bPanelRevertCompletionConfirm')}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{tm('bPanelRevertCompletionHint')}</p>
                </div>
            </RetailExFlatModal>

            {feedbackApt ? (
                <BeautyFeedbackSurveyModal
                    open
                    onClose={() => setFeedbackApt(null)}
                    customerId={String(feedbackApt.customer_id ?? feedbackApt.client_id ?? '')}
                    customerName={feedbackApt.customer_name ?? undefined}
                    appointmentId={feedbackApt.id}
                    appointmentSubtitle={
                        [feedbackApt.customer_name, feedbackApt.service_name].filter(Boolean).join(' — ') || null
                    }
                    variant="appointment_completed"
                />
            ) : null}
        </div>
    );
}
