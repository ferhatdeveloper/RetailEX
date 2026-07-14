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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Plus, Tag } from 'lucide-react-native';
import { ScreenHeader, SearchBar, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import {
  fetchCampaigns,
  formatCampaignDiscount,
  formatCampaignPeriod,
  isCampaignInPeriod,
  type CampaignDetail,
} from '../api/campaignsApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

function StatusBadge({
  active,
  inPeriod,
}: {
  active: boolean;
  inPeriod: boolean;
}) {
  const bg = active && inPeriod ? palette.green600 : active ? palette.orange500 : palette.gray400;
  const label = active && inPeriod ? 'Aktif' : active ? 'Pasif dönem' : 'Pasif';
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

export function CampaignsScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const orgEpoch = useOrgEpoch();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<CampaignDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchCampaigns(search);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), search ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Kampanyalar"
        subtitle={`${rows.length} kayıt`}
        right={
          <HeaderIconButton accent onPress={() => navigation.navigate('CampaignForm')}>
            <Plus size={18} color={palette.white} />
          </HeaderIconButton>
        }
      />
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Kampanya adı, açıklama…"
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} />
          }
          ListEmptyComponent={<EmptyState message="Kampanya bulunamadı" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const inPeriod = isCampaignInPeriod(item);
            return (
              <Pressable
                onPress={() =>
                  navigation.navigate('CampaignDetail', { campaignId: item.id })
                }
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <View style={styles.row}>
                  <View style={styles.iconWrap}>
                    <Tag size={18} color={palette.blue600} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {item.description ? (
                      <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                        {item.description}
                      </Text>
                    ) : null}
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                      {formatCampaignPeriod(item.startDate, item.endDate)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.discount}>{formatCampaignDiscount(item)}</Text>
                    <StatusBadge active={item.active} inPeriod={inPeriod} />
                    <ChevronRight size={16} color={colors.textMuted} />
                  </View>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 8 }}>
                  {item.productIds.length} ürün · öncelik {item.priority}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 14, fontWeight: '700' },
  discount: { fontSize: 14, fontWeight: '800', color: palette.blue600 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
});
