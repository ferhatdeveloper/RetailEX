import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Alert,
  Switch,
  TextInput,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, Pencil, HandCoins, FileText, Phone, Share2 } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner, EmptyState } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchCustomerById,
  fetchCustomerRecentSales,
  type CustomerDetail,
} from '../api/customersApi';
import { fetchCallPlanCustomers, updateCallPlanCustomer } from '../api/customerCallPlanApi';
import { formatMoney } from '../api/erpTables';
import {
  CUSTOMER_CALL_STATUSES,
  CUSTOMER_CALL_WEEKDAYS,
  customerCallStatusMeta,
  normalizeCustomerCallStatus,
  normalizeCustomerCallWeekdays,
  type CustomerCallStatus,
} from '../utils/customerCallPlan';
import { shareReportPdf } from '../utils/shareReportPdf';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type CallPlanForm = {
  call_plan_enabled: boolean;
  call_plan_weekdays: number[];
  call_plan_note: string;
  call_last_status: CustomerCallStatus;
  call_last_note: string | null;
  call_last_at: string | null;
};

type CallPlanSnapshotIn = {
  call_plan_enabled?: boolean | null;
  call_plan_weekdays?: number[] | null;
  call_plan_note?: string | null;
  call_last_status?: string | null;
  call_last_note?: string | null;
  call_last_at?: string | null;
};

const emptyPlan = (): CallPlanForm => ({
  call_plan_enabled: false,
  call_plan_weekdays: [],
  call_plan_note: '',
  call_last_status: 'planned',
  call_last_note: null,
  call_last_at: null,
});

export function CustomerDetailScreen() {
  const { colors } = useThemeStore();
  const route = useRoute<RouteProp<MainStackParamList, 'CustomerDetail'>>();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { customerId } = route.params;
  const [row, setRow] = useState<CustomerDetail | null>(null);
  const [plan, setPlan] = useState<CallPlanForm>(emptyPlan());
  const [planDirty, setPlanDirty] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [sales, setSales] = useState<
    Awaited<ReturnType<typeof fetchCustomerRecentSales>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPlanSnapshot = useCallback((snap: CallPlanSnapshotIn | null | undefined) => {
    setPlan({
      call_plan_enabled: snap?.call_plan_enabled === true,
      call_plan_weekdays: normalizeCustomerCallWeekdays(snap?.call_plan_weekdays),
      call_plan_note: snap?.call_plan_note != null ? String(snap.call_plan_note) : '',
      call_last_status: normalizeCustomerCallStatus(snap?.call_last_status),
      call_last_note: snap?.call_last_note ?? null,
      call_last_at: snap?.call_last_at ?? null,
    });
    setPlanDirty(false);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, s] = await Promise.all([
        fetchCustomerById(customerId),
        fetchCustomerRecentSales(customerId),
      ]);
      setRow(c);
      setSales(s);

      const fromDetail =
        c &&
        (c.call_plan_enabled != null ||
          (c.call_plan_weekdays && c.call_plan_weekdays.length > 0) ||
          c.call_last_status != null)
          ? {
              call_plan_enabled: c.call_plan_enabled === true,
              call_plan_weekdays: c.call_plan_weekdays,
              call_plan_note: c.call_plan_note,
              call_last_status: c.call_last_status,
              call_last_note: c.call_last_note,
              call_last_at: c.call_last_at,
            }
          : null;

      if (fromDetail) {
        applyPlanSnapshot(fromDetail);
      } else {
        try {
          const planRows = await fetchCallPlanCustomers(500);
          const hit = planRows.find((p) => String(p.id) === String(customerId));
          applyPlanSnapshot(
            hit
              ? {
                  call_plan_enabled: hit.call_plan_enabled,
                  call_plan_weekdays: hit.call_plan_weekdays,
                  call_plan_note: hit.call_plan_note,
                  call_last_status: hit.call_last_status,
                  call_last_note: hit.call_last_note,
                  call_last_at: hit.call_last_at,
                }
              : emptyPlan(),
          );
        } catch {
          applyPlanSnapshot(emptyPlan());
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRow(null);
      applyPlanSnapshot(emptyPlan());
    } finally {
      setLoading(false);
    }
  }, [customerId, applyPlanSnapshot]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const patchPlan = <K extends keyof CallPlanForm>(key: K, value: CallPlanForm[K]) => {
    setPlan((prev) => ({ ...prev, [key]: value }));
    setPlanDirty(true);
  };

  const toggleWeekday = (day: number) => {
    setPlan((prev) => {
      const set = new Set(prev.call_plan_weekdays);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return {
        ...prev,
        call_plan_weekdays: Array.from(set).sort((a, b) => a - b),
      };
    });
    setPlanDirty(true);
  };

  const saveCallPlan = async () => {
    if (!row) return;
    if (plan.call_plan_enabled && plan.call_plan_weekdays.length === 0) {
      Alert.alert('Gün seçin', 'Arama planı açıkken en az bir hafta günü seçilmelidir.');
      return;
    }
    setPlanSaving(true);
    try {
      await updateCallPlanCustomer(row.id, {
        call_plan_enabled: plan.call_plan_enabled,
        call_plan_weekdays: plan.call_plan_weekdays,
        call_plan_note: plan.call_plan_note.trim() || null,
        call_last_status: plan.call_last_status,
      });
      setPlanDirty(false);
      Alert.alert('Kaydedildi', 'Arama planı güncellendi.');
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    } finally {
      setPlanSaving(false);
    }
  };

  const onSharePdf = useCallback(async () => {
    if (!row) return;
    setSharingPdf(true);
    try {
      const result = await shareReportPdf({
        title: `Cari özet — ${row.name}`,
        subtitle: `${row.code || '—'} · Bakiye: ${formatMoney(row.balance)}`,
        rows: [
          {
            date: new Date().toISOString().slice(0, 10),
            title: 'Güncel bakiye',
            amount: row.balance,
          },
          ...sales.map((s) => ({
            date: s.date?.slice(0, 10) || '',
            title: s.fiche_no || 'Fatura',
            amount: s.net_amount,
            meta: s.id ? `ID ${String(s.id).slice(0, 8)}` : undefined,
          })),
        ],
        footerNote: 'RetailEX · Son satışlar ve bakiye',
      });
      Alert.alert(result.ok ? 'PDF' : 'Hata', result.message);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    } finally {
      setSharingPdf(false);
    }
  }, [row, sales]);

  const statusMeta = customerCallStatusMeta(plan.call_last_status);

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
          keyboardShouldPersistTaps="handled"
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
              {formatMoney(row.balance)}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>Bakiye</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.planHeader}>
              <Text style={[styles.planTitle, { color: colors.text }]}>Arama planı</Text>
              <View style={styles.enableRow}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>
                  {plan.call_plan_enabled ? 'Aktif' : 'Pasif'}
                </Text>
                <Switch
                  value={plan.call_plan_enabled}
                  onValueChange={(v) => patchPlan('call_plan_enabled', v)}
                  trackColor={{ true: palette.blue600, false: palette.gray300 }}
                />
              </View>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Hafta günleri</Text>
            <View style={styles.chipRow}>
              {CUSTOMER_CALL_WEEKDAYS.map((d) => {
                const on = plan.call_plan_weekdays.includes(d.value);
                return (
                  <Pressable
                    key={d.value}
                    onPress={() => toggleWeekday(d.value)}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: on ? palette.indigo600 : colors.backgroundAlt,
                        borderColor: on ? palette.indigo600 : colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: on ? palette.white : colors.text,
                        fontWeight: '700',
                        fontSize: 12,
                      }}
                    >
                      {d.shortTr}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Plan notu</Text>
            <TextInput
              value={plan.call_plan_note}
              onChangeText={(t) => patchPlan('call_plan_note', t)}
              placeholder="Arama planı notu…"
              placeholderTextColor={colors.textSubtle}
              multiline
              style={[
                styles.noteInput,
                {
                  color: colors.text,
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.inputBg,
                },
              ]}
            />

            <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Son durum</Text>
            <View style={styles.chipRow}>
              {CUSTOMER_CALL_STATUSES.map((s) => {
                const on = plan.call_last_status === s.value;
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => patchPlan('call_last_status', normalizeCustomerCallStatus(s.value))}
                    style={[
                      styles.statusChip,
                      {
                        borderColor: on ? s.color : colors.cardBorder,
                        backgroundColor: on ? s.color + '22' : colors.backgroundAlt,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: on ? s.color : colors.text,
                        fontWeight: '700',
                        fontSize: 11,
                      }}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {plan.call_last_at ? (
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                Son güncelleme: {String(plan.call_last_at).slice(0, 16).replace('T', ' ')} ·{' '}
                {statusMeta.label}
              </Text>
            ) : null}

            <PrimaryButton
              label={planDirty ? 'Planı kaydet' : 'Kaydedildi'}
              onPress={() => void saveCallPlan()}
              loading={planSaving}
              disabled={!planDirty}
            />
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

          <View style={styles.actions}>
            <Pressable
              onPress={() => navigation.navigate('CustomerCallPlan')}
              style={[styles.actionBtn, { backgroundColor: palette.amber600 }]}
            >
              <Phone size={18} color={palette.white} />
              <Text style={styles.actionLabel}>Müşteri Arama Planı</Text>
            </Pressable>
            <Pressable
              onPress={() => void onSharePdf()}
              disabled={sharingPdf}
              style={[
                styles.actionBtn,
                { backgroundColor: palette.blue700, opacity: sharingPdf ? 0.6 : 1 },
              ]}
            >
              <Share2 size={18} color={palette.white} />
              <Text style={styles.actionLabel}>{sharingPdf ? 'Hazırlanıyor…' : 'PDF paylaş'}</Text>
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
                  {formatMoney(s.net_amount)}
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
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  name: { fontSize: 18, fontWeight: '800' },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  planTitle: { fontSize: 14, fontWeight: '800' },
  enableRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noteInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    minHeight: 64,
    textAlignVertical: 'top',
  },
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
