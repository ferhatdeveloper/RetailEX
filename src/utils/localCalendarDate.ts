/**
 * Satış / fiş tarihini günlük raporda gruplarken UTC yerine tarayıcı yerel takvim günü kullanılır.
 * Aksi halde `toISOString().split('T')[0]` gece saatlerinde bir önceki/sonraki güne kayar (ör. TR UTC+3).
 */
export function localCalendarDateKey(input: string | Date | number | undefined | null): string {
    if (input == null || input === '') return '';
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Bugünün yerel YYYY-MM-DD (input[type=date] ile aynı mantık) */
export function localTodayDateKey(): string {
    return localCalendarDateKey(new Date());
}

/** Rapor / dönem tarihleri için makul yıl aralığı (ör. 182026 yazım hatası reddedilir). */
const SQL_DATE_MIN_YEAR = 1990;
const SQL_DATE_MAX_YEAR = 2100;

function isReasonableSqlDateParts(y: string, m: string, d: string): boolean {
    const yi = parseInt(y, 10);
    const mi = parseInt(m, 10);
    const di = parseInt(d, 10);
    if (!Number.isFinite(yi) || !Number.isFinite(mi) || !Number.isFinite(di)) return false;
    if (yi < SQL_DATE_MIN_YEAR || yi > SQL_DATE_MAX_YEAR) return false;
    if (mi < 1 || mi > 12 || di < 1 || di > 31) return false;
    return true;
}

function formatSqlDateParts(y: string, m: string, d: string): string {
    if (!isReasonableSqlDateParts(y, m, d)) return '';
    return `${y}-${m}-${d}`;
}

/**
 * Dönem / PG / el ile girilmiş tarihi `YYYY-MM-DD` yapar (`input[type=date]`, `$n::date`).
 * ISO önek, `DD.MM.YYYY` (TR) ve `DD/MM/YYYY` desteklenir.
 */
export function toSqlDateInputString(raw: string | Date | number | undefined | null): string {
    if (raw == null || raw === '') return '';
    if (typeof raw === 'number' && !Number.isFinite(raw)) return '';
    if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime())) return '';
        const key = localCalendarDateKey(raw);
        const [y, m, d] = key.split('-');
        return formatSqlDateParts(y, m, d);
    }
    const s = String(raw).trim();
    if (!s) return '';

    const isoFull = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (isoFull) return formatSqlDateParts(isoFull[1], isoFull[2], isoFull[3]);

    const isoPrefix = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoPrefix) return formatSqlDateParts(isoPrefix[1], isoPrefix[2], isoPrefix[3]);

    const tr = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (tr) {
        const dd = tr[1].padStart(2, '0');
        const mm = tr[2].padStart(2, '0');
        const yyyy = tr[3];
        return formatSqlDateParts(yyyy, mm, dd);
    }

    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const dd = slash[1].padStart(2, '0');
        const mm = slash[2].padStart(2, '0');
        const yyyy = slash[3];
        return formatSqlDateParts(yyyy, mm, dd);
    }

    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
        const key = localCalendarDateKey(parsed);
        const [y, m, d] = key.split('-');
        return formatSqlDateParts(y, m, d);
    }
    return '';
}

/** `YYYY-MM-DD` (veya parse edilebilir ham string) → Türkçe kısa tarih (dönem seçici vb.) */
export function formatIsoDateTr(iso: string | undefined | null): string {
    const s = toSqlDateInputString(iso || '');
    if (!s) return (iso && String(iso).trim()) || '-';
    const parts = s.split('-').map((x) => parseInt(x, 10));
    const y = parts[0];
    const m = parts[1];
    const d = parts[2];
    if (!y || !m || !d) return String(iso).trim() || '-';
    return new Date(y, m - 1, d).toLocaleDateString('tr-TR');
}
