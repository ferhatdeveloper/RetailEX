/**
 * İletişim & Bildirimler — canlı müşteri (telefonlu) + bildirim kuyruğu.
 * Web: MesajBildirimModule, NotificationCenter (kuyruk), WhatsAppIntegrationModule (sağlayıcı özeti).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MessageSquare, Bell, Smartphone, Settings2 } from 'lucide-react-native';
import {
  ScreenHeader,
  SearchBar,
  EmptyState,
  ErrorBanner,
} from '../components/ScreenChrome';
import {
  fetchNotifyCustomers,
  fetchNotificationQueue,
  fetchMessagingProvider,
  fetchQueueStats,
  statusLabelTr,
  channelLabelTr,
  providerLabelTr,
  type NotifyCustomerRow,
  type NotificationQueueRow,
  type QueueStats,
  type MessagingProviderSummary,
} from '../api/communicationsApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'customers' | 'queue' | 'provider';
type Props = NativeStackScreenProps<MainStackParamList, 'Communications'>;

export function communicationsRouteTab(screenIdOrTab?: string): Tab {
  if (screenIdOrTab === 'customers' || screenIdOrTab === 'queue' || screenIdOrTab === 'provider') {
    return screenIdOrTab;
  }
  switch (screenIdOrTab) {
    case 'notifications':
    case 'smsmanage':
    case 'databroadcast':
      return 'queue';
    case 'whatsapp':
    case 'integrations':
      return 'provider';
    case 'mesaj-bildirim':
    case 'emailcamp':
    default:
      return 'customers';
  }
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  try {
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16);
  }
}

export function CommunicationsScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const initial = communicationsRouteTab(route.params?.initialTab || route.params?.screenId);
  const [tab, setTab] = useState<Tab>(initial);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<NotifyCustomerRow[]>([]);
  const [queue, setQueue] = useState<NotificationQueueRow[]>([]);
  const [provider, setProvider] = useState<MessagingProviderSummary>({
    whatsapp_provider: 'NONE',
    notify_invoice_whatsapp: false,
  });
  const [stats, setStats] = useState<QueueStats>({ pending: 0, sent: 0, failed: 0 });

  useEffect(() => {
    setTab(communicationsRouteTab(route.params?.initialTab || route.params?.screenId));
  }, [route.params?.initialTab, route.params?.screenId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, q, p, s] = await Promise.all([
        fetchNotifyCustomers(search),
        fetchNotificationQueue(),
        fetchMessagingProvider(),
        fetchQueueStats(),
      ]);
      setCustomers(c);
      setQueue(q);
      setProvider(p);
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [search, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), search && tab === 'customers' ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search, tab]);

  const tabs: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
    { id: 'customers', label: 'Müşteriler', icon: MessageSquare },
    { id: 'queue', label: 'Kuyruk', icon: Bell },
    { id: 'provider', label: 'Sağlayıcı', icon: Settings2 },
  ];

  const title =
    route.params?.screenId === 'whatsapp'
      ? 'WhatsApp'
      : route.params?.screenId === 'mesaj-bildirim'
        ? 'Mesaj / Bildirim'
        : route.params?.screenId === 'notifications'
          ? 'Bildirim Merkezi'
          : route.params?.screenId === 'smsmanage'
            ? 'SMS Yönetimi'
            : route.params?.screenId === 'emailcamp'
              ? 'E-posta Kampanyaları'
              : 'İletişim & Bildirimler';

  const subtitle = `${providerLabelTr(provider.whatsapp_provider)} · Bekleyen ${stats.pending}`;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} subtitle={subtitle} />

      <View style={[styles.statsRow, { borderColor: colors.cardBorder }]}>
        <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statN, { color: palette.orange500 }]}>{stats.pending}</Text>
          <Text style={[styles.statL, { color: colors.textMuted }]}>Bekleyen</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statN, { color: palette.green600 }]}>{stats.sent}</Text>
          <Text style={[styles.statL, { color: colors.textMuted }]}>Gönderildi</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statN, { color: palette.red500 }]}>{stats.failed}</Text>
          <Text style={[styles.statL, { color: colors.textMuted }]}>Hata</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBar}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[
                styles.tab,
                {
                  backgroundColor: active ? palette.blue600 : colors.card,
                  borderColor: active ? palette.blue600 : colors.cardBorder,
                },
              ]}
            >
              <Icon size={14} color={active ? palette.white : colors.textMuted} />
              <Text style={{ color: active ? palette.white : colors.text, fontWeight: '700', fontSize: 12 }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {tab === 'customers' ? (
        <SearchBar value={search} onChangeText={setSearch} placeholder="Ad, telefon, şehir…" />
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading && (tab === 'customers' ? customers.length === 0 : tab === 'queue' ? queue.length === 0 : false) ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'provider' ? (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>WHATSAPP SAĞLAYICI</Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 6 }}>
              {providerLabelTr(provider.whatsapp_provider)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>
              {provider.whatsapp_provider === 'NONE'
                ? 'Entegrasyon kapalı. Ayarlar web WhatsApp modülünden yapılır.'
                : 'Mobilde yalnızca okuma; token ve köprü ayarları masaüstünde.'}
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>FATURA BİLDİRİMİ</Text>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 6 }}>
              {provider.notify_invoice_whatsapp ? 'WhatsApp fatura bildirimi açık' : 'Kapalı'}
            </Text>
          </View>
          <View style={[styles.statsRow, { borderColor: 'transparent', paddingHorizontal: 0 }]}>
            <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.statN, { color: palette.orange500 }]}>{stats.pending}</Text>
              <Text style={[styles.statL, { color: colors.textMuted }]}>Kuyruk bekleyen</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={[styles.statN, { color: palette.green600 }]}>{customers.length}</Text>
              <Text style={[styles.statL, { color: colors.textMuted }]}>Telefonlu müşteri</Text>
            </View>
          </View>
        </ScrollView>
      ) : tab === 'customers' ? (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <EmptyState message="Telefonlu aktif müşteri bulunamadı (WhatsApp/SMS hedefi)" />
          }
          ListHeaderComponent={
            <View style={[styles.hint, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Smartphone size={16} color={palette.blue600} />
              <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
                Web Mesaj/Bildirim ile aynı hedef: aktif cariler, geçerli telefon. Toplu gönderim mobilde
                henüz yok.
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{item.name}</Text>
              <Text style={{ color: palette.blue600, fontSize: 13, marginTop: 2 }}>{item.phone}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                {[item.city, item.district].filter(Boolean).join(' · ') || '—'}
                {item.customer_tier ? ` · ${item.customer_tier}` : ''}
              </Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <EmptyState message="Bildirim kuyruğu boş veya tablo henüz oluşturulmamış" />
          }
          ListHeaderComponent={
            <View style={[styles.hint, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Bell size={16} color={palette.blue600} />
              <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
                Sağlayıcı: {providerLabelTr(provider.whatsapp_provider)}
                {provider.notify_invoice_whatsapp ? ' · Fatura WhatsApp açık' : ''}
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const st = item.status;
            const stColor =
              st === 'sent' ? palette.green600 : st === 'failed' ? palette.red500 : palette.orange500;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <View style={styles.queueTop}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, flex: 1 }}>
                    {item.recipient_name || item.recipient_phone || '—'}
                  </Text>
                  <Text style={[styles.badge, { color: stColor, backgroundColor: palette.blue50 }]}>
                    {statusLabelTr(st)}
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                  {channelLabelTr(item.channel)} · {item.event_type} · {formatWhen(item.created_at)}
                </Text>
                {item.message_text ? (
                  <Text style={{ color: colors.text, fontSize: 12, marginTop: 6 }} numberOfLines={3}>
                    {item.message_text}
                  </Text>
                ) : null}
                {item.error_text && st === 'failed' ? (
                  <Text style={{ color: palette.red500, fontSize: 11, marginTop: 4 }} numberOfLines={2}>
                    {item.error_text}
                  </Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statN: { fontSize: 18, fontWeight: '800' },
  statL: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  tabBar: { paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  queueTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
