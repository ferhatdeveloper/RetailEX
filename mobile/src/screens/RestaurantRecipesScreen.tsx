import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { fetchProducts, type ProductRow } from '../api/productsApi';
import {
  fetchRestaurantRecipes,
  recipeLineTotal,
  saveRestaurantRecipe,
  type RestRecipeRow,
} from '../api/restaurantRecipeApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';

export function RestaurantRecipesScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const [rows, setRows] = useState<RestRecipeRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [menuName, setMenuName] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [qty, setQty] = useState('1');
  const [wastage, setWastage] = useState('0');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [recipes, prods] = await Promise.all([fetchRestaurantRecipes(), fetchProducts('', 80)]);
      setRows(recipes);
      setProducts(prods);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = async () => {
    const menu =
      products.find((p) => p.name.toLocaleLowerCase('tr-TR').includes(menuName.trim().toLocaleLowerCase('tr-TR'))) ||
      null;
    const material =
      products.find((p) => p.name.toLocaleLowerCase('tr-TR').includes(materialName.trim().toLocaleLowerCase('tr-TR'))) ||
      null;
    if (!menu || !material) {
      Alert.alert(t('ops.needRecipe', { defaultValue: 'Menü ve malzeme gerekli' }));
      return;
    }
    const quantity = Math.max(0, Number(qty.replace(',', '.')) || 0);
    const cost = Number(material.cost ?? material.price ?? 0) || 0;
    setBusy(true);
    try {
      await saveRestaurantRecipe({
        menuItemId: menu.id,
        wastagePercent: Number(wastage.replace(',', '.')) || 0,
        ingredients: [{ materialId: material.id, quantity, unit: material.unit, cost }],
      });
      setMenuName('');
      setMaterialName('');
      await load();
    } catch (e) {
      Alert.alert(t('ops.saveFail', { defaultValue: 'Kayıt hatası' }), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={t('ops.restRecipes', { defaultValue: 'Reçeteler' })}
        subtitle={t('ops.restRecipeHint', { defaultValue: 'Maliyet = miktar × birim maliyet' })}
      />
      <View style={styles.form}>
        <TextInput
          value={menuName}
          onChangeText={setMenuName}
          placeholder={t('ops.menuItemPh', { defaultValue: 'Menü ürünü' })}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
        />
        <TextInput
          value={materialName}
          onChangeText={setMaterialName}
          placeholder={t('ops.materialPh', { defaultValue: 'Malzeme' })}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
        />
        <View style={styles.row}>
          <TextInput
            value={qty}
            onChangeText={setQty}
            keyboardType="decimal-pad"
            placeholder={t('ops.qty', { defaultValue: 'Miktar' })}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          />
          <TextInput
            value={wastage}
            onChangeText={setWastage}
            keyboardType="decimal-pad"
            placeholder={t('ops.wastage', { defaultValue: 'Fire %' })}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, backgroundColor: colors.card }]}
          />
        </View>
      </View>
      <PrimaryButton label={busy ? '…' : t('save', { defaultValue: 'Kaydet' })} onPress={() => void onSave()} disabled={busy} />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState message={t('ops.empty', { defaultValue: 'Kayıt yok' })} />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.menu_item_name || item.menu_item_id}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {formatMoney(item.total_cost || recipeLineTotal(item.ingredients))} · %{item.wastage_percent} ·{' '}
                {item.ingredients.length}
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
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
