import { getMonthRangeLocal, getWeekRangeLocal } from './dateLocal';
import { localCalendarDateKey } from './localCalendarDate';

export type AnalysisRankPreset = 'today' | 'week' | 'month' | 'lastMonth';

/**
 * Kategori Analizi ve En Çok Satanlar hazır aralığı.
 * Bu ay: ayın 1'i – bugün (diğer güzellik raporlarıyla aynı).
 * Geçen ay: önceki takvim ayının tamamı. Hafta pazartesi başlar.
 * Bugün, uygulamanın yerel takvim günüdür.
 */
export function analysisRankPresetRange(
  preset: AnalysisRankPreset,
  now: Date = new Date(),
): { from: string; to: string } {
  const today = localCalendarDateKey(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    const { start, end } = getWeekRangeLocal(now);
    return { from: start, to: end > today ? today : end };
  }
  if (preset === 'lastMonth') {
    const anchor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const { start, end } = getMonthRangeLocal(anchor);
    return { from: start, to: end };
  }
  const { start } = getMonthRangeLocal(now);
  return { from: start, to: today };
}

/** Elle girilen başlangıç ve bitiş. Aralık ters ise uçlar yer değiştirir. */
export function analysisRankCustomRange(from: string, to: string): { from: string; to: string } {
  const start = String(from ?? '').trim();
  const end = String(to ?? '').trim();
  if (start && end && start > end) return { from: end, to: start };
  return { from: start, to: end };
}

/** Restoran kapalı adisyon sorgusu. Mevcut gün sorgusuyla aynı saat penceresi, aralık uçları. */
export function analysisRankQueryWindow(from: string, to: string): { fromDate: string; toDate: string } {
  const span = analysisRankCustomRange(from, to);
  return {
    fromDate: `${span.from}T00:00:00Z`,
    toDate: `${span.to}T23:59:59Z`,
  };
}

/** Satış günü seçili aralıkta mı. İki uç da dahildir. */
export function saleDayInAnalysisRange(saleDate: unknown, from: string, to: string): boolean {
  const day = localCalendarDateKey(saleDate as string | Date | number | null | undefined);
  const span = analysisRankCustomRange(from, to);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(span.from) || !/^\d{4}-\d{2}-\d{2}$/.test(span.to)) return false;
  return day >= span.from && day <= span.to;
}

/** Kategori ve çok satan listesi bu süzgeci kullanır. Tutar alanları olduğu gibi kalır. */
export function filterSalesForAnalysisRange<T extends { date?: unknown }>(
  sales: readonly T[],
  from: string,
  to: string,
): T[] {
  return sales.filter((sale) => saleDayInAnalysisRange(sale.date, from, to));
}
