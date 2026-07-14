import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Layers } from 'lucide-react-native';
import { ScreenHeader } from '../components/ScreenChrome';
import {
  MenuCardGrid,
  MenuCardGridItem,
  menuCardStyles,
} from '../components/MenuCardGrid';
import { findMenuItem, resolveLiveRoute, type MenuItem } from '../config/menuConfig';
import { useThemeStore } from '../store/themeStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';
import { resolveInvoicesRouteParams } from '../api/invoiceFilters';
import {
  beautyRouteParams,
  communicationsRouteParams,
  financeRouteParams,
  financeDefinitionsRouteParams,
  navigateToModule,
  reportStockRouteParams,
  restaurantRouteParams,
  stockMovementsRouteParams,
  systemRouteParams,
} from '../navigation/navigateToModule';

type StackNav = NativeStackNavigationProp<MainStackParamList>;

/**
 * Menü öğesi için native host:
 * - Alt menü varsa `menuViewMode` ile kart (3 sütun) veya liste gösterir
 * - Canlı route’a map edilebilirse yönlendirir
 * - Aksi halde ilgili veri bağlamı + alt kısayollar
 */
export function ModuleScreen() {
  const { colors } = useThemeStore();
  const menuViewMode = usePreferencesStore((s) => s.menuViewMode);
  const isCards = menuViewMode === 'cards';
  const route = useRoute<RouteProp<MainStackParamList, 'Module'>>();
  const navigation = useNavigation<StackNav>();
  const { screenId, title: titleParam } = route.params;

  const item = useMemo(() => findMenuItem(screenId), [screenId]);
  const title = titleParam || item?.label || screenId;
  const children = item?.children ?? [];

  const relatedLive = resolveLiveRoute(screenId);

  useEffect(() => {
    if (relatedLive === 'Module') return;
    switch (relatedLive) {
      case 'Products':
        navigation.replace('Products');
        break;
      case 'Customers':
        navigation.replace('Customers');
        break;
      case 'Invoices': {
        const inv = resolveInvoicesRouteParams(screenId);
        navigation.replace('Invoices', {
          ...inv,
          kind: inv.filter?.preset === 'purchase' ? 'purchase' : inv.filter?.preset === 'sales' ? 'sales' : undefined,
        });
        break;
      }
      case 'Campaigns':
        navigation.replace('Campaigns');
        break;
      case 'Pricing':
        navigation.replace('Pricing');
        break;
      case 'POS':
        navigation.replace('Tabs', { screen: 'POS' });
        break;
      case 'Reports':
        navigation.replace('Tabs', { screen: 'Reports' });
        break;
      case 'ReportSales':
        navigation.replace('ReportSales');
        break;
      case 'ReportStock':
        navigation.replace('ReportStock', reportStockRouteParams(screenId));
        break;
      case 'ReportMizan':
        navigation.replace('ReportMizan');
        break;
      case 'ReportCariExtract':
        navigation.replace('ReportCariExtract');
        break;
      case 'ReportProductSales':
        navigation.replace('ReportProductSales');
        break;
      case 'ReportCash':
        navigation.replace('ReportCash');
        break;
      case 'Beauty':
        navigation.replace('Beauty', beautyRouteParams(screenId));
        break;
      case 'Wms':
        navigation.replace('Wms');
        break;
      case 'StockMovements':
        navigation.replace('StockMovements', stockMovementsRouteParams(screenId));
        break;
      case 'WmsCount':
        navigation.replace(
          'WmsCount',
          screenId === 'mobile-inventory-count' ? { autoCreate: true } : undefined,
        );
        break;
      case 'Restaurant':
        navigation.replace('Restaurant', restaurantRouteParams(screenId));
        break;
      case 'Delivery':
        navigation.replace('Delivery');
        break;
      case 'Finance':
        navigation.replace('Finance', financeRouteParams(screenId));
        break;
      case 'FinanceDefinitions':
        navigation.replace('FinanceDefinitions', financeDefinitionsRouteParams(screenId));
        break;
      case 'CashCollection':
        navigation.replace('CashCollection');
        break;
      case 'WmsTransfer':
        navigation.replace('WmsTransfer');
        break;
      case 'Organization':
        navigation.replace('Organization');
        break;
      case 'System':
        navigation.replace('System', systemRouteParams(screenId));
        break;
      case 'Communications':
        navigation.replace('Communications', communicationsRouteParams(screenId));
        break;
      case 'Notifications':
        navigation.replace('Notifications');
        break;
      case 'PrinterSettings':
        navigation.replace('PrinterSettings');
        break;
      default:
        break;
    }
  }, [relatedLive, navigation, screenId]);

  const openChild = (child: MenuItem) => {
    navigateToModule(navigation, child.screen, child.label);
  };

  const hints: Record<string, string> = {
    'material-definitions': 'Malzeme kartları — Malzemeler listesi + detay canlı.',
    'finance-cards': 'Cari hesaplar listesi + detay + son faturalar canlı.',
    salesinvoice: 'Satış faturaları listesi + detay (kalemler) canlı.',
    'material-reports': 'Stok raporları: kritik stok, min/max, değer, ambar durum, ekstre canlı.',
    stockmovements: 'Malzeme yönetim fişleri — ambar fişleri + fatura hareketleri canlı liste.',
    customreports: 'Raporlar sekmesi: satış özeti + kritik stok.',
    pricing: 'Fiyat listeleri + kampanyalar — `Pricing` (ürün fiyatları) ve `Campaigns` (liste+detay).',
    logistics: 'Teslimat / kurye — canlı konum + durum güncelleme (DeliveryScreen).',
    mizan: 'Cari bakiye mizanı canlı (erpReports.getCariBalances).',
    'customer-extract': 'Cari ekstre canlı (hareket + satış fallback).',
    'customer-call-plan': 'Müşteri arama planı — haftalık arşiv + cari plan canlı (FinanceDefinitions).',
    'payment-plans': 'Ödeme planları listesi canlı (logic.pay_plans / FinanceDefinitions).',
    'cost-centers': 'Masraf merkezleri canlı (FinanceDefinitions).',
    revenueexpense: 'Gider kayıtları okuma canlı (FinanceDefinitions).',
    salesorder: 'Satış siparişi — trcode 20 filtreli fatura listesi canlı.',
    purchase: 'Satınalma siparişi — trcode 21 filtreli liste canlı.',
    Teklifler: 'Teklif fişleri — trcode 30/31 filtreli liste canlı.',
    'waybill-sales': 'Satış irsaliyesi — trcode 10 filtreli liste canlı.',
    'stok-devir': 'Stok devir fişleri — StockMovements canlı liste.',
    cashbank: 'Kasa kartları + hareket listesi + basit giriş/çıkış canlı (FinanceScreen).',
    kasalar: 'Kasa işlemleri — hareket listesi + basit giriş/çıkış canlı (FinanceScreen).',
    'cash-slips': 'Kasa fişleri — hareket listesi + basit giriş canlı (FinanceScreen).',
    'financereports-cash': 'Kasa hareket raporu canlı (ReportCash).',
    whatsapp: 'WhatsApp entegrasyonu web’de; bildirim ayarları masaüstünden.',
    notifications: 'Kritik stok + vadesi geçmiş açık cari hatırlatmaları canlı.',
    usermanagement: 'Kullanıcı listesi canlı (public.users). Rol / log / kasa sekmeleri Sistem ekranında.',
    roleauth: 'Roller listesi canlı (public.roles). Yetki düzenleme web’de.',
    logaudit: 'Audit log listesi canlı (public.audit_logs).',
    pendingposdevices: 'Kasa cihaz kayıtları canlı (pos_terminal_registrations).',
    backuprestore: 'Tam yedekleme DeskApp’te; mobil şema migration özeti gösterir.',
  };

  const shortcuts: { route: keyof MainStackParamList; label: string }[] = [
    { route: 'Products', label: 'Ürünler' },
    { route: 'Customers', label: 'Cariler' },
    { route: 'Invoices', label: 'Faturalar' },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} subtitle={screenId} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.info, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.iconBox}>
            <Layers size={28} color={palette.blue600} />
          </View>
          <Text style={[styles.infoTitle, { color: colors.text }]}>{title}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            {hints[screenId] ||
              (children.length
                ? 'Alt menü öğelerini seçin. Canlı modüller doğrudan veri çeker.'
                : 'Bu modül menüde kayıtlı. Web ile aynı ekran id’si; native form akışı aşamalı ekleniyor. İlgili canlı listeler (ürün, cari, fatura, POS, rapor) Hızlı erişim veya Diğer menüsünden açılabilir.')}
          </Text>
        </View>

        {children.length > 0 ? (
          <>
            <Text style={[styles.sec, { color: colors.text }]}>Alt menü</Text>
            {isCards ? (
              <MenuCardGrid>
                {children.map((c) => (
                  <MenuCardGridItem key={c.id}>
                    <Pressable
                      onPress={() => openChild(c)}
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
                        {c.label}
                      </Text>
                      <View style={menuCardStyles.footer}>
                        {c.badge ? (
                          <Text style={styles.badge} numberOfLines={1}>
                            {c.badge}
                          </Text>
                        ) : (
                          <View />
                        )}
                        <ChevronRight size={14} color={colors.textMuted} />
                      </View>
                    </Pressable>
                  </MenuCardGridItem>
                ))}
              </MenuCardGrid>
            ) : (
              children.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => openChild(c)}
                  style={[styles.rowCompact, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: palette.blue100 }]}>
                    <Text style={styles.rowIconLetter}>
                      {c.label.trim().charAt(0).toLocaleUpperCase('tr-TR')}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{c.label}</Text>
                    <Text style={{ color: colors.textSubtle, fontSize: 10 }}>{c.screen}</Text>
                  </View>
                  {c.badge ? <Text style={styles.badge}>{c.badge}</Text> : null}
                  <ChevronRight size={14} color={colors.textMuted} />
                </Pressable>
              ))
            )}
          </>
        ) : (
          <View style={styles.shortcuts}>
            <Text style={[styles.sec, { color: colors.text }]}>İlgili canlı ekranlar</Text>
            {isCards ? (
              <MenuCardGrid>
                {shortcuts.map((s) => (
                  <MenuCardGridItem key={s.route}>
                    <Pressable
                      onPress={() => {
                        if (s.route === 'Products') navigation.navigate('Products');
                        else if (s.route === 'Customers') navigation.navigate('Customers');
                        else if (s.route === 'Invoices') navigation.navigate('Invoices');
                      }}
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
                        {s.label}
                      </Text>
                      <View style={menuCardStyles.footer}>
                        <View />
                        <ChevronRight size={14} color={colors.textMuted} />
                      </View>
                    </Pressable>
                  </MenuCardGridItem>
                ))}
                <MenuCardGridItem>
                  <Pressable
                    onPress={() => navigation.navigate('Tabs', { screen: 'POS' })}
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
                      POS
                    </Text>
                    <View style={menuCardStyles.footer}>
                      <View />
                      <ChevronRight size={14} color={colors.textMuted} />
                    </View>
                  </Pressable>
                </MenuCardGridItem>
                <MenuCardGridItem>
                  <Pressable
                    onPress={() => navigation.navigate('Tabs', { screen: 'Reports' })}
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
                      Raporlar
                    </Text>
                    <View style={menuCardStyles.footer}>
                      <View />
                      <ChevronRight size={14} color={colors.textMuted} />
                    </View>
                  </Pressable>
                </MenuCardGridItem>
              </MenuCardGrid>
            ) : (
              <>
                {shortcuts.map((s) => (
                  <Pressable
                    key={s.route}
                    onPress={() => {
                      if (s.route === 'Products') navigation.navigate('Products');
                      else if (s.route === 'Customers') navigation.navigate('Customers');
                      else if (s.route === 'Invoices') navigation.navigate('Invoices');
                    }}
                    style={[styles.rowCompact, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{s.label}</Text>
                    <ChevronRight size={14} color={colors.textMuted} />
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => navigation.navigate('Tabs', { screen: 'POS' })}
                  style={[styles.rowCompact, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>POS</Text>
                  <ChevronRight size={14} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate('Tabs', { screen: 'Reports' })}
                  style={[styles.rowCompact, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>Raporlar</Text>
                  <ChevronRight size={14} color={colors.textMuted} />
                </Pressable>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 12, gap: 8, paddingBottom: 40 },
  info: { borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center', gap: 8 },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: palette.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { fontSize: 16, fontWeight: '800' },
  sec: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  rowCompact: {
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
  badge: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.blue600,
    backgroundColor: palette.blue100,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  shortcuts: { gap: 8 },
});
