import { getMonthRangeLocal, getWeekRangeLocal } from './dateLocal';
import { localTodayDateKey } from './localCalendarDate';

export type ReportDatePreset = 'today' | 'week' | 'month' | 'lastMonth' | 'custom';

export interface ReportDateRangeValue {
  preset: ReportDatePreset;
  monthOffset: number;
  from: string;
  to: string;
}

/** Rapor dönem seçicisi — bugün, hafta, ay (offset ile), geçen ay veya özel aralık. */
export function resolveReportDateRange(
  preset: ReportDatePreset,
  monthOffset = 0,
  customFrom?: string,
  customTo?: string,
): { from: string; to: string } {
  const today = localTodayDateKey();
  const now = new Date();

  if (preset === 'today') {
    return { from: today, to: today };
  }

  if (preset === 'week') {
    const { start, end } = getWeekRangeLocal(now);
    return { from: start, to: end > today ? today : end };
  }

  if (preset === 'lastMonth') {
    const anchor = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const { start, end } = getMonthRangeLocal(anchor);
    return { from: start, to: end };
  }

  if (preset === 'month') {
    const anchor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const { start, end } = getMonthRangeLocal(anchor);
    if (monthOffset === 0) {
      return { from: start, to: today };
    }
    return { from: start, to: end };
  }

  const from = (customFrom || today).trim();
  const to = (customTo || today).trim();
  if (from > to) return { from: to, to: from };
  return { from, to };
}

export function buildReportDateRangeChange(
  preset: ReportDatePreset,
  monthOffset = 0,
  customFrom?: string,
  customTo?: string,
): ReportDateRangeValue {
  const { from, to } = resolveReportDateRange(preset, monthOffset, customFrom, customTo);
  return { preset, monthOffset, from, to };
}

export function defaultReportDateRange(preset: ReportDatePreset = 'month'): ReportDateRangeValue {
  return buildReportDateRangeChange(preset, 0);
}
