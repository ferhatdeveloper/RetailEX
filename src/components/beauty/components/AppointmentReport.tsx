import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock3, Loader2, RefreshCw, UserRoundX, Users } from 'lucide-react';
import { beautyService } from '../../../services/beautyService';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
import type { BeautyAppointment } from '../../../types/beauty';
import { formatNumber } from '../../../utils/formatNumber';
import { defaultReportDateRange } from '../../../utils/reportDatePresets';
import { ReportDateRangePresets } from '../../shared/ReportDateRangePresets';
import { ReportColumnTable, type ReportColumnTableCol } from '../../reports/shared/ReportDataGrid';
import { cn } from '../../ui/utils';
import {
  appointmentPeriodDelta,
  buildAppointmentReport,
  previousAppointmentPeriod,
  type AppointmentReportBucket,
  type AppointmentReportInput,
} from '../../../utils/appointmentReport';
import {
  APPOINTMENT_CHART_COLOR,
  AppointmentDonutChart,
  AppointmentHourChart,
  AppointmentTrendChart,
} from './AppointmentReportCharts';
import './AppointmentReportLayout.css';

function toInput(row: BeautyAppointment): AppointmentReportInput {
  return {
    id: row.id,
    date: row.date || row.appointment_date || '',
    time: row.time || row.appointment_time || '',
    duration: row.duration,
    status: row.status,
    staffId: row.staff_id || row.specialist_id || '',
    staffName: row.specialist_name || row.staff_name || '',
    depositAmount: row.deposit_amount,
    depositDate: row.deposit_date,
    createdAt: row.created_at,
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
      beautyService.getAppointmentsInRange(range.from, range.to, { includeDepositCollected: true }),
      beautyService.getAppointmentsInRange(prev.from, prev.to, { includeDepositCollected: true }),
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

  const trendRows = model.trend.map((point) => ({
    ...point,
    label: dayLabel(point.date, language),
  }));
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
      cell: (row) => (
        <span className={row.retention == null ? undefined : 'appt-keep'}>
          {formatRatio(row.retention)}
        </span>
      ),
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
    },
    {
      key: 'retention',
      label: tm('bApptReportRetention'),
      value: formatRatio(model.summary.retention),
      delta: delta.retention,
      icon: Users,
    },
    {
      key: 'miss',
      label: tm('bApptReportCancelNoShow'),
      value: formatNumber(model.summary.cancelNoShow, 0, false),
      delta: delta.cancelNoShow,
      icon: UserRoundX,
    },
    {
      key: 'duration',
      label: tm('bApptReportAvgMinutes'),
      value: model.summary.avgDurationMinutes == null
        ? '—'
        : `${formatNumber(model.summary.avgDurationMinutes, 0, false)} ${tm('bApptReportMinuteSuffix')}`,
      delta: delta.avgDuration,
      icon: Clock3,
    },
  ] as const;

  const focusName = status && status !== 'came' && status !== 'noShow' && status !== 'cancelled'
    ? bucketLabel(status)
    : tm('bApptReportStatusOther');

  return (
    <div data-testid="appointment-report" className={cn('appt-board', darkMode && 'is-dark')}>
      <div className="appt-toolbar">
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

      <div className="appt-kpis" data-testid="appointment-report-kpis">
        {kpis.map((item) => {
          const Icon = item.icon;
          const deltaText = formatDelta(item.delta);
          const deltaClass = item.delta == null
            ? 'appt-delta-flat'
            : item.delta > 0
              ? 'appt-delta-up'
              : item.delta < 0
                ? 'appt-delta-down'
                : 'appt-delta-flat';
          return (
            <article key={item.key} className={`appt-kpi appt-kpi-${item.key}`}>
              <span className="appt-kpi-icon">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="appt-kpi-copy">
                <p className="appt-kpi-label">{item.label}</p>
                <p className="appt-kpi-value">{item.value}</p>
                <p className="appt-kpi-delta">
                  {deltaText ? (
                    <>
                      <span className={deltaClass}>{deltaText}</span>
                      {' '}
                      <span className="appt-kpi-hint">{tm('bApptReportVsPrevious')}</span>
                    </>
                  ) : (
                    <span className="appt-delta-flat">{tm('bApptReportNoBaseline')}</span>
                  )}
                </p>
              </div>
            </article>
          );
        })}
      </div>

      {loading && rows.length === 0 ? (
        <div className="appt-card appt-note">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          {tm('bApptReportLoading')}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {tm('bApptReportLoadFailed')}
        </div>
      ) : null}

      {!loading && !error && model.summary.total === 0 ? (
        <div data-testid="appointment-report-empty" className="appt-card appt-empty">
          {tm('bApptReportEmpty')}
        </div>
      ) : null}

      {model.summary.total > 0 ? (
        <>
          <div className="appt-split">
            <section className="appt-card">
              <div className="appt-card-head">
                <h3>{tm('bApptReportStatusMix')}</h3>
                {status ? (
                  <button type="button" className="appt-chip" onClick={() => setStatus(null)}>
                    {bucketLabel(status)} ×
                  </button>
                ) : null}
              </div>
              <div className="appt-donut-row">
                <div className="appt-donut-box">
                  <AppointmentDonutChart
                    slices={chartSlices}
                    selected={status}
                    labelOf={bucketLabel}
                    onToggle={toggle}
                  />
                  <div className="appt-donut-center" data-testid="appointment-report-center">
                    <div>
                      <span>{tm('bApptReportCenterTotal')}</span>
                      <strong>{formatNumber(model.summary.total, 0, false)}</strong>
                    </div>
                  </div>
                </div>
                <ul className="appt-legend" data-testid="appointment-report-legend">
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
                          className={cn(selected && 'is-selected', status && !selected && 'is-dim')}
                        >
                          <span className="appt-swatch" style={{ backgroundColor: APPOINTMENT_CHART_COLOR[slice.key] }} />
                          <span className="appt-legend-name">{bucketLabel(slice.key)}</span>
                          <span className="appt-legend-count">{formatNumber(slice.count, 0, false)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            <section className="appt-card">
              <div className="appt-card-head">
                <h3>{tm('bApptReportTrend')}</h3>
                <span className="appt-card-hint">{tm('bApptReportTrendHint')}</span>
              </div>
              <div className="appt-chart">
                <AppointmentTrendChart
                  points={trendRows}
                  focusColor={status ? APPOINTMENT_CHART_COLOR[status] : APPOINTMENT_CHART_COLOR.other}
                  names={{
                    came: bucketLabel('came'),
                    noShow: bucketLabel('noShow'),
                    cancelled: bucketLabel('cancelled'),
                    focus: focusName,
                  }}
                />
              </div>
              <ul className="appt-series">
                <li><i style={{ background: APPOINTMENT_CHART_COLOR.came }} />{bucketLabel('came')}</li>
                <li><i style={{ background: APPOINTMENT_CHART_COLOR.noShow }} />{bucketLabel('noShow')}</li>
                <li><i style={{ background: APPOINTMENT_CHART_COLOR.cancelled }} />{bucketLabel('cancelled')}</li>
              </ul>
            </section>
          </div>

          <div className="appt-split">
            <section className="appt-card">
              <div className="appt-card-head">
                <h3>{tm('bApptReportHourly')}</h3>
                <span className="appt-card-hint">{tm('bApptReportHourlyHint')}</span>
              </div>
              {hourRows.length === 0 ? (
                <p className="appt-note">{tm('bApptReportNoHour')}</p>
              ) : (
                <div className="appt-chart">
                  <AppointmentHourChart points={hourRows} countLabel={tm('bApptReportCountCol')} />
                </div>
              )}
            </section>

            <section className="appt-card">
              <div className="appt-card-head">
                <h3>{tm('bApptReportStaff')}</h3>
                <span className="appt-card-hint">{tm('bApptReportStaffHint')}</span>
              </div>
              {staffRows.length === 0 ? (
                <p data-testid="appointment-report-staff-empty" className="appt-note">
                  {tm('bApptReportFilterEmpty')}
                </p>
              ) : (
                <ReportColumnTable
                  data={staffRows}
                  columns={staffColumns}
                  height={300}
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
