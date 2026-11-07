import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Pressable,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import {
  fetchPaymentPlans,
  fetchCostCenters,
  fetchExpenses,
  createExpense,
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
    case 'beauty-expenses':
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
  const [expCategory, setExpCategory] = useState('Genel');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [savingExp, setSavingExp] = useState(false);

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

  const saveExpense = async () => {
    const amount = Math.abs(Number(String(expAmount).replace(',', '.')) || 0);
    if (amount <= 0) {
      Alert.alert('Gider', 'Tutar gerekli');
      return;
    }
    setSavingExp(true);
    try {
      const day = new Date().toISOString().slice(0, 10);
      await createExpense({
        category: expCategory,
        description: expDesc || expCategory,
        amount,
        paymentMethod: expMethod,
        expenseDate: day,
      });
      setExpAmount('');
      setExpDesc('');
      await load();
    } catch (e) {
      Alert.alert('Gider', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingExp(false);
    }
  };

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
          ListHeaderComponent={
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, marginBottom: 8 }]}>
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Yeni gider</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 8 }}>
                Nakit gider kasadan çıkar (GIDER_PUSULASI, işaret −1). Peşinat ciro değildir.
              </Text>
              <TextInput
                value={expCategory}
                onChangeText={setExpCategory}
                placeholder="Kategori"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
              <TextInput
                value={expDesc}
                onChangeText={setExpDesc}
                placeholder="Açıklama"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
              <TextInput
                value={expAmount}
                onChangeText={setExpAmount}
                placeholder="Tutar"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
              <View style={styles.methodRow}>
                {(['cash', 'card', 'transfer'] as const).map((method) => (
                  <Pressable
                    key={method}
                    onPress={() => setExpMethod(method)}
                    style={[
                      styles.methodChip,
                      { borderColor: expMethod === method ? palette.blue600 : colors.cardBorder },
                    ]}
                  >
                    <Text style={{ color: colors.text, fontSize: 12 }}>
                      {method === 'cash' ? 'Nakit' : method === 'card' ? 'Kart' : 'Havale'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                disabled={savingExp}
                onPress={() => void saveExpense()}
                style={[styles.saveBtn, { opacity: savingExp ? 0.6 : 1 }]}
              >
                <Text style={{ color: palette.white, fontWeight: '700' }}>
                  {savingExp ? 'Kaydediliyor' : 'Gider kaydet'}
                </Text>
              </Pressable>
            </View>
          }
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
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  methodChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  saveBtn: { backgroundColor: palette.blue600, borderRadius: 8, alignItems: 'center', paddingVertical: 10 },
});
