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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MapPin, Phone, Store, User } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { fetchStoreList, type StoreMgmtRow } from '../api/storeManagementApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'StoreManagement'>;

function storeSubtitle(item: StoreMgmtRow): string {
  const parts: string[] = [];
  if (item.code) parts.push(item.code);
  if (item.city) parts.push(item.city);
  if (item.region) parts.push(item.region);
  return parts.join(' · ') || '—';
}

export function StoreManagementScreen({ route, navigation }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const user = useAuthStore((s) => s.user);
  const screenId = route.params?.screenId ?? 'store-management';
  const groupByRegion = route.params?.groupByRegion ?? screenId === 'regional';

  const [stores, setStores] = useState<StoreMgmtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title =
    screenId === 'multistore'
      ? 'Çoklu Mağaza'
      : screenId === 'regional'
        ? 'Bölgesel Bayilik'
        : 'Mağaza Paneli';

  const load = useCallback(async () => {
    setError(null);
    try {
      setStores(await fetchStoreList());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    if (!groupByRegion) return null;
    const map = new Map<string, StoreMgmtRow[]>();
    for (const s of stores) {
      const key = (s.region || 'Bölge yok').trim();
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'tr'));
  }, [stores, groupByRegion]);

  const activeCount = stores.filter((s) => s.is_active).length;

  const renderStore = (item: StoreMgmtRow) => (
    <Pressable
      onPress={() => navigation.navigate('Organization')}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.cardBorder,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: palette.blue100 }]}>
        <Store size={18} color={palette.blue600} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.is_main ? (
            <Text style={styles.badgeMain}>Merkez</Text>
          ) : !item.is_active ? (
            <Text style={styles.badgeOff}>Pasif</Text>
          ) : null}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{storeSubtitle(item)}</Text>
        {item.manager_name ? (
          <View style={styles.metaRow}>
            <User size={12} color={colors.textSubtle} />
            <Text style={{ color: colors.textSubtle, fontSize: 11 }}>{item.manager_name}</Text>
          </View>
        ) : null}
        {item.phone ? (
          <View style={styles.metaRow}>
            <Phone size={12} color={colors.textSubtle} />
            <Text style={{ color: colors.textSubtle, fontSize: 11 }}>{item.phone}</Text>
          </View>
        ) : null}
        {item.city && !groupByRegion ? (
          <View style={styles.metaRow}>
            <MapPin size={12} color={colors.textSubtle} />
            <Text style={{ color: colors.textSubtle, fontSize: 11 }}>{item.city}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={title}
        subtitle={`${activeCount}/${stores.length} aktif · Firma ${user?.firmNr ?? '—'}`}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : groupByRegion && grouped ? (
        <FlatList
          data={grouped}
          keyExtractor={([region]) => region}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Mağaza kaydı bulunamadı" />}
          contentContainerStyle={styles.list}
          renderItem={({ item: [region, list] }) => (
            <View style={styles.group}>
              <Text style={[styles.groupTitle, { color: colors.text }]}>{region}</Text>
              {list.map((s) => (
                <View key={s.id}>{renderStore(s)}</View>
              ))}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={stores}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Mağaza kaydı bulunamadı" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => renderStore(item)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  group: { gap: 6, marginBottom: 12 },
  groupTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  card: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontWeight: '700', fontSize: 14 },
  badgeMain: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.blue600,
    backgroundColor: palette.blue100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeOff: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.red500,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
