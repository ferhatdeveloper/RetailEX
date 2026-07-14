import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ChevronRight, Plus, ScanLine } from 'lucide-react-native';
import { ScreenHeader, SearchBar, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import {
  fetchInvoices,
  fetchInvoiceSummary,
  fetchInvoiceFilterSummary,
  invoiceFilterLabel,
  invoiceFormParamsFromFilter,
  invoiceKindLabel,
  isPurchaseInvoice,
  trcodeBadgeLabel,
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
  const route = useRoute<RouteProp<MainStackParamList, 'Invoices'>>();
  const orgEpoch = useOrgEpoch();

  const listFilter = route.params?.filter;
  const screenTitle = route.params?.title ?? 'Faturalar';
  const filterLabel = invoiceFilterLabel(listFilter);
  const isReturnList =
    listFilter?.preset === 'sales-return' || listFilter?.preset === 'purchase-return';
  const showGeneralKpi = !listFilter || listFilter.preset === 'all';

  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [summary, setSummary] = useState({
    salesTotal: 0,
    salesCount: 0,
    purchaseTotal: 0,
    purchaseCount: 0,
  });
  const [filterStats, setFilterStats] = useState({ count: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subtitle = useMemo(() => {
    if (isReturnList && filterLabel) {
      return `TRCODE filtresi · ${filterLabel}`;
    }
    if (filterLabel) return filterLabel;
    return 'Son 30 gün özeti + liste';
  }, [filterLabel, isReturnList]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const fetchOpts = {
        search,
        limit: 100,
        kind: route.params?.kind,
        filter: listFilter,
      } satisfies Parameters<typeof fetchInvoices>[0];

      if (showGeneralKpi) {
        const [list, sum] = await Promise.all([
          fetchInvoices(fetchOpts),
          fetchInvoiceSummary(),
        ]);
        setRows(list);
        setSummary(sum);
        setFilterStats({ count: 0, total: 0 });
      } else {
        const [list, stats] = await Promise.all([
          fetchInvoices(fetchOpts),
          fetchInvoiceFilterSummary(listFilter),
        ]);
        setRows(list);
        setFilterStats(stats);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, orgEpoch, listFilter, route.params?.kind, showGeneralKpi]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), search ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const emptyMessage =
    listFilter?.preset === 'sales-return'
      ? 'Satış iade faturası bulunamadı'
      : listFilter?.preset === 'purchase-return'
        ? 'Alış iade faturası bulunamadı'
        : listFilter?.preset === 'purchase'
          ? 'Alış faturası bulunamadı'
          : listFilter?.preset === 'service-given'
            ? 'Verilen hizmet fişi bulunamadı'
            : listFilter?.preset === 'service-received'
              ? 'Alınan hizmet fişi bulunamadı'
              : listFilter?.preset === 'waybill'
                ? 'İrsaliye bulunamadı'
                : listFilter?.preset === 'order'
                  ? 'Sipariş bulunamadı'
                  : listFilter?.preset === 'quote'
                    ? 'Teklif bulunamadı'
                    : 'Fatura bulunamadı';

  const formFromFilter = useMemo(
    () => invoiceFormParamsFromFilter(listFilter),
    [listFilter],
  );

  const showSalesAdd = !listFilter || listFilter.preset === 'all' || listFilter.preset === 'sales';
  const showPurchaseAdd =
    !listFilter || listFilter.preset === 'all' || listFilter.preset === 'purchase';
  const showSalesReturnAdd = listFilter?.preset === 'sales-return';
  const showPurchaseReturnAdd = listFilter?.preset === 'purchase-return';
  const showDocumentAdd =
    !!formFromFilter &&
    formFromFilter.kind !== 'sales' &&
    formFromFilter.kind !== 'purchase' &&
    formFromFilter.kind !== 'sales-return' &&
    formFromFilter.kind !== 'purchase-return';
  const showAnyAdd =
    showSalesAdd ||
    showPurchaseAdd ||
    showSalesReturnAdd ||
    showPurchaseReturnAdd ||
    showDocumentAdd;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={screenTitle}
        subtitle={subtitle}
        right={
          <View style={styles.headerActions}>
            <HeaderIconButton
              onPress={() =>
                navigation.navigate('DocumentScan', {
                  kind:
                    listFilter?.preset === 'purchase' ||
                    listFilter?.preset === 'service-received'
                      ? 'purchase'
                      : listFilter?.preset === 'service-given'
                        ? 'service-given'
                        : 'sales',
                })
              }
            >
              <ScanLine size={18} color={palette.white} />
            </HeaderIconButton>
            {showAnyAdd ? (
              <>
              {showSalesAdd ? (
                <HeaderIconButton
                  accent
                  onPress={() => navigation.navigate('InvoiceForm', { kind: 'sales' })}
                >
                  <Plus size={18} color={palette.white} />
                </HeaderIconButton>
              ) : null}
              {showPurchaseAdd ? (
                <HeaderIconButton
                  accent={!showSalesAdd}
                  onPress={() => navigation.navigate('InvoiceForm', { kind: 'purchase' })}
                >
                  <Plus size={18} color={palette.white} />
                </HeaderIconButton>
              ) : null}
              {showSalesReturnAdd ? (
                <HeaderIconButton
                  accent
                  onPress={() =>
                    navigation.navigate('InvoiceForm', { kind: 'sales-return' })
                  }
                >
                  <Plus size={18} color={palette.white} />
                </HeaderIconButton>
              ) : null}
              {showPurchaseReturnAdd ? (
                <HeaderIconButton
                  accent
                  onPress={() =>
                    navigation.navigate('InvoiceForm', { kind: 'purchase-return' })
                  }
                >
                  <Plus size={18} color={palette.white} />
                </HeaderIconButton>
              ) : null}
              {showDocumentAdd && formFromFilter ? (
                <HeaderIconButton
                  accent
                  onPress={() =>
                    navigation.navigate('InvoiceForm', {
                      kind: formFromFilter.kind,
                      trcode: formFromFilter.trcode,
                    })
                  }
                >
                  <Plus size={18} color={palette.white} />
                </HeaderIconButton>
              ) : null}
              </>
            ) : null}
          </View>
        }
      />

      {showGeneralKpi ? (
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
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>
              {summary.purchaseCount} fiş
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.kpiRow}>
          <View style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={styles.kpiLabel}>{filterLabel ?? 'Toplam'}</Text>
            <Text
              style={[
                styles.kpiVal,
                {
                  color:
                    listFilter?.preset === 'purchase-return'
                      ? palette.orange500
                      : palette.red500,
                },
              ]}
            >
              {formatMoney(filterStats.total)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>{filterStats.count} fiş</Text>
          </View>
        </View>
      )}

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
          ListEmptyComponent={<EmptyState message={emptyMessage} />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const badge = trcodeBadgeLabel(item.trcode);
            const isPurchase = isPurchaseInvoice(item);
            const accent = isPurchase ? palette.orange500 : palette.blue600;
            return (
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
                    <View style={styles.titleRow}>
                      <Text style={[styles.name, { color: colors.text }]}>
                        {item.fiche_no || '—'}
                      </Text>
                      {showGeneralKpi ? (
                        <View style={[styles.badge, { backgroundColor: `${accent}22` }]}>
                          <Text style={[styles.badgeText, { color: accent }]}>
                            {invoiceKindLabel(item)}
                          </Text>
                        </View>
                      ) : badge ? (
                        <View
                          style={[
                            styles.badge,
                            {
                              backgroundColor:
                                listFilter?.preset === 'purchase-return' || item.trcode === 6
                                  ? '#ffedd5'
                                  : '#fee2e2',
                            },
                          ]}
                        >
                          <Text style={styles.badgeText}>{badge}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                      {item.customer_name || (isPurchase ? 'Tedarikçi' : 'Perakende')} ·{' '}
                      {item.date?.slice(0, 10) || '—'}
                    </Text>
                    <Text style={{ color: colors.textSubtle, fontSize: 10, marginTop: 2 }}>
                      {item.payment_method || item.status || item.fiche_type || ''}
                    </Text>
                  </View>
                  <Text style={[styles.amount, { color: accent }]}>
                    {formatMoney(item.net_amount)} ₺
                  </Text>
                  <ChevronRight size={16} color={colors.textMuted} />
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: 6 },
  kpiRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 10 },
  kpiLabel: { fontSize: 10, color: '#6b7280', fontWeight: '600' },
  kpiVal: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, fontWeight: '700' },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  amount: { fontSize: 14, fontWeight: '800' },
});
