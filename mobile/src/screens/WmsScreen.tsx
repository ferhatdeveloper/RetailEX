import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { ScreenHeader, SearchBar, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { fetchWmsStock, fetchWmsSummary, type WmsStockRow } from '../api/wmsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

export function WmsScreen() {
  const { colors } = useThemeStore();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<WmsStockRow[]>([]);
  const [summary, setSummary] = useState({ productCount: 0, belowMin: 0, zeroStock: 0, totalStockValue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, sum] = await Promise.all([fetchWmsStock(search), fetchWmsSummary()]);
      setRows(list);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), search ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="WMS / Depo" subtitle="Stok durumu" />
      <View style={styles.kpiRow}>
        {[
          { l: 'Ürün', v: String(summary.productCount) },
          { l: 'Kritik', v: String(summary.belowMin), c: palette.red500 },
          { l: 'Sıfır', v: String(summary.zeroStock) },
          { l: 'Değer', v: formatMoney(summary.totalStockValue) },
        ].map((k) => (
          <View key={k.l} style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={styles.lbl}>{k.l}</Text>
            <Text style={[styles.val, { color: k.c || colors.text }]} numberOfLines={1}>{k.v}</Text>
          </View>
        ))}
      </View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Stok ara…" />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Stok kaydı yok" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const critical = item.min_stock != null && item.stock < item.min_stock;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {item.code || '—'} · {item.warehouse || ''}
                </Text>
                <Text style={{ color: critical ? palette.red500 : palette.green600, fontWeight: '700', marginTop: 4 }}>
                  {item.stock} {item.unit || ''}
                  {item.min_stock != null ? ` (min ${item.min_stock})` : ''}
                </Text>
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
  kpiRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingTop: 8 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 6 },
  lbl: { fontSize: 9, color: '#6b7280', fontWeight: '600' },
  val: { fontSize: 11, fontWeight: '800', marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
