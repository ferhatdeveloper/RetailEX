import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MapPin, CheckSquare, Navigation } from 'lucide-react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  completePickWave,
  fetchPickTasks,
  fetchPickWave,
  recordPick,
  waveStatusLabel,
  type PickTask,
  type PickWave,
} from '../api/wmsPickingApi';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export function WavePickingExecuteScreen() {
  const { colors } = useThemeStore();
  const route = useRoute<RouteProp<MainStackParamList, 'WmsWavePickingExecute'>>();
  const { waveId } = route.params;

  const [wave, setWave] = useState<PickWave | null>(null);
  const [tasks, setTasks] = useState<PickTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [w, list] = await Promise.all([fetchPickWave(waveId), fetchPickTasks(waveId)]);
      if (!w) throw new Error('Dalga bulunamadı');
      setWave(w);
      setTasks(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [waveId]);

  useEffect(() => {
    void load();
  }, [load]);

  const progress = useMemo(() => {
    if (!tasks.length) return 0;
    const done = tasks.filter((t) => t.status === 'completed').length;
    return Math.round((done / tasks.length) * 100);
  }, [tasks]);

  const canComplete = wave?.status === 'picking' && tasks.length > 0 && tasks.every((t) => t.status === 'completed');

  const handleConfirmPick = useCallback(
    async (task: PickTask) => {
      if (task.status === 'completed') return;
      const remaining = Math.max(task.quantity - task.picked_quantity, 0);
      setSaving(true);
      try {
        await recordPick(task.id, remaining || task.quantity);
        const refreshed = await fetchPickTasks(waveId);
        setTasks(refreshed);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert('Toplama kaydedilemedi', msg);
      } finally {
        setSaving(false);
      }
    },
    [waveId],
  );

  const handleCompleteWave = useCallback(async () => {
    if (!canComplete) {
      Alert.alert('Eksik görev', 'Tüm satırlar toplanmadan dalga tamamlanamaz.');
      return;
    }
    Alert.alert('Dalgayı bitir', 'Toplama dalgası tamamlanacak. Onaylıyor musunuz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Tamamla',
        onPress: () => {
          void (async () => {
            setSaving(true);
            try {
              await completePickWave(waveId);
              const w = await fetchPickWave(waveId);
              if (w) setWave(w);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              Alert.alert('Hata', msg);
            } finally {
              setSaving(false);
            }
          })();
        },
      },
    ]);
  }, [canComplete, waveId]);

  if (loading && !wave) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Toplama" subtitle="Yükleniyor…" />
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.orange500} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={wave?.wave_no || 'Toplama'}
        subtitle={`${waveStatusLabel(wave?.status || '')} · S-Shape rota`}
      />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <View style={[styles.progressBar, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <View style={styles.progressTop}>
          <Navigation size={16} color={palette.orange500} />
          <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>
            Tamamlanma %{progress}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {tasks.filter((t) => t.status === 'completed').length}/{tasks.length} satır
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: colors.backgroundAlt }]}>
          <View style={[styles.fill, { width: `${progress}%` }]} />
        </View>
      </View>

      {tasks.length === 0 ? (
        <EmptyState message="Bu dalgada toplama görevi yok" />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 100 }}
          renderItem={({ item, index }) => {
            const done = item.status === 'completed';
            const remaining = Math.max(item.quantity - item.picked_quantity, 0);
            return (
              <View
                style={[
                  styles.taskCard,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                  done && styles.taskDone,
                ]}
              >
                <View style={styles.taskRow}>
                  <View style={styles.seq}>
                    <Text style={styles.seqText}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.locRow}>
                      <MapPin size={14} color={palette.orange500} />
                      <Text style={[styles.locCode, { color: colors.text }]}>{item.location_code}</Text>
                    </View>
                    <Text style={{ color: colors.text, fontWeight: '700', marginTop: 4 }}>{item.product_name}</Text>
                    {item.lot_no ? (
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>Lot: {item.lot_no}</Text>
                    ) : null}
                  </View>
                  <View style={styles.qtyBox}>
                    <Text style={{ color: colors.textMuted, fontSize: 9 }}>Hedef</Text>
                    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>
                      {item.quantity}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 9 }}>Adet</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => void handleConfirmPick(item)}
                  disabled={done || saving}
                  style={[
                    styles.confirmBtn,
                    done ? styles.confirmDone : styles.confirmActive,
                    (done || saving) && { opacity: done ? 0.7 : 0.6 },
                  ]}
                >
                  <CheckSquare size={16} color={done ? palette.green600 : palette.white} />
                  <Text style={{ color: done ? palette.green600 : palette.white, fontWeight: '700', fontSize: 13 }}>
                    {done ? 'Toplandı' : `Onayla (${remaining || item.quantity})`}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}

      {wave?.status === 'picking' ? (
        <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <PrimaryButton
            label="Dalgayı bitir"
            onPress={() => void handleCompleteWave()}
            loading={saving}
            disabled={!canComplete}
            style={{ flex: 1 }}
          />
        </View>
      ) : wave?.status === 'completed' ? (
        <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={{ color: palette.green600, fontWeight: '700', textAlign: 'center', flex: 1 }}>
            Dalga tamamlandı
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progressBar: { marginHorizontal: 12, marginTop: 8, borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: palette.orange500, borderRadius: 3 },
  taskCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  taskDone: { opacity: 0.55 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  seq: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#ffedd5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seqText: { color: '#c2410c', fontWeight: '800', fontSize: 16 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locCode: { fontFamily: 'monospace', fontWeight: '700', fontSize: 12 },
  qtyBox: { alignItems: 'center', paddingHorizontal: 8, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: '#e5e7eb' },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
  },
  confirmActive: { backgroundColor: palette.orange500 },
  confirmDone: { backgroundColor: '#dcfce7' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
    paddingBottom: 20,
  },
});
