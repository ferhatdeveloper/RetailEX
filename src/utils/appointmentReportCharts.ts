/**
 * Randevu raporu grafikleri. Dilim ve çubuk ölçüleri durum adetinden gelir.
 * Yeni personel adı veya örnek sayı üretmez.
 */
import type { AppointmentReportBucket, AppointmentReportSlice } from './appointmentReport';

export interface AppointmentDonutArc {
  key: AppointmentReportBucket;
  count: number;
  sharePercent: number;
  /** 12 yönünden saat yönünde, radyan. */
  start: number;
  end: number;
}

export interface AppointmentBarRect {
  key: string;
  series: 'came' | 'noShow' | 'cancelled' | 'focus' | 'hour';
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  label: string;
}

export interface AppointmentPlot {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface AppointmentBarLayout {
  rects: AppointmentBarRect[];
  max: number;
  ticks: number[];
  plot: AppointmentPlot;
  labelStep: number;
}

const FULL = Math.PI * 2;

/** Grafikte görünen dilimler. Sıfır adet yay olmaz. */
export function buildAppointmentDonutArcs(
  slices: readonly AppointmentReportSlice[],
): AppointmentDonutArc[] {
  const painted = slices.filter((slice) => slice.inChart && slice.count > 0);
  const total = painted.reduce((sum, slice) => sum + slice.count, 0);
  if (total <= 0) return [];
  let cursor = 0;
  return painted.map((slice) => {
    const sweep = (slice.count / total) * FULL;
    const arc: AppointmentDonutArc = {
      key: slice.key,
      count: slice.count,
      sharePercent: slice.sharePercent,
      start: cursor,
      end: cursor + sweep,
    };
    cursor += sweep;
    return arc;
  });
}

export function appointmentChartWidth(pointCount: number): number {
  const count = Math.max(1, pointCount);
  return Math.max(560, count * 36);
}

/** Tepe çubuğun üstünde bir birim boşluk. Sıfırda eksen yine çizilir. */
export function appointmentAxisMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  if (value <= 8) return value + 1;
  const padded = value * 1.15;
  const exp = Math.floor(Math.log10(padded));
  const base = 10 ** exp;
  const frac = padded / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * base;
}

export function appointmentAxisTicks(max: number): number[] {
  if (max <= 4) return [0, Math.round(max / 2), max].filter((value, index, all) => all.indexOf(value) === index);
  const mid = Math.round(max / 2);
  return [0, mid, max].filter((value, index, all) => all.indexOf(value) === index);
}

function plotBox(width: number, height: number): AppointmentPlot {
  const left = 36;
  const right = Math.max(left + 1, width - 8);
  const top = 12;
  const bottom = Math.max(top + 1, height - 32);
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function labelStep(count: number): number {
  if (count <= 16) return 1;
  if (count <= 32) return 2;
  return Math.ceil(count / 16);
}

export function layoutAppointmentTrendBars(
  points: readonly {
    date: string;
    label: string;
    came: number;
    noShow: number;
    cancelled: number;
    focus: number;
  }[],
  width: number,
  height: number,
): AppointmentBarLayout {
  const plot = plotBox(width, height);
  const peak = points.reduce(
    (max, point) => Math.max(max, point.came + point.noShow + point.cancelled + point.focus),
    0,
  );
  const max = appointmentAxisMax(peak);
  const count = Math.max(points.length, 1);
  const slot = plot.width / count;
  const barWidth = Math.max(8, Math.min(count <= 3 ? 48 : 26, slot * 0.62));
  const series = ['came', 'noShow', 'cancelled', 'focus'] as const;
  const rects: AppointmentBarRect[] = [];
  points.forEach((point, index) => {
    const center = plot.left + slot * index + slot / 2;
    let y = plot.bottom;
    for (const name of series) {
      const value = point[name];
      if (value <= 0) continue;
      const barHeight = (value / max) * plot.height;
      y -= barHeight;
      rects.push({
        key: `${point.date}:${name}`,
        series: name,
        x: round(center - barWidth / 2),
        y: round(y),
        width: round(barWidth),
        height: round(barHeight),
        value,
        label: point.label,
      });
    }
  });
  return { rects, max, ticks: appointmentAxisTicks(max), plot, labelStep: labelStep(count) };
}

export function layoutAppointmentHourBars(
  points: readonly { hour: number; count: number; label: string }[],
  width: number,
  height: number,
): AppointmentBarLayout {
  const plot = plotBox(width, height);
  const peak = points.reduce((max, point) => Math.max(max, point.count), 0);
  const max = appointmentAxisMax(peak);
  const count = Math.max(points.length, 1);
  const slot = plot.width / count;
  const barWidth = Math.max(8, Math.min(count <= 4 ? 36 : 22, slot * 0.62));
  const rects: AppointmentBarRect[] = [];
  points.forEach((point, index) => {
    if (point.count <= 0) return;
    const center = plot.left + slot * index + slot / 2;
    const barHeight = (point.count / max) * plot.height;
    rects.push({
      key: `hour:${point.hour}`,
      series: 'hour',
      x: round(center - barWidth / 2),
      y: round(plot.bottom - barHeight),
      width: round(barWidth),
      height: round(barHeight),
      value: point.count,
      label: point.label,
    });
  });
  return { rects, max, ticks: appointmentAxisTicks(max), plot, labelStep: labelStep(count) };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 12 yönü açı 0, saat yönü artar. */
export function appointmentPolar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return {
    x: round(cx + radius * Math.sin(angle)),
    y: round(cy - radius * Math.cos(angle)),
  };
}

/** Halka dilimi. Tam turda iç delik even-odd ile açılır. */
export function donutSlicePath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
): string {
  const sweep = end - start;
  if (sweep <= 0.0001) return '';
  if (sweep >= FULL - 0.0001) {
    return [
      `M ${cx - outer} ${cy}`,
      `A ${outer} ${outer} 0 1 1 ${cx + outer} ${cy}`,
      `A ${outer} ${outer} 0 1 1 ${cx - outer} ${cy}`,
      `M ${cx - inner} ${cy}`,
      `A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy}`,
      `A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy}`,
    ].join(' ');
  }
  const large = sweep > Math.PI ? 1 : 0;
  const outerStart = appointmentPolar(cx, cy, outer, start);
  const outerEnd = appointmentPolar(cx, cy, outer, end);
  const innerEnd = appointmentPolar(cx, cy, inner, end);
  const innerStart = appointmentPolar(cx, cy, inner, start);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

export function donutLabelPoint(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
): { x: number; y: number } {
  const sweep = end - start;
  const mid = sweep >= FULL - 0.0001 ? Math.PI / 2 : (start + end) / 2;
  return appointmentPolar(cx, cy, inner + (outer - inner) * 0.5, mid);
}
