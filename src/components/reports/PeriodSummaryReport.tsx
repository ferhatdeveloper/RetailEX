import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { formatNumber } from '../../utils/formatNumber';
import { expenseAPI, type Expense } from '../../services/api/expenses';
import { salesAPI } from '../../services/api/sales';
import { invoicesAPI } from '../../services/api/invoices';
import { supplierAPI } from '../../services/api/suppliers';
import { fetchKasaIslemleri } from '../../services/api/kasa';
import { isReturnSale } from '../../utils/posZReport';
import { saleCollectedSplit } from '../../utils/saleCollectedAmounts';
import { mergeExpensesWithCashOuts } from '../../utils/reportUnifiedExpenses';
import type { Sale } from '../../App';
import type { Invoice, Supplier } from '../../core/types/models';
import { localCalendarDateKey, localTodayDateKey, formatIsoDateTr, toSqlDateInputString } from '../../utils/localCalendarDate';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useLanguage } from '../../contexts/LanguageContext';

import { partnerAPI } from '../../services/api/partiesPartners';
import type { PartyPartner } from '../../core/types/models';
import {
  getRuntimeReportMenuParams,
  isReportMenuParamEnabled,
  loadReportMenuParams,
  reportNetAfterOptionalExpense,
  subscribeReportMenuParams,
  type ReportMenuParams,
} from '../../services/reportMenuParamsService';
import {
  loadPeriodSummaryPartnerSplitPrefs,
  normalizePartnerSplitPrefs,
  savePeriodSummaryPartnerSplitPrefs,
  splitAmountByPartners,
  type PeriodSummaryPartnerSplitPrefs,
} from '../../utils/periodSummaryPartnerSplit';
import { PeriodExpenseShareDetailModal } from './PeriodExpenseShareDetailModal';
import { PeriodSupplierPayablesDetailModal } from './PeriodSupplierPayablesDetailModal';
import { PartnerDetailReportModal } from './PartnerDetailReportModal';
import { ReportColumnTable, type ReportColumnTableCol } from './shared/ReportDataGrid';
import { ReportKpiStrip, type ReportKpiItem } from './shared/ReportKpiStrip';

export type PeriodSummaryMode = 'monthly-days' | 'yearly-months';

interface PeriodSummaryRow {
  key: string;
  periodKey: string;
  periodLabel: string;
  saleCount: number;
  revenue: number;
  cash: number;
  card: number;
  discount: number;
  returnsCount: number;
  returnsAmount: number;
  expenses: number;
  purchases: number;
  netRemaining: number;
  partnerShares: Record<string, number>;
  expenseShares: Record<string, number>;
}

function hasPeriodActivity(row: Pick<PeriodSummaryRow, 'saleCount' | 'revenue' | 'expenses' | 'purchases'>): boolean {
  return row.saleCount > 0 || row.revenue > 0 || row.expenses > 0 || row.purchases > 0;
}

function isRemovedSaleStatus(status: unknown): boolean {
  const st = String(status ?? '').toLowerCase();
  return st === 'cancelled' || st === 'canceled' || st === 'refunded';
}

function daysInMonthKeys(year: number, month: number): string[] {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return Array.from({ length: lastDay }, (_, i) => {
    const dd = String(i + 1).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  });
}

function monthsInYearKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

function monthRangeFromPicker(value: string): { start: string; end: string } | null {
  const m = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  const start = `${m[1]}-${m[2]}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const end = `${m[1]}-${m[2]}-${String(endDay).padStart(2, '0')}`;
  return { start, end };
}

function yearRangeFromPicker(year: number): { start: string; end: string } | null {
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return null;
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function saleMonthKey(date: string | Date | undefined): string {
  const k = localCalendarDateKey(date);
  return k ? k.slice(0, 7) : '';
}

function expenseDayKey(raw: string | undefined | null): string {
  return toSqlDateInputString(raw || '') || '';
}

/**
 * Günlük Rapor ile aynı satış özeti:
 * - cancelled / refunded aktif satışa girmez
 * - refunded yalnızca iade sayacında
 * - aktif ciro = Σ total − Σ |iade satırı| (status=return / negatif total aktifteyse)
 * - nakit / kart ayrı kovalar; iade peşin satırı abs ile şişirmez
 */
function aggregateSales(sales: Sale[], bucketKey: (s: Sale) => string) {
  const map = new Map<string, {
    saleCount: number; revenue: number; cash: number; card: number; discount: number;
    returnsCount: number; returnsAmount: number;
  }>();

  const bump = (key: string) => {
    const row = map.get(key) || {
      saleCount: 0, revenue: 0, cash: 0, card: 0, discount: 0,
      returnsCount: 0, returnsAmount: 0,
    };
    map.set(key, row);
    return row;
  };

  for (const s of sales) {
    const st = String(s.status ?? '').toLowerCase();
    if (st === 'cancelled' || st === 'canceled' || st === 'silindi' || st === 'iptal') continue;
    const ft = String((s as any).fiche_type ?? '');
    if (ft === 'opening_balance' || ft === 'purchase_invoice') continue;
    const key = bucketKey(s);
    if (!key) continue;

    const row = bump(key);
    const total = Number(s.total) || 0;
    const absTotal = Math.abs(total);
    const isReturn = isReturnSale(s);

    if (isReturn) {
      row.returnsCount += 1;
      row.returnsAmount += absTotal;
    }

    // Günlük: refunded `isRemovedSaleStatus` ile aktif dışı
    if (st === 'refunded') continue;

    if (!isReturn) {
      row.saleCount += 1;
      row.discount += Number(s.discount) || 0;
    }

    row.revenue += total;
    const split = saleCollectedSplit(s);
    row.cash += split.cash;
    row.card += split.card;

    if (isReturn) {
      row.revenue -= absTotal;
    }
  }
  return map;
}

function aggregateExpenses(
  expenses: Awaited<ReturnType<typeof expenseAPI.getAll>>,
  bucketKey: (e: (typeof expenses)[number]) => string
) {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const key = bucketKey(e);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(e.amount) || 0));
  }
  return map;
}

function aggregatePurchases(invoices: Invoice[], bucketKey: (inv: Invoice) => string) {
  const map = new Map<string, number>();
  for (const inv of invoices) {
    if (inv.is_cancelled || isRemovedSaleStatus(inv.status)) continue;
    const key = bucketKey(inv);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(inv.total_amount ?? inv.total) || 0));
  }
  return map;
}

async function fetchPeriodPurchases(start: string, end: string): Promise<Invoice[]> {
  const all: Invoice[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const result = await invoicesAPI.getPaginated({
      page,
      pageSize: 5000,
      startDate: start,
      endDate: end,
      invoiceCategory: 'Alis',
      includeCancelled: false,
    });
    all.push(...(result.data || []));
    totalPages = Math.max(1, result.totalPages || 1);
    if (!result.data?.length) break;
    page += 1;
  }
  return all;
}

interface PeriodSummaryReportProps {
  mode: PeriodSummaryMode;
  currency: string;
}

export function PeriodSummaryReport({ mode, currency }: PeriodSummaryReportProps) {
  const { tm } = useLanguage();
  const { selectedFirm } = useFirmaDonem();
  const todayKey = localTodayDateKey();
  const defaultMonth = todayKey.slice(0, 7);
  const defaultYear = parseInt(todayKey.slice(0, 4), 10);

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [selectedYear, setSelectedYear] = useState(defaultYear);
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  /** Günlük ile aynı: gider kartı + bağlanmamış kasa/cari çıkışları */
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [purchases, setPurchases] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierDetailOpen, setSupplierDetailOpen] = useState(false);
  const [partnerSplit, setPartnerSplit] = useState<PeriodSummaryPartnerSplitPrefs>(() =>
    loadPeriodSummaryPartnerSplitPrefs(),
  );
  const [partners, setPartners] = useState<PartyPartner[]>([]);
  const [expenseDetail, setExpenseDetail] = useState<{ title: string; periodKey: string | null } | null>(null);
  const [partnerDetail, setPartnerDetail] = useState<PartyPartner | null>(null);
  const [reportMenuParams, setReportMenuParams] = useState<ReportMenuParams>(() =>
    getRuntimeReportMenuParams(),
  );

  useEffect(() => {
    void loadReportMenuParams().then((p) => setReportMenuParams(p));
    return subscribeReportMenuParams((p) => setReportMenuParams(p));
  }, []);

  const showPeriodCardRevenue = isReportMenuParamEnabled(
    'period-summary-card-total-revenue',
    reportMenuParams,
  );
  const showPeriodCardExpenses = isReportMenuParamEnabled(
    'period-summary-card-total-expenses',
    reportMenuParams,
  );
  const showPeriodCardPurchases = isReportMenuParamEnabled(
    'period-summary-card-period-purchases',
    reportMenuParams,
  );
  const showPeriodCardSupplierPayables = isReportMenuParamEnabled(
    'period-summary-card-supplier-payables',
    reportMenuParams,
  );
  const showPeriodCardNet = isReportMenuParamEnabled('period-summary-card-net', reportMenuParams);
  const showPeriodCardPaymentSplit = isReportMenuParamEnabled(
    'period-summary-card-payment-split',
    reportMenuParams,
  );

  const partnerSlices = useMemo(
    () =>
      partners.map((p) => ({
        id: p.id,
        name: p.name || p.code || p.id,
        sharePct: Number(p.share_pct) || 0,
      })),
    [partners],
  );
  const partnerPctTotal = useMemo(
    () => Math.round(partnerSlices.reduce((s, p) => s + p.sharePct, 0) * 100) / 100,
    [partnerSlices],
  );

  const updatePartnerSplit = useCallback((patch: Partial<PeriodSummaryPartnerSplitPrefs>) => {
    setPartnerSplit((prev) => {
      let majorPct = patch.majorPct ?? prev.majorPct;
      let minorPct = patch.minorPct ?? prev.minorPct;
      if (patch.majorPct != null && patch.minorPct == null) {
        minorPct = 100 - majorPct;
      } else if (patch.minorPct != null && patch.majorPct == null) {
        majorPct = 100 - minorPct;
      }
      const next = normalizePartnerSplitPrefs(
        {
          enabled: patch.enabled ?? prev.enabled,
          majorPct,
          minorPct,
        },
        { defaultEnabled: false },
      );
      savePeriodSummaryPartnerSplitPrefs(next);
      return next;
    });
  }, []);

  const periodRange = useMemo(() => {
    if (mode === 'monthly-days') return monthRangeFromPicker(selectedMonth);
    return yearRangeFromPicker(selectedYear);
  }, [mode, selectedMonth, selectedYear]);

  const loadData = useCallback(async () => {
    if (!periodRange) {
      setSales([]);
      setExpenses([]);
      setPurchases([]);
      return;
    }
    setLoading(true);
    try {
      const [saleRows, expenseRows, cashLines, purchaseRows, supplierRows] = await Promise.all([
        salesAPI.getByDateRange(periodRange.start, periodRange.end),
        expenseAPI.getAll({ startDate: periodRange.start, endDate: periodRange.end }),
        fetchKasaIslemleri({
          baslangic_tarihi: periodRange.start,
          bitis_tarihi: `${periodRange.end}T23:59:59`,
        }).catch(() => []),
        fetchPeriodPurchases(periodRange.start, periodRange.end),
        supplierAPI.getAll({ cardType: 'supplier' }),
      ]);
      setSales(Array.isArray(saleRows) ? saleRows : []);
      setExpenses(
        mergeExpensesWithCashOuts(
          Array.isArray(expenseRows) ? expenseRows : [],
          Array.isArray(cashLines) ? cashLines : [],
        ),
      );
      setPurchases(Array.isArray(purchaseRows) ? purchaseRows : []);
      setSuppliers(Array.isArray(supplierRows) ? supplierRows : []);
    } catch (err) {
      console.error('[PeriodSummaryReport] yükleme hatası:', err);
      setSales([]);
      setExpenses([]);
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, [periodRange]);

  useEffect(() => {
    void loadData();
  }, [loadData, selectedFirm?.firm_nr]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await partnerAPI.getActive();
        if (!cancelled) setPartners(Array.isArray(list) ? list : []);
      } catch (err) {
        console.error('[PeriodSummaryReport] ortak listesi:', err);
        if (!cancelled) setPartners([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFirm?.firm_nr]);

  const rows = useMemo((): PeriodSummaryRow[] => {
    if (!periodRange) return [];

    const saleMap =
      mode === 'monthly-days'
        ? aggregateSales(sales, (s) => localCalendarDateKey(s.date))
        : aggregateSales(sales, (s) => saleMonthKey(s.date));

    const expenseMap =
      mode === 'monthly-days'
        ? aggregateExpenses(expenses, (e) => expenseDayKey(e.expense_date))
        : aggregateExpenses(expenses, (e) => expenseDayKey(e.expense_date).slice(0, 7));

    const purchaseMap =
      mode === 'monthly-days'
        ? aggregatePurchases(purchases, (inv) => localCalendarDateKey(inv.invoice_date))
        : aggregatePurchases(purchases, (inv) => saleMonthKey(inv.invoice_date));

    const periodKeys =
      mode === 'monthly-days'
        ? daysInMonthKeys(parseInt(selectedMonth.slice(0, 4), 10), parseInt(selectedMonth.slice(5, 7), 10))
        : monthsInYearKeys(selectedYear);

    const locale = tm('localeCode') || 'tr-TR';

    return periodKeys.map((periodKey) => {
      const sale = saleMap.get(periodKey) || {
        saleCount: 0, revenue: 0, cash: 0, card: 0, discount: 0,
        returnsCount: 0, returnsAmount: 0,
      };
      const exp = expenseMap.get(periodKey) || 0;
      const purch = purchaseMap.get(periodKey) || 0;
      const periodLabel =
        mode === 'monthly-days'
          ? formatIsoDateTr(periodKey)
          : new Date(`${periodKey}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

      // Günlük Rapor neti: ciro − gider (alış ayrı kolonda; netten düşülmez).
      // Gider kartı parametresi kapalıysa gider düşülmez.
      const netRemaining = reportNetAfterOptionalExpense(
        sale.revenue,
        exp,
        showPeriodCardExpenses,
      );

      const shareList = splitAmountByPartners(netRemaining, partnerSlices);
      const partnerShareMap: Record<string, number> = {};
      for (const s of shareList) partnerShareMap[s.id] = s.amount;
      const expForShare = showPeriodCardExpenses ? exp : 0;
      const expShareList = splitAmountByPartners(expForShare, partnerSlices);
      const expenseShareMap: Record<string, number> = {};
      for (const s of expShareList) expenseShareMap[s.id] = s.amount;
      return {
        key: periodKey,
        periodKey,
        periodLabel,
        saleCount: sale.saleCount,
        revenue: sale.revenue,
        cash: sale.cash,
        card: sale.card,
        discount: sale.discount,
        returnsCount: sale.returnsCount,
        returnsAmount: sale.returnsAmount,
        expenses: exp,
        purchases: purch,
        netRemaining,
        partnerShares: partnerShareMap,
        expenseShares: expenseShareMap,
      };
    });
  }, [
    mode,
    periodRange,
    sales,
    expenses,
    purchases,
    selectedMonth,
    selectedYear,
    tm,
    partnerSlices,
    showPeriodCardExpenses,
  ]);

  const totals = useMemo(() => {
    const base = rows.reduce(
      (acc, r) => ({
        saleCount: acc.saleCount + r.saleCount,
        revenue: acc.revenue + r.revenue,
        cash: acc.cash + r.cash,
        card: acc.card + r.card,
        discount: acc.discount + r.discount,
        returnsCount: acc.returnsCount + r.returnsCount,
        returnsAmount: acc.returnsAmount + r.returnsAmount,
        expenses: acc.expenses + r.expenses,
        purchases: acc.purchases + r.purchases,
        netRemaining: acc.netRemaining + r.netRemaining,
      }),
      {
        saleCount: 0, revenue: 0, cash: 0, card: 0, discount: 0,
        returnsCount: 0, returnsAmount: 0,
        expenses: 0, purchases: 0, netRemaining: 0,
      }
    );
    const shareList = splitAmountByPartners(base.netRemaining, partnerSlices);
    const partnerShares: Record<string, number> = {};
    for (const s of shareList) partnerShares[s.id] = s.amount;
    const expShareList = splitAmountByPartners(base.expenses, partnerSlices);
    const expenseShares: Record<string, number> = {};
    for (const s of expShareList) expenseShares[s.id] = s.amount;
    return {
      ...base,
      partnerShares,
      expenseShares,
    };
  }, [rows, partnerSlices]);

  const supplierPayables = useMemo(() => {
    const payable = suppliers.reduce((s, r) => s + Math.max(Number(r.balance) || 0, 0), 0);
    const shares = splitAmountByPartners(payable, partnerSlices);
    const byId: Record<string, number> = {};
    for (const sh of shares) byId[sh.id] = sh.amount;
    return {
      payable,
      byId,
      count: suppliers.filter((s) => Number(s.balance) > 0).length,
    };
  }, [suppliers, partnerSlices]);

  const money = (v: number) => `${formatNumber(v, 0, false)} ${currency}`;
  const showPartnerCols = partnerSplit.enabled && partnerSlices.length > 0;
  const partnerColColors = ['text-blue-700', 'text-indigo-700', 'text-violet-700', 'text-cyan-700', 'text-teal-700'];

  type PeriodSummaryGridRow = PeriodSummaryRow & Record<string, number | string | Record<string, number>>;

  const gridRows = useMemo((): PeriodSummaryGridRow[] => {
    return rows.map((r) => ({
      ...r,
      ...Object.fromEntries(
        partnerSlices.map((p) => [`partner-${p.id}`, r.partnerShares[p.id] ?? 0] as const),
      ),
    }));
  }, [rows, partnerSlices]);

  const tableColumns = useMemo((): ReportColumnTableCol<PeriodSummaryGridRow>[] => {
    const base: ReportColumnTableCol<PeriodSummaryGridRow>[] = [
      {
        key: 'periodLabel',
        header: mode === 'monthly-days' ? tm('rptPeriodColDay') : tm('rptPeriodColMonth'),
        size: 160,
      },
      {
        key: 'saleCount',
        header: tm('rptPeriodColSaleCount'),
        type: 'number',
        align: 'right',
        size: 90,
        footerSum: true,
        footerFormat: (n) => String(Math.round(n)),
        cell: (row) => (row.saleCount > 0 ? row.saleCount : '—'),
      },
      {
        key: 'revenue',
        header: `${tm('rptPeriodColRevenue')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => (row.revenue > 0 ? money(row.revenue) : '—'),
      },
      {
        key: 'cash',
        header: `${tm('rptPeriodColCash')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => (row.cash > 0 ? money(row.cash) : '—'),
      },
      {
        key: 'card',
        header: `${tm('rptPeriodColCard')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => (row.card > 0 ? money(row.card) : '—'),
      },
      {
        key: 'discount',
        header: `${tm('rptPeriodColDiscount')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => money(n),
        cell: (row) => (row.discount > 0 ? money(row.discount) : '—'),
      },
      {
        key: 'returnsAmount',
        header: `${tm('rptPeriodColReturns') || 'İade'} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) =>
          n > 0 ? (
            <span className="text-orange-600" title={`${totals.returnsCount} ${tm('rptPeriodColReturnsCount') || 'iade adedi'}`}>
              {money(n)}
            </span>
          ) : (
            '—'
          ),
        cell: (row) => {
          if (!hasPeriodActivity(row)) return '—';
          return row.returnsAmount > 0 ? (
            <span
              className="text-orange-600"
              title={`${row.returnsCount} ${tm('rptPeriodColReturnsCount') || 'iade adedi'}`}
            >
              {money(row.returnsAmount)}
            </span>
          ) : (
            '—'
          );
        },
      },
      {
        key: 'expenses',
        header: `${tm('rptPeriodColExpenses')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => <span className="text-red-600">{money(n)}</span>,
        cell: (row) => {
          if (!hasPeriodActivity(row)) return '—';
          return (
            <button
              type="button"
              className="text-red-600 underline-offset-2 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setExpenseDetail({
                  title: `${tm('rptPeriodExpenseDetailTitle')} · ${row.periodLabel}`,
                  periodKey: row.periodKey,
                });
              }}
            >
              {money(row.expenses)}
            </button>
          );
        },
      },
      {
        key: 'purchases',
        header: `${tm('rptPeriodColPurchases')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => <span className="text-amber-700">{money(n)}</span>,
        cell: (row) => {
          if (!hasPeriodActivity(row)) return '—';
          return row.purchases > 0 ? <span className="text-amber-700">{money(row.purchases)}</span> : '—';
        },
      },
      {
        key: 'netRemaining',
        header: `${tm('rptPeriodColNet')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => (
          <span className={n >= 0 ? 'text-emerald-700' : 'text-red-600'}>{money(n)}</span>
        ),
        cell: (row) => {
          if (!hasPeriodActivity(row)) return '—';
          const cls = row.netRemaining >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold';
          return <span className={cls}>{money(row.netRemaining)}</span>;
        },
      },
    ];

    const filtered = base.filter((col) => {
      const key = col.key;
      if (key === 'revenue') return showPeriodCardRevenue;
      if (key === 'cash' || key === 'card') return showPeriodCardPaymentSplit;
      if (key === 'expenses') return showPeriodCardExpenses;
      if (key === 'purchases') return showPeriodCardPurchases;
      if (key === 'netRemaining') return showPeriodCardNet;
      return true;
    });

    if (!showPartnerCols) return filtered;

    return [
      ...filtered,
      ...partnerSlices.map((p, idx) => {
        const partnerKey = `partner-${p.id}`;
        return {
          key: partnerKey,
          header: `${p.name} (%${p.sharePct}) (${currency})`,
          type: 'number' as const,
          align: 'right' as const,
          footerSum: true,
          footerFormat: (n: number) => (
            <div className="leading-tight">
              <span className={partnerColColors[idx % partnerColColors.length]}>{money(n)}</span>
              <div className="text-[10px] font-semibold text-red-600">
                {tm('rptPeriodExpenseShare')}: {money(totals.expenseShares[p.id] ?? 0)}
              </div>
            </div>
          ),
          cell: (row: PeriodSummaryGridRow) => {
            if (!hasPeriodActivity(row)) return '—';
            const v = row.partnerShares[p.id] ?? 0;
            const expShare = row.expenseShares[p.id] ?? 0;
            const cls = partnerColColors[idx % partnerColColors.length];
            return (
              <div className="leading-tight">
                <span className={`${cls} font-medium`}>{money(v)}</span>
                {expShare ? (
                  <div className="text-[10px] font-semibold text-red-600">
                    {tm('rptPeriodExpenseShare')}: {money(expShare)}
                  </div>
                ) : null}
              </div>
            );
          },
        } satisfies ReportColumnTableCol<PeriodSummaryGridRow>;
      }),
    ];
  }, [
    mode,
    currency,
    tm,
    money,
    showPartnerCols,
    partnerSlices,
    showPeriodCardRevenue,
    showPeriodCardPaymentSplit,
    showPeriodCardExpenses,
    showPeriodCardPurchases,
    showPeriodCardNet,
    totals.returnsCount,
    totals.expenseShares,
    partnerColColors,
  ]);

  const title = mode === 'monthly-days' ? tm('aylikGunOzeti') : tm('yillikAyOzeti');

  const kpiItems = useMemo((): ReportKpiItem[] => {
    const items: ReportKpiItem[] = [];

    if (showPeriodCardRevenue) {
      items.push({
        key: 'revenue',
        label: tm('rptPeriodTotalRevenue'),
        value: money(totals.revenue),
        valueClassName: 'text-emerald-700 dark:text-emerald-400',
        hint: `${totals.saleCount} ${tm('rptPeriodColSaleCount').toLowerCase()}`,
      });
    }

    if (showPeriodCardExpenses) {
      items.push({
        key: 'expenses',
        label: tm('rptPeriodTotalExpenses'),
        value: money(totals.expenses),
        valueClassName: 'text-red-600 dark:text-red-400',
        hint: (
          <button
            type="button"
            className="font-semibold text-rose-700 hover:underline dark:text-rose-400"
            onClick={() =>
              setExpenseDetail({ title: tm('rptPeriodExpenseDetailTitle'), periodKey: null })
            }
          >
            {tm('rptPeriodOpenExpenseDetail')}
          </button>
        ),
      });
    }

    if (showPeriodCardPurchases) {
      items.push({
        key: 'purchases',
        label: tm('rptPeriodTotalPurchases'),
        value: money(totals.purchases),
        valueClassName: 'text-amber-700 dark:text-amber-400',
      });
    }

    if (showPeriodCardSupplierPayables) {
      const partnerHints = showPartnerCols
        ? partnerSlices
            .map((p) => `${p.name}: ${money(supplierPayables.byId[p.id] ?? 0)}`)
            .join(' · ')
        : '';
      items.push({
        key: 'supplier-payables',
        label: tm('rptPeriodSupplierOpenDebt'),
        value: money(supplierPayables.payable),
        valueClassName: 'text-amber-800 dark:text-amber-300',
        hint: (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              {supplierPayables.count}{' '}
              {tm('rptPeriodSupplierDetailKicker').toLocaleLowerCase('tr-TR')}
            </span>
            {partnerHints ? <span className="text-amber-800 dark:text-amber-300">{partnerHints}</span> : null}
            <button
              type="button"
              className="font-semibold text-amber-800 hover:underline dark:text-amber-300"
              onClick={() => setSupplierDetailOpen(true)}
            >
              {tm('rptPeriodOpenSupplierDetail')}
            </button>
          </span>
        ),
      });
    }

    if (showPeriodCardNet) {
      items.push({
        key: 'net',
        label: tm('rptPeriodColNet'),
        value: money(totals.netRemaining),
        valueClassName:
          totals.netRemaining >= 0
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400',
      });
    }

    if (showPartnerCols) {
      partnerSlices.forEach((p, idx) => {
        const fullPartner = partners.find((x) => x.id === p.id);
        const partnerBalance = Number(fullPartner?.balance || 0);
        const isNeg = partnerBalance < 0;
        items.push({
          key: `partner-${p.id}`,
          label: `${p.name} (%${p.sharePct})`,
          value: money(totals.partnerShares[p.id] ?? 0),
          valueClassName: partnerColColors[idx % partnerColColors.length],
          className: 'border-blue-100 bg-blue-50/40 dark:border-blue-800 dark:bg-blue-950/30',
          hint: (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-red-600 dark:text-red-400">
                {tm('rptPeriodExpenseShare')}: {money(totals.expenseShares[p.id] ?? 0)}
              </span>
              {fullPartner ? (
                <>
                  <span className={`font-mono font-bold ${isNeg ? 'text-red-700' : 'text-emerald-700'}`}>
                    DB: {money(partnerBalance)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPartnerDetail(fullPartner)}
                    className="inline-flex items-center gap-0.5 font-semibold text-indigo-700 hover:underline dark:text-indigo-300"
                  >
                    <Eye className="w-3 h-3" />
                    Detay
                  </button>
                </>
              ) : null}
            </span>
          ),
        });
      });
    }

    if (showPeriodCardPaymentSplit) {
      items.push({
        key: 'payment-split',
        label: tm('rptPeriodPaymentSplit'),
        value: (
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            {tm('rptPeriodColCash')}: {money(totals.cash)}
          </span>
        ),
        hint: `${tm('rptPeriodColCard')}: ${money(totals.card)}`,
      });
    }

    return items;
  }, [
    showPeriodCardRevenue,
    showPeriodCardExpenses,
    showPeriodCardPurchases,
    showPeriodCardSupplierPayables,
    showPeriodCardNet,
    showPeriodCardPaymentSplit,
    showPartnerCols,
    partnerSlices,
    partners,
    supplierPayables,
    totals,
    money,
    tm,
    partnerColColors,
  ]);

  const kpiColumns = Math.min(Math.max(kpiItems.length, 2), 6) as 2 | 3 | 4 | 5 | 6;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-white px-3 py-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <label className="flex flex-col gap-0.5 min-w-[9rem]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {mode === 'monthly-days' ? tm('rptPeriodSelectMonth') : tm('rptPeriodSelectYear')}
            </span>
            {mode === 'monthly-days' ? (
              <input
                type="month"
                min="1990-01"
                max="2100-12"
                value={selectedMonth}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setSelectedMonth(v);
                }}
                className="h-8 px-2 text-sm rounded border outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            ) : (
              <input
                type="number"
                min={1990}
                max={2100}
                value={selectedYear}
                onChange={(e) => {
                  const y = parseInt(e.target.value, 10);
                  if (Number.isFinite(y)) setSelectedYear(y);
                }}
                className="h-8 w-28 px-2 text-sm rounded border outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            )}
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none font-medium text-slate-700">
          <input
            type="checkbox"
            checked={partnerSplit.enabled}
            onChange={(e) => updatePartnerSplit({ enabled: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          {tm('rptPeriodPartnerSplitEnable')}
        </label>
        {partnerSplit.enabled ? (
          partnerSlices.length > 0 ? (
            <span>
              {tm('rptPeriodPartnerSplitFromCards')}
              {Math.abs(partnerPctTotal - 100) > 0.01
                ? ` ${tm('rptPeriodPartnerPctWarn').replace('{total}', String(partnerPctTotal))}`
                : ''}
            </span>
          ) : (
            <span className="text-amber-700">{tm('rptPeriodPartnerNoPartners')}</span>
          )
        ) : null}
      </div>

      {kpiItems.length > 0 ? (
        <ReportKpiStrip columns={kpiColumns} items={kpiItems} itemClassName="shadow-none" />
      ) : null}

      <div className="relative rounded-lg border bg-white p-2">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-hidden />
          </div>
        ) : null}
        <ReportColumnTable
          data={gridRows}
          columns={tableColumns}
          height={560}
          footerLabel={tm('rptPeriodTotalRow')}
          storageNamespace="period-summary"
          onRowClick={(row) => {
            if (!hasPeriodActivity(row) || !(row.expenses > 0) || !partnerSlices.length) return;
            setExpenseDetail({
              title: `${tm('rptPeriodExpenseDetailTitle')} · ${row.periodLabel}`,
              periodKey: row.periodKey,
            });
          }}
        />
      </div>

      {expenseDetail ? (
        <PeriodExpenseShareDetailModal
          expenses={expenses}
          partners={partnerSlices}
          periodKey={expenseDetail.periodKey}
          title={expenseDetail.title}
          currency={currency}
          onClose={() => setExpenseDetail(null)}
        />
      ) : null}
      {supplierDetailOpen ? (
        <PeriodSupplierPayablesDetailModal
          suppliers={suppliers}
          partners={partnerSlices}
          currency={currency}
          onClose={() => setSupplierDetailOpen(false)}
        />
      ) : null}
      {partnerDetail && periodRange ? (
        <PartnerDetailReportModal
          partner={partnerDetail}
          periodStart={periodRange.start}
          periodEnd={periodRange.end}
          currency={currency}
          onClose={() => setPartnerDetail(null)}
        />
      ) : null}
    </div>
  );
}
