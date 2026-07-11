import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Table, Spin } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatNumber } from '../../utils/formatNumber';
import { expenseAPI } from '../../services/api/expenses';
import { salesAPI } from '../../services/api/sales';
import type { Sale } from '../../App';
import { localCalendarDateKey, localTodayDateKey, formatIsoDateTr, toSqlDateInputString } from '../../utils/localCalendarDate';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useLanguage } from '../../contexts/LanguageContext';

import {
  loadPeriodSummaryPartnerSplitPrefs,
  normalizePartnerSplitPrefs,
  partnerShareAmounts,
  savePeriodSummaryPartnerSplitPrefs,
  type PeriodSummaryPartnerSplitPrefs,
} from '../../utils/periodSummaryPartnerSplit';

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
  expenses: number;
  netRemaining: number;
  partnerShareMajor: number;
  partnerShareMinor: number;
}

function hasPeriodActivity(row: Pick<PeriodSummaryRow, 'saleCount' | 'revenue' | 'expenses'>): boolean {
  return row.saleCount > 0 || row.revenue > 0 || row.expenses > 0;
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

function aggregateSales(sales: Sale[], bucketKey: (s: Sale) => string) {
  const map = new Map<string, { saleCount: number; revenue: number; cash: number; card: number; discount: number }>();
  for (const s of sales) {
    if (isRemovedSaleStatus(s.status)) continue;
    const key = bucketKey(s);
    if (!key) continue;
    const row = map.get(key) || { saleCount: 0, revenue: 0, cash: 0, card: 0, discount: 0 };
    const total = Number(s.total) || 0;
    row.saleCount += 1;
    row.revenue += total;
    row.discount += Number(s.discount) || 0;
    const pm = String(s.paymentMethod ?? '');
    if (pm === 'cash') row.cash += total;
    else if (pm === 'card' || pm === 'gateway') row.card += total;
    map.set(key, row);
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
  const [expenses, setExpenses] = useState<Awaited<ReturnType<typeof expenseAPI.getAll>>>([]);
  const [partnerSplit, setPartnerSplit] = useState<PeriodSummaryPartnerSplitPrefs>(() =>
    loadPeriodSummaryPartnerSplitPrefs(),
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
      return;
    }
    setLoading(true);
    try {
      const [saleRows, expenseRows] = await Promise.all([
        salesAPI.getByDateRange(periodRange.start, periodRange.end),
        expenseAPI.getAll({ startDate: periodRange.start, endDate: periodRange.end }),
      ]);
      setSales(Array.isArray(saleRows) ? saleRows : []);
      setExpenses(Array.isArray(expenseRows) ? expenseRows : []);
    } catch (err) {
      console.error('[PeriodSummaryReport] yükleme hatası:', err);
      setSales([]);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [periodRange]);

  useEffect(() => {
    void loadData();
  }, [loadData, selectedFirm?.firm_nr]);

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

    const periodKeys =
      mode === 'monthly-days'
        ? daysInMonthKeys(parseInt(selectedMonth.slice(0, 4), 10), parseInt(selectedMonth.slice(5, 7), 10))
        : monthsInYearKeys(selectedYear);

    const locale = tm('localeCode') || 'tr-TR';

    return periodKeys.map((periodKey) => {
      const sale = saleMap.get(periodKey) || { saleCount: 0, revenue: 0, cash: 0, card: 0, discount: 0 };
      const exp = expenseMap.get(periodKey) || 0;
      const periodLabel =
        mode === 'monthly-days'
          ? formatIsoDateTr(periodKey)
          : new Date(`${periodKey}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

      const netRemaining = sale.revenue - exp;
      const shares = partnerShareAmounts(netRemaining, partnerSplit.majorPct, partnerSplit.minorPct);
      return {
        key: periodKey,
        periodKey,
        periodLabel,
        saleCount: sale.saleCount,
        revenue: sale.revenue,
        cash: sale.cash,
        card: sale.card,
        discount: sale.discount,
        expenses: exp,
        netRemaining,
        partnerShareMajor: shares.major,
        partnerShareMinor: shares.minor,
      };
    });
  }, [mode, periodRange, sales, expenses, selectedMonth, selectedYear, tm, partnerSplit.majorPct, partnerSplit.minorPct]);

  const totals = useMemo(() => {
    const base = rows.reduce(
      (acc, r) => ({
        saleCount: acc.saleCount + r.saleCount,
        revenue: acc.revenue + r.revenue,
        cash: acc.cash + r.cash,
        card: acc.card + r.card,
        discount: acc.discount + r.discount,
        expenses: acc.expenses + r.expenses,
        netRemaining: acc.netRemaining + r.netRemaining,
      }),
      { saleCount: 0, revenue: 0, cash: 0, card: 0, discount: 0, expenses: 0, netRemaining: 0 }
    );
    const shares = partnerShareAmounts(base.netRemaining, partnerSplit.majorPct, partnerSplit.minorPct);
    return {
      ...base,
      partnerShareMajor: shares.major,
      partnerShareMinor: shares.minor,
    };
  }, [rows, partnerSplit.majorPct, partnerSplit.minorPct]);

  const money = (v: number) => `${formatNumber(v, 0, false)} ${currency}`;

  const partnerMajorLabel = tm('rptPeriodColPartnerShare').replace('{pct}', String(partnerSplit.majorPct));
  const partnerMinorLabel = tm('rptPeriodColPartnerShare').replace('{pct}', String(partnerSplit.minorPct));

  const columns: ColumnsType<PeriodSummaryRow> = useMemo(() => {
    const base: ColumnsType<PeriodSummaryRow> = [
      {
        title: mode === 'monthly-days' ? tm('rptPeriodColDay') : tm('rptPeriodColMonth'),
        dataIndex: 'periodLabel',
        key: 'periodLabel',
        fixed: 'left',
        width: 160,
      },
      {
        title: tm('rptPeriodColSaleCount'),
        dataIndex: 'saleCount',
        key: 'saleCount',
        align: 'right',
        width: 90,
        render: (v: number) => (v > 0 ? v : '—'),
      },
      {
        title: `${tm('rptPeriodColRevenue')} (${currency})`,
        dataIndex: 'revenue',
        key: 'revenue',
        align: 'right',
        render: (v: number) => (v > 0 ? money(v) : '—'),
      },
      {
        title: `${tm('rptPeriodColCash')} (${currency})`,
        dataIndex: 'cash',
        key: 'cash',
        align: 'right',
        render: (v: number) => (v > 0 ? money(v) : '—'),
      },
      {
        title: `${tm('rptPeriodColCard')} (${currency})`,
        dataIndex: 'card',
        key: 'card',
        align: 'right',
        render: (v: number) => (v > 0 ? money(v) : '—'),
      },
      {
        title: `${tm('rptPeriodColDiscount')} (${currency})`,
        dataIndex: 'discount',
        key: 'discount',
        align: 'right',
        render: (v: number) => (v > 0 ? money(v) : '—'),
      },
      {
        title: `${tm('rptPeriodColExpenses')} (${currency})`,
        dataIndex: 'expenses',
        key: 'expenses',
        align: 'right',
        render: (v: number, row) => {
          if (!hasPeriodActivity(row)) return '—';
          return <span className="text-red-600">{money(v)}</span>;
        },
      },
      {
        title: `${tm('rptPeriodColNet')} (${currency})`,
        dataIndex: 'netRemaining',
        key: 'netRemaining',
        align: 'right',
        render: (v: number, row) => {
          if (!hasPeriodActivity(row)) return '—';
          const cls = v >= 0 ? 'text-emerald-700 font-semibold' : 'text-red-600 font-semibold';
          return <span className={cls}>{money(v)}</span>;
        },
      },
    ];

    if (!partnerSplit.enabled) return base;

    return [
      ...base,
      {
        title: `${partnerMajorLabel} (${currency})`,
        dataIndex: 'partnerShareMajor',
        key: 'partnerShareMajor',
        align: 'right',
        render: (v: number, row) => {
          if (!hasPeriodActivity(row)) return '—';
          return <span className="text-blue-700 font-medium">{money(v)}</span>;
        },
      },
      {
        title: `${partnerMinorLabel} (${currency})`,
        dataIndex: 'partnerShareMinor',
        key: 'partnerShareMinor',
        align: 'right',
        render: (v: number, row) => {
          if (!hasPeriodActivity(row)) return '—';
          return <span className="text-indigo-700 font-medium">{money(v)}</span>;
        },
      },
    ];
  }, [
    mode,
    currency,
    tm,
    money,
    partnerSplit.enabled,
    partnerMajorLabel,
    partnerMinorLabel,
  ]);

  const title = mode === 'monthly-days' ? tm('aylikGunOzeti') : tm('yillikAyOzeti');
  const subtitle = mode === 'monthly-days' ? tm('aylikGunOzetiDesc') : tm('yillikAyOzetiDesc');

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-6 h-6 text-blue-600 shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
              <p className="text-sm text-slate-500">{subtitle}</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <span className="font-medium whitespace-nowrap">
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
                className="px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
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
                className="w-28 px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
              />
            )}
          </label>
        </div>
      </div>

      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none font-medium text-slate-700">
          <input
            type="checkbox"
            checked={partnerSplit.enabled}
            onChange={(e) => updatePartnerSplit({ enabled: e.target.checked })}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          {tm('rptPeriodPartnerSplitEnable')}
        </label>
        {partnerSplit.enabled ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-600">{tm('rptPeriodPartnerShareMajorPct')}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={partnerSplit.majorPct}
                onChange={(e) => updatePartnerSplit({ majorPct: Number(e.target.value) })}
                className="w-16 px-2 py-1 border rounded text-sm text-center"
              />
              <span>%</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-slate-600">{tm('rptPeriodPartnerShareMinorPct')}</span>
              <input
                type="number"
                min={0}
                max={100}
                value={partnerSplit.minorPct}
                onChange={(e) => updatePartnerSplit({ minorPct: Number(e.target.value) })}
                className="w-16 px-2 py-1 border rounded text-sm text-center"
              />
              <span>%</span>
            </span>
            <span className="text-slate-500">
              {tm('rptPeriodPartnerSplitNoteDynamic')
                .replace('{major}', String(partnerSplit.majorPct))
                .replace('{minor}', String(partnerSplit.minorPct))}
            </span>
          </>
        ) : (
          <span>{tm('rptPeriodPartnerSplitDisabledHint')}</span>
        )}
      </p>

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${
          partnerSplit.enabled ? 'lg:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-2 xl:grid-cols-4'
        }`}
      >
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            {tm('rptPeriodTotalRevenue')}
          </div>
          <p className="text-2xl font-bold text-slate-800">{money(totals.revenue)}</p>
          <p className="text-xs text-slate-400 mt-1">
            {totals.saleCount} {tm('rptPeriodColSaleCount').toLowerCase()}
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <TrendingDown className="w-4 h-4 text-red-500" />
            {tm('rptPeriodTotalExpenses')}
          </div>
          <p className="text-2xl font-bold text-red-600">{money(totals.expenses)}</p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Wallet className="w-4 h-4 text-blue-600" />
            {tm('rptPeriodColNet')}
          </div>
          <p className={`text-2xl font-bold ${totals.netRemaining >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {money(totals.netRemaining)}
          </p>
        </div>
        {partnerSplit.enabled ? (
          <>
            <div className="bg-white rounded-lg border p-4 border-blue-100 bg-blue-50/40">
              <p className="text-slate-500 text-sm mb-1">{partnerMajorLabel}</p>
              <p className="text-2xl font-bold text-blue-700">{money(totals.partnerShareMajor)}</p>
            </div>
            <div className="bg-white rounded-lg border p-4 border-indigo-100 bg-indigo-50/40">
              <p className="text-slate-500 text-sm mb-1">{partnerMinorLabel}</p>
              <p className="text-2xl font-bold text-indigo-700">{money(totals.partnerShareMinor)}</p>
            </div>
          </>
        ) : null}
        <div className="bg-white rounded-lg border p-4">
          <p className="text-slate-500 text-sm mb-1">{tm('rptPeriodPaymentSplit')}</p>
          <p className="text-sm text-slate-700">
            {tm('rptPeriodColCash')}: <span className="font-semibold">{money(totals.cash)}</span>
          </p>
          <p className="text-sm text-slate-700">
            {tm('rptPeriodColCard')}: <span className="font-semibold">{money(totals.card)}</span>
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg border p-4">
        <Spin spinning={loading}>
          <Table<PeriodSummaryRow>
            columns={columns}
            dataSource={rows}
            pagination={false}
            size="small"
            scroll={{ x: 1280 }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row className="bg-slate-50 font-semibold">
                  <Table.Summary.Cell index={0}>{tm('rptPeriodTotalRow')}</Table.Summary.Cell>
                  <Table.Summary.Cell align="right">{totals.saleCount}</Table.Summary.Cell>
                  <Table.Summary.Cell align="right">{money(totals.revenue)}</Table.Summary.Cell>
                  <Table.Summary.Cell align="right">{money(totals.cash)}</Table.Summary.Cell>
                  <Table.Summary.Cell align="right">{money(totals.card)}</Table.Summary.Cell>
                  <Table.Summary.Cell align="right">{money(totals.discount)}</Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    <span className="text-red-600">{money(totals.expenses)}</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell align="right">
                    <span className={totals.netRemaining >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {money(totals.netRemaining)}
                    </span>
                  </Table.Summary.Cell>
                  {partnerSplit.enabled ? (
                    <>
                      <Table.Summary.Cell align="right">
                        <span className="text-blue-700">{money(totals.partnerShareMajor)}</span>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell align="right">
                        <span className="text-indigo-700">{money(totals.partnerShareMinor)}</span>
                      </Table.Summary.Cell>
                    </>
                  ) : null}
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </Spin>
      </div>
    </div>
  );
}
