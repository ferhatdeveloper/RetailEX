import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  ActivityIndicator,
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
  type ApiMode,
  type DbConfig,
  type DbMode,
  type NetworkPolicy,
  type PgEndpoint,
} from '../store/configStore';
import { testBridgeConnection } from '../api/pgClient';
import { testPostgrestConnection } from '../api/postgrestClient';
import { ConnectivityBadge } from '../components/ConnectivityBadge';
import { flushPendingMutations } from '../offline/syncEngine';
import { useConnectivityStore } from '../store/connectivityStore';
import { palette } from '../theme/colors';
import type { AuthStackParamList } from '../navigation/types';
import {
  scanLanServers,
  type LanScanHit,
} from '../utils/lanServerScan';

type Props = NativeStackScreenProps<AuthStackParamList, 'Config'>;

function cloneConfig(c: DbConfig): DbConfig {
  return {
    ...c,
    networkPolicy: c.networkPolicy ?? 'hybrid',
    apiMode: c.apiMode ?? 'bridge',
    remoteRestUrl: c.remoteRestUrl ?? '',
    postgrestAnonKey: c.postgrestAnonKey ?? '',
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
  const [scanning, setScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [scanFound, setScanFound] = useState(0);
  const [scanHits, setScanHits] = useState<LanScanHit[]>([]);
  const [scanMeta, setScanMeta] = useState<{
    deviceIp: string | null;
    prefix: string;
    usedFallbackSubnet: boolean;
  } | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      scanAbortRef.current?.abort();
    };
  }, []);

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
      remoteRestUrl: (draft.remoteRestUrl || '').trim().replace(/\/+$/, ''),
      postgrestAnonKey: draft.postgrestAnonKey || '',
      apiMode: draft.apiMode ?? 'bridge',
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

  const onTestPostgrest = async () => {
    setTesting(true);
    const result = await testPostgrestConnection(draft);
    setTesting(false);
    Alert.alert(
      result.ok ? t('connectionOk') : t('connectionFail'),
      result.detail,
    );
  };

  const onScanLan = async () => {
    if (scanning) return;
    scanAbortRef.current?.abort();
    const ctrl = new AbortController();
    scanAbortRef.current = ctrl;
    setScanning(true);
    setScanPct(0);
    setScanFound(0);
    setScanHits([]);
    setScanMeta(null);
    try {
      const result = await scanLanServers({
        hintHost: draft.bridgeHost,
        timeoutMs: 600,
        concurrency: 28,
        signal: ctrl.signal,
        onProgress: (p) => {
          const pct =
            p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 0;
          setScanPct(pct);
          setScanFound(p.found);
          if (p.hit) {
            setScanHits((prev) => {
              const key = `${p.hit!.kind}:${p.hit!.host}:${p.hit!.port}`;
              if (prev.some((h) => `${h.kind}:${h.host}:${h.port}` === key)) {
                return prev;
              }
              return [...prev, p.hit!];
            });
          }
        },
      });
      if (ctrl.signal.aborted) return;
      setScanHits(result.hits);
      setScanMeta({
        deviceIp: result.deviceIp,
        prefix: result.prefix,
        usedFallbackSubnet: result.usedFallbackSubnet,
      });
      setScanPct(100);
      if (result.hits.length === 0) {
        const detail = [
          t('scanLanNoneDetail', {
            ip: result.deviceIp ?? '—',
            prefix: result.prefix,
          }),
          result.usedFallbackSubnet
            ? t('scanLanFallbackSubnet', { prefix: result.prefix })
            : '',
        ]
          .filter(Boolean)
          .join('\n');
        Alert.alert(t('scanLanNone'), detail);
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        Alert.alert(
          t('scanLanNone'),
          e instanceof Error ? e.message : String(e),
        );
      }
    } finally {
      if (scanAbortRef.current === ctrl) {
        setScanning(false);
      }
    }
  };

  const applyScanHit = (hit: LanScanHit) => {
    if (hit.kind === 'bridge') {
      patch({ bridgeHost: hit.host, bridgePort: hit.port });
      Alert.alert(
        t('scanLanFound'),
        t('scanLanAppliedBridge', { host: hit.host, port: hit.port }),
      );
      return;
    }
    patch({
      remoteRestUrl: hit.baseUrl,
      apiMode:
        draft.apiMode === 'bridge' ? 'hybrid' : (draft.apiMode ?? 'hybrid'),
    });
    Alert.alert(
      t('scanLanFound'),
      t('scanLanAppliedRest', { url: hit.baseUrl }),
    );
  };

  const ApiModeChip = ({ mode, label }: { mode: ApiMode; label: string }) => {
    const active = (draft.apiMode ?? 'bridge') === mode;
    return (
      <Pressable
        onPress={() => patch({ apiMode: mode })}
        style={[
          styles.modeChip,
          {
            backgroundColor: active
              ? palette.green600
              : darkMode
                ? palette.gray700
                : palette.gray100,
            borderColor: active
              ? palette.green600
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
                {t('apiMode')}
              </Text>
              <View style={styles.modeRow}>
                <ApiModeChip mode="bridge" label={t('apiModeBridge')} />
                <ApiModeChip mode="postgrest" label={t('apiModePostgrest')} />
                <ApiModeChip mode="hybrid" label={t('apiModeHybrid')} />
              </View>
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                {(draft.apiMode ?? 'bridge') === 'postgrest'
                  ? t('apiModePostgrestHint')
                  : (draft.apiMode ?? 'bridge') === 'hybrid'
                    ? t('apiModeHybridHint')
                    : t('apiModeBridgeHint')}
              </Text>

              {(draft.apiMode === 'postgrest' || draft.apiMode === 'hybrid') ? (
                <View
                  style={[
                    styles.pgBox,
                    {
                      borderColor: darkMode ? 'rgba(52,211,153,0.45)' : '#6ee7b7',
                      backgroundColor: darkMode
                        ? 'rgba(6,78,59,0.25)'
                        : 'rgba(236,253,245,0.8)',
                    },
                  ]}
                >
                  <View style={styles.pgBoxHeader}>
                    <Text style={[styles.section, { color: colors.textMuted, marginTop: 0 }]}>
                      {t('postgrestSection')}
                    </Text>
                    <Pressable onPress={() => void onTestPostgrest()} disabled={testing}>
                      <Text style={styles.testLink}>{t('testPostgrest')}</Text>
                    </Pressable>
                  </View>
                  <Text style={[styles.hint, { color: colors.textSubtle }]}>
                    {t('postgrestHint')}
                  </Text>
                  <FormField
                    label={t('remoteRestUrl')}
                    value={draft.remoteRestUrl || ''}
                    onChangeText={(v) => patch({ remoteRestUrl: v })}
                    autoCapitalize="none"
                    placeholder="https://api.retailex.app/tenant"
                  />
                  <FormField
                    label={t('postgrestAnonKey')}
                    value={draft.postgrestAnonKey || ''}
                    onChangeText={(v) => patch({ postgrestAnonKey: v })}
                    autoCapitalize="none"
                    secureTextEntry
                    placeholder={t('postgrestAnonKeyPlaceholder')}
                  />
                </View>
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

              <PrimaryButton
                label={scanning ? t('scanLanScanning', { pct: scanPct, found: scanFound }) : t('scanLan')}
                onPress={() => void onScanLan()}
                loading={scanning}
                variant="ghost"
              />
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                {t('scanLanHint')}
              </Text>
              {scanning ? (
                <View style={styles.scanProgressRow}>
                  <ActivityIndicator size="small" color={palette.blue500} />
                  <Text style={[styles.hint, { color: colors.textMuted, flex: 1 }]}>
                    {t('scanLanScanning', { pct: scanPct, found: scanFound })}
                  </Text>
                </View>
              ) : null}
              {scanMeta?.deviceIp ? (
                <Text style={[styles.hint, { color: colors.textSubtle }]}>
                  {t('scanLanDeviceIp', { ip: scanMeta.deviceIp })}
                </Text>
              ) : null}
              {scanMeta?.usedFallbackSubnet ? (
                <Text style={[styles.hint, { color: colors.textSubtle }]}>
                  {t('scanLanFallbackSubnet', { prefix: scanMeta.prefix })}
                </Text>
              ) : null}
              {scanHits.length > 0 ? (
                <View style={styles.scanHitsBox}>
                  <Text style={[styles.section, { color: colors.textMuted, marginTop: 0 }]}>
                    {t('scanLanFoundCount', { count: scanHits.length })}
                  </Text>
                  {scanHits.map((hit) => (
                    <Pressable
                      key={`${hit.kind}-${hit.host}-${hit.port}`}
                      onPress={() => applyScanHit(hit)}
                      style={[
                        styles.scanHitRow,
                        {
                          borderColor: darkMode ? palette.gray600 : palette.gray200,
                          backgroundColor: darkMode
                            ? palette.gray700
                            : palette.gray100,
                        },
                      ]}
                    >
                      <Text style={[styles.scanHitLabel, { color: colors.text }]}>
                        {hit.label}
                      </Text>
                      <Text style={styles.scanHitApply}>{t('scanLanFound')}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

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
                label={
                  draft.apiMode === 'postgrest'
                    ? t('testPostgrest')
                    : t('testConnection')
                }
                onPress={() =>
                  void (draft.apiMode === 'postgrest'
                    ? onTestPostgrest()
                    : onTest('active'))
                }
                loading={testing}
                variant="ghost"
              />
              {draft.apiMode === 'hybrid' ? (
                <PrimaryButton
                  label={t('testPostgrest')}
                  onPress={() => void onTestPostgrest()}
                  loading={testing}
                  variant="ghost"
                />
              ) : null}
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
  scanProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanHitsBox: {
    gap: 8,
  },
  scanHitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 2,
    borderWidth: 1,
  },
  scanHitLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scanHitApply: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: palette.green600,
  },
});
