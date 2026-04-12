import React, { useState, useEffect, useCallback, lazy, Suspense, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ManagementModule } from './ManagementModule';
import { MobilePOS } from '../pos/MobilePOS';
import { LogOut, User, ShoppingCart, LayoutGrid, Clock, Calendar, Lock, Users, X, Languages, Server, Receipt, Building2, Warehouse, RefreshCw, ChevronDown, AlertCircle, ChevronRight, Check, UtensilsCrossed, Sparkles } from 'lucide-react';
import type { User as UserType, Product, Customer, Sale, Campaign } from '../../core/types';
import type { Module, ManagementScreen } from '../../App';
import { POSCustomerModal } from '../pos/POSCustomerModal';
import { POSStaffModal } from '../pos/POSStaffModal';
import { ScreenSettingsModal, type LayoutOrder } from './ScreenSettingsModal';
import { logger } from '../../utils/logger';
import { LanguageSelectionModal } from './LanguageSelectionModal';
import { useDatabaseStatus } from '../../hooks/useDatabaseStatus';
import { useTheme } from '../../contexts/ThemeContext';
import { FirmaDonemQuickSetup } from './FirmaDonemQuickSetup';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermission } from '../../shared/hooks/usePermission';
import { useResponsive } from '../../hooks/useResponsive';
import { VoiceAssistantWeb } from '../modules/VoiceAssistantWeb';
import { wsService } from '../../services/websocket';
import { useRestaurantStore } from '../restaurant/store/useRestaurantStore';
import { useRestaurantCallerId } from '../../hooks/useRestaurantCallerId';
import { useCallerIdRestaurantOrders } from '../../hooks/useCallerIdRestaurantOrders';
import { useCallerIdBeautyAppointments } from '../../hooks/useCallerIdBeautyAppointments';
import { findCustomerByCallerPhone } from '../../services/restaurantCallerIdService';
import { getBridgeUrl, IS_TAURI } from '../../utils/env';
import { showCallerIdDesktopNotification } from '../../utils/callerIdDesktopNotify';
import { toast } from 'sonner';
import { useCustomerStore } from '../../store/useCustomerStore';

// Lazy load MarketPOS for better initial performance
import MarketPOS from '../pos/MarketPOS';
// const MarketPOS = lazy(() => import('../pos/MarketPOS'));
// Lazy load WMS
const WarehouseManagement = lazy(() => import('../wms')) as any;
// Lazy load Restaurant & Beauty
const RestaurantMain = lazy(() => import('../restaurant/index'));
const BeautyMain = lazy(() => import('../beauty/index'));
import { AppFooter } from '../shared/AppFooter';
import { FirmSelector } from './FirmSelector';
import { cn } from '../ui/utils';
import {
  getPrimaryShellModuleForCallerId,
  getShellModuleFallbackOrder,
  isMainModuleVisible,
} from '../../utils/mainModuleVisibility';

/** Üst çubukta saat/tarih — interval yalnızca bu düğümü yeniler, tüm MainLayout + POS'u değil */
function MainLayoutClockButton({ onOpenModal }: { onOpenModal: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <button
      type="button"
      onClick={onOpenModal}
      className="flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm bg-white/12 hover:bg-white/20 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-2xl border border-white/15 transition-colors flex-shrink-0 whitespace-nowrap font-semibold shadow-inner"
    >
      <Calendar className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 opacity-90" />
      <span className="hidden md:inline">
        {now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
      </span>
      <span className="hidden md:inline text-blue-200/90">•</span>
      <Clock className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 opacity-90" />
      <span className="tabular-nums text-sm sm:text-base">
        {now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    </button>
  );
}

/** Gerçek zamanlı WebSocket (127.0.0.1:9999) — SQL bridge (3001) ile karıştırılmamalı */
function WsConnectionStatusDot() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>(() => wsService.getStatus());
  useEffect(() => {
    const id = window.setInterval(() => setStatus(wsService.getStatus()), 2000);
    return () => window.clearInterval(id);
  }, []);

  const title =
    status === 'connected'
      ? 'Gerçek zamanlı sunucu (WebSocket) bağlı — ws://127.0.0.1:9999'
      : status === 'connecting'
        ? 'Gerçek zamanlı sunucuya bağlanılıyor…'
        : IS_TAURI
          ? 'WebSocket yok — Masaüstü uygulamasında 9999 portu dinlenmiyor olabilir (pg_bridge/SQL ile ilgili değildir)'
          : 'Tarayıcı modu: WebSocket sunucusu (9999) yok — beklenen; SQL için ayrıca npm run bridge (3001) kullanılır';

  let boxClass =
    'w-4 h-4 sm:w-5 sm:h-5 rounded transition-colors flex-shrink-0 ';
  if (status === 'connected') {
    boxClass += 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]';
  } else if (status === 'connecting') {
    boxClass += 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)] animate-pulse';
  } else if (!IS_TAURI) {
    boxClass += 'bg-slate-500/90 shadow-[0_0_4px_rgba(100,116,139,0.4)]';
  } else {
    boxClass += 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]';
  }

  return <div className={boxClass} title={title} role="status" aria-label={title} />;
}

interface MainLayoutProps {
  currentUser: UserType;
  products: Product[];
  setProducts: (products: Product[]) => void;
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
  sales: Sale[];
  campaigns: Campaign[];
  setCampaigns: (campaigns: Campaign[]) => void;
  onSaleComplete: (sale: Sale) => void;
  onLogout: () => void;
}

export function MainLayout({
  currentUser,
  products,
  setProducts,
  customers,
  setCustomers,
  sales,
  campaigns,
  setCampaigns,
  onSaleComplete,
  onLogout
}: MainLayoutProps) {
  const { t, tm } = useLanguage();
  // Firma/Dönem Context
  const { selectedFirm, selectedPeriod, firms, periods, selectFirm, selectPeriod, refreshFirms, loading: firmaLoading } = useFirmaDonem();
  const [showQuickSetup, setShowQuickSetup] = useState(false);

  const { hasPermission, isAdmin } = usePermission();

  const isModuleVisible = (moduleId: string) => isMainModuleVisible(moduleId);

  // Kullanıcı rolüne göre başlangıç modülünü belirle
  const getInitialModule = (): Module => {
    const rawSaved = localStorage.getItem('retailex_active_module');
    const savedModule = (rawSaved === 'backoffice' ? 'management' : rawSaved) as Module;
    if (savedModule && ['pos', 'management', 'wms', 'mobile-pos', 'restaurant', 'beauty'].includes(savedModule)) {
      if (isMainModuleVisible(savedModule)) return savedModule;
    }

    // 0b. Garson / Waiter rolü — koşulsuz restoran
    const primaryRoleName = (currentUser?.roles?.[0]?.name || currentUser?.role || '').toLowerCase();
    if (primaryRoleName === 'garson' || primaryRoleName === 'waiter') return 'restaurant';

    // Yönetici: varsayılan yönetim paneli (yönetim sekmesi her zaman görünür)
    if (isAdmin() || (currentUser?.role && ['admin', 'manager'].includes(currentUser.role))) return 'management';

    // 2. Diğer Yetki bazlı öncelikler:
    if (hasPermission('restaurant', 'READ')) return 'restaurant';
    if (hasPermission('beauty', 'READ')) return 'beauty';
    if (hasPermission('wms', 'READ')) return 'wms';
    if (hasPermission('management', 'READ')) return 'management';

    // Varsayılan POS
    return 'pos';
  };

  const [currentModule, setCurrentModule] = useState<Module>(getInitialModule());
  /** Caller ID bildirimi tıklaması gibi async kapaklarda güncel modül */
  const currentModuleRef = useRef(currentModule);
  currentModuleRef.current = currentModule;

  // Check for WMS redirect flag from login (depo store login) or URL parameter
  useEffect(() => {
    // 1. Check for URL parameter (direct link from User Guide)
    const params = new URLSearchParams(window.location.search);
    if (params.has('wms_page')) {
      setCurrentModule('wms');
      return;
    }

    // 2. Check for redirect flag
    const redirectToWMS = localStorage.getItem('exretail_redirect_to_wms');
    if (redirectToWMS === 'true') {
      setCurrentModule('wms');
      localStorage.removeItem('exretail_redirect_to_wms');
    }
  }, []);

  // Save current module to localStorage for persistence
  useEffect(() => {
    if (currentModule) {
      localStorage.setItem('retailex_active_module', currentModule);
    }
  }, [currentModule]);

  // Aktif modül görünür değilse ilk görünür modüle düş (geçersiz id — örn. eski 'backoffice' — düzeltilir)
  const MAIN_MODULE_IDS: Module[] = ['pos', 'management', 'wms', 'mobile-pos', 'restaurant', 'beauty'];
  useEffect(() => {
    const cm = currentModule as string;
    if (cm === 'backoffice') {
      setCurrentModule('management');
      return;
    }
    if (!MAIN_MODULE_IDS.includes(cm as Module)) {
      const orderedModules = getShellModuleFallbackOrder() as Module[];
      const nextVisible = orderedModules.find((m) => isModuleVisible(m));
      if (nextVisible) setCurrentModule(nextVisible);
      return;
    }
    if (isModuleVisible(currentModule)) return;
    const orderedModules = getShellModuleFallbackOrder() as Module[];
    const nextVisible = orderedModules.find((m) => isModuleVisible(m));
    if (nextVisible) setCurrentModule(nextVisible);
  }, [currentModule]);

  // Check if firma/donem setup is needed on mount - AFTER currentModule is defined
  useEffect(() => {
    // Veriler yüklenirken bekle
    if (firmaLoading) return;

    // Don't show quick setup if user has already configured firma/donem in localStorage
    const hasConfigured = localStorage.getItem('exretail_firma_donem_configured') === 'true';

    if (!hasConfigured && currentModule === 'management' && firms.length === 0 && !selectedFirm) {
      // Show quick setup after a brief delay
      const timer = setTimeout(() => {
        setShowQuickSetup(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentModule, firms, selectedFirm, firmaLoading]);

  const [showDateModal, setShowDateModal] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('');
  const [datePassword, setDatePassword] = useState('');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showFirmaInfoModal, setShowFirmaInfoModal] = useState(false);
  const { isMobile, isTablet, isSmallMobile } = useResponsive();

  // Management password modal state
  const [showManagementPasswordModal, setShowManagementPasswordModal] = useState(false);
  const [managementPassword, setManagementPassword] = useState('');
  const [managementPasswordError, setManagementPasswordError] = useState('');
  const [managementPasswordLoading, setManagementPasswordLoading] = useState(false);

  const verifyManagementPassword = async (pwd: string): Promise<boolean> => {
    if (!pwd) return false;
    if (currentUser.role === 'admin' || currentUser.role === 'manager') return true;
    try {
      const { postgres, ERP_SETTINGS } = await import('../../services/postgres');
      const firmNr = String(ERP_SETTINGS.firmNr || '001').trim();
      const { rows } = await postgres.query(
        `SELECT 1
         FROM public.users u
         LEFT JOIN public.roles r ON r.id = u.role_id
         WHERE LPAD(TRIM(COALESCE(u.firm_nr, '')), 3, '0') = LPAD(TRIM($1), 3, '0')
           AND u.is_active = true
           AND LOWER(COALESCE(NULLIF(u.role, ''), r.name, '')) IN ('admin', 'manager', 'yonetici', 'yönetici')
           AND u.password_hash IS NOT NULL
           AND (
             u.password_hash = crypt($2, u.password_hash)
             OR u.password_hash = $2
           )
         LIMIT 1`,
        [firmNr, pwd]
      );
      return rows.length > 0;
    } catch (err) {
      console.error('[MainLayout] verifyManagementPassword failed:', err?.message || String(err));
      return false;
    }
  };

  const handleManagementAccess = async (pwd: string) => {
    setManagementPasswordLoading(true);
    const ok = await verifyManagementPassword(pwd);
    setManagementPasswordLoading(false);
    if (ok) {
      setCurrentModule('management');
      setShowManagementPasswordModal(false);
      setManagementPassword('');
      setManagementPasswordError('');
    } else {
      setManagementPasswordError('Hatalı şifre!');
    }
  };

  // POS state - müşteri ve personel seçimi
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [currentStaff, setCurrentStaff] = useState(currentUser.full_name || currentUser.username || (currentUser as any).fullName);

  // Sync staff name when user changes (e.g. after switching user in POSStaffModal)
  useEffect(() => {
    setCurrentStaff(currentUser.full_name || currentUser.username || (currentUser as any).fullName);
  }, [currentUser.full_name, currentUser.username, (currentUser as any).fullName]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerModalInitialQuery, setCustomerModalInitialQuery] = useState('');
  const [showStaffModal, setShowStaffModal] = useState(false);
  // Database Status Hook
  const { dbStatus } = useDatabaseStatus();

  // Zoom Settings State
  const [showZoomModal, setShowZoomModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(() => {
    const saved = localStorage.getItem('retailos_zoom_level');
    return saved ? parseInt(saved) : 100; // Varsayılan %100
  });
  const [gridColumns, setGridColumns] = useState(() => {
    const saved = localStorage.getItem('retailos_grid_columns');
    return saved ? parseInt(saved) : 4;
  });
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('retailos_font_size');
    return saved ? parseInt(saved) : 100;
  });
  const [fontWeight, setFontWeight] = useState(() => {
    const saved = localStorage.getItem('retailos_font_weight');
    return saved ? parseInt(saved) : 400;
  });
  const [cartViewMode, setCartViewMode] = useState<'table' | 'cards'>(() => {
    const saved = localStorage.getItem('retailos_cart_view_mode');
    return (saved as 'table' | 'cards') || 'cards';
  });
  const [buttonColorStyle, setButtonColorStyle] = useState<'filled' | 'outline'>(() => {
    const saved = localStorage.getItem('retailos_button_color_style');
    return (saved as 'filled' | 'outline') || 'filled';
  });

  // Layout Order State - Kolon sıralaması
  const [layoutOrder, setLayoutOrder] = useState<LayoutOrder>(() => {
    const saved = localStorage.getItem('retailos_layout_order');
    return (saved as LayoutOrder) || 'cart-numpad-quick';
  });
  const { callerIdConfig } = useRestaurantStore();
  const callerIdActive = callerIdConfig.mode !== 'off';
  const { incomingCall, dismissIncoming, pollError } = useRestaurantCallerId(callerIdConfig, callerIdActive);
  const lastDesktopNotifyKeyRef = useRef<string | null>(null);
  const lastPollErrorRef = useRef<string | null>(null);

  // Use ThemeContext for dark mode
  const { darkMode, setDarkMode } = useTheme();

  /** Caller ID: önce bellekteki liste, yoksa PG’de gevşek telefon eşlemesi */
  const [callerIdDbCustomer, setCallerIdDbCustomer] = useState<Customer | null>(null);

  const matchedCallerCustomer = useMemo(() => {
    if (!incomingCall) return null;
    return findCustomerByCallerPhone(customers, incomingCall.phone) || callerIdDbCustomer;
  }, [incomingCall, customers, callerIdDbCustomer]);

  const matchedCustomerSales = useMemo(() => {
    if (!matchedCallerCustomer?.id) return [];
    return (sales || [])
      .filter((s) => s.customerId === matchedCallerCustomer.id)
      .slice(0, 5);
  }, [sales, matchedCallerCustomer?.id]);

  /** Kurulum system_type + aktif kabuk — geçmiş satış/sipariş/randevu kaynağı */
  const callerIdPrimaryShell = getPrimaryShellModuleForCallerId(currentModule);
  const callerIdHistoryEnabled =
    !!incomingCall && !!matchedCallerCustomer?.id && (callerIdPrimaryShell === 'restaurant' || callerIdPrimaryShell === 'beauty');
  const { orders: callerIdRestaurantOrders, loading: callerIdRestaurantHistoryLoading } = useCallerIdRestaurantOrders(
    matchedCallerCustomer?.id,
    callerIdHistoryEnabled && callerIdPrimaryShell === 'restaurant'
  );
  const { appointments: callerIdBeautyAppointments, loading: callerIdBeautyHistoryLoading } = useCallerIdBeautyAppointments(
    matchedCallerCustomer?.id,
    callerIdHistoryEnabled && callerIdPrimaryShell === 'beauty'
  );

  const findCustomerByPhoneFromPg = useCallback(async (rawPhone: string) => {
    const digits = rawPhone.replace(/\D/g, '');
    const tail10 = digits.length >= 10 ? digits.slice(-10) : digits;
    const candidates = Array.from(
      new Set(
        [rawPhone, digits, tail10, `0${tail10}`, `90${tail10}`, `+90${tail10}`]
          .map((v) => v.trim())
          .filter(Boolean)
      )
    );
    const store = useCustomerStore.getState();
    for (const c of candidates) {
      const found = await store.findByPhone(c);
      if (found) return found;
    }
    return null;
  }, []);

  useEffect(() => {
    if (!incomingCall?.phone) {
      setCallerIdDbCustomer(null);
      return;
    }
    const fromList = findCustomerByCallerPhone(customers, incomingCall.phone);
    if (fromList) {
      setCallerIdDbCustomer(null);
      return;
    }
    let cancelled = false;
    void findCustomerByPhoneFromPg(incomingCall.phone).then((c) => {
      if (!cancelled) setCallerIdDbCustomer(c);
    });
    return () => {
      cancelled = true;
    };
  }, [incomingCall?.phone, incomingCall?.receivedAt, customers, findCustomerByPhoneFromPg]);

  const runContextAction = useCallback((phone: string) => {
    const target = getPrimaryShellModuleForCallerId(currentModule);
    if (target === 'restaurant') {
      localStorage.setItem('callerid_context_action', JSON.stringify({ target: 'restaurant_retail_delivery', phone }));
      window.dispatchEvent(
        new CustomEvent('callerid-open-context-action', {
          detail: { target: 'restaurant_retail_delivery', phone },
        })
      );
      setCurrentModule('restaurant');
      return;
    }
    if (target === 'beauty') {
      localStorage.setItem('callerid_context_action', JSON.stringify({ target: 'beauty_calendar', phone }));
      window.dispatchEvent(
        new CustomEvent('callerid-open-context-action', {
          detail: { target: 'beauty_calendar', phone },
        })
      );
      setCurrentModule('beauty');
      return;
    }
    if (target === 'wms') {
      setCurrentModule('wms');
      return;
    }
    if (target === 'mobile-pos') {
      setCurrentModule('mobile-pos');
      return;
    }
    void phone;
    setCurrentModule('pos');
  }, [currentModule]);

  /**
   * Caller ID → Yönetim: müşteri listesi `customers` ekranında açılmalı; aksi halde event dinleyici yok (yanlış sayfa).
   */
  const navigateManagementToCustomersWithCallerId = useCallback((phone: string, forceCreate: boolean) => {
    const p = phone.trim();
    if (!p) return;
    setCurrentModule('management');
    const fire = () => {
      window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: 'customers' }));
      window.dispatchEvent(
        new CustomEvent('callerid-open-customer', {
          detail: { phone: p, forceCreate },
        })
      );
    };
    fire();
    window.setTimeout(fire, 200);
  }, []);

  const [rtlMode, setRtlMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('retailos_rtl_mode');
    const isRtl = saved === 'true';
    if (isRtl) {
      document.documentElement.dir = 'rtl';
    }
    return isRtl;
  });

  /** CRM / raporlar: «yeni randevu» — önce güzellik modülü, sonra Beauty içinde sihirbaz (detail: tarih/saat) */
  useEffect(() => {
    const onOpenBeautyWizard = (ev: Event) => {
      const d = (ev as CustomEvent<{ dateYmd?: string; time?: string; staffId?: string; deviceId?: string; serviceId?: string }>).detail;
      setCurrentModule('beauty');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('beauty-open-new-appointment-wizard-delayed', { detail: d ?? {} }));
      }, 450);
    };
    window.addEventListener('beauty-open-new-appointment-wizard', onOpenBeautyWizard);
    return () => window.removeEventListener('beauty-open-new-appointment-wizard', onOpenBeautyWizard);
  }, []);

  // WebSocket connection on mount
  useEffect(() => {
    // Only connect if user is authenticated
    if (currentUser.id) {
      wsService.connect(currentUser.id, 'default_store').catch(() => {
        // Backend ws server may not be running (e.g. Tauri without ws on 8000) — ignore
      });
    }
  }, [currentUser.id]);

  // Global Caller ID: Tauri Windows'ta WebView Notification API güvenilir değil — yerel toast + uygulama içi yedek.
  useEffect(() => {
    if (!incomingCall || !callerIdActive) return;

    const key = `${incomingCall.phone}|${incomingCall.receivedAt}`;
    if (lastDesktopNotifyKeyRef.current === key) return;
    lastDesktopNotifyKeyRef.current = key;

    const show = async () => {
      const title = 'RetailEX Caller ID';
      const namePart = matchedCallerCustomer?.name ? `Müşteri: ${matchedCallerCustomer.name}` : 'Müşteri eşleşmedi';
      const primary = getPrimaryShellModuleForCallerId(currentModuleRef.current);
      let salePart = 'Geçmiş kayıt bulunamadı';
      if (!matchedCallerCustomer?.id) {
        salePart = 'Müşteri eşleşmedi';
      } else if (primary === 'restaurant') {
        try {
          const { RestaurantService } = await import('../../services/restaurant');
          const rows = await RestaurantService.getOrderHistory({ customerId: matchedCallerCustomer.id, limit: 1 });
          const r = Array.isArray(rows) && rows[0] ? (rows[0] as { order_no?: string; id?: string }) : null;
          salePart = r ? `Son sipariş: ${r.order_no || r.id || '-'}` : 'Sipariş geçmişi yok';
        } catch {
          salePart = 'Sipariş geçmişi alınamadı';
        }
      } else if (primary === 'beauty') {
        try {
          const { beautyService } = await import('../../services/beautyService');
          const rows = await beautyService.getAppointmentsByCustomer(matchedCallerCustomer.id);
          const a = rows?.[0];
          if (a) {
            const d = String(a.appointment_date ?? a.date ?? '').trim();
            const tm = String(a.appointment_time ?? a.time ?? '')
              .trim()
              .slice(0, 5);
            salePart = `Son randevu: ${[d, tm].filter(Boolean).join(' ')}`.trim();
          } else {
            salePart = 'Randevu geçmişi yok';
          }
        } catch {
          salePart = 'Randevu geçmişi alınamadı';
        }
      } else {
        const s = matchedCustomerSales[0];
        salePart = s
          ? `Son satış: ${s.receiptNumber || s.id || '-'}`
          : 'Geçmiş satış bulunamadı';
      }
      const body = `${incomingCall.phone}\n${namePart}\n${salePart}`;

      const mode = await showCallerIdDesktopNotification({
        title,
        body,
        onClick: () => {
          window.focus();
          setCurrentModule(getPrimaryShellModuleForCallerId(currentModuleRef.current));
        },
      });
      if (mode === 'failed') {
        toast.info(title, {
          description: body,
          duration: 12000,
        });
      }
    };

    void show();
  }, [incomingCall, callerIdActive, matchedCallerCustomer?.id, matchedCallerCustomer?.name, matchedCustomerSales, setCurrentModule]);

  // Pasif bildirim davranışı: ESC ile kapatma + kısa süre sonra otomatik gizleme.
  useEffect(() => {
    if (!incomingCall) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissIncoming();
    };
    window.addEventListener('keydown', onKeyDown);
    const timer = window.setTimeout(() => {
      dismissIncoming();
    }, 20000);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
    };
  }, [incomingCall?.phone, incomingCall?.receivedAt, dismissIncoming]);

  // Poll hatasını da global toast ile görünür yap (ör. mixed-content / CORS / URL hatası).
  useEffect(() => {
    if (!pollError) return;
    if (lastPollErrorRef.current === pollError) return;
    lastPollErrorRef.current = pollError;
    toast.error('Caller ID bağlantı uyarısı', {
      description: pollError,
      duration: 6000,
    });
  }, [pollError]);

  // Eşleşen müşteri bilgisini bridge'e aktar (Android kurye paylaşımı için).
  useEffect(() => {
    if (!incomingCall || !matchedCallerCustomer) return;
    const bridgeUrl = `${getBridgeUrl()}/api/caller_id/customer_context`;
    const addressLine = [
      matchedCallerCustomer.address,
      matchedCallerCustomer.district,
      matchedCallerCustomer.city,
      matchedCallerCustomer.postal_code,
    ].filter(Boolean).join(', ');
    const locationUrl = addressLine
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`
      : '';
    const payload = {
      phone: incomingCall.phone,
      customerName: matchedCallerCustomer.name,
      address: addressLine,
      locationUrl,
      note: 'RetailEX CallerID match',
      token: callerIdConfig.apiToken || '',
    };
    fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }, [incomingCall?.phone, incomingCall?.receivedAt, matchedCallerCustomer?.id]);

  // Responsive hook handles screen size detection

  // Listen for customer modal open event from MarketPOS
  useEffect(() => {
    const handleOpenCustomerModal = (ev?: Event) => {
      const custom = ev as CustomEvent<{ query?: string }>;
      const query = custom?.detail?.query?.trim() || '';
      setCustomerModalInitialQuery(query);
      setShowCustomerModal(true);
    };
    window.addEventListener('openCustomerModal', handleOpenCustomerModal);
    return () => window.removeEventListener('openCustomerModal', handleOpenCustomerModal);
  }, []);

  // Listen for clear customer event from MarketPOS (after payment)
  useEffect(() => {
    const handleClearCustomer = () => {
      setSelectedCustomer(null);
    };
    window.addEventListener('clearCustomer', handleClearCustomer);
    return () => window.removeEventListener('clearCustomer', handleClearCustomer);
  }, []);

  // Listen for staff modal open event from MarketPOS
  useEffect(() => {
    const handleOpenStaffModal = () => {
      setShowStaffModal(true);
    };
    window.addEventListener('openStaffModal', handleOpenStaffModal);
    return () => window.removeEventListener('openStaffModal', handleOpenStaffModal);
  }, []);

  // Listen for management panel switch event from MarketPOS
  useEffect(() => {
    const handleSwitchToManagement = () => {
      setCurrentModule('management');
    };
    window.addEventListener('switchToManagement', handleSwitchToManagement);
    return () => window.removeEventListener('switchToManagement', handleSwitchToManagement);
  }, []);

  // POS müşteri seçiminden Cari Hesap kart oluşturma modalını aç.
  useEffect(() => {
    const handleOpenCariAccountCreateModal = (ev: Event) => {
      const custom = ev as CustomEvent<{ phone?: string; forceCreate?: boolean }>;
      const phone = custom?.detail?.phone?.trim() || '';
      const forceCreate = custom?.detail?.forceCreate === true;

      localStorage.setItem('callerid_customer_phone', phone);
      setCurrentModule('management');

      window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: 'suppliers' }));
      window.dispatchEvent(
        new CustomEvent('callerid-open-customer', {
          detail: { phone, forceCreate },
        })
      );

      // Management/Supplier modülü mount olurken event kaçırmasını önlemek için tekrar tetikle.
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('navigateToScreen', { detail: 'suppliers' }));
        window.dispatchEvent(
          new CustomEvent('callerid-open-customer', {
            detail: { phone, forceCreate },
          })
        );
      }, 150);
    };

    window.addEventListener('open-cari-account-create-modal', handleOpenCariAccountCreateModal);
    return () => window.removeEventListener('open-cari-account-create-modal', handleOpenCariAccountCreateModal);
  }, []);

  // Listen for WMS navigation event
  useEffect(() => {
    const handleNavigateToWMS = () => {
      setCurrentModule('wms');
    };
    window.addEventListener('navigateToWMS', handleNavigateToWMS);
    return () => window.removeEventListener('navigateToWMS', handleNavigateToWMS);
  }, []);

  // Listen for Mobile POS navigation event from WMS
  useEffect(() => {
    const handleNavigateToMobilePOS = () => {
      setCurrentModule('mobile-pos');
    };
    window.addEventListener('navigateToMobilePOS', handleNavigateToMobilePOS);
    return () => window.removeEventListener('navigateToMobilePOS', handleNavigateToMobilePOS);
  }, []);

  // Listen for back navigation from Mobile POS
  useEffect(() => {
    const handleNavigateBackFromMobilePOS = () => {
      setCurrentModule('wms');
    };
    window.addEventListener('navigateBackFromMobilePOS', handleNavigateBackFromMobilePOS);
    return () => window.removeEventListener('navigateBackFromMobilePOS', handleNavigateBackFromMobilePOS);
  }, []);

  // Handle Management Access Request
  const requestManagementAccess = useCallback(() => {
    if (currentUser.role === 'admin' || currentUser.role === 'manager') {
      setCurrentModule('management');
    } else {
      setShowManagementPasswordModal(true);
    }
  }, [currentUser.role]);

  // Keyboard shortcut for Management Panel (Ctrl+Shift+M)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl+Shift+M opens Management Password Modal
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        requestManagementAccess();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [requestManagementAccess]);

  const handleDateChange = () => {
    // Yönetici şifresi kontrolü (basit örnek)
    if (currentUser.role === 'manager' || currentUser.role === 'admin') {
      const newDateTime = new Date(`${customDate}T${customTime}`);
      if (!isNaN(newDateTime.getTime())) {
        setShowDateModal(false);
        setDatePassword('');
      }
    }
  };

  // Global Zoom Effect & Background Sync
  useEffect(() => {
    const html = document.documentElement;
    const ratio = zoomLevel / 100;

    // Apply zoom to documentElement for global effect
    html.style.zoom = ratio.toString();

    // Sync background colors to prevent white gaps
    const bgColor = darkMode ? '#0f172a' : '#f3f4f6';
    html.style.backgroundColor = bgColor;
    document.body.style.backgroundColor = bgColor;

    // Ensure body and html base containers are correctly sized
    html.style.height = '100%';
    document.body.style.height = '100%';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';

    // Reset scale/transform to ensure standard zoom handles it
    document.body.style.transform = '';
    document.body.style.transformOrigin = '';

    return () => {
      html.style.zoom = '1';
    };
  }, [zoomLevel, darkMode]);

  // Calculate compensated dimensions to fill physical screen at any zoom level
  const compensationRatio = 100 / (zoomLevel || 100);
  const compensatedWidth = `${compensationRatio * 100}vw`;
  const compensatedHeight = `${compensationRatio * 100}vh`;

  return (
    <div
      className="flex flex-col bg-gray-100 overflow-hidden"
      style={{
        width: compensatedWidth,
        height: compensatedHeight,
        '--font-size-scale': fontSize / 100,
        '--font-weight-base': fontWeight,
        fontSize: `${fontSize}%`,
        fontWeight: fontWeight,
      } as React.CSSProperties}
    >
      {/* Top Bar - Hidden on mobile POS mode and Restaurant module */}
      {!(isMobile && currentModule === 'pos') && currentModule !== 'restaurant' && (
        <div className="bg-gradient-to-r from-blue-600 via-blue-600 to-blue-700 text-white border-b border-blue-800 shadow-md">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-2 sm:px-4 md:px-5 py-1.5 sm:py-2 gap-2 sm:gap-3">
            {/* Left — Logo (büyük kutu + başlık) */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-white/15 flex items-center justify-center p-1.5 sm:p-2 border border-white/25 overflow-hidden shadow-lg shadow-blue-900/20 ring-1 ring-white/10">
                <img src="/logo.png" alt="RetailEx" className="w-full h-full object-contain drop-shadow-sm" />
              </div>
              <div className={isSmallMobile ? 'hidden sm:block min-w-0' : 'min-w-0'}>
                <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-tight">RetailEx</h1>
                <p className="text-[9px] sm:text-[10px] text-blue-100/95 font-semibold uppercase tracking-[0.12em] mt-0.5 hidden sm:block">
                  AKILLI AI-NATIVE ERP
                </p>
              </div>
            </div>

            {/* Center — yalnızca modül sekmeleri */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 flex-shrink-0">
                {hasPermission('pos', 'READ') && isModuleVisible('pos') && (
                  <button
                    type="button"
                    onClick={() => setCurrentModule('pos')}
                    title={t.sales}
                    aria-label={t.sales}
                    className={cn(
                      'group flex items-center justify-center rounded-xl transition-all active:scale-[0.98]',
                      'w-9 h-9 sm:w-10 sm:h-10',
                      currentModule === 'pos'
                        ? 'bg-white text-blue-700 shadow-md shadow-blue-900/20 ring-1 ring-white/50'
                        : 'bg-white/10 hover:bg-white/20 text-white hover:ring-1 hover:ring-white/25'
                    )}
                  >
                    <ShoppingCart className="w-5 h-5 sm:w-5 sm:h-5 shrink-0 opacity-95 group-hover:scale-105 transition-transform" strokeWidth={2} />
                  </button>
                )}

                {hasPermission('management', 'READ') && isModuleVisible('management') && (
                  <button
                    type="button"
                    onClick={requestManagementAccess}
                    title={t.management}
                    aria-label={t.management}
                    className={cn(
                      'group flex items-center justify-center rounded-xl transition-all active:scale-[0.98]',
                      'w-9 h-9 sm:w-10 sm:h-10',
                      currentModule === 'management'
                        ? 'bg-white text-blue-700 shadow-md shadow-blue-900/20 ring-1 ring-white/50'
                        : 'bg-white/10 hover:bg-white/20 text-white hover:ring-1 hover:ring-white/25'
                    )}
                  >
                    <LayoutGrid className="w-5 h-5 sm:w-5 sm:h-5 shrink-0 opacity-95 group-hover:scale-105 transition-transform" strokeWidth={2} />
                  </button>
                )}

                {hasPermission('wms', 'READ') && isModuleVisible('wms') && (
                  <button
                    type="button"
                    onClick={() => setCurrentModule('wms')}
                    title="WMS"
                    aria-label="WMS"
                    className={cn(
                      'group flex items-center justify-center rounded-xl transition-all active:scale-[0.98]',
                      'w-9 h-9 sm:w-10 sm:h-10',
                      currentModule === 'wms'
                        ? 'bg-white text-blue-700 shadow-md shadow-blue-900/20 ring-1 ring-white/50'
                        : 'bg-white/10 hover:bg-white/20 text-white hover:ring-1 hover:ring-white/25'
                    )}
                  >
                    <Warehouse className="w-5 h-5 sm:w-5 sm:h-5 shrink-0 opacity-95 group-hover:scale-105 transition-transform" strokeWidth={2} />
                  </button>
                )}

                {hasPermission('restaurant', 'READ') && isModuleVisible('restaurant') && (
                  <button
                    type="button"
                    onClick={() => setCurrentModule('restaurant')}
                    title={(t as { menu?: { restaurant?: string } }).menu?.restaurant ?? 'Restoran'}
                    aria-label={(t as { menu?: { restaurant?: string } }).menu?.restaurant ?? 'Restoran'}
                    className={cn(
                      'group flex items-center justify-center rounded-xl transition-all active:scale-[0.98]',
                      'w-9 h-9 sm:w-10 sm:h-10',
                      currentModule === 'restaurant'
                        ? 'bg-white text-blue-700 shadow-md shadow-blue-900/20 ring-1 ring-white/50'
                        : 'bg-white/10 hover:bg-white/20 text-white hover:ring-1 hover:ring-white/25'
                    )}
                  >
                    <UtensilsCrossed className="w-5 h-5 sm:w-5 sm:h-5 shrink-0 opacity-95 group-hover:scale-105 transition-transform" strokeWidth={2} />
                  </button>
                )}

                {hasPermission('beauty', 'READ') && isModuleVisible('beauty') && (
                  <button
                    type="button"
                    onClick={() => setCurrentModule('beauty')}
                    title={tm('bModuleBeautyTooltip')}
                    aria-label={tm('bModuleBeautyTooltip')}
                    className={cn(
                      'group flex items-center justify-center rounded-xl transition-all active:scale-[0.98]',
                      'w-9 h-9 sm:w-10 sm:h-10',
                      currentModule === 'beauty'
                        ? 'bg-white text-blue-700 shadow-md shadow-blue-900/20 ring-1 ring-white/50'
                        : 'bg-white/10 hover:bg-white/20 text-white hover:ring-1 hover:ring-white/25'
                    )}
                  >
                    <Sparkles className="w-5 h-5 sm:w-5 sm:h-5 shrink-0 opacity-95 group-hover:scale-105 transition-transform" strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            {/* Right — firma, saat, sonra diğer ikonlar */}
            <div className="flex items-center justify-end gap-1.5 sm:gap-2 flex-wrap shrink-0">
              <FirmSelector />

              <MainLayoutClockButton onOpenModal={() => setShowDateModal(true)} />

              {/* POS Quick Actions (only in POS mode) */}
              {currentModule === 'pos' && (
                <>
                  {/* Customer */}
                  <button
                    onClick={() => setShowCustomerModal(true)}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-xs sm:text-sm transition-colors min-h-[44px] active:scale-95 ${selectedCustomer
                      ? 'bg-white text-blue-700 shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                    title={t.selectCustomer}
                  >
                    <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline truncate max-w-[100px]">{selectedCustomer ? selectedCustomer.name : t.customer}</span>
                  </button>

                  {/* Son Fiş Butonu */}
                  <button
                    onClick={() => {
                      // Trigger last receipt modal from MarketPOS
                      const event = new CustomEvent('openLastReceipt');
                      window.dispatchEvent(event);
                    }}
                    disabled={sales.length === 0}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-xs sm:text-sm transition-colors min-h-[44px] active:scale-95 ${sales.length > 0
                      ? 'bg-white/10 hover:bg-white/20 text-white'
                      : 'bg-white/5 opacity-50 cursor-not-allowed'
                      }`}
                    title={t.lastReceiptButton}
                  >
                    <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">{t.lastReceipt}</span>
                  </button>
                </>
              )}

              {/* User / Kasiyer */}
              <button
                onClick={() => currentModule === 'pos' ? setShowStaffModal(true) : null}
                className="flex items-center gap-1.5 bg-white/10 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded hover:bg-white/20 transition-colors min-h-[44px] active:scale-95"
                title={currentModule === 'pos' ? t.changeCashier : ''}
              >
                <div className="w-4 h-4 sm:w-5 sm:h-5 bg-white/20 rounded flex items-center justify-center flex-shrink-0">
                  <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-xs leading-none truncate max-w-[120px]">{currentModule === 'pos' ? currentStaff : (currentUser.fullName || t.systemAdministrator)}</p>
                  <p className="text-[7px] sm:text-[8px] text-blue-100 mt-0.5 truncate">{currentUser.role || t.administrator}</p>
                </div>
              </button>

              {/* Language Selector */}
              <button
                onClick={() => setShowLanguageModal(true)}
                className="p-2 sm:p-2.5 hover:bg-white/10 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95"
                title={t.languageSelectionTitle}
              >
                <Languages className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>

              {/* Logout */}
              <button
                onClick={onLogout}
                className="p-2 sm:p-2.5 hover:bg-white/10 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95"
                title="Çıkış Yap"
              >
                <LogOut className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>

              {/* Server Status Indicator */}
              <WsConnectionStatusDot />

              {/* Close Button */}
              {!isSmallMobile && (
                <button
                  onClick={() => {
                    // Electron için pencereyi kapat
                    if (typeof window !== 'undefined' && (window as any).electron) {
                      (window as any).electron.close();
                    } else if (typeof window !== 'undefined') {
                      // Tarayıcı için window.close()
                      window.close();
                    }
                  }}
                  className="p-2 sm:p-2.5 hover:bg-white/10 rounded transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center active:scale-95"
                  title="Kapat"
                >
                  <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🎤 Sesli Asistan - Global */}
      <VoiceAssistantWeb hideFloatingButton={true} />

      {/* Global Caller ID quick card */}
      {incomingCall && typeof document !== 'undefined' && createPortal((
        <div className="fixed bottom-4 right-4 z-[9999] w-[min(460px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] rounded-xl border border-blue-200 bg-white shadow-2xl overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center justify-between">
            <div className="text-sm font-black tracking-wide">Gelen Arama</div>
            <button
              type="button"
              onClick={dismissIncoming}
              className="text-white/90 hover:text-white"
              aria-label="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-2.5">
            <div className="text-lg font-black text-slate-900">{incomingCall.phone}</div>
            {incomingCall.name && !matchedCallerCustomer ? (
              <div className="text-sm text-slate-600">
                Arayan adı: <span className="font-semibold">{incomingCall.name}</span>
              </div>
            ) : null}
            <div className="text-sm text-slate-700">
              {matchedCallerCustomer ? `Müşteri: ${matchedCallerCustomer.name}` : 'Müşteri eşleşmesi bulunamadı'}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                {callerIdPrimaryShell === 'restaurant'
                  ? 'Son restoran siparişleri'
                  : callerIdPrimaryShell === 'beauty'
                    ? 'Son randevular'
                    : 'Son işlem geçmişi'}
              </div>
              {callerIdPrimaryShell === 'restaurant' ? (
                callerIdRestaurantHistoryLoading ? (
                  <div className="text-xs text-slate-500">Yükleniyor…</div>
                ) : callerIdRestaurantOrders.length === 0 ? (
                  <div className="text-xs text-slate-500">Sipariş geçmişi bulunamadı.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {callerIdRestaurantOrders.slice(0, 3).map((o) => (
                      <li key={o.id} className="text-xs text-slate-700 flex items-center justify-between gap-2">
                        <span className="truncate">
                          {o.order_no || o.id}
                          {o.table_number ? ` · Masa ${o.table_number}` : ''}
                        </span>
                        <span className="font-bold shrink-0">
                          {new Intl.NumberFormat('tr-TR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }).format(Number(o.total_amount ?? 0))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : callerIdPrimaryShell === 'beauty' ? (
                callerIdBeautyHistoryLoading ? (
                  <div className="text-xs text-slate-500">Yükleniyor…</div>
                ) : callerIdBeautyAppointments.length === 0 ? (
                  <div className="text-xs text-slate-500">Randevu geçmişi bulunamadı.</div>
                ) : (
                  <ul className="space-y-1.5">
                    {callerIdBeautyAppointments.slice(0, 3).map((a) => {
                      const d = String(a.appointment_date ?? a.date ?? '').trim();
                      const tm = String(a.appointment_time ?? a.time ?? '')
                        .trim()
                        .slice(0, 5);
                      return (
                        <li key={a.id} className="text-xs text-slate-700 flex items-center justify-between gap-2">
                          <span className="truncate min-w-0">
                            {[d, tm].filter(Boolean).join(' ')} · {a.service_name || 'Hizmet'}
                          </span>
                          <span className="font-bold shrink-0">
                            {new Intl.NumberFormat('tr-TR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }).format(Number(a.total_price ?? 0))}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : matchedCustomerSales.length === 0 ? (
                <div className="text-xs text-slate-500">Satış geçmişi bulunamadı.</div>
              ) : (
                <ul className="space-y-1.5">
                  {matchedCustomerSales.slice(0, 3).map((s) => (
                    <li key={s.id} className="text-xs text-slate-700 flex items-center justify-between gap-2">
                      <span className="truncate">{s.receiptNumber || s.id}</span>
                      <span className="font-bold">
                        {new Intl.NumberFormat('tr-TR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(Number(s.total || 0))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (!incomingCall) return;
                  const target = getPrimaryShellModuleForCallerId(currentModule);
                  runContextAction(incomingCall.phone);
                  if (target === 'restaurant' || target === 'beauty') {
                    dismissIncoming();
                    return;
                  }
                  if (target === 'wms' || target === 'mobile-pos') {
                    dismissIncoming();
                    return;
                  }
                  const found = await findCustomerByPhoneFromPg(incomingCall.phone);
                  if (found) {
                    setSelectedCustomer(found);
                    toast.success('Müşteri bulundu', {
                      description: `${found.name} seçildi.`,
                    });
                    dismissIncoming();
                    return;
                  }
                  setCustomerModalInitialQuery(incomingCall.phone);
                  setShowCustomerModal(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                {callerIdPrimaryShell === 'restaurant'
                  ? 'Perakende satışa git'
                  : callerIdPrimaryShell === 'beauty'
                    ? 'Randevu / kasaya git'
                    : callerIdPrimaryShell === 'wms'
                      ? 'Depo (WMS) ekranına git'
                      : callerIdPrimaryShell === 'mobile-pos'
                        ? 'Mobil POS\'a git'
                        : "Market POS'a git"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!incomingCall) return;
                  navigateManagementToCustomersWithCallerId(incomingCall.phone, false);
                  dismissIncoming();
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold"
              >
                Müşteri kartı (Yönetim)
              </button>
              {!matchedCallerCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    if (!incomingCall) return;
                    navigateManagementToCustomersWithCallerId(incomingCall.phone, true);
                    dismissIncoming();
                  }}
                  className="px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-bold"
                >
                  Yeni kişi ekle
                </button>
              )}
              <button
                type="button"
                onClick={dismissIncoming}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-xs font-bold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Module Content — min-h-0: iç flex/grid yüksekliği footer üstünde doğru iletilir */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {currentModule === 'pos' ? (
          // POS ekranında sadece MarketPOS göster (mobil otomatik geçiş yok)
          <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-blue-600 font-medium">Loading POS...</p>
              </div>
            </div>
          }>
            <MarketPOS
              products={products}
              customers={customers}
              campaigns={campaigns}
              selectedCustomer={selectedCustomer}
              currentStaff={currentStaff}
              currentUser={currentUser}
              onSaleComplete={onSaleComplete}
              onLogout={onLogout}
              gridColumns={gridColumns}
              fontSize={fontSize}
              fontWeight={fontWeight}
              zoomLevel={zoomLevel}
              onZoomClick={() => setShowZoomModal(true)}
              cartViewMode={cartViewMode}
              buttonColorStyle={buttonColorStyle}
              rtlMode={rtlMode}
              setRtlMode={setRtlMode}
              layoutOrder={layoutOrder}
            />
          </Suspense>
        ) : currentModule === 'wms' ? (
          <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-blue-600 font-medium">WMS Yükleniyor...</p>
              </div>
            </div>
          }>
            <WarehouseManagement
              onNavigateToModule={(module: 'pos' | 'management') => {
                if (module === 'pos') setCurrentModule('pos');
                if (module === 'management') setCurrentModule('management');
              }}
              products={products}
              customers={customers}
              campaigns={campaigns}
              onSaleComplete={onSaleComplete}
            />
          </Suspense>
        ) : currentModule === 'mobile-pos' ? (
          <MobilePOS
            products={products}
            customers={customers}
            campaigns={campaigns}
            onSaleComplete={onSaleComplete}
            onBack={() => setCurrentModule('wms')}
          />
        ) : currentModule === 'restaurant' ? (
          <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-orange-600 font-medium">Restoran Modülü Yükleniyor...</p>
              </div>
            </div>
          }>
            <RestaurantMain
              products={products}
              sales={sales}
              customers={customers}
              campaigns={campaigns}
              currentUser={currentUser}
              onSaleComplete={onSaleComplete}
              onLogout={onLogout}
              setActiveModule={setCurrentModule}
              zoomLevel={zoomLevel}
              setZoomLevel={setZoomLevel}
              rtlMode={rtlMode}
              setRtlMode={setRtlMode}
            />
          </Suspense>
        ) : currentModule === 'beauty' ? (
          <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-purple-600 font-medium">{tm('bBeautyLoadingMain')}</p>
              </div>
            </div>
          }>
            <BeautyMain sales={sales} products={products} />
          </Suspense>
        ) : (
          <ManagementModule
            products={products}
            setProducts={setProducts}
            customers={customers}
            setCustomers={setCustomers}
            sales={sales}
            campaigns={campaigns}
            setCampaigns={setCampaigns}
          />
        )}
      </div>

      {!incomingCall && <AppFooter />}

      {/* Date Modal */}
      {showDateModal && (
        <div className="fixed inset-0 bg-blue-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg sm:rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
              <h3 className="text-base text-white flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                {t.setDateTime}
              </h3>
              <button
                onClick={() => {
                  setShowDateModal(false);
                  setDatePassword('');
                }}
                className="text-white hover:text-gray-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                <p className="text-xs text-yellow-800">
                  <Lock className="w-4 h-4 inline mr-1" />
                  {t.requiresAdminPassword}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-700 mb-2">Tarih:</label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-700 mb-2">Saat:</label>
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-700 mb-2">Yönetici Şifresi:</label>
                <input
                  type="password"
                  value={datePassword}
                  onChange={(e) => setDatePassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleDateChange();
                    }
                  }}
                  placeholder="Yönetici şifresini girin"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                />
                <p className="text-xs text-gray-500 mt-1">Test için şifre: 1234</p>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2">
              <button
                onClick={() => {
                  setShowDateModal(false);
                  setDatePassword('');
                }}
                className="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleDateChange}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                {t.apply}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS Customer Modal */}
      {showCustomerModal && (
        <POSCustomerModal
          customers={customers}
          selectedCustomer={selectedCustomer}
          onSelect={setSelectedCustomer}
          onClose={() => setShowCustomerModal(false)}
          initialSearchQuery={customerModalInitialQuery}
        />
      )}

      {/* POS Staff Modal */}
      {showStaffModal && (
        <POSStaffModal
          currentStaff={currentStaff}
          onSelect={setCurrentStaff}
          onClose={() => setShowStaffModal(false)}
        />
      )}

      {/* Ekran Ayarları Modal */}
      {showZoomModal && (
        <ScreenSettingsModal
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          gridColumns={gridColumns}
          setGridColumns={setGridColumns}
          fontSize={fontSize}
          setFontSize={setFontSize}
          fontWeight={fontWeight}
          setFontWeight={setFontWeight}
          zoomLevel={zoomLevel}
          setZoomLevel={setZoomLevel}
          cartViewMode={cartViewMode}
          setCartViewMode={setCartViewMode}
          buttonColorStyle={buttonColorStyle}
          setButtonColorStyle={setButtonColorStyle}
          rtlMode={rtlMode}
          setRtlMode={setRtlMode}
          layoutOrder={layoutOrder}
          setLayoutOrder={setLayoutOrder}
          onClose={() => setShowZoomModal(false)}
        />
      )}

      {/* Dil Seçimi Modal */}
      {showLanguageModal && (
        <LanguageSelectionModal
          onClose={() => setShowLanguageModal(false)}
          rtlMode={rtlMode}
          setRtlMode={setRtlMode}
        />
      )}

      {/* Yönetim Parola Modal */}
      {showManagementPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-lg sm:rounded-xl w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700">
              <h3 className="text-base text-white flex items-center gap-2">
                <Lock className="w-5 h-5" />
                {t.managementPanelAccess}
              </h3>
              <button
                onClick={() => {
                  setShowManagementPasswordModal(false);
                  setManagementPassword('');
                  setManagementPasswordError('');
                }}
                className="text-white hover:text-gray-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                <p className="text-xs text-blue-800">
                  <Lock className="w-4 h-4 inline mr-1" />
                  {t.requiresAdminPassword}
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  Tip: Hızlı Erişim: <kbd className="px-1.5 py-0.5 bg-white border border-blue-300 rounded text-xs">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-white border border-blue-300 rounded text-xs">Shift</kbd> + <kbd className="px-1.5 py-0.5 bg-white border border-blue-300 rounded text-xs">M</kbd>
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm text-gray-700 mb-2">Yönetici Şifresi:</label>
                <input
                  type="password"
                  value={managementPassword}
                  onChange={(e) => {
                    setManagementPassword(e.target.value);
                    setManagementPasswordError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleManagementAccess(managementPassword);
                  }}
                  placeholder="Giriş şifrenizi girin"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-600"
                  disabled={managementPasswordLoading}
                  autoFocus
                />
                {managementPasswordError && (
                  <p className="text-xs text-red-600 mt-2">{managementPasswordError}</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-2">
              <button
                onClick={() => {
                  setShowManagementPasswordModal(false);
                  setManagementPassword('');
                  setManagementPasswordError('');
                }}
                className="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={() => handleManagementAccess(managementPassword)}
                disabled={managementPasswordLoading}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {managementPasswordLoading ? '...' : t.login}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Firma/Dönem Quick Setup Modal */}
      {showQuickSetup && (
        <FirmaDonemQuickSetup
          onComplete={() => {
            setShowQuickSetup(false);
            // Refresh firmalar
            refreshFirms();
          }}
          onCancel={() => setShowQuickSetup(false)}
        />
      )}

      {/* Firma Bilgi Modal */}
      {showFirmaInfoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4" onClick={() => setShowFirmaInfoModal(false)}>
          <div className="bg-white rounded-lg sm:rounded-xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-700 to-blue-800">
              <h3 className="text-base text-white flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Aktif Çalışma Alanı
              </h3>
              <button
                onClick={() => setShowFirmaInfoModal(false)}
                className="text-white/80 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="p-4 space-y-4">
                {/* Harici Tree View Component */}
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-white h-[350px] overflow-y-auto shadow-inner">
                  {firms.map((firm) => {
                    const isFirmSelected = selectedFirm?.id === firm.id || (selectedFirm?.logicalref === firm.logicalref && firm.logicalref !== 0);

                    return (
                      <div key={firm.id || firm.logicalref} className="border-b border-gray-100 last:border-0">
                        {/* Firm Row */}
                        <button
                          onClick={() => selectFirm(firm.id || firm.logicalref)}
                          className={`w-full flex items-center gap-3 p-3 text-left transition-colors relative ${isFirmSelected ? 'bg-blue-50/80 sticky top-0 z-10 shadow-sm' : 'hover:bg-gray-50'
                            }`}
                        >
                          <div className={`p-1.5 rounded-md transition-colors ${isFirmSelected ? 'bg-blue-100/50 text-blue-700' : 'bg-gray-100 text-gray-400'
                            }`}>
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="flex-1">
                            <div className={`text-sm font-medium ${isFirmSelected ? 'text-blue-900' : 'text-gray-700'}`}>
                              {firm.name}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              Firma No: {firm.nr}
                            </div>
                          </div>
                          {isFirmSelected ? (
                            <ChevronDown className="w-4 h-4 text-blue-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                          )}
                        </button>

                        {/* Periods (Only if selected) */}
                        {isFirmSelected && (
                          <div className="bg-gray-50/50 shadow-inner">
                            {periods.length === 0 ? (
                              <div className="p-4 flex flex-col items-center justify-center text-gray-400 gap-2">
                                {firmaLoading ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
                                    <span className="text-xs">Dönemler yükleniyor...</span>
                                  </>
                                ) : (
                                  <span className="text-xs italic">Bu firmaya ait dönem bulunamadı.</span>
                                )}
                              </div>
                            ) : (
                              periods.map((period) => {
                                // Verify period ownership via UUID if possible
                                if (period.firma_id && firm.id && period.firma_id !== firm.id) return null;

                                const isPeriodSelected = selectedPeriod?.id === period.id || (selectedPeriod?.logicalref === period.logicalref && period.logicalref !== 0);

                                return (
                                  <button
                                    key={period.id}
                                    onClick={() => selectPeriod(period.id || period.logicalref)}
                                    className={`w-full flex items-center gap-3 pl-12 pr-4 py-3 text-left border-l-[3px] transition-all ${isPeriodSelected
                                      ? 'bg-blue-100/40 border-blue-500'
                                      : 'border-transparent hover:bg-white hover:border-gray-200'
                                      }`}
                                  >
                                    <Calendar className={`w-3.5 h-3.5 ${isPeriodSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className={`text-sm ${isPeriodSelected ? 'font-semibold text-blue-900' : 'text-gray-700'}`}>
                                          {period.donem_adi || `Dönem ${period.nr}`}
                                        </span>
                                        <span className={`text-[9px] px-1.5 py-px rounded-full uppercase tracking-wider font-semibold ${period.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                          }`}>
                                          {period.active ? 'Açık' : 'Kapalı'}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-gray-500 font-mono">
                                        {new Date(period.beg_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()}
                                      </div>
                                    </div>
                                    {isPeriodSelected && <Check className="w-4 h-4 text-blue-600" />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Bilgi Kartları (Minimal) */}
                {selectedPeriod && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
                    <span>Seçili:</span>
                    <span className="font-medium text-gray-700">{selectedFirm?.name}</span>
                    <span className="text-gray-300">/</span>
                    <span className="font-medium text-gray-700">{selectedPeriod.donem_adi}</span>
                  </div>
                )}

                {/* Uyarı */}
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex gap-3">
                  <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-800 leading-relaxed">
                    Değişikliklerin geçerli olması için sayfa yenilenecektir.
                    Tüm geçici veriler temizlenir.
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-2 justify-end">
                <button
                  onClick={() => setShowFirmaInfoModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={() => {
                    setShowFirmaInfoModal(false);
                    // Force hard reload to clean all caches
                    window.location.reload();
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  Uygula ve Yenile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MainLayout;
