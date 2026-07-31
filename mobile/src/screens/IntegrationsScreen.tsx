/**
 * Entegrasyonlar — web IntegrationsModule karşılığı (Logo / OpenRouter / erişim kapısı).
 * WhatsApp artık burada değil → İletişim menüsü.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenHeader, ErrorBanner } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  grantIntegrationsAccess,
  isIntegrationsAccessGranted,
  revokeIntegrationsAccess,
  verifyIntegrationsPassword,
} from '../utils/integrationsAccess';
import {
  DEFAULT_OPENROUTER_CONFIG,
  OPENROUTER_MODEL_PRESETS,
  loadOpenRouterConfig,
  saveOpenRouterConfig,
  type OpenRouterConfig,
} from '../utils/openRouterConfig';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

export function IntegrationsScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<{ navigate: (name: string, params?: object) => void }>();
  const [checking, setChecking] = useState(true);
  const [granted, setGranted] = useState(false);
  const [password, setPassword] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<OpenRouterConfig>({ ...DEFAULT_OPENROUTER_CONFIG });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isIntegrationsAccessGranted();
      if (cancelled) return;
      setGranted(ok);
      if (ok) {
        setCfg(await loadOpenRouterConfig());
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onUnlock = useCallback(async () => {
    setGateError(null);
    if (!verifyIntegrationsPassword(password)) {
      setGateError('Geçersiz şifre');
      return;
    }
    await grantIntegrationsAccess();
    setGranted(true);
    setPassword('');
    setCfg(await loadOpenRouterConfig());
  }, [password]);

  const onLock = useCallback(async () => {
    await revokeIntegrationsAccess();
    setGranted(false);
  }, []);

  const onSaveAi = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await saveOpenRouterConfig(cfg);
      setCfg(next);
      Alert.alert(
        'Kaydedildi',
        next.enabled
          ? 'OpenRouter açık — mobil AI özellikleri bu modeli kullanır.'
          : 'OpenRouter ayarları kaydedildi (şimdilik kapalı).',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [cfg]);

  if (checking) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Entegrasyonlar" subtitle="Logo Tiger · OpenRouter AI" />
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      </View>
    );
  }

  if (!granted) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Entegrasyonlar" subtitle="Yetkili erişim gerekli" />
        <View style={styles.gate}>
          <Text style={[styles.gateTitle, { color: colors.text }]}>Erişim şifresi</Text>
          <Text style={[styles.gateHint, { color: colors.textMuted }]}>
            Logo ERP ve AI ayarları için DeskApp ile aynı yetkili şifreyi girin.
          </Text>
          <FormField
            label="Şifre"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            placeholder="••••••••"
          />
          {gateError ? <ErrorBanner message={gateError} /> : null}
          <PrimaryButton label="Kilidi aç" onPress={() => void onUnlock()} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Entegrasyonlar"
        subtitle="Logo Tiger ve diğer sistemlerden veri aktarımı"
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {error ? <ErrorBanner message={error} /> : null}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Logo Tiger ERP</Text>
          <Text style={[styles.cardBody, { color: colors.textMuted }]}>
            Logo REST bağlantısı, malzeme/cari senkronu ve SQL Server aktarımları masaüstü
            (DeskApp) üzerinde çalışır. Telefonda tam Logo senkronu desteklenmez — senkron
            durumunu ve bağlantıyı Windows uygulamasından yönetin.
          </Text>
          <View style={[styles.badge, { backgroundColor: palette.amber600 + '22' }]}>
            <Text style={{ color: palette.amber600, fontWeight: '800', fontSize: 12 }}>
              Masaüstü gerekli
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>OpenRouter AI</Text>
          <Text style={[styles.cardBody, { color: colors.textMuted }]}>
            Rapor asistanı ve AI özellikleri için API anahtarı. Anahtar cihazda saklanır.
          </Text>
          <View style={styles.switchRow}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Aktif</Text>
            <Switch
              value={cfg.enabled}
              onValueChange={(v) => setCfg((c) => ({ ...c, enabled: v }))}
              trackColor={{ true: palette.blue600 }}
            />
          </View>
          <FormField
            label="API anahtarı"
            value={cfg.apiKey}
            onChangeText={(t) => setCfg((c) => ({ ...c, apiKey: t }))}
            autoCapitalize="none"
            secureTextEntry
            placeholder="sk-or-…"
          />
          <FormField
            label="Model"
            value={cfg.model}
            onChangeText={(t) => setCfg((c) => ({ ...c, model: t }))}
            autoCapitalize="none"
            placeholder="openai/gpt-4o-mini"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
            {OPENROUTER_MODEL_PRESETS.map((m) => {
              const on = cfg.model === m.value;
              return (
                <Pressable
                  key={m.value}
                  onPress={() => setCfg((c) => ({ ...c, model: m.value }))}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: on ? palette.blue600 : colors.backgroundAlt,
                      borderColor: on ? palette.blue600 : colors.cardBorder,
                    },
                  ]}
                >
                  <Text style={{ color: on ? palette.white : colors.text, fontSize: 11, fontWeight: '700' }}>
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <FormField
            label="Base URL"
            value={cfg.baseUrl}
            onChangeText={(t) => setCfg((c) => ({ ...c, baseUrl: t }))}
            autoCapitalize="none"
          />
          <PrimaryButton label="AI ayarlarını kaydet" onPress={() => void onSaveAi()} loading={saving} />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>WhatsApp / SMS</Text>
          <Text style={[styles.cardBody, { color: colors.textMuted }]}>
            Mesaj sağlayıcı ve kuyruk İletişim menüsündedir — Entegrasyonlar sayfasından ayrıldı.
          </Text>
          <PrimaryButton
            label="İletişim & WhatsApp"
            variant="ghost"
            onPress={() =>
              navigation.navigate('Communications', {
                screenId: 'whatsapp',
                initialTab: 'provider',
              })
            }
          />
        </View>

        <PrimaryButton label="Entegrasyon kilidini kapat" variant="ghost" onPress={() => void onLock()} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 12, paddingBottom: 40, gap: 12 },
  gate: { padding: 16, gap: 12 },
  gateTitle: { fontSize: 18, fontWeight: '900' },
  gateHint: { fontSize: 13, lineHeight: 18 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '900' },
  cardBody: { fontSize: 13, lineHeight: 18 },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
  },
});
