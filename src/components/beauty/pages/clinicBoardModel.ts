import type { BeautyAppointment, BeautySpecialist } from '../../../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd, getWeekRangeLocal } from '../../../utils/dateLocal';
import { beautyAptVisibleOnSchedule } from '../../../utils/beautyAppointmentVisibility';

/** Mevcut klinik kabuğuna eklenen tek sekme. Eski sekmelerin kimliği değişmez. */
export const CLINIC_BOARD_SHELL_TAB_ID = 'clinic_board';
export const CLINIC_BOARD_SHELL_LABEL_KEY = 'bClinicBoardNav';

export const CLINIC_BOARD_MENU = [
    { id: 'appointment', labelKey: 'bClinicBoardMenuAppt' },
    { id: 'customer', labelKey: 'bClinicBoardMenuCustomer' },
    { id: 'staff', labelKey: 'bClinicBoardMenuStaff' },
    { id: 'service', labelKey: 'bClinicBoardMenuService' },
] as const;

export type ClinicBoardSection = (typeof CLINIC_BOARD_MENU)[number]['id'];

export const CLINIC_BOARD_UNASSIGNED_ID = 'clinic-board-unassigned';
export const CLINIC_BOARD_DAY_START_MIN = 8 * 60;
export const CLINIC_BOARD_DAY_END_MIN = 20 * 60;
export const CLINIC_BOARD_SLOT_MIN = 30;
export const CLINIC_BOARD_ROW_PX = 36;

export type ClinicBoardBlockModel = {
    id: string;
    customerName: string;
    serviceName: string;
    /** Randevu satırındaki API tutarı. Ciro formülü burada yok. */
    totalPrice: number;
    startMin: number;
    endMin: number;
    color: string;
    lane: number;
    laneCount: number;
};

export type ClinicBoardColumnModel = {
    id: string;
    name: string;
    unassigned: boolean;
    appointmentCount: number;
    emptySlotCount: number;
    blocks: ClinicBoardBlockModel[];
};

const FALLBACK_COLOR = '#3b82f6';

export function clinicBoardHourLabels(): string[] {
    const labels: string[] = [];
    for (let m = CLINIC_BOARD_DAY_START_MIN; m < CLINIC_BOARD_DAY_END_MIN; m += CLINIC_BOARD_SLOT_MIN) {
        labels.push(formatBoardMinutes(m));
    }
    return labels;
}

export function clinicBoardSideOpen(surveyOn: boolean, crmOn: boolean): boolean {
    return surveyOn || crmOn;
}

export function parseClinicBoardYmd(ymd: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!match) return new Date();
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function shiftClinicBoardYmd(ymd: string, days: number): string {
    const date = parseClinicBoardYmd(ymd);
    date.setDate(date.getDate() + days);
    return formatLocalYmd(date);
}

export function clinicBoardWeekYmds(anchorYmd: string): string[] {
    const { start } = getWeekRangeLocal(parseClinicBoardYmd(anchorYmd));
    const days: string[] = [];
    let cursor = start;
    for (let i = 0; i < 7; i += 1) {
        days.push(cursor);
        cursor = shiftClinicBoardYmd(cursor, 1);
    }
    return days;
}

export function formatBoardMinutes(total: number): string {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseMinutes(raw: string | undefined): number | null {
    if (!raw) return null;
    const match = raw.trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const h = Number(match[1]);
    const min = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    return h * 60 + min;
}

function staffKey(apt: BeautyAppointment): string {
    return String(apt.specialist_id || apt.staff_id || '').trim();
}

function assignLanes(items: { startMin: number; endMin: number }[]): { lane: number; laneCount: number }[] {
    const order = items.map((item, index) => ({ item, index }));
    order.sort((a, b) => a.item.startMin - b.item.startMin || a.item.endMin - b.item.endMin);
    const laneEnds: number[] = [];
    const lanes = new Array(items.length).fill(0);
    for (const entry of order) {
        let lane = laneEnds.findIndex((end) => entry.item.startMin >= end);
        if (lane < 0) {
            lane = laneEnds.length;
            laneEnds.push(entry.item.endMin);
        } else {
            laneEnds[lane] = entry.item.endMin;
        }
        lanes[entry.index] = lane;
    }
    const laneCount = Math.max(1, laneEnds.length);
    return lanes.map((lane) => ({ lane, laneCount }));
}

function emptySlotCount(blocks: { startMin: number; endMin: number }[]): number {
    let occupied = 0;
    for (let slot = CLINIC_BOARD_DAY_START_MIN; slot < CLINIC_BOARD_DAY_END_MIN; slot += CLINIC_BOARD_SLOT_MIN) {
        const hit = blocks.some((block) => block.startMin < slot + CLINIC_BOARD_SLOT_MIN && block.endMin > slot);
        if (hit) occupied += 1;
    }
    return clinicBoardHourLabels().length - occupied;
}

export function buildClinicBoardColumns(input: {
    staff: BeautySpecialist[];
    appointments: BeautyAppointment[];
    dayYmd: string;
    staffFilterId?: string;
    unassignedName: string;
}): ClinicBoardColumnModel[] {
    const dayApts = input.appointments.filter(
        (apt) => beautyAppointmentDateKey(apt) === input.dayYmd && beautyAptVisibleOnSchedule(apt),
    );
    const filterId = input.staffFilterId?.trim() ?? '';
    const active = input.staff.filter((person) => person.is_active !== false);
    const byId = new Map(input.staff.map((person) => [person.id, person]));

    const columns: { id: string; name: string; color?: string; unassigned: boolean }[] = [];
    if (filterId) {
        const person = byId.get(filterId);
        columns.push({
            id: filterId,
            name: person?.name?.trim() || filterId,
            color: person?.color,
            unassigned: false,
        });
    } else {
        const seen = new Set<string>();
        const ordered = [...active].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
        for (const person of ordered) {
            if (seen.has(person.id)) continue;
            seen.add(person.id);
            columns.push({
                id: person.id,
                name: person.name,
                color: person.color,
                unassigned: false,
            });
        }
        for (const apt of dayApts) {
            const key = staffKey(apt);
            if (!key || seen.has(key)) continue;
            const person = byId.get(key);
            if (!person) continue;
            seen.add(key);
            columns.push({ id: person.id, name: person.name, color: person.color, unassigned: false });
        }
    }

    const known = new Set(columns.map((column) => column.id));
    const hasUnassigned = dayApts.some((apt) => {
        const key = staffKey(apt);
        return !key || !known.has(key);
    });
    if (!filterId && (columns.length === 0 || hasUnassigned)) {
        columns.push({
            id: CLINIC_BOARD_UNASSIGNED_ID,
            name: input.unassignedName,
            unassigned: true,
        });
    }

    return columns.map((column) => {
        const mine = dayApts.filter((apt) => {
            const key = staffKey(apt);
            if (column.unassigned) return !key || !known.has(key);
            return key === column.id;
        });
        const drafts = mine.flatMap((apt) => {
            const startRaw = parseMinutes(apt.appointment_time || apt.time);
            if (startRaw === null) return [];
            const duration = Math.max(15, Number(apt.duration) || 30);
            let startMin = startRaw;
            let endMin = startRaw + duration;
            if (endMin <= CLINIC_BOARD_DAY_START_MIN || startMin >= CLINIC_BOARD_DAY_END_MIN) return [];
            startMin = Math.max(startMin, CLINIC_BOARD_DAY_START_MIN);
            endMin = Math.min(endMin, CLINIC_BOARD_DAY_END_MIN);
            const price = Number(apt.total_price);
            return [{
                id: apt.id,
                customerName: (apt.customer_name || '').trim(),
                serviceName: (apt.service_name || '').trim(),
                totalPrice: Number.isFinite(price) ? price : 0,
                startMin,
                endMin,
                color: (apt.service_color || column.color || FALLBACK_COLOR).trim() || FALLBACK_COLOR,
            }];
        });
        const lanes = assignLanes(drafts);
        const blocks: ClinicBoardBlockModel[] = drafts.map((draft, index) => ({
            ...draft,
            lane: lanes[index]?.lane ?? 0,
            laneCount: lanes[index]?.laneCount ?? 1,
        }));
        return {
            id: column.id,
            name: column.name,
            unassigned: column.unassigned,
            appointmentCount: blocks.length,
            emptySlotCount: emptySlotCount(blocks),
            blocks,
        };
    });
}
