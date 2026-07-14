import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Plus, Trash2 } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchButcherRecipeById,
  fetchProductionRecipeById,
  saveButcherRecipeOutputs,
  saveProductionRecipeIngredients,
  type ButcherOutputRow,
  type ButcherRecipeDetail,
  type ProductionIngredientRow,
  type ProductionRecipeDetail,
} from '../api/productionOpsApi';
import { fetchProducts, type ProductRow } from '../api/productsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export function ProductionRecipeDetailScreen() {
  const { colors } = useThemeStore();
  const route = useRoute<RouteProp<MainStackParamList, 'ProductionRecipeDetail'>>();
  const { recipeId, kind } = route.params;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [production, setProduction] = useState<ProductionRecipeDetail | null>(null);
  const [butcher, setButcher] = useState<ButcherRecipeDetail | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [hits, setHits] = useState<ProductRow[]>([]);
  const [qty, setQty] = useState('1');
  const [ratio, setRatio] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (kind === 'butcher') {
        setButcher(await fetchButcherRecipeById(recipeId));
        setProduction(null);
      } else {
        setProduction(await fetchProductionRecipeById(recipeId));
        setButcher(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [kind, recipeId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const runSearch = async (q: string) => {
    setSearch(q);
    if (q.trim().length < 1) {
      setHits([]);
      return;
    }
    try {
      setHits(await fetchProducts(q.trim(), 20));
    } catch {
      setHits([]);
    }
  };

  const persistProduction = async (next: ProductionIngredientRow[]) => {
    setSaving(true);
    try {
      await saveProductionRecipeIngredients(
        recipeId,
        next.map((r) => ({
          materialId: r.material_id,
          quantity: r.quantity,
          unit: r.unit || 'Adet',
          cost: r.cost,
        })),
      );
      await load();
    } catch (e) {
      Alert.alert('Kayıt hatası', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const persistButcher = async (next: ButcherOutputRow[]) => {
    setSaving(true);
    try {
      await saveButcherRecipeOutputs(
        recipeId,
        next.map((r, i) => ({
          productId: r.product_id,
          sortOrder: r.sort_order ?? i,
          standardRatioPercent: r.standard_ratio_percent,
          coefficient: r.coefficient,
        })),
      );
      await load();
    } catch (e) {
      Alert.alert('Kayıt hatası', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const addProduct = async (p: ProductRow) => {
    const quantity = Math.abs(Number(String(qty).replace(',', '.')) || 0);
    if (quantity <= 0) {
      Alert.alert('Geçersiz', 'Miktar 0’dan büyük olmalı');
      return;
    }
    if (kind === 'production') {
      if (!production) return;
      const next: ProductionIngredientRow[] = [
        ...production.ingredients,
        {
          id: `tmp-${p.id}`,
          material_id: String(p.id),
          material_name: p.name,
          material_code: p.code || null,
          quantity,
          unit: p.unit || 'Adet',
          cost: 0,
        },
      ];
      setShowAdd(false);
      setHits([]);
      setSearch('');
      await persistProduction(next);
    } else {
      if (!butcher) return;
      const ratioVal = ratio.trim() ? Number(String(ratio).replace(',', '.')) : null;
      const next: ButcherOutputRow[] = [
        ...butcher.outputs,
        {
          id: `tmp-${p.id}`,
          product_id: String(p.id),
          product_name: p.name,
          product_code: p.code || null,
          sort_order: butcher.outputs.length,
          standard_ratio_percent: Number.isFinite(ratioVal as number) ? (ratioVal as number) : null,
          coefficient: quantity,
        },
      ];
      setShowAdd(false);
      setHits([]);
      setSearch('');
      await persistButcher(next);
    }
  };

  const removeAt = (index: number) => {
    Alert.alert('Satırı sil', 'Bu satır kaldırılsın mı?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            if (kind === 'production' && production) {
              const next = production.ingredients.filter((_, i) => i !== index);
              await persistProduction(next);
            } else if (butcher) {
              const next = butcher.outputs.filter((_, i) => i !== index);
              await persistButcher(next);
            }
          })();
        },
      },
    ]);
  };

  const title =
    kind === 'butcher' ? butcher?.name || 'Kasap reçetesi' : production?.name || 'Üretim reçetesi';
  const subtitle =
    kind === 'butcher'
      ? `${butcher?.outputs.length ?? 0} çıktı`
      : `${production?.ingredients.length ?? 0} hammadde · ${formatMoney(production?.total_cost || 0)}`;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        right={
          <HeaderIconButton accent onPress={() => setShowAdd(true)}>
            <Plus size={18} color={palette.white} />
          </HeaderIconButton>
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : kind === 'production' ? (
        <FlatList
          data={production?.ingredients || []}
          keyExtractor={(item, i) => item.id || String(i)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Hammadde satırı yok — + ile ekleyin" />}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {item.material_name || item.material_code || item.material_id}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.quantity} {item.unit || 'Adet'}
                    {item.cost ? ` · maliyet ${formatMoney(item.cost)}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => removeAt(index)} hitSlop={8}>
                  <Trash2 size={18} color={palette.red500} />
                </Pressable>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={butcher?.outputs || []}
          keyExtractor={(item, i) => item.id || String(i)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Çıktı satırı yok — + ile ekleyin" />}
          contentContainerStyle={styles.list}
          renderItem={({ item, index }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {item.product_name || item.product_code || item.product_id}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    katsayı {item.coefficient}
                    {item.standard_ratio_percent != null
                      ? ` · oran %${item.standard_ratio_percent}`
                      : ''}
                  </Text>
                </View>
                <Pressable onPress={() => removeAt(index)} hitSlop={8}>
                  <Trash2 size={18} color={palette.red500} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAdd(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {kind === 'butcher' ? 'Çıktı ürün ekle' : 'Hammadde ekle'}
            </Text>
            <SearchBar
              value={search}
              onChangeText={(t) => void runSearch(t)}
              placeholder="Ürün adı veya kod…"
            />
            <FormField
              label={kind === 'butcher' ? 'Katsayı' : 'Miktar'}
              value={qty}
              onChangeText={setQty}
              keyboardType="decimal-pad"
            />
            {kind === 'butcher' ? (
              <FormField
                label="Oran % (opsiyonel)"
                value={ratio}
                onChangeText={setRatio}
                keyboardType="decimal-pad"
              />
            ) : null}
            <FlatList
              data={hits}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 220 }}
              ListEmptyComponent={
                search.trim() ? (
                  <Text style={{ color: colors.textMuted, padding: 8 }}>Sonuç yok</Text>
                ) : null
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => void addProduct(item)}
                  style={[styles.hit, { borderBottomColor: colors.cardBorder }]}
                >
                  <Text style={{ color: colors.text, flex: 1 }} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: palette.blue600, fontWeight: '700' }}>Ekle</Text>
                </Pressable>
              )}
            />
            <PrimaryButton label="Kapat" onPress={() => setShowAdd(false)} />
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
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
    gap: 4,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});
