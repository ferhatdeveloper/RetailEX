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
  Modal,
} from 'react-native';
import { Plus, ClipboardList, ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createWaveFromSales,
  fetchPickWaves,
  waveStatusColor,
  waveStatusLabel,
  type PickWave,
} from '../api/wmsPickingApi';
import { fetchInvoices, type InvoiceRow } from '../api/invoicesApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList, 'WmsWavePicking'>;

const ACTIVE = new Set(['picking', 'draft', 'pending']);

export function WavePickingScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<Nav>();
  const orgEpoch = useOrgEpoch();

  const [waves, setWaves] = useState<PickWave[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [orders, setOrders] = useState<InvoiceRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchPickWaves();
      setWaves(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const openExecute = useCallback(
    (waveId: string) => {
      navigation.navigate('WmsWavePickingExecute', { waveId });
    },
    [navigation],
  );

  const openCreate = useCallback(async () => {
    setShowCreate(true);
    setOrdersLoading(true);
    setPicked({});
    try {
      const list = await fetchInvoices({
        limit: 100,
        filter: { preset: 'order', trcode: 20 },
      });
      setOrders(list);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const toggleOrder = useCallback((id: string) => {
    setPicked((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleAll = useCallback(() => {
    const allSelected = orders.length > 0 && orders.every((o) => picked[o.id]);
    if (allSelected) {
      setPicked({});
    } else {
      const next: Record<string, boolean> = {};
      orders.forEach((o) => {
        next[o.id] = true;
      });
      setPicked(next);
    }
  }, [orders, picked]);

  const handleCreate = useCallback(async () => {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (!ids.length) {
      Alert.alert('Seçim gerekli', 'En az bir sipariş seçin.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const waveId = await createWaveFromSales(ids);
      setShowCreate(false);
      setPicked({});
      openExecute(waveId);
      void load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      Alert.alert('Dalga oluşturulamadı', msg);
    } finally {
      setCreating(false);
    }
  }, [load, openExecute, picked]);

  const selectedCount = Object.values(picked).filter(Boolean).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Dalga Toplama"
        subtitle="Sipariş → lokasyon rotası"
        right={
          <Pressable onPress={() => void openCreate()} style={styles.fabHead}>
            <Plus size={20} color={palette.white} />
          </Pressable>
        }
      />

      <View style={styles.actions}>
        <PrimaryButton label="Siparişten dalga" onPress={() => void openCreate()} style={{ flex: 1 }} />
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading && waves.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.orange500} />
      ) : (
        <FlatList
          data={waves}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Henüz toplama dalgası yok" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const active = ACTIVE.has(item.status);
            return (
              <Pressable
                onPress={() => openExecute(item.id)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <View style={styles.cardTop}>
                  <ClipboardList size={18} color={palette.orange500} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontFamily: 'monospace' }}>
                      {item.wave_no}
                    </Text>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {item.total_items} ürün · {item.order_count} sipariş
                    </Text>
                    {item.total_qty != null && item.total_qty > 0 ? (
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                        Toplam {item.total_qty} adet
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.cardRight}>
                    <Text style={[styles.badge, { color: waveStatusColor(item.status) }]}>
                      {waveStatusLabel(item.status)}
                    </Text>
                    <ChevronRight size={16} color={colors.textMuted} />
                  </View>
                </View>
                {active ? (
                  <Text style={{ color: palette.orange500, fontSize: 10, marginTop: 6, fontWeight: '600' }}>
                    Dokunarak toplamaya başla →
                  </Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={[styles.modalHead, { backgroundColor: palette.orange500 }]}>
              <Text style={styles.modalTitle}>Siparişten Dalga Oluştur</Text>
              <Pressable onPress={() => setShowCreate(false)} hitSlop={8}>
                <Text style={{ color: palette.white, fontWeight: '700', fontSize: 18 }}>×</Text>
              </Pressable>
            </View>

            {ordersLoading ? (
              <ActivityIndicator style={{ margin: 24 }} color={palette.orange500} />
            ) : orders.length === 0 ? (
              <Text style={{ color: colors.textMuted, padding: 16, fontSize: 13 }}>
                Açık satış siparişi bulunamadı.
              </Text>
            ) : (
              <>
                <Pressable onPress={toggleAll} style={[styles.selectAll, { borderColor: colors.cardBorder }]}>
                  <View style={[styles.checkbox, orders.length > 0 && orders.every((o) => picked[o.id]) ? styles.checkboxOn : null]}>
                    {orders.length > 0 && orders.every((o) => picked[o.id]) ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>Tümünü seç</Text>
                </Pressable>
                <FlatList
                  data={orders}
                  keyExtractor={(o) => o.id}
                  style={{ maxHeight: 320 }}
                  renderItem={({ item }) => {
                    const on = !!picked[item.id];
                    return (
                      <Pressable
                        onPress={() => toggleOrder(item.id)}
                        style={[styles.orderRow, { borderColor: colors.cardBorder }, on && { backgroundColor: '#fff7ed' }]}
                      >
                        <View style={[styles.checkbox, on && styles.checkboxOn]}>
                          {on ? <Text style={styles.checkMark}>✓</Text> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: '600', fontSize: 12 }}>{item.fiche_no || '—'}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                            {item.customer_name || '—'}
                          </Text>
                        </View>
                        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
                          {formatMoney(item.net_amount || item.total_gross)}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              </>
            )}

            <View style={[styles.modalFoot, { borderColor: colors.cardBorder }]}>
              <PrimaryButton label="İptal" variant="ghost" onPress={() => setShowCreate(false)} style={{ flex: 1 }} />
              <PrimaryButton
                label={creating ? 'Oluşturuluyor…' : `Dalga oluştur (${selectedCount})`}
                onPress={() => void handleCreate()}
                loading={creating}
                disabled={selectedCount === 0}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  actions: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  fabHead: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  badge: { fontSize: 10, fontWeight: '800' },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 16 },
  modalBox: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalTitle: { color: palette.white, fontWeight: '700', fontSize: 14 },
  modalFoot: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  selectAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: palette.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: palette.orange500, borderColor: palette.orange500 },
  checkMark: { color: palette.white, fontSize: 12, fontWeight: '800' },
});
