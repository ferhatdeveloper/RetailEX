import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { HeaderIconButton } from '../components/GradientHeader';
import {
  fetchBrands,
  fetchCategories,
  fetchGroupCodes,
  fetchSpecialCodes,
  fetchUnitSets,
  fetchVariants,
  type DefinitionRow,
  type UnitSetRow,
} from '../api/materialDefinitionsApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export type MaterialDefinitionsTab =
  | 'classes'
  | 'categories'
  | 'brands'
  | 'unitSets'
  | 'variants'
  | 'specialCodes'
  | 'groupCodes';

type Props = NativeStackScreenProps<MainStackParamList, 'MaterialDefinitions'>;

export function materialDefinitionsRouteTab(screenId?: string): MaterialDefinitionsTab {
  switch (screenId) {
    case 'material-classes':
      return 'classes';
    case 'product-categories':
      return 'categories';
    case 'brand-definitions':
    case 'brands':
      return 'brands';
    case 'unit-sets':
      return 'unitSets';
    case 'variants':
      return 'variants';
    case 'special-codes':
      return 'specialCodes';
    case 'group-codes':
      return 'groupCodes';
    default:
      return 'classes';
  }
}

function tabTitle(tab: MaterialDefinitionsTab): string {
  switch (tab) {
    case 'classes':
      return 'Malzeme sınıfları';
    case 'categories':
      return 'Ürün kategorileri';
    case 'brands':
      return 'Marka tanımları';
    case 'unitSets':
      return 'Birim setleri';
    case 'variants':
      return 'Varyantlar';
    case 'specialCodes':
      return 'Özel kodlar';
    case 'groupCodes':
      return 'Grup kodları';
  }
}

function tabFormKind(
  tab: MaterialDefinitionsTab,
): NonNullable<NonNullable<MainStackParamList['MaterialDefinitionForm']>['kind']> {
  switch (tab) {
    case 'brands':
      return 'brand';
    case 'categories':
      return 'category';
    case 'unitSets':
      return 'unitset';
    case 'variants':
      return 'variant';
    case 'specialCodes':
      return 'special';
    case 'groupCodes':
      return 'group';
    case 'classes':
    default:
      return 'class';
  }
}

export function MaterialDefinitionsScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const initial = materialDefinitionsRouteTab(route.params?.screenId);
  const [tab, setTab] = useState<MaterialDefinitionsTab>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<DefinitionRow[]>([]);
  const [categories, setCategories] = useState<DefinitionRow[]>([]);
  const [unitSets, setUnitSets] = useState<UnitSetRow[]>([]);
  const [variants, setVariants] = useState<DefinitionRow[]>([]);
  const [specialCodes, setSpecialCodes] = useState<DefinitionRow[]>([]);
  const [groupCodes, setGroupCodes] = useState<DefinitionRow[]>([]);

  useEffect(() => {
    setTab(materialDefinitionsRouteTab(route.params?.screenId));
  }, [route.params?.screenId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, c, u, v, s, g] = await Promise.all([
        fetchBrands(),
        fetchCategories(),
        fetchUnitSets(),
        fetchVariants(),
        fetchSpecialCodes(),
        fetchGroupCodes(),
      ]);
      setBrands(b);
      setCategories(c);
      setUnitSets(u);
      setVariants(v);
      setSpecialCodes(s);
      setGroupCodes(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const tabs: { id: MaterialDefinitionsTab; label: string }[] = [
    { id: 'classes', label: 'Sınıflar' },
    { id: 'categories', label: 'Kategoriler' },
    { id: 'brands', label: 'Markalar' },
    { id: 'unitSets', label: 'Birim seti' },
    { id: 'variants', label: 'Varyant' },
    { id: 'specialCodes', label: 'Özel kod' },
    { id: 'groupCodes', label: 'Grup kodu' },
  ];

  const listCount = useMemo(() => {
    switch (tab) {
      case 'brands':
        return brands.length;
      case 'categories':
      case 'classes':
        return categories.length;
      case 'unitSets':
        return unitSets.length;
      case 'variants':
        return variants.length;
      case 'specialCodes':
        return specialCodes.length;
      case 'groupCodes':
        return groupCodes.length;
    }
  }, [
    tab,
    brands.length,
    categories.length,
    unitSets.length,
    variants.length,
    specialCodes.length,
    groupCodes.length,
  ]);

  const openCreate = () => {
    navigation.navigate('MaterialDefinitionForm', { kind: tabFormKind(tab) });
  };

  const openEdit = (itemId: string) => {
    navigation.navigate('MaterialDefinitionForm', { kind: tabFormKind(tab), id: itemId });
  };

  const renderDefinitionCard = (item: DefinitionRow, showRestaurant?: boolean) => (
    <Pressable
      onPress={() => openEdit(item.id)}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
    >
      <Text style={{ color: colors.text, fontWeight: '700' }}>
        {item.code} · {item.name}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.description || '—'}</Text>
      {showRestaurant && item.is_restaurant ? (
        <Text style={{ color: palette.blue600, fontSize: 11, marginTop: 4, fontWeight: '600' }}>
          Restoran kategorisi
        </Text>
      ) : null}
      {!item.is_active ? (
        <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 4 }}>Pasif</Text>
      ) : null}
    </Pressable>
  );

  const definitionList = (data: DefinitionRow[], empty: string, showRestaurant?: boolean) => (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
      ListEmptyComponent={<EmptyState message={empty} />}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => renderDefinitionCard(item, showRestaurant)}
    />
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={tabTitle(tab)}
        subtitle={user?.firmNr ? `Firma ${user.firmNr} · ${listCount} kayıt` : 'Malzeme tanımları'}
        right={
          <HeaderIconButton accent onPress={openCreate}>
            <Plus size={18} color={palette.white} />
          </HeaderIconButton>
        }
      />
      <SegmentTabBar layout="scroll" value={tab} onChange={setTab} items={tabs} />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'brands' ? (
        definitionList(brands, 'Marka tanımı yok')
      ) : tab === 'classes' ? (
        definitionList(categories, 'Malzeme sınıfı yok')
      ) : tab === 'categories' ? (
        definitionList(categories, 'Ürün kategorisi yok', true)
      ) : tab === 'variants' ? (
        definitionList(variants, 'Varyant kaydı yok')
      ) : tab === 'specialCodes' ? (
        definitionList(specialCodes, 'Özel kod yok')
      ) : tab === 'groupCodes' ? (
        definitionList(groupCodes, 'Grup kodu yok')
      ) : (
        <FlatList
          data={unitSets}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Birim seti yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEdit(item.id)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.code} · {item.name}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.line_count} birim satırı
                {!item.is_active ? ' · Pasif' : ''}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
