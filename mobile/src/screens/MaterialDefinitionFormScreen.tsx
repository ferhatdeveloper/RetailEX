import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  Text,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ScreenHeader, ErrorBanner } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createBrand,
  createCategory,
  createGroupCode,
  createSpecialCode,
  createUnitSet,
  createVariantDefinition,
  fetchDefinitionById,
  generateDefinitionCode,
  updateBrand,
  updateCategory,
  updateGroupCode,
  updateSpecialCode,
  updateUnitSet,
  updateVariantDefinition,
  type DefinitionRow,
  type UnitSetRow,
} from '../api/materialDefinitionsApi';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Kind = NonNullable<NonNullable<MainStackParamList['MaterialDefinitionForm']>['kind']>;

function kindTitle(kind: Kind, editing: boolean): string {
  const prefix = editing ? 'Düzenle — ' : 'Yeni ';
  switch (kind) {
    case 'brand':
      return `${prefix}marka`;
    case 'category':
      return `${prefix}kategori`;
    case 'class':
      return `${prefix}malzeme sınıfı`;
    case 'unitset':
      return `${prefix}birim seti`;
    case 'variant':
      return `${prefix}varyant`;
    case 'special':
      return `${prefix}özel kod`;
    case 'group':
      return `${prefix}grup kodu`;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function codeKind(kind: Kind): 'brand' | 'category' | 'unitset' | 'special' | 'group' | 'variant' {
  if (kind === 'brand') return 'brand';
  if (kind === 'unitset') return 'unitset';
  if (kind === 'special') return 'special';
  if (kind === 'group') return 'group';
  if (kind === 'variant') return 'variant';
  return 'category';
}

function isUnitSetRow(row: DefinitionRow | UnitSetRow): row is UnitSetRow {
  return 'line_count' in row;
}

export function MaterialDefinitionFormScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'MaterialDefinitionForm'>>();
  const kind = route.params?.kind ?? 'class';
  const editId = route.params?.id;
  const isEdit = Boolean(editId);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isRestaurant, setIsRestaurant] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fillFrom = useCallback((row: DefinitionRow | UnitSetRow) => {
    setCode(row.code);
    setName(row.name);
    if (!isUnitSetRow(row)) {
      setDescription(row.description || '');
      setIsRestaurant(Boolean(row.is_restaurant));
      setIsActive(row.is_active);
    } else {
      setDescription('');
      setIsActive(row.is_active);
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (editId) {
        const row = await fetchDefinitionById(codeKind(kind), editId);
        if (!row) {
          setError('Kayıt bulunamadı');
          return;
        }
        fillFrom(row);
        return;
      }
      const generated = await generateDefinitionCode(codeKind(kind));
      setCode(generated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [editId, fillFrom, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    if (!trimmedName) {
      Alert.alert(t('alert.missingField'), t('formValidation.nameRequired'));
      return;
    }
    if (!trimmedCode) {
      Alert.alert(t('alert.missingField'), t('formValidation.codeRequired'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && editId) {
        if (kind === 'unitset') {
          await updateUnitSet(editId, { code: trimmedCode, name: trimmedName, is_active: isActive });
        } else if (kind === 'brand') {
          await updateBrand(editId, {
            code: trimmedCode,
            name: trimmedName,
            description,
            is_active: isActive,
          });
        } else if (kind === 'special') {
          await updateSpecialCode(editId, {
            code: trimmedCode,
            name: trimmedName,
            description,
            is_active: isActive,
          });
        } else if (kind === 'group') {
          await updateGroupCode(editId, {
            code: trimmedCode,
            name: trimmedName,
            description,
            is_active: isActive,
          });
        } else if (kind === 'variant') {
          await updateVariantDefinition(editId, {
            code: trimmedCode,
            name: trimmedName,
            description,
            is_active: isActive,
          });
        } else {
          await updateCategory(editId, {
            code: trimmedCode,
            name: trimmedName,
            description,
            is_restaurant: kind === 'category' ? isRestaurant : undefined,
            is_active: isActive,
          });
        }
      } else if (kind === 'unitset') {
        await createUnitSet({ code: trimmedCode, name: trimmedName });
      } else if (kind === 'brand') {
        await createBrand({ code: trimmedCode, name: trimmedName, description });
      } else if (kind === 'special') {
        await createSpecialCode({ code: trimmedCode, name: trimmedName, description });
      } else if (kind === 'group') {
        await createGroupCode({ code: trimmedCode, name: trimmedName, description });
      } else if (kind === 'variant') {
        await createVariantDefinition({ code: trimmedCode, name: trimmedName, description });
      } else {
        await createCategory({
          code: trimmedCode,
          name: trimmedName,
          description,
          is_restaurant: kind === 'category' ? isRestaurant : false,
        });
      }
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={kindTitle(kind, isEdit)}
        subtitle={isEdit ? 'Malzeme tanımı düzenle' : 'Malzeme tanımı ekle'}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <FormField label="Kod" value={code} onChangeText={setCode} autoCapitalize="characters" />
            <FormField label="Ad" value={name} onChangeText={setName} />
            {kind !== 'unitset' ? (
              <FormField
                label="Açıklama"
                value={description}
                onChangeText={setDescription}
                multiline
              />
            ) : null}
            {kind === 'category' ? (
              <Pressable
                onPress={() => setIsRestaurant((v) => !v)}
                style={[
                  styles.toggle,
                  {
                    backgroundColor: colors.card,
                    borderColor: isRestaurant ? palette.blue600 : colors.cardBorder,
                  },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Restoran kategorisi</Text>
                <Text style={{ color: isRestaurant ? palette.blue600 : colors.textMuted, fontWeight: '700' }}>
                  {isRestaurant ? 'Evet' : 'Hayır'}
                </Text>
              </Pressable>
            ) : null}
            {isEdit ? (
              <Pressable
                onPress={() => setIsActive((v) => !v)}
                style={[
                  styles.toggle,
                  {
                    backgroundColor: colors.card,
                    borderColor: isActive ? palette.blue600 : colors.cardBorder,
                  },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Aktif</Text>
                <Text style={{ color: isActive ? palette.blue600 : colors.textMuted, fontWeight: '700' }}>
                  {isActive ? 'Evet' : 'Hayır'}
                </Text>
              </Pressable>
            ) : null}
            <PrimaryButton
              label={saving ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Kaydet'}
              onPress={() => void handleSave()}
              loading={saving}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  form: { padding: 16, gap: 12, paddingBottom: 40 },
  toggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
});
