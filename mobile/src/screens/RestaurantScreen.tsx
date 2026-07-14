import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import { GradientHeader, HeaderIconButton } from '../components/GradientHeader';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchRestaurantTables,
  fetchOpenOrders,
  getActiveOrderForTable,
  getOrderDetailById,
  createRestaurantOrder,
  addRestaurantOrderItem,
  completeTablePayment,
  type RestPaymentMethod,
  type RestTable,
  type RestOrder,
  type RestOrderDetail,
} from '../api/restaurantApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import type { MainStackParamList } from '../navigation/types';

type Tab = 'tables' | 'orders';
type Props = NativeStackScreenProps<MainStackParamList, 'Restaurant'>;

export function RestaurantScreen({ route }: Props) {
  const { colors } = useThemeStore();
  const initialTab = route.params?.initialTab ?? 'tables';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [tables, setTables] = useState<RestTable[]>([]);
  const [orders, setOrders] = useState<RestOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTable, setSelectedTable] = useState<RestTable | null>(null);
  const [orderDetail, setOrderDetail] = useState<RestOrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemPrice, setItemPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payMethod, setPayMethod] = useState<RestPaymentMethod>('cash');
  const [modalError, setModalError] = useState<string | null>(null);

  const orgEpoch = useOrgEpoch();

  const PAY_METHODS: { id: RestPaymentMethod; label: string }[] = [
    { id: 'cash', label: 'Nakit' },
    { id: 'card', label: 'Kart' },
    { id: 'veresiye', label: 'Veresiye' },
  ];

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, o] = await Promise.all([fetchRestaurantTables(), fetchOpenOrders()]);
      setTables(t);
      setOrders(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (route.params?.initialTab) setTab(route.params.initialTab);
  }, [route.params?.initialTab]);

  const resetItemForm = () => {
    setItemName('');
    setItemQty('1');
    setItemPrice('');
  };

  const openTable = async (table: RestTable) => {
    setSelectedTable(table);
    setOrderDetail(null);
    setModalError(null);
    resetItemForm();
    setOrderLoading(true);
    try {
      const detail = await getActiveOrderForTable(table.id);
      setOrderDetail(detail);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrderLoading(false);
    }
  };

  /** Adisyon listesinden: her zaman id ile kalemleri yükle */
  const openOrder = async (order: RestOrder) => {
    const tbl =
      tables.find((t) => t.id === order.table_id) ||
      ({
        id: order.table_id || '',
        name: order.table_name,
        status: order.status,
        waiter: order.waiter,
        total: order.total_amount,
        floor_id: null,
      } satisfies RestTable);

    setSelectedTable(tbl);
    setOrderDetail(null);
    setModalError(null);
    resetItemForm();
    setOrderLoading(true);
    try {
      const detail = await getOrderDetailById(order.id);
      setOrderDetail(detail);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrderLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedTable(null);
    setOrderDetail(null);
    setModalError(null);
    setPayMethod('cash');
  };

  const isOrderOpen = (status: string | null | undefined) => {
    const s = String(status || '').toLowerCase();
    return s !== 'closed' && s !== 'cancelled' && s !== 'kapatildi';
  };

  const handlePayment = () => {
    if (!selectedTable || !orderDetail?.id) return;
    if (!isOrderOpen(orderDetail.status)) {
      setModalError('Bu adisyon zaten kapalı');
      return;
    }
    const methodLabel = PAY_METHODS.find((m) => m.id === payMethod)?.label || payMethod;
    Alert.alert(
      'Ödeme / kapat',
      `${formatMoney(orderDetail.total_amount)} ₺ — ${methodLabel}\nAdisyon kapatılsın mı?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Onayla',
          onPress: () => void doPayment(),
        },
      ],
    );
  };

  const doPayment = async () => {
    if (!selectedTable || !orderDetail?.id) return;
    setPaying(true);
    setModalError(null);
    try {
      await completeTablePayment({
        tableId: selectedTable.id,
        orderId: orderDetail.id,
        paymentMethod: payMethod,
      });
      closeModal();
      await load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setPaying(false);
    }
  };

  const refreshOrder = async (tableId: string, orderId?: string) => {
    const detail = orderId
      ? await getOrderDetailById(orderId)
      : await getActiveOrderForTable(tableId);
    setOrderDetail(detail);
    await load();
  };

  const handleCreateOrder = async () => {
    if (!selectedTable) return;
    setSaving(true);
    setModalError(null);
    try {
      await createRestaurantOrder({
        tableId: selectedTable.id,
        floorId: selectedTable.floor_id,
      });
      await refreshOrder(selectedTable.id);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    if (!orderDetail?.id) return;
    const name = itemName.trim();
    const qty = Number(itemQty.replace(',', '.'));
    const price = Number(itemPrice.replace(',', '.'));
    if (!name) {
      setModalError('Ürün adı gerekli');
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setModalError('Geçerli miktar girin');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setModalError('Geçerli fiyat girin');
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      const oid = orderDetail.id;
      await addRestaurantOrderItem(oid, {
        productName: name,
        quantity: qty,
        unitPrice: price,
      });
      resetItemForm();
      if (selectedTable) await refreshOrder(selectedTable.id, oid);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Restoran" subtitle="Masalar & açık adisyonlar" />
      <View style={styles.tabs}>
        {(['tables', 'orders'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[
              styles.tab,
              {
                backgroundColor: tab === t ? palette.blue600 : colors.card,
                borderColor: colors.cardBorder,
              },
            ]}
          >
            <Text style={{ color: tab === t ? palette.white : colors.text, fontWeight: '700', fontSize: 12 }}>
              {t === 'tables' ? `Masalar (${tables.length})` : `Adisyon (${orders.length})`}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'tables' ? (
        <FlatList
          data={tables}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Masa kaydı yok (rest şeması)" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          columnWrapperStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const busy =
              String(item.status || '').toLowerCase().includes('occ') ||
              String(item.status || '').toLowerCase() === 'dolu' ||
              Number(item.total) > 0;
            return (
              <Pressable
                onPress={() => void openTable(item)}
                style={[
                  styles.tableCard,
                  {
                    backgroundColor: busy ? '#dbeafe' : colors.card,
                    borderColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={{ fontWeight: '800', color: colors.text }}>{item.name}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted }}>{item.status || 'boş'}</Text>
                <Text style={{ fontWeight: '700', color: palette.blue600, marginTop: 4 }}>
                  {formatMoney(item.total)} ₺
                </Text>
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<EmptyState message="Açık adisyon yok" />}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void openOrder(item)}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>
                {item.order_no || item.id.slice(0, 8)} · {item.table_name || 'Masa'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {item.waiter || ''} · {item.status || ''}
              </Text>
              <Text style={{ color: palette.blue600, fontWeight: '800', marginTop: 4 }}>
                {formatMoney(item.total_amount)} ₺
              </Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={!!selectedTable} animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={[styles.modalRoot, { backgroundColor: colors.background }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <GradientHeader compact>
            <View style={styles.modalHeaderRow}>
              <HeaderIconButton onPress={closeModal}>
                <ArrowLeft size={18} color={palette.white} />
              </HeaderIconButton>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.white, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                  {selectedTable?.name || 'Masa'}
                </Text>
                <Text style={{ color: palette.blue100, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                  {orderDetail?.order_no || 'Adisyon'}
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>
          </GradientHeader>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {modalError ? <ErrorBanner message={modalError} onRetry={() => setModalError(null)} /> : null}
            {orderLoading ? (
              <ActivityIndicator color={palette.blue600} style={{ marginTop: 24 }} />
            ) : orderDetail ? (
              <>
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    Toplam: {formatMoney(orderDetail.total_amount)} ₺
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                    {orderDetail.waiter || ''} · {orderDetail.status || 'open'}
                  </Text>
                </View>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Kalemler</Text>
                {orderDetail.items.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>Henüz kalem yok</Text>
                ) : (
                  orderDetail.items.map((it) => (
                    <View
                      key={it.id}
                      style={[styles.itemRow, { borderColor: colors.cardBorder, backgroundColor: colors.card }]}
                    >
                      <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{it.product_name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                        {it.quantity} × {formatMoney(it.unit_price)}
                      </Text>
                      <Text style={{ color: palette.blue600, fontWeight: '700', marginLeft: 8 }}>
                        {formatMoney(it.subtotal)} ₺
                      </Text>
                    </View>
                  ))
                )}
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>Kalem ekle</Text>
                <FormField label="Ürün adı" value={itemName} onChangeText={setItemName} placeholder="Örn. Izgara köfte" />
                <View style={styles.rowFields}>
                  <View style={{ flex: 1 }}>
                    <FormField label="Miktar" value={itemQty} onChangeText={setItemQty} keyboardType="decimal-pad" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FormField label="Birim fiyat" value={itemPrice} onChangeText={setItemPrice} keyboardType="decimal-pad" />
                  </View>
                </View>
                <PrimaryButton label="Kalem ekle" onPress={() => void handleAddItem()} loading={saving} />
                {isOrderOpen(orderDetail.status) ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 20 }]}>
                      Ödeme / kapat
                    </Text>
                    <View style={styles.payRow}>
                      {PAY_METHODS.map((m) => (
                        <Pressable
                          key={m.id}
                          onPress={() => setPayMethod(m.id)}
                          style={[
                            styles.payChip,
                            {
                              backgroundColor: payMethod === m.id ? palette.blue600 : colors.card,
                              borderColor: colors.cardBorder,
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: payMethod === m.id ? palette.white : colors.text,
                              fontSize: 12,
                              fontWeight: '700',
                            }}
                          >
                            {m.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <PrimaryButton
                      label={`Ödeme al · ${formatMoney(orderDetail.total_amount)} ₺`}
                      onPress={handlePayment}
                      loading={paying}
                    />
                  </>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12 }}>
                    Adisyon kapalı ({orderDetail.status})
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text style={{ color: colors.textMuted, marginBottom: 16 }}>
                  Bu masada açık adisyon yok. Yeni adisyon açabilirsiniz.
                </Text>
                <PrimaryButton label="Adisyon aç" onPress={() => void handleCreateOrder()} loading={saving} />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 8, padding: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  tableCard: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 88 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12 },
  modalRoot: { flex: 1 },
  modalBody: { padding: 16, gap: 12, paddingBottom: 48 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginTop: 8 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  rowFields: { flexDirection: 'row', gap: 8 },
  payRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  payChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 2 },
});
