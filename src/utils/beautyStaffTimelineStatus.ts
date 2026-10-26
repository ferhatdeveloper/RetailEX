/**
 * Personel takvimi kutu rengi. Her randevunun kendi durumu boyanır; müşteri adı toplu renk vermez.
 * Hex değerler SmartScheduler STATUS_CFG ile aynıdır. Bekleyen zemin, takvimdeki mevcut liladır.
 */
import type { AppointmentStatus, BeautyAppointment } from '../types/beauty';
import {
    groupBeautyBoardAppointmentLines,
    mergeQueueGroupForCardDisplay,
    sortBeautyAppointmentsQueue,
} from './beautyQueueOrder';

export type BeautyStaffTimelineToneKind =
    | 'completed'
    | 'cancelled'
    | 'no_show'
    | 'in_progress'
    | 'confirmed'
    | 'waiting';

export interface BeautyStaffTimelineBoxTone {
    kind: BeautyStaffTimelineToneKind;
    /** Kart zemini */
    background: string;
    /** Etiket ve durum şeridi */
    accent: string;
    labelKey: string;
    /** Türkçe yedek */
    label: string;
    className: string;
    completed: boolean;
}

const COMPLETED: BeautyStaffTimelineBoxTone = {
    kind: 'completed',
    background: '#d1fae5',
    accent: '#059669',
    labelKey: 'bAptStatusCompleted',
    label: 'Tamamlandı',
    className: 'beauty-staff-apt beauty-staff-apt--completed beauty-staff-apt--green',
    completed: true,
};

const CANCELLED: BeautyStaffTimelineBoxTone = {
    kind: 'cancelled',
    background: '#fee2e2',
    accent: '#dc2626',
    labelKey: 'bAptStatusCancelled',
    label: 'İptal',
    className: 'beauty-staff-apt beauty-staff-apt--cancelled',
    completed: false,
};

const NO_SHOW: BeautyStaffTimelineBoxTone = {
    kind: 'no_show',
    background: '#f3f4f6',
    accent: '#9ca3af',
    labelKey: 'bAppointmentNoShow',
    label: 'Gelmedi',
    className: 'beauty-staff-apt beauty-staff-apt--no-show',
    completed: false,
};

const IN_PROGRESS: BeautyStaffTimelineBoxTone = {
    kind: 'in_progress',
    background: '#fef3c7',
    accent: '#d97706',
    labelKey: 'bAppointmentStarted',
    label: 'Başladı',
    className: 'beauty-staff-apt beauty-staff-apt--started',
    completed: false,
};

const CONFIRMED: BeautyStaffTimelineBoxTone = {
    kind: 'confirmed',
    background: '#e0f2fe',
    accent: '#0284c7',
    labelKey: 'bAppointmentConfirmed',
    label: 'Onaylandı',
    className: 'beauty-staff-apt beauty-staff-apt--confirmed',
    completed: false,
};

const WAITING: BeautyStaffTimelineBoxTone = {
    kind: 'waiting',
    background: '#ede9fe',
    accent: '#7c3aed',
    labelKey: 'bAptStatusWaiting',
    label: 'Bekliyor',
    className: 'beauty-staff-apt beauty-staff-apt--waiting',
    completed: false,
};

function statusKey(status: AppointmentStatus | string | null | undefined): string {
    if (status == null) return '';
    return String(status).trim().toLowerCase();
}

/** Randevu kutusunun zemini ve sağ üst etiketi. Müşteri alanına bakmaz. */
export function beautyStaffTimelineBoxTone(
    status: AppointmentStatus | string | null | undefined,
): BeautyStaffTimelineBoxTone {
    const key = statusKey(status);
    if (key === 'completed' || key === 'closed') return COMPLETED;
    if (key === 'cancelled' || key === 'canceled') return CANCELLED;
    if (key === 'no_show' || key === 'noshow') return NO_SHOW;
    if (key === 'in_progress') return IN_PROGRESS;
    if (key === 'confirmed') return CONFIRMED;
    return WAITING;
}

export function staffTimelineStatusLabel(
    tone: BeautyStaffTimelineBoxTone,
    translate?: (key: string) => string,
): string {
    if (!translate) return tone.label;
    const value = translate(tone.labelKey);
    if (!value || value === tone.labelKey) return tone.label;
    return value;
}

/**
 * Personel saat ızgarası kartları.
 * Aynı durumdaki ziyaret satırları tek kartta kalır.
 * Durumlar farklıysa satırlar ayrılır; her kutu kendi rengini alır.
 */
export function staffTimelineAppointmentCards(
    appointments: BeautyAppointment[],
    opts?: { mergeConsecutiveSameCustomer?: boolean },
): BeautyAppointment[] {
    const groups = groupBeautyBoardAppointmentLines(appointments, opts);
    const cards = groups.flatMap((group) => {
        const kinds = new Set(group.map((apt) => beautyStaffTimelineBoxTone(apt.status).kind));
        if (kinds.size <= 1) return [mergeQueueGroupForCardDisplay(group)];
        return group;
    });
    return sortBeautyAppointmentsQueue(cards);
}
