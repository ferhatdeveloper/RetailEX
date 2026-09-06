import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Printer, Wifi, Bluetooth, Smartphone, Server, ChevronRight, Settings2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemeStore } from '../store/themeStore';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { printerTransportStatus, testPrintReceipt, listWindowsServicePrinters } from '../services/printerService';
import type { WindowsPrinterInfo } from '../services/escpos/windowsServiceTransport';
import { scanLanPrinters, type DiscoveredPrinter } from '../utils/lanPrinterScan';
import {
  type PrinterInterface,
  type ReceiptLangCode,
  type ReceiptPaperSize,
  type TestPrintResult,
} from '../types/printerSettings';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'PrinterSettings'>;

const PAPER_OPTIONS: ReceiptPaperSize[] = ['58mm', '80mm', 'A5', 'A4'];

const LANG_LABEL_KEYS: Record<
  ReceiptLangCode,
  'langTr' | 'langEn' | 'langAr' | 'langKu' | 'langUz'
> = {
  tr: 'langTr',
  en: 'langEn',
  ar: 'langAr',
  ku: 'langKu',
  uz: 'langUz',
};

function resolvePrintMessage(
  result: TestPrintResult,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (result.code) {
    const key = `printerSettings.errors.${result.code}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return result.message;
}

export function PrinterSettingsScreen(props: Props) {
  const { t } = useTranslation();
  const { colors, darkMode } = useThemeStore();
  const settings = usePrinterSettingsStore((s) => s.settings);
  const setSettings = usePrinterSettingsStore((s) => s.setSettings);
  const resetSettings = usePrinterSettingsStore((s) => s.resetSettings);

  const [testing, setTesting] = useState(false);
  const [lastPreview, setLastPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{
    done: number;
    total: number;
    found: number;
    currentHost?: string;
  } | null>(null);
  const [scanHits, setScanHits] = useState<DiscoveredPrinter[]>([]);
  const [windowsPrinters, setWindowsPrinters] = useState<WindowsPrinterInfo[]>([]);
  const [windowsListing, setWindowsListing] = useState(false);
  const [windowsListError, setWindowsListError] = useState<string | null>(null);

  const transport = useMemo(() => printerTransportStatus(), []);

  const interfaceOptions = useMemo(
    (): { id: PrinterInterface; label: string; Icon: typeof Wifi }[] => [
      { id: 'network', label: t('printerSettings.interfaceNetwork'), Icon: Wifi },
      { id: 'bluetooth', label: t('printerSettings.interfaceBluetooth'), Icon: Bluetooth },
      { id: 'system', label: t('printerSettings.interfaceSystem'), Icon: Smartphone },
      { id: 'windows-service', label: t('printerSettings.interfaceWindowsService'), Icon: Server },
    ],
    [t],
  );

  const langOptions = useMemo(
    () =>
      (Object.keys(LANG_LABEL_KEYS) as ReceiptLangCode[]).map((code) => ({
        code,
        label: t(LANG_LABEL_KEYS[code]),
      })),
    [t],
  );

  const onTestPrint = useCallback(async () => {
    setTesting(true);
    setLastPreview(null);
    try {
      const result = await testPrintReceipt(settings);
      if (result.preview) setLastPreview(result.preview);
      const msg = resolvePrintMessage(result, t);
      Alert.alert(
        result.ok ? t('printerSettings.testPrintOk') : t('printerSettings.testPrintFail'),
        msg,
      );
    } finally {
      setTesting(false);
    }
  }, [settings, t]);

  const networkCarrier = transport.network.nativeTcp
    ? t('printerSettings.transportCarrierBoth')
    : t('printerSettings.transportCarrierBridge');

  const defaultPrinterLabel =
    settings.interface === 'network' && settings.ipAddress?.trim()
      ? `${settings.ipAddress.trim()}:${settings.port ?? 9100}`
      : null;

  const onLanScan = useCallback(async () => {
    setScanning(true);
    setScanHits([]);
    setScanProgress({ done: 0, total: 0, found: 0 });
    try {
      const hits = await scanLanPrinters({
        hintHost: settings.ipAddress?.trim() || undefined,
        onProgress: (p) =>
          setScanProgress({
            done: p.done,
            total: p.total,
            found: p.found,
            currentHost: p.currentHost,
          }),
      });
      setScanHits(hits);
      if (hits.length === 0) {
        Alert.alert(t('printerSettings.scanLanDone'), t('printerSettings.scanLanEmpty'));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('printerSettings.testPrintFail'), msg);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }, [settings.ipAddress, t]);

  const onPickPrinterHit = useCallback(
    (hit: DiscoveredPrinter) => {
      setSettings({ interface: 'network', ipAddress: hit.ip, port: hit.port });
      Alert.alert(
        t('printerSettings.defaultPrinterTitle'),
        t('printerSettings.defaultPrinterSet', { address: `${hit.ip}:${hit.port}` }),
      );
    },
    [setSettings, t],
  );

  const onListWindowsPrinters = useCallback(async () => {
    const url = settings.windowsServiceUrl?.trim();
    if (!url) {
      Alert.alert(t('printerSettings.testPrintFail'), t('printerSettings.errors.windowsInvalidUrl'));
      return;
    }
    setWindowsListing(true);
    setWindowsListError(null);
    try {
      const res = await listWindowsServicePrinters(url, settings.windowsServiceApiKey);
      if (res.ok) {
        setWindowsPrinters(res.printers);
        if (res.printers.length === 0) {
          setWindowsListError(t('printerSettings.windowsPrinterListEmpty'));
        }
      } else {
        setWindowsPrinters([]);
        setWindowsListError(
          t('printerSettings.windowsPrinterListError', {
            message: res.message ?? t('printerSettings.windowsPrinterListEmpty'),
          }),
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setWindowsPrinters([]);
      setWindowsListError(t('printerSettings.windowsPrinterListError', { message: msg }));
    } finally {
      setWindowsListing(false);
    }
  }, [settings.windowsServiceUrl, settings.windowsServiceApiKey, t]);

  const onPickWindowsPrinter = useCallback(
    (printer: WindowsPrinterInfo) => {
      setSettings({ windowsPrinterName: printer.name });
    },
    [setSettings],
  );

  const onReset = () => {
    Alert.alert(t('printerSettings.resetConfirmTitle'), t('printerSettings.resetConfirmBody'), [
      { text: t('alert.cancel'), style: 'cancel' },
      {
        text: t('alert.reset'),
        style: 'destructive',
        onPress: () => {
          resetSettings();
          setLastPreview(null);
          Alert.alert(t('alert.saved'), t('printerSettings.resetDone'));
        },
      },
    ]);
  };

  const ChipRow = <T extends string>({
    options,
    value,
    onSelect,
    accent = palette.blue600,
  }: {
    options: { id: T; label: string; Icon?: typeof Wifi }[];
    value: T;
    onSelect: (v: T) => void;
    accent?: string;
  }) => (
    <View style={styles.chipRow}>
      {options.map(({ id, label, Icon }) => {
        const active = value === id;
        return (
          <Pressable
            key={id}
            onPress={() => onSelect(id)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? accent : colors.card,
                borderColor: active ? accent : colors.cardBorder,
              },
            ]}
          >
            {Icon ? (
              <Icon size={14} color={active ? palette.white : colors.textMuted} />
            ) : null}
            <Text
              style={{
                color: active ? palette.white : colors.text,
                fontSize: 11,
                fontWeight: '700',
                textAlign: 'center',
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const TransportBox = ({
    title,
    body,
    accentDark,
    accentLight,
  }: {
    title: string;
    body: string;
    accentDark: string;
    accentLight: string;
  }) => (
    <View
      style={[
        styles.stubBox,
        {
          borderColor: darkMode ? accentDark : accentLight,
          backgroundColor: darkMode ? `${accentDark}40` : `${accentLight}18`,
        },
      ]}
    >
      <Text
        style={{
          color: darkMode ? accentLight : accentDark,
          fontSize: 12,
          fontWeight: '700',
        }}
      >
        {title}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
        {body}
      </Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t('printerSettings.title')} subtitle={t('printerSettings.subtitle')} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* ── Yönetim — Windows servisi genel geçişi link kartı ───── */}
        <Pressable
          onPress={() => props.navigation.navigate('PrinterManagement')}
          style={[
            styles.card,
            styles.managementCard,
            {
              backgroundColor: darkMode ? '#1e3a8a40' : '#dbeafe',
              borderColor: darkMode ? '#1d4ed8' : '#3b82f6',
            },
          ]}
          accessibilityRole="button"
        >
          <View style={styles.managementIconBox}>
            <Settings2 size={18} color={palette.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: darkMode ? '#bfdbfe' : '#1d4ed8',
                fontSize: 13,
                fontWeight: '800',
              }}
            >
              {t('printerManagement.menuLabel')}
            </Text>
            <Text
              style={{
                color: darkMode ? '#93c5fd' : '#1e40af',
                fontSize: 11,
                marginTop: 2,
                lineHeight: 16,
              }}
            >
              {settings.useWindowsServiceGlobal === true
                ? t('printerManagement.bannerOn')
                : t('printerManagement.bannerOff')}
            </Text>
          </View>
          <ChevronRight size={18} color={darkMode ? '#93c5fd' : '#1d4ed8'} />
        </Pressable>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Printer size={20} color={palette.blue600} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('printerSettings.printer')}</Text>
          </View>
          <View style={styles.switchRow}>
            <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>
              {t('printerSettings.enabled')}
            </Text>
            <Switch
              value={settings.enabled}
              onValueChange={(v) => setSettings({ enabled: v })}
              trackColor={{ false: palette.gray400, true: palette.blue400 }}
              thumbColor={settings.enabled ? palette.blue600 : palette.gray100}
            />
          </View>
          <Text style={[styles.hint, { color: colors.textSubtle }]}>{t('printerSettings.enabledHint')}</Text>

          <Text style={[styles.sec, { color: colors.textMuted }]}>{t('printerSettings.connectionType')}</Text>
          <ChipRow
            options={interfaceOptions}
            value={settings.interface}
            onSelect={(iface) => setSettings({ interface: iface })}
          />

          {settings.interface === 'network' ? (
            <>
              {defaultPrinterLabel ? (
                <View
                  style={[
                    styles.defaultPrinterBox,
                    {
                      borderColor: colors.cardBorder,
                      backgroundColor: darkMode ? palette.gray900 : palette.gray50,
                    },
                  ]}
                >
                  <Text style={[styles.sec, { color: colors.textMuted, marginTop: 0 }]}>
                    {t('printerSettings.defaultPrinterTitle')}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14, marginTop: 4 }}>
                    {defaultPrinterLabel}
                  </Text>
                </View>
              ) : null}
              <FormField
                label={t('printerSettings.printerIp')}
                value={settings.ipAddress ?? ''}
                onChangeText={(v) => setSettings({ ipAddress: v })}
                autoCapitalize="none"
                placeholder="192.168.1.100"
              />
              <FormField
                label={t('printerSettings.port')}
                value={String(settings.port ?? 9100)}
                onChangeText={(v) =>
                  setSettings({ port: parseInt(v.replace(/\D/g, ''), 10) || 9100 })
                }
                keyboardType="number-pad"
              />
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                {t('printerSettings.networkHint', { port: settings.port ?? 9100 })}
              </Text>
              {scanning ? (
                <View style={styles.scanProgressRow}>
                  <ActivityIndicator color={palette.blue600} />
                  <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
                    {scanProgress && scanProgress.total > 0
                      ? t('printerSettings.scanLanProgress', {
                          done: scanProgress.done,
                          total: scanProgress.total,
                          found: scanProgress.found,
                        })
                      : t('printerSettings.scanLanBusy')}
                    {scanProgress?.currentHost ? ` · ${scanProgress.currentHost}` : ''}
                  </Text>
                </View>
              ) : (
                <PrimaryButton
                  label={t('printerSettings.scanLan')}
                  onPress={() => void onLanScan()}
                  variant="ghost"
                />
              )}
              {scanHits.length > 0 ? (
                <View style={styles.scanHits}>
                  <Text style={[styles.sec, { color: colors.textMuted, marginTop: 0 }]}>
                    {t('printerSettings.scanLanFound', { count: scanHits.length })}
                  </Text>
                  {scanHits.map((hit) => {
                    const addr = `${hit.ip}:${hit.port}`;
                    const selected =
                      settings.ipAddress?.trim() === hit.ip && (settings.port ?? 9100) === hit.port;
                    return (
                      <Pressable
                        key={addr}
                        onPress={() => onPickPrinterHit(hit)}
                        style={[
                          styles.scanHitRow,
                          {
                            borderColor: selected ? palette.blue600 : colors.cardBorder,
                            backgroundColor: selected
                              ? darkMode
                                ? `${palette.blue600}30`
                                : `${palette.blue600}12`
                              : colors.backgroundAlt,
                          },
                        ]}
                      >
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                          {addr}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                          {t('printerSettings.scanLanResponseMs', { ms: hit.responseMs })}
                          {selected ? ` · ${t('printerSettings.defaultPrinterTitle')}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}

          {settings.interface === 'bluetooth' ? (
            <FormField
              label={t('printerSettings.bluetoothDeviceName')}
              value={settings.bluetoothDeviceName ?? ''}
              onChangeText={(v) => setSettings({ bluetoothDeviceName: v })}
              placeholder={t('printerSettings.bluetoothPlaceholder')}
            />
          ) : null}

          {settings.interface === 'system' ? (
            <Text style={[styles.hint, { color: colors.textSubtle }]}>{t('printerSettings.systemHint')}</Text>
          ) : null}

          {settings.interface === 'windows-service' ? (
            <>
              <FormField
                label={t('printerSettings.windowsServiceUrl')}
                value={settings.windowsServiceUrl ?? ''}
                onChangeText={(v) => setSettings({ windowsServiceUrl: v })}
                autoCapitalize="none"
                placeholder="http://192.168.1.50:9105"
              />
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                {t('printerSettings.windowsServiceUrlHint')}
              </Text>
              <FormField
                label={t('printerSettings.windowsPrinterName')}
                value={settings.windowsPrinterName ?? ''}
                onChangeText={(v) => setSettings({ windowsPrinterName: v })}
                placeholder="Microsoft Print to PDF"
              />
              <FormField
                label={t('printerSettings.windowsServiceApiKey')}
                value={settings.windowsServiceApiKey ?? ''}
                onChangeText={(v) => setSettings({ windowsServiceApiKey: v })}
                autoCapitalize="none"
              />
              {windowsListing ? (
                <View style={styles.scanProgressRow}>
                  <ActivityIndicator color={palette.blue600} />
                  <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
                    {t('printerSettings.windowsPrinterListButton')}…
                  </Text>
                </View>
              ) : (
                <PrimaryButton
                  label={t('printerSettings.windowsPrinterListButton')}
                  onPress={() => void onListWindowsPrinters()}
                  variant="ghost"
                />
              )}
              {windowsListError ? (
                <Text style={[styles.hint, { color: colors.textSubtle }]}>{windowsListError}</Text>
              ) : null}
              {windowsPrinters.length > 0 ? (
                <View style={styles.scanHits}>
                  <Text style={[styles.sec, { color: colors.textMuted, marginTop: 0 }]}>
                    {t('printerSettings.scanLanFound', { count: windowsPrinters.length })}
                  </Text>
                  {windowsPrinters.map((p) => {
                    const selected = settings.windowsPrinterName === p.name;
                    return (
                      <Pressable
                        key={p.name}
                        onPress={() => onPickWindowsPrinter(p)}
                        style={[
                          styles.scanHitRow,
                          {
                            borderColor: selected ? palette.blue600 : colors.cardBorder,
                            backgroundColor: selected
                              ? darkMode
                                ? `${palette.blue600}30`
                                : `${palette.blue600}12`
                              : colors.backgroundAlt,
                          },
                        ]}
                      >
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                          {p.name}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                          {p.isDefault ? 'varsayılan · ' : ''}
                          {p.status ? `durum: ${p.status}` : ''}
                          {selected ? ` · ${t('printerSettings.defaultPrinterTitle')}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : null}

          <Text style={[styles.sec, { color: colors.textMuted }]}>{t('printerSettings.paperSize')}</Text>
          <View style={styles.chipRow}>
            {PAPER_OPTIONS.map((ps) => {
              const active = settings.paperSize === ps;
              return (
                <Pressable
                  key={ps}
                  onPress={() => setSettings({ paperSize: ps })}
                  style={[
                    styles.chip,
                    styles.chipSm,
                    {
                      backgroundColor: active ? palette.indigo600 : colors.card,
                      borderColor: active ? palette.indigo600 : colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? palette.white : colors.text,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {ps}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{t('printerSettings.autoPrint')}</Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 2 }}>
                {t('printerSettings.autoPrintHint')}
              </Text>
            </View>
            <Switch
              value={settings.autoPrint}
              onValueChange={(v) => setSettings({ autoPrint: v })}
              trackColor={{ false: palette.gray400, true: palette.blue400 }}
              thumbColor={settings.autoPrint ? palette.blue600 : palette.gray100}
            />
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{t('printerSettings.receiptHeader')}</Text>
          <Text style={[styles.hint, { color: colors.textSubtle, marginBottom: 8 }]}>
            {t('printerSettings.receiptHeaderHint')}
          </Text>
          <FormField
            label={t('printerSettings.companyName')}
            value={settings.companyName ?? ''}
            onChangeText={(v) => setSettings({ companyName: v })}
            placeholder={t('printerSettings.companyNamePlaceholder')}
          />
          <FormField
            label={t('printerSettings.companyPhone')}
            value={settings.companyPhone ?? ''}
            onChangeText={(v) => setSettings({ companyPhone: v })}
            keyboardType="phone-pad"
            placeholder={t('printerSettings.companyPhonePlaceholder')}
          />

          <Text style={[styles.sec, { color: colors.textMuted }]}>{t('printerSettings.defaultReceiptLang')}</Text>
          <View style={styles.langGrid}>
            {langOptions.map(({ code, label }) => {
              const active = settings.defaultLanguage === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setSettings({ defaultLanguage: code })}
                  style={[
                    styles.langChip,
                    {
                      backgroundColor: active ? palette.blue600 : colors.card,
                      borderColor: active ? palette.blue600 : colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? palette.white : colors.text,
                      fontSize: 12,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TransportBox
          title={t('printerSettings.transportNetworkTitle')}
          body={t('printerSettings.transportNetworkBody', { carrier: networkCarrier })}
          accentDark="#1d4ed8"
          accentLight="#bfdbfe"
        />
        <TransportBox
          title={t('printerSettings.transportBluetoothTitle')}
          body={t('printerSettings.transportBluetoothBody', { status: transport.bluetooth.hint })}
          accentDark="#7c3aed"
          accentLight="#ddd6fe"
        />
        <TransportBox
          title={t('printerSettings.transportSystemTitle')}
          body={t('printerSettings.transportSystemBody', { status: transport.system.hint })}
          accentDark="#047857"
          accentLight="#a7f3d0"
        />
        <TransportBox
          title={t('printerSettings.transportWindowsServiceTitle')}
          body={t('printerSettings.transportWindowsServiceBody', { status: transport.windowsService.hint })}
          accentDark="#b45309"
          accentLight="#fde68a"
        />

        {testing ? (
          <ActivityIndicator color={palette.blue600} style={{ marginVertical: 8 }} />
        ) : (
          <PrimaryButton label={t('printerSettings.testPrint')} onPress={() => void onTestPrint()} />
        )}

        {lastPreview ? (
          <View
            style={[
              styles.preview,
              {
                backgroundColor: darkMode ? palette.gray900 : palette.gray50,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text style={[styles.previewLabel, { color: colors.textMuted }]}>
              {t('printerSettings.lastPreview')}
            </Text>
            <Text style={[styles.previewMono, { color: colors.text }]}>{lastPreview}</Text>
          </View>
        ) : null}

        <PrimaryButton
          label={t('printerSettings.savedAuto')}
          onPress={() => Alert.alert(t('alert.saved'), t('printerSettings.savedAutoHint'))}
          variant="ghost"
        />
        <PrimaryButton label={t('printerSettings.resetDefaults')} onPress={onReset} variant="ghost" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, paddingBottom: 48, gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  managementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  managementIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.blue600,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  sec: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  hint: { fontSize: 11, lineHeight: 16 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flex: 1,
    minWidth: '28%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  chipSm: { minWidth: '22%' },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langChip: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  stubBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  preview: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  previewLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  previewMono: {
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
  },
  defaultPrinterBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  scanProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  scanHits: { gap: 8 },
  scanHitRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
