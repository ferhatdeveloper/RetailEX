import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { BeautyAppointment } from '../api/beautyApi';
import type { ThemeColors } from '../theme/colors';
import { CLINIC, clinicColorsForMode } from '../theme/clinicTokens';
import { useThemeStore } from '../store/themeStore';

export type CalView = 'day' | 'workweek' | 'week' | 'month' | 'agenda';

type Props = {
  colors: ThemeColors;
  appointments: BeautyAppointment[];
  currentDate: Date;
  view: CalView;
  onViewChange: (v: CalView) => void;
  onDateChange: (d: Date) => void;
  onAppointmentPress: (apt: BeautyAppointment) => void;
  onSlotPress: (dateYmd: string, timeHHmm?: string) => void;
  refreshing?: boolean;
  onRefresh?: () => void;
};

const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
const DAY_START = 9;
const DAY_END = 23;
const PX_PER_HOUR = 56;

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Planlandı', color: '#6366f1', bg: '#eef2ff' },
  confirmed: { label: 'Onaylı', color: '#0284c7', bg: '#e0f2fe' },
  in_progress: { label: 'Devam', color: '#d97706', bg: '#fef3c7' },
  completed: { label: 'Tamamlandı', color: '#059669', bg: '#d1fae5' },
  cancelled: { label: 'İptal', color: '#dc2626', bg: '#fee2e2' },
  no_show: { label: 'Gelmedi', color: '#9ca3af', bg: '#f3f4f6' },
};

const VIEW_TABS: { id: CalView; label: string }[] = [
  { id: 'day', label: 'Gün' },
  { id: 'workweek', label: 'İş Hft' },
  { id: 'week', label: 'Hafta' },
  { id: 'month', label: 'Ay' },
  { id: 'agenda', label: 'Ajanda' },
];

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseYmd(ymd: string): Date {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

export function aptDateKey(apt: BeautyAppointment): string {
  const raw = (apt.appointment_date || apt.starts_at || '').toString();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function aptTimeKey(apt: BeautyAppointment): string {
  const t = (apt.appointment_time || '').toString().slice(0, 5);
  if (/^\d{1,2}:\d{2}$/.test(t)) {
    const [h, mm] = t.split(':');
    return `${pad2(Number(h))}:${mm}`;
  }
  const m = String(apt.starts_at || '').match(/\s(\d{1,2}:\d{2})/);
  if (m) {
    const [h, mm] = m[1].split(':');
    return `${pad2(Number(h))}:${mm}`;
  }
  return '';
}

function parseTimeToMinutes(t: string | undefined): number | null {
  if (!t || !t.trim()) return null;
  const p = t.trim().split(':');
  const h = Number(p[0]);
  const m = Number(p[1] ?? 0);
  if (Number.isNaN(h)) return null;
  return h * 60 + (Number.isNaN(m) ? 0 : m);
}

function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

function clusterByOverlap(items: { apt: BeautyAppointment; start: number; end: number }[]) {
  const clusters: typeof items[] = [];
  const seen = new Set<string>();
  for (const seed of items) {
    if (seen.has(seed.apt.id)) continue;
    const cluster: typeof items = [seed];
    seen.add(seed.apt.id);
    let i = 0;
    while (i < cluster.length) {
      const cur = cluster[i];
      i++;
      for (const other of items) {
        if (seen.has(other.apt.id)) continue;
        if (cluster.some((c) => overlaps(c, other))) {
          cluster.push(other);
          seen.add(other.apt.id);
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function assignColumnsInCluster(cluster: { apt: BeautyAppointment; start: number; end: number }[]) {
  const sorted = [...cluster].sort((a, b) => a.start - b.start || a.end - b.end);
  const colEnds: number[] = [];
  const map = new Map<string, { col: number; cols: number }>();
  for (const it of sorted) {
    let col = -1;
    for (let c = 0; c < colEnds.length; c++) {
      if (it.start >= colEnds[c]) {
        col = c;
        colEnds[c] = it.end;
        break;
      }
    }
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(it.end);
    }
    map.set(it.apt.id, { col, cols: colEnds.length });
  }
  const maxC = colEnds.length;
  for (const id of map.keys()) {
    map.get(id)!.cols = maxC;
  }
  return map;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function statusOf(apt: BeautyAppointment) {
  const s = String(apt.status || 'scheduled').toLowerCase();
  return STATUS_CFG[s] ?? STATUS_CFG.scheduled;
}

type ClinicC = ReturnType<typeof clinicColorsForMode>;

function AptCard({
  apt,
  clinic,
  queueMode,
  compact,
  onPress,
}: {
  apt: BeautyAppointment;
  clinic: ClinicC;
  queueMode?: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  const cfg = statusOf(apt);
  const done = String(apt.status || '').toLowerCase() === 'completed';
  const noteText = String(apt.notes ?? '').trim();
  const hasNote = noteText.length > 0;
  const color = apt.service_color || CLINIC.violet;
  const cardBg = done ? cfg.bg : hasNote ? '#fffbeb' : clinic.surface;
  const cardBorder = done ? `${cfg.color}55` : hasNote ? '#fde68a' : clinic.border;
  const cardBorderLeft = done ? cfg.color : hasNote ? '#d97706' : color;
  const time = aptTimeKey(apt);
  const phone = String(apt.customer_phone ?? '').trim();

  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.aptCardCompact,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
            borderLeftColor: cardBorderLeft,
          },
        ]}
      >
        <Text style={[styles.aptNameCompact, { color: clinic.textPrimary }]} numberOfLines={1}>
          {time ? `${time} ` : ''}
          {apt.customer_name || 'Müşteri'}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.aptCard,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
          borderLeftColor: cardBorderLeft,
        },
      ]}
    >
      <View style={styles.aptCardTop}>
        <Text style={[styles.aptName, { color: clinic.textPrimary }]} numberOfLines={1}>
          {apt.customer_name || '—'}
        </Text>
        {!queueMode && time ? (
          <Text style={[styles.aptTime, { color: clinic.textSub }]}>{time}</Text>
        ) : null}
      </View>
      {phone ? (
        <Text style={[styles.aptPhone, { color: clinic.textSub }]} numberOfLines={1}>
          {phone}
        </Text>
      ) : null}
      <Text style={[styles.aptSvc, { color: clinic.textMuted }]} numberOfLines={1}>
        {apt.service_name || '—'}
      </Text>
      {hasNote ? (
        <Text style={[styles.aptNote, { color: '#92400e' }]} numberOfLines={2}>
          {noteText}
        </Text>
      ) : null}
      <View style={styles.aptCardBottom}>
        <Text style={[styles.aptSpec, { color: clinic.textMuted }]} numberOfLines={1}>
          {apt.specialist_name || '—'}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={{ color: cfg.color, fontSize: 9, fontWeight: '800' }}>{cfg.label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function DayTimedGrid({
  clinic,
  dayApts,
  ymd,
  onAppointmentPress,
  onSlotPress,
}: {
  clinic: ClinicC;
  dayApts: BeautyAppointment[];
  ymd: string;
  onAppointmentPress: (apt: BeautyAppointment) => void;
  onSlotPress: (dateYmd: string, timeHHmm?: string) => void;
}) {
  const { width: winW } = useWindowDimensions();
  const [gridW, setGridW] = useState(0);
  const totalMinutes = (DAY_END - DAY_START) * 60;
  const totalHeight = (DAY_END - DAY_START) * PX_PER_HOUR;
  const timeColW = winW < 360 ? 44 : 52;

  const hours = useMemo(() => {
    const h: number[] = [];
    for (let i = DAY_START; i < DAY_END; i++) h.push(i);
    return h;
  }, []);

  const layout = useMemo(() => {
    const startMin = DAY_START * 60;
    const endMin = DAY_END * 60;
    const items: { apt: BeautyAppointment; start: number; end: number }[] = [];
    for (const apt of dayApts) {
      const raw = parseTimeToMinutes(aptTimeKey(apt) || undefined);
      if (raw === null) continue;
      const dur = Math.max(15, Number(apt.duration) || 30);
      let s = raw;
      let e = s + dur;
      if (e <= startMin || s >= endMin) continue;
      s = Math.max(s, startMin);
      e = Math.min(e, endMin);
      items.push({ apt, start: s, end: e });
    }
    const assign = new Map<string, { col: number; cols: number }>();
    for (const cluster of clusterByOverlap(items)) {
      const sub = assignColumnsInCluster(cluster);
      for (const [id, v] of sub) assign.set(id, v);
    }
    return { items, assign };
  }, [dayApts]);

  return (
    <View
      style={[
        styles.dayGridShell,
        { backgroundColor: clinic.surface, borderColor: clinic.border },
      ]}
    >
      <View style={{ flexDirection: 'row', minHeight: totalHeight }}>
        <View
          style={{
            width: timeColW,
            backgroundColor: clinic.surfaceMuted,
            borderRightWidth: 1,
            borderRightColor: clinic.border,
          }}
        >
          {hours.map((h) => (
            <View
              key={h}
              style={{
                height: PX_PER_HOUR,
                paddingRight: 6,
                paddingTop: 4,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: clinic.gridLine,
              }}
            >
              <Text
                style={{
                  textAlign: 'right',
                  fontSize: 11,
                  fontWeight: '700',
                  color: clinic.textMuted,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {pad2(h)}:00
              </Text>
            </View>
          ))}
        </View>
        <View
          style={{ flex: 1, position: 'relative', minHeight: totalHeight }}
          onLayout={(e) => setGridW(e.nativeEvent.layout.width)}
        >
          {hours.map((h) => (
            <Pressable
              key={h}
              onPress={() => onSlotPress(ymd, `${pad2(h)}:00`)}
              style={{
                height: PX_PER_HOUR,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: clinic.gridLine,
              }}
            />
          ))}
          {layout.items.map(({ apt, start, end }) => {
            const top = ((start - DAY_START * 60) / totalMinutes) * totalHeight;
            const height = Math.max(((end - start) / totalMinutes) * totalHeight, 44);
            const meta = layout.assign.get(apt.id);
            const cols = Math.max(1, meta?.cols ?? 1);
            const col = meta?.col ?? 0;
            const colW = gridW > 0 ? gridW / cols : 0;
            const left = col * colW;
            return (
              <View
                key={apt.id}
                pointerEvents="box-none"
                style={{
                  position: 'absolute',
                  top,
                  height,
                  left,
                  width: Math.max(colW - 2, 0),
                  paddingHorizontal: 2,
                  paddingVertical: 1,
                  zIndex: 2,
                }}
              >
                <AptCard
                  apt={apt}
                  clinic={clinic}
                  onPress={() => onAppointmentPress(apt)}
                />
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export function BeautyCalendarPanel({
  colors,
  appointments,
  currentDate,
  view,
  onViewChange,
  onDateChange,
  onAppointmentPress,
  onSlotPress,
  refreshing,
  onRefresh,
}: Props) {
  const darkMode = useThemeStore((s) => s.darkMode);
  const clinic = useMemo(() => clinicColorsForMode(darkMode, colors), [darkMode, colors]);
  const [queueMode, setQueueMode] = useState(false);
  const today = useMemo(() => new Date(), []);
  const ymd = formatLocalYmd(currentDate);

  const title = useMemo(() => {
    if (view === 'month') {
      return currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
    }
    if (view === 'week') {
      const start = startOfWeekMonday(currentDate);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (view === 'workweek') {
      const start = startOfWeekMonday(currentDate);
      const end = addDays(start, 4);
      return `${start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (view === 'agenda') {
      const end = addDays(currentDate, 6);
      return `${currentDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return currentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [currentDate, view]);

  const navigate = (dir: -1 | 1) => {
    if (view === 'day') onDateChange(addDays(currentDate, dir));
    else if (view === 'week' || view === 'workweek' || view === 'agenda') {
      onDateChange(addDays(currentDate, dir * 7));
    } else onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1));
  };

  const dayApts = useMemo(
    () =>
      appointments
        .filter((a) => aptDateKey(a) === ymd)
        .filter((a) => {
          const s = String(a.status || '').toLowerCase();
          return s !== 'cancelled';
        })
        .sort((a, b) => aptTimeKey(a).localeCompare(aptTimeKey(b))),
    [appointments, ymd],
  );

  const weekDays = useMemo(() => {
    const start = startOfWeekMonday(currentDate);
    const len = view === 'workweek' ? 5 : 7;
    return Array.from({ length: len }, (_, i) => addDays(start, i));
  }, [currentDate, view]);

  const agendaDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentDate, i));
  }, [currentDate]);

  const monthWeeks = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = startOfWeekMonday(first);
    const weeks: Date[][] = [];
    let cur = new Date(gridStart);
    for (let w = 0; w < 6; w++) {
      const row: Date[] = [];
      for (let d = 0; d < 7; d++) {
        row.push(new Date(cur));
        cur = addDays(cur, 1);
      }
      weeks.push(row);
    }
    return weeks;
  }, [currentDate]);

  return (
    <View style={[styles.root, { backgroundColor: clinic.bg }]}>
      {/* Toolbar — web mobile layout */}
      <View style={[styles.toolbar, { backgroundColor: clinic.surface, borderBottomColor: clinic.borderMuted }]}>
        <View style={styles.navRow}>
          <Pressable
            onPress={() => navigate(-1)}
            style={[styles.navBtn, { borderColor: clinic.borderMuted, backgroundColor: clinic.surfaceMuted }]}
            hitSlop={6}
          >
            <ChevronLeft size={14} color={clinic.textSub} />
          </Pressable>
          <Text style={[styles.dateLabel, { color: clinic.textPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          <Pressable
            onPress={() => navigate(1)}
            style={[styles.navBtn, { borderColor: clinic.borderMuted, backgroundColor: clinic.surfaceMuted }]}
            hitSlop={6}
          >
            <ChevronRight size={14} color={clinic.textSub} />
          </Pressable>
          <Pressable
            onPress={() => onDateChange(new Date())}
            style={[styles.todayBtn, { borderColor: clinic.borderMuted, backgroundColor: clinic.surfaceMuted }]}
          >
            <Text style={{ color: clinic.violet, fontSize: 11, fontWeight: '700' }}>Bugün</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.segmentTrack, { backgroundColor: clinic.segmentBg }]}
        >
          {VIEW_TABS.map((t) => {
            const active = view === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => onViewChange(t.id)}
                style={[
                  styles.segmentTab,
                  active && {
                    backgroundColor: clinic.surface,
                    shadowColor: '#000',
                    shadowOpacity: 0.08,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? clinic.violet : clinic.textSub,
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {view === 'day' ? (
          <View style={styles.queueRow}>
            <Pressable
              onPress={() => setQueueMode((v) => !v)}
              style={[
                styles.queueToggle,
                {
                  borderColor: queueMode ? CLINIC.violetHover : clinic.borderMuted,
                  backgroundColor: queueMode ? clinic.violetLight : clinic.surface,
                },
              ]}
            >
              <Text
                style={{
                  color: queueMode ? CLINIC.violetHover : clinic.textSub,
                  fontSize: 11,
                  fontWeight: '700',
                }}
              >
                Sıra
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollBody}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={clinic.violet} />
          ) : undefined
        }
      >
        {view === 'day' ? (
          queueMode ? (
            <View
              style={[
                styles.queueShell,
                { backgroundColor: clinic.surface, borderColor: clinic.border },
              ]}
            >
              {dayApts.length === 0 ? (
                <Text style={{ color: clinic.textMuted, fontSize: 12, textAlign: 'center', padding: 16 }}>
                  Bu gün randevu yok
                </Text>
              ) : (
                dayApts.map((apt) => (
                  <AptCard
                    key={apt.id}
                    apt={apt}
                    clinic={clinic}
                    queueMode
                    onPress={() => onAppointmentPress(apt)}
                  />
                ))
              )}
              <Pressable
                onPress={() => onSlotPress(ymd)}
                style={[
                  styles.queueAdd,
                  { borderColor: clinic.border, backgroundColor: clinic.surfaceMuted },
                ]}
              >
                <Text style={{ color: clinic.textSub, fontSize: 12, fontWeight: '700' }}>+</Text>
              </Pressable>
            </View>
          ) : (
            <DayTimedGrid
              clinic={clinic}
              dayApts={dayApts}
              ymd={ymd}
              onAppointmentPress={onAppointmentPress}
              onSlotPress={onSlotPress}
            />
          )
        ) : null}

        {view === 'week' || view === 'workweek' ? (
          <View style={[styles.weekCard, { backgroundColor: clinic.surface, borderColor: clinic.border }]}>
            {weekDays.map((day, idx) => {
              const dayYmd = formatLocalYmd(day);
              const isToday = isSameDay(day, today);
              const list = appointments
                .filter((a) => aptDateKey(a) === dayYmd)
                .sort((a, b) => aptTimeKey(a).localeCompare(aptTimeKey(b)));
              return (
                <View
                  key={dayYmd}
                  style={[
                    styles.weekCol,
                    { borderBottomColor: clinic.border },
                    isToday && { backgroundColor: clinic.violetSurface },
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      onDateChange(day);
                      onViewChange('day');
                    }}
                    style={styles.weekHead}
                  >
                    <Text
                      style={{
                        color: isToday ? clinic.violet : clinic.textMuted,
                        fontSize: 10,
                        fontWeight: '800',
                      }}
                    >
                      {WEEKDAY_SHORT[idx]}
                    </Text>
                    <Text
                      style={{
                        color: isToday ? clinic.violet : clinic.textPrimary,
                        fontSize: 16,
                        fontWeight: '800',
                      }}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => onSlotPress(dayYmd)} style={styles.weekBody}>
                    {list.length === 0 ? (
                      <Text style={{ color: clinic.textMuted, fontSize: 10, textAlign: 'center' }}>+</Text>
                    ) : (
                      list.slice(0, 6).map((apt) => (
                        <AptCard
                          key={apt.id}
                          apt={apt}
                          clinic={clinic}
                          compact
                          onPress={() => onAppointmentPress(apt)}
                        />
                      ))
                    )}
                    {list.length > 6 ? (
                      <Text style={{ color: clinic.violet, fontSize: 9, fontWeight: '700' }}>
                        +{list.length - 6}
                      </Text>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}

        {view === 'month' ? (
          <View style={[styles.monthCard, { backgroundColor: clinic.surface, borderColor: clinic.border }]}>
            <View
              style={[
                styles.monthWeekHead,
                { borderBottomColor: clinic.border, backgroundColor: clinic.surfaceMuted },
              ]}
            >
              {WEEKDAY_SHORT.map((d, i) => (
                <Text
                  key={d}
                  style={[styles.monthDow, { color: i >= 5 ? clinic.violet : clinic.textMuted }]}
                >
                  {d}
                </Text>
              ))}
            </View>
            {monthWeeks.map((week, wi) => (
              <View key={`w-${wi}`} style={styles.monthWeekRow}>
                {week.map((day) => {
                  const dayYmd = formatLocalYmd(day);
                  const inMonth = day.getMonth() === currentDate.getMonth();
                  const isToday = isSameDay(day, today);
                  const list = appointments.filter((a) => aptDateKey(a) === dayYmd);
                  return (
                    <Pressable
                      key={dayYmd}
                      onPress={() => {
                        onDateChange(day);
                        if (list.length > 0) onViewChange('day');
                        else onSlotPress(dayYmd);
                      }}
                      style={[
                        styles.monthCell,
                        {
                          borderColor: clinic.border,
                          opacity: inMonth ? 1 : 0.4,
                          backgroundColor: isToday ? clinic.violetLight : 'transparent',
                        },
                      ]}
                    >
                      <View style={styles.monthCellTop}>
                        <Text
                          style={[
                            styles.monthDayNum,
                            isToday
                              ? { color: '#fff', backgroundColor: clinic.violet, ...styles.monthDayTodayBox }
                              : { color: clinic.textPrimary },
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                        {list.length > 0 ? (
                          <Text style={{ color: clinic.violet, fontSize: 8, fontWeight: '800' }}>
                            {list.length}
                          </Text>
                        ) : null}
                      </View>
                      {list.slice(0, 2).map((apt) => (
                        <AptCard
                          key={apt.id}
                          apt={apt}
                          clinic={clinic}
                          compact
                          onPress={() => onAppointmentPress(apt)}
                        />
                      ))}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}

        {view === 'agenda' ? (
          <View style={{ gap: 10 }}>
            {agendaDays.map((day) => {
              const dayYmd = formatLocalYmd(day);
              const isToday = isSameDay(day, today);
              const list = appointments
                .filter((a) => aptDateKey(a) === dayYmd)
                .sort((a, b) => aptTimeKey(a).localeCompare(aptTimeKey(b)));
              return (
                <View
                  key={dayYmd}
                  style={[
                    styles.agendaDay,
                    {
                      backgroundColor: clinic.surface,
                      borderColor: clinic.border,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      onDateChange(day);
                      onViewChange('day');
                    }}
                    style={styles.agendaHead}
                  >
                    <Text
                      style={{
                        color: isToday ? clinic.violet : clinic.textPrimary,
                        fontSize: 13,
                        fontWeight: '800',
                        textTransform: 'capitalize',
                      }}
                    >
                      {day.toLocaleDateString('tr-TR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </Text>
                    <Text style={{ color: clinic.textMuted, fontSize: 11, fontWeight: '700' }}>
                      {list.length} randevu
                    </Text>
                  </Pressable>
                  <View style={{ gap: 8, paddingHorizontal: 10, paddingBottom: 10 }}>
                    {list.length === 0 ? (
                      <Pressable
                        onPress={() => onSlotPress(dayYmd)}
                        style={[
                          styles.queueAdd,
                          { borderColor: clinic.border, backgroundColor: clinic.surfaceMuted },
                        ]}
                      >
                        <Text style={{ color: clinic.textSub, fontSize: 12, fontWeight: '700' }}>
                          + Randevu
                        </Text>
                      </Pressable>
                    ) : (
                      list.map((apt) => (
                        <AptCard
                          key={apt.id}
                          apt={apt}
                          clinic={clinic}
                          onPress={() => onAppointmentPress(apt)}
                        />
                      ))
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    gap: 10,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    textTransform: 'capitalize',
    lineHeight: 16,
  },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
  },
  segmentTrack: {
    flexDirection: 'row',
    borderRadius: 7,
    padding: 3,
    gap: 2,
    alignItems: 'center',
  },
  segmentTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  queueRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  queueToggle: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 96, gap: 8 },
  dayGridShell: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  queueShell: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  queueAdd: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  aptCard: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    overflow: 'hidden',
  },
  aptCardCompact: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  aptCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  aptName: { fontSize: 12, fontWeight: '700', flex: 1, lineHeight: 16 },
  aptNameCompact: { fontSize: 9, fontWeight: '700' },
  aptTime: { fontSize: 10, fontWeight: '700', fontVariant: ['tabular-nums'] },
  aptPhone: { fontSize: 10, fontWeight: '600' },
  aptSvc: { fontSize: 11, fontWeight: '600' },
  aptNote: { fontSize: 10, fontWeight: '600', fontStyle: 'italic', marginTop: 2 },
  aptCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 2,
  },
  aptSpec: { fontSize: 10, fontWeight: '600', flex: 1 },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  weekCard: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  weekCol: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  weekHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  weekBody: { paddingHorizontal: 10, gap: 4, minHeight: 36 },
  monthCard: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  monthWeekHead: { flexDirection: 'row', borderBottomWidth: 1 },
  monthDow: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '800',
    paddingVertical: 8,
  },
  monthWeekRow: { flexDirection: 'row' },
  monthCell: {
    flex: 1,
    minHeight: 72,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    padding: 4,
    gap: 2,
  },
  monthCellTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthDayNum: { fontSize: 11, fontWeight: '800' },
  monthDayTodayBox: {
    overflow: 'hidden',
    width: 22,
    height: 22,
    borderRadius: 6,
    textAlign: 'center',
    lineHeight: 22,
  },
  agendaDay: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  agendaHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
