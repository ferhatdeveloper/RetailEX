/**
 * Müşteri Arama Planı — web CustomerCallPlanModule (Liste + Rapor).
 * Liste/Rapor yatay kaydırmalı (paging) sekmeler.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Linking,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenHeader, EmptyState, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  ensureCallPlanWeekRollover,
  fetchCallPlanCustomers,
  fetchCallPlanWeeklyReport,
  listArchivedCallPlanWeeks,
  updateCallPlanCustomer,
  type CallPlanCustomer,
  type CallPlanWeeklyRow,
} from '../api/customerCallPlanApi';
import {
  CUSTOMER_CALL_STATUSES,
  CUSTOMER_CALL_WEEKDAYS,
  customerCallStatusMeta,
  customerCallWeekdaysLabel,
  formatCallPlanWeekRange,
  getCallPlanWeekStart,
  normalizeCustomerCallStatus,
  type CustomerCallStatus,
} from '../utils/customerCallPlan';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';

type Tab = 'list' | 'report';
type DayFilter = 'all' | number;

const TABS: { id: Tab; label: string }[] = [
  { id: 'list', label: 'Liste' },
  { id: 'report', label: 'Rapor' },
];

export function CustomerCallPlanScreen() {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<{ navigate: (name: string, params?: object) => void }>();

  const [tab, setTab] = useState<Tab>('list');
  const [pageWidth, setPageWidth] = useState(Dimensions.get('window').width);
  const pagerRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CallPlanCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState<DayFilter>('all');
  const [currentWeek, setCurrentWeek] = useState(getCallPlanWeekStart());
  const [reportWeek, setReportWeek] = useState(getCallPlanWeekStart());
  const [archivedWeeks, setArchivedWeeks] = useState<string[]>([]);
  const [reportRows, setReportRows] = useState<CallPlanWeeklyRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const [edit, setEdit] = useState<CallPlanCustomer | null>(null);
  const [editStatus, setEditStatus] = useState<CustomerCallStatus>('planned');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rollover = await ensureCallPlanWeekRollover();
      setCurrentWeek(rollover.currentWeekStart);
      setReportWeek((prev) => {
        if (!prev || prev === getCallPlanWeekStart()) return rollover.currentWeekStart;
        return prev;
      });
      const [rows, weeks] = await Promise.all([
        fetchCallPlanCustomers(),
        listArchivedCallPlanWeeks(),
      ]);
      setCustomers(rows);
      setArchivedWeeks(weeks);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadReport = useCallback(
    async (week: string, source: CallPlanCustomer[]) => {
      setReportLoading(true);
      try {
        setReportRows(await fetchCallPlanWeeklyReport(week, source));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setReportRows([]);
      } finally {
        setReportLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (tab === 'report') void loadReport(reportWeek, customers);
  }, [tab, reportWeek, customers, loadReport]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return customers.filter((c) => {
      if (dayFilter !== 'all' && !c.call_plan_weekdays.includes(dayFilter)) return false;
      if (!q) return true;
      return (
        c.name.toLocaleLowerCase('tr-TR').includes(q) ||
        (c.code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (c.phone || '').includes(q)
      );
    });
  }, [customers, search, dayFilter]);

  const goTab = (id: Tab, animated = true) => {
    setTab(id);
    const x = id === 'list' ? 0 : pageWidth;
    pagerRef.current?.scrollTo({ x, animated });
  };

  const onPagerLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - pageWidth) > 1) {
      setPageWidth(w);
      requestAnimationFrame(() => {
        pagerRef.current?.scrollTo({
          x: tab === 'list' ? 0 : w,
          animated: false,
        });
      });
    }
  };

  const onPagerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const page = Math.round(x / Math.max(pageWidth, 1));
    const next: Tab = page >= 1 ? 'report' : 'list';
    if (next !== tab) setTab(next);
  };

  const openEdit = (c: CallPlanCustomer) => {
    setEdit(c);
    setEditStatus(c.call_last_status);
    setEditNote(c.call_last_note || '');
  };

  const saveStatus = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      await updateCallPlanCustomer(edit.id, {
        call_last_status: editStatus,
        call_last_note: editNote.trim() || null,
      });
      setEdit(null);
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const quickStatus = async (c: CallPlanCustomer, status: CustomerCallStatus) => {
    try {
      await updateCallPlanCustomer(c.id, { call_last_status: status });
      await load();
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : String(e));
    }
  };

  const dial = (phone: string | null) => {
    if (!phone) {
      Alert.alert('Telefon yok');
      return;
    }
    void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  };

  const whatsapp = (phone: string | null, name: string) => {
    if (!phone) {
      Alert.alert('Telefon yok');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    const text = encodeURIComponent(`Merhaba ${name}, RetailEX arama planı.`);
    void Linking.openURL(`https://wa.me/${digits}?text=${text}`);
  };

  const renderCustomer = (c: CallPlanCustomer) => {
    const meta = customerCallStatusMeta(c.call_last_status);
    return (
      <Pressable
        onPress={() => openEdit(c)}
        onLongPress={() =>
          navigation.navigate('CustomerDetail', { customerId: c.id })
        }
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
      >
        <View style={styles.rowBetween}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {c.name}
          </Text>
          <View style={[styles.statusChip, { backgroundColor: meta.color + '22' }]}>
            <Text style={{ color: meta.color, fontWeight: '800', fontSize: 11 }}>{meta.label}</Text>
          </View>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
          {c.code || '—'} · {customerCallWeekdaysLabel(c.call_plan_weekdays, true) || 'Gün yok'}
        </Text>
        {c.call_plan_note ? (
          <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }} numberOfLines={2}>
            {c.call_plan_note}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable onPress={() => dial(c.phone)} style={styles.actionBtn}>
            <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 12 }}>Ara</Text>
          </Pressable>
          <Pressable onPress={() => whatsapp(c.phone, c.name)} style={styles.actionBtn}>
            <Text style={{ color: palette.green600, fontWeight: '800', fontSize: 12 }}>WA</Text>
          </Pressable>
          <Pressable onPress={() => void quickStatus(c, 'called')} style={styles.actionBtn}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>Arandı</Text>
          </Pressable>
          <Pressable onPress={() => void quickStatus(c, 'done')} style={styles.actionBtn}>
            <Text style={{ color: palette.green600, fontWeight: '800', fontSize: 12 }}>Tamam</Text>
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const weekOptions = useMemo(() => {
    const set = new Set([currentWeek, ...archivedWeeks]);
    return Array.from(set).sort().reverse();
  }, [currentWeek, archivedWeeks]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Müşteri Arama Planı"
        subtitle={
          user?.firmNr
            ? `Firma ${user.firmNr} · ${formatCallPlanWeekRange(currentWeek)}`
            : formatCallPlanWeekRange(currentWeek)
        }
      />

      <View style={styles.tabRow}>
        {TABS.map(({ id, label }) => {
          const on = tab === id;
          return (
            <Pressable
              key={id}
              onPress={() => goTab(id)}
              style={[
                styles.tab,
                {
                  backgroundColor: on ? palette.blue600 : colors.card,
                  borderColor: on ? palette.blue600 : colors.cardBorder,
                },
              ]}
            >
              <Text style={{ color: on ? palette.white : colors.text, fontWeight: '800' }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <View style={styles.pagerWrap} onLayout={onPagerLayout}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPagerScrollEnd}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Liste */}
          <View style={[styles.page, { width: pageWidth }]}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Müşteri adı, kod, telefon…"
            />
            <FlatList
              horizontal
              data={[
                { value: 'all' as const, label: 'Tümü' },
                ...CUSTOMER_CALL_WEEKDAYS.map((d) => ({
                  value: d.value,
                  label: d.shortTr,
                })),
              ]}
              keyExtractor={(item) => String(item.value)}
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 44, marginHorizontal: 12 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              renderItem={({ item }) => {
                const on = dayFilter === item.value;
                return (
                  <Pressable
                    onPress={() => setDayFilter(item.value)}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: on ? palette.indigo600 : colors.card,
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
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
            {loading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl refreshing={loading} onRefresh={() => void load()} />
                }
                ListEmptyComponent={
                  <EmptyState message="Arama planında müşteri yok — cari kartından planı açın" />
                }
                contentContainerStyle={styles.list}
                renderItem={({ item }) => renderCustomer(item)}
                style={{ flex: 1 }}
              />
            )}
          </View>

          {/* Rapor */}
          <View style={[styles.page, { width: pageWidth }]}>
            <FlatList
              horizontal
              data={weekOptions}
              keyExtractor={(w) => w}
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 44, marginHorizontal: 12 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              renderItem={({ item: w }) => {
                const on = reportWeek === w;
                return (
                  <Pressable
                    onPress={() => setReportWeek(w)}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: on ? palette.blue600 : colors.card,
                        borderColor: on ? palette.blue600 : colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: on ? palette.white : colors.text,
                        fontWeight: '700',
                        fontSize: 11,
                      }}
                    >
                      {w}
                      {w === currentWeek ? ' (canlı)' : ''}
                    </Text>
                  </Pressable>
                );
              }}
            />
            {reportLoading || loading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
            ) : (
              <FlatList
                data={reportRows}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={reportLoading}
                    onRefresh={() => void loadReport(reportWeek, customers)}
                  />
                }
                ListEmptyComponent={<EmptyState message="Bu hafta için kayıt yok" />}
                contentContainerStyle={styles.list}
                style={{ flex: 1 }}
                ListHeaderComponent={
                  <Text style={[styles.reportHead, { color: colors.textMuted }]}>
                    {formatCallPlanWeekRange(reportWeek)} · {reportRows.length} müşteri
                  </Text>
                }
                renderItem={({ item }) => {
                  const meta = customerCallStatusMeta(item.call_last_status);
                  return (
                    <View
                      style={[
                        styles.card,
                        { backgroundColor: colors.card, borderColor: colors.cardBorder },
                      ]}
                    >
                      <View style={styles.rowBetween}>
                        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                          {item.customer_name}
                        </Text>
                        <Text style={{ color: meta.color, fontWeight: '800', fontSize: 11 }}>
                          {meta.label}
                        </Text>
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {item.customer_code || '—'} ·{' '}
                        {customerCallWeekdaysLabel(item.call_plan_weekdays, true)}
                      </Text>
                      {item.call_last_note ? (
                        <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                          {item.call_last_note}
                        </Text>
                      ) : null}
                    </View>
                  );
                }}
              />
            )}
          </View>
        </ScrollView>
      </View>

      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEdit(null)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: colors.card }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.name, { color: colors.text }]}>{edit?.name}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
              Durum güncelle
            </Text>
            <View style={styles.statusGrid}>
              {CUSTOMER_CALL_STATUSES.map((s) => {
                const on = editStatus === s.value;
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => setEditStatus(normalizeCustomerCallStatus(s.value))}
                    style={[
                      styles.statusOpt,
                      {
                        borderColor: on ? s.color : colors.cardBorder,
                        backgroundColor: on ? s.color + '22' : colors.backgroundAlt,
                      },
                    ]}
                  >
                    <Text style={{ color: on ? s.color : colors.text, fontWeight: '700', fontSize: 11 }}>
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={editNote}
              onChangeText={setEditNote}
              placeholder="Not"
              placeholderTextColor={colors.textSubtle}
              style={[
                styles.noteInput,
                { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.inputBg },
              ]}
              multiline
            />
            <PrimaryButton label="Kaydet" onPress={() => void saveStatus()} loading={saving} />
            <PrimaryButton label="Kapat" variant="ghost" onPress={() => setEdit(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pagerWrap: { flex: 1 },
  page: { flex: 1 },
  list: { padding: 12, paddingBottom: 40, gap: 8 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontWeight: '800', fontSize: 14 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(37,99,235,0.08)',
  },
  dayChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reportHead: { fontSize: 11, fontWeight: '800', marginBottom: 8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { borderRadius: 14, padding: 16, gap: 10 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusOpt: {
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
});
