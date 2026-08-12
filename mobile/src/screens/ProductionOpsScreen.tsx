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
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { HeaderIconButton } from '../components/GradientHeader';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createButcherRecipe,
  createProductionRecipe,
  fetchButcherRecipes,
  fetchProductionRecipes,
  type ButcherRecipeRow,
  type ProductionRecipeRow,
} from '../api/productionOpsApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import { formatMoney } from '../api/erpTables';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'production' | 'butcher';
type Props = NativeStackScreenProps<MainStackParamList, 'ProductionOps'>;

export function productionOpsRouteTab(screenId?: string): Tab {
  if (screenId === 'butcher-production') return 'butcher';
  return 'production';
}

export function ProductionOpsScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const initial = productionOpsRouteTab(route.params?.screenId);
  const [tab, setTab] = useState<Tab>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [production, setProduction] = useState<ProductionRecipeRow[]>([]);
  const [butcher, setButcher] = useState<ButcherRecipeRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [animalType, setAnimalType] = useState('sheep');

  useEffect(() => {
    setTab(productionOpsRouteTab(route.params?.screenId));
  }, [route.params?.screenId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, b] = await Promise.all([fetchProductionRecipes(), fetchButcherRecipes()]);
      setProduction(p);
      setButcher(b);
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

  const title = tab === 'production' ? 'Üretim reçeteleri' : 'Kasap üretim';
  const count = tab === 'production' ? production.length : butcher.length;

  const openCreate = () => {
    setName('');
    setCode('');
    setDescription('');
    setAnimalType('sheep');
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Eksik alan', 'Reçete adı zorunlu.');
      return;
    }
    setSaving(true);
    try {
      if (tab === 'production') {
        const id = await createProductionRecipe({ name, description });
        setShowCreate(false);
        navigation.navigate('ProductionRecipeDetail', { recipeId: id, kind: 'production' });
      } else {
        const id = await createButcherRecipe({ name, code, animalType, description });
        setShowCreate(false);
        navigation.navigate('ProductionRecipeDetail', { recipeId: id, kind: 'butcher' });
      }
      setLoading(true);
      await load();
    } catch (e) {
      Alert.alert('Kayıt hatası', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const animalOptions = useMemo(
    () => [
      { id: 'sheep', label: 'Koyun' },
      { id: 'cattle', label: 'Sığır' },
      { id: 'goat', label: 'Keçi' },
      { id: 'other', label: 'Diğer' },
    ],
    [],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={title}
        subtitle={user?.firmNr ? `Firma ${user.firmNr} · ${count} reçete` : 'Üretim'}
        right={
          <HeaderIconButton accent onPress={openCreate}>
            <Plus size={18} color={palette.white} />
          </HeaderIconButton>
        }
      />
      <SegmentTabBar
        layout="scroll"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'production' as const, label: 'Üretim' },
          { id: 'butcher' as const, label: 'Kasap' },
        ]}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'production' ? (
        <FlatList
          data={production}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Üretim reçetesi yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('ProductionRecipeDetail', {
                  recipeId: item.id,
                  kind: 'production',
                })
              }
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>{item.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.product_name || 'Ürün seçilmedi'}
                {item.wastage_percent ? ` · fire %${item.wastage_percent}` : ''}
              </Text>
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>
                Maliyet {formatMoney(item.total_cost)}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={butcher}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Kasap reçetesi yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('ProductionRecipeDetail', {
                  recipeId: item.id,
                  kind: 'butcher',
                })
              }
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.code ? `${item.code} · ` : ''}
                {item.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.animal_type}
                {item.description ? ` · ${item.description}` : ''}
              </Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCreate(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {tab === 'production' ? 'Yeni üretim reçetesi' : 'Yeni kasap reçetesi'}
            </Text>
            {tab === 'butcher' ? (
              <FormField label="Kod" value={code} onChangeText={setCode} autoCapitalize="characters" />
            ) : null}
            <FormField label="Ad" value={name} onChangeText={setName} />
            {tab === 'butcher' ? (
              <View style={styles.animalRow}>
                {animalOptions.map((a) => (
                  <Pressable
                    key={a.id}
                    onPress={() => setAnimalType(a.id)}
                    style={[
                      styles.animalChip,
                      {
                        backgroundColor: animalType === a.id ? palette.blue600 : colors.background,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: animalType === a.id ? palette.white : colors.text,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {a.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <FormField label="Açıklama" value={description} onChangeText={setDescription} multiline />
            <PrimaryButton
              label={saving ? 'Kaydediliyor…' : 'Kaydet'}
              onPress={() => void handleSave()}
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
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
    gap: 4,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  animalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  animalChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
});
