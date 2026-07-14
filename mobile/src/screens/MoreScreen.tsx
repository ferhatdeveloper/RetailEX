import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutGrid, List } from 'lucide-react-native';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { ConnectivityBadge } from '../components/ConnectivityBadge';
import { useThemeStore } from '../store/themeStore';
import { usePreferencesStore, type MenuViewMode } from '../store/preferencesStore';
import { useLanguageStore } from '../store/languageStore';
import { useAuthStore } from '../store/authStore';
import { useConfigStore, type NetworkPolicy } from '../store/configStore';
import { useConnectivityStore } from '../store/connectivityStore';
import { flushPendingMutations } from '../offline/syncEngine';
import { MENU_SECTIONS } from '../config/menuConfig';
import { navigateToModule } from '../navigation/navigateToModule';
import {
  APP_LANGUAGES,
  LANGUAGE_LABEL_KEYS,
  reloadAppForRtl,
  type AppLanguage,
} from '../i18n/languages';
import { tMenuItem } from '../i18n/menuLabels';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export function MoreScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { darkMode, toggleDarkMode, colors } = useThemeStore();
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const menuViewMode = usePreferencesStore((s) => s.menuViewMode);
  const setMenuViewMode = usePreferencesStore((s) => s.setMenuViewMode);
  const networkPolicy = useConfigStore((s) => s.config.networkPolicy ?? 'hybrid');
  const setConfig = useConfigStore((s) => s.setConfig);
  const pendingCount = useConnectivityStore((s) => s.pendingCount);
  const syncing = useConnectivityStore((s) => s.syncing);
  const logout = useAuthStore((s) => s.logout);
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const hubs = [
    { id: 'products', label: 'Ürünler', screen: 'products' },
    { id: 'suppliers', label: 'Cari Hesaplar', screen: 'suppliers' },
    { id: 'sales-inv', label: 'Satış Faturaları', screen: 'salesinvoice' },
    { id: 'document-scan', label: 'Belge Tara', screen: 'document-scan' },
    { id: 'wms-hub', label: 'WMS Ana Panel', screen: 'wms-hub' },
    { id: 'restaurant', label: 'Restoran Ana Ekran', screen: 'restaurant' },
    { id: 'beauty', label: 'Güzellik Ana Ekran', screen: 'beauty' },
    { id: 'customreports', label: 'Genel Rapor', screen: 'customreports' },
    { id: 'usermanagement', label: 'Kullanıcı Yönetimi', screen: 'usermanagement' },
  ];

  const viewTabItems = useMemo(
    () =>
      [
        { id: 'list' as const, label: t('menuViewList'), icon: List },
        { id: 'cards' as const, label: t('menuViewCards'), icon: LayoutGrid },
      ] as const,
    [t],
  );

  const netTabItems = useMemo(
    () =>
      [
        { id: 'online' as const, label: t('connOnline') },
        { id: 'offline' as const, label: t('connOffline') },
        { id: 'hybrid' as const, label: t('connHybrid') },
      ] as const,
    [t],
  );

  const onSelectLanguage = (lang: AppLanguage) => {
    if (lang === language) return;
    const rtlChanged = setLanguage(lang);
    if (rtlChanged) {
      Alert.alert(t('languageSelection'), t('rtlRestartHint'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('continue'), onPress: () => reloadAppForRtl() },
      ]);
    }
  };

  const onFlush = async () => {
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t('more')}
        subtitle={t('menu.groupsCount', { count: MENU_SECTIONS.length })}
        showBack={false}
      />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 48 + Math.max(insets.bottom, 0) }]}
      >
        <Text style={[styles.sec, { color: colors.text }]}>
          {t('menu.moduleShortcuts')}
        </Text>
        {hubs.map((h) => {
          const label = tMenuItem(t, h.id, h.label);
          return (
            <PrimaryButton
              key={h.screen}
              label={label}
              variant="ghost"
              onPress={() => navigateToModule(navigation, h.screen, label)}
              style={{ marginBottom: 8 }}
            />
          );
        })}

        {/* Menü görünümü — dil/tema bölümünden ayrı (çakışma azaltma) */}
        <Text style={[styles.sec, { color: colors.text, marginTop: 12 }]}>{t('menuViewMode')}</Text>
        <SegmentTabBar
          layout="equal"
          value={menuViewMode}
          onChange={(mode) => setMenuViewMode(mode as MenuViewMode)}
          items={[...viewTabItems]}
          style={styles.segFlush}
        />

        <Text style={[styles.sec, { color: colors.text, marginTop: 12 }]}>{t('networkPolicy')}</Text>
        <View style={{ marginBottom: 8 }}>
          <ConnectivityBadge />
        </View>
        <SegmentTabBar
          layout="equal"
          value={networkPolicy}
          onChange={(mode) => setConfig({ networkPolicy: mode as NetworkPolicy })}
          items={[...netTabItems]}
          style={styles.segFlush}
        />
        <Text style={[styles.hint, { color: colors.textSubtle }]}>
          {networkPolicy === 'online'
            ? t('networkPolicyOnlineHint')
            : networkPolicy === 'offline'
              ? t('networkPolicyOfflineHint')
              : t('networkPolicyHybridHint')}
        </Text>
        {pendingCount > 0 ? (
          <PrimaryButton
            label={t('connSyncPending', { count: pendingCount })}
            onPress={() => void onFlush()}
            loading={syncing}
            variant="ghost"
            style={{ marginTop: 8 }}
          />
        ) : null}

        <Text style={[styles.sec, { color: colors.text, marginTop: 12 }]}>{t('settings')}</Text>
        <PrimaryButton
          label={t('printerSettings.menuLabel')}
          onPress={() => navigation.navigate('PrinterSettings')}
          variant="ghost"
          style={{ marginBottom: 8 }}
        />
        <PrimaryButton
          label={t('changeOrganization')}
          onPress={() => navigation.navigate('Organization')}
          variant="ghost"
          style={{ marginBottom: 8 }}
        />

        <Text style={[styles.subSec, { color: colors.textMuted }]}>{t('appearance')}</Text>
        <PrimaryButton
          label={darkMode ? t('lightMode') : t('darkMode')}
          onPress={toggleDarkMode}
          variant="ghost"
          style={{ marginBottom: 8 }}
        />

        <Text style={[styles.subSec, { color: colors.textMuted }]}>{t('languageSelection')}</Text>
        <View style={styles.langGrid}>
          {APP_LANGUAGES.map((code) => {
            const active = language === code;
            return (
              <Pressable
                key={code}
                onPress={() => onSelectLanguage(code)}
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
                    fontSize: 13,
                    fontWeight: '700',
                    textAlign: 'center',
                  }}
                >
                  {t(LANGUAGE_LABEL_KEYS[code])}
                </Text>
                <Text
                  style={{
                    color: active ? 'rgba(255,255,255,0.8)' : colors.textSubtle,
                    fontSize: 10,
                    fontWeight: '600',
                    textAlign: 'center',
                    marginTop: 2,
                  }}
                >
                  {code.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton label={t('logout')} onPress={logout} variant="danger" style={{ marginTop: 16 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, paddingBottom: 48 },
  sec: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  subSec: { fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  /** SegmentTabBar varsayılan horizontal padding’i More body ile çiftlememek için */
  segFlush: { paddingHorizontal: 0, marginHorizontal: -4, marginBottom: 4 },
  hint: { fontSize: 11, lineHeight: 16, marginBottom: 4 },
  langGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  langChip: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
});
