import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, PhoneMissed, RefreshCw, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { formatLocalYmd } from '../../../utils/dateLocal';
import { localTodayDateKey } from '../../../utils/localCalendarDate';
import type { BeautyFollowUpReminder } from '../../../types/beauty';
import {
  filterOverdueUncalledFollowUps,
  followUpDaysOverdue,
} from '../../../utils/beautyFollowUpReminderUtils';
import { FollowUpReminderActionModal } from './FollowUpReminderActionModal';
import { cn } from '../../ui/utils';

function defaultRange(): { start: string; end: string } {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start: formatLocalYmd(start), end: formatLocalYmd(end) };
}

function exportCsv(fileName: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function subjectLabel(r: BeautyFollowUpReminder): string {
  if (r.reminder_kind === 'product' && r.product_name?.trim()) {
    return r.product_name.trim();
  }
  return (r.service_name ?? '').trim() || '—';
}

export function OverdueUncalledFollowUpReport() {
  const { tm } = useLanguage();
  const { darkMode } = useTheme();
  const initial = useMemo(() => defaultRange(), []);
  const [startYmd, setStartYmd] = useState(initial.start);
  const [endYmd, setEndYmd] = useState(initial.end);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<BeautyFollowUpReminder[]>([]);
  const [actionTarget, setActionTarget] = useState<BeautyFollowUpReminder | null>(null);

  const todayYmd = localTodayDateKey();

  const statusLabel = useCallback(
    (status: BeautyFollowUpReminder['follow_up_status']) => {
      switch (status) {
        case 'postponed':
          return tm('bFollowUpStatusPostponed');
        case 'other':
          return tm('bFollowUpStatusOther');
        case 'contacted':
          return tm('bFollowUpStatusContacted');
        case 'dismissed':
          return tm('bFollowUpStatusDismissed');
        default:
          return tm('bFollowUpStatusDue');
      }
    },
    [tm],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = startYmd <= endYmd ? startYmd : endYmd;
      const to = startYmd <= endYmd ? endYmd : startYmd;
      const all = await beautyService.getFollowUpRemindersInRange(from, to);
      setRows(filterOverdueUncalledFollowUps(all, todayYmd));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setRows([]);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [startYmd, endYmd, todayYmd]);

  useEffect(() => {
    void load();
  }, [load]);

  const panel = darkMode ? 'bg-gray-800 border-gray-700 text-gray-100' : 'bg-white border-gray-100 text-gray-900';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-500';
  const tableWrap = darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100';
  const thCls = darkMode ? 'bg-gray-900/60 text-gray-300' : 'bg-gray-50/70 text-gray-400';
  const rowHover = darkMode ? 'hover:bg-gray-700/40' : 'hover:bg-rose-50/40';
  const borderRow = darkMode ? 'divide-gray-700' : 'divide-gray-100';
  const inputCls = darkMode
    ? 'border-gray-600 bg-gray-900 text-gray-100'
    : 'border-gray-200 bg-white text-gray-700';

  const handleExport = () => {
    exportCsv(
      `gunu-gecmis-aranmayanlar_${startYmd}_${endYmd}`,
      [
        tm('date'),
        tm('bOverdueUncalledDaysCol'),
        tm('customer'),
        tm('bPhone'),
        tm('bOverdueUncalledSubjectCol'),
        tm('bOverdueUncalledKindCol'),
        tm('bFollowUpStatusLabel'),
        tm('bFollowUpNoteLabel'),
        tm('bOverdueUncalledLastCompletedCol'),
      ],
      rows.map((r) => [
        r.due_date,
        String(followUpDaysOverdue(r.due_date, todayYmd)),
        r.customer_name ?? '',
        r.customer_phone ?? '',
        subjectLabel(r),
        r.reminder_kind === 'product' ? tm('bOverdueUncalledKindProduct') : tm('bOverdueUncalledKindService'),
        statusLabel(r.follow_up_status),
        r.note ?? '',
        r.last_completed_date,
      ]),
    );
    toast.success(tm('bOverdueUncalledExportOk'));
  };

  return (
    <div className={cn('p-6 space-y-6 min-h-full', darkMode ? 'bg-gray-900' : 'bg-gray-50')}>
      <div className={cn('rounded-3xl border p-6 shadow-sm', panel)}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <PhoneMissed size={22} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-black truncate">{tm('bOverdueUncalledReportTitle')}</h2>
              <p className={cn('text-xs font-semibold', muted)}>{tm('bOverdueUncalledReportSubtitle')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className={cn('text-[10px] font-bold uppercase tracking-wider', muted)}>{tm('date')}</span>
              <div className={cn('flex items-center gap-2 border rounded-xl px-3 py-2', inputCls)}>
                <CalendarDays size={14} className="text-rose-600 shrink-0" />
                <input
                  type="date"
                  value={startYmd}
                  onChange={(e) => setStartYmd(e.target.value)}
                  className="text-xs font-bold outline-none bg-transparent min-w-0"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className={cn('text-[10px] font-bold uppercase tracking-wider', muted)}>{tm('bToDate')}</span>
              <div className={cn('flex items-center gap-2 border rounded-xl px-3 py-2', inputCls)}>
                <CalendarDays size={14} className="text-rose-600 shrink-0" />
                <input
                  type="date"
                  value={endYmd}
                  onChange={(e) => setEndYmd(e.target.value)}
                  className="text-xs font-bold outline-none bg-transparent min-w-0"
                />
              </div>
            </label>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white text-xs font-extrabold flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {loading ? tm('bLoading') : tm('bRunReport')}
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={rows.length === 0}
              className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-2"
            >
              <Download size={14} />
              Excel / CSV
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={cn('rounded-2xl border p-5 shadow-sm', panel)}>
          <p className={cn('text-[10px] font-black uppercase tracking-[0.18em]', muted)}>
            {tm('bOverdueUncalledTotal')}
          </p>
          <p className="text-2xl font-black text-rose-600 mt-2 tabular-nums">{rows.length}</p>
        </div>
        <div className={cn('rounded-2xl border p-5 shadow-sm', panel)}>
          <p className={cn('text-[10px] font-black uppercase tracking-[0.18em]', muted)}>
            {tm('bOverdueUncalledAvgDays')}
          </p>
          <p className="text-2xl font-black mt-2 tabular-nums">
            {rows.length === 0
              ? '—'
              : Math.round(
                  rows.reduce((s, r) => s + followUpDaysOverdue(r.due_date, todayYmd), 0) / rows.length,
                )}
          </p>
        </div>
      </div>

      <div className={cn('rounded-3xl border shadow-sm overflow-hidden', tableWrap)}>
        <div className={cn('px-6 py-4 border-b flex items-center gap-2 font-black', darkMode ? 'border-gray-700' : 'border-gray-100')}>
          <PhoneMissed size={16} className="text-rose-600" />
          {tm('bOverdueUncalledListTitle')}
        </div>
        {error ? (
          <div className="p-6 text-sm font-semibold text-red-600">{error}</div>
        ) : loading && rows.length === 0 ? (
          <div className={cn('p-10 text-center text-sm font-bold flex items-center justify-center gap-2', muted)}>
            <Loader2 size={18} className="animate-spin" />
            {tm('bLoadingReport')}
          </div>
        ) : rows.length === 0 ? (
          <div className={cn('p-10 text-center text-sm font-bold', muted)}>{tm('bOverdueUncalledEmpty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[960px]">
              <thead className={thCls}>
                <tr>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]">{tm('date')}</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]">{tm('bOverdueUncalledDaysCol')}</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]">{tm('customer')}</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]">{tm('bPhone')}</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]">{tm('bOverdueUncalledSubjectCol')}</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]">{tm('bOverdueUncalledKindCol')}</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]">{tm('bFollowUpStatusLabel')}</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]">{tm('bFollowUpNoteLabel')}</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]">{tm('bOverdueUncalledLastCompletedCol')}</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-[0.16em]" />
                </tr>
              </thead>
              <tbody className={cn('divide-y', borderRow)}>
                {rows.map((r) => {
                  const days = followUpDaysOverdue(r.due_date, todayYmd);
                  const key = `${r.customer_id}|${r.service_id}|${r.product_id ?? ''}|${r.last_completed_date}|${r.due_date}|${r.reminder_kind ?? 'service'}`;
                  return (
                    <tr key={key} className={rowHover}>
                      <td className="px-4 py-3 font-semibold tabular-nums">{r.due_date}</td>
                      <td className="px-4 py-3 font-black text-rose-600 tabular-nums">{days}</td>
                      <td className="px-4 py-3 font-bold">{r.customer_name || '—'}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{r.customer_phone || '—'}</td>
                      <td className="px-4 py-3 font-semibold">{subjectLabel(r)}</td>
                      <td className="px-4 py-3 text-xs font-bold">
                        {r.reminder_kind === 'product'
                          ? tm('bOverdueUncalledKindProduct')
                          : tm('bOverdueUncalledKindService')}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold">{statusLabel(r.follow_up_status)}</td>
                      <td className={cn('px-4 py-3 text-xs max-w-[220px] truncate', muted)} title={r.note}>
                        {r.note?.trim() || '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{r.last_completed_date}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setActionTarget(r)}
                          className="text-xs font-extrabold text-rose-600 hover:text-rose-700 underline-offset-2 hover:underline"
                        >
                          {tm('bFollowUpManage')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FollowUpReminderActionModal
        open={actionTarget != null}
        reminder={actionTarget}
        onClose={() => setActionTarget(null)}
        onSaved={() => void load()}
        labels={{
          title: tm('bFollowUpModalTitle'),
          status: tm('bFollowUpStatusLabel'),
          statusDue: tm('bFollowUpStatusDue'),
          statusPostponed: tm('bFollowUpStatusPostponed'),
          statusContacted: tm('bFollowUpStatusContacted'),
          statusOther: tm('bFollowUpStatusOther'),
          statusDismissed: tm('bFollowUpStatusDismissed'),
          note: tm('bFollowUpNoteLabel'),
          notePlaceholder: tm('bFollowUpNotePlaceholder'),
          postponeDate: tm('bFollowUpPostponeDate'),
          naturalDueLabel: tm('bFollowUpNaturalDueLabel'),
          showNaturalWhenPostponed: tm('bFollowUpShowNaturalWhenPostponed'),
          showNaturalWhenPostponedHint: tm('bFollowUpShowNaturalWhenPostponedHint'),
          cancel: tm('bFollowUpModalCancel'),
          save: tm('bFollowUpModalSave'),
          saving: tm('bFollowUpModalSaving'),
        }}
      />
    </div>
  );
}
