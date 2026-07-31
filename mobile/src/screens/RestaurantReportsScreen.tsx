/**
 * Restoran raporları hub — web DeskApp restoran raporlarıyla uyumlu (liste/KPI + grafik).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  RestBarChart,
  RestColumnChart,
  RestCompareBars,
  RestPieChart,
} from '../components/RestReportCharts';
import { ReportViewToggle } from '../components/ReportViewToggle';
import { formatMoney } from '../api/erpTables';
import {
  defaultRestReportRange,
  fetchRestCategoryReport,
  fetchRestClosedOrders,
  fetchRestDailySummary,
  fetchRestDetailLines,
  fetchRestHourlyReport,
  fetchRestPeriodCompare,
  fetchRestProductQty,
  fetchRestReturnReport,
  fetchRestTableTurnover,
  fetchRestVoidReport,
  fetchRestWaiterReport,
  fetchRestZReport,
  restReportPresetRange,
  type RestCategoryRow,
  type RestClosedOrderRow,
  type RestDailySummary,
  type RestDetailLineRow,
  type RestHourlyRow,
  type RestPeriodCompare,
  type RestProductQtyRow,
  type RestReturnRow,
  type RestTableTurnoverRow,
  type RestVoidRow,
  type RestWaiterRow,
  type RestZReport,
} from '../api/restaurantReportsApi';
import { usePreferencesStore } from '../store/preferencesStore';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';

export type RestReportKind =
  | 'z'
  | 'void'
  | 'product'
  | 'history'
  | 'daily'
  | 'eod'
  | 'category'
  | 'detail'
  | 'hourly'
  | 'waiter'
  | 'table'
  | 'compare';

const REPORT_TABS: { id: RestReportKind; label: string }[] = [
  { id: 'z', label: 'Z Raporu' },
  { id: 'daily', label: 'Günlük' },
  { id: 'eod', label: 'Gün Sonu' },
  { id: 'product', label: 'Ürün Adedi' },
  { id: 'category', label: 'Kategori' },
  { id: 'void', label: 'İptal / İade' },
  { id: 'history', label: 'Adisyonlar' },
  { id: 'detail', label: 'Detaylı Satış' },
  { id: 'hourly', label: 'Saatlik' },
  { id: 'waiter', label: 'Garson' },
  { id: 'table', label: 'Masalar' },
  { id: 'compare', label: 'Dönem' },
];

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = String(iso).slice(0, 16).replace('T', ' ');
  return d;
}

function pctChange(cur: number, prev: number): string {
  if (!prev) return cur ? '+∞' : '0%';
  const p = ((cur - prev) / prev) * 100;
  const sign = p > 0 ? '+' : '';
  return `${sign}${p.toFixed(1)}%`;
}

export function RestaurantReportsScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const viewMode = usePreferencesStore((s) => s.reportsView);
  const initial = useMemo(() => defaultRestReportRange(), []);
  const [kind, setKind] = useState<RestReportKind>('z');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [voidTab, setVoidTab] = useState<'void' | 'return'>('void');
  const [compareMode, setCompareMode] = useState<'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [z, setZ] = useState<RestZReport | null>(null);
  const [products, setProducts] = useState<RestProductQtyRow[]>([]);
  const [voids, setVoids] = useState<RestVoidRow[]>([]);
  const [returns, setReturns] = useState<RestReturnRow[]>([]);
  const [history, setHistory] = useState<RestClosedOrderRow[]>([]);
  const [daily, setDaily] = useState<RestDailySummary | null>(null);
  const [categories, setCategories] = useState<RestCategoryRow[]>([]);
  const [details, setDetails] = useState<RestDetailLineRow[]>([]);
  const [hourly, setHourly] = useState<RestHourlyRow[]>([]);
  const [waiters, setWaiters] = useState<RestWaiterRow[]>([]);
  const [tables, setTables] = useState<RestTableTurnoverRow[]>([]);
  const [compare, setCompare] = useState<RestPeriodCompare | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const day = kind === 'z' || kind === 'eod' ? from : from;
      switch (kind) {
        case 'z':
          setZ(await fetchRestZReport(day));
          break;
        case 'product':
          setProducts(await fetchRestProductQty(from, to));
          break;
        case 'void': {
          const [v, r] = await Promise.all([
            fetchRestVoidReport(from, to),
            fetchRestReturnReport(from, to),
          ]);
          setVoids(v);
          setReturns(r);
          break;
        }
        case 'history':
          setHistory(await fetchRestClosedOrders(from, to));
          break;
        case 'daily':
        case 'eod':
          setDaily(await fetchRestDailySummary(kind === 'eod' ? day : from, kind === 'eod' ? day : to));
          if (kind === 'eod') {
            setHistory(await fetchRestClosedOrders(day, day, 500));
          }
          break;
        case 'category':
          setCategories(await fetchRestCategoryReport(from, to));
          break;
        case 'detail':
          setDetails(await fetchRestDetailLines(from, to));
          break;
        case 'hourly':
          setHourly(await fetchRestHourlyReport(from, to));
          break;
        case 'waiter':
          setWaiters(await fetchRestWaiterReport(from, to));
          break;
        case 'table':
          setTables(await fetchRestTableTurnover(from, to));
          break;
        case 'compare':
          setCompare(await fetchRestPeriodCompare(compareMode));
          break;
        default:
          break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kind, from, to, compareMode, orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyPreset = (p: 'today' | '7d' | 'month') => {
    const r = restReportPresetRange(p);
    setFrom(r.from);
    setTo(r.to);
  };

  const kpiBox = (label: string, value: string, accent?: string) => (
    <View
      style={[
        styles.kpi,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      <Text style={[styles.kpiLbl, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.kpiVal, { color: accent || colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  const chartPanel = useMemo(() => {
    if (viewMode !== 'chart') return null;

    if (kind === 'z' && z) {
      return (
        <View style={styles.chartBlock}>
          <RestPieChart
            title="Ödeme dağılımı"
            data={z.paymentsByType.map((p) => ({
              key: p.type,
              label: p.type,
              value: p.amount,
            }))}
          />
          <RestBarChart
            valueLabel="Ürün cirosu (ilk 12)"
            money
            data={z.salesByProduct.map((p) => ({
              key: p.productName,
              label: p.productName,
              value: p.amount,
            }))}
          />
          {z.voids.length > 0 ? (
            <RestBarChart
              valueLabel="İptal nedenleri"
              money
              data={z.voids.map((v) => ({
                key: v.reason,
                label: v.reason,
                value: v.amount,
                color: palette.red600,
              }))}
            />
          ) : null}
        </View>
      );
    }

    if ((kind === 'daily' || kind === 'eod') && daily) {
      const payData = [
        { key: 'cash', label: 'Nakit', value: daily.cash, color: palette.green600 },
        { key: 'card', label: 'Kart', value: daily.card, color: palette.blue600 },
        { key: 'other', label: 'Diğer', value: daily.other, color: palette.amber600 },
      ];
      const byChannel = history.reduce<Record<string, number>>((acc, o) => {
        acc[o.channel] = (acc[o.channel] || 0) + o.totalAmount;
        return acc;
      }, {});
      return (
        <View style={styles.chartBlock}>
          <RestPieChart title="Ödeme dağılımı" data={payData} />
          <RestBarChart
            valueLabel="Özet tutarlar"
            money
            data={[
              { key: 'net', label: 'Net', value: daily.net },
              { key: 'disc', label: 'İndirim', value: daily.discount },
              { key: 'void', label: 'İptal', value: daily.voidAmount, color: palette.red600 },
              { key: 'comp', label: 'İkram', value: daily.complementaryAmount },
            ]}
          />
          {kind === 'eod' && Object.keys(byChannel).length > 0 ? (
            <RestPieChart
              title="Kanal dağılımı"
              data={Object.entries(byChannel).map(([ch, amt]) => ({
                key: ch,
                label: ch,
                value: amt,
              }))}
            />
          ) : null}
        </View>
      );
    }

    if (kind === 'product') {
      return (
        <View style={styles.chartBlock}>
          <RestBarChart
            valueLabel="Adet (ilk 12)"
            data={products.map((p) => ({
              key: p.productId || p.productName,
              label: p.productName,
              value: p.quantity,
            }))}
          />
          <RestBarChart
            valueLabel="Ciro (ilk 12)"
            money
            data={products.map((p) => ({
              key: `r-${p.productId || p.productName}`,
              label: p.productName,
              value: p.revenue,
            }))}
          />
        </View>
      );
    }

    if (kind === 'category') {
      return (
        <View style={styles.chartBlock}>
          <RestBarChart
            valueLabel="Kategori cirosu"
            money
            data={categories.map((c) => ({
              key: c.category,
              label: c.category,
              value: c.revenue,
            }))}
          />
          <RestPieChart
            title="Kategori payı"
            data={categories.map((c) => ({
              key: `p-${c.category}`,
              label: c.category,
              value: c.revenue,
            }))}
          />
        </View>
      );
    }

    if (kind === 'void') {
      if (voidTab === 'void') {
        const byReason = voids.reduce<Record<string, number>>((acc, v) => {
          const k = v.voidReason || 'Diğer';
          acc[k] = (acc[k] || 0) + v.subtotal;
          return acc;
        }, {});
        return (
          <View style={styles.chartBlock}>
            <RestBarChart
              valueLabel="İptal tutarı (neden)"
              money
              data={Object.entries(byReason).map(([k, v]) => ({
                key: k,
                label: k,
                value: v,
                color: palette.red600,
              }))}
            />
          </View>
        );
      }
      return (
        <View style={styles.chartBlock}>
          <RestBarChart
            valueLabel="İade tutarları"
            money
            data={returns.map((r, i) => ({
              key: r.id || String(i),
              label: r.productName,
              value: r.totalAmount,
              color: palette.amber600,
            }))}
          />
        </View>
      );
    }

    if (kind === 'history') {
      return (
        <View style={styles.chartBlock}>
          <RestBarChart
            valueLabel="Adisyon tutarları (ilk 12)"
            money
            data={history.map((o) => ({
              key: o.id,
              label: o.orderNo || o.tableName || o.id.slice(0, 6),
              value: o.totalAmount,
            }))}
          />
          <RestPieChart
            title="Ödeme yöntemi"
            data={Object.entries(
              history.reduce<Record<string, number>>((acc, o) => {
                const m = o.paymentMethod || 'Belirsiz';
                acc[m] = (acc[m] || 0) + o.totalAmount;
                return acc;
              }, {}),
            ).map(([k, v]) => ({ key: k, label: k, value: v }))}
          />
        </View>
      );
    }

    if (kind === 'detail') {
      const byProd = details.reduce<Record<string, number>>((acc, d) => {
        acc[d.productName] = (acc[d.productName] || 0) + d.subtotal;
        return acc;
      }, {});
      return (
        <View style={styles.chartBlock}>
          <RestBarChart
            valueLabel="Satır cirosu (ürün)"
            money
            data={Object.entries(byProd).map(([k, v]) => ({
              key: k,
              label: k,
              value: v,
            }))}
          />
        </View>
      );
    }

    if (kind === 'hourly') {
      const hours = Array.from({ length: 24 }, (_, h) => {
        const row = hourly.find((x) => x.hour === h);
        return {
          key: String(h),
          label: `${h}`,
          value: row?.revenue ?? 0,
        };
      });
      return (
        <View style={styles.chartBlock}>
          <RestColumnChart data={hours} money />
        </View>
      );
    }

    if (kind === 'waiter') {
      return (
        <View style={styles.chartBlock}>
          <RestBarChart
            valueLabel="Garson cirosu"
            money
            data={waiters.map((w) => ({
              key: w.waiter,
              label: w.waiter,
              value: w.revenue,
            }))}
          />
        </View>
      );
    }

    if (kind === 'table') {
      return (
        <View style={styles.chartBlock}>
          <RestBarChart
            valueLabel="Masa cirosu"
            money
            data={tables.map((t) => ({
              key: t.tableName,
              label: t.tableName,
              value: t.revenue,
            }))}
          />
        </View>
      );
    }

    if (kind === 'compare' && compare) {
      return (
        <View style={styles.chartBlock}>
          <RestCompareBars
            periods={[
              {
                label: compare.labelCurrent,
                revenue: compare.current.net,
                orders: compare.current.orderCount,
                avgTicket:
                  compare.current.orderCount > 0
                    ? compare.current.net / compare.current.orderCount
                    : 0,
              },
              {
                label: compare.labelPrevious,
                revenue: compare.previous.net,
                orders: compare.previous.orderCount,
                avgTicket:
                  compare.previous.orderCount > 0
                    ? compare.previous.net / compare.previous.orderCount
                    : 0,
              },
            ]}
          />
        </View>
      );
    }

    return (
      <Text style={{ color: colors.textMuted, textAlign: 'center', padding: 16 }}>
        Bu rapor için grafik verisi yok
      </Text>
    );
  }, [
    viewMode,
    kind,
    z,
    daily,
    products,
    categories,
    voids,
    returns,
    voidTab,
    history,
    details,
    hourly,
    waiters,
    tables,
    compare,
    colors.textMuted,
  ]);

  const listHeader = (
    <View style={styles.headerBlock}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {REPORT_TABS.map((t) => {
          const on = t.id === kind;
          return (
            <Pressable
              key={t.id}
              onPress={() => setKind(t.id)}
              style={[
                styles.tabChip,
                {
                  backgroundColor: on ? palette.blue600 : colors.card,
                  borderColor: on ? palette.blue600 : colors.cardBorder,
                },
              ]}
            >
              <Text
                style={{
                  color: on ? palette.white : colors.text,
                  fontWeight: '800',
                  fontSize: 12,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ReportViewToggle style={{ paddingHorizontal: 0, paddingTop: 0 }} />

      {kind !== 'compare' ? (
        <View style={styles.rangeBlock}>
          <View style={styles.presetRow}>
            {(
              [
                ['today', 'Bugün'],
                ['7d', '7 gün'],
                ['month', 'Bu ay'],
              ] as const
            ).map(([id, label]) => (
              <Pressable
                key={id}
                onPress={() => applyPreset(id)}
                style={[
                  styles.presetChip,
                  { borderColor: colors.cardBorder, backgroundColor: colors.card },
                ]}
              >
                <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 11 }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <FormField
                label={kind === 'z' || kind === 'eod' ? 'Tarih' : 'Başlangıç'}
                value={from}
                onChangeText={setFrom}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
              />
            </View>
            {kind !== 'z' && kind !== 'eod' ? (
              <View style={{ flex: 1 }}>
                <FormField
                  label="Bitiş"
                  value={to}
                  onChangeText={setTo}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                />
              </View>
            ) : null}
          </View>
          <PrimaryButton label="Yenile" onPress={() => void load()} loading={loading} variant="ghost" />
        </View>
      ) : (
        <View style={styles.presetRow}>
          {(
            [
              ['week', 'Haftalık'],
              ['month', 'Aylık'],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setCompareMode(id)}
              style={[
                styles.presetChip,
                {
                  borderColor: compareMode === id ? palette.blue600 : colors.cardBorder,
                  backgroundColor: compareMode === id ? palette.blue600 : colors.card,
                },
              ]}
            >
              <Text
                style={{
                  color: compareMode === id ? palette.white : palette.blue600,
                  fontWeight: '800',
                  fontSize: 11,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {chartPanel}
    </View>
  );

  type Row =
    | { key: string; kind: 'section'; title: string }
    | { key: string; kind: 'line'; title: string; sub?: string; right?: string; rightSub?: string }
    | { key: string; kind: 'kpi'; items: { label: string; value: string; accent?: string }[] };

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (kind === 'z' && z) {
      out.push({
        key: 'zk',
        kind: 'kpi',
        items: [
          { label: 'Toplam satış', value: formatMoney(z.totalSales), accent: palette.blue600 },
          { label: 'Net nakit', value: formatMoney(z.netCash), accent: palette.green600 },
          { label: 'İade', value: formatMoney(z.returns.amount), accent: palette.red600 },
          { label: 'İkram', value: formatMoney(z.complements.amount) },
        ],
      });
      out.push({ key: 'zp', kind: 'section', title: 'Ödeme tipleri' });
      for (const p of z.paymentsByType) {
        out.push({
          key: `pay-${p.type}`,
          kind: 'line',
          title: p.type,
          sub: `${p.count} işlem`,
          right: formatMoney(p.amount),
        });
      }
      out.push({ key: 'zv', kind: 'section', title: 'İptaller' });
      if (z.voids.length === 0) {
        out.push({ key: 'zv0', kind: 'line', title: 'İptal yok' });
      } else {
        for (const v of z.voids) {
          out.push({
            key: `void-${v.reason}`,
            kind: 'line',
            title: v.reason,
            sub: `${v.count} kalem`,
            right: formatMoney(v.amount),
          });
        }
      }
      out.push({ key: 'zpr', kind: 'section', title: 'Satılan ürünler' });
      for (const p of z.salesByProduct.slice(0, 40)) {
        out.push({
          key: `prod-${p.productName}`,
          kind: 'line',
          title: p.productName,
          sub: `${p.quantity} adet`,
          right: formatMoney(p.amount),
        });
      }
    }

    if ((kind === 'daily' || kind === 'eod') && daily) {
      out.push({
        key: 'dk',
        kind: 'kpi',
        items: [
          { label: 'Adisyon', value: String(daily.orderCount) },
          { label: 'Net ciro', value: formatMoney(daily.net), accent: palette.blue600 },
          { label: 'Nakit', value: formatMoney(daily.cash) },
          { label: 'Kart', value: formatMoney(daily.card) },
        ],
      });
      out.push({
        key: 'dk2',
        kind: 'kpi',
        items: [
          { label: 'İndirim', value: formatMoney(daily.discount) },
          { label: 'İptal', value: formatMoney(daily.voidAmount), accent: palette.red600 },
          { label: 'İkram', value: formatMoney(daily.complementaryAmount) },
          { label: 'Diğer ödeme', value: formatMoney(daily.other) },
        ],
      });
      if (kind === 'eod') {
        const byChannel = history.reduce<Record<string, number>>((acc, o) => {
          acc[o.channel] = (acc[o.channel] || 0) + o.totalAmount;
          return acc;
        }, {});
        out.push({ key: 'ch', kind: 'section', title: 'Kanal dağılımı' });
        for (const [ch, amt] of Object.entries(byChannel)) {
          out.push({
            key: `ch-${ch}`,
            kind: 'line',
            title: ch,
            right: formatMoney(amt),
          });
        }
      }
    }

    if (kind === 'product') {
      const totQty = products.reduce((s, p) => s + p.quantity, 0);
      const totRev = products.reduce((s, p) => s + p.revenue, 0);
      out.push({
        key: 'pk',
        kind: 'kpi',
        items: [
          { label: 'Ürün çeşidi', value: String(products.length) },
          { label: 'Toplam adet', value: String(Math.round(totQty)) },
          { label: 'Ciro', value: formatMoney(totRev), accent: palette.blue600 },
        ],
      });
      products.forEach((p, i) => {
        out.push({
          key: `p-${i}-${p.productName}`,
          kind: 'line',
          title: `${i + 1}. ${p.productName}`,
          sub: `${p.quantity} adet`,
          right: formatMoney(p.revenue),
          rightSub:
            p.quantity > 0 ? `Ort. ${formatMoney(p.revenue / p.quantity)}` : undefined,
        });
      });
    }

    if (kind === 'void') {
      out.push({ key: 'vt', kind: 'section', title: voidTab === 'void' ? 'İptaller' : 'İadeler' });
      if (voidTab === 'void') {
        for (const v of voids) {
          out.push({
            key: v.itemId,
            kind: 'line',
            title: `${v.quantity}× ${v.productName}`,
            sub: `${v.orderNo || '—'} · Masa ${v.tableNumber} · ${v.voidReason}`,
            right: formatMoney(v.subtotal),
            rightSub: shortDate(v.closedAt),
          });
        }
      } else {
        for (const r of returns) {
          out.push({
            key: r.id,
            kind: 'line',
            title: `${r.quantity}× ${r.productName}`,
            sub: `${r.returnNumber} · ${r.returnReason}`,
            right: formatMoney(r.totalAmount),
            rightSub: shortDate(r.createdAt),
          });
        }
      }
    }

    if (kind === 'history') {
      out.push({
        key: 'hk',
        kind: 'kpi',
        items: [
          { label: 'Adisyon', value: String(history.length) },
          {
            label: 'Ciro',
            value: formatMoney(history.reduce((s, h) => s + h.totalAmount, 0)),
            accent: palette.blue600,
          },
        ],
      });
      for (const h of history) {
        out.push({
          key: h.id,
          kind: 'line',
          title: h.orderNo || h.id.slice(0, 8),
          sub: `${h.tableName} · ${h.channel} · ${h.waiter || '—'} · ${h.paymentMethod || '—'}`,
          right: formatMoney(h.totalAmount),
          rightSub: shortDate(h.closedAt),
        });
      }
    }

    if (kind === 'category') {
      for (const c of categories) {
        out.push({
          key: c.category,
          kind: 'line',
          title: c.category,
          sub: `${c.quantity} adet`,
          right: formatMoney(c.revenue),
        });
      }
    }

    if (kind === 'detail') {
      for (let i = 0; i < details.length; i++) {
        const d = details[i]!;
        out.push({
          key: `d-${i}`,
          kind: 'line',
          title: d.productName,
          sub: `${d.orderNo || '—'} · ${d.tableName} · ${d.quantity} × ${formatMoney(d.unitPrice)}`,
          right: formatMoney(d.subtotal),
          rightSub: shortDate(d.closedAt),
        });
      }
    }

    if (kind === 'hourly') {
      for (const h of hourly) {
        out.push({
          key: `h-${h.hour}`,
          kind: 'line',
          title: `${String(h.hour).padStart(2, '0')}:00`,
          sub: `${h.orderCount} adisyon`,
          right: formatMoney(h.revenue),
        });
      }
    }

    if (kind === 'waiter') {
      for (const w of waiters) {
        out.push({
          key: w.waiter,
          kind: 'line',
          title: w.waiter,
          sub: `${w.orderCount} adisyon`,
          right: formatMoney(w.revenue),
        });
      }
    }

    if (kind === 'table') {
      for (const t of tables) {
        out.push({
          key: t.tableName,
          kind: 'line',
          title: `Masa ${t.tableName}`,
          sub: `${t.orderCount} adisyon`,
          right: formatMoney(t.revenue),
        });
      }
    }

    if (kind === 'compare' && compare) {
      out.push({ key: 'cs', kind: 'section', title: `Güncel · ${compare.labelCurrent}` });
      out.push({
        key: 'ck',
        kind: 'kpi',
        items: [
          { label: 'Adisyon', value: String(compare.current.orderCount) },
          { label: 'Ciro', value: formatMoney(compare.current.net), accent: palette.blue600 },
        ],
      });
      out.push({ key: 'ps', kind: 'section', title: `Önceki · ${compare.labelPrevious}` });
      out.push({
        key: 'pk',
        kind: 'kpi',
        items: [
          { label: 'Adisyon', value: String(compare.previous.orderCount) },
          { label: 'Ciro', value: formatMoney(compare.previous.net) },
        ],
      });
      out.push({ key: 'ch', kind: 'section', title: 'Değişim' });
      out.push({
        key: 'ch1',
        kind: 'line',
        title: 'Adisyon',
        right: pctChange(compare.current.orderCount, compare.previous.orderCount),
      });
      out.push({
        key: 'ch2',
        kind: 'line',
        title: 'Ciro',
        right: pctChange(compare.current.net, compare.previous.net),
      });
    }

    return out;
  }, [
    kind,
    z,
    daily,
    products,
    voids,
    returns,
    voidTab,
    history,
    categories,
    details,
    hourly,
    waiters,
    tables,
    compare,
  ]);

  /** Grafik modunda satır listesini sadeleştir — KPI kalsın, tekrarlayan satırlar gizlensin */
  const displayRows = useMemo(() => {
    if (viewMode !== 'chart') return rows;
    return rows.filter((r) => r.kind === 'kpi');
  }, [rows, viewMode]);

  const title =
    REPORT_TABS.find((t) => t.id === kind)?.label || 'Restoran Raporları';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Restoran Raporları" subtitle={title} />
      {kind === 'void' ? (
        <View style={styles.voidTabs}>
          {(
            [
              ['void', 'İptaller'],
              ['return', 'İadeler'],
            ] as const
          ).map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setVoidTab(id)}
              style={[
                styles.voidTab,
                {
                  backgroundColor: voidTab === id ? palette.blue600 : colors.card,
                  borderColor: voidTab === id ? palette.blue600 : colors.cardBorder,
                },
              ]}
            >
              <Text
                style={{
                  color: voidTab === id ? palette.white : colors.text,
                  fontWeight: '800',
                  fontSize: 12,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading && displayRows.length === 0 && viewMode === 'list' ? (
        <>
          {listHeader}
          <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
        </>
      ) : (
        <FlatList
          data={displayRows}
          keyExtractor={(item) => item.key}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} />
          }
          ListHeaderComponent={listHeader}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            viewMode === 'chart' ? null : (
              <EmptyState message="Bu aralıkta kayıt yok — tarihleri kontrol edin" />
            )
          }
          renderItem={({ item }) => {
            if (item.kind === 'section') {
              return (
                <Text style={[styles.section, { color: colors.textMuted }]}>{item.title}</Text>
              );
            }
            if (item.kind === 'kpi') {
              return (
                <View style={styles.kpiRow}>
                  {item.items.map((k) => (
                    <View key={k.label} style={{ flex: 1, minWidth: '45%' }}>
                      {kpiBox(k.label, k.value, k.accent)}
                    </View>
                  ))}
                </View>
              );
            }
            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.sub ? (
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                      {item.sub}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {item.right ? (
                    <Text style={{ color: palette.blue600, fontWeight: '900', fontSize: 13 }}>
                      {item.right}
                    </Text>
                  ) : null}
                  {item.rightSub ? (
                    <Text style={{ color: colors.textSubtle, fontSize: 10, marginTop: 2 }}>
                      {item.rightSub}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 12, paddingBottom: 32 },
  headerBlock: { gap: 10, marginBottom: 8, paddingTop: 4 },
  tabs: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  tabChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chartBlock: { marginTop: 4 },
  rangeBlock: { gap: 8 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dateRow: { flexDirection: 'row', gap: 8 },
  voidTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  voidTab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  section: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  kpi: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 0,
  },
  kpiLbl: { fontSize: 10, fontWeight: '800' },
  kpiVal: { fontSize: 15, fontWeight: '900', marginTop: 4 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
});
