import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, ErrorBanner } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createProduct,
  fetchProductById,
  generateProductCode,
  updateProduct,
  type ProductInput,
} from '../api/productsApi';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type FormState = {
  code: string;
  barcode: string;
  name: string;
  unit: string;
  price: string;
  cost: string;
  stock: string;
  min_stock: string;
  brand: string;
  category_code: string;
};

const EMPTY: FormState = {
  code: '',
  barcode: '',
  name: '',
  unit: 'AD',
  price: '',
  cost: '',
  stock: '0',
  min_stock: '',
  brand: '',
  category_code: '',
};

function toInput(form: FormState): ProductInput {
  const minRaw = form.min_stock.trim();
  return {
    code: form.code,
    barcode: form.barcode,
    name: form.name,
    unit: form.unit,
    price: Number(String(form.price).replace(',', '.')) || 0,
    cost: Number(String(form.cost).replace(',', '.')) || 0,
    stock: Number(String(form.stock).replace(',', '.')) || 0,
    min_stock: minRaw === '' ? null : Number(minRaw.replace(',', '.')),
    brand: form.brand,
    category_code: form.category_code,
  };
}

export function ProductFormScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'ProductForm'>>();
  const productId = route.params?.productId;
  const isEdit = Boolean(productId);

  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const load = useCallback(async () => {
    if (!productId) {
      try {
        const code = await generateProductCode();
        setForm((prev) => ({ ...prev, code }));
      } catch {
        /* boş bırak */
      }
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const row = await fetchProductById(productId);
      if (!row) {
        setError(t('formValidation.productNotFound'));
        return;
      }
      setForm({
        code: row.code || '',
        barcode: row.barcode || '',
        name: row.name,
        unit: row.unit || 'AD',
        price: String(row.price ?? ''),
        cost: String(row.cost ?? ''),
        stock: String(row.stock ?? 0),
        min_stock: row.min_stock != null ? String(row.min_stock) : '',
        brand: row.brand || '',
        category_code: row.category_code || '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      Alert.alert(t('alert.missingField'), t('formValidation.productNameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = toInput(form);
      if (isEdit && productId) {
        await updateProduct(productId, input);
        navigation.replace('ProductDetail', { productId });
      } else {
        const id = await createProduct(input);
        navigation.replace('ProductDetail', { productId: id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={isEdit ? 'Ürün Düzenle' : 'Yeni Ürün'}
        subtitle={form.code || undefined}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <FormField
              label="Kod"
              value={form.code}
              onChangeText={(t) => setField('code', t)}
              autoCapitalize="characters"
            />
            <FormField
              label="Barkod"
              value={form.barcode}
              onChangeText={(t) => setField('barcode', t)}
              autoCapitalize="characters"
            />
            <FormField label="Ad" value={form.name} onChangeText={(t) => setField('name', t)} />
            <FormField label="Birim" value={form.unit} onChangeText={(t) => setField('unit', t)} />
            <FormField
              label="Satış fiyatı"
              value={form.price}
              onChangeText={(t) => setField('price', t)}
              keyboardType="decimal-pad"
            />
            <FormField
              label="Maliyet"
              value={form.cost}
              onChangeText={(t) => setField('cost', t)}
              keyboardType="decimal-pad"
            />
            <FormField
              label="Stok"
              value={form.stock}
              onChangeText={(t) => setField('stock', t)}
              keyboardType="decimal-pad"
            />
            <FormField
              label="Min. stok"
              value={form.min_stock}
              onChangeText={(t) => setField('min_stock', t)}
              keyboardType="decimal-pad"
            />
            <FormField label="Marka" value={form.brand} onChangeText={(t) => setField('brand', t)} />
            <FormField
              label="Kategori kodu"
              value={form.category_code}
              onChangeText={(t) => setField('category_code', t)}
            />
            <PrimaryButton
              label={isEdit ? 'Kaydet' : 'Oluştur'}
              onPress={() => void handleSave()}
              loading={saving}
              style={{ marginTop: 8 }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, gap: 14, paddingBottom: 48 },
});
