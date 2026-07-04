
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    ChevronLeft, ChevronRight, Plus, Clock,
    User, Cpu, List, Search, X,
    CalendarDays, Banknote, Undo2, Phone, MessageSquare, Send,
} from 'lucide-react';
import { useBeautyStore } from '../store/useBeautyStore';
import {
    BeautyAppointment,
    AppointmentStatus,
    appointmentStatusMatches,
    type BeautyFollowUpReminder,
} from '../../../types/beauty';
import { beautyService } from '../../../services/beautyService';
import { resolveAppointmentProductLabels } from '../../../utils/beautyAppointmentProducts';
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
    addDaysToLocalYmd,
    beautyAppointmentDateKey,
    beautyAppointmentEarlyCompletionDateKey,
    enumerateLocalYmdInclusive,
    formatLocalYmd,
    getWeekRangeLocal,
    getMonthRangeLocal,
    getWorkWeekRangeLocal,
    getAgendaRangeLocal,
} from '../../../utils/dateLocal';
import {
    compareBeautyQueueOrder,
    customerQueueGroupKey,
    findBeautyAppointmentsSameQueueGroup,
    groupBeautyQueueByCustomer,
    suggestQueuePrefillTime,
} from '../../../utils/beautyQueueOrder';
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
import { ClinicDetailClinicalEmbed } from '../specialty/ClinicDetailClinicalEmbed';
import { ServiceCategoryDateBoard, type ServiceBoardMainLayout } from './ServiceCategoryDateBoard';
import { FollowUpReminderActionModal } from './FollowUpReminderActionModal';
import { FollowUpMesajBildirimModal } from './FollowUpMesajBildirimModal';
import {
    filterFollowUpRemindersForBulk,
    buildFollowUpBulkPreviewList,
} from '../../../utils/followUpWhatsAppSend';
import { WhatsAppBulkSendPreviewModal } from '../../shared/WhatsAppBulkSendPreviewModal';
import type { WhatsAppBulkPreviewItem } from '../../../utils/whatsappBulkSend';
import { toast } from 'sonner';
import { useClinicErpSpecialtyOptional } from '../context/ClinicErpSpecialtyContext';
import { useResponsive } from '../../../hooks/useResponsive';
type ViewType = 'day' | 'workweek' | 'week' | 'month' | 'agenda' | 'timeline' | 'device' | 'list' | 'svcboard';
type GroupMode = 'none' | 'staff' | 'device';
const SERVICE_BOARD_MAX_DAYS = 90;
const SLOT_INTERVAL_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60] as const;

const LS_BEAUTY_SLOT = 'retailex.beauty.slotIntervalMin';
const LS_BEAUTY_QUEUE = 'retailex.beauty.queueMode';
const LS_BEAUTY_SEP = 'retailex.beauty.separateLineInvoices';
const LS_BEAUTY_SVC_ONLY_BOOKED = 'retailex.beauty.serviceBoardOnlyBooked';
const LS_BEAUTY_MAIN_LAYOUT = 'retailex.beauty.serviceBoardMainLayout';

function parseHhmmToMinutes(raw: string | undefined): number | null {
    const s = String(raw ?? '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
}

function formatMinutesToHhmm(total: number): string {
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function mergeConsecutiveCustomerAppointments(appointments: BeautyAppointment[]): BeautyAppointment[] {
    if (appointments.length <= 1) return appointments;
    const sorted = [...appointments].sort((a, b) => {
        const sa = parseHhmmToMinutes(a.appointment_time ?? a.time) ?? 0;
        const sb = parseHhmmToMinutes(b.appointment_time ?? b.time) ?? 0;
        if (sa !== sb) return sa - sb;
        return String(a.id).localeCompare(String(b.id));
    });

    const result: BeautyAppointment[] = [];
    for (const apt of sorted) {
        const start = parseHhmmToMinutes(apt.appointment_time ?? apt.time);
        if (start === null) {
            result.push(apt);
            continue;
        }
        const prev = result[result.length - 1];
        if (!prev) {
            result.push(apt);
            continue;
        }
        const prevStart = parseHhmmToMinutes(prev.appointment_time ?? prev.time);
        const prevDuration = Math.max(1, Number(prev.duration) || 30);
        if (prevStart === null) {
            result.push(apt);
            continue;
        }
        const prevEnd = prevStart + prevDuration;
        const sameCustomer = customerQueueGroupKey(prev) === customerQueueGroupKey(apt);
        const isContiguous = start <= prevEnd;
        if (!sameCustomer || !isContiguous) {
            result.push(apt);
            continue;
        }

        const mergedStart = Math.min(prevStart, start);
        const mergedEnd = Math.max(prevEnd, start + Math.max(1, Number(apt.duration) || 30));
        const services = [
            ...(prev.service_name ?? '').split('·').map(s => s.trim()).filter(Boolean),
            ...(apt.service_name ?? '').split('·').map(s => s.trim()).filter(Boolean),
        ];
        const uniqueServices = [...new Set(services)];
        const merged: BeautyAppointment = {
            ...prev,
            appointment_time: formatMinutesToHhmm(mergedStart),
            time: formatMinutesToHhmm(mergedStart),
            duration: Math.max(1, mergedEnd - mergedStart),
            total_price: Number(prev.total_price ?? 0) + Number(apt.total_price ?? 0),
            service_name: uniqueServices.join(' · '),
        };
        result[result.length - 1] = merged;
    }

    return result;
}

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
    const { tm, language } = useLanguage();
    const scheduleDayHeaderLocale = useMemo(() => {
        switch (language) {
            case 'tr': return 'tr-TR';
            case 'en': return 'en-GB';
            case 'ar': return 'ar-SA';
            case 'ku': return 'ku-Arab-IQ';
            default: return 'tr-TR';
        }
    }, [language]);
    const { isAdmin } = usePermission();
    const { isMobile } = useResponsive();
    const clinicSpec = useClinicErpSpecialtyOptional()?.specialty ?? 'beauty_default';
    const isDentalMode = clinicSpec === 'dental';
    const serviceCategoryLabels = useMemo((): Record<string, string> => {
        const base: Record<string, string> = {
            laser: tm('bCatLaser'),
            hair_salon: tm('bCatHairSalon'),
            beauty: tm('bCatBeauty'),
            hair_transplant: tm('bCatOther'),
            botox: tm('bCatBotox'),
            filler: tm('bCatFiller'),
            massage: tm('bCatMassage'),
            skincare: tm('bCatSkincare'),
            makeup: tm('bCatMakeup'),
            nails: tm('bCatNails'),
            spa: tm('bCatSpa'),
            physical_therapy: tm('bClinicSpec_physiotherapy'),
        };
        if (!isDentalMode) return base;
        return {
            ...base,
            diagnostic: tm('bCatDentalDiagnostic'),
            endodontics: tm('bCatDentalEndo'),
            periodontics: tm('bCatDentalPerio'),
            surgery: tm('bCatDentalSurgery'),
            prosthodontics: tm('bCatDentalProstho'),
            orthodontics: tm('bCatDentalOrtho'),
            pedodontics: tm('bCatDentalPedo'),
            preventive: tm('bCatDentalPreventive'),
            implant: tm('bCatDentalImplant'),
            restorative: tm('bCatDentalRestorative'),
        };
    }, [tm, isDentalMode]);

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
    const [serviceBoardRange, setServiceBoardRange] = useState(() => getAgendaRangeLocal(new Date(), 7));
    const [svcRangeDraftStart, setSvcRangeDraftStart] = useState(() => getAgendaRangeLocal(new Date(), 7).start);
    const [svcRangeDraftEnd, setSvcRangeDraftEnd] = useState(() => getAgendaRangeLocal(new Date(), 7).end);
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
    /** Hizmet & tarih: yalnızca o günde randevusu veya hatırlatması olan hizmet satırları */
    const [serviceBoardOnlyBooked, setServiceBoardOnlyBooked] = useState(() => {
        if (typeof window === 'undefined' || !IS_BROWSER) return false;
        try {
            const v = window.localStorage.getItem(LS_BEAUTY_SVC_ONLY_BOOKED);
            return v === '1' || v === 'true';
        } catch {
            return false;
        }
    });
    /** Hizmet & tarih: ana kategori kutuları yan yana (row) veya alt alta (stack) */
    const [serviceBoardMainLayout, setServiceBoardMainLayout] = useState<'stack' | 'row'>(() => {
        if (typeof window === 'undefined' || !IS_BROWSER) return 'stack';
        try {
            return window.localStorage.getItem(LS_BEAUTY_MAIN_LAYOUT) === 'row' ? 'row' : 'stack';
        } catch {
            return 'stack';
        }
    });
    /** Takvim kartından işlem tutarı düzenleme */
    const [priceEditApt, setPriceEditApt] = useState<BeautyAppointment | null>(null);
    const [priceEditDraft, setPriceEditDraft] = useState('');
    const [priceEditSaving, setPriceEditSaving] = useState(false);
    const [selectedApt, setSelectedApt] = useState<BeautyAppointment | null>(null);
    /** Randevu yan paneli: özet alanları vs. uzmanlık şeması */
    const [aptDetailTab, setAptDetailTab] = useState<'summary' | 'clinical'>('summary');

    // Full-page new appointment state
    const [showNewPage,     setShowNewPage]     = useState(false);
    const [prefillTime,     setPrefillTime]     = useState('09:00');
    const [newPrefillDate,  setNewPrefillDate]  = useState<string | null>(null);
    /** Kaynak sütunundan (personel/cihaz) tıklanınca AppointmentPOS ön doldurma */
    const [prefillStaffId,  setPrefillStaffId]  = useState<string | undefined>(undefined);
    const [prefillDeviceId, setPrefillDeviceId] = useState<string | undefined>(undefined);
    /** CRM / sihirbaz: randevudaki hizmeti sepete bir kez eklemek için */
    const [prefillServiceId, setPrefillServiceId] = useState<string | undefined>(undefined);
    const [prefillCustomerId, setPrefillCustomerId] = useState<string | undefined>(undefined);
    const [editingApt,      setEditingApt]      = useState<BeautyAppointment | null>(null);
    const [aptProductLabels, setAptProductLabels] = useState<Map<string, string[]>>(new Map());
    const [lastCustomerTreatments, setLastCustomerTreatments] = useState<
        Map<string, { treatment_shots?: string | null; treatment_degree?: string | null }>
    >(new Map());

    /** Sağ panelden “Anket yap” ile açılan memnuniyet anketi */
    const [feedbackApt, setFeedbackApt] = useState<BeautyAppointment | null>(null);
    /** Tamamlamayı geri al — onay modali için anlık randevu kopyası */
    const [revertModalApt, setRevertModalApt] = useState<BeautyAppointment | null>(null);
    const [revertSaving, setRevertSaving] = useState(false);
    const [treatmentDegreeDraft, setTreatmentDegreeDraft] = useState('');
    const [treatmentShotsDraft, setTreatmentShotsDraft] = useState('');
    const [treatmentDurationDraft, setTreatmentDurationDraft] = useState('');
    const [treatmentFieldsSaving, setTreatmentFieldsSaving] = useState(false);
    const [aptNotesDraft, setAptNotesDraft] = useState('');
    const [aptNotesSaving, setAptNotesSaving] = useState(false);

    useEffect(() => {
        setSelectedApt(prev => {
            if (!prev) return null;
            const next = appointments.find(a => a.id === prev.id);
            return next ? { ...next } : prev;
        });
    }, [appointments]);

    /** POS tam ekranda `clinical_data` vb. güncellenince düzenlenen randevu satırını tazele */
    useEffect(() => {
        setEditingApt(prev => {
            if (!prev) return null;
            const next = appointments.find(a => a.id === prev.id);
            return next ? { ...next } : prev;
        });
    }, [appointments]);

    useEffect(() => {
        if (!selectedApt) {
            setTreatmentDegreeDraft('');
            setTreatmentShotsDraft('');
            setTreatmentDurationDraft('');
            setAptNotesDraft('');
            return;
        }
        setTreatmentDegreeDraft(String(selectedApt.treatment_degree ?? ''));
        setTreatmentShotsDraft(String(selectedApt.treatment_shots ?? ''));
        setTreatmentDurationDraft(
            Number.isFinite(Number(selectedApt.duration)) && Number(selectedApt.duration) > 0
                ? String(Math.round(Number(selectedApt.duration)))
                : '',
        );
        setAptNotesDraft(String(selectedApt.notes ?? ''));
    }, [selectedApt?.id, selectedApt?.treatment_degree, selectedApt?.treatment_shots, selectedApt?.duration, selectedApt?.notes]);

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
                window.localStorage.setItem(LS_BEAUTY_SVC_ONLY_BOOKED, serviceBoardOnlyBooked ? 'true' : 'false');
                window.localStorage.setItem(LS_BEAUTY_MAIN_LAYOUT, serviceBoardMainLayout);
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
    }, [slotIntervalMin, beautyQueueMode, beautySeparateLineInvoices, serviceBoardOnlyBooked, serviceBoardMainLayout]);

    useEffect(() => {
        if (view === 'svcboard') {
            void loadAppointmentsInRange(serviceBoardRange.start, serviceBoardRange.end);
            return;
        }
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
    }, [currentDate, view, serviceBoardRange.start, serviceBoardRange.end, loadAppointmentsInRange]);

    useEffect(() => {
        if (!showNewPage) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [showNewPage]);

    const serviceNameById = useMemo(() => {
        const m = new Map<string, string>();
        for (const s of services) {
            const id = String(s.id ?? '').trim();
            const name = String(s.name ?? '').trim();
            if (!id || !name) continue;
            m.set(id, name);
        }
        return m;
    }, [services]);

    const resolveServiceName = useCallback((apt: BeautyAppointment): string => {
        const direct = String(apt.service_name ?? '').trim();
        if (direct) return direct;
        const id = String(apt.service_id ?? '').trim();
        if (!id) return '—';
        return serviceNameById.get(id) ?? '—';
    }, [serviceNameById]);

    const visibleAppointments = useMemo(() => {
        const base = appointments.filter(beautyAptVisibleOnSchedule);
        const q = searchTerm.trim().toLowerCase();
        if (!q) return base;
        return base.filter(a =>
            (a.customer_name ?? '').toLowerCase().includes(q) ||
            (() => {
                const sn = String(a.service_name ?? '').trim();
                if (sn) return sn.toLowerCase();
                const sid = String(a.service_id ?? '').trim();
                if (!sid) return '';
                return String(serviceNameById.get(sid) ?? '').toLowerCase();
            })().includes(q) ||
            (a.specialist_name ?? a.staff_name ?? '').toLowerCase().includes(q)
        );
    }, [appointments, searchTerm, serviceNameById]);

    const serviceBoardDateKeys = useMemo(
        () => enumerateLocalYmdInclusive(serviceBoardRange.start, serviceBoardRange.end),
        [serviceBoardRange.start, serviceBoardRange.end],
    );

    const [followUpReminders, setFollowUpReminders] = useState<BeautyFollowUpReminder[]>([]);
    const [followUpActionTarget, setFollowUpActionTarget] = useState<BeautyFollowUpReminder | null>(null);
    const [showMesajBildirim, setShowMesajBildirim] = useState(false);
    const [followUpBulkSending, setFollowUpBulkSending] = useState(false);
    const [followUpBulkPreviewOpen, setFollowUpBulkPreviewOpen] = useState(false);
    const [followUpBulkPreviewItems, setFollowUpBulkPreviewItems] = useState<WhatsAppBulkPreviewItem[]>([]);
    const [followUpSinglePreviewTitle, setFollowUpSinglePreviewTitle] = useState('');
    const [followUpPreviewReminder, setFollowUpPreviewReminder] = useState<BeautyFollowUpReminder | null>(null);

    const openFollowUpWhatsAppPreview = useCallback(async (reminder: BeautyFollowUpReminder) => {
        try {
            const items = await buildFollowUpBulkPreviewList([reminder]);
            if (!items.length) {
                toast.warning(tm('msgNotifyNoRecipients'));
                return;
            }
            setFollowUpSinglePreviewTitle(
                `${reminder.customer_name ?? '—'} · ${tm('msgNotifyModeSingle')}`,
            );
            setFollowUpPreviewReminder(reminder);
            setFollowUpBulkPreviewItems(items);
            setFollowUpBulkPreviewOpen(true);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        }
    }, [tm]);

    const handleFollowUpWhatsApp = useCallback(
        (reminder: BeautyFollowUpReminder) => void openFollowUpWhatsAppPreview(reminder),
        [openFollowUpWhatsAppPreview],
    );

    const followUpBulkCount = useMemo(
        () => filterFollowUpRemindersForBulk(followUpReminders).length,
        [followUpReminders],
    );

    const handleFollowUpBulkWhatsApp = useCallback(async () => {
        if (followUpBulkCount === 0) {
            toast.warning(tm('msgNotifyNoRecipients'));
            return;
        }
        setFollowUpBulkSending(true);
        try {
            const items = await buildFollowUpBulkPreviewList(followUpReminders);
            if (!items.length) {
                toast.warning(tm('msgNotifyNoRecipients'));
                return;
            }
            setFollowUpBulkPreviewItems(items);
            setFollowUpPreviewReminder(null);
            setFollowUpSinglePreviewTitle('');
            setFollowUpBulkPreviewOpen(true);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : String(e));
        } finally {
            setFollowUpBulkSending(false);
        }
    }, [followUpReminders, followUpBulkCount, tm]);

    const reloadFollowUpReminders = useCallback(async () => {
        try {
            const rows = await beautyService.getFollowUpRemindersInRange(
                serviceBoardRange.start,
                serviceBoardRange.end,
            );
            setFollowUpReminders(rows);
        } catch {
            setFollowUpReminders([]);
        }
    }, [serviceBoardRange.start, serviceBoardRange.end]);

    useEffect(() => {
        if (view !== 'svcboard') {
            setFollowUpReminders([]);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const rows = await beautyService.getFollowUpRemindersInRange(
                    serviceBoardRange.start,
                    serviceBoardRange.end,
                );
                if (!cancelled) setFollowUpReminders(rows);
            } catch {
                if (!cancelled) setFollowUpReminders([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [view, serviceBoardRange.start, serviceBoardRange.end]);

    const followUpStatusLabels = useMemo(
        () => ({
            due: tm('bFollowUpBadge'),
            noted: tm('bFollowUpBadgeNoted'),
            postponed: tm('bFollowUpStatusPostponed'),
            contacted: tm('bFollowUpStatusContacted'),
            other: tm('bFollowUpStatusOther'),
            dismissed: tm('bFollowUpStatusDismissed'),
            shadow: tm('bFollowUpShadowBadge'),
        }),
        [tm],
    );

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
    type NewAptPrefill = { staffId?: string; deviceId?: string; serviceId?: string; customerId?: string };

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
        const cid = prefill?.customerId?.trim();
        setPrefillCustomerId(cid || undefined);
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
                customerId?: string;
            }>;
            const d = ce.detail;
            if (!d?.dateYmd) return;
            openNewAptRef.current(d.time, d.dateYmd, {
                staffId: d.staffId?.trim() || undefined,
                deviceId: d.deviceId?.trim() || undefined,
                serviceId: d.serviceId?.trim() || undefined,
                customerId: d.customerId?.trim() || undefined,
            });
        };
        window.addEventListener('beauty-open-new-appointment', onShellOpen);
        return () => window.removeEventListener('beauty-open-new-appointment', onShellOpen);
    }, []);

    useEffect(() => {
        setAptDetailTab('summary');
    }, [selectedApt?.id]);

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
        appointmentStatusMatches(apt.status, AppointmentStatus.COMPLETED);

    /** Takvim kartı: her durumda yan detay paneli (POS panelden açılır) */
    const handleAppointmentPrimaryClick = (apt: BeautyAppointment) => {
        setSelectedApt(apt);
    };

    const openAppointmentDetailPanel = (apt: BeautyAppointment, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setSelectedApt(apt);
    };

    const handlePrevious = () => {
        if (view === 'svcboard') {
            const span = Math.max(
                1,
                enumerateLocalYmdInclusive(serviceBoardRange.start, serviceBoardRange.end).length,
            );
            const ns = addDaysToLocalYmd(serviceBoardRange.start, -span);
            const ne = addDaysToLocalYmd(serviceBoardRange.end, -span);
            setServiceBoardRange({ start: ns, end: ne });
            setSvcRangeDraftStart(ns);
            setSvcRangeDraftEnd(ne);
            return;
        }
        const d = new Date(currentDate);
        if (view === 'day') d.setDate(d.getDate() - 1);
        else if (view === 'week' || view === 'workweek') d.setDate(d.getDate() - 7);
        else if (view === 'month') d.setMonth(d.getMonth() - 1);
        else if (view === 'agenda') d.setDate(d.getDate() - 7);
        else d.setDate(d.getDate() - 1);
        setCurrentDate(d);
    };
    const handleNext = () => {
        if (view === 'svcboard') {
            const span = Math.max(
                1,
                enumerateLocalYmdInclusive(serviceBoardRange.start, serviceBoardRange.end).length,
            );
            const ns = addDaysToLocalYmd(serviceBoardRange.start, span);
            const ne = addDaysToLocalYmd(serviceBoardRange.end, span);
            setServiceBoardRange({ start: ns, end: ne });
            setSvcRangeDraftStart(ns);
            setSvcRangeDraftEnd(ne);
            return;
        }
        const d = new Date(currentDate);
        if (view === 'day') d.setDate(d.getDate() + 1);
        else if (view === 'week' || view === 'workweek') d.setDate(d.getDate() + 7);
        else if (view === 'month') d.setMonth(d.getMonth() + 1);
        else if (view === 'agenda') d.setDate(d.getDate() + 7);
        else d.setDate(d.getDate() + 1);
        setCurrentDate(d);
    };

    const applyServiceBoardRange = () => {
        let a = svcRangeDraftStart.trim();
        let b = svcRangeDraftEnd.trim();
        const ymdOk = /^\d{4}-\d{2}-\d{2}$/;
        if (!ymdOk.test(a) || !ymdOk.test(b)) return;
        if (a > b) {
            const t = a;
            a = b;
            b = t;
            setSvcRangeDraftStart(a);
            setSvcRangeDraftEnd(b);
        }
        const n = enumerateLocalYmdInclusive(a, b).length;
        if (n > SERVICE_BOARD_MAX_DAYS) {
            window.alert(tm('bServiceDateBoardRangeTooLong').replace('{n}', String(SERVICE_BOARD_MAX_DAYS)));
            return;
        }
        setServiceBoardRange({ start: a, end: b });
        setSvcRangeDraftStart(a);
        setSvcRangeDraftEnd(b);
    };

    const openSurveyForCompletedAppointment = (apt: BeautyAppointment) => {
        const customerId = String(apt.customer_id ?? apt.client_id ?? '').trim();
        if (!customerId) return;
        setFeedbackApt(apt);
    };

    const handleStatusChange = async (apt: BeautyAppointment, newStatus: AppointmentStatus) => {
        const nowIso = new Date().toISOString();
        if (newStatus === AppointmentStatus.CANCELLED) {
            const dayYmd = beautyAppointmentDateKey(apt);
            const dayPool = dayYmd
                ? appointments.filter(a => beautyAppointmentDateKey(a) === dayYmd)
                : appointments;
            const siblings = findBeautyAppointmentsSameQueueGroup(
                apt,
                dayPool.length > 0 ? dayPool : [apt],
            );
            const targets = siblings.length > 0 ? siblings : [apt];
            for (const sib of targets) {
                if (!sib?.id) continue;
                await updateAppointmentStatus(sib.id, AppointmentStatus.CANCELLED);
            }
        } else if (newStatus === AppointmentStatus.COMPLETED) {
            const customerId = String(apt.customer_id ?? apt.client_id ?? '').trim();
            const dayYmd = beautyAppointmentDateKey({ ...apt, status: newStatus, updated_at: nowIso });
            const dayPool = dayYmd
                ? appointments.filter(a => beautyAppointmentDateKey(a) === dayYmd)
                : appointments;
            const targets = customerId
                ? dayPool.filter(a => {
                    const cid = String(a.customer_id ?? a.client_id ?? '').trim();
                    if (cid !== customerId) return false;
                    return !(
                        appointmentStatusMatches(a.status, AppointmentStatus.CANCELLED) ||
                        appointmentStatusMatches(a.status, AppointmentStatus.NO_SHOW)
                    );
                })
                : [apt];
            const uniqTargets = [...new Map((targets.length ? targets : [apt]).map(a => [a.id, a])).values()];
            for (const target of uniqTargets) {
                if (!target?.id) continue;
                await updateAppointmentStatus(target.id, AppointmentStatus.COMPLETED);
            }
        } else {
            await updateAppointmentStatus(apt.id, newStatus);
        }
        if (newStatus === AppointmentStatus.COMPLETED) {
            const completedApt: BeautyAppointment = { ...apt, status: newStatus, updated_at: nowIso };
            setSelectedApt(completedApt);
        } else {
            setSelectedApt(null);
        }
        if (
            view === 'svcboard' &&
            (
                newStatus === AppointmentStatus.COMPLETED ||
                newStatus === AppointmentStatus.CANCELLED ||
                newStatus === AppointmentStatus.NO_SHOW
            )
        ) {
            await reloadFollowUpReminders();
        }
    };

    const openSurveyFromDetailPanel = () => {
        if (!selectedApt) return;
        openSurveyForCompletedAppointment(selectedApt);
        setSelectedApt(null);
    };

    const saveTreatmentFieldsFromPanel = async () => {
        if (!selectedApt) return;
        const durationNum = Number(treatmentDurationDraft);
        const normalizedDuration =
            Number.isFinite(durationNum) && durationNum > 0 ? Math.round(durationNum) : null;
        setTreatmentFieldsSaving(true);
        try {
            const basePatch = {
                treatment_degree: treatmentDegreeDraft.trim() || null,
                treatment_shots: treatmentShotsDraft.trim() || null,
            };
            const canDistributeGroupDuration =
                !beautySeparateLineInvoices && normalizedDuration !== null && normalizedDuration > 0;

            if (!canDistributeGroupDuration) {
                await updateAppointment(selectedApt.id, {
                    ...basePatch,
                    ...(normalizedDuration != null ? { duration: normalizedDuration } : {}),
                });
                return;
            }

            const dayYmd = beautyAppointmentDateKey(selectedApt);
            const dayPool = dayYmd
                ? appointments.filter(a => beautyAppointmentDateKey(a) === dayYmd)
                : appointments;
            const siblings = findBeautyAppointmentsSameQueueGroup(
                selectedApt,
                dayPool.length > 0 ? dayPool : [selectedApt],
            );
            if (siblings.length <= 1) {
                await updateAppointment(selectedApt.id, {
                    ...basePatch,
                    duration: normalizedDuration,
                });
                return;
            }

            const sortedSiblings = [...siblings].sort((a, b) => {
                const sa = parseHhmmToMinutes(a.appointment_time ?? a.time) ?? 0;
                const sb = parseHhmmToMinutes(b.appointment_time ?? b.time) ?? 0;
                if (sa !== sb) return sa - sb;
                return String(a.id).localeCompare(String(b.id));
            });
            const weights = sortedSiblings.map((apt) => Math.max(1, Math.round(Number(apt.duration) || 30)));
            const sumW = weights.reduce((s, w) => s + w, 0);
            const target = Math.max(sortedSiblings.length, normalizedDuration);
            const parts = weights.map((w) => Math.max(1, Math.floor((target * w) / sumW)));
            let diff = target - parts.reduce((s, d) => s + d, 0);
            const idxOrder = weights
                .map((w, i) => ({ w, i }))
                .sort((a, b) => b.w - a.w)
                .map(x => x.i);
            let k = 0;
            while (diff > 0) {
                parts[idxOrder[k % idxOrder.length]]++;
                diff--;
                k++;
            }
            while (diff < 0) {
                const j = parts.findIndex(d => d > 1);
                if (j < 0) break;
                parts[j]--;
                diff++;
            }

            const firstStart =
                parseHhmmToMinutes(sortedSiblings[0]?.appointment_time ?? sortedSiblings[0]?.time) ??
                parseHhmmToMinutes(selectedApt.appointment_time ?? selectedApt.time) ??
                9 * 60;
            let cursor = firstStart;
            for (let i = 0; i < sortedSiblings.length; i++) {
                const sib = sortedSiblings[i];
                const nextDuration = Math.max(1, parts[i] ?? 1);
                const patch: Partial<BeautyAppointment> = {
                    duration: nextDuration,
                    appointment_time: formatMinutesToHhmm(cursor),
                    time: formatMinutesToHhmm(cursor),
                };
                if (sib.id === selectedApt.id) {
                    patch.treatment_degree = basePatch.treatment_degree;
                    patch.treatment_shots = basePatch.treatment_shots;
                }
                await updateAppointment(sib.id, patch);
                cursor += nextDuration;
            }
        } catch (e: unknown) {
            logger.crudError('SmartScheduler', 'saveTreatmentFields', e);
        } finally {
            setTreatmentFieldsSaving(false);
        }
    };

    const openRevertConfirmModal = () => {
        if (!selectedApt) return;
        const done =
            appointmentStatusMatches(selectedApt.status, AppointmentStatus.COMPLETED);
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
        const endMin = 23 * 60 + 59;
        const slots: string[] = [];
        for (let m = startMin; m <= endMin; m += schedulerSlotMin) {
            const hh = Math.floor(m / 60).toString().padStart(2, '0');
            const mm = (m % 60).toString().padStart(2, '0');
            slots.push(`${hh}:${mm}`);
        }
        return slots;
    }, [schedulerSlotMin]);

    useEffect(() => {
        const apts = visibleAppointments;
        const aptIds = apts.map((a) => String(a.id ?? '').trim()).filter(Boolean);
        const custIds = [
            ...new Set(
                apts
                    .map((a) => String(a.customer_id ?? a.client_id ?? '').trim())
                    .filter(Boolean),
            ),
        ];
        let cancelled = false;
        void (async () => {
            try {
                const [products, treatments] = await Promise.all([
                    aptIds.length ? beautyService.getProductLabelsByAppointmentIds(aptIds) : Promise.resolve(new Map()),
                    custIds.length ? beautyService.getLastCustomerTreatments(custIds) : Promise.resolve(new Map()),
                ]);
                if (!cancelled) {
                    setAptProductLabels(products);
                    setLastCustomerTreatments(treatments);
                }
            } catch (e) {
                logger.crudError('SmartScheduler', 'loadAptEnrichment', e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [visibleAppointments]);

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
        if (view === 'svcboard') {
            const [ys, ms, ds] = serviceBoardRange.start.split('-').map(Number);
            const [ye, me, de] = serviceBoardRange.end.split('-').map(Number);
            const da = new Date(ys, ms - 1, ds);
            const db = new Date(ye, me - 1, de);
            return `${da.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${db.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        }
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
    }, [view, currentDate, serviceBoardRange.start, serviceBoardRange.end]);

    const saveAptNotesFromPanel = useCallback(async () => {
        if (!selectedApt) return;
        const trimmed = aptNotesDraft.trim();
        const prev = String(selectedApt.notes ?? '').trim();
        if (trimmed === prev) return;
        setAptNotesSaving(true);
        try {
            await updateAppointment(selectedApt.id, { notes: trimmed || undefined });
            setSelectedApt(prevApt =>
                prevApt && prevApt.id === selectedApt.id ? { ...prevApt, notes: trimmed || undefined } : prevApt,
            );
        } catch (e: unknown) {
            logger.crudError('SmartScheduler', 'saveAptNotes', e, { id: selectedApt.id });
        } finally {
            setAptNotesSaving(false);
        }
    }, [selectedApt, aptNotesDraft, updateAppointment]);

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

    const customerPhoneLine = (apt: BeautyAppointment) =>
        String(apt.customer_phone ?? '').trim();

    const formatYmdShort = (ymd: string) => {
        const [y, m, d] = ymd.split('-');
        return y && m && d ? `${d}.${m}.${y}` : ymd;
    };

    const renderAptCard = (apt: BeautyAppointment) => {
        const color = apt.service_color ?? '#7c3aed';
        const cfg   = STATUS_CFG[apt.status] ?? STATUS_CFG.scheduled;
        const done  = appointmentStatusMatches(apt.status, AppointmentStatus.COMPLETED);
        const earlyDate = beautyAppointmentEarlyCompletionDateKey(apt);
        const earlyDone = Boolean(earlyDate);
        const phone = customerPhoneLine(apt);
        const noteText = String(apt.notes ?? '').trim();
        const hasNote = noteText.length > 0;
        const productLabels = resolveAppointmentProductLabels(apt.id, apt.notes, aptProductLabels);
        const custId = String(apt.customer_id ?? apt.client_id ?? '').trim();
        const lastTreat = custId ? lastCustomerTreatments.get(custId) : undefined;
        const lastShots = String(lastTreat?.treatment_shots ?? '').trim();
        const lastDegree = String(lastTreat?.treatment_degree ?? '').trim();
        const cardBg = earlyDone ? '#fef3c7' : done ? cfg.bg : hasNote ? '#fffbeb' : '#fff';
        const cardBorder = earlyDone ? '#f59e0b88' : done ? cfg.color + '55' : hasNote ? '#fde68a' : '#e8e4f0';
        const cardBorderLeft = earlyDone ? '#d97706' : done ? cfg.color : hasNote ? '#d97706' : color;
        const statusBg = earlyDone ? '#fde68a' : cfg.bg;
        const statusColor = earlyDone ? '#92400e' : cfg.color;
        const statusLabel = earlyDone ? 'Erken geldi' : cfg.label;
        return (
            <div
                key={apt.id}
                onClick={() => handleAppointmentPrimaryClick(apt)}
                style={{
                    background: cardBg,
                    border: `1px solid ${cardBorder}`,
                    borderLeft: `3px solid ${cardBorderLeft}`,
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
                {phone ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, minWidth: 0 }}>
                        <Phone size={10} style={{ flexShrink: 0, color: '#9ca3af' }} />
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{phone}</span>
                    </div>
                ) : null}
                <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>{resolveServiceName(apt)}</p>
                {productLabels.length > 0 ? (
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#0d9488', marginBottom: 6, lineHeight: 1.35 }}>
                        {tm('bAptCardProducts')}: {productLabels.join(', ')}
                    </p>
                ) : null}
                {(lastShots || lastDegree) ? (
                    <p style={{ fontSize: 10, fontWeight: 600, color: '#7c3aed', marginBottom: 6, lineHeight: 1.35 }}>
                        {tm('bAptCardLastTreatment')}
                        {lastShots ? ` · ${tm('bReceiptTreatmentShots')}: ${lastShots}` : ''}
                        {lastDegree ? ` · ${tm('bReceiptTreatmentDegree')}: ${lastDegree}` : ''}
                    </p>
                ) : null}
                {earlyDone ? (
                    <p
                        style={{
                            margin: '0 0 6px',
                            fontSize: 10,
                            fontWeight: 800,
                            color: '#92400e',
                            lineHeight: 1.35,
                        }}
                    >
                        {formatYmdShort(earlyDate)} tarihinde geldi
                    </p>
                ) : null}
                {hasNote ? (
                    <p
                        style={{
                            margin: '0 0 6px',
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#92400e',
                            lineHeight: 1.35,
                            fontStyle: 'italic',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                        }}
                    >
                        {noteText}
                    </p>
                ) : null}
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
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: statusBg, color: statusColor, flexShrink: 0 }}>{statusLabel}</span>
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
                        prefillCustomerId={prefillCustomerId}
                        existingAppointment={editingApt}
                        onBack={() => {
                            setShowNewPage(false);
                            setNewPrefillDate(null);
                            setPrefillStaffId(undefined);
                            setPrefillDeviceId(undefined);
                            setPrefillServiceId(undefined);
                            setPrefillCustomerId(undefined);
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
            <div
                style={{
                    background: '#fff',
                    borderBottom: '1px solid #e5e7eb',
                    padding: isMobile ? '8px 10px' : '10px 20px',
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    alignItems: isMobile ? 'stretch' : 'center',
                    justifyContent: isMobile ? 'flex-start' : 'space-between',
                    flexShrink: 0,
                    gap: isMobile ? 10 : 16,
                }}
            >

                {/* Date nav */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        justifyContent: isMobile ? 'center' : undefined,
                        width: isMobile ? '100%' : undefined,
                        flexShrink: 0,
                    }}
                >
                    <button onClick={handlePrevious} style={{ width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6b7280' }}>
                        <ChevronLeft size={14} />
                    </button>
                    <span
                        style={{
                            fontSize: isMobile ? 12 : 13,
                            fontWeight: 700,
                            color: '#111827',
                            minWidth: isMobile ? 0 : 220,
                            flex: isMobile ? '1 1 auto' : undefined,
                            textAlign: 'center',
                            lineHeight: 1.25,
                            wordBreak: 'break-word',
                        }}
                    >
                        {toolbarDateLabel}
                    </span>
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
                        onClick={() => {
                            if (view === 'svcboard') {
                                const r = getAgendaRangeLocal(new Date(), 7);
                                setCurrentDate(new Date());
                                setServiceBoardRange(r);
                                setSvcRangeDraftStart(r.start);
                                setSvcRangeDraftEnd(r.end);
                                return;
                            }
                            setCurrentDate(new Date());
                        }}
                        style={{ padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 5, background: '#f9fafb', fontSize: 11, fontWeight: 700, color: '#7c3aed', cursor: 'pointer' }}
                    >
                        {tm('bToday')}
                    </button>
                </div>

                {/* View tabs — mobilde tek satır yatay kaydırma (dar sütunda dikey yığılmayı önler) */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: isMobile ? 'nowrap' : 'wrap',
                        justifyContent: isMobile ? 'flex-start' : 'center',
                        alignItems: 'center',
                        background: '#f3f4f6',
                        borderRadius: 7,
                        padding: 3,
                        gap: 2,
                        maxWidth: isMobile ? '100%' : 720,
                        width: isMobile ? '100%' : undefined,
                        overflowX: isMobile ? 'auto' : undefined,
                        WebkitOverflowScrolling: isMobile ? 'touch' : undefined,
                        flexShrink: 0,
                        scrollbarWidth: isMobile ? 'thin' : undefined,
                    }}
                >
                    {([
                        { id: 'day',      label: tm('bDay') },
                        { id: 'workweek', label: tm('bWorkWeek') },
                        { id: 'week',     label: tm('bWeek') },
                        { id: 'month',    label: tm('bMonth') },
                        { id: 'agenda',   label: tm('bAgendaView') },
                        { id: 'timeline', label: tm('bStaffView') },
                        { id: 'device',   label: tm('bDeviceView') },
                        { id: 'svcboard', label: tm('bServiceDateBoardView') },
                        { id: 'list',     label: tm('bListView') },
                    ] as { id: ViewType; label: string }[]).map(({ id: v, label }) => (
                        <button
                            key={v}
                            onClick={() => {
                                if (v === 'svcboard') {
                                    const r = getAgendaRangeLocal(currentDate, 7);
                                    setServiceBoardRange(r);
                                    setSvcRangeDraftStart(r.start);
                                    setSvcRangeDraftEnd(r.end);
                                }
                                setView(v);
                            }}
                            style={{
                                padding: '5px 10px', borderRadius: 5, border: 'none',
                                background: view === v ? '#fff' : 'transparent',
                                color: view === v ? '#7c3aed' : '#6b7280',
                                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                transition: 'all 0.1s',
                                flexShrink: 0,
                                whiteSpace: 'nowrap',
                            }}
                        >{label}</button>
                    ))}
                </div>

                {/* Right actions */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        justifyContent: isMobile ? 'flex-start' : 'flex-end',
                        width: isMobile ? '100%' : undefined,
                    }}
                >
                    {view === 'svcboard' && (
                        <>
                            <button
                                type="button"
                                onClick={() => setServiceBoardOnlyBooked(v => !v)}
                                title={tm('bServiceDateBoardOnlyBooked')}
                                style={{
                                    height: 30,
                                    padding: '0 10px',
                                    borderRadius: 6,
                                    border: serviceBoardOnlyBooked ? '1px solid #6d28d9' : '1px solid #e5e7eb',
                                    background: serviceBoardOnlyBooked ? '#ede9fe' : '#fff',
                                    color: serviceBoardOnlyBooked ? '#5b21b6' : '#4b5563',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {tm('bServiceDateBoardOnlyBooked')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setServiceBoardMainLayout(m => (m === 'row' ? 'stack' : 'row'))}
                                title={
                                    serviceBoardMainLayout === 'row'
                                        ? tm('bServiceDateBoardMainStack')
                                        : tm('bServiceDateBoardMainRow')
                                }
                                style={{
                                    height: 30,
                                    padding: '0 10px',
                                    borderRadius: 6,
                                    border: serviceBoardMainLayout === 'row' ? '1px solid #6d28d9' : '1px solid #e5e7eb',
                                    background: serviceBoardMainLayout === 'row' ? '#ede9fe' : '#fff',
                                    color: serviceBoardMainLayout === 'row' ? '#5b21b6' : '#4b5563',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {serviceBoardMainLayout === 'row'
                                    ? tm('bServiceDateBoardMainStack')
                                    : tm('bServiceDateBoardMainRow')}
                            </button>
                        </>
                    )}
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
                    <div style={{ position: 'relative', flex: isMobile ? '1 1 140px' : undefined, minWidth: isMobile ? 0 : undefined }}>
                        <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input
                            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            placeholder={tm('bSearch')}
                            style={{
                                height: 30,
                                paddingLeft: 26,
                                paddingRight: 10,
                                border: '1px solid #e5e7eb',
                                borderRadius: 5,
                                fontSize: 12,
                                background: '#f9fafb',
                                outline: 'none',
                                width: isMobile ? 'min(100%, 200px)' : 150,
                                minWidth: isMobile ? 120 : undefined,
                                flex: isMobile ? '1 1 120px' : undefined,
                            }}
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
                            flex: isMobile ? '1 1 auto' : undefined,
                            justifyContent: isMobile ? 'center' : undefined,
                            minWidth: isMobile ? 0 : undefined,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#6d28d9')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#7c3aed')}
                    >
                        <Plus size={14} /> {tm('bNewAppointment')}
                    </button>
                </div>
            </div>

            {view === 'svcboard' && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 10,
                        padding: isMobile ? '8px 10px' : '8px 20px',
                        borderBottom: '1px solid #e5e7eb',
                        background: '#faf9fd',
                        flexShrink: 0,
                    }}
                >
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#6b7280' }}>{tm('bDateRangeFrom')}</span>
                    <input
                        type="date"
                        value={svcRangeDraftStart}
                        onChange={e => setSvcRangeDraftStart(e.target.value)}
                        style={{ height: 30, border: '1px solid #e5e7eb', borderRadius: 5, padding: '0 8px', fontSize: 12 }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#6b7280' }}>{tm('bDateRangeTo')}</span>
                    <input
                        type="date"
                        value={svcRangeDraftEnd}
                        onChange={e => setSvcRangeDraftEnd(e.target.value)}
                        style={{ height: 30, border: '1px solid #e5e7eb', borderRadius: 5, padding: '0 8px', fontSize: 12 }}
                    />
                    <button
                        type="button"
                        onClick={applyServiceBoardRange}
                        style={{
                            height: 30,
                            padding: '0 14px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#7c3aed',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        {tm('bApplyDateRange')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowMesajBildirim(true)}
                        style={{
                            height: 30,
                            padding: '0 12px',
                            borderRadius: 6,
                            border: '1px solid #a7f3d0',
                            background: '#ecfdf5',
                            color: '#047857',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <MessageSquare size={13} />
                        {tm('bFollowUpMesajBildirim')}
                    </button>
                    <button
                        type="button"
                        disabled={followUpBulkSending || followUpBulkCount === 0}
                        onClick={() => void handleFollowUpBulkWhatsApp()}
                        title={tm('bFollowUpBulkWhatsAppHint').replace('{n}', String(followUpBulkCount))}
                        style={{
                            height: 30,
                            padding: '0 12px',
                            borderRadius: 6,
                            border: '1px solid #86efac',
                            background: followUpBulkCount > 0 ? '#10b981' : '#e5e7eb',
                            color: followUpBulkCount > 0 ? '#fff' : '#9ca3af',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: followUpBulkCount > 0 && !followUpBulkSending ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            opacity: followUpBulkSending ? 0.7 : 1,
                        }}
                    >
                        <Send size={13} />
                        {followUpBulkSending
                            ? tm('bFollowUpBulkWhatsAppSending')
                            : tm('bFollowUpBulkWhatsApp').replace('{n}', String(followUpBulkCount))}
                    </button>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af' }}>{tm('bServiceDateBoardScrollHint')}</span>
                </div>
            )}

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
            <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 8 : 16 }} className="custom-scrollbar">
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
                                pixelsPerHour={isMobile ? 44 : 56}
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
                                mergeConsecutiveByCustomer={!beautySeparateLineInvoices}
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
                                productLabelsByAppointmentId={aptProductLabels}
                                lastTreatmentByCustomerId={lastCustomerTreatments}
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
                                    const devTimelineApts = beautyQueueMode || beautySeparateLineInvoices
                                        ? devApts
                                        : mergeConsecutiveCustomerAppointments(devApts);
                                    const devQueueRows = beautyQueueMode
                                        ? groupBeautyQueueByCustomer(devApts).length
                                        : devTimelineApts.length;
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
                                                        productLabelsByAppointmentId={aptProductLabels}
                                                        lastTreatmentByCustomerId={lastCustomerTreatments}
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
                                                    const spanPlacements = buildBeautySpanPlacements(devTimelineApts, timeSlots, schedulerSlotMin, slotBucket);
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
                                                                                        background: (appointmentStatusMatches(p.apt.status, AppointmentStatus.COMPLETED))
                                                                                            ? (STATUS_CFG.completed?.bg ?? '#d1fae5')
                                                                                            : '#ede9fe',
                                                                                        borderLeft: `3px solid ${(appointmentStatusMatches(p.apt.status, AppointmentStatus.COMPLETED))
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
                                                                                    {customerPhoneLine(p.apt) ? (
                                                                                        <p style={{ color: '#6b7280', margin: '2px 0 0', fontSize: 10, fontWeight: 600 }}>{customerPhoneLine(p.apt)}</p>
                                                                                    ) : null}
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
                                                                                        {(appointmentStatusMatches(p.apt.status, AppointmentStatus.COMPLETED)) ? (
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

                        {view === 'svcboard' && (
                            <ServiceCategoryDateBoard
                                services={services}
                                appointments={visibleAppointments}
                                followUpReminders={followUpReminders}
                                dateKeys={serviceBoardDateKeys}
                                categoryLabels={serviceCategoryLabels}
                                dayHeaderLocale={scheduleDayHeaderLocale}
                                renderAppointment={renderAptCard}
                                onAddClick={(dateYmd, serviceId, opts) => {
                                    const [y, mo, da] = dateYmd.split('-').map(Number);
                                    if (Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(da)) {
                                        setCurrentDate(new Date(y, mo - 1, da));
                                    }
                                    openNewApt(undefined, dateYmd, {
                                        serviceId,
                                        customerId: opts?.customerId,
                                    });
                                }}
                                followUpBadgeLabel={tm('bFollowUpBadge')}
                                followUpBookCtaLabel={tm('bFollowUpBookCta')}
                                formatFollowUpLine={r =>
                                    r.reminder_kind === 'product' && (r.product_name || r.service_name)
                                        ? tm('bFollowUpProductLine')
                                              .replace('{name}', (r.product_name || r.service_name || '').trim())
                                              .replace('{last}', r.last_completed_date)
                                              .replace('{days}', String(r.reminder_days))
                                        : tm('bFollowUpContextLine')
                                              .replace('{last}', r.last_completed_date)
                                              .replace('{days}', String(r.reminder_days))}
                                onFollowUpManage={setFollowUpActionTarget}
                                followUpManageLabel={tm('bFollowUpManage')}
                                onFollowUpWhatsApp={(r) => void handleFollowUpWhatsApp(r)}
                                followUpWhatsAppLabel={tm('bFollowUpWhatsApp')}
                                followUpStatusLabels={followUpStatusLabels}
                                formatFollowUpPostponedLine={date =>
                                    tm('bFollowUpPostponedLine').replace('{date}', date)}
                                noServicesLabel={tm('bServiceBoardNoActiveServices')}
                                noAppointmentsInSlotLabel={tm('bServiceBoardNoAptsForServiceDay')}
                                appointmentsCountTemplate={tm('bDeviceColumnAppointmentCount')}
                                showOnlyServicesWithBookings={serviceBoardOnlyBooked}
                                emptyDayWhenFilteredLabel={tm('bServiceDateBoardDayEmptyFiltered')}
                                mainCategoryLayout={serviceBoardMainLayout}
                            />
                        )}

                        {/* ── LIST VIEW ─────────────────────────────────── */}
                        {view === 'list' && (
                            <div style={{ background: '#fff', border: '1px solid #e8e4f0', borderRadius: 8, overflow: 'hidden' }}>
                                <div style={{ overflowX: 'auto' }} className="custom-scrollbar">
                                    {/* Header */}
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: beautyQueueMode ? '40px 10px 1fr 120px 64px 88px 80px' : '52px 10px 1fr 120px 64px 88px 80px',
                                            minWidth: 760,
                                            gap: 8,
                                            padding: '10px 16px',
                                            borderBottom: '1px solid #e5e7eb',
                                            background: '#f9fafb',
                                        }}
                                    >
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
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: beautyQueueMode ? '40px 10px 1fr 120px 64px 88px 80px' : '52px 10px 1fr 120px 64px 88px 80px',
                                                        minWidth: 760,
                                                        gap: 8,
                                                        padding: '11px 16px',
                                                        borderBottom: '1px solid #f3f4f6',
                                                        alignItems: 'center',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.08s',
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = '#faf9fd')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', fontFamily: beautyQueueMode ? 'inherit' : 'monospace', whiteSpace: 'nowrap' }}>
                                                        {beautyQueueMode ? rowIdx + 1 : (apt.appointment_time ?? apt.time ?? '--:--').slice(0, 5)}
                                                    </span>
                                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: apt.service_color ?? '#7c3aed', display: 'inline-block' }} />
                                                    <div style={{ minWidth: 0 }}>
                                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apt.customer_name ?? '—'}</p>
                                                        {customerPhoneLine(apt) ? (
                                                            <p style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customerPhoneLine(apt)}</p>
                                                        ) : null}
                                                        <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resolveServiceName(apt)}</p>
                                                        {(() => {
                                                            const productLabels = resolveAppointmentProductLabels(apt.id, apt.notes, aptProductLabels);
                                                            const custId = String(apt.customer_id ?? apt.client_id ?? '').trim();
                                                            const lastTreat = custId ? lastCustomerTreatments.get(custId) : undefined;
                                                            const lastShots = String(lastTreat?.treatment_shots ?? '').trim();
                                                            const lastDegree = String(lastTreat?.treatment_degree ?? '').trim();
                                                            if (!productLabels.length && !lastShots && !lastDegree) return null;
                                                            return (
                                                                <div style={{ marginTop: 4, lineHeight: 1.35 }}>
                                                                    {productLabels.length > 0 ? (
                                                                        <p style={{ fontSize: 10, color: '#0d9488', fontWeight: 600, margin: 0 }}>
                                                                            {tm('bAptCardProducts')}: {productLabels.join(', ')}
                                                                        </p>
                                                                    ) : null}
                                                                    {(lastShots || lastDegree) ? (
                                                                        <p style={{ fontSize: 10, color: '#7c3aed', fontWeight: 600, margin: productLabels.length ? '2px 0 0' : 0 }}>
                                                                            {tm('bAptCardLastTreatment')}
                                                                            {lastShots ? ` · ${tm('bReceiptTreatmentShots')}: ${lastShots}` : ''}
                                                                            {lastDegree ? ` · ${tm('bReceiptTreatmentDegree')}: ${lastDegree}` : ''}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                            );
                                                        })()}
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
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{apt.specialist_name ?? '—'}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                                        <Clock size={10} /><span style={{ fontSize: 11, fontWeight: 600 }}>{apt.duration}{tm('bDkSuffix')}</span>
                                                    </div>
                                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#111827', textAlign: 'right', whiteSpace: 'nowrap' }}>{(apt.total_price ?? 0) > 0 ? formatMoneyAmount(apt.total_price ?? 0, { minFrac: 0, maxFrac: 0 }) : '—'}</span>
                                                </div>
                                            );
                                        })
                                    }
                                </div>
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
                        style={{
                            width: 'min(100vw, 520px)',
                            height: '100%',
                            background: '#fff',
                            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f7f6fb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <p style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>{selectedApt.customer_name ?? '—'}</p>
                                <p style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{resolveServiceName(selectedApt)} · {(selectedApt.appointment_time ?? selectedApt.time ?? '').slice(0, 5)}</p>
                            </div>
                            <button onClick={() => setSelectedApt(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                gap: 8,
                                padding: '10px 20px 12px',
                                borderBottom: '1px solid #e5e7eb',
                                background: '#fafafa',
                                flexShrink: 0,
                            }}
                        >
                            {(['summary', 'clinical'] as const).map(tab => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setAptDetailTab(tab)}
                                    style={{
                                        flex: 1,
                                        padding: '8px 10px',
                                        borderRadius: 8,
                                        border: aptDetailTab === tab ? '1px solid #6366f1' : '1px solid #e5e7eb',
                                        background: aptDetailTab === tab ? '#eef2ff' : '#fff',
                                        color: aptDetailTab === tab ? '#312e81' : '#6b7280',
                                        fontSize: 12,
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {tab === 'summary' ? tm('bPanelTabSummary') : tm('bPanelTabClinical')}
                                </button>
                            ))}
                        </div>
                        <div
                            style={{ padding: aptDetailTab === 'clinical' ? 12 : 20, flex: 1, minHeight: 0, overflowY: 'auto' }}
                            className="custom-scrollbar"
                        >
                            {aptDetailTab === 'clinical' ? (
                                <ClinicDetailClinicalEmbed
                                    appointment={{ id: selectedApt.id, clinical_data: selectedApt.clinical_data }}
                                />
                            ) : (
                                <>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{tm('bPanelOperationDetails')}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 14 }}>
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
                                                <div key={label} style={{ background: '#fff', border: '1px solid #eceff3', borderRadius: 8, padding: '8px 10px' }}>
                                                    <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
                                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{value}</div>
                                                </div>
                                            ))}
                                        </>
                                    );
                                })()}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 14 }}>
                                {[
                                    { label: tm('bSpecialist'),    value: selectedApt.specialist_name ?? selectedApt.staff_name ?? '—' },
                                    { label: tm('bDuration'),      value: `${selectedApt.duration ?? 30}${tm('bDkSuffix')}` },
                                    { label: tm('bDeviceView'),    value: selectedApt.device_name ?? '—' },
                                    { label: tm('bPriceHeader'),   value: (selectedApt.total_price ?? 0) > 0 ? formatMoneyAmount(selectedApt.total_price!, { minFrac: 0, maxFrac: 0 }) : '—' },
                                ].map(({ label, value }) => (
                                    <div key={label} style={{ background: '#fff', border: '1px solid #eceff3', borderRadius: 8, padding: '8px 10px' }}>
                                        <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</p>
                                        <p style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{value}</p>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{tm('bPanelTreatmentFieldsTitle')}</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div>
                                        <label htmlFor="beauty-panel-treatment-duration" style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                                            {tm('bDuration')} ({tm('bDkSuffix')})
                                        </label>
                                        <input
                                            id="beauty-panel-treatment-duration"
                                            type="number"
                                            min={1}
                                            step={1}
                                            inputMode="numeric"
                                            value={treatmentDurationDraft}
                                            onChange={e => setTreatmentDurationDraft(e.target.value)}
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
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
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
                            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                                <label htmlFor="beauty-panel-apt-notes" style={{ fontSize: 10, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, display: 'block' }}>
                                    {tm('bNotes')}
                                </label>
                                <textarea
                                    id="beauty-panel-apt-notes"
                                    value={aptNotesDraft}
                                    onChange={e => setAptNotesDraft(e.target.value)}
                                    placeholder={tm('bAppointmentNotesPlaceholder')}
                                    rows={3}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        border: '1px solid #fcd34d',
                                        borderRadius: 6,
                                        padding: '8px 10px',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        color: '#0f172a',
                                        backgroundColor: '#ffffff',
                                        outline: 'none',
                                        resize: 'vertical',
                                        lineHeight: 1.45,
                                        touchAction: 'auto',
                                        WebkitUserSelect: 'text',
                                        userSelect: 'text',
                                    }}
                                    onPointerDown={e => e.stopPropagation()}
                                    onClick={e => e.stopPropagation()}
                                />
                                <button
                                    type="button"
                                    onClick={() => void saveAptNotesFromPanel()}
                                    disabled={aptNotesSaving}
                                    style={{
                                        width: '100%',
                                        height: 34,
                                        marginTop: 8,
                                        borderRadius: 6,
                                        border: '1px solid #fbbf24',
                                        background: '#fef3c7',
                                        color: '#92400e',
                                        fontSize: 12,
                                        fontWeight: 800,
                                        cursor: aptNotesSaving ? 'wait' : 'pointer',
                                    }}
                                >
                                    {aptNotesSaving ? tm('bSaving') : tm('save')}
                                </button>
                            </div>
                            <div style={{ marginBottom: 10 }}>
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
                                                    width: '100%', padding: '9px 14px', borderRadius: 6,
                                                    background: isCurrent ? opt.bg : '#fff',
                                                    border: isCurrent ? `1px solid ${opt.color}33` : '1px solid #eceff3',
                                                    color: isCurrent ? opt.color : '#6b7280',
                                                    fontSize: 12, fontWeight: 700, cursor: isCurrent ? 'default' : 'pointer',
                                                    textAlign: 'left',
                                                    outline: 'none',
                                                    transition: 'all 0.1s',
                                                }}
                                            >
                                                {isCurrent ? `● ${opt.label} (${tm('bCurrentLabel')})` : opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                                </>
                            )}
                        </div>
                        {!isBeautyAppointmentDone(selectedApt) ? (
                            <div
                                style={{
                                    padding: '12px 20px 16px',
                                    borderTop: '1px solid #e5e7eb',
                                    background: '#fafafa',
                                    flexShrink: 0,
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
                                    {tm('bCardOpenInPos')}
                                </button>
                            </div>
                        ) : null}
                        {(() => {
                            const done =
                                appointmentStatusMatches(selectedApt.status, AppointmentStatus.COMPLETED);
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
                                        {tm('bCardOpenInPos')}
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

            <FollowUpReminderActionModal
                open={followUpActionTarget != null}
                reminder={followUpActionTarget}
                onClose={() => setFollowUpActionTarget(null)}
                onSaved={() => void reloadFollowUpReminders()}
                onWhatsApp={
                    followUpActionTarget
                        ? () => void handleFollowUpWhatsApp(followUpActionTarget)
                        : undefined
                }
                labels={{
                    title: tm('bFollowUpModalTitle'),
                    status: tm('bFollowUpStatusLabel'),
                    statusDue: tm('bFollowUpStatusDue'),
                    statusPostponed: tm('bFollowUpStatusPostponed'),
                    statusContacted: tm('bFollowUpStatusContacted'),
                    statusOther: tm('bFollowUpStatusOther'),
                    statusDismissed: tm('bFollowUpStatusDismissed'),
                    note: tm('bFollowUpNoteLabel'),
                    notePlaceholder: tm('bFollowUpNotePlaceholder'),
                    postponeDate: tm('bFollowUpPostponeDate'),
                    naturalDueLabel: tm('bFollowUpNaturalDueLabel'),
                    showNaturalWhenPostponed: tm('bFollowUpShowNaturalWhenPostponed'),
                    showNaturalWhenPostponedHint: tm('bFollowUpShowNaturalWhenPostponedHint'),
                    cancel: tm('bFollowUpModalCancel'),
                    save: tm('bFollowUpModalSave'),
                    saving: tm('bFollowUpModalSaving'),
                    whatsApp: tm('bFollowUpModalWhatsApp'),
                }}
            />

            <FollowUpMesajBildirimModal
                open={showMesajBildirim}
                onClose={() => setShowMesajBildirim(false)}
                followUpReminders={followUpReminders}
                dateStart={serviceBoardRange.start}
                dateEnd={serviceBoardRange.end}
                title={tm('bFollowUpMesajBildirim')}
            />

            <WhatsAppBulkSendPreviewModal
                open={followUpBulkPreviewOpen}
                items={followUpBulkPreviewItems}
                title={
                    followUpSinglePreviewTitle ||
                    tm('bFollowUpBulkWhatsApp').replace('{n}', String(followUpBulkPreviewItems.length))
                }
                onClose={() => {
                    setFollowUpBulkPreviewOpen(false);
                    setFollowUpSinglePreviewTitle('');
                    setFollowUpPreviewReminder(null);
                }}
                onRebuildItems={async (lang) => {
                    if (followUpPreviewReminder) {
                        return buildFollowUpBulkPreviewList([followUpPreviewReminder], { lang });
                    }
                    return buildFollowUpBulkPreviewList(followUpReminders, { lang });
                }}
            />
        </div>
    );
}
