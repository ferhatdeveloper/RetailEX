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
import { Scale, Wifi, Bluetooth, FlaskConical, Trash2 } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemeStore } from '../store/themeStore';
import { createManualNetworkDevice, useScaleStore } from '../store/scaleStore';
import {
  bleDevBuildHint,
  createScaleTransport,
  getSimulateTransport,
  isBleNativeAvailable,
  scanBleDevices,
} from '../services/scale/scaleTransport';
import {
  fetchScaleProducts,
  scaleProductsToPluPayload,
} from '../api/scaleProductsApi';
import { palette } from '../theme/colors';
import type { ScaleDevice, ScaleTransportKind } from '../types/scale';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'ScaleManagement'>;
type TabId = 'sync' | 'devices' | 'scale' | 'settings' | 'log';

const TABS: { id: TabId; label: string }[] = [
  { id: 'sync', label: 'Senkron' },
  { id: 'devices', label: 'Cihazlar' },
  { id: 'scale', label: 'Terazi' },
  { id: 'settings', label: 'Ayarlar' },
  { id: 'log', label: 'Log' },
];

export function ScaleManagementScreen(_props: Props) {
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
  const [manualTransport, setManualTransport] = useState<ScaleTransportKind>('network');
  const [lastSyncMsg, setLastSyncMsg] = useState<string | null>(null);
  const [liveKg, setLiveKg] = useState<number | null>(null);
  const [liveStable, setLiveStable] = useState(false);
  const [liveDetail, setLiveDetail] = useState('');
  const [scanHits, setScanHits] = useState<{ id: string; name: string }[]>([]);
  const bleNative = isBleNativeAvailable();

  const selected = useMemo(() => getSelectedDevice(), [devices, settings.lastSelectedDeviceId]);

  useEffect(() => {
    if (tab !== 'scale') return;
    if (!selected || selected.transport !== 'bluetooth') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const t = createScaleTransport(selected);
        const w = await t.readLiveWeight();
        if (cancelled) return;
        setLiveKg(w.weightKg);
        setLiveStable(w.stable);
        setLiveDetail(w.detail);
      } catch {
        /* sessiz — log sekmesi için ayrı */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tab, selected?.id, selected?.transport, selected?.bluetoothAddress]);

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
        Alert.alert('Terazi', msg);
      } finally {
        setBusy(false);
      }
    },
    [busy, pushLog],
  );

  const onTestApiHint = () => {
    Alert.alert(
      'API / köprü',
      'PLU senkronu ve TCP test, oturumdaki Bridge (pg_bridge) üzerinden yapılır. Config ekranında Bridge host = PC LAN IP olmalıdır.',
    );
  };

  const onSync = () =>
    void runBusy('Ürünler yükleniyor…', async () => {
      const products = await fetchScaleProducts();
      const payload = scaleProductsToPluPayload(products);
      pushLog(`Tartı ürünü: ${products.length}`);
      const targets = devices.filter((d) => d.enabled);
      if (targets.length === 0) {
        const sim = getSimulateTransport();
        const r = await sim.sendPlu(payload);
        setLastSyncMsg(r.message);
        pushLog(r.message);
        Alert.alert('Senkron (simülasyon)', r.message);
        return;
      }
      const errors: string[] = [];
      let sent = 0;
      for (const d of targets) {
        const t = createScaleTransport(d);
        const r = await t.sendPlu(payload);
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
      Alert.alert(errors.length ? 'Kısmi senkron' : 'Senkron tamam', msg);
    });

  const onTestSelected = () =>
    void runBusy('Bağlantı test…', async () => {
      const d = selected;
      if (!d) {
        Alert.alert('Terazi', 'Önce cihaz ekleyin veya simülasyon kullanın.');
        return;
      }
      const t = createScaleTransport(d);
      const r = await t.testConnection();
      upsertDevice({
        ...d,
        status: r.ok ? 'online' : 'offline',
        lastStatus: r.message,
      });
      pushLog(`Test ${d.name}: ${r.message}`);
      Alert.alert(r.ok ? 'Test başarılı' : 'Test başarısız', r.message);
    });

  const onAddDevice = () => {
    const port = Number(manualPort) || settings.defaultPort;
    const device = createManualNetworkDevice(manualName, manualIp, port, manualTransport);
    upsertDevice(device);
    selectDevice(device.id);
    pushLog(`Cihaz eklendi: ${device.name} (${device.transport})`);
    setStatus(`Eklendi: ${device.name}`);
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

  const onBleScan = () =>
    void runBusy('BLE taranıyor…', async () => {
      if (!isBleNativeAvailable()) {
        Alert.alert('Bluetooth', bleDevBuildHint());
        return;
      }
      const hits = await scanBleDevices(8000);
      setScanHits(hits.map((h) => ({ id: h.id, name: h.name })));
      pushLog(`BLE tarama: ${hits.length} cihaz`);
      if (hits.length === 0) {
        Alert.alert('BLE', 'Cihaz bulunamadı. Tartının açık ve eşleşmeye hazır olduğundan emin olun.');
      }
    });

  const onPickScanHit = (hit: { id: string; name: string }) => {
    setManualTransport('bluetooth');
    setManualIp(hit.id);
    if (!manualName.trim()) setManualName(hit.name);
    pushLog(`BLE seçildi: ${hit.name} (${hit.id})`);
  };

  const transportChip = (
    id: ScaleTransportKind,
    label: string,
    Icon: typeof Wifi,
  ) => {
    const active = manualTransport === id;
    return (
      <Pressable
        key={id}
        onPress={() => setManualTransport(id)}
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Terazi Yönetimi"
        subtitle="Rongta · Android TeraziManager eşleniği"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map((t) => {
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
              <Text
                style={{
                  color: active ? palette.white : colors.text,
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {(busy || status) && (
        <View style={styles.statusRow}>
          {busy ? <ActivityIndicator color={palette.blue600} /> : null}
          <Text style={{ color: colors.textMuted, flex: 1, fontSize: 12 }}>{status}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.body}>
        {tab === 'sync' ? (
          <View style={styles.section}>
            <Text style={[styles.help, { color: colors.textMuted }]}>
              RetailEX tartı ürünlerini (`is_scale_product`) aktif cihazlara PLU olarak gönderir.
              TCP için pg_bridge gerekir.
            </Text>
            <PrimaryButton label="Köprü / API hakkında" onPress={onTestApiHint} variant="ghost" />
            <PrimaryButton
              label="Senkronizasyonu Başlat"
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
                <Text style={{ color: colors.text, fontWeight: '700' }}>Son senkron</Text>
                <Text style={{ color: colors.textMuted, marginTop: 6 }}>{lastSyncMsg}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'devices' ? (
          <View style={styles.section}>
            <Text style={[styles.help, { color: colors.textMuted }]}>
              Kayıtlı: {devices.length} · Aktif: {devices.filter((d) => d.enabled).length}
            </Text>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Manuel cihaz</Text>
            <View style={styles.chipRow}>
              {transportChip('network', 'TCP/LAN', Wifi)}
              {transportChip('bluetooth', 'Bluetooth', Bluetooth)}
              {transportChip('simulate', 'Simüle', FlaskConical)}
            </View>
            <FormField label="Ad" value={manualName} onChangeText={setManualName} placeholder="Terazi 1" />
            <FormField
              label={manualTransport === 'bluetooth' ? 'BT Adres' : 'IP'}
              value={manualIp}
              onChangeText={setManualIp}
              placeholder={manualTransport === 'bluetooth' ? 'AA:BB:…' : '192.168.1.87'}
              autoCapitalize="none"
            />
            {manualTransport === 'network' ? (
              <FormField
                label="Port"
                value={manualPort}
                onChangeText={setManualPort}
                keyboardType="number-pad"
              />
            ) : null}
            {manualTransport === 'bluetooth' ? (
              <>
                <Text style={[styles.help, { color: bleNative ? palette.green600 : palette.amber600 }]}>
                  {bleNative
                    ? 'BLE native hazır (development build). Tarayıp cihaz seçin veya MAC/UUID yapıştırın.'
                    : 'Expo Go Bluetooth desteklemez. Development build + react-native-ble-plx gerekir. Rongta etiket terazileri çoğunlukla TCP/LAN kullanır.'}
                </Text>
                <PrimaryButton
                  label="BLE Tara (8 sn)"
                  onPress={onBleScan}
                  loading={busy}
                  disabled={busy || !bleNative}
                  variant="ghost"
                />
                {scanHits.length > 0 ? (
                  <View
                    style={[
                      styles.card,
                      { backgroundColor: colors.card, borderColor: colors.cardBorder },
                    ]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Bulunan cihazlar</Text>
                    {scanHits.map((h) => (
                      <Pressable
                        key={h.id}
                        onPress={() => onPickScanHit(h)}
                        style={styles.scanHit}
                      >
                        <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                          {h.name}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 10 }}>{h.id.slice(-12)}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </>
            ) : null}
            <PrimaryButton label="Cihaz Ekle" onPress={onAddDevice} />
            <PrimaryButton label="Simülasyon Terazisi Ekle" onPress={onAddSimulate} variant="ghost" />

            {devices.length === 0 ? (
              <Text style={{ color: colors.textMuted, marginTop: 8 }}>Henüz terazi eklenmedi.</Text>
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
                    {d.transport === 'network'
                      ? `TCP ${d.ipAddress}:${d.port}`
                      : d.transport === 'bluetooth'
                        ? `BT ${d.bluetoothAddress || '—'}`
                        : 'Simülasyon'}
                    {' · '}
                    {d.enabled ? 'Aktif' : 'Pasif'}
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
                        {settings.lastSelectedDeviceId === d.id ? 'Seçili' : 'Seç'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => toggleDeviceEnabled(d.id)}
                      style={[styles.miniBtn, { backgroundColor: colors.background }]}
                    >
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 11 }}>
                        {d.enabled ? 'Pasif Yap' : 'Aktif Yap'}
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
                ? `Seçili: ${selected.name} (${selected.transport})`
                : 'Terazi seçilmedi — Cihazlar sekmesinden ekleyin'}
            </Text>
            {selected?.transport === 'bluetooth' ? (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Canlı BLE kg</Text>
                <Text style={{ color: colors.text, fontSize: 28, fontWeight: '900' }}>
                  {liveKg != null ? `${liveKg.toFixed(3)} kg` : '— · — — kg'}
                </Text>
                <Text style={{ color: liveStable ? palette.green600 : colors.textMuted, fontSize: 12 }}>
                  {liveStable ? 'Stabil' : 'Kararsız / bekleniyor'}
                  {liveDetail ? ` · ${liveDetail}` : ''}
                </Text>
              </View>
            ) : null}
            <PrimaryButton
              label="Bağlantıyı Test Et"
              onPress={onTestSelected}
              loading={busy}
              disabled={busy || !selected}
            />
            <PrimaryButton
              label="Satış Raporu Oku (TCP)"
              onPress={() =>
                void runBusy('Satış okunuyor…', async () => {
                  if (!selected) return;
                  const t = createScaleTransport(selected);
                  const r = await t.fetchSales();
                  pushLog(`Satış: ${r.message} (${r.records.length})`);
                  Alert.alert(
                    r.ok ? 'Satış raporu' : 'Okunamadı',
                    `${r.message}\nKayıt: ${r.records.length}`,
                  );
                })
              }
              variant="ghost"
              disabled={busy || !selected || selected.transport !== 'network'}
            />
            <PrimaryButton
              label="Canlı Tartım Oku"
              onPress={() =>
                void runBusy('Tartım…', async () => {
                  if (!selected) {
                    const w = await getSimulateTransport().connect();
                    const kg = w.weight?.weightKg;
                    pushLog(`Simüle kg: ${kg}`);
                    Alert.alert('Simüle tartım', `${kg?.toFixed(3) ?? '—'} kg`);
                    return;
                  }
                  const t = createScaleTransport(selected);
                  await t.connect();
                  const w = await t.readLiveWeight();
                  setLiveKg(w.weightKg);
                  setLiveStable(w.stable);
                  setLiveDetail(w.detail);
                  pushLog(`Tartım (${selected.transport}): ${w.weightKg?.toFixed(3) ?? 'null'} kg`);
                  Alert.alert(
                    'Tartım',
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
              label="Simüle Tartım Önizleme"
              onPress={() =>
                void runBusy('Tartım…', async () => {
                  const w = await getSimulateTransport().connect();
                  const kg = w.weight?.weightKg;
                  pushLog(`Simüle kg: ${kg}`);
                  Alert.alert('Simüle tartım', `${kg?.toFixed(3) ?? '—'} kg`);
                })
              }
              variant="ghost"
            />
          </View>
        ) : null}

        {tab === 'settings' ? (
          <View style={styles.section}>
            <FormField
              label="Varsayılan TCP Port"
              value={String(settings.defaultPort)}
              onChangeText={(t) =>
                updateSettings({ defaultPort: Number(t.replace(/\D/g, '')) || 5001 })
              }
              keyboardType="number-pad"
            />
            <View style={styles.switchRow}>
              <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>
                Tartılı satışta simüle tartımı tercih et
              </Text>
              <Switch
                value={settings.preferSimulateWeigh}
                onValueChange={(v) => updateSettings({ preferSimulateWeigh: v })}
              />
            </View>
            <Text style={[styles.help, { color: colors.textMuted }]}>
              Bluetooth: react-native-ble-plx + development build (Expo Go çalışmaz). BLE native:{' '}
              {bleNative ? 'açık' : 'kapalı'}. Klasik Rongta: TCP/LAN + USB (Android native); USB bu
              RN sürümünde yok. Ayrıntı: README → Terazi BLE.
            </Text>
          </View>
        ) : null}

        {tab === 'log' ? (
          <View style={styles.section}>
            <PrimaryButton label="Log Temizle" onPress={clearLogs} variant="ghost" />
            {logs.length === 0 ? (
              <Text style={{ color: colors.textMuted }}>Log boş</Text>
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
  tabRow: { paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
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
