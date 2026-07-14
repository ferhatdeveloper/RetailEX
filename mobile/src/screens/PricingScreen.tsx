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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronDown, ChevronRight, Tag } from 'lucide-react-native';
import { ScreenHeader, SearchBar, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import {
  fetchProductPrices,
  getPriceValue,
  PRICE_LIST_OPTIONS,
  type PriceListKey,
  type ProductPriceRow,
} from '../api/pricingApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

function PriceChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useThemeStore();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? palette.orange500 : colors.card,
          borderColor: active ? palette.orange500 : colors.cardBorder,
        },
      ]}
    >
      <Text
        style={{
          color: active ? palette.white : colors.text,
          fontSize: 12,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ExpandedPrices({ row }: { row: ProductPriceRow }) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.expanded, { borderTopColor: colors.cardBorder }]}>
      {PRICE_LIST_OPTIONS.map((opt) => (
        <View key={opt.key} style={styles.expRow}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>
            {opt.label}
          </Text>
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
            {formatMoney(getPriceValue(row, opt.key))} ₺
          </Text>
        </View>
      ))}
    </View>
  );
}

export function PricingScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const orgEpoch = useOrgEpoch();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProductPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listKey, setListKey] = useState<PriceListKey>('price');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const listLabel = useMemo(
    () => PRICE_LIST_OPTIONS.find((o) => o.key === listKey)?.label ?? 'Fiyat',
    [listKey],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchProductPrices(search);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void load(), search ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const nonZeroCount = useMemo(
    () => rows.filter((r) => getPriceValue(r, listKey) > 0).length,
    [rows, listKey],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Fiyat Listesi"
        subtitle={`${rows.length} ürün · ${listLabel}`}
        right={
          <HeaderIconButton accent onPress={() => navigation.navigate('Campaigns')}>
            <Tag size={16} color={palette.white} />
          </HeaderIconButton>
        }
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.hScrollShell}
        contentContainerStyle={styles.chipRow}
      >
        {PRICE_LIST_OPTIONS.map((opt) => (
          <PriceChip
            key={opt.key}
            label={opt.label}
            active={listKey === opt.key}
            onPress={() => setListKey(opt.key)}
          />
        ))}
      </ScrollView>
      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Kod, barkod, ad…" />
      </View>
      <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>Seçili liste</Text>
        <Text style={{ color: palette.orange500, fontSize: 15, fontWeight: '800' }}>{listLabel}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
          {nonZeroCount} üründe fiyat tanımlı
        </Text>
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.orange500} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} />
          }
          ListEmptyComponent={<EmptyState message="Fiyatlı ürün bulunamadı" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const value = getPriceValue(item, listKey);
            const open = expandedId === String(item.id);
            return (
              <Pressable
                onPress={() => setExpandedId(open ? null : String(item.id))}
                onLongPress={() =>
                  navigation.navigate('ProductDetail', { productId: String(item.id) })
                }
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.cardBorder },
                ]}
              >
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {[item.code, item.barcode].filter(Boolean).join(' · ') || '—'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={[
                        styles.price,
                        { color: value > 0 ? palette.orange500 : colors.textMuted },
                      ]}
                    >
                      {formatMoney(value)} ₺
                    </Text>
                    {item.unit ? (
                      <Text style={{ color: colors.textMuted, fontSize: 10 }}>{item.unit}</Text>
                    ) : null}
                  </View>
                  {open ? (
                    <ChevronDown size={16} color={colors.textMuted} />
                  ) : (
                    <ChevronRight size={16} color={colors.textMuted} />
                  )}
                </View>
                {open ? <ExpandedPrices row={item} /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hScrollShell: { flexGrow: 0, flexShrink: 0 },
  chipRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  searchWrap: { paddingHorizontal: 0 },
  summary: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  price: { fontSize: 15, fontWeight: '800' },
  expanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  expRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
