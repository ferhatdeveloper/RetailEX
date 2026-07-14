import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Pencil, HandCoins, FileText } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner, EmptyState } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import {
  fetchCustomerById,
  fetchCustomerRecentSales,
  type CustomerDetail,
} from '../api/customersApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export function CustomerDetailScreen() {
  const { colors } = useThemeStore();
  const route = useRoute<RouteProp<MainStackParamList, 'CustomerDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { customerId } = route.params;
  const [row, setRow] = useState<CustomerDetail | null>(null);
  const [sales, setSales] = useState<
    Awaited<ReturnType<typeof fetchCustomerRecentSales>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, s] = await Promise.all([
        fetchCustomerById(customerId),
        fetchCustomerRecentSales(customerId),
      ]);
      setRow(c);
      setSales(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Cari Detay"
        subtitle={row?.code || customerId.slice(0, 8)}
        right={
          row ? (
            <HeaderIconButton
              accent
              onPress={() => navigation.navigate('CustomerForm', { customerId })}
            >
              <Pencil size={16} color={palette.white} />
            </HeaderIconButton>
          ) : (
            <View style={{ width: 36 }} />
          )
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && !row ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : !row ? (
        <EmptyState message="Cari bulunamadı" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        >
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.name, { color: colors.text }]}>{row.name}</Text>
            <Text
              style={{
                marginTop: 8,
                fontSize: 20,
                fontWeight: '800',
                color: row.balance < 0 ? palette.red500 : palette.green600,
              }}
            >
              {formatMoney(row.balance)} ₺
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>Bakiye</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            {(
              [
                ['Kod', row.code || '—'],
                ['Telefon', row.phone || '—'],
                ['E-posta', row.email || '—'],
                ['Şehir', row.city || '—'],
                ['İlçe', row.district || '—'],
                ['Adres', row.address || '—'],
                ['Vergi no', row.tax_no || '—'],
                ['Vergi dairesi', row.tax_office || '—'],
                ['Durum', row.is_active ? 'Aktif' : 'Pasif'],
              ] as const
            ).map(([label, value]) => (
              <View key={label} style={[styles.row, { borderBottomColor: colors.cardBorder }]}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                  {label}
                </Text>
                <Text
                  style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right' }}
                  numberOfLines={3}
                >
                  {value}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                navigation.navigate('CashCollection', {
                  customerId,
                  openCreate: true,
                })
              }
              style={[styles.actionBtn, { backgroundColor: palette.green600 }]}
            >
              <HandCoins size={18} color={palette.white} />
              <Text style={styles.actionLabel}>Tahsilat / Ödeme</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                navigation.navigate('ReportCariExtract', {
                  accountId: customerId,
                  cardType: 'customer',
                })
              }
              style={[styles.actionBtn, { backgroundColor: palette.blue600 }]}
            >
              <FileText size={18} color={palette.white} />
              <Text style={styles.actionLabel}>Hesap ekstresi</Text>
            </Pressable>
          </View>

          <Text style={[styles.sec, { color: colors.text }]}>Son faturalar</Text>
          {sales.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Kayıt yok</Text>
          ) : (
            sales.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: s.id })}
                style={[styles.saleRow, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{s.fiche_no || '—'}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    {s.date?.slice(0, 10) || '—'}
                  </Text>
                </View>
                <Text style={{ color: palette.blue600, fontWeight: '800' }}>
                  {formatMoney(s.net_amount)} ₺
                </Text>
                <ChevronRight size={16} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  name: { fontSize: 18, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sec: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionLabel: { color: palette.white, fontWeight: '700', fontSize: 12 },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
});
