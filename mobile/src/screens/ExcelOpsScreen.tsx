import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Pressable,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Download, Sparkles } from 'lucide-react-native';
import { ScreenHeader, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import {
  fetchExcelEntitySummaries,
  shareCustomersCsv,
  shareProductsCsv,
  type ExcelEntitySummary,
} from '../api/excelOpsApi';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'excel' | 'smart';
type Props = NativeStackScreenProps<MainStackParamList, 'ExcelOps'>;

export function excelOpsRouteTab(screenId?: string): Tab {
  if (screenId === 'smart-material-add') return 'smart';
  return 'excel';
}

export function ExcelOpsScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const orgEpoch = useOrgEpoch();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [tab, setTab] = useState<Tab>(excelOpsRouteTab(route.params?.screenId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<ExcelEntitySummary[]>([]);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setTab(excelOpsRouteTab(route.params?.screenId));
  }, [route.params?.screenId]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setSummaries(await fetchExcelEntitySummaries());
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

  const shareEntity = async (id: string) => {
    setSharing(true);
    try {
      if (id === 'products') await shareProductsCsv();
      else if (id === 'customers') await shareCustomersCsv();
    } catch (e) {
      Alert.alert('Paylaşım hatası', e instanceof Error ? e.message : String(e));
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={tab === 'smart' ? 'Akıllı malzeme ekleme' : 'Excel işlemleri'}
        subtitle="Mobil: CSV paylaşım + hızlı ürün oluşturma"
      />
      <SegmentTabBar
        layout="equal"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'excel' as const, label: 'Excel / dışa aktar' },
          { id: 'smart' as const, label: 'Akıllı ekleme' },
        ]}
      />
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        >
          {tab === 'excel' ? (
            <>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Excel dosya seçimi web/masaüstünde. Mobilde canlı kayıt sayılarına göre CSV metin paylaşılır.
              </Text>
              {summaries.map((s) => (
                <Pressable
                  key={s.id}
                  disabled={sharing || s.count === 0}
                  onPress={() => void shareEntity(s.id)}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                >
                  <View style={styles.cardRow}>
                    <Download size={18} color={palette.blue600} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{s.label}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{s.count} kayıt · CSV paylaş</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </>
          ) : (
            <>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Raf / fiyat etiketi kamera OCR ile malzeme kartı; isterseniz manuel form da açılır.
              </Text>
              <Pressable
                onPress={() => navigation.navigate('MaterialLabelScan')}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <View style={styles.cardRow}>
                  <Sparkles size={18} color={palette.blue600} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Kamera ile akıllı ekle</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      Etiket OCR → kod, barkod, ad, fiyat, KDV
                    </Text>
                  </View>
                </View>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate('ProductForm')}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              >
                <View style={styles.cardRow}>
                  <Sparkles size={18} color={palette.blue600} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>Yeni malzeme (manuel)</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      Kod, barkod, fiyat ile basit kayıt
                    </Text>
                  </View>
                </View>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 12, gap: 10, paddingBottom: 40 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 4 },
  card: { borderWidth: 1, borderRadius: 10, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
