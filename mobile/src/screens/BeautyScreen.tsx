import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ClipboardList, Plus } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import { PercentBodySheet } from '../components/PercentBodySheet';
import { BeautySurveyRespondSheet } from '../components/BeautySurveyRespondSheet';
import {
  BeautyCalendarPanel,
  type CalView,
  formatLocalYmd,
  parseYmd,
} from '../components/BeautyCalendarPanel';
import {
  fetchBeautyAppointments,
  fetchBeautyServices,
  fetchBeautySpecialists,
  fetchBeautySales,
  createBeautyAppointment,
  updateBeautyAppointment,
  BEAUTY_STATUSES,
  type BeautyAppointment,
  type BeautySale,
  type BeautyService,
  type BeautySpecialist,
} from '../api/beautyApi';
import { fetchCustomers, type CustomerRow } from '../api/customersApi';
import { BeautySalesPanel } from '../components/BeautySalesPanel';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import { CLINIC, clinicColorsForMode } from '../theme/clinicTokens';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'appointments' | 'services' | 'specialists' | 'sales';
type ApptMode = 'calendar' | 'list';
type ApptFilter = 'all' | 'scheduled' | 'completed';
type Props = NativeStackScreenProps<MainStackParamList, 'Beauty'>;

function todayYmd(): string {
  return formatLocalYmd(new Date());
}

function statusLabel(status: string | null): string {
  const s = String(status || '').toLowerCase();
  if (s === 'scheduled') return 'Planlandı';
  if (s === 'confirmed') return 'Onaylı';
  if (s === 'in_progress') return 'Devam';
  if (s === 'completed') return 'Tamamlandı';
  if (s === 'cancelled') return 'İptal';
  if (s === 'no_show') return 'Gelmedi';
  return status || '—';
}

function parseStartsAt(starts: string | null | undefined): { date: string; time: string } {
  if (!starts) return { date: todayYmd(), time: '10:00' };
  const m = String(starts).match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})/);
  if (m) return { date: m[1], time: m[2].slice(0, 5) };
  const d = String(starts).slice(0, 10);
  return { date: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayYmd(), time: '10:00' };
}

function normalizeTimeInput(raw: string): string {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw.trim();
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function BeautyScreen({ route }: Props) {
  const { colors, darkMode } = useThemeStore();
  const clinic = useMemo(() => clinicColorsForMode(darkMode, colors), [darkMode, colors]);
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const initialTab = route.params?.initialTab ?? 'appointments';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [apptMode, setApptMode] = useState<ApptMode>('calendar');
  const [calView, setCalView] = useState<CalView>('day');
  const [calDate, setCalDate] = useState(() => new Date());
  const [apptFilter, setApptFilter] = useState<ApptFilter>('all');
  const [surveyTarget, setSurveyTarget] = useState<BeautyAppointment | null>(null);
  const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
  const [sales, setSales] = useState<BeautySale[]>([]);
  const [services, setServices] = useState<BeautyService[]>([]);
  const [specialists, setSpecialists] = useState<BeautySpecialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<BeautyAppointment | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerHits, setCustomerHits] = useState<CustomerRow[]>([]);
  const [appointmentDate, setAppointmentDate] = useState(todayYmd());
  const [appointmentTime, setAppointmentTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [editStatus, setEditStatus] = useState('scheduled');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const orgEpoch = useOrgEpoch();

  const load = useCallback(async () => {
    setError(null);
    try {
      // TODO(beauty-mobile): tarih aralığına göre sayfalı yükleme (web loadAppointmentsInRange)
      const [a, sal, s, sp] = await Promise.all([
        fetchBeautyAppointments(400),
        fetchBeautySales(),
        fetchBeautyServices(),
        fetchBeautySpecialists(),
      ]);
      setAppointments(a);
      setSales(sal);
      setServices(s);
      setSpecialists(sp);
      setSelectedServiceId((prev) => prev ?? (s[0]?.id ?? null));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (route.params?.initialTab) setTab(route.params.initialTab);
  }, [route.params?.initialTab]);

  useEffect(() => {
    if (route.params?.openCreate || route.params?.callerPhone) {
      setTab('appointments');
      const phone = route.params?.callerPhone?.trim() || '';
      const name = route.params?.callerName?.trim() || '';
      if (phone || name) {
        setCustomerName(name || phone);
        setNotes(phone ? `Tel: ${phone}` : '');
        void (async () => {
          try {
            const rows = await fetchCustomers(phone || name, 8);
            setCustomerHits(rows);
            if (rows.length === 1) {
              setSelectedCustomerId(rows[0].id);
              setCustomerName(rows[0].name);
            }
          } catch {
            /* arama opsiyonel */
          }
        })();
      }
      setCreateOpen(true);
    }
  }, [route.params?.openCreate, route.params?.callerPhone, route.params?.callerName]);

  useEffect(() => {
    if (!createOpen) return;
    const q = customerName.trim();
    if (q.length < 2) {
      setCustomerHits([]);
      return;
    }
    if (selectedCustomerId) {
      const hit = customerHits.find((c) => c.id === selectedCustomerId);
      if (hit && hit.name === q) return;
    }
    const tmr = setTimeout(() => {
      void (async () => {
        try {
          setCustomerHits(await fetchCustomers(q, 8));
        } catch {
          setCustomerHits([]);
        }
      })();
    }, 280);
    return () => clearTimeout(tmr);
    // customerHits bilerek bağımlılıkta yok — seçim kilidi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName, createOpen, selectedCustomerId]);

  const filteredAppointments = useMemo(() => {
    if (apptFilter === 'all') return appointments;
    return appointments.filter((a) => String(a.status || '').toLowerCase() === apptFilter);
  }, [appointments, apptFilter]);

  const selectedService = useMemo(
    () => services.find((s) => s.id === selectedServiceId) ?? null,
    [services, selectedServiceId],
  );

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'appointments', label: 'Randevu', count: appointments.length },
    { id: 'sales', label: 'Satış', count: sales.length },
    { id: 'services', label: 'Hizmet', count: services.length },
    { id: 'specialists', label: 'Uzman', count: specialists.length },
  ];

  const resetForm = (dateYmd?: string, timeHHmm?: string) => {
    setCustomerName('');
    setSelectedCustomerId(null);
    setCustomerHits([]);
    setAppointmentDate(dateYmd || todayYmd());
    setAppointmentTime(normalizeTimeInput(timeHHmm || '10:00'));
    setNotes('');
    setEditStatus('scheduled');
    setSelectedSpecialistId(null);
    setFormError(null);
    if (services.length) setSelectedServiceId(services[0].id);
  };

  const openCreate = (dateYmd?: string, timeHHmm?: string) => {
    resetForm(dateYmd, timeHHmm);
    setCreateOpen(true);
  };

  const openEdit = (item: BeautyAppointment) => {
    const parsed = parseStartsAt(item.starts_at);
    setEditAppt(item);
    setSelectedCustomerId(item.client_id || null);
    setCustomerName(item.customer_name || '');
    setAppointmentDate(item.appointment_date || parsed.date);
    setAppointmentTime(
      normalizeTimeInput((item.appointment_time || parsed.time).toString().slice(0, 5) || '10:00'),
    );
    setNotes(item.notes || '');
    setEditStatus(String(item.status || 'scheduled').toLowerCase());
    setSelectedServiceId(item.service_id || services[0]?.id || null);
    setSelectedSpecialistId(item.specialist_id || null);
    setFormError(null);
  };

  const handleCreate = async () => {
    if (!customerName.trim()) {
      setFormError('Müşteri adı gerekli');
      return;
    }
    if (!selectedServiceId) {
      setFormError('Hizmet seçin');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate.trim())) {
      setFormError('Tarih YYYY-MM-DD formatında olmalı');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      let customerId = selectedCustomerId;
      if (!customerId) {
        const hits = await fetchCustomers(customerName.trim(), 5);
        const exact = hits.find(
          (h) => h.name.trim().toLocaleLowerCase('tr-TR') === customerName.trim().toLocaleLowerCase('tr-TR'),
        );
        customerId = exact?.id ?? (hits.length === 1 ? hits[0].id : null);
      }
      await createBeautyAppointment({
        customerName: customerName.trim(),
        customerId,
        serviceId: selectedServiceId,
        specialistId: selectedSpecialistId,
        appointmentDate: appointmentDate.trim(),
        appointmentTime: normalizeTimeInput(appointmentTime),
        notes: notes.trim() || undefined,
      });
      setCreateOpen(false);
      resetForm();
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (forceStatus?: string) => {
    if (!editAppt) return;
    if (!selectedServiceId) {
      setFormError('Hizmet seçin');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate.trim())) {
      setFormError('Tarih YYYY-MM-DD formatında olmalı');
      return;
    }
    setSaving(true);
    setFormError(null);
    const nextStatus = forceStatus || editStatus;
    const becameCompleted =
      String(nextStatus).toLowerCase() === 'completed' &&
      String(editAppt.status || '').toLowerCase() !== 'completed';
    let clientId = selectedCustomerId || editAppt.client_id || null;
    try {
      if (!clientId && becameCompleted) {
        const hits = await fetchCustomers(editAppt.customer_name || customerName, 5);
        const exact = hits.find(
          (h) =>
            h.name.trim().toLocaleLowerCase('tr-TR') ===
            String(editAppt.customer_name || customerName)
              .trim()
              .toLocaleLowerCase('tr-TR'),
        );
        clientId = exact?.id ?? (hits.length === 1 ? hits[0].id : null);
      }
      await updateBeautyAppointment(editAppt.id, {
        serviceId: selectedServiceId,
        specialistId: selectedSpecialistId,
        clearSpecialist: !selectedSpecialistId,
        appointmentDate: appointmentDate.trim(),
        appointmentTime: normalizeTimeInput(appointmentTime),
        status: nextStatus,
        notes: notes.trim() || null,
        customerId: clientId || undefined,
      });
      const snapshot: BeautyAppointment = {
        ...editAppt,
        status: nextStatus,
        client_id: clientId,
        customer_name: editAppt.customer_name || customerName,
      };
      setEditAppt(null);
      await load();
      if (becameCompleted && clientId) {
        Alert.alert('Anket', 'Memnuniyet anketi doldurulsun mu?', [
          { text: 'Sonra', style: 'cancel' },
          {
            text: 'Anket aç',
            onPress: () => setSurveyTarget(snapshot),
          },
        ]);
      } else if (becameCompleted && !clientId) {
        Alert.alert(
          'Anket',
          'Bu randevuya cari bağlı değil. Anket için önce cari kartı oluşturup randevuya bağlayın.',
        );
      }
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const renderChipRow = (
    label: string,
    options: { id: string; label: string }[],
    selectedId: string | null,
    onSelect: (id: string | null) => void,
    allowNull?: { label: string },
  ) => (
    <View>
      <Text style={[styles.pickLabel, { color: colors.textMuted }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
        {allowNull ? (
          <Pressable
            onPress={() => onSelect(null)}
            style={[
              styles.pickChip,
              {
                backgroundColor: !selectedId ? palette.purple500 : colors.card,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text
              style={{
                color: !selectedId ? palette.white : colors.text,
                fontSize: 11,
                fontWeight: '700',
              }}
            >
              {allowNull.label}
            </Text>
          </Pressable>
        ) : null}
        {options.map((opt) => (
          <Pressable
            key={opt.id}
            onPress={() => onSelect(opt.id)}
            style={[
              styles.pickChip,
              {
                backgroundColor: selectedId === opt.id ? palette.purple500 : colors.card,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text
              style={{
                color: selectedId === opt.id ? palette.white : colors.text,
                fontSize: 11,
                fontWeight: '700',
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  /** Web AppointmentPOS üst şerit hiyerarşisi: Tarih → Saat → (süre) → Müşteri → Hizmet → Uzman → Durum → Not */
  const renderAppointmentFormFields = (mode: 'create' | 'edit') => (
    <>
      {formError ? <ErrorBanner message={formError} onRetry={() => setFormError(null)} /> : null}

      <View style={styles.formSection}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Zaman</Text>
        <View style={styles.row2}>
          <FormField
            label="Tarih"
            value={appointmentDate}
            onChangeText={setAppointmentDate}
            placeholder="YYYY-MM-DD"
            containerStyle={{ flex: 1 }}
          />
          <FormField
            label="Saat"
            value={appointmentTime}
            onChangeText={setAppointmentTime}
            placeholder="10:00"
            containerStyle={{ flex: 1 }}
          />
        </View>
        {selectedService?.duration_min ? (
          <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
            Süre (hizmet): {selectedService.duration_min} dk
            {/* TODO(beauty-mobile): süre override + cihaz alanı (web AppointmentPOS) */}
          </Text>
        ) : null}
      </View>

      <View style={styles.formSection}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Müşteri & hizmet</Text>
        {mode === 'create' ? (
          <>
            <FormField
              label="Müşteri adı"
              value={customerName}
              onChangeText={(t) => {
                setCustomerName(t);
                setSelectedCustomerId(null);
              }}
              placeholder="Ad soyad veya telefon"
            />
            {selectedCustomerId ? (
              <Text style={{ color: CLINIC.violet, fontSize: 11, fontWeight: '700', marginTop: 4 }}>
                Cari bağlı · anket için hazır
              </Text>
            ) : null}
            {customerHits.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pickRow}
                style={{ marginTop: 6 }}
              >
                {customerHits.map((c) => {
                  const active = selectedCustomerId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        setSelectedCustomerId(c.id);
                        setCustomerName(c.name);
                      }}
                      style={[
                        styles.pickChip,
                        {
                          backgroundColor: active ? CLINIC.violet : colors.card,
                          borderColor: active ? CLINIC.violet : colors.cardBorder,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? palette.white : colors.text,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                        numberOfLines={1}
                      >
                        {c.file_id ? `#${c.file_id} ` : ''}
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </>
        ) : (
          <View style={[styles.readOnlyBox, { backgroundColor: colors.backgroundAlt, borderColor: colors.cardBorder }]}>
            <Text style={[styles.pickLabel, { color: colors.textMuted, marginTop: 0 }]}>Müşteri</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              {editAppt?.customer_name || 'Müşteri'}
            </Text>
            {editAppt?.client_id || selectedCustomerId ? (
              <Text style={{ color: CLINIC.violet, fontSize: 10, fontWeight: '700', marginTop: 4 }}>
                Cari bağlı
              </Text>
            ) : (
              <Text style={{ color: colors.textSubtle, fontSize: 10, marginTop: 4 }}>
                Cari yok — tamamlanınca anket için cari aranır
              </Text>
            )}
          </View>
        )}
        {renderChipRow(
          'Hizmet',
          services.map((s) => ({ id: s.id, label: s.name })),
          selectedServiceId,
          (id) => setSelectedServiceId(id),
        )}
        {specialists.length > 0
          ? renderChipRow(
              'Uzman',
              specialists.map((sp) => ({ id: sp.id, label: sp.name })),
              selectedSpecialistId,
              setSelectedSpecialistId,
              { label: 'Fark etmez' },
            )
          : null}
      </View>

      {mode === 'edit' ? (
        <View style={styles.formSection}>
          {renderChipRow(
            'Durum',
            BEAUTY_STATUSES.map((s) => ({ id: s, label: statusLabel(s) })),
            editStatus,
            (id) => setEditStatus(id || 'scheduled'),
          )}
        </View>
      ) : null}

      <View style={styles.formSection}>
        <FormField label="Not" value={notes} onChangeText={setNotes} placeholder="İsteğe bağlı" />
      </View>
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Güzellik Merkezi"
        subtitle="Takvim · Randevu · Satış · Hizmet · Uzman"
        right={
          <HeaderIconButton onPress={() => navigation.navigate('BeautySurvey')}>
            <ClipboardList size={18} color={palette.white} />
          </HeaderIconButton>
        }
      />
      <SegmentTabBar
        layout="scroll"
        value={tab}
        onChange={setTab}
        items={tabs.map((t) => ({ id: t.id, label: `${t.label} (${t.count})` }))}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'appointments' ? (
        <View style={[styles.apptRoot, { backgroundColor: clinic.bg }]}>
          <View style={[styles.modeSegTrack, { backgroundColor: clinic.segmentBg }]}>
            {(
              [
                { id: 'calendar' as const, label: 'Takvim' },
                { id: 'list' as const, label: 'Liste' },
              ] as const
            ).map((m) => {
              const active = apptMode === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setApptMode(m.id)}
                  style={[
                    styles.modeSegTab,
                    active && { backgroundColor: clinic.surface },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? clinic.violet : clinic.textSub,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {apptMode === 'calendar' ? (
            <BeautyCalendarPanel
              colors={colors}
              appointments={appointments}
              currentDate={calDate}
              view={calView}
              onViewChange={setCalView}
              onDateChange={setCalDate}
              onAppointmentPress={openEdit}
              onSlotPress={(dateYmd, timeHHmm) => {
                setCalDate(parseYmd(dateYmd));
                openCreate(dateYmd, timeHHmm);
              }}
              refreshing={loading}
              onRefresh={() => void load()}
            />
          ) : (
            <>
              <View style={styles.filters}>
                {(['all', 'scheduled', 'completed'] as ApptFilter[]).map((f) => {
                  const active = apptFilter === f;
                  return (
                    <Pressable
                      key={f}
                      onPress={() => setApptFilter(f)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: active ? clinic.violetLight : clinic.surface,
                          borderColor: active ? clinic.violet : clinic.borderMuted,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: active ? clinic.violet : clinic.textSub,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {f === 'all' ? 'Tümü' : f === 'scheduled' ? 'Planlı' : 'Tamamlanan'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <FlatList
                data={filteredAppointments}
                keyExtractor={(item) => String(item.id)}
                refreshControl={
                  <RefreshControl
                    refreshing={loading}
                    onRefresh={() => void load()}
                    tintColor={CLINIC.violet}
                  />
                }
                ListEmptyComponent={<EmptyState message="Randevu kaydı yok (şema/veri kontrol)" />}
                contentContainerStyle={styles.list}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => openEdit(item)}
                    style={[
                      styles.card,
                      {
                        backgroundColor: clinic.surface,
                        borderColor: clinic.border,
                        borderLeftColor: item.service_color || CLINIC.violet,
                        borderLeftWidth: 3,
                      },
                    ]}
                  >
                    <View style={styles.cardTop}>
                      <Text style={{ color: clinic.textPrimary, fontWeight: '700', flex: 1 }}>
                        {item.customer_name || 'Müşteri'}
                      </Text>
                      <View style={[styles.badge, { backgroundColor: CLINIC.violetLight }]}>
                        <Text style={{ color: CLINIC.violet, fontSize: 10, fontWeight: '800' }}>
                          {statusLabel(item.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: clinic.textSub, fontSize: 12 }}>{item.service_name || '—'}</Text>
                    <Text style={{ color: clinic.textMuted, fontSize: 11, marginTop: 4 }}>
                      {item.starts_at?.slice(0, 16) || '—'}
                      {item.specialist_name ? ` · ${item.specialist_name}` : ''}
                    </Text>
                    {item.total_price > 0 ? (
                      <Text style={{ color: CLINIC.violet, fontWeight: '700', marginTop: 4 }}>
                        {formatMoney(item.total_price)}
                      </Text>
                    ) : null}
                  </Pressable>
                )}
              />
            </>
          )}

          <Pressable
            style={[styles.fab, { backgroundColor: CLINIC.violet }]}
            onPress={() => openCreate(formatLocalYmd(calDate))}
          >
            <Plus color={palette.white} size={22} />
          </Pressable>
        </View>
      ) : tab === 'sales' ? (
        <BeautySalesPanel
          colors={colors}
          sales={sales}
          services={services}
          specialists={specialists}
          loading={loading}
          onRefresh={() => void load()}
          onSaleCreated={() => void load()}
        />
      ) : tab === 'services' ? (
        <FlatList
          data={services}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<EmptyState message="Hizmet kartı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {item.duration_min ? `${item.duration_min} dk` : ''}
              </Text>
              <Text style={{ color: palette.blue600, fontWeight: '700' }}>{formatMoney(item.price)}</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={specialists}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={<EmptyState message="Uzman kaydı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.title || '—'}</Text>
            </View>
          )}
        />
      )}

      <PercentBodySheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni randevu"
        subtitle="Güzellik merkezi"
        size="list"
        footer={
          <>
            <PrimaryButton label="İptal" variant="ghost" onPress={() => setCreateOpen(false)} style={{ flex: 1 }} />
            <PrimaryButton
              label="Randevu kaydet"
              onPress={() => void handleCreate()}
              loading={saving}
              style={{ flex: 2 }}
            />
          </>
        }
      >
        {renderAppointmentFormFields('create')}
      </PercentBodySheet>

      <PercentBodySheet
        visible={!!editAppt}
        onClose={() => setEditAppt(null)}
        title="Randevu düzenle"
        subtitle={editAppt?.customer_name || 'Randevu'}
        size="list"
        footer={
          <>
            <PrimaryButton label="İptal" variant="ghost" onPress={() => setEditAppt(null)} style={{ flex: 1 }} />
            <PrimaryButton
              label="Kaydet"
              onPress={() => void handleUpdate()}
              loading={saving}
              style={{ flex: 2 }}
            />
          </>
        }
      >
        {renderAppointmentFormFields('edit')}
        {editAppt && String(editAppt.status || '').toLowerCase() !== 'completed' ? (
          <PrimaryButton
            label="Tamamlandı olarak kaydet"
            variant="ghost"
            loading={saving}
            onPress={() => void handleUpdate('completed')}
            style={{ marginTop: 4 }}
          />
        ) : null}
      </PercentBodySheet>

      <BeautySurveyRespondSheet
        visible={!!surveyTarget}
        onClose={() => setSurveyTarget(null)}
        onSaved={() => void load()}
        customerId={surveyTarget?.client_id || ''}
        customerName={surveyTarget?.customer_name}
        appointmentId={surveyTarget?.id}
        appointmentSubtitle={
          surveyTarget
            ? `${surveyTarget.customer_name || 'Müşteri'} — ${surveyTarget.service_name || 'Hizmet'}`
            : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  apptRoot: { flex: 1 },
  modeSegTrack: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 7,
    padding: 3,
    gap: 2,
  },
  modeSegTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 5,
    alignItems: 'center',
  },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1 },
  list: { padding: 12, gap: 8, paddingBottom: 88 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  pickLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 4,
    marginBottom: 6,
  },
  pickRow: { gap: 8, paddingVertical: 4 },
  pickChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  formSection: { gap: 8, marginBottom: 4 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  row2: { flexDirection: 'row', gap: 10 },
  readOnlyBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
});
