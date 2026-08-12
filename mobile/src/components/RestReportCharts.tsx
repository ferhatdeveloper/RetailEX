/**
 * Restoran rapor grafikleri — react-native-svg (ek native bağımlılık yok).
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import Svg, { Rect, Circle, Path, G, Line, Text as SvgText } from 'react-native-svg';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import { formatMoney } from '../api/erpTables';

export type ChartDatum = { key: string; label: string; value: number; color?: string };

const PALETTE = [
  palette.blue600,
  palette.green600,
  palette.amber600,
  palette.red600,
  palette.indigo600,
  '#0891b2',
  palette.pink500,
  palette.indigo500,
];

function fmtShort(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (a >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n * 100) / 100);
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y} Z`;
}

/** Yatay çubuk — ürün, kategori, garson, masa, iptal */
export function RestBarChart({
  data,
  valueLabel,
  maxBars = 12,
  money = false,
}: {
  data: ChartDatum[];
  valueLabel?: string;
  maxBars?: number;
  money?: boolean;
}) {
  const { colors } = useThemeStore();
  const rows = useMemo(
    () =>
      [...data]
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, maxBars),
    [data, maxBars],
  );
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) {
    return <Text style={[styles.empty, { color: colors.textMuted }]}>Grafik için veri yok</Text>;
  }
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {valueLabel ? (
        <Text style={[styles.cardTitle, { color: colors.textMuted }]}>{valueLabel}</Text>
      ) : null}
      {rows.map((r, i) => {
        const pct = (r.value / max) * 100;
        const c = r.color || PALETTE[i % PALETTE.length];
        return (
          <View key={r.key} style={styles.barRow}>
            <Text style={[styles.barLabel, { color: colors.text }]} numberOfLines={1}>
              {r.label}
            </Text>
            <View style={[styles.barTrack, { backgroundColor: colors.backgroundAlt }]}>
              <View style={[styles.barFill, { width: `${Math.max(pct, 2)}%`, backgroundColor: c }]} />
            </View>
            <Text style={[styles.barValue, { color: colors.textMuted }]} numberOfLines={1}>
              {money ? formatMoney(r.value) : fmtShort(r.value)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Dikey sütun — saatlik / günlük satış */
export function RestColumnChart({
  data,
  money = true,
  title = 'Saatlik ciro',
}: {
  data: ChartDatum[];
  money?: boolean;
  title?: string;
}) {
  const { colors } = useThemeStore();
  const { width } = useWindowDimensions();
  const chartW = Math.max(Math.min(width - 48, 520), data.length * 14 + 44);
  const chartH = 160;
  const padL = 36;
  const padB = 28;
  const padT = 12;
  const innerW = chartW - padL - 8;
  const innerH = chartH - padB - padT;
  const max = Math.max(...data.map((d) => d.value), 1);
  const n = Math.max(data.length, 1);
  const gap = 2;
  const bw = Math.max(3, (innerW - gap * (n - 1)) / n);

  if (!data.length) {
    return <Text style={[styles.empty, { color: colors.textMuted }]}>Grafik için veri yok</Text>;
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.cardTitle, { color: colors.textMuted }]}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={chartW} height={chartH}>
          {[0, 0.5, 1].map((t) => {
            const y = padT + innerH * (1 - t);
            return (
              <G key={String(t)}>
                <Line x1={padL} y1={y} x2={chartW - 8} y2={y} stroke={colors.cardBorder} strokeWidth={1} />
                <SvgText x={2} y={y + 4} fill={colors.textMuted} fontSize={9}>
                  {fmtShort(max * t)}
                </SvgText>
              </G>
            );
          })}
          {data.map((d, i) => {
            const h = (d.value / max) * innerH;
            const x = padL + i * (bw + gap);
            const y = padT + innerH - h;
            return (
              <G key={d.key}>
                <Rect
                  x={x}
                  y={y}
                  width={bw}
                  height={Math.max(h, d.value > 0 ? 2 : 0)}
                  fill={d.value > 0 ? palette.blue600 : colors.cardBorder}
                  rx={2}
                />
                {i % 3 === 0 || n <= 12 ? (
                  <SvgText
                    x={x + bw / 2}
                    y={chartH - 8}
                    fill={colors.textMuted}
                    fontSize={8}
                    textAnchor="middle"
                  >
                    {d.label}
                  </SvgText>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </ScrollView>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        En yüksek: {money ? formatMoney(max) : fmtShort(max)}
      </Text>
    </View>
  );
}

/** Pasta — ödeme dağılımı */
export function RestPieChart({ data, title }: { data: ChartDatum[]; title?: string }) {
  const { colors } = useThemeStore();
  const slices = useMemo(() => data.filter((d) => d.value > 0), [data]);
  const total = slices.reduce((s, d) => s + d.value, 0);
  const size = 160;
  const r = 70;
  const cx = size / 2;
  const cy = size / 2;

  if (!slices.length || total <= 0) {
    return <Text style={[styles.empty, { color: colors.textMuted }]}>Grafik için veri yok</Text>;
  }

  let angle = 0;
  const paths = slices.map((d, i) => {
    const sweep = (d.value / total) * 360;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return {
      ...d,
      path: sweep >= 359.9 ? undefined : arcPath(cx, cy, r, start, end),
      full: sweep >= 359.9,
      color: d.color || PALETTE[i % PALETTE.length],
      pct: (d.value / total) * 100,
    };
  });

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      {title ? <Text style={[styles.cardTitle, { color: colors.textMuted }]}>{title}</Text> : null}
      <View style={styles.pieRow}>
        <Svg width={size} height={size}>
          {paths.map((p) =>
            p.full ? (
              <Circle key={p.key} cx={cx} cy={cy} r={r} fill={p.color} />
            ) : (
              <Path key={p.key} d={p.path!} fill={p.color} />
            ),
          )}
          <Circle cx={cx} cy={cy} r={36} fill={colors.card} />
        </Svg>
        <View style={styles.legend}>
          {paths.map((p) => (
            <View key={p.key} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: p.color }]} />
              <Text style={[styles.legendText, { color: colors.textMuted }]} numberOfLines={2}>
                {p.label}: {formatMoney(p.value)} ({p.pct.toFixed(0)}%)
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Dönem karşılaştırma — çubuklar */
export function RestCompareBars({
  periods,
}: {
  periods: { label: string; revenue: number; orders: number; avgTicket: number }[];
}) {
  const { colors } = useThemeStore();
  if (!periods.length) {
    return <Text style={[styles.empty, { color: colors.textMuted }]}>Grafik için veri yok</Text>;
  }
  const maxRev = Math.max(...periods.map((p) => p.revenue), 1);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
      <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Dönem ciroları</Text>
      {periods.map((p, i) => {
        const pct = (p.revenue / maxRev) * 100;
        return (
          <View key={`${p.label}-${i}`} style={styles.barRow}>
            <Text style={[styles.barLabel, { color: colors.text }]} numberOfLines={1}>
              {p.label}
            </Text>
            <View style={[styles.barTrack, { backgroundColor: colors.backgroundAlt }]}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.max(pct, 2)}%`,
                    backgroundColor: PALETTE[i % PALETTE.length],
                  },
                ]}
              />
            </View>
            <Text style={[styles.barValue, { color: colors.textMuted }]} numberOfLines={1}>
              {formatMoney(p.revenue)}
            </Text>
          </View>
        );
      })}
      <View style={styles.compareMeta}>
        {periods.map((p, i) => (
          <Text key={`m-${i}`} style={[styles.hint, { color: colors.textMuted }]}>
            {p.label}: {p.orders} sipariş · ort. {formatMoney(p.avgTicket)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  cardTitle: { fontSize: 11, fontWeight: '800', marginBottom: 4 },
  empty: { fontSize: 14, textAlign: 'center', padding: 24 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  barLabel: { width: 88, fontSize: 11, fontWeight: '600' },
  barTrack: {
    flex: 1,
    height: 14,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  barValue: { width: 72, fontSize: 10, textAlign: 'right', fontWeight: '600' },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  legend: { flex: 1, minWidth: 140, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 3 },
  legendText: { flex: 1, fontSize: 11 },
  hint: { fontSize: 11 },
  compareMeta: { marginTop: 4, gap: 2 },
});
