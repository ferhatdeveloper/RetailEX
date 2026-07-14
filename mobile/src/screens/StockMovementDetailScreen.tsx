import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Pressable,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Trash2 } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import {
  deleteStockMovement,
  fetchStockMovementById,
  stockMovementLabel,
  type StockMovementDetail,
} from '../api/stockMovementApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export function StockMovementDetailScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'StockMovementDetail'>>();
  const { id } = route.params;

  const [row, setRow] = useState<StockMovementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const detail = await fetchStockMovementById(id);
      if (!detail) {
        setError('Fiş bulunamadı');
        setRow(null);
        return;
      }
      setRow(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const confirmDelete = () => {
    if (!row || row.source_kind !== 'slip') return;
    Alert.alert('Fişi sil', `${row.document_no || 'Bu fiş'} silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeleting(true);
            try {
              await deleteStockMovement(row.id);
              navigation.goBack();
            } catch (e) {
              Alert.alert('Silinemedi', e instanceof Error ? e.message : String(e));
            } finally {
              setDeleting(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={row?.document_no || 'Stok fişi'}
        subtitle={row ? stockMovementLabel(row) : 'Detay'}
        right={
          row?.source_kind === 'slip' ? (
            <HeaderIconButton onPress={confirmDelete}>
              <Trash2 size={18} color={deleting ? palette.gray400 : palette.white} />
            </HeaderIconButton>
          ) : undefined
        }
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : row ? (
        <FlatList
          data={row.items}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListHeaderComponent={
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{row.movement_date}</Text>
              {row.warehouse_name ? (
                <Text style={{ color: colors.text, fontWeight: '600', marginTop: 4 }}>
                  {row.warehouse_name}
                </Text>
              ) : null}
              {row.description ? (
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                  {row.description}
                </Text>
              ) : null}
              <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 6 }}>
                {row.line_count} kalem · {row.status || '—'}
              </Text>
            </View>
          }
          ListEmptyComponent={<EmptyState message="Kalem yok" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={2}>
                {item.product_name || item.product_code || item.product_id}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                {item.quantity} {item.unit_name || 'Adet'}
                {item.unit_price ? ` · ${formatMoney(item.unit_price)}` : ''}
              </Text>
              {item.notes ? (
                <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}
            </View>
          )}
        />
      ) : null}
      {!loading && !row && !error ? (
        <Pressable onPress={() => navigation.goBack()} style={{ padding: 16 }}>
          <Text style={{ color: palette.blue600, fontWeight: '700' }}>Geri</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
