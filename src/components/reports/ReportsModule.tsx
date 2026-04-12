import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, TrendingUp, Banknote, ShoppingCart, Calendar, Download, FileText, Clock, User, Package, TrendingDown, Award, PieChart as PieChartIcon, CreditCard, AlertCircle, Percent, AlertTriangle } from 'lucide-react';
import type { Sale, Product } from '../../App';
import { MaterialMovementReport } from './MaterialMovementReport';
import { ProfitLossReport } from './ProfitLossReport';
import { ReportChatAI } from './ReportChatAI';
import { CustomerSalesReport } from './CustomerSalesReport';
import { SalesTrendReport } from './SalesTrendReport';
import { SalesTargetReport } from './SalesTargetReport';
import { formatNumber } from '../../utils/formatNumber';
import { getReportingCurrency } from '../../utils/currency';
import { useProductStore } from '../../store';
import { fetchExpiringSoonLots } from '../../services/api/lots';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { moduleTranslations } from '../../locales/module-translations';
import {
  BarChart, Bar, LineChart, Line, PieChart as RePieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { RestaurantService } from '../../services/restaurant';
import { beautyService } from '../../services/beautyService';
import type { BeautyAppointment } from '../../types/beauty';
import { localCalendarDateKey, localTodayDateKey, formatIsoDateTr } from '../../utils/localCalendarDate';
import { BeautyServiceReportCrmModal } from './BeautyServiceReportCrmModal';
import { useBeautyStore } from '../beauty/store/useBeautyStore';
import { Layout, Menu, ConfigProvider, theme, Input, Button, Dropdown, Modal, Table, Spin, Select } from 'antd';
import { toast } from 'sonner';
import { usePermission } from '../../shared/hooks/usePermission';
import { buildReceipt80mmPrintHtml } from '../../utils/receipt80mmPrintHtml';
import { getReceiptSettings } from '../../services/receiptSettingsService';
import { retailexAntdThemeWithPrimary } from '../../theme/retailexAntdTheme';
import type { ColumnsType } from 'antd/es/table';
import {
  RobotOutlined,
  CalendarOutlined,
  PrinterOutlined,
  SwapOutlined,
  LineChartOutlined,
  PieChartOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  UserOutlined,
  RiseOutlined,
  ThunderboltOutlined,
  AccountBookOutlined,
  TransactionOutlined,
  HistoryOutlined,
  AuditOutlined,
  DatabaseOutlined,
  HourglassOutlined,
  RetweetOutlined,
  ApartmentOutlined,
  DeploymentUnitOutlined,
  ExclamationCircleOutlined,
  CreditCardOutlined,
  TagsOutlined,
  BankOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  FilterOutlined,
  MailOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  CaretDownOutlined
} from '@ant-design/icons';

const { Sider, Content } = Layout;

/** Kapalı siparişte `total_amount` bazen güncellenmemiş kalabiliyor; grafik/istatistik için kalemlerden yedek toplam. */
function sumRestOrderItemsSubtotal(o: { items?: unknown }): number {
  const items = o.items;
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum: number, it: any) => {
    if (it?.is_void === true) return sum;
    return sum + Number(it?.subtotal ?? 0);
  }, 0);
}

function restOrderNetAmount(o: { total_amount?: unknown; discount_amount?: unknown; items?: unknown }): number {
  const disc = Number(o.discount_amount ?? 0);
  const header = Number(o.total_amount ?? 0) - disc;
  if (Number.isFinite(header) && header > 0) return header;
  const fromItems = sumRestOrderItemsSubtotal(o) - disc;
  if (Number.isFinite(fromItems) && fromItems > 0) return fromItems;
  return Number.isFinite(header) ? header : 0;
}

/** Adisyon: indirim öncesi tutar (kalem toplamı veya net + indirim). */
function restOrderBeforeDiscount(o: { total_amount?: unknown; discount_amount?: unknown; items?: unknown }): number {
  const itemsSum = sumRestOrderItemsSubtotal(o);
  if (itemsSum > 0) return itemsSum;
  const net = restOrderNetAmount(o);
  const disc = Number((o as any).discount_amount ?? (o as any).discountAmount ?? 0) || 0;
  return net + disc;
}

/** ERP fişi: indirim öncesi — `subtotal` doluysa o, değilse net + indirim. */
function erpSaleBeforeDiscount(s: Sale): number {
  const sub = Number(s.subtotal) || 0;
  if (sub > 0) return sub;
  return (Number(s.total) || 0) + (Number(s.discount) || 0);
}

/** Günlük/Z raporu — adisyon ödeme tipi (ERP `cash` ile hizalı) */
function isRestaurantPaymentCashLike(m: string): boolean {
  return /NAK[İI]T|CASH|^cash$/i.test(String(m || ''));
}
function isRestaurantPaymentCardLike(m: string): boolean {
  return /KART|CARD|kredi|credit|gateway/i.test(String(m || ''));
}

function restOrderPaymentMethod(o: any): string {
  const raw = o?.payment_method ?? o?.paymentMethod;
  if (raw == null || String(raw).trim() === '') return 'NAKİT';
  return String(raw);
}

/** Kapalı adisyon satırı → 80mm fiş HTML’i için `Sale` (ERP fişi yokken). */
function restOrderToSaleForReceipt(o: any): Sale {
  const items = (Array.isArray(o?.items) ? o.items : [])
    .filter((it: any) => it?.is_void !== true)
    .map((it: any) => ({
      productId: String(it.product_id ?? it.productId ?? ''),
      productName: String(it.product_name ?? it.productName ?? 'Ürün'),
      quantity: Number(it.quantity) || 0,
      price: Number(it.unit_price ?? it.unitPrice ?? it.price) || 0,
      discount: Number(it.discount_pct ?? it.discount ?? 0) || 0,
      total: Number(it.subtotal ?? it.total) || 0,
    }));
  const pm = restOrderPaymentMethod(o);
  let paymentMethod = 'cash';
  if (isRestaurantPaymentCardLike(pm)) paymentMethod = 'card';
  else if (!isRestaurantPaymentCashLike(pm) && String(pm).trim()) paymentMethod = 'transfer';
  const id = String(o.id || '');
  return {
    id,
    receiptNumber: String(o.order_no || o.orderNo || `ADİSYON-${id.slice(0, 8)}`),
    date: String(o.closed_at ?? o.closedAt ?? o.opened_at ?? new Date().toISOString()),
    customerName: o.customer_name || o.customerName,
    items,
    subtotal: restOrderBeforeDiscount(o),
    discount: Number(o.discount_amount ?? o.discountAmount ?? 0) || 0,
    total: restOrderNetAmount(o),
    paymentMethod,
    cashier: o.waiter || '-',
    status: 'completed',
  } as Sale;
}

function isSaleRowUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/** `closed_at` / `opened_at` null iken `new Date(null)` epoch (1970) üretir; raporda gösterme. */
/** Stok raporu: DB’de `name` boş veya eski cache’te eksikse name2 / kod / barkod */
function productLabelForReport(p: Product): string {
  const parts: (string | undefined)[] = [p.name, p.name2, p.name_tr, p.name_en, p.code, p.barcode];
  for (const x of parts) {
    if (typeof x === 'string' && x.trim()) return x.trim();
  }
  return 'İsimsiz ürün';
}

function productCategoryForReport(p: Product): string {
  const c = (p.category && String(p.category).trim()) || (p.categoryCode && String(p.categoryCode).trim()) || '';
  return c || '—';
}

function formatRestReportDateTime(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' && value.trim() === '') return '—';
  const d = value instanceof Date ? value : new Date(value as string | number);
  const t = d.getTime();
  if (!Number.isFinite(t) || t <= 0) return '—';
  if (t < 86400000) return '—';
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type AnalysisReportKind =
  | 'sales-by-month'
  | 'user-turnover'
  | 'category-monthly-revenue'
  | 'product-monthly-qty'
  | 'product-sales-range'
  | 'category-monthly-qty'
  | 'section-turnover'
  | 'region-turnover'
  | 'table-turnover'
  | 'collections-by-month';

function analysisMonthKeyFromOrder(o: { closed_at?: unknown; opened_at?: unknown }): string {
  const raw = o.closed_at ?? o.opened_at;
  if (raw == null || raw === '') return '';
  const d = raw instanceof Date ? raw : new Date(raw as string | number);
  const t = d.getTime();
  if (!Number.isFinite(t) || t <= 0 || t < 86400000) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatAnalysisMonthTr(ym: string): string {
  const parts = ym.split('-');
  const y = Number(parts[0]);
  const mo = Number(parts[1]) || 1;
  const names = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  return `${names[mo - 1] ?? ym} ${Number.isFinite(y) ? y : ''}`.trim();
}

function saleMonthKeyFromDate(date: string): string {
  const k = localCalendarDateKey(date);
  if (k.length < 7) return '';
  return k.slice(0, 7);
}

function eachRestOrderItem(order: any, fn: (item: any) => void) {
  for (const it of order?.items || []) {
    if (it?.is_void === true) continue;
    fn(it);
  }
}

/** Yerel takvim günü anahtarına gün ekler (YYYY-MM-DD). */
function calendarKeyAddDays(isoKey: string, deltaDays: number): string {
  const parts = isoKey.split('-').map((x) => parseInt(x, 10));
  const y = parts[0];
  const m = parts[1] || 1;
  const d = parts[2] || 1;
  const dt = new Date(y, m - 1, d + deltaDays);
  return localCalendarDateKey(dt);
}

type ComparisonWindows = {
  currentFrom: string;
  currentTo: string;
  previousFrom: string;
  previousTo: string;
  currentPeriodLabel: string;
  previousPeriodLabel: string;
};

/** Hafta: son 7 gün vs önceki 7 gün. Ay: aybaşı–bugün vs geçen ayın aynı gün aralığı. */
function buildComparisonWindows(period: 'week' | 'month', todayKey: string): ComparisonWindows {
  if (period === 'week') {
    const currentTo = todayKey;
    const currentFrom = calendarKeyAddDays(todayKey, -6);
    const previousTo = calendarKeyAddDays(todayKey, -7);
    const previousFrom = calendarKeyAddDays(todayKey, -13);
    return {
      currentFrom,
      currentTo,
      previousFrom,
      previousTo,
      currentPeriodLabel: 'Bu hafta',
      previousPeriodLabel: 'Geçen hafta',
    };
  }
  const [y, m, d] = todayKey.split('-').map(Number);
  const currentFrom = `${y}-${String(m).padStart(2, '0')}-01`;
  const currentTo = todayKey;
  const prevRef = new Date(y, m - 1, 0);
  const py = prevRef.getFullYear();
  const pm = prevRef.getMonth() + 1;
  const dimPrev = prevRef.getDate();
  const dayClamped = Math.min(d, dimPrev);
  const previousFrom = `${py}-${String(pm).padStart(2, '0')}-01`;
  const previousTo = `${py}-${String(pm).padStart(2, '0')}-${String(dayClamped).padStart(2, '0')}`;
  return {
    currentFrom,
    currentTo,
    previousFrom,
    previousTo,
    currentPeriodLabel: 'Bu ay',
    previousPeriodLabel: 'Geçen ay (aynı gün aralığı)',
  };
}

type BusinessType = 'retail' | 'market' | 'restaurant' | 'beauty';

/** Kasa durumu: yalnızca seçili gün bugünse POS/restoran persist açılış tutarı. */
function readOpeningCashForReports(businessType: BusinessType): number {
  if (typeof window === 'undefined') return 0;
  try {
    if (businessType === 'restaurant') {
      const raw = localStorage.getItem('restaurant-storage');
      if (!raw) return 0;
      const j = JSON.parse(raw) as { state?: { registerOpeningCash?: unknown } };
      const v = j?.state?.registerOpeningCash;
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }
    const r = localStorage.getItem('retailos_opening_cash');
    if (r == null || String(r).trim() === '') return 0;
    const n = parseFloat(String(r).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Günlük rapor tablosu satırı — fiş önizleme / ERP silme için kaynak bilgisi */
type DailyUnifiedRow = {
  key: string;
  source: 'erp' | 'rest';
  receiptNumber: string;
  date: string;
  cashier?: string;
  customerName?: string;
  beforeDiscount: number;
  total: number;
  discount: number;
  paymentMethod: string;
  erpSale?: Sale;
  restOrder?: any;
};

interface ReportsModuleProps {
  sales: Sale[];
  products: Product[];
  /** Gömülü modül için iş kolu (varsayılan: perakende ERP satışları). Restoran modülü `restaurant` geçmeli. */
  initialBusinessType?: BusinessType;
}

type ReportTab =
  // AI & Genel
  'chat-ai' | 'daily' | 'daily-sales-executive' | 'z-report' | 'comparison' |
  // Restoran Otomasyon Özel
  'end-of-day' | 'cash-report' | 'product-reports' | 'category-reports' | 'staff-reports' | 'table-reports' | 'payment-reports' | 'discount-reports' | 'detailed-sales' | 'sales-movements' | 'receipts' | 'courier-reports' | 'cash-register-reports' | 'turnover-reports' | 'analysis' |
  // Satış Raporları
  'top-products' | 'category-analysis' | 'hourly-analysis' | 'cashiers' | 'customer-sales' | 'sales-trend' | 'sales-target' |
  // Finansal Raporlar
  'profit-loss' | 'cash-flow' | 'debt-aging' | 'check-tracking' | 'current-account' |
  // Stok Raporları
  'stock-status' | 'stock-aging' | 'stock-turnover' | 'stock-abc' | 'materials' | 'expiring-products' |
  // Ödeme & İşlem
  'payment-distribution' | 'discount-report' | 'cash-status' | 'commission' |
  // Güzellik özel
  'beauty-service-report';

/** Sol menüde gösterilmez: ekranı yok veya yalnızca “yakında” placeholder idi. */
const REPORT_TABS_HIDDEN_FROM_MENU = new Set<string>([
  'cash-flow',
  'debt-aging',
  'check-tracking',
  'current-account',
  'commission',
  'staff-reports',
  'staff-performance',
  'table-reports',
  'payment-reports',
  'discount-reports',
  'sales-movements',
  'receipts',
  'courier-reports',
  'cash-register-reports',
  'turnover-reports',
]);

function filterReportMenuGroups(groups: { type?: string; children?: { key?: string }[]; [k: string]: unknown }[]): any[] {
  return groups.map((group) => {
    if (group?.type === 'group' && Array.isArray(group.children)) {
      return {
        ...group,
        children: group.children.filter(
          (child) => child?.key != null && !REPORT_TABS_HIDDEN_FROM_MENU.has(String(child.key))
        ),
      };
    }
    return group;
  });
}

export function ReportsModule({ sales, products, initialBusinessType = 'retail' }: ReportsModuleProps) {
  const { language, tm: globalTm } = useLanguage();
  const tm = useCallback((key: string) => moduleTranslations[key]?.[language] || globalTm(key), [language, globalTm]);
  const { hasPermission } = usePermission();
  const canDeleteErpSale = hasPermission('sales-invoices', 'DELETE');

  const { selectedFirm } = useFirmaDonem();
  const reportCurrency =
    (selectedFirm?.raporlama_para_birimi && String(selectedFirm.raporlama_para_birimi).trim()) ||
    (selectedFirm?.ana_para_birimi && String(selectedFirm.ana_para_birimi).trim()) ||
    getReportingCurrency();
  const [selectedTab, setSelectedTab] = useState<ReportTab>('daily');
  const [selectedDate, setSelectedDate] = useState(localTodayDateKey);
  const [comparisonPeriod, setComparisonPeriod] = useState<'week' | 'month'>('week');
  const [comparisonOrders, setComparisonOrders] = useState<any[]>([]);
  const [loadingComparisonOrders, setLoadingComparisonOrders] = useState(false);
  const [expiringProducts, setExpiringProducts] = useState<any[]>([]);
  const [expiringDays, setExpiringDays] = useState<number>(30);
  const [loadingExpiring, setLoadingExpiring] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [businessType, setBusinessType] = useState<BusinessType>(initialBusinessType);
  const [restOrders, setRestOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  /** Restoran — Ürün Satış Adedi: kapalı adisyon, tarih aralığı (DB) */
  const [restProductQtyFrom, setRestProductQtyFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [restProductQtyTo, setRestProductQtyTo] = useState(() => localTodayDateKey());
  const [restProductQtyRows, setRestProductQtyRows] = useState<
    Array<{ productId: string | null; productName: string; quantity: number; revenue: number }>
  >([]);
  const [loadingRestProductQty, setLoadingRestProductQty] = useState(false);
  const [restProductQtyError, setRestProductQtyError] = useState<string | null>(null);

  /** Günlük satış satırı — fiş önizleme / yetkili silme */
  const [dailyRowReceiptModal, setDailyRowReceiptModal] = useState<DailyUnifiedRow | null>(null);
  const [dailyRowReceiptHtml, setDailyRowReceiptHtml] = useState('');
  const [dailyRowReceiptLoading, setDailyRowReceiptLoading] = useState(false);
  /** Fiş önizleme iframe yüksekliği (tam belge; iç içe HTML hatası düzeltildi) */
  const [dailyRowReceiptPreviewH, setDailyRowReceiptPreviewH] = useState(520);

  const [analysisDateFrom, setAnalysisDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 11);
    d.setDate(1);
    return localCalendarDateKey(d);
  });
  const [analysisDateTo, setAnalysisDateTo] = useState(() => localTodayDateKey());
  const [analysisOrders, setAnalysisOrders] = useState<any[]>([]);
  const [loadingAnalysisOrders, setLoadingAnalysisOrders] = useState(false);
  const [floorNameById, setFloorNameById] = useState<Record<string, string>>({});
  const [analysisModal, setAnalysisModal] = useState<{ kind: AnalysisReportKind; title: string } | null>(null);

  const [beautyServiceFrom, setBeautyServiceFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return localCalendarDateKey(d);
  });
  const [beautyServiceTo, setBeautyServiceTo] = useState(() => localTodayDateKey());
  const [beautyServiceAppointments, setBeautyServiceAppointments] = useState<BeautyAppointment[]>([]);
  const [loadingBeautyServiceReport, setLoadingBeautyServiceReport] = useState(false);
  const [beautyCrmModalAppointment, setBeautyCrmModalAppointment] = useState<BeautyAppointment | null>(null);
  /** Boş = tüm hizmetler; aksi halde beauty_services.id */
  const [beautyServiceFilterId, setBeautyServiceFilterId] = useState('');
  const beautyServicesCatalog = useBeautyStore((s) => s.services);
  const loadBeautyServicesCatalog = useBeautyStore((s) => s.loadServices);

  useEffect(() => {
    if (REPORT_TABS_HIDDEN_FROM_MENU.has(selectedTab)) {
      setSelectedTab('daily');
    }
  }, [selectedTab]);

  const reloadBeautyServiceReport = useCallback(() => {
    if (businessType !== 'beauty' || selectedTab !== 'beauty-service-report' || !selectedFirm) return;
    setLoadingBeautyServiceReport(true);
    beautyService
      .getAppointmentsInRange(beautyServiceFrom, beautyServiceTo)
      .then((rows) => setBeautyServiceAppointments(Array.isArray(rows) ? rows : []))
      .catch(() => setBeautyServiceAppointments([]))
      .finally(() => setLoadingBeautyServiceReport(false));
  }, [businessType, selectedTab, selectedFirm, beautyServiceFrom, beautyServiceTo]);

  const getBusinessConfig = () => {
    switch (businessType) {
      case 'market':
        return {
          color: '#10b981',
          lightColor: '#ecfdf5',
          icon: <ShoppingCart className="text-white w-5 h-5" />,
          title: tm('marketAutomation'),
          groupLabel: tm('marketSpecial')
        };
      case 'restaurant':
        return {
          color: '#f59e0b',
          lightColor: '#fffbeb',
          icon: <BarChart3 className="text-white w-5 h-5" />,
          title: tm('reportsAnalysis'),
          groupLabel: tm('restaurantSpecial')
        };
      case 'beauty':
        return {
          color: '#ec4899',
          lightColor: '#fdf2f8',
          icon: <User className="text-white w-5 h-5" />,
          title: tm('beautyCenter'),
          groupLabel: tm('beautySpecial')
        };
      default:
        return {
          color: '#2563eb',
          lightColor: '#eff6ff',
          icon: <BarChart3 className="text-white w-5 h-5" />,
          title: tm('retailSales'),
          groupLabel: tm('storeSpecial')
        };
    }
  };

  const bizConfig = getBusinessConfig();
  const { token } = theme.useToken();

  const loadProducts = useProductStore((s) => s.loadProducts);
  const stockReportLoading = useProductStore((s) => s.isLoading);

  // Stok raporlarında ürünleri DB’den tazele (isim/stok mağaza cache’inden sapmasın)
  useEffect(() => {
    if (
      selectedTab === 'stock-status' ||
      selectedTab === 'stock-aging' ||
      selectedTab === 'stock-turnover' ||
      selectedTab === 'stock-abc'
    ) {
      void loadProducts(true);
    }
  }, [selectedTab, loadProducts]);

  // Fetch expiring products
  useEffect(() => {
    if (selectedTab === 'expiring-products' && selectedFirm?.id) {
      setLoadingExpiring(true);
      fetchExpiringSoonLots(selectedFirm.id.toString(), expiringDays)
        .then((data: any) => {
          setExpiringProducts(data);
          setLoadingExpiring(false);
        })
        .catch((error: any) => {
          console.error('Error fetching expiring products:', error);
          setExpiringProducts([]);
          setLoadingExpiring(false);
        });
    }
  }, [selectedTab, selectedFirm, expiringDays, selectedFirm?.id]);

  const loadRestOrdersForSelectedDate = useCallback(() => {
    if (businessType !== 'restaurant' || !selectedFirm) {
      return Promise.resolve();
    }
    setLoadingOrders(true);
    const fromDate = selectedDate + 'T00:00:00Z';
    const toDate = selectedDate + 'T23:59:59Z';
    return RestaurantService.getOrderHistory({
      fromDate,
      toDate,
      status: 'closed',
      dateField: 'closed_at',
    })
      .then((data: any) => {
        setRestOrders(Array.isArray(data) ? data : []);
      })
      .catch((err: any) => {
        console.error('[ReportsModule] Error fetching rest orders:', err);
        setRestOrders([]);
      })
      .finally(() => {
        setLoadingOrders(false);
      });
  }, [businessType, selectedDate, selectedFirm]);

  // Fetch Restaurant Orders (günlük rapor + iptal sonrası tazeleme)
  useEffect(() => {
    void loadRestOrdersForSelectedDate();
  }, [loadRestOrdersForSelectedDate]);

  // Restoran — Ürün Satış Adedi (ürün raporları sekmesi)
  useEffect(() => {
    if (selectedTab !== 'product-reports' || businessType !== 'restaurant' || !selectedFirm) {
      return;
    }
    let cancelled = false;
    setLoadingRestProductQty(true);
    setRestProductQtyError(null);
    RestaurantService.getProductSalesByClosedDateRange(restProductQtyFrom, restProductQtyTo)
      .then((data) => {
        if (!cancelled) setRestProductQtyRows(Array.isArray(data) ? data : []);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setRestProductQtyRows([]);
          setRestProductQtyError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRestProductQty(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTab, businessType, selectedFirm, restProductQtyFrom, restProductQtyTo]);

  // Dönem karşılaştırması: restoranda ERP fişi yoksa kapalı adisyonları dönem aralığında çek
  useEffect(() => {
    if (selectedTab !== 'comparison' || businessType !== 'restaurant' || !selectedFirm) {
      setComparisonOrders([]);
      setLoadingComparisonOrders(false);
      return;
    }
    const todayKey = localTodayDateKey();
    const w = buildComparisonWindows(comparisonPeriod, todayKey);
    const salesInUnion = (sales || []).filter((s) => {
      const k = localCalendarDateKey(s.date);
      return k >= w.previousFrom && k <= w.currentTo;
    });
    if (salesInUnion.length > 0) {
      setComparisonOrders([]);
      setLoadingComparisonOrders(false);
      return;
    }
    setLoadingComparisonOrders(true);
    const fromDate = `${w.previousFrom}T00:00:00.000Z`;
    const toDate = `${w.currentTo}T23:59:59.999Z`;
    RestaurantService.getOrderHistory({
      fromDate,
      toDate,
      status: 'closed',
      dateField: 'closed_at',
    })
      .then((data: any) => setComparisonOrders(Array.isArray(data) ? data : []))
      .catch(() => setComparisonOrders([]))
      .finally(() => setLoadingComparisonOrders(false));
  }, [selectedTab, businessType, selectedFirm, comparisonPeriod, sales]);

  useEffect(() => {
    if (selectedTab !== 'analysis') {
      setAnalysisModal(null);
      return;
    }
    if (!selectedFirm || businessType !== 'restaurant') {
      setAnalysisOrders([]);
      setLoadingAnalysisOrders(false);
      return;
    }
    setLoadingAnalysisOrders(true);
    const fromDate = `${analysisDateFrom}T00:00:00.000Z`;
    const toDate = `${analysisDateTo}T23:59:59.999Z`;
    Promise.all([
      RestaurantService.getOrderHistory({ fromDate, toDate, status: 'closed' }),
      RestaurantService.getFloors(),
    ])
      .then(([orders, floors]) => {
        setAnalysisOrders(Array.isArray(orders) ? orders : []);
        const m: Record<string, string> = {};
        for (const f of floors || []) {
          if (f?.id != null) m[String(f.id)] = String(f.name ?? f.id);
        }
        setFloorNameById(m);
      })
      .catch((err: unknown) => {
        console.error('[ReportsModule] Analiz siparişleri yüklenemedi:', err);
        setAnalysisOrders([]);
      })
      .finally(() => setLoadingAnalysisOrders(false));
  }, [selectedTab, businessType, selectedFirm, analysisDateFrom, analysisDateTo]);

  useEffect(() => {
    reloadBeautyServiceReport();
  }, [reloadBeautyServiceReport]);

  useEffect(() => {
    if (businessType !== 'beauty' || selectedTab !== 'beauty-service-report') return;
    void loadBeautyServicesCatalog();
  }, [businessType, selectedTab, loadBeautyServicesCatalog]);

  const beautyServiceGrouped = useMemo(() => {
    const rows = beautyServiceAppointments.filter((a) => {
      const st = String(a.status ?? '').toLowerCase();
      if (st === 'cancelled' || st === 'no_show') return false;
      if (beautyServiceFilterId && String(a.service_id ?? '') !== String(beautyServiceFilterId)) return false;
      return true;
    });
    const map = new Map<string, BeautyAppointment[]>();
    for (const a of rows) {
      const name = (a.service_name && String(a.service_name).trim()) || '—';
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(a);
    }
    for (const arr of map.values()) {
      arr.sort((x, y) => {
        const dx = String(x.date ?? x.appointment_date ?? '');
        const dy = String(y.date ?? y.appointment_date ?? '');
        if (dx !== dy) return dx.localeCompare(dy);
        return String(x.time ?? x.appointment_time ?? '').localeCompare(String(y.time ?? y.appointment_time ?? ''));
      });
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'tr'))
      .map(([serviceName, items]) => ({
        serviceName,
        items,
        sum: items.reduce((s, it) => s + Number(it.total_price ?? 0), 0),
      }));
  }, [beautyServiceAppointments, beautyServiceFilterId]);

  /** Dönem karşılaştırması: ERP `sales` veya (restoran) fiş yoksa `comparisonOrders` */
  const comparisonBundle = useMemo(() => {
    const todayKey = localTodayDateKey();
    const windows = buildComparisonWindows(comparisonPeriod, todayKey);
    const { currentFrom, currentTo, previousFrom, previousTo, currentPeriodLabel, previousPeriodLabel } = windows;

    const salesInUnion = (sales || []).filter((s) => {
      const k = localCalendarDateKey(s.date);
      return k >= previousFrom && k <= currentTo;
    });
    const useErp = businessType !== 'restaurant' || salesInUnion.length > 0;

    type Agg = {
      totalSales: number;
      totalRevenue: number;
      avgSale: number;
      customerCount: number;
      productMap: Map<string, { qty: number; revenue: number }>;
    };

    const aggregateErpRange = (from: string, to: string): Agg => {
      const list = (sales || []).filter((s) => {
        const k = localCalendarDateKey(s.date);
        return k >= from && k <= to;
      });
      const totalSales = list.length;
      const totalRevenue = list.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
      const ids = new Set<string>();
      for (const s of list) {
        const id =
          (s.customerId && String(s.customerId).trim()) ||
          (s.customerName && String(s.customerName).trim()) ||
          '';
        if (id) ids.add(id);
      }
      const customerCount = ids.size > 0 ? ids.size : totalSales;
      const avgSale = totalSales > 0 ? totalRevenue / totalSales : 0;
      const productMap = new Map<string, { qty: number; revenue: number }>();
      for (const s of list) {
        for (const it of s.items || []) {
          const name = (it.productName && String(it.productName).trim()) || String(it.productId || '—');
          const cur = productMap.get(name) || { qty: 0, revenue: 0 };
          cur.qty += Number(it.quantity) || 0;
          cur.revenue += Number(it.total) || 0;
          productMap.set(name, cur);
        }
      }
      return { totalSales, totalRevenue, avgSale, customerCount, productMap };
    };

    const aggregateRestRange = (orders: any[], from: string, to: string): Agg => {
      const list = orders.filter((o: any) => {
        const raw = o.closed_at ?? o.closedAt ?? o.opened_at;
        const k = localCalendarDateKey(raw);
        return k >= from && k <= to;
      });
      const totalSales = list.length;
      const totalRevenue = list.reduce((sum, o) => sum + restOrderNetAmount(o), 0);
      const ids = new Set<string>();
      for (const o of list) {
        const id =
          (o.customer_id && String(o.customer_id).trim()) ||
          (o.customer_name && String(o.customer_name).trim()) ||
          '';
        if (id) ids.add(id);
      }
      const customerCount = ids.size > 0 ? ids.size : totalSales;
      const avgSale = totalSales > 0 ? totalRevenue / totalSales : 0;
      const productMap = new Map<string, { qty: number; revenue: number }>();
      for (const o of list) {
        eachRestOrderItem(o, (it: any) => {
          const name =
            (it.product_name && String(it.product_name).trim()) ||
            (it.productName && String(it.productName).trim()) ||
            String(it.product_id || '—');
          const cur = productMap.get(name) || { qty: 0, revenue: 0 };
          cur.qty += Number(it.quantity) || 0;
          cur.revenue += Number(it.subtotal ?? it.total ?? 0) || 0;
          productMap.set(name, cur);
        });
      }
      return { totalSales, totalRevenue, avgSale, customerCount, productMap };
    };

    let dataSource: 'erp' | 'restaurant_orders' = 'erp';
    let curr: Agg;
    let prev: Agg;
    if (useErp) {
      curr = aggregateErpRange(currentFrom, currentTo);
      prev = aggregateErpRange(previousFrom, previousTo);
    } else {
      dataSource = 'restaurant_orders';
      const orders = comparisonOrders || [];
      curr = aggregateRestRange(orders, currentFrom, currentTo);
      prev = aggregateRestRange(orders, previousFrom, previousTo);
    }

    const pct = (a: number, b: number) => {
      if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
      if (a === 0) return b === 0 ? 0 : 100;
      return Math.round(((b - a) / a) * 1000) / 10;
    };

    const chartCountData = [
      { name: 'Satış (adet)', onceki: prev.totalSales, guncel: curr.totalSales },
      { name: 'Müşteri', onceki: prev.customerCount, guncel: curr.customerCount },
    ];
    const chartMoneyData = [
      { name: 'Ciro', onceki: prev.totalRevenue, guncel: curr.totalRevenue },
      { name: 'Ort. fiş', onceki: prev.avgSale, guncel: curr.avgSale },
    ];

    const productKeys = new Set<string>();
    curr.productMap.forEach((_, k) => productKeys.add(k));
    prev.productMap.forEach((_, k) => productKeys.add(k));
    const productRows = Array.from(productKeys)
      .map((key) => {
        const c = curr.productMap.get(key) || { qty: 0, revenue: 0 };
        const p = prev.productMap.get(key) || { qty: 0, revenue: 0 };
        const maxRev = Math.max(c.revenue, p.revenue);
        return {
          key,
          name: key,
          currQty: c.qty,
          prevQty: p.qty,
          currRev: c.revenue,
          prevRev: p.revenue,
          revPct: pct(p.revenue, c.revenue),
          qtyPct: pct(p.qty, c.qty),
          maxRev,
        };
      })
      .sort((a, b) => b.maxRev - a.maxRev)
      .slice(0, 60);

    return {
      windows,
      dataSource,
      current: {
        period: currentPeriodLabel,
        totalSales: curr.totalSales,
        totalRevenue: curr.totalRevenue,
        avgSale: curr.avgSale,
        customerCount: curr.customerCount,
      },
      previous: {
        period: previousPeriodLabel,
        totalSales: prev.totalSales,
        totalRevenue: prev.totalRevenue,
        avgSale: prev.avgSale,
        customerCount: prev.customerCount,
      },
      change: {
        sales: pct(prev.totalSales, curr.totalSales),
        revenue: pct(prev.totalRevenue, curr.totalRevenue),
        avgSale: pct(prev.avgSale, curr.avgSale),
        customerCount: pct(prev.customerCount, curr.customerCount),
      },
      chartCountData,
      chartMoneyData,
      productRows,
    };
  }, [sales, comparisonPeriod, businessType, comparisonOrders]);

  const salesForAnalysis = useMemo(() => {
    if (!sales?.length) return [] as Sale[];
    return sales.filter(s => {
      const k = localCalendarDateKey(s.date);
      return k >= analysisDateFrom && k <= analysisDateTo;
    });
  }, [sales, analysisDateFrom, analysisDateTo]);

  // Daily sales
  const getDailySales = () => {
    if (!sales || !Array.isArray(sales)) return [];
    return sales.filter(s => localCalendarDateKey(s.date) === selectedDate);
  };

  const dailySales = getDailySales();

  /** Seçili takvim gününde kapanan adisyonlar (Z raporu ile aynı mantık; opened_at aralığından bağımsız) */
  const restOrdersClosedOnSelectedDate = useMemo(() => {
    if (businessType !== 'restaurant') return [] as any[];
    return restOrders.filter((o: any) => {
      const d = o.closed_at ?? o.closedAt ?? o.date;
      return d && localCalendarDateKey(d) === selectedDate;
    });
  }, [businessType, restOrders, selectedDate]);

  let dailyTotal: number;
  let dailyCash: number;
  let dailyCard: number;
  let dailyDiscount: number;
  if (businessType === 'restaurant') {
    /** Perakende Satışlar / fatura listesi ile aynı tutar: önce ERP `sales` (REST-* dahil); yoksa yalnız kapalı adisyon */
    if (dailySales.length > 0) {
      dailyTotal = dailySales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
      dailyCash = dailySales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + (Number(s.total) || 0), 0);
      dailyCard = dailySales
        .filter(s => s.paymentMethod === 'card' || s.paymentMethod === 'gateway')
        .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
      dailyDiscount = dailySales.reduce((sum, s) => sum + (Number(s.discount) || 0), 0);
    } else {
      dailyTotal = restOrdersClosedOnSelectedDate.reduce((sum, o) => sum + restOrderNetAmount(o), 0);
      let restCash = 0;
      let restCard = 0;
      restOrdersClosedOnSelectedDate.forEach((o: any) => {
        const n = restOrderNetAmount(o);
        const pm = String(o.payment_method ?? 'NAKİT');
        if (isRestaurantPaymentCashLike(pm)) restCash += n;
        else if (isRestaurantPaymentCardLike(pm)) restCard += n;
      });
      dailyCash = restCash;
      dailyCard = restCard;
      dailyDiscount = restOrdersClosedOnSelectedDate.reduce(
        (sum, o) => sum + Number((o as any).discount_amount || 0),
        0
      );
    }
  } else {
    dailyTotal = dailySales.reduce((sum, s) => sum + s.total, 0);
    dailyCash = dailySales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.total, 0);
    dailyCard = dailySales
      .filter(s => s.paymentMethod === 'card' || s.paymentMethod === 'gateway')
      .reduce((sum, s) => sum + s.total, 0);
    dailyDiscount = dailySales.reduce((sum, s) => sum + s.discount, 0);
  }

  /** Günlük tablo + özet kartlar: restoranda Perakende Satışlar (ERP) ile birebir; ERP yoksa kapalı adisyonlar */
  const dailyUnifiedRows = useMemo((): DailyUnifiedRow[] => {
    if (businessType !== 'restaurant') {
      return dailySales.map((s) => ({
        key: `erp-${s.id}`,
        source: 'erp' as const,
        receiptNumber: s.receiptNumber,
        date: s.date,
        cashier: s.cashier,
        customerName: s.customerName,
        beforeDiscount: erpSaleBeforeDiscount(s),
        total: Number(s.total) || 0,
        discount: Number(s.discount) || 0,
        paymentMethod: s.paymentMethod,
        erpSale: s,
      }));
    }
    if (dailySales.length > 0) {
      return dailySales
        .map((s) => ({
          key: `erp-${s.id}`,
          source: 'erp' as const,
          receiptNumber: s.receiptNumber,
          date: s.date,
          cashier: s.cashier,
          customerName: s.customerName,
          beforeDiscount: erpSaleBeforeDiscount(s),
          total: Number(s.total) || 0,
          discount: Number(s.discount) || 0,
          paymentMethod: s.paymentMethod,
          erpSale: s,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }
    return restOrdersClosedOnSelectedDate
      .map((o: any) => {
        const pm = String(o.payment_method ?? 'NAKİT');
        let paymentMethod = 'other';
        if (isRestaurantPaymentCashLike(pm)) paymentMethod = 'cash';
        else if (isRestaurantPaymentCardLike(pm)) paymentMethod = 'card';
        const disc = Number(o.discount_amount ?? o.discountAmount ?? 0) || 0;
        const net = restOrderNetAmount(o);
        return {
          key: `rest-${o.id}`,
          source: 'rest' as const,
          receiptNumber: String(o.order_no || `ADİSYON-${String(o.id).slice(0, 8)}`),
          date: o.closed_at || o.closedAt || o.opened_at,
          cashier: o.waiter || '-',
          customerName: o.customer_name || '-',
          beforeDiscount: restOrderBeforeDiscount(o),
          total: net,
          discount: disc,
          paymentMethod,
          restOrder: o,
        };
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [businessType, dailySales, restOrdersClosedOnSelectedDate]);

  const dailySalesForAi = useMemo((): Sale[] => {
    if (businessType !== 'restaurant') return dailySales;
    return dailyUnifiedRows.map(
      (r) =>
        ({
          id: r.key,
          receiptNumber: r.receiptNumber,
          date: r.date,
          customerName: r.customerName,
          items: [],
          subtotal: r.beforeDiscount ?? ((Number(r.total) || 0) + (Number(r.discount) || 0)),
          discount: r.discount ?? 0,
          total: r.total,
          paymentMethod: r.paymentMethod === 'other' ? 'transfer' : r.paymentMethod,
          cashier: r.cashier || '-',
          status: 'completed',
        }) as Sale
    );
  }, [businessType, dailySales, dailyUnifiedRows]);

  const closeDailyRowReceiptModal = useCallback(() => {
    setDailyRowReceiptModal(null);
    setDailyRowReceiptHtml('');
    setDailyRowReceiptLoading(false);
    setDailyRowReceiptPreviewH(520);
  }, []);

  const openDailyRowReceiptModal = useCallback(
    async (row: DailyUnifiedRow) => {
      setDailyRowReceiptModal(row);
      setDailyRowReceiptLoading(true);
      setDailyRowReceiptHtml('');
      try {
        const sale: Sale | null =
          row.source === 'erp' && row.erpSale
            ? row.erpSale
            : row.source === 'rest' && row.restOrder
              ? restOrderToSaleForReceipt(row.restOrder)
              : null;
        if (!sale) {
          toast.error('Fiş verisi bulunamadı.');
          closeDailyRowReceiptModal();
          return;
        }
        const firmNrForReceipt =
          (selectedFirm?.firm_nr && String(selectedFirm.firm_nr).trim()) ||
          (selectedFirm?.nr != null ? String(selectedFirm.nr).padStart(3, '0') : undefined);
        const rs = await getReceiptSettings(firmNrForReceipt);
        const total = Number(sale.total) || 0;
        const pm = String(sale.paymentMethod || 'cash').toLowerCase();
        const methodForReceipt = pm === 'card' || pm === 'gateway' ? 'card' : pm === 'veresiye' ? 'veresiye' : 'cash';
        const html = buildReceipt80mmPrintHtml({
          sale,
          paymentData: {
            payments: [{ method: methodForReceipt, amount: total, currency: reportCurrency || 'IQD' }],
            totalPaid: total,
            change: Number(sale.change) || 0,
          },
          receiptSettings: rs,
          companyNameFallback: selectedFirm?.name?.trim() || selectedFirm?.title?.trim() || 'RetailEX',
          firmTitle: selectedFirm?.title?.trim() || selectedFirm?.name?.trim() || '',
          locale: language === 'en' || language === 'ar' || language === 'ku' ? language : 'tr',
        });
        setDailyRowReceiptHtml(html);
        setDailyRowReceiptPreviewH(400);
      } catch (e: any) {
        console.error('[ReportsModule] Fiş önizleme:', e);
        toast.error(e?.message || 'Fiş yüklenemedi.');
        closeDailyRowReceiptModal();
      } finally {
        setDailyRowReceiptLoading(false);
      }
    },
    [closeDailyRowReceiptModal, language, reportCurrency, selectedFirm]
  );

  const printDailyRowReceipt = useCallback(() => {
    if (!dailyRowReceiptHtml) return;
    // Tauri/WebView2 popup engeli: window.open yerine gizli iframe (gunluk rapor / Z ile ayni)
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      toast.error('Yazdırma çerçevesi oluşturulamadı.');
      return;
    }
    // buildReceipt80mmPrintHtml zaten tam HTML belgesi döndürür; tekrar sarmalama geçersiz DOM üretir
    doc.open();
    doc.write(dailyRowReceiptHtml);
    doc.close();
    const win = iframe.contentWindow;
    const runPrint = () => {
      setTimeout(() => {
        win?.focus();
        win?.print();
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 1000);
      }, 100);
    };
    if (win?.document.readyState === 'complete') {
      runPrint();
    } else {
      win?.addEventListener('load', runPrint, { once: true });
    }
  }, [dailyRowReceiptHtml]);

  const handleDeleteDailyErpSale = useCallback(async () => {
    const inv = dailyRowReceiptModal?.erpSale;
    const id = inv?.id && isSaleRowUuid(String(inv.id)) ? String(inv.id).trim() : '';
    if (!id || !inv?.receiptNumber) return;
    if (!window.confirm(`Bu satış faturası silinsin mi?\n\nFiş: ${inv.receiptNumber}`)) return;
    try {
      const { invoicesAPI } = await import('../../services/api/invoices');
      const ok = await invoicesAPI.delete(id);
      if (!ok) {
        toast.error('Fatura silinemedi.');
        return;
      }
      const { useSaleStore } = await import('../../store');
      useSaleStore.getState().removeSaleById(id);
      await useSaleStore.getState().loadSales(500);
      if (businessType === 'restaurant') {
        await loadRestOrdersForSelectedDate();
      }
      toast.success('Fatura silindi.');
      closeDailyRowReceiptModal();
    } catch (e: any) {
      console.error('[ReportsModule] Fatura silme:', e);
      toast.error(e?.message || 'Silme başarısız.');
    }
  }, [businessType, closeDailyRowReceiptModal, dailyRowReceiptModal?.erpSale, loadRestOrdersForSelectedDate]);

  const handleDeleteDailyRestOrder = useCallback(async () => {
    const o = dailyRowReceiptModal?.restOrder;
    const id = o?.id != null ? String(o.id).trim() : '';
    const orderNo = dailyRowReceiptModal?.receiptNumber || id;
    if (!id) return;
    if (
      !window.confirm(
        `Bu kapalı adisyon kaydı iptal edilsin mi?\n\nFiş / adisyon: ${orderNo}\n\nKayıt günlük rapordan düşer. ERP satış faturası yoksa bu işlem yeterlidir.`
      )
    ) {
      return;
    }
    try {
      await RestaurantService.cancelOrder(id);
      toast.success('Adisyon kaydı iptal edildi.');
      closeDailyRowReceiptModal();
      await loadRestOrdersForSelectedDate();
    } catch (e: any) {
      console.error('[ReportsModule] Adisyon iptal:', e);
      toast.error(e?.message || 'İptal başarısız.');
    }
  }, [closeDailyRowReceiptModal, dailyRowReceiptModal, loadRestOrdersForSelectedDate]);

  // Z Report — restoranda tutarlar Perakende Satışlar (ERP) ile aynı; o gün ERP fişi yoksa kapalı adisyonlar
  const generateZReport = () => {
    const reportDay = selectedDate;
    const todaySales = sales.filter(s => localCalendarDateKey(s.date) === reportDay);

    if (businessType === 'restaurant') {
      if (todaySales.length > 0) {
        const totalAmount = todaySales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
        const cashAmount = todaySales
          .filter(s => s.paymentMethod === 'cash')
          .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
        const cardAmount = todaySales
          .filter(s => s.paymentMethod === 'card' || s.paymentMethod === 'gateway')
          .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
        const totalDiscount = todaySales.reduce((sum, s) => sum + (Number(s.discount) || 0), 0);
        const amountBeforeDiscount = totalAmount + totalDiscount;
        return {
          date: reportDay,
          totalSales: todaySales.length,
          amountBeforeDiscount,
          totalAmount,
          cashAmount,
          cardAmount,
          totalDiscount,
          firstSale: todaySales[0].receiptNumber,
          lastSale: todaySales[todaySales.length - 1].receiptNumber,
          canceledSales: 0,
          refundAmount: 0,
        };
      }
      const totalAmount = restOrdersClosedOnSelectedDate.reduce((sum, o) => sum + restOrderNetAmount(o), 0);
      const cashAmount = restOrdersClosedOnSelectedDate
        .filter((o: any) => isRestaurantPaymentCashLike(String(o.payment_method ?? 'NAKİT')))
        .reduce((sum, o) => sum + restOrderNetAmount(o), 0);
      const cardAmount = restOrdersClosedOnSelectedDate
        .filter((o: any) => isRestaurantPaymentCardLike(String(o.payment_method ?? '')))
        .reduce((sum, o) => sum + restOrderNetAmount(o), 0);
      const totalDiscount = restOrdersClosedOnSelectedDate.reduce(
        (sum, o) => sum + Number((o as any).discount_amount || 0),
        0
      );
      const amountBeforeDiscount = totalAmount + totalDiscount;
      const ro = restOrdersClosedOnSelectedDate;
      return {
        date: reportDay,
        totalSales: ro.length,
        amountBeforeDiscount,
        totalAmount,
        cashAmount,
        cardAmount,
        totalDiscount,
        firstSale: ro.length > 0 ? String(ro[0].order_no || ro[0].id || '-') : '-',
        lastSale: ro.length > 0 ? String(ro[ro.length - 1].order_no || ro[ro.length - 1].id || '-') : '-',
        canceledSales: 0,
        refundAmount: 0,
      };
    }

    const totalAmount = todaySales.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const cashAmount = todaySales
      .filter(s => s.paymentMethod === 'cash')
      .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const cardAmount = todaySales
      .filter(s => s.paymentMethod === 'card' || s.paymentMethod === 'gateway')
      .reduce((sum, s) => sum + (Number(s.total) || 0), 0);
    const totalDiscount = todaySales.reduce((sum, s) => sum + (Number(s.discount) || 0), 0);
    const amountBeforeDiscount = totalAmount + totalDiscount;

    return {
      date: reportDay,
      totalSales: todaySales.length,
      amountBeforeDiscount,
      totalAmount,
      cashAmount,
      cardAmount,
      totalDiscount,
      firstSale: todaySales.length > 0 ? todaySales[0].receiptNumber : '-',
      lastSale: todaySales.length > 0 ? todaySales[todaySales.length - 1].receiptNumber : '-',
      canceledSales: 0,
      refundAmount: 0,
    };
  };

  // Product sales analysis
  const getProductSales = () => {
    if (businessType === 'restaurant') {
      const productMap = new Map<string, {
        product: any;
        quantity: number;
        revenue: number;
        discount: number;
      }>();

      restOrders.forEach(order => {
        (order.items || []).forEach((item: any) => {
          if (item?.is_void === true) return;
          const pid = item.product_id != null && String(item.product_id).trim() !== '' ? String(item.product_id) : '';
          const key = pid || `name:${String(item.product_name ?? '—')}`;
          const existing = productMap.get(key);
          if (existing) {
            existing.quantity += Number(item.quantity || 0);
            existing.revenue += Number(item.subtotal || 0);
            existing.discount += Number(item.discount_amount || 0);
          } else {
            productMap.set(key, {
              product: { id: item.product_id, name: item.product_name, category: item.category_name },
              quantity: Number(item.quantity || 0),
              revenue: Number(item.subtotal || 0),
              discount: Number(item.discount_amount || 0)
            });
          }
        });
      });
      return Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
    }

    if (!sales || !Array.isArray(sales)) return [];
    const productMap = new Map<string, {
      product: Product;
      quantity: number;
      revenue: number;
      discount: number;
    }>();

    sales.forEach(sale => {
      sale.items.forEach(item => {
        const existing = productMap.get(item.productId);
        if (existing) {
          existing.quantity += item.quantity;
          existing.revenue += item.total;
          existing.discount += (item.quantity * item.price * item.discount) / 100;
        } else {
          const product = products.find(p => p.id === item.productId);
          if (product) {
            productMap.set(item.productId, {
              product,
              quantity: item.quantity,
              revenue: item.total,
              discount: (item.quantity * item.price * item.discount) / 100
            });
          }
        }
      });
    });

    return Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);
  };

  const getPaymentDistribution = () => {
    const emptyBucket = () => ({ amount: 0, count: 0, percentage: 0 });
    const finalize = (
      cashAmt: number,
      cashCnt: number,
      cardAmt: number,
      cardCnt: number,
      transferAmt: number,
      transferCnt: number
    ) => {
      const totalAmt = cashAmt + cardAmt + transferAmt;
      const pct = (n: number) => (totalAmt > 0 ? (n / totalAmt) * 100 : 0);
      const cash = { amount: cashAmt, count: cashCnt, percentage: pct(cashAmt) };
      const card = { amount: cardAmt, count: cardCnt, percentage: pct(cardAmt) };
      const transfer = { amount: transferAmt, count: transferCnt, percentage: pct(transferAmt) };
      const chartData = [
        { name: 'Nakit', value: cashAmt, count: cashCnt },
        { name: 'Kredi Kartı', value: cardAmt, count: cardCnt },
        { name: 'Havale/EFT', value: transferAmt, count: transferCnt },
      ].filter((d) => d.value > 0);
      return { chartData, cash, card, transfer };
    };

    if (businessType === 'restaurant') {
      let cashAmt = 0;
      let cardAmt = 0;
      let transferAmt = 0;
      let cashCnt = 0;
      let cardCnt = 0;
      let transferCnt = 0;
      for (const row of dailyUnifiedRows) {
        const n = Number(row.total) || 0;
        if (n <= 0) continue;
        if (row.paymentMethod === 'cash') {
          cashAmt += n;
          cashCnt += 1;
        } else if (row.paymentMethod === 'card' || row.paymentMethod === 'gateway') {
          cardAmt += n;
          cardCnt += 1;
        } else {
          transferAmt += n;
          transferCnt += 1;
        }
      }
      return finalize(cashAmt, cashCnt, cardAmt, cardCnt, transferAmt, transferCnt);
    }

    if (!sales || !Array.isArray(sales)) {
      const e = emptyBucket();
      return { chartData: [], cash: e, card: e, transfer: e };
    }
    const cashSales = sales.filter((s) => s.paymentMethod === 'cash');
    const cardSales = sales.filter((s) => s.paymentMethod === 'card' || s.paymentMethod === 'gateway');
    const transferSales = sales.filter((s) => s.paymentMethod === 'transfer');
    const cashAmt = cashSales.reduce((sum, s) => sum + s.total, 0);
    const cardAmt = cardSales.reduce((sum, s) => sum + s.total, 0);
    const transferAmt = transferSales.reduce((sum, s) => sum + s.total, 0);
    return finalize(cashAmt, cashSales.length, cardAmt, cardSales.length, transferAmt, transferSales.length);
  };

  const getCashierPerformance = () => {
    if (businessType === 'restaurant') {
      const cashierMap = new Map<string, any>();
      dailyUnifiedRows.forEach((row) => {
        const name = String(row.cashier || '').trim() || 'Bilinmeyen Kasiyer';
        const existing = cashierMap.get(name) || { name, salesCount: 0, totalRevenue: 0, avgSale: 0, cashSales: 0, cardSales: 0 };
        existing.salesCount += 1;
        existing.totalRevenue += row.total;
        existing.avgSale = existing.totalRevenue / existing.salesCount;
        if (row.paymentMethod === 'cash') existing.cashSales += row.total;
        else if (row.paymentMethod === 'card' || row.paymentMethod === 'gateway') existing.cardSales += row.total;
        cashierMap.set(name, existing);
      });
      return Array.from(cashierMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    if (!sales || !Array.isArray(sales)) return [];
    const cashierMap = new Map<string, any>();
    sales.forEach(sale => {
      const name = sale.cashier || 'Bilinmeyen Kasiyer';
      const existing = cashierMap.get(name) || { name, salesCount: 0, totalRevenue: 0, avgSale: 0, cashSales: 0, cardSales: 0 };
      existing.salesCount += 1;
      existing.totalRevenue += sale.total;
      existing.avgSale = existing.totalRevenue / existing.salesCount;
      if (sale.paymentMethod === 'cash') existing.cashSales += sale.total;
      else existing.cardSales += sale.total;
      cashierMap.set(name, existing);
    });
    return Array.from(cashierMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  };

  const getRestaurantStats = () => {
    if (businessType !== 'restaurant') return null;
    const totalSales = dailyUnifiedRows.reduce((sum, r) => sum + r.total, 0);
    const payments = dailyUnifiedRows.reduce((acc: any, r) => {
      const bucket =
        r.paymentMethod === 'cash'
          ? 'NAKİT'
          : r.paymentMethod === 'card' || r.paymentMethod === 'gateway'
            ? 'POS'
            : String(r.paymentMethod || 'DİĞER').toUpperCase();
      acc[bucket] = (acc[bucket] || 0) + r.total;
      return acc;
    }, {});
    const discountTotal =
      dailySales.length > 0
        ? dailySales.reduce((sum, s) => sum + (Number(s.discount) || 0), 0)
        : restOrdersClosedOnSelectedDate.reduce((sum, o) => sum + Number((o as any).discount_amount || 0), 0);

    return {
      totalSales,
      payments,
      discountTotal,
      orderCount: dailyUnifiedRows.length
    };
  };

  const restStats = getRestaurantStats();
  const zReport = generateZReport();
  const productSales = getProductSales();
  const cashierPerformance = getCashierPerformance();

  // Top Products Report (En Çok Satan Ürünler) — yalnızca gerçek satış/kalem verisi; sahte örnek yok
  const getTopProducts = (limit: number = 20) => {
    return productSales
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit)
      .map((item, index) => {
        const pid = item.product?.id;
        const catalog = Array.isArray(products) && pid ? products.find(p => p.id === pid) : undefined;
        const qty = Number(item.quantity || 0);
        const rev = Number(item.revenue || 0);
        return {
          id: String(pid ?? `${item.product?.name}-${index}`),
          rank: index + 1,
          name: String(item.product?.name ?? '—'),
          category: String(item.product?.category ?? '—'),
          quantity: qty,
          revenue: rev,
          avgPrice: qty > 0 ? rev / qty : 0,
          stock: catalog?.stock ?? (item.product as any)?.stock ?? 0,
        };
      });
  };

  // Category Analysis
  const getCategoryAnalysis = () => {
    if (businessType === 'restaurant') {
      const categoryMap = new Map<string, {
        name: string;
        totalRevenue: number;
        totalQuantity: number;
        productCount: number;
        avgPrice: number;
        items?: any[];
      }>();

      restOrders.forEach(order => {
        (order.items || []).forEach((item: any) => {
          const categoryName = item.category_name || 'Diğer';
          const existing = categoryMap.get(categoryName);
          if (existing) {
            existing.totalRevenue += Number(item.subtotal || 0);
            existing.totalQuantity += Number(item.quantity || 0);
            existing.avgPrice = existing.totalRevenue / existing.totalQuantity;
            if (!existing.items) existing.items = [];
            existing.items.push(item);
          } else {
            categoryMap.set(categoryName, {
              name: categoryName,
              totalRevenue: Number(item.subtotal || 0),
              totalQuantity: Number(item.quantity || 0),
              productCount: 1,
              avgPrice: Number(item.unit_price || 0),
              items: [item]
            });
          }
        });
      });
      return Array.from(categoryMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    if (!sales || !Array.isArray(sales) || !products || !Array.isArray(products)) return [];
    const categoryMap = new Map<string, {
      name: string;
      totalRevenue: number;
      totalQuantity: number;
      productCount: number;
      avgPrice: number;
    }>();

    sales.forEach(sale => {
      if (localCalendarDateKey(sale.date) !== selectedDate) return;
      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        if (product) {
          const existing = categoryMap.get(product.category);
          if (existing) {
            existing.totalRevenue += item.total;
            existing.totalQuantity += item.quantity;
            existing.avgPrice = existing.totalRevenue / existing.totalQuantity;
          } else {
            categoryMap.set(product.category, {
              name: product.category,
              totalRevenue: item.total,
              totalQuantity: item.quantity,
              productCount: 1,
              avgPrice: item.price
            });
          }
        }
      });
    });

    return Array.from(categoryMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
  };

  // Hourly Analysis — seçili güne göre (restoranda günlük birleşik satır saatleri)
  const getHourlyAnalysis = () => {
    const hourlyMap = new Map<number, { hour: number; sales: number; revenue: number; count: number }>();

    const bump = (hour: number, total: number) => {
      const existing = hourlyMap.get(hour);
      if (existing) {
        existing.sales += 1;
        existing.revenue += total;
        existing.count += 1;
      } else {
        hourlyMap.set(hour, { hour, sales: 1, revenue: total, count: 1 });
      }
    };

    if (businessType === 'restaurant') {
      for (const row of dailyUnifiedRows) {
        const t = new Date(row.date).getTime();
        if (!Number.isFinite(t) || t <= 0) continue;
        const hour = new Date(row.date).getHours();
        bump(hour, Number(row.total) || 0);
      }
    } else {
      const list = sales && Array.isArray(sales) ? sales : [];
      for (const sale of list) {
        if (localCalendarDateKey(sale.date) !== selectedDate) continue;
        const t = new Date(sale.date).getTime();
        if (!Number.isFinite(t) || t <= 0) continue;
        const hour = new Date(sale.date).getHours();
        bump(hour, Number(sale.total) || 0);
      }
    }

    return Array.from(hourlyMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => ({
        ...v,
        label: `${v.hour.toString().padStart(2, '0')}:00`,
      }));
  };

  // Cash Status Report — seçili gün + getPaymentDistribution ile aynı nakit/kart/havale; açılış: bugünse persist
  const getCashStatus = () => {
    const dist = getPaymentDistribution();
    const cashTotal = dist.cash.amount;
    const cardTotal = dist.card.amount;
    const transferTotal = dist.transfer.amount;
    const todayTotal = cashTotal + cardTotal + transferTotal;

    const todayKey = localTodayDateKey();
    const openingCash =
      selectedDate === todayKey ? readOpeningCashForReports(businessType) : 0;
    const expenses = 0;
    const closingCash = openingCash + cashTotal - expenses;

    const map = new Map<string, number>();
    if (businessType === 'restaurant') {
      for (const row of dailyUnifiedRows) {
        if (row.paymentMethod !== 'card' && row.paymentMethod !== 'gateway') continue;
        const label = row.paymentMethod === 'gateway' ? 'Sanal POS' : 'Kredi kartı';
        map.set(label, (map.get(label) || 0) + (Number(row.total) || 0));
      }
    } else if (sales && Array.isArray(sales)) {
      for (const s of sales) {
        if (localCalendarDateKey(s.date) !== selectedDate) continue;
        if (s.paymentMethod !== 'card' && s.paymentMethod !== 'gateway') continue;
        const label = s.paymentMethod === 'gateway' ? 'Sanal POS' : 'Kredi kartı';
        map.set(label, (map.get(label) || 0) + (Number(s.total) || 0));
      }
    }

    let cards = Array.from(map.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    if (cardTotal > 0 && cards.length === 0) {
      cards = [{ name: 'Kredi kartı', amount: cardTotal }];
    }

    return {
      openingCash,
      todayCash: cashTotal,
      todayCard: cardTotal,
      todayTransfer: transferTotal,
      todayTotal,
      expenses,
      closingCash,
      cashDifference: 0,
      cards,
    };
  };

  // Discount Report
  const getDiscountReport = () => {
    if (!sales || !Array.isArray(sales)) return [];
    const discountMap = new Map<string, {
      name: string;
      discountAmount: number;
      salesCount: number;
      avgDiscount: number;
    }>();

    sales.forEach(sale => {
      if (sale.discount > 0) {
        const discountReason = (sale as any).discountReason || 'Genel İndirim';
        const existing = discountMap.get(discountReason);
        if (existing) {
          existing.discountAmount += sale.discount;
          existing.salesCount += 1;
          existing.avgDiscount = existing.discountAmount / existing.salesCount;
        } else {
          discountMap.set(discountReason, {
            name: discountReason,
            discountAmount: sale.discount,
            salesCount: 1,
            avgDiscount: sale.discount
          });
        }
      }
    });

    return Array.from(discountMap.values()).sort((a, b) => b.discountAmount - a.discountAmount);
  };

  // Stock Status Report
  const getStockStatus = () => {
    const lowStockThreshold = 30;

    const safeNumber = (v: unknown): number => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const n = parseFloat(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };

    const minLevelFor = (p: Product) => {
      const m = p.minStock ?? p.min_stock ?? p.criticalStock;
      const mm = safeNumber(m);
      return mm > 0 ? mm : lowStockThreshold;
    };

    const stockOf = (p: Product) => safeNumber(p.stock);

    const outOfStock = products.filter(p => stockOf(p) <= 0);
    const lowStock = products.filter(p => {
      const s = stockOf(p);
      return s > 0 && s <= minLevelFor(p);
    });
    const normalStock = products.filter(p => stockOf(p) > minLevelFor(p));

    // Negatif / fazla satış stoku envanter tutarını eksiye düşürmesin; kartta fiziki stok değeri
    const totalStockValue = products.reduce((sum, p) => {
      const s = stockOf(p);
      const price = safeNumber(p.price);
      return sum + Math.max(0, s) * price;
    }, 0);

    const lowStockItems = lowStock.slice(0, 20).map(p => {
      const s = stockOf(p);
      const price = safeNumber(p.price);
      const minStock = minLevelFor(p);
      return {
        name: productLabelForReport(p),
        category: productCategoryForReport(p),
        stock: s,
        minStock,
        price,
        value: s * price
      };
    });

    return {
      totalProducts: products.length,
      totalStockValue: Number.isFinite(totalStockValue) ? totalStockValue : 0,
      outOfStock: outOfStock.length,
      lowStock: lowStock.length,
      normalStock: normalStock.length,
      lowStockItems,
      lowStockThreshold
    };
  };

  /** Raporlarda satış verisinin kaç güne yayıldığı (devir yıllıklandırma için) */
  const getSalesPeriodDays = (): number => {
    if (businessType === 'restaurant') {
      if (restOrders.length === 0) return 1;
      const keys = new Set<string>();
      restOrders.forEach((o: any) => {
        const d = o.closed_at ?? o.closedAt ?? o.date;
        const k = d ? localCalendarDateKey(d) : '';
        if (k) keys.add(k);
      });
      return Math.max(1, keys.size);
    }
    if (!sales || sales.length === 0) return 1;
    const keys = new Set<string>();
    sales.forEach(s => {
      const k = localCalendarDateKey(s.date);
      if (k) keys.add(k);
    });
    return Math.max(1, keys.size);
  };

  const getLastSaleTimeByProductId = (): Map<string, number> => {
    const map = new Map<string, number>();
    const upd = (id: string, ms: number) => {
      if (!id || !Number.isFinite(ms) || ms < 86400000) return;
      const p = map.get(id);
      if (p == null || ms > p) map.set(id, ms);
    };
    if (businessType === 'restaurant') {
      restOrders.forEach((o: any) => {
        const raw = o.closed_at ?? o.closedAt ?? o.date;
        const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
        if (!Number.isFinite(t)) return;
        eachRestOrderItem(o, (it: any) => upd(String(it.product_id ?? ''), t));
      });
    } else {
      sales.forEach(s => {
        const t = new Date(s.date).getTime();
        if (!Number.isFinite(t)) return;
        s.items.forEach(it => upd(String(it.productId), t));
      });
    }
    return map;
  };

  const getStockAgingReport = () => {
    const lowStockThreshold = 30;
    const safeNumber = (v: unknown): number => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const n = parseFloat(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    const stockOf = (p: Product) => safeNumber(p.stock);
    const lastSale = getLastSaleTimeByProductId();
    const now = Date.now();
    const dayMs = 86400000;

    const rows = products
      .filter(p => !(p as any).isService && !(p as any).is_service)
      .filter(p => stockOf(p) > 0)
      .map(p => {
        const sid = String(p.id);
        const last = lastSale.get(sid);
        let days: number;
        if (last != null) days = Math.floor((now - last) / dayMs);
        else if (p.updated_at) {
          const t = new Date(p.updated_at).getTime();
          days = Number.isFinite(t) ? Math.floor((now - t) / dayMs) : 3650;
        } else if (p.created_at) {
          const t = new Date(p.created_at).getTime();
          days = Number.isFinite(t) ? Math.floor((now - t) / dayMs) : 3650;
        } else days = 9999;

        let bucket: string;
        let bucketKey: 'fresh' | 'normal' | 'slow' | 'critical';
        if (days <= 30) {
          bucket = '0–30 gün (hareketli)';
          bucketKey = 'fresh';
        } else if (days <= 90) {
          bucket = '31–90 gün';
          bucketKey = 'normal';
        } else if (days <= 180) {
          bucket = '91–180 gün';
          bucketKey = 'slow';
        } else {
          bucket = '180+ gün / kayıtlı satış yok';
          bucketKey = 'critical';
        }

        const stk = stockOf(p);
        const price = safeNumber(p.price);
        return {
          id: sid,
          name: productLabelForReport(p),
          category: productCategoryForReport(p),
          stock: stk,
          daysSinceMovement: days,
          bucket,
          bucketKey,
          value: stk * price,
        };
      })
      .sort((a, b) => b.daysSinceMovement - a.daysSinceMovement);

    const summary = {
      fresh: rows.filter(r => r.bucketKey === 'fresh').length,
      normal: rows.filter(r => r.bucketKey === 'normal').length,
      slow: rows.filter(r => r.bucketKey === 'slow').length,
      critical: rows.filter(r => r.bucketKey === 'critical').length,
      totalSkus: rows.length,
      totalValue: rows.reduce((s, r) => s + r.value, 0),
      hint:
        businessType === 'restaurant'
          ? 'Son satış tarihi, seçili güne yüklenen kapalı siparişlere göre hesaplanır. Tarih aralığını genişletmek için günlük rapor tarihini değiştirin.'
          : 'Son satış tarihi, uygulamadaki satış geçmişine göre hesaplanır.',
    };
    return { rows, summary, lowStockThreshold };
  };

  const getStockTurnoverReport = () => {
    const periodDays = getSalesPeriodDays();
    const safeNumber = (v: unknown): number => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const n = parseFloat(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    const stockOf = (p: Product) => safeNumber(p.stock);

    const soldById = new Map<string, { qty: number; revenue: number }>();
    productSales.forEach(item => {
      const id = String(item.product?.id ?? '');
      if (!id) return;
      soldById.set(id, {
        qty: Number(item.quantity || 0),
        revenue: Number(item.revenue || 0),
      });
    });

    const seen = new Set<string>();
    type TurnRow = {
      id: string;
      name: string;
      category: string;
      soldQty: number;
      revenue: number;
      stock: number;
      periodDays: number;
      ratio: number | null;
      annualizedTurnover: number | null;
      daysCover: number | null;
    };
    const rows: TurnRow[] = [];

    productSales.forEach(item => {
      const id = String(item.product?.id ?? '');
      if (!id) return;
      seen.add(id);
      const catalog = products.find(p => p.id === id);
      const soldQty = Number(item.quantity || 0);
      const revenue = Number(item.revenue || 0);
      const stock = catalog ? Math.max(0, stockOf(catalog)) : 0;
      const ratio = stock > 0 ? soldQty / stock : soldQty > 0 ? null : 0;
      const dailySales = soldQty / periodDays;
      const annualizedTurnover =
        stock > 0 && dailySales > 0 ? (dailySales * 365) / stock : stock > 0 && soldQty === 0 ? 0 : null;
      const daysCover = dailySales > 0 ? stock / dailySales : null;
      rows.push({
        id,
        name: catalog ? productLabelForReport(catalog) : String(item.product?.name ?? '—'),
        category: catalog ? productCategoryForReport(catalog) : String(item.product?.category ?? '—'),
        soldQty,
        revenue,
        stock,
        periodDays,
        ratio,
        annualizedTurnover,
        daysCover,
      });
    });

    products.forEach(p => {
      if ((p as any).isService || (p as any).is_service) return;
      const id = p.id;
      if (seen.has(id)) return;
      const stk = Math.max(0, stockOf(p));
      if (stk <= 0) return;
      seen.add(id);
      rows.push({
        id,
        name: productLabelForReport(p),
        category: productCategoryForReport(p),
        soldQty: 0,
        revenue: 0,
        stock: stk,
        periodDays,
        ratio: 0,
        annualizedTurnover: 0,
        daysCover: null,
      });
    });

    rows.sort((a, b) => (b.annualizedTurnover ?? -1) - (a.annualizedTurnover ?? -1));

    return {
      rows,
      periodDays,
      hint:
        businessType === 'restaurant'
          ? `Dönem: yaklaşık ${periodDays} gün (yüklü kapalı siparişler). Stok / satış oranı mevcut stok ile tahminidir.`
          : `Dönem: satış kayıtlarında ${periodDays} farklı gün. Yıllıklandırılmış devir = (günlük ort. satış × 365) / stok.`,
    };
  };

  const getStockAbcReport = () => {
    const safeNumber = (v: unknown): number => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const n = parseFloat(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) ? n : 0;
    };
    const stockOf = (p: Product) => safeNumber(p.stock);

    const revenueById = new Map<string, number>();
    productSales.forEach(item => {
      const id = String(item.product?.id ?? '');
      if (!id) return;
      revenueById.set(id, Number(item.revenue || 0));
    });

    type AbcRow = {
      id: string;
      name: string;
      category: string;
      revenue: number;
      stock: number;
      stockValue: number;
      metric: number;
      cumPct: number;
      abc: 'A' | 'B' | 'C';
    };

    const rowsRaw = products
      .filter(p => !(p as any).isService && !(p as any).is_service)
      .map(p => {
        const revenue = revenueById.get(p.id) || 0;
        const stk = Math.max(0, stockOf(p));
        const price = safeNumber(p.price);
        const stockValue = stk * price;
        const metric = revenue > 0 ? revenue : stockValue;
        return {
          id: p.id,
          name: productLabelForReport(p),
          category: productCategoryForReport(p),
          revenue,
          stock: stk,
          stockValue,
          metric,
        };
      })
      .filter(r => r.metric > 0)
      .sort((a, b) => b.metric - a.metric);

    const totalMetric = rowsRaw.reduce((s, r) => s + r.metric, 0);
    let running = 0;
    const rows: AbcRow[] = rowsRaw.map(r => {
      running += r.metric;
      const cumPct = totalMetric > 0 ? (running / totalMetric) * 100 : 100;
      let abc: 'A' | 'B' | 'C' = 'C';
      if (totalMetric <= 0) abc = 'C';
      else if (cumPct <= 80) abc = 'A';
      else if (cumPct <= 95) abc = 'B';
      else abc = 'C';
      return { ...r, cumPct, abc };
    });

    const valueByClass = { A: 0, B: 0, C: 0 };
    rows.forEach(r => {
      valueByClass[r.abc] += r.metric;
    });

    const chartData = [
      { name: 'A grubu', value: valueByClass.A, fill: '#16a34a' },
      { name: 'B grubu', value: valueByClass.B, fill: '#ca8a04' },
      { name: 'C grubu', value: valueByClass.C, fill: '#64748b' },
    ].filter(d => d.value > 0);

    return {
      rows,
      totalMetric,
      valueByClass,
      chartData,
      hint:
        'Sınıflandırma: dönem satış cirosu olan ürünlerde ciro, satışı olmayanlarda stok değeri (stok × fiyat) metrik alınır. Kümülatif %80 → A, %95’e kadar → B, kalan → C.',
    };
  };

  // Payment Distribution Summary
  const getPaymentSummary = () => {
    if (businessType === 'restaurant') {
      const stats = restStats || { totalSales: 0, payments: {}, orderCount: 0 };
      const totalSales = stats.totalSales;
      const cashAmount = stats.payments['NAKİT'] || 0;
      const cardAmount = stats.payments['POS'] || 0;
      const otherAmount = totalSales - cashAmount - cardAmount;

      return {
        total: stats.orderCount,
        cash: { count: 0, amount: cashAmount, percentage: totalSales > 0 ? (cashAmount / totalSales * 100) : 0 },
        card: { count: 0, amount: cardAmount, percentage: totalSales > 0 ? (cardAmount / totalSales * 100) : 0 },
        transfer: { count: 0, amount: otherAmount, percentage: totalSales > 0 ? (otherAmount / totalSales * 100) : 0 },
        chartData: [
          { name: 'Nakit', value: cashAmount, count: 0, fill: '#10b981' },
          { name: 'Kart', value: cardAmount, count: 0, fill: '#3b82f6' },
          { name: 'Diğer', value: otherAmount, count: 0, fill: '#f59e0b' },
        ]
      };
    }

    const list = sales && Array.isArray(sales) ? sales : [];
    const totalSales = list.length;
    const cashAmount = list.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + s.total, 0);
    const cardAmount = list.filter(s => s.paymentMethod === 'card' || s.paymentMethod === 'gateway').reduce((sum, s) => sum + s.total, 0);
    const transferAmount = list.filter(s => s.paymentMethod === 'transfer').reduce((sum, s) => sum + s.total, 0);
    const sumAmt = cashAmount + cardAmount + transferAmount;
    const pct = (n: number) => (sumAmt > 0 ? (n / sumAmt) * 100 : 0);

    return {
      total: totalSales,
      cash: { count: 0, amount: cashAmount, percentage: pct(cashAmount) },
      card: { count: 0, amount: cardAmount, percentage: pct(cardAmount) },
      transfer: { count: 0, amount: transferAmount, percentage: pct(transferAmount) },
      chartData: [
        { name: 'Nakit', value: cashAmount, count: 0, fill: '#10b981' },
        { name: 'Kart', value: cardAmount, count: 0, fill: '#3b82f6' },
        { name: 'Transfer', value: transferAmount, count: 0, fill: '#f59e0b' },
      ]
    };
  };

  const escHtml = (s: string) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  type DailyReportPrintFormat = 'a4' | '80mm';

  /** Günlük rapor — A4 veya 80 mm termal */
  const printDailySalesReport = (format: DailyReportPrintFormat) => {
    const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('tr-TR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const saleRowsA4 = dailyUnifiedRows
      .map((row) => {
        const pmLabel =
          row.paymentMethod === 'cash'
            ? 'Nakit'
            : row.paymentMethod === 'card' || row.paymentMethod === 'gateway'
              ? 'Kart'
              : 'Diğer';
        const before = row.beforeDiscount ?? ((Number(row.total) || 0) + (Number(row.discount) || 0));
        return `
        <tr>
          <td>${escHtml(row.receiptNumber)}</td>
          <td>${escHtml(new Date(row.date).toLocaleTimeString('tr-TR'))}</td>
          <td>${escHtml(row.cashier || '—')}</td>
          <td>${escHtml(row.customerName || '—')}</td>
          <td style="text-align:right">${formatNumber(before, 2, false)}</td>
          <td style="text-align:right">${formatNumber(row.discount ?? 0, 2, false)}</td>
          <td style="text-align:right">${formatNumber(row.total, 2, false)}</td>
          <td>${pmLabel}</td>
        </tr>`;
      })
      .join('');

    let restBlockA4 = '';
    if (businessType !== 'restaurant' && restOrders.length > 0) {
      const oRows = restOrders
        .map(
          (o: any) => `
        <tr>
          <td>${escHtml(String(o.order_no || o.id || '—'))}</td>
          <td style="text-align:right">${formatNumber(Number(o.total_amount || 0), 2, false)}</td>
          <td>${escHtml(String(o.payment_method || '—'))}</td>
        </tr>`
        )
        .join('');
      restBlockA4 = `
        <h3 style="margin-top:20px;font-size:14px">Restoran siparişleri (${escHtml(selectedDate)})</h3>
        <table class="t">
          <thead><tr><th>Fiş / No</th><th style="text-align:right">Tutar</th><th>Ödeme</th></tr></thead>
          <tbody>${oRows}</tbody>
        </table>`;
    }

    const saleBlocks80 = dailyUnifiedRows
      .map((row) => {
        const pm =
          row.paymentMethod === 'cash'
            ? 'Nakit'
            : row.paymentMethod === 'card' || row.paymentMethod === 'gateway'
              ? 'Kart'
              : 'Diğer';
        const net = formatNumber(row.total, 2, false);
        const disc = formatNumber(row.discount ?? 0, 2, false);
        const before = formatNumber(row.beforeDiscount ?? ((Number(row.total) || 0) + (Number(row.discount) || 0)), 2, false);
        return `
    <div class="sale-block">
      <div class="row"><span class="wrap">${escHtml(row.receiptNumber)}</span><span>${escHtml(new Date(row.date).toLocaleTimeString('tr-TR'))}</span></div>
      <div class="sub wrap">${escHtml(row.cashier || '—')} · ${escHtml(row.customerName || '—')}</div>
      <div class="row"><span>Önce</span><span>${before}</span></div>
      <div class="row"><span>İndirim</span><span>${disc}</span></div>
      <div class="row bold"><span>Net · ${pm}</span><span>${net}</span></div>
    </div>
    <div class="divider light"></div>`;
      })
      .join('');

    let restBlock80 = '';
    if (businessType !== 'restaurant' && restOrders.length > 0) {
      const oBlocks = restOrders
        .map((o: any) => {
          const no = escHtml(String(o.order_no || o.id || '—'));
          const pay = escHtml(String(o.payment_method || '—'));
          const tot = formatNumber(Number(o.total_amount || 0), 2, false);
          return `<div class="row"><span class="wrap">${no}</span><span>${tot}</span></div>
      <div class="row sub"><span></span><span>${pay}</span></div>
      <div class="divider light"></div>`;
        })
        .join('');
      restBlock80 = `
        <div class="divider"></div>
        <div class="center bold">RESTORAN SİPARİŞLERİ (${escHtml(selectedDate)})</div>
        ${oBlocks}`;
    }

    const emptySales80 =
      dailyUnifiedRows.length === 0
        ? '<div class="center muted" style="margin:3mm 0">Kayıt yok</div>'
        : saleBlocks80;

    const htmlA4 = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Günlük Satış — ${selectedDate}</title>
<style>
  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  body { font-family: system-ui, sans-serif; font-size: 12px; color: #111; padding: 16px; max-width: 210mm; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  .muted { color: #64748b; font-size: 11px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; }
  .t { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
  .t th, .t td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  .t thead { background: #f8fafc; }
</style></head><body>
  <h1>Günlük satış raporu</h1>
  <p class="muted">${escHtml(dateLabel)}</p>
  <div class="grid">
    <div class="card"><div>İşlem adedi</div><strong>${dailyUnifiedRows.length}</strong></div>
    <div class="card"><div>Toplam ciro</div><strong>${formatNumber(dailyTotal, 2, false)}</strong></div>
    <div class="card"><div>Toplam indirim</div><strong>${formatNumber(dailyDiscount, 2, false)}</strong></div>
    <div class="card"><div>Nakit</div><strong>${formatNumber(dailyCash, 2, false)}</strong></div>
    <div class="card"><div>Kart</div><strong>${formatNumber(dailyCard, 2, false)}</strong></div>
  </div>
  <h3 style="font-size:14px;margin:0 0 8px">POS satış satırları</h3>
  <table class="t">
    <thead><tr><th>Fiş</th><th>Saat</th><th>Kasiyer</th><th>Müşteri</th><th style="text-align:right">İndirim öncesi</th><th style="text-align:right">İndirim</th><th style="text-align:right">Net</th><th>Ödeme</th></tr></thead>
    <tbody>${saleRowsA4 || '<tr><td colspan="8" style="text-align:center;color:#64748b">Kayıt yok</td></tr>'}</tbody>
  </table>
  ${restBlockA4}
  <p class="muted" style="margin-top:20px;font-size:10px;text-align:center">RetailEX · Günlük rapor</p>
</body></html>`;

    const html80 = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Günlük Satış — ${selectedDate}</title>
<style>
  /* 80 mm termal: ortada durmasın — önizleme ve yazdırmada sola yaslı tek sütun */
  html {
    width: 80mm;
    max-width: 80mm;
    margin: 0;
    padding: 0;
  }
  @media print {
    @page { size: 80mm auto; margin: 0; }
    html, body {
      width: 80mm !important;
      max-width: 80mm !important;
      margin: 0 !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
  body {
    box-sizing: border-box;
    width: 100%;
    max-width: 80mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    line-height: 1.35;
    padding: 4mm 3mm;
    margin: 0;
    color: #000;
    text-align: left;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .large { font-size: 13px; }
  .small { font-size: 10px; margin-top: 1mm; }
  .muted { color: #444; }
  .wrap { overflow-wrap: anywhere; word-break: break-word; }
  .divider { border-top: 1px dashed #000; margin: 3mm 0; }
  .divider.light { border-top: 1px dotted #666; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; gap: 2mm; margin: 0.5mm 0; }
  .row span:first-child { flex: 1; min-width: 0; }
  .row span:last-child { flex-shrink: 0; text-align: right; }
  .sub { font-size: 10px; color: #333; margin: 0.5mm 0 1mm; }
  .sale-block { margin-top: 2mm; }
  .section-title { margin: 3mm 0 2mm; text-align: center; font-weight: bold; font-size: 11px; }
</style></head><body>
  <div class="center bold large">GÜNLÜK SATIŞ RAPORU</div>
  <div class="center small">${escHtml(dateLabel)}</div>
  <div class="divider"></div>
  <div class="row"><span>İşlem adedi</span><span class="bold">${dailyUnifiedRows.length}</span></div>
  <div class="row"><span>Toplam ciro</span><span class="bold">${formatNumber(dailyTotal, 2, false)}</span></div>
  <div class="row"><span>Toplam indirim</span><span>${formatNumber(dailyDiscount, 2, false)}</span></div>
  <div class="row"><span>Nakit</span><span>${formatNumber(dailyCash, 2, false)}</span></div>
  <div class="row"><span>Kart</span><span>${formatNumber(dailyCard, 2, false)}</span></div>
  <div class="divider"></div>
  <div class="section-title">POS SATIŞ DETAYI</div>
  ${emptySales80}
  ${restBlock80}
  <div class="divider"></div>
  <div class="center small" style="margin-top:2mm">RetailEX · Günlük rapor</div>
</body></html>`;

    const html = format === 'a4' ? htmlA4 : html80;
    // window.open Tauri/WebView'da popup engeline takılır; iframe ile Z raporuyla aynı yol
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:absolute;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const win = iframe.contentWindow;
    const runPrint = () => {
      setTimeout(() => {
        win?.focus();
        win?.print();
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 1000);
      }, 100);
    };
    if (win?.document.readyState === 'complete') {
      runPrint();
    } else {
      win?.addEventListener('load', runPrint, { once: true });
    }
  };

  // Print Z Report
  const printZReport = () => {
    const restaurantProductBlock =
      businessType === 'restaurant' && productSales.length > 0
        ? `
        <div class="divider"></div>
        <div class="center bold">SATILAN URUNLER</div>
        ${productSales
          .map((item: any) => {
            const name = escHtml(item.product?.name || '—');
            const qty = formatNumber(item.quantity, 2, false);
            const rev = formatNumber(item.revenue, 2, false);
            return `<div class="row"><span>${name}</span><span>${qty} / ${rev}</span></div>`;
          })
          .join('')}
        `
        : '';

    const reportHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Z Raporu - ${zReport.date}</title>
        <style>
          html {
            width: 80mm;
            max-width: 80mm;
            margin: 0;
            padding: 0;
          }
          @media print {
            @page { size: 80mm auto; margin: 0; }
            html, body {
              width: 80mm !important;
              max-width: 80mm !important;
              margin: 0 !important;
            }
          }
          body {
            box-sizing: border-box;
            width: 100%;
            max-width: 80mm;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            line-height: 1.3;
            padding: 5mm;
            margin: 0;
            color: #000;
            text-align: left;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .large { font-size: 14px; }
          .divider { border-top: 1px dashed #000; margin: 3mm 0; }
          .row { display: flex; justify-content: space-between; margin: 1mm 0; }
          .header { margin-bottom: 3mm; }
          .small { font-size: 9px; color: #444; }
        </style>
      </head>
      <body>
        <div class="header center">
          <div class="bold large">Z RAPORU</div>
          <div>RetailOS Mağaza Sistemi</div>
        </div>
        
        <div class="divider"></div>
        
        <div class="row">
          <span>Tarih:</span>
          <span class="bold">${new Date(zReport.date).toLocaleDateString('tr-TR')}</span>
        </div>
        <div class="row">
          <span>Rapor Saati:</span>
          <span>${new Date().toLocaleTimeString('tr-TR')}</span>
        </div>
        
        <div class="divider"></div>
        
        <div class="center bold">SATIŞ ÖZETİ</div>
        
        <div class="row">
          <span>Toplam İşlem:</span>
          <span class="bold">${zReport.totalSales}</span>
        </div>
        <div class="row">
          <span>İndirim öncesi (brüt):</span>
          <span class="bold">${formatNumber(zReport.amountBeforeDiscount, 2, false)}</span>
        </div>
        <div class="row">
          <span>Toplam indirim:</span>
          <span>${formatNumber(zReport.totalDiscount, 2, false)}</span>
        </div>
        <div class="row">
          <span>Net ciro:</span>
          <span class="bold">${formatNumber(zReport.totalAmount, 2, false)}</span>
        </div>
        <div class="row">
          <span>İlk Fiş No:</span>
          <span>${zReport.firstSale}</span>
        </div>
        <div class="row">
          <span>Son Fiş No:</span>
          <span>${zReport.lastSale}</span>
        </div>
        
        <div class="divider"></div>
        ${restaurantProductBlock}
        <div class="center bold">ÖDEME ÖZETİ</div>
        
        <div class="row">
          <span>Nakit:</span>
          <span>${formatNumber(zReport.cashAmount, 2, false)}</span>
        </div>
        <div class="row">
          <span>Kart:</span>
          <span>${formatNumber(zReport.cardAmount, 2, false)}</span>
        </div>
        
        <div class="divider"></div>
        
        <div class="row bold large">
          <span>NET CİRO:</span>
          <span>${formatNumber(zReport.totalAmount, 2, false)}</span>
        </div>
        <div class="center small" style="margin-top:1mm">İndirim sonrası tahsilat toplamı</div>
        
        <div class="divider"></div>
        
        <div class="center" style="margin-top: 5mm; font-size: 10px;">
          <div>Bu rapor otomatik oluşturulmuştur</div>
          <div>RetailOS v1.0</div>
        </div>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(reportHTML);
      doc.close();

      iframe.contentWindow?.addEventListener('load', () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 1000);
        }, 100);
      });
    }
  };

  const getAnalysisColumnsAndData = (kind: AnalysisReportKind): {
    columns: ColumnsType<Record<string, unknown>>;
    dataSource: Record<string, unknown>[];
    chartData?: { name: string; value: number }[];
  } => {
    const moneyCol = (title: string, key: string): ColumnsType<Record<string, unknown>>[number] => ({
      title,
      dataIndex: key,
      key,
      align: 'right',
      render: (v: unknown) => formatNumber(Number(v ?? 0), 2, false),
    });

    if (businessType === 'restaurant') {
      const orders = analysisOrders;
      switch (kind) {
        case 'sales-by-month': {
          const map = new Map<string, number>();
          for (const o of orders) {
            const mk = analysisMonthKeyFromOrder(o);
            if (!mk) continue;
            map.set(mk, (map.get(mk) || 0) + restOrderNetAmount(o));
          }
          const rows = Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([mk, total]) => ({ key: mk, month: formatAnalysisMonthTr(mk), total }));
          return {
            columns: [
              { title: 'Ay', dataIndex: 'month', key: 'month' },
              moneyCol(`Tutar (${reportCurrency})`, 'total'),
            ],
            dataSource: rows,
            chartData: rows.map(r => ({ name: String(r.month), value: Number(r.total) })),
          };
        }
        case 'user-turnover': {
          const map = new Map<string, number>();
          for (const o of orders) {
            const w = String(o.waiter ?? 'Genel').trim() || 'Genel';
            map.set(w, (map.get(w) || 0) + restOrderNetAmount(o));
          }
          const rows = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([user, total]) => ({ key: user, user, total }));
          return {
            columns: [{ title: 'Kullanıcı / Garson', dataIndex: 'user', key: 'user' }, moneyCol('Ciro', 'total')],
            dataSource: rows,
            chartData: rows.slice(0, 16).map(r => ({ name: String(r.user), value: Number(r.total) })),
          };
        }
        case 'category-monthly-revenue': {
          const map = new Map<string, number>();
          for (const o of orders) {
            const mk = analysisMonthKeyFromOrder(o);
            if (!mk) continue;
            eachRestOrderItem(o, (it: any) => {
              const cat = String(it.category_name ?? 'Diğer').trim() || 'Diğer';
              const k = `${mk}\t${cat}`;
              map.set(k, (map.get(k) || 0) + Number(it.subtotal ?? 0));
            });
          }
          const rows = Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([compound, total]) => {
              const [ym, cat] = compound.split('\t');
              return { key: compound, month: formatAnalysisMonthTr(ym), category: cat, total };
            });
          return {
            columns: [
              { title: 'Ay', dataIndex: 'month', key: 'month' },
              { title: 'Kategori', dataIndex: 'category', key: 'category' },
              moneyCol(`Tutar (${reportCurrency})`, 'total'),
            ],
            dataSource: rows,
          };
        }
        case 'product-monthly-qty': {
          const map = new Map<string, number>();
          for (const o of orders) {
            const mk = analysisMonthKeyFromOrder(o);
            if (!mk) continue;
            eachRestOrderItem(o, (it: any) => {
              const name = String(it.product_name ?? '—').trim() || '—';
              const k = `${mk}\t${name}`;
              map.set(k, (map.get(k) || 0) + Number(it.quantity ?? 0));
            });
          }
          const rows = Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([compound, qty]) => {
              const [ym, name] = compound.split('\t');
              return { key: compound, month: formatAnalysisMonthTr(ym), product: name, qty };
            });
          return {
            columns: [
              { title: 'Ay', dataIndex: 'month', key: 'month' },
              { title: 'Ürün', dataIndex: 'product', key: 'product' },
              { title: 'Miktar', dataIndex: 'qty', key: 'qty', align: 'right', render: (v: unknown) => formatNumber(Number(v ?? 0), 2, false) },
            ],
            dataSource: rows,
          };
        }
        case 'product-sales-range': {
          const map = new Map<string, { product: string; qty: number; revenue: number }>();
          for (const o of orders) {
            eachRestOrderItem(o, (it: any) => {
              const pid = it.product_id != null && String(it.product_id).trim() !== '' ? String(it.product_id) : '';
              const pname = String(it.product_name ?? '—').trim() || '—';
              const k = pid || `name:${pname}`;
              const cur = map.get(k) || { product: pname, qty: 0, revenue: 0 };
              cur.qty += Number(it.quantity ?? 0);
              cur.revenue += Number(it.subtotal ?? 0);
              cur.product = pname;
              map.set(k, cur);
            });
          }
          const rows = Array.from(map.values())
            .sort((a, b) => b.qty - a.qty)
            .map((r, i) => ({
              key: `p-${i}`,
              product: r.product,
              qty: r.qty,
              revenue: r.revenue,
              avg: r.qty > 0 ? r.revenue / r.qty : 0,
            }));
          return {
            columns: [
              { title: tm('resProductColProduct'), dataIndex: 'product', key: 'product' },
              {
                title: tm('resProductColQty'),
                dataIndex: 'qty',
                key: 'qty',
                align: 'right',
                render: (v: unknown) => formatNumber(Number(v ?? 0), 2, false),
              },
              moneyCol(tm('resProductColRevenue'), 'revenue'),
              moneyCol(tm('resProductColAvgPrice'), 'avg'),
            ],
            dataSource: rows,
            chartData: rows.slice(0, 16).map((r) => ({ name: String(r.product), value: Number(r.qty) })),
          };
        }
        case 'category-monthly-qty': {
          const map = new Map<string, number>();
          for (const o of orders) {
            const mk = analysisMonthKeyFromOrder(o);
            if (!mk) continue;
            eachRestOrderItem(o, (it: any) => {
              const cat = String(it.category_name ?? 'Diğer').trim() || 'Diğer';
              const k = `${mk}\t${cat}`;
              map.set(k, (map.get(k) || 0) + Number(it.quantity ?? 0));
            });
          }
          const rows = Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([compound, qty]) => {
              const [ym, cat] = compound.split('\t');
              return { key: compound, month: formatAnalysisMonthTr(ym), category: cat, qty };
            });
          return {
            columns: [
              { title: 'Ay', dataIndex: 'month', key: 'month' },
              { title: 'Kategori', dataIndex: 'category', key: 'category' },
              { title: 'Miktar', dataIndex: 'qty', key: 'qty', align: 'right', render: (v: unknown) => formatNumber(Number(v ?? 0), 2, false) },
            ],
            dataSource: rows,
          };
        }
        case 'section-turnover': {
          const map = new Map<string, number>();
          for (const o of orders) {
            eachRestOrderItem(o, (it: any) => {
              const sec = String(it.course ?? 'Genel').trim() || 'Genel';
              map.set(sec, (map.get(sec) || 0) + Number(it.subtotal ?? 0));
            });
          }
          const rows = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([section, total]) => ({ key: section, section, total }));
          return {
            columns: [{ title: 'Bölüm (course)', dataIndex: 'section', key: 'section' }, moneyCol(`Tutar (${reportCurrency})`, 'total')],
            dataSource: rows,
            chartData: rows.map(r => ({ name: String(r.section), value: Number(r.total) })),
          };
        }
        case 'region-turnover': {
          const map = new Map<string, number>();
          for (const o of orders) {
            const fid = o.floor_id != null ? String(o.floor_id) : '';
            const label = fid ? floorNameById[fid] || `Kat ${fid.slice(0, 8)}…` : 'Kat atanmamış';
            map.set(label, (map.get(label) || 0) + restOrderNetAmount(o));
          }
          const rows = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([region, total]) => ({ key: region, region, total }));
          return {
            columns: [{ title: 'Kat / Bölge', dataIndex: 'region', key: 'region' }, moneyCol(`Ciro (${reportCurrency})`, 'total')],
            dataSource: rows,
            chartData: rows.map(r => ({ name: String(r.region), value: Number(r.total) })),
          };
        }
        case 'table-turnover': {
          const map = new Map<string, number>();
          for (const o of orders) {
            const t = String(o.table_number ?? '—').trim() || '—';
            map.set(t, (map.get(t) || 0) + restOrderNetAmount(o));
          }
          const rows = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([table, total]) => ({ key: table, table, total }));
          return {
            columns: [{ title: 'Masa', dataIndex: 'table', key: 'table' }, moneyCol(`Ciro (${reportCurrency})`, 'total')],
            dataSource: rows,
            chartData: rows.slice(0, 20).map(r => ({ name: String(r.table), value: Number(r.total) })),
          };
        }
        case 'collections-by-month': {
          const map = new Map<string, { total: number; cash: number; card: number; other: number }>();
          for (const o of orders) {
            const mk = analysisMonthKeyFromOrder(o);
            if (!mk) continue;
            const net = restOrderNetAmount(o);
            const row = map.get(mk) || { total: 0, cash: 0, card: 0, other: 0 };
            row.total += net;
            const pm = restOrderPaymentMethod(o);
            if (isRestaurantPaymentCashLike(pm)) row.cash += net;
            else if (isRestaurantPaymentCardLike(pm)) row.card += net;
            else row.other += net;
            map.set(mk, row);
          }
          const rows = Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([mk, v]) => ({
              key: mk,
              month: formatAnalysisMonthTr(mk),
              cash: v.cash,
              card: v.card,
              other: v.other,
              total: v.total,
            }));
          return {
            columns: [
              { title: 'Ay', dataIndex: 'month', key: 'month' },
              moneyCol(`Nakit (${reportCurrency})`, 'cash'),
              moneyCol(`Kart (${reportCurrency})`, 'card'),
              moneyCol(`Diğer (${reportCurrency})`, 'other'),
              moneyCol(`Toplam (${reportCurrency})`, 'total'),
            ],
            dataSource: rows,
            chartData: rows.map(r => ({ name: String(r.month), value: Number(r.total) })),
          };
        }
        default:
          return { columns: [], dataSource: [] };
      }
    }

    const retailSales = salesForAnalysis;
    const categoryOf = (productId: string) => {
      const p = products.find(x => x.id === productId);
      return String(p?.category ?? 'Diğer').trim() || 'Diğer';
    };

    switch (kind) {
      case 'sales-by-month': {
        const map = new Map<string, number>();
        for (const s of retailSales) {
          const mk = saleMonthKeyFromDate(s.date);
          if (!mk) continue;
          map.set(mk, (map.get(mk) || 0) + Number(s.total ?? 0));
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([mk, total]) => ({ key: mk, month: formatAnalysisMonthTr(mk), total }));
        return {
          columns: [{ title: 'Ay', dataIndex: 'month', key: 'month' }, moneyCol(`Tutar (${reportCurrency})`, 'total')],
          dataSource: rows,
          chartData: rows.map(r => ({ name: String(r.month), value: Number(r.total) })),
        };
      }
      case 'user-turnover': {
        const map = new Map<string, number>();
        for (const s of retailSales) {
          const w = String(s.cashier ?? 'Genel').trim() || 'Genel';
          map.set(w, (map.get(w) || 0) + Number(s.total ?? 0));
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([user, total]) => ({ key: user, user, total }));
        return {
          columns: [{ title: 'Kasiyer', dataIndex: 'user', key: 'user' }, moneyCol('Ciro', 'total')],
          dataSource: rows,
          chartData: rows.slice(0, 16).map(r => ({ name: String(r.user), value: Number(r.total) })),
        };
      }
      case 'category-monthly-revenue': {
        const map = new Map<string, number>();
        for (const s of retailSales) {
          const mk = saleMonthKeyFromDate(s.date);
          if (!mk) continue;
          for (const it of s.items || []) {
            const cat = categoryOf(it.productId);
            const k = `${mk}\t${cat}`;
            map.set(k, (map.get(k) || 0) + Number(it.total ?? 0));
          }
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([compound, total]) => {
            const [ym, cat] = compound.split('\t');
            return { key: compound, month: formatAnalysisMonthTr(ym), category: cat, total };
          });
        return {
          columns: [
            { title: 'Ay', dataIndex: 'month', key: 'month' },
            { title: 'Kategori', dataIndex: 'category', key: 'category' },
            moneyCol(`Tutar (${reportCurrency})`, 'total'),
          ],
          dataSource: rows,
        };
      }
      case 'product-monthly-qty': {
        const map = new Map<string, number>();
        for (const s of retailSales) {
          const mk = saleMonthKeyFromDate(s.date);
          if (!mk) continue;
          for (const it of s.items || []) {
            const name = String(it.productName ?? '—').trim() || '—';
            const k = `${mk}\t${name}`;
            map.set(k, (map.get(k) || 0) + Number(it.quantity ?? 0));
          }
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([compound, qty]) => {
            const [ym, name] = compound.split('\t');
            return { key: compound, month: formatAnalysisMonthTr(ym), product: name, qty };
          });
        return {
          columns: [
            { title: 'Ay', dataIndex: 'month', key: 'month' },
            { title: 'Ürün', dataIndex: 'product', key: 'product' },
            { title: 'Miktar', dataIndex: 'qty', key: 'qty', align: 'right', render: (v: unknown) => formatNumber(Number(v ?? 0), 2, false) },
          ],
          dataSource: rows,
        };
      }
      case 'product-sales-range': {
        const map = new Map<string, { product: string; qty: number; revenue: number }>();
        for (const s of retailSales) {
          for (const it of s.items || []) {
            const pid = it.productId != null && String(it.productId).trim() !== '' ? String(it.productId) : '';
            const pname = String(it.productName ?? '—').trim() || '—';
            const k = pid || `name:${pname}`;
            const cur = map.get(k) || { product: pname, qty: 0, revenue: 0 };
            cur.qty += Number(it.quantity ?? 0);
            cur.revenue += Number(it.total ?? 0);
            cur.product = pname;
            map.set(k, cur);
          }
        }
        const rows = Array.from(map.values())
          .sort((a, b) => b.qty - a.qty)
          .map((r, i) => ({
            key: `rp-${i}`,
            product: r.product,
            qty: r.qty,
            revenue: r.revenue,
            avg: r.qty > 0 ? r.revenue / r.qty : 0,
          }));
        return {
          columns: [
            { title: tm('resProductColProduct'), dataIndex: 'product', key: 'product' },
            {
              title: tm('resProductColQty'),
              dataIndex: 'qty',
              key: 'qty',
              align: 'right',
              render: (v: unknown) => formatNumber(Number(v ?? 0), 2, false),
            },
            moneyCol(tm('resProductColRevenue'), 'revenue'),
            moneyCol(tm('resProductColAvgPrice'), 'avg'),
          ],
          dataSource: rows,
          chartData: rows.slice(0, 16).map((r) => ({ name: String(r.product), value: Number(r.qty) })),
        };
      }
      case 'category-monthly-qty': {
        const map = new Map<string, number>();
        for (const s of retailSales) {
          const mk = saleMonthKeyFromDate(s.date);
          if (!mk) continue;
          for (const it of s.items || []) {
            const cat = categoryOf(it.productId);
            const k = `${mk}\t${cat}`;
            map.set(k, (map.get(k) || 0) + Number(it.quantity ?? 0));
          }
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([compound, qty]) => {
            const [ym, cat] = compound.split('\t');
            return { key: compound, month: formatAnalysisMonthTr(ym), category: cat, qty };
          });
        return {
          columns: [
            { title: 'Ay', dataIndex: 'month', key: 'month' },
            { title: 'Kategori', dataIndex: 'category', key: 'category' },
            { title: 'Miktar', dataIndex: 'qty', key: 'qty', align: 'right', render: (v: unknown) => formatNumber(Number(v ?? 0), 2, false) },
          ],
          dataSource: rows,
        };
      }
      case 'section-turnover': {
        const map = new Map<string, number>();
        for (const s of retailSales) {
          for (const it of s.items || []) {
            const sec = categoryOf(it.productId);
            map.set(sec, (map.get(sec) || 0) + Number(it.total ?? 0));
          }
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([section, total]) => ({ key: section, section, total }));
        return {
          columns: [{ title: 'Kategori (bölüm)', dataIndex: 'section', key: 'section' }, moneyCol(`Tutar (${reportCurrency})`, 'total')],
          dataSource: rows,
          chartData: rows.map(r => ({ name: String(r.section), value: Number(r.total) })),
        };
      }
      case 'region-turnover': {
        const map = new Map<string, number>();
        for (const s of retailSales) {
          const label = s.storeId ? String(s.storeId) : 'Mağaza';
          map.set(label, (map.get(label) || 0) + Number(s.total ?? 0));
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([region, total]) => ({ key: region, region, total }));
        return {
          columns: [{ title: 'Mağaza / Alan', dataIndex: 'region', key: 'region' }, moneyCol(`Ciro (${reportCurrency})`, 'total')],
          dataSource: rows,
          chartData: rows.map(r => ({ name: String(r.region), value: Number(r.total) })),
        };
      }
      case 'table-turnover': {
        const map = new Map<string, number>();
        for (const s of retailSales) {
          const t = String(s.table ?? '—').trim() || '—';
          map.set(t, (map.get(t) || 0) + Number(s.total ?? 0));
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([table, total]) => ({ key: table, table, total }));
        return {
          columns: [{ title: 'Masa / Not', dataIndex: 'table', key: 'table' }, moneyCol(`Tutar (${reportCurrency})`, 'total')],
          dataSource: rows,
          chartData: rows.slice(0, 20).map(r => ({ name: String(r.table), value: Number(r.total) })),
        };
      }
      case 'collections-by-month': {
        const map = new Map<string, { total: number; cash: number; card: number; other: number }>();
        for (const s of retailSales) {
          const mk = saleMonthKeyFromDate(s.date);
          if (!mk) continue;
          const net = Number(s.total ?? 0);
          const row = map.get(mk) || { total: 0, cash: 0, card: 0, other: 0 };
          row.total += net;
          const pm = String(s.paymentMethod ?? '');
          if (pm === 'cash') row.cash += net;
          else if (pm === 'card' || pm === 'gateway') row.card += net;
          else row.other += net;
          map.set(mk, row);
        }
        const rows = Array.from(map.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([mk, v]) => ({
            key: mk,
            month: formatAnalysisMonthTr(mk),
            cash: v.cash,
            card: v.card,
            other: v.other,
            total: v.total,
          }));
        return {
          columns: [
            { title: 'Ay', dataIndex: 'month', key: 'month' },
            moneyCol(`Nakit (${reportCurrency})`, 'cash'),
            moneyCol(`Kart (${reportCurrency})`, 'card'),
            moneyCol(`Diğer (${reportCurrency})`, 'other'),
            moneyCol(`Toplam (${reportCurrency})`, 'total'),
          ],
          dataSource: rows,
          chartData: rows.map(r => ({ name: String(r.month), value: Number(r.total) })),
        };
      }
      default:
        return { columns: [], dataSource: [] };
    }
  };

  // Menu Groups Based on Business Type
  const getMenuItems = (): any[] => {
    const commonGroups = [
      {
        key: 'grp-general',
        label: tm('genelYapayZeka'),
        type: 'group',
        children: [
          { key: 'chat-ai', label: tm('aiAsistan'), icon: <RobotOutlined /> },
          { key: 'daily-sales-executive', label: tm('yoneticiGunlukSatis'), icon: <RiseOutlined /> },
          { key: 'daily', label: tm('gunlukRapor'), icon: <CalendarOutlined /> },
          { key: 'end-of-day', label: tm('gunSonuRaporu'), icon: <HistoryOutlined /> },
          { key: 'z-report', label: tm('zRaporu'), icon: <PrinterOutlined /> },
          { key: 'comparison', label: tm('donemKarsilastirma'), icon: <SwapOutlined /> },
        ],
      },
      {
        key: 'grp-sales',
        label: tm('satisAnalizleri'),
        type: 'group',
        children: [
          { key: 'top-products', label: tm('enCokSatanlar'), icon: <LineChartOutlined /> },
          { key: 'category-analysis', label: tm('kategoriAnalizi'), icon: <PieChartOutlined /> },
          { key: 'hourly-analysis', label: tm('saatlikAnaliz'), icon: <ClockCircleOutlined /> },
          { key: 'cashiers', label: tm('kasiyerPerformansi'), icon: <TeamOutlined /> },
          { key: 'customer-sales', label: tm('musteriSatis'), icon: <UserOutlined /> },
          { key: 'sales-trend', label: tm('satisTrendAnalizi'), icon: <RiseOutlined /> },
          { key: 'sales-target', label: tm('hedefVsGerceklesen'), icon: <ThunderboltOutlined /> },
          { key: 'detailed-sales', label: tm('detayliSatisRaporu'), icon: <LineChartOutlined /> },
          { key: 'analysis', label: tm('analiz'), icon: <BarChart3 /> },
        ],
      },
      {
        key: 'grp-financial',
        label: tm('finansalRaporlar'),
        type: 'group',
        children: [
          { key: 'profit-loss', label: tm('karZararRaporu'), icon: <AccountBookOutlined /> },
          { key: 'cash-flow', label: tm('nakitAkisRaporu'), icon: <TransactionOutlined /> },
          { key: 'debt-aging', label: tm('borcAlacakYaslandirma'), icon: <HistoryOutlined /> },
          { key: 'check-tracking', label: tm('cekSenetTakibi'), icon: <AuditOutlined /> },
          { key: 'current-account', label: tm('cariHesapOzeti'), icon: <BankOutlined /> },
        ],
      },
      {
        key: 'grp-inventory',
        label: tm('stokRaporlari'),
        type: 'group',
        children: [
          { key: 'stock-status', label: tm('stockStatus'), icon: <DatabaseOutlined /> },
          { key: 'stock-aging', label: tm('stokYaslandirma'), icon: <HourglassOutlined /> },
          { key: 'stock-turnover', label: tm('stokDonusHizi'), icon: <RetweetOutlined /> },
          { key: 'stock-abc', label: tm('stokAbcAnalizi'), icon: <ApartmentOutlined /> },
          { key: 'materials', label: tm('malHareketRaporu'), icon: <DeploymentUnitOutlined /> },
          { key: 'expiring-products', label: tm('sktYaklasanlar'), icon: <ExclamationCircleOutlined /> },
        ],
      },
      {
        key: 'grp-payment',
        label: tm('odemeVeIslemler'),
        type: 'group',
        children: [
          { key: 'payment-distribution', label: tm('odemeDagilimi'), icon: <CreditCardOutlined /> },
          { key: 'discount-report', label: tm('indirimRaporu'), icon: <TagsOutlined /> },
          { key: 'cash-status', label: tm('kasaDurumu'), icon: <BankOutlined /> },
          { key: 'commission', label: tm('komisyonRaporu'), icon: <SafetyCertificateOutlined /> },
          { key: 'cash-report', label: tm('kasaRaporu'), icon: <BankOutlined /> },
        ],
      },
    ];

    return filterReportMenuGroups([
      ...commonGroups,
      {
        key: 'grp-business-specific',
        label: bizConfig.groupLabel,
        type: 'group',
        children: businessType === 'restaurant' ? [
          { key: 'product-reports', label: tm('resProductQtyReportTitle'), icon: <ShoppingCart className="w-4 h-4" /> },
          { key: 'category-reports', label: tm('kategoriRaporlari'), icon: <PieChartIcon className="w-4 h-4" /> },
          { key: 'staff-reports', label: tm('personelRaporlari'), icon: <User className="w-4 h-4" /> },
          { key: 'staff-performance', label: tm('staffPerformance'), icon: <TrendingUp className="w-4 h-4" /> },
          { key: 'table-reports', label: tm('masaRaporlari'), icon: <ApartmentOutlined /> },
          { key: 'payment-reports', label: tm('odemeRaporlari'), icon: <CreditCard className="w-4 h-4" /> },
          { key: 'discount-reports', label: tm('indirimRaporlari'), icon: <Percent className="w-4 h-4" /> },
          { key: 'sales-movements', label: tm('satisHareketRaporu'), icon: <RiseOutlined /> },
          { key: 'receipts', label: tm('adisyonlar'), icon: <FileText className="w-4 h-4" /> },
          { key: 'courier-reports', label: tm('kuryeRaporlari'), icon: <Package className="w-4 h-4" /> },
          { key: 'cash-register-reports', label: tm('yazarkasaRaporlari'), icon: <PrinterOutlined /> },
          { key: 'turnover-reports', label: tm('ciroRaporlari'), icon: <Banknote className="w-4 h-4" /> },
        ] : businessType === 'beauty' ? [
          { key: 'beauty-service-report', label: tm('beautyServiceBreakdownReport'), icon: <DeploymentUnitOutlined /> },
          { key: 'detailed-sales', label: tm('detayliSatisRaporu'), icon: <LineChartOutlined /> },
          { key: 'analysis', label: tm('analiz'), icon: <PieChartOutlined /> },
        ] : [
          { key: 'detailed-sales', label: tm('detayliSatisRaporu'), icon: <LineChartOutlined /> },
          { key: 'analysis', label: tm('analiz'), icon: <PieChartOutlined /> },
        ]
      }
    ]);
  };

  const menuItems = getMenuItems();

  return (
    <ConfigProvider theme={retailexAntdThemeWithPrimary(bizConfig.color)}>
      <Layout className="h-full bg-slate-50 overflow-hidden">
        {/* Sol Sidebar */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(value) => setCollapsed(value)}
          width={280}
          theme="light"
          className="border-r border-slate-200 shadow-sm z-10"
          style={{ overflow: 'auto', height: '100%', position: 'relative' }}
        >
          <div className="p-4 border-b border-slate-100 flex items-center gap-3 bg-white sticky top-0 z-20 h-[72px]">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0"
              style={{ backgroundColor: bizConfig.color, boxShadow: `0 10px 15px -3px ${bizConfig.color}44` }}>
              {bizConfig.icon}
            </div>
            {!collapsed && (
              <div className="overflow-hidden">
                <h2 className="text-base font-black text-slate-800 leading-tight truncate">{bizConfig.title}</h2>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">{tm('analizStats')}</p>
              </div>
            )}
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selectedTab]}
            defaultOpenKeys={['grp-general', 'grp-sales']}
            onClick={({ key }) => setSelectedTab(key as ReportTab)}
            items={menuItems}
            className="border-none py-2"
          />
        </Sider>

        <Layout className="h-full flex flex-col overflow-hidden bg-slate-50">
          {/* Header */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0 h-[72px]">
            <div>
              <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
                {menuItems.flatMap(g => g.children).find(i => i?.key === selectedTab)?.label || tm('report')}
              </h1>
              <p className="text-xs text-slate-500 font-medium">{tm('checkDataAndPerformance')}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Ekstra butonlar buraya gelebilir, örneğin genel dışa aktar */}
            </div>
          </div>

          <Content className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'thin' }}>

            {selectedTab === 'daily' && (
              <div className="space-y-4">
                {/* Date Selector */}
                <div className="bg-white rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-gray-600" />
                        <span>Tarih Seçin:</span>
                      </label>
                      <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <Dropdown
                      menu={{
                        items: [
                          { key: 'a4', label: 'A4 sayfa' },
                          { key: '80mm', label: '80 mm termal fiş' },
                        ],
                        onClick: ({ key }) =>
                          printDailySalesReport(key as 'a4' | '80mm'),
                      }}
                      trigger={['click']}
                    >
                      <Button type="primary" icon={<PrinterOutlined />}>
                        Yazdır <CaretDownOutlined />
                      </Button>
                    </Dropdown>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg p-4 border-2" style={{ borderColor: `${bizConfig.color}44` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Toplam Satış</p>
                        <p className="text-3xl font-bold mt-1" style={{ color: bizConfig.color }}>{dailyUnifiedRows.length}</p>
                      </div>
                      <ShoppingCart className="w-12 h-12 opacity-20" style={{ color: bizConfig.color }} />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border-2" style={{ borderColor: `${bizConfig.color}44` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Toplam Ciro</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: bizConfig.color }}>{formatNumber(dailyTotal, 2, false)}</p>
                      </div>
                      <Banknote className="w-12 h-12 opacity-20" style={{ color: bizConfig.color }} />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border-2 border-orange-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Toplam İndirim</p>
                        <p className="text-2xl font-bold mt-1 text-orange-600">{formatNumber(dailyDiscount, 2, false)}</p>
                      </div>
                      <Percent className="w-12 h-12 text-orange-400 opacity-30" />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border-2" style={{ borderColor: `${bizConfig.color}44` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Nakit</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: bizConfig.color }}>{formatNumber(dailyCash, 2, false)}</p>
                      </div>
                      <Banknote className="w-12 h-12 opacity-20" style={{ color: bizConfig.color }} />
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-4 border-2" style={{ borderColor: `${bizConfig.color}44` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Kart</p>
                        <p className="text-2xl font-bold mt-1" style={{ color: bizConfig.color }}>{formatNumber(dailyCard, 2, false)}</p>
                      </div>
                      <CreditCard className="w-12 h-12 opacity-20" style={{ color: bizConfig.color }} />
                    </div>
                  </div>
                </div>

                {/* Sales List */}
                <div className="bg-white rounded-lg border">
                  <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg">Satış Detayları</h3>
                      <p className="text-xs text-slate-500 mt-1">Satıra tıklayarak fiş önizlemesi açılır.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                    <table className="w-full min-w-[1020px]">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm">Fiş No</th>
                          <th className="px-4 py-3 text-left text-sm">Saat</th>
                          <th className="px-4 py-3 text-left text-sm">Kasiyer</th>
                          <th className="px-4 py-3 text-left text-sm">Müşteri</th>
                          <th className="px-4 py-3 text-right text-sm">İndirim öncesi</th>
                          <th className="px-4 py-3 text-right text-sm">İndirim</th>
                          <th className="px-4 py-3 text-right text-sm font-semibold">Net tutar</th>
                          <th className="px-4 py-3 text-left text-sm">Ödeme</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {dailyUnifiedRows.map((row) => (
                          <tr
                            key={row.key}
                            role="button"
                            tabIndex={0}
                            className="hover:bg-blue-50/80 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-inset"
                            onClick={() => void openDailyRowReceiptModal(row)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                void openDailyRowReceiptModal(row);
                              }
                            }}
                          >
                            <td className="px-4 py-3 text-sm font-medium text-blue-700 underline-offset-2">{row.receiptNumber}</td>
                            <td className="px-4 py-3 text-sm">
                              {new Date(row.date).toLocaleTimeString('tr-TR')}
                            </td>
                            <td className="px-4 py-3 text-sm">{row.cashier || '-'}</td>
                            <td className="px-4 py-3 text-sm">{row.customerName || '-'}</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-700 tabular-nums">
                              {formatNumber(row.beforeDiscount ?? (row.total + (row.discount ?? 0)), 2, false)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-orange-700 tabular-nums">
                              {formatNumber(row.discount ?? 0, 2, false)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium tabular-nums">{formatNumber(row.total, 2, false)}</td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 rounded text-xs ${
                                  row.paymentMethod === 'cash'
                                    ? 'bg-green-100 text-green-700'
                                    : row.paymentMethod === 'card' || row.paymentMethod === 'gateway'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {row.paymentMethod === 'cash'
                                  ? 'Nakit'
                                  : row.paymentMethod === 'card' || row.paymentMethod === 'gateway'
                                    ? 'Kart'
                                    : 'Diğer'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <Modal
              title={
                dailyRowReceiptModal
                  ? `Fiş — ${dailyRowReceiptModal.receiptNumber}`
                  : 'Fiş'
              }
              open={dailyRowReceiptModal != null}
              onCancel={closeDailyRowReceiptModal}
              width={560}
              styles={{ body: { maxHeight: 'min(88vh, 900px)', overflow: 'auto' } }}
              destroyOnClose
              footer={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canDeleteErpSale &&
                    dailyRowReceiptModal?.source === 'erp' &&
                    dailyRowReceiptModal.erpSale &&
                    isSaleRowUuid(String(dailyRowReceiptModal.erpSale.id)) && (
                      <Button danger onClick={() => void handleDeleteDailyErpSale()}>
                        Faturayı sil
                      </Button>
                    )}
                  {canDeleteErpSale &&
                    dailyRowReceiptModal?.source === 'rest' &&
                    dailyRowReceiptModal.restOrder?.id != null &&
                    String(dailyRowReceiptModal.restOrder.id).trim() !== '' && (
                      <Button danger onClick={() => void handleDeleteDailyRestOrder()}>
                        Adisyon kaydını iptal et
                      </Button>
                    )}
                  <Button onClick={printDailyRowReceipt} disabled={!dailyRowReceiptHtml || dailyRowReceiptLoading}>
                    Yazdır
                  </Button>
                  <Button type="primary" onClick={closeDailyRowReceiptModal}>
                    Kapat
                  </Button>
                </div>
              }
            >
              {dailyRowReceiptLoading ? (
                <div className="flex justify-center py-12">
                  <Spin />
                </div>
              ) : dailyRowReceiptModal?.source === 'rest' ? (
                <p className="text-xs text-amber-700 mb-2">
                  Bu satır yalnızca adisyon kaydıdır (ERP satış faturası yok). Yetkiliyseniz aşağıdan adisyon kaydını iptal edebilirsiniz; iptal edilen kayıt kapalı sipariş
                  listesinde görünmez. ERP fişi olan satırlarda silme, alttaki «Faturayı sil» düğmesiyle yapılır.
                </p>
              ) : null}
              {dailyRowReceiptHtml ? (
                <div
                  className="border border-slate-200 rounded-lg bg-white"
                  style={{ maxWidth: '100%' }}
                >
                  <iframe
                    key={`${dailyRowReceiptModal?.receiptNumber ?? 'r'}-${dailyRowReceiptHtml.length}`}
                    title="Fiş önizleme"
                    className="w-full border-0 bg-white"
                    style={{ height: dailyRowReceiptPreviewH, minHeight: 280, display: 'block' }}
                    srcDoc={dailyRowReceiptHtml}
                    onLoad={(e) => {
                      const iframe = e.currentTarget;
                      requestAnimationFrame(() => {
                        try {
                          const d = iframe.contentDocument;
                          const inner =
                            d?.documentElement?.scrollHeight ?? d?.body?.scrollHeight ?? 520;
                          const cap =
                            typeof window !== 'undefined'
                              ? Math.floor(window.innerHeight * 0.82)
                              : 720;
                          setDailyRowReceiptPreviewH(Math.min(Math.max(inner + 24, 320), cap));
                        } catch {
                          setDailyRowReceiptPreviewH(720);
                        }
                      });
                    }}
                  />
                </div>
              ) : !dailyRowReceiptLoading ? (
                <p className="text-sm text-slate-500">Önizleme yok.</p>
              ) : null}
            </Modal>

            {selectedTab === 'z-report' && (
              <div className="space-y-4">
                <div className="bg-white rounded-lg border">
                  <div className="p-6 border-b flex items-center justify-between">
                    <div>
                      <h3 className="text-xl">Gün Sonu Z Raporu</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {new Date(zReport.date).toLocaleDateString('tr-TR', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <button
                      onClick={printZReport}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <Download className="w-5 h-5" />
                      Yazdır
                    </button>
                  </div>

                  <div className="p-6 space-y-6">
                    {/* Sales Summary */}
                    <div>
                      <h4 className="text-sm text-gray-600 mb-3">SATIŞ ÖZETİ</h4>
                      <p className="text-xs text-slate-500 mb-3">
                        Ciro: indirim öncesi (brüt) → indirim → net (tahsil edilen tutarlar toplamı).
                      </p>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">Toplam İşlem</p>
                          <p className="text-3xl text-blue-600 mt-1">{zReport.totalSales}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                          <p className="text-sm text-gray-600">İndirim öncesi (brüt)</p>
                          <p className="text-2xl font-bold text-slate-800 mt-1">{formatNumber(zReport.amountBeforeDiscount, 2, false)}</p>
                        </div>
                        <div className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                          <p className="text-sm text-gray-600">Toplam İndirim</p>
                          <p className="text-2xl font-bold text-orange-600 mt-1">{formatNumber(zReport.totalDiscount, 2, false)}</p>
                        </div>
                        <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                          <p className="text-sm text-gray-600">Net Ciro</p>
                          <p className="text-2xl font-bold text-green-700 mt-1">{formatNumber(zReport.totalAmount, 2, false)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Payment Summary */}
                    <div>
                      <h4 className="text-sm text-gray-600 mb-3">ÖDEME ÖZETİ</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <span>Nakit Ödemeler</span>
                          <span className="text-lg">{formatNumber(zReport.cashAmount, 2, false)}</span>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                          <span>Kart Ödemeleri</span>
                          <span className="text-lg">{formatNumber(zReport.cardAmount, 2, false)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Receipt Range */}
                    <div>
                      <h4 className="text-sm text-gray-600 mb-3">FİŞ ARALIĞI</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">İlk Fiş</p>
                          <p className="text-lg mt-1">{zReport.firstSale}</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600">Son Fiş</p>
                          <p className="text-lg mt-1">{zReport.lastSale}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedTab === 'cashiers' && (
              <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                  <h3 className="text-lg">{tm('cashierPerformanceReport')}</h3>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                  <table className="w-full min-w-[800px]">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm">{tm('cashierLabel')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('transactionCount')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('totalRevenueLabel')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('avgSaleLabel')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('cashLabel')}</th>
                        <th className="px-4 py-3 text-right text-sm">{tm('cardLabel')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cashierPerformance.map(cashier => (
                        <tr key={cashier.name} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white text-sm">
                                {cashier.name && cashier.name.length > 0 ? cashier.name.charAt(0).toUpperCase() : '?'}
                              </div>
                              <span>{cashier.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                              {cashier.salesCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-lg text-green-600">
                            {formatNumber(cashier.totalRevenue, 2, false)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatNumber(cashier.avgSale, 2, false)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatNumber(cashier.cashSales, 2, false)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatNumber(cashier.cardSales, 2, false)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedTab === 'top-products' && (() => {
              const topProducts = getTopProducts(20);
              return (
                <div className="space-y-4">
                  <div className="bg-white rounded-lg border p-4">
                    <h3 className="text-lg mb-4 flex items-center gap-2">
                      <Award className="w-5 h-5 text-yellow-600" />
                      {tm('enCokSatanlar')} (TOP 20)
                    </h3>
                    {topProducts.length === 0 ? (
                      <p className="text-sm text-slate-500 py-8 text-center">
                        Seçili güne ait satış kalemi yok. Tarihi değiştirin veya restoran modunda kapalı siparişlerin yüklendiğinden emin olun.
                      </p>
                    ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[900px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">{tm('rankLabel')}</th>
                            <th className="px-4 py-3 text-left text-sm">{tm('productNameLabel')}</th>
                            <th className="px-4 py-3 text-left text-sm">{tm('categoryLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('salesQuantityLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('totalRevenueLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('avgPriceLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('stockLabel')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {topProducts.map((product) => (
                            <tr key={product.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className={`w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold ${product.rank <= 3 ? 'bg-yellow-500' : 'bg-gray-400'
                                  }`}>
                                  {product.rank}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-medium">{product.name}</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{product.category}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-semibold">
                                  {product.quantity}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-green-600 font-semibold">
                                {formatNumber(product.revenue, 2, false)} {reportCurrency}
                              </td>
                              <td className="px-4 py-3 text-right text-sm">{formatNumber(product.avgPrice, 2, false)} {reportCurrency}</td>
                              <td className="px-4 py-3 text-right">
                                <span className={`px-2 py-1 rounded text-sm ${product.stock < 30 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                  {product.stock}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'category-analysis' && (() => {
              const categories = getCategoryAnalysis();
              const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF7300'];
              return (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    Kategori dağılımı, üstteki <strong>tarih seçicisindeki güne</strong> göre hesaplanır.
                  </p>
                  {categories.length === 0 ? (
                    <div className="bg-white rounded-lg border p-12 text-center text-slate-500">
                      Bu gün için kategori satışı bulunamadı (veya ürün–kategori eşlemesi yok).
                    </div>
                  ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-4 flex items-center gap-2">
                        <PieChartIcon className="w-5 h-5 text-blue-600" />
                        {tm('categoryDistributionRevenue')}
                      </h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <RePieChart>
                          <Pie
                            data={categories.slice(0, 8).map((c, i) => ({ name: c.name, value: c.totalRevenue, fill: COLORS[i % COLORS.length] }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {categories.slice(0, 8).map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatNumber(value, 2, false)} />
                        </RePieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-4 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-green-600" />
                        {tm('categoryPerformance')}
                      </h3>
                      <div className="overflow-x-auto overflow-y-auto max-h-[300px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                        <table className="w-full min-w-[700px]">
                          <thead className="bg-gray-50 border-b sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm">{tm('categoryLabel')}</th>
                              <th className="px-4 py-2 text-right text-sm">{tm('totalRevenueLabel')}</th>
                              <th className="px-4 py-2 text-right text-sm">{tm('salesQuantityLabel')}</th>
                              <th className="px-4 py-2 text-right text-sm">{tm('avgPriceLabel')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {categories.map((cat, idx) => (
                              <tr key={cat.name} className="hover:bg-gray-50">
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                                    {cat.name}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right font-semibold text-green-600">
                                  {formatNumber(cat.totalRevenue, 2, false)} {reportCurrency}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                                    {cat.totalQuantity}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-sm">{formatNumber(cat.avgPrice, 2, false)} {reportCurrency}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              );
            })()}

            {selectedTab === 'hourly-analysis' && (() => {
              const hourlyData = getHourlyAnalysis();
              return (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    Saatlik dağılım, <strong>seçili güne</strong> ait fiş/adisyon saatine göre (yerel saat) hesaplanır.
                  </p>
                  {hourlyData.length === 0 ? (
                    <div className="bg-white rounded-lg border p-12 text-center text-slate-500">
                      Bu gün için saatlik satış kaydı yok.
                    </div>
                  ) : (
                  <>
                  <div className="bg-white rounded-lg border p-4">
                    <h3 className="text-lg mb-4 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-purple-600" />
                      {tm('hourlySalesAnalysis')}
                    </h3>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={hourlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" />
                        <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                        <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="sales" fill="#3b82f6" name={tm('transactionCount')} />
                        <Bar yAxisId="right" dataKey="revenue" fill="#10b981" name={tm('totalRevenueLabel') + ' (' + reportCurrency + ')'} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b">
                      <h4 className="text-md">{tm('detailedHourlyData')}</h4>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[700px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">{tm('hourLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('transactionCount')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('totalRevenueLabel')}</th>
                            <th className="px-4 py-3 text-right text-sm">{tm('avgSaleLabel')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {hourlyData.map((hour) => (
                            <tr key={hour.hour} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium">{hour.label}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                                  {hour.sales}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-green-600 font-semibold">
                                {formatNumber(hour.revenue, 2, false)} {reportCurrency}
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {hour.sales > 0 ? formatNumber(hour.revenue / hour.sales, 2, false) : '0'} {reportCurrency}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  </>
                  )}
                </div>
              );
            })()}

            {selectedTab === 'cash-status' && (() => {
              const cashStatus = getCashStatus();
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('openingCash')}</p>
                          <p className="text-2xl text-blue-600 mt-1 font-bold">{formatNumber(cashStatus.openingCash, 2, false)} {reportCurrency}</p>
                          {selectedDate !== localTodayDateKey() && (
                            <p className="text-xs text-amber-700 mt-1 max-w-[14rem] leading-snug">
                              Geçmiş gün seçili: açılış tutarı yalnızca bugün ve bu cihazdaki kasa açılışından okunur.
                            </p>
                          )}
                        </div>
                        <Banknote className="w-12 h-12 text-blue-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-green-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('todayCash')}</p>
                          <p className="text-2xl text-green-600 mt-1 font-bold">{formatNumber(cashStatus.todayCash, 2, false)} {reportCurrency}</p>
                        </div>
                        <Banknote className="w-12 h-12 text-green-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-purple-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('todayCard')}</p>
                          <p className="text-2xl text-purple-600 mt-1 font-bold">{formatNumber(cashStatus.todayCard, 2, false)} {reportCurrency}</p>
                        </div>
                        <CreditCard className="w-12 h-12 text-purple-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('closingCash')}</p>
                          <p className="text-2xl text-orange-600 mt-1 font-bold">{formatNumber(cashStatus.closingCash, 2, false)} {reportCurrency}</p>
                        </div>
                        <Banknote className="w-12 h-12 text-orange-600 opacity-20" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-4">{tm('paymentDistribution')}</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-green-500 rounded"></div>
                            {tm('cashLabel')}
                          </span>
                          <span className="font-semibold text-green-600">{formatNumber(cashStatus.todayCash, 2, false)} {reportCurrency}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-blue-500 rounded"></div>
                            {tm('cardLabel')}
                          </span>
                          <span className="font-semibold text-blue-600">{formatNumber(cashStatus.todayCard, 2, false)} {reportCurrency}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="flex items-center gap-2">
                            <div className="w-3 h-3 bg-orange-500 rounded"></div>
                            {tm('transferLabel')}
                          </span>
                          <span className="font-semibold text-orange-600">{formatNumber(cashStatus.todayTransfer, 2, false)} {reportCurrency}</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border-2 border-green-200">
                          <span className="font-semibold">{tm('totalLabel_rep')}</span>
                          <span className="font-bold text-green-700 text-lg">{formatNumber(cashStatus.todayTotal, 2, false)} {reportCurrency}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-4">{tm('cardTypes')}</h3>
                      <p className="text-xs text-gray-500 mb-3">
                        Fişlerde kart markası yok; ödeme tipine göre (kredi kartı / sanal POS) gruplanır.
                      </p>
                      <div className="space-y-3">
                        {cashStatus.cards.length === 0 ? (
                          <div className="p-4 text-center text-sm text-gray-500 bg-gray-50 rounded-lg">
                            Seçili günde kartlı ödeme yok veya tutar sıfır.
                          </div>
                        ) : (
                          cashStatus.cards.map((card) => (
                            <div key={card.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                              <span>{card.name}</span>
                              <span className="font-semibold text-blue-600">{formatNumber(card.amount, 2, false)} {reportCurrency}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'payment-distribution' && (() => {
              const paymentDist: any = getPaymentDistribution();
              const COLORS = ['#10b981', '#3b82f6', '#f59e0b'];
              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg border-2 border-green-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('cashLabel')}</p>
                          <p className="text-2xl text-green-600 mt-1 font-bold">{formatNumber(paymentDist.cash.amount, 2, false)} {reportCurrency}</p>
                          <p className="text-xs text-gray-500 mt-1">{paymentDist.cash.count} işlem ({paymentDist.cash.percentage.toFixed(1)}%)</p>
                        </div>
                        <Banknote className="w-12 h-12 text-green-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('cardLabel')}</p>
                          <p className="text-2xl text-blue-600 mt-1 font-bold">{formatNumber(paymentDist.card.amount, 2, false)} {reportCurrency}</p>
                          <p className="text-xs text-gray-500 mt-1">{paymentDist.card.count} işlem ({paymentDist.card.percentage.toFixed(1)}%)</p>
                        </div>
                        <CreditCard className="w-12 h-12 text-blue-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">{tm('transferLabel')}</p>
                          <p className="text-2xl text-orange-600 mt-1 font-bold">{formatNumber(paymentDist.transfer.amount, 2, false)} {reportCurrency}</p>
                          <p className="text-xs text-gray-500 mt-1">{paymentDist.transfer.count} işlem ({paymentDist.transfer.percentage.toFixed(1)}%)</p>
                        </div>
                        <CreditCard className="w-12 h-12 text-orange-600 opacity-20" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border p-4">
                    <h3 className="text-lg mb-4 flex items-center gap-2">
                      <PieChartIcon className="w-5 h-5 text-blue-600" />
                      Ödeme Yöntemi Dağılımı
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <ResponsiveContainer width="100%" height={300}>
                        <RePieChart>
                          <Pie
                            data={paymentDist.chartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {paymentDist.chartData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatNumber(value, 2, false)} />
                        </RePieChart>
                      </ResponsiveContainer>
                      <div className="space-y-3">
                        {paymentDist.chartData.map((item: any, idx: number) => (
                          <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS[idx] }}></div>
                              <span className="font-medium">{item.name}</span>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{formatNumber(item.value, 2, false)} {reportCurrency}</p>
                              <p className="text-xs text-gray-500">{item.count} işlem</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'discount-report' && (() => {
              const discounts = getDiscountReport();
              const totalDiscount = discounts.reduce((sum, d) => sum + d.discountAmount, 0);
              const totalCount = discounts.reduce((sum, d) => sum + d.salesCount, 0);
              return (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    İndirimler, yüklü satış fişlerindeki <strong>indirim alanı</strong> üzerinden gruplanır (tüm dönem).
                  </p>
                  <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Toplam İndirim Tutarı</p>
                        <p className="text-3xl text-orange-600 mt-1 font-bold">{formatNumber(totalDiscount, 2, false)} {reportCurrency}</p>
                        <p className="text-xs text-gray-500 mt-1">{totalCount} işlemde uygulandı</p>
                      </div>
                      <Percent className="w-16 h-16 text-orange-600 opacity-20" />
                    </div>
                  </div>

                  {discounts.length === 0 ? (
                    <div className="bg-white rounded-lg border p-12 text-center text-slate-500">
                      Kayıtlı fişlerde indirim satırı yok.
                    </div>
                  ) : (
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b">
                      <h3 className="text-lg flex items-center gap-2">
                        <Percent className="w-5 h-5 text-orange-600" />
                        İndirim Detayları
                      </h3>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[800px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">İndirim Türü</th>
                            <th className="px-4 py-3 text-right text-sm">İşlem Sayısı</th>
                            <th className="px-4 py-3 text-right text-sm">Toplam İndirim</th>
                            <th className="px-4 py-3 text-right text-sm">Ortalama İndirim</th>
                            <th className="px-4 py-3 text-right text-sm">Oran</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {discounts.map((discount) => (
                            <tr key={discount.name} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium">{discount.name}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                                  {discount.salesCount}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-orange-600 font-semibold">
                                {formatNumber(discount.discountAmount, 2, false)} {reportCurrency}
                              </td>
                              <td className="px-4 py-3 text-right text-sm">
                                {formatNumber(discount.avgDiscount, 2, false)} {reportCurrency}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-sm">
                                  {totalDiscount > 0 ? ((discount.discountAmount / totalDiscount) * 100).toFixed(1) : '0.0'}%
                                </span>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-bold">
                            <td className="px-4 py-3">TOPLAM</td>
                            <td className="px-4 py-3 text-right">{totalCount}</td>
                            <td className="px-4 py-3 text-right text-orange-600">{formatNumber(totalDiscount, 2, false)} {reportCurrency}</td>
                            <td className="px-4 py-3 text-right">
                              {totalCount > 0 ? formatNumber(totalDiscount / totalCount, 2, false) : '0'} {reportCurrency}
                            </td>
                            <td className="px-4 py-3 text-right">100%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  )}
                </div>
              );
            })()}

            {selectedTab === 'stock-status' && (() => {
              const stockStatus = getStockStatus();
              return (
                <div className="space-y-4">
                  {stockReportLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <Spin size="small" />
                      Ürün listesi veritabanından güncelleniyor…
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg border-2 border-blue-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Toplam Ürün</p>
                          <p className="text-3xl text-blue-600 mt-1 font-bold">{stockStatus.totalProducts}</p>
                        </div>
                        <Package className="w-12 h-12 text-blue-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-red-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Tükendi</p>
                          <p className="text-3xl text-red-600 mt-1 font-bold">{stockStatus.outOfStock}</p>
                        </div>
                        <AlertCircle className="w-12 h-12 text-red-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-orange-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Düşük Stok</p>
                          <p className="text-3xl text-orange-600 mt-1 font-bold">{stockStatus.lowStock}</p>
                        </div>
                        <TrendingDown className="w-12 h-12 text-orange-600 opacity-20" />
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border-2 border-green-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Stok Değeri</p>
                          <p className="text-xl text-green-600 mt-1 font-bold">{formatNumber(stockStatus.totalStockValue, 2, false)} {reportCurrency}</p>
                        </div>
                        <Banknote className="w-12 h-12 text-green-600 opacity-20" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b flex items-center justify-between">
                      <h3 className="text-lg flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-orange-600" />
                        Düşük Stok Uyarıları
                      </h3>
                      <span className="text-sm text-gray-600">
                        Varsayılan kritik seviye: {stockStatus.lowStockThreshold} adet (ürün min. stoku tanımlıysa o geçerli)
                      </span>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[900px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">Ürün Adı</th>
                            <th className="px-4 py-3 text-left text-sm">Kategori</th>
                            <th className="px-4 py-3 text-right text-sm">Mevcut Stok</th>
                            <th className="px-4 py-3 text-right text-sm">Min. Stok</th>
                            <th className="px-4 py-3 text-right text-sm">Fiyat</th>
                            <th className="px-4 py-3 text-right text-sm">Stok Değeri</th>
                            <th className="px-4 py-3 text-center text-sm">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {stockStatus.lowStockItems.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-10 text-center text-gray-500 text-sm">
                                Düşük stokta ürün yok.
                              </td>
                            </tr>
                          ) : (
                            stockStatus.lowStockItems.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium">{item.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{item.category}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`px-2 py-1 rounded text-sm font-semibold ${item.stock === 0
                                    ? 'bg-red-100 text-red-700'
                                    : item.stock <= item.minStock
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-green-100 text-green-700'
                                    }`}>
                                    {item.stock}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-sm">{item.minStock}</td>
                                <td className="px-4 py-3 text-right text-sm">{formatNumber(item.price, 2, false)} {reportCurrency}</td>
                                <td className="px-4 py-3 text-right text-sm">{formatNumber(item.value, 2, false)} {reportCurrency}</td>
                                <td className="px-4 py-3 text-center">
                                  {item.stock === 0 ? (
                                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Tükendi</span>
                                  ) : (
                                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Düşük</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'comparison' && (() => {
              const comparison = comparisonBundle;
              const w = comparison.windows;
              const rangeLine = `${formatIsoDateTr(w.previousFrom)} – ${formatIsoDateTr(w.previousTo)} · ${formatIsoDateTr(w.currentFrom)} – ${formatIsoDateTr(w.currentTo)}`;
              const srcLabel =
                comparison.dataSource === 'erp'
                  ? 'Kaynak: ERP satış fişleri (store’daki satış listesi)'
                  : 'Kaynak: Restoran kapalı adisyonları';
              const trendClass = (ch: number) =>
                ch > 0 ? 'text-green-600' : ch < 0 ? 'text-red-600' : 'text-gray-500';
              const trendArrow = (ch: number) => (ch > 0 ? '↑' : ch < 0 ? '↓' : '→');

              return (
                <div className="space-y-4">
                  {businessType === 'restaurant' && loadingComparisonOrders && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <Spin size="small" />
                      Kapalı adisyonlar yükleniyor…
                    </div>
                  )}
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-lg flex items-center gap-2">
                          <BarChart3 className="w-5 h-5 text-purple-600" />
                          Dönem Karşılaştırması
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">{rangeLine}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{srcLabel}</p>
                      </div>
                      <select
                        value={comparisonPeriod}
                        onChange={(e) => setComparisonPeriod(e.target.value as 'week' | 'month')}
                        className="px-4 py-2 border rounded-lg focus:outline-none focus:border-blue-500 shrink-0"
                      >
                        <option value="week">Haftalık</option>
                        <option value="month">Aylık</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4 border-2 border-blue-200">
                        <p className="text-sm text-gray-600 mb-2">Toplam Satış</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-blue-600">{comparison.current.totalSales}</p>
                          <span className={`text-sm font-semibold ${trendClass(comparison.change.sales)}`}>
                            {trendArrow(comparison.change.sales)} {Math.abs(comparison.change.sales)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{comparison.previous.period}: {comparison.previous.totalSales}</p>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 border-2 border-green-200">
                        <p className="text-sm text-gray-600 mb-2">Toplam Ciro</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-green-600">{formatNumber(comparison.current.totalRevenue, 0, false)} {reportCurrency}</p>
                          <span className={`text-sm font-semibold ${trendClass(comparison.change.revenue)}`}>
                            {trendArrow(comparison.change.revenue)} {Math.abs(comparison.change.revenue)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{comparison.previous.period}: {formatNumber(comparison.previous.totalRevenue, 0, false)} {reportCurrency}</p>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 border-2 border-purple-200">
                        <p className="text-sm text-gray-600 mb-2">Ortalama Satış</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-purple-600">{formatNumber(comparison.current.avgSale, 0, false)} {reportCurrency}</p>
                          <span className={`text-sm font-semibold ${trendClass(comparison.change.avgSale)}`}>
                            {trendArrow(comparison.change.avgSale)} {Math.abs(comparison.change.avgSale)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{comparison.previous.period}: {formatNumber(comparison.previous.avgSale, 0, false)} {reportCurrency}</p>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4 border-2 border-orange-200">
                        <p className="text-sm text-gray-600 mb-2">Müşteri Sayısı</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-orange-600">{comparison.current.customerCount}</p>
                          <span className={`text-sm font-semibold ${trendClass(comparison.change.customerCount)}`}>
                            {trendArrow(comparison.change.customerCount)} {Math.abs(comparison.change.customerCount)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{comparison.previous.period}: {comparison.previous.customerCount}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Adet: önceki dönem vs bu dönem</p>
                        <div className="h-56 w-full min-h-[14rem]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={comparison.chartCountData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} />
                              <Tooltip />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Bar dataKey="onceki" name="Önceki dönem" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="guncel" name="Bu dönem" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">Tutar ({reportCurrency}): önceki vs bu dönem</p>
                        <div className="h-56 w-full min-h-[14rem]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={comparison.chartMoneyData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} />
                              <Tooltip formatter={(v: number | string) => formatNumber(Number(v), 2, false)} />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Bar dataKey="onceki" name="Önceki dönem" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="guncel" name="Bu dönem" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border overflow-hidden">
                    <div className="p-4 border-b flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold text-gray-800">Ürün karşılaştırması</h3>
                      <span className="text-xs text-gray-500">Ciroya göre ilk 60 ürün</span>
                    </div>
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-gray-50 border-b sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-700">Ürün</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700">Önceki adet</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700">Bu dönem adet</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700">Adet Δ%</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700">Önceki ciro</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700">Bu dönem ciro</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-700">Ciro Δ%</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {comparison.productRows.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                                Bu dönemlerde ürün satırı yok veya satış kaydı bulunamadı.
                              </td>
                            </tr>
                          ) : (
                            comparison.productRows.map((row) => (
                              <tr key={row.key} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium text-gray-900 max-w-[220px] truncate" title={row.name}>
                                  {row.name}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.prevQty, 2, false)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.currQty, 2, false)}</td>
                                <td className={`px-3 py-2 text-right tabular-nums font-medium ${trendClass(row.qtyPct)}`}>
                                  {trendArrow(row.qtyPct)} {Math.abs(row.qtyPct)}%
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.prevRev, 2, false)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.currRev, 2, false)}</td>
                                <td className={`px-3 py-2 text-right tabular-nums font-medium ${trendClass(row.revPct)}`}>
                                  {trendArrow(row.revPct)} {Math.abs(row.revPct)}%
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'materials' && <MaterialMovementReport />}

            {selectedTab === 'expiring-products' && (() => {
              const getDaysUntilExpiry = (expiryDate: string) => {
                const today = new Date();
                const expiry = new Date(expiryDate);
                const diffTime = expiry.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays;
              };

              const getExpiryStatus = (expiryDate: string) => {
                const days = getDaysUntilExpiry(expiryDate);
                if (days < 0) return { status: 'expired', color: 'red', label: 'Süresi Geçmiş' };
                if (days <= 7) return { status: 'critical', color: 'red', label: 'Kritik' };
                if (days <= 30) return { status: 'warning', color: 'orange', label: 'Yakında' };
                return { status: 'normal', color: 'yellow', label: 'Normal' };
              };

              const expiredCount = expiringProducts.filter(p => p.expiry_date && getDaysUntilExpiry(p.expiry_date) < 0).length;
              const criticalCount = expiringProducts.filter(p => {
                if (!p.expiry_date) return false;
                const days = getDaysUntilExpiry(p.expiry_date);
                return days >= 0 && days <= 7;
              }).length;
              const warningCount = expiringProducts.filter(p => {
                if (!p.expiry_date) return false;
                const days = getDaysUntilExpiry(p.expiry_date);
                return days > 7 && days <= 30;
              }).length;

              const totalValue = expiringProducts.reduce((sum, p) => {
                return sum + ((p.unit_cost || 0) * (p.available_quantity || 0));
              }, 0);

              return (
                <div className="space-y-4">
                  {/* Filter & Stats */}
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        Son Kullanma Tarihi Yaklaşanlar
                      </h3>
                      <div className="flex items-center gap-3">
                        <label className="text-sm text-gray-600">Gün:</label>
                        <select
                          value={expiringDays}
                          onChange={(e) => setExpiringDays(Number(e.target.value))}
                          className="px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                        >
                          <option value={7}>7 Gün</option>
                          <option value={15}>15 Gün</option>
                          <option value={30}>30 Gün</option>
                          <option value={60}>60 Gün</option>
                          <option value={90}>90 Gün</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-red-50 rounded-lg border-2 border-red-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Süresi Geçmiş</p>
                            <p className="text-3xl text-red-600 mt-1 font-bold">{expiredCount}</p>
                          </div>
                          <AlertCircle className="w-12 h-12 text-red-600 opacity-20" />
                        </div>
                      </div>
                      <div className="bg-orange-50 rounded-lg border-2 border-orange-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Kritik (≤7 gün)</p>
                            <p className="text-3xl text-orange-600 mt-1 font-bold">{criticalCount}</p>
                          </div>
                          <AlertTriangle className="w-12 h-12 text-orange-600 opacity-20" />
                        </div>
                      </div>
                      <div className="bg-yellow-50 rounded-lg border-2 border-yellow-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Yakında (≤30 gün)</p>
                            <p className="text-3xl text-yellow-600 mt-1 font-bold">{warningCount}</p>
                          </div>
                          <Clock className="w-12 h-12 text-yellow-600 opacity-20" />
                        </div>
                      </div>
                      <div className="bg-blue-50 rounded-lg border-2 border-blue-200 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-600">Toplam Değer</p>
                            <p className="text-xl text-blue-600 mt-1 font-bold">{formatNumber(totalValue, 2, false)} {reportCurrency}</p>
                          </div>
                          <Banknote className="w-12 h-12 text-blue-600 opacity-20" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Products Table */}
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b flex items-center justify-between">
                      <h4 className="text-md font-semibold">Ürün Listesi</h4>
                      {loadingExpiring && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                          Yükleniyor...
                        </div>
                      )}
                    </div>
                    {loadingExpiring ? (
                      <div className="p-8 text-center">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-gray-600">Yükleniyor...</p>
                      </div>
                    ) : expiringProducts.length === 0 ? (
                      <div className="p-8 text-center">
                        <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600">Son {expiringDays} gün içinde son kullanma tarihi yaklaşan ürün bulunamadı.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                        <table className="w-full min-w-[1000px]">
                          <thead className="bg-gray-50 border-b sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-sm">Ürün Kodu</th>
                              <th className="px-4 py-3 text-left text-sm">Ürün Adı</th>
                              <th className="px-4 py-3 text-left text-sm">Lot/Seri No</th>
                              <th className="px-4 py-3 text-left text-sm">Depo</th>
                              <th className="px-4 py-3 text-right text-sm">Miktar</th>
                              <th className="px-4 py-3 text-left text-sm">Son Kullanma Tarihi</th>
                              <th className="px-4 py-3 text-right text-sm">Kalan Gün</th>
                              <th className="px-4 py-3 text-right text-sm">Birim Maliyet</th>
                              <th className="px-4 py-3 text-right text-sm">Toplam Değer</th>
                              <th className="px-4 py-3 text-center text-sm">Durum</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {expiringProducts
                              .sort((a, b) => {
                                if (!a.expiry_date) return 1;
                                if (!b.expiry_date) return -1;
                                return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
                              })
                              .map((product, idx) => {
                                if (!product.expiry_date) return null;
                                const days = getDaysUntilExpiry(product.expiry_date);
                                const status = getExpiryStatus(product.expiry_date);
                                const productValue = (product.unit_cost || 0) * (product.available_quantity || 0);

                                return (
                                  <tr key={product.id || idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-sm font-medium">{product.product_code || '-'}</td>
                                    <td className="px-4 py-3">
                                      <div>
                                        <p className="font-medium">{product.product_name || '-'}</p>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm">
                                      {product.lot_no && <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Lot: {product.lot_no}</span>}
                                      {product.serial_no && <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs ml-1">Seri: {product.serial_no}</span>}
                                    </td>
                                    <td className="px-4 py-3 text-sm">{product.warehouse_name || '-'}</td>
                                    <td className="px-4 py-3 text-right">
                                      <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-semibold">
                                        {product.available_quantity || 0}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                        <span className="text-sm">
                                          {new Date(product.expiry_date).toLocaleDateString('tr-TR')}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <span className={`px-2 py-1 rounded text-sm font-semibold ${days < 0
                                        ? 'bg-red-100 text-red-700'
                                        : days <= 7
                                          ? 'bg-orange-100 text-orange-700'
                                          : days <= 30
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-green-100 text-green-700'
                                        }`}>
                                        {days < 0 ? `${Math.abs(days)} gün geçmiş` : `${days} gün`}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm">{formatNumber(product.unit_cost || 0, 2, false)} {reportCurrency}</td>
                                    <td className="px-4 py-3 text-right text-sm font-semibold">{formatNumber(productValue, 2, false)} {reportCurrency}</td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`px-2 py-1 rounded text-xs font-semibold ${status.color === 'red'
                                        ? 'bg-red-100 text-red-700'
                                        : status.color === 'orange'
                                          ? 'bg-orange-100 text-orange-700'
                                          : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                        {status.label}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            {expiringProducts.filter(p => !p.expiry_date).length > 0 && (
                              <tr className="bg-gray-50">
                                <td colSpan={10} className="px-4 py-3 text-center text-sm text-gray-500">
                                  {expiringProducts.filter(p => !p.expiry_date).length} ürün için son kullanma tarihi belirtilmemiş
                                </td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot className="bg-gray-50 border-t">
                            <tr>
                              <td colSpan={8} className="px-4 py-3 text-right font-semibold">TOPLAM:</td>
                              <td className="px-4 py-3 text-right font-bold text-green-600">{formatNumber(totalValue, 2, false)} {reportCurrency}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'profit-loss' && <ProfitLossReport />}

            {selectedTab === 'customer-sales' && (
              <CustomerSalesReport sales={sales} customers={[]} />
            )}

            {selectedTab === 'sales-trend' && (
              <SalesTrendReport sales={sales} />
            )}

            {selectedTab === 'sales-target' && (
              <SalesTargetReport sales={sales} />
            )}

            {selectedTab === 'stock-aging' && (() => {
              const ag = getStockAgingReport();
              const bucketStyle = (k: string) =>
                k === 'critical'
                  ? 'bg-red-100 text-red-800'
                  : k === 'slow'
                    ? 'bg-orange-100 text-orange-800'
                    : k === 'normal'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-green-100 text-green-800';
              return (
                <div className="space-y-4">
                  {stockReportLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <Spin size="small" />
                      Ürün listesi güncelleniyor…
                    </div>
                  )}
                  <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{ag.summary.hint}</p>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-white rounded-lg border border-green-200 p-3">
                      <p className="text-xs text-gray-600">0–30 gün</p>
                      <p className="text-2xl font-bold text-green-700">{ag.summary.fresh}</p>
                      <p className="text-[10px] text-gray-500">SKU</p>
                    </div>
                    <div className="bg-white rounded-lg border border-amber-200 p-3">
                      <p className="text-xs text-gray-600">31–90 gün</p>
                      <p className="text-2xl font-bold text-amber-700">{ag.summary.normal}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-orange-200 p-3">
                      <p className="text-xs text-gray-600">91–180 gün</p>
                      <p className="text-2xl font-bold text-orange-700">{ag.summary.slow}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-red-200 p-3">
                      <p className="text-xs text-gray-600">180+ / satış yok</p>
                      <p className="text-2xl font-bold text-red-700">{ag.summary.critical}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-blue-200 p-3 md:col-span-1 col-span-2">
                      <p className="text-xs text-gray-600">Stoklu SKU / değer</p>
                      <p className="text-lg font-bold text-blue-700">{ag.summary.totalSkus}</p>
                      <p className="text-sm font-semibold text-slate-700">{formatNumber(ag.summary.totalValue, 2, false)} {reportCurrency}</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b flex items-center gap-2">
                      <Clock className="w-5 h-5 text-red-600" />
                      <h3 className="text-lg font-semibold">Stok yaşlandırma detayı</h3>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[560px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[880px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">Ürün</th>
                            <th className="px-4 py-3 text-left text-sm">Kategori</th>
                            <th className="px-4 py-3 text-right text-sm">Stok</th>
                            <th className="px-4 py-3 text-right text-sm">Son hareket</th>
                            <th className="px-4 py-3 text-right text-sm">Stok değeri</th>
                            <th className="px-4 py-3 text-center text-sm">Kova</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {ag.rows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-12 text-center text-gray-500 text-sm">
                                Stoklu ürün yok veya liste henüz yüklenmedi.
                              </td>
                            </tr>
                          ) : (
                            ag.rows.map(r => (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium">{r.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{r.category}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{r.stock}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{r.daysSinceMovement} gün</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.value, 2, false)} {reportCurrency}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${bucketStyle(r.bucketKey)}`}>{r.bucket}</span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'stock-turnover' && (() => {
              const to = getStockTurnoverReport();
              return (
                <div className="space-y-4">
                  {stockReportLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <Spin size="small" />
                      Ürün listesi güncelleniyor…
                    </div>
                  )}
                  <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{to.hint}</p>
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      <h3 className="text-lg font-semibold">Stok dönüş hızı</h3>
                      <span className="text-sm text-gray-500 ml-auto">Dönem: ~{to.periodDays} gün</span>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[560px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[960px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">Ürün</th>
                            <th className="px-4 py-3 text-left text-sm">Kategori</th>
                            <th className="px-4 py-3 text-right text-sm">Satış (adet)</th>
                            <th className="px-4 py-3 text-right text-sm">Ciro</th>
                            <th className="px-4 py-3 text-right text-sm">Mevcut stok</th>
                            <th className="px-4 py-3 text-right text-sm">Satış / stok</th>
                            <th className="px-4 py-3 text-right text-sm">Yıllık devir (tahm.)</th>
                            <th className="px-4 py-3 text-right text-sm">Stok günü</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {to.rows.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-4 py-12 text-center text-gray-500 text-sm">
                                Stoklu ürün veya satış kalemi bulunamadı.
                              </td>
                            </tr>
                          ) : (
                            to.rows.map(r => (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-medium">{r.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{r.category}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{r.soldQty}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.revenue, 2, false)} {reportCurrency}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{r.stock}</td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                  {r.ratio == null ? '—' : formatNumber(r.ratio, 2, false)}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                  {r.annualizedTurnover == null ? '—' : formatNumber(r.annualizedTurnover, 2, false)}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-sm text-slate-600">
                                  {r.daysCover == null ? '—' : `${formatNumber(r.daysCover, 1, false)} gün`}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'stock-abc' && (() => {
              const abc = getStockAbcReport();
              const pieColors = ['#16a34a', '#ca8a04', '#64748b'];
              return (
                <div className="space-y-4">
                  {stockReportLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <Spin size="small" />
                      Ürün listesi güncelleniyor…
                    </div>
                  )}
                  <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{abc.hint}</p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-2 flex items-center gap-2">
                        <PieChartIcon className="w-5 h-5 text-amber-600" />
                        ABC — değer dağılımı
                      </h3>
                      {abc.chartData.length === 0 ? (
                        <p className="text-sm text-gray-500 py-8 text-center">Sınıflandırılacak stok/satış verisi yok.</p>
                      ) : (
                        <div className="h-[300px] w-full min-w-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <RePieChart>
                              <Pie
                                data={abc.chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={56}
                                outerRadius={96}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              >
                                {abc.chartData.map((entry, index) => (
                                  <Cell key={entry.name} fill={entry.fill || pieColors[index % pieColors.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value: number) => formatNumber(value, 2, false) + ' ' + reportCurrency} />
                              <Legend />
                            </RePieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="text-lg mb-4 flex items-center gap-2">
                        <Award className="w-5 h-5 text-yellow-600" />
                        Özet
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-600">Toplam metrik</span>
                          <span className="font-semibold">{formatNumber(abc.totalMetric, 2, false)} {reportCurrency}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-green-700 font-medium">A grubu</span>
                          <span>{formatNumber(abc.valueByClass.A, 2, false)} {reportCurrency}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-amber-700 font-medium">B grubu</span>
                          <span>{formatNumber(abc.valueByClass.B, 2, false)} {reportCurrency}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600 font-medium">C grubu</span>
                          <span>{formatNumber(abc.valueByClass.C, 2, false)} {reportCurrency}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border">
                    <div className="p-4 border-b flex items-center gap-2">
                      <ApartmentOutlined className="text-lg text-orange-500" />
                      <h3 className="text-lg font-semibold">Ürün bazında ABC</h3>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto max-h-[400px]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 #f1f5f9' }}>
                      <table className="w-full min-w-[800px]">
                        <thead className="bg-gray-50 border-b sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm">Sınıf</th>
                            <th className="px-4 py-3 text-left text-sm">Ürün</th>
                            <th className="px-4 py-3 text-left text-sm">Kategori</th>
                            <th className="px-4 py-3 text-right text-sm">Ciro (dönem)</th>
                            <th className="px-4 py-3 text-right text-sm">Stok</th>
                            <th className="px-4 py-3 text-right text-sm">Stok değeri</th>
                            <th className="px-4 py-3 text-right text-sm">Metrik</th>
                            <th className="px-4 py-3 text-right text-sm">Kümülatif %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {abc.rows.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-4 py-12 text-center text-gray-500 text-sm">
                                Gösterilecek ürün yok.
                              </td>
                            </tr>
                          ) : (
                            abc.rows.map(r => (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <span
                                    className={`px-2 py-1 rounded text-xs font-bold ${
                                      r.abc === 'A'
                                        ? 'bg-green-100 text-green-800'
                                        : r.abc === 'B'
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {r.abc}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-medium">{r.name}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{r.category}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.revenue, 2, false)} {reportCurrency}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{r.stock}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.stockValue, 2, false)} {reportCurrency}</td>
                                <td className="px-4 py-3 text-right tabular-nums font-medium">{formatNumber(r.metric, 2, false)} {reportCurrency}</td>
                                <td className="px-4 py-3 text-right tabular-nums">{formatNumber(r.cumPct, 1, false)}%</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'beauty-service-report' && (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4 shadow-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-500">{tm('dateFrom')}</span>
                    <input
                      type="date"
                      value={beautyServiceFrom}
                      onChange={(e) => setBeautyServiceFrom(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-500">{tm('dateTo')}</span>
                    <input
                      type="date"
                      value={beautyServiceTo}
                      onChange={(e) => setBeautyServiceTo(e.target.value)}
                      className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1 min-w-[220px]">
                    <span className="text-xs font-semibold text-slate-500">{tm('beautyServiceFilterLabel')}</span>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder={tm('beautyServiceFilterPlaceholder')}
                      value={beautyServiceFilterId || undefined}
                      onChange={(v) => setBeautyServiceFilterId(v != null && String(v).length > 0 ? String(v) : '')}
                      className="min-w-[220px]"
                      options={beautyServicesCatalog
                        .filter((s) => s.is_active !== false)
                        .slice()
                        .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'tr'))
                        .map((s) => ({
                          value: s.id,
                          label: s.name ?? s.id,
                        }))}
                    />
                  </div>
                  <Button
                    type="primary"
                    loading={loadingBeautyServiceReport}
                    onClick={() => reloadBeautyServiceReport()}
                  >
                    {tm('refresh')}
                  </Button>
                  <p className="text-xs text-slate-500 flex-1 min-w-[200px]">
                    {tm('beautyServiceBreakdownHint')} {tm('beautyServiceRowCrmHint')} {tm('beautyServiceHeaderCrmHint')}
                  </p>
                </div>

                <Spin spinning={loadingBeautyServiceReport}>
                  {beautyServiceGrouped.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
                      {tm('noDataFound')}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {beautyServiceGrouped.map((g) => (
                        <div
                          key={g.serviceName}
                          className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm"
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-white font-bold cursor-pointer select-none hover:brightness-110 transition-[filter]"
                            style={{ backgroundColor: bizConfig.color }}
                            title={tm('beautyServiceHeaderCrmHint')}
                            onClick={() => {
                              const first = g.items[0];
                              if (first) setBeautyCrmModalAppointment(first);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                const first = g.items[0];
                                if (first) setBeautyCrmModalAppointment(first);
                              }
                            }}
                          >
                            <span className="text-base">{g.serviceName}</span>
                            <span className="text-sm font-semibold opacity-95">
                              {tm('subTotal')}: {formatNumber(g.sum, 2, false)} {reportCurrency}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                                  <th className="px-4 py-2 font-semibold">{tm('date')}</th>
                                  <th className="px-4 py-2 font-semibold">{tm('customer')}</th>
                                  <th className="px-4 py-2 font-semibold">{tm('bStaffView')}</th>
                                  <th className="px-4 py-2 font-semibold">{tm('bDeviceView')}</th>
                                  <th className="px-4 py-2 font-semibold text-right">{tm('amount')}</th>
                                  <th className="px-4 py-2 font-semibold">{tm('status')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {g.items.map((a) => (
                                  <tr
                                    key={a.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setBeautyCrmModalAppointment(a)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setBeautyCrmModalAppointment(a);
                                      }
                                    }}
                                    className="cursor-pointer hover:bg-pink-50/90"
                                  >
                                    <td className="px-4 py-2.5 tabular-nums text-slate-700 whitespace-nowrap">
                                      {String(a.date ?? a.appointment_date ?? '—')}
                                      {a.time || a.appointment_time
                                        ? ` · ${String(a.time ?? a.appointment_time).slice(0, 5)}`
                                        : ''}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-800">
                                      {String(a.customer_name ?? '').trim() || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-800">
                                      {String(a.specialist_name ?? a.staff_name ?? '').trim() || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-800">
                                      {String(a.device_name ?? '').trim() || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900">
                                      {formatNumber(Number(a.total_price ?? 0), 2, false)} {reportCurrency}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-600 text-xs capitalize">
                                      {String(a.status ?? '—')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Spin>

                <BeautyServiceReportCrmModal
                  open={beautyCrmModalAppointment != null}
                  onClose={() => setBeautyCrmModalAppointment(null)}
                  appointment={beautyCrmModalAppointment}
                  accentColor={bizConfig.color}
                  onSaved={reloadBeautyServiceReport}
                />
              </div>
            )}

            {selectedTab === 'chat-ai' && (
              <ReportChatAI
                sales={sales}
                products={products}
                dailySales={dailySalesForAi}
                dailyTotal={dailyTotal}
                dailyCash={dailyCash}
                dailyCard={dailyCard}
                productSales={productSales}
                cashierPerformance={cashierPerformance}
                categoryAnalysis={getCategoryAnalysis()}
                hourlyAnalysis={getHourlyAnalysis()}
              />
            )}

            {selectedTab === 'daily-sales-executive' && (() => {
              const paymentDist = getPaymentDistribution();
              const categories = getCategoryAnalysis();
              const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];

              return (
                <div className="space-y-6 w-full min-w-0">
                  {/* Upper Section: Pie Chart & Financial Totals */}
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 w-full min-w-0">
                    {/* Left: Pie Chart */}
                    <div className="xl:col-span-5 min-w-0 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Ödeme Tipi Dağılımı</h3>
                      <div className="h-[350px] min-h-[280px] w-full min-w-0">
                        {paymentDist.chartData.length === 0 ? (
                          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-400">
                            Ödeme dağılımı için pozitif tutar bulunamadı.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <RePieChart>
                              <Pie
                                data={paymentDist.chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={80}
                                outerRadius={120}
                                paddingAngle={5}
                                dataKey="value"
                                nameKey="name"
                              >
                                {paymentDist.chartData.map((entry: any, index: number) => (
                                  <Cell key={`cell-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value: number) => formatNumber(value, 2, false)} />
                              <Legend verticalAlign="bottom" height={36} />
                            </RePieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>

                    {/* Right: Detailed Totals */}
                    <div className="xl:col-span-7 min-w-0 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <div className="space-y-1">
                        {(() => {
                          const stats = businessType === 'restaurant' ? restStats : {
                            totalSales: dailyTotal,
                            payments: { 'NAKİT': dailyCash, 'POS': dailyCard },
                            discountTotal: dailyDiscount
                          };
                          const multinet = stats?.payments?.['MULTİNET'] || 0;
                          const items = [
                            { label: 'Cariye aktarılan', value: 0, sub: 'Satış: 0,00, Çıkış: 0,00, Giriş: 0,00', color: 'text-slate-600' },
                            { label: 'NAKİT', value: stats?.payments?.['NAKİT'] || 0, sub: `Satış: ${formatNumber(stats?.payments?.['NAKİT'] || 0, 2, false)}, Çıkış: 0,00, Giriş: 0,00`, color: 'text-slate-800 font-bold' },
                            { label: 'POS', value: stats?.payments?.['POS'] || 0, sub: `Satış: ${formatNumber(stats?.payments?.['POS'] || 0, 2, false)}, Çıkış: 0,00, Giriş: 0,00`, color: 'text-slate-800' },
                            { label: 'MULTİNET', value: multinet, sub: `Satış: ${formatNumber(multinet, 2, false)}, Çıkış: 0,00, Giriş: 0,00`, color: 'text-slate-800' },
                            { label: 'Servis Ücreti', value: 0.00, color: 'text-red-500' },
                            { label: 'Açık Masalar', value: 0.00, color: 'text-green-500' },
                            { label: 'Genel Toplam', value: stats?.totalSales || 0, color: 'text-amber-500 font-black' },
                            { label: 'Tahsilat Toplam', value: stats?.totalSales || 0, color: 'text-red-500' },
                            { label: 'Satışlar Toplamı', value: stats?.totalSales || 0, color: 'text-blue-500' },
                          ];

                          return items.map((item, i) => (
                            <div
                              key={i}
                              className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-slate-50 py-2 items-start ${item.color}`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm leading-snug">{item.label}</p>
                                {item.sub && (
                                  <p className="text-[10px] text-slate-400 italic leading-snug mt-0.5">{item.sub}</p>
                                )}
                              </div>
                              <p className="text-sm tabular-nums text-right whitespace-nowrap shrink-0 self-center">
                                {formatNumber(item.value, 2, false)}
                              </p>
                            </div>
                          ));
                        })()}
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-center pt-3 border-t border-slate-100 text-purple-600 font-bold">
                          <div className="flex items-center gap-2 min-w-0">
                            <TagsOutlined className="shrink-0" />
                            <span className="text-sm">İndirim Toplam</span>
                          </div>
                          <span className="text-sm tabular-nums text-right whitespace-nowrap shrink-0">
                            {formatNumber(businessType === 'restaurant' ? (restStats?.discountTotal || 0) : dailyDiscount, 2, false)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Yemek Entegrasyonları (Bar Chart) */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Yemek Entegrasyonları Satış Dağılımı</h3>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: 'Yemek Sepeti', value: 0 },
                          { name: 'Getir Yemek', value: 0 },
                          { name: 'Trendyol Yemek', value: 0 }
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey="value" fill="#d1d5db" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Lower Section: Category Sales (Bar Chart) */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Kategori Bazlı Satış Dağılımı</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categories.slice(0, 5).map(c => ({ name: c.name, value: c.totalRevenue }))}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey="value" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={60}>
                            {categories.slice(0, 5).map((_entry, index) => (
                              <Cell key={`cell-${index}`} fill={index === 0 ? '#e1f57d' : '#f9a825'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Region Table Section (Bar Chart) */}
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Bölge Masa Tablosu</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: 'SALON', value: 18145.00, color: '#a7f3d0' },
                          { name: 'TERAS', value: 9060.00, color: '#c084fc' },
                          { name: 'BAHÇE', value: 840.00, color: '#bcaaa4' },
                          { name: 'Perakende', value: 651.00, color: '#cfd8dc' },
                          { name: 'Paket Servis', value: 130.00, color: '#fff9c4' }
                        ]}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                          <Tooltip cursor={{ fill: '#f8fafc' }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={50}>
                            {[
                              { name: 'SALON', value: 18145.00, color: '#a7f3d0' },
                              { name: 'TERAS', value: 9060.00, color: '#c084fc' },
                              { name: 'BAHÇE', value: 840.00, color: '#bcaaa4' },
                              { name: 'Perakende', value: 651.00, color: '#cfd8dc' },
                              { name: 'Paket Servis', value: 130.00, color: '#fff9c4' }
                            ].map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Footer Section: Cashier and Department Summaries */}
                  <div className="grid grid-cols-2 gap-6 pb-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Kasiyer İşlem Özeti</h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={[{ name: 'YONETICİ', value: 28826.00 }]}
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              dataKey="value"
                            >
                              <Cell fill="#ffab91" />
                            </Pie>
                            <Tooltip formatter={(value: number) => formatNumber(value, 2, false)} />
                            <Legend />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Bölüm İşlem Özeti</h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RePieChart>
                            <Pie
                              data={[
                                { name: 'BARİSTA', value: 225.00 },
                                { name: 'IZGARA', value: 28601.00 }
                              ] as any[]}
                              cx="50%"
                              cy="50%"
                              outerRadius={100}
                              dataKey="value"
                            >
                              <Cell fill="#90caf9" />
                              <Cell fill="#80cbc4" />
                            </Pie>
                            <Tooltip formatter={(value: any) => formatNumber(value, 2, false)} />
                            <Legend />
                          </RePieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'end-of-day' && (() => {
              const paymentDist: any = getPaymentDistribution();
              const pieData = paymentDist.chartData as { name: string; value: number }[];
              const st = restStats || { totalSales: 0, payments: {} as Record<string, number>, discountTotal: 0 };
              const paySum = Object.values(st.payments).reduce((a: number, v: any) => a + Number(v || 0), 0);
              const grossSales = st.totalSales + st.discountTotal;
              const paymentRows = Object.entries(st.payments)
                .filter(([, v]) => Number(v) > 0)
                .sort((a, b) => Number(b[1]) - Number(a[1]));
              const COLORS = ['#90caf9', '#81c784', '#ce93d8', '#ffab91', '#4db6ac'];
              return (
                <div className="space-y-6 w-full min-w-0">
                  {/* Top Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {(() => {
                      const totalGuests = restOrders.reduce((sum, o) => sum + (o.guest_count || 2), 0);
                      const totalItems = restOrders.reduce((sum, o) => sum + (o.items?.length || 0), 0);
                      const takeawayOrders = restOrders.filter(o => o.table_id === 'TAKEAWAY');
                      const tableOrders = restOrders.filter(o => o.table_id !== 'TAKEAWAY' && o.table_id !== 'RETAIL');
                      const retailOrders = restOrders.filter(o => o.table_id === 'RETAIL');

                      return [
                        { label: 'Kişi Sayısı', value: totalGuests, icon: <TeamOutlined className="text-blue-200" />, color: 'border-blue-50' },
                        { label: 'Toplam Sipariş', value: businessType === 'restaurant' ? dailyUnifiedRows.length : restOrders.length, sub: `${totalItems} ürün`, icon: <HistoryOutlined className="text-purple-200" />, color: 'border-purple-50' },
                        { label: 'Servis (Masa)', value: tableOrders.length, sub: `${tableOrders.reduce((s, o) => s + (o.items?.length || 0), 0)} ürün`, icon: <ApartmentOutlined className="text-orange-200" />, color: 'border-orange-50' },
                        { label: 'Paket Servis', value: takeawayOrders.length, sub: `${takeawayOrders.reduce((s, o) => s + (o.items?.length || 0), 0)} ürün`, icon: <Package className="text-red-200" />, color: 'border-red-50' },
                        { label: 'Perakende', value: retailOrders.length, sub: `${retailOrders.reduce((s, o) => s + (o.items?.length || 0), 0)} ürün`, icon: <ShoppingCart className="text-green-200" />, color: 'border-green-50' },
                        { label: 'Self Servis', value: '0', sub: '0 ürün', icon: <PieChartIcon className="text-pink-200" />, color: 'border-pink-50' },
                      ].map((card, i) => (
                        <div key={i} className={`bg-white rounded-xl border-2 ${card.color} p-4 shadow-sm text-center relative overflow-hidden group hover:scale-105 transition-transform`}>
                          <div className="absolute -right-2 -top-2 opacity-10 group-hover:opacity-20 transition-opacity">
                            {React.cloneElement(card.icon as any, { className: 'w-16 h-16' })}
                          </div>
                          <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">{card.label}</p>
                          <p className="text-2xl font-black text-blue-600">{card.value}</p>
                          {card.sub && <p className="text-[10px] text-slate-400 font-medium">{card.sub}</p>}
                          <div className="mt-2 flex justify-center">
                            {React.cloneElement(card.icon as any, { className: 'w-4 h-4' })}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 w-full min-w-0">
                    <div className="xl:col-span-6 min-w-0 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Ödeme Tipi Dağılımı</h3>
                      <div className="h-[350px] min-h-[280px] w-full min-w-0">
                        {pieData.length === 0 ? (
                          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-400">
                            Bu tarih için kapalı sipariş veya pozitif tahsilat tutarı yok; ödeme dağılımı gösterilemiyor.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <RePieChart>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                outerRadius={120}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                              >
                                {pieData.map((entry: any, index: number) => (
                                  <Cell key={`cell-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value: number) => formatNumber(value, 2, false)} />
                              <Legend />
                            </RePieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                    <div className="xl:col-span-6 min-w-0 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <div className="space-y-1">
                        {[
                          { label: 'Cariye aktarılan', value: 0, sub: 'Entegrasyon verisi yok', color: 'text-slate-600' },
                          ...paymentRows.map(([label, val]) => ({
                            label,
                            value: Number(val),
                            sub: `Tahsilat: ${formatNumber(Number(val), 2, false)}`,
                            color: isRestaurantPaymentCashLike(label) ? 'text-slate-800 font-black' : 'text-slate-800'
                          })),
                          { label: 'Servis Ücreti', value: 0, color: 'text-red-500' },
                          { label: 'Açık Masalar', value: 0, sub: 'Anlık masa bakiyesi bu raporda yok', color: 'text-green-500' },
                          { label: 'Genel Toplam', value: st.totalSales, color: 'text-amber-500 font-black' },
                          { label: 'Tahsilat Toplam', value: paySum, color: 'text-red-500' },
                          { label: 'Satışlar Toplamı (brüt)', value: grossSales, sub: 'Net ciro + indirim', color: 'text-blue-500' },
                        ].map((item, i) => (
                          <div
                            key={i}
                            className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 border-b border-slate-50 py-2 items-start ${item.color}`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm leading-snug">{item.label}</p>
                              {item.sub && (
                                <p className="text-[10px] text-slate-400 italic leading-snug mt-0.5">{item.sub}</p>
                              )}
                            </div>
                            <p className="text-sm tabular-nums text-right whitespace-nowrap shrink-0 self-center">
                              {formatNumber(item.value, 2, false)}
                            </p>
                          </div>
                        ))}
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-center pt-3 border-t border-slate-100 text-purple-600 font-bold">
                          <div className="flex items-center gap-2 min-w-0">
                            <TagsOutlined className="shrink-0" />
                            <span className="text-sm uppercase font-black">İndirim Toplam</span>
                          </div>
                          <span className="text-sm tabular-nums text-right whitespace-nowrap shrink-0">
                            {formatNumber(st.discountTotal, 2, false)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'cash-report' && (() => {
              const payments = restOrders.reduce((acc: any, o) => {
                const method = restOrderPaymentMethod(o);
                acc[method] = (acc[method] || 0) + restOrderNetAmount(o);
                return acc;
              }, {});

              const chartData = Object.entries(payments).map(([name, value]: [string, any]) => ({
                name,
                value: Number(value || 0),
                fill: name === 'NAKİT' ? '#64b5f6' : name === 'POS' ? '#b39ddb' : '#9575cd'
              }));

              return (
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Kasa Hareket Raporları</h3>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: number) => formatNumber(val, 2, false)} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={50} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-3 flex justify-between items-center text-white font-bold" style={{ backgroundColor: bizConfig.color }}>
                      <div className="flex items-center gap-2">
                        <HistoryOutlined />
                        <span>Açıklama</span>
                      </div>
                      <div className="flex gap-20">
                        <span>Miktar</span>
                        <span>Tutar</span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {Object.entries(payments).map(([method, total], i) => (
                        <div key={i} className={`p-3 flex justify-between items-center ${i % 2 === 0 ? 'bg-orange-50' : 'bg-white'}`}>
                          <span className="text-sm font-bold text-slate-700">{method}</span>
                          <div className="flex gap-20">
                            <span className="text-sm font-bold">-</span>
                            <span className="text-sm font-bold">{formatNumber(total as number, 2, false)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="p-3 flex justify-between items-center bg-purple-100 font-bold">
                        <span className="text-sm font-bold text-slate-700">Toplamlar</span>
                        <div className="flex gap-20">
                          <span className="text-sm font-bold">-</span>
                          <span className="text-sm font-bold">{formatNumber(Object.values(payments).reduce((s: number, v: any) => s + Number(v || 0), 0), 2, false)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'product-reports' && (() => {
              if (businessType === 'restaurant') {
                const chartData = restProductQtyRows.slice(0, 14).map((r, i) => ({
                  name:
                    r.productName.length > 22 ? `${r.productName.slice(0, 20)}…` : r.productName,
                  value: r.quantity,
                  fill: `hsl(${22 + i * 16}, 72%, 52%)`,
                }));
                const totalQ = restProductQtyRows.reduce((s, r) => s + r.quantity, 0);
                const totalRev = restProductQtyRows.reduce((s, r) => s + r.revenue, 0);
                return (
                  <div className="space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4 shadow-sm">
                      <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                        {tm('dateFrom')}
                        <input
                          type="date"
                          value={restProductQtyFrom}
                          onChange={(e) => setRestProductQtyFrom(e.target.value)}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[168px]"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                        {tm('dateTo')}
                        <input
                          type="date"
                          value={restProductQtyTo}
                          onChange={(e) => setRestProductQtyTo(e.target.value)}
                          className="px-3 py-2 border border-slate-200 rounded-lg text-sm min-w-[168px]"
                        />
                      </label>
                      <p className="text-xs text-slate-500 pb-1 max-w-xl leading-relaxed">{tm('resProductQtyReportSubtitle')}</p>
                    </div>
                    {restProductQtyError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{restProductQtyError}</div>
                    )}
                    {loadingRestProductQty ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
                        <Spin size="large" />
                        <span>{tm('loading')}</span>
                      </div>
                    ) : (
                      <>
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
                            {tm('resProductQtyReportTitle')} — {tm('enCokSatanlar')}
                          </h3>
                          <div className="h-[300px]">
                            {chartData.length === 0 ? (
                              <div className="h-full flex items-center justify-center text-slate-400 text-sm">{tm('resProductNoData')}</div>
                            ) : (
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9 }} interval={0} angle={-28} textAnchor="end" height={68} />
                                  <YAxis axisLine={false} tickLine={false} />
                                  <Tooltip
                                    formatter={(val: number) => [
                                      formatNumber(val, 2, false),
                                      tm('resProductColQty'),
                                    ]}
                                  />
                                  <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={22} />
                                </BarChart>
                              </ResponsiveContainer>
                            )}
                          </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                          <div
                            className="p-3 flex justify-between items-center text-white font-bold"
                            style={{ backgroundColor: bizConfig.color }}
                          >
                            <div className="flex items-center gap-2">
                              <ShoppingCart className="w-4 h-4" />
                              <span>{tm('resProductColProduct')}</span>
                            </div>
                            <div className="flex gap-20">
                              <span>{tm('resProductColQty')}</span>
                              <span>{tm('resProductColRevenue')}</span>
                            </div>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {restProductQtyRows.map((row, i) => (
                              <div
                                key={`${row.productId ?? 'x'}-${row.productName}-${i}`}
                                className="p-3 flex justify-between items-center gap-4 hover:bg-slate-50/90"
                              >
                                <span className="font-semibold text-slate-800 text-sm flex-1 min-w-0 break-words">{row.productName}</span>
                                <div className="flex gap-16 shrink-0 font-bold text-sm tabular-nums">
                                  <span>{formatNumber(row.quantity, 2, false)}</span>
                                  <span>{formatNumber(row.revenue, 2, false)}</span>
                                </div>
                              </div>
                            ))}
                            <div className="p-3 flex justify-between items-center bg-slate-100 font-bold border-t-2 border-slate-200">
                              <span className="text-sm text-slate-700">{tm('totalUppercase')}</span>
                              <div className="flex gap-16 shrink-0">
                                <span className="text-sm">{formatNumber(totalQ, 2, false)}</span>
                                <span className="text-sm">{formatNumber(totalRev, 2, false)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              }

              const productSalesData = getProductSales();
              const chartData = productSalesData.slice(0, 10).map((p, i) => ({
                name: p.product.name,
                value: p.revenue,
                fill: `hsl(${25 + i * 20}, 70%, 60%)`
              }));

              return (
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">En Çok Satan Ürünler</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: number) => formatNumber(val, 2, false)} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={25} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-3 flex justify-between items-center text-white font-bold" style={{ backgroundColor: bizConfig.color }}>
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4" />
                        <span>Ürün Adı</span>
                      </div>
                      <div className="flex gap-20">
                        <span>Miktar</span>
                        <span>Toplam Tutar</span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {productSalesData.map((prod, i) => (
                        <React.Fragment key={i}>
                          <div className="p-2 text-white font-bold text-[10px] uppercase pl-4" style={{ backgroundColor: `${bizConfig.color}cc` }}>{prod.product.name}</div>
                          <div className="p-2 flex justify-between items-center pl-8 border-b" style={{ backgroundColor: `${bizConfig.color}11`, borderColor: `${bizConfig.color}22` }}>
                            <span className="text-xs font-bold text-slate-500">Satış Verisi</span>
                            <div className="flex gap-20 font-bold text-xs">
                              <span>{formatNumber(prod.quantity, 2, false)} Adet</span>
                              <span>{formatNumber(prod.revenue, 2, false)}</span>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                      <div className="p-3 flex justify-between items-center bg-slate-100 font-bold border-t-2 border-slate-200">
                        <span className="text-sm font-bold text-slate-700">Genel Toplam</span>
                        <div className="flex gap-20">
                          <span className="text-sm font-bold">{formatNumber(productSalesData.reduce((s: number, p: any) => s + (p.quantity || 0), 0), 2, false)}</span>
                          <span className="text-sm font-bold">{formatNumber(productSalesData.reduce((s: number, p: any) => s + (p.revenue || 0), 0), 2, false)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'category-reports' && (() => {
              const categories = getCategoryAnalysis();
              const COLORS = ['#f06292', '#d4e157', '#64b5f6', '#9575cd', '#4db6ac', '#ffb74d'];

              return (
                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">Kategori Raporları</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categories.map((c, i) => ({ name: c.name, value: c.totalRevenue, fill: COLORS[i % COLORS.length] }))}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                          <YAxis axisLine={false} tickLine={false} />
                          <Tooltip formatter={(val: number) => formatNumber(val, 2, false)} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-3 flex justify-between items-center text-white font-bold" style={{ backgroundColor: bizConfig.color }}>
                      <div className="flex items-center gap-2">
                        <PieChartIcon className="w-4 h-4" />
                        <span>Kategori Adı</span>
                      </div>
                      <div className="flex gap-20">
                        <span>Miktar</span>
                        <span>Toplam Tutar</span>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {categories.map((cat, i) => (
                        <React.Fragment key={i}>
                          <div className="bg-orange-400 p-2 text-white font-bold text-xs uppercase pl-4">{cat.name}</div>
                          {cat.items && cat.items.slice(0, 3).map((item, j) => (
                            <div key={j} className="p-2 flex justify-between items-center bg-orange-50 pl-8 border-b border-orange-100 border-l-4 border-l-orange-200">
                              <span className="text-[11px] font-medium text-slate-600">{item.product_name}</span>
                              <div className="flex gap-20 font-bold text-[11px]">
                                <span>{formatNumber(item.quantity, 0, false)}</span>
                                <span>{formatNumber(item.subtotal, 2, false)}</span>
                              </div>
                            </div>
                          ))}
                          <div className="p-2 flex justify-between items-center bg-amber-50 pl-8 font-bold border-b border-amber-200">
                            <span className="text-xs text-amber-700">Kategori Toplamı</span>
                            <div className="flex gap-20 text-xs text-amber-700">
                              <span>{formatNumber(cat.totalQuantity, 2, false)}</span>
                              <span>{formatNumber(cat.totalRevenue, 2, false)}</span>
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                      <div className="p-3 flex justify-between items-center bg-purple-100 font-bold">
                        <span className="text-sm">Genel Toplam</span>
                        <div className="flex gap-20">
                          <span>{formatNumber(categories.reduce((s, c) => s + c.totalQuantity, 0), 2, false)}</span>
                          <span>{formatNumber(categories.reduce((s, c) => s + c.totalRevenue, 0), 2, false)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'detailed-sales' && (() => {
              const detailedGroups =
                businessType === 'restaurant'
                  ? restOrders.map((order: any) => {
                      const rawItems = Array.isArray(order.items) ? order.items : [];
                      const visibleItems = rawItems.filter((it: any) => it?.is_void !== true);
                      const open = formatRestReportDateTime(order.opened_at ?? order.openedAt);
                      const close = formatRestReportDateTime(order.closed_at ?? order.closedAt);
                      const tableLabel =
                        order.table_number != null && String(order.table_number).trim() !== ''
                          ? String(order.table_number)
                          : order.table_id != null
                            ? String(order.table_id)
                            : '—';
                      const orderId = String(order.order_no ?? order.id ?? '—');
                      const cari =
                        order.customer_name != null && String(order.customer_name).trim() !== ''
                          ? String(order.customer_name)
                          : 'Peşin Satış';
                      const statusLabel = order.status === 'closed' ? 'Kapalı' : 'Aktif';
                      const rows = visibleItems.map((it: any) => ({
                        open,
                        close,
                        table: tableLabel,
                        product: String(it.product_name ?? it.productName ?? '—'),
                        cari,
                        qty: Number(it.quantity ?? 0),
                        price: Number(it.unit_price ?? it.unitPrice ?? 0),
                        total: Number(it.subtotal ?? 0),
                        status: statusLabel,
                      }));
                      const qtySum = rows.reduce((s, r) => s + r.qty, 0);
                      const lineTotal = rows.reduce((s, r) => s + r.total, 0);
                      const discount = Number(order.discount_amount ?? 0);
                      const totalForSummary = lineTotal > 0 ? lineTotal : restOrderNetAmount(order);
                      return {
                        id: orderId,
                        items: rows,
                        summary: {
                          qty: qtySum,
                          total: totalForSummary,
                          discount,
                          count: rows.length,
                        },
                      };
                    })
                  : [];

              const totalLineCount = detailedGroups.reduce((s, g) => s + g.items.length, 0);

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-4 flex-1">
                      <Input
                        placeholder="Aranacak kelime giriniz"
                        prefix={<SearchOutlined className="text-slate-400" />}
                        className="max-w-md border-slate-200"
                      />
                      <Button icon={<FilterOutlined />}>Filtre</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button icon={<MailOutlined />} type="text" />
                      <Button icon={<FilePdfOutlined />} type="text" />
                      <Button icon={<FileExcelOutlined />} type="text" />
                      <Button icon={<PrinterOutlined />} type="text" />
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-[11px]">
                    <div className="flex items-center gap-2 p-2 bg-slate-50 border-b border-slate-100 italic text-slate-500">
                      <HistoryOutlined className="w-3 h-3" />
                      <span>Detaylar</span>
                      {loadingOrders && businessType === 'restaurant' && (
                        <span className="text-amber-600 not-italic">Yükleniyor…</span>
                      )}
                    </div>

                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-2 p-2 bg-slate-50 border-b border-slate-200 font-bold text-blue-600 uppercase tracking-tighter">
                      <div className="col-span-1">Açılış za...</div>
                      <div className="col-span-1">Kapanış ...</div>
                      <div className="col-span-1">Sipariş No</div>
                      <div className="col-span-1">Masa Adı</div>
                      <div className="col-span-1">Ürün Adı</div>
                      <div className="col-span-1">Cari</div>
                      <div className="col-span-1 text-center">Miktar</div>
                      <div className="col-span-1">Birim Fiyat</div>
                      <div className="col-span-1">Satır Topl...</div>
                      <div className="col-span-1">Durum</div>
                      <div className="col-span-2">Satır Öze...</div>
                    </div>

                    {businessType !== 'restaurant' ? (
                      <div className="p-8 text-center text-slate-500 text-sm">
                        Detaylı satış satır listesi restoran modunda, seçili güne ait siparişlerden üretilir.
                      </div>
                    ) : loadingOrders ? (
                      <div className="p-8 text-center text-slate-500 text-sm">Siparişler yükleniyor…</div>
                    ) : detailedGroups.length === 0 ? (
                      <div className="p-8 text-center text-slate-500 text-sm">
                        Bu tarih için sipariş bulunamadı.
                      </div>
                    ) : (
                      detailedGroups.map((group, idx) => (
                        <div key={`${group.id}-${idx}`} className="border-b border-slate-100 last:border-0">
                          <div className="bg-slate-50/50 p-2 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <CaretDownOutlined className="text-red-500 w-3 h-3" />
                              <span className="text-red-600 font-bold">Sipariş No : {group.id}</span>
                            </div>
                            <div className="flex items-center gap-4 text-[10px]">
                              <span className="text-green-600 font-bold">
                                (Miktar {group.summary.qty.toFixed(1)}, Tutar {group.summary.total.toFixed(2)}, İndirim{' '}
                                {group.summary.discount.toFixed(1)})
                              </span>
                              <span className="bg-red-500 text-white w-4 h-4 rounded-full flex items-center justify-center font-black">
                                {group.summary.count}
                              </span>
                            </div>
                          </div>
                          {group.items.length === 0 ? (
                            <div className="p-3 text-slate-400 italic border-b border-slate-50">Kalem yok</div>
                          ) : (
                            group.items.map((item, i) => (
                              <div
                                key={i}
                                className="grid grid-cols-12 gap-2 p-2 hover:bg-red-50/10 text-slate-600 transition-colors border-b border-slate-50 last:border-0"
                              >
                                <div className="col-span-1">{item.open}</div>
                                <div className="col-span-1">{item.close}</div>
                                <div className="col-span-1">{group.id}</div>
                                <div className="col-span-1">{item.table}</div>
                                <div className="col-span-1 font-bold text-slate-800">{item.product}</div>
                                <div className="col-span-1">{item.cari}</div>
                                <div className="col-span-1 text-center font-bold">{item.qty}</div>
                                <div className="col-span-1 font-bold">{formatNumber(Number(item.price), 2, false)}</div>
                                <div className="col-span-1 font-black">{formatNumber(Number(item.total), 2, false)}</div>
                                <div
                                  className={`col-span-1 font-bold ${item.status === 'Kapalı' ? 'text-slate-600' : 'text-green-500'}`}
                                >
                                  {item.status}
                                </div>
                                <div className="col-span-2">---</div>
                              </div>
                            ))
                          )}
                        </div>
                      ))
                    )}
                    <div className="p-2 bg-slate-100 flex justify-end items-center font-bold text-slate-500 border-t border-slate-200">
                      <span>Toplam Kayıt : {totalLineCount}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {selectedTab === 'analysis' && (() => {
              const cards: { title: string; kind: AnalysisReportKind }[] = [
                { title: 'Aylara Göre Satışlar', kind: 'sales-by-month' },
                { title: 'Kullanıcıya Göre Ciro Toplamları', kind: 'user-turnover' },
                { title: 'Kategoriye Göre Aylık Satış Toplamları', kind: 'category-monthly-revenue' },
                { title: 'Ürüne Göre Aylık Satış Miktarları', kind: 'product-monthly-qty' },
                { title: tm('resProductQtyAnalysisCard'), kind: 'product-sales-range' },
                { title: 'Kategoriye Göre Aylık Satış Miktarları', kind: 'category-monthly-qty' },
                { title: 'Bölümlere Göre Satış Toplamları', kind: 'section-turnover' },
                { title: 'Bölgelere Göre Satış Toplamları', kind: 'region-turnover' },
                { title: 'Masalara Göre Satış Toplamları', kind: 'table-turnover' },
                { title: 'Aylara Göre Tahsilat Toplamları', kind: 'collections-by-month' },
              ];
              return (
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-4">
                    <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                      Başlangıç
                      <input
                        type="date"
                        value={analysisDateFrom}
                        onChange={e => setAnalysisDateFrom(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                      Bitiş
                      <input
                        type="date"
                        value={analysisDateTo}
                        onChange={e => setAnalysisDateTo(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </label>
                    {businessType === 'restaurant' && loadingAnalysisOrders && (
                      <span className="text-xs text-slate-500 flex items-center gap-2 pb-2">
                        <Spin size="small" /> Veri yükleniyor…
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {cards.map(({ title, kind }) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setAnalysisModal({ kind, title })}
                        className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-4 hover:shadow-md hover:border-red-200 transition-all cursor-pointer group text-left"
                      >
                        <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                          <PieChartIcon className="text-red-600 w-6 h-6" />
                        </div>
                        <span className="text-[13px] font-bold text-slate-600 text-center leading-snug">{title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            <Modal
              open={!!analysisModal}
              title={<span className="text-lg font-black text-slate-800">{analysisModal?.title}</span>}
              onCancel={() => setAnalysisModal(null)}
              footer={
                <div className="flex justify-end border-t border-slate-100 pt-3">
                  <Button type="primary" size="large" onClick={() => setAnalysisModal(null)}>
                    Kapat
                  </Button>
                </div>
              }
              closable
              destroyOnHidden
              centered={false}
              width="100%"
              style={{ top: 0, margin: 0, padding: 0, maxWidth: '100vw' }}
              styles={{
                wrapper: { padding: 0, overflow: 'hidden' },
                container: {
                  width: '100vw',
                  maxWidth: '100vw',
                  height: '100vh',
                  margin: 0,
                  top: 0,
                  paddingBottom: 0,
                  borderRadius: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                },
                header: { flexShrink: 0 },
                body: { flex: 1, minHeight: 0, overflow: 'auto', padding: 20 },
                footer: { flexShrink: 0, marginTop: 0 },
              }}
              maskClosable
            >
              {analysisModal &&
                (() => {
                  const showRestaurantSpinner = businessType === 'restaurant' && loadingAnalysisOrders;
                  const { columns, dataSource, chartData } = showRestaurantSpinner
                    ? { columns: [] as ColumnsType<Record<string, unknown>>, dataSource: [], chartData: undefined as { name: string; value: number }[] | undefined }
                    : getAnalysisColumnsAndData(analysisModal.kind);
                  return (
                    <div className="space-y-4">
                      {showRestaurantSpinner ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
                          <Spin size="large" />
                          <span>Siparişler yükleniyor…</span>
                        </div>
                      ) : (
                        <>
                          {chartData && chartData.length > 0 && (
                            <div className="bg-white rounded-xl border border-slate-100 p-4 h-[min(320px,40vh)]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={70} />
                                  <YAxis axisLine={false} tickLine={false} width={48} />
                                  <Tooltip formatter={(val: number) => formatNumber(val, 2, false)} />
                                  <Bar dataKey="value" fill={bizConfig.color} radius={[4, 4, 0, 0]} maxBarSize={48} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                          <Table<Record<string, unknown>>
                            columns={columns}
                            dataSource={dataSource}
                            rowKey="key"
                            pagination={{ pageSize: 50, showSizeChanger: true, pageSizeOptions: [25, 50, 100, 200] }}
                            scroll={{ x: 'max-content', y: 'calc(100vh - 380px)' }}
                            size="small"
                            locale={{ emptyText: 'Bu dönem için kayıt yok' }}
                          />
                        </>
                      )}
                    </div>
                  );
                })()}
            </Modal>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
