import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import {
  fetchRestaurantTables,
  fetchOpenOrders,
  type RestTable,
  type RestOrder,
} from '../api/restaurantApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

type Tab = 'tables' | 'orders';

export function RestaurantScreen() {
  const { colors } = useThemeStore();
  const [tab, setTab] = useState<Tab>('tables');
  const [tables, setTables] = useState<RestTable[]>([]);
  const [orders, setOrders] = useState<RestOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, o] = await Promise.all([fetchRestaurantTables(), fetchOpenOrders()]);
      setTables(t);
      setOrders(o);
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
      <ScreenHeader title="Restoran" subtitle="Masalar & açık adisyonlar" />
      <View style={styles.tabs}>
        {(['tables', 'orders'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[
              styles.tab,
              {
                backgroundColor: tab === t ? palette.blue600 : colors.card,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: tab === t ? palette.white : colors.text, fontWeight: '700', fontSize: 12 }}>
              {t === 'tables' ? `Masalar (${tables.length})` : `Adisyon (${orders.length})`}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'tables' ? (
        <FlatList
          data={tables}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Masa kaydı yok (rest şeması)" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          columnWrapperStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const busy = String(item.status || '').toLowerCase().includes('occ') || Number(item.total) > 0;
            return (
              <View
                style={[
                  styles.tableCard,
                  {
                    backgroundColor: busy ? '#dbeafe' : colors.card,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={{ fontWeight: '800', color: colors.text }}>{item.name}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{item.status || 'boş'}</Text>
                <Text style={{ fontWeight: '700', color: palette.blue600, marginTop: 4 }}>
                  {formatMoney(item.total)} ₺
                </Text>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<EmptyState message="Açık adisyon yok" />}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.order_no || item.id.slice(0, 8)} · {item.table_name || 'Masa'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.waiter || ''} · {item.status || ''}
              </Text>
              <Text style={{ color: palette.blue600, fontWeight: '800', marginTop: 4 }}>
                {formatMoney(item.total_amount)} ₺
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
  tabs: { flexDirection: 'row', gap: 8, padding: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  tableCard: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 88 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
