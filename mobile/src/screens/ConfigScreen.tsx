import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../components/FormField';
import { GradientHeader } from '../components/GradientHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemeStore } from '../store/themeStore';
import {
  useConfigStore,
  type DbConfig,
  type DbMode,
  type NetworkPolicy,
  type PgEndpoint,
} from '../store/configStore';
import { testBridgeConnection } from '../api/pgClient';
import { ConnectivityBadge } from '../components/ConnectivityBadge';
import { flushPendingMutations } from '../offline/syncEngine';
import { useConnectivityStore } from '../store/connectivityStore';
import { palette } from '../theme/colors';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Config'>;

function cloneConfig(c: DbConfig): DbConfig {
  return {
    ...c,
    networkPolicy: c.networkPolicy ?? 'hybrid',
    local: { ...c.local },
    remote: { ...c.remote },
  };
}

export function ConfigScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors, darkMode } = useThemeStore();
  const stored = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);

  const [draft, setDraft] = useState<DbConfig>(() => cloneConfig(stored));
  const [testing, setTesting] = useState(false);

  const patch = (partial: Partial<DbConfig>) =>
    setDraft((d) => ({ ...d, ...partial }));

  const patchEndpoint = (which: 'local' | 'remote', partial: Partial<PgEndpoint>) =>
    setDraft((d) => ({
      ...d,
      [which]: { ...d[which], ...partial },
    }));

  const activeHint = useMemo(() => {
    const ep = draft.dbMode === 'online' ? draft.remote : draft.local;
    return `${ep.host}:${ep.port}/${ep.database}`;
  }, [draft]);

  const onSave = () => {
    const next: DbConfig = {
      ...draft,
      bridgeHost: draft.bridgeHost.trim(),
      local: {
        ...draft.local,
        host: draft.local.host.trim(),
        database: draft.local.database.trim(),
        user: draft.local.user.trim(),
      },
      remote: {
        ...draft.remote,
        host: draft.remote.host.trim(),
        database: draft.remote.database.trim(),
        user: draft.remote.user.trim(),
      },
      isConfigured: true,
    };
    setConfig(next);
    navigation.navigate('Login');
  };

  const onCancel = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Login');
  };

  const onTest = async (which: 'active' | 'local' | 'remote' = 'active') => {
    setTesting(true);
    const result = await testBridgeConnection(draft, which);
    setTesting(false);
    Alert.alert(
      result.ok ? t('connectionOk') : t('connectionFail'),
      result.detail,
    );
  };

  const ModeChip = ({ mode, label }: { mode: DbMode; label: string }) => {
    const active = draft.dbMode === mode;
    return (
      <Pressable
        onPress={() => patch({ dbMode: mode })}
        style={[
          styles.modeChip,
          {
            backgroundColor: active
              ? palette.blue600
              : darkMode
                ? palette.gray700
                : palette.gray100,
            borderColor: active
              ? palette.blue600
              : darkMode
                ? palette.gray600
                : palette.gray200,
          },
        ]}
      >
        <Text
          style={[
            styles.modeChipText,
            { color: active ? palette.white : colors.textMuted },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const NetPolicyChip = ({ mode, label }: { mode: NetworkPolicy; label: string }) => {
    const active = (draft.networkPolicy ?? 'hybrid') === mode;
    return (
      <Pressable
        onPress={() => patch({ networkPolicy: mode })}
        style={[
          styles.modeChip,
          {
            backgroundColor: active
              ? palette.indigo600
              : darkMode
                ? palette.gray700
                : palette.gray100,
            borderColor: active
              ? palette.indigo600
              : darkMode
                ? palette.gray600
                : palette.gray200,
          },
        ]}
      >
        <Text
          style={[
            styles.modeChipText,
            { color: active ? palette.white : colors.textMuted },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const pendingCount = useConnectivityStore((s) => s.pendingCount);
  const syncing = useConnectivityStore((s) => s.syncing);

  const onFlushQueue = async () => {
    const result = await flushPendingMutations();
    if (result.skipped) {
      Alert.alert(t('connSync'), t('connSyncSkipped'));
      return;
    }
    Alert.alert(
      t('connSync'),
      t('connSyncResult', { ok: result.ok, failed: result.failed }),
    );
  };

  const renderPgSection = (
    which: 'local' | 'remote',
    title: string,
    accentBorder: string,
    accentBg: string,
  ) => {
    const ep = draft[which];
    return (
      <View
        style={[
          styles.pgBox,
          {
            borderColor: accentBorder,
            backgroundColor: accentBg,
          },
        ]}
      >
        <View style={styles.pgBoxHeader}>
          <Text style={[styles.section, { color: colors.textMuted, marginTop: 0 }]}>
            {title}
          </Text>
          <Pressable onPress={() => void onTest(which)} disabled={testing}>
            <Text style={styles.testLink}>
              {which === 'local' ? t('testLocalPg') : t('testRemotePg')}
            </Text>
          </Pressable>
        </View>
        <Text style={[styles.hint, { color: colors.textSubtle }]}>
          {which === 'local' ? t('localPgHint') : t('remotePgHint')}
        </Text>
        <FormField
          label={t('pgHost')}
          value={ep.host}
          onChangeText={(v) => patchEndpoint(which, { host: v })}
          autoCapitalize="none"
          placeholder={which === 'local' ? '127.0.0.1' : '192.168.1.80'}
        />
        <FormField
          label={t('pgPort')}
          value={String(ep.port)}
          onChangeText={(v) =>
            patchEndpoint(which, {
              port: parseInt(v.replace(/\D/g, ''), 10) || 5432,
            })
          }
          keyboardType="number-pad"
        />
        <FormField
          label={t('database')}
          value={ep.database}
          onChangeText={(v) => patchEndpoint(which, { database: v })}
          autoCapitalize="none"
        />
        <FormField
          label={t('dbUser')}
          value={ep.user}
          onChangeText={(v) => patchEndpoint(which, { user: v })}
          autoCapitalize="none"
        />
        <FormField
          label={t('dbPassword')}
          value={ep.password}
          onChangeText={(v) => patchEndpoint(which, { password: v })}
          secureTextEntry
        />
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: darkMode ? palette.gray700 : palette.gray200,
              },
            ]}
          >
            <GradientHeader
              compact
              safeTop={false}
              title={t('configTitle')}
              subtitle={t('configSubtitle')}
              right={<ConnectivityBadge onDark compact />}
            />

            <View style={styles.form}>
              <Text style={[styles.section, { color: colors.textMuted }]}>
                {t('dbMode')}
              </Text>
              <View style={styles.modeRow}>
                <ModeChip mode="local" label={t('dbModeLocal')} />
                <ModeChip mode="online" label={t('dbModeOnline')} />
              </View>
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                {draft.dbMode === 'online' ? t('dbModeOnlineHint') : t('dbModeLocalHint')}
              </Text>
              <Text style={[styles.activeTarget, { color: palette.blue500 }]}>
                {t('activeTarget')}: {activeHint}
              </Text>

              <Text style={[styles.section, { color: colors.textMuted }]}>
                {t('networkPolicy')}
              </Text>
              <View style={styles.modeRow}>
                <NetPolicyChip mode="online" label={t('connOnline')} />
                <NetPolicyChip mode="offline" label={t('connOffline')} />
                <NetPolicyChip mode="hybrid" label={t('connHybrid')} />
              </View>
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                {(draft.networkPolicy ?? 'hybrid') === 'online'
                  ? t('networkPolicyOnlineHint')
                  : (draft.networkPolicy ?? 'hybrid') === 'offline'
                    ? t('networkPolicyOfflineHint')
                    : t('networkPolicyHybridHint')}
              </Text>
              {pendingCount > 0 ? (
                <PrimaryButton
                  label={t('connSyncPending', { count: pendingCount })}
                  onPress={() => void onFlushQueue()}
                  loading={syncing}
                  variant="ghost"
                />
              ) : null}

              <Text style={[styles.section, { color: colors.textMuted }]}>
                pg_bridge
              </Text>
              <FormField
                label={t('bridgeHost')}
                value={draft.bridgeHost}
                onChangeText={(v) => patch({ bridgeHost: v })}
                autoCapitalize="none"
                placeholder="192.168.1.10"
              />
              <FormField
                label={t('bridgePort')}
                value={String(draft.bridgePort)}
                onChangeText={(v) =>
                  patch({ bridgePort: parseInt(v.replace(/\D/g, ''), 10) || 3001 })
                }
                keyboardType="number-pad"
              />

              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                {Platform.OS === 'android' ? t('androidEmulatorHint') : t('iosSimulatorHint')}
              </Text>
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                {t('physicalDeviceHint')}
              </Text>
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                {t('pgHostFromBridgeHint')}
              </Text>

              {renderPgSection(
                'local',
                t('localPostgres'),
                darkMode ? 'rgba(16,185,129,0.45)' : '#6ee7b7',
                darkMode ? 'rgba(6,78,59,0.25)' : 'rgba(236,253,245,0.8)',
              )}

              {renderPgSection(
                'remote',
                t('remotePostgres'),
                darkMode ? 'rgba(56,189,248,0.45)' : '#7dd3fc',
                darkMode ? 'rgba(12,74,110,0.25)' : 'rgba(240,249,255,0.8)',
              )}

              <PrimaryButton
                label={t('testConnection')}
                onPress={() => void onTest('active')}
                loading={testing}
                variant="ghost"
              />
              <PrimaryButton label={t('save')} onPress={onSave} />
              <PrimaryButton
                label={t('cancel')}
                onPress={onCancel}
                variant="ghost"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  form: { padding: 24, gap: 16 },
  section: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  hint: { fontSize: 11, lineHeight: 16 },
  activeTarget: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 2,
    borderWidth: 2,
    alignItems: 'center',
  },
  modeChipText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pgBox: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  pgBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  testLink: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.blue500,
  },
});
