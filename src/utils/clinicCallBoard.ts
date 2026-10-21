import { AppointmentStatus, type BeautyAppointment } from '../types/beauty';
import { beautyAppointmentDateKey, formatLocalYmd, getMonthRangeLocal, getWeekRangeLocal } from './dateLocal';

/** V1 klinik paneli arama sekmeleri. */
export type ClinicCallTab = 'today' | 'tomorrow' | 'week' | 'month' | 'range';

/**
 * V1 `ClinicDashboard` arama panosunun tarih aralığı.
 * Bileşendeki eski hesap buraya alındı; ekranlar aynı fonksiyonu çağırır.
 */
export function clinicCallBoardBounds(input: {
    tab: ClinicCallTab;
    now: Date;
    monthOffset: number;
    rangeFrom: string;
    rangeTo: string;
}): { start: string; end: string } {
    const { tab, now, monthOffset, rangeFrom, rangeTo } = input;
    const today = formatLocalYmd(now);
    let start = today;
    let end = today;
    if (tab === 'tomorrow') {
        const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        start = formatLocalYmd(t);
        end = start;
    } else if (tab === 'week') {
        const w = getWeekRangeLocal(now);
        start = w.start;
        end = w.end;
    } else if (tab === 'month') {
        const anchor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
        const m = getMonthRangeLocal(anchor);
        start = m.start;
        end = m.end;
    } else if (tab === 'range') {
        let a = (rangeFrom || today).trim();
        let b = (rangeTo || today).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a)) a = today;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) b = today;
        if (a > b) {
            const swap = a;
            a = b;
            b = swap;
        }
        start = a;
        end = b;
    }
    return { start, end };
}

/**
 * Arama panosu satırları: planlı, onaylı ve devam eden randevular.
 * `beautyService.getAppointmentsInRange` sonucuna uygulanır.
 */
export function selectClinicCallBoardRows(rows: BeautyAppointment[] | null | undefined): BeautyAppointment[] {
    const need = (Array.isArray(rows) ? rows : []).filter((a) =>
        a.status === AppointmentStatus.SCHEDULED ||
        a.status === AppointmentStatus.CONFIRMED ||
        a.status === AppointmentStatus.IN_PROGRESS,
    );
    need.sort((a, b) => {
        const da = beautyAppointmentDateKey(a).localeCompare(beautyAppointmentDateKey(b));
        if (da !== 0) return da;
        return (a.appointment_time ?? a.time ?? '').localeCompare(b.appointment_time ?? b.time ?? '');
    });
    return need;
}

/** Hizmet ve cihaz seçimleri. Boş değer tüm kayıtları bırakır. */
export function filterClinicCallBoardRows(
    rows: BeautyAppointment[],
    serviceId: string,
    deviceId: string,
): BeautyAppointment[] {
    return (Array.isArray(rows) ? rows : []).filter((a) => {
        if (serviceId && String(a.service_id ?? '') !== String(serviceId)) return false;
        if (deviceId && String(a.device_id ?? '') !== String(deviceId)) return false;
        return true;
    });
}

export function groupClinicCallBoardByService(rows: BeautyAppointment[]): Array<{
    serviceName: string;
    items: BeautyAppointment[];
    sum: number;
}> {
    const map = new Map<string, BeautyAppointment[]>();
    for (const a of rows) {
        const name = (a.service_name && String(a.service_name).trim()) || '—';
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(a);
    }
    for (const arr of map.values()) {
        arr.sort((x, y) => {
            const dx = beautyAppointmentDateKey(x).localeCompare(beautyAppointmentDateKey(y));
            if (dx !== 0) return dx;
            return String(x.appointment_time ?? x.time ?? '').localeCompare(
                String(y.appointment_time ?? y.time ?? ''),
            );
        });
    }
    return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
        .map(([serviceName, items]) => ({
            serviceName,
            items,
            sum: items.reduce((s, it) => s + Number(it.total_price ?? 0), 0),
        }));
}
