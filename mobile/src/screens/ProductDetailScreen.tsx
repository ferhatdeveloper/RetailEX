import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pencil } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { fetchProductById, type ProductRow } from '../api/productsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const { colors } = useThemeStore();
  return (
    <View style={[styles.row, { borderBottomColor: colors.cardBorder }]}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <Text
        style={{ color: valueColor ?? colors.text, fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right' }}
        numberOfLines={3}
      >
        {value}
      </Text>
    </View>
  );
}

export function ProductDetailScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'ProductDetail'>>();
  const { productId } = route.params;
  const [row, setRow] = useState<ProductRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRow(await fetchProductById(productId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const critical =
    row?.min_stock != null && row.stock < row.min_stock ? palette.red500 : undefined;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Ürün Detay"
        subtitle={row?.code || productId.slice(0, 8)}
        right={
          row ? (
            <HeaderIconButton
              accent
              onPress={() => navigation.navigate('ProductForm', { productId })}
            >
              <Pencil size={16} color={palette.white} />
            </HeaderIconButton>
          ) : undefined
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && !row ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : !row ? (
        <Text style={{ color: colors.textMuted, padding: 24, textAlign: 'center' }}>
          Ürün bulunamadı
        </Text>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        >
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.name, { color: colors.text }]}>{row.name}</Text>
            <Text style={{ color: palette.blue600, fontSize: 22, fontWeight: '800', marginTop: 8 }}>
              {formatMoney(row.price)} ₺
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Row label="Kod" value={row.code || '—'} />
            <Row label="Barkod" value={row.barcode || '—'} />
            <Row label="Birim" value={row.unit || '—'} />
            <Row label="Marka" value={row.brand || '—'} />
            <Row label="Kategori" value={row.category_code || '—'} />
            <Row label="Maliyet" value={`${formatMoney(row.cost)} ₺`} />
            <Row
              label="Stok"
              value={`${row.stock}${row.unit ? ` ${row.unit}` : ''}`}
              valueColor={critical}
            />
            <Row label="Min. stok" value={row.min_stock != null ? String(row.min_stock) : '—'} />
            <Row label="Durum" value={row.is_active ? 'Aktif' : 'Pasif'} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 12, gap: 10, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14 },
  name: { fontSize: 18, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
