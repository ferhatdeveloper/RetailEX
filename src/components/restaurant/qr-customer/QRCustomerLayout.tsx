import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Languages } from 'lucide-react';
import {
  qrPublicApi,
  type QrLang,
  type QrPublicCartItem,
  type QrPublicSettings,
} from './qrPublicApi';
import './qrTheme.css';

type CartContextValue = {
  items: QrPublicCartItem[];
  addItem: (item: Omit<QrPublicCartItem, 'qty'> & { qty?: number }) => void;
  setQty: (productId: string, qty: number) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
  total: number;
  count: number;
};

type QrCustomerContextValue = {
  tenantCode: string;
  tableToken: string | null;
  lang: QrLang;
  setLang: (l: QrLang) => void;
  settings: QrPublicSettings | null;
  tableNumber: string | null;
  loading: boolean;
  error: string | null;
  cart: CartContextValue;
  basePath: string;
  t: (key: string) => string;
};

const QrCustomerContext = createContext<QrCustomerContextValue | null>(null);

const UI: Record<QrLang, Record<string, string>> = {
  tr: {
    menu: 'Menü',
    cart: 'Sepet',
    orders: 'Siparişlerim',
    waiter: 'Garson',
    bill: 'Hesap',
    valet: 'Vale',
    wifi: 'WiFi',
    feedback: 'Geri bildirim',
    home: 'Ana sayfa',
    back: 'Geri',
    loading: 'Yükleniyor…',
    emptyCart: 'Sepet boş',
    sendOrder: 'Sipariş gönder',
    table: 'Masa',
    add: 'Ekle',
    note: 'Not',
    total: 'Toplam',
    callWaiter: 'Garson Çağır',
    requestBill: 'Hesap İste',
    help: 'Yardım',
    plate: 'Plaka',
    submit: 'Gönder',
    thanks: 'Teşekkürler',
    copy: 'Kopyala',
    ssid: 'Ağ adı',
    password: 'Şifre',
    noTable: 'Masa seçilmedi — yalnızca menü',
    orderSent: 'Siparişiniz alındı',
    orderPendingApproval: 'Siparişiniz onaya gönderildi',
    error: 'Bir hata oluştu',
    liveOrder: 'Canlı sipariş',
    noLiveOrder: 'Açık sipariş yok',
    phaseEmpty: 'Henüz sipariş yok',
    phaseReceived: 'Sipariş alındı',
    phasePreparing: 'Hazırlanıyor',
    phaseServed: 'Servis edildi',
    phaseBilling: 'Hesap bekleniyor',
    phaseOpen: 'Açık',
    phaseAwaitingApproval: 'Onay bekliyor',
    statusPending: 'Bekliyor',
    statusCooking: 'Mutfakta',
    statusReady: 'Hazır',
    statusServed: 'Servis edildi',
    statusAwaiting: 'Onay bekliyor',
    refreshing: 'Güncelleniyor…',
    yourBill: 'Hesabınız',
    discount: 'İndirim',
    requestBillHint: 'Hesabı görmek için masanızın QR kodunu kullanın',
    billRequested: 'Hesap talebi gönderildi',
    pendingOrders: 'Onay bekleyen',
    viewMenu: 'Menüyü Gör',
    myOrders: 'Siparişlerim',
    valetService: 'Vale',
    wifiInfo: 'WiFi',
    searchProduct: 'Ürün ara…',
    allStatus: 'Tümü',
    noResults: 'Sonuç bulunamadı',
    items: 'ürün',
    viewCart: 'Sepet',
    homeTagline: 'Sipariş · servis · hesap — masanızdan tek dokunuşla',
    noImage: 'Resim yok',
  },
  en: {
    menu: 'Menu',
    cart: 'Cart',
    orders: 'My orders',
    waiter: 'Waiter',
    bill: 'Bill',
    valet: 'Valet',
    wifi: 'WiFi',
    feedback: 'Feedback',
    home: 'Home',
    back: 'Back',
    loading: 'Loading…',
    emptyCart: 'Cart is empty',
    sendOrder: 'Place order',
    table: 'Table',
    add: 'Add',
    note: 'Note',
    total: 'Total',
    callWaiter: 'Call waiter',
    requestBill: 'Request bill',
    help: 'Help',
    plate: 'Plate',
    submit: 'Submit',
    thanks: 'Thank you',
    copy: 'Copy',
    ssid: 'Network',
    password: 'Password',
    noTable: 'No table — menu only',
    orderSent: 'Order received',
    orderPendingApproval: 'Order sent for approval',
    error: 'Something went wrong',
    liveOrder: 'Live order',
    noLiveOrder: 'No open order',
    phaseEmpty: 'No order yet',
    phaseReceived: 'Order received',
    phasePreparing: 'Preparing',
    phaseServed: 'Served',
    phaseBilling: 'Awaiting bill',
    phaseOpen: 'Open',
    phaseAwaitingApproval: 'Awaiting approval',
    statusPending: 'Pending',
    statusCooking: 'In kitchen',
    statusReady: 'Ready',
    statusServed: 'Served',
    statusAwaiting: 'Awaiting approval',
    refreshing: 'Updating…',
    yourBill: 'Your bill',
    discount: 'Discount',
    requestBillHint: 'Scan your table QR to see the bill',
    billRequested: 'Bill request sent',
    pendingOrders: 'Pending approval',
    viewMenu: 'View Menu',
    myOrders: 'My Orders',
    valetService: 'Valet',
    wifiInfo: 'WiFi',
    searchProduct: 'Search…',
    allStatus: 'All',
    noResults: 'No results',
    items: 'items',
    viewCart: 'Cart',
    homeTagline: 'Order · service · bill — from your table',
    noImage: 'No image',
  },
  ar: {
    menu: 'القائمة',
    cart: 'السلة',
    orders: 'طلباتي',
    waiter: 'النادل',
    bill: 'الحساب',
    valet: 'خدمة السيارات',
    wifi: 'واي فاي',
    feedback: 'تقييم',
    home: 'الرئيسية',
    back: 'رجوع',
    loading: 'جاري التحميل…',
    emptyCart: 'السلة فارغة',
    sendOrder: 'إرسال الطلب',
    table: 'طاولة',
    add: 'إضافة',
    note: 'ملاحظة',
    total: 'المجموع',
    callWaiter: 'استدعاء النادل',
    requestBill: 'طلب الحساب',
    help: 'مساعدة',
    plate: 'لوحة',
    submit: 'إرسال',
    thanks: 'شكراً',
    copy: 'نسخ',
    ssid: 'الشبكة',
    password: 'كلمة المرور',
    noTable: 'بدون طاولة — القائمة فقط',
    orderSent: 'تم استلام الطلب',
    orderPendingApproval: 'تم إرسال الطلب للموافقة',
    error: 'حدث خطأ',
    liveOrder: 'الطلب المباشر',
    noLiveOrder: 'لا يوجد طلب مفتوح',
    phaseEmpty: 'لا طلب بعد',
    phaseReceived: 'تم استلام الطلب',
    phasePreparing: 'قيد التحضير',
    phaseServed: 'تم التقديم',
    phaseBilling: 'بانتظار الحساب',
    phaseOpen: 'مفتوح',
    phaseAwaitingApproval: 'بانتظار الموافقة',
    statusPending: 'قيد الانتظار',
    statusCooking: 'في المطبخ',
    statusReady: 'جاهز',
    statusServed: 'تم التقديم',
    statusAwaiting: 'بانتظار الموافقة',
    refreshing: 'جاري التحديث…',
    yourBill: 'فاتورتك',
    discount: 'خصم',
    requestBillHint: 'امسح رمز الطاولة لرؤية الحساب',
    billRequested: 'تم إرسال طلب الحساب',
    pendingOrders: 'بانتظار الموافقة',
    viewMenu: 'عرض القائمة',
    myOrders: 'طلباتي',
    valetService: 'خدمة السيارات',
    wifiInfo: 'واي فاي',
    searchProduct: 'بحث…',
    allStatus: 'الكل',
    noResults: 'لا نتائج',
    items: 'عناصر',
    viewCart: 'السلة',
    homeTagline: 'طلب · خدمة · حساب — من طاولتك',
    noImage: 'لا صورة',
  },
  ku: {
    menu: 'مینیو',
    cart: 'سەبەتە',
    orders: 'داواکارییەکانم',
    waiter: 'گارسۆن',
    bill: 'حیساب',
    valet: 'ڤالێ',
    wifi: 'WiFi',
    feedback: 'فیدباک',
    home: 'سەرەتا',
    back: 'گەڕانەوە',
    loading: 'بارکردن…',
    emptyCart: 'سەبەتە بەتاڵە',
    sendOrder: 'ناردنی داواکاری',
    table: 'مێز',
    add: 'زیادکردن',
    note: 'تێبینی',
    total: 'کۆ',
    callWaiter: 'بانگکردنی گارسۆن',
    requestBill: 'داوای حیساب',
    help: 'یارمەتی',
    plate: 'پلەیت',
    submit: 'ناردن',
    thanks: 'سوپاس',
    copy: 'لەبەرگرتنەوە',
    ssid: 'ناوی تۆڕ',
    password: 'وشەی نهێنی',
    noTable: 'بێ مێز — تەنها مینیو',
    orderSent: 'داواکاری وەرگیرا',
    orderPendingApproval: 'داواکاری بۆ پەسەند نێردرا',
    error: 'هەڵەیەک ڕوویدا',
    liveOrder: 'داواکاری زیندوو',
    noLiveOrder: 'داواکاری کراوە نییە',
    phaseEmpty: 'هێشتا داواکاری نییە',
    phaseReceived: 'داواکاری وەرگیرا',
    phasePreparing: 'ئامادەدەکرێت',
    phaseServed: 'خزمەتکرا',
    phaseBilling: 'چاوەڕوانی حیساب',
    phaseOpen: 'کراوە',
    phaseAwaitingApproval: 'چاوەڕوانی پەسەند',
    statusPending: 'چاوەڕوان',
    statusCooking: 'لە چێشتخانە',
    statusReady: 'ئامادەیە',
    statusServed: 'خزمەتکرا',
    statusAwaiting: 'چاوەڕوانی پەسەند',
    refreshing: 'نوێکردنەوە…',
    yourBill: 'حیسابەکەت',
    discount: 'داشکاندن',
    requestBillHint: 'بۆ بینینی حیساب QRی مێزەکەت بسکانە',
    billRequested: 'داوای حیساب نێردرا',
    pendingOrders: 'چاوەڕوانی پەسەند',
    viewMenu: 'مینیو ببینە',
    myOrders: 'داواکارییەکانم',
    valetService: 'ڤالێ',
    wifiInfo: 'WiFi',
    searchProduct: 'گەڕان…',
    allStatus: 'هەموو',
    noResults: 'ئەنجام نەدۆزرایەوە',
    items: 'بەرهەم',
    viewCart: 'سەبەتە',
    homeTagline: 'داواکاری · خزمەت · حیساب — لە مێزەکەتەوە',
    noImage: 'وێنە نییە',
  },
};

function cartStorageKey(tenant: string, table: string | null) {
  return `rex_qr_cart_${tenant}_${table || 'guest'}`;
}

function ordersStorageKey(tenant: string, table: string | null) {
  return `rex_qr_orders_${tenant}_${table || 'guest'}`;
}

export function readLocalOrders(tenant: string, table: string | null): Array<{
  at: string;
  items: QrPublicCartItem[];
  orderId?: string;
}> {
  try {
    const raw = localStorage.getItem(ordersStorageKey(tenant, table));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushLocalOrder(
  tenant: string,
  table: string | null,
  entry: { items: QrPublicCartItem[]; orderId?: string }
) {
  const prev = readLocalOrders(tenant, table);
  const next = [{ at: new Date().toISOString(), ...entry }, ...prev].slice(0, 20);
  localStorage.setItem(ordersStorageKey(tenant, table), JSON.stringify(next));
}

export function useQrCustomer() {
  const ctx = useContext(QrCustomerContext);
  if (!ctx) throw new Error('useQrCustomer outside QRCustomerLayout');
  return ctx;
}

export function QRCustomerLayout() {
  const { tenantCode = '', tableToken } = useParams<{
    tenantCode: string;
    tableToken?: string;
  }>();
  const navigate = useNavigate();
  const token = tableToken?.trim() || null;

  const [lang, setLangState] = useState<QrLang>('tr');
  const [settings, setSettings] = useState<QrPublicSettings | null>(null);
  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QrPublicCartItem[]>([]);

  const basePath = token
    ? `/m/${encodeURIComponent(tenantCode)}/t/${encodeURIComponent(token)}`
    : `/m/${encodeURIComponent(tenantCode)}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartStorageKey(tenantCode, token));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
  }, [tenantCode, token]);

  useEffect(() => {
    localStorage.setItem(cartStorageKey(tenantCode, token), JSON.stringify(items));
  }, [items, tenantCode, token]);

  useEffect(() => {
    document.documentElement.classList.add('rex-qr-active');
    return () => {
      document.documentElement.classList.remove('rex-qr-active');
      document.documentElement.classList.remove('rex-qr-classic-active');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const menu = await qrPublicApi.getMenu(tenantCode);
        if (cancelled) return;
        setSettings(menu.settings || {});
        const def = (menu.settings?.default_language || 'tr') as QrLang;
        if (['tr', 'en', 'ar', 'ku'].includes(def)) setLangState(def);
        if (token) {
          try {
            const info = await qrPublicApi.getTable(tenantCode, token);
            if (!cancelled) setTableNumber(info.tableNumber || null);
          } catch {
            if (!cancelled) setTableNumber(null);
          }
        } else {
          setTableNumber(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setSettings({
            restaurant_name: 'RetailEX',
            ordering_enabled: true,
            call_waiter_enabled: true,
            request_bill_enabled: true,
            feedback_enabled: true,
            wifi_enabled: true,
            valet_enabled: false,
            primary_color: '#f59e0b',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantCode, token]);

  const setLang = useCallback((l: QrLang) => setLangState(l), []);

  const cart: CartContextValue = useMemo(() => {
    const addItem: CartContextValue['addItem'] = (item) => {
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.productId === item.productId);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = {
            ...copy[idx],
            qty: copy[idx].qty + (item.qty ?? 1),
            note: item.note ?? copy[idx].note,
          };
          return copy;
        }
        return [
          ...prev,
          {
            productId: item.productId,
            name: item.name,
            price: item.price,
            qty: item.qty ?? 1,
            note: item.note,
            image: item.image ?? null,
          },
        ];
      });
    };
    const setQty = (productId: string, qty: number) => {
      setItems((prev) =>
        qty <= 0
          ? prev.filter((p) => p.productId !== productId)
          : prev.map((p) => (p.productId === productId ? { ...p, qty } : p))
      );
    };
    const removeItem = (productId: string) =>
      setItems((prev) => prev.filter((p) => p.productId !== productId));
    const clear = () => setItems([]);
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const count = items.reduce((s, i) => s + i.qty, 0);
    return { items, addItem, setQty, removeItem, clear, total, count };
  }, [items]);

  const t = useCallback(
    (key: string) => UI[lang]?.[key] ?? UI.tr[key] ?? key,
    [lang]
  );

  const value: QrCustomerContextValue = {
    tenantCode,
    tableToken: token,
    lang,
    setLang,
    settings,
    tableNumber,
    loading,
    error,
    cart,
    basePath,
    t,
  };

  const accent = settings?.primary_color || '#d4a574';
  const classic = settings?.guest_ui_theme === 'classic';
  const rtl = lang === 'ar' || lang === 'ku';

  useEffect(() => {
    document.documentElement.classList.toggle('rex-qr-classic-active', classic);
  }, [classic]);

  const location = useLocation();
  const pathNorm = location.pathname.replace(/\/+$/, '');
  const baseNorm = basePath.replace(/\/+$/, '');
  const isHome = pathNorm === baseNorm;
  const isMenu = pathNorm === `${baseNorm}/menu`;
  const isCart = pathNorm === `${baseNorm}/cart`;
  // Premium: home/menu/cart kendi chrome'unu kullanır. Klasik: yalnızca home/menu.
  const selfChrome = classic ? isHome || isMenu : isHome || isMenu || isCart;

  return (
    <QrCustomerContext.Provider value={value}>
      <div
        className={
          classic
            ? 'rex-qr rex-qr--classic min-h-[100dvh] min-h-[100svh] bg-slate-950 text-slate-100'
            : 'rex-qr min-h-[100dvh] min-h-[100svh]'
        }
        dir={rtl ? 'rtl' : 'ltr'}
        style={
          classic
            ? ({
                ['--qr-accent' as string]: accent,
                background: '#0f172a',
              } as React.CSSProperties)
            : ({
                ['--qr-gold' as string]: accent,
                ['--qr-copper' as string]: accent,
                background: 'var(--qr-bg)',
              } as React.CSSProperties)
        }
      >
        {!selfChrome && (
          <button
            type="button"
            onClick={() => navigate(basePath)}
            className={
              classic
                ? 'fixed top-4 left-4 z-50 w-10 h-10 rounded-full bg-slate-800/80 backdrop-blur-md text-white border border-slate-700/50 flex items-center justify-center'
                : 'rex-qr-press fixed top-4 left-4 z-50 w-11 h-11 rounded-full flex items-center justify-center'
            }
            style={
              classic
                ? undefined
                : {
                    background: 'rgba(22,20,18,0.85)',
                    border: '1px solid var(--qr-line)',
                    color: 'var(--qr-text)',
                    backdropFilter: 'blur(12px)',
                  }
            }
            aria-label={t('home')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        {classic && !selfChrome && (
          <div className="fixed top-4 right-4 z-50">
            <div className="relative">
              <Languages className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as QrLang)}
                className="appearance-none bg-slate-800/80 backdrop-blur-md border border-slate-700/50 rounded-full pl-8 pr-3 py-2 text-xs text-white"
              >
                {(settings?.supported_languages?.length
                  ? settings.supported_languages
                  : ['tr', 'en', 'ar', 'ku']
                ).map((l) => (
                  <option key={l} value={l}>
                    {String(l).toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <main className={selfChrome ? 'w-full' : 'pt-16 px-4 pb-10 max-w-lg mx-auto w-full'}>
          {loading ? (
            <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3">
              {classic ? (
                <p className="text-slate-400 animate-pulse">{t('loading')}</p>
              ) : (
                <>
                  <div
                    className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: 'var(--qr-gold)', borderTopColor: 'transparent' }}
                  />
                  <p className="text-sm" style={{ color: 'var(--qr-muted)' }}>
                    {t('loading')}
                  </p>
                </>
              )}
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </QrCustomerContext.Provider>
  );
}
