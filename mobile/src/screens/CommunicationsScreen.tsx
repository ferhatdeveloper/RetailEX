/**
 * İletişim & Bildirimler — canlı müşteri + kuyruk + gönderim + ayar yazma.
 * Web: MesajBildirimModule, messagingService, WhatsAppIntegrationModule.
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
  Modal,
  TextInput,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MessageSquare, Bell, Smartphone, Settings2, Send, RefreshCw, Play } from 'lucide-react-native';
import {
  ScreenHeader,
  SearchBar,
  EmptyState,
  ErrorBanner,
} from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import {
  fetchNotifyCustomers,
  fetchNotificationQueue,
  fetchMessagingProvider,
  fetchQueueStats,
  updateMessagingSettings,
  sendCustomerMessage,
  processPendingQueue,
  retryNotificationItem,
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

const PROVIDERS = ['NONE', 'META', 'EMBEDDED', 'EVOLUTION'] as const;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<NotifyCustomerRow[]>([]);
  const [queue, setQueue] = useState<NotificationQueueRow[]>([]);
  const [provider, setProvider] = useState<MessagingProviderSummary>({
    whatsapp_provider: 'NONE',
    notify_invoice_whatsapp: false,
  });
  const [stats, setStats] = useState<QueueStats>({ pending: 0, sent: 0, failed: 0 });

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTarget, setComposeTarget] = useState<NotifyCustomerRow | null>(null);
  const [composeText, setComposeText] = useState('');

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

  const openCompose = (c: NotifyCustomerRow) => {
    setComposeTarget(c);
    setComposeText(`Merhaba ${c.name}, RetailEX bilgilendirme.`);
    setComposeOpen(true);
  };

  const submitCompose = async (processNow: boolean) => {
    if (!composeTarget) return;
    const text = composeText.trim();
    if (!text) {
      Alert.alert('Mesaj', 'Mesaj metni boş olamaz.');
      return;
    }
    if (provider.whatsapp_provider === 'NONE') {
      Alert.alert(
        'Sağlayıcı kapalı',
        'WhatsApp sağlayıcısını Sağlayıcı sekmesinden açın (token / köprü masaüstünde tanımlı olmalı).',
      );
      return;
    }
    setBusy(true);
    try {
      const r = await sendCustomerMessage({
        recipient_phone: composeTarget.phone,
        recipient_name: composeTarget.name,
        message_text: text,
        processNow,
      });
      setComposeOpen(false);
      setComposeTarget(null);
      Alert.alert(
        processNow ? 'Gönderim' : 'Kuyruk',
        processNow
          ? `İşlenen: ${r.processed}${r.errors.length ? `\n${r.errors.slice(0, 2).join('\n')}` : ''}`
          : `Kuyruğa eklendi (${r.queueId.slice(0, 8)}…)`,
      );
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onProcessQueue = async () => {
    if (provider.whatsapp_provider === 'NONE') {
      Alert.alert('Sağlayıcı', 'WhatsApp kapalı — bekleyen kuyruk işlenemez.');
      return;
    }
    setBusy(true);
    try {
      const r = await processPendingQueue(30);
      Alert.alert(
        'Kuyruk işlendi',
        `İşlenen: ${r.processed}${r.errors.length ? `\nHata: ${r.errors.slice(0, 3).join(' · ')}` : ''}`,
      );
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRetryQueueItem = async (item: NotificationQueueRow) => {
    setBusy(true);
    try {
      await retryNotificationItem(item.id);
      const r = await processPendingQueue(5);
      Alert.alert(
        'Yeniden denendi',
        `İşlenen: ${r.processed}${r.errors.length ? `\n${r.errors[0]}` : ''}`,
      );
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onToggleNotify = async (value: boolean) => {
    setBusy(true);
    try {
      await updateMessagingSettings({ notify_invoice_whatsapp: value });
      setProvider((p) => ({ ...p, notify_invoice_whatsapp: value }));
    } catch (e) {
      Alert.alert('Ayar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSetProvider = async (p: string) => {
    setBusy(true);
    try {
      await updateMessagingSettings({ whatsapp_provider: p });
      setProvider((prev) => ({ ...prev, whatsapp_provider: p }));
    } catch (e) {
      Alert.alert('Ayar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

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

      <SegmentTabBar layout="scroll" value={tab} onChange={setTab} items={tabs} />

      {tab === 'customers' ? (
        <SearchBar value={search} onChangeText={setSearch} placeholder="Ad, telefon, şehir…" />
      ) : null}

      {tab === 'queue' ? (
        <View style={styles.toolbar}>
          <Pressable
            onPress={() => void onProcessQueue()}
            disabled={busy || stats.pending === 0}
            style={[
              styles.toolBtn,
              {
                backgroundColor: palette.blue600,
                opacity: busy || stats.pending === 0 ? 0.5 : 1,
              },
            ]}
          >
            <Play size={14} color={palette.white} />
            <Text style={styles.toolBtnText}>Kuyruğu işle ({stats.pending})</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading && (tab === 'customers' ? customers.length === 0 : tab === 'queue' ? queue.length === 0 : false) ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'provider' ? (
        <ScrollView contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>WHATSAPP SAĞLAYICI</Text>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 6 }}>
              {providerLabelTr(provider.whatsapp_provider)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 17 }}>
              Token, base URL ve Meta phone_id masaüstü WhatsApp modülünden yazılır. Mobil yalnızca
              sağlayıcı seçimi ve fatura bildirimi anahtarını günceller.
            </Text>
            <View style={styles.providerChips}>
              {PROVIDERS.map((p) => {
                const active = provider.whatsapp_provider === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => void onSetProvider(p)}
                    disabled={busy}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? palette.blue600 : colors.inputBg,
                        borderColor: active ? palette.blue600 : colors.cardBorder,
                        opacity: busy ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? palette.white : colors.text, fontWeight: '700', fontSize: 11 }}>
                      {providerLabelTr(p)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View
            style={[
              styles.card,
              styles.rowBetween,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>
                FATURA WHATSAPP
              </Text>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }}>
                Fatura oluşturulunca bildirim
              </Text>
            </View>
            <Switch
              value={provider.notify_invoice_whatsapp}
              onValueChange={(v) => void onToggleNotify(v)}
              disabled={busy}
            />
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
              <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1, lineHeight: 17 }}>
                Müşteriye dokunarak WhatsApp mesajı kuyruğa alın / hemen işleyin (web messaging ile aynı
                tablolar).
              </Text>
            </View>
          }
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openCompose(item)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={styles.queueTop}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{item.name}</Text>
                  <Text style={{ color: palette.blue600, fontSize: 13, marginTop: 2 }}>{item.phone}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                    {[item.city, item.district].filter(Boolean).join(' · ') || '—'}
                    {item.customer_tier ? ` · ${item.customer_tier}` : ''}
                  </Text>
                </View>
                <Send size={16} color={palette.blue600} />
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={queue}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading || busy} onRefresh={() => void load()} />}
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
                {st === 'failed' ? (
                  <Pressable
                    onPress={() => void onRetryQueueItem(item)}
                    disabled={busy}
                    style={[
                      styles.retryBtn,
                      { backgroundColor: palette.orange500, opacity: busy ? 0.5 : 1 },
                    ]}
                  >
                    <RefreshCw size={12} color={palette.white} />
                    <Text style={{ color: palette.white, fontWeight: '700', fontSize: 11 }}>
                      Yeniden dene
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      )}

      <Modal
        visible={composeOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !busy && setComposeOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !busy && setComposeOpen(false)}
          />
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>WhatsApp mesajı</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              {composeTarget?.name} · {composeTarget?.phone}
            </Text>
            <TextInput
              value={composeText}
              onChangeText={setComposeText}
              multiline
              numberOfLines={4}
              placeholder="Mesaj metni…"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.textArea,
                {
                  color: colors.text,
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.inputBg,
                },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => void submitCompose(false)}
                disabled={busy}
                style={[styles.modalBtnOutline, { borderColor: colors.cardBorder, opacity: busy ? 0.5 : 1 }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>Yalnızca kuyruk</Text>
              </Pressable>
              <Pressable
                onPress={() => void submitCompose(true)}
                disabled={busy}
                style={[styles.modalBtn, { backgroundColor: palette.blue600, opacity: busy ? 0.5 : 1 }]}
              >
                <Send size={14} color={palette.white} />
                <Text style={{ color: palette.white, fontWeight: '700', fontSize: 12 }}>
                  {busy ? '…' : 'Gönder'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  toolbar: { paddingHorizontal: 12, paddingBottom: 4 },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  toolBtnText: { color: palette.white, fontWeight: '700', fontSize: 12 },
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
  rowBetween: { flexDirection: 'row', alignItems: 'center' },
  providerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  queueTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
    gap: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalBtnOutline: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
});
