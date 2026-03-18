/**
 * Para tutarı gösterimi — TL, ₺ veya başka para birimi simgesi eklenmez.
 */
export function formatMoneyAmount(
    value: number | null | undefined,
    options?: { minFrac?: number; maxFrac?: number; locale?: string }
): string {
    const min = options?.minFrac ?? 2;
    const max = options?.maxFrac ?? 2;
    const locale = options?.locale ?? 'tr-TR';
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat(locale, {
        minimumFractionDigits: min,
        maximumFractionDigits: max,
    }).format(safe);
}

export function formatMoneyInteger(value: number | null | undefined, locale = 'tr-TR'): string {
    return formatMoneyAmount(value, { minFrac: 0, maxFrac: 0, locale });
}
