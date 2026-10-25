import type { BeautyAppointment } from '../types/beauty';
import { beautyAppointmentDateKey } from './dateLocal';

/** Sıra modu: önce randevu saatine göre kronolojik, yoksa oluşturulma zamanı, yoksa id. */
export function compareBeautyQueueOrder(a: BeautyAppointment, b: BeautyAppointment): number {
    // 1) Birincil anahtar: randevu saati (HH:MM → dakika tuple).
    const ta = parseHhmmToMin(a.appointment_time ?? a.time);
    const tb = parseHhmmToMin(b.appointment_time ?? b.time);
    const aHas = ta !== null;
    const bHas = tb !== null;
    if (aHas && bHas && ta !== tb) return (ta as number) - (tb as number);
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;

    // 2) Saat yoksa/aynıysa → oluşturulma zamanına göre fallback.
    const ca = a.created_at?.trim();
    const cb = b.created_at?.trim();
    if (ca && cb) {
        const c = ca.localeCompare(cb);
        if (c !== 0) return c;
    } else if (ca && !cb) return -1;
    else if (!ca && cb) return 1;

    // 3) Son çare: id.
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
    const sorted = sortBeautyAppointmentsQueue(group);
    const base: BeautyAppointment = { ...sorted[0] };
    const services = [...new Set(sorted.map(g => (g.service_name ?? '').trim()).filter(Boolean))];
    base.service_name = services.join(' · ');
    base.total_price = sorted.reduce((s, g) => s + Number(g.total_price ?? 0), 0);
    // Peşinat ilk satırda durur; toplamada ikiye katlanmasın.
    base.deposit_amount = Math.max(0, ...sorted.map((g) => Number(g.deposit_amount) || 0));
    const groupId = sorted.map((g) => String(g.sale_group_id ?? '').trim()).find((id) => id.length > 0);
    if (groupId) base.sale_group_id = groupId;

    const starts = sorted
        .map((g) => parseHhmmToMin(g.appointment_time ?? g.time))
        .filter((n): n is number => n != null);
    const ends = sorted
        .map((g) => {
            const start = parseHhmmToMin(g.appointment_time ?? g.time);
            if (start == null) return null;
            return start + Math.max(1, Number(g.duration) || 30);
        })
        .filter((n): n is number => n != null);
    if (starts.length > 0 && ends.length > 0) {
        const mergedStart = Math.min(...starts);
        const mergedEnd = Math.max(...ends);
        const hhmm = formatMinToHhmm(mergedStart);
        base.appointment_time = hhmm;
        base.time = hhmm;
        base.duration = Math.max(1, mergedEnd - mergedStart);
    }
    return base;
}

/** Aynı POS / fatura ziyareti anahtarı (`sale_group_id`). */
export function beautyAppointmentSaleGroupKey(apt: BeautyAppointment): string {
    return String(apt.sale_group_id ?? '').trim();
}

function appointmentHasServiceInvoice(apt: BeautyAppointment): boolean {
    if (String(apt.remainder_sale_id ?? '').trim()) return true;
    if (String(apt.remainder_sale_fiche_no ?? '').trim()) return true;
    return false;
}

function appointmentSpanEnd(lines: BeautyAppointment[]): number | null {
    let end: number | null = null;
    for (const line of lines) {
        const start = parseHhmmToMin(line.appointment_time ?? line.time);
        if (start === null) continue;
        const lineEnd = start + Math.max(1, Number(line.duration) || 30);
        if (end === null || lineEnd > end) end = lineEnd;
    }
    return end;
}

/**
 * Ardışık aynı müşteri satırlarını özgün satır gruplarında tutar.
 * `requireOpenInvoice` açıkken hizmet faturası olan satır yeni gruba girmez.
 * Farklı `sale_group_id` bu fonksiyona gelmez; kimlik grupları ayrı kalır.
 */
function chainContiguousAppointmentLines(
    appointments: BeautyAppointment[],
    requireOpenInvoice: boolean,
): BeautyAppointment[][] {
    if (appointments.length === 0) return [];
    const sorted = sortBeautyAppointmentsQueue(appointments);
    const groups: BeautyAppointment[][] = [];
    for (const apt of sorted) {
        const start = parseHhmmToMin(apt.appointment_time ?? apt.time);
        const prev = groups[groups.length - 1];
        if (!prev || start === null) {
            groups.push([apt]);
            continue;
        }
        const anchor = sortBeautyAppointmentsQueue(prev)[0];
        const prevStart = parseHhmmToMin(anchor.appointment_time ?? anchor.time);
        const prevEnd = appointmentSpanEnd(prev);
        if (prevStart === null || prevEnd === null) {
            groups.push([apt]);
            continue;
        }
        const sameCustomer = customerQueueGroupKey(anchor) === customerQueueGroupKey(apt);
        const isContiguous = start <= prevEnd;
        const invoiceOk =
            !requireOpenInvoice ||
            (!appointmentHasServiceInvoice(anchor) && !appointmentHasServiceInvoice(apt));
        if (!sameCustomer || !isContiguous || !invoiceOk) {
            groups.push([apt]);
            continue;
        }
        prev.push(apt);
    }
    return groups;
}

function chainContiguousAppointmentGroups(
    groups: BeautyAppointment[][],
    requireOpenInvoice: boolean,
): BeautyAppointment[][] {
    const sorted = [...groups].sort((a, b) =>
        compareBeautyQueueOrder(
            sortBeautyAppointmentsQueue(a)[0],
            sortBeautyAppointmentsQueue(b)[0],
        ),
    );
    const out: BeautyAppointment[][] = [];
    for (const group of sorted) {
        const lines = sortBeautyAppointmentsQueue(group);
        const anchor = lines[0];
        const start = parseHhmmToMin(anchor.appointment_time ?? anchor.time);
        const prev = out[out.length - 1];
        if (!prev || start === null) {
            out.push([...lines]);
            continue;
        }
        const prevAnchor = sortBeautyAppointmentsQueue(prev)[0];
        const prevStart = parseHhmmToMin(prevAnchor.appointment_time ?? prevAnchor.time);
        const prevEnd = appointmentSpanEnd(prev);
        if (prevStart === null || prevEnd === null) {
            out.push([...lines]);
            continue;
        }
        const sameCustomer = customerQueueGroupKey(prevAnchor) === customerQueueGroupKey(anchor);
        const isContiguous = start <= prevEnd;
        const invoiceOk =
            !requireOpenInvoice ||
            (!appointmentHasServiceInvoice(prevAnchor) && !appointmentHasServiceInvoice(anchor));
        if (!sameCustomer || !isContiguous || !invoiceOk) {
            out.push([...lines]);
            continue;
        }
        prev.push(...lines);
    }
    return out;
}

/**
 * Takvim kartıyla aynı ziyaret grupları. Her grup bir randevudur.
 * - Aynı `sale_group_id` tek gruptur (hizmet satırları ayrı randevu değildir).
 * - Kimlik yoksa ve hizmet faturası yoksa ardışık aynı müşteri tek gruptur.
 * - `mergeConsecutiveSameCustomer`: faturalı ardışık satırlar da birleşir.
 * - Aynı müşterinin aynı gündeki ayrı saati, kimlik farklıysa ayrı kalır.
 */
export function groupBeautyBoardAppointmentLines(
    appointments: BeautyAppointment[],
    opts?: { mergeConsecutiveSameCustomer?: boolean },
): BeautyAppointment[][] {
    if (!appointments.length) return [];
    const bySaleGroup = new Map<string, BeautyAppointment[]>();
    const ungrouped: BeautyAppointment[] = [];
    for (const apt of appointments) {
        const key = beautyAppointmentSaleGroupKey(apt);
        if (!key) {
            ungrouped.push(apt);
            continue;
        }
        const bucket = bySaleGroup.get(key) ?? [];
        bucket.push(apt);
        bySaleGroup.set(key, bucket);
    }

    const fromGroups = [...bySaleGroup.values()].map((group) => sortBeautyAppointmentsQueue(group));
    let fromUngrouped = chainContiguousAppointmentLines(ungrouped, true);
    if (opts?.mergeConsecutiveSameCustomer) {
        fromUngrouped = chainContiguousAppointmentGroups(fromUngrouped, false);
    }
    return [...fromGroups, ...fromUngrouped];
}

/**
 * Takvim kartı birleştirme (fatura bazlı).
 * - Aynı `sale_group_id` → tek kart (Kalem ayrı fatura açık olsa bile).
 * - Hizmet faturası yok + ardışık aynı müşteri → tek kart (ikinci fatura açılmadı).
 * - `mergeConsecutiveSameCustomer`: ek ardışık birleşim (sep kapalıyken).
 */
export function mergeBeautyAppointmentsForBoardDisplay(
    appointments: BeautyAppointment[],
    opts?: { mergeConsecutiveSameCustomer?: boolean },
): BeautyAppointment[] {
    return sortBeautyAppointmentsQueue(
        groupBeautyBoardAppointmentLines(appointments, opts).map((group) => mergeQueueGroupForCardDisplay(group)),
    );
}

/** Ardışık aynı müşteri kartlarını birleştir (sale_group yokken). */
export function mergeConsecutiveCustomerAppointments(appointments: BeautyAppointment[]): BeautyAppointment[] {
    if (appointments.length <= 1) return appointments;
    const sorted = sortBeautyAppointmentsQueue(appointments);
    const result: BeautyAppointment[] = [];
    for (const apt of sorted) {
        const start = parseHhmmToMin(apt.appointment_time ?? apt.time);
        if (start === null) {
            result.push(apt);
            continue;
        }
        const prev = result[result.length - 1];
        if (!prev) {
            result.push(apt);
            continue;
        }
        const prevStart = parseHhmmToMin(prev.appointment_time ?? prev.time);
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
        result[result.length - 1] = mergeQueueGroupForCardDisplay([prev, apt]);
    }
    return result;
}

/**
 * Sıra kartı kümesi: aynı gün + aynı müşteri; cihaz doluysa aynı cihaz,
 * cihaz boşsa aynı personel. Takvim saat kutularını birleştirmez.
 * POS açılış sepeti bu kümeyi kullanmaz; anahtar satış no veya hizmet fiş no
 * (`beautyPosOpening`). Saat, müşteri ve personel fişi birleştirmez.
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
