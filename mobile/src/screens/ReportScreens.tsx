import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenHeader, EmptyState, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { ReportViewToggle } from '../components/ReportViewToggle';
import { RestBarChart, RestColumnChart, RestPieChart } from '../components/RestReportCharts';
import {
  fetchSalesByDay,
  fetchTopProducts,
  fetchCariBalances,
  fetchCariExtract,
  fetchProductSales,
  fetchCashMovements,
  fetchMinMaxStock,
  fetchMaterialValue,
  fetchWarehouseStatus,
  fetchMaterialExtract,
  fetchCariAging,
  agingBucketLabel,
  defaultExtractRange,
  type SalesDayRow,
  type TopProductRow,
  type CariBalanceRow,
  type CariExtractRow,
  type ProductSalesRow,
  type CashMovementRow,
  type MinMaxStockRow,
  type MaterialValueRow,
  type WarehouseStatusRow,
  type MaterialExtractRow,
  type CariAgingRow,
  type AgingBucket,
} from '../api/reportsApi';
import { fetchProducts } from '../api/productsApi';
import { formatMoney, firmNr, periodNr, storeId, storeName } from '../api/erpTables';
import { shareReportPdf } from '../utils/shareReportPdf';
import { useThemeStore } from '../store/themeStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type ReportStockMode = NonNullable<
  NonNullable<MainStackParamList['ReportStock']>['mode']
>;

const REPORT_META: Record<ReportStockMode, { title: string; subtitle: string }> = {
  critical: { title: 'Kritik Stok', subtitle: 'Min. stok altı malzemeler' },
  'min-max': { title: 'Min / Max Stok', subtitle: 'Stok seviye kontrolü' },
  'material-value': { title: 'Malzeme Değer', subtitle: 'Stok × maliyet' },
  'warehouse-status': { title: 'Malzeme Ambar Durum', subtitle: 'Depo stok özeti' },
  'material-extract': { title: 'Malzeme Ekstresi', subtitle: 'Ürün hareket dökümü' },
};

export function ReportSalesScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const [days, setDays] = useState<SalesDayRow[]>([]);
  const [top, setTop] = useState<TopProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, t] = await Promise.all([fetchSalesByDay(14), fetchTopProducts(15)]);
      setDays(d);
      setTop(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalRev = days.reduce((s, d) => s + d.revenue, 0);
  const totalCnt = days.reduce((s, d) => s + d.count, 0);

  const dayChart = useMemo(
    () =>
      days.map((d) => ({
        key: d.day,
        label: d.day.slice(5),
        value: d.revenue,
      })),
    [days],
  );

  const topChart = useMemo(
    () =>
      top.map((p, i) => ({
        key: `${p.product_name}-${i}`,
        label: p.product_name,
        value: p.amount,
      })),
    [top],
  );

  const storeLbl = storeName() || storeId() || 'firma geneli';
  const orgLabel = `Firma ${firmNr()} · Dönem ${periodNr()} · ${storeLbl} · Son 14 gün`;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Günlük Satış Özeti" subtitle={orgLabel} />
      <ReportViewToggle />
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Ciro</Text>
          <Text style={[styles.val, { color: palette.blue600 }]}>{formatMoney(totalRev)}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Fiş</Text>
          <Text style={[styles.val, { color: colors.text }]}>{totalCnt}</Text>
        </View>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={days}
          keyExtractor={(item) => item.day}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <EmptyState
              message={
                error
                  ? 'Hata yukarıda — Yenile ile tekrar deneyin'
                  : `Satış satırı yok (${orgLabel}). Tablo: rex_${firmNr()}_${periodNr()}_sales — Organizasyon’da firma/dönem doğru mu? (store_id boş fişler artık dahildir)`
              }
            />
          }
          ListHeaderComponent={
            <View style={{ marginBottom: 12 }}>
              {reportsView === 'chart' ? (
                <View style={styles.chartBlock}>
                  <RestColumnChart data={dayChart} title="Günlük ciro" money />
                  <RestBarChart data={topChart} valueLabel="En çok satanlar" money maxBars={12} />
                </View>
              ) : top.length > 0 ? (
                <>
                  <Text style={[styles.sec, { color: colors.text }]}>En çok satanlar</Text>
                  {top.slice(0, 5).map((p, i) => (
                    <Text
                      key={`${p.product_name}-${i}`}
                      style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}
                    >
                      {i + 1}. {p.product_name} — {formatMoney(p.amount)}
                    </Text>
                  ))}
                  <Text style={[styles.sec, { color: colors.text, marginTop: 16 }]}>Günlük</Text>
                </>
              ) : null}
            </View>
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.day}</Text>
              <Text style={{ color: colors.textMuted }}>{item.count} fiş</Text>
              <Text style={{ color: palette.blue600, fontWeight: '700' }}>{formatMoney(item.revenue)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

export function ReportStockScreen() {
  const route = useRoute<RouteProp<MainStackParamList, 'ReportStock'>>();
  const mode = route.params?.mode ?? 'critical';
  const meta = REPORT_META[mode];

  if (mode === 'min-max') {
    return <ReportMinMaxStock meta={meta} />;
  }
  if (mode === 'material-value') {
    return <ReportMaterialValue meta={meta} />;
  }
  if (mode === 'warehouse-status') {
    return <ReportWarehouseStatus meta={meta} />;
  }
  if (mode === 'material-extract') {
    return <ReportMaterialExtract meta={meta} />;
  }

  return <ReportCriticalStock meta={meta} />;
}

function ReportCriticalStock({ meta }: { meta: { title: string; subtitle: string } }) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof import('../api/reportsApi').fetchCriticalStock>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { fetchCriticalStock } = await import('../api/reportsApi');
      setRows(await fetchCriticalStock());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        key: String(r.id),
        label: r.name,
        value: Math.max(0, (r.min_stock || 0) - r.stock) || Math.abs(r.stock),
      })),
    [rows],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={meta.title}
        subtitle={`Firma ${firmNr()} · ${rows.length} malzeme`}
      />
      <ReportViewToggle />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <EmptyState
              message={
                error
                  ? 'Hata yukarıda — Yenile ile tekrar deneyin'
                  : `Kritik stok yok (firma ${firmNr()}) — min/critical altı ürün bulunamadı`
              }
            />
          }
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestBarChart data={chartData} valueLabel="Eksik / stok adedi" maxBars={12} />
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.code || '—'}</Text>
              <Text style={{ color: palette.red500, fontWeight: '700', marginTop: 4 }}>
                Stok {item.stock} / Min {item.min_stock} {item.unit || ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function ReportMinMaxStock({ meta }: { meta: { title: string; subtitle: string } }) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all');
  const [rows, setRows] = useState<MinMaxStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchMinMaxStock({ filter }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [filter, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const filters: { id: 'all' | 'low' | 'out'; label: string }[] = [
    { id: 'all', label: 'Tümü' },
    { id: 'low', label: 'Kritik' },
    { id: 'out', label: 'Tükenen' },
  ];

  const statusColor = (s: MinMaxStockRow['status']) => {
    if (s === 'depleted' || s === 'critical') return palette.red500;
    if (s === 'over') return palette.blue600;
    return colors.text;
  };

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        key: r.id,
        label: r.name,
        value:
          r.min_stock != null && r.stock < r.min_stock
            ? Math.max(0, r.min_stock - r.stock)
            : Math.abs(r.stock),
      })),
    [rows],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={meta.title} subtitle={`${rows.length} malzeme · ${meta.subtitle}`} />
      <ReportViewToggle />
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setFilter(f.id)}
            style={[
              styles.chip,
              {
                backgroundColor: filter === f.id ? palette.blue600 : colors.card,
                borderColor: filter === f.id ? palette.blue600 : colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: filter === f.id ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Kayıt yok" />}
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestBarChart data={chartData} valueLabel="Stok / eksik adet" maxBars={12} />
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.code || '—'}</Text>
              <Text style={{ color: statusColor(item.status), fontWeight: '700', marginTop: 4 }}>
                Stok {item.stock}
                {item.min_stock != null ? ` / Min ${item.min_stock}` : ''}
                {item.max_stock != null ? ` / Max ${item.max_stock}` : ''}
                {item.unit ? ` ${item.unit}` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function ReportMaterialValue({ meta }: { meta: { title: string; subtitle: string } }) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const [rows, setRows] = useState<MaterialValueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchMaterialValue());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.total_value, 0), [rows]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        key: r.id,
        label: r.name,
        value: r.total_value,
      })),
    [rows],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={meta.title} subtitle={`${rows.length} malzeme · ${meta.subtitle}`} />
      <ReportViewToggle />
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Toplam değer</Text>
          <Text style={[styles.val, { color: palette.blue600 }]}>{formatMoney(total)}</Text>
        </View>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Stoklu malzeme yok" />}
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestBarChart data={chartData} valueLabel="Malzeme değeri" money maxBars={12} />
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.code || '—'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                {item.quantity} {item.unit || ''} × {formatMoney(item.unit_cost)}
              </Text>
              <Text style={{ color: palette.blue600, fontWeight: '800', marginTop: 4 }}>
                {formatMoney(item.total_value)}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function ReportWarehouseStatus({ meta }: { meta: { title: string; subtitle: string } }) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const [warehouseName, setWarehouseName] = useState<string | null>(null);
  const [rows, setRows] = useState<WarehouseStatusRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchWarehouseStatus();
      setWarehouseName(data.warehouseName);
      setRows(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        key: r.id,
        label: r.name,
        value: Math.abs(r.total),
      })),
    [rows],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={meta.title}
        subtitle={warehouseName ? `${warehouseName} · ${rows.length} malzeme` : `${rows.length} malzeme`}
      />
      <ReportViewToggle />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Stok kaydı yok" />}
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestBarChart data={chartData} valueLabel="Ambar stok toplamı" maxBars={12} />
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.code || '—'}</Text>
              <Text style={{ color: palette.blue600, fontWeight: '700', marginTop: 4 }}>
                Toplam {item.total}
                {item.warehouse_name ? ` · ${item.warehouse_name}: ${item.warehouse_qty}` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function ReportMaterialExtract({ meta }: { meta: { title: string; subtitle: string } }) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const range = useMemo(() => defaultExtractRange(30), []);
  const [products, setProducts] = useState<Awaited<ReturnType<typeof fetchProducts>>>([]);
  const [productId, setProductId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [rows, setRows] = useState<MaterialExtractRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingProducts(true);
      try {
        const list = await fetchProducts('', 400);
        if (cancelled) return;
        setProducts(list);
        setProductId((prev) => (list.some((p) => p.id === prev) ? prev : list[0]?.id || ''));
      } catch (e) {
        if (!cancelled) {
          setProducts([]);
          setProductId('');
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgEpoch]);

  const selected = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return products.slice(0, 80);
    return products
      .filter(
        (p) =>
          p.name.toLocaleLowerCase('tr-TR').includes(q) ||
          (p.code || '').toLocaleLowerCase('tr-TR').includes(q),
      )
      .slice(0, 80);
  }, [products, productSearch]);

  const load = useCallback(async () => {
    if (!productId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(
        await fetchMaterialExtract({
          productId,
          productCode: selected?.code || undefined,
          startDate: range.start,
          endDate: range.end,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [productId, selected?.code, range.start, range.end]);

  useEffect(() => {
    void load();
  }, [load]);

  const closing = rows.length ? rows[rows.length - 1].running_balance : 0;

  const chartData = useMemo(
    () =>
      rows.map((r, i) => ({
        key: r.id || `m-${i}`,
        label: r.date.slice(5) || r.movement_type,
        value: Math.abs(r.quantity),
      })),
    [rows],
  );

  if (picking) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Malzeme Seç" subtitle={`${filteredProducts.length} ürün`} />
        <SearchBar value={productSearch} onChangeText={setProductSearch} placeholder="Kod veya ad…" />
        {loadingProducts ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
        ) : (
          <FlatList
            data={filteredProducts}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<EmptyState message="Malzeme bulunamadı" />}
            contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setProductId(item.id);
                  setPicking(false);
                  setProductSearch('');
                }}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {item.code || '—'} · Stok {item.stock}
                </Text>
              </Pressable>
            )}
          />
        )}
        <Pressable
          onPress={() => setPicking(false)}
          style={[styles.footerBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>Vazgeç</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={meta.title} subtitle={`${range.start} → ${range.end}`} />
      <ReportViewToggle />
      <Pressable
        onPress={() => setPicking(true)}
        style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
      >
        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>MALZEME</Text>
        <Text style={{ color: colors.text, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
          {selected ? selected.name : loadingProducts ? 'Yükleniyor…' : 'Malzeme seçin'}
        </Text>
        {selected ? (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{selected.code || '—'}</Text>
        ) : null}
      </Pressable>
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Hareket</Text>
          <Text style={[styles.valSm, { color: colors.text }]}>{rows.length}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Bakiye</Text>
          <Text style={[styles.valSm, { color: palette.blue600 }]}>{closing}</Text>
        </View>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading || loadingProducts ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Hareket yok — malzeme seçin" />}
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestBarChart data={chartData} valueLabel="Hareket miktarı" maxBars={14} />
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, gap: 6, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.date}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: 'monospace' }}>
                  {item.document_no || '—'}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                {item.description || item.movement_type}
                {item.source === 'invoice' ? ' · Fatura' : ''}
              </Text>
              <View style={[styles.rowBetween, { marginTop: 6 }]}>
                <Text style={{ color: colors.text, fontSize: 12 }}>
                  {item.movement_type === 'in' ? '+' : item.movement_type === 'out' ? '−' : ''}
                  {item.quantity}
                </Text>
                <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 12 }}>
                  Bakiye {item.running_balance}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

type CardFilter = 'all' | 'customer' | 'supplier';

/** Web ledger CTE + menü `mizan` — dönemsel cari bakiye (R2/R11) */
export function ReportMizanScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const [cardType, setCardType] = useState<CardFilter>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<CariBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const orgLabel = useMemo(() => {
    const fn = firmNr();
    const pn = periodNr();
    return `Firma ${fn} · Dönem ${pn}`;
  }, [orgEpoch]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchCariBalances({ cardType, onlyNonZero: true, limit: 500 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cardType, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.accountName.toLocaleLowerCase('tr-TR').includes(q) ||
        r.accountCode.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    let recv = 0;
    let pay = 0;
    let cardRecv = 0;
    let cardPay = 0;
    for (const r of rows) {
      if (r.cardType === 'customer') {
        recv += r.balance;
        cardRecv += r.cardBalance;
      } else {
        pay += r.balance;
        cardPay += r.cardBalance;
      }
    }
    return { recv, pay, net: recv - pay, cardRecv, cardPay, cardNet: cardRecv - cardPay };
  }, [rows]);

  const chartData = useMemo(
    () =>
      filtered.map((r) => ({
        key: `${r.cardType}-${r.accountId}`,
        label: r.accountName,
        value: Math.abs(r.balance),
      })),
    [filtered],
  );

  const source = rows[0]?.balanceSource ?? 'period_ledger';
  const isLedger = source === 'period_ledger';

  const filters: { id: CardFilter; label: string }[] = [
    { id: 'all', label: 'Tümü' },
    { id: 'customer', label: 'Müşteri' },
    { id: 'supplier', label: 'Tedarikçi' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Cari Bakiye Özeti"
        subtitle={`${orgLabel} · ${filtered.length} hesap · yasal GL mizanı değil`}
      />
      <ReportViewToggle />
      <View
        style={[
          styles.hintBox,
          { backgroundColor: colors.card, borderColor: colors.cardBorder },
        ]}
      >
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
          {isLedger ? 'Dönem bakiyesi (ledger)' : 'Kart bakiyesi (firma)'}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15 }}>
          {isLedger
            ? 'Cari hesap özeti: açılış + dönem satış/alış + CH_*. Hesap planı / genel muhasebe mizanı değildir.'
            : 'Ledger CTE kullanılamadı; gösterim firma kart kolonundan (dönem bağımsız).'}
        </Text>
      </View>
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setCardType(f.id)}
            style={[
              styles.chip,
              {
                backgroundColor: cardType === f.id ? palette.blue600 : colors.card,
                borderColor: cardType === f.id ? palette.blue600 : colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: cardType === f.id ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Kod veya unvan…" />
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Alacak (dönem)</Text>
          <Text style={[styles.valSm, { color: palette.blue600 }]}>{formatMoney(totals.recv)}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Borç (dönem)</Text>
          <Text style={[styles.valSm, { color: palette.orange500 }]}>{formatMoney(totals.pay)}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Net (dönem)</Text>
          <Text style={[styles.valSm, { color: colors.text }]}>{formatMoney(totals.net)}</Text>
        </View>
      </View>
      {isLedger ? (
        <Text style={{ color: colors.textMuted, fontSize: 10, paddingHorizontal: 12, marginBottom: 4 }}>
          Kart net (firma): {formatMoney(totals.cardNet)}
        </Text>
      ) : null}
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.cardType}-${item.accountId}`}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Dönemde bakiyesi olan cari yok" />}
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestBarChart data={chartData} valueLabel="Mutlak bakiye (üst hesaplar)" money maxBars={12} />
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const cardDiffers = Math.abs(item.balance - item.cardBalance) > 0.009;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={styles.rowBetween}>
                  <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {item.accountName}
                  </Text>
                  <Text
                    style={{
                      color: item.balance >= 0 ? palette.blue600 : palette.red500,
                      fontWeight: '800',
                    }}
                  >
                    {formatMoney(item.balance)}
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {item.accountCode || '—'} · {item.cardType === 'customer' ? 'Müşteri' : 'Tedarikçi'}
                  {item.txnCount > 0 ? ` · ${item.txnCount} hareket` : ''}
                </Text>
                {isLedger && cardDiffers ? (
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 3 }}>
                    Kart (firma): {formatMoney(item.cardBalance)}
                  </Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

/** Web `CariExtractReport` / menü `customer-extract` */
export function ReportCariExtractScreen() {
  const { colors } = useThemeStore();
  const route = useRoute<RouteProp<MainStackParamList, 'ReportCariExtract'>>();
  const presetAccountId = route.params?.accountId;
  const presetCardType = route.params?.cardType;
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const range = useMemo(() => defaultExtractRange(90), []);
  const [cardType, setCardType] = useState<'customer' | 'supplier'>(presetCardType ?? 'customer');
  const [accounts, setAccounts] = useState<CariBalanceRow[]>([]);
  const [accountId, setAccountId] = useState(presetAccountId ?? '');
  const [accountSearch, setAccountSearch] = useState('');
  const [rows, setRows] = useState<CariExtractRow[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingAccounts(true);
      try {
        const list = await fetchCariBalances({ cardType, onlyNonZero: false, limit: 400 });
        if (cancelled) return;
        setAccounts(list);
        setAccountId((prev) => {
          if (presetAccountId && list.some((a) => a.accountId === presetAccountId)) {
            return presetAccountId;
          }
          if (prev && list.some((a) => a.accountId === prev)) return prev;
          return list[0]?.accountId || '';
        });
      } catch (e) {
        if (!cancelled) {
          setAccounts([]);
          setAccountId('');
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cardType, orgEpoch, presetAccountId]);

  useEffect(() => {
    if (presetCardType) setCardType(presetCardType);
  }, [presetCardType]);

  useEffect(() => {
    if (presetAccountId) setAccountId(presetAccountId);
  }, [presetAccountId]);

  const selected = useMemo(
    () => accounts.find((a) => a.accountId === accountId) ?? null,
    [accounts, accountId],
  );

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.trim().toLocaleLowerCase('tr-TR');
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.accountName.toLocaleLowerCase('tr-TR').includes(q) ||
        a.accountCode.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [accounts, accountSearch]);

  const load = useCallback(async () => {
    if (!accountId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(
        await fetchCariExtract({
          accountId,
          cardType,
          startDate: range.start,
          endDate: range.end,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, cardType, range.start, range.end]);

  useEffect(() => {
    void load();
  }, [load]);

  const closing = rows.length ? rows[rows.length - 1].balance : 0;

  const onSharePdf = useCallback(async () => {
    if (!selected) {
      Alert.alert('Cari seçin', 'PDF için önce bir cari seçin.');
      return;
    }
    if (!rows.length) {
      Alert.alert('Hareket yok', 'Paylaşılacak ekstre satırı bulunamadı.');
      return;
    }
    setSharingPdf(true);
    try {
      const result = await shareReportPdf({
        title: `Cari ekstre — ${selected.accountName}`,
        subtitle: `${selected.accountCode || '—'} · ${range.start} → ${range.end} · Kapanış ${formatMoney(closing)}`,
        rows: rows.map((r) => ({
          date: r.date?.slice(0, 10) || '',
          title: r.definition || r.source || r.ficheNo || 'Hareket',
          amount: r.debit
            ? r.debit
            : r.credit
              ? -Math.abs(r.credit)
              : r.balance,
          meta: [
            r.ficheNo ? `Fiş ${r.ficheNo}` : null,
            r.debit ? `Borç ${formatMoney(r.debit)}` : null,
            r.credit ? `Alacak ${formatMoney(r.credit)}` : null,
            `Bakiye ${formatMoney(r.balance)}`,
          ]
            .filter(Boolean)
            .join(' · '),
        })),
        footerNote: 'RetailEX · Cari ekstre',
      });
      Alert.alert(result.ok ? 'PDF' : 'Hata', result.message);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    } finally {
      setSharingPdf(false);
    }
  }, [closing, range.end, range.start, rows, selected]);

  const chartData = useMemo(
    () =>
      rows.map((r, i) => ({
        key: r.id || `x-${i}`,
        label: r.date.slice(5) || r.ficheNo || `#${i + 1}`,
        value: Math.abs(r.debit || r.credit || r.balance),
      })),
    [rows],
  );

  if (picking) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Cari Seç" subtitle={`${filteredAccounts.length} hesap`} />
        <SearchBar value={accountSearch} onChangeText={setAccountSearch} placeholder="Kod veya unvan…" />
        {loadingAccounts ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
        ) : (
          <FlatList
            data={filteredAccounts}
            keyExtractor={(item) => item.accountId}
            ListEmptyComponent={<EmptyState message="Cari bulunamadı" />}
            contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setAccountId(item.accountId);
                  setPicking(false);
                  setAccountSearch('');
                }}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{item.accountName}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {item.accountCode || '—'} · Dönem {formatMoney(item.balance)}
                  {Math.abs(item.balance - item.cardBalance) > 0.009
                    ? ` · Kart ${formatMoney(item.cardBalance)}`
                    : ''}
                </Text>
              </Pressable>
            )}
          />
        )}
        <Pressable
          onPress={() => setPicking(false)}
          style={[styles.footerBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
        >
          <Text style={{ color: colors.text, fontWeight: '700' }}>Vazgeç</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Cari Ekstre" subtitle={`${range.start} → ${range.end}`} />
      <ReportViewToggle />
      <View style={styles.filterRow}>
        {(['customer', 'supplier'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setCardType(t)}
            style={[
              styles.chip,
              {
                backgroundColor: cardType === t ? palette.blue600 : colors.card,
                borderColor: cardType === t ? palette.blue600 : colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: cardType === t ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>
              {t === 'customer' ? 'Müşteri' : 'Tedarikçi'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        onPress={() => setPicking(true)}
        style={[styles.picker, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
      >
        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>CARİ</Text>
        <Text style={{ color: colors.text, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>
          {selected ? selected.accountName : loadingAccounts ? 'Yükleniyor…' : 'Cari seçin'}
        </Text>
        {selected ? (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{selected.accountCode || '—'}</Text>
        ) : null}
      </Pressable>
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Hareket</Text>
          <Text style={[styles.valSm, { color: colors.text }]}>{rows.length}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Kapanış</Text>
          <Text style={[styles.valSm, { color: closing >= 0 ? palette.blue600 : palette.red500 }]}>
            {formatMoney(closing)}
          </Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
        <PrimaryButton
          label="PDF Paylaş"
          onPress={() => void onSharePdf()}
          loading={sharingPdf}
          disabled={!rows.length || !selected}
        />
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading || loadingAccounts ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Hareket yok — cari veya tarih aralığı seçin" />}
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestBarChart data={chartData} valueLabel="Hareket tutarı (mutlak)" money maxBars={14} />
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, gap: 6, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.date}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: 'monospace' }}>
                  {item.ficheNo || '—'}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                {item.definition || item.source}
              </Text>
              <View style={[styles.rowBetween, { marginTop: 6 }]}>
                <Text style={{ color: palette.red500, fontSize: 12 }}>
                  B {item.debit ? formatMoney(item.debit) : '—'}
                </Text>
                <Text style={{ color: palette.blue600, fontSize: 12 }}>
                  A {item.credit ? formatMoney(item.credit) : '—'}
                </Text>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>
                  {formatMoney(item.balance)}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

/** Web `ProductGrossProfitReport` / menü product-analytics — ürün satış dökümü */
export function ReportProductSalesScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const range = useMemo(() => defaultExtractRange(30), []);
  const [rows, setRows] = useState<ProductSalesRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchProductSales({ startDate: range.start, endDate: range.end, limit: 200 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.productName.toLocaleLowerCase('tr-TR').includes(q) ||
        r.productCode.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    let qty = 0;
    let amount = 0;
    for (const r of filtered) {
      qty += r.qty;
      amount += r.amount;
    }
    return { qty, amount };
  }, [filtered]);

  const amountChart = useMemo(
    () =>
      filtered.map((r) => ({
        key: `${r.productId}-${r.productCode}`,
        label: r.productName,
        value: r.amount,
      })),
    [filtered],
  );

  const qtyChart = useMemo(
    () =>
      filtered.map((r) => ({
        key: `q-${r.productId}-${r.productCode}`,
        label: r.productName,
        value: r.qty,
      })),
    [filtered],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Ürün Satış Raporu"
        subtitle={`Firma ${firmNr()} · Dönem ${periodNr()} · ${range.start} → ${range.end}`}
      />
      <ReportViewToggle />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Ürün adı veya kod…" />
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Ürün</Text>
          <Text style={[styles.valSm, { color: colors.text }]}>{filtered.length}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Miktar</Text>
          <Text style={[styles.valSm, { color: palette.blue600 }]}>{totals.qty.toLocaleString('tr-TR')}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Tutar</Text>
          <Text style={[styles.valSm, { color: palette.blue600 }]}>{formatMoney(totals.amount)}</Text>
        </View>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, i) => `${item.productId}-${item.productCode}-${i}`}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <EmptyState
              message={
                error
                  ? 'Hata yukarıda — Yenile ile tekrar deneyin'
                  : `Satış kalemi yok (rex_${firmNr()}_${periodNr()}_sale_items · ${range.start}→${range.end})`
              }
            />
          }
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestBarChart data={amountChart} valueLabel="Tutara göre" money maxBars={12} />
                <RestBarChart data={qtyChart} valueLabel="Miktara göre" maxBars={12} />
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item, index }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={2}>
                  {index + 1}. {item.productName}
                </Text>
                <Text style={{ color: palette.blue600, fontWeight: '800' }}>{formatMoney(item.amount)}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {item.productCode || '—'} · {item.qty.toLocaleString('tr-TR')} adet
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

/** Web `getCashBankMovements` / menü financereports-cash — kasa hareketleri */
export function ReportCashScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const range = useMemo(() => defaultExtractRange(30), []);
  const [rows, setRows] = useState<CashMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchCashMovements({ startDate: range.start, endDate: range.end, limit: 500 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const r of rows) {
      if (r.netAmount >= 0) inflow += r.netAmount;
      else outflow += Math.abs(r.netAmount);
    }
    return { inflow, outflow, net: inflow - outflow };
  }, [rows]);

  const byTypeChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = (r.transactionType || r.definition || 'Diğer').trim() || 'Diğer';
      map.set(key, (map.get(key) || 0) + Math.abs(r.netAmount));
    }
    return [...map.entries()].map(([label, value]) => ({
      key: label,
      label,
      value,
    }));
  }, [rows]);

  const byDayChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const day = r.date.slice(0, 10);
      map.set(day, (map.get(day) || 0) + Math.abs(r.netAmount));
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, value]) => ({
        key: day,
        label: day.slice(5),
        value,
      }));
  }, [rows]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Kasa Raporu" subtitle={`${range.start} → ${range.end}`} />
      <ReportViewToggle />
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Giriş</Text>
          <Text style={[styles.valSm, { color: palette.blue600 }]}>{formatMoney(totals.inflow)}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Çıkış</Text>
          <Text style={[styles.valSm, { color: palette.red500 }]}>{formatMoney(totals.outflow)}</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.lbl}>Net</Text>
          <Text style={[styles.valSm, { color: colors.text }]}>{formatMoney(totals.net)}</Text>
        </View>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Kasa hareketi yok" />}
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestBarChart data={byTypeChart} valueLabel="Türe göre" money maxBars={10} />
                <RestColumnChart data={byDayChart} title="Günlük hareket" money />
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.date}</Text>
                <Text
                  style={{
                    color: item.netAmount >= 0 ? palette.blue600 : palette.red500,
                    fontWeight: '800',
                  }}
                >
                  {formatMoney(item.netAmount)}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {item.registerName || 'Kasa'} · {item.ficheNo || '—'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                {item.definition || item.transactionType || '—'}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

/** Web `getCariAging` — basit vade yaşlandırma (P2) */
export function ReportAgingScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const reportsView = usePreferencesStore((s) => s.reportsView);
  const [cardType, setCardType] = useState<CardFilter>('all');
  const [rows, setRows] = useState<CariAgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const orgLabel = useMemo(() => {
    const fn = firmNr();
    const pn = periodNr();
    return `Firma ${fn} · Dönem ${pn}`;
  }, [orgEpoch]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchCariAging({ cardType, limit: 400 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cardType, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const bucketTotals = useMemo(() => {
    const init: Record<AgingBucket, number> = {
      current: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d90_plus: 0,
    };
    for (const r of rows) {
      if (r.amount > 0) init[r.bucket] += r.amount;
    }
    return init;
  }, [rows]);

  const pieData = useMemo(
    () =>
      (['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as AgingBucket[]).map((b) => ({
        key: b,
        label: agingBucketLabel(b),
        value: bucketTotals[b],
      })),
    [bucketTotals],
  );

  const filters: { id: CardFilter; label: string }[] = [
    { id: 'all', label: 'Tümü' },
    { id: 'customer', label: 'Müşteri' },
    { id: 'supplier', label: 'Tedarikçi' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Cari Yaşlandırma"
        subtitle={`${orgLabel} · ${rows.length} açık fiş`}
      />
      <ReportViewToggle />
      <View
        style={[
          styles.hintBox,
          { backgroundColor: colors.card, borderColor: colors.cardBorder },
        ]}
      >
        <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 15 }}>
          Veresiye / açık hesap fişleri. Vade = fatura tarihi + ödeme günü (yoksa 30). Tahsilat
          netleştirmesi yok — basit önizleme.
        </Text>
      </View>
      <View style={styles.filterRow}>
        {filters.map((f) => (
          <Pressable
            key={f.id}
            onPress={() => setCardType(f.id)}
            style={[
              styles.chip,
              {
                backgroundColor: cardType === f.id ? palette.blue600 : colors.card,
                borderColor: cardType === f.id ? palette.blue600 : colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: cardType === f.id ? '#fff' : colors.text, fontSize: 12, fontWeight: '700' }}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.kpiRow}>
        {(['current', 'd1_30', 'd31_60', 'd90_plus'] as AgingBucket[]).map((b) => (
          <View
            key={b}
            style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          >
            <Text style={styles.lbl}>{agingBucketLabel(b)}</Text>
            <Text style={[styles.valSm, { color: colors.text }]}>{formatMoney(bucketTotals[b])}</Text>
          </View>
        ))}
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item, i) => `${item.ficheNo}-${item.accountId}-${i}`}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => {
                setLoading(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={<EmptyState message="Açık vade fişi yok" />}
          ListHeaderComponent={
            reportsView === 'chart' ? (
              <View style={styles.chartBlock}>
                <RestPieChart data={pieData} title="Vade dilimleri" />
                <RestBarChart data={pieData} valueLabel="Dilime göre tutar" money maxBars={5} />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder, marginBottom: 8 },
              ]}
            >
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {item.accountName || item.accountCode || '—'}
                </Text>
                <Text style={{ color: palette.blue600, fontWeight: '800' }}>
                  {formatMoney(item.amount)}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                {item.ficheNo} · {item.invoiceDate} → vade {item.dueDate}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {item.cardType === 'customer' ? 'Müşteri' : 'Tedarikçi'} ·{' '}
                {agingBucketLabel(item.bucket)}
                {item.daysOverdue > 0 ? ` · ${item.daysOverdue} gün gecikme` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hintBox: {
    marginHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  kpiRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12 },
  lbl: { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  val: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  valSm: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  sec: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  chartBlock: { marginBottom: 8, gap: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 6,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  picker: {
    marginHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  footerBtn: {
    margin: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
});
