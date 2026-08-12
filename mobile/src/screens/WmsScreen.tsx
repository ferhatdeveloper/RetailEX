import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { ClipboardList, ArrowLeftRight, Navigation } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenHeader, SearchBar, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { fetchWmsStock, fetchWmsSummary, type WmsStockRow } from '../api/wmsApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

export function WmsScreen() {
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const orgEpoch = useOrgEpoch();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<WmsStockRow[]>([]);
  const [summary, setSummary] = useState({ productCount: 0, belowMin: 0, zeroStock: 0, totalStockValue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, sum] = await Promise.all([fetchWmsStock(search), fetchWmsSummary()]);
      setRows(list);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      <ScreenHeader title="WMS / Depo" subtitle="Stok durumu" />
      <Pressable
        onPress={() => navigation.navigate('WmsCount')}
        style={[styles.countBanner, { backgroundColor: colors.card, borderColor: palette.blue600 }]}
      >
        <ClipboardList size={20} color={palette.blue600} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Stok sayım fişi</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            Fiş oluştur, barkod okut, satır kaydet
          </Text>
        </View>
        <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 11 }}>Aç →</Text>
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('WmsTransfer')}
        style={[styles.countBanner, { backgroundColor: colors.card, borderColor: palette.green600 }]}
      >
        <ArrowLeftRight size={20} color={palette.green600} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Depo transferi</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            Ambar/mağaza arası ürün transferi
          </Text>
        </View>
        <Text style={{ color: palette.green600, fontWeight: '800', fontSize: 11 }}>Aç →</Text>
      </Pressable>
      <Pressable
        onPress={() => navigation.navigate('WmsWavePicking')}
        style={[styles.countBanner, { backgroundColor: colors.card, borderColor: palette.orange500 }]}
      >
        <Navigation size={20} color={palette.orange500} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Dalga toplama</Text>
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            Siparişten dalga, lokasyon rotası ile topla
          </Text>
        </View>
        <Text style={{ color: palette.orange500, fontWeight: '800', fontSize: 11 }}>Aç →</Text>
      </Pressable>
      <View style={styles.kpiRow}>
        {[
          { l: 'Ürün', v: String(summary.productCount) },
          { l: 'Kritik', v: String(summary.belowMin), c: palette.red500 },
          { l: 'Sıfır', v: String(summary.zeroStock) },
          { l: 'Değer', v: formatMoney(summary.totalStockValue) },
        ].map((k) => (
          <View key={k.l} style={[styles.kpi, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={styles.lbl}>{k.l}</Text>
            <Text style={[styles.val, { color: k.c || colors.text }]} numberOfLines={1}>{k.v}</Text>
          </View>
        ))}
      </View>
      <SearchBar value={search} onChangeText={setSearch} placeholder="Stok ara…" />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading && rows.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Stok kaydı yok" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const critical = item.min_stock != null && item.stock < item.min_stock;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                  {item.code || '—'} · {item.warehouse || ''}
                </Text>
                <Text style={{ color: critical ? palette.red500 : palette.green600, fontWeight: '700', marginTop: 4 }}>
                  {item.stock} {item.unit || ''}
                  {item.min_stock != null ? ` (min ${item.min_stock})` : ''}
                </Text>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  countBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  kpiRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingTop: 8 },
  kpi: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 6 },
  lbl: { fontSize: 9, color: '#6b7280', fontWeight: '600' },
  val: { fontSize: 11, fontWeight: '800', marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
