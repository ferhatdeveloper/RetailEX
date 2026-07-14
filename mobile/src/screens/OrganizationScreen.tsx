import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Building2, Store, Calendar } from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GradientHeader } from '../components/GradientHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import {
  fetchFirms,
  fetchStores,
  fetchPeriods,
  type FirmRow,
  type StoreRow,
  type PeriodRow,
} from '../api/pgClient';
import { saveLastOrg } from '../api/lastOrgPrefs';
import { palette } from '../theme/colors';
import type { AuthStackParamList, MainStackParamList, PendingUser } from '../navigation/types';

type AuthProps = NativeStackScreenProps<AuthStackParamList, 'Organization'>;
type MainProps = NativeStackScreenProps<MainStackParamList, 'Organization'>;
type Props = AuthProps | MainProps;

function isLoginRoute(
  params: AuthStackParamList['Organization'] | MainStackParamList['Organization'] | undefined,
): params is AuthStackParamList['Organization'] {
  return !!(params && typeof params === 'object' && 'pendingUser' in params);
}

export function OrganizationScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { colors, darkMode } = useThemeStore();
  const login = useAuthStore((s) => s.login);
  const updateOrg = useAuthStore((s) => s.updateOrg);
  const sessionUser = useAuthStore((s) => s.user);

  const loginParams = isLoginRoute(route.params) ? route.params : null;
  const isSwitch = !loginParams;
  const seed: PendingUser | null = loginParams?.pendingUser ?? sessionUser;
  const offlineDemo = loginParams?.offlineDemo === true;

  const [firms, setFirms] = useState<FirmRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [firmNr, setFirmNr] = useState(seed?.firmNr || '001');
  const [storeId, setStoreId] = useState(seed?.storeId || '');
  const [storeName, setStoreName] = useState(seed?.storeName || '');
  const [periodNr, setPeriodNr] = useState(seed?.periodNr || '');
  const [loading, setLoading] = useState(true);
  const [showFirms, setShowFirms] = useState(false);
  const [showStores, setShowStores] = useState(false);
  const [showPeriods, setShowPeriods] = useState(false);
  const storeIdRef = useRef(storeId);
  const periodNrRef = useRef(periodNr);
  storeIdRef.current = storeId;
  periodNrRef.current = periodNr;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (offlineDemo) {
        setFirms([{ firm_nr: '001', name: 'Demo Firma' }]);
        setStores([{ id: '1', name: 'Merkez Mağaza', region: 'TR' }]);
        setPeriods([
          { nr: '01', label: 'Dönem 01' },
          { nr: '02', label: 'Dönem 02' },
        ]);
        if (!storeIdRef.current) {
          setStoreId('1');
          setStoreName('Merkez Mağaza');
        }
        if (!periodNrRef.current) {
          setPeriodNr('02');
        }
        setLoading(false);
        return;
      }
      const fn = firmNr;
      const [f, p, s] = await Promise.all([
        fetchFirms(),
        fetchPeriods(fn),
        fetchStores(fn),
      ]);
      if (cancelled) return;
      setFirms(f.length ? f : [{ firm_nr: fn, name: `Firma ${fn}` }]);
      setPeriods(p);
      setStores(s);
      if (s.length && !storeIdRef.current) {
        setStoreId(s[0]!.id);
        setStoreName(s[0]!.name);
      }
      // R12: seed boş/geçersizse sunucudaki en yüksek (son) aktif dönem
      if (p.length) {
        const ok = p.find((x) => x.nr === periodNrRef.current);
        if (!ok) {
          setPeriodNr(p[p.length - 1]!.nr);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // İlk yükleme — firma değişince aşağıdaki effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineDemo]);

  useEffect(() => {
    if (offlineDemo || loading) return;
    let cancelled = false;
    void (async () => {
      const [s, p] = await Promise.all([fetchStores(firmNr), fetchPeriods(firmNr)]);
      if (cancelled) return;
      setStores(s);
      setPeriods(p);
      const keepStore = s.find((x) => x.id === storeIdRef.current);
      if (keepStore) {
        setStoreName(keepStore.name);
      } else if (s[0]) {
        setStoreId(s[0].id);
        setStoreName(s[0].name);
      } else {
        setStoreId('');
        setStoreName('');
      }
      if (!p.find((x) => x.nr === periodNrRef.current) && p.length) {
        setPeriodNr(p[p.length - 1]!.nr);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firmNr, offlineDemo, loading]);

  if (!seed) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <Text style={{ color: colors.text, padding: 24 }}>{t('loginRequired')}</Text>
        <PrimaryButton label={t('back')} onPress={() => navigation.goBack()} variant="ghost" />
      </SafeAreaView>
    );
  }

  const selectedFirmName =
    firms.find((f) => f.firm_nr === firmNr)?.name || t('selectFirm');

  const onConfirm = () => {
    const org = {
      firmNr,
      periodNr: periodNr || '01',
      storeId: storeId || null,
      storeName: storeName || null,
    };
    void saveLastOrg(org);
    if (isSwitch) {
      updateOrg(org);
      const nav = navigation as { canGoBack: () => boolean; goBack: () => void };
      if (nav.canGoBack()) nav.goBack();
      return;
    }
    login({
      ...seed,
      ...org,
    });
  };

  const listStyle = {
    backgroundColor: darkMode ? palette.gray800 : palette.white,
    borderColor: darkMode ? palette.gray700 : palette.gray100,
  };

  const subtitle = isSwitch
    ? `${seed.fullName} · ${t('changeOrganizationHint')}`
    : `${seed.fullName} · ${t('step02Scope')}`;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: darkMode ? palette.gray700 : palette.gray200,
            },
          ]}
        >
          <GradientHeader
            compact
            safeTop={false}
            title={t('organization')}
            subtitle={subtitle}
          />

          <View style={styles.form}>
            <View style={styles.tabBar}>
              <View style={[styles.tabActive, { backgroundColor: palette.blue600 }]}>
                <Text style={styles.tabText}>{t('firmSelection')}</Text>
              </View>
            </View>

            {loading ? (
              <ActivityIndicator color={palette.blue600} style={{ marginVertical: 24 }} />
            ) : (
              <>
                <SelectRow
                  icon={<Building2 size={16} color={palette.gray400} />}
                  label={t('firmSelection')}
                  hint={isSwitch ? t('runtimeScope') : t('step02Scope')}
                  value={selectedFirmName}
                  colors={colors}
                  darkMode={darkMode}
                  onPress={() => {
                    setShowFirms((v) => !v);
                    setShowStores(false);
                    setShowPeriods(false);
                  }}
                />
                {showFirms && (
                  <View style={[styles.dropdown, listStyle]}>
                    {firms.length === 0 ? (
                      <Text style={{ color: colors.textMuted, padding: 12 }}>{t('noFirms')}</Text>
                    ) : (
                      firms.map((f) => (
                        <Pressable
                          key={f.firm_nr}
                          onPress={() => {
                            setFirmNr(f.firm_nr);
                            setShowFirms(false);
                          }}
                          style={[styles.dropItem, { borderBottomColor: listStyle.borderColor }]}
                        >
                          <Text style={[styles.dropTitle, { color: colors.text }]}>{f.name}</Text>
                          <Text style={styles.dropCode}>
                            {t('code')}: {f.firm_nr}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}

                <SelectRow
                  icon={<Store size={16} color={palette.gray400} />}
                  label={t('storeSelection')}
                  value={storeName || t('selectStore')}
                  colors={colors}
                  darkMode={darkMode}
                  onPress={() => {
                    setShowStores((v) => !v);
                    setShowFirms(false);
                    setShowPeriods(false);
                  }}
                />
                {showStores && (
                  <View style={[styles.dropdown, listStyle]}>
                    {stores.length === 0 ? (
                      <Text style={{ color: colors.textMuted, padding: 12 }}>{t('selectStore')}</Text>
                    ) : (
                      stores.map((s) => (
                        <Pressable
                          key={s.id}
                          onPress={() => {
                            setStoreId(s.id);
                            setStoreName(s.name);
                            setShowStores(false);
                          }}
                          style={[styles.dropItem, { borderBottomColor: listStyle.borderColor }]}
                        >
                          <Text style={[styles.dropTitle, { color: colors.text }]}>{s.name}</Text>
                          {s.region ? (
                            <Text style={styles.dropCode}>REGION: {s.region}</Text>
                          ) : null}
                        </Pressable>
                      ))
                    )}
                  </View>
                )}

                <SelectRow
                  icon={<Calendar size={16} color={palette.gray400} />}
                  label={t('periodSelection')}
                  value={
                    periods.find((p) => p.nr === periodNr)?.label ||
                    t('selectPeriod')
                  }
                  colors={colors}
                  darkMode={darkMode}
                  onPress={() => {
                    setShowPeriods((v) => !v);
                    setShowFirms(false);
                    setShowStores(false);
                  }}
                />
                {showPeriods && (
                  <View style={[styles.dropdown, listStyle]}>
                    {periods.map((p) => (
                      <Pressable
                        key={p.nr}
                        onPress={() => {
                          setPeriodNr(p.nr);
                          setShowPeriods(false);
                        }}
                        style={[styles.dropItem, { borderBottomColor: listStyle.borderColor }]}
                      >
                        <Text style={[styles.dropTitle, { color: colors.text }]}>{p.label}</Text>
                        <Text style={styles.dropCode}>
                          {t('code')}: {p.nr}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            <PrimaryButton
              label={isSwitch ? t('applyOrganization') : t('enterApp')}
              onPress={onConfirm}
              disabled={loading}
            />
            <PrimaryButton
              label={t('back')}
              onPress={() => navigation.goBack()}
              variant="ghost"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SelectRow({
  icon,
  label,
  hint,
  value,
  onPress,
  colors,
  darkMode,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  value: string;
  onPress: () => void;
  colors: { textMuted: string; inputBg: string; inputBorder: string; text: string };
  darkMode: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        {hint ? <Text style={styles.hintRight}>{hint}</Text> : null}
      </View>
      <Pressable
        onPress={onPress}
        style={[
          styles.select,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.inputBorder,
          },
        ]}
      >
        <View style={styles.selectIcon}>{icon}</View>
        <Text
          style={[styles.selectText, { color: colors.text }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 2, borderWidth: 1, overflow: 'hidden' },
  form: { padding: 24, gap: 16 },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 2,
  },
  tabActive: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 2,
    alignItems: 'center',
  },
  tabText: {
    color: palette.white,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  hintRight: {
    fontSize: 8,
    fontWeight: '700',
    color: palette.blue500,
    textTransform: 'uppercase',
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 14,
    paddingHorizontal: 16,
    paddingLeft: 44,
  },
  selectIcon: {
    position: 'absolute',
    left: 16,
  },
  selectText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  dropdown: {
    borderWidth: 2,
    borderRadius: 2,
    maxHeight: 200,
    overflow: 'hidden',
  },
  dropItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  dropTitle: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dropCode: {
    fontSize: 8,
    fontWeight: '700',
    opacity: 0.6,
    marginTop: 2,
  },
});
