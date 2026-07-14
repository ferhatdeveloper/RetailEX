import React, { useEffect, useState } from 'react';
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
import { palette } from '../theme/colors';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Organization'>;

export function OrganizationScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { colors, darkMode } = useThemeStore();
  const login = useAuthStore((s) => s.login);
  const { pendingUser, offlineDemo } = route.params;

  const [firms, setFirms] = useState<FirmRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[]>([]);
  const [firmNr, setFirmNr] = useState(pendingUser.firmNr || '001');
  const [storeId, setStoreId] = useState(pendingUser.storeId || '');
  const [storeName, setStoreName] = useState(pendingUser.storeName || '');
  const [periodNr, setPeriodNr] = useState(pendingUser.periodNr || '01');
  const [loading, setLoading] = useState(true);
  const [showFirms, setShowFirms] = useState(false);
  const [showStores, setShowStores] = useState(false);
  const [showPeriods, setShowPeriods] = useState(false);

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
        setStoreId('1');
        setStoreName('Merkez Mağaza');
        setLoading(false);
        return;
      }
      const [f, p] = await Promise.all([fetchFirms(), fetchPeriods(firmNr)]);
      if (cancelled) return;
      setFirms(f.length ? f : [{ firm_nr: firmNr, name: `Firma ${firmNr}` }]);
      setPeriods(p);
      const s = await fetchStores(firmNr);
      if (cancelled) return;
      setStores(s);
      if (s[0] && !storeId) {
        setStoreId(s[0].id);
        setStoreName(s[0].name);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [offlineDemo]);

  useEffect(() => {
    if (offlineDemo || loading) return;
    void (async () => {
      const [s, p] = await Promise.all([fetchStores(firmNr), fetchPeriods(firmNr)]);
      setStores(s);
      setPeriods(p);
      if (s[0]) {
        setStoreId(s[0].id);
        setStoreName(s[0].name);
      }
      if (p[0]) setPeriodNr(p[0].nr);
    })();
  }, [firmNr]);

  const selectedFirmName =
    firms.find((f) => f.firm_nr === firmNr)?.name || t('selectFirm');

  const onEnter = () => {
    login({
      ...pendingUser,
      firmNr,
      periodNr,
      storeId: storeId || null,
      storeName: storeName || null,
    });
  };

  const listStyle = {
    backgroundColor: darkMode ? palette.gray800 : palette.white,
    borderColor: darkMode ? palette.gray700 : palette.gray100,
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom']}>
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
            title={t('organization')}
            subtitle={`${pendingUser.fullName} · ${t('step02Scope')}`}
          />

          <View style={styles.form}>
            {/* Tab benzeri — web Login organization */}
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
                  hint={t('step02Scope')}
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
                    {stores.map((s) => (
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
                    ))}
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

            <PrimaryButton label={t('enterApp')} onPress={onEnter} disabled={loading} />
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
