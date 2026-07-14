import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { ScreenHeader, EmptyState, ErrorBanner, SearchBar } from '../components/ScreenChrome';
import { HeaderIconButton } from '../components/GradientHeader';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  addStockMovementItem,
  deleteStockMovement,
  deleteStockMovementItem,
  fetchStockMovementById,
  stockMovementLabel,
  updateStockMovement,
  updateStockMovementItem,
  type StockMovementDetail,
  type StockMovementItemRow,
} from '../api/stockMovementApi';
import { fetchProducts, type ProductRow } from '../api/productsApi';
import { fetchStores } from '../api/pgClient';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function StockMovementDetailScreen() {
  const { colors } = useThemeStore();
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<RouteProp<MainStackParamList, 'StockMovementDetail'>>();
  const { id } = route.params;

  const [row, setRow] = useState<StockMovementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [editDocNo, setEditDocNo] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editWarehouseId, setEditWarehouseId] = useState<string | null>(null);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [savingHeader, setSavingHeader] = useState(false);

  const [showAddItem, setShowAddItem] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [itemQty, setItemQty] = useState('1');
  const [itemNotes, setItemNotes] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  const [editItem, setEditItem] = useState<StockMovementItemRow | null>(null);
  const [editItemQty, setEditItemQty] = useState('');
  const [savingItemEdit, setSavingItemEdit] = useState(false);

  const canEdit = row?.source_kind === 'slip';

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

  useEffect(() => {
    if (!showAddItem && !showEdit) return;
    const firm = user?.firmNr || '001';
    void fetchStores(firm).then(setStores);
  }, [showAddItem, showEdit, user?.firmNr]);

  useEffect(() => {
    if (!showAddItem) return;
    let cancelled = false;
    setProductsLoading(true);
    void fetchProducts(productSearch, 80)
      .then((rows) => {
        if (!cancelled) setProducts(rows);
      })
      .finally(() => {
        if (!cancelled) setProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showAddItem, productSearch]);

  const openEditHeader = () => {
    if (!row) return;
    setEditDocNo(row.document_no || '');
    setEditDate((row.movement_date || todayYmd()).slice(0, 10));
    setEditDesc(row.description || '');
    setEditWarehouseId(row.warehouse_id || null);
    setShowEdit(true);
  };

  const handleSaveHeader = async () => {
    if (!row) return;
    setSavingHeader(true);
    try {
      await updateStockMovement(row.id, {
        documentNo: editDocNo,
        movementDate: editDate,
        description: editDesc,
        warehouseId: editWarehouseId,
      });
      setShowEdit(false);
      setLoading(true);
      await load();
    } catch (e) {
      Alert.alert('Kayıt hatası', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingHeader(false);
    }
  };

  const openAddItem = () => {
    setProductSearch('');
    setProducts([]);
    setSelectedProduct(null);
    setItemQty('1');
    setItemNotes('');
    setShowAddItem(true);
  };

  const handleAddItem = async () => {
    if (!row || !selectedProduct) {
      Alert.alert('Eksik', 'Ürün seçin');
      return;
    }
    const qty = Number(String(itemQty).replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Geçersiz', 'Miktar 0 dan büyük olmalı');
      return;
    }
    setSavingItem(true);
    try {
      await addStockMovementItem(row.id, {
        productId: selectedProduct.id,
        quantity: qty,
        unitPrice: selectedProduct.price,
        costPrice: selectedProduct.cost,
        unitName: selectedProduct.unit || 'Adet',
        notes: itemNotes.trim() || undefined,
      });
      setShowAddItem(false);
      setLoading(true);
      await load();
    } catch (e) {
      Alert.alert('Kalem eklenemedi', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingItem(false);
    }
  };

  const confirmDeleteItem = (item: StockMovementItemRow) => {
    if (!row) return;
    Alert.alert('Kalemi sil', `${item.product_name || item.product_code || 'Bu kalem'} silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await deleteStockMovementItem(row.id, item.id);
              await load();
            } catch (e) {
              Alert.alert('Silinemedi', e instanceof Error ? e.message : String(e));
            }
          })();
        },
      },
    ]);
  };

  const openEditItem = (item: StockMovementItemRow) => {
    setEditItem(item);
    setEditItemQty(String(item.quantity));
  };

  const handleSaveItemQty = async () => {
    if (!row || !editItem) return;
    const qty = Number(String(editItemQty).replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Geçersiz', 'Miktar 0 dan büyük olmalı');
      return;
    }
    setSavingItemEdit(true);
    try {
      await updateStockMovementItem(row.id, editItem.id, { quantity: qty });
      setEditItem(null);
      await load();
    } catch (e) {
      Alert.alert('Güncellenemedi', e instanceof Error ? e.message : String(e));
    } finally {
      setSavingItemEdit(false);
    }
  };

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

  const filteredProducts = useMemo(() => products.slice(0, 50), [products]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={row?.document_no || 'Stok fişi'}
        subtitle={row ? stockMovementLabel(row) : 'Detay'}
        right={
          canEdit ? (
            <View style={styles.headerActions}>
              <HeaderIconButton onPress={openAddItem}>
                <Plus size={18} color={palette.white} />
              </HeaderIconButton>
              <HeaderIconButton onPress={openEditHeader}>
                <Pencil size={18} color={palette.white} />
              </HeaderIconButton>
              <HeaderIconButton onPress={confirmDelete}>
                <Trash2 size={18} color={deleting ? palette.gray400 : palette.white} />
              </HeaderIconButton>
            </View>
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
          ListEmptyComponent={<EmptyState message="Kalem yok — + ile ürün ekleyin" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => (canEdit ? openEditItem(item) : undefined)}
              onLongPress={() => (canEdit ? confirmDeleteItem(item) : undefined)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={2}>
                  {item.product_name || item.product_code || item.product_id}
                </Text>
                {canEdit ? (
                  <Pressable onPress={() => confirmDeleteItem(item)} hitSlop={8}>
                    <Trash2 size={16} color={palette.red500} />
                  </Pressable>
                ) : null}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                {item.quantity} {item.unit_name || 'Adet'}
                {item.unit_price ? ` · ${formatMoney(item.unit_price)}` : ''}
              </Text>
              {item.notes ? (
                <Text style={{ color: colors.textSubtle, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      ) : null}
      {!loading && !row && !error ? (
        <Pressable onPress={() => navigation.goBack()} style={{ padding: 16 }}>
          <Text style={{ color: palette.blue600, fontWeight: '700' }}>Geri</Text>
        </Pressable>
      ) : null}

      <Modal visible={showEdit} transparent animationType="slide" onRequestClose={() => setShowEdit(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowEdit(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Fiş başlığı</Text>
            <FormField label="Belge no" value={editDocNo} onChangeText={setEditDocNo} />
            <FormField label="Tarih (YYYY-MM-DD)" value={editDate} onChangeText={setEditDate} />
            <FormField label="Açıklama" value={editDesc} onChangeText={setEditDesc} multiline />
            {stores.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {stores.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setEditWarehouseId(s.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: editWarehouseId === s.id ? palette.blue600 : colors.background,
                        borderColor: colors.cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: editWarehouseId === s.id ? palette.white : colors.text,
                        fontWeight: '700',
                        fontSize: 12,
                      }}
                    >
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <PrimaryButton
              label={savingHeader ? 'Kaydediliyor…' : 'Güncelle'}
              onPress={() => void handleSaveHeader()}
              disabled={savingHeader}
              loading={savingHeader}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showAddItem} transparent animationType="slide" onRequestClose={() => setShowAddItem(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowAddItem(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Kalem ekle</Text>
            <SearchBar value={productSearch} onChangeText={setProductSearch} placeholder="Ürün ara…" />
            {selectedProduct ? (
              <View style={[styles.selectedBox, { borderColor: palette.blue600, backgroundColor: colors.background }]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{selectedProduct.name}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {selectedProduct.code || selectedProduct.barcode || selectedProduct.id}
                </Text>
                <Pressable onPress={() => setSelectedProduct(null)}>
                  <Text style={{ color: palette.blue600, fontWeight: '600', marginTop: 4 }}>Değiştir</Text>
                </Pressable>
              </View>
            ) : productsLoading ? (
              <ActivityIndicator color={palette.blue600} style={{ marginVertical: 12 }} />
            ) : (
              <FlatList
                data={filteredProducts}
                keyExtractor={(p) => p.id}
                style={{ maxHeight: 180 }}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={{ color: colors.textMuted, paddingVertical: 8 }}>Ürün bulunamadı</Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => setSelectedProduct(item)}
                    style={[styles.productRow, { borderBottomColor: colors.cardBorder }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      {item.code || item.barcode || '—'}
                    </Text>
                  </Pressable>
                )}
              />
            )}
            <FormField label="Miktar" value={itemQty} onChangeText={setItemQty} keyboardType="decimal-pad" />
            <FormField label="Not (opsiyonel)" value={itemNotes} onChangeText={setItemNotes} />
            <PrimaryButton
              label={savingItem ? 'Ekleniyor…' : 'Ekle'}
              onPress={() => void handleAddItem()}
              disabled={savingItem}
              loading={savingItem}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editItem} transparent animationType="fade" onRequestClose={() => setEditItem(null)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditItem(null)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Miktar düzenle</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }} numberOfLines={2}>
              {editItem?.product_name || editItem?.product_code}
            </Text>
            <FormField label="Miktar" value={editItemQty} onChangeText={setEditItemQty} keyboardType="decimal-pad" />
            <PrimaryButton
              label={savingItemEdit ? 'Kaydediliyor…' : 'Güncelle'}
              onPress={() => void handleSaveItemQty()}
              disabled={savingItemEdit}
              loading={savingItemEdit}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  headerActions: { flexDirection: 'row', gap: 4 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 16,
    paddingBottom: 28,
    gap: 4,
    maxHeight: '88%',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  chipRow: { gap: 8, paddingVertical: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  selectedBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginVertical: 8 },
  productRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
