/**
 * Teslimat / kurye — canlı konum (expo-location) + durum güncelleme.
 * Web: LogisticsModule + logistics.courier_locations / couriers.last_lat|lng
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import { MapPin, Navigation, Radio } from 'lucide-react-native';
import {
  ScreenHeader,
  SearchBar,
  EmptyState,
  ErrorBanner,
} from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import {
  listDeliveries,
  listCouriers,
  pickDefaultCourier,
  nextStatuses,
  statusLabel,
  transitionDeliveryStatus,
  recordCourierLocation,
  flushLocalLocationQueue,
  type LogisticsDelivery,
  type LogisticsCourier,
  type DeliveryStatus,
} from '../api/logisticsApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';
import { tMenuItem, tMenuSection } from '../i18n/menuLabels';

const TRACK_INTERVAL_MS = 12_000;

type DeliveryTab = NonNullable<
  NonNullable<MainStackParamList['Delivery']>['initialTab']
>;

export function DeliveryScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const route = useRoute<RouteProp<MainStackParamList, 'Delivery'>>();
  const initialTab = route.params?.initialTab ?? 'deliveries';
  const [tab, setTab] = useState<DeliveryTab>(initialTab);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<LogisticsDelivery[]>([]);
  const [couriers, setCouriers] = useState<LogisticsCourier[]>([]);
  const [courierId, setCourierId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [coords, setCoords] = useState<{
    lat: number;
    lng: number;
    accuracy?: number | null;
    at: string;
    sink: 'pg' | 'local' | 'device';
  } | null>(null);
  const [busyStatus, setBusyStatus] = useState(false);

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastWriteRef = useRef(0);
  const courierIdRef = useRef(courierId);
  const selectedIdRef = useRef(selectedId);
  courierIdRef.current = courierId;
  selectedIdRef.current = selectedId;

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const activeCourier = couriers.find((c) => c.id === courierId) ?? null;

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs = useMemo(
    () =>
      [
        { id: 'deliveries' as const, label: tMenuItem(t, 'logistics', 'Teslimatlar') },
        { id: 'live' as const, label: tMenuItem(t, 'delivery-live', 'Canlı Konum') },
        { id: 'couriers' as const, label: tMenuItem(t, 'couriers', 'Kurye Listesi') },
      ] as const,
    [t],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const [dels, cors] = await Promise.all([
        listDeliveries({ search, limit: 80 }),
        listCouriers(),
      ]);
      setRows(dels);
      setCouriers(cors);
      setCourierId((prev) => {
        if (prev && cors.some((c) => c.id === prev)) return prev;
        return pickDefaultCourier(cors)?.id ?? null;
      });
      void flushLocalLocationQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [search, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), search ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const pushLocation = useCallback(async (loc: Location.LocationObject) => {
    const lat = loc.coords.latitude;
    const lng = loc.coords.longitude;
    const speed =
      loc.coords.speed != null && loc.coords.speed >= 0
        ? Math.round(loc.coords.speed * 3.6 * 10) / 10
        : null;
    const now = Date.now();
    const cid = courierIdRef.current;

    let sink: 'pg' | 'local' | 'device' = 'device';
    if (cid && now - lastWriteRef.current >= TRACK_INTERVAL_MS) {
      lastWriteRef.current = now;
      try {
        sink = await recordCourierLocation(cid, {
          lat,
          lng,
          speedKmh: speed,
          deliveryId: selectedIdRef.current,
          recordedAt: new Date(loc.timestamp).toISOString(),
        });
      } catch {
        sink = 'local';
      }
    }

    setCoords({
      lat,
      lng,
      accuracy: loc.coords.accuracy,
      at: new Date(loc.timestamp).toLocaleTimeString('tr-TR'),
      sink,
    });
  }, []);

  const stopTracking = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    setTracking(false);
  }, []);

  const startTracking = useCallback(async () => {
    setPermDenied(false);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermDenied(true);
      Alert.alert(
        'Konum izni',
        'Canlı konum için uygulama ayarlarından konum iznini açın.',
      );
      return;
    }
    if (!courierIdRef.current) {
      Alert.alert('Kurye', 'Önce bir kurye seçin (veya web’de kurye kartı oluşturun).');
      return;
    }

    stopTracking();
    setTracking(true);

    try {
      const cur = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await pushLocation(cur);
    } catch {
      /* watch ile devam */
    }

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: TRACK_INTERVAL_MS,
        distanceInterval: 25,
        mayShowUserSettingsDialog: true,
      },
      (loc) => {
        void pushLocation(loc);
      },
    );
  }, [pushLocation, stopTracking]);

  useEffect(() => () => stopTracking(), [stopTracking]);

  const onToggleTrack = () => {
    if (tracking) stopTracking();
    else void startTracking();
  };

  const onStatus = async (to: DeliveryStatus) => {
    if (!selected) return;
    setBusyStatus(true);
    try {
      await transitionDeliveryStatus(selected.id, to, {
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      await load();
      setSelectedId(selected.id);
    } catch (e) {
      Alert.alert('Durum', e instanceof Error ? e.message : String(e));
    } finally {
      setBusyStatus(false);
    }
  };

  const openMaps = (lat: number, lng: number) => {
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}`;
    void Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`),
    );
  };

  const next = selected ? nextStatuses(selected.status) : [];
  const showLive = tab === 'live' || tab === 'deliveries';
  const showDeliveries = tab === 'deliveries';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={tMenuSection(t, 'delivery-management', 'Teslimat Yönetimi')}
        subtitle={tabs.find((x) => x.id === tab)?.label}
      />

      <SegmentTabBar
        layout="equal"
        variant="underline"
        value={tab}
        onChange={setTab}
        items={tabs.map((item) => ({ id: item.id, label: item.label }))}
      />

      {showLive ? (
        <View style={[styles.trackCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.trackRow}>
            <Radio size={18} color={tracking ? palette.green600 : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                {tracking ? 'Canlı konum açık' : 'Canlı konum kapalı'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {activeCourier
                  ? `Kurye: ${activeCourier.full_name}`
                  : 'Kurye yok — logistics.couriers'}
                {coords
                  ? ` · ${coords.sink === 'pg' ? 'PG' : coords.sink === 'local' ? 'yerel kuyruk' : 'cihaz'}`
                  : ''}
              </Text>
            </View>
            <Pressable
              onPress={onToggleTrack}
              style={[
                styles.trackBtn,
                { backgroundColor: tracking ? palette.red500 : palette.blue600 },
              ]}
            >
              <Text style={styles.trackBtnText}>{tracking ? 'Durdur' : 'Başlat'}</Text>
            </Pressable>
          </View>

          {permDenied ? (
            <Text style={{ color: palette.red500, fontSize: 11, marginTop: 6 }}>
              Konum izni reddedildi.
            </Text>
          ) : null}

          {coords ? (
            <Pressable
              onPress={() => openMaps(coords.lat, coords.lng)}
              style={styles.coordRow}
            >
              <MapPin size={14} color={palette.blue600} />
              <Text style={{ color: colors.text, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                ±{coords.accuracy != null ? Math.round(coords.accuracy) : '?'}m · {coords.at}
              </Text>
              <Navigation size={12} color={palette.blue600} />
            </Pressable>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
              Başlatınca enlem / boylam burada görünür; harita uygulamasına dokunun.
            </Text>
          )}

          {tab === 'live' && couriers.length > 0 ? (
            <View style={styles.courierChips}>
              {couriers.slice(0, 8).map((c) => {
                const on = c.id === courierId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setCourierId(c.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: on ? palette.blue100 : colors.backgroundAlt,
                        borderColor: on ? palette.blue600 : colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{ color: on ? palette.blue700 : colors.textMuted, fontSize: 11, fontWeight: '600' }}
                      numberOfLines={1}
                    >
                      {c.full_name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {showDeliveries ? (
        <>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Teslimat / müşteri ara…" />

          {selected ? (
            <View style={[styles.statusBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                {selected.delivery_no} · {statusLabel(selected.status)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={2}>
                {selected.customer_name || '—'} · {selected.address_text || 'Adres yok'}
              </Text>
              {next.length > 0 ? (
                <View style={styles.statusRow}>
                  {next.map((s) => (
                    <Pressable
                      key={s}
                      disabled={busyStatus}
                      onPress={() => void onStatus(s)}
                      style={[styles.statusBtn, { opacity: busyStatus ? 0.5 : 1 }]}
                    >
                      <Text style={styles.statusBtnText}>{statusLabel(s)}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
                  Bu durumdan ileri geçiş yok.
                </Text>
              )}
            </View>
          ) : null}

          {loading && rows.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(item) => item.id}
              refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
              ListEmptyComponent={<EmptyState message="Açık teslimat yok" />}
              contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 48 }}
              renderItem={({ item }) => {
                const on = item.id === selectedId;
                return (
                  <Pressable
                    onPress={() => setSelectedId(item.id)}
                    style={[
                      styles.card,
                      {
                        backgroundColor: colors.card,
                        borderColor: on ? palette.blue600 : colors.cardBorder,
                        borderWidth: on ? 2 : 1,
                      },
                    ]}
                  >
                    <View style={styles.cardTop}>
                      <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                        {item.delivery_no}
                      </Text>
                      <Text style={[styles.badge, { color: palette.blue700, backgroundColor: palette.blue100 }]}>
                        {statusLabel(item.status)}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 13 }} numberOfLines={1}>
                      {item.customer_name || 'Müşteri yok'}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={2}>
                      {item.address_text || item.sales_fiche_no || '—'}
                      {item.line_count ? ` · ${item.line_count} kalem` : ''}
                    </Text>
                    {(item.lat != null && item.lng != null) || item.phone ? (
                      <View style={styles.cardActions}>
                        {item.lat != null && item.lng != null ? (
                          <Pressable onPress={() => openMaps(item.lat!, item.lng!)}>
                            <Text style={{ color: palette.blue600, fontSize: 11, fontWeight: '700' }}>
                              Harita
                            </Text>
                          </Pressable>
                        ) : null}
                        {item.phone ? (
                          <Pressable onPress={() => void Linking.openURL(`tel:${item.phone}`)}>
                            <Text style={{ color: palette.green600, fontSize: 11, fontWeight: '700' }}>
                              Ara
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          )}
        </>
      ) : null}

      {tab === 'couriers' ? (
        loading && couriers.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
        ) : (
          <FlatList
            data={couriers}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            ListEmptyComponent={<EmptyState message="Aktif kurye yok" />}
            contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 48 }}
            renderItem={({ item }) => {
              const on = item.id === courierId;
              const hasLoc = item.last_lat != null && item.last_lng != null;
              return (
                <Pressable
                  onPress={() => setCourierId(item.id)}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: on ? palette.blue600 : colors.cardBorder,
                      borderWidth: on ? 2 : 1,
                    },
                  ]}
                >
                  <View style={styles.cardTop}>
                    <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                      {item.full_name}
                    </Text>
                    {on ? (
                      <Text style={[styles.badge, { color: palette.blue700, backgroundColor: palette.blue100 }]}>
                        Seçili
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                    {item.phone || 'Telefon yok'}
                    {item.last_location_at
                      ? ` · ${String(item.last_location_at).slice(0, 16).replace('T', ' ')}`
                      : ''}
                  </Text>
                  {hasLoc ? (
                    <Pressable
                      onPress={() => openMaps(item.last_lat!, item.last_lng!)}
                      style={styles.cardActions}
                    >
                      <MapPin size={14} color={palette.blue600} />
                      <Text style={{ color: palette.blue600, fontSize: 11, fontWeight: '700' }}>
                        Son konum · harita
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                      Son konum yok
                    </Text>
                  )}
                </Pressable>
              );
            }}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  trackCard: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trackBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  trackBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  courierChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 140,
  },
  statusBox: {
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  statusBtn: {
    backgroundColor: palette.blue600,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  statusBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  card: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
});
