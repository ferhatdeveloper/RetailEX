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
import { Trash2, ScanBarcode, ArrowLeftRight } from 'lucide-react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { PrimaryButton } from '../components/PrimaryButton';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import {
  cancelTransfer,
  completeTransfer,
  deleteTransferItem,
  fetchTransferWithItems,
  lookupTransferProduct,
  transferStatusLabel,
  upsertTransferItem,
  type WmsTransfer,
  type WmsTransferItem,
} from '../api/wmsTransferApi';
import { useThemeStore } from '../store/themeStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

const EDITABLE = new Set(['pending', 'in_transit']);

export function WmsTransferSlipScreen() {
  const { colors } = useThemeStore();
  const route = useRoute<RouteProp<MainStackParamList, 'WmsTransferSlip'>>();
  const { transferId } = route.params;

  const [transfer, setTransfer] = useState<WmsTransfer | null>(null);
  const [items, setItems] = useState<WmsTransferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const canEdit = transfer ? EDITABLE.has(transfer.status) : false;

  const load = useCallback(async () => {
    setError(null);
    try {
      const { transfer: t, items: list } = await fetchTransferWithItems(transferId);
      if (!t) throw new Error('Transfer bulunamadı');
      setTransfer(t);
      setItems(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [transferId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetEntry = () => {
    setBarcode('');
    setProductName('');
    setQuantity('1');
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
        const existing = items.find(
          (it) => it.product_code === bc || it.product_name?.includes(bc),
        );
        if (existing?.product_id) {
          setProductName(existing.product_name || '');
          setQuantity(String(existing.quantity ?? 1));
          setPendingProductId(existing.product_id);
          return;
        }

        const product = await lookupTransferProduct(bc);
        if (product) {
          setProductName(product.name);
          setQuantity('1');
          setPendingProductId(product.id);
        } else {
          setProductName('');
          setQuantity('1');
          setPendingProductId(null);
          Alert.alert('Ürün bulunamadı', 'Barkod tanınmadı — ürün kartını kontrol edin.');
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    },
    [barcode, items],
  );

  const saveLine = useCallback(async () => {
    if (!canEdit) {
      Alert.alert('Salt okunur', 'Bu transfer tamamlanmış veya iptal edilmiş.');
      return;
    }
    if (!pendingProductId) {
      Alert.alert('Eksik bilgi', 'Önce barkod okutun veya ürün bulun.');
      return;
    }
    const qty = parseFloat(quantity.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Geçersiz miktar', 'Miktar sıfırdan büyük olmalı.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await upsertTransferItem(transferId, {
        product_id: pendingProductId,
        quantity: qty,
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
  }, [canEdit, load, pendingProductId, quantity, transferId]);

  const removeLine = useCallback(
    async (item: WmsTransferItem) => {
      if (!canEdit) return;
      Alert.alert('Satır sil', `${item.product_name || 'Ürün'} kaldırılsın mı?`, [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await deleteTransferItem(item.id);
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          },
        },
      ]);
    },
    [canEdit, load],
  );

  const handleComplete = useCallback(async () => {
    if (!canEdit) return;
    Alert.alert('Transferi tamamla', 'Transfer tamamlandı olarak işaretlensin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Tamamla',
        onPress: async () => {
          setSaving(true);
          setError(null);
          try {
            await completeTransfer(transferId);
            await load();
            Alert.alert('Tamamlandı', 'Transfer kaydedildi.');
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg);
            Alert.alert('Hata', msg);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [canEdit, load, transferId]);

  const handleCancel = useCallback(async () => {
    if (!canEdit) return;
    Alert.alert('Transferi iptal et', 'Bu transfer iptal edilsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await cancelTransfer(transferId);
            await load();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }, [canEdit, load, transferId]);

  if (loading && !transfer) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ScreenHeader title="Transfer fişi" />
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
        title={transfer?.fiche_no || 'Transfer'}
        subtitle={
          transfer
            ? `${transfer.source_store_name || 'Kaynak'} → ${transfer.target_store_name || 'Hedef'}`
            : undefined
        }
      />

      {transfer ? (
        <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <ArrowLeftRight size={16} color={palette.blue600} />
          <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }}>
            Durum: {transferStatusLabel(transfer.status)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 10 }}>
            {items.length} kalem
          </Text>
        </View>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {canEdit ? (
        <View style={[styles.entry, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <View style={styles.barcodeRow}>
            <TextInput
              value={barcode}
              onChangeText={setBarcode}
              placeholder="Barkod okut / yaz"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              onSubmitEditing={() => void resolveBarcode()}
              returnKeyType="search"
            />
            <Pressable
              onPress={() => setScannerOpen(true)}
              style={[styles.scanBtn, { borderColor: palette.blue600 }]}
            >
              <ScanBarcode size={20} color={palette.blue600} />
            </Pressable>
          </View>
          {productName ? (
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{productName}</Text>
          ) : null}
          <View style={styles.qtyRow}>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>Miktar</Text>
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              style={[styles.qtyInput, { color: colors.text, borderColor: colors.cardBorder }]}
            />
            <PrimaryButton
              label="Ekle"
              onPress={() => void saveLine()}
              loading={saving}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            message={canEdit ? 'Ürün eklemek için barkod okutun' : 'Transfer kalemi yok'}
          />
        }
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: canEdit ? 120 : 40 }}
        renderItem={({ item }) => (
          <View style={[styles.lineCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{item.product_name || 'Ürün'}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                {item.product_code || '—'} · {item.quantity} {item.unit || ''}
              </Text>
            </View>
            {canEdit ? (
              <Pressable onPress={() => void removeLine(item)} hitSlop={8}>
                <Trash2 size={18} color={palette.red500} />
              </Pressable>
            ) : null}
          </View>
        )}
      />

      {canEdit ? (
        <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          <PrimaryButton
            label="Transferi tamamla"
            onPress={() => void handleComplete()}
            loading={saving}
            disabled={items.length === 0}
          />
          <PrimaryButton
            label="İptal et"
            variant="ghost"
            onPress={() => void handleCancel()}
            disabled={saving}
          />
        </View>
      ) : null}

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={(code) => {
          setScannerOpen(false);
          void resolveBarcode(code);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  entry: {
    marginHorizontal: 12,
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  barcodeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  scanBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyInput: {
    width: 72,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'center',
    fontSize: 14,
  },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    padding: 12,
    gap: 8,
  },
});
