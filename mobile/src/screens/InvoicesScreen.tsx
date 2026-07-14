import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Plus } from 'lucide-react-native';
import { ScreenHeader, SearchBar, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import {
  fetchInvoices,
  fetchInvoiceSummary,
  type InvoiceRow,
} from '../api/invoicesApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export function InvoicesScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const orgEpoch = useOrgEpoch();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [summary, setSummary] = useState({ salesTotal: 0, salesCount: 0, purchaseTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, sum] = await Promise.all([
        fetchInvoices({ search, limit: 100 }),
        fetchInvoiceSummary(),
      ]);
      setRows(list);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), search ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Faturalar"
        subtitle="Son 30 gün özeti + liste"
        right={
          <HeaderIconButton accent onPress={() => navigation.navigate('InvoiceForm')}>
            <Plus size={18} color={palette.white} />
          </HeaderIconButton>
        }
      />
      <View style={styles.kpiRow}>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.kpiLabel}>Satış</Text>
          <Text style={[styles.kpiVal, { color: palette.blue600 }]}>
            {formatMoney(summary.salesTotal)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>{summary.salesCount} fiş</Text>
        </View>
        <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={styles.kpiLabel}>Alış</Text>
          <Text style={[styles.kpiVal, { color: palette.orange500 }]}>
            {formatMoney(summary.purchaseTotal)}
          </Text>
        </View>
      </View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Fiş no, cari…" />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} />
          }
          ListEmptyComponent={<EmptyState message="Fatura bulunamadı" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('InvoiceDetail', { invoiceId: String(item.id) })
              }
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]}>
                    {item.fiche_no || '—'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                    {item.customer_name || 'Perakende'} · {item.date?.slice(0, 10) || '—'}
                  </Text>
                  <Text style={{ color: colors.textSubtle, fontSize: 10, marginTop: 2 }}>
                    {item.fiche_type || item.payment_method || item.status || ''}
                  </Text>
                </View>
                <Text style={styles.amount}>{formatMoney(item.net_amount)} ₺</Text>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  kpiRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10 },
  kpiLabel: { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  kpiVal: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14, fontWeight: '700' },
  amount: { fontSize: 14, fontWeight: '800', color: palette.blue600 },
});
