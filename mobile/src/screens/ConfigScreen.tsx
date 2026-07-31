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
import { ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react-native';
import { FormField } from '../components/FormField';
import { GradientHeader } from '../components/GradientHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { getConfigWizardSteps, type ConfigWizardStepId } from './config/configWizardSteps';
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
import {
  DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN,
  resolveTenantByCode,
  tenantCodeFromRemoteRestUrl,
} from '../services/merkezTenantRegistry';

type Props = NativeStackScreenProps<AuthStackParamList, 'Config'>;
type ConnectionStatusTone = 'ok' | 'warn' | 'fail';
type ConnectionStatus = {
  tone: ConnectionStatusTone;
  title: string;
  detail: string;
};

function cloneConfig(c: DbConfig): DbConfig {
  return {
    ...c,
    networkPolicy: c.networkPolicy ?? 'hybrid',
    apiMode: c.apiMode ?? 'hybrid',
    remoteRestUrl: c.remoteRestUrl ?? '',
    postgrestAnonKey: c.postgrestAnonKey ?? '',
    merkezTenantCode: c.merkezTenantCode ?? '',
    merkezDisplayName: c.merkezDisplayName ?? '',
    local: { ...c.local },
    remote: { ...c.remote },
  };
}

function isLikelyAndroidEmulator(): boolean {
  if (Platform.OS !== 'android') return false;
  const constants = Platform.constants as Record<string, unknown> | undefined;
  const haystack = [
    constants?.Brand,
    constants?.Manufacturer,
    constants?.Model,
    constants?.Device,
    constants?.Product,
    constants?.Fingerprint,
    constants?.Hardware,
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  return /emulator|simulator|sdk_gphone|sdk_google|generic|goldfish|ranchu|vbox|genymotion/.test(haystack);
}

function isAndroidLoopbackBridgeHostOnDevice(host: string): boolean {
  return Platform.OS === 'android' && host.trim() === '10.0.2.2' && !isLikelyAndroidEmulator();
}

function statusColors(tone: ConnectionStatusTone, darkMode: boolean) {
  if (tone === 'ok') {
    return {
      borderColor: darkMode ? 'rgba(52,211,153,0.55)' : '#059669',
      backgroundColor: darkMode ? 'rgba(6,78,59,0.35)' : 'rgba(236,253,245,0.95)',
      titleColor: darkMode ? '#6ee7b7' : '#065f46',
      bodyColor: darkMode ? '#a7f3d0' : '#047857',
    };
  }
  if (tone === 'fail') {
    return {
      borderColor: darkMode ? 'rgba(248,113,113,0.55)' : '#dc2626',
      backgroundColor: darkMode ? 'rgba(127,29,29,0.35)' : 'rgba(254,242,242,0.95)',
      titleColor: darkMode ? '#fca5a5' : '#991b1b',
      bodyColor: darkMode ? '#fecaca' : '#b91c1c',
    };
  }
  return {
    borderColor: darkMode ? '#fbbf24' : '#d97706',
    backgroundColor: darkMode ? 'rgba(120,53,15,0.35)' : 'rgba(254,243,199,0.95)',
    titleColor: darkMode ? '#fcd34d' : '#92400e',
    bodyColor: darkMode ? '#fde68a' : '#78350f',
  };
}

export function ConfigScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors, darkMode } = useThemeStore();
  const stored = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);

  const [draft, setDraft] = useState<DbConfig>(() => cloneConfig(stored));
  const [testing, setTesting] = useState(false);
  const [resolvingTenant, setResolvingTenant] = useState(false);
  const [showAdvancedApi, setShowAdvancedApi] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanPct, setScanPct] = useState(0);
  const [scanFound, setScanFound] = useState(0);
  const [scanHits, setScanHits] = useState<LanScanHit[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [scanMeta, setScanMeta] = useState<{
    deviceIp: string | null;
    prefix: string;
    usedFallbackSubnet: boolean;
  } | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const [wizardIndex, setWizardIndex] = useState(0);
  const [stepIdOverride, setStepIdOverride] = useState<ConfigWizardStepId | null>(null);


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
  const androidLoopbackWarning = useMemo(
    () => isAndroidLoopbackBridgeHostOnDevice(draft.bridgeHost),
    [draft.bridgeHost],
  );

  const onSave = () => {
    let remoteRestUrl = (draft.remoteRestUrl || '').trim().replace(/\/+$/, '');
    const code = (draft.merkezTenantCode || '').trim().toLowerCase();
    if (!remoteRestUrl && code) {
      remoteRestUrl = `${DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN.replace(/\/+$/, '')}/${code}`;
    }
    const next: DbConfig = {
      ...draft,
      bridgeHost: draft.bridgeHost.trim(),
      remoteRestUrl,
      postgrestAnonKey: draft.postgrestAnonKey || '',
      merkezTenantCode: code || tenantCodeFromRemoteRestUrl(remoteRestUrl),
      merkezDisplayName: draft.merkezDisplayName || '',
      apiMode: draft.apiMode ?? 'hybrid',
      dbMode: remoteRestUrl ? 'online' : draft.dbMode,
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
    setConnectionStatus({
      tone: result.ok ? 'ok' : 'fail',
      title: result.ok ? t('connectionOk') : t('connectionFail'),
      detail: result.detail,
    });
    Alert.alert(
      result.ok ? t('connectionOk') : t('connectionFail'),
      result.detail,
    );
  };

  const onTestPostgrest = async () => {
    setTesting(true);
    let remoteRestUrl = (draft.remoteRestUrl || '').trim().replace(/\/+$/, '');
    const code = (draft.merkezTenantCode || '').trim().toLowerCase();
    if (!remoteRestUrl && code) {
      remoteRestUrl = `${DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN.replace(/\/+$/, '')}/${code}`;
    }
    const result = await testPostgrestConnection({
      ...draft,
      remoteRestUrl,
      merkezTenantCode: code || draft.merkezTenantCode,
    });
    setTesting(false);
    setConnectionStatus({
      tone: result.ok ? 'ok' : 'fail',
      title: result.ok ? t('connectionOk') : t('connectionFail'),
      detail: result.detail,
    });
    Alert.alert(
      result.ok ? t('connectionOk') : t('connectionFail'),
      result.detail,
    );
  };

  const onResolveTenant = async () => {
    const code = (draft.merkezTenantCode || '').trim();
    if (!code) {
      Alert.alert(t('tenantCodeRequiredTitle'), t('tenantCodeRequired'));
      return;
    }
    setResolvingTenant(true);
    try {
      const resolved = await resolveTenantByCode(code);
      const nextDraft: DbConfig = {
        ...draft,
        merkezTenantCode: resolved.code,
        merkezDisplayName: resolved.displayName,
        remoteRestUrl: resolved.remoteRestUrl,
        apiMode: draft.apiMode === 'bridge' ? 'hybrid' : (draft.apiMode ?? 'hybrid'),
        dbMode: 'online',
        remote: {
          ...draft.remote,
          database: resolved.databaseName || draft.remote.database,
        },
      };
      setDraft(nextDraft);
      const test = await testPostgrestConnection(nextDraft);
      const urlLine = t('tenantResolvedUrlHint', { url: resolved.remoteRestUrl });
      const title = test.ok
        ? resolved.fromRegistry
          ? t('tenantResolvedOk')
          : t('tenantResolvedPartialOk')
        : t('connectionFail');
      const detailLines = [
        `${t('tenantCode')}: ${resolved.code}`,
        resolved.displayName && resolved.displayName !== resolved.code
          ? resolved.displayName
          : null,
        urlLine,
        test.ok && !resolved.fromRegistry ? t('tenantResolvedFallbackHint') : null,
        test.ok ? t('tenantResolvedApiOk') : test.detail,
      ].filter(Boolean) as string[];
      const detail = detailLines.join('\n');
      setConnectionStatus({
        tone: test.ok ? (resolved.fromRegistry ? 'ok' : 'warn') : 'fail',
        title,
        detail,
      });
      Alert.alert(title, detail);
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      setConnectionStatus({
        tone: 'fail',
        title: t('connectionFail'),
        detail,
      });
      Alert.alert(t('connectionFail'), detail);
    } finally {
      setResolvingTenant(false);
    }
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
    setConnectionStatus({
      tone: 'warn',
      title: t('scanLan'),
      detail: t('scanLanScanning', { pct: 0, found: 0 }),
    });
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
        setConnectionStatus({
          tone: 'warn',
          title: t('scanLanNone'),
          detail,
        });
        Alert.alert(t('scanLanNone'), detail);
      } else {
        const bridgeCount = result.hits.filter((h) => h.kind === 'bridge').length;
        const postgrestCount = result.hits.filter((h) => h.kind === 'postgrest').length;
        setConnectionStatus({
          tone: 'ok',
          title: t('scanLanFoundCount', { count: result.hits.length }),
          detail: t('scanLanStatusFound', {
            bridge: bridgeCount,
            postgrest: postgrestCount,
          }),
        });
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        const detail = e instanceof Error ? e.message : String(e);
        setConnectionStatus({
          tone: 'fail',
          title: t('scanLanNone'),
          detail,
        });
        Alert.alert(
          t('scanLanNone'),
          detail,
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

  const apiMode = draft.apiMode ?? 'hybrid';

  const wizardSteps = useMemo(() => getConfigWizardSteps(apiMode), [apiMode]);
  const activeStepId: ConfigWizardStepId = useMemo(() => {
    if (stepIdOverride && wizardSteps.some((s) => s.id === stepIdOverride)) {
      return stepIdOverride;
    }
    const clamped = Math.max(0, Math.min(wizardIndex, wizardSteps.length - 1));
    return wizardSteps[clamped]!.id;
  }, [stepIdOverride, wizardIndex, wizardSteps]);
  const activeStepIndex = Math.max(
    0,
    wizardSteps.findIndex((s) => s.id === activeStepId),
  );
  const isLastStep = activeStepIndex >= wizardSteps.length - 1;
  const activeStepMeta = wizardSteps[activeStepIndex]!;

  useEffect(() => {
    // apiMode değişince postgres adımı kalkabilir — geçerli adıma sabitle
    if (!wizardSteps.some((s) => s.id === activeStepId)) {
      setStepIdOverride(null);
      setWizardIndex((i) => Math.min(i, wizardSteps.length - 1));
    }
  }, [wizardSteps, activeStepId]);

  const goWizard = (id: ConfigWizardStepId) => {
    const idx = wizardSteps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    setStepIdOverride(id);
    setWizardIndex(idx);
  };

  const goPrev = () => {
    const prev = wizardSteps[activeStepIndex - 1];
    if (!prev) return;
    goWizard(prev.id);
  };

  const goNext = () => {
    if (activeStepId === 'cloud' && apiMode === 'postgrest') {
      const code = (draft.merkezTenantCode || '').trim();
      const url = (draft.remoteRestUrl || '').trim();
      if (!code && !url) {
        Alert.alert(t('tenantCodeRequiredTitle'), t('tenantCodeRequired'));
        return;
      }
    }
    if (activeStepId === 'bridge' && apiMode !== 'postgrest') {
      if (!draft.bridgeHost.trim()) {
        Alert.alert(t('connectionFail'), t('bridgeHost'));
        return;
      }
    }
    const next = wizardSteps[activeStepIndex + 1];
    if (!next) return;
    goWizard(next.id);
  };


  const ApiModeChip = ({ mode, label }: { mode: ApiMode; label: string }) => {
    const active = apiMode === mode;
    const danger = mode === 'postgrest' && active;
    return (
      <Pressable
        onPress={() => patch({ apiMode: mode })}
        style={[
          styles.modeChip,
          {
            backgroundColor: active
              ? danger
                ? palette.amber600
                : palette.green600
              : darkMode
                ? palette.gray700
                : palette.gray100,
            borderColor: active
              ? danger
                ? palette.amber600
                : palette.green600
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

  const renderConnectionStatus = () =>
    connectionStatus ? (
      <View
        style={[
          styles.warnBox,
          {
            borderColor: statusColors(connectionStatus.tone, darkMode).borderColor,
            backgroundColor: statusColors(connectionStatus.tone, darkMode).backgroundColor,
          },
        ]}
      >
        <Text
          style={[
            styles.warnTitle,
            { color: statusColors(connectionStatus.tone, darkMode).titleColor },
          ]}
        >
          {connectionStatus.title}
        </Text>
        <Text
          style={[
            styles.warnBody,
            { color: statusColors(connectionStatus.tone, darkMode).bodyColor },
          ]}
        >
          {connectionStatus.detail}
        </Text>
      </View>
    ) : null;

  const StepIcon = activeStepMeta.icon;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.flex}>
          <GradientHeader
            compact
            safeTop={false}
            title={t('configWizardTitle')}
            subtitle={`${activeStepIndex + 1}/${wizardSteps.length} · ${activeStepMeta.label}`}
            right={<ConnectivityBadge onDark compact />}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={[
              styles.stepRail,
              {
                backgroundColor: darkMode ? palette.gray900 : palette.gray100,
                borderBottomColor: darkMode ? palette.gray700 : palette.gray200,
              },
            ]}
            contentContainerStyle={styles.stepRailContent}
          >
            {wizardSteps.map((s, idx) => {
              const on = s.id === activeStepId;
              const done = idx < activeStepIndex;
              const Icon = s.icon;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => goWizard(s.id)}
                  style={[
                    styles.stepChip,
                    {
                      backgroundColor: on
                        ? palette.blue600
                        : done
                          ? darkMode
                            ? 'rgba(37,99,235,0.25)'
                            : palette.blue50
                          : darkMode
                            ? palette.gray800
                            : palette.white,
                      borderColor: on
                        ? palette.blue600
                        : done
                          ? palette.blue500
                          : darkMode
                            ? palette.gray600
                            : palette.gray200,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.stepIconWrap,
                      {
                        backgroundColor: on
                          ? 'rgba(255,255,255,0.2)'
                          : darkMode
                            ? 'rgba(255,255,255,0.06)'
                            : palette.gray100,
                      },
                    ]}
                  >
                    <Icon
                      size={16}
                      color={on ? palette.white : done ? palette.blue600 : colors.textMuted}
                    />
                  </View>
                  <View style={{ minWidth: 0 }}>
                    <Text
                      style={{
                        color: on ? palette.white : colors.textMuted,
                        fontSize: 9,
                        fontWeight: '900',
                        letterSpacing: 0.8,
                      }}
                    >
                      {idx + 1}
                    </Text>
                    <Text
                      style={{
                        color: on ? palette.white : colors.text,
                        fontSize: 11,
                        fontWeight: '800',
                      }}
                      numberOfLines={1}
                    >
                      {s.shortLabel}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: darkMode ? palette.gray700 : palette.gray200,
                },
              ]}
            >
              <View style={styles.stepHero}>
                <View
                  style={[
                    styles.stepHeroIcon,
                    {
                      backgroundColor: darkMode
                        ? 'rgba(37,99,235,0.25)'
                        : palette.blue50,
                    },
                  ]}
                >
                  <StepIcon size={28} color={palette.blue600} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.stepHeroTitle, { color: colors.text }]}>
                    {activeStepMeta.label}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {t('configWizardStepHint')}
                  </Text>
                </View>
              </View>

              <View style={styles.form}>
                {activeStepId === 'infra' ? (
                  <>
                    <Text style={[styles.section, { color: colors.textMuted, marginTop: 0 }]}>
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
                      {apiMode === 'postgrest'
                        ? t('apiModePostgrestHint')
                        : apiMode === 'hybrid'
                          ? t('apiModeHybridHint')
                          : t('apiModeBridgeHint')}
                    </Text>
                    {apiMode === 'hybrid' ? (
                      <Text style={[styles.hint, { color: palette.green600, fontWeight: '700' }]}>
                        {t('apiModeReportsRecommendHybrid')}
                      </Text>
                    ) : null}
                    {draft.dbMode === 'online' && apiMode !== 'postgrest' ? (
                      <View
                        style={[
                          styles.warnBox,
                          {
                            borderColor: darkMode ? 'rgba(52,211,153,0.55)' : '#059669',
                            backgroundColor: darkMode
                              ? 'rgba(6,78,59,0.35)'
                              : 'rgba(236,253,245,0.95)',
                          },
                        ]}
                      >
                        <Text style={[styles.warnTitle, { color: darkMode ? '#6ee7b7' : '#065f46' }]}>
                          {t('remoteDataRecommendTitle')}
                        </Text>
                        <Text style={[styles.warnBody, { color: darkMode ? '#a7f3d0' : '#047857' }]}>
                          {t('remoteDataRecommendHybrid')}
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : null}

                {activeStepId === 'cloud' ? (
                  <View
                    style={[
                      styles.pgBox,
                      {
                        borderColor: darkMode ? 'rgba(96,165,250,0.55)' : '#93c5fd',
                        backgroundColor: darkMode
                          ? 'rgba(30,58,138,0.28)'
                          : 'rgba(239,246,255,0.95)',
                      },
                    ]}
                  >
                    <Text style={[styles.section, { color: colors.textMuted, marginTop: 0 }]}>
                      {t('tenantCloudSection')}
                    </Text>
                    <Text style={[styles.hint, { color: colors.textSubtle }]}>
                      {t('tenantCloudHint', { origin: DEFAULT_SAAS_TENANT_POSTGREST_ORIGIN })}
                    </Text>
                    <FormField
                      label={t('tenantCode')}
                      value={draft.merkezTenantCode || ''}
                      onChangeText={(v) =>
                        patch({
                          merkezTenantCode: v.trim().toLowerCase().replace(/\s+/g, ''),
                        })
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder={t('tenantCodePlaceholder')}
                    />
                    {draft.merkezDisplayName ? (
                      <Text style={[styles.activeTarget, { color: palette.blue500 }]}>
                        {draft.merkezDisplayName}
                        {draft.remoteRestUrl ? `\n${draft.remoteRestUrl}` : ''}
                      </Text>
                    ) : draft.remoteRestUrl ? (
                      <Text style={[styles.hint, { color: colors.textSubtle }]}>
                        {draft.remoteRestUrl}
                      </Text>
                    ) : null}
                    <PrimaryButton
                      label={t('tenantConnect')}
                      onPress={() => void onResolveTenant()}
                      loading={resolvingTenant || testing}
                    />
                    <Pressable
                      onPress={() => setShowAdvancedApi((v) => !v)}
                      style={{ marginTop: 4 }}
                    >
                      <Text style={{ color: palette.blue500, fontWeight: '700', fontSize: 13 }}>
                        {showAdvancedApi ? t('tenantHideAdvanced') : t('tenantShowAdvanced')}
                      </Text>
                    </Pressable>
                    {showAdvancedApi ? (
                      <>
                        <Text style={[styles.hint, { color: colors.textSubtle, marginTop: 8 }]}>
                          {t('tenantAdvancedHint')}
                        </Text>
                        <FormField
                          label={t('remoteRestUrl')}
                          value={draft.remoteRestUrl || ''}
                          onChangeText={(v) =>
                            patch({
                              remoteRestUrl: v,
                              merkezTenantCode:
                                draft.merkezTenantCode || tenantCodeFromRemoteRestUrl(v),
                            })
                          }
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
                        <Pressable onPress={() => void onTestPostgrest()} disabled={testing}>
                          <Text style={[styles.testLink, { marginTop: 4 }]}>{t('testPostgrest')}</Text>
                        </Pressable>
                      </>
                    ) : null}
                    {apiMode === 'postgrest' && !String(draft.remoteRestUrl || '').trim() ? (
                      <View
                        style={[
                          styles.warnBox,
                          {
                            borderColor: darkMode ? '#fbbf24' : '#d97706',
                            backgroundColor: darkMode
                              ? 'rgba(120,53,15,0.35)'
                              : 'rgba(254,243,199,0.95)',
                          },
                        ]}
                      >
                        <Text style={[styles.warnTitle, { color: darkMode ? '#fcd34d' : '#92400e' }]}>
                          {t('apiModePostgrestWarningTitle')}
                        </Text>
                        <Text style={[styles.warnBody, { color: darkMode ? '#fde68a' : '#78350f' }]}>
                          {t('apiModePostgrestWarning')}
                        </Text>
                      </View>
                    ) : null}
                    {renderConnectionStatus()}
                  </View>
                ) : null}

                {activeStepId === 'bridge' ? (
                  <>
                    <Text style={[styles.section, { color: colors.textMuted, marginTop: 0 }]}>
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
                    {androidLoopbackWarning ? (
                      <View
                        style={[
                          styles.warnBox,
                          {
                            borderColor: darkMode ? '#fbbf24' : '#d97706',
                            backgroundColor: darkMode
                              ? 'rgba(120,53,15,0.35)'
                              : 'rgba(254,243,199,0.95)',
                          },
                        ]}
                      >
                        <Text style={[styles.warnTitle, { color: darkMode ? '#fcd34d' : '#92400e' }]}>
                          {t('androidPhysicalBridgeHostWarningTitle')}
                        </Text>
                        <Text style={[styles.warnBody, { color: darkMode ? '#fde68a' : '#78350f' }]}>
                          {t('androidPhysicalBridgeHostWarning')}
                        </Text>
                      </View>
                    ) : null}

                    <PrimaryButton
                      label={
                        scanning
                          ? t('scanLanScanning', { pct: scanPct, found: scanFound })
                          : t('scanLan')
                      }
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
                    {renderConnectionStatus()}
                    {scanMeta?.deviceIp ? (
                      <Text style={[styles.hint, { color: colors.textSubtle }]}>
                        {t('scanLanDeviceIp', { ip: scanMeta.deviceIp })}
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
                                backgroundColor: darkMode ? palette.gray700 : palette.gray100,
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
                  </>
                ) : null}

                {activeStepId === 'postgres' ? (
                  <>
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
                    {renderConnectionStatus()}
                  </>
                ) : null}

                {activeStepId === 'summary' ? (
                  <>
                    <View
                      style={[
                        styles.summaryBox,
                        {
                          borderColor: darkMode ? palette.gray600 : palette.gray200,
                          backgroundColor: darkMode ? palette.gray800 : palette.gray50,
                        },
                      ]}
                    >
                      <SummaryRow
                        label={t('dbMode')}
                        value={draft.dbMode === 'online' ? t('dbModeOnline') : t('dbModeLocal')}
                        colors={colors}
                      />
                      <SummaryRow
                        label={t('networkPolicy')}
                        value={
                          (draft.networkPolicy ?? 'hybrid') === 'online'
                            ? t('connOnline')
                            : (draft.networkPolicy ?? 'hybrid') === 'offline'
                              ? t('connOffline')
                              : t('connHybrid')
                        }
                        colors={colors}
                      />
                      <SummaryRow
                        label={t('apiMode')}
                        value={
                          apiMode === 'postgrest'
                            ? t('apiModePostgrest')
                            : apiMode === 'hybrid'
                              ? t('apiModeHybrid')
                              : t('apiModeBridge')
                        }
                        colors={colors}
                      />
                      <SummaryRow
                        label={t('tenantCode')}
                        value={draft.merkezTenantCode || '—'}
                        colors={colors}
                      />
                      <SummaryRow
                        label={t('remoteRestUrl')}
                        value={draft.remoteRestUrl || '—'}
                        colors={colors}
                      />
                      <SummaryRow
                        label="pg_bridge"
                        value={`${draft.bridgeHost}:${draft.bridgePort}`}
                        colors={colors}
                      />
                      <SummaryRow
                        label={t('activeTarget')}
                        value={activeHint}
                        colors={colors}
                      />
                    </View>
                    {renderConnectionStatus()}
                    <PrimaryButton
                      label={
                        draft.apiMode === 'postgrest' ? t('testPostgrest') : t('testConnection')
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
                  </>
                ) : null}
              </View>
            </View>
          </ScrollView>

          <View
            style={[
              styles.wizardFooter,
              {
                backgroundColor: colors.card,
                borderTopColor: darkMode ? palette.gray700 : palette.gray200,
              },
            ]}
          >
            <Pressable
              onPress={activeStepIndex === 0 ? onCancel : goPrev}
              style={[
                styles.footerNavBtn,
                {
                  borderColor: darkMode ? palette.gray600 : palette.gray200,
                  backgroundColor: darkMode ? palette.gray800 : palette.white,
                },
              ]}
            >
              <ArrowLeft size={18} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>
                {activeStepIndex === 0 ? t('cancel') : t('configWizardBack')}
              </Text>
            </Pressable>
            {isLastStep ? (
              <Pressable
                onPress={onSave}
                style={[styles.footerPrimaryBtn, { backgroundColor: palette.blue600 }]}
              >
                <CheckCircle size={18} color={palette.white} />
                <Text style={{ color: palette.white, fontWeight: '900', fontSize: 13 }}>
                  {t('save')}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={goNext}
                style={[styles.footerPrimaryBtn, { backgroundColor: palette.blue600 }]}
              >
                <Text style={{ color: palette.white, fontWeight: '900', fontSize: 13 }}>
                  {t('configWizardNext')}
                </Text>
                <ArrowRight size={18} color={palette.white} />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: { text: string; textMuted: string };
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800' }}>{label}</Text>
      <Text
        style={{
          color: colors.text,
          fontSize: 12,
          fontWeight: '700',
          marginTop: 2,
          fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 24 },
  stepRail: {
    flexGrow: 0,
    borderBottomWidth: 1,
  },
  stepRailContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  stepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 148,
  },
  stepIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stepHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 4,
  },
  stepHeroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepHeroTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  form: { padding: 20, gap: 14 },
  section: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  hint: { fontSize: 11, lineHeight: 16 },
  warnBox: {
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  warnTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  warnBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
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
    borderRadius: 10,
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
    borderRadius: 12,
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
    borderRadius: 10,
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
  summaryBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  summaryRow: { gap: 2 },
  wizardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  footerNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  footerPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
});
