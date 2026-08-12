import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import {
  Scale,
  Wifi,
  Bluetooth,
  FlaskConical,
  Trash2,
  Usb,
  Radio,
} from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenHeader } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemeStore } from '../store/themeStore';
import { createManualNetworkDevice, useScaleStore } from '../store/scaleStore';
import {
  bleDevBuildHint,
  createScaleTransport,
  getSimulateTransport,
  isBleNativeAvailable,
  isNativeScaleTcpAvailable,
  isSppNativeAvailable,
  isUsbSerialNativeAvailable,
  listUsbSerialDevices,
  scanBleDevices,
  scanSppBondedDevices,
  sppDevBuildHint,
  usbSerialDevBuildHint,
} from '../services/scale/scaleTransport';
import { scanLanScales } from '../services/scale/lanScaleScan';
import { LABEL_SLOTS, type LabelSlot } from '../services/scale/labelSlotHelper';
import {
  fetchScaleProducts,
  scaleProductsToPluPayload,
} from '../api/scaleProductsApi';
import { palette } from '../theme/colors';
import type { BluetoothScaleProfile, ScaleDevice, ScaleTransportKind } from '../types/scale';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'ScaleManagement'>;
type TabId = 'sync' | 'devices' | 'scale' | 'settings' | 'log';

type ManualKind = ScaleTransportKind | 'bluetooth-spp';

export function ScaleManagementScreen(_props: Props) {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const devices = useScaleStore((s) => s.devices);
  const settings = useScaleStore((s) => s.settings);
  const logs = useScaleStore((s) => s.logs);
  const upsertDevice = useScaleStore((s) => s.upsertDevice);
  const removeDevice = useScaleStore((s) => s.removeDevice);
  const toggleDeviceEnabled = useScaleStore((s) => s.toggleDeviceEnabled);
  const selectDevice = useScaleStore((s) => s.selectDevice);
  const updateSettings = useScaleStore((s) => s.updateSettings);
  const pushLog = useScaleStore((s) => s.pushLog);
  const clearLogs = useScaleStore((s) => s.clearLogs);
  const getSelectedDevice = useScaleStore((s) => s.getSelectedDevice);

  const [tab, setTab] = useState<TabId>('sync');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualIp, setManualIp] = useState('192.168.1.87');
  const [manualPort, setManualPort] = useState(String(settings.defaultPort));
  const [manualKind, setManualKind] = useState<ManualKind>('network');
  const [lastSyncMsg, setLastSyncMsg] = useState<string | null>(null);
  const [liveKg, setLiveKg] = useState<number | null>(null);
  const [liveStable, setLiveStable] = useState(false);
  const [liveDetail, setLiveDetail] = useState('');
  const [scanHits, setScanHits] = useState<{ id: string; name: string }[]>([]);
  const [lanHits, setLanHits] = useState<Array<{ ip: string; port: number; ms: number }>>([]);

  const bleNative = isBleNativeAvailable();
  const sppNative = isSppNativeAvailable();
  const usbNative = isUsbSerialNativeAvailable();
  const tcpNative = isNativeScaleTcpAvailable();

  const tabs = useMemo(
    () =>
      [
        { id: 'sync' as const, label: t('scaleUi.tabSync') },
        { id: 'devices' as const, label: t('scaleUi.tabDevices') },
        { id: 'scale' as const, label: t('scaleUi.tabScale') },
        { id: 'settings' as const, label: t('scaleUi.tabSettings') },
        { id: 'log' as const, label: t('scaleUi.tabLog') },
      ] as const,
    [t],
  );

  const selected = useMemo(
    () => getSelectedDevice(),
    [devices, settings.lastSelectedDeviceId, getSelectedDevice],
  );

  const livePoll = selected?.transport === 'bluetooth';

  useEffect(() => {
    if (tab !== 'scale' || !livePoll || !selected) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const tr = createScaleTransport(selected);
        const w = await tr.readLiveWeight();
        if (cancelled) return;
        setLiveKg(w.weightKg);
        setLiveStable(w.stable);
        setLiveDetail(w.detail);
      } catch {
        /* sessiz */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tab, livePoll, selected?.id, selected?.bluetoothAddress, selected?.bluetoothProfile]);

  const runBusy = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setStatus(label);
      try {
        await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(msg);
        pushLog(`HATA: ${msg}`);
        Alert.alert(t('scaleUi.alertTitle'), msg);
      } finally {
        setBusy(false);
      }
    },
    [busy, pushLog, t],
  );

  const onTestApiHint = () => {
    Alert.alert(t('scaleUi.bridgeHintTitle'), t('scaleUi.bridgeHintBody'));
  };

  const onSync = () =>
    void runBusy(t('loading'), async () => {
      const products = await fetchScaleProducts();
      const payload = scaleProductsToPluPayload(products);
      pushLog(`Tartı ürünü: ${products.length}`);
      const targets = devices.filter((d) => d.enabled);
      if (targets.length === 0) {
        const sim = getSimulateTransport();
        const r = await sim.sendPlu(payload);
        setLastSyncMsg(r.message);
        pushLog(r.message);
        Alert.alert(t('scaleUi.syncSimTitle'), r.message);
        return;
      }
      const errors: string[] = [];
      let sent = 0;
      for (const d of targets) {
        const tr = createScaleTransport(d);
        const r = await tr.sendPlu(payload);
        pushLog(`${d.name}: ${r.message}`);
        if (r.success) {
          sent += r.sentCount;
          upsertDevice({
            ...d,
            status: 'online',
            lastSync: new Date().toISOString(),
            lastProductCount: r.sentCount,
            lastStatus: r.message,
          });
        } else {
          errors.push(`${d.name}: ${r.message}`);
          upsertDevice({ ...d, status: 'error', lastStatus: r.message });
        }
      }
      const msg = `Gönderilen: ${sent} / ${payload.length}${errors.length ? `\n${errors.join('\n')}` : ''}`;
      setLastSyncMsg(msg);
      Alert.alert(errors.length ? t('scaleUi.syncPartial') : t('scaleUi.syncDone'), msg);
    });

  const onTestSelected = () =>
    void runBusy(t('testConnection'), async () => {
      const d = selected;
      if (!d) {
        Alert.alert(t('scaleUi.alertTitle'), t('scaleUi.needDevice'));
        return;
      }
      const tr = createScaleTransport(d);
      const r = await tr.testConnection();
      upsertDevice({
        ...d,
        status: r.ok ? 'online' : 'offline',
        lastStatus: r.message,
      });
      pushLog(`Test ${d.name}: ${r.message}`);
      Alert.alert(r.ok ? t('connectionOk') : t('connectionFail'), r.message);
    });

  const resolveManual = (): { transport: ScaleTransportKind; profile?: BluetoothScaleProfile } => {
    if (manualKind === 'bluetooth-spp') return { transport: 'bluetooth', profile: 'spp' };
    if (manualKind === 'bluetooth') return { transport: 'bluetooth', profile: 'ble' };
    return { transport: manualKind };
  };

  const onAddDevice = () => {
    const { transport, profile } = resolveManual();
    const port = Number(manualPort) || settings.defaultPort;
    const device = createManualNetworkDevice(manualName, manualIp, port, transport, {
      bluetoothProfile: profile,
      usbBaudRate: settings.usbBaudRate,
    });
    upsertDevice(device);
    selectDevice(device.id);
    pushLog(`Cihaz eklendi: ${device.name} (${device.transport})`);
    setStatus(`${device.name}`);
  };

  const onAddSimulate = () => {
    const device: ScaleDevice = {
      ...createManualNetworkDevice('Simülasyon Terazi', '', 0, 'simulate'),
      transport: 'simulate',
      ipAddress: '',
    };
    upsertDevice(device);
    selectDevice(device.id);
    pushLog('Simülasyon terazisi eklendi');
  };

  const onLanScan = () =>
    void runBusy(t('scaleUi.scanLanBusy'), async () => {
      const r = await scanLanScales({ hintHost: manualIp });
      pushLog(r.message);
      setLanHits(r.hits.map((h) => ({ ip: h.ip, port: h.port, ms: h.responseMs })));
      if (r.hits.length === 0) {
        Alert.alert(t('scaleUi.scanLanDone'), t('scaleUi.scanLanEmpty'));
        return;
      }
      Alert.alert(t('scaleUi.scanLanDone'), r.message);
    });

  const onBleScan = () =>
    void runBusy(t('scaleUi.scanBle'), async () => {
      if (!isBleNativeAvailable()) {
        Alert.alert(t('scaleUi.alertTitle'), bleDevBuildHint());
        return;
      }
      const hits = await scanBleDevices(8000);
      setScanHits(hits.map((h) => ({ id: h.id, name: h.name })));
      pushLog(`BLE: ${hits.length}`);
      setManualKind('bluetooth');
    });

  const onSppScan = () =>
    void runBusy(t('scaleUi.scanSpp'), async () => {
      if (!isSppNativeAvailable()) {
        Alert.alert(t('scaleUi.alertTitle'), sppDevBuildHint());
        return;
      }
      const hits = await scanSppBondedDevices();
      setScanHits(hits.map((h) => ({ id: h.id, name: h.name })));
      pushLog(`SPP: ${hits.length}`);
      setManualKind('bluetooth-spp');
    });

  const onUsbScan = () =>
    void runBusy(t('scaleUi.scanUsb'), async () => {
      const r = await listUsbSerialDevices(settings.usbBaudRate);
      pushLog(r.message);
      if (!usbNative) {
        Alert.alert(t('scaleUi.alertTitle'), usbSerialDevBuildHint());
        return;
      }
      setScanHits(r.devices.map((d) => ({ id: d.id, name: d.name })));
      setManualKind('usb');
      Alert.alert(t('scaleUi.scanUsb'), r.message);
    });

  const onPickScanHit = (hit: { id: string; name: string }) => {
    setManualIp(hit.id);
    if (!manualName.trim()) setManualName(hit.name);
    pushLog(`Seçildi: ${hit.name}`);
  };

  const onPickLanHit = (hit: { ip: string; port: number }) => {
    setManualKind('network');
    setManualIp(hit.ip);
    setManualPort(String(hit.port));
    if (!manualName.trim()) setManualName(`Terazi ${hit.ip}`);
  };

  const onClearPlu = () => {
    if (!selected || selected.transport !== 'network') {
      Alert.alert(t('scaleUi.alertTitle'), t('scaleUi.needDevice'));
      return;
    }
    Alert.alert(t('scaleUi.confirmClearTitle'), t('scaleUi.confirmClearBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('scaleUi.clearPlu'),
        style: 'destructive',
        onPress: () =>
          void runBusy(t('scaleUi.clearPlu'), async () => {
            const products = await fetchScaleProducts();
            const payload = scaleProductsToPluPayload(products);
            const tr = createScaleTransport(selected);
            const r = (await tr.clearPlu?.(payload)) ?? {
              success: false,
              message: 'clearPlu yok',
              productCount: 0,
              sentCount: 0,
              failedCount: 0,
              errors: [],
            };
            pushLog(r.message);
            Alert.alert(t('scaleUi.alertTitle'), r.message);
          }),
      },
    ]);
  };

  const transportChip = (
    id: ManualKind,
    label: string,
    Icon: typeof Wifi,
  ) => {
    const active = manualKind === id;
    return (
      <Pressable
        key={id}
        onPress={() => setManualKind(id)}
        style={[
          styles.chip,
          {
            backgroundColor: active ? palette.amber600 : colors.card,
            borderColor: active ? palette.amber600 : colors.cardBorder,
          },
        ]}
      >
        <Icon size={14} color={active ? palette.white : colors.textMuted} />
        <Text
          style={{
            color: active ? palette.white : colors.text,
            fontSize: 11,
            fontWeight: '700',
          }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const describeDevice = (d: ScaleDevice) => {
    if (d.transport === 'network') {
      return t('scaleUi.transportTcp', { ip: d.ipAddress, port: d.port });
    }
    if (d.transport === 'bluetooth') {
      return t('scaleUi.transportBt', {
        addr: `${d.bluetoothProfile === 'spp' ? 'SPP ' : 'BLE '}${d.bluetoothAddress || '—'}`,
      });
    }
    if (d.transport === 'usb') {
      return t('scaleUi.transportUsb', { id: d.usbDeviceId || '—' });
    }
    return t('scaleUi.transportSim');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t('scaleUi.title')} subtitle={t('scaleUi.subtitle')} />

      <SegmentTabBar layout="scroll" value={tab} onChange={setTab} items={[...tabs]} />

      {(busy || status) && (
        <View style={styles.statusRow}>
          {busy ? <ActivityIndicator color={palette.blue600} /> : null}
          <Text style={{ color: colors.textMuted, flex: 1, fontSize: 12 }}>{status}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body}>
        {tab === 'sync' ? (
          <View style={styles.section}>
            <Text style={[styles.help, { color: colors.textMuted }]}>{t('scaleUi.syncHelp')}</Text>
            <PrimaryButton label={t('scaleUi.apiAbout')} onPress={onTestApiHint} variant="ghost" />
            <PrimaryButton
              label={t('scaleUi.startSync')}
              onPress={onSync}
              loading={busy}
              disabled={busy}
            />
            {lastSyncMsg ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{t('scaleUi.lastSync')}</Text>
                <Text style={{ color: colors.textMuted, marginTop: 6 }}>{lastSyncMsg}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'devices' ? (
          <View style={styles.section}>
            <Text style={[styles.help, { color: colors.textMuted }]}>
              {t('scaleUi.registered', {
                count: devices.length,
                active: devices.filter((d) => d.enabled).length,
              })}
            </Text>
            <Text style={[styles.help, { color: colors.textMuted }]}>
              {t('scaleUi.tcpDirect', { state: tcpNative ? t('scaleUi.on') : t('scaleUi.off') })}
            </Text>

            <PrimaryButton
              label={t('scaleUi.scanLan')}
              onPress={onLanScan}
              loading={busy}
              disabled={busy}
              variant="ghost"
            />
            {lanHits.length > 0 ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{t('scaleUi.foundDevices')}</Text>
                {lanHits.map((h) => (
                  <Pressable
                    key={`${h.ip}:${h.port}`}
                    onPress={() => onPickLanHit(h)}
                    style={styles.scanHit}
                  >
                    <Text style={{ color: colors.text, flex: 1 }}>
                      {h.ip}:{h.port}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{h.ms} ms</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('scaleUi.manualDevice')}</Text>
            <View style={styles.chipRow}>
              {transportChip('network', t('scaleUi.chipTcp'), Wifi)}
              {transportChip('bluetooth', t('scaleUi.chipBle'), Bluetooth)}
              {transportChip('bluetooth-spp', t('scaleUi.chipSpp'), Radio)}
              {transportChip('usb', t('scaleUi.chipUsb'), Usb)}
              {transportChip('simulate', t('scaleUi.chipSim'), FlaskConical)}
            </View>
            <FormField
              label={t('scaleUi.fieldName')}
              value={manualName}
              onChangeText={setManualName}
              placeholder="Terazi 1"
            />
            <FormField
              label={
                manualKind === 'bluetooth' || manualKind === 'bluetooth-spp'
                  ? t('scaleUi.fieldBt')
                  : manualKind === 'usb'
                    ? t('scaleUi.fieldUsbId')
                    : t('scaleUi.fieldIp')
              }
              value={manualIp}
              onChangeText={setManualIp}
              placeholder={
                manualKind.startsWith('bluetooth')
                  ? 'AA:BB:…'
                  : manualKind === 'usb'
                    ? 'usb-…'
                    : '192.168.1.87'
              }
              autoCapitalize="none"
            />
            {manualKind === 'network' ? (
              <FormField
                label={t('scaleUi.fieldPort')}
                value={manualPort}
                onChangeText={setManualPort}
                keyboardType="number-pad"
              />
            ) : null}
            {manualKind === 'bluetooth' ? (
              <>
                <Text
                  style={[
                    styles.help,
                    { color: bleNative ? palette.green600 : palette.amber600 },
                  ]}
                >
                  {bleNative ? t('scaleUi.bleReady') : t('scaleUi.bleMissing')}
                </Text>
                <PrimaryButton
                  label={t('scaleUi.scanBle')}
                  onPress={onBleScan}
                  loading={busy}
                  disabled={busy || !bleNative}
                  variant="ghost"
                />
              </>
            ) : null}
            {manualKind === 'bluetooth-spp' ? (
              <>
                <Text style={[styles.help, { color: colors.textMuted }]}>{t('scaleUi.sppHint')}</Text>
                <PrimaryButton
                  label={t('scaleUi.scanSpp')}
                  onPress={onSppScan}
                  loading={busy}
                  disabled={busy || !sppNative}
                  variant="ghost"
                />
              </>
            ) : null}
            {manualKind === 'usb' ? (
              <>
                <Text style={[styles.help, { color: colors.textMuted }]}>{t('scaleUi.usbHint')}</Text>
                <PrimaryButton
                  label={t('scaleUi.scanUsb')}
                  onPress={onUsbScan}
                  loading={busy}
                  disabled={busy}
                  variant="ghost"
                />
              </>
            ) : null}
            {scanHits.length > 0 ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{t('scaleUi.foundDevices')}</Text>
                {scanHits.map((h) => (
                  <Pressable key={h.id} onPress={() => onPickScanHit(h)} style={styles.scanHit}>
                    <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                      {h.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{h.id.slice(-12)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <PrimaryButton label={t('scaleUi.addDevice')} onPress={onAddDevice} />
            <PrimaryButton
              label={t('scaleUi.addSimulate')}
              onPress={onAddSimulate}
              variant="ghost"
            />

            {devices.length === 0 ? (
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>{t('scaleUi.noDevices')}</Text>
            ) : (
              devices.map((d) => (
                <View
                  key={d.id}
                  style={[
                    styles.card,
                    { backgroundColor: colors.card, borderColor: colors.cardBorder },
                  ]}
                >
                  <View style={styles.cardHead}>
                    <Scale size={18} color={palette.amber600} />
                    <Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>{d.name}</Text>
                    <Pressable onPress={() => removeDevice(d.id)} hitSlop={8}>
                      <Trash2 size={18} color={palette.red500} />
                    </Pressable>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {describeDevice(d)}
                    {' · '}
                    {d.enabled ? t('scaleUi.active') : t('scaleUi.passive')}
                    {' · '}
                    {d.status}
                  </Text>
                  <View style={styles.rowBtns}>
                    <Pressable
                      onPress={() => selectDevice(d.id)}
                      style={[
                        styles.miniBtn,
                        {
                          backgroundColor:
                            settings.lastSelectedDeviceId === d.id
                              ? palette.blue600
                              : colors.background,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            settings.lastSelectedDeviceId === d.id
                              ? palette.white
                              : colors.text,
                          fontWeight: '700',
                          fontSize: 11,
                        }}
                      >
                        {settings.lastSelectedDeviceId === d.id
                          ? t('scaleUi.selected')
                          : t('scaleUi.select')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => toggleDeviceEnabled(d.id)}
                      style={[styles.miniBtn, { backgroundColor: colors.background }]}
                    >
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 11 }}>
                        {d.enabled ? t('scaleUi.disable') : t('scaleUi.enable')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {tab === 'scale' ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {selected
                ? t('scaleUi.selectedDevice', {
                    name: selected.name,
                    transport: selected.transport,
                  })
                : t('scaleUi.noDeviceSelected')}
            </Text>
            {selected?.transport === 'network' ? (
              <Text style={[styles.help, { color: palette.amber600 }]}>
                {t('scaleUi.lanNoLiveKg')}
              </Text>
            ) : null}
            {selected?.transport === 'bluetooth' ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t('scaleUi.liveBleKg')}</Text>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '900' }}>
                  {liveKg != null ? `${liveKg.toFixed(3)} kg` : '— · — — kg'}
                </Text>
                <Text
                  style={{
                    color: liveStable ? palette.green600 : colors.textMuted,
                    fontSize: 12,
                  }}
                >
                  {liveStable ? t('scaleUi.stable') : t('scaleUi.unstable')}
                  {liveDetail ? ` · ${liveDetail}` : ''}
                </Text>
              </View>
            ) : null}
            <PrimaryButton
              label={t('scaleUi.testConnection')}
              onPress={onTestSelected}
              loading={busy}
              disabled={busy || !selected}
            />
            <PrimaryButton
              label={t('scaleUi.fetchSales')}
              onPress={() =>
                void runBusy(t('scaleUi.fetchSales'), async () => {
                  if (!selected) return;
                  const tr = createScaleTransport(selected);
                  const r = await tr.fetchSales();
                  pushLog(`Satış: ${r.message} (${r.records.length})`);
                  Alert.alert(
                    r.ok ? t('scaleUi.fetchSales') : t('connectionFail'),
                    `${r.message}\n${r.records.length}`,
                  );
                })
              }
              variant="ghost"
              disabled={busy || !selected || selected.transport !== 'network'}
            />
            <PrimaryButton
              label={t('scaleUi.clearPlu')}
              onPress={onClearPlu}
              variant="ghost"
              disabled={busy || !selected || selected.transport !== 'network'}
            />
            <PrimaryButton
              label={t('scaleUi.sendHotkeys')}
              onPress={() =>
                void runBusy(t('scaleUi.sendHotkeys'), async () => {
                  if (!selected || selected.transport !== 'network') return;
                  const products = await fetchScaleProducts();
                  const payload = scaleProductsToPluPayload(products);
                  const lf = payload
                    .map((p) => Number(p.lfCode || p.pluCode) || 0)
                    .filter((n) => n > 0);
                  const tr = createScaleTransport(selected);
                  const r = (await tr.sendHotkeys?.(lf)) ?? {
                    success: false,
                    message: 'sendHotkeys yok',
                  };
                  pushLog(r.message);
                  Alert.alert(t('scaleUi.alertTitle'), r.message);
                })
              }
              variant="ghost"
              disabled={busy || !selected || selected.transport !== 'network'}
            />
            <PrimaryButton
              label={t('scaleUi.sendLabel')}
              onPress={() =>
                void runBusy(t('scaleUi.sendLabel'), async () => {
                  if (!selected || selected.transport !== 'network') return;
                  const tr = createScaleTransport(selected);
                  const r = (await tr.sendLabelTemplate?.(settings.labelSlot)) ?? {
                    success: false,
                    message: '—',
                  };
                  pushLog(r.message);
                  Alert.alert(t('scaleUi.alertTitle'), r.message);
                })
              }
              variant="ghost"
              disabled={busy || !selected || selected.transport !== 'network'}
            />
            <PrimaryButton
              label={t('scaleUi.readLive')}
              onPress={() =>
                void runBusy(t('scaleUi.readLive'), async () => {
                  if (!selected) {
                    const w = await getSimulateTransport().connect();
                    const kg = w.weight?.weightKg;
                    pushLog(`Simüle kg: ${kg}`);
                    Alert.alert(t('scaleUi.simPreview'), `${kg?.toFixed(3) ?? '—'} kg`);
                    return;
                  }
                  const tr = createScaleTransport(selected);
                  await tr.connect();
                  const w = await tr.readLiveWeight();
                  setLiveKg(w.weightKg);
                  setLiveStable(w.stable);
                  setLiveDetail(w.detail);
                  pushLog(`Tartım (${selected.transport}): ${w.weightKg?.toFixed(3) ?? 'null'} kg`);
                  Alert.alert(
                    t('scaleUi.readLive'),
                    w.weightKg != null
                      ? `${w.weightKg.toFixed(3)} kg\n${w.detail}`
                      : w.detail || 'kg yok',
                  );
                })
              }
              variant="ghost"
              disabled={busy}
            />
            <PrimaryButton
              label={t('scaleUi.simPreview')}
              onPress={() =>
                void runBusy(t('scaleUi.simPreview'), async () => {
                  const w = await getSimulateTransport().connect();
                  const kg = w.weight?.weightKg;
                  pushLog(`Simüle kg: ${kg}`);
                  Alert.alert(t('scaleUi.simPreview'), `${kg?.toFixed(3) ?? '—'} kg`);
                })
              }
              variant="ghost"
            />
          </View>
        ) : null}

        {tab === 'settings' ? (
          <View style={styles.section}>
            <FormField
              label={t('scaleUi.defaultPort')}
              value={String(settings.defaultPort)}
              onChangeText={(txt) =>
                updateSettings({ defaultPort: Number(txt.replace(/\D/g, '')) || 5001 })
              }
              keyboardType="number-pad"
            />
            <FormField
              label={t('scaleUi.usbBaud')}
              value={String(settings.usbBaudRate)}
              onChangeText={(txt) =>
                updateSettings({ usbBaudRate: Number(txt.replace(/\D/g, '')) || 9600 })
              }
              keyboardType="number-pad"
            />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('scaleUi.labelSlot')}</Text>
            <View style={styles.chipRow}>
              {LABEL_SLOTS.map((slot) => {
                const active = settings.labelSlot === slot;
                return (
                  <Pressable
                    key={slot}
                    onPress={() => updateSettings({ labelSlot: slot as LabelSlot })}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? palette.blue600 : colors.card,
                        borderColor: active ? palette.blue600 : colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? palette.white : colors.text,
                        fontWeight: '700',
                        fontSize: 11,
                      }}
                    >
                      {slot}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {(
              [
                ['preferSimulateWeigh', t('scaleUi.preferSim')],
                ['clearBeforeSend', t('scaleUi.clearBeforeSend')],
                ['sendHotkeys', t('scaleUi.sendHotkeysOpt')],
                ['sendLabelOnSync', t('scaleUi.sendLabelOpt')],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={styles.switchRow}>
                <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>{label}</Text>
                <Switch
                  value={settings[key]}
                  onValueChange={(v) => updateSettings({ [key]: v })}
                />
              </View>
            ))}
            <Text style={[styles.help, { color: colors.textMuted }]}>{t('scaleUi.settingsHelp')}</Text>
          </View>
        ) : null}

        {tab === 'log' ? (
          <View style={styles.section}>
            <PrimaryButton label={t('scaleUi.clearLog')} onPress={clearLogs} variant="ghost" />
            {logs.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>{t('scaleUi.logEmpty')}</Text>
            ) : (
              [...logs].reverse().map((line, i) => (
                <Text
                  key={`${i}-${line.slice(0, 12)}`}
                  style={{
                    color: colors.textMuted,
                    fontFamily: 'monospace',
                    fontSize: 11,
                    marginBottom: 4,
                  }}
                >
                  {line}
                </Text>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  section: { gap: 12 },
  help: { fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  rowBtns: { flexDirection: 'row', gap: 8, marginTop: 4 },
  miniBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scanHit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
});
