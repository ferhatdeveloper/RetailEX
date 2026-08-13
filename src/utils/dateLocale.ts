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
 * TR: `12.08.2026`
 * EN: `08/12/2026`
 * AR: `12‏/8‏/2026`
 */
export function formatShortDate(
    date: DateInput,
    locale: string,
    opts: FormatOptions = {},
): string {
    const d = safeDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return getFormatter(safeLocale(locale), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(d);
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
 * TR: `12.08.2026 14:30`
 */
export function formatDateTimeShort(
    date: DateInput,
    locale: string,
    opts: FormatOptions = {},
): string {
    const d = safeDate(date);
    if (!d) return opts.fallback ?? FALLBACK_DEFAULT;
    return getFormatter(safeLocale(locale), {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(d);
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