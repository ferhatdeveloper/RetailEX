/**
 * Yıllık ay özeti / Aylık Gün Özeti ile aynı net kalan (ciro − birleşik masraf).
 * Ortak hareket satırları bu tutarın pay % dilimidir.
 *
 * Masraf = Gider Yönetimi + kasa çıkışları (mergeExpensesWithCashOuts) —
 * PeriodSummaryReport.loadData ile aynı kaynak.
 */

import { salesAPI } from '../services/api/sales';
import { expenseAPI } from '../services/api/expenses';
import { fetchKasaIslemleri } from '../services/api/kasa';
import { mergeExpensesWithCashOuts, PERIOD_SUMMARY_CASH_OUT_TYPES } from './reportUnifiedExpenses';
import { localCalendarDateKey, toSqlDateInputString } from './localCalendarDate';

function isRemovedSaleStatus(status: unknown): boolean {
  const st = String(status ?? '').toLowerCase();
  return st === 'cancelled' || st === 'canceled' || st === 'refunded' || st === 'silindi' || st === 'iptal';
}

function isReturnSale(s: { status?: unknown; total?: number }): boolean {
  const st = String(s.status ?? '').toLowerCase();
  if (st === 'return' || st === 'iade' || st === 'refunded') return true;
  return Number(s.total) < 0;
}

export type PartnerMonthNet = {
  monthKey: string;
  lastDay: string;
  netRemaining: number;
  hasActivity: boolean;
  revenue?: number;
  expenses?: number;
};

function monthLastDay(year: number, month: number): string {
  const d = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Aylık net: PeriodSummaryReport (monthly-days / yearly) ile aynı mantık.
 * Ciro: satış faturaları (açılış/alış hariç); iade düşülür.
 * Masraf: gider kartları + bağlanmamış kasa çıkışları.
 */
export async function computeYearMonthlyNets(year: number): Promise<PartnerMonthNet[]> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [saleRows, expenseRows, cashLines] = await Promise.all([
    // Ciro kök neden: iade Hariç. İade ayrıca getCustomerReturnsByDateRange
    // ile alınabilir; Ciro'ya dahil edilmemelidir.
    salesAPI.getSalesOnlyByDateRange(start, end),
    expenseAPI.getAll({ startDate: start, endDate: end }),
    fetchKasaIslemleri({
      baslangic_tarihi: start,
      bitis_tarihi: `${end}T23:59:59`,
    }).catch(() => [] as Awaited<ReturnType<typeof fetchKasaIslemleri>>),
  ]);

  const sales = Array.isArray(saleRows) ? saleRows : [];
  const unifiedExpenses = mergeExpensesWithCashOuts(
    Array.isArray(expenseRows) ? expenseRows : [],
    Array.isArray(cashLines) ? cashLines : [],
    // Ciro/Gider kök neden — maaş, ortak sermaye, cari ödeme vb. kasa
    // hareketleri Gider değildir; yalnızca gerçek işletme giderleri sayılır.
    { allowedCashOutTypes: PERIOD_SUMMARY_CASH_OUT_TYPES },
  );

  const saleMap = new Map<string, number>();
  const saleCountMap = new Map<string, number>();
  for (const s of sales) {
    const st = String((s as { status?: unknown }).status ?? '').toLowerCase();
    if (isRemovedSaleStatus(st)) continue;
    const ft = String((s as { fiche_type?: string }).fiche_type ?? '');
    if (ft === 'opening_balance' || ft === 'purchase_invoice' || ft === 'A') continue;
    const key = localCalendarDateKey((s as { date?: string }).date).slice(0, 7);
    if (!key) continue;

    const total = Number((s as { total?: number }).total) || 0;
    const isReturn = isReturnSale(s as { status?: unknown; total?: number });

    // Ciro kök neden: getSalesOnlyByDateRange zaten iade Hariç döndüğü için
    // Ciro'ya yalnızca toplam eklenir; iade iki kez düşürme yok.
    // PeriodSummaryReport.aggregateSales ile aynı sonuç.
    let rev = saleMap.get(key) || 0;
    rev += total;
    saleMap.set(key, rev);
    if (!isReturn) saleCountMap.set(key, (saleCountMap.get(key) || 0) + 1);
  }

  const expMap = new Map<string, number>();
  for (const e of unifiedExpenses) {
    const day =
      toSqlDateInputString(String((e as { expense_date?: string }).expense_date || '')) || '';
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
      hasActivity: revenue !== 0 || exp !== 0 || (saleCountMap.get(monthKey) || 0) > 0,
      revenue,
      expenses: exp,
    };
  });
}
