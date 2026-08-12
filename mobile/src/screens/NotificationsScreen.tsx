import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { AlertTriangle, Bell, Clock } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import {
  fetchNotificationAlerts,
  type NotificationAlertRow,
} from '../api/notificationsApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Filter = 'all' | 'stock' | 'overdue';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'overdue', label: 'Vadesi geçmiş' },
  { id: 'stock', label: 'Kritik stok' },
];

export function NotificationsScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [filter, setFilter] = useState<Filter>('all');
  const [alerts, setAlerts] = useState<NotificationAlertRow[]>([]);
  const [counts, setCounts] = useState({ stock: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchNotificationAlerts({ stockLimit: 50, overdueLimit: 50 });
      setAlerts(data.alerts);
      setCounts({ stock: data.stock.length, overdue: data.overdue.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAlerts([]);
      setCounts({ stock: 0, overdue: 0 });
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'all') return alerts;
    if (filter === 'stock') return alerts.filter((a) => a.kind === 'critical_stock');
    return alerts.filter((a) => a.kind === 'overdue_due');
  }, [alerts, filter]);

  const total = counts.stock + counts.overdue;

  const openAlert = (item: NotificationAlertRow) => {
    if (item.kind === 'critical_stock') {
      navigation.navigate('ProductDetail', { productId: item.productId });
      return;
    }
    navigation.navigate('InvoiceDetail', { invoiceId: item.invoiceId });
  };

  const renderItem = ({ item }: { item: NotificationAlertRow }) => {
    const isOverdue = item.kind === 'overdue_due';
    const accent = isOverdue ? palette.red500 : palette.orange500;
    const Icon = isOverdue ? Clock : AlertTriangle;
    return (
      <Pressable
        onPress={() => openAlert(item)}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.cardBorder,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: isOverdue ? palette.red100 : '#ffedd5' }]}>
          <Icon size={18} color={accent} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={[styles.badge, { backgroundColor: isOverdue ? palette.red100 : '#ffedd5' }]}>
              <Text style={[styles.badgeText, { color: accent }]}>
                {isOverdue ? 'Vade' : 'Stok'}
              </Text>
            </View>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
            {item.subtitle}
          </Text>
          <Text style={{ color: accent, fontSize: 12, fontWeight: '600', marginTop: 4 }} numberOfLines={2}>
            {item.detail}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Bildirim Merkezi"
        subtitle={total > 0 ? `${total} uyarı · ${counts.overdue} vade · ${counts.stock} stok` : 'Uyarı yok'}
      />

      <View style={styles.summaryRow}>
        <View style={[styles.summaryChip, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Bell size={14} color={palette.blue600} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{total}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>toplam</Text>
        </View>
        <View style={[styles.summaryChip, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Clock size={14} color={palette.red500} />
          <Text style={{ color: palette.red500, fontWeight: '700', fontSize: 13 }}>{counts.overdue}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>vade</Text>
        </View>
        <View style={[styles.summaryChip, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <AlertTriangle size={14} color={palette.orange500} />
          <Text style={{ color: palette.orange500, fontWeight: '700', fontSize: 13 }}>{counts.stock}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>stok</Text>
        </View>
      </View>

      <SegmentTabBar
        layout="scroll"
        value={filter}
        onChange={setFilter}
        items={FILTERS.map((f) => {
          const count =
            f.id === 'all' ? total : f.id === 'stock' ? counts.stock : counts.overdue;
          return {
            id: f.id,
            label: count > 0 ? `${f.label} (${count})` : f.label,
          };
        })}
      />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <EmptyState
              message={
                filter === 'all'
                  ? 'Şu an kritik stok veya vadesi geçmiş kayıt yok'
                  : filter === 'stock'
                    ? 'Kritik stok uyarısı yok'
                    : 'Vadesi geçmiş açık cari kaydı yok'
              }
            />
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  summaryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  card: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: { flex: 1, fontWeight: '700', fontSize: 14 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
});
