import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import {
  fetchBeautyAppointments,
  fetchBeautySaleItems,
  fetchBeautySales,
  fetchBeautyServices,
  fetchBeautySpecialists,
} from '../api/beautyApi';
import { fetchExpenses } from '../api/financeDefinitionsApi';
import { formatMoney } from '../api/erpTables';
import { buildClinicMirrorReports } from '../clinicReports/clinicReportCenter';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
  return { from, to };
}

export function BeautyReportsScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Array<{ id: string; label: string; value: string }>>([]);

  const load = useCallback(async () => {
    setError(null);
    const range = monthRange();
    try {
      const [appointments, services, specialists, sales, expenses] = await Promise.all([
        fetchBeautyAppointments(200),
        fetchBeautyServices(),
        fetchBeautySpecialists(),
        fetchBeautySales(40),
        fetchExpenses(200),
      ]);
      const salesWithItems = await Promise.all(
        sales.map(async (sale) => {
          const items = await fetchBeautySaleItems(sale.id).catch(() => []);
          return {
            id: sale.id,
            paymentStatus: sale.payment_status,
            paymentMethod: sale.payment_method,
            notes: sale.notes,
            customerId: sale.customer_id,
            customerName: sale.customer_name,
            createdAt: sale.created_at,
            items: items.map((item) => ({
              id: item.id,
              itemType: item.item_type,
              itemId: item.item_id,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unit_price,
              total: item.total,
              staffId: item.staff_id,
            })),
          };
        }),
      );
      const model = buildClinicMirrorReports({
        from: range.from,
        to: range.to,
        firmName: '',
        branches: [],
        services: services.map((s) => ({ id: s.id, name: s.name, isActive: true })),
        specialists: specialists.map((s) => ({ id: s.id, name: s.name, isActive: true })),
        customers: [],
        appointments: appointments.map((row) => ({
          ...row,
          duration: row.duration ?? 0,
          status: row.status || 'scheduled',
        })) as never,
        sales: salesWithItems,
        returns: [],
        expenses: expenses.map((row) => ({
          id: row.id,
          date: row.expense_date || range.from,
          category: row.category,
          description: row.description,
          amount: row.amount,
          paymentMethod: row.payment_method,
        })),
        audit: [],
      });
      setLines([
        { id: 'income', label: t('ops.reportIncome', { defaultValue: 'Gelir' }), value: formatMoney(model.income) },
        { id: 'deposit', label: t('ops.reportDeposit', { defaultValue: 'Peşinat (ciro değil)' }), value: formatMoney(model.depositAmount) },
        { id: 'expense', label: t('ops.reportExpense', { defaultValue: 'Gider' }), value: formatMoney(model.expense) },
        { id: 'net', label: t('ops.reportNet', { defaultValue: 'Net' }), value: formatMoney(model.net) },
        { id: 'appt', label: t('ops.reportAppt', { defaultValue: 'Randevu' }), value: String(model.appointmentTotal) },
        { id: 'recv', label: t('ops.reportReceivable', { defaultValue: 'Açık alacak' }), value: formatMoney(model.openReceivable) },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t('ops.beauty.reports', { defaultValue: 'Klinik raporları' })}
        subtitle={t('ops.reportHint', { defaultValue: 'Peşinat gelire eklenmez' })}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={lines}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message={t('ops.empty', { defaultValue: 'Kayıt yok' })} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.label}</Text>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18 }}>{item.value}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, gap: 8 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14 },
});
