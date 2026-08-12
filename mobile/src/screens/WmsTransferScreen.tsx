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
} from 'react-native';
import { Plus, ArrowLeftRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createTransfer,
  fetchTransferStores,
  fetchTransfers,
  transferStatusLabel,
  type WmsTransfer,
} from '../api/wmsTransferApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList, 'WmsTransfer'>;

const ACTIVE = new Set(['pending', 'in_transit']);

export function WmsTransferScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<Nav>();
  const orgEpoch = useOrgEpoch();

  const [transfers, setTransfers] = useState<WmsTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [stores, setStores] = useState<{ id: string; name: string; code: string }[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, storeList] = await Promise.all([fetchTransfers(), fetchTransferStores()]);
      setTransfers(list);
      setStores(storeList);
      setSourceId((prev) => prev || storeList[0]?.id || '');
      setTargetId((prev) => prev || storeList[1]?.id || storeList[0]?.id || '');
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
    (transferId: string) => {
      navigation.navigate('WmsTransferSlip', { transferId });
    },
    [navigation],
  );

  const handleCreate = useCallback(async () => {
    if (!sourceId || !targetId) {
      Alert.alert('Eksik seçim', 'Kaynak ve hedef depo seçin.');
      return;
    }
    if (sourceId === targetId) {
      Alert.alert('Geçersiz seçim', 'Kaynak ve hedef depo aynı olamaz.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const transfer = await createTransfer({
        source_store_id: sourceId,
        target_store_id: targetId,
      });
      setShowCreate(false);
      openSlip(transfer.id);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      Alert.alert('Transfer oluşturulamadı', msg);
    } finally {
      setCreating(false);
    }
  }, [load, openSlip, sourceId, targetId]);

  const statusColor = (status: string) => {
    if (status === 'completed') return palette.green600;
    if (status === 'in_transit') return palette.blue600;
    if (status === 'pending') return '#d97706';
    if (status === 'cancelled') return colors.textMuted;
    return colors.text;
  };

  const StorePicker = ({
    label,
    value,
    onChange,
    excludeId,
  }: {
    label: string;
    value: string;
    onChange: (id: string) => void;
    excludeId?: string;
  }) => (
    <View style={styles.pickerBlock}>
      <Text style={[styles.pickerLbl, { color: colors.textMuted }]}>{label}</Text>
      <View style={[styles.pickerList, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}>
        {stores
          .filter((s) => s.id !== excludeId)
          .map((s) => {
            const selected = value === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => onChange(s.id)}
                style={[
                  styles.pickerItem,
                  selected && { backgroundColor: palette.blue50, borderColor: palette.blue600 },
                ]}
              >
                <Text style={{ color: selected ? palette.blue700 : colors.text, fontWeight: selected ? '700' : '500' }}>
                  {s.name}
                </Text>
                {s.code ? (
                  <Text style={{ color: colors.textMuted, fontSize: 10 }}>{s.code}</Text>
                ) : null}
              </Pressable>
            );
          })}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Depo Transferi"
        subtitle="Ambar / mağaza arası"
        right={
          <Pressable
            onPress={() => setShowCreate((v) => !v)}
            style={styles.fabHead}
          >
            <Plus size={20} color={palette.white} />
          </Pressable>
        }
      />

      {showCreate ? (
        <View style={[styles.createPanel, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Yeni transfer</Text>
          {stores.length < 2 ? (
            <Text style={{ color: palette.red500, fontSize: 12 }}>
              En az iki aktif depo/mağaza gerekli.
            </Text>
          ) : (
            <>
              <StorePicker label="Kaynak depo" value={sourceId} onChange={setSourceId} excludeId={targetId} />
              <StorePicker label="Hedef depo" value={targetId} onChange={setTargetId} excludeId={sourceId} />
              <View style={styles.createActions}>
                <PrimaryButton
                  label="İptal"
                  variant="ghost"
                  onPress={() => setShowCreate(false)}
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  label="Transfer başlat"
                  onPress={() => void handleCreate()}
                  loading={creating}
                  style={{ flex: 2 }}
                />
              </View>
            </>
          )}
        </View>
      ) : (
        <View style={styles.actions}>
          <PrimaryButton
            label="Yeni transfer"
            onPress={() => setShowCreate(true)}
            style={{ flex: 1 }}
          />
        </View>
      )}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading && transfers.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={transfers}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Henüz transfer yok — yeni transfer oluşturun" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const editable = ACTIVE.has(item.status);
            return (
              <Pressable
                onPress={() => openSlip(item.id)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <View style={styles.cardTop}>
                  <ArrowLeftRight size={18} color={palette.blue600} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{item.fiche_no}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                      {item.source_store_name || 'Kaynak'} → {item.target_store_name || 'Hedef'}
                    </Text>
                  </View>
                  <Text style={[styles.badge, { color: statusColor(item.status) }]}>
                    {transferStatusLabel(item.status)}
                  </Text>
                </View>
                <Text style={{ color: colors.textSubtle, fontSize: 10, marginTop: 6 }}>
                  {item.item_count ?? 0} kalem
                  {editable ? ' · dokunarak düzenle' : ''}
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
  actions: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  fabHead: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  createPanel: {
    marginHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  pickerBlock: { gap: 4 },
  pickerLbl: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  pickerList: { borderWidth: 1, borderRadius: 8, maxHeight: 120, overflow: 'hidden' },
  pickerItem: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  createActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { fontSize: 10, fontWeight: '800' },
});
