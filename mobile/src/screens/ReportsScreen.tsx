import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  BarChart3,
  AlertTriangle,
  TrendingUp,
  Package,
  Layers,
  Scale,
  FileText,
} from 'lucide-react-native';
import { ScreenHeader } from '../components/ScreenChrome';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import { navigateToModule } from '../navigation/navigateToModule';
import type { MainStackParamList } from '../navigation/types';

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 12, gap: 10, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: palette.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  sec: { fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 2, letterSpacing: 0.3 },
});

type StackReportRoute =
  | 'ReportSales'
  | 'ReportStock'
  | 'ReportMizan'
  | 'ReportAging'
  | 'ReportCariExtract'
  | 'ReportProductSales'
  | 'ReportCash';

type ReportEntry =
  | {
      id: string;
      title: string;
      desc: string;
      kind: 'stack';
      route: StackReportRoute;
      Icon: typeof TrendingUp;
    }
  | {
      id: string;
      title: string;
      desc: string;
      kind: 'module';
      screen: string;
      Icon: typeof TrendingUp;
    };

const LIVE_REPORTS: ReportEntry[] = [
  {
    id: 'sales',
    title: 'Günlük Satış Özeti',
    desc: 'Son 14 gün ciro, fiş ve en çok satanlar',
    kind: 'stack',
    route: 'ReportSales',
    Icon: TrendingUp,
  },
  {
    id: 'stock',
    title: 'Kritik Stok Raporu',
    desc: 'Min. stok altı malzemeler',
    kind: 'stack',
    route: 'ReportStock',
    Icon: AlertTriangle,
  },
  {
    id: 'mizan',
    title: 'Cari Bakiye Özeti',
    desc: 'Dönemsel müşteri / tedarikçi bakiyesi (yasal GL mizanı değil)',
    kind: 'stack',
    route: 'ReportMizan',
    Icon: Scale,
  },
  {
    id: 'aging',
    title: 'Cari Yaşlandırma',
    desc: 'Veresiye fişler — vade ve gecikme aralıkları',
    kind: 'stack',
    route: 'ReportAging',
    Icon: FileText,
  },
  {
    id: 'extract',
    title: 'Cari Ekstre',
    desc: 'Hesap hareketleri + çalışan bakiye (90 gün)',
    kind: 'stack',
    route: 'ReportCariExtract',
    Icon: FileText,
  },
  {
    id: 'product-sales',
    title: 'Ürün Satış Raporu',
    desc: 'Son 30 gün ürün bazlı miktar ve tutar',
    kind: 'stack',
    route: 'ReportProductSales',
    Icon: Package,
  },
  {
    id: 'cash',
    title: 'Kasa Raporu',
    desc: 'Son 30 gün kasa giriş / çıkış hareketleri',
    kind: 'stack',
    route: 'ReportCash',
    Icon: BarChart3,
  },
  {
    id: 'mat-reports',
    title: 'Malzeme / Envanter',
    desc: 'Stok durumu (kritik stok canlı)',
    kind: 'stack',
    route: 'ReportStock',
    Icon: Package,
  },
];

const MENU_REPORTS: ReportEntry[] = [
  {
    id: 'ai',
    title: 'AI Ürün Analitiği',
    desc: 'Menü: product-analytics → ürün satış raporu',
    kind: 'module',
    screen: 'product-analytics',
    Icon: Layers,
  },
  {
    id: 'profit',
    title: 'Karlılık Analizi',
    desc: 'Menü: profit-dashboard → ürün satış raporu',
    kind: 'module',
    screen: 'profit-dashboard',
    Icon: TrendingUp,
  },
  {
    id: 'bi',
    title: 'BI Dashboard & AI',
    desc: 'Menü: bi-dashboard',
    kind: 'module',
    screen: 'bi-dashboard',
    Icon: BarChart3,
  },
  {
    id: 'cat',
    title: 'Kategori grup satış/kar',
    desc: 'Menü: category-group-profit-report',
    kind: 'module',
    screen: 'category-group-profit-report',
    Icon: Layers,
  },
];

export function ReportsScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  const open = (r: ReportEntry) => {
    if (r.kind === 'stack') navigation.navigate(r.route);
    else navigateToModule(navigation, r.screen, r.title);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Raporlar" subtitle="Raporlar & Analiz" showBack={false} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.sec, { color: colors.textMuted }]}>CANLI</Text>
        {LIVE_REPORTS.map((r) => {
          const Icon = r.Icon;
          return (
            <Pressable
              key={r.id}
              onPress={() => open(r)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={styles.iconBox}>
                <Icon size={22} color={palette.blue600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>{r.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{r.desc}</Text>
              </View>
              <BarChart3 size={16} color={colors.textSubtle} />
            </Pressable>
          );
        })}
        <Text style={[styles.sec, { color: colors.textMuted }]}>MENÜ EŞLEMESİ</Text>
        {MENU_REPORTS.map((r) => {
          const Icon = r.Icon;
          return (
            <Pressable
              key={r.id}
              onPress={() => open(r)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={styles.iconBox}>
                <Icon size={22} color={palette.blue600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>{r.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{r.desc}</Text>
              </View>
              <BarChart3 size={16} color={colors.textSubtle} />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
