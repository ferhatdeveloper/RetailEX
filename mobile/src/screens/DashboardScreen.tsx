import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  LogOut,
  ChevronDown,
  ChevronRight,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GradientHeader } from '../components/GradientHeader';
import { ConnectivityBadge } from '../components/ConnectivityBadge';
import {
  MenuCardGrid,
  MenuCardGridItem,
  menuCardStyles,
} from '../components/MenuCardGrid';
import { useThemeStore } from '../store/themeStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { useAuthStore } from '../store/authStore';
import { localeTagForLanguage } from '../i18n/languages';
import { palette } from '../theme/colors';
import {
  MENU_SECTIONS,
  QUICK_ACCESS,
  countMenuItems,
  type MenuItem,
} from '../config/menuConfig';
import { navigateToModule } from '../navigation/navigateToModule';
import { fetchDashboardStats, type DashboardStats } from '../api/dashboardApi';
import { formatMoney } from '../api/erpTables';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import type { MainStackParamList } from '../navigation/types';

export function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { colors } = useThemeStore();
  const menuViewMode = usePreferencesStore((s) => s.menuViewMode);
  const isCards = menuViewMode === 'cards';
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const orgEpoch = useOrgEpoch();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const counts = useMemo(() => countMenuItems(), []);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await fetchDashboardStats());
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const now = new Date();
  const locale = localeTagForLanguage(i18n.language);
  const dateStr = now.toLocaleDateString(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString(locale);
  const firmPeriod = [user?.firmNr, user?.periodNr, user?.storeName].filter(Boolean).join(' · ');

  const openItem = (item: MenuItem) => {
    if (item.children?.length) {
      setExpanded((e) => ({ ...e, [item.id]: !e[item.id] }));
      return;
    }
    navigateToModule(navigation, item.screen, item.label);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <GradientHeader compact>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>{t('dashboard')}</Text>
            <Text style={styles.headerSub}>{t('welcomeDashboard')}</Text>
            {firmPeriod ? (
              <Pressable onPress={() => navigation.navigate('Organization')} hitSlop={6}>
                <Text style={styles.firmLine} numberOfLines={1}>
                  {firmPeriod}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.headerRight}>
            <ConnectivityBadge onDark compact />
            <Text style={styles.dateText}>{dateStr}</Text>
            <Text style={styles.timeText}>{timeStr}</Text>
            <Pressable onPress={logout} style={styles.logoutBtn} hitSlop={8}>
              <LogOut size={14} color={palette.white} />
            </Pressable>
          </View>
        </View>
      </GradientHeader>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadStats()} />}
      >
        {/* KPI */}
        <View style={styles.kpiGrid}>
          {(
            [
              ['Bugün ciro', formatMoney(stats?.totalRevenue ?? 0), palette.blue600],
              ['Fiş', String(stats?.totalTransactions ?? 0), palette.indigo600],
              ['Ort. sepet', formatMoney(stats?.avgBasket ?? 0), palette.green600],
              ['Kritik stok', String(stats?.criticalAlerts ?? 0), palette.red500],
              ['Ürün', String(stats?.productCount ?? 0), palette.green500],
              ['Cari', String(stats?.customerCount ?? 0), palette.purple500],
            ] as const
          ).map(([label, value, color]) => (
            <View
              key={label}
              style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>{label}</Text>
              {loading && !stats ? (
                <ActivityIndicator size="small" color={color} style={{ marginTop: 6 }} />
              ) : (
                <Text style={{ color, fontSize: 15, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                  {value}
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* Hızlı erişim — yalnızca kompakt chip; ana menünün ikinci kopyası değil */}
        <View style={styles.sectionHead}>
          <Zap size={16} color={palette.blue600} />
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('quickAccess')}</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {QUICK_ACCESS.map((action) => (
            <Pressable
              key={action.id}
              onPress={() => navigateToModule(navigation, action.screen, action.label)}
              style={[styles.chip, { backgroundColor: action.gradient[0] }]}
            >
              <Text style={styles.chipLabel} numberOfLines={1}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={[styles.menuMeta, { color: colors.textMuted }]}>
          {counts.sections} grup · {counts.items} öğe
          {' · '}
          {isCards ? t('menuViewCards') : t('menuViewList')}
        </Text>

        {/* Ana menü — grup başlıklı tek akış (liste varsayılan; kart = 3+ sütun) */}
        {MENU_SECTIONS.map((section) => (
          <View key={section.id} style={styles.sectionBlock}>
            <Text style={[styles.catTitle, { color: colors.text }]}>{section.title}</Text>
            {isCards ? (
              <MenuCardGrid>
                {section.items.map((item) => (
                  <MenuCardGridItem key={item.id}>
                    <Pressable
                      onPress={() => openItem(item)}
                      style={[
                        menuCardStyles.card,
                        { backgroundColor: colors.card, borderColor: colors.cardBorder },
                      ]}
                    >
                      <Text
                        style={[menuCardStyles.label, { color: colors.text }]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                      >
                        {item.label}
                      </Text>
                      <View style={menuCardStyles.footer}>
                        {item.badge ? (
                          <Text style={styles.badge} numberOfLines={1}>
                            {item.badge}
                          </Text>
                        ) : (
                          <View />
                        )}
                        {item.children?.length ? (
                          expanded[item.id] ? (
                            <ChevronDown size={14} color={colors.textMuted} />
                          ) : (
                            <ChevronRight size={14} color={colors.textMuted} />
                          )
                        ) : (
                          <ChevronRight size={14} color={colors.textSubtle} />
                        )}
                      </View>
                    </Pressable>
                    {expanded[item.id] && item.children ? (
                      <View style={styles.childCardWrap}>
                        {item.children.map((child) => (
                          <Pressable
                            key={child.id}
                            onPress={() => navigateToModule(navigation, child.screen, child.label)}
                            style={[
                              styles.childCard,
                              { backgroundColor: colors.backgroundAlt, borderColor: colors.cardBorder },
                            ]}
                          >
                            <Text style={{ color: colors.text, fontSize: 11, flex: 1 }} numberOfLines={2}>
                              {child.label}
                            </Text>
                            {child.badge ? <Text style={styles.badge}>{child.badge}</Text> : null}
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </MenuCardGridItem>
                ))}
              </MenuCardGrid>
            ) : (
              section.items.map((item) => (
                <View key={item.id}>
                  <Pressable
                    onPress={() => openItem(item)}
                    style={[
                      styles.menuRowCompact,
                      { backgroundColor: colors.card, borderColor: colors.cardBorder },
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: palette.blue100 }]}>
                      <Text style={styles.rowIconLetter}>
                        {item.label.trim().charAt(0).toLocaleUpperCase('tr-TR')}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text, fontWeight: '600', flex: 1, fontSize: 13 }} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
                    {item.children?.length ? (
                      expanded[item.id] ? (
                        <ChevronDown size={14} color={colors.textMuted} />
                      ) : (
                        <ChevronRight size={14} color={colors.textMuted} />
                      )
                    ) : (
                      <ChevronRight size={14} color={colors.textSubtle} />
                    )}
                  </Pressable>
                  {expanded[item.id] && item.children
                    ? item.children.map((child) => (
                        <Pressable
                          key={child.id}
                          onPress={() => navigateToModule(navigation, child.screen, child.label)}
                          style={[
                            styles.childRowCompact,
                            { backgroundColor: colors.backgroundAlt, borderColor: colors.cardBorder },
                          ]}
                        >
                          <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>{child.label}</Text>
                          {child.badge ? <Text style={styles.badge}>{child.badge}</Text> : null}
                          <ChevronRight size={12} color={colors.textMuted} />
                        </Pressable>
                      ))
                    : null}
                </View>
              ))
            )}
          </View>
        ))}

        <View
          style={[
            styles.infoCard,
            { backgroundColor: colors.card, borderColor: colors.cardBorder },
          ]}
        >
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            {user?.fullName || user?.username}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            {user?.roleName || 'User'} · {user?.username}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 2,
  },
  headerLeft: { flex: 1, minWidth: 0 },
  headerRight: { alignItems: 'flex-end', gap: 2 },
  headerTitle: { color: palette.white, fontSize: 18, fontWeight: '700' },
  headerSub: { color: palette.blue100, fontSize: 10, marginTop: 2 },
  firmLine: { color: 'rgba(191,219,254,0.95)', fontSize: 10, marginTop: 4 },
  dateText: { color: palette.blue100, fontSize: 10 },
  timeText: { color: palette.blue200, fontSize: 9 },
  logoutBtn: {
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
  },
  body: { padding: 12, gap: 8, paddingBottom: 48 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: {
    width: '31%',
    flexGrow: 1,
    minWidth: '30%',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '600' },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    maxWidth: 140,
  },
  chipLabel: {
    color: palette.white,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionBlock: { marginTop: 4 },
  childCardWrap: { marginTop: 4, gap: 4 },
  childCard: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  menuMeta: { fontSize: 11, marginTop: 2 },
  catTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginTop: 10,
  },
  menuRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 4,
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconLetter: {
    fontSize: 12,
    fontWeight: '800',
    color: palette.blue600,
  },
  childRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 3,
    marginLeft: 12,
  },
  badge: {
    fontSize: 9,
    fontWeight: '800',
    color: palette.blue600,
    backgroundColor: palette.blue100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  infoTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
});
