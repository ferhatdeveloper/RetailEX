/**
 * Restoran ayarları hub — Gastro benzeri (masa/kat yok).
 * Firma, yazıcı, raporlar, entegrasyonlar.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Building2,
  Printer,
  BarChart3,
  Plug,
  ChevronRight,
} from 'lucide-react-native';
import { ScreenHeader } from '../components/ScreenChrome';
import {
  getRestaurantPrinterConfig,
  saveRestaurantPrinterConfig,
  type RestaurantPrinterConfig,
  type RestaurantPrinterProfile,
} from '../api/restaurantPrinterConfigApi';
import { newUuid } from '../api/erpTables';
import { scanLanPrinters } from '../utils/lanPrinterScan';
import { PrimaryButton } from '../components/PrimaryButton';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'RestaurantSettings'>;

export function RestaurantSettingsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const user = useAuthStore((s) => s.user);

  const [printerCount, setPrinterCount] = useState<number | null>(null);
  const [printerLoading, setPrinterLoading] = useState(false);
  const [printerConfig, setPrinterConfig] = useState<RestaurantPrinterConfig | null>(null);
  const [printerScanning, setPrinterScanning] = useState(false);
  const [printerSaving, setPrinterSaving] = useState(false);
  const [printViaWindowsService, setPrintViaWindowsService] = useState<boolean>(false);
  const [windowsServiceLoading, setWindowsServiceLoading] = useState<boolean>(true);
  const [windowsServiceSaving, setWindowsServiceSaving] = useState<boolean>(false);

  const loadPrinters = useCallback(async () => {
    setPrinterLoading(true);
    try {
      const conf = await getRestaurantPrinterConfig();
      setPrinterConfig(conf);
      setPrinterCount(conf.printerProfiles?.length ?? 0);
      setPrintViaWindowsService(conf.printViaWindowsService !== false);
    } catch {
      setPrinterConfig(null);
      setPrinterCount(null);
    } finally {
      setPrinterLoading(false);
      setWindowsServiceLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrinters();
  }, [loadPrinters]);

  const onToggleWindowsService = useCallback(
    async (next: boolean) => {
      setPrintViaWindowsService(next);
      setWindowsServiceSaving(true);
      try {
        await saveRestaurantPrinterConfig({
          printerProfiles: printerConfig?.printerProfiles ?? [],
          printerRoutes: printerConfig?.printerRoutes ?? [],
          commonPrinterId: printerConfig?.commonPrinterId,
          printViaWindowsService: next,
        });
      } catch (e) {
        setPrintViaWindowsService(!next);
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert(t('alert.saveError'), msg);
      } finally {
        setWindowsServiceSaving(false);
      }
    },
    [printerConfig, t],
  );

  const networkProfiles = (printerConfig?.printerProfiles ?? []).filter(
    (p) => p.connection === 'network',
  );

  const setCommonPrinter = useCallback(
    async (profileId: string) => {
      if (!printerConfig) return;
      setPrinterSaving(true);
      try {
        const next: RestaurantPrinterConfig = {
          ...printerConfig,
          commonPrinterId: profileId,
        };
        await saveRestaurantPrinterConfig(next);
        setPrinterConfig(next);
        Alert.alert('Kaydedildi', 'Varsayılan yazıcı güncellendi.');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert('Kayıt hatası', msg);
      } finally {
        setPrinterSaving(false);
      }
    },
    [printerConfig],
  );

  const onScanAndAddPrinter = useCallback(async () => {
    setPrinterScanning(true);
    try {
      const hits = await scanLanPrinters();
      if (hits.length === 0) {
        Alert.alert('Ağ taraması', 'Açık ESC/POS portu bulunamadı (9100–9102).');
        return;
      }
      const hit = hits[0];
      const addr = `${hit.ip}:${hit.port}`;
      const base = printerConfig ?? { printerProfiles: [], printerRoutes: [] };
      const existing = base.printerProfiles.find(
        (p) =>
          p.connection === 'network' &&
          (p.address === hit.ip || p.address === addr) &&
          (p.port == null || p.port === hit.port),
      );
      if (existing) {
        await setCommonPrinter(existing.id);
        return;
      }
      const profile: RestaurantPrinterProfile = {
        id: newUuid(),
        name: `Ağ yazıcı ${addr}`,
        type: 'thermal',
        connection: 'network',
        address: hit.ip,
        port: hit.port,
        status: 'online',
      };
      const next: RestaurantPrinterConfig = {
        ...base,
        printerProfiles: [...base.printerProfiles, profile],
        commonPrinterId: profile.id,
      };
      setPrinterSaving(true);
      await saveRestaurantPrinterConfig(next);
      setPrinterConfig(next);
      setPrinterCount(next.printerProfiles.length);
      Alert.alert('Kaydedildi', `${addr} profil olarak eklendi ve varsayılan yapıldı.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Tarama hatası', msg);
    } finally {
      setPrinterScanning(false);
      setPrinterSaving(false);
    }
  }, [printerConfig, setCommonPrinter]);

  useFocusEffect(
    useCallback(() => {
      void loadPrinters();
    }, [loadPrinters]),
  );

  const firmNr = user?.firmNr || '—';
  const storeLabel = user?.storeName || user?.storeId || '—';
  const currency = user?.anaParaBirimi || '—';
  const reportCurrency = user?.raporlamaParaBirimi;

  const SectionTitle = ({ title }: { title: string }) => (
    <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
  );

  const LinkRow = ({
    label,
    hint,
    onPress,
    Icon,
    iconColor,
  }: {
    label: string;
    hint?: string;
    onPress: () => void;
    Icon: typeof Building2;
    iconColor: string;
  }) => (
    <Pressable
      onPress={onPress}
      style={[
        styles.linkRow,
        { backgroundColor: colors.card, borderColor: colors.cardBorder },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconColor + '18' }]}>
        <Icon size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{label}</Text>
        {hint ? (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
            {hint}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textSubtle} />
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Restoran ayarları"
        subtitle="Firma, yazıcı, raporlar"
        onBack={() => navigation.navigate('Restaurant', { initialTab: 'dashboard' })}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SectionTitle title="Firma bilgisi" />
        <View style={styles.cardRow}>
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Firma no</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>{firmNr}</Text>
          </View>
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Mağaza</Text>
            <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={2}>
              {storeLabel}
            </Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Para birimi</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {currency}
              {reportCurrency && reportCurrency !== currency
                ? ` · rapor ${reportCurrency}`
                : ''}
            </Text>
          </View>
          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.card, borderColor: colors.cardBorder },
            ]}
          >
            <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Dönem</Text>
            <Text style={[styles.infoValue, { color: colors.text }]}>
              {user?.periodNr || '—'}
            </Text>
          </View>
        </View>
        <LinkRow
          label="Organizasyon / firma değiştir"
          hint="Firma, dönem ve mağaza seçimi"
          Icon={Building2}
          iconColor={palette.blue600}
          onPress={() => navigation.navigate('Organization')}
        />

        <SectionTitle title="Servis / yazıcı" />
        <View
          style={[
            styles.printerCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.hintHeader}>
            <Printer size={18} color={palette.indigo500} />
            <Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>
              Restoran yazıcı profilleri
            </Text>
          </View>
          <View style={styles.settingRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                {t('printServiceLabel')}
              </Text>
              <Text style={[styles.settingHint, { color: colors.textMuted }]}>
                {t('printServiceHint')}
              </Text>
            </View>
            <Switch
              value={printViaWindowsService}
              onValueChange={(v) => void onToggleWindowsService(v)}
              disabled={windowsServiceLoading || windowsServiceSaving}
            />
          </View>
          <Text
            style={[
              styles.settingBadge,
              {
                color: printViaWindowsService ? palette.green600 : colors.textMuted,
                backgroundColor: printViaWindowsService
                  ? palette.green600 + '18'
                  : colors.backgroundAlt,
              },
            ]}
          >
            {printViaWindowsService
              ? t('printServiceBadge')
              : t('printServiceBadgeOff')}
          </Text>
          {printerLoading ? (
            <ActivityIndicator color={palette.blue600} style={{ marginVertical: 8 }} />
          ) : null}
          {!printerLoading && networkProfiles.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              Ağ yazıcı profili yok. Ağı tarayın veya yazıcı ayarlarından IP girin.
            </Text>
          ) : null}
          {networkProfiles.map((p) => {
            const port = p.port ?? 9100;
            const addr = p.address?.includes(':') ? p.address : `${p.address ?? '—'}:${port}`;
            const isDefault = printerConfig?.commonPrinterId === p.id;
            return (
              <View
                key={p.id}
                style={[
                  styles.printerProfileRow,
                  {
                    borderColor: isDefault ? palette.indigo500 : colors.cardBorder,
                    backgroundColor: colors.backgroundAlt,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                    {p.name}
                  </Text>
                  <Text
                    style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {addr}
                    {isDefault ? ' · Varsayılan' : ''}
                  </Text>
                </View>
                {!isDefault ? (
                  <Pressable
                    onPress={() => void setCommonPrinter(p.id)}
                    disabled={printerSaving}
                    style={[styles.defaultBtn, { borderColor: palette.indigo500 }]}
                  >
                    <Text style={{ color: palette.indigo600, fontWeight: '800', fontSize: 11 }}>
                      Varsayılan
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
          {printerScanning || printerSaving ? (
            <ActivityIndicator color={palette.blue600} style={{ marginTop: 4 }} />
          ) : (
            <PrimaryButton
              label="Ağı tara ve ekle"
              onPress={() => void onScanAndAddPrinter()}
              variant="ghost"
            />
          )}
        </View>
        <LinkRow
          label="Yazıcı ayarları"
          hint={
            printerLoading
              ? 'Profiller yükleniyor…'
              : printerCount == null
                ? 'Restoran yazıcı profili'
                : `${printerCount} restoran yazıcı profili`
          }
          Icon={Printer}
          iconColor={palette.indigo500}
          onPress={() => navigation.navigate('PrinterSettings')}
        />
        {printerLoading ? (
          <ActivityIndicator style={{ marginVertical: 4 }} color={palette.blue600} />
        ) : null}

        <SectionTitle title="Raporlar" />
        <LinkRow
          label="Restoran raporları"
          hint="Z raporu, iptal, ürün adedi ve daha fazlası"
          Icon={BarChart3}
          iconColor={palette.indigo600}
          onPress={() => navigation.navigate('RestaurantReports')}
        />

        <SectionTitle title="Entegrasyonlar" />
        <LinkRow
          label="Entegrasyonlar"
          hint="Logo / OpenRouter ve diğer bağlantılar"
          Icon={Plug}
          iconColor={palette.green600}
          onPress={() => navigation.navigate('Integrations')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 14, gap: 8, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginTop: 10,
    marginBottom: 2,
  },
  cardRow: { flexDirection: 'row', gap: 8 },
  infoCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 68,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  infoValue: { fontSize: 15, fontWeight: '800', marginTop: 6 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printerCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  hintHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  settingLabel: { fontSize: 13, fontWeight: '800' },
  settingHint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  settingBadge: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  printerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  defaultBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
