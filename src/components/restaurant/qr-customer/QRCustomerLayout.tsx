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
    callWaiter: 'Garson çağır',
    requestBill: 'Hesap iste',
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

  const accent = settings?.primary_color || '#f59e0b';
  const rtl = lang === 'ar' || lang === 'ku';
  const location = useLocation();
  const isHome =
    location.pathname === basePath ||
    location.pathname === `${basePath}/` ||
    location.pathname.replace(/\/+$/, '') === basePath.replace(/\/+$/, '');

  return (
    <QrCustomerContext.Provider value={value}>
      <div
        className={
          isHome
            ? 'min-h-[100dvh] bg-slate-950 text-slate-100'
            : 'min-h-[100dvh] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col'
        }
        dir={rtl ? 'rtl' : 'ltr'}
        style={{ ['--qr-accent' as string]: accent }}
      >
        {!isHome && (
          <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
            <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(basePath)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-400"
                aria-label={t('home')}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {settings?.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover border border-slate-700 shrink-0"
                  />
                ) : null}
                <div className="min-w-0">
                  <h1 className="font-semibold text-base truncate text-amber-400">
                    {settings?.restaurant_name || 'QR Menü'}
                  </h1>
                  <p className="text-xs text-slate-500 truncate">
                    {tableNumber
                      ? `${t('table')} ${tableNumber}`
                      : token
                        ? `${t('table')} …`
                        : t('noTable')}
                  </p>
                </div>
              </div>
              <div className="relative">
                <Languages className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as QrLang)}
                  className="appearance-none bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200"
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
          </header>
        )}
        <main
          className={
            isHome
              ? 'w-full'
              : 'flex-1 max-w-lg mx-auto w-full px-4 py-4 pb-8'
          }
        >
          {loading && !isHome ? (
            <p className="text-center text-slate-400 animate-pulse py-16">{t('loading')}</p>
          ) : loading && isHome ? (
            <div className="min-h-[100dvh] flex items-center justify-center bg-slate-950">
              <p className="text-slate-400 animate-pulse">{t('loading')}</p>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </QrCustomerContext.Provider>
  );
}
