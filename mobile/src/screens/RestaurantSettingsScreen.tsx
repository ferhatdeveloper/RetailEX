/**
 * Restoran ayarları hub — Gastro benzeri (masa/kat yok).
 * Firma, yazıcı, paket platformları, raporlar, entegrasyonlar.
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Building2,
  Printer,
  Bike,
  BarChart3,
  Plug,
  ChevronRight,
} from 'lucide-react-native';
import { ScreenHeader } from '../components/ScreenChrome';
import { FOOD_DELIVERY_CHANNELS } from '../config/foodDeliveryChannels';
import { getRestaurantPrinterConfig } from '../api/restaurantPrinterConfigApi';
import { useAuthStore } from '../store/authStore';
import { getBridgeBaseUrl, useConfigStore } from '../store/configStore';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'RestaurantSettings'>;

export function RestaurantSettingsScreen({ navigation }: Props) {
  const { colors } = useThemeStore();
  const user = useAuthStore((s) => s.user);
  const cfg = useConfigStore((s) => s.config);
  const bridgeBase = getBridgeBaseUrl(cfg).replace(/\/+$/, '');
  const webhookHint = `${bridgeBase}/api/delivery_order/push`;

  const [printerCount, setPrinterCount] = useState<number | null>(null);
  const [printerLoading, setPrinterLoading] = useState(false);

  const loadPrinters = useCallback(async () => {
    setPrinterLoading(true);
    try {
      const conf = await getRestaurantPrinterConfig();
      setPrinterCount(conf.printerProfiles?.length ?? 0);
    } catch {
      setPrinterCount(null);
    } finally {
      setPrinterLoading(false);
    }
  }, []);

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
        subtitle="Firma, yazıcı, paket kanalları, raporlar"
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

        <SectionTitle title="Paket platformları" />
        <View
          style={[
            styles.hintCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.hintHeader}>
            <Bike size={18} color={palette.blue600} />
            <Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>
              Desteklenen kanallar
            </Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
            Platform API anahtarları genelde iş ortağı veya aracı entegratör üzerinden verilir.
            RetailEX kanal etiketi, harici sipariş no ve webhook ile sipariş oluşturmayı destekler.
          </Text>
          {FOOD_DELIVERY_CHANNELS.map((c) => (
            <View
              key={c.id}
              style={[
                styles.channelItem,
                { borderColor: colors.cardBorder, backgroundColor: colors.backgroundAlt },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>
                {c.label}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {c.description}
              </Text>
            </View>
          ))}
          <Text style={[styles.webhookLabel, { color: colors.textMuted }]}>
            Webhook (pg_bridge)
          </Text>
          <Text
            selectable
            style={[
              styles.webhookUrl,
              { color: colors.text, backgroundColor: colors.backgroundAlt, borderColor: colors.cardBorder },
            ]}
          >
            {webhookHint}
          </Text>
          <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 6 }}>
            POST · gövdede channel, customerName, address, phone, isteğe bağlı externalOrderId
          </Text>
        </View>

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
  hintCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  hintHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  channelItem: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  webhookLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  webhookUrl: {
    fontSize: 11,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
});
