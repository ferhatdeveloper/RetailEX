import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { HeaderIconButton } from '../components/GradientHeader';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  createCurrency,
  createExchangeRate,
  fetchCurrencies,
  fetchExchangeRates,
  type CurrencyRow,
  type ExchangeRateRow,
} from '../api/multiCurrencyApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'currencies' | 'rates';
type Props = NativeStackScreenProps<MainStackParamList, 'MultiCurrency'>;
type CreateMode = 'currency' | 'rate' | null;

export function MultiCurrencyScreen(_props: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const [tab, setTab] = useState<Tab>('currencies');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [rates, setRates] = useState<ExchangeRateRow[]>([]);
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [buyRate, setBuyRate] = useState('');
  const [sellRate, setSellRate] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, r] = await Promise.all([fetchCurrencies(), fetchExchangeRates()]);
      setCurrencies(c);
      setRates(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const openCreate = () => {
    setCode(tab === 'rates' ? 'USD' : '');
    setName('');
    setSymbol('');
    setBuyRate('');
    setSellRate('');
    setCreateMode(tab === 'currencies' ? 'currency' : 'rate');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (createMode === 'currency') {
        await createCurrency({ code, name, symbol });
      } else {
        await createExchangeRate({
          currencyCode: code,
          buyRate: Number(buyRate.replace(',', '.')),
          sellRate: Number(sellRate.replace(',', '.')),
        });
      }
      setCreateMode(null);
      setLoading(true);
      await load();
    } catch (e) {
      Alert.alert('Kayıt hatası', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Çoklu para birimi"
        subtitle={`${currencies.length} PB · ${rates.length} kur`}
        right={
          <HeaderIconButton accent onPress={openCreate}>
            <Plus size={18} color={palette.white} />
          </HeaderIconButton>
        }
      />
      <SegmentTabBar
        layout="scroll"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'currencies' as const, label: 'Para birimleri' },
          { id: 'rates' as const, label: 'Kurlar' },
        ]}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'currencies' ? (
        <FlatList
          data={currencies}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Para birimi tanımı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.code} · {item.name}
                {item.symbol ? ` (${item.symbol})` : ''}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.is_base_currency ? 'Ana para birimi' : 'Yardımcı'}
                {!item.is_active ? ' · Pasif' : ''}
              </Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={rates}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Kur kaydı yok" />}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.currency_code} · {item.date}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Alış {item.buy_rate} · Satış {item.sell_rate}
                {item.source ? ` · ${item.source}` : ''}
              </Text>
            </View>
          )}
        />
      )}

      <Modal
        visible={createMode != null}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateMode(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateMode(null)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {createMode === 'currency' ? 'Yeni para birimi' : 'Yeni kur'}
            </Text>
            <FormField
              label={createMode === 'currency' ? 'Kod' : 'PB kodu'}
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
            />
            {createMode === 'currency' ? (
              <>
                <FormField label="Ad" value={name} onChangeText={setName} />
                <FormField label="Sembol" value={symbol} onChangeText={setSymbol} />
              </>
            ) : (
              <>
                <FormField
                  label="Alış"
                  value={buyRate}
                  onChangeText={setBuyRate}
                  keyboardType="decimal-pad"
                />
                <FormField
                  label="Satış"
                  value={sellRate}
                  onChangeText={setSellRate}
                  keyboardType="decimal-pad"
                />
              </>
            )}
            <PrimaryButton
              label={saving ? 'Kaydediliyor…' : 'Kaydet'}
              onPress={() => void handleSave()}
              disabled={saving}
              loading={saving}
            />
            <Pressable onPress={() => setCreateMode(null)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: colors.textMuted, fontWeight: '600' }}>İptal</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 12, gap: 8, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
});
