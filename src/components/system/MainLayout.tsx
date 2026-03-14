import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
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
  const { t } = useLanguage();
  // Firma/Dönem Context
  const { selectedFirm, selectedPeriod, firms, periods, selectFirm, selectPeriod, refreshFirms, loading: firmaLoading } = useFirmaDonem();
  const [showQuickSetup, setShowQuickSetup] = useState(false);

  const { hasPermission, isAdmin } = usePermission();

  // Module visibility: bayi_seti mode restricts visible modules to the selected list
  const isModuleVisible = (moduleId: string): boolean => {
    // management/backoffice is always visible
    if (moduleId === 'management') return true;
    const bayiSeti = localStorage.getItem('retailex_bayi_seti') === 'true';
    if (!bayiSeti) return true; // no restriction
    try {
      const enabled: string[] = JSON.parse(localStorage.getItem('retailex_enabled_modules') || '[]');
      return enabled.length === 0 || enabled.includes(moduleId);
    } catch {
      return true;
    }
  };

  // Kullanıcı rolüne göre başlangıç modülünü belirle
  const getInitialModule = (): Module => {
    // 0. Yetki bazlı kesin öncelik:
    if (isAdmin() || (currentUser?.role && ['admin', 'manager'].includes(currentUser.role))) return 'management';

    // 1. Önce localStorage'da kayıtlı modüle bak (Sayfa yenileme durumu)
    const savedModule = localStorage.getItem('retailex_active_module') as Module;
    if (savedModule && ['pos', 'management', 'wms', 'mobile-pos', 'restaurant', 'beauty'].includes(savedModule)) {
      return savedModule;
    }

    // 2. Diğer Yetki bazlı öncelikler:
    if (hasPermission('restaurant', 'READ')) return 'restaurant';
    if (hasPermission('beauty', 'READ')) return 'beauty';
    if (hasPermission('wms', 'READ')) return 'wms';
    if (hasPermission('management', 'READ')) return 'management';

    // Varsayılan POS
    return 'pos';
  };

  const [currentModule, setCurrentModule] = useState<Module>(getInitialModule());

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

  const [currentTime, setCurrentTime] = useState(new Date());
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
      const { default: postgres, ERP_SETTINGS } = await import('../../services/postgres');
      const username = (currentUser as any).username || (currentUser as any).email || '';
      const { rows } = await postgres.query(
        `SELECT 1 FROM public.users WHERE LOWER(username) = LOWER($1) AND firm_nr = $2 AND password_hash = crypt($3, password_hash) AND is_active = true LIMIT 1`,
        [username, ERP_SETTINGS.firmNr, pwd]
      );
      return rows.length > 0;
    } catch {
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
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'connecting'>(wsService.getStatus());

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

  // Use ThemeContext for dark mode
  const { darkMode, setDarkMode } = useTheme();

  const [rtlMode, setRtlMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('retailos_rtl_mode');
    const isRtl = saved === 'true';
    if (isRtl) {
      document.documentElement.dir = 'rtl';
    }
    return isRtl;
  });

  // WebSocket connection on mount
  useEffect(() => {
    // Only connect if user is authenticated
    if (currentUser.id) {
      wsService.connect(currentUser.id, 'default_store');

      // Update local status for the UI indicator
      const checkStatus = setInterval(() => {
        setWsStatus(wsService.getStatus());
      }, 2000);

      return () => clearInterval(checkStatus);
    }
  }, [currentUser.id]);

  // Responsive hook handles screen size detection

  // Listen for customer modal open event from MarketPOS
  useEffect(() => {
    const handleOpenCustomerModal = () => {
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

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDateChange = () => {
    // Yönetici şifresi kontrolü (basit örnek)
    if (currentUser.role === 'manager' || currentUser.role === 'admin') {
      const newDateTime = new Date(`${customDate}T${customTime}`);
      if (!isNaN(newDateTime.getTime())) {
        setCurrentTime(newDateTime);
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
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white border-b border-blue-800">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 gap-2">
            {/* Left - Logo */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 bg-white/10 rounded flex items-center justify-center p-1 border border-white/20 overflow-hidden shadow-premium">
                <img src="/logo.png" alt="RetailEx" className="w-full h-full object-contain" />
              </div>
              <div className={isSmallMobile ? 'hidden sm:block' : ''}>
                <h1 className="text-sm font-bold tracking-tight">RetailEx</h1>
                <p className="text-[8px] text-blue-100 hidden sm:block font-medium uppercase tracking-wider opacity-80">AKILLI AI-NATIVE ERP SİSTEMİ</p>
              </div>
            </div>

            {/* Center - Module Tabs & Clock */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-center flex-1 min-w-0">
              {/* Module Tabs */}
              <div className="flex gap-1 sm:gap-1.5 flex-shrink-0">
                {hasPermission('pos', 'READ') && isModuleVisible('pos') && (
                  <button
                    onClick={() => setCurrentModule('pos')}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-xs sm:text-sm transition-all whitespace-nowrap min-h-[44px] active:scale-95 ${currentModule === 'pos'
                      ? 'bg-white text-blue-700 shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="font-medium hidden xs:inline">{t.sales}</span>
                  </button>
                )}

                {hasPermission('management', 'READ') && isModuleVisible('management') && (
                  <button
                    onClick={requestManagementAccess}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-xs sm:text-sm transition-all whitespace-nowrap min-h-[44px] active:scale-95 ${currentModule === 'management'
                      ? 'bg-white text-blue-700 shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="font-medium hidden xs:inline">{t.management}</span>
                  </button>
                )}

                {hasPermission('wms', 'READ') && isModuleVisible('wms') && (
                  <button
                    onClick={() => setCurrentModule('wms')}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-xs sm:text-sm transition-all whitespace-nowrap min-h-[44px] active:scale-95 ${currentModule === 'wms'
                      ? 'bg-white text-blue-700 shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                  >
                    <Warehouse className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="font-medium hidden xs:inline">WMS</span>
                  </button>
                )}

                {hasPermission('restaurant', 'READ') && isModuleVisible('restaurant') && (
                  <button
                    onClick={() => setCurrentModule('restaurant')}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-xs sm:text-sm transition-all whitespace-nowrap min-h-[44px] active:scale-95 ${currentModule === 'restaurant'
                      ? 'bg-white text-blue-700 shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="font-medium hidden xs:inline">{t.menu.restaurant}</span>
                  </button>
                )}

                {hasPermission('beauty', 'READ') && isModuleVisible('beauty') && (
                  <button
                    onClick={() => setCurrentModule('beauty')}
                    className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded text-xs sm:text-sm transition-all whitespace-nowrap min-h-[44px] active:scale-95 ${currentModule === 'beauty'
                      ? 'bg-white text-blue-700 shadow-md'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="font-medium hidden xs:inline">Beauty</span>
                  </button>
                )}
              </div>

              {/* Firma Selector - Enhanced */}
              <FirmSelector />

              {/* Clock */}
              <button
                onClick={() => setShowDateModal(true)}
                className="flex items-center gap-1 text-xs bg-white/10 px-2 py-1 rounded hover:bg-white/20 transition-colors flex-shrink-0 whitespace-nowrap"
              >
                <Calendar className="w-3 h-3 flex-shrink-0" />
                <span className="hidden sm:inline">{currentTime.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                <span className="hidden sm:inline text-blue-200">•</span>
                <Clock className="w-3 h-3 flex-shrink-0" />
                <span className="tabular-nums">{currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
              </button>
            </div>

            {/* Right - Customer, User */}
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
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
              <div
                className={`w-4 h-4 sm:w-5 sm:h-5 rounded transition-colors flex-shrink-0 ${wsStatus === 'connected'
                  ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]'
                  : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]'
                  }`}
                title={wsStatus === 'connected' ? 'Server Bağlantısı Aktif' : 'Server Bağlantısı Yok'}
              />

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

      {/* Module Content */}
      <div className="flex-1 overflow-hidden">
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
              wsStatus={wsStatus}
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
                <p className="text-purple-600 font-medium">Beauty & Klinik Yükleniyor...</p>
              </div>
            </div>
          }>
            <BeautyMain />
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

      <AppFooter />

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
