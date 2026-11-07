import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { fetchTodayOrders, type RestOrder } from '../api/restaurantApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

/** Bugünkü açık ve kapalı adisyonlar — web fiş geçmişinin gün içi kaydı. */
export function RestaurantHistoryScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const [rows, setRows] = useState<RestOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchTodayOrders(200));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t('ops.restHistory', { defaultValue: 'Fiş geçmişi' })}
        subtitle={t('ops.restHistoryHint', { defaultValue: 'Bugünkü açık ve kapalı adisyonlar' })}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message={t('ops.empty', { defaultValue: 'Kayıt yok' })} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.order_no || item.id.slice(0, 8)} · {item.table_name || '—'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.status || '—'} · {formatMoney(item.total_amount)}
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
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
