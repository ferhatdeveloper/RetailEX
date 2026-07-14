import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { fetchSalesByDay, fetchTopProducts, type SalesDayRow, type TopProductRow } from '../api/reportsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

export function ReportSalesScreen() {
  const { colors } = useThemeStore();
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalRev = days.reduce((s, d) => s + d.revenue, 0);
  const totalCnt = days.reduce((s, d) => s + d.count, 0);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Günlük Satış Özeti" subtitle="Son 14 gün" />
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
          ListEmptyComponent={<EmptyState message="Satış verisi yok" />}
          ListHeaderComponent={
            top.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={[styles.sec, { color: colors.text }]}>En çok satanlar</Text>
                {top.slice(0, 5).map((p, i) => (
                  <Text key={`${p.product_name}-${i}`} style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                    {i + 1}. {p.product_name} — {formatMoney(p.amount)} ₺
                  </Text>
                ))}
                <Text style={[styles.sec, { color: colors.text, marginTop: 16 }]}>Günlük</Text>
              </View>
            ) : null
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
  const { colors } = useThemeStore();
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Kritik Stok" subtitle={`${rows.length} malzeme`} />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Kritik stok yok" />}
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  kpiRow: { flexDirection: 'row', gap: 8, padding: 12 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12 },
  lbl: { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  val: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  sec: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 6,
  },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
