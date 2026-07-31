import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import {
  fetchPaymentPlans,
  fetchCostCenters,
  fetchExpenses,
  type PaymentPlanRow,
  type CostCenterRow,
  type ExpenseRow,
} from '../api/financeDefinitionsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'paymentPlans' | 'costCenters' | 'expenses';
type Props = NativeStackScreenProps<MainStackParamList, 'FinanceDefinitions'>;

export function financeDefinitionsRouteTab(screenId?: string): Tab {
  switch (screenId) {
    case 'cost-centers':
      return 'costCenters';
    case 'revenueexpense':
      return 'expenses';
    case 'payment-plans':
    case 'finance-definitions':
    default:
      return 'paymentPlans';
  }
}

export function FinanceDefinitionsScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const user = useAuthStore((s) => s.user);
  const initial = financeDefinitionsRouteTab(route.params?.screenId);
  const [tab, setTab] = useState<Tab>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlanRow[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  useEffect(() => {
    setTab(financeDefinitionsRouteTab(route.params?.screenId));
  }, [route.params?.screenId]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const settled = await Promise.allSettled([
        fetchPaymentPlans(),
        fetchCostCenters(),
        fetchExpenses(),
      ]);
      const errs: string[] = [];
      const [pp, cc, ex] = settled;
      if (pp.status === 'fulfilled') setPaymentPlans(pp.value);
      else {
        setPaymentPlans([]);
        errs.push(pp.reason instanceof Error ? pp.reason.message : String(pp.reason));
      }
      if (cc.status === 'fulfilled') setCostCenters(cc.value);
      else {
        setCostCenters([]);
        errs.push(cc.reason instanceof Error ? cc.reason.message : String(cc.reason));
      }
      if (ex.status === 'fulfilled') setExpenses(ex.value);
      else {
        setExpenses([]);
        errs.push(ex.reason instanceof Error ? ex.reason.message : String(ex.reason));
      }
      if (errs.length) setError(errs[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'paymentPlans', label: 'Ödeme planı' },
    { id: 'costCenters', label: 'Masraf mrk.' },
    { id: 'expenses', label: 'Gider' },
  ];

  const title =
    tab === 'paymentPlans'
      ? 'Ödeme planları'
      : tab === 'costCenters'
        ? 'Masraf merkezleri'
        : 'Gider yönetimi';

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={title} subtitle={user?.firmNr ? `Firma ${user.firmNr}` : 'Finans tanımları'} />
      <SegmentTabBar layout="scroll" value={tab} onChange={setTab} items={tabs} />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'paymentPlans' ? (
        <FlatList
          data={paymentPlans}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Ödeme planı kaydı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.code} · {item.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.description || '—'}</Text>
            </View>
          )}
        />
      ) : tab === 'costCenters' ? (
        <FlatList
          data={costCenters}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message="Masraf merkezi tanımı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.code} · {item.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.description || '—'}</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message="Gider kaydı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.category} · {formatMoney(item.amount)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.description}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
