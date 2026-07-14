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
  generateDefinitionCode,
} from '../api/materialDefinitionsApi';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Kind = NonNullable<NonNullable<MainStackParamList['MaterialDefinitionForm']>['kind']>;

function kindTitle(kind: Kind): string {
  switch (kind) {
    case 'brand':
      return 'Yeni marka';
    case 'category':
      return 'Yeni kategori';
    case 'class':
      return 'Yeni malzeme sınıfı';
    case 'unitset':
      return 'Yeni birim seti';
    case 'variant':
      return 'Yeni varyant';
    case 'special':
      return 'Yeni özel kod';
    case 'group':
      return 'Yeni grup kodu';
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

export function MaterialDefinitionFormScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'MaterialDefinitionForm'>>();
  const kind = route.params?.kind ?? 'class';

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isRestaurant, setIsRestaurant] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const generated = await generateDefinitionCode(codeKind(kind));
      setCode(generated);
    } catch {
      /* kod üretilemezse boş bırak */
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedCode = code.trim();
    if (!trimmedName) {
      Alert.alert('Eksik alan', 'Ad zorunludur.');
      return;
    }
    if (!trimmedCode) {
      Alert.alert('Eksik alan', 'Kod zorunludur.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (kind === 'unitset') {
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
      <ScreenHeader title={kindTitle(kind)} subtitle="Malzeme tanımı ekle" />
      {error ? <ErrorBanner message={error} /> : null}
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
            <PrimaryButton label="Kaydet" onPress={() => void handleSave()} loading={saving} />
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
