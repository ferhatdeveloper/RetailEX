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

/**
 * Dönem / PG / el ile girilmiş tarihi `YYYY-MM-DD` yapar (`input[type=date]`, `$n::date`).
 * ISO önek, `DD.MM.YYYY` (TR) ve `DD/MM/YYYY` desteklenir.
 */
export function toSqlDateInputString(raw: string | Date | number | undefined | null): string {
    if (raw == null || raw === '') return '';
    if (typeof raw === 'number' && !Number.isFinite(raw)) return '';
    if (raw instanceof Date) {
        if (Number.isNaN(raw.getTime())) return '';
        return localCalendarDateKey(raw);
    }
    const s = String(raw).trim();
    if (!s) return '';

    const isoFull = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (isoFull) return `${isoFull[1]}-${isoFull[2]}-${isoFull[3]}`;

    const isoPrefix = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoPrefix) return `${isoPrefix[1]}-${isoPrefix[2]}-${isoPrefix[3]}`;

    const tr = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (tr) {
        const dd = tr[1].padStart(2, '0');
        const mm = tr[2].padStart(2, '0');
        const yyyy = tr[3];
        return `${yyyy}-${mm}-${dd}`;
    }

    const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
        const dd = slash[1].padStart(2, '0');
        const mm = slash[2].padStart(2, '0');
        const yyyy = slash[3];
        return `${yyyy}-${mm}-${dd}`;
    }

    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return localCalendarDateKey(parsed);
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
