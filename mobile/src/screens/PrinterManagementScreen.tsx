import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  Pressable,
  Alert,
} from 'react-native';
import { Server, Printer, Languages, Utensils, Receipt, FileText, ListOrdered, AlertCircle } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader } from '../components/ScreenChrome';
import { useThemeStore } from '../store/themeStore';
import { usePrinterSettingsStore } from '../store/printerSettingsStore';
import { palette } from '../theme/colors';
import type { ReceiptLangCode } from '../types/printerSettings';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'PrinterManagement'>;

const LANG_OPTIONS: Array<{ code: ReceiptLangCode; key: string }> = [
  { code: 'tr', key: 'langTr' },
  { code: 'en', key: 'langEn' },
  { code: 'ar', key: 'langAr' },
  { code: 'ku', key: 'langKu' },
  { code: 'uz', key: 'langUz' },
];

type ReceiptKind = {
  id: 'kitchen_ticket' | 'pos_receipt' | 'account_receipt' | 'invoice';
  key: string;
  Icon: typeof Utensils;
  accentDark: string;
  accentLight: string;
};

const RECEIPT_KINDS: ReceiptKind[] = [
  {
    id: 'kitchen_ticket',
    key: 'printerManagement.kindKitchenTicket',
    Icon: Utensils,
    accentDark: '#b45309',
    accentLight: '#fde68a',
  },
  {
    id: 'pos_receipt',
    key: 'printerManagement.kindPosReceipt',
    Icon: Receipt,
    accentDark: '#1d4ed8',
    accentLight: '#bfdbfe',
  },
  {
    id: 'account_receipt',
    key: 'printerManagement.kindAccountReceipt',
    Icon: ListOrdered,
    accentDark: '#047857',
    accentLight: '#a7f3d0',
  },
  {
    id: 'invoice',
    key: 'printerManagement.kindInvoice',
    Icon: FileText,
    accentDark: '#7c3aed',
    accentLight: '#ddd6fe',
  },
];

export function PrinterManagementScreen(_props: Props) {
  const { t } = useTranslation();
  const { colors, darkMode } = useThemeStore();
  const settings = usePrinterSettingsStore((s) => s.settings);
  const setSettings = usePrinterSettingsStore((s) => s.setSettings);
  const setUseWindowsServiceGlobal = usePrinterSettingsStore((s) => s.setUseWindowsServiceGlobal);
  const setDefaultLanguage = usePrinterSettingsStore((s) => s.setDefaultLanguage);

  const useGlobal = settings.useWindowsServiceGlobal === true;
  const hasServiceUrl = !!settings.windowsServiceUrl?.trim();
  const flags = useMemo(
    () => ({
      kitchen_ticket: settings.kitchenTicketWindowsService === true,
      pos_receipt: settings.posReceiptWindowsService === true,
      account_receipt: settings.accountReceiptWindowsService === true,
      invoice: settings.invoiceWindowsService === true,
    }),
    [
      settings.kitchenTicketWindowsService,
      settings.posReceiptWindowsService,
      settings.accountReceiptWindowsService,
      settings.invoiceWindowsService,
    ],
  );

  const onToggleGlobal = (next: boolean) => {
    if (next && !hasServiceUrl) {
      Alert.alert(
        t('printerManagement.globalServiceTitle'),
        t('printerManagement.serviceUrlMissing'),
      );
      // Yine de kullanıcıya açma şansı ver — sadece uyarıyoruz.
    }
    setUseWindowsServiceGlobal(next);
  };

  const onToggleKind = (kind: ReceiptKind['id'], next: boolean) => {
    setSettings(
      kind === 'kitchen_ticket'
        ? { kitchenTicketWindowsService: next }
        : kind === 'pos_receipt'
          ? { posReceiptWindowsService: next }
          : kind === 'account_receipt'
            ? { accountReceiptWindowsService: next }
            : { invoiceWindowsService: next },
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t('printerManagement.title')}
        subtitle={t('printerManagement.subtitle')}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* ── Sistem — Windows servisi genel geçişi ───────────────── */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.cardHeader}>
            <Server size={20} color={palette.blue600} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {t('printerManagement.systemTitle')}
            </Text>
          </View>
          <Text style={[styles.hint, { color: colors.textSubtle }]}>
            {t('printerManagement.systemHint')}
          </Text>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {t('printerManagement.globalServiceLabel')}
              </Text>
              <Text
                style={{
                  color: colors.textSubtle,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                {useGlobal
                  ? t('printerManagement.globalServiceOn')
                  : t('printerManagement.globalServiceOff')}
              </Text>
            </View>
            <Switch
              value={useGlobal}
              onValueChange={onToggleGlobal}
              trackColor={{ false: palette.gray400, true: palette.blue400 }}
              thumbColor={useGlobal ? palette.blue600 : palette.gray100}
            />
          </View>

          {!hasServiceUrl ? (
            <View
              style={[
                styles.warnBox,
                {
                  borderColor: darkMode ? '#b45309' : '#fbbf24',
                  backgroundColor: darkMode ? '#78350f40' : '#fef3c7',
                },
              ]}
            >
              <AlertCircle
                size={14}
                color={darkMode ? '#fbbf24' : '#b45309'}
              />
              <Text
                style={{
                  color: darkMode ? '#fbbf24' : '#92400e',
                  fontSize: 11,
                  lineHeight: 16,
                  flex: 1,
                }}
              >
                {t('printerManagement.serviceUrlMissingHint')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Fiş türü yönlendirmesi ─────────────────────────────── */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.cardHeader}>
            <Printer size={20} color={palette.indigo600} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {t('printerManagement.routingTitle')}
            </Text>
          </View>
          <Text style={[styles.hint, { color: colors.textSubtle }]}>
            {t('printerManagement.routingHint')}
          </Text>

          <View style={styles.kindList}>
            {RECEIPT_KINDS.map((kind) => {
              const enabled = useGlobal && flags[kind.id];
              const accentDark = kind.accentDark;
              const accentLight = kind.accentLight;
              const Icon = kind.Icon;
              return (
                <View
                  key={kind.id}
                  style={[
                    styles.kindRow,
                    {
                      borderColor: enabled ? accentDark : colors.cardBorder,
                      backgroundColor: enabled
                        ? darkMode
                          ? `${accentDark}30`
                          : `${accentLight}80`
                        : darkMode
                          ? palette.gray900
                          : palette.gray50,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.kindIconBox,
                      {
                        backgroundColor: enabled ? accentDark : colors.card,
                      },
                    ]}
                  >
                    <Icon size={18} color={enabled ? palette.white : colors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontWeight: '700',
                        fontSize: 13,
                      }}
                    >
                      {t(kind.key)}
                    </Text>
                    <Text
                      style={{
                        color: colors.textSubtle,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {enabled
                        ? t('printerManagement.kindRoutedWindows')
                        : t('printerManagement.kindRoutedDefault')}
                    </Text>
                  </View>
                  <Switch
                    value={flags[kind.id]}
                    disabled={!useGlobal}
                    onValueChange={(v) => onToggleKind(kind.id, v)}
                    trackColor={{ false: palette.gray400, true: palette.blue400 }}
                    thumbColor={
                      flags[kind.id] && useGlobal ? palette.blue600 : palette.gray100
                    }
                  />
                </View>
              );
            })}
          </View>
        </View>

        {/* ── Sistem dili / varsayılan fiş dili ─────────────────── */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <View style={styles.cardHeader}>
            <Languages size={20} color={palette.green600} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {t('printerManagement.languageTitle')}
            </Text>
          </View>
          <Text style={[styles.hint, { color: colors.textSubtle, marginBottom: 8 }]}>
            {t('printerManagement.languageHint')}
          </Text>
          <View style={styles.langGrid}>
            {LANG_OPTIONS.map(({ code, key }) => {
              const active = settings.defaultLanguage === code;
              return (
                <Pressable
                  key={code}
                  onPress={() => setDefaultLanguage(code)}
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
                    {t(key)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
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
  hint: { fontSize: 11, lineHeight: 16 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  kindList: { gap: 8, marginTop: 4 },
  kindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  kindIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langChip: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
});
