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
  deleteCountingLine,
  fetchSlipWithLines,
  getLineByBarcode,
  getProductStock,
  lookupProductByBarcode,
  slipStatusLabel,
  updateCountingSlipStatus,
  upsertCountingLine,
  type CountingLine,
  type CountingSlip,
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

  const canEdit = slip ? EDITABLE.has(slip.status) : false;

  const load = useCallback(async () => {
    setError(null);
    try {
      const { slip: s, lines: l } = await fetchSlipWithLines(slipId);
      if (!s) throw new Error('Sayım fişi bulunamadı');
      setSlip(s);
      setLines(l);
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
        await updateCountingSlipStatus(slipId, 'counting');
      }
      await upsertCountingLine(slipId, {
        product_id: pendingProductId || undefined,
        barcode: bc || undefined,
        product_name: name || bc,
        expected_qty: Number.isFinite(expected) ? expected : 0,
        counted_qty: counted,
      });
      resetEntry();
      await load();
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
                await deleteCountingLine(lineId);
                await load();
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
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
});
