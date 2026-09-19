/**
 * Locale-aware date/time formatting helpers.
 *
 * Tek doğruluk kaynağı: tüm bileşenlerde hard-coded `'tr-TR'` veya
 * `toLocaleDateString` kullanımını merkezileştirmek için.
 *
 * Locale kaynağı: `useLanguage().tm('localeCode')`
 *   - tr → 'tr-TR'
 *   - en → 'en-US'
 *   - ar → 'ar-SA'
 *   - ku → 'ku-IQ'
 *
 * `Intl.DateTimeFormat` önbelleği (locale+options başına tek) sayesinde
 * binlerce render'da yeniden kurulum maliyeti önlenir.
 *
 * `getLocalizedWeekdayLabels(locale, short)` Pazartesi=1..Pazar=7 etiketleri döner.
 */

export type DateInput = Date | string | number | null | undefined;

export interface FormatOptions {
    /** Tarih geçersizse dönecek metin. Varsayılan: `'—'` */
    fallback?: string;
}

const FALLBACK_DEFAULT = '—';

function safeLocale(locale: string | undefined | null): string {
    if (!locale || typeof locale !== 'string') return 'tr-TR';
    return locale;
}

function safeDate(input: DateInput): Date | null {
    if (input === null || input === undefined || input === '') return null;
    const d = input instanceof Date ? input : new Date(input);
    return Number.isFinite(d.getTime()) ? d : null;
}

/** YYYY-MM-DD (isteğe bağlı saat) → yerel takvim günü; UTC kayması yok. */
function calendarDate(input: DateInput): Date | null {
    if (typeof input === 'string') {
        const trimmed = input.trim();
        const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) {
            const y = Number(iso[1]);
            const m = Number(iso[2]);
            const d = Number(iso[3]);
            const time = trimmed.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/);
            if (time && !trimmed.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(trimmed)) {
                return new Date(y, m - 1, d, Number(time[1]), Number(time[2]), Number(time[3] || 0));
            }
            return new Date(y, m - 1, d);
        }
        const dmy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
        if (dmy) {
            return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
        }
    }
    return safeDate(input);
}

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

/** Sabit sayısal tarih — dil/locale bağımsız: 19.09.2026 */
export function formatDotDate(date: Date): string {
    return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(
    locale: string,
    options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
    const key = `${locale}::${JSON.stringify(options)}`;
    let f = formatterCache.get(key);
    if (!f) {
        try {
            f = new Intl.DateTimeFormat(safeLocale(locale), options);
        } catch {
            f = new Intl.DateTimeFormat('tr-TR', options);
        }
        formatterCache.set(key, f);
    }
    return f;
}

/**
 * Uzun tarih — başlıklarda, panel başlıklarında.
 * TR: `12 Ağustos 2026 Salı`
 * EN: `Tuesday, August 12, 2026`
 * AR: `الثلاثاء، 12 أغسطس 2026`
 */
export function formatLongDate(
    date: DateInput,
    locale: string,
    opts: FormatOptions = {},
): string {
    const d = safeDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return getFormatter(safeLocale(locale), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(d);
}

/**
 * Orta uzunlukta tarih (ay kısa adı + yıl) — araç çubuğu, kart başlıkları.
 * TR: `12 Ağu 2026`
 * EN: `Aug 12, 2026`
 */
export function formatMediumDate(
    date: DateInput,
    locale: string,
    opts: FormatOptions = {},
): string {
    const d = safeDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return getFormatter(safeLocale(locale), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(d);
}

/**
 * Kısa ay + gün (yıl yok) — hafta/ajanda görünümü.
 * TR: `12 Ağu`
 * EN: `Aug 12`
 */
export function formatShortMonthDay(
    date: DateInput,
    locale: string,
    opts: FormatOptions = {},
): string {
    const d = safeDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return getFormatter(safeLocale(locale), {
        day: 'numeric',
        month: 'short',
    }).format(d);
}

/**
 * Kısa sayısal tarih — tablo hücresi, fatura listesi.
 * Tüm dillerde `19.09.2026` (gg.aa.yyyy). `locale` imza uyumu için durur.
 */
export function formatShortDate(
    date: DateInput,
    _locale?: string,
    opts: FormatOptions = {},
): string {
    const d = calendarDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return formatDotDate(d);
}

/**
 * Haftanın günü kısa — gün başlığı (Pzt/Sal/Çar ...).
 * TR: `Sal`
 * EN: `Tue`
 */
export function formatWeekdayShort(
    date: DateInput,
    locale: string,
    opts: FormatOptions = {},
): string {
    const d = safeDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return getFormatter(safeLocale(locale), { weekday: 'short' }).format(d);
}

/**
 * Haftanın günü uzun.
 * TR: `Salı`
 * EN: `Tuesday`
 */
export function formatWeekdayLong(
    date: DateInput,
    locale: string,
    opts: FormatOptions = {},
): string {
    const d = safeDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return getFormatter(safeLocale(locale), { weekday: 'long' }).format(d);
}

/**
 * Saat kısa (HH:MM veya locale'e göre) — termal fiş, sipariş zamanı.
 * TR: `14:30`
 * EN: `2:30 PM`
 */
export function formatTimeShort(
    date: DateInput,
    locale: string,
    opts: FormatOptions = {},
): string {
    const d = safeDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return getFormatter(safeLocale(locale), {
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

/**
 * Tarih + saat (kısa) — liste satırı, randevu paneli.
 * `19.09.2026 14:30` (gün her zaman gg.aa.yyyy, saat 24 saat).
 */
export function formatDateTimeShort(
    date: DateInput,
    _locale?: string,
    opts: FormatOptions = {},
): string {
    const d = calendarDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    const timed = typeof date === 'string' && /T\d{2}:/.test(date) ? safeDate(date) ?? d : d;
    return `${formatDotDate(timed)} ${pad2(timed.getHours())}:${pad2(timed.getMinutes())}`;
}

/**
 * Tarih + saat (gün+ay+saat) — randevu kart meta.
 * TR: `12 Ağu 14:30`
 */
export function formatDateTimeMedium(
    date: DateInput,
    locale: string,
    opts: FormatOptions = {},
): string {
    const d = safeDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return getFormatter(safeLocale(locale), {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(d);
}

// Pazartesi=1..Pazar=7 sıralı referans tarihler (1 Ocak 2024 Pazartesi)
const WEEKDAY_REFERENCE_DATES: Date[] = (() => {
    const base = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i));
})();

export interface LocalizedWeekdayLabel {
    value: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    label: string;
}

/**
 * Pazartesi=1..Pazar=7 sırasıyla locale'e göre gün etiketleri.
 * TR: Pazartesi/Salı/... EN: Monday/Tuesday/...
 * Intl.DateTimeFormat kullanır — manuel tablo yok.
 */
export function getLocalizedWeekdayLabels(
    locale: string,
    short = false,
): LocalizedWeekdayLabel[] {
    const fmt = getFormatter(safeLocale(locale), { weekday: short ? 'short' : 'long' });
    return WEEKDAY_REFERENCE_DATES.map((d, idx) => ({
        value: (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        label: fmt.format(d),
    }));
}