import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  User,
  Lock,
  Moon,
  Sun,
  Languages,
  Database,
  Settings,
} from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormField } from '../components/FormField';
import { GradientHeader, HeaderIconButton } from '../components/GradientHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemeStore } from '../store/themeStore';
import { useLanguageStore } from '../store/languageStore';
import { isConfigReady, useConfigStore } from '../store/configStore';
import { verifyLogin, normalizeFirmNr } from '../api/pgClient';
import { loadLastOrg } from '../api/lastOrgPrefs';
import { reloadAppForRtl } from '../i18n/languages';
import { palette } from '../theme/colors';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { colors, darkMode, toggleDarkMode } = useThemeStore();
  const language = useLanguageStore((s) => s.language);
  const cycleLanguage = useLanguageStore((s) => s.cycleLanguage);
  const config = useConfigStore((s) => s.config);
  const configHydrated = useConfigStore((s) => s.isHydrated);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web gibi: config yoksa/eksikse ayar ekranına yönlendir
  useEffect(() => {
    if (!configHydrated) return;
    if (!isConfigReady(config)) {
      navigation.replace('Config');
    }
  }, [configHydrated, config, navigation]);

  const toggleLang = () => {
    const rtlChanged = cycleLanguage();
    if (rtlChanged) {
      Alert.alert(t('languageSelection'), t('rtlRestartHint'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('continue'), onPress: () => reloadAppForRtl() },
      ]);
    }
  };

  const openConfig = () => navigation.navigate('Config');

  const onSubmit = async () => {
    setError(null);
    if (!isConfigReady(config)) {
      setError(t('configRequired'));
      navigation.navigate('Config');
      return;
    }
    setLoading(true);
    try {
      // Web adım 1: firmasız şifre doğrulama (PostgREST-first → SQL → users)
      const row = await verifyLogin(username.trim(), password, '');
      if (!row) {
        setError(t('loginFailed'));
        return;
      }
      const firmNr = normalizeFirmNr(row.firm_nr) || '001';
      const lastOrg = await loadLastOrg();
      const seedPeriod =
        lastOrg && lastOrg.firmNr === firmNr && lastOrg.periodNr
          ? lastOrg.periodNr
          : '';
      const seedStoreId =
        lastOrg && lastOrg.firmNr === firmNr && lastOrg.storeId
          ? lastOrg.storeId
          : row.store_id
            ? String(row.store_id)
            : null;
      const seedStoreName =
        lastOrg && lastOrg.firmNr === firmNr && lastOrg.storeName
          ? lastOrg.storeName
          : null;
      navigation.navigate('Organization', {
        pendingUser: {
          id: String(row.id),
          username: row.username,
          fullName: row.full_name || row.username,
          email: row.email,
          roleName: row.role_name,
          firmNr,
          periodNr: seedPeriod,
          storeId: seedStoreId,
          storeName: seedStoreName,
        },
        rememberMe,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: darkMode ? palette.gray700 : 'transparent',
              },
            ]}
          >
            <GradientHeader safeTop={false}>
              <View style={styles.toolpad}>
                <HeaderIconButton onPress={toggleDarkMode}>
                  {darkMode ? (
                    <Sun size={14} color={palette.white} />
                  ) : (
                    <Moon size={14} color={palette.white} />
                  )}
                </HeaderIconButton>
                <HeaderIconButton onPress={toggleLang}>
                  <View style={styles.langBadge}>
                    <Languages size={12} color={palette.white} />
                    <Text style={styles.langBadgeText}>{language.toUpperCase()}</Text>
                  </View>
                </HeaderIconButton>
                <HeaderIconButton accent onPress={openConfig}>
                  <Database size={14} color={palette.white} />
                </HeaderIconButton>
                <HeaderIconButton onPress={openConfig}>
                  <Settings size={14} color={palette.white} />
                </HeaderIconButton>
              </View>

              <View style={styles.logoBlock}>
                <View style={styles.logoMark}>
                  <Text style={styles.logoMarkText}>RX</Text>
                </View>
                <Text style={styles.logoTitle}>{t('appName')}</Text>
                <View style={styles.taglineRow}>
                  <View style={styles.taglineLine} />
                  <Text style={styles.tagline}>{t('tagline')}</Text>
                  <View style={styles.taglineLine} />
                </View>
              </View>
            </GradientHeader>

            <View style={styles.form}>
              <FormField
                label={t('username')}
                hintRight={t('step01Auth')}
                leftIcon={
                  <User
                    size={16}
                    color={darkMode ? palette.blue400 : palette.gray400}
                  />
                }
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('usernamePlaceholder')}
              />

              <FormField
                label={t('password')}
                leftIcon={
                  <Lock
                    size={16}
                    color={darkMode ? palette.blue400 : palette.gray400}
                  />
                }
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
              />

              <View style={styles.rememberRow}>
                <Switch
                  value={rememberMe}
                  onValueChange={setRememberMe}
                  trackColor={{ true: palette.blue600, false: palette.gray300 }}
                />
                <Text style={[styles.rememberLabel, { color: colors.textMuted }]}>
                  {t('rememberMe')}
                </Text>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {config.apiMode === 'postgrest' && !String(config.remoteRestUrl || '').trim() ? (
                <Pressable onPress={openConfig} style={styles.postgrestWarnBox}>
                  <Text style={styles.postgrestWarnTitle}>
                    {t('apiModePostgrestWarningTitle')}
                  </Text>
                  <Text style={styles.postgrestWarnBody}>
                    {t('apiModePostgrestWarning')}
                  </Text>
                  <Text style={styles.postgrestWarnLink}>{t('configTitle')}</Text>
                </Pressable>
              ) : null}

              <Text style={[styles.demoHint, { color: colors.textSubtle }]}>
                {t('demoHint')}
              </Text>

              <PrimaryButton
                label={t('continue')}
                onPress={onSubmit}
                loading={loading}
                disabled={!username.trim() || !password}
              />

              <Pressable onPress={openConfig} style={styles.configLink}>
                <Text style={{ color: palette.blue500, fontSize: 11, fontWeight: '700' }}>
                  {t('configTitle')}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    borderRadius: 2,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  toolpad: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'row',
    gap: 4,
  },
  langBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  langBadgeText: {
    color: palette.white,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  logoBlock: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 8,
    zIndex: 2,
  },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginBottom: 16,
  },
  logoMarkText: {
    fontSize: 28,
    fontWeight: '900',
    color: palette.white,
  },
  logoTitle: {
    color: palette.white,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    opacity: 0.85,
    width: '100%',
  },
  taglineLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(96,165,250,0.5)',
  },
  tagline: {
    color: palette.blue200,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  form: {
    padding: 28,
    gap: 20,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  rememberLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  errorBox: {
    backgroundColor: palette.red100,
    padding: 12,
    borderRadius: 2,
  },
  errorText: {
    color: palette.red500,
    fontSize: 12,
    fontWeight: '700',
  },
  postgrestWarnBox: {
    backgroundColor: 'rgba(254,243,199,0.95)',
    borderWidth: 2,
    borderColor: palette.amber600,
    padding: 12,
    borderRadius: 4,
    gap: 4,
  },
  postgrestWarnTitle: {
    color: '#92400e',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  postgrestWarnBody: {
    color: '#78350f',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  postgrestWarnLink: {
    color: palette.blue500,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  demoHint: {
    fontSize: 11,
    textAlign: 'center',
  },
  configLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
});
