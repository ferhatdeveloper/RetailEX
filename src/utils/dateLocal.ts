/**
 * YYYY-MM-DD in the browser's local timezone (avoids UTC midnight shifting the calendar day).
 */
export function formatLocalYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Güzellik randevu satırından YYYY-MM-DD anahtarı (ISO datetime veya PG date string ile uyumlu).
 * Tüm takvim görünümlerinde aynı filtreyi kullanmak için.
 */
export function beautyAppointmentDateKey(apt: {
    date?: string;
    appointment_date?: string;
} | null | undefined): string {
    const raw = String(apt?.date ?? apt?.appointment_date ?? '').trim();
    if (!raw) return '';
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : raw.slice(0, 10);
}

export function beautyAppointmentEarlyCompletionDateKey(apt: {
    date?: string;
    appointment_date?: string;
    status?: string;
    updated_at?: string;
} | null | undefined): string {
    const status = String(apt?.status ?? '').trim().toLowerCase();
    if (status !== 'completed') return '';
    const scheduled = beautyAppointmentDateKey(apt);
    const updatedRaw = String(apt?.updated_at ?? '').trim();
    const updatedMatch = updatedRaw.match(/^(\d{4}-\d{2}-\d{2})/);
    const updated = updatedMatch ? updatedMatch[1] : updatedRaw.slice(0, 10);
    return updated && scheduled && updated < scheduled ? updated : '';
}

/** Monday–Sunday week containing `anchor` (local dates). */
export function getWeekRangeLocal(anchor: Date): { start: string; end: string } {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const start = new Date(d.getFullYear(), d.getMonth(), diff);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return { start: formatLocalYmd(start), end: formatLocalYmd(end) };
}

/** First–last day of the month containing `anchor` (local dates). */
export function getMonthRangeLocal(anchor: Date): { start: string; end: string } {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return { start: formatLocalYmd(start), end: formatLocalYmd(end) };
}

/** Pazartesi–Cuma (yerel tarihler). */
export function getWorkWeekRangeLocal(anchor: Date): { start: string; end: string } {
    const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), diff);
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    return { start: formatLocalYmd(monday), end: formatLocalYmd(friday) };
}

/** `anchor` dahil, ardışık `dayCount` gün (varsayılan 7, DevExtreme agenda benzeri). */
export function getAgendaRangeLocal(anchor: Date, dayCount = 7): { start: string; end: string } {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + Math.max(1, dayCount) - 1);
    return { start: formatLocalYmd(start), end: formatLocalYmd(end) };
}

/** Yerel `YYYY-MM-DD` + gün sayısı (DST güvenli `setDate` döngüsü). */
export function addDaysToLocalYmd(ymd: string, days: number): string {
    const [y, m, d] = ymd.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd;
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return formatLocalYmd(dt);
}

/** İki uç dahil, artan sırada yerel takvim günleri. `startYmd > endYmd` ise boş dizi. */
export function enumerateLocalYmdInclusive(startYmd: string, endYmd: string): string[] {
    const [ys, ms, ds] = startYmd.split('-').map(Number);
    const [ye, me, de] = endYmd.split('-').map(Number);
    if (!Number.isFinite(ys) || !Number.isFinite(ms) || !Number.isFinite(ds)) return [];
    if (!Number.isFinite(ye) || !Number.isFinite(me) || !Number.isFinite(de)) return [];
    const a = new Date(ys, ms - 1, ds);
    const b = new Date(ye, me - 1, de);
    if (a > b) return [];
    const out: string[] = [];
    for (let cur = new Date(a); cur <= b; cur.setDate(cur.getDate() + 1)) {
        out.push(formatLocalYmd(cur));
    }
    return out;
}
