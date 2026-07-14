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
  fetchCallPlanRows,
  fetchExpenses,
  formatCallWeekdays,
  type PaymentPlanRow,
  type CostCenterRow,
  type CallPlanRow,
  type ExpenseRow,
} from '../api/financeDefinitionsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'paymentPlans' | 'costCenters' | 'callPlan' | 'expenses';
type Props = NativeStackScreenProps<MainStackParamList, 'FinanceDefinitions'>;

export function financeDefinitionsRouteTab(screenId?: string): Tab {
  switch (screenId) {
    case 'cost-centers':
      return 'costCenters';
    case 'customer-call-plan':
      return 'callPlan';
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
  const [callPlan, setCallPlan] = useState<CallPlanRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);

  useEffect(() => {
    setTab(financeDefinitionsRouteTab(route.params?.screenId));
  }, [route.params?.screenId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [pp, cc, cp, ex] = await Promise.all([
        fetchPaymentPlans(),
        fetchCostCenters(),
        fetchCallPlanRows(),
        fetchExpenses(),
      ]);
      setPaymentPlans(pp);
      setCostCenters(cc);
      setCallPlan(cp);
      setExpenses(ex);
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
    { id: 'callPlan', label: 'Arama planı' },
    { id: 'expenses', label: 'Gider' },
  ];

  const title =
    tab === 'paymentPlans'
      ? 'Ödeme planları'
      : tab === 'costCenters'
        ? 'Masraf merkezleri'
        : tab === 'callPlan'
          ? 'Müşteri arama planı'
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
      ) : tab === 'callPlan' ? (
        <FlatList
          data={callPlan}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message="Arama planı kaydı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.customer_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.customer_code || '—'}
                {item.week_start ? ` · hafta ${item.week_start}` : ''}
              </Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                Günler: {formatCallWeekdays(item.call_plan_weekdays)} · {item.call_last_status || 'planlı'}
              </Text>
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
