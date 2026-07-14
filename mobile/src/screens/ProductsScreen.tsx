import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Plus, ScanBarcode, ScanLine } from 'lucide-react-native';
import { ScreenHeader, SearchBar, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { fetchProducts, type ProductRow } from '../api/productsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export function ProductsScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const orgEpoch = useOrgEpoch();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const openAddMenu = () => {
    Alert.alert(t('materialScan.addMenuTitle'), t('materialScan.addMenuHint'), [
      {
        text: t('materialScan.addManual'),
        onPress: () => navigation.navigate('ProductForm'),
      },
      {
        text: t('materialScan.addWithCamera'),
        onPress: () => navigation.navigate('MaterialLabelScan'),
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchProducts(search);
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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Malzemeler"
        subtitle={`${rows.length} kayıt`}
        right={
          <View style={styles.headerActions}>
            <HeaderIconButton onPress={() => navigation.navigate('MaterialLabelScan')}>
              <ScanLine size={18} color={palette.white} />
            </HeaderIconButton>
            <HeaderIconButton accent onPress={openAddMenu}>
              <Plus size={18} color={palette.white} />
            </HeaderIconButton>
          </View>
        }
      />
      <View style={styles.searchRow}>
        <View style={styles.searchFlex}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Kod, barkod, ad…"
          />
        </View>
        <Pressable
          onPress={() => setScannerOpen(true)}
          style={[styles.scanBtn, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          accessibilityLabel="Kamera ile barkod oku"
        >
          <ScanBarcode size={22} color={palette.blue600} />
        </Pressable>
      </View>
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={setSearch}
        title="Ürün barkod"
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} />
          }
          ListEmptyComponent={<EmptyState message="Ürün bulunamadı" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('ProductDetail', { productId: String(item.id) })}
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
                  <Text style={styles.price}>{formatMoney(item.price)} ₺</Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color:
                        item.min_stock != null && item.stock < item.min_stock
                          ? palette.red500
                          : colors.textMuted,
                    }}
                  >
                    Stok: {item.stock} {item.unit || ''}
                  </Text>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    gap: 4,
  },
  searchFlex: { flex: 1, minWidth: 0 },
  scanBtn: {
    marginTop: 8,
    marginBottom: 4,
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  price: { fontSize: 14, fontWeight: '700', color: palette.blue600 },
});
