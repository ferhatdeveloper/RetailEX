import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenHeader } from '../components/ScreenChrome';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { MENU_SECTIONS } from '../config/menuConfig';
import { navigateToModule } from '../navigation/navigateToModule';
import type { MainStackParamList } from '../navigation/types';

export function MoreScreen() {
  const { t, i18n } = useTranslation();
  const { darkMode, toggleDarkMode, colors } = useThemeStore();
  const logout = useAuthStore((s) => s.logout);
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const hubs = [
    { label: 'Ürünler', screen: 'products' },
    { label: 'Cariler', screen: 'suppliers' },
    { label: 'Faturalar', screen: 'salesinvoice' },
    { label: 'WMS / Depo', screen: 'wms-hub' },
    { label: 'Restoran', screen: 'restaurant' },
    { label: 'Güzellik', screen: 'beauty' },
    { label: 'Raporlar', screen: 'customreports' },
    { label: 'Sistem', screen: 'usermanagement' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t('more')} subtitle={`${MENU_SECTIONS.length} menü grubu`} showBack={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.sec, { color: colors.text }]}>Modül kısayolları</Text>
        {hubs.map((h) => (
          <PrimaryButton
            key={h.screen}
            label={h.label}
            variant="ghost"
            onPress={() => navigateToModule(navigation, h.screen, h.label)}
            style={{ marginBottom: 8 }}
          />
        ))}
        <Text style={[styles.sec, { color: colors.text, marginTop: 12 }]}>Ayarlar</Text>
        <PrimaryButton
          label={darkMode ? t('lightMode') : t('darkMode')}
          onPress={toggleDarkMode}
          variant="ghost"
          style={{ marginBottom: 8 }}
        />
        <PrimaryButton
          label={`${t('language')}: ${i18n.language.toUpperCase()}`}
          onPress={() => void i18n.changeLanguage(i18n.language === 'tr' ? 'en' : 'tr')}
          variant="ghost"
          style={{ marginBottom: 8 }}
        />
        <PrimaryButton label={t('logout')} onPress={logout} variant="danger" />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, paddingBottom: 48 },
  sec: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
});
