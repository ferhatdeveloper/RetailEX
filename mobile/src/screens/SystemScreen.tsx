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
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import {
  fetchSystemUsers,
  fetchSystemRoles,
  fetchAuditLogs,
  fetchPosDevices,
  fetchRecentMigrations,
  fetchSyncQueue,
  fetchSyncQueueStats,
  type SystemUserRow,
  type SystemRoleRow,
  type AuditLogRow,
  type PosDeviceRow,
  type MigrationRow,
  type SyncQueueRow,
  type SyncQueueStats,
} from '../api/systemApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'users' | 'roles' | 'logs' | 'devices' | 'sync' | 'backup';
type Props = NativeStackScreenProps<MainStackParamList, 'System'>;

export function systemRouteTab(screenId?: string): Tab {
  switch (screenId) {
    case 'roles':
    case 'roleauth':
    case 'menumanagement':
      return 'roles';
    case 'logs':
    case 'logaudit':
      return 'logs';
    case 'devices':
    case 'pendingposdevices':
      return 'devices';
    case 'sync':
    case 'hybrid-sync':
      return 'sync';
    case 'backup':
    case 'backuprestore':
    case 'supabase-migration':
      return 'backup';
    case 'users':
    case 'usermanagement':
    default:
      return 'users';
  }
}

export function SystemScreen({ route, navigation }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const user = useAuthStore((s) => s.user);
  const initial = systemRouteTab(route.params?.initialTab || route.params?.screenId);
  const [tab, setTab] = useState<Tab>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<SystemUserRow[]>([]);
  const [roles, setRoles] = useState<SystemRoleRow[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [devices, setDevices] = useState<PosDeviceRow[]>([]);
  const [migrations, setMigrations] = useState<MigrationRow[]>([]);
  const [syncRows, setSyncRows] = useState<SyncQueueRow[]>([]);
  const [syncStats, setSyncStats] = useState<SyncQueueStats>({ pending: 0, synced: 0, failed: 0 });

  useEffect(() => {
    const next = systemRouteTab(route.params?.initialTab || route.params?.screenId);
    setTab(next);
  }, [route.params?.initialTab, route.params?.screenId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, r, l, d, m, sq, ss] = await Promise.all([
        fetchSystemUsers(),
        fetchSystemRoles(),
        fetchAuditLogs(),
        fetchPosDevices(),
        fetchRecentMigrations(),
        fetchSyncQueue(),
        fetchSyncQueueStats(),
      ]);
      setUsers(u);
      setRoles(r);
      setLogs(l);
      setDevices(d);
      setMigrations(m);
      setSyncRows(sq);
      setSyncStats(ss);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Kullanıcı' },
    { id: 'roles', label: 'Rol' },
    { id: 'logs', label: 'Log' },
    { id: 'devices', label: 'Kasa' },
    { id: 'sync', label: 'Senkron' },
    { id: 'backup', label: 'Şema' },
  ];

  const title =
    tab === 'users'
      ? 'Kullanıcılar'
      : tab === 'roles'
        ? 'Roller'
        : tab === 'logs'
          ? 'Log / Denetim'
        : tab === 'devices'
          ? 'Kasa cihazları'
          : tab === 'sync'
            ? 'Şube veri senkronu'
            : 'Yedekleme / şema';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} subtitle={user?.firmNr ? `Firma ${user.firmNr}` : 'Sistem'} />
      <SegmentTabBar layout="scroll" value={tab} onChange={setTab} items={tabs} />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'users' ? (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Kullanıcı bulunamadı" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.full_name || item.username}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                @{item.username}
                {item.role_name ? ` · ${item.role_name}` : ''}
              </Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                {item.is_active ? 'Aktif' : 'Pasif'}
                {item.last_login_at ? ` · son giriş ${item.last_login_at.slice(0, 16)}` : ''}
              </Text>
            </View>
          )}
        />
      ) : tab === 'roles' ? (
        <FlatList
          data={roles}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message="Rol kaydı yok (public.roles)" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.description || '—'}</Text>
            </View>
          )}
        />
      ) : tab === 'logs' ? (
        <FlatList
          data={logs}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message="Audit log yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.action} · {item.table_name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.username || '—'} · {item.created_at?.slice(0, 19) || '—'}
              </Text>
            </View>
          )}
        />
      ) : tab === 'devices' ? (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message="Kayıtlı kasa cihazı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.terminal_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.status} · {item.device_id.slice(0, 12)}…
              </Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                {item.last_seen_at?.slice(0, 16) || item.registered_at?.slice(0, 16) || '—'}
              </Text>
            </View>
          )}
        />
      ) : tab === 'sync' ? (
        <FlatList
          data={syncRows}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message="sync_queue kaydı yok" />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Kuyruk özeti</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                Bekleyen {syncStats.pending} · Senkron {syncStats.synced} · Hata {syncStats.failed}
              </Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 6, lineHeight: 16 }}>
                Manuel senkron başlatma masaüstü Hibrit Senkron modülünden yapılır. Mobil yalnızca
                sync_queue okuma.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.action} · {item.table_name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.status}
                {item.terminal_name ? ` · ${item.terminal_name}` : ''}
              </Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                {item.created_at?.slice(0, 19) || '—'}
                {item.synced_at ? ` → ${item.synced_at.slice(0, 19)}` : ''}
              </Text>
              {item.error_message ? (
                <Text style={{ color: palette.red500, fontSize: 11, marginTop: 4 }} numberOfLines={2}>
                  {item.error_message}
                </Text>
              ) : null}
            </View>
          )}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Yedekleme</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 6, lineHeight: 18 }}>
              Tam yedekleme / geri yükleme masaüstü (DeskApp) üzerinden yapılır. Mobilde şema migration
              özeti okunur.
            </Text>
            <Pressable onPress={() => navigation.navigate('Organization')} style={{ marginTop: 12 }}>
              <Text style={{ color: palette.blue600, fontWeight: '700' }}>Firma / dönem değiştir →</Text>
            </Pressable>
          </View>
          <Text style={[styles.sec, { color: colors.text }]}>Son migration’lar</Text>
          {migrations.length === 0 ? (
            <EmptyState message="schema_migrations okunamadı" />
          ) : (
            migrations.map((m) => (
              <View
                key={`${m.filename}-${m.applied_at}`}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{m.filename}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {m.applied_at?.slice(0, 19) || '—'}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  sec: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 4 },
});
