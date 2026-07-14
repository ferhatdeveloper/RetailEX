import React, { useCallback, useState } from 'react';
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
import { Printer, Wifi, Bluetooth, Smartphone } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemeStore } from '../store/themeStore';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { testPrintReceipt } from '../services/printerService';
import { escposTransportStatus } from '../services/escpos/escposTcpTransport';
import {
  type PrinterInterface,
  type ReceiptLangCode,
  type ReceiptPaperSize,
} from '../types/printerSettings';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'PrinterSettings'>;

const INTERFACE_OPTIONS: { id: PrinterInterface; label: string; Icon: typeof Wifi }[] = [
  { id: 'network', label: 'Ağ (IP)', Icon: Wifi },
  { id: 'bluetooth', label: 'Bluetooth', Icon: Bluetooth },
  { id: 'system', label: 'Sistem', Icon: Smartphone },
];

const PAPER_OPTIONS: ReceiptPaperSize[] = ['58mm', '80mm', 'A5', 'A4'];

const LANG_OPTIONS: { code: ReceiptLangCode; label: string }[] = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'ku', label: 'Kurdî' },
];

export function PrinterSettingsScreen(_props: Props) {
  const { colors, darkMode } = useThemeStore();
  const settings = usePrinterSettingsStore((s) => s.settings);
  const setSettings = usePrinterSettingsStore((s) => s.setSettings);
  const resetSettings = usePrinterSettingsStore((s) => s.resetSettings);

  const [testing, setTesting] = useState(false);
  const [lastPreview, setLastPreview] = useState<string | null>(null);

  const onTestPrint = useCallback(async () => {
    setTesting(true);
    setLastPreview(null);
    try {
      const result = await testPrintReceipt(settings);
      if (result.preview) setLastPreview(result.preview);
      Alert.alert(result.ok ? 'Test yazdırma' : 'Yazdırılamadı', result.message);
    } finally {
      setTesting(false);
    }
  }, [settings]);

  const onReset = () => {
    Alert.alert('Varsayılana dön', 'Tüm yazıcı/fiş ayarları sıfırlansın mı?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sıfırla',
        style: 'destructive',
        onPress: () => {
          resetSettings();
          setLastPreview(null);
          Alert.alert('Kaydedildi', 'Varsayılan ayarlar yüklendi.');
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Yazıcı / Fiş Ayarları"
        subtitle="Ağ ESC/POS · köprü veya doğrudan TCP"
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.cardHeader}>
            <Printer size={20} color={palette.blue600} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Yazıcı</Text>
          </View>
          <View style={styles.switchRow}>
            <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>Yazıcı aktif</Text>
            <Switch
              value={settings.enabled}
              onValueChange={(v) => setSettings({ enabled: v })}
              trackColor={{ false: palette.gray400, true: palette.blue400 }}
              thumbColor={settings.enabled ? palette.blue600 : palette.gray100}
            />
          </View>
          <Text style={[styles.hint, { color: colors.textSubtle }]}>
            Kapalıyken POS fiş kaydı yapılır; yazdırma atlanır.
          </Text>

          <Text style={[styles.sec, { color: colors.textMuted }]}>Bağlantı tipi</Text>
          <ChipRow
            options={INTERFACE_OPTIONS}
            value={settings.interface}
            onSelect={(iface) => setSettings({ interface: iface })}
          />

          {settings.interface === 'network' ? (
            <>
              <FormField
                label="Yazıcı IP"
                value={settings.ipAddress ?? ''}
                onChangeText={(v) => setSettings({ ipAddress: v })}
                autoCapitalize="none"
                placeholder="192.168.1.100"
              />
              <FormField
                label="Port"
                value={String(settings.port ?? 9100)}
                onChangeText={(v) =>
                  setSettings({ port: parseInt(v.replace(/\D/g, ''), 10) || 9100 })
                }
                keyboardType="number-pad"
              />
              <Text style={[styles.hint, { color: colors.textSubtle }]}>
                ESC/POS ham TCP (port {settings.port ?? 9100}). Önce pg_bridge köprüsü; development build’de
                doğrudan TCP de denenir.
              </Text>
            </>
          ) : null}

          {settings.interface === 'bluetooth' ? (
            <FormField
              label="Bluetooth cihaz adı"
              value={settings.bluetoothDeviceName ?? ''}
              onChangeText={(v) => setSettings({ bluetoothDeviceName: v })}
              placeholder="Örn: RPP02N"
            />
          ) : null}

          {settings.interface === 'system' ? (
            <Text style={[styles.hint, { color: colors.textSubtle }]}>
              Android/iOS paylaşım menüsü veya sistem varsayılanı (gerçek entegrasyon Faz 2+).
            </Text>
          ) : null}

          <Text style={[styles.sec, { color: colors.textMuted }]}>Kağıt boyutu</Text>
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
              <Text style={{ color: colors.text, fontWeight: '700' }}>Otomatik yazdır</Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 2 }}>
                Fiş kaydından sonra (ağ ESC/POS)
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
          <Text style={[styles.cardTitle, { color: colors.text }]}>Fiş / üst bilgi</Text>
          <Text style={[styles.hint, { color: colors.textSubtle, marginBottom: 8 }]}>
            PG bağlantısı yoksa bu yerel bilgiler test fişinde kullanılır. Tam firma logosu masaüstü
            Sistem → Fiş / Firma Bilgisi’nden yönetilir.
          </Text>
          <FormField
            label="Firma adı (yerel)"
            value={settings.companyName ?? ''}
            onChangeText={(v) => setSettings({ companyName: v })}
            placeholder="Mağaza adı"
          />
          <FormField
            label="Telefon (yerel)"
            value={settings.companyPhone ?? ''}
            onChangeText={(v) => setSettings({ companyPhone: v })}
            keyboardType="phone-pad"
            placeholder="+90 …"
          />

          <Text style={[styles.sec, { color: colors.textMuted }]}>Varsayılan fiş dili</Text>
          <View style={styles.langGrid}>
            {LANG_OPTIONS.map(({ code, label }) => {
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

        <View
          style={[
            styles.stubBox,
            {
              borderColor: darkMode ? '#1d4ed8' : '#bfdbfe',
              backgroundColor: darkMode ? 'rgba(30,58,138,0.25)' : 'rgba(239,246,255,0.95)',
            },
          ]}
        >
          <Text
            style={{
              color: darkMode ? '#93c5fd' : '#1e40af',
              fontSize: 12,
              fontWeight: '700',
            }}
          >
            Ağ yazdırma (ESC/POS TCP)
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
            «Ağ (IP)» seçiliyken test fişi ham ESC/POS olarak yazıcıya gönderilir. Taşıyıcı:{' '}
            {escposTransportStatus().nativeTcp
              ? 'köprü veya doğrudan TCP'
              : 'pg_bridge köprüsü (PC’de npm run bridge)'}
            . Bluetooth ve sistem yazıcısı Faz 2+.
          </Text>
        </View>

        {testing ? (
          <ActivityIndicator color={palette.blue600} style={{ marginVertical: 8 }} />
        ) : (
          <PrimaryButton label="Test yazdır" onPress={() => void onTestPrint()} />
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
            <Text style={[styles.previewLabel, { color: colors.textMuted }]}>Son test önizlemesi</Text>
            <Text style={[styles.previewMono, { color: colors.text }]}>{lastPreview}</Text>
          </View>
        ) : null}

        <PrimaryButton
          label="Ayarlar kaydedildi (otomatik)"
          onPress={() => Alert.alert('Kayıt', 'Ayarlar cihazda saklanıyor (AsyncStorage).')}
          variant="ghost"
        />
        <PrimaryButton label="Varsayılana dön" onPress={onReset} variant="ghost" />
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
});
