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
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Clock,
  Users,
  Utensils,
  ChefHat,
  Bike,
  ShoppingBag,
  ShoppingCart,
  CalendarDays,
  BarChart3,
  Plus,
  LayoutGrid,
  Settings,
  Building2,
} from 'lucide-react-native';
import { GradientHeader, HeaderIconButton } from '../components/GradientHeader';
import { ScreenHeader, EmptyState, ErrorBanner } from '../components/ScreenChrome';
import { SegmentTabBar } from '../components/SegmentTabBar';
import { FormField } from '../components/FormField';
import { PrimaryButton } from '../components/PrimaryButton';
import {
  fetchRestaurantTables,
  fetchRestaurantFloors,
  fetchOpenOrders,
  fetchTodayOrders,
  fetchReservationsForDate,
  getActiveOrderForTable,
  getOrderDetailById,
  createRestaurantOrder,
  createRetailOrder,
  addRestaurantOrderItem,
  fetchRestaurantMenuItems,
  sendRestaurantItemsToKitchen,
  fetchActiveKitchenOrders,
  updateRestaurantKitchenItemStatus,
  updateRestaurantKitchenOrderStatus,
  createRestaurantReservation,
  updateRestaurantReservationStatus,
  completeTablePayment,
  voidRestaurantOrderItem,
  removeRestaurantOrderItem,
  markRestaurantItemComplimentary,
  updateRestaurantOrderItemNote,
  updateOpenOrderDiscountPct,
  transferRestaurantTable,
  updateRestaurantTableStatus,
  fetchDeliveryOrders,
  createDeliveryOrder,
  updateDeliveryStatus,
  fetchTakeawayOrders,
  createTakeawayOrder,
  updateTakeawayStatus,
  type RestPaymentMethod,
  type RestTable,
  type RestFloor,
  type RestOrder,
  type RestOrderDetail,
  type RestReservation,
  type RestReservationStatus,
  type RestMenuItem,
  type RestKitchenOrder,
  type RestDeliveryOrder,
  type RestDeliveryStatus,
  type RestTakeawayOrder,
  type RestTakeawayStatus,
} from '../api/restaurantApi';
import { RestaurantDeliveryPanel } from '../components/RestaurantDeliveryPanel';
import { RestaurantTakeawayPanel } from '../components/RestaurantTakeawayPanel';
import { RestaurantMenuCatalog } from '../components/RestaurantMenuCatalog';
import { formatMoney } from '../api/erpTables';
import { useThemeStore } from '../store/themeStore';
import { useOrgEpoch } from '../hooks/useOrgEpoch';
import { useDeviceLayout } from '../hooks/useDeviceLayout';
import { SplitPane } from '../components/Layout/SplitPane';
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
import { useTranslation } from 'react-i18next';

type Tab =
  | 'dashboard'
  | 'tables'
  | 'orders'
  | 'delivery'
  | 'takeaway'
  | 'schedule'
  | 'kitchen'
  | 'reports';
type KitchenFilter = 'all' | 'new' | 'cooking' | 'ready';
/** Adisyon modalı — flat tab’lar (Sipariş / Ödeme / Liste) */
type OrderSheetTab = 'order' | 'pay' | 'list';
type Props = NativeStackScreenProps<MainStackParamList, 'Restaurant'>;

const COLS = 3;
const COLS_LANDSCAPE_TABLET = 6;
const GRID_GAP = 8;
const GRID_PAD = 12;

/** Sanal masa — perakende POS (DB table_id null) */
const RETAIL_POS_TABLE: RestTable = {
  id: '__retail__',
  name: 'Perakende',
  status: 'occupied',
  waiter: null,
  total: 0,
  floor_id: null,
};

function isRetailPosTable(table: RestTable | null | undefined): boolean {
  return !!table && (table.id === RETAIL_POS_TABLE.id || !table.id);
}

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

function reservationStatusLabel(status: string | null | undefined, t: (key: string) => string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return t('restaurant.status.reservation.pending');
  if (s === 'confirmed') return t('restaurant.status.reservation.confirmed');
  if (s === 'seated') return t('restaurant.status.reservation.seated');
  if (s === 'cancelled') return t('restaurant.status.reservation.cancelled');
  if (s === 'noshow' || s === 'no_show') return t('restaurant.status.reservation.noShow');
  return status || '—';
}

function orderStatusLabel(status: string | null | undefined, t: (key: string) => string): string {
  const s = String(status || '').toLowerCase();
  if (s === 'open') return t('restaurant.status.order.open');
  if (s === 'closed' || s === 'kapatildi') return t('restaurant.status.order.closed');
  if (s === 'cancelled') return t('restaurant.status.order.cancelled');
  return getStatusConfig(status).label;
}

function kitchenStatusLabel(status: string | null | undefined, t: (key: string) => string): string {
  const s = String(status || '').toLowerCase();
  if (!s || s === 'new' || s === 'pending') return t('restaurant.status.kitchen.pending');
  if (s === 'cooking') return t('restaurant.status.kitchen.cooking');
  if (s === 'ready') return t('restaurant.status.kitchen.ready');
  if (s === 'served') return t('restaurant.status.kitchen.served');
  if (s === 'cancelled') return t('restaurant.status.kitchen.cancelled');
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

export function RestaurantScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { colors, darkMode } = useThemeStore();
  const { width } = useWindowDimensions();
  const { isLandscapeTablet } = useDeviceLayout();
  const initialTab = route.params?.initialTab ?? 'dashboard';
  const callerPhone = route.params?.callerPhone?.trim() || '';
  const [tab, setTab] = useState<Tab>(
    initialTab === 'reports' || initialTab === 'retail' ? 'dashboard' : initialTab,
  );
  const [tables, setTables] = useState<RestTable[]>([]);
  const [floors, setFloors] = useState<RestFloor[]>([]);
  const [orders, setOrders] = useState<RestOrder[]>([]);
  const [todayOrders, setTodayOrders] = useState<RestOrder[]>([]);
  const [reservations, setReservations] = useState<RestReservation[]>([]);
  const [kitchenOrders, setKitchenOrders] = useState<RestKitchenOrder[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<RestDeliveryOrder[]>([]);
  const [takeawayOrders, setTakeawayOrders] = useState<RestTakeawayOrder[]>([]);
  const [menuItems, setMenuItems] = useState<RestMenuItem[]>([]);
  const [menuSearch, setMenuSearch] = useState('');
  const [menuLoading, setMenuLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTable, setSelectedTable] = useState<RestTable | null>(null);
  const [isRetailPos, setIsRetailPos] = useState(false);
  const [orderDetail, setOrderDetail] = useState<RestOrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderSheetTab, setOrderSheetTab] = useState<OrderSheetTab>('order');
  const [selectedMenuItem, setSelectedMenuItem] = useState<RestMenuItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemQty, setItemQty] = useState('1');
  const [itemPrice, setItemPrice] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [discountPct, setDiscountPct] = useState('0');
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [quickAddingId, setQuickAddingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [sendingKitchen, setSendingKitchen] = useState(false);
  const [kitchenActionId, setKitchenActionId] = useState<string | null>(null);
  const [kitchenFilter, setKitchenFilter] = useState<KitchenFilter>('all');
  const [floorFilter, setFloorFilter] = useState<string | 'all'>('all');
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
    { id: 'cash', label: t('restaurant.payMethods.cash') },
    { id: 'card', label: t('restaurant.payMethods.card') },
    { id: 'veresiye', label: t('restaurant.payMethods.credit') },
  ];

  const cardSize = useMemo(() => {
    const effectiveCols = isLandscapeTablet ? COLS_LANDSCAPE_TABLET : COLS;
    const usable = width - GRID_PAD * 2 - GRID_GAP * (effectiveCols - 1);
    return Math.floor(usable / effectiveCols);
  }, [width, isLandscapeTablet]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<TableStatus, number>> = {};
    for (const t of tables) {
      const st = normalizeTableStatus(t.status);
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [tables]);

  /** Gastro tarzı KPI — açık masa / sipariş / mutfak / bugün ciro */
  const gastroKpis = useMemo(() => {
    const openTables = tables.filter((t) => {
      const st = normalizeTableStatus(t.status);
      return st === 'occupied' || st === 'kitchen' || st === 'served' || st === 'billing';
    }).length;
    const kitchenPending = kitchenOrders.filter((k) => {
      const s = String(k.status || '').toLowerCase();
      return s !== 'ready' && s !== 'served' && s !== 'cancelled' && s !== 'closed';
    }).length;
    const todayRevenue = todayOrders.reduce(
      (sum, o) => sum + (Number(o.total_amount) || 0),
      0,
    );
    return {
      openTables,
      openOrders: orders.length,
      kitchenPending,
      todayRevenue,
    };
  }, [tables, orders, kitchenOrders, todayOrders]);

  const scheduleItems = useMemo((): ScheduleItem[] => {
    const items: ScheduleItem[] = [];
    for (const o of todayOrders) {
      items.push({
        id: `o-${o.id}`,
        kind: 'order',
        time: formatClock(o.created_at),
        title: o.table_name || t('restaurant.table.defaultName'),
        subtitle: `${o.order_no || o.id.slice(0, 8)} · ${orderStatusLabel(o.status, t)}`,
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
        subtitle: `${r.guest_count} ${t('restaurant.schedule.form.guests')} · ${reservationStatusLabel(r.status, t)}${
          r.table_name ? ` · ${t('restaurant.table.tableTag', { name: r.table_name })}` : ''
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

  const floorTabs = useMemo(() => {
    const byId = new Map(floors.map((f) => [f.id, f]));
    const ids = new Set<string>();
    for (const t of tables) {
      if (t.floor_id) ids.add(t.floor_id);
    }
    for (const f of floors) ids.add(f.id);
    const ordered = Array.from(ids).sort((a, b) => {
      const fa = byId.get(a);
      const fb = byId.get(b);
      const oa = fa?.display_order ?? 9999;
      const ob = fb?.display_order ?? 9999;
      if (oa !== ob) return oa - ob;
      const na = fa?.name || a;
      const nb = fb?.name || b;
      return na.localeCompare(nb, 'tr');
    });
    return ordered.map((id, idx) => {
      const floor = byId.get(id);
      const count = tables.filter((t) => t.floor_id === id).length;
      return {
        id,
        label: floor?.name?.trim() || t('restaurant.floor.fallback', { index: idx + 1 }),
        count,
      };
    });
  }, [tables, floors, t]);

  const filteredTables = useMemo(() => {
    if (floorFilter === 'all' || floorTabs.length === 0) return tables;
    return tables.filter((t) => t.floor_id === floorFilter);
  }, [tables, floorFilter, floorTabs.length]);

  const filteredKitchenOrders = useMemo(() => {
    if (kitchenFilter === 'all') return kitchenOrders;
    return kitchenOrders.filter((o) => {
      const s = String(o.status || '').toLowerCase();
      if (kitchenFilter === 'new') return !s || s === 'new' || s === 'pending';
      return s === kitchenFilter;
    });
  }, [kitchenOrders, kitchenFilter]);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (opts?.soft) setRefreshing(true);
    else setError(null);
    try {
      const date = todayYmd();
      const [t, fl, o, todays, res, kitchen, delivery, takeaway] = await Promise.all([
        fetchRestaurantTables(),
        fetchRestaurantFloors(),
        fetchOpenOrders(),
        fetchTodayOrders(),
        fetchReservationsForDate(date),
        fetchActiveKitchenOrders(),
        fetchDeliveryOrders(),
        fetchTakeawayOrders(),
      ]);
      setTables(t);
      setFloors(fl);
      setOrders(o);
      setTodayOrders(todays);
      setReservations(res);
      setKitchenOrders(kitchen);
      setDeliveryOrders(delivery);
      setTakeawayOrders(takeaway);
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

  /** Mutfak sekmesi odaktayken 5 sn otomatik yenileme (GastroPOS KDS) */
  useFocusEffect(
    useCallback(() => {
      if (tab !== 'kitchen') return undefined;
      const id = setInterval(() => {
        void load({ soft: true });
      }, 5000);
      return () => clearInterval(id);
    }, [tab, load]),
  );

  useEffect(() => {
    if (floorFilter !== 'all' && !floorTabs.some((f) => f.id === floorFilter)) {
      setFloorFilter('all');
    }
  }, [floorFilter, floorTabs]);

  useEffect(() => {
    if (callerPhone && !route.params?.initialTab) {
      setTab('orders');
    }
    if (callerPhone) {
      setReservationForm((prev) => ({ ...prev, phone: prev.phone || callerPhone }));
    }
  }, [callerPhone, route.params?.initialTab]);

  useEffect(() => {
    const next = route.params?.initialTab;
    if (!next) return;
    if (next === 'reports') {
      navigation.navigate('RestaurantReports');
      return;
    }
    if (next === 'retail') {
      setTab('dashboard');
      return;
    }
    setTab(next);
  }, [route.params?.initialTab, navigation]);

  const loadMenuItems = useCallback(async () => {
    setMenuLoading(true);
    try {
      setMenuItems(await fetchRestaurantMenuItems('', 250));
    } finally {
      setMenuLoading(false);
    }
  }, [orgEpoch]);

  useEffect(() => {
    void loadMenuItems();
  }, [loadMenuItems]);

  const resetItemForm = () => {
    setSelectedMenuItem(null);
    setItemName('');
    setItemQty('1');
    setItemPrice('');
    setItemNote('');
    setShowManualAdd(false);
  };

  const openTable = async (table: RestTable) => {
    setIsRetailPos(false);
    setSelectedTable(table);
    setOrderDetail(null);
    setModalError(null);
    setMoveTargetId(null);
    setOrderSheetTab('order');
    setKitchenLocale(resolveKitchenTicketLocale());
    resetItemForm();
    setOrderLoading(true);
    try {
      const detail = await getActiveOrderForTable(table.id);
      setOrderDetail(detail);
      setDiscountPct(String(detail?.order_discount_pct ?? 0));
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrderLoading(false);
    }
  };

  /** Masasız perakende satış — Gastro retail POS */
  const openRetailPos = async () => {
    setIsRetailPos(true);
    setSelectedTable(RETAIL_POS_TABLE);
    setOrderDetail(null);
    setModalError(null);
    setMoveTargetId(null);
    setOrderSheetTab('order');
    setKitchenLocale(resolveKitchenTicketLocale());
    resetItemForm();
    setOrderLoading(true);
    try {
      const created = await createRetailOrder();
      const detail = await getOrderDetailById(created.id);
      setOrderDetail(
        detail
          ? { ...detail, table_name: detail.table_name || 'Perakende' }
          : ({
              ...created,
              table_name: 'Perakende',
              items: [],
            } as RestOrderDetail),
      );
      setDiscountPct('0');
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrderLoading(false);
    }
  };

  useEffect(() => {
    if (route.params?.initialTab !== 'retail') return;
    void openRetailPos();
    // Yalnızca menüden perakende ile gelince bir kez
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.initialTab]);

  const openOrder = async (order: RestOrder) => {
    const retail =
      !order.table_id ||
      String(order.order_no || '').startsWith('RTL-') ||
      (typeof order.note === 'string' && order.note.includes('"type":"retail"'));
    setIsRetailPos(retail);
    const tbl = retail
      ? RETAIL_POS_TABLE
      : tables.find((t) => t.id === order.table_id) ||
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
    setMoveTargetId(null);
    setOrderSheetTab('order');
    setKitchenLocale(resolveKitchenTicketLocale());
    resetItemForm();
    setOrderLoading(true);
    try {
      const detail = await getOrderDetailById(order.id);
      setOrderDetail(
        detail && retail
          ? { ...detail, table_name: detail.table_name || 'Perakende' }
          : detail,
      );
      setDiscountPct(String(detail?.order_discount_pct ?? 0));
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setOrderLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedTable(null);
    setIsRetailPos(false);
    setOrderDetail(null);
    setModalError(null);
    setPayMethod('cash');
    setDiscountPct('0');
    setMoveTargetId(null);
    setOrderSheetTab('order');
    setQuickAddingId(null);
    resetItemForm();
  };

  const linesSubtotal = useMemo(() => {
    if (!orderDetail?.items?.length) return Number(orderDetail?.total_amount) || 0;
    return orderDetail.items.reduce((sum, it) => sum + (Number(it.subtotal) || 0), 0);
  }, [orderDetail]);

  const discountPctNum = useMemo(
    () => Math.min(100, Math.max(0, Number(String(discountPct).replace(',', '.')) || 0)),
    [discountPct],
  );

  const discountAmountPreview = useMemo(() => {
    const base = linesSubtotal || Number(orderDetail?.total_amount) || 0;
    return discountPctNum > 0 ? base * (discountPctNum / 100) : 0;
  }, [linesSubtotal, orderDetail?.total_amount, discountPctNum]);

  const payableTotal = useMemo(() => {
    if (!orderDetail) return 0;
    const base = linesSubtotal || Number(orderDetail.total_amount) || 0;
    return Math.max(0, base * (1 - discountPctNum / 100));
  }, [orderDetail, linesSubtotal, discountPctNum]);

  const emptyTablesForMove = useMemo(
    () =>
      tables.filter((t) => {
        const st = normalizeTableStatus(t.status);
        return t.id !== selectedTable?.id && st === 'empty';
      }),
    [tables, selectedTable?.id],
  );

  const isOrderOpen = (status: string | null | undefined) => {
    const s = String(status || '').toLowerCase();
    return s !== 'closed' && s !== 'cancelled' && s !== 'kapatildi';
  };

  const handlePayment = () => {
    if (!selectedTable || !orderDetail?.id) return;
    if (!isOrderOpen(orderDetail.status)) {
      setModalError(t('restaurant.alerts.orderClosed'));
      return;
    }
    const methodLabel = PAY_METHODS.find((m) => m.id === payMethod)?.label || payMethod;
    const pct = Math.min(100, Math.max(0, Number(String(discountPct).replace(',', '.')) || 0));
    Alert.alert(
      t('restaurant.alerts.payTitle'),
      pct > 0
        ? t('restaurant.alerts.payBody', { total: formatMoney(payableTotal), method: methodLabel, pct })
        : t('restaurant.alerts.payBodyNoDiscount', { total: formatMoney(payableTotal), method: methodLabel }),
      [
        { text: t('restaurant.alerts.payCancel'), style: 'cancel' },
        {
          text: t('restaurant.alerts.payConfirm'),
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
      const pct = Math.min(100, Math.max(0, Number(String(discountPct).replace(',', '.')) || 0));
      if (pct > 0) {
        await updateOpenOrderDiscountPct(orderDetail.id, pct);
      }
      const base = linesSubtotal || Number(orderDetail.total_amount) || 0;
      const discountAmount = pct > 0 ? base * (pct / 100) : 0;
      const retail = isRetailPos || isRetailPosTable(selectedTable);
      await completeTablePayment({
        tableId: retail ? null : selectedTable.id,
        orderId: orderDetail.id,
        paymentMethod: payMethod,
        discountAmount,
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
    const oid = orderId || (isRetailPos || tableId === RETAIL_POS_TABLE.id ? orderDetail?.id : undefined);
    const detail = oid
      ? await getOrderDetailById(oid)
      : await getActiveOrderForTable(tableId);
    if (detail && (isRetailPos || !detail.table_id)) {
      setOrderDetail({ ...detail, table_name: detail.table_name || 'Perakende' });
    } else {
      setOrderDetail(detail);
    }
    await load({ soft: true });
  };

  const handleCreateOrder = async () => {
    if (!selectedTable) return;
    setSaving(true);
    setModalError(null);
    try {
      if (isRetailPos || isRetailPosTable(selectedTable)) {
        const created = await createRetailOrder();
        await refreshOrder(RETAIL_POS_TABLE.id, created.id);
      } else {
        await createRestaurantOrder({
          tableId: selectedTable.id,
          floorId: selectedTable.floor_id,
        });
        await refreshOrder(selectedTable.id);
      }
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
      setModalError(t('restaurant.alerts.needProductName'));
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setModalError(t('restaurant.alerts.needQty'));
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setModalError(t('restaurant.alerts.needPrice'));
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
      if (itemNote.trim()) {
        const detail = await getOrderDetailById(oid);
        const last = detail?.items[detail.items.length - 1];
        if (last?.id) {
          await updateRestaurantOrderItemNote(last.id, itemNote.trim());
        }
      }
      resetItemForm();
      if (selectedTable) await refreshOrder(selectedTable.id, oid);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleVoidItem = (itemId: string, productName: string) => {
    Alert.alert(t('restaurant.alerts.voidTitle'), t('restaurant.alerts.voidBody', { name: productName }), [
      { text: t('restaurant.alerts.voidCancel'), style: 'cancel' },
      {
        text: t('restaurant.alerts.voidConfirm'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            if (!selectedTable || !orderDetail?.id) return;
            setSaving(true);
            setModalError(null);
            try {
              await voidRestaurantOrderItem(itemId, 'Mobil iptal');
              await refreshOrder(selectedTable.id, orderDetail.id);
            } catch (e) {
              setModalError(e instanceof Error ? e.message : String(e));
            } finally {
              setSaving(false);
            }
          })(),
      },
    ]);
  };

  const handleRemoveItem = (itemId: string) => {
    void (async () => {
      if (!selectedTable || !orderDetail?.id) return;
      setSaving(true);
      setModalError(null);
      try {
        await removeRestaurantOrderItem(itemId);
        await refreshOrder(selectedTable.id, orderDetail.id);
      } catch (e) {
        setModalError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    })();
  };

  const handleComplimentary = (itemId: string) => {
    void (async () => {
      if (!selectedTable || !orderDetail?.id) return;
      setSaving(true);
      setModalError(null);
      try {
        await markRestaurantItemComplimentary(itemId);
        await refreshOrder(selectedTable.id, orderDetail.id);
      } catch (e) {
        setModalError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    })();
  };

  const handleSaveDiscount = async () => {
    if (!orderDetail?.id || !selectedTable) return;
    const pct = Number(String(discountPct).replace(',', '.'));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setModalError(t('restaurant.alerts.discountRange'));
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await updateOpenOrderDiscountPct(orderDetail.id, pct);
      await refreshOrder(selectedTable.id, orderDetail.id);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleMoveTable = async () => {
    if (!selectedTable || !moveTargetId) {
      setModalError(t('restaurant.alerts.needMoveTarget'));
      return;
    }
    setSaving(true);
    setModalError(null);
    try {
      await transferRestaurantTable(selectedTable.id, moveTargetId);
      closeModal();
      await load({ soft: true });
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkTableCleaning = async () => {
    if (!selectedTable) return;
    setSaving(true);
    setModalError(null);
    try {
      await updateRestaurantTableStatus(selectedTable.id, 'cleaning');
      closeModal();
      await load({ soft: true });
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkTableEmpty = async () => {
    if (!selectedTable) return;
    setSaving(true);
    setModalError(null);
    try {
      await updateRestaurantTableStatus(selectedTable.id, 'empty');
      closeModal();
      await load({ soft: true });
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDelivery = async (params: {
    customerName: string;
    phone: string;
    address: string;
    itemsSummary?: string;
    totalAmount?: number;
    expectedPaymentMethod?: 'cash' | 'card' | 'transfer';
    channel?: string;
    externalOrderId?: string;
  }) => {
    setSaving(true);
    setError(null);
    try {
      await createDeliveryOrder(params);
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleDeliveryStatus = async (orderId: string, status: RestDeliveryStatus) => {
    setKitchenActionId(orderId);
    setError(null);
    try {
      await updateDeliveryStatus(orderId, status);
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setKitchenActionId(null);
    }
  };

  const handleCreateTakeaway = async (params: { customerName: string; phone: string }) => {
    setSaving(true);
    setError(null);
    try {
      await createTakeawayOrder(params);
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleTakeawayStatus = async (orderId: string, status: RestTakeawayStatus) => {
    setKitchenActionId(orderId);
    setError(null);
    try {
      await updateTakeawayStatus(orderId, status);
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setKitchenActionId(null);
    }
  };

  const selectMenuItem = (item: RestMenuItem) => {
    setSelectedMenuItem(item);
    setItemName(item.name);
    setItemPrice(String(item.price));
    setModalError(null);
  };

  /** Tek dokunuş: menü ürününü 1 adet sepete ekle (sipariş odaklı) */
  const handleQuickAddMenuItem = async (item: RestMenuItem) => {
    if (!orderDetail?.id || !selectedTable) return;
    if (!isOrderOpen(orderDetail.status)) {
      setModalError(t('restaurant.alerts.orderAlreadyClosed'));
      return;
    }
    setQuickAddingId(item.id);
    setModalError(null);
    try {
      const oid = orderDetail.id;
      await addRestaurantOrderItem(oid, {
        productName: item.name,
        quantity: 1,
        unitPrice: Number(item.price) || 0,
        productId: item.id,
      });
      await refreshOrder(selectedTable.id, oid);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : String(e));
    } finally {
      setQuickAddingId(null);
    }
  };

  const handleSendToKitchen = async () => {
    if (!orderDetail?.id || !selectedTable) return;
    if (pendingKitchenCount === 0) {
      setModalError(t('restaurant.alerts.noKitchenPending'));
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
        setModalError(t('restaurant.alerts.noKitchenNew'));
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
          t('restaurant.alerts.kitchenOk'),
          t('restaurant.alerts.kitchenOkBody', {
            count: result.sentItemCount,
            queue: queueResult?.jobCount ?? 0,
          }),
        );
      } else if (printResult?.ok) {
        Alert.alert(
          t('restaurant.alerts.kitchenOk'),
          t('restaurant.alerts.kitchenOkPrintBody', {
            count: result.sentItemCount,
            message: printResult.message,
          }),
        );
      } else {
        const message = printResult?.message ?? t('restaurant.alerts.kitchenPrintFailDefault');
        setModalError(message);
        Alert.alert(t('restaurant.alerts.kitchenPrintFailTitle'), message);
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
      setError(t('restaurant.alerts.needReservationCustomer'));
      return;
    }
    if (!/^\d{1,2}:\d{2}$/.test(reservationForm.time.trim())) {
      setError(t('restaurant.alerts.reservationTimeFormat'));
      return;
    }
    if (!Number.isFinite(guestCount) || guestCount <= 0) {
      setError(t('restaurant.alerts.reservationGuestsInvalid'));
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
          <Text style={styles.tableTotal}>{formatMoney(item.total)}</Text>
        </View>
      </Pressable>
    );
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: t('restaurant.tabs.dashboard') },
    { id: 'tables', label: t('restaurant.tabs.tables', { count: tables.length }) },
    { id: 'orders', label: t('restaurant.tabs.orders', { count: orders.length }) },
    { id: 'delivery', label: t('restaurant.tabs.delivery', { count: deliveryOrders.length }) },
    { id: 'takeaway', label: t('restaurant.tabs.takeaway', { count: takeawayOrders.length }) },
    { id: 'schedule', label: t('restaurant.tabs.schedule', { count: scheduleItems.length }) },
    { id: 'kitchen', label: t('restaurant.tabs.kitchen', { count: kitchenOrders.length }) },
    { id: 'reports', label: t('restaurant.tabs.reports') },
  ];

  const onChangeTab = (id: Tab) => {
    if (id === 'reports') {
      navigation.navigate('RestaurantReports');
      return;
    }
    setTab(id);
  };

  const onQuickNewOrder = () => {
    setTab('tables');
    const empty = tables.find((t) => normalizeTableStatus(t.status) === 'empty');
    if (empty) {
      void openTable(empty);
    }
  };

  const dashboardTiles: {
    id: string;
    label: string;
    hint: string;
    color: string;
    Icon: typeof Utensils;
    onPress: () => void;
  }[] = [
    {
      id: 'tables',
      label: t('restaurant.tiles.tables'),
      hint: t('restaurant.tiles.tablesHint', { count: gastroKpis.openTables }),
      color: '#ef4444',
      Icon: LayoutGrid,
      onPress: () => setTab('tables'),
    },
    {
      id: 'retail',
      label: t('restaurant.tiles.retail'),
      hint: t('restaurant.tiles.retailHint'),
      color: '#10b981',
      Icon: ShoppingCart,
      onPress: () => void openRetailPos(),
    },
    {
      id: 'kitchen',
      label: t('restaurant.tiles.kitchen'),
      hint: t('restaurant.tiles.kitchenHint', { count: gastroKpis.kitchenPending }),
      color: '#ec4899',
      Icon: ChefHat,
      onPress: () => setTab('kitchen'),
    },
    {
      id: 'delivery',
      label: t('restaurant.tiles.delivery'),
      hint: t('restaurant.tiles.deliveryHint', { count: deliveryOrders.length }),
      color: '#3b82f6',
      Icon: Bike,
      onPress: () => setTab('delivery'),
    },
    {
      id: 'takeaway',
      label: t('restaurant.tiles.takeaway'),
      hint: t('restaurant.tiles.takeawayHint', { count: takeawayOrders.length }),
      color: '#f59e0b',
      Icon: ShoppingBag,
      onPress: () => setTab('takeaway'),
    },
    {
      id: 'reports',
      label: t('restaurant.tiles.reports'),
      hint: t('restaurant.tiles.reportsHint'),
      color: '#6366f1',
      Icon: BarChart3,
      onPress: () => navigation.navigate('RestaurantReports'),
    },
    {
      id: 'schedule',
      label: t('restaurant.tiles.schedule'),
      hint: t('restaurant.tiles.scheduleHint', { count: reservations.length }),
      color: '#f43f5e',
      Icon: CalendarDays,
      onPress: () => setTab('schedule'),
    },
    {
      id: 'settings',
      label: t('restaurant.tiles.settings'),
      hint: t('restaurant.tiles.settingsHint'),
      color: '#64748b',
      Icon: Settings,
      onPress: () => navigation.navigate('RestaurantSettings'),
    },
    {
      id: 'firm',
      label: t('restaurant.tiles.firm'),
      hint: t('restaurant.tiles.firmHint'),
      color: '#14b8a6',
      Icon: Building2,
      onPress: () => navigation.navigate('RestaurantSettings'),
    },
  ];

  const kitchenFilterChips: { id: KitchenFilter; label: string }[] = [
    { id: 'all', label: t('restaurant.filters.all') },
    { id: 'new', label: t('restaurant.filters.new') },
    { id: 'cooking', label: t('restaurant.filters.cooking') },
    { id: 'ready', label: t('restaurant.filters.ready') },
  ];

  const regionBelow =
    tab === 'tables' ? (
      <View style={styles.flatTabs}>
        <Pressable
          onPress={() => setFloorFilter('all')}
          style={[styles.flatTab, floorFilter === 'all' && styles.flatTabOn]}
        >
          <Text
            style={[styles.flatTabText, floorFilter === 'all' && styles.flatTabTextOn]}
            numberOfLines={1}
          >
            {t('restaurant.filters.all')}
          </Text>
        </Pressable>
        {floorTabs.map((f) => {
          const on = floorFilter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFloorFilter(f.id)}
              style={[styles.flatTab, on && styles.flatTabOn]}
            >
              <Text style={[styles.flatTabText, on && styles.flatTabTextOn]} numberOfLines={1}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title={tab === 'tables' ? t('restaurant.header.tablesTitle') : t('restaurant.header.title')}
        subtitle={
          callerPhone
            ? t('restaurant.header.callerId', { phone: callerPhone })
            : tab === 'tables'
              ? t('restaurant.header.subtitleTables', { count: filteredTables.length })
              : t('restaurant.header.subtitleDefault')
        }
        showBack={tab !== 'dashboard'}
        onBack={() => setTab('dashboard')}
        below={regionBelow}
      />

      {tab !== 'tables' ? (
        <SegmentTabBar
          layout="scroll"
          value={tab}
          onChange={onChangeTab}
          items={tabs.map((t) => ({ id: t.id, label: t.label }))}
        />
      ) : null}

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

      {tab === 'kitchen' ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.legendScroll, { backgroundColor: legendBg, borderColor: colors.cardBorder }]}
          contentContainerStyle={styles.legendRow}
        >
          {kitchenFilterChips.map((chip) => {
            const active = kitchenFilter === chip.id;
            const count =
              chip.id === 'all'
                ? kitchenOrders.length
                : kitchenOrders.filter((o) => {
                    const s = String(o.status || '').toLowerCase();
                    if (chip.id === 'new') return !s || s === 'new' || s === 'pending';
                    return s === chip.id;
                  }).length;
            return (
              <Pressable
                key={chip.id}
                onPress={() => setKitchenFilter(chip.id)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? palette.blue600 : colors.card,
                    borderColor: active ? palette.blue600 : colors.cardBorder,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active ? palette.white : colors.text,
                    fontSize: 11,
                    fontWeight: '800',
                  }}
                >
                  {chip.label} ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.blue600} />
      ) : tab === 'dashboard' ? (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ soft: true })} />
          }
          contentContainerStyle={styles.dashboardPad}
        >
          <View style={styles.dashboardKpiRow}>
            {[
              {
                key: 'openTables',
                label: t('restaurant.kpi.openTables'),
                value: String(gastroKpis.openTables),
                accent: palette.blue600,
              },
              {
                key: 'openOrders',
                label: t('restaurant.kpi.openOrders'),
                value: String(gastroKpis.openOrders),
                accent: palette.indigo600,
              },
              {
                key: 'kitchen',
                label: t('restaurant.kpi.kitchenPending'),
                value: String(gastroKpis.kitchenPending),
                accent: palette.amber600,
              },
              {
                key: 'revenue',
                label: t('restaurant.kpi.todayRevenue'),
                value: formatCompactTotal(gastroKpis.todayRevenue),
                accent: palette.green600,
              },
            ].map((kpi) => (
              <View
                key={kpi.key}
                style={[
                  styles.gastroKpiCard,
                  {
                    flexGrow: 1,
                    flexBasis: '46%',
                    backgroundColor: darkMode ? palette.gray800 : palette.white,
                    borderColor: darkMode ? palette.gray700 : palette.gray200,
                  },
                ]}
              >
                <Text style={[styles.gastroKpiLabel, { color: colors.textMuted }]}>
                  {kpi.label}
                </Text>
                <Text style={[styles.gastroKpiValue, { color: kpi.accent }]}>{kpi.value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.dashboardTileGrid}>
            {dashboardTiles.map((tile) => {
              const Icon = tile.Icon;
              return (
                <Pressable
                  key={tile.id}
                  onPress={tile.onPress}
                  style={({ pressed }) => [
                    styles.dashboardTile,
                    {
                      backgroundColor: tile.color,
                      opacity: pressed ? 0.88 : 1,
                    },
                  ]}
                >
                  <Icon size={28} color="#fff" />
                  <Text style={styles.dashboardTileLabel}>{tile.label}</Text>
                  <Text style={styles.dashboardTileHint}>{tile.hint}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={onQuickNewOrder}
            style={[
              styles.quickNewOrderBtn,
              {
                backgroundColor: darkMode ? palette.gray800 : palette.white,
                borderColor: darkMode ? palette.gray600 : palette.gray200,
              },
            ]}
          >
            <Plus size={16} color={palette.blue600} />
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>
              {t('restaurant.quick.newOrderEmpty')}
            </Text>
          </Pressable>
        </ScrollView>
      ) : tab === 'tables' ? (
        <FlatList
          data={filteredTables}
          keyExtractor={(item) => String(item.id)}
          numColumns={isLandscapeTablet ? COLS_LANDSCAPE_TABLET : COLS}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ soft: true })} />
          }
          ListEmptyComponent={<EmptyState message={t('restaurant.empty.tables')} />}
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
          ListEmptyComponent={<EmptyState message={t('restaurant.empty.openOrders')} />}
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
                    {item.order_no || item.id.slice(0, 8)} ·{' '}
                    {item.table_name || (!item.table_id ? t('restaurant.table.retailName') : t('restaurant.table.defaultName'))}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.waiter || '—'} · {orderStatusLabel(item.status, t)}
                    {item.created_at ? ` · ${formatClock(item.created_at)}` : ''}
                  </Text>
                </View>
                <Text style={{ color: palette.blue600, fontWeight: '800' }}>
                  {formatMoney(item.total_amount)}
                </Text>
              </Pressable>
            );
          }}
        />
      ) : tab === 'delivery' ? (
        <RestaurantDeliveryPanel
          orders={deliveryOrders}
          refreshing={refreshing}
          onRefresh={() => void load({ soft: true })}
          onCreate={handleCreateDelivery}
          onUpdateStatus={handleDeliveryStatus}
          saving={saving}
          actionId={kitchenActionId}
          error={null}
        />
      ) : tab === 'takeaway' ? (
        <RestaurantTakeawayPanel
          orders={takeawayOrders}
          refreshing={refreshing}
          onRefresh={() => void load({ soft: true })}
          onCreate={handleCreateTakeaway}
          onUpdateStatus={handleTakeawayStatus}
          saving={saving}
          actionId={kitchenActionId}
          error={null}
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
                  {t('restaurant.schedule.header', { date: todayYmd() })}
                </Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                {t('restaurant.schedule.summary', {
                  orders: todayOrders.length,
                  reservations: reservations.length,
                })}
              </Text>
              <View style={[styles.reservationForm, { borderColor: colors.cardBorder }]}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 12 }}>
                  {t('restaurant.schedule.quickTitle')}
                </Text>
                <FormField
                  label={t('restaurant.schedule.form.customer')}
                  value={reservationForm.customerName}
                  onChangeText={(customerName) => setReservationForm((p) => ({ ...p, customerName }))}
                  placeholder={t('restaurant.schedule.form.placeholderCustomer')}
                />
                <View style={styles.rowFields}>
                  <View style={{ flex: 1 }}>
                    <FormField
                      label={t('restaurant.schedule.form.phone')}
                      value={reservationForm.phone}
                      onChangeText={(phone) => setReservationForm((p) => ({ ...p, phone }))}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={{ width: 92 }}>
                    <FormField
                      label={t('restaurant.schedule.form.time')}
                      value={reservationForm.time}
                      onChangeText={(time) => setReservationForm((p) => ({ ...p, time }))}
                      placeholder={t('restaurant.schedule.form.placeholderTime')}
                    />
                  </View>
                  <View style={{ width: 72 }}>
                    <FormField
                      label={t('restaurant.schedule.form.guests')}
                      value={reservationForm.guestCount}
                      onChangeText={(guestCount) => setReservationForm((p) => ({ ...p, guestCount }))}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <FormField
                  label={t('restaurant.schedule.form.note')}
                  value={reservationForm.note}
                  onChangeText={(note) => setReservationForm((p) => ({ ...p, note }))}
                  placeholder={t('restaurant.schedule.form.placeholderNote')}
                />
                <PrimaryButton
                  label={t('restaurant.schedule.form.submit')}
                  onPress={() => void handleCreateReservation()}
                  loading={saving}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState message={t('restaurant.empty.schedule')} />
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
                        {isRes ? t('restaurant.schedule.badgeReservation') : t('restaurant.schedule.badgeOrder')}
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
                            ['confirmed', t('restaurant.schedule.actions.confirm')],
                            ['seated', t('restaurant.schedule.actions.seated')],
                            ['cancelled', t('restaurant.schedule.actions.cancel')],
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
                        {formatMoney(row.amount)}
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
      ) : tab === 'kitchen' ? (
        <FlatList
          data={filteredKitchenOrders}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load({ soft: true })} />
          }
          ListEmptyComponent={<EmptyState message={t('restaurant.empty.kitchen')} />}
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
                      {item.table_number || t('restaurant.table.defaultName')} · {kitchenStatusLabel(item.status, t)}
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
                      {allReady ? t('restaurant.kitchen.ready') : t('restaurant.kitchen.readyAll')}
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
                          {ki.quantity} adet · {kitchenStatusLabel(ki.status, t)}
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
                          {isReady ? t('restaurant.kitchen.ready') : t('restaurant.kitchen.prepare')}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            );
          }}
        />
      ) : null}

      <Modal visible={!!selectedTable} animationType="slide" onRequestClose={closeModal}>
        <SafeAreaView style={[styles.modalRoot, { backgroundColor: colors.background }]} edges={['bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <GradientHeader compact style={styles.modalHeaderWithTabs}>
              <View style={styles.modalHeaderRow}>
                <HeaderIconButton onPress={closeModal}>
                  <ArrowLeft size={18} color={palette.white} />
                </HeaderIconButton>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.white, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                    {orderSheetTab === 'list'
                      ? t('restaurant.orderModal.titleTables')
                      : isRetailPos
                        ? t('restaurant.table.retailSale')
                        : selectedTable?.name || t('restaurant.table.defaultName')}
                  </Text>
                  <Text style={{ color: palette.blue100, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                    {orderSheetTab === 'list'
                      ? t('restaurant.orderModal.subtitle', { count: orders.length })
                      : `${orderDetail?.order_no || t('restaurant.table.adisyon')}${
                          orderDetail?.status ? ` · ${orderStatusLabel(orderDetail.status, t)}` : ''
                        }${orderDetail ? ` · ${formatMoney(orderDetail.total_amount)}` : ''}`}
                  </Text>
                </View>
                {orderDetail &&
                isOrderOpen(orderDetail.status) &&
                pendingKitchenCount > 0 &&
                orderSheetTab === 'order' &&
                !sendingKitchen ? (
                  <HeaderIconButton
                    onPress={() => void handleSendToKitchen()}
                    accent
                  >
                    <ChefHat size={18} color={palette.white} />
                  </HeaderIconButton>
                ) : sendingKitchen && orderSheetTab === 'order' ? (
                  <ActivityIndicator color={palette.white} />
                ) : (
                  <View
                    style={[
                      styles.headerStatusChip,
                      {
                        backgroundColor: isRetailPos
                          ? palette.green600
                          : getStatusConfig(selectedTable?.status).bg,
                      },
                    ]}
                  >
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                      {isRetailPos ? 'POS' : getStatusConfig(selectedTable?.status).label}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.modalFlatTabs}>
                {(
                  [
                    {
                      id: 'order' as OrderSheetTab,
                      label: orderDetail
                        ? t('restaurant.orderModal.tabOrder', { count: orderDetail.items.length })
                        : t('restaurant.orderModal.tabOrderSimple'),
                    },
                    {
                      id: 'pay' as OrderSheetTab,
                      label: t('restaurant.orderModal.tabPay'),
                    },
                    {
                      id: 'list' as OrderSheetTab,
                      label: t('restaurant.orderModal.tabList', { count: orders.length }),
                    },
                  ] as const
                ).map((item) => {
                  const on = orderSheetTab === item.id;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setOrderSheetTab(item.id)}
                      style={[styles.flatTab, on && styles.flatTabOn]}
                    >
                      <Text
                        style={[styles.flatTabText, on && styles.flatTabTextOn]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </GradientHeader>

            {modalError ? (
              <ErrorBanner message={modalError} onRetry={() => setModalError(null)} />
            ) : null}

            {orderSheetTab === 'list' ? (
              <FlatList
                data={orders}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.modalBody}
                ListEmptyComponent={<EmptyState message={t('restaurant.empty.modalOpenOrders')} />}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => {
                      void openOrder(item);
                      setOrderSheetTab('order');
                    }}
                    style={[
                      styles.listOrderRow,
                      { backgroundColor: colors.card, borderColor: colors.cardBorder },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text, fontWeight: '800' }} numberOfLines={1}>
                        {item.table_name || item.order_no || t('restaurant.table.adisyon')}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
                        {item.order_no || '—'} · {orderStatusLabel(item.status, t)}
                        {item.waiter ? ` · ${item.waiter}` : ''}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text, fontWeight: '900' }}>
                      {formatMoney(item.total_amount)}
                    </Text>
                  </Pressable>
                )}
              />
            ) : orderLoading ? (
              <ActivityIndicator color={palette.blue600} style={{ marginTop: 24 }} />
            ) : !orderDetail ? (
              <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
                <View
                  style={[
                    styles.emptyOrderBox,
                    { backgroundColor: colors.card, borderColor: colors.cardBorder },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 6 }}>
                    {isRetailPos ? t('restaurant.empty.retailOrder') : t('restaurant.empty.openOrders')}
                  </Text>
                  <Text style={{ color: colors.textMuted, marginBottom: 16, fontSize: 13 }}>
                    {isRetailPos
                      ? t('restaurant.empty.modalOpenOrdersHintRetail')
                      : t('restaurant.empty.modalOpenOrdersHintTable')}
                  </Text>
                  <PrimaryButton
                    label={isRetailPos ? t('restaurant.orderModal.createRetail') : t('restaurant.orderModal.createTable')}
                    onPress={() => void handleCreateOrder()}
                    loading={saving}
                  />
                  {!isRetailPos ? (
                    normalizeTableStatus(selectedTable?.status) === 'cleaning' ? (
                      <View style={{ marginTop: 10 }}>
                        <PrimaryButton
                          label={t('restaurant.orderModal.cleanFinish')}
                          onPress={() => void handleMarkTableEmpty()}
                          loading={saving}
                        />
                      </View>
                    ) : (
                      <View style={{ marginTop: 10 }}>
                        <PrimaryButton
                          label={t('restaurant.orderModal.cleaning')}
                          onPress={() => void handleMarkTableCleaning()}
                          loading={saving}
                        />
                      </View>
                    )
                  ) : null}
                </View>
              </ScrollView>
            ) : orderSheetTab === 'order' ? (
              <>
                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={styles.orderMenuList}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.orderHeaderBlock}>
                    <View
                      style={[
                        styles.cartBar,
                        { backgroundColor: colors.card, borderColor: colors.cardBorder },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800' }}>
                          {orderDetail.items.length > 0
                            ? t('restaurant.orderModal.cart.summaryWithTotal', {
                                count: orderDetail.items.length,
                                total: formatMoney(orderDetail.total_amount),
                              })
                            : t('restaurant.orderModal.cart.summary', {
                                count: orderDetail.items.length,
                                suffix: '',
                              })}
                        </Text>
                        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 2 }}>
                          {formatMoney(orderDetail.total_amount)}
                        </Text>
                      </View>
                      <View style={styles.metaChip}>
                        <Utensils size={12} color={palette.blue600} />
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                          {t('restaurant.orderModal.cart.pendingKitchen', { count: pendingKitchenCount })}
                        </Text>
                      </View>
                    </View>

                    {orderDetail.items.length === 0 ? (
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 4 }}>
                        {t('restaurant.orderModal.cart.empty')}
                      </Text>
                    ) : (
                      <View style={styles.cartLines}>
                        {orderDetail.items.map((it) => {
                          const pending = isPendingKitchenLine(it);
                          return (
                            <View
                              key={it.id}
                              style={[
                                styles.cartLine,
                                { borderColor: colors.cardBorder, backgroundColor: colors.card },
                              ]}
                            >
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                  style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}
                                  numberOfLines={1}
                                >
                                  {it.quantity}× {it.product_name}
                                  {it.is_complimentary ? t('restaurant.orderModal.cart.complimentary') : ''}
                                </Text>
                                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
                                  {formatMoney(it.subtotal)} · {kitchenStatusLabel(it.status, t)}
                                </Text>
                              </View>
                              {isOrderOpen(orderDetail.status) && pending ? (
                                <Pressable
                                  onPress={() => handleRemoveItem(it.id)}
                                  style={[styles.smallAction, { borderColor: colors.cardBorder }]}
                                >
                                  <Text
                                    style={{
                                      color: colors.textMuted,
                                      fontSize: 10,
                                      fontWeight: '800',
                                    }}
                                  >
                                    Sil
                                  </Text>
                                </Pressable>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {isOrderOpen(orderDetail.status) ? (
                      <RestaurantMenuCatalog
                        items={menuItems}
                        loading={menuLoading}
                        search={menuSearch}
                        onSearchChange={setMenuSearch}
                        busyId={quickAddingId}
                        disabled={saving}
                        onQuickAdd={(mi) => void handleQuickAddMenuItem(mi)}
                        onLongPress={(mi) => {
                          selectMenuItem(mi);
                          setShowManualAdd(true);
                          setItemQty('1');
                        }}
                      />
                    ) : (
                      <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>
                        {t('restaurant.orderModal.cart.closed', { status: orderDetail.status })}
                      </Text>
                    )}

                    {isOrderOpen(orderDetail.status) ? (
                      <View style={styles.manualAddWrap}>
                        <Pressable
                          onPress={() => setShowManualAdd((v) => !v)}
                          style={[styles.manualToggle, { borderColor: colors.cardBorder }]}
                        >
                          <Text style={{ color: palette.blue600, fontWeight: '800', fontSize: 12 }}>
                            {showManualAdd ? t('restaurant.orderModal.manual.hide') : t('restaurant.orderModal.manual.show')}
                          </Text>
                        </Pressable>
                        {showManualAdd ? (
                          <View style={{ gap: 8, marginTop: 8 }}>
                            <FormField
                              label={t('restaurant.orderModal.manual.productLabel')}
                              value={itemName}
                              onChangeText={setItemName}
                              placeholder={t('restaurant.orderModal.manual.productPlaceholder')}
                            />
                            <View style={styles.rowFields}>
                              <View style={{ flex: 1 }}>
                                <FormField
                                  label={t('restaurant.orderModal.manual.qtyLabel')}
                                  value={itemQty}
                                  onChangeText={setItemQty}
                                  keyboardType="decimal-pad"
                                />
                              </View>
                              <View style={{ flex: 1 }}>
                                <FormField
                                  label={t('restaurant.orderModal.manual.priceLabel')}
                                  value={itemPrice}
                                  onChangeText={setItemPrice}
                                  keyboardType="decimal-pad"
                                />
                              </View>
                            </View>
                            <FormField
                              label={t('restaurant.orderModal.manual.noteLabel')}
                              value={itemNote}
                              onChangeText={setItemNote}
                              placeholder={t('restaurant.schedule.form.placeholderNote')}
                            />
                            <PrimaryButton
                              label={t('restaurant.orderModal.manual.title')}
                              onPress={() => void handleAddItem()}
                              loading={saving}
                            />
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    {isOrderOpen(orderDetail.status) && pendingKitchenCount > 0 ? (
                      <View style={styles.kitchenLangInline}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800' }}>
                          {t('restaurant.orderModal.lang.title')}
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
                                    kitchenLocale === lang.code
                                      ? palette.blue600
                                      : colors.backgroundAlt,
                                  borderColor: colors.cardBorder,
                                },
                              ]}
                            >
                              <Text
                                style={{
                                  color:
                                    kitchenLocale === lang.code ? palette.white : colors.text,
                                  fontSize: 10,
                                  fontWeight: '900',
                                }}
                              >
                                {lang.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                        <Text style={{ color: colors.textSubtle, fontSize: 10 }}>
                          {t('restaurant.orderModal.lang.sendHint', { count: pendingKitchenCount })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </ScrollView>
              </>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.modalBody}
                keyboardShouldPersistTaps="handled"
              >
                <View
                  style={[
                    styles.totalHero,
                    { backgroundColor: colors.card, borderColor: colors.cardBorder },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>
                      {t('restaurant.orderModal.summary.due')}
                    </Text>
                    <Text style={{ color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 2 }}>
                      {formatMoney(payableTotal)}
                    </Text>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                    {t('restaurant.orderModal.summary.itemsCount', { count: orderDetail.items.length })}
                  </Text>
                </View>

                <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('restaurant.orderModal.summary.itemsActions')}</Text>
                {orderDetail.items.map((it) => (
                  <View
                    key={it.id}
                    style={[
                      styles.itemBlock,
                      { borderColor: colors.cardBorder, backgroundColor: colors.card },
                    ]}
                  >
                    <View style={styles.itemRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text, fontWeight: '600' }} numberOfLines={2}>
                          {it.product_name}
                          {it.is_complimentary ? t('restaurant.orderModal.cart.complimentary') : ''}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                          {it.quantity} × {formatMoney(it.unit_price)} = {formatMoney(it.subtotal)}
                        </Text>
                      </View>
                    </View>
                    {isOrderOpen(orderDetail.status) ? (
                      <View style={styles.itemActions}>
                        <Pressable
                          onPress={() => handleVoidItem(it.id, it.product_name)}
                          style={[styles.smallAction, { borderColor: palette.red500 }]}
                        >
                          <Text style={{ color: palette.red500, fontSize: 10, fontWeight: '800' }}>
                            {t('restaurant.orderModal.actions.void')}
                          </Text>
                        </Pressable>
                        {!it.is_complimentary ? (
                          <Pressable
                            onPress={() => handleComplimentary(it.id)}
                            style={[styles.smallAction, { borderColor: colors.cardBorder }]}
                          >
                            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800' }}>
                              {t('restaurant.orderModal.actions.complimentary')}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ))}

                {isOrderOpen(orderDetail.status) ? (
                  <>
                    <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 12 }]}>
                      {t('restaurant.orderModal.actions.discount')}
                    </Text>
                    <View style={styles.rowFields}>
                      <View style={{ flex: 1 }}>
                        <FormField
                          label={t('restaurant.orderModal.actions.discountField')}
                          value={discountPct}
                          onChangeText={setDiscountPct}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={{ justifyContent: 'flex-end', paddingBottom: 4 }}>
                        <PrimaryButton
                          label={t('restaurant.orderModal.actions.apply')}
                          onPress={() => void handleSaveDiscount()}
                          loading={saving}
                        />
                      </View>
                    </View>

                    <View
                      style={[
                        styles.orderSummaryCard,
                        { backgroundColor: colors.card, borderColor: colors.cardBorder },
                      ]}
                    >
                      <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>
                        {t('restaurant.orderModal.summary.title')}
                      </Text>
                      <View style={styles.summaryRow}>
                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('restaurant.orderModal.summary.subtotal')}</Text>
                        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
                          {formatMoney(linesSubtotal)}
                        </Text>
                      </View>
                      {discountAmountPreview > 0 ? (
                        <View style={styles.summaryRow}>
                          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                            {t('restaurant.orderModal.summary.discountPct', { pct: discountPctNum })}
                          </Text>
                          <Text style={{ color: palette.red500, fontWeight: '700', fontSize: 14 }}>
                            −{formatMoney(discountAmountPreview)}
                          </Text>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.summaryRow,
                          styles.summaryTotalRow,
                          { borderTopColor: colors.cardBorder },
                        ]}
                      >
                        <Text style={{ color: colors.text, fontWeight: '900', fontSize: 15 }}>
                          {t('restaurant.orderModal.summary.grandTotal')}
                        </Text>
                        <Text style={{ color: palette.blue600, fontWeight: '900', fontSize: 18 }}>
                          {formatMoney(payableTotal)}
                        </Text>
                      </View>
                      <Text style={{ color: colors.textSubtle, fontSize: 12, marginTop: 4 }}>
                        {orderDetail.items.length} kalem
                      </Text>
                    </View>

                    <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('restaurant.orderModal.summary.paymentTitle')}</Text>
                    <View style={styles.payRow}>
                      {PAY_METHODS.map((m) => (
                        <Pressable
                          key={m.id}
                          onPress={() => setPayMethod(m.id)}
                          style={[
                            styles.payChip,
                            {
                              backgroundColor:
                                payMethod === m.id ? palette.blue600 : colors.backgroundAlt,
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

                    {!isRetailPos && emptyTablesForMove.length > 0 ? (
                      <>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('restaurant.orderModal.summary.moveTitle')}</Text>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.menuPickerRow}
                        >
                          {emptyTablesForMove.map((t) => {
                            const selected = moveTargetId === t.id;
                            return (
                              <Pressable
                                key={t.id}
                                onPress={() => setMoveTargetId(t.id)}
                                style={[
                                  styles.menuChip,
                                  {
                                    width: 88,
                                    backgroundColor: selected ? palette.blue600 : colors.card,
                                    borderColor: selected ? palette.blue600 : colors.cardBorder,
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    color: selected ? palette.white : colors.text,
                                    fontWeight: '800',
                                    fontSize: 13,
                                    textAlign: 'center',
                                  }}
                                >
                                  {t.name || '—'}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                        <PrimaryButton
                          label={t('restaurant.orderModal.summary.moveButton')}
                          onPress={() => void handleMoveTable()}
                          loading={saving}
                          disabled={!moveTargetId}
                        />
                      </>
                    ) : null}
                  </>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {t('restaurant.orderModal.cart.closed', { status: orderDetail.status })}
                  </Text>
                )}
              </ScrollView>
            )}

            {orderDetail && isOrderOpen(orderDetail.status) && orderSheetTab === 'pay' ? (
              <View
                style={[
                  styles.payFooter,
                  { backgroundColor: colors.card, borderTopColor: colors.cardBorder },
                ]}
              >
                <PrimaryButton
                  label={t('restaurant.orderModal.summary.payButton', { total: formatMoney(payableTotal) })}
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
  modalHeaderWithTabs: { paddingBottom: 0 },
  flatTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  modalFlatTabs: {
    flexDirection: 'row',
    marginHorizontal: -16,
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  flatTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  flatTabOn: {
    borderBottomColor: palette.white,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  flatTabText: {
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '700',
    fontSize: 11,
  },
  flatTabTextOn: {
    color: palette.white,
    fontWeight: '800',
  },
  kitchenLangInline: { gap: 6, marginTop: 10 },
  listOrderRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  legendScroll: {
    maxHeight: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gastroStrip: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  gastroKpiRow: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: 'stretch',
  },
  gastroKpiCard: {
    minWidth: 100,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  gastroKpiLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  gastroKpiValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  gastroChipRow: {
    paddingHorizontal: 12,
    gap: 8,
    paddingBottom: 2,
  },
  gastroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gastroChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  dashboardPad: {
    padding: 12,
    paddingBottom: 40,
    gap: 12,
  },
  dashboardKpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dashboardTileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dashboardTile: {
    width: '48%',
    flexGrow: 1,
    minHeight: 112,
    borderRadius: 16,
    padding: 14,
    justifyContent: 'flex-end',
    gap: 4,
  },
  dashboardTileLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 8,
  },
  dashboardTileHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
  },
  quickNewOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  orderSummaryCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryTotalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    marginTop: 4,
  },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginTop: 8, marginBottom: 4 },
  itemBlock: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  orderMenuList: { paddingHorizontal: 16, paddingBottom: 24 },
  orderHeaderBlock: { gap: 8, marginBottom: 8 },
  cartBar: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cartLines: { gap: 6 },
  cartLine: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualAddWrap: { marginTop: 12, marginBottom: 8 },
  manualToggle: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
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
