import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarClock, Clock3, Loader2, RefreshCw, UserRoundX, Users } from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import type { BeautyAppointment } from '../../../types/beauty';
import { formatNumber } from '../../../utils/formatNumber';
import { defaultReportDateRange } from '../../../utils/reportDatePresets';
import { ReportDateRangePresets } from '../../shared/ReportDateRangePresets';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';
import { donutShareLabel } from '../../reports/donutShareLabel';
import { cn } from '../../ui/utils';
import {
  APPOINTMENT_REPORT_BUCKETS,
  appointmentPeriodDelta,
  buildAppointmentReport,
  previousAppointmentPeriod,
  type AppointmentReportBucket,
  type AppointmentReportInput,
} from '../../../utils/appointmentReport';

const BUCKET_COLOR: Record<AppointmentReportBucket, string> = {
  new: '#7c3aed',
  confirmed: '#2563eb',
  prepaid: '#0891b2',
  started: '#d97706',
  came: '#16a34a',
  noShow: '#dc2626',
  cancelled: '#64748b',
  other: '#94a3b8',
};

function toInput(row: BeautyAppointment): AppointmentReportInput {
  return {
    id: row.id,
    date: row.date || row.appointment_date || '',
    time: row.time || row.appointment_time || '',
    duration: row.duration,
    status: row.status,
    staffId: row.staff_id || row.specialist_id || '',
    staffName: row.specialist_name || row.staff_name || '',
  };
}

function formatRatio(value: number | null): string {
  if (value == null) return '—';
  const rounded = Math.round(value * 10) / 10;
  const whole = Math.abs(rounded - Math.trunc(rounded)) < 0.05;
  return `%${formatNumber(rounded, whole ? 0 : 1, !whole)}`;
}

function formatDelta(value: number | null): string | null {
  if (value == null) return null;
  const rounded = Math.round(value * 10) / 10;
  const whole = Math.abs(rounded - Math.trunc(rounded)) < 0.05;
  const body = formatNumber(Math.abs(rounded), whole ? 0 : 1, !whole);
  if (rounded > 0) return `▲ %${body}`;
  if (rounded < 0) return `▼ %${body}`;
  return `%${body}`;
}

function dayLabel(ymd: string, language: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const locale = language === 'en' ? 'en-US' : language === 'ar' ? 'ar-SA' : 'tr-TR';
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
  } catch {
    return `${Number(match[3])}.${Number(match[2])}`;
  }
}

function readBucket(data: unknown): AppointmentReportBucket | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as { key?: unknown; payload?: { key?: unknown } };
  const key = typeof row.key === 'string'
    ? row.key
    : typeof row.payload?.key === 'string'
      ? row.payload.key
      : '';
  return (APPOINTMENT_REPORT_BUCKETS as readonly string[]).includes(key)
    ? (key as AppointmentReportBucket)
    : null;
}

type StaffGridRow = {
  id: string;
  staffName: string;
  appointments: number;
  retention: number | null;
};

/**
 * Güzellik randevu raporu. Kayıt yoksa boş durum.
 * Durum dilimi yalnız ekranı süzer; kayıt yazılmaz.
 */
export function AppointmentReport() {
  const { tm, language } = useLanguage();
  const { darkMode } = useTheme();
  const [range, setRange] = useState(() => defaultReportDateRange('month'));
  const [rows, setRows] = useState<AppointmentReportInput[]>([]);
  const [previousRows, setPreviousRows] = useState<AppointmentReportInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<AppointmentReportBucket | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError('');
    const prev = previousAppointmentPeriod(range.from, range.to);
    Promise.all([
      beautyService.getAppointmentsInRange(range.from, range.to),
      beautyService.getAppointmentsInRange(prev.from, prev.to),
    ])
      .then(([current, prior]) => {
        if (cancel) return;
        setRows((current || []).map(toInput));
        setPreviousRows((prior || []).map(toInput));
        setStatus(null);
      })
      .catch((err: unknown) => {
        if (cancel) return;
        setRows([]);
        setPreviousRows([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [range.from, range.to, reloadKey]);

  const bucketLabel = (key: AppointmentReportBucket): string => {
    if (key === 'new') return tm('bCrcStateNew');
    if (key === 'confirmed') return tm('bCrcStateConfirmed');
    if (key === 'prepaid') return tm('bApptReportStatusPrepaid');
    if (key === 'started') return tm('bApptReportStatusStarted');
    if (key === 'came') return tm('bCrcStateArrived');
    if (key === 'noShow') return tm('bCrcStateNoShow');
    if (key === 'cancelled') return tm('bCrcStateCancelled');
    return tm('bApptReportStatusOther');
  };

  const previous = useMemo(
    () => previousAppointmentPeriod(range.from, range.to),
    [range.from, range.to],
  );
  const model = useMemo(
    () => buildAppointmentReport(rows, { from: range.from, to: range.to, status }),
    [rows, range.from, range.to, status],
  );
  const priorModel = useMemo(
    () => buildAppointmentReport(previousRows, { from: previous.from, to: previous.to }),
    [previous.from, previous.to, previousRows],
  );
  const delta = useMemo(
    () => appointmentPeriodDelta(model.summary, priorModel.summary),
    [model.summary, priorModel.summary],
  );

  const card = darkMode
    ? 'rounded-xl border border-slate-700 bg-slate-900'
    : 'rounded-xl border border-slate-200 bg-white';
  const muted = darkMode ? 'text-slate-400' : 'text-slate-500';
  const ink = darkMode ? 'text-slate-100' : 'text-slate-900';

  const trendRows = model.trend.map((point) => ({
    ...point,
    label: dayLabel(point.date, language),
  }));
  const showFocus = trendRows.some((point) => point.focus > 0);
  const hourRows = model.hours.map((point) => ({
    ...point,
    label: `${String(point.hour).padStart(2, '0')}:00`,
  }));
  const chartSlices = model.summary.slices.filter((slice) => slice.inChart);
  const staffRows: StaffGridRow[] = model.staff.map((row) => ({
    id: row.id,
    staffName: row.name || tm('bApptReportUnnamedStaff'),
    appointments: row.appointments,
    retention: row.retention,
  }));
  const staffColumns: ReportColumnTableCol<StaffGridRow>[] = [
    { key: 'staffName', header: tm('bApptReportStaffCol'), size: 220 },
    {
      key: 'appointments',
      header: tm('bApptReportCountCol'),
      type: 'number',
      align: 'right',
      size: 120,
      footerSum: true,
      footerFormat: (sum) => formatNumber(sum, 0, false),
      cell: (row) => formatNumber(row.appointments, 0, false),
    },
    {
      key: 'retention',
      header: tm('bApptReportRetentionCol'),
      type: 'number',
      align: 'right',
      size: 120,
      cell: (row) => formatRatio(row.retention),
    },
  ];

  const toggle = (key: AppointmentReportBucket) => {
    setStatus((current) => (current === key ? null : key));
  };

  const kpis = [
    {
      key: 'total',
      label: tm('bApptReportTotal'),
      value: formatNumber(model.summary.total, 0, false),
      delta: delta.total,
      icon: CalendarClock,
      wrap: 'bg-violet-50 text-violet-700',
      iconWrap: 'bg-violet-600',
    },
    {
      key: 'retention',
      label: tm('bApptReportRetention'),
      value: formatRatio(model.summary.retention),
      delta: delta.retention,
      icon: Users,
      wrap: 'bg-emerald-50 text-emerald-700',
      iconWrap: 'bg-emerald-600',
    },
    {
      key: 'miss',
      label: tm('bApptReportCancelNoShow'),
      value: formatNumber(model.summary.cancelNoShow, 0, false),
      delta: delta.cancelNoShow,
      icon: UserRoundX,
      wrap: 'bg-rose-50 text-rose-700',
      iconWrap: 'bg-rose-600',
    },
    {
      key: 'duration',
      label: tm('bApptReportAvgMinutes'),
      value: model.summary.avgDurationMinutes == null
        ? '—'
        : `${formatNumber(model.summary.avgDurationMinutes, 0, false)} ${tm('bApptReportMinuteSuffix')}`,
      delta: delta.avgDuration,
      icon: Clock3,
      wrap: 'bg-slate-100 text-slate-700',
      iconWrap: 'bg-slate-800',
    },
  ];

  return (
    <div data-testid="appointment-report" className="space-y-4">
      <div className={cn(card, 'flex flex-wrap items-end justify-between gap-3 px-4 py-3')}>
        <ReportDateRangePresets value={range} onChange={setRange} tm={tm} />
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          {tm('bCrcRefresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;
          const deltaText = formatDelta(item.delta);
          const deltaClass = item.delta == null
            ? muted
            : item.delta > 0
              ? 'text-emerald-600'
              : item.delta < 0
                ? 'text-rose-600'
                : muted;
          return (
            <article key={item.key} className={cn('rounded-xl border border-slate-200 px-4 py-3', item.wrap, darkMode && 'border-slate-700')}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide">{item.label}</p>
                <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg text-white', item.iconWrap)}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{item.value}</p>
              <p className={cn('mt-1 text-xs font-semibold', deltaClass)}>
                {deltaText ?? tm('bApptReportNoBaseline')}
              </p>
              <p className={cn('text-[11px]', muted)}>{tm('bApptReportVsPrevious')}</p>
            </article>
          );
        })}
      </div>

      {loading && rows.length === 0 ? (
        <div className={cn(card, 'flex items-center justify-center gap-2 px-4 py-16 text-sm', muted)}>
          <Loader2 className="h-4 w-4 animate-spin" />
          {tm('bApptReportLoading')}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {tm('bApptReportLoadFailed')}
        </div>
      ) : null}

      {!loading && !error && model.summary.total === 0 ? (
        <div data-testid="appointment-report-empty" className={cn(card, 'px-4 py-16 text-center text-sm', muted)}>
          {tm('bApptReportEmpty')}
        </div>
      ) : null}

      {model.summary.total > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className={cn(card, 'p-4')}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className={cn('text-base font-semibold', ink)}>{tm('bApptReportStatusMix')}</h3>
                {status ? (
                  <button
                    type="button"
                    onClick={() => setStatus(null)}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                  >
                    {bucketLabel(status)} ×
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
                <div className="relative h-[340px] min-w-0">
                  {chartSlices.length === 0 ? (
                    <div className={cn('flex h-full items-center justify-center text-sm', muted)}>{tm('bApptReportEmpty')}</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart>
                        <Pie
                          data={chartSlices.map((slice) => ({
                            key: slice.key,
                            name: bucketLabel(slice.key),
                            count: slice.count,
                            sharePercent: slice.sharePercent,
                            fill: BUCKET_COLOR[slice.key],
                          }))}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="60%"
                          outerRadius="94%"
                          startAngle={90}
                          endAngle={-270}
                          paddingAngle={chartSlices.length > 1 ? 1.2 : 0}
                          stroke={darkMode ? '#0f172a' : '#ffffff'}
                          strokeWidth={2}
                          isAnimationActive={false}
                          label={donutShareLabel}
                          labelLine={false}
                          onClick={(data) => {
                            const key = readBucket(data);
                            if (key) toggle(key);
                          }}
                        >
                          {chartSlices.map((slice) => (
                            <Cell
                              key={slice.key}
                              fill={BUCKET_COLOR[slice.key]}
                              fillOpacity={!status || status === slice.key ? 1 : 0.28}
                              style={{ cursor: 'pointer' }}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
                    <div>
                      <p className={cn('text-xs', muted)}>{tm('bApptReportCenterTotal')}</p>
                      <p className={cn('text-3xl font-semibold tabular-nums', ink)}>
                        {formatNumber(model.summary.total, 0, false)}
                      </p>
                    </div>
                  </div>
                </div>
                <ul className="space-y-1" data-testid="appointment-report-legend">
                  {model.summary.slices.map((slice) => {
                    const selected = status === slice.key;
                    return (
                      <li key={slice.key}>
                        <button
                          type="button"
                          data-testid={`appointment-slice-${slice.key}`}
                          data-in-chart={slice.inChart ? '1' : '0'}
                          data-count={String(slice.count)}
                          data-share={String(slice.sharePercent)}
                          aria-pressed={selected}
                          onClick={() => toggle(slice.key)}
                          className={cn(
                            'grid w-full grid-cols-[0.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm',
                            selected && 'bg-slate-100',
                            status && !selected && 'opacity-40',
                          )}
                        >
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: BUCKET_COLOR[slice.key] }} />
                          <span className={cn('truncate', ink)}>{bucketLabel(slice.key)}</span>
                          <span className="tabular-nums font-semibold">{formatNumber(slice.count, 0, false)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            <section className={cn(card, 'p-4')}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h3 className={cn('text-base font-semibold', ink)}>{tm('bApptReportTrend')}</h3>
                <span className={cn('text-xs', muted)}>{tm('bApptReportTrendHint')}</span>
              </div>
              <div className="h-[340px] overflow-x-auto">
                <div style={{ minWidth: Math.max(320, trendRows.length * 28), height: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#334155' : '#e2e8f0'} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={trendRows.length > 16 ? 'preserveStartEnd' : 0} />
                      <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="came" stackId="day" name={bucketLabel('came')} fill={BUCKET_COLOR.came} isAnimationActive={false} />
                      <Bar dataKey="noShow" stackId="day" name={bucketLabel('noShow')} fill={BUCKET_COLOR.noShow} isAnimationActive={false} />
                      <Bar dataKey="cancelled" stackId="day" name={bucketLabel('cancelled')} fill={BUCKET_COLOR.cancelled} isAnimationActive={false} />
                      {showFocus ? (
                        <Bar
                          dataKey="focus"
                          stackId="day"
                          name={status ? bucketLabel(status) : tm('bApptReportStatusOther')}
                          fill={status ? BUCKET_COLOR[status] : BUCKET_COLOR.other}
                          isAnimationActive={false}
                        />
                      ) : null}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className={cn(card, 'p-4')}>
              <h3 className={cn('text-base font-semibold', ink)}>{tm('bApptReportHourly')}</h3>
              <p className={cn('mb-2 text-xs', muted)}>{tm('bApptReportHourlyHint')}</p>
              {hourRows.length === 0 ? (
                <p className={cn('py-16 text-center text-sm', muted)}>{tm('bApptReportNoHour')}</p>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourRows} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? '#334155' : '#e2e8f0'} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name={tm('bApptReportCountCol')} fill="#7c3aed" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className={cn(card, 'p-4')}>
              <h3 className={cn('text-base font-semibold', ink)}>{tm('bApptReportStaff')}</h3>
              <p className={cn('mb-2 text-xs', muted)}>{tm('bApptReportStaffHint')}</p>
              {staffRows.length === 0 ? (
                <p data-testid="appointment-report-staff-empty" className={cn('py-16 text-center text-sm', muted)}>
                  {tm('bApptReportFilterEmpty')}
                </p>
              ) : (
                <ReportColumnTable
                  data={staffRows}
                  columns={staffColumns}
                  height={320}
                  storageNamespace="beauty-appointment-report-staff"
                  footerLabel={tm('reportsTotalsRow')}
                />
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
