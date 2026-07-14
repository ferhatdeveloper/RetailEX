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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Plus, ScanLine } from 'lucide-react-native';
import { ScreenHeader, SearchBar, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { fetchCustomers, type CustomerRow } from '../api/customersApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Customers'>;

export function CustomersScreen() {
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<Props['route']>();
  const orgEpoch = useOrgEpoch();
  const initialQ = route.params?.initialSearch || route.params?.callerPhone || '';
  const [search, setSearch] = useState(initialQ);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = route.params?.initialSearch || route.params?.callerPhone;
    if (q) setSearch(q);
  }, [route.params?.initialSearch, route.params?.callerPhone]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchCustomers(search));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, orgEpoch]);

  useEffect(() => {
    setLoading(true);
    const tmr = setTimeout(() => void load(), search ? 280 : 0);
    return () => clearTimeout(tmr);
  }, [load, search]);

  const openAddMenu = () => {
    Alert.alert(t('idScan.addMenuTitle'), t('idScan.addMenuHint'), [
      {
        text: t('idScan.addManual'),
        onPress: () => navigation.navigate('CustomerForm'),
      },
      {
        text: t('idScan.addWithId'),
        onPress: () => navigation.navigate('CustomerIdScan', { cardType: 'customer' }),
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Cari Hesaplar"
        subtitle={`${rows.length} kayıt`}
        right={
          <View style={styles.headerActions}>
            <HeaderIconButton
              onPress={() => navigation.navigate('CustomerIdScan', { cardType: 'customer' })}
            >
              <ScanLine size={18} color={palette.white} />
            </HeaderIconButton>
            <HeaderIconButton accent onPress={openAddMenu}>
              <Plus size={18} color={palette.white} />
            </HeaderIconButton>
          </View>
        }
      />
      <SearchBar value={search} onChangeText={setSearch} placeholder="Ad, kod, telefon…" />
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
          ListEmptyComponent={<EmptyState message="Cari bulunamadı" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate('CustomerDetail', { customerId: String(item.id) })
              }
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.cardBorder },
              ]}
            >
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    {[item.code, item.phone, item.city].filter(Boolean).join(' · ') || '—'}
                  </Text>
                  <Text
                    style={{
                      marginTop: 6,
                      fontWeight: '700',
                      color: item.balance < 0 ? palette.red500 : palette.green600,
                    }}
                  >
                    Bakiye: {formatMoney(item.balance)} ₺
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
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
});
