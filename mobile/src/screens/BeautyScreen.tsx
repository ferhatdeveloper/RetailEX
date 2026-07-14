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
  fetchBeautyAppointments,
  fetchBeautyServices,
  fetchBeautySpecialists,
  type BeautyAppointment,
  type BeautyService,
  type BeautySpecialist,
} from '../api/beautyApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

type Tab = 'appointments' | 'services' | 'specialists';

export function BeautyScreen() {
  const { colors } = useThemeStore();
  const [tab, setTab] = useState<Tab>('appointments');
  const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
  const [services, setServices] = useState<BeautyService[]>([]);
  const [specialists, setSpecialists] = useState<BeautySpecialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, s, sp] = await Promise.all([
        fetchBeautyAppointments(),
        fetchBeautyServices(),
        fetchBeautySpecialists(),
      ]);
      setAppointments(a);
      setServices(s);
      setSpecialists(sp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'appointments', label: 'Randevu', count: appointments.length },
    { id: 'services', label: 'Hizmet', count: services.length },
    { id: 'specialists', label: 'Uzman', count: specialists.length },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Güzellik Merkezi" subtitle="Randevu · Hizmet · Uzman" />
      <View style={styles.tabs}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[
              styles.tab,
              {
                backgroundColor: tab === t.id ? palette.blue600 : colors.card,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: tab === t.id ? palette.white : colors.text, fontSize: 12, fontWeight: '700' }}>
              {t.label} ({t.count})
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'appointments' ? (
        <FlatList
          data={appointments}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Randevu kaydı yok (şema/veri kontrol)" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.customer_name || 'Müşteri'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.service_name || '—'}</Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                {item.starts_at?.slice(0, 16) || '—'} · {item.specialist_name || ''} · {item.status || ''}
              </Text>
            </View>
          )}
        />
      ) : tab === 'services' ? (
        <FlatList
          data={services}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<EmptyState message="Hizmet kartı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: palette.blue600, fontWeight: '700' }}>{formatMoney(item.price)} ₺</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={specialists}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<EmptyState message="Uzman kaydı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.title || '—'}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 6, padding: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
