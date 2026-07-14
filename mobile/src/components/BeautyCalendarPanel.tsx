import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { BeautyAppointment } from '../api/beautyApi';
import type { ThemeColors } from '../theme/colors';
import { palette } from '../theme/colors';

export type CalView = 'day' | 'week' | 'month';

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
const DAY_END = 21;

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

function statusAccent(status: string | null): string {
  const s = String(status || '').toLowerCase();
  if (s === 'completed') return palette.green600;
  if (s === 'cancelled' || s === 'no_show') return palette.red500;
  if (s === 'in_progress') return palette.amber600;
  if (s === 'confirmed') return palette.indigo600;
  return palette.purple500;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function hourSlots(): string[] {
  const out: string[] = [];
  for (let h = DAY_START; h < DAY_END; h++) out.push(`${pad2(h)}:00`);
  return out;
}

function ApptChip({
  apt,
  colors,
  compact,
  onPress,
}: {
  apt: BeautyAppointment;
  colors: ThemeColors;
  compact?: boolean;
  onPress: () => void;
}) {
  const accent = statusAccent(apt.status);
  const time = aptTimeKey(apt);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderLeftColor: accent,
          backgroundColor: colors.backgroundAlt,
          borderColor: colors.cardBorder,
        },
        compact && styles.chipCompact,
      ]}
    >
      {time ? (
        <Text style={[styles.chipTime, { color: colors.textMuted }]} numberOfLines={1}>
          {time}
        </Text>
      ) : null}
      <Text style={[styles.chipName, { color: colors.text }]} numberOfLines={1}>
        {apt.customer_name || 'Müşteri'}
      </Text>
      {!compact ? (
        <Text style={[styles.chipSvc, { color: colors.textSubtle }]} numberOfLines={1}>
          {apt.service_name || '—'}
          {apt.specialist_name ? ` · ${apt.specialist_name}` : ''}
        </Text>
      ) : null}
    </Pressable>
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
  const today = useMemo(() => new Date(), []);
  const slots = useMemo(() => hourSlots(), []);
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
    return currentDate.toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, [currentDate, view]);

  const navigate = (dir: -1 | 1) => {
    if (view === 'day') onDateChange(addDays(currentDate, dir));
    else if (view === 'week') onDateChange(addDays(currentDate, dir * 7));
    else onDateChange(new Date(currentDate.getFullYear(), currentDate.getMonth() + dir, 1));
  };

  const dayApts = useMemo(
    () =>
      appointments
        .filter((a) => aptDateKey(a) === ymd)
        .sort((a, b) => aptTimeKey(a).localeCompare(aptTimeKey(b))),
    [appointments, ymd],
  );

  const weekDays = useMemo(() => {
    const start = startOfWeekMonday(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
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
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.viewTabs}>
          {(
            [
              { id: 'day' as const, label: 'Gün' },
              { id: 'week' as const, label: 'Hafta' },
              { id: 'month' as const, label: 'Ay' },
            ] as const
          ).map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onViewChange(t.id)}
              style={[
                styles.viewChip,
                {
                  backgroundColor: view === t.id ? palette.purple500 : colors.card,
                  borderColor: colors.cardBorder,
                },
              ]}
            >
              <Text
                style={{
                  color: view === t.id ? palette.white : colors.text,
                  fontSize: 11,
                  fontWeight: '800',
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.navRow}>
          <Pressable
            onPress={() => navigate(-1)}
            style={[styles.navBtn, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
            hitSlop={6}
          >
            <ChevronLeft size={18} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => onDateChange(new Date())}
            style={[styles.todayBtn, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          >
            <Text style={{ color: palette.purple500, fontSize: 11, fontWeight: '800' }}>Bugün</Text>
          </Pressable>
          <Pressable
            onPress={() => navigate(1)}
            style={[styles.navBtn, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
            hitSlop={6}
          >
            <ChevronRight size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <Text style={[styles.rangeTitle, { color: colors.text }]} numberOfLines={1}>
        {title}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollBody}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={palette.purple500} />
          ) : undefined
        }
      >
        {view === 'day' ? (
          <View style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {slots.map((slot) => {
              const hour = slot.slice(0, 2);
              const slotApts = dayApts.filter((a) => aptTimeKey(a).startsWith(hour));
              return (
                <Pressable
                  key={slot}
                  onPress={() => onSlotPress(ymd, slot)}
                  style={[styles.slotRow, { borderBottomColor: colors.cardBorder }]}
                >
                  <Text style={[styles.slotHour, { color: colors.textMuted }]}>{slot}</Text>
                  <View style={styles.slotBody}>
                    {slotApts.length === 0 ? (
                      <Text style={{ color: colors.textSubtle, fontSize: 11 }}>+ Randevu</Text>
                    ) : (
                      slotApts.map((apt) => (
                        <ApptChip
                          key={apt.id}
                          apt={apt}
                          colors={colors}
                          onPress={() => onAppointmentPress(apt)}
                        />
                      ))
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {view === 'week' ? (
          <View style={[styles.weekCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {weekDays.map((day, idx) => {
              const dayYmd = formatLocalYmd(day);
              const isToday = isSameDay(day, today);
              const list = appointments
                .filter((a) => aptDateKey(a) === dayYmd)
                .sort((a, b) => aptTimeKey(a).localeCompare(aptTimeKey(b)));
              return (
                <View
                  key={dayYmd}
                  style={[styles.weekCol, { borderBottomColor: colors.cardBorder }, isToday && { backgroundColor: '#ede9fe22' }]}
                >
                  <Pressable onPress={() => { onDateChange(day); onViewChange('day'); }} style={styles.weekHead}>
                    <Text style={{ color: isToday ? palette.purple500 : colors.textMuted, fontSize: 10, fontWeight: '800' }}>
                      {WEEKDAY_SHORT[idx]}
                    </Text>
                    <Text style={{ color: isToday ? palette.purple500 : colors.text, fontSize: 16, fontWeight: '800' }}>
                      {day.getDate()}
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => onSlotPress(dayYmd)} style={styles.weekBody}>
                    {list.length === 0 ? (
                      <Text style={{ color: colors.textSubtle, fontSize: 10, textAlign: 'center' }}>+</Text>
                    ) : (
                      list.slice(0, 6).map((apt) => (
                        <ApptChip
                          key={apt.id}
                          apt={apt}
                          colors={colors}
                          compact
                          onPress={() => onAppointmentPress(apt)}
                        />
                      ))
                    )}
                    {list.length > 6 ? (
                      <Text style={{ color: palette.purple500, fontSize: 9, fontWeight: '700' }}>
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
          <View style={[styles.monthCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={[styles.monthWeekHead, { borderBottomColor: colors.cardBorder, backgroundColor: colors.backgroundAlt }]}>
              {WEEKDAY_SHORT.map((d, i) => (
                <Text
                  key={d}
                  style={[
                    styles.monthDow,
                    { color: i >= 5 ? palette.purple500 : colors.textMuted },
                  ]}
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
                          borderColor: colors.cardBorder,
                          opacity: inMonth ? 1 : 0.45,
                          backgroundColor: isToday ? '#ede9fe33' : 'transparent',
                        },
                      ]}
                    >
                      <View style={styles.monthCellTop}>
                        <Text
                          style={[
                            styles.monthDayNum,
                            isToday
                              ? styles.monthDayToday
                              : { color: colors.text },
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                        {list.length > 0 ? (
                          <Text style={{ color: palette.purple500, fontSize: 8, fontWeight: '800' }}>
                            {list.length}
                          </Text>
                        ) : null}
                      </View>
                      {list.slice(0, 2).map((apt) => (
                        <Pressable
                          key={apt.id}
                          onPress={() => onAppointmentPress(apt)}
                          style={[styles.monthDot, { borderLeftColor: statusAccent(apt.status), backgroundColor: colors.backgroundAlt }]}
                        >
                          <Text style={{ color: colors.text, fontSize: 8, fontWeight: '700' }} numberOfLines={1}>
                            {(aptTimeKey(apt) || '').slice(0, 5)} {apt.customer_name || ''}
                          </Text>
                        </Pressable>
                      ))}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: {
    paddingHorizontal: 12,
    paddingTop: 4,
    gap: 8,
  },
  viewTabs: { flexDirection: 'row', gap: 6 },
  viewChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  rangeTitle: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  scrollBody: { paddingHorizontal: 12, paddingBottom: 96, gap: 8 },
  dayCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  slotRow: {
    flexDirection: 'row',
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  slotHour: {
    width: 52,
    paddingTop: 10,
    paddingLeft: 8,
    fontSize: 11,
    fontWeight: '700',
  },
  slotBody: { flex: 1, padding: 6, gap: 4 },
  weekCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  weekCol: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  weekHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  weekBody: { paddingHorizontal: 10, gap: 4, minHeight: 36 },
  monthCard: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
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
  monthDayToday: {
    color: palette.white,
    backgroundColor: palette.purple500,
    overflow: 'hidden',
    width: 22,
    height: 22,
    borderRadius: 6,
    textAlign: 'center',
    lineHeight: 22,
  },
  monthDot: {
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  chip: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  chipCompact: { paddingVertical: 4 },
  chipTime: { fontSize: 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chipName: { fontSize: 11, fontWeight: '800' },
  chipSvc: { fontSize: 10 },
});
