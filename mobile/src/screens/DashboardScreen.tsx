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
  BarChart3,
  Store,
  AlertTriangle,
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
import { tMenuBadge, tMenuItem, tMenuQuick, tMenuSection } from '../i18n/menuLabels';
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
import { ErrorBanner } from '../components/ScreenChrome';
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
  const [statsError, setStatsError] = useState<string | null>(null);

  const counts = useMemo(() => countMenuItems(), []);
  const labelOf = useCallback((item: MenuItem) => tMenuItem(t, item.id, item.label), [t]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setStatsError(null);
    try {
      setStats(await fetchDashboardStats());
    } catch (e) {
      setStats(null);
      setStatsError(e instanceof Error ? e.message : t('dashboardKpiError'));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch, t]);

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
    navigateToModule(navigation, item.screen, labelOf(item));
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
            <View style={styles.headerActions}>
              <ConnectivityBadge onDark compact />
              <Pressable onPress={logout} style={styles.logoutBtn} hitSlop={8}>
                <LogOut size={14} color={palette.white} />
              </Pressable>
            </View>
            <Text style={styles.dateText}>{dateStr}</Text>
            <Text style={styles.timeText}>{timeStr}</Text>
          </View>
        </View>
      </GradientHeader>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadStats()} />}
      >
        {/* KPI — web dashboardAPI.getStats() ile aynı metrikler */}
        {statsError ? (
          <ErrorBanner message={statsError} onRetry={() => void loadStats()} />
        ) : null}
        <View style={styles.kpiGrid}>
          {(
            [
              {
                key: 'revenue',
                label: t('kpiTodayRevenue'),
                value: formatMoney(stats?.totalRevenue ?? 0),
                sub: stats?.totalTransactions
                  ? `${stats.totalTransactions} ${t('kpiTransactions').toLowerCase()}`
                  : t('kpiToday'),
                color: palette.blue600,
              },
              {
                key: 'tx',
                label: t('kpiTransactions'),
                value: String(stats?.totalTransactions ?? 0),
                sub: t('kpiToday'),
                color: palette.indigo600,
              },
              {
                key: 'basket',
                label: t('kpiAvgBasket'),
                value: formatMoney(stats?.avgBasket ?? 0),
                sub: t('kpiPerCustomer'),
                color: palette.green600,
              },
              {
                key: 'stores',
                label: t('kpiActiveStores'),
                value: String(stats?.activeStores ?? 0),
                sub: t('kpiStoresOf', { total: stats?.totalStores ?? 0 }),
                color: palette.orange500,
              },
              {
                key: 'critical',
                label: t('kpiCriticalStock'),
                value: String(stats?.criticalAlerts ?? 0),
                sub:
                  (stats?.criticalAlerts ?? 0) > 0
                    ? t('kpiCriticalHint')
                    : t('dashboardNoCriticalStock'),
                color: (stats?.criticalAlerts ?? 0) > 0 ? palette.red500 : palette.green600,
              },
            ] as const
          ).map((item) => (
            <View
              key={item.key}
              style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '600' }}>{item.label}</Text>
              {loading && !stats ? (
                <ActivityIndicator size="small" color={item.color} style={{ marginTop: 6 }} />
              ) : (
                <>
                  <Text
                    style={{ color: item.color, fontSize: 15, fontWeight: '800', marginTop: 4 }}
                    numberOfLines={1}
                  >
                    {item.value}
                  </Text>
                  <Text style={{ color: colors.textSubtle, fontSize: 9, marginTop: 2 }} numberOfLines={1}>
                    {item.sub}
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>
        {!loading && !statsError && stats && stats.totalTransactions === 0 ? (
          <View
            style={[
              styles.kpiEmptyBanner,
              { backgroundColor: colors.backgroundAlt, borderColor: colors.cardBorder },
            ]}
          >
            <BarChart3 size={18} color={colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                {t('dashboardKpiEmptyTitle')}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {t('dashboardKpiEmpty')}
              </Text>
            </View>
          </View>
        ) : null}
        {!loading && !statsError && stats && stats.totalStores === 0 ? (
          <View
            style={[
              styles.kpiEmptyBanner,
              { backgroundColor: colors.backgroundAlt, borderColor: colors.cardBorder },
            ]}
          >
            <Store size={18} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }}>
              {t('dashboardNoStores')}
            </Text>
          </View>
        ) : null}
        {!loading && !statsError && stats && stats.criticalAlerts > 0 ? (
          <View
            style={[
              styles.kpiAlertBanner,
              { backgroundColor: palette.red100, borderColor: palette.red500 },
            ]}
          >
            <AlertTriangle size={16} color={palette.red500} />
            <Text style={{ color: palette.red500, fontSize: 11, flex: 1 }}>
              {t('dashboardCriticalStockBanner', { count: stats.criticalAlerts })}
            </Text>
          </View>
        ) : null}

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
          {QUICK_ACCESS.map((action) => {
            const qLabel = tMenuQuick(t, action.id, action.label);
            return (
              <Pressable
                key={action.id}
                onPress={() => navigateToModule(navigation, action.screen, qLabel)}
                style={[styles.chip, { backgroundColor: action.gradient[0] }]}
              >
                <Text style={styles.chipLabel} numberOfLines={1}>
                  {qLabel}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={[styles.menuMeta, { color: colors.textMuted }]}>
          {counts.sections} grup · {counts.items} öğe
          {' · '}
          {isCards ? t('menuViewCards') : t('menuViewList')}
        </Text>

        {/* Ana menü — grup başlıklı tek akış (liste varsayılan; kart = 3+ sütun) */}
        {MENU_SECTIONS.map((section) => (
          <View key={section.id} style={styles.sectionBlock}>
            <Text style={[styles.catTitle, { color: colors.text }]}>
              {tMenuSection(t, section.id, section.title)}
            </Text>
            {isCards ? (
              <View style={styles.cardsBlock}>
                <MenuCardGrid>
                  {section.items.map((item) => {
                    const itemLabel = labelOf(item);
                    const badge = tMenuBadge(t, item.badge);
                    return (
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
                            {itemLabel}
                          </Text>
                          <View style={menuCardStyles.footer}>
                            {badge ? (
                              <Text style={styles.badge} numberOfLines={1}>
                                {badge}
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
                      </MenuCardGridItem>
                    );
                  })}
                </MenuCardGrid>
                {/* Alt menü: kart modunda parent ile aynı 3 sütun grid — liste satırı değil */}
                {section.items.map((item) =>
                  expanded[item.id] && item.children?.length ? (
                    <View key={`${item.id}-children`} style={styles.childGridBlock}>
                      <Text style={[styles.childGridTitle, { color: colors.textMuted }]} numberOfLines={1}>
                        {labelOf(item)}
                      </Text>
                      <MenuCardGrid>
                        {item.children.map((child) => {
                          const childLabel = labelOf(child);
                          const childBadge = tMenuBadge(t, child.badge);
                          return (
                            <MenuCardGridItem key={child.id}>
                              <Pressable
                                onPress={() => navigateToModule(navigation, child.screen, childLabel)}
                                style={[
                                  menuCardStyles.card,
                                  {
                                    backgroundColor: colors.backgroundAlt,
                                    borderColor: colors.cardBorder,
                                  },
                                ]}
                              >
                                <Text
                                  style={[menuCardStyles.label, { color: colors.text }]}
                                  numberOfLines={2}
                                  ellipsizeMode="tail"
                                >
                                  {childLabel}
                                </Text>
                                <View style={menuCardStyles.footer}>
                                  {childBadge ? (
                                    <Text style={styles.badge} numberOfLines={1}>
                                      {childBadge}
                                    </Text>
                                  ) : (
                                    <View />
                                  )}
                                  <ChevronRight size={14} color={colors.textMuted} />
                                </View>
                              </Pressable>
                            </MenuCardGridItem>
                          );
                        })}
                      </MenuCardGrid>
                    </View>
                  ) : null,
                )}
              </View>
            ) : (
              section.items.map((item) => {
                const itemLabel = labelOf(item);
                const badge = tMenuBadge(t, item.badge);
                return (
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
                          {itemLabel.trim().charAt(0).toLocaleUpperCase('tr-TR')}
                        </Text>
                      </View>
                      <Text
                        style={{ color: colors.text, fontWeight: '600', flex: 1, fontSize: 13 }}
                        numberOfLines={1}
                      >
                        {itemLabel}
                      </Text>
                      {badge ? <Text style={styles.badge}>{badge}</Text> : null}
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
                      ? item.children.map((child) => {
                          const childLabel = labelOf(child);
                          const childBadge = tMenuBadge(t, child.badge);
                          return (
                            <Pressable
                              key={child.id}
                              onPress={() => navigateToModule(navigation, child.screen, childLabel)}
                              style={[
                                styles.childRowCompact,
                                { backgroundColor: colors.backgroundAlt, borderColor: colors.cardBorder },
                              ]}
                            >
                              <Text style={{ color: colors.text, fontSize: 12, flex: 1 }}>{childLabel}</Text>
                              {childBadge ? <Text style={styles.badge}>{childBadge}</Text> : null}
                              <ChevronRight size={12} color={colors.textMuted} />
                            </Pressable>
                          );
                        })
                      : null}
                  </View>
                );
              })
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
  headerRight: { alignItems: 'flex-end', gap: 4 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: { color: palette.white, fontSize: 18, fontWeight: '700' },
  headerSub: { color: palette.blue100, fontSize: 10, marginTop: 2 },
  firmLine: { color: 'rgba(191,219,254,0.95)', fontSize: 10, marginTop: 4 },
  dateText: { color: palette.blue100, fontSize: 10 },
  timeText: { color: palette.blue200, fontSize: 9 },
  logoutBtn: {
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
  kpiEmptyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 2,
  },
  kpiAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 2,
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
  cardsBlock: { gap: 8 },
  childGridBlock: { gap: 6 },
  childGridTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
