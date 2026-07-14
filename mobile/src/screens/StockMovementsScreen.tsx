import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import {
  fetchStockMovements,
  STOCK_SLIP_TRCODES,
  stockMovementLabel,
  type StockMovementRow,
} from '../api/stockMovementApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

const FILTER_META: Record<
  'all' | 'deficit' | 'surplus',
  { title: string; subtitle: string; trcode?: number }
> = {
  all: { title: 'Malzeme Yönetim Fişleri', subtitle: 'Ambar fişleri + faturalar' },
  deficit: {
    title: 'Sayım Eksiği Fişleri',
    subtitle: 'TRCODE 50',
    trcode: STOCK_SLIP_TRCODES.SHORTAGE,
  },
  surplus: {
    title: 'Sayım Fazlası Fişleri',
    subtitle: 'TRCODE 26',
    trcode: STOCK_SLIP_TRCODES.SURPLUS,
  },
};

export function StockMovementsScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const route = useRoute<RouteProp<MainStackParamList, 'StockMovements'>>();
  const filter = route.params?.filter ?? 'all';
  const meta = FILTER_META[filter];

  const [rows, setRows] = useState<StockMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(
        await fetchStockMovements({
          trcode: meta.trcode,
          limit: filter === 'all' ? 300 : 200,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [meta.trcode, filter, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={meta.title} subtitle={`${rows.length} kayıt · ${meta.subtitle}`} />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Stok hareketi yok" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                  {item.document_no || '—'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.movement_date}</Text>
              </View>
              <Text style={{ color: palette.blue600, fontWeight: '700', fontSize: 12, marginTop: 4 }}>
                {stockMovementLabel(item)}
                {item.source_kind === 'invoice' ? ' · Fatura' : ''}
              </Text>
              {item.warehouse_name ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {item.warehouse_name}
                </Text>
              ) : null}
              {item.customer_name ? (
                <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                  {item.customer_name}
                </Text>
              ) : null}
              {item.description ? (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              <View style={[styles.rowBetween, { marginTop: 6 }]}>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {item.line_count} kalem · {item.status || '—'}
                </Text>
                <Text style={{ color: colors.textSubtle, fontSize: 10, fontFamily: 'monospace' }}>
                  {item.movement_type}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
