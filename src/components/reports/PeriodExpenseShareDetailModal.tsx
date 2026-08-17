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

  const dip = useMemo(() => {
    const amount = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const byId: Record<string, number> = {};
    for (const p of visiblePartners) byId[p.id] = 0;
    for (const e of rows) {
      const shares = splitAmountByPartners(
        Number(e.amount) || 0,
        visiblePartners.length ? visiblePartners : partners,
      );
      for (const s of shares) byId[s.id] = (byId[s.id] || 0) + s.amount;
    }
    return { amount, byId };
  }, [rows, visiblePartners, partners]);

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
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">{tm('dateLabel')}</th>
                  <th className="px-3 py-2 text-left">{tm('rptPeriodFilterCategory')}</th>
                  <th className="px-3 py-2 text-left">{tm('description')}</th>
                  <th className="px-3 py-2 text-right">{tm('rptPeriodColExpenses')} ({currency})</th>
                  {visiblePartners.map((p) => (
                    <th key={p.id} className="px-3 py-2 text-right">
                      {p.name} (%{p.sharePct})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const shares = splitAmountByPartners(Number(e.amount) || 0, visiblePartners.length ? visiblePartners : partners);
                  const byId: Record<string, number> = {};
                  for (const s of shares) byId[s.id] = s.amount;
                  const day = toSqlDateInputString(e.expense_date || '') || '—';
                  return (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs text-slate-600 whitespace-nowrap">{day}</td>
                      <td className="px-3 py-2">{e.category || '—'}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-xs truncate" title={e.description}>{e.description || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-red-600">{money(Number(e.amount) || 0)}</td>
                      {visiblePartners.map((p) => (
                        <td key={p.id} className="px-3 py-2 text-right font-mono text-rose-700">
                          {money(byId[p.id] ?? 0)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-[2] border-t-2 border-blue-300 bg-blue-50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-[11px] font-black uppercase tracking-wider text-blue-800">
                    {tm('invoiceListDipTotal')}
                    <span className="ml-1 font-semibold text-blue-600/80">({rows.length})</span>
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums text-blue-900">{money(dip.amount)}</td>
                  {visiblePartners.map((p) => (
                    <td key={p.id} className="px-3 py-2 text-right font-bold tabular-nums text-blue-900">
                      {money(dip.byId[p.id] ?? 0)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
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
