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
import {
  DEFAULT_LOGO_REST_CONFIG,
  LOGO_API_URL_EXAMPLE,
  LOGO_REST_MAX_PAGE_SIZE,
  importLogoArps,
  importLogoItems,
  loadLogoRestConfig,
  pullLogoArpsPreview,
  pullLogoItemsPreview,
  resolveLogoBridgeBaseUrl,
  saveLogoRestConfig,
  shouldUseLogoBridgeProxy,
  testLogoRestConnection,
  type LogoArpPreview,
  type LogoItemPreview,
  type LogoRestConfig,
} from '../services/logoRestMobile';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

type PreviewKind = 'items' | 'arps' | null;

export function IntegrationsScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<{ navigate: (name: string, params?: object) => void }>();
  const [checking, setChecking] = useState(true);
  const [granted, setGranted] = useState(false);
  const [password, setPassword] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<OpenRouterConfig>({ ...DEFAULT_OPENROUTER_CONFIG });
  const [logo, setLogo] = useState<LogoRestConfig>({ ...DEFAULT_LOGO_REST_CONFIG });
  const [showLogoAdvanced, setShowLogoAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingLogo, setSavingLogo] = useState(false);
  const [testingLogo, setTestingLogo] = useState(false);
  const [pullingItems, setPullingItems] = useState(false);
  const [pullingArps, setPullingArps] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewKind, setPreviewKind] = useState<PreviewKind>(null);
  const [itemPreview, setItemPreview] = useState<LogoItemPreview[]>([]);
  const [arpPreview, setArpPreview] = useState<LogoArpPreview[]>([]);
  const [previewTotalHint, setPreviewTotalHint] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadGrantedConfigs = useCallback(async () => {
    const [ai, logoCfg] = await Promise.all([loadOpenRouterConfig(), loadLogoRestConfig()]);
    setCfg(ai);
    setLogo(logoCfg);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isIntegrationsAccessGranted();
      if (cancelled) return;
      setGranted(ok);
      if (ok) {
        await loadGrantedConfigs();
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadGrantedConfigs]);

  const onUnlock = useCallback(async () => {
    setGateError(null);
    if (!verifyIntegrationsPassword(password)) {
      setGateError('Geçersiz şifre');
      return;
    }
    await grantIntegrationsAccess();
    setGranted(true);
    setPassword('');
    await loadGrantedConfigs();
  }, [password, loadGrantedConfigs]);

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

  const onSaveLogo = useCallback(async () => {
    setSavingLogo(true);
    setError(null);
    try {
      const next = await saveLogoRestConfig(logo);
      setLogo(next);
      Alert.alert('Kaydedildi', 'Logo REST ayarları cihazda saklandı.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingLogo(false);
    }
  }, [logo]);

  const onTestLogo = useCallback(async () => {
    setTestingLogo(true);
    setError(null);
    try {
      const result = await testLogoRestConnection(logo);
      if (result.ok) {
        setLogo(await loadLogoRestConfig());
        Alert.alert('Bağlantı başarılı', result.detail);
      } else {
        Alert.alert('Bağlantı başarısız', result.detail);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTestingLogo(false);
    }
  }, [logo]);

  const clearPreview = useCallback(() => {
    setPreviewKind(null);
    setItemPreview([]);
    setArpPreview([]);
    setPreviewTotalHint(null);
  }, []);

  const onPullItems = useCallback(async () => {
    setPullingItems(true);
    setError(null);
    clearPreview();
    try {
      await saveLogoRestConfig(logo);
      const { items, totalHint } = await pullLogoItemsPreview(logo);
      if (!items.length) {
        Alert.alert('Malzeme', 'Logo’dan malzeme gelmedi (ilk 25 boş).');
        return;
      }
      setItemPreview(items);
      setPreviewTotalHint(totalHint);
      setPreviewKind('items');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPullingItems(false);
    }
  }, [logo, clearPreview]);

  const onPullArps = useCallback(async () => {
    setPullingArps(true);
    setError(null);
    clearPreview();
    try {
      await saveLogoRestConfig(logo);
      const { items, totalHint } = await pullLogoArpsPreview(logo);
      if (!items.length) {
        Alert.alert('Cari', 'Logo’dan cari gelmedi (ilk 25 boş).');
        return;
      }
      setArpPreview(items);
      setPreviewTotalHint(totalHint);
      setPreviewKind('arps');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPullingArps(false);
    }
  }, [logo, clearPreview]);

  const onConfirmImport = useCallback(async () => {
    if (!previewKind) return;
    setImporting(true);
    setError(null);
    try {
      const result =
        previewKind === 'items'
          ? await importLogoItems(itemPreview)
          : await importLogoArps(arpPreview);
      const errTail =
        result.errors.length > 0
          ? `\nHatalar: ${result.errors.slice(0, 3).join('; ')}${
              result.errors.length > 3 ? '…' : ''
            }`
          : '';
      Alert.alert(
        'İçe aktarma tamam',
        `Yeni: ${result.created} · Güncellenen: ${result.updated} · Atlanan: ${result.skipped}${errTail}`,
      );
      clearPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }, [previewKind, itemPreview, arpPreview, clearPreview]);

  const transportHint = (() => {
    const bridge = resolveLogoBridgeBaseUrl();
    if (shouldUseLogoBridgeProxy(logo.baseUrl) && bridge) {
      return `İstekler köprü üzerinden: ${bridge}/api/erp-logo-proxy`;
    }
    if (logo.baseUrl?.trim()) {
      return 'İstekler doğrudan Logo REST URL’ine (HTTPS/SaaS veya yerel ağ).';
    }
    return 'Bridge host (Ayarlar) veya public Logo URL gerekir.';
  })();

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
            Logo Objects REST: bağlantı testi ve hafif senkron (ilk {LOGO_REST_MAX_PAGE_SIZE}{' '}
            malzeme / cari). Toplu senkron masaüstünde devam eder.
          </Text>
          <Text style={[styles.hint, { color: colors.textMuted }]}>{transportHint}</Text>
          <FormField
            label="Base URL"
            value={logo.baseUrl}
            onChangeText={(t) => setLogo((c) => ({ ...c, baseUrl: t }))}
            autoCapitalize="none"
            placeholder={LOGO_API_URL_EXAMPLE}
            keyboardType="url"
          />
          <FormField
            label="Kullanıcı adı"
            value={logo.username}
            onChangeText={(t) => setLogo((c) => ({ ...c, username: t }))}
            autoCapitalize="none"
          />
          <FormField
            label="Şifre"
            value={logo.password}
            onChangeText={(t) => setLogo((c) => ({ ...c, password: t }))}
            autoCapitalize="none"
            secureTextEntry
          />
          <FormField
            label="Logo DB (dbname)"
            value={logo.logoDb}
            onChangeText={(t) => setLogo((c) => ({ ...c, logoDb: t }))}
            autoCapitalize="none"
            placeholder="örn. LOGO"
          />
          <FormField
            label="Firma no"
            value={logo.selectedFirmNr > 0 ? String(logo.selectedFirmNr) : ''}
            onChangeText={(t) =>
              setLogo((c) => ({
                ...c,
                selectedFirmNr: Math.max(0, parseInt(t.replace(/\D/g, ''), 10) || 0),
              }))
            }
            keyboardType="number-pad"
            placeholder="0"
          />
          <FormField
            label="Dönem no"
            value={String(logo.selectedPeriodNr || 1)}
            onChangeText={(t) =>
              setLogo((c) => ({
                ...c,
                selectedPeriodNr: Math.max(1, parseInt(t.replace(/\D/g, ''), 10) || 1),
              }))
            }
            keyboardType="number-pad"
            placeholder="1"
          />
          <Pressable onPress={() => setShowLogoAdvanced((v) => !v)} style={styles.advancedToggle}>
            <Text style={{ color: palette.blue600, fontWeight: '700', fontSize: 12 }}>
              {showLogoAdvanced ? 'Gelişmiş ayarları gizle' : 'Gelişmiş (Client ID)'}
            </Text>
          </Pressable>
          {showLogoAdvanced ? (
            <FormField
              label="Client ID"
              value={logo.clientId}
              onChangeText={(t) => setLogo((c) => ({ ...c, clientId: t }))}
              autoCapitalize="none"
            />
          ) : null}
          <View style={styles.btnRow}>
            <PrimaryButton
              label="Kaydet"
              onPress={() => void onSaveLogo()}
              loading={savingLogo}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              label="Bağlantıyı test et"
              variant="ghost"
              onPress={() => void onTestLogo()}
              loading={testingLogo}
              style={{ flex: 1 }}
            />
          </View>
          <View style={styles.btnRow}>
            <PrimaryButton
              label={`Malzeme çek (ilk ${LOGO_REST_MAX_PAGE_SIZE})`}
              variant="ghost"
              onPress={() => void onPullItems()}
              loading={pullingItems}
              style={{ flex: 1 }}
            />
            <PrimaryButton
              label={`Cari çek (ilk ${LOGO_REST_MAX_PAGE_SIZE})`}
              variant="ghost"
              onPress={() => void onPullArps()}
              loading={pullingArps}
              style={{ flex: 1 }}
            />
          </View>

          {previewKind ? (
            <View
              style={[
                styles.previewBox,
                { borderColor: colors.cardBorder, backgroundColor: colors.backgroundAlt },
              ]}
            >
              <Text style={[styles.previewTitle, { color: colors.text }]}>
                {previewKind === 'items' ? 'Malzeme önizleme' : 'Cari önizleme'}
                {previewTotalHint != null ? ` · Logo toplam ~${previewTotalHint}` : ''}
              </Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {previewKind === 'items'
                  ? `${itemPreview.length} kayıt — kod eşleşirse güncellenir, yoksa yeni ürün.`
                  : `${arpPreview.length} kayıt — kod eşleşirse güncellenir, yoksa yeni cari.`}
              </Text>
              {(previewKind === 'items' ? itemPreview : arpPreview).slice(0, 12).map((row) => (
                <Text
                  key={row.code}
                  style={[styles.previewRow, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {row.code} — {row.name}
                </Text>
              ))}
              {(previewKind === 'items' ? itemPreview : arpPreview).length > 12 ? (
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  …ve {(previewKind === 'items' ? itemPreview : arpPreview).length - 12} kayıt daha
                </Text>
              ) : null}
              <View style={styles.btnRow}>
                <PrimaryButton
                  label="İçe aktar (upsert)"
                  onPress={() => void onConfirmImport()}
                  loading={importing}
                  style={{ flex: 1 }}
                />
                <PrimaryButton
                  label="İptal"
                  variant="ghost"
                  onPress={clearPreview}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ) : null}
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
  hint: { fontSize: 11, lineHeight: 16 },
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
  advancedToggle: { paddingVertical: 4 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  previewBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 6,
    marginTop: 4,
  },
  previewTitle: { fontSize: 13, fontWeight: '800' },
  previewRow: { fontSize: 12, lineHeight: 18 },
});
