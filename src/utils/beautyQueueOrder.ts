import type { BeautyAppointment } from '../types/beauty';
import { beautyAppointmentDateKey } from './dateLocal';

/** Sıra modu: önce oluşturulma zamanı, yoksa randevu saati, yoksa id. */
export function compareBeautyQueueOrder(a: BeautyAppointment, b: BeautyAppointment): number {
    const ca = a.created_at?.trim();
    const cb = b.created_at?.trim();
    if (ca && cb) {
        const c = ca.localeCompare(cb);
        if (c !== 0) return c;
    } else if (ca && !cb) return -1;
    else if (!ca && cb) return 1;
    const ta = (a.appointment_time ?? a.time ?? '').localeCompare(b.appointment_time ?? b.time ?? '');
    if (ta !== 0) return ta;
    return String(a.id).localeCompare(String(b.id));
}

export function sortBeautyAppointmentsQueue(apps: BeautyAppointment[]): BeautyAppointment[] {
    return [...apps].sort(compareBeautyQueueOrder);
}

/** Aynı sıra sütununda aynı müşteriye ait kartları tek satırda birleştirmek için anahtar. */
export function customerQueueGroupKey(a: BeautyAppointment): string {
    const id = (a.client_id ?? a.customer_id ?? '').trim();
    if (id) return `id:${id}`;
    const n = (a.customer_name ?? '').trim().toLowerCase();
    if (n) return `name:${n}`;
    return `solo:${a.id}`;
}

/**
 * Sıra modunda: aynı müşteri (client_id / customer_id veya isim) için tek grup.
 * Gruplar, ilk randevunun kuyruk sırasına göre dizilir.
 */
export function groupBeautyQueueByCustomer(apts: BeautyAppointment[]): BeautyAppointment[][] {
    const sorted = sortBeautyAppointmentsQueue(apts);
    const order: string[] = [];
    const map = new Map<string, BeautyAppointment[]>();
    for (const apt of sorted) {
        const k = customerQueueGroupKey(apt);
        if (!map.has(k)) {
            map.set(k, []);
            order.push(k);
        }
        map.get(k)!.push(apt);
    }
    return order.map(k => map.get(k)!);
}

/** Takvim kartında göstermek: hizmet adlarını ve tutarı birleştir (ilk kayıt kimliği korunur). */
export function mergeQueueGroupForCardDisplay(group: BeautyAppointment[]): BeautyAppointment {
    if (group.length <= 1) return group[0];
    const base: BeautyAppointment = { ...group[0] };
    const services = [...new Set(group.map(g => (g.service_name ?? '').trim()).filter(Boolean))];
    base.service_name = services.join(' · ');
    base.total_price = group.reduce((s, g) => s + Number(g.total_price ?? 0), 0);
    return base;
}

/**
 * Takvimde birleşik sıra kartıyla aynı küme (POS sepetine tüm hizmetleri yüklemek için).
 * Aynı gün + aynı müşteri anahtarı; cihaz doluysa aynı cihaz, her iki tarafta cihaz boşsa aynı personel.
 */
export function findBeautyAppointmentsSameQueueGroup(
    primary: BeautyAppointment,
    candidates: BeautyAppointment[],
): BeautyAppointment[] {
    const dk = beautyAppointmentDateKey(primary);
    const ck = customerQueueGroupKey(primary);
    const pDev = String(primary.device_id ?? '').trim();
    const pStaff = String(primary.staff_id ?? primary.specialist_id ?? '').trim();

    const matched = candidates.filter((a) => {
        if (beautyAppointmentDateKey(a) !== dk || customerQueueGroupKey(a) !== ck) return false;
        const aDev = String(a.device_id ?? '').trim();
        const aStaff = String(a.staff_id ?? a.specialist_id ?? '').trim();
        if (pDev || aDev) return aDev === pDev;
        return aStaff === pStaff;
    });
    return sortBeautyAppointmentsQueue(matched);
}

function parseHhmmToMin(t: string | undefined): number | null {
    if (!t || !String(t).trim()) return null;
    const p = String(t).trim().split(':');
    const h = Number(p[0]);
    const m = Number(p[1] ?? 0);
    if (Number.isNaN(h)) return null;
    return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function formatMinToHhmm(total: number): string {
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export type QueuePrefillResource =
    | 'none'
    | { kind: 'staff'; id: string | null }
    | { kind: 'device'; id: string | null };

/**
 * Sıra modunda yeni randevu açılırken veritabanındaki `appointment_time` alanı yine dolar;
 * ekranda saat önemsiz olsa da çakışma kontrolleri / raporlar için anlamlı bir değer üretir:
 * aynı gün (+ istenirse aynı personel veya cihaz sütunu) için mevcut randevuların bitişinden sonraki dilim.
 */
export function suggestQueuePrefillTime(
    allAppointments: BeautyAppointment[],
    dateYmd: string,
    opts: {
        resource?: QueuePrefillResource;
        dayStartHour?: number;
        dayEndHour?: number;
        snapMinutes?: number;
    } = {}
): string {
    const dayStartHour = opts.dayStartHour ?? 9;
    const dayEndHour = opts.dayEndHour ?? 21;
    const snap = Math.max(1, opts.snapMinutes ?? 5);
    const dayStartMin = dayStartHour * 60;
    const dayEndMin = dayEndHour * 60;
    const resource: QueuePrefillResource = opts.resource ?? 'none';

    const subset = allAppointments.filter(a => {
        if (beautyAppointmentDateKey(a) !== dateYmd) return false;
        if (resource === 'none') return true;
        if (resource.kind === 'staff') {
            const sid = (a.staff_id ?? a.specialist_id ?? '').trim();
            if (resource.id === null) return !sid;
            return sid === String(resource.id);
        }
        const did = (a.device_id ?? '').trim();
        if (resource.id === null) return !did;
        return did === String(resource.id);
    });

    let maxEnd = dayStartMin;
    for (const apt of subset) {
        const start = parseHhmmToMin(apt.appointment_time ?? apt.time) ?? dayStartMin;
        const dur = Math.max(1, Number(apt.duration) || 30);
        maxEnd = Math.max(maxEnd, start + dur);
    }

    if (subset.length === 0) {
        return formatMinToHhmm(dayStartMin);
    }

    let next = Math.max(dayStartMin, Math.ceil(maxEnd / snap) * snap);
    if (next >= dayEndMin) {
        next = Math.max(dayStartMin, dayEndMin - snap);
    }
    return formatMinToHhmm(next);
}
