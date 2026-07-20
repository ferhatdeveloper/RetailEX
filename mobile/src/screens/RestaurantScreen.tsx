import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowLeft, Clock, Users, Utensils } from 'lucide-react-native';
import { GradientHeader, HeaderIconButton } from '../components/GradientHeader';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchRestaurantTables,
  fetchOpenOrders,
  fetchTodayOrders,
  fetchReservationsForDate,
  getActiveOrderForTable,
  getOrderDetailById,
  createRestaurantOrder,
  addRestaurantOrderItem,
  fetchRestaurantMenuItems,
  sendRestaurantItemsToKitchen,
  fetchActiveKitchenOrders,
  updateRestaurantKitchenItemStatus,
  updateRestaurantKitchenOrderStatus,
  createRestaurantReservation,
  updateRestaurantReservationStatus,
  completeTablePayment,
  type RestPaymentMethod,
  type RestTable,
  type RestOrder,
  type RestOrderDetail,
  type RestReservation,
  type RestReservationStatus,
  type RestMenuItem,
  type RestKitchenOrder,
} from '../api/restaurantApi';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { palette } from '../theme/colors';
import {
  TABLE_STATUS_LEGEND,
  formatCompactTotal,
  getStatusConfig,
  normalizeTableStatus,
  type TableStatus,
} from '../theme/tableStatusConfig';
import type { MainStackParamList } from '../navigation/types';
import {
  enqueueKitchenPrintJobs,
  isWindowsPrinterServiceEnabled,
} from '../api/kitchenPrintQueueApi';
import { printKitchenTicketsForOrder } from '../services/kitchenTicketPrint';
import { resolveKitchenTicketLocale } from '../services/escpos/buildKitchenTicketEscPos';
import type { ReceiptLangCode } from '../types/printerSettings';

type Tab = 'tables' | 'orders' | 'schedule' | 'kitchen';
type Props = NativeStackScreenProps<MainStackParamList, 'Restaurant'>;

const COLS = 3;
const GRID_GAP = 8;
const GRID_PAD = 12;
const KITCHEN_LANGS: { code: ReceiptLangCode; label: string }[] = [
  { code: 'tr', label: 'TR' },
  { code: 'en', label: 'EN' },
  { code: 'ar', label: 'AR' },
  { code: 'ku', label: 'KU' },
  { code: 'uz', label: 'UZ' },
];

type ScheduleItem = {
  id: string;
  kind: 'order' | 'reservation';
  time: string;
  title: string;
  subtitle: string;
  amount?: number;
  status: string | null;
  order?: RestOrder;
  reservation?: RestReservation;
};

function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatClock(isoOrTime: string | null | undefined): string {
  if (!isoOrTime) return '—';
  const s = String(isoOrTime);
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s.slice(11, 16) || s.slice(0, 5);
}

function hourKey(time: string): string {
  const m = time.match(/^(\d{1,2})/);
  if (!m) return '—';
  return `${m[1].padStart(2, '0')}:00`;
}

function reservationStatusLabel(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return 'Bekliyor';
  if (s === 'confirmed') return 'Onaylı';
  if (s === 'seated') return 'Oturdu';
  if (s === 'cancelled') return 'İptal';
  if (s === 'noshow' || s === 'no_show') return 'Gelmedi';
  return status || '—';
}

function orderStatusLabel(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase();
  if (s === 'open') return 'Açık';
  if (s === 'closed' || s === 'kapatildi') return 'Kapalı';
  if (s === 'cancelled') return 'İptal';
  return getStatusConfig(status).label;
}

function kitchenStatusLabel(status: string | null | undefined): string {
  const s = String(status || '').toLowerCase();
  if (!s || s === 'new' || s === 'pending') return 'Bekliyor';
  if (s === 'cooking') return 'Pişiyor';
  if (s === 'ready') return 'Hazır';
  if (s === 'served') return 'Servis edildi';
  if (s === 'cancelled') return 'İptal';
  return status || '—';
}

function isPendingKitchenLine(item: { status?: string | null; sent_to_kitchen_at?: string | null }): boolean {
  const s = String(item.status || 'pending').toLowerCase();
  return (
    !item.sent_to_kitchen_at &&
    s !== 'cooking' &&
    s !== 'ready' &&
    s !== 'served' &&
    s !== 'cancelled'
  );
}

export function RestaurantScreen({ route }: Props) {
  const { colors, darkMode } = useThemeStore();
  const { width } = useWindowDimensions();
  const initialTab = route.params?.initialTab ?? 'tables';
  const callerPhone = route.params?.callerPhone?.trim() || '';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [tables, setTables] = useState<RestTable[]>([]);
  const [orders, setOrders] = useState<RestOrder[]>([]);
  const [todayOrders, setTodayOrders] = useState<RestOrder[]>([]);
  const [reservations, setReservations] = useState<RestReservation[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<RestKitchenOrder[]>([]);
  const [menuItems, setMenuItems] = useState<RestMenuItem[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [menuLoading, setMenuLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTable, setSelectedTable] = useState<RestTable | null>(null);
  const [orderDetail, setOrderDetail] = useState<RestOrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [selectedMenuItem, setSelectedMenuItem] = useState<RestMenuItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemPrice, setItemPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [sendingKitchen, setSendingKitchen] = useState(false);
  const [kitchenActionId, setKitchenActionId] = useState<string | null>(null);
  const [kitchenLocale, setKitchenLocale] = useState<ReceiptLangCode>(() => resolveKitchenTicketLocale());
  const [payMethod, setPayMethod] = useState<RestPaymentMethod>('cash');
  const [modalError, setModalError] = useState<string | null>(null);
  const [reservationForm, setReservationForm] = useState({
    customerName: '',
    phone: callerPhone,
    time: '19:00',
    guestCount: '2',
    note: '',
  });

  const orgEpoch = useOrgEpoch();

  const PAY_METHODS: { id: RestPaymentMethod; label: string }[] = [
    { id: 'cash', label: 'Nakit' },
    { id: 'card', label: 'Kart' },
    { id: 'veresiye', label: 'Veresiye' },
  ];

  const cardSize = useMemo(() => {
    const usable = width - GRID_PAD * 2 - GRID_GAP * (COLS - 1);
    return Math.floor(usable / COLS);
  }, [width]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<TableStatus, number>> = {};
    for (const t of tables) {
      const st = normalizeTableStatus(t.status);
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [tables]);

  const scheduleItems = useMemo((): ScheduleItem[] => {
    const items: ScheduleItem[] = [];
    for (const o of todayOrders) {
      items.push({
        id: `o-${o.id}`,
        kind: 'order',
        time: formatClock(o.created_at),
        title: o.table_name || 'Masa',
        subtitle: `${o.order_no || o.id.slice(0, 8)} · ${orderStatusLabel(o.status)}`,
        amount: o.total_amount,
        status: o.status,
        order: o,
      });
    }
    for (const r of reservations) {
      items.push({
        id: `r-${r.id}`,
        kind: 'reservation',
        time: formatClock(r.reservation_time),
        title: r.customer_name,
        subtitle: `${r.guest_count} kişi · ${reservationStatusLabel(r.status)}${
          r.table_name ? ` · Masa ${r.table_name}` : ''
        }`,
        status: r.status,
        reservation: r,
      });
    }
    return items.sort((a, b) => a.time.localeCompare(b.time, 'tr'));
  }, [todayOrders, reservations]);

  const scheduleByHour = useMemo(() => {
    const map = new Map<string, ScheduleItem[]>();
    for (const item of scheduleItems) {
      const key = hourKey(item.time);
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [scheduleItems]);

  const pendingKitchenCount = useMemo(
    () => orderDetail?.items.filter(isPendingKitchenLine).length ?? 0,
    [orderDetail],
  );

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setError(null);
    try {
      const date = todayYmd();
      const [t, o, todays, res, kitchen] = await Promise.all([
        fetchRestaurantTables(),
        fetchOpenOrders(),
        fetchTodayOrders(),
        fetchReservationsForDate(date),
        fetchActiveKitchenOrders(),
      ]);
      setTables(t);
      setOrders(o);
      setTodayOrders(todays);
      setReservations(res);
      setKitchenOrders(kitchen);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (callerPhone && !route.params?.initialTab) {
      setTab('orders');
    }
    if (callerPhone) {
      setReservationForm((prev) => ({ ...prev, phone: prev.phone || callerPhone }));
    }
  }, [callerPhone, route.params?.initialTab]);

  useEffect(() => {
    if (route.params?.initialTab) {
      setTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);

  const loadMenuItems = useCallback(async (searchText = '') => {
    setMenuLoading(true);
    try {
      setMenuItems(await fetchRestaurantMenuItems(searchText, 120));
    } finally {
      setMenuLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadMenuItems(menuSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [loadMenuItems, menuSearch]);

  const resetItemForm = () => {
    setSelectedMenuItem(null);
    setItemName('');
    setItemQty('1');
    setItemPrice('');
  };

  const openTable = async (table: RestTable) => {
    setSelectedTable(table);
    setOrderDetail(null);
    setModalError(null);
    setKitchenLocale(resolveKitchenTicketLocale());
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
    setKitchenLocale(resolveKitchenTicketLocale());
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
      await load({ soft: true });
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
    await load({ soft: true });
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
        productId: selectedMenuItem?.id,
      });
      resetItemForm();
      if (selectedTable) await refreshOrder(selectedTable.id, oid);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const selectMenuItem = (item: RestMenuItem) => {
    setSelectedMenuItem(item);
    setItemName(item.name);
    setItemPrice(String(item.price));
    setModalError(null);
  };

  const handleSendToKitchen = async () => {
    if (!orderDetail?.id || !selectedTable) return;
    if (pendingKitchenCount === 0) {
      setModalError('Mutfağa gönderilecek bekleyen kalem yok');
      return;
    }
    setSendingKitchen(true);
    setKitchenActionId(orderDetail.id);
    setModalError(null);
    const orderBeforeSend = orderDetail;
    try {
      const oid = orderBeforeSend.id;
      const result = await sendRestaurantItemsToKitchen(oid);
      if (result.sentItemCount === 0) {
        setModalError('Mutfağa gönderilecek yeni kalem yok');
        return;
      }
      const serviceEnabled = await isWindowsPrinterServiceEnabled();
      const queueResult = serviceEnabled
        ? await enqueueKitchenPrintJobs({
            order: orderBeforeSend,
            kitchenResult: result,
            tableName: selectedTable.name || orderBeforeSend.table_name,
            menu: menuItems,
            locale: kitchenLocale,
          })
        : null;
      const printResult = serviceEnabled
        ? null
        : await printKitchenTicketsForOrder({
            order: orderBeforeSend,
            kitchenResult: result,
            tableName: selectedTable.name || orderBeforeSend.table_name,
            menu: menuItems,
            locale: kitchenLocale,
          });
      await refreshOrder(selectedTable.id, oid);
      setKitchenOrders(await fetchActiveKitchenOrders());
      if (serviceEnabled) {
        Alert.alert(
          'Mutfak',
          `${result.sentItemCount} kalem mutfağa gönderildi.\n${queueResult?.jobCount ?? 0} yazdırma işi RetailEX_Printer kuyruğuna eklendi.`,
        );
      } else if (printResult?.ok) {
        Alert.alert('Mutfak', `${result.sentItemCount} kalem mutfağa gönderildi.\n${printResult.message}`);
      } else {
        const message = printResult?.message ?? 'Mutfak fişi yazdırılamadı';
        setModalError(message);
        Alert.alert('Mutfak yazdırma', message);
      }
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSendingKitchen(false);
      setKitchenActionId(null);
    }
  };

  const handleKitchenItemReady = async (itemId: string) => {
    setKitchenActionId(itemId);
    try {
      await updateRestaurantKitchenItemStatus(itemId, 'ready');
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setKitchenActionId(null);
    }
  };

  const handleKitchenOrderReady = async (orderId: string) => {
    setKitchenActionId(orderId);
    try {
      await updateRestaurantKitchenOrderStatus(orderId, 'ready');
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setKitchenActionId(null);
    }
  };

  const handleCreateReservation = async () => {
    const customerName = reservationForm.customerName.trim();
    const guestCount = Number(reservationForm.guestCount.replace(',', '.'));
    if (!customerName) {
      setError('Rezervasyon için müşteri adı gerekli');
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(reservationForm.time.trim())) {
      setError('Rezervasyon saati HH:MM formatında olmalı');
      return;
    }
    if (!Number.isFinite(guestCount) || guestCount <= 0) {
      setError('Rezervasyon kişi sayısı geçersiz');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createRestaurantReservation({
        customerName,
        phone: reservationForm.phone,
        reservationDate: todayYmd(),
        reservationTime: reservationForm.time.trim(),
        guestCount,
        note: reservationForm.note,
      });
      setReservationForm((prev) => ({
        ...prev,
        customerName: '',
        phone: callerPhone || '',
        guestCount: '2',
        note: '',
      }));
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReservationStatus = async (
    reservationId: string,
    status: RestReservationStatus,
  ) => {
    setKitchenActionId(reservationId);
    try {
      await updateRestaurantReservationStatus(reservationId, status);
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setKitchenActionId(null);
    }
  };

  const legendBg = darkMode ? 'rgba(31,41,55,0.95)' : 'rgba(255,255,255,0.95)';
  const timelineRail = darkMode ? palette.gray700 : palette.gray200;

  const renderTableCard = ({ item }: { item: RestTable }) => {
    const cfg = getStatusConfig(item.status);
    const seats = Number(item.seats) || 0;
    return (
      <Pressable
        onPress={() => void openTable(item)}
        style={({ pressed }) => [
          styles.tableCard,
          {
            width: cardSize,
            height: cardSize,
            backgroundColor: cfg.bg,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <View style={styles.tableCardShine} />
        <View style={styles.tableCardTop}>
          <View style={styles.tablePill}>
            <Text style={styles.tablePillText}>{formatCompactTotal(item.total)}</Text>
          </View>
          {seats > 0 ? (
            <View style={styles.tablePill}>
              <Users size={10} color="#fff" />
              <Text style={styles.tablePillText}>{seats}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.tableCardMid}>
          <Text style={styles.tableName} numberOfLines={1}>
            {item.name || '—'}
          </Text>
          <View style={styles.tableStatusBadge}>
            <Text style={styles.tableStatusText}>{cfg.label}</Text>
          </View>
        </View>
        <View style={styles.tableCardBottom}>
          <Text style={styles.tableWaiter} numberOfLines={1}>
            {item.waiter || ' '}
          </Text>
          <Text style={styles.tableTotal}>{formatMoney(item.total)} ₺</Text>
        </View>
      </Pressable>
    );
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tables', label: `Masalar (${tables.length})` },
    { id: 'orders', label: `Adisyon (${orders.length})` },
    { id: 'schedule', label: `Bugün (${scheduleItems.length})` },
    { id: 'kitchen', label: `Mutfak (${kitchenOrders.length})` },
  ];

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Restoran"
        subtitle={
          callerPhone
            ? `Caller ID: ${callerPhone}`
            : 'Masalar, adisyon ve bugünkü akış'
        }
      />

      <SegmentTabBar
        layout="scroll"
        value={tab}
        onChange={setTab}
        items={tabs.map((t) => ({ id: t.id, label: t.label }))}
      />

      {tab === 'tables' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.legendScroll, { backgroundColor: legendBg, borderColor: colors.cardBorder }]}
          contentContainerStyle={styles.legendRow}
        >
          {TABLE_STATUS_LEGEND.map((s) => {
            const c = getStatusConfig(s);
            const n = statusCounts[s] || 0;
            return (
              <View key={s} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: c.bg }]} />
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700' }}>
                  {c.label}
                  {n > 0 ? ` (${n})` : ''}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'tables' ? (
        <FlatList
          data={tables}
          keyExtractor={(item) => String(item.id)}
          numColumns={COLS}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ soft: true })} />
          }
          ListEmptyComponent={<EmptyState message="Masa kaydı yok (rest şeması)" />}
          contentContainerStyle={{ padding: GRID_PAD, paddingBottom: 40 }}
          columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
          renderItem={renderTableCard}
        />
      ) : tab === 'orders' ? (
        <FlatList
          data={orders}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ soft: true })} />
          }
          ListEmptyComponent={<EmptyState message="Açık adisyon yok" />}
          contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const cfg = getStatusConfig(item.status === 'open' ? 'occupied' : item.status);
            return (
              <Pressable
                onPress={() => void openOrder(item)}
                style={[
                  styles.orderCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    borderLeftColor: cfg.bg,
                  },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                    {item.order_no || item.id.slice(0, 8)} · {item.table_name || 'Masa'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.waiter || '—'} · {orderStatusLabel(item.status)}
                    {item.created_at ? ` · ${formatClock(item.created_at)}` : ''}
                  </Text>
                </View>
                <Text style={{ color: palette.blue600, fontWeight: '800' }}>
                  {formatMoney(item.total_amount)} ₺
                </Text>
              </Pressable>
            );
          }}
        />
      ) : tab === 'schedule' ? (
        <FlatList
          data={scheduleByHour}
          keyExtractor={([hour]) => hour}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ soft: true })} />
          }
          ListHeaderComponent={
            <View style={[styles.scheduleHeader, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
              <View style={styles.scheduleHeaderRow}>
                <Clock size={16} color={palette.blue600} />
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>
                  Bugün · {todayYmd()}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                {todayOrders.length} sipariş · {reservations.length} rezervasyon
              </Text>
              <View style={[styles.reservationForm, { borderColor: colors.cardBorder }]}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>
                  Hızlı rezervasyon
                </Text>
                <FormField
                  label="Müşteri"
                  value={reservationForm.customerName}
                  onChangeText={(customerName) => setReservationForm((p) => ({ ...p, customerName }))}
                  placeholder="Ad soyad"
                />
                <View style={styles.rowFields}>
                  <View style={{ flex: 1 }}>
                    <FormField
                      label="Telefon"
                      value={reservationForm.phone}
                      onChangeText={(phone) => setReservationForm((p) => ({ ...p, phone }))}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={{ width: 92 }}>
                    <FormField
                      label="Saat"
                      value={reservationForm.time}
                      onChangeText={(time) => setReservationForm((p) => ({ ...p, time }))}
                      placeholder="19:00"
                    />
                  </View>
                  <View style={{ width: 72 }}>
                    <FormField
                      label="Kişi"
                      value={reservationForm.guestCount}
                      onChangeText={(guestCount) => setReservationForm((p) => ({ ...p, guestCount }))}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <FormField
                  label="Not"
                  value={reservationForm.note}
                  onChangeText={(note) => setReservationForm((p) => ({ ...p, note }))}
                  placeholder="İsteğe bağlı"
                />
                <PrimaryButton
                  label="Rezervasyon ekle"
                  onPress={() => void handleCreateReservation()}
                  loading={saving}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState message="Bugün için sipariş veya rezervasyon yok" />
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          renderItem={({ item: [hour, rows] }) => (
            <View style={styles.hourBlock}>
              <View style={styles.hourLabelRow}>
                <View style={[styles.hourDot, { backgroundColor: palette.blue600 }]} />
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>{hour}</Text>
                <View style={[styles.hourLine, { backgroundColor: timelineRail }]} />
              </View>
              {rows.map((row) => {
                const isRes = row.kind === 'reservation';
                const reservation = row.reservation;
                const accent = isRes ? palette.amber500 : getStatusConfig(row.status === 'open' ? 'occupied' : row.status).bg;
                return (
                  <Pressable
                    key={row.id}
                    disabled={!row.order}
                    onPress={() => row.order && void openOrder(row.order)}
                    style={[
                      styles.timelineCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.cardBorder,
                        borderLeftColor: accent,
                      },
                    ]}
                  >
                    <View style={styles.timelineTimeCol}>
                      <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 12 }}>
                        {row.time}
                      </Text>
                      <Text style={{ color: colors.textSubtle, fontSize: 9, fontWeight: '700', marginTop: 2 }}>
                        {isRes ? 'REZ' : 'SİP'}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>
                        {row.title}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
                        {row.subtitle}
                      </Text>
                      {reservation ? (
                        <View style={styles.resStatusRow}>
                          {[
                            ['confirmed', 'Onayla'],
                            ['seated', 'Oturdu'],
                            ['cancelled', 'İptal'],
                          ].map(([status, label]) => (
                            <Pressable
                              key={status}
                              disabled={kitchenActionId === reservation.id}
                              onPress={() =>
                                void handleReservationStatus(
                                  reservation.id,
                                  status as RestReservationStatus,
                                )
                              }
                              style={[
                                styles.smallAction,
                                {
                                  borderColor: colors.cardBorder,
                                  backgroundColor:
                                    reservation?.status === status
                                      ? palette.blue600
                                      : colors.backgroundAlt,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color:
                                    reservation?.status === status
                                      ? palette.white
                                      : colors.textMuted,
                                  fontSize: 10,
                                  fontWeight: '800',
                                }}
                              >
                                {label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                    {row.amount != null ? (
                      <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 12 }}>
                        {formatMoney(row.amount)} ₺
                      </Text>
                    ) : (
                      <Users size={14} color={colors.textMuted} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={kitchenOrders}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ soft: true })} />
          }
          ListEmptyComponent={<EmptyState message="Aktif mutfak fişi yok" />}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const kitchenCfg = getStatusConfig('kitchen');
            const allReady = item.items.length > 0 && item.items.every((it) => {
              const s = String(it.status || '').toLowerCase();
              return s === 'ready' || s === 'served';
            });
            return (
              <View
                style={[
                  styles.kitchenCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.cardBorder,
                    borderLeftColor: kitchenCfg.bg,
                  },
                ]}
              >
                <View style={styles.kitchenHeaderRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.text, fontWeight: '900' }} numberOfLines={1}>
                      {item.table_number || 'Masa'} · {kitchenStatusLabel(item.status)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      {item.waiter || '—'}
                      {item.sent_at ? ` · ${formatClock(item.sent_at)}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    disabled={allReady || kitchenActionId === item.id}
                    onPress={() => void handleKitchenOrderReady(item.id)}
                    style={[
                      styles.readyButton,
                      {
                        backgroundColor: allReady ? palette.green600 : kitchenCfg.bg,
                        opacity: kitchenActionId === item.id ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text style={styles.readyButtonText}>
                      {allReady ? 'Hazır' : 'Tümünü hazırla'}
                    </Text>
                  </Pressable>
                </View>
                {item.items.map((ki) => {
                  const s = String(ki.status || 'new').toLowerCase();
                  const isReady = s === 'ready' || s === 'served';
                  return (
                    <View
                      key={ki.id}
                      style={[
                        styles.kitchenItemRow,
                        { borderColor: colors.cardBorder, backgroundColor: colors.backgroundAlt },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={2}>
                          {ki.product_name}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                          {ki.quantity} adet · {kitchenStatusLabel(ki.status)}
                          {ki.preparation_time ? ` · ${ki.preparation_time} dk` : ''}
                        </Text>
                      </View>
                      <Pressable
                        disabled={isReady || kitchenActionId === ki.id}
                        onPress={() => void handleKitchenItemReady(ki.id)}
                        style={[
                          styles.smallAction,
                          {
                            backgroundColor: isReady ? palette.green600 : colors.card,
                            borderColor: isReady ? palette.green600 : kitchenCfg.bg,
                            opacity: kitchenActionId === ki.id ? 0.6 : 1,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: isReady ? palette.white : kitchenCfg.bg,
                            fontSize: 10,
                            fontWeight: '900',
                          }}
                        >
                          {isReady ? 'Hazır' : 'Hazırla'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            );
          }}
        />
      )}

      <Modal visible={!!selectedTable} animationType="slide" onRequestClose={closeModal}>
        <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background }]} edges={['bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
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
                    {orderDetail?.status ? ` · ${orderStatusLabel(orderDetail.status)}` : ''}
                  </Text>
                </View>
                <View
                  style={[
                    styles.headerStatusChip,
                    { backgroundColor: getStatusConfig(selectedTable?.status).bg },
                  ]}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                    {getStatusConfig(selectedTable?.status).label}
                  </Text>
                </View>
              </View>
            </GradientHeader>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.modalBody}
              keyboardShouldPersistTaps="handled"
            >
              {modalError ? (
                <ErrorBanner message={modalError} onRetry={() => setModalError(null)} />
              ) : null}
              {orderLoading ? (
                <ActivityIndicator color={palette.blue600} style={{ marginTop: 24 }} />
              ) : orderDetail ? (
                <>
                  <View
                    style={[
                      styles.totalHero,
                      { backgroundColor: colors.card, borderColor: colors.cardBorder },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>
                        TOPLAM
                      </Text>
                      <Text style={{ color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 2 }}>
                        {formatMoney(orderDetail.total_amount)} ₺
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={styles.metaChip}>
                        <Utensils size={12} color={palette.blue600} />
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                          {orderDetail.items.length} kalem
                        </Text>
                      </View>
                      {orderDetail.waiter ? (
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{orderDetail.waiter}</Text>
                      ) : null}
                    </View>
                  </View>

                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Kalemler</Text>
                  {orderDetail.items.length === 0 ? (
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Henüz kalem yok</Text>
                  ) : (
                    orderDetail.items.map((it) => (
                      <View
                        key={it.id}
                        style={[
                          styles.itemRow,
                          { borderColor: colors.cardBorder, backgroundColor: colors.card },
                        ]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={2}>
                            {it.product_name}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                            {kitchenStatusLabel(it.status)}
                            {it.sent_to_kitchen_at ? ` · ${formatClock(it.sent_to_kitchen_at)}` : ''}
                          </Text>
                        </View>
                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                          {it.quantity} × {formatMoney(it.unit_price)}
                        </Text>
                        <Text style={{ color: palette.blue600, fontWeight: '700', marginLeft: 8 }}>
                          {formatMoney(it.subtotal)} ₺
                        </Text>
                      </View>
                    ))
                  )}

                  {isOrderOpen(orderDetail.status) ? (
                    <>
                      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 16 }]}>
                        Kalem ekle
                      </Text>
                      <FormField
                        label="Ürün ara"
                        value={menuSearch}
                        onChangeText={setMenuSearch}
                        placeholder="Menüde ara"
                        hintRight={menuLoading ? 'Yükleniyor' : `${menuItems.length} ürün`}
                      />
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.menuPickerRow}
                      >
                        {menuItems.map((mi) => {
                          const selected = selectedMenuItem?.id === mi.id;
                          return (
                            <Pressable
                              key={mi.id}
                              onPress={() => selectMenuItem(mi)}
                              style={[
                                styles.menuChip,
                                {
                                  backgroundColor: selected ? palette.blue600 : colors.card,
                                  borderColor: selected ? palette.blue600 : colors.cardBorder,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color: selected ? palette.white : colors.text,
                                  fontWeight: '800',
                                  fontSize: 12,
                                }}
                                numberOfLines={1}
                              >
                                {mi.name}
                              </Text>
                              <Text
                                style={{
                                  color: selected ? palette.blue100 : colors.textMuted,
                                  fontSize: 10,
                                  marginTop: 2,
                                }}
                                numberOfLines={1}
                              >
                                {mi.category} · {formatMoney(mi.price)} ₺
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                      <FormField
                        label="Ürün adı"
                        value={itemName}
                        onChangeText={setItemName}
                        placeholder="Örn. Izgara köfte"
                      />
                      <View style={styles.rowFields}>
                        <View style={{ flex: 1 }}>
                          <FormField
                            label="Miktar"
                            value={itemQty}
                            onChangeText={setItemQty}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <FormField
                            label="Birim fiyat"
                            value={itemPrice}
                            onChangeText={setItemPrice}
                            keyboardType="decimal-pad"
                          />
                        </View>
                      </View>
                      <PrimaryButton
                        label="Kalem ekle"
                        onPress={() => void handleAddItem()}
                        loading={saving}
                      />
                    </>
                  ) : (
                    <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 12 }}>
                      Adisyon kapalı ({orderDetail.status})
                    </Text>
                  )}
                </>
              ) : (
                <View
                  style={[
                    styles.emptyOrderBox,
                    { backgroundColor: colors.card, borderColor: colors.cardBorder },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 6 }}>
                    Açık adisyon yok
                  </Text>
                  <Text style={{ color: colors.textMuted, marginBottom: 16, fontSize: 13 }}>
                    Bu masada yeni adisyon açabilirsiniz.
                  </Text>
                  <PrimaryButton
                    label="Adisyon aç"
                    onPress={() => void handleCreateOrder()}
                    loading={saving}
                  />
                </View>
              )}
            </ScrollView>

            {orderDetail && isOrderOpen(orderDetail.status) ? (
              <View
                style={[
                  styles.payFooter,
                  {
                    backgroundColor: colors.card,
                    borderTopColor: colors.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>
                  Ödeme / kapat
                </Text>
                <View style={styles.kitchenLangBlock}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}>
                    Mutfak fişi dili
                  </Text>
                  <View style={styles.payRow}>
                    {KITCHEN_LANGS.map((lang) => (
                      <Pressable
                        key={lang.code}
                        onPress={() => setKitchenLocale(lang.code)}
                        style={[
                          styles.langChip,
                          {
                            backgroundColor:
                              kitchenLocale === lang.code ? palette.blue600 : colors.backgroundAlt,
                            borderColor: colors.cardBorder,
                          },
                        ]}
                      >
                        <Text
                          style={{
                            color: kitchenLocale === lang.code ? palette.white : colors.text,
                            fontSize: 11,
                            fontWeight: '900',
                          }}
                        >
                          {lang.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <PrimaryButton
                  label={`Mutfağa gönder + yazdır (${pendingKitchenCount})`}
                  onPress={() => void handleSendToKitchen()}
                  loading={sendingKitchen}
                  disabled={pendingKitchenCount === 0}
                />
                <View style={styles.payRow}>
                  {PAY_METHODS.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setPayMethod(m.id)}
                      style={[
                        styles.payChip,
                        {
                          backgroundColor: payMethod === m.id ? palette.blue600 : colors.backgroundAlt,
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
              </View>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  legendScroll: {
    maxHeight: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  tableCard: {
    borderRadius: 16,
    padding: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'space-between',
  },
  tableCardShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tableCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  tablePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tablePillText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  tableCardMid: { alignItems: 'center', zIndex: 1, flex: 1, justifyContent: 'center' },
  tableName: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  tableStatusBadge: {
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  tableStatusText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 1,
  },
  tableWaiter: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '600', flex: 1 },
  tableTotal: { color: '#fff', fontSize: 10, fontWeight: '800' },
  orderCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scheduleHeader: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  scheduleHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hourBlock: { marginBottom: 14 },
  hourLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  hourDot: { width: 8, height: 8, borderRadius: 4 },
  hourLine: { flex: 1, height: StyleSheet.hairlineWidth },
  timelineCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    marginLeft: 4,
  },
  timelineTimeCol: { width: 44, alignItems: 'center' },
  reservationForm: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
    gap: 8,
  },
  resStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  kitchenCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  kitchenHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kitchenItemRow: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readyButton: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
  },
  readyButtonText: { color: palette.white, fontSize: 10, fontWeight: '900' },
  modalRoot: { flex: 1 },
  modalBody: { padding: 16, gap: 10, paddingBottom: 24 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 2 },
  headerStatusChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  totalHero: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginTop: 8, marginBottom: 4 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    gap: 8,
  },
  menuPickerRow: { gap: 8, paddingVertical: 4 },
  menuChip: {
    width: 150,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  smallAction: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  rowFields: { flexDirection: 'row', gap: 8 },
  emptyOrderBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  payFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },
  payRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  kitchenLangBlock: { gap: 6 },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  payChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
