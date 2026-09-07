/**
 * Güzellik randevu saati: DB/state her zaman 24h `HH:mm`.
 * AM/PM yalnızca görünüm tercihidir; kayıt formatına dokunulmaz.
 */

export type BeautyTimeFormat = '24h' | '12h';

export const LS_BEAUTY_TIME_FORMAT = 'retailex.beauty.timeFormat';
export const BEAUTY_TIME_FORMAT_EVENT = 'retailex-beauty-time-format';

export function normalizeBeautyHhmm(raw: string | null | undefined): string {
    const s = String(raw ?? '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return '';
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return '';
    }
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function getBeautyTimeFormat(): BeautyTimeFormat {
    if (typeof window === 'undefined') return '24h';
    try {
        const v = window.localStorage.getItem(LS_BEAUTY_TIME_FORMAT);
        return v === '12h' ? '12h' : '24h';
    } catch {
        return '24h';
    }
}

export function setBeautyTimeFormat(format: BeautyTimeFormat): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(LS_BEAUTY_TIME_FORMAT, format);
        window.dispatchEvent(new CustomEvent(BEAUTY_TIME_FORMAT_EVENT, { detail: format }));
    } catch {
        // no-op
    }
}

/** `14:30` → `2:30 PM` (12h) veya `14:30` (24h) — yalnızca gösterim */
export function formatBeautyTime(
    raw: string | null | undefined,
    format: BeautyTimeFormat = getBeautyTimeFormat(),
    fallback = '--:--',
): string {
    const hhmm = normalizeBeautyHhmm(raw);
    if (!hhmm) return fallback;
    if (format !== '12h') return hhmm;

    const [hStr, mStr] = hhmm.split(':');
    let h = Number(hStr);
    const mm = mStr;
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${mm} ${period}`;
}

/** Dakika cinsinden → etiket (yalnızca gösterim) */
export function formatBeautyMinutes(
    totalMinutes: number,
    format: BeautyTimeFormat = getBeautyTimeFormat(),
): string {
    const hh = Math.floor(totalMinutes / 60) % 24;
    const mm = ((totalMinutes % 60) + 60) % 60;
    return formatBeautyTime(
        `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
        format,
    );
}
