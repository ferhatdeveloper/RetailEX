import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus, ArrowLeft } from 'lucide-react-native';
import { GradientHeader, HeaderIconButton } from '../components/GradientHeader';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchBeautyAppointments,
  fetchBeautyServices,
  fetchBeautySpecialists,
  createBeautyAppointment,
  updateBeautyAppointment,
  BEAUTY_STATUSES,
  type BeautyAppointment,
  type BeautyService,
  type BeautySpecialist,
} from '../api/beautyApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'appointments' | 'services' | 'specialists';
type ApptFilter = 'all' | 'scheduled' | 'completed';
type Props = NativeStackScreenProps<MainStackParamList, 'Beauty'>;

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

export function BeautyScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const initialTab = route.params?.initialTab ?? 'appointments';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [apptFilter, setApptFilter] = useState<ApptFilter>('all');
  const [appointments, setAppointments] = useState<BeautyAppointment[]>([]);
  const [services, setServices] = useState<BeautyService[]>([]);
  const [specialists, setSpecialists] = useState<BeautySpecialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editAppt, setEditAppt] = useState<BeautyAppointment | null>(null);
  const [customerName, setCustomerName] = useState('');
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
      const [a, s, sp] = await Promise.all([
        fetchBeautyAppointments(),
        fetchBeautyServices(),
        fetchBeautySpecialists(),
      ]);
      setAppointments(a);
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
    if (route.params?.openCreate) {
      setTab('appointments');
      setCreateOpen(true);
    }
  }, [route.params?.openCreate]);

  const filteredAppointments = useMemo(() => {
    if (apptFilter === 'all') return appointments;
    return appointments.filter((a) => String(a.status || '').toLowerCase() === apptFilter);
  }, [appointments, apptFilter]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'appointments', label: 'Randevu', count: appointments.length },
    { id: 'services', label: 'Hizmet', count: services.length },
    { id: 'specialists', label: 'Uzman', count: specialists.length },
  ];

  const resetForm = () => {
    setCustomerName('');
    setAppointmentDate(todayYmd());
    setAppointmentTime('10:00');
    setNotes('');
    setEditStatus('scheduled');
    setSelectedSpecialistId(null);
    setFormError(null);
    if (services.length) setSelectedServiceId(services[0].id);
  };

  const openEdit = (item: BeautyAppointment) => {
    const parsed = parseStartsAt(item.starts_at);
    setEditAppt(item);
    setAppointmentDate(item.appointment_date || parsed.date);
    setAppointmentTime(
      (item.appointment_time || parsed.time).toString().slice(0, 5) || '10:00',
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
      await createBeautyAppointment({
        customerName: customerName.trim(),
        serviceId: selectedServiceId,
        specialistId: selectedSpecialistId,
        appointmentDate: appointmentDate.trim(),
        appointmentTime: appointmentTime.trim(),
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

  const handleUpdate = async () => {
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
    try {
      await updateBeautyAppointment(editAppt.id, {
        serviceId: selectedServiceId,
        specialistId: selectedSpecialistId,
        clearSpecialist: !selectedSpecialistId,
        appointmentDate: appointmentDate.trim(),
        appointmentTime: appointmentTime.trim(),
        status: editStatus,
        notes: notes.trim() || null,
      });
      setEditAppt(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Güzellik Merkezi" subtitle="Randevu · Hizmet · Uzman" />
      <View style={styles.tabs}>
        {tabs.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[
              styles.tab,
              {
                backgroundColor: tab === t.id ? palette.blue600 : colors.card,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: tab === t.id ? palette.white : colors.text, fontSize: 12, fontWeight: '700' }}>
              {t.label} ({t.count})
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'appointments' ? (
        <>
          <View style={styles.filters}>
            {(['all', 'scheduled', 'completed'] as ApptFilter[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => setApptFilter(f)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: apptFilter === f ? palette.blue600 : colors.card,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={{ color: apptFilter === f ? palette.white : colors.text, fontSize: 11, fontWeight: '700' }}>
                  {f === 'all' ? 'Tümü' : f === 'scheduled' ? 'Planlı' : 'Tamamlanan'}
                </Text>
              </Pressable>
            ))}
          </View>
          <FlatList
            data={filteredAppointments}
            keyExtractor={(item) => String(item.id)}
            refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
            ListEmptyComponent={<EmptyState message="Randevu kaydı yok (şema/veri kontrol)" />}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openEdit(item)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <View style={styles.cardTop}>
                  <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>
                    {item.customer_name || 'Müşteri'}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: palette.blue100 }]}>
                    <Text style={{ color: palette.blue700, fontSize: 10, fontWeight: '800' }}>
                      {statusLabel(item.status)}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.service_name || '—'}</Text>
                <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                  {item.starts_at?.slice(0, 16) || '—'}
                  {item.specialist_name ? ` · ${item.specialist_name}` : ''}
                </Text>
                {item.total_price > 0 ? (
                  <Text style={{ color: palette.blue600, fontWeight: '700', marginTop: 4 }}>
                    {formatMoney(item.total_price)} ₺
                  </Text>
                ) : null}
              </Pressable>
            )}
          />
          <Pressable
            style={[styles.fab, { backgroundColor: palette.blue600 }]}
            onPress={() => {
              resetForm();
              setCreateOpen(true);
            }}
          >
            <Plus color={palette.white} size={22} />
          </Pressable>
        </>
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
              <Text style={{ color: palette.blue600, fontWeight: '700' }}>{formatMoney(item.price)} ₺</Text>
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

      <Modal visible={createOpen} animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          style={[styles.modalRoot, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <GradientHeader compact>
            <View style={styles.modalHeaderRow}>
              <HeaderIconButton onPress={() => setCreateOpen(false)}>
                <ArrowLeft size={18} color={palette.white} />
              </HeaderIconButton>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.white, fontSize: 16, fontWeight: '700' }}>Yeni randevu</Text>
                <Text style={{ color: palette.blue100, fontSize: 10, marginTop: 2 }}>Güzellik merkezi</Text>
              </View>
              <View style={{ width: 36 }} />
            </View>
          </GradientHeader>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {formError ? <ErrorBanner message={formError} onRetry={() => setFormError(null)} /> : null}
            <FormField label="Müşteri adı" value={customerName} onChangeText={setCustomerName} placeholder="Ad soyad" />
            <FormField
              label="Tarih"
              value={appointmentDate}
              onChangeText={setAppointmentDate}
              placeholder="YYYY-MM-DD"
            />
            <FormField label="Saat" value={appointmentTime} onChangeText={setAppointmentTime} placeholder="10:00" />
            <Text style={[styles.pickLabel, { color: colors.textMuted }]}>Hizmet</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
              {services.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setSelectedServiceId(s.id)}
                  style={[
                    styles.pickChip,
                    {
                      backgroundColor: selectedServiceId === s.id ? palette.blue600 : colors.card,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selectedServiceId === s.id ? palette.white : colors.text,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {s.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {specialists.length > 0 ? (
              <>
                <Text style={[styles.pickLabel, { color: colors.textMuted }]}>Uzman (isteğe bağlı)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
                  <Pressable
                    onPress={() => setSelectedSpecialistId(null)}
                    style={[
                      styles.pickChip,
                      {
                        backgroundColor: !selectedSpecialistId ? palette.blue600 : colors.card,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: !selectedSpecialistId ? palette.white : colors.text,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      Fark etmez
                    </Text>
                  </Pressable>
                  {specialists.map((sp) => (
                    <Pressable
                      key={sp.id}
                      onPress={() => setSelectedSpecialistId(sp.id)}
                      style={[
                        styles.pickChip,
                        {
                          backgroundColor: selectedSpecialistId === sp.id ? palette.blue600 : colors.card,
                          borderColor: colors.cardBorder,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selectedSpecialistId === sp.id ? palette.white : colors.text,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {sp.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <FormField label="Not" value={notes} onChangeText={setNotes} placeholder="İsteğe bağlı" />
            <PrimaryButton label="Randevu kaydet" onPress={() => void handleCreate()} loading={saving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editAppt} animationType="slide" onRequestClose={() => setEditAppt(null)}>
        <KeyboardAvoidingView
          style={[styles.modalRoot, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <GradientHeader compact>
            <View style={styles.modalHeaderRow}>
              <HeaderIconButton onPress={() => setEditAppt(null)}>
                <ArrowLeft size={18} color={palette.white} />
              </HeaderIconButton>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.white, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                  Randevu düzenle
                </Text>
                <Text style={{ color: palette.blue100, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                  {editAppt?.customer_name || 'Randevu'}
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>
          </GradientHeader>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {formError ? <ErrorBanner message={formError} onRetry={() => setFormError(null)} /> : null}
            <FormField
              label="Tarih"
              value={appointmentDate}
              onChangeText={setAppointmentDate}
              placeholder="YYYY-MM-DD"
            />
            <FormField label="Saat" value={appointmentTime} onChangeText={setAppointmentTime} placeholder="10:00" />
            <Text style={[styles.pickLabel, { color: colors.textMuted }]}>Durum</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
              {BEAUTY_STATUSES.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setEditStatus(s)}
                  style={[
                    styles.pickChip,
                    {
                      backgroundColor: editStatus === s ? palette.blue600 : colors.card,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: editStatus === s ? palette.white : colors.text,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {statusLabel(s)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={[styles.pickLabel, { color: colors.textMuted }]}>Hizmet</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
              {services.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => setSelectedServiceId(s.id)}
                  style={[
                    styles.pickChip,
                    {
                      backgroundColor: selectedServiceId === s.id ? palette.blue600 : colors.card,
                      borderColor: colors.cardBorder,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selectedServiceId === s.id ? palette.white : colors.text,
                      fontSize: 11,
                      fontWeight: '700',
                    }}
                  >
                    {s.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {specialists.length > 0 ? (
              <>
                <Text style={[styles.pickLabel, { color: colors.textMuted }]}>Uzman</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
                  <Pressable
                    onPress={() => setSelectedSpecialistId(null)}
                    style={[
                      styles.pickChip,
                      {
                        backgroundColor: !selectedSpecialistId ? palette.blue600 : colors.card,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: !selectedSpecialistId ? palette.white : colors.text,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      Fark etmez
                    </Text>
                  </Pressable>
                  {specialists.map((sp) => (
                    <Pressable
                      key={sp.id}
                      onPress={() => setSelectedSpecialistId(sp.id)}
                      style={[
                        styles.pickChip,
                        {
                          backgroundColor: selectedSpecialistId === sp.id ? palette.blue600 : colors.card,
                          borderColor: colors.cardBorder,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: selectedSpecialistId === sp.id ? palette.white : colors.text,
                          fontSize: 11,
                          fontWeight: '700',
                        }}
                      >
                        {sp.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <FormField label="Not" value={notes} onChangeText={setNotes} placeholder="İsteğe bağlı" />
            <PrimaryButton label="Kaydet" onPress={() => void handleUpdate()} loading={saving} />
            {String(editAppt?.status || '').toLowerCase() !== 'completed' ? (
              <PrimaryButton
                label="Tamamlandı olarak kaydet"
                variant="ghost"
                loading={saving}
                onPress={() => {
                  setEditStatus('completed');
                  void (async () => {
                    if (!editAppt || !selectedServiceId) return;
                    setSaving(true);
                    setFormError(null);
                    try {
                      await updateBeautyAppointment(editAppt.id, {
                        serviceId: selectedServiceId,
                        specialistId: selectedSpecialistId,
                        clearSpecialist: !selectedSpecialistId,
                        appointmentDate: appointmentDate.trim(),
                        appointmentTime: appointmentTime.trim(),
                        status: 'completed',
                        notes: notes.trim() || null,
                      });
                      setEditAppt(null);
                      await load();
                    } catch (e) {
                      setFormError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setSaving(false);
                    }
                  })();
                }}
                style={{ marginTop: 4 }}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 6, padding: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
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
  modalRoot: { flex: 1 },
  modalBody: { padding: 16, gap: 12, paddingBottom: 48 },
  pickLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', marginTop: 4 },
  pickRow: { gap: 8, paddingVertical: 4 },
  pickChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 2 },
});
