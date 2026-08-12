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
import { isLastOrgValidAgainstLists, saveLastOrg } from '../api/lastOrgPrefs';
import { APP_DEFAULT_CURRENCY, normalizeCurrencyCode } from '../utils/currency';
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
  /** Özet görünümü — dolu seçimlerde SelectRow yerine özet + Devam/Değiştir */
  const [editingOrg, setEditingOrg] = useState(false);
  const storeIdRef = useRef(storeId);
  const periodNrRef = useRef(periodNr);
  const firmNrRef = useRef(firmNr);
  const didAutoContinueRef = useRef(false);
  /** lastOrg çekilen listelerde doğrulandı → otomatik giriş */
  const lastOrgValidatedRef = useRef(false);
  const initialFirmLoadDoneRef = useRef(false);
  /** null = henüz ilk yükleme sonrası senkron yok; firma değişiminde yeniden çek */
  const syncedFirmNrRef = useRef<string | null>(null);
  storeIdRef.current = storeId;
  periodNrRef.current = periodNr;
  firmNrRef.current = firmNr;

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
        setFirmNr('001');
        if (!storeIdRef.current) {
          setStoreId('1');
          setStoreName('Merkez Mağaza');
        }
        if (!periodNrRef.current) {
          setPeriodNr('02');
        }
        lastOrgValidatedRef.current = isLastOrgValidAgainstLists(
          {
            firmNr: firmNrRef.current || '001',
            periodNr: periodNrRef.current || '02',
            storeId: storeIdRef.current || '1',
          },
          {
            firms: [{ firm_nr: '001' }],
            stores: [{ id: '1' }],
            periods: [{ nr: '01' }, { nr: '02' }],
          },
        );
        initialFirmLoadDoneRef.current = true;
        setLoading(false);
        return;
      }
      const fn = firmNrRef.current;
      const [f, p, s] = await Promise.all([
        fetchFirms(),
        fetchPeriods(fn),
        fetchStores(fn),
      ]);
      if (cancelled) return;
      const firmList = f.length ? f : [{ firm_nr: fn, name: `Firma ${fn}` }];
      setFirms(firmList);
      // Tek firma → otomatik seç (dropdown açmaya gerek yok)
      let activeFirm = fn;
      if (firmList.length === 1) {
        activeFirm = firmList[0]!.firm_nr;
        setFirmNr(activeFirm);
      } else if (fn && firmList.some((x) => String(x.firm_nr) === String(fn))) {
        activeFirm = fn;
      } else if (firmList[0]) {
        activeFirm = firmList[0].firm_nr;
        setFirmNr(activeFirm);
      }
      let periodsForFirm = p;
      let storesForFirm = s;
      if (activeFirm !== fn) {
        const [p2, s2] = await Promise.all([
          fetchPeriods(activeFirm),
          fetchStores(activeFirm),
        ]);
        if (cancelled) return;
        periodsForFirm = p2;
        storesForFirm = s2;
      }
      setPeriods(periodsForFirm);
      setStores(storesForFirm);

      const seedStore = storeIdRef.current;
      const seedPeriod = periodNrRef.current;
      const keepStore = seedStore
        ? storesForFirm.find((x) => String(x.id) === String(seedStore))
        : undefined;
      if (keepStore) {
        setStoreId(String(keepStore.id));
        setStoreName(keepStore.name);
      } else if (storesForFirm.length === 1) {
        setStoreId(String(storesForFirm[0]!.id));
        setStoreName(storesForFirm[0]!.name);
      } else if (storesForFirm.length && !seedStore) {
        setStoreId(String(storesForFirm[0]!.id));
        setStoreName(storesForFirm[0]!.name);
      } else if (storesForFirm.length) {
        setStoreId(String(storesForFirm[0]!.id));
        setStoreName(storesForFirm[0]!.name);
      } else {
        setStoreId('');
        setStoreName('');
      }

      // R12: seed boş/geçersizse sunucudaki en yüksek (son) aktif dönem
      const keepPeriod = seedPeriod
        ? periodsForFirm.find((x) => String(x.nr) === String(seedPeriod))
        : undefined;
      if (keepPeriod) {
        setPeriodNr(keepPeriod.nr);
      } else if (periodsForFirm.length) {
        setPeriodNr(periodsForFirm[periodsForFirm.length - 1]!.nr);
      }

      // lastOrg yalnızca seed'teki üçlü listelerde duruyorsa otomatik giriş
      lastOrgValidatedRef.current = isLastOrgValidAgainstLists(
        {
          firmNr: seed?.firmNr || '',
          periodNr: seed?.periodNr || '',
          storeId: seed?.storeId || null,
        },
        { firms: firmList, stores: storesForFirm, periods: periodsForFirm },
      );

      initialFirmLoadDoneRef.current = true;
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // İlk yükleme — firma değişince aşağıdaki effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineDemo]);

  useEffect(() => {
    if (offlineDemo || loading || !initialFirmLoadDoneRef.current) return;
    // İlk yükleme zaten firm/store/period doldurdu; yalnızca kullanıcı firma değişince yenile
    if (syncedFirmNrRef.current === null) {
      syncedFirmNrRef.current = firmNr;
      return;
    }
    if (syncedFirmNrRef.current === firmNr) return;
    syncedFirmNrRef.current = firmNr;
    lastOrgValidatedRef.current = false;
    let cancelled = false;
    void (async () => {
      const [s, p] = await Promise.all([fetchStores(firmNr), fetchPeriods(firmNr)]);
      if (cancelled) return;
      setStores(s);
      setPeriods(p);
      const keepStore = s.find((x) => String(x.id) === String(storeIdRef.current));
      if (keepStore) {
        setStoreId(String(keepStore.id));
        setStoreName(keepStore.name);
      } else if (s.length === 1) {
        setStoreId(String(s[0]!.id));
        setStoreName(s[0]!.name);
      } else if (s[0]) {
        setStoreId(String(s[0].id));
        setStoreName(s[0].name);
      } else {
        setStoreId('');
        setStoreName('');
      }
      if (!p.find((x) => String(x.nr) === String(periodNrRef.current)) && p.length) {
        setPeriodNr(p[p.length - 1]!.nr);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firmNr, offlineDemo, loading]);

  const onConfirmRef = useRef<() => void>(() => {});
  onConfirmRef.current = () => {
    if (!seed) return;
    const selected = firms.find((f) => f.firm_nr === firmNr);
    const anaParaBirimi = normalizeCurrencyCode(
      selected?.ana_para_birimi || seed.anaParaBirimi || APP_DEFAULT_CURRENCY,
    );
    const raporlamaParaBirimi = normalizeCurrencyCode(
      selected?.raporlama_para_birimi ||
        selected?.ana_para_birimi ||
        seed.raporlamaParaBirimi ||
        anaParaBirimi,
    );
    const org = {
      firmNr,
      periodNr: periodNr || '01',
      storeId: storeId || null,
      storeName: storeName || null,
      anaParaBirimi,
      raporlamaParaBirimi,
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

  // Login: lastOrg listelerde doğrulandıysa üç dropdown’a zorlamadan otomatik giriş
  useEffect(() => {
    if (loading || isSwitch || !seed || didAutoContinueRef.current) return;
    if (!lastOrgValidatedRef.current) return;
    if (!firmNr || !periodNr || !storeId) return;
    const timer = setTimeout(() => {
      if (didAutoContinueRef.current) return;
      didAutoContinueRef.current = true;
      onConfirmRef.current();
    }, 0);
    return () => clearTimeout(timer);
  }, [loading, isSwitch, seed, firmNr, periodNr, storeId]);

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
  const selectedPeriodLabel =
    periods.find((p) => p.nr === periodNr)?.label || t('selectPeriod');

  const onConfirm = () => onConfirmRef.current();

  const selectionsReady = !loading && !!firmNr && !!periodNr && !!storeId;
  const showSummary = selectionsReady && !editingOrg;

  const openDropdown = (which: 'firms' | 'stores' | 'periods') => {
    setEditingOrg(true);
    setShowFirms(which === 'firms' ? (v) => !v : false);
    setShowStores(which === 'stores' ? (v) => !v : false);
    setShowPeriods(which === 'periods' ? (v) => !v : false);
  };

  const listStyle = {
    backgroundColor: darkMode ? palette.gray800 : palette.white,
    borderColor: darkMode ? palette.gray700 : palette.gray100,
  };

  const subtitle = isSwitch
    ? `${seed.fullName} · ${t('changeOrganizationHint')}`
    : `${seed.fullName} · ${t('step02Scope')}`;

  const continueLabel = isSwitch ? t('applyOrganization') : t('enterApp');

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
            ) : showSummary ? (
              <>
                <View
                  style={[
                    styles.summaryBox,
                    {
                      backgroundColor: darkMode ? palette.gray800 : palette.gray50,
                      borderColor: darkMode ? palette.gray700 : palette.gray200,
                    },
                  ]}
                >
                  <SummaryLine
                    icon={<Building2 size={16} color={palette.blue500} />}
                    label={t('firmSelection')}
                    value={selectedFirmName}
                    colors={colors}
                  />
                  <SummaryLine
                    icon={<Store size={16} color={palette.blue500} />}
                    label={t('storeSelection')}
                    value={storeName || t('selectStore')}
                    colors={colors}
                  />
                  <SummaryLine
                    icon={<Calendar size={16} color={palette.blue500} />}
                    label={t('periodSelection')}
                    value={selectedPeriodLabel}
                    colors={colors}
                  />
                </View>
                <PrimaryButton label={continueLabel} onPress={onConfirm} />
                <PrimaryButton
                  label="Değiştir"
                  onPress={() => {
                    setEditingOrg(true);
                    setShowFirms(false);
                    setShowStores(false);
                    setShowPeriods(false);
                  }}
                  variant="ghost"
                />
              </>
            ) : (
              <>
                <SelectRow
                  icon={<Building2 size={16} color={palette.gray400} />}
                  label={t('firmSelection')}
                  hint={isSwitch ? t('runtimeScope') : t('step02Scope')}
                  value={selectedFirmName}
                  colors={colors}
                  darkMode={darkMode}
                  onPress={() => openDropdown('firms')}
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
                  onPress={() => openDropdown('stores')}
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
                            setStoreId(String(s.id));
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
                  value={selectedPeriodLabel}
                  colors={colors}
                  darkMode={darkMode}
                  onPress={() => openDropdown('periods')}
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

                <PrimaryButton
                  label={continueLabel}
                  onPress={onConfirm}
                  disabled={loading || !firmNr || !periodNr || !storeId}
                />
                {selectionsReady ? (
                  <PrimaryButton
                    label="Özet"
                    onPress={() => {
                      setEditingOrg(false);
                      setShowFirms(false);
                      setShowStores(false);
                      setShowPeriods(false);
                    }}
                    variant="ghost"
                  />
                ) : null}
              </>
            )}

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

function SummaryLine({
  icon,
  label,
  value,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  colors: { textMuted: string; text: string };
}) {
  return (
    <View style={styles.summaryLine}>
      <View style={styles.summaryIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text style={[styles.summaryValue, { color: colors.text }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
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
  summaryBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 14,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryIcon: {
    marginTop: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
  },
});
