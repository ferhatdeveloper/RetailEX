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
  createCustomer,
  fetchCustomerById,
  generateCustomerCode,
  updateCustomer,
  type CustomerInput,
} from '../api/customersApi';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

const EMPTY: CustomerInput = {
  code: '',
  name: '',
  phone: '',
  email: '',
  city: '',
  district: '',
  address: '',
  tax_nr: '',
  tax_office: '',
  notes: '',
};

export function CustomerFormScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'CustomerForm'>>();
  const customerId = route.params?.customerId;
  const isEdit = Boolean(customerId);

  const [form, setForm] = useState<CustomerInput>({ ...EMPTY });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const load = useCallback(async () => {
    if (!customerId) {
      try {
        const code = await generateCustomerCode();
        setForm((prev) => ({ ...prev, code }));
      } catch {
        /* kod üretilemezse boş bırak */
      }
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const row = await fetchCustomerById(customerId);
      if (!row) {
        setError(t('formValidation.customerNotFound'));
        return;
      }
      setForm({
        code: row.code || '',
        name: row.name,
        phone: row.phone || '',
        email: row.email || '',
        city: row.city || '',
        district: row.district || '',
        address: row.address || '',
        tax_nr: row.tax_no || '',
        tax_office: row.tax_office || '',
        notes: '',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      Alert.alert(t('alert.missingField'), t('formValidation.customerNameRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && customerId) {
        await updateCustomer(customerId, form);
        navigation.replace('CustomerDetail', { customerId });
      } else {
        const id = await createCustomer(form);
        navigation.replace('CustomerDetail', { customerId: id });
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
        title={isEdit ? 'Cari Düzenle' : 'Yeni Cari'}
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
              value={form.code || ''}
              onChangeText={(t) => setField('code', t)}
              autoCapitalize="characters"
            />
            <FormField
              label="Ad / Unvan"
              value={form.name}
              onChangeText={(t) => setField('name', t)}
            />
            <FormField
              label="Telefon"
              value={form.phone || ''}
              onChangeText={(t) => setField('phone', t)}
              keyboardType="phone-pad"
            />
            <FormField
              label="E-posta"
              value={form.email || ''}
              onChangeText={(t) => setField('email', t)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <FormField
              label="Şehir"
              value={form.city || ''}
              onChangeText={(t) => setField('city', t)}
            />
            <FormField
              label="İlçe"
              value={form.district || ''}
              onChangeText={(t) => setField('district', t)}
            />
            <FormField
              label="Adres"
              value={form.address || ''}
              onChangeText={(t) => setField('address', t)}
              multiline
              numberOfLines={3}
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
            <FormField
              label="Vergi no"
              value={form.tax_nr || ''}
              onChangeText={(t) => setField('tax_nr', t)}
              keyboardType="number-pad"
            />
            <FormField
              label="Vergi dairesi"
              value={form.tax_office || ''}
              onChangeText={(t) => setField('tax_office', t)}
            />
            <FormField
              label="Not"
              value={form.notes || ''}
              onChangeText={(t) => setField('notes', t)}
              multiline
              numberOfLines={2}
              style={{ minHeight: 56, textAlignVertical: 'top' }}
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
