import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, PhoneMissed, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { usePermission } from '../../../shared/hooks/usePermission';
import { formatLocalYmd } from '../../../utils/dateLocal';
import { localTodayDateKey } from '../../../utils/localCalendarDate';
import { formatReportDateCell } from '../../../utils/dateLocale';
import { ReportYmdDatePicker } from '../../shared/ReportDateRangePresets';
import type { BeautyFollowUpReminder } from '../../../types/beauty';
import {
  filterOverdueUncalledFollowUps,
  followUpDaysOverdue,
} from '../../../utils/beautyFollowUpReminderUtils';
import { FollowUpReminderActionModal } from './FollowUpReminderActionModal';
import { ReportKpiStrip } from '../../reports/shared/ReportKpiStrip';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';
import { cn } from '../../ui/utils';

type OverdueFollowUpGridRow = BeautyFollowUpReminder & {
  grid_id: string;
  days_overdue: number;
  subject: string;
  kind_label: string;
  status: string;
};

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
  const { isAdmin } = usePermission();
  const canExportExcel = isAdmin();
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
  const inputCls = darkMode
    ? 'border-gray-600 bg-gray-900 text-gray-100'
    : 'border-gray-200 bg-white text-gray-700';

  const handleExport = () => {
    if (!canExportExcel) {
      toast.error(tm('excelExportAdminOnly'));
      return;
    }
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

  const gridRows = useMemo<OverdueFollowUpGridRow[]>(
    () =>
      rows.map((r) => {
        const grid_id = `${r.customer_id}|${r.service_id}|${r.product_id ?? ''}|${r.last_completed_date}|${r.due_date}|${r.reminder_kind ?? 'service'}`;
        return {
          ...r,
          grid_id,
          days_overdue: followUpDaysOverdue(r.due_date, todayYmd),
          subject: subjectLabel(r),
          kind_label:
            r.reminder_kind === 'product'
              ? tm('bOverdueUncalledKindProduct')
              : tm('bOverdueUncalledKindService'),
          status: statusLabel(r.follow_up_status),
        };
      }),
    [rows, todayYmd, tm, statusLabel],
  );

  const gridColumns = useMemo<ReportColumnTableCol<OverdueFollowUpGridRow>[]>(
    () => [
      {
        key: 'due_date',
        header: tm('date'),
        type: 'date',
        size: 110,
        cell: (r) => (
          <span className="font-semibold tabular-nums">{formatReportDateCell(r.due_date)}</span>
        ),
      },
      {
        key: 'days_overdue',
        header: tm('bOverdueUncalledDaysCol'),
        type: 'number',
        align: 'right',
        size: 90,
        cell: (r) => <span className="font-black text-rose-600 tabular-nums">{r.days_overdue}</span>,
      },
      {
        key: 'customer_name',
        header: tm('customer'),
        size: 160,
        cell: (r) => <span className="font-bold">{r.customer_name || '—'}</span>,
      },
      {
        key: 'customer_phone',
        header: tm('bPhone'),
        size: 130,
        cell: (r) => <span className="font-semibold tabular-nums">{r.customer_phone || '—'}</span>,
      },
      { key: 'subject', header: tm('bOverdueUncalledSubjectCol'), size: 180 },
      { key: 'kind_label', header: tm('bOverdueUncalledKindCol'), size: 120 },
      { key: 'status', header: tm('bFollowUpStatusLabel'), size: 130 },
      {
        key: 'note',
        header: tm('bFollowUpNoteLabel'),
        size: 200,
        cell: (r) => (
          <span className={cn('text-xs max-w-[220px] truncate block', muted)} title={r.note}>
            {r.note?.trim() || '—'}
          </span>
        ),
      },
      {
        key: 'last_completed_date',
        header: tm('bOverdueUncalledLastCompletedCol'),
        type: 'date',
        size: 120,
      },
      {
        key: 'grid_id',
        header: '',
        size: 100,
        cell: (r) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActionTarget(r);
            }}
            className="text-xs font-extrabold text-rose-600 hover:text-rose-700 underline-offset-2 hover:underline"
          >
            {tm('bFollowUpManage')}
          </button>
        ),
      },
    ],
    [tm, muted],
  );

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
              <ReportYmdDatePicker value={startYmd} onChange={setStartYmd} className="min-w-[9.5rem]" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={cn('text-[10px] font-bold uppercase tracking-wider', muted)}>{tm('bToDate')}</span>
              <ReportYmdDatePicker value={endYmd} onChange={setEndYmd} className="min-w-[9.5rem]" />
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
            {canExportExcel && (
              <button
                type="button"
                onClick={handleExport}
                disabled={rows.length === 0}
                className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-2"
              >
                <Download size={14} />
                Excel / CSV
              </button>
            )}
          </div>
        </div>
      </div>

      <ReportKpiStrip
        columns={2}
        itemClassName={cn('shadow-sm', panel)}
        items={[
          {
            key: 'total',
            label: tm('bOverdueUncalledTotal'),
            value: rows.length,
            valueClassName: 'text-rose-600',
          },
          {
            key: 'avg',
            label: tm('bOverdueUncalledAvgDays'),
            value:
              rows.length === 0
                ? '—'
                : Math.round(
                    rows.reduce((s, r) => s + followUpDaysOverdue(r.due_date, todayYmd), 0) / rows.length,
                  ),
          },
        ]}
      />

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
          <div className="p-4">
            <ReportColumnTable
              data={gridRows}
              columns={gridColumns}
              height={560}
              storageNamespace="beauty-overdue-uncalled"
            />
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
