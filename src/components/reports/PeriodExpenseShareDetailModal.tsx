import { useMemo, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import {
  PercentBodyModal,
  PercentBodyModalScrollBody,
} from '../shared/PercentBodyModal';
import { formatNumber } from '../../utils/formatNumber';
import { toSqlDateInputString } from '../../utils/localCalendarDate';
import { splitAmountByPartners, type PeriodPartnerShareSlice } from '../../utils/periodSummaryPartnerSplit';
import type { Expense } from '../../services/api/expenses';
import { useLanguage } from '../../contexts/LanguageContext';
import { ReportColumnTable, type ReportColumnTableCol } from './shared/ReportDataGrid';

export type PeriodExpenseShareDetailScope = {
  title: string;
  periodKey: string | null;
};

type Props = {
  expenses: Expense[];
  partners: PeriodPartnerShareSlice[];
  periodKey: string | null;
  title: string;
  currency: string;
  onClose: () => void;
};

function expensePeriodKey(e: Expense, yearlyMonths: boolean): string {
  const day = toSqlDateInputString(e.expense_date || '') || '';
  return yearlyMonths ? day.slice(0, 7) : day;
}

export function PeriodExpenseShareDetailModal({
  expenses,
  partners,
  periodKey,
  title,
  currency,
  onClose,
}: Props) {
  const { tm } = useLanguage();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const scoped = useMemo(() => {
    if (!periodKey) return expenses;
    return expenses.filter((e) => expensePeriodKey(e, periodKey.length === 7) === periodKey);
  }, [expenses, periodKey]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of scoped) {
      const c = String(e.category || '').trim();
      if (c) set.add(c);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [scoped]);

  const visiblePartners = useMemo(
    () => (partnerId ? partners.filter((p) => p.id === partnerId) : partners),
    [partners, partnerId],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return scoped.filter((e) => {
      const day = toSqlDateInputString(e.expense_date || '') || '';
      if (category && String(e.category || '') !== category) return false;
      if (dateFrom && day && day < dateFrom) return false;
      if (dateTo && day && day > dateTo) return false;
      if (!q) return true;
      const blob = `${e.category || ''} ${e.description || ''} ${e.notes || ''} ${e.document_number || ''}`.toLocaleLowerCase('tr-TR');
      return blob.includes(q);
    });
  }, [scoped, search, category, dateFrom, dateTo]);

  const money = (v: number) => `${formatNumber(v, 0, false)} ${currency}`;

  type ExpenseGridRow = Expense & { expenseDay: string; amountNum: number; [key: string]: unknown };

  const gridRows = useMemo((): ExpenseGridRow[] => {
    return rows.map((e) => {
      const shares = splitAmountByPartners(
        Number(e.amount) || 0,
        visiblePartners.length ? visiblePartners : partners,
      );
      const partnerFields: Record<string, number> = {};
      for (const p of visiblePartners) {
        partnerFields[`share_${p.id}`] = shares.find((s) => s.id === p.id)?.amount ?? 0;
      }
      return {
        ...e,
        expenseDay: toSqlDateInputString(e.expense_date || '') || '—',
        amountNum: Number(e.amount) || 0,
        ...partnerFields,
      };
    });
  }, [rows, visiblePartners, partners]);

  const tableColumns = useMemo((): ReportColumnTableCol<ExpenseGridRow>[] => {
    const cols: ReportColumnTableCol<ExpenseGridRow>[] = [
      { key: 'expenseDay', header: tm('dateLabel'), type: 'date', size: 110 },
      { key: 'category', header: tm('rptPeriodFilterCategory'), size: 120 },
      {
        key: 'description',
        header: tm('description'),
        size: 200,
        cell: (e) => (
          <span className="max-w-xs truncate block" title={e.description}>
            {e.description || '—'}
          </span>
        ),
      },
      {
        key: 'amountNum',
        header: `${tm('rptPeriodColExpenses')} (${currency})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => <span className="font-bold text-blue-900">{money(n)}</span>,
        cell: (e) => <span className="font-mono font-semibold text-red-600">{money(e.amountNum)}</span>,
      },
    ];
    for (const p of visiblePartners) {
      cols.push({
        key: `share_${p.id}`,
        header: `${p.name} (%${p.sharePct})`,
        type: 'number',
        align: 'right',
        footerSum: true,
        footerFormat: (n) => <span className="font-bold text-blue-900">{money(n)}</span>,
        cell: (e) => (
          <span className="font-mono text-rose-700">{money(Number(e[`share_${p.id}`]) || 0)}</span>
        ),
      });
    }
    return cols;
  }, [visiblePartners, tm, currency, money]);

  return (
    <PercentBodyModal onClose={onClose} size="wide" ariaLabel={title}>
      <div className="flex min-h-0 h-full flex-col">
        <div className="shrink-0 bg-gradient-to-r from-rose-600 to-orange-600 px-5 py-3 text-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-rose-100">{tm('rptPeriodExpenseDetailKicker')}</p>
            <h2 className="truncate text-lg font-bold">{title}</h2>
            <p className="text-xs text-rose-100 mt-0.5">{tm('rptPeriodExpenseDetailHint')}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 hover:bg-white/10" aria-label={tm('close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <label className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tm('rptPeriodFilterSearch')}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm"
            />
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">{tm('rptPeriodFilterAllCategories')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">{tm('rptPeriodFilterAllPartners')}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (%{p.sharePct})</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>

        <PercentBodyModalScrollBody>
          {rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">{tm('noRecordFound')}</div>
          ) : (
            <ReportColumnTable
              data={gridRows}
              columns={tableColumns}
              height={420}
              footerLabel={
                <>
                  {tm('invoiceListDipTotal')}
                  <span className="ml-1 font-semibold text-blue-600/80">({rows.length})</span>
                </>
              }
              storageNamespace="period-expense-share-detail"
            />
          )}
        </PercentBodyModalScrollBody>

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2 text-[11px] text-slate-500 flex items-center gap-2">
          <Filter className="h-3.5 w-3.5" />
          {tm('rptPeriodExpenseDetailHint')}
        </div>
      </div>
    </PercentBodyModal>
  );
}
