import { getMonthRangeLocal, getWeekRangeLocal } from './dateLocal';
import {
  istanbulCivilDate,
  istanbulTodayDateKey,
  istanbulYearEndDateKey,
  istanbulYearStartDateKey,
  localTodayDateKey,
} from './localCalendarDate';

export type ReportDatePreset = 'today' | 'week' | 'month' | 'lastMonth' | 'custom';

/** Kasa Durumu açılışında hiçbir hazır aralık seçili değildir. */
export type CashStatusDatePreset = 'none' | ReportDatePreset;

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

export interface CashStatusDateValue {
  preset: CashStatusDatePreset;
  monthOffset: number;
  from: string;
  to: string;
}

export interface CashStatusQueryRange {
  /** Hareket aralığı. Filtresizken İstanbul yılbaşı–yıl sonu (1 Ocak ve 31 Aralık dahil). */
  from: string;
  to: string;
  filtered: boolean;
  /**
   * Eski üç kutu çağrısı için durur.
   * Yeşil kutu ve kasanın içindeki tutar bunu okumaz; ikisi de bu aralığın hareket netidir.
   */
  balanceFromRegisters: boolean;
}

/** Sayfa açılışı: hazır düğme yok, tarih kutuları boş. */
export function emptyCashStatusDate(): CashStatusDateValue {
  return { preset: 'none', monthOffset: 0, from: '', to: '' };
}

export function cashStatusFilterActive(value: CashStatusDateValue): boolean {
  return value.preset !== 'none' && Boolean(value.from) && Boolean(value.to);
}

function cashStatusPresetBounds(
  preset: ReportDatePreset,
  monthOffset: number,
  customFrom: string | undefined,
  customTo: string | undefined,
  now: Date,
): { from: string; to: string } {
  const today = istanbulTodayDateKey(now);
  const anchor = istanbulCivilDate(now);

  if (preset === 'today') return { from: today, to: today };

  if (preset === 'week') {
    const { start, end } = getWeekRangeLocal(anchor);
    return { from: start, to: end > today ? today : end };
  }

  if (preset === 'lastMonth') {
    const prev = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1, 12, 0, 0, 0);
    const { start, end } = getMonthRangeLocal(prev);
    return { from: start, to: end };
  }

  if (preset === 'month') {
    const monthAnchor = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset, 1, 12, 0, 0, 0);
    const { start, end } = getMonthRangeLocal(monthAnchor);
    if (monthOffset === 0) return { from: start, to: today };
    return { from: start, to: end };
  }

  const from = (customFrom || '').trim();
  const to = (customTo || '').trim();
  if (!from && !to) return { from: '', to: '' };
  if (!from) return { from: to, to };
  if (!to) return { from, to: from };
  if (from > to) return { from: to, to: from };
  return { from, to };
}

/** Kasa Durumu hazır aralığı. Bugün, İstanbul takvim günüdür. */
export function buildCashStatusRange(
  preset: ReportDatePreset,
  monthOffset = 0,
  customFrom?: string,
  customTo?: string,
  now: Date = new Date(),
): CashStatusDateValue {
  const { from, to } = cashStatusPresetBounds(preset, monthOffset, customFrom, customTo, now);
  if (preset === 'custom' && !from && !to) return emptyCashStatusDate();
  return { preset, monthOffset, from, to };
}

/**
 * Filtresiz: hareket aralığı yılbaşından yıl sonuna (1 Ocak ve 31 Aralık dahil).
 * Filtreli: hazır düğme veya elle girilen başlangıç/bitiş olduğu gibi kalır.
 * Yeşil kutu ve kasanın içindeki tutar bu aralığın hareket netidir.
 */
export function resolveCashStatusQuery(
  value: CashStatusDateValue,
  now: Date = new Date(),
): CashStatusQueryRange {
  if (!cashStatusFilterActive(value)) {
    return {
      from: istanbulYearStartDateKey(now),
      to: istanbulYearEndDateKey(now),
      filtered: false,
      balanceFromRegisters: true,
    };
  }
  return {
    from: value.from,
    to: value.to,
    filtered: true,
    balanceFromRegisters: false,
  };
}

/**
 * Yeşil kutu alt yazısı.
 * Tarih boşken yıl aralığı güncel kasa bakiyesidir.
 * Hazır düğme veya elle girilen aralıkta yazı seçili dönemi söyler.
 */
export function cashStatusBalanceHintKey(
  filtered: boolean,
): 'cashStatusBalanceTodayHint' | 'cashStatusBalanceRangeHint' {
  return filtered ? 'cashStatusBalanceRangeHint' : 'cashStatusBalanceTodayHint';
}
