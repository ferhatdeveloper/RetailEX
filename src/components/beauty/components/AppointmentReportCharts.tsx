import type { AppointmentReportBucket, AppointmentReportSlice } from '../../../utils/appointmentReport';
import {
  appointmentChartWidth,
  buildAppointmentDonutArcs,
  donutLabelPoint,
  donutSlicePath,
  layoutAppointmentHourBars,
  layoutAppointmentTrendBars,
} from '../../../utils/appointmentReportCharts';

export const APPOINTMENT_CHART_COLOR: Record<AppointmentReportBucket, string> = {
  new: '#7239ea',
  confirmed: '#1b84ff',
  prepaid: '#0891b2',
  started: '#f59e0b',
  came: '#22c66b',
  noShow: '#e7646c',
  cancelled: '#818793',
  other: '#94a3b8',
};

export const APPOINTMENT_HOUR_COLOR = '#8757ed';

const DONUT = 280;
const CX = 140;
const CY = 140;
const INNER = 74;
const OUTER = 118;
const CHART_H = 280;

interface TrendPoint {
  date: string;
  label: string;
  came: number;
  noShow: number;
  cancelled: number;
  focus: number;
}

interface HourPoint {
  hour: number;
  count: number;
  label: string;
}

function axisY(plotBottom: number, plotHeight: number, max: number, tick: number): number {
  if (max <= 0) return plotBottom;
  return plotBottom - (tick / max) * plotHeight;
}

/**
 * Durum halkası. Yaylar dilim adedinden çizilir; ortadaki toplam bu bileşenin dışında durur.
 */
export function AppointmentDonutChart({
  slices,
  selected,
  labelOf,
  onToggle,
}: {
  slices: readonly AppointmentReportSlice[];
  selected: AppointmentReportBucket | null;
  labelOf: (key: AppointmentReportBucket) => string;
  onToggle: (key: AppointmentReportBucket) => void;
}) {
  const arcs = buildAppointmentDonutArcs(slices);
  const summary = arcs.map((arc) => `${labelOf(arc.key)} ${arc.count}`).join(', ');
  return (
    <svg
      data-testid="appointment-report-donut"
      viewBox={`0 0 ${DONUT} ${DONUT}`}
      width="100%"
      height={DONUT}
      role="img"
      aria-label={summary}
    >
      {arcs.length === 0 ? (
        <circle cx={CX} cy={CY} r={(INNER + OUTER) / 2} fill="none" stroke="#e2e8f0" strokeWidth={OUTER - INNER} />
      ) : null}
      {arcs.map((arc) => {
        const path = donutSlicePath(CX, CY, INNER, OUTER, arc.start, arc.end);
        const labelAt = donutLabelPoint(CX, CY, INNER, OUTER, arc.start, arc.end);
        const dim = Boolean(selected) && selected !== arc.key;
        return (
          <g key={arc.key} opacity={dim ? 0.28 : 1}>
            <path
              d={path}
              fill={APPOINTMENT_CHART_COLOR[arc.key]}
              fillRule="evenodd"
              stroke="#ffffff"
              strokeWidth={arcs.length > 1 ? 2 : 0}
              data-slice={arc.key}
              data-count={String(arc.count)}
              data-share={String(arc.sharePercent)}
              style={{ cursor: 'pointer' }}
              onClick={() => onToggle(arc.key)}
            >
              <title>{`${labelOf(arc.key)}: ${arc.count}`}</title>
            </path>
            {arc.sharePercent >= 8 ? (
              <text
                x={labelAt.x}
                y={labelAt.y}
                fill="#ffffff"
                fontSize="13"
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="central"
                pointerEvents="none"
              >
                {`${arc.sharePercent}%`}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function AppointmentTrendChart({
  points,
  names,
  focusColor,
}: {
  points: readonly TrendPoint[];
  names: { came: string; noShow: string; cancelled: string; focus: string };
  focusColor: string;
}) {
  const width = appointmentChartWidth(points.length);
  const layout = layoutAppointmentTrendBars(points, width, CHART_H);
  const fill: Record<AppointmentBarSeries, string> = {
    came: APPOINTMENT_CHART_COLOR.came,
    noShow: APPOINTMENT_CHART_COLOR.noShow,
    cancelled: APPOINTMENT_CHART_COLOR.cancelled,
    focus: focusColor,
    hour: APPOINTMENT_HOUR_COLOR,
  };
  return (
    <svg
      data-testid="appointment-report-trend"
      viewBox={`0 0 ${width} ${CHART_H}`}
      width={width}
      height={CHART_H}
      role="img"
      aria-label={names.came}
    >
      {layout.ticks.map((tick) => {
        const y = axisY(layout.plot.bottom, layout.plot.height, layout.max, tick);
        return (
          <g key={`tick-${tick}`}>
            <line
              x1={layout.plot.left}
              x2={layout.plot.right}
              y1={y}
              y2={y}
              stroke={tick === 0 ? '#e2e8f0' : '#eef2f6'}
              strokeDasharray={tick === 0 ? undefined : '3 3'}
            />
            <text x={layout.plot.left - 6} y={y + 4} fill="#94a3b8" fontSize="11" textAnchor="end">
              {String(tick)}
            </text>
          </g>
        );
      })}
      {layout.rects.map((rect) => {
        const seriesName = rect.series === 'noShow'
          ? names.noShow
          : rect.series === 'cancelled'
            ? names.cancelled
            : rect.series === 'focus'
              ? names.focus
              : names.came;
        return (
          <rect
            key={rect.key}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={Math.max(rect.height, 1)}
            fill={fill[rect.series]}
            data-series={rect.series}
            data-value={String(rect.value)}
            data-label={rect.label}
          >
            <title>{`${rect.label} ${seriesName}: ${rect.value}`}</title>
          </rect>
        );
      })}
      {points.map((point, index) => {
        if (index % layout.labelStep !== 0 && index !== points.length - 1) return null;
        const slot = layout.plot.width / Math.max(points.length, 1);
        const x = layout.plot.left + slot * index + slot / 2;
        return (
          <text
            key={point.date}
            x={x}
            y={CHART_H - 10}
            fill="#64748b"
            fontSize="11"
            textAnchor="middle"
          >
            {point.label}
          </text>
        );
      })}
    </svg>
  );
}

type AppointmentBarSeries = 'came' | 'noShow' | 'cancelled' | 'focus' | 'hour';

export function AppointmentHourChart({
  points,
  countLabel,
}: {
  points: readonly HourPoint[];
  countLabel: string;
}) {
  const width = appointmentChartWidth(points.length);
  const layout = layoutAppointmentHourBars(points, width, CHART_H);
  return (
    <svg
      data-testid="appointment-report-hours"
      viewBox={`0 0 ${width} ${CHART_H}`}
      width={width}
      height={CHART_H}
      role="img"
      aria-label={countLabel}
    >
      {layout.ticks.map((tick) => {
        const y = axisY(layout.plot.bottom, layout.plot.height, layout.max, tick);
        return (
          <g key={`tick-${tick}`}>
            <line
              x1={layout.plot.left}
              x2={layout.plot.right}
              y1={y}
              y2={y}
              stroke={tick === 0 ? '#e2e8f0' : '#eef2f6'}
              strokeDasharray={tick === 0 ? undefined : '3 3'}
            />
            <text x={layout.plot.left - 6} y={y + 4} fill="#94a3b8" fontSize="11" textAnchor="end">
              {String(tick)}
            </text>
          </g>
        );
      })}
      {layout.rects.map((rect) => (
        <rect
          key={rect.key}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={Math.max(rect.height, 1)}
          rx={5}
          fill={APPOINTMENT_HOUR_COLOR}
          data-series="hour"
          data-value={String(rect.value)}
          data-label={rect.label}
        >
          <title>{`${rect.label}: ${rect.value}`}</title>
        </rect>
      ))}
      {points.map((point, index) => {
        if (index % layout.labelStep !== 0 && index !== points.length - 1) return null;
        const slot = layout.plot.width / Math.max(points.length, 1);
        const x = layout.plot.left + slot * index + slot / 2;
        return (
          <text
            key={point.hour}
            x={x}
            y={CHART_H - 10}
            fill="#64748b"
            fontSize="11"
            textAnchor="middle"
          >
            {point.label}
          </text>
        );
      })}
    </svg>
  );
}
