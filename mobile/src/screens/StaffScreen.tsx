import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { SegmentTabBar } from '../components/SegmentTabBar';
import {
  createStaff,
  fetchAttendance,
  fetchStaff,
  saveAttendance,
  type AttendanceRow,
  type StaffRow,
} from '../api/staffApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'list' | 'attendance' | 'payroll' | 'performance';
type Props = NativeStackScreenProps<MainStackParamList, 'Staff'>;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function StaffScreen({ route }: Props) {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const initial = route.params?.initialTab ?? 'list';
  const [tab, setTab] = useState<Tab>(
    initial === 'payroll' || initial === 'attendance' || initial === 'performance' ? initial : 'list',
  );
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const people = await fetchStaff();
      setStaff(people);
      if (tab === 'attendance') setAttendance(await fetchAttendance(today()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const payrollTotal = useMemo(
    () => staff.reduce((sum, row) => sum + (Number(row.base_salary) || 0), 0),
    [staff],
  );

  const onCreate = async () => {
    if (!name.trim()) {
      Alert.alert(t('ops.needName', { defaultValue: 'Ad gerekli' }));
      return;
    }
    setBusy(true);
    try {
      await createStaff({
        fullName: name.trim(),
        phone: phone.trim() || undefined,
        baseSalary: Number(salary.replace(',', '.')) || 0,
      });
      setName('');
      setPhone('');
      setSalary('');
      await load();
    } catch (e) {
      Alert.alert(t('ops.saveFail', { defaultValue: 'Kayıt hatası' }), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onPresent = async (person: StaffRow) => {
    setBusy(true);
    try {
      await saveAttendance({
        staffId: person.id,
        staffName: person.full_name,
        date: today(),
        status: 'present',
        clockIn: '09:00',
      });
      await load();
    } catch (e) {
      Alert.alert(t('ops.saveFail', { defaultValue: 'Kayıt hatası' }), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tabs = [
    { id: 'list' as const, label: t('ops.staffList', { defaultValue: 'Personel' }) },
    { id: 'attendance' as const, label: t('ops.staffAttendance', { defaultValue: 'Puantaj' }) },
    { id: 'payroll' as const, label: t('ops.staffPayroll', { defaultValue: 'Maaş özeti' }) },
    { id: 'performance' as const, label: t('ops.staffPerformance', { defaultValue: 'Performans' }) },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title={t('ops.staffTitle', { defaultValue: 'İnsan kaynakları' })} />
      <SegmentTabBar layout="scroll" value={tab} onChange={setTab} items={tabs} />
      {tab === 'list' ? (
        <View style={styles.form}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('ops.namePh', { defaultValue: 'Ad' })}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          />
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder={t('ops.phonePh', { defaultValue: 'Telefon' })}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          />
          <TextInput
            value={salary}
            onChangeText={setSalary}
            keyboardType="decimal-pad"
            placeholder={t('ops.salaryPh', { defaultValue: 'Aylık ücret' })}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          />
          <PrimaryButton label={busy ? '…' : t('save', { defaultValue: 'Kaydet' })} onPress={() => void onCreate()} disabled={busy} />
        </View>
      ) : null}
      {tab === 'payroll' ? (
        <Text style={[styles.total, { color: colors.text }]}>
          {t('ops.salarySum', { defaultValue: 'Kart ücret toplamı' })}: {formatMoney(payrollTotal)}
        </Text>
      ) : null}
      {tab === 'performance' ? (
        <Text style={[styles.total, { color: colors.textMuted }]}>
          {t('ops.performanceNote', {
            defaultValue: 'Prim, hedef ve KPI kaydı web ile aynı: henüz fiş yok. Ücret personel kartındaki taban maaştır.',
          })}
        </Text>
      ) : null}
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={palette.blue600} />
      ) : tab === 'attendance' ? (
        <FlatList
          data={staff}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message={t('ops.empty', { defaultValue: 'Kayıt yok' })} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mark = attendance.find((row) => row.staff_name === item.full_name);
            return (
              <Pressable
                onPress={() => void onPresent(item)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>{item.full_name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {mark ? `${mark.status || '—'} ${mark.clock_in || ''}` : t('ops.tapPresent', { defaultValue: 'Geldi işaretle' })}
                </Text>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message={t('ops.empty', { defaultValue: 'Kayıt yok' })} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.full_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.position || item.department || '—'}
                {tab === 'payroll' ? ` · ${formatMoney(item.base_salary)}` : item.phone ? ` · ${item.phone}` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { gap: 8, padding: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  total: { paddingHorizontal: 16, paddingTop: 8, fontWeight: '800' },
});
