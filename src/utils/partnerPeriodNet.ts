/**
 * Yıllık ay özeti ile aynı net kalan (ciro − gider) aylık kırılımı.
 * Ortak hareket satırları bu tutarın pay % dilimidir.
 */

import { salesAPI } from '../services/api/sales';
import { expenseAPI } from '../services/api/expenses';
import { localCalendarDateKey, toSqlDateInputString } from './localCalendarDate';

function isRemovedSaleStatus(status: unknown): boolean {
  const st = String(status ?? '').toLowerCase();
  return st === 'cancelled' || st === 'canceled' || st === 'refunded';
}

export type PartnerMonthNet = {
  monthKey: string;
  lastDay: string;
  netRemaining: number;
  hasActivity: boolean;
};

function monthLastDay(year: number, month: number): string {
  const d = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export async function computeYearMonthlyNets(year: number): Promise<PartnerMonthNet[]> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [saleRows, expenseRows] = await Promise.all([
    salesAPI.getByDateRange(start, end),
    expenseAPI.getAll({ startDate: start, endDate: end }),
  ]);
  const sales = Array.isArray(saleRows) ? saleRows : [];
  const expenses = Array.isArray(expenseRows) ? expenseRows : [];

  const saleMap = new Map<string, number>();
  for (const s of sales) {
    if (isRemovedSaleStatus((s as { status?: unknown }).status)) continue;
    const key = localCalendarDateKey((s as { date?: string }).date).slice(0, 7);
    if (!key) continue;
    saleMap.set(key, (saleMap.get(key) || 0) + (Number((s as { total?: number }).total) || 0));
  }

  const expMap = new Map<string, number>();
  for (const e of expenses) {
    const day = toSqlDateInputString(String((e as { expense_date?: string }).expense_date || '')) || '';
    const key = day.slice(0, 7);
    if (!key) continue;
    expMap.set(key, (expMap.get(key) || 0) + (Number((e as { amount?: number }).amount) || 0));
  }

  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const revenue = saleMap.get(monthKey) || 0;
    const exp = expMap.get(monthKey) || 0;
    return {
      monthKey,
      lastDay: monthLastDay(year, month),
      netRemaining: revenue - exp,
      hasActivity: revenue !== 0 || exp !== 0,
    };
  });
}
