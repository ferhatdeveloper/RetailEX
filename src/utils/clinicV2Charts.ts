/**
 * Klinik V2 pano grafikleri.
 *
 * Tutarlar randevu satırındaki `total_price` değeridir; katalog fiyatı,
 * iade veya peşinat formülü burada yeniden hesaplanmaz.
 * Randevu yoksa dilimler ve cirolar 0 kalır.
 */
import { AppointmentStatus } from '../types/beauty';
import type { BeautyAppointment, BeautySpecialist } from '../types/beauty';
import { beautyAptVisibleOnSchedule } from './beautyAppointmentVisibility';
import { computeClinicDayKpis } from './clinicDashboardStats';

/** Takvim ızgarasıyla aynı gün penceresi (08:00–20:00). */
export const CLINIC_V2_DAY_START_MIN = 8 * 60;
export const CLINIC_V2_DAY_END_MIN = 20 * 60;
export const CLINIC_V2_DAY_CAPACITY_MIN = CLINIC_V2_DAY_END_MIN - CLINIC_V2_DAY_START_MIN;

export const CLINIC_V2_UNASSIGNED_ID = 'unassigned';

export interface ClinicV2StatusSlice {
    key: 'completed' | 'pending' | 'cancelled';
    count: number;
}

export interface ClinicV2ServiceRevenueRow {
    name: string;
    /** Randevu `total_price` toplamı — API tutarı olduğu gibi. */
    amount: number;
}

export interface ClinicV2StaffColumn {
    id: string;
    name: string;
    color: string;
}

export interface ClinicV2DayBlock {
    id: string;
    staffId: string;
    customerName: string;
    serviceName: string;
    startMin: number;
    durationMin: number;
    status: string;
    price: number;
}

export interface ClinicV2StaffOccupancyRow {
    id: string;
    name: string;
    bookedMin: number;
    capacityMin: number;
    rate: number;
}

export interface ClinicV2ViewModel {
    status: ClinicV2StatusSlice[];
    serviceRevenue: ClinicV2ServiceRevenueRow[];
    staffOccupancy: ClinicV2StaffOccupancyRow[];
    /** Aktif personel kapasitesine göre bugünkü doluluk (0–100+). */
    occupancyRate: number;
    dayStartMin: number;
    dayEndMin: number;
    dayStaff: ClinicV2StaffColumn[];
    blocks: ClinicV2DayBlock[];
}

type StaffRef = Pick<BeautySpecialist, 'id' | 'name' | 'is_active' | 'color'>;

function finiteNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

export function parseClinicClockMinutes(raw: unknown): number | null {
    const m = String(raw ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
}

function staffIdOf(apt: BeautyAppointment): string {
    const id = String(apt.specialist_id ?? apt.staff_id ?? '').trim();
    return id || CLINIC_V2_UNASSIGNED_ID;
}

function serviceLabel(apt: BeautyAppointment): string {
    const name = String(apt.service_name ?? '').trim();
    return name || '—';
}

export function buildClinicV2View(input: {
    appointments: BeautyAppointment[];
    specialists: StaffRef[];
    todayStr: string;
    dateKeyOf: (a: BeautyAppointment) => string;
    unassignedLabel: string;
}): ClinicV2ViewModel {
    const appointments = Array.isArray(input.appointments) ? input.appointments : [];
    const specialists = Array.isArray(input.specialists) ? input.specialists : [];
    const kpis = computeClinicDayKpis({
        appointments,
        todayStr: input.todayStr,
        dateKeyOf: input.dateKeyOf,
    });
    const todayVisible = kpis.todayApts;

    const revenueMap = new Map<string, number>();
    for (const apt of todayVisible) {
        const name = serviceLabel(apt);
        const price = finiteNumber(apt.total_price);
        revenueMap.set(name, (revenueMap.get(name) ?? 0) + price);
    }
    const serviceRevenue = Array.from(revenueMap.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'tr'));

    const byId = new Map(specialists.map((s) => [s.id, s]));
    const columnIds: string[] = [];
    const pushColumn = (id: string) => {
        if (!columnIds.includes(id)) columnIds.push(id);
    };
    const active = specialists
        .filter((s) => s.is_active)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    for (const s of active) pushColumn(s.id);

    for (const apt of todayVisible) {
        const id = staffIdOf(apt);
        if (id === CLINIC_V2_UNASSIGNED_ID) {
            pushColumn(id);
            continue;
        }
        if (!byId.has(id)) pushColumn(id);
        else if (!columnIds.includes(id)) pushColumn(id);
    }

    const dayStaff: ClinicV2StaffColumn[] = columnIds.map((id) => {
        if (id === CLINIC_V2_UNASSIGNED_ID) {
            return { id, name: input.unassignedLabel, color: '#db2777' };
        }
        const spec = byId.get(id);
        const sample = todayVisible.find((a) => staffIdOf(a) === id);
        const name =
            spec?.name?.trim() ||
            String(sample?.specialist_name ?? sample?.staff_name ?? '').trim() ||
            '—';
        return { id, name, color: spec?.color || '#db2777' };
    });

    const blocks: ClinicV2DayBlock[] = [];
    const bookedByStaff = new Map<string, number>();
    let dayStartMin = CLINIC_V2_DAY_START_MIN;
    let dayEndMin = CLINIC_V2_DAY_END_MIN;

    for (const apt of todayVisible) {
        const staffId = staffIdOf(apt);
        const durationMin = Math.max(0, finiteNumber(apt.duration));
        bookedByStaff.set(staffId, (bookedByStaff.get(staffId) ?? 0) + durationMin);
        const startMin = parseClinicClockMinutes(apt.appointment_time ?? apt.time);
        if (startMin == null) continue;
        const endMin = startMin + Math.max(durationMin, 0);
        if (startMin < dayStartMin) dayStartMin = Math.floor(startMin / 60) * 60;
        if (endMin > dayEndMin) dayEndMin = Math.ceil(endMin / 60) * 60;
        blocks.push({
            id: apt.id,
            staffId,
            customerName: String(apt.customer_name ?? '').trim(),
            serviceName: serviceLabel(apt),
            startMin,
            durationMin,
            status: String(apt.status ?? AppointmentStatus.SCHEDULED),
            price: finiteNumber(apt.total_price),
        });
    }

    if (dayEndMin <= dayStartMin) dayEndMin = dayStartMin + 60;

    const capacityMin = Math.max(60, dayEndMin - dayStartMin);
    const staffOccupancy: ClinicV2StaffOccupancyRow[] = dayStaff.map((col) => {
        const bookedMin = bookedByStaff.get(col.id) ?? 0;
        const rate = capacityMin > 0 ? Math.round((bookedMin / capacityMin) * 100) : 0;
        return { id: col.id, name: col.name, bookedMin, capacityMin, rate };
    });

    const columnCount = dayStaff.length;
    const bookedTotal = staffOccupancy.reduce((s, row) => s + row.bookedMin, 0);
    const occupancyRate =
        columnCount > 0 && capacityMin > 0
            ? Math.round((bookedTotal / (columnCount * capacityMin)) * 100)
            : 0;

    return {
        status: [
            { key: 'completed', count: kpis.completed },
            { key: 'pending', count: kpis.pending },
            { key: 'cancelled', count: kpis.cancelled },
        ],
        serviceRevenue,
        staffOccupancy,
        occupancyRate,
        dayStartMin,
        dayEndMin,
        dayStaff,
        blocks,
    };
}
