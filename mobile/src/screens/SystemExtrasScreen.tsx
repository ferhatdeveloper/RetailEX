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
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { HeaderIconButton } from '../components/GradientHeader';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createBarcodeTemplate,
  fetchBarcodeTemplates,
  type BarcodeTemplateRow,
} from '../api/systemExtrasApi';
import {
  DEFAULT_CALLER_ID_CONFIG,
  fetchCallerIdLast,
  probeCallerIdBridge,
  pushCallerIdEvent,
  type CallerIdConfig,
  type CallerIdMode,
} from '../api/callerIdApi';
import { isCallerIdNativePushAvailable } from '../services/callerIdNative';
import { scanLanServers } from '../utils/lanServerScan';
import { getBridgeBaseUrl, useConfigStore } from '../store/configStore';
import { useCallerIdStore } from '../store/callerIdStore';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'labels' | 'pbx';
type Props = NativeStackScreenProps<MainStackParamList, 'SystemExtras'>;

export function systemExtrasRouteTab(screenId?: string): Tab {
  if (screenId === 'virtual-pbx-caller-id') return 'pbx';
  return 'labels';
}

const MODE_IDS: CallerIdMode[] = ['off', 'virtual_pbx', 'physical_device', 'physical_serial'];

export function SystemExtrasScreen({ route }: Props) {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const cfgStore = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);
  const setCallerStore = useCallerIdStore((s) => s.setConfig);
  const [tab, setTab] = useState<Tab>(systemExtrasRouteTab(route.params?.screenId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<BarcodeTemplateRow[]>([]);
  const [caller, setCaller] = useState<CallerIdConfig | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [name, setName] = useState('Fatura etiket');
  const [prefix, setPrefix] = useState('869');
  const [currentValue, setCurrentValue] = useState('1000000');
  const [length, setLength] = useState('13');

  useEffect(() => {
    setTab(systemExtrasRouteTab(route.params?.screenId));
  }, [route.params?.screenId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [tmpl, c] = await Promise.all([
        fetchBarcodeTemplates(),
        useCallerIdStore.getState().hydrate().then(() => useCallerIdStore.getState().config),
      ]);
      setTemplates(tmpl);
      setCaller(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const handleCreateTemplate = async () => {
    setSaving(true);
    try {
      await createBarcodeTemplate({
        name,
        prefix,
        currentValue: Number(currentValue),
        length: Number(length),
      });
      setShowCreate(false);
      setLoading(true);
      await load();
    } catch (e) {
      Alert.alert(t('callerId.saveError'), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const persistCaller = async (next: CallerIdConfig) => {
    setCaller(next);
    try {
      await setCallerStore(next);
      setStatusLine(t('callerId.saved'));
    } catch (e) {
      Alert.alert(t('callerId.saveError'), e instanceof Error ? e.message : String(e));
    }
  };

  const baseEmpty = caller ?? { ...DEFAULT_CALLER_ID_CONFIG };

  const modeLabel = (id: CallerIdMode) => t(`callerId.mode.${id}`);
  const modeDesc = (id: CallerIdMode) => t(`callerId.modeDesc.${id}`);

  const discoverBridge = async () => {
    if (busy) return;
    setBusy(true);
    setStatusLine(t('callerId.discovering'));
    try {
      const result = await scanLanServers({
        hintHost: cfgStore.bridgeHost,
        timeoutMs: 500,
        concurrency: 32,
      });
      const bridges = result.hits.filter((h) => h.kind === 'bridge');
      if (bridges.length === 0) {
        setStatusLine(t('callerId.discoverNone'));
        Alert.alert(t('scanLanNone'), t('callerId.discoverNone'));
        return;
      }
      const hit = bridges[0];
      setConfig({ bridgeHost: hit.host, bridgePort: hit.port });
      const poll = `${hit.baseUrl}/api/caller_id/last`;
      const nextMode: CallerIdMode =
        caller?.mode === 'off' || !caller?.mode ? 'virtual_pbx' : caller.mode;
      const next: CallerIdConfig = {
        ...baseEmpty,
        mode: nextMode === 'physical_serial' ? 'virtual_pbx' : nextMode,
        pollUrl: nextMode === 'physical_device' ? poll : '',
      };
      await persistCaller(next);
      const ok = await probeCallerIdBridge(hit.baseUrl);
      setStatusLine(
        ok
          ? t('callerId.discoverOk', { host: hit.host, port: hit.port })
          : t('callerId.discoverAppliedWeak', { host: hit.host, port: hit.port }),
      );
    } catch (e) {
      setStatusLine(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const testPoll = async () => {
    if (!caller || busy) return;
    setBusy(true);
    try {
      const ev = await fetchCallerIdLast(caller);
      if (!ev) {
        Alert.alert(t('callerId.testPoll'), t('callerId.testPollEmpty'));
      } else {
        Alert.alert(
          t('callerId.testPoll'),
          t('callerId.testPollHit', { phone: ev.phone, name: ev.name || '—', at: ev.receivedAt }),
        );
      }
    } catch (e) {
      Alert.alert(t('callerId.testPoll'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const testPush = async () => {
    if (!caller || busy) return;
    setBusy(true);
    try {
      const phone = '905551112233';
      await pushCallerIdEvent({
        phone,
        name: 'Mobile test',
        token: caller.apiToken,
      });
      Alert.alert(t('callerId.testPush'), t('callerId.testPushOk', { phone }));
    } catch (e) {
      Alert.alert(t('callerId.testPush'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const bridgeHint = getBridgeBaseUrl(cfgStore);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={tab === 'labels' ? t('callerId.labelsTitle') : t('callerId.title')}
        subtitle={tab === 'labels' ? t('callerId.labelsSubtitle') : t('callerId.subtitle')}
        right={
          tab === 'labels' ? (
            <HeaderIconButton
              accent
              onPress={() => {
                setName('Fatura etiket');
                setPrefix('869');
                setCurrentValue('1000000');
                setLength('13');
                setShowCreate(true);
              }}
            >
              <Plus size={18} color={palette.white} />
            </HeaderIconButton>
          ) : undefined
        }
      />
      <SegmentTabBar
        layout="scroll"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'labels' as const, label: t('callerId.tabLabels') },
          { id: 'pbx' as const, label: t('callerId.tabPbx') },
        ]}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'labels' ? (
        <FlatList
          data={templates}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message={t('callerId.noTemplates')} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {t('callerId.templateMeta', {
                  prefix: item.prefix || '—',
                  value: item.current_value,
                  length: item.length,
                })}
              </Text>
              {!item.is_active ? (
                <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                  {t('callerId.inactive')}
                </Text>
              ) : null}
            </View>
          )}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        >
          <Text style={[styles.hint, { color: colors.textMuted }]}>{t('callerId.hintLive')}</Text>
          <Text style={[styles.hint, { color: colors.textSubtle }]}>
            {t('callerId.bridgeDefault', { url: `${bridgeHint}/api/caller_id/last` })}
          </Text>
          {isCallerIdNativePushAvailable() ? (
            <Text style={[styles.hint, { color: palette.blue600 }]}>{t('callerId.nativePushOn')}</Text>
          ) : (
            <Text style={[styles.hint, { color: colors.textSubtle }]}>{t('callerId.nativePushOff')}</Text>
          )}

          {MODE_IDS.map((id) => (
            <Pressable
              key={id}
              onPress={() => void persistCaller({ ...baseEmpty, mode: id })}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: caller?.mode === id ? palette.blue600 : colors.cardBorder,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>{modeLabel(id)}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{modeDesc(id)}</Text>
            </Pressable>
          ))}

          {caller?.mode === 'virtual_pbx' || caller?.mode === 'physical_device' ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, gap: 8 }]}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('callerId.pollUrl')}</Text>
              <TextInput
                value={caller.pollUrl}
                onChangeText={(pollUrl) => setCaller({ ...caller, pollUrl })}
                onEndEditing={() => void persistCaller(caller)}
                placeholder={t('callerId.pollUrlPlaceholder')}
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="none"
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('callerId.intervalSec')}</Text>
              <TextInput
                value={String(caller.pollIntervalSec)}
                onChangeText={(v) =>
                  setCaller({
                    ...caller,
                    pollIntervalSec: Math.max(2, Number(v.replace(/\D/g, '')) || 3),
                  })
                }
                onEndEditing={() => void persistCaller(caller)}
                keyboardType="number-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('callerId.apiToken')}</Text>
              <TextInput
                value={caller.apiToken}
                onChangeText={(apiToken) => setCaller({ ...caller, apiToken })}
                onEndEditing={() => void persistCaller(caller)}
                placeholder={t('callerId.apiTokenPlaceholder')}
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="none"
                secureTextEntry
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{t('callerId.deviceHint')}</Text>
              <TextInput
                value={caller.deviceHint}
                onChangeText={(deviceHint) => setCaller({ ...caller, deviceHint })}
                onEndEditing={() => void persistCaller(caller)}
                placeholder={t('callerId.deviceHintPlaceholder')}
                placeholderTextColor={colors.textSubtle}
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
              <PrimaryButton label={t('save')} onPress={() => void persistCaller(caller)} disabled={busy} />
              <PrimaryButton
                label={busy ? t('callerId.working') : t('callerId.discoverBridge')}
                onPress={() => void discoverBridge()}
                disabled={busy}
              />
              <View style={styles.rowBtns}>
                <Pressable
                  style={[styles.smallBtn, { borderColor: colors.cardBorder }]}
                  onPress={() => void testPoll()}
                  disabled={busy}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
                    {t('callerId.testPoll')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.smallBtn, { borderColor: colors.cardBorder }]}
                  onPress={() => void testPush()}
                  disabled={busy}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>
                    {t('callerId.testPush')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {caller?.mode === 'physical_serial' ? (
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t('callerId.serialDesktopOnly')}</Text>
          ) : null}

          {statusLine ? (
            <Text style={[styles.hint, { color: palette.blue600 }]}>{statusLine}</Text>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCreate(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('callerId.newTemplate')}</Text>
            <FormField label={t('callerId.fieldName')} value={name} onChangeText={setName} />
            <FormField
              label={t('callerId.fieldPrefix')}
              value={prefix}
              onChangeText={setPrefix}
              keyboardType="number-pad"
            />
            <FormField
              label={t('callerId.fieldStart')}
              value={currentValue}
              onChangeText={setCurrentValue}
              keyboardType="number-pad"
            />
            <FormField
              label={t('callerId.fieldLength')}
              value={length}
              onChangeText={setLength}
              keyboardType="number-pad"
            />
            <PrimaryButton
              label={saving ? t('loading') : t('save')}
              onPress={() => void handleCreateTemplate()}
              disabled={saving}
              loading={saving}
            />
            <Pressable onPress={() => setShowCreate(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  rowBtns: { flexDirection: 'row', gap: 8 },
  smallBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
});
