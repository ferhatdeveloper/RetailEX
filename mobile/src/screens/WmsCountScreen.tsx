import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native';
import { Plus, ClipboardList } from 'lucide-react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { PercentBodySheet } from '../components/PercentBodySheet';
import {
  createCountingSlip,
  fetchCountingSlips,
  fetchCountingStores,
  slipStatusLabel,
  type CountingSlip,
} from '../api/wmsStockCountApi';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList, 'WmsCount'>;

type CountType = 'full' | 'cycle' | 'location';

const ACTIVE = new Set(['draft', 'active', 'counting', 'reconciliation']);

const COUNT_TYPES: ReadonlyArray<{ id: CountType; label: string; hint: string }> = [
  { id: 'full', label: 'Tam sayım', hint: 'Tüm stok' },
  { id: 'cycle', label: 'Devir', hint: 'Dönemsel / kısmi' },
  { id: 'location', label: 'Lokasyon', hint: 'Raf / bölge kodu' },
];

export function WmsCountScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<MainStackParamList, 'WmsCount'>>();
  const user = useAuthStore((s) => s.user);
  const orgEpoch = useOrgEpoch();
  const autoCreate = route.params?.autoCreate;

  const [slips, setSlips] = useState<CountingSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [countType, setCountType] = useState<CountType>('full');
  const [locationCode, setLocationCode] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchCountingSlips();
      setSlips(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSlip = useCallback(
    (slipId: string) => {
      navigation.navigate('WmsCountSlip', { slipId });
    },
    [navigation],
  );

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const stores = await fetchCountingStores();
      let storeId = user?.storeId || stores[0]?.id;
      let storeName = stores.find((s) => s.id === storeId)?.name ?? stores[0]?.name ?? null;
      if (!storeId) {
        Alert.alert('Mağaza yok', 'Aktif mağaza bulunamadı. Firma/dönem ayarlarını kontrol edin.');
        return;
      }
      if (stores.length > 1 && !user?.storeId) {
        storeId = stores[0]!.id;
        storeName = stores[0]!.name;
      }
      const loc =
        countType === 'location' ? locationCode.trim() || null : null;
      const slip = await createCountingSlip({
        store_id: storeId,
        store_name: storeName,
        count_type: countType,
        location_code: loc,
        description:
          countType === 'location' && loc
            ? `Lokasyon sayımı · ${loc}`
            : `RetailEX Mobile sayım (${countType})`,
      });
      setCreateOpen(false);
      if (slip.queued) {
        Alert.alert(
          'Fiş kuyruğa alındı',
          `${slip.fiche_no}\n\nBağlantı gelince otomatik senkron edilir.`,
        );
      }
      openSlip(slip.id);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      Alert.alert('Fiş oluşturulamadı', msg);
    } finally {
      setCreating(false);
    }
  }, [countType, load, locationCode, openSlip, user?.storeId]);

  useEffect(() => {
    if (autoCreate && !autoTried && !loading) {
      setAutoTried(true);
      setCreateOpen(true);
    }
  }, [autoCreate, autoTried, loading]);

  const statusColor = (status: CountingSlip['status']) => {
    if (status === 'completed') return palette.green600;
    if (status === 'counting' || status === 'reconciliation') return palette.blue600;
    if (status === 'draft') return colors.textMuted;
    return colors.text;
  };

  const countTypeLabel = (t: string) => {
    const found = COUNT_TYPES.find((c) => c.id === t);
    return found?.label || t;
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Stok Sayım"
        subtitle="Sayım fişleri"
        right={
          <Pressable
            onPress={() => setCreateOpen(true)}
            disabled={creating}
            style={styles.fabHead}
          >
            <Plus size={20} color={palette.white} />
          </Pressable>
        }
      />

      <View style={styles.actions}>
        <PrimaryButton
          label="Yeni sayım fişi"
          onPress={() => setCreateOpen(true)}
          loading={creating}
          style={{ flex: 1 }}
        />
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading && slips.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={slips}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Henüz sayım fişi yok — yeni fiş oluşturun" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const editable = ACTIVE.has(item.status);
            return (
              <Pressable
                onPress={() => openSlip(item.id)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <View style={styles.cardTop}>
                  <ClipboardList size={18} color={palette.blue600} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{item.fiche_no}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {item.store_name || 'Mağaza'} · {countTypeLabel(item.count_type)}
                      {item.location_code ? ` · ${item.location_code}` : ''}
                    </Text>
                  </View>
                  <Text style={[styles.badge, { color: statusColor(item.status) }]}>
                    {slipStatusLabel(item.status)}
                  </Text>
                </View>
                <Text style={{ color: colors.textSubtle, fontSize: 10, marginTop: 6 }}>
                  {item.line_count ?? 0} satır
                  {item.pending ? ' · senkron bekliyor' : ''}
                  {editable ? ' · dokunarak say' : ''}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      <PercentBodySheet
        visible={createOpen}
        onClose={() => !creating && setCreateOpen(false)}
        title="Yeni sayım fişi"
        subtitle="Sayım türü seçin"
        size="compact"
        scrollBody
        footer={
          <>
            <PrimaryButton
              label="İptal"
              variant="ghost"
              onPress={() => setCreateOpen(false)}
              disabled={creating}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              label="Oluştur"
              onPress={() => void handleCreate()}
              loading={creating}
              style={{ flex: 1 }}
            />
          </>
        }
      >
        <Text style={[styles.createLbl, { color: colors.textMuted }]}>SAYIM TÜRÜ</Text>
        <View style={styles.typeRow}>
          {COUNT_TYPES.map((ct) => {
            const on = countType === ct.id;
            return (
              <Pressable
                key={ct.id}
                onPress={() => setCountType(ct.id)}
                style={[
                  styles.typeChip,
                  {
                    borderColor: on ? palette.blue600 : colors.cardBorder,
                    backgroundColor: on ? palette.blue600 : colors.backgroundAlt,
                  },
                ]}
              >
                <Text
                  style={{
                    color: on ? palette.white : colors.text,
                    fontWeight: '700',
                    fontSize: 12,
                  }}
                >
                  {ct.label}
                </Text>
                <Text
                  style={{
                    color: on ? palette.blue100 : colors.textMuted,
                    fontSize: 10,
                    marginTop: 2,
                  }}
                >
                  {ct.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {countType === 'location' ? (
          <>
            <Text style={[styles.createLbl, { color: colors.textMuted }]}>
              LOKASYON KODU (opsiyonel)
            </Text>
            <TextInput
              value={locationCode}
              onChangeText={setLocationCode}
              placeholder="Örn. A-12 / SOĞUK"
              placeholderTextColor={colors.textSubtle}
              style={[
                styles.locInput,
                { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card },
              ]}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </>
        ) : null}
      </PercentBodySheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actions: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  fabHead: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { fontSize: 10, fontWeight: '800' },
  createLbl: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  typeRow: { gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
});
