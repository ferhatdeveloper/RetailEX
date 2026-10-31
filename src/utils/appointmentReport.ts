/**
 * Randevu raporu. Kayıtlardan okunur; yeni durum yazılmaz.
 * Tutulma = geldi / (geldi + gelmedi). İptal paydaya girmez.
 * Kapandı ve tamamlandı geldi sayılır. Geçmiş no_show gelmedi sayılır.
 */
import { integerSharePercents } from './sharePercent';

export const APPOINTMENT_REPORT_BUCKETS = [
  'new',
  'confirmed',
  'prepaid',
  'started',
  'came',
  'noShow',
  'cancelled',
  'other',
] as const;

export type AppointmentReportBucket = (typeof APPOINTMENT_REPORT_BUCKETS)[number];

export const APPOINTMENT_TREND_BUCKETS = ['came', 'noShow', 'cancelled'] as const;

export interface AppointmentReportInput {
  id?: string | null;
  date?: string | null;
  time?: string | null;
  duration?: number | string | null;
  status?: string | null;
  staffId?: string | null;
  staffName?: string | null;
  /** Açık peşinat. Varsa ön ödeme dilimi kasa gününe yazılır. */
  depositAmount?: number | string | null;
  depositDate?: string | null;
  createdAt?: string | null;
}

export interface AppointmentReportSource {
  id: string;
  date: string;
  hour: number | null;
  durationMinutes: number | null;
  bucket: AppointmentReportBucket;
  staffId: string;
  staffName: string;
}

export interface AppointmentReportSlice {
  key: AppointmentReportBucket;
  count: number;
  inChart: boolean;
  sharePercent: number;
}

export interface AppointmentReportSummary {
  total: number;
  came: number;
  noShow: number;
  cancelled: number;
  retention: number | null;
  cancelNoShow: number;
  avgDurationMinutes: number | null;
  slices: AppointmentReportSlice[];
}

export interface AppointmentTrendPoint {
  date: string;
  came: number;
  noShow: number;
  cancelled: number;
  /** Geldi / gelmedi / iptal dışındaki seçili durum. */
  focus: number;
}

export interface AppointmentHourPoint {
  hour: number;
  count: number;
}

export interface AppointmentStaffRow {
  id: string;
  name: string;
  appointments: number;
  came: number;
  noShow: number;
  retention: number | null;
}

export interface AppointmentReportModel {
  summary: AppointmentReportSummary;
  trend: AppointmentTrendPoint[];
  hours: AppointmentHourPoint[];
  staff: AppointmentStaffRow[];
}

export interface AppointmentPeriodDelta {
  total: number | null;
  retention: number | null;
  cancelNoShow: number | null;
  avgDuration: number | null;
}

const CAME = new Set(['completed', 'complete', 'done', 'closed', 'close', 'kapandi', 'tamamlandi', 'finished']);
const CANCELLED = new Set(['cancelled', 'canceled', 'cancel', 'iptal', 'void']);
const NO_SHOW = new Set(['no_show', 'noshow', 'gelmedi']);
const PREPAID = new Set(['pre_paid', 'prepaid', 'prepayment', 'on_odeme', 'onodeme']);
const STARTED = new Set(['in_progress', 'inprogress', 'started', 'basladi']);
const CONFIRMED = new Set(['confirmed', 'confirm', 'onayli', 'approved']);
const NEW_STATUS = new Set(['scheduled', 'schedule', 'new', 'yeni', 'planned', 'planlandi', 'pending', 'draft']);

function foldStatus(raw: string): string {
  const map: Record<string, string> = {
    İ: 'i',
    I: 'i',
    ı: 'i',
    Ş: 's',
    ş: 's',
    Ğ: 'g',
    ğ: 'g',
    Ü: 'u',
    ü: 'u',
    Ö: 'o',
    ö: 'o',
    Ç: 'c',
    ç: 'c',
  };
  let out = '';
  for (const ch of raw.trim()) out += map[ch] ?? ch;
  return out.toLowerCase().replace(/[\s-]+/g, '_');
}

/** Mevcut randevu yazısından rapor dilimi. Yeni bir gelmedi durumu üretmez. */
export function classifyAppointmentStatus(status: unknown): AppointmentReportBucket {
  const folded = foldStatus(String(status ?? ''));
  if (!folded) return 'new';
  if (CAME.has(folded)) return 'came';
  if (CANCELLED.has(folded)) return 'cancelled';
  if (NO_SHOW.has(folded)) return 'noShow';
  if (PREPAID.has(folded)) return 'prepaid';
  if (STARTED.has(folded)) return 'started';
  if (CONFIRMED.has(folded)) return 'confirmed';
  if (NEW_STATUS.has(folded)) return 'new';
  return 'other';
}

function parseYmd(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function addCalendarDays(ymd: string, days: number): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return ymd;
  const dt = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${month}-${day}`;
}

export function inclusiveDaySpan(from: string, to: string): number {
  const start = parseYmd(from);
  const end = parseYmd(to);
  if (!start || !end) return 0;
  const diff = Math.round(
    (Date.UTC(end.y, end.m - 1, end.d) - Date.UTC(start.y, start.m - 1, start.d)) / 86400000,
  );
  return diff >= 0 ? diff + 1 : 0;
}

export function eachCalendarDay(from: string, to: string): string[] {
  const span = inclusiveDaySpan(from, to);
  const days: string[] = [];
  for (let index = 0; index < span; index += 1) days.push(addCalendarDays(from, index));
  return days;
}

/** Seçilen aralıkla aynı uzunlukta, hemen önceki dönem. */
export function previousAppointmentPeriod(from: string, to: string): { from: string; to: string } {
  const span = inclusiveDaySpan(from, to);
  if (span <= 0) return { from, to };
  const prevTo = addCalendarDays(from, -1);
  const prevFrom = addCalendarDays(prevTo, -(span - 1));
  return { from: prevFrom, to: prevTo };
}

export function retentionPercent(came: number, noShow: number): number | null {
  const whole = came + noShow;
  if (whole <= 0) return null;
  return Math.round((came / whole) * 1000) / 10;
}

/** Önceki dönem 0 ve şimdiki dönem doluysa oran yok. İkisi de 0 ise 0. */
export function periodChangePercent(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round((((current - previous) / previous) * 100) * 10) / 10;
}

function cleanStaffName(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text || text === '—' || text === '-' || text === '–') return '';
  return text;
}

function durationMinutes(value: unknown): number | null {
  if (value == null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function hourOf(value: unknown): number | null {
  const match = /^(\d{1,2})/.exec(String(value ?? '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return hour;
}

function dayKey(value: unknown): string {
  const day = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

/**
 * Henüz kapanmamış peşinat. Ön ödeme adedi randevu gününe taşınmaz.
 * Geldi, iptal, gelmedi ve başladı kendi gününde kalır.
 */
function openDepositPrepaid(row: AppointmentReportInput): boolean {
  const amount = Math.abs(Number(row.depositAmount) || 0);
  if (!(amount > 0.004)) return false;
  const bucket = classifyAppointmentStatus(row.status);
  if (bucket === 'came' || bucket === 'cancelled' || bucket === 'noShow' || bucket === 'started') {
    return false;
  }
  return true;
}

function prepaidCashDay(row: AppointmentReportInput): string {
  return dayKey(row.depositDate) || dayKey(row.createdAt) || dayKey(row.date);
}

export function collectAppointmentReportSources(
  rows: readonly AppointmentReportInput[],
  from: string,
  to: string,
): AppointmentReportSource[] {
  const seen = new Set<string>();
  const out: AppointmentReportSource[] = [];
  rows.forEach((row, index) => {
    const prepaid = openDepositPrepaid(row);
    const date = prepaid ? prepaidCashDay(row) : dayKey(row.date);
    if (!date || date < from || date > to) return;
    const id = String(row.id ?? '').trim() || `row-${index}`;
    if (seen.has(id)) return;
    seen.add(id);
    const staffName = cleanStaffName(row.staffName);
    const staffId = String(row.staffId ?? '').trim() || (staffName ? `name:${staffName}` : 'unnamed');
    out.push({
      id,
      date,
      hour: hourOf(row.time),
      durationMinutes: durationMinutes(row.duration),
      bucket: prepaid ? 'prepaid' : classifyAppointmentStatus(row.status),
      staffId,
      staffName,
    });
  });
  return out;
}

function countBucket(rows: readonly AppointmentReportSource[], bucket: AppointmentReportBucket): number {
  return rows.reduce((sum, row) => sum + (row.bucket === bucket ? 1 : 0), 0);
}

function summarize(rows: readonly AppointmentReportSource[]): AppointmentReportSummary {
  const counts = APPOINTMENT_REPORT_BUCKETS.map((key) => ({
    key,
    count: countBucket(rows, key),
  }));
  const visible = counts.filter((slice) => slice.key !== 'other' || slice.count > 0);
  const inChart = visible.map((slice) => slice.count > 0);
  const percents = integerSharePercents(visible.map((slice) => (slice.count > 0 ? slice.count : 0)));
  const came = countBucket(rows, 'came');
  const noShow = countBucket(rows, 'noShow');
  const cancelled = countBucket(rows, 'cancelled');
  const durations = rows
    .map((row) => row.durationMinutes)
    .filter((value): value is number => value != null);
  const avgDurationMinutes = durations.length
    ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
    : null;
  return {
    total: rows.length,
    came,
    noShow,
    cancelled,
    retention: retentionPercent(came, noShow),
    cancelNoShow: cancelled + noShow,
    avgDurationMinutes,
    slices: visible.map((slice, index) => ({
      key: slice.key,
      count: slice.count,
      inChart: inChart[index],
      sharePercent: inChart[index] ? percents[index] : 0,
    })),
  };
}

function buildTrend(
  rows: readonly AppointmentReportSource[],
  from: string,
  to: string,
  status: AppointmentReportBucket | null,
): AppointmentTrendPoint[] {
  const visible = status ? rows.filter((row) => row.bucket === status) : rows;
  const focusOnly = status != null && status !== 'came' && status !== 'noShow' && status !== 'cancelled';
  return eachCalendarDay(from, to).map((date) => {
    const dayRows = visible.filter((row) => row.date === date);
    if (focusOnly) {
      return { date, came: 0, noShow: 0, cancelled: 0, focus: dayRows.length };
    }
    return {
      date,
      came: countBucket(dayRows, 'came'),
      noShow: countBucket(dayRows, 'noShow'),
      cancelled: countBucket(dayRows, 'cancelled'),
      focus: 0,
    };
  });
}

function buildHours(
  rows: readonly AppointmentReportSource[],
  status: AppointmentReportBucket | null,
): AppointmentHourPoint[] {
  const visible = status ? rows.filter((row) => row.bucket === status) : rows;
  const counts = new Map<number, number>();
  for (const row of visible) {
    if (row.hour == null) continue;
    counts.set(row.hour, (counts.get(row.hour) || 0) + 1);
  }
  if (counts.size === 0) return [];
  const keys = [...counts.keys()];
  const min = Math.min(...keys);
  const max = Math.max(...keys);
  const points: AppointmentHourPoint[] = [];
  for (let hour = min; hour <= max; hour += 1) {
    points.push({ hour, count: counts.get(hour) || 0 });
  }
  return points;
}

function buildStaff(
  rows: readonly AppointmentReportSource[],
  status: AppointmentReportBucket | null,
): AppointmentStaffRow[] {
  const groups = new Map<string, AppointmentReportSource[]>();
  for (const row of rows) {
    const list = groups.get(row.staffId);
    if (list) list.push(row);
    else groups.set(row.staffId, [row]);
  }
  const staff: AppointmentStaffRow[] = [];
  for (const [id, all] of groups) {
    const visible = status ? all.filter((row) => row.bucket === status) : all;
    if (visible.length === 0) continue;
    const came = countBucket(all, 'came');
    const noShow = countBucket(all, 'noShow');
    staff.push({
      id,
      name: all.find((row) => row.staffName)?.staffName || '',
      appointments: visible.length,
      came,
      noShow,
      retention: retentionPercent(came, noShow),
    });
  }
  staff.sort((a, b) => {
    if (b.appointments !== a.appointments) return b.appointments - a.appointments;
    if (!a.name && b.name) return 1;
    if (a.name && !b.name) return -1;
    return a.name.localeCompare(b.name, 'tr');
  });
  return staff;
}

export function buildAppointmentReport(
  rows: readonly AppointmentReportInput[],
  options: { from: string; to: string; status?: AppointmentReportBucket | null },
): AppointmentReportModel {
  const source = collectAppointmentReportSources(rows, options.from, options.to);
  const status = options.status ?? null;
  return {
    summary: summarize(source),
    trend: buildTrend(source, options.from, options.to, status),
    hours: buildHours(source, status),
    staff: buildStaff(source, status),
  };
}

export function appointmentPeriodDelta(
  current: AppointmentReportSummary,
  previous: AppointmentReportSummary,
): AppointmentPeriodDelta {
  return {
    total: periodChangePercent(current.total, previous.total),
    retention: periodChangePercent(current.retention, previous.retention),
    cancelNoShow: periodChangePercent(current.cancelNoShow, previous.cancelNoShow),
    avgDuration: periodChangePercent(current.avgDurationMinutes, previous.avgDurationMinutes),
  };
}
