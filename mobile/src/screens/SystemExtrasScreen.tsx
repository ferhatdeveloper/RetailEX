import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { HeaderIconButton } from '../components/GradientHeader';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createBarcodeTemplate,
  fetchBarcodeTemplates,
  loadCallerIdConfig,
  saveCallerIdConfig,
  type BarcodeTemplateRow,
  type CallerIdConfig,
  type CallerIdMode,
} from '../api/systemExtrasApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'labels' | 'pbx';
type Props = NativeStackScreenProps<MainStackParamList, 'SystemExtras'>;

export function systemExtrasRouteTab(screenId?: string): Tab {
  if (screenId === 'virtual-pbx-caller-id') return 'pbx';
  return 'labels';
}

const MODES: { id: CallerIdMode; label: string; desc: string }[] = [
  { id: 'off', label: 'Kapalı', desc: 'Caller ID dinleme yok' },
  { id: 'virtual_pbx', label: 'Sanal santral', desc: 'HTTP poll / webhook URL' },
  { id: 'physical_device', label: 'Fiziksel cihaz', desc: 'USB / köprü cihazı' },
  { id: 'physical_serial', label: 'Seri port', desc: 'Masaüstü COM; mobilde kayıt' },
];

export function SystemExtrasScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const [tab, setTab] = useState<Tab>(systemExtrasRouteTab(route.params?.screenId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<BarcodeTemplateRow[]>([]);
  const [caller, setCaller] = useState<CallerIdConfig | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('Fatura etiket');
  const [prefix, setPrefix] = useState('869');
  const [currentValue, setCurrentValue] = useState('1000000');
  const [length, setLength] = useState('13');

  useEffect(() => {
    setTab(systemExtrasRouteTab(route.params?.screenId));
  }, [route.params?.screenId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, c] = await Promise.all([fetchBarcodeTemplates(), loadCallerIdConfig()]);
      setTemplates(t);
      setCaller(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const handleCreateTemplate = async () => {
    setSaving(true);
    try {
      await createBarcodeTemplate({
        name,
        prefix,
        currentValue: Number(currentValue),
        length: Number(length),
      });
      setShowCreate(false);
      setLoading(true);
      await load();
    } catch (e) {
      Alert.alert('Kayıt hatası', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const persistCaller = async (next: CallerIdConfig) => {
    setCaller(next);
    try {
      await saveCallerIdConfig(next);
    } catch (e) {
      Alert.alert('Kayıt hatası', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={tab === 'labels' ? 'Fatura etiket tasarımı' : 'Sanal santral (Caller ID)'}
        subtitle={tab === 'labels' ? 'Barkod şablonları' : 'Yerel cihaz ayarı'}
        right={
          tab === 'labels' ? (
            <HeaderIconButton
              accent
              onPress={() => {
                setName('Fatura etiket');
                setPrefix('869');
                setCurrentValue('1000000');
                setLength('13');
                setShowCreate(true);
              }}
            >
              <Plus size={18} color={palette.white} />
            </HeaderIconButton>
          ) : undefined
        }
      />
      <SegmentTabBar
        layout="scroll"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'labels' as const, label: 'Etiket / barkod' },
          { id: 'pbx' as const, label: 'Caller ID' },
        ]}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'labels' ? (
        <FlatList
          data={templates}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Barkod / etiket şablonu yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Ön ek {item.prefix || '—'} · değer {item.current_value} · uzunluk {item.length}
              </Text>
              {!item.is_active ? (
                <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>Pasif</Text>
              ) : null}
            </View>
          )}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        >
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Ayarlar bu cihazda saklanır. Canlı arama dinleme masaüstü / Tauri köprüsünde tam çalışır.
          </Text>
          {MODES.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => void persistCaller({ ...(caller ?? { mode: 'off', pollUrl: '', pollIntervalSec: 3, deviceHint: '' }), mode: m.id })}
              style={[
                styles.card,
                {
                  backgroundColor: colors.card,
                  borderColor: caller?.mode === m.id ? palette.blue600 : colors.cardBorder,
                },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>{m.label}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{m.desc}</Text>
            </Pressable>
          ))}
          {caller?.mode === 'virtual_pbx' || caller?.mode === 'physical_device' ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, gap: 8 }]}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Poll URL</Text>
              <TextInput
                value={caller.pollUrl}
                onChangeText={(pollUrl) => setCaller({ ...caller, pollUrl })}
                onEndEditing={() => void persistCaller(caller)}
                placeholder="https://…"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="none"
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Aralık (sn)</Text>
              <TextInput
                value={String(caller.pollIntervalSec)}
                onChangeText={(v) =>
                  setCaller({ ...caller, pollIntervalSec: Math.max(1, Number(v.replace(/\D/g, '')) || 3) })
                }
                onEndEditing={() => void persistCaller(caller)}
                keyboardType="number-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
              <PrimaryButton label="Kaydet" onPress={() => void persistCaller(caller)} />
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCreate(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Yeni etiket şablonu</Text>
            <FormField label="Ad" value={name} onChangeText={setName} />
            <FormField label="Ön ek" value={prefix} onChangeText={setPrefix} keyboardType="number-pad" />
            <FormField label="Başlangıç değeri" value={currentValue} onChangeText={setCurrentValue} keyboardType="number-pad" />
            <FormField label="Uzunluk" value={length} onChangeText={setLength} keyboardType="number-pad" />
            <PrimaryButton
              label={saving ? 'Kaydediliyor…' : 'Kaydet'}
              onPress={() => void handleCreateTemplate()}
              disabled={saving}
              loading={saving}
            />
            <Pressable onPress={() => setShowCreate(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>İptal</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 4 },
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
});
