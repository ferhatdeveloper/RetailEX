import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Trash2, ScanBarcode } from 'lucide-react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import {
  applyStockCount,
  deleteCountingLine,
  fetchSlipWithLines,
  fetchVarianceSummary,
  getLineByBarcode,
  getProductStock,
  lookupProductByBarcode,
  slipStatusLabel,
  updateCountingSlipStatus,
  upsertCountingLine,
  type CountingLine,
  type CountingSlip,
  type VarianceSummary,
} from '../api/wmsStockCountApi';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

const EDITABLE = new Set(['draft', 'active', 'counting', 'reconciliation']);

export function WmsCountSlipScreen() {
  const { colors } = useThemeStore();
  const route = useRoute<RouteProp<MainStackParamList, 'WmsCountSlip'>>();
  const { slipId } = route.params;

  const [slip, setSlip] = useState<CountingSlip | null>(null);
  const [lines, setLines] = useState<CountingLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [expectedQty, setExpectedQty] = useState('0');
  const [countedQty, setCountedQty] = useState('1');
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [summary, setSummary] = useState<VarianceSummary | null>(null);
  const [applying, setApplying] = useState(false);

  const canEdit = slip ? EDITABLE.has(slip.status) : false;
  const isReconciliation = slip?.status === 'reconciliation';
  const isCompleted = slip?.status === 'completed';

  const load = useCallback(async () => {
    setError(null);
    try {
      const { slip: s, lines: l } = await fetchSlipWithLines(slipId);
      if (!s) throw new Error('Sayım fişi bulunamadı');
      setSlip(s);
      setLines(l);
      if (s.status === 'reconciliation' || s.status === 'completed') {
        const sum = await fetchVarianceSummary(slipId);
        setSummary(sum);
      } else {
        setSummary(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [slipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetEntry = () => {
    setBarcode('');
    setProductName('');
    setExpectedQty('0');
    setCountedQty('1');
    setPendingProductId(null);
  };

  const resolveBarcode = useCallback(
    async (raw?: string) => {
      const bc = (raw ?? barcode).trim();
      if (!bc) return;
      setBarcode(bc);
      setSaving(true);
      setError(null);
      try {
        const existing = await getLineByBarcode(slipId, bc);
        if (existing) {
          setProductName(existing.product_name || '');
          setExpectedQty(String(existing.expected_qty ?? 0));
          setCountedQty(String(existing.counted_qty ?? 1));
          setPendingProductId(existing.product_id || null);
          return;
        }

        const product = await lookupProductByBarcode(bc);
        if (product) {
          const stock = await getProductStock(product.id);
          setProductName(product.name);
          setExpectedQty(String(stock));
          setCountedQty('1');
          setPendingProductId(product.id);
        } else {
          setProductName('');
          setExpectedQty('0');
          setCountedQty('1');
          setPendingProductId(null);
          Alert.alert(
            'Ürün bulunamadı',
            'Barkod tanınmadı — yine de manuel ad ve miktar girebilirsiniz.',
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [barcode, slipId],
  );

  const saveLine = useCallback(async () => {
    if (!canEdit) {
      Alert.alert('Salt okunur', 'Bu fiş tamamlanmış veya iptal edilmiş.');
      return;
    }
    const bc = barcode.trim();
    const name = productName.trim();
    const counted = parseFloat(countedQty.replace(',', '.'));
    const expected = parseFloat(expectedQty.replace(',', '.'));
    if (!bc && !name) {
      Alert.alert('Eksik bilgi', 'Barkod veya ürün adı girin.');
      return;
    }
    if (!Number.isFinite(counted)) {
      Alert.alert('Geçersiz miktar', 'Sayılan miktar sayı olmalı.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (slip?.status === 'draft') {
        const st = await updateCountingSlipStatus(slipId, 'counting');
        if (st.queued) {
          setSlip((prev) => (prev ? { ...prev, status: 'counting' } : prev));
        }
      }
      const lineRes = await upsertCountingLine(slipId, {
        product_id: pendingProductId || undefined,
        barcode: bc || undefined,
        product_name: name || bc,
        expected_qty: Number.isFinite(expected) ? expected : 0,
        counted_qty: counted,
      });
      resetEntry();
      await load();
      if (lineRes.queued) {
        Alert.alert(
          'Satır kuyruğa alındı',
          'Bağlantı gelince otomatik senkron edilir.',
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      Alert.alert('Kayıt hatası', msg);
    } finally {
      setSaving(false);
    }
  }, [
    barcode,
    canEdit,
    countedQty,
    expectedQty,
    load,
    pendingProductId,
    productName,
    slip?.status,
    slipId,
  ]);

  const removeLine = useCallback(
    (lineId: string) => {
      if (!canEdit) return;
      Alert.alert('Satır sil', 'Bu sayım satırı silinsin mi?', [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const del = await deleteCountingLine(slipId, lineId);
                await load();
                if (del.queued) {
                  Alert.alert(
                    'Silme kuyruğa alındı',
                    'Bağlantı gelince otomatik senkron edilir.',
                  );
                }
              } catch (e) {
                Alert.alert('Hata', e instanceof Error ? e.message : String(e));
              }
            })();
          },
        },
      ]);
    },
    [canEdit, load],
  );

  const finishCounting = useCallback(() => {
    if (!slip || slip.status !== 'counting' && slip.status !== 'draft' && slip.status !== 'active') return;
    if (!lines.length) {
      Alert.alert('Satır yok', 'Mutabakata geçmeden önce en az bir sayım satırı ekleyin.');
      return;
    }
    Alert.alert(
      'Sayımı bitir',
      `${lines.length} satır mutabakat aşamasına alınsın mı?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Mutabakata geç',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                const st = await updateCountingSlipStatus(slipId, 'reconciliation');
                await load();
                if (st.queued) {
                  Alert.alert(
                    'Durum kuyruğa alındı',
                    'Mutabakat aşaması bağlantı gelince senkron edilir.',
                  );
                }
              } catch (e) {
                Alert.alert('Hata', e instanceof Error ? e.message : String(e));
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  }, [lines.length, load, slip, slipId]);

  const handleApplyStock = useCallback(() => {
    if (!isReconciliation) return;
    Alert.alert(
      'Stoka uygula',
      'Sayım farkları stok fişlerine yazılacak ve ürün stokları güncellenecek. Devam edilsin mi?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Uygula',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setApplying(true);
              setError(null);
              try {
                const result = await applyStockCount(slipId);
                await load();
                if (result.queued) {
                  Alert.alert(
                    'Stok uygulama kuyruğa alındı',
                    `${result.processed} ürün · bağlantı gelince senkron edilir.`,
                  );
                  return;
                }
                Alert.alert(
                  'Tamamlandı',
                  `${result.processed} ürün işlendi · fazla ${result.surplus} · eksik ${result.shortage}`,
                );
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                setError(msg);
                Alert.alert('Uygulama hatası', msg);
              } finally {
                setApplying(false);
              }
            })();
          },
        },
      ],
    );
  }, [isReconciliation, load, slipId]);

  if (loading && !slip) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Sayım fişi" />
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title={slip?.fiche_no || 'Sayım'}
        subtitle={slip ? `${slipStatusLabel(slip.status)} · ${lines.length} satır` : undefined}
      />

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {canEdit ? (
        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.lbl, { color: colors.textMuted }]}>Barkod</Text>
          <View style={styles.row}>
            <TextInput
              value={barcode}
              onChangeText={setBarcode}
              onSubmitEditing={() => void resolveBarcode()}
              placeholder="Barkod okut / yaz"
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, { color: colors.text, borderColor: colors.cardBorder, flex: 1 }]}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => setScannerOpen(true)}
              style={[styles.scanBtn, { borderColor: colors.cardBorder, backgroundColor: colors.background }]}
              accessibilityLabel="Kamera ile barkod oku"
            >
              <ScanBarcode size={22} color={palette.blue600} />
            </Pressable>
            <PrimaryButton
              label="Bul"
              onPress={() => void resolveBarcode()}
              loading={saving}
              style={{ paddingVertical: 12, paddingHorizontal: 14 }}
            />
          </View>

          <Text style={[styles.lbl, { color: colors.textMuted }]}>Ürün adı</Text>
          <TextInput
            value={productName}
            onChangeText={setProductName}
            placeholder="Ürün adı"
            placeholderTextColor={colors.textSubtle}
            style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
          />

          <View style={styles.qtyRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.lbl, { color: colors.textMuted }]}>Beklenen</Text>
              <TextInput
                value={expectedQty}
                onChangeText={setExpectedQty}
                keyboardType="decimal-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.lbl, { color: colors.textMuted }]}>Sayılan</Text>
              <TextInput
                value={countedQty}
                onChangeText={setCountedQty}
                keyboardType="decimal-pad"
                style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              />
            </View>
          </View>

          <PrimaryButton
            label="Satır kaydet"
            onPress={() => void saveLine()}
            loading={saving}
          />
        </View>
      ) : (
        <View style={[styles.readonly, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
            Bu fiş {slip ? slipStatusLabel(slip.status).toLowerCase() : 'kilitli'} — yalnızca görüntüleme.
          </Text>
        </View>
      )}

      {(isReconciliation || isCompleted) && summary ? (
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Mutabakat özeti</Text>
          <View style={styles.summaryRow}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Toplam kalem</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{summary.total_items}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Farklı kalem</Text>
            <Text style={{ color: palette.orange500, fontWeight: '700' }}>
              {summary.items_with_variance}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Doğruluk</Text>
            <Text style={{ color: palette.green600, fontWeight: '700' }}>%{summary.accuracy_rate}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Eksik / Fazla adet</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              {summary.shortage_qty.toFixed(2)} / {summary.surplus_qty.toFixed(2)}
            </Text>
          </View>
          {isReconciliation ? (
            <PrimaryButton
              label="Stoka uygula"
              onPress={() => handleApplyStock()}
              loading={applying}
              style={{ marginTop: 8 }}
            />
          ) : (
            <Text style={{ color: palette.green600, fontSize: 11, fontWeight: '700', marginTop: 6 }}>
              Stok güncellemesi tamamlandı.
            </Text>
          )}
        </View>
      ) : null}

      {canEdit && lines.length > 0 && (slip?.status === 'counting' || slip?.status === 'draft' || slip?.status === 'active') ? (
        <View style={styles.finishRow}>
          <PrimaryButton
            label="Mutabakata geç"
            onPress={() => finishCounting()}
            loading={saving}
          />
        </View>
      ) : null}

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(data) => void resolveBarcode(data)}
        title="Sayım barkod"
      />

      <FlatList
        data={lines}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyState message="Henüz sayım satırı yok" />}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
        renderItem={({ item }) => {
          const variance = Number(item.variance ?? 0);
          const vColor =
            variance > 0 ? palette.green600 : variance < 0 ? palette.red500 : colors.textMuted;
          return (
            <View style={[styles.line, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  {item.product_name || item.barcode || '—'}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                  {item.barcode || '—'} · beklenen {item.expected_qty ?? 0} · sayılan{' '}
                  {item.counted_qty ?? '—'}
                </Text>
                <Text style={{ color: vColor, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                  Fark: {variance >= 0 ? '+' : ''}
                  {variance.toFixed(2)}
                </Text>
              </View>
              {canEdit ? (
                <Pressable onPress={() => removeLine(item.id)} hitSlop={8}>
                  <Trash2 size={18} color={palette.red500} />
                </Pressable>
              ) : null}
            </View>
          );
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  form: { margin: 12, borderWidth: 1, borderRadius: 10, padding: 12, gap: 6 },
  lbl: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  scanBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyRow: { flexDirection: 'row', gap: 8 },
  readonly: { margin: 12, borderWidth: 1, borderRadius: 10, padding: 12 },
  summary: { marginHorizontal: 12, marginBottom: 4, borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  summaryTitle: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  finishRow: { paddingHorizontal: 12, paddingBottom: 4 },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
});
