import React, { useState, useEffect, lazy, Suspense, useMemo, useCallback } from 'react';
import {
  PieChart, Store as StoreIcon, Map as MapIcon, Settings, Zap, FileSpreadsheet,
  FileText, FileCheck, RefreshCw, FileMinus, Send, Truck, Archive,
  ShoppingCart, FileSignature, Users, Target, ShoppingBag, ClipboardList,
  Package, Warehouse, TrendingDown, Boxes, QrCode, Tag, Scale,
  Briefcase, GitBranch, Calendar, Award, Wallet, CreditCard, Database,
  Globe, Receipt, Building, Calculator, TrendingUpDown, Gift, Percent,
  PackageSearch, Wrench, Shield, UserCog, UtensilsCrossed, Phone, Bell,
  Smartphone, Mail, BarChart3, TrendingUp, UserCheck, Layers, Clock, AlertCircle,
  Search, X, Languages, Radio, ArrowRightLeft, MoreVertical, Printer, Menu, ChevronLeft
} from 'lucide-react';
const DevExDataGrid = lazy(() => import('../shared/DevExDataGrid').then(m => ({ default: m.DevExDataGrid })));
import { APP_VERSION } from '../../core/version';
import { useLanguage } from '../../contexts/LanguageContext';
import { LanguageSelectionModal } from './LanguageSelectionModal';

// Direct Imports - Lazy loading removed to fix dynamic import errors
import { DashboardModule } from './DashboardModule';
import { ProductManagement } from '../inventory/products/ProductManagement';
import { StockModule } from '../inventory/stock/StockModule';
import { ServiceManagement } from '../inventory/services/ServiceManagement';
import { CustomerManagementModule } from '../trading/contacts/CustomerManagementModule';
import { FinanceModule } from '../accounting/finance/FinanceModule';
import { PurchaseModule } from '../trading/purchase/PurchaseModule';
import { PurchaseRequestModule } from '../trading/purchase/PurchaseRequestModule';
import { SalesOrderModule } from '../trading/sales/SalesOrderModule';
import { AccountingModule } from '../accounting/reports/AccountingModule';
import { MizanReportModule } from '../accounting/reports/MizanReportModule';
import { IncomeStatementReport } from '../accounting/reports/IncomeStatementReport';
import { BalanceSheetReport } from '../accounting/reports/BalanceSheetReport';
import { SupplierModule } from '../trading/contacts/SupplierModule';
import { PriceManagementModule } from '../trading/invoices/PriceManagementModule';
import { CRMModule } from '../modules/CRMModule';
import { HRModule } from '../modules/HRModule';
import { LogisticsModule } from '../modules/LogisticsModule';
import { SalesInvoiceModule } from '../trading/sales/SalesInvoiceModule';
import { PurchaseInvoiceModule } from '../trading/purchase/PurchaseInvoiceModule';
import { UnifiedInvoiceModule } from '../trading/invoices/UnifiedInvoiceModule';
import { InvoiceListModule } from '../trading/invoices/InvoiceListModule';
import { ETransformModule } from '../modules/ETransformModule';
import { ReturnModule } from '../trading/invoices/ReturnModule';
import { ProductionModule } from '../modules/ProductionModule';
import { AssetManagementModule } from '../modules/AssetManagementModule';
import { BudgetModule } from '../modules/BudgetModule';
import { ContractModule } from '../modules/ContractModule';
import { QualityModule } from '../modules/QualityModule';
import { ServiceModule } from '../modules/ServiceModule';
import { ProjectModule } from '../modules/ProjectModule';
import { IntegrationsModule } from '../modules/IntegrationsModule';
import { ReportsModule } from '../reports/ReportsModule';
import { CategoryGroupSalesProfitReport } from '../reports/CategoryGroupSalesProfitReport';
import { ProfitDashboard } from '../reports/ProfitDashboard';
import { SettingsPanel } from './SettingsPanel';

import { ExcelModule } from '../modules/ExcelModule';
import { ScaleManagementWrapper } from '../scale/ScaleManagementWrapper';
import { MultiStoreManagement } from './MultiStoreManagement';
import { RegionalManagement } from '../inventory/warehouse/RegionalManagement';
import { StoreConfigModule } from './StoreConfigModule';
import { CampaignManagement } from '../management/CampaignManagement';
import { RoleManagement } from './RoleManagement';
import { LoyaltyProgramModule } from '../modules/LoyaltyProgramModule';
import { GiftCardModule } from '../modules/GiftCardModule';
import { NotificationCenterModule } from '../modules/NotificationCenterModule';
import { CurrencyManagement } from '../accounting/finance/CurrencyManagement';
import { CommissionModule } from '../modules/CommissionModule';
import { UserManagementModule } from './UserManagementModule';
import { WhatsAppIntegrationModule } from '../modules/WhatsAppIntegrationModule';
import RestaurantMain from '../restaurant/index';
import BeautyMain from '../beauty/index';
import { AppointmentModule } from '../modules/AppointmentModule';
import { BIDashboardModule } from '../modules/BIDashboardModule';
import { EcommerceModule } from '../modules/EcommerceModule';
import { CargoIntegrationModule } from '../modules/CargoIntegrationModule';
import { MarketplaceIntegrationModule } from '../modules/MarketplaceIntegrationModule';
import { PaymentSystemsModule } from '../modules/PaymentSystemsModule';
import { AccountingIntegrationModule } from '../accounting/reports/AccountingIntegrationModule';
import { CentralDataBroadcastPanel } from '../modules/CentralDataBroadcastPanel';
import { EnterpriseCentralDataManagement } from '../modules/EnterpriseCentralDataManagement';
import { ModuleManagement } from './ModuleManagement';
import { SystemManagementModule } from './SystemManagementModule';
import { RestaurantCallerIdSettings } from '../restaurant/components/RestaurantCallerIdSettings';
import { MenuManagementPanel } from './MenuManagementPanel';
import { ExpenseManagement } from '../accounting/reports/ExpenseManagement';
import { CompanySetup } from './CompanySetup';
import { DiscountManagement } from '../trading/invoices/DiscountManagement';
import { CashRegisterManagement } from '../accounting/cash-ops/CashRegisterManagement';
import { KasalarModule } from '../accounting/cash-ops/KasalarModule';
import { BankRegisterManagement } from '../accounting/cash-ops/BankRegisterManagement';
import { StoreTransferModule } from '../inventory/warehouse/StoreTransferModule';
import { MobileInventoryCountModule } from '../inventory/stock/MobileInventoryCountModule';
import InterStoreTransfersView from '../inventory/warehouse/InterStoreTransfersView';
import { ModernSidebar } from './ModernSidebar';
import { PriceChangeVouchersModule } from '../trading/invoices/PriceChangeVouchersModule';
import { BarcodeDefinitionsModule } from '../inventory/stock/BarcodeDefinitionsModule';
import { SerialLotModule } from '../inventory/stock/SerialLotModule';
import { WarehouseDefinitionsModule } from '../inventory/warehouse/WarehouseDefinitionsModule';
import { ServiceCardsModule } from '../modules/ServiceCardsModule';
import { StockMovementsModule } from '../inventory/stock/StockMovementsModule';
import { WarehouseTransferModule } from '../inventory/warehouse/WarehouseTransferModule';
import { StockCountModule as WMSStockCountModule } from '../wms/components/StockCountModule';
import { MaterialReportsModule } from '../inventory/products/MaterialReportsModule';
import { VirmanModule } from '../accounting/reports/VirmanModule';
import { PaymentPlansModule } from '../accounting/finance/PaymentPlansModule';
import { BankPaymentPlansModule } from '../accounting/finance/BankPaymentPlansModule';
import { MaterialMasterRecords, MasterRecordType } from '../inventory/products/MaterialMasterRecords';
import { CostCenterManagement } from '../accounting/finance/CostCenterManagement';
import { MaterialExtractReport } from '../inventory/reports/MaterialExtractReport';
import { MaterialAdvancedReports, ReportViewType } from '../inventory/products/MaterialAdvancedReports';
import { NewModulesDashboard } from './NewModulesDashboard';
import { AccountingDashboard } from '../accounting/reports/AccountingDashboard';
import { WorkflowBuilder } from '../modules/WorkflowBuilder';
import { VoiceAssistantWeb } from '../modules/VoiceAssistantWeb';
import { ProductAnalyticsDashboard } from '../inventory/products/ProductAnalyticsDashboard';
import { CashierScale } from '../scale/CashierScale';
import { DatabaseMigrations } from './DatabaseMigrations';
import SupabaseMigrationModule from './SupabaseMigrationModule';
import { StoreManagementDashboard } from './StoreManagementDashboard';
import { SecurityModulesWeb } from './SecurityModulesWeb';
import { ReportDetailFullPage } from '../reports/ReportDetailFullPage';
import { DemoDataManager } from './DemoDataManager';
import AuditTrailModule from '../modules/AuditTrailModule';
import { WavePickingModule } from '../wms/WavePickingModule';
import { ReconciliationDashboard } from '../accounting/reports/ReconciliationDashboard';
import { AIStockPredictionModule } from '../inventory/ai/AIStockPredictionModule';
import { GeneralLedgerMizan } from '../accounting/reports/GeneralLedgerMizan';
import { CariHesapEkstresi } from '../accounting/reports/CariHesapEkstresi';
import { StorePerformanceAnalysis } from '../sales/reports/StorePerformanceAnalysis';
import { InventoryAgingReport } from '../inventory/reports/InventoryAgingReport';
import { UniversalReportHub } from '../analytics/UniversalReportHub';
import { NebimMigrationWizard } from './NebimMigrationWizard';
import { menuService } from '../../services/api/menuService';

// Custom Report Designer
import { ReportDesignerModule } from '../reports/ReportDesignerModule';

// Import optimized translation system (reduces bundle size by ~170 lines)
import type { Language } from '../../locales/module-translations';
import type { Product, Customer, Sale, Campaign } from '../../core/types';
import type { ManagementScreen } from '../../App';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';
import { usePermission } from '../../shared/hooks/usePermission';
import { getStaticMenuSections } from '../../config/staticMenuConfig';

// Custom z-index constants to ensure consistent layering
const Z_INDEX = {
  HEADER: 60,
  MOBILE_OVERLAY: 70,
  SIDEBAR: 80,
  MODAL: 100
};

interface ManagementModuleProps {
  products: Product[];
  setProducts: (products: Product[]) => void;
  customers: Customer[];
  setCustomers: (customers: Customer[]) => void;
  sales: Sale[];
  campaigns: Campaign[];
  setCampaigns: (campaigns: Campaign[]) => void;
  sidebarOpen?: boolean;
  setSidebarOpen?: (open: boolean) => void;
}

// Cache key ve TTL (Time To Live) - 5 dakika (daha kısa TTL, menü güncellemelerinin daha hızlı yansıması için)
const MENU_CACHE_KEY = 'retailos_menu_structure';
const MENU_CACHE_TTL = 1000 * 60 * 5; // 5 dakika

type ExtendedScreen = ManagementScreen | 'dashboard' | 'finance' | 'stock' | 'purchase' | 'salesorder' | 'kasalar' |
  'accounting' | 'suppliers' | 'pricing' | 'crm' | 'hr' | 'logistics' |
  'salesinvoice' | 'sales-invoice-view' | 'sales-invoice-standard' | 'sales-invoice-retail' | 'sales-invoice-wholesale' | 'sales-invoice-consignment' | 'sales-invoice-return' |
  'purchaseinvoice' | 'purchase-invoice-standard' | 'purchase-invoice-return' |
  'serviceinvoice' | 'serviceinvoice-given' | 'serviceinvoice-received' |
  'etransform' | 'return' | 'production' | 'assets' | 'budget' | 'contracts' | 'quality' | 'service' | 'projects' | 'excel' | 'scale' |
  'multistore' | 'regional' | 'storeconfig' | 'campaigns_mgmt' | 'roles_mgmt' | 'loyalty' | 'giftcard' | 'notifications' | 'multicurrency' | 'commission' | 'usermanagement' | 'whatsapp' | 'restaurant' | 'appointment' | 'bi-dashboard' | 'ecommerce' | 'cargo' | 'marketplace' | 'payment' | 'accounting-integration' | 'proforma' | 'einvoice' | 'ewaybill' | 'eledger' |
  'salesquote' | 'purchaserequest' | 'stockmovements' | 'stock-dashboard' | 'warehousetransfer' | 'stockcount' | 'barcode' | 'seriallot' | 'warehouse-definitions' | 'service-cards' | 'virman' | 'firm-period-definitions' | 'payment-plans' | 'bank-payment-plans' |
  'productionrecipe' | 'capacityplan' | 'cashbank' | 'banks' | 'checkpromissory' | 'collectionpayment' | 'currentaccounts' | 'revenueexpense' |
  'storetransfer' | 'mobile-inventory-count' | 'interstore-transfer' | 'store-controlled-count' |
  'pricelists' | 'discounts' | 'promotions' | 'shipping' | 'cargotrack' | 'waybillops' | 'routeplan' |
  'servicemaint' | 'warranty' | 'fieldservice' | 'fixedasset' | 'depreciation' | 'maintplan' |
  'MalzemeSiniflari' | 'Birimsetleri' | 'varyant' | 'ozelkodlar' | 'markatanim' | 'groupkodları' |
  'malzemeler' | 'hareketler' | 'material-list' | 'material-classes' | 'unit-sets' | 'variants' | 'group-codes' | 'product-categories' | 'special-codes' | 'brand-definitions' |
  'suppliers_def' | 'warehousetransfer_def' | 'warehousetransfer_mv' | 'warehousetransfer_v' | 'storetransfer_mv' | 'storetransfer_v' | 'stockcount_store' | 'material-transfers' |
  'stockreports_bal' | 'stockreports_tr' | 'stockreports_list' | 'stockreports_sum' | 'stockreports_trans' |
  'report-material-extract' | 'report-material-value' | 'inventory' | 'cost' | 'report-in-out-totals' | 'report-warehouse-status' | 'report-transaction-breakdown' | 'report-slip-list' | 'report-min-max' |
  'MMSR' | 'MLR' | 'Enr' | 'GCTR' | 'FLR' | 'MLADR' | 'MDR' | 'MER' | 'HDRR' |
  'personnel' | 'attendance' | 'payroll' | 'performance' | 'training' |
  'waybill-sales' | 'waybill-purchase' | 'waybill-transfer' | 'waybill-fire' |
  'roleauth' | 'roles' | 'role_management' | 'authorization' |
  'financereports' | 'generalsettings' | 'definitions' | 'backuprestore' | 'systemhealth' | 'smsmanage' | 'emailcamp' | 'logaudit' | 'databroadcast' |
  'modulemanagement' | 'menumanagement' | 'onlineorders' | 'productsync' | 'price-change-vouchers' | 'new-modules' | 'accounting-mgmt' | 'workflow-automation' | 'voice-assistant' | 'cashier-scale' | 'db-migrations' | 'store-management' | 'security-modules' | 'demo-data' |
  'product-analytics' | 'profit-dashboard' | 'graphanalysis' | 'reconciliation' | 'wave-picking' | 'ai-stock-prediction' | 'material-extract' | 'cost-centers' |
  'universal-report-hub' | 'customer-extract' | 'store-performance' | 'inventory-aging' | 'nebim-migration' |
  'cash-slips' | 'bank-slips' | 'pos-slips' | 'current-slips' | 'stockcounting' | 'stockcounting-mobile' |
  'salesreports' | 'stockreports' | 'customeranalysis' | 'mizan' | 'income-statement' | 'balance-sheet' | 'advanced-reports' | 'reports' | 'customreports' | 'category-group-profit-report' | 'materials' | 'MYFisleri' |
  'stockmovements-deficit' | 'stockmovements-surplus' |
  'analytics-group' | 'sales-stock-group' | 'finance-reps-group' | 'advanced-reps-group' |
  'report-designer' | 'label-designer' |
  'supabase-migration' |
  'virtual-pbx-caller-id' |
  'restaurant' | 'beauty';

import { useAuth } from '../../contexts/AuthContext';

export function ManagementModule({
  products,
  setProducts,
  customers,
  setCustomers,
  sales,
  campaigns,
  setCampaigns,
  sidebarOpen,
  setSidebarOpen
}: ManagementModuleProps) {
  const { user, hasPermission: contextHasPermission } = useAuth();
  const { hasPermission, isAdmin } = usePermission();
  const isTauri = !!(window as any).__TAURI_INTERNALS__;

  // Sidebar state — managed internally; prop overrides are optional
  const [_sidebarOpen, _setSidebarOpen] = useState(sidebarOpen ?? true);
  const effectiveSidebarOpen = sidebarOpen !== undefined ? sidebarOpen : _sidebarOpen;
  const effectiveSetSidebarOpen = setSidebarOpen ?? _setSidebarOpen;

  // Rol bazlı varsayılan ekran belirleme
  const getDefaultScreenForRole = (roles: string[] = []): ExtendedScreen => {
    if (roles.includes('warehouse_manager') || roles.includes('warehouse_staff') || roles.includes('depo')) return 'stock';
    if (roles.includes('cashier') || roles.includes('kasiyer')) return 'salesinvoice';
    if (roles.includes('accountant') || roles.includes('muhasebe')) return 'finance';
    return 'dashboard';
  };

  // Başlangıç ekranını belirle (LocalStorage > Rol > Dashboard)
  const getInitialScreen = (): ExtendedScreen => {
    try {
      // Eğer URL'de bir modül ismi varsa ona öncelik ver
      const path = window.location.pathname;
      if (path === '/products') return 'products';
      if (path === '/customers') return 'customers';
      if (path === '/stock') return 'stock';
      if (path === '/reports') return 'reports';
      if (path === '/sales-invoice') return 'salesinvoice';
      if (path === '/purchase-invoice') return 'purchaseinvoice';
      if (path === '/usermanagement') return 'usermanagement';

      // Önce localStorage'a bak (Her kullanıcı için ayrı key)
      const userKey = user ? `last_screen_${user.username}` : 'last_screen_guest';
      const savedScreen = localStorage.getItem(userKey);

      if (savedScreen) {
        return savedScreen as ExtendedScreen;
      }

      // Eğer kayıtlı yoksa role göre varsayılan döndür
      return getDefaultScreenForRole(user?.role_ids);
    } catch (e) {
      return 'dashboard';
    }
  };

  const [currentScreen, setCurrentScreen] = useState<ExtendedScreen>(getInitialScreen);
  const { isMobile, isTablet } = useResponsive();
  const { darkMode } = useTheme();
  const { language: currentLanguage, setLanguage, t } = useLanguage(); // Use global language context
  const [selectedKasaId, setSelectedKasaId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  // Initialize expanded sections with translated mainMenu
  useEffect(() => {
    if (expandedSections.length === 0 && t.menu.mainMenu) {
      setExpandedSections([t.menu.mainMenu]);
    }
  }, [t.menu.mainMenu]);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [dynamicMenuSections, setDynamicMenuSections] = useState<any[] | null>(null);

  // Handle Group Screen Redirects via Effect (Avoid Side Effects in Render)
  useEffect(() => {
    if (currentScreen === 'analytics-group') setCurrentScreen('profit-dashboard');
    if (currentScreen === 'sales-stock-group') setCurrentScreen('salesreports');
    if (currentScreen === 'finance-reps-group') setCurrentScreen('mizan');
    if (currentScreen === 'advanced-reps-group') setCurrentScreen('advanced-reports');
  }, [currentScreen]);
  const [rtlMode, setRtlMode] = useState(() => {
    return localStorage.getItem('retailos_rtl_mode') === 'true';
  });
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);


  // Generate menu with current language translations and convert to expected format
  const staticMenuSections = useMemo(() => {
    const translatedMenu = getStaticMenuSections(t);

    // Convert imported menu structure to the format expected by the component
    const converted = translatedMenu.map(section => ({
      id: (section as any).id,
      title: section.title,
      items: section.items.map((item: any) => {
        const convertedItem: any = {
          id: item.screen as ExtendedScreen,
          label: item.label,
          icon: item.icon,
          badge: item.badge || null
        };

        // Recursively convert children
        if (item.children && item.children.length > 0) {
          convertedItem.children = item.children.map((child: any) => {
            const convertedChild: any = {
              id: child.screen as ExtendedScreen,
              label: child.label,
              icon: child.icon,
              badge: child.badge || null
            };

            // Support for nested children (3 levels deep)
            if (child.children && child.children.length > 0) {
              convertedChild.children = child.children.map((grandChild: any) => ({
                id: grandChild.screen as ExtendedScreen,
                label: grandChild.label,
                icon: grandChild.icon,
                badge: grandChild.badge || null
              }));
            }

            return convertedChild;
          });
        }

        return convertedItem;
      })
    }));

    return converted;
  }, [currentLanguage, t]); // Regenerate when language changes


  // Save current screen to localStorage whenever it changes
  useEffect(() => {
    try {
      const userKey = user ? `last_screen_${user.username}` : 'last_screen_guest';
      localStorage.setItem(userKey, currentScreen);
    } catch (e) {
      console.warn('Failed to save screen state');
    }
  }, [currentScreen, user]);

  // Mobilde sidebar'ı otomatik kapat/aç
  useEffect(() => {
    if (isMobile) {
      effectiveSetSidebarOpen(false);
    } else {
      effectiveSetSidebarOpen(true);
    }
  }, [isMobile]);

  // Listen for WMS navigation event
  useEffect(() => {
    const handleNavigateToWMS = () => {
      window.dispatchEvent(new CustomEvent('navigateToWMS'));
    };
    window.addEventListener('navigateToWMSFromManagement', handleNavigateToWMS);
    return () => window.removeEventListener('navigateToWMSFromManagement', handleNavigateToWMS);
  }, []);

  // Cache'den menü yapısını yükle
  const loadMenuFromCache = useCallback((): { data: any[]; timestamp: number } | null => {
    try {
      const cached = localStorage.getItem(MENU_CACHE_KEY);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      const now = Date.now();

      // Cache geçerli mi kontrol et
      if (now - parsed.timestamp < MENU_CACHE_TTL) {
        console.log('📦 Menü cache\'den yüklendi');
        return parsed;
      } else {
        console.log('⏰ Menü cache\'i süresi dolmuş, temizleniyor');
        localStorage.removeItem(MENU_CACHE_KEY);
        return null;
      }
    } catch (error) {
      console.warn('Cache okuma hatası:', error);
      return null;
    }
  }, []);

  // Menü yapısını cache'le
  const saveMenuToCache = useCallback((data: any[]) => {
    try {
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(cacheData));
      console.log('💾 Menü cache\'lendi');
    } catch (error) {
      console.warn('Cache yazma hatası:', error);
    }
  }, []);

  // Cache'i temizle
  const clearMenuCache = useCallback(() => {
    localStorage.removeItem(MENU_CACHE_KEY);
    console.log('ğŸ—‘ï¸ Menü cache temizlendi');
  }, []);

  // Listen for navigation events from other components
  useEffect(() => {
    const handleNavigateToScreen = (e: CustomEvent) => {
      const screen = e.detail as ExtendedScreen;
      setCurrentScreen(screen);

      // Update storage immediately to prevent remount race conditions
      try {
        const userKey = user ? `last_screen_${user.username}` : 'last_screen_guest';
        localStorage.setItem(userKey, screen);
      } catch (e) {
        console.warn('Failed to save screen state');
      }
    };
    window.addEventListener('navigateToScreen', handleNavigateToScreen as EventListener);
    return () => window.removeEventListener('navigateToScreen', handleNavigateToScreen as EventListener);
  }, [user]);

  // Convert API menu items to menuSections format (önce tanımlanmalı)
  const convertMenuItemsToSections = useCallback((items: any[]): any[] => {
    return items.map((item: any) => {
      // Get icon component from icon_name
      // Get icon component from icon_name
      let IconComponent: any = null;

      // Icon map creation
      const iconMap: Record<string, any> = {
        PieChart, StoreIcon, MapIcon, Settings, Zap, FileSpreadsheet,
        FileText, FileCheck, RefreshCw, FileMinus, Send, Truck, Archive,
        ShoppingCart, FileSignature, Users, Target, ShoppingBag, ClipboardList,
        Package, Warehouse, TrendingDown, Boxes, QrCode, Tag, Scale,
        Briefcase, GitBranch, Calendar, Award, Wallet, CreditCard, Database,
        Globe, Receipt, Building, Calculator, TrendingUpDown, Gift, Percent,
        PackageSearch, Wrench, Shield, UserCog, UtensilsCrossed, Phone, Bell,
        Smartphone, Mail, BarChart3, TrendingUp, UserCheck, Layers, Clock, AlertCircle,
        Search, X, Languages, Radio, ArrowRightLeft, MoreVertical, Printer, Menu, ChevronLeft
      };

      if (item.icon_name) {
        IconComponent = iconMap[item.icon_name] || null;
        if (!IconComponent) {
          console.warn(`Icon ${item.icon_name} not found in iconMap`);
        }
      }

      // Dil desteği - currentLanguage'e göre doğru label'ı seç
      let itemLabel = item.label;
      if (currentLanguage === 'tr' && item.label_tr) itemLabel = item.label_tr;
      else if (currentLanguage === 'en' && item.label_en) itemLabel = item.label_en;
      else if (currentLanguage === 'ar' && item.label_ar) itemLabel = item.label_ar;

      const menuItem: any = {
        id: item.screen_id || item.id.toString(),
        label: itemLabel || item.label || '',
        icon: IconComponent,
        badge: item.badge
      };

      if (item.children && item.children.length > 0) {
        menuItem.children = convertMenuItemsToSections(item.children);
      }

      return menuItem;
    });
  }, [currentLanguage]); // currentLanguage değişince yeniden çalışsın

  // Menü verisini işle ve hiyerarşik yapıya dönüştür (convertMenuItemsToSections'a bağımlı)
  const processMenuData = useCallback((data: any[]) => {
    // Hiyerarşik yapı oluştur
    const itemMap = new Map<number, any>();
    const rootItems: any[] = [];

    // Tüm öğeleri map'e ekle
    data.forEach((item: any) => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    // Hiyerarşiyi oluştur
    data.forEach((item: any) => {
      const menuItem = itemMap.get(item.id);

      // Section'lar her zaman root'ta
      if (item.menu_type === 'section') {
        rootItems.push(menuItem);
      } else if (item.parent_id && itemMap.has(item.parent_id)) {
        // Parent'ı olan öğeler parent'ın children'ına ekle
        const parent = itemMap.get(item.parent_id);
        if (!parent.children) parent.children = [];
        parent.children.push(menuItem);
      } else if (item.section_id && itemMap.has(item.section_id)) {
        // Section_id'si olan ama parent_id'si olmayan öğeler section'ın children'ına ekle
        const section = itemMap.get(item.section_id);
        if (!section.children) section.children = [];
        section.children.push(menuItem);
      } else {
        // Hiçbir bağlantısı yoksa root'a ekle
        rootItems.push(menuItem);
      }
    });

    // Sıralama
    const sortItems = (items: any[]): any[] => {
      return items
        .sort((a, b) => a.display_order - b.display_order)
        .map(item => ({
          ...item,
          children: item.children ? sortItems(item.children) : []
        }));
    };

    const sortedRootItems = sortItems(rootItems);

    // Convert to menuSections format
    return sortedRootItems
      .filter((item: any) => item.menu_type === 'section')
      .map((section: any) => {
        // Section başlığı için dil desteği
        let sectionTitle = section.title || section.label;
        if (currentLanguage === 'tr' && section.label_tr) sectionTitle = section.label_tr;
        else if (currentLanguage === 'en' && section.label_en) sectionTitle = section.label_en;
        else if (currentLanguage === 'ar' && section.label_ar) sectionTitle = section.label_ar;

        return {
          title: sectionTitle,
          items: convertMenuItemsToSections(section.children || [])
        };
      });
  }, [convertMenuItemsToSections, currentLanguage]);

  // Load dynamic menu structure from PostgreSQL
  const loadMenuStructure = useCallback(async (forceReload = false) => {
    // TEMPORARILY DISABLED - Using static menu for now
    console.log('?? Dynamic menu loading disabled, using static menu');
    return;
  }, []);

  // Fetch hidden_modules from config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        if (isTauri) {
          const { invoke } = await import('@tauri-apps/api/core');
          const config: any = await invoke('get_app_config');
          if (config && Array.isArray(config.hidden_modules)) {
            setHiddenModules(config.hidden_modules);
          }
        }
      } catch (err) {
        console.error('Failed to fetch hidden_modules:', err);
      }
    };
    fetchConfig();
  }, []);

  // MenuManagementPanel gibi bileşenlerin statik menü yapısına erişebilmesi için event listener
  useEffect(() => {
    const handleRequest = () => {
      window.dispatchEvent(new CustomEvent('staticMenuRequested', { detail: staticMenuSections }));
    };
    window.addEventListener('requestStaticMenu', handleRequest);
    return () => window.removeEventListener('requestStaticMenu', handleRequest);
  }, [staticMenuSections]);


  const languages = [
    { code: 'tr' as const, name: 'Türkçe', flag: '🇹🇷' },
    { code: 'en' as const, name: 'English', flag: '????' },
    { code: 'ar' as const, name: '???????', flag: '????' },
    { code: 'ku' as const, name: '????? (??????)', flag: '??????', expenseAnalysis: '?????? ??????????', reporting: '??????????' }
  ];

  const toggleSection = (title: string) => {
    if (expandedSections.includes(title)) {
      setExpandedSections(expandedSections.filter(s => s !== title));
    } else {
      setExpandedSections([...expandedSections, title]);
    }
  };

  const handleSearchItemClick = useCallback((item: any) => {
    setCurrentScreen(item.id);
    setMenuSearchQuery('');
    setSearchResults([]);
  }, []);



  // Use dynamic menu if available, otherwise use static menu
  const menuSections = useMemo(() => {
    const isDynamic = dynamicMenuSections && dynamicMenuSections.length > 0;
    const baseSections = isDynamic ? dynamicMenuSections! : staticMenuSections;

    const filterHidden = (items: any[]): any[] => {
      return items
        .filter(item => {
          // 1. Check hidden_modules from config
          if (hiddenModules.includes(item.id)) return false;

          // 2. Check RBAC permissions
          // If the item ID contains a dot (e.g. 'stock.reports'), check it specifically
          // Otherwise check the ID as a module
          if (!isAdmin()) {
            const hasModuleAccess = hasPermission(item.id, 'READ');
            if (!hasModuleAccess) {
              // Check if any children are accessible? No, standard RBAC is module-based for now
              return false;
            }
          }

          return true;
        })
        .map(item => {
          if (item.items) {
            return { ...item, items: filterHidden(item.items) };
          }
          if (item.children) {
            return { ...item, children: filterHidden(item.children) };
          }
          return item;
        });
    };

    return filterHidden(baseSections);
  }, [dynamicMenuSections, staticMenuSections, hiddenModules, hasPermission, isAdmin]);

  // Menü güncellemelerini dinle - useCallback ile sarmalanmış
  const handleMenuUpdate = useCallback((e?: CustomEvent) => {
    console.log('🔄 Menü güncelleme eventi alındı', e?.detail);
    // Cache'i temizle ve yeniden yükle
    clearMenuCache();
    const forceReload = e?.detail?.forceReload !== false; // Default true
    console.log('🔄 Menü yeniden yükleniyor, forceReload:', forceReload);
    loadMenuStructure(forceReload);
  }, [clearMenuCache, loadMenuStructure]);

  // Statik menü yapısı isteklerini dinle - useCallback ile sarmalanmış
  const handleStaticMenuRequest = useCallback(() => {
    // Statik menü yapısını dönüştür ve gönder
    const convertedMenu = staticMenuSections.map((section) => {
      const convertItem = (item: any): any => {
        const itemData: any = {
          menu_type: item.children && item.children.length > 0 ? 'main' : 'sub',
          label: item.label,
          id: item.id,
          screen_id: item.id,
          icon_name: item.icon?.name || (item.icon?.displayName) || null,
          badge: item.badge || null
        };

        if (item.children && item.children.length > 0) {
          itemData.children = item.children.map(convertItem);
        }

        return itemData;
      };

      return {
        menu_type: 'section',
        title: section.title,
        label: section.title,
        items: section.items.map(convertItem)
      };
    });

    window.dispatchEvent(new CustomEvent('staticMenuRequested', { detail: convertedMenu }));
  }, [staticMenuSections]);

  // Menü güncellemelerini ve statik menü isteklerini dinle
  // Bu useEffect staticMenuSections tanımlandıktan sonra çalışacak
  useEffect(() => {
    // İlk yükleme
    console.log('🔵 İlk menü yükleme başlatılıyor');
    loadMenuStructure();

    // Event listener'ları ekle
    window.addEventListener('menuUpdated', handleMenuUpdate as EventListener);
    window.addEventListener('requestStaticMenu', handleStaticMenuRequest);

    return () => {
      window.removeEventListener('menuUpdated', handleMenuUpdate as EventListener);
      window.removeEventListener('requestStaticMenu', handleStaticMenuRequest);
    };
  }, [handleMenuUpdate, handleStaticMenuRequest, loadMenuStructure]);

  // Search functionality - Comprehensive recursive search through all menu items including children
  useEffect(() => {
    if (menuSearchQuery.trim() === '') {
      if (searchResults.length > 0) {
        setSearchResults([]);
      }
      return;
    }

    // Normalize Turkish characters for better search
    const normalizeText = (text: string): string => {
      return text
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c');
    };

    const query = normalizeText(menuSearchQuery);
    const results: any[] = [];
    const seenIds = new Set<string>(); // Prevent duplicates

    // Recursive function to search through items and their children at all levels
    const searchInItems = (
      items: any[],
      sectionTitle: string,
      parentLabel?: string,
      grandParentLabel?: string
    ) => {
      items.forEach(item => {
        // Normalize all text for comparison
        const itemLabel = normalizeText(item.label);
        const itemId = normalizeText(item.id || '');
        const sectionTitleLower = normalizeText(sectionTitle);
        const parentLabelLower = parentLabel ? normalizeText(parentLabel) : '';
        const grandParentLabelLower = grandParentLabel ? normalizeText(grandParentLabel) : '';

        // Check if item matches search query in multiple ways
        const matchesItem = itemLabel.includes(query) || itemId.includes(query);
        const matchesSection = sectionTitleLower.includes(query);
        const matchesParent = parentLabel && parentLabelLower.includes(query);
        const matchesGrandParent = grandParentLabel && grandParentLabelLower.includes(query);

        // Also check individual words for better matching
        const queryWords = query.split(/\s+/).filter(w => w.length > 0);
        const itemWords = itemLabel.split(/\s+/);
        const matchesWords = queryWords.every(qw =>
          itemWords.some(iw => iw.includes(qw))
        );

        if (matchesItem || matchesSection || matchesParent || matchesGrandParent || matchesWords) {
          // Create unique key to prevent duplicates
          const uniqueKey = `${item.id}-${sectionTitle}-${parentLabel || ''}`;
          if (!seenIds.has(uniqueKey)) {
            seenIds.add(uniqueKey);
            results.push({
              ...item,
              sectionTitle: sectionTitle,
              parentLabel: parentLabel || null,
              grandParentLabel: grandParentLabel || null
            });
          }
        }

        // Recursively search in children if they exist (unlimited depth)
        if (item.children && item.children.length > 0) {
          searchInItems(item.children, sectionTitle, item.label, parentLabel);
        }
      });
    };

    // Search through all menu sections
    menuSections.forEach(section => {
      searchInItems(section.items, section.title);
    });

    // Sort results by relevance (exact matches first, then partial matches)
    const sortedResults = results.sort((a, b) => {
      const aLabel = normalizeText(a.label);
      const bLabel = normalizeText(b.label);

      // Exact match at start gets highest priority
      if (aLabel.startsWith(query) && !bLabel.startsWith(query)) return -1;
      if (!aLabel.startsWith(query) && bLabel.startsWith(query)) return 1;

      // Exact match anywhere gets second priority
      if (aLabel === query && bLabel !== query) return -1;
      if (aLabel !== query && bLabel === query) return 1;

      // Then by position in label (earlier match is better)
      const aIndex = aLabel.indexOf(query);
      const bIndex = bLabel.indexOf(query);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;

      // Finally alphabetically
      return aLabel.localeCompare(bLabel, 'tr');
    });

    setSearchResults(sortedResults);
  }, [menuSearchQuery, menuSections]);

  const renderContent = () => {
    // Shared mock data generator for generic reports
    const getMockData = (type: string) => {
      if (type === 'salesreports') {
        return sales.length > 0 ? sales : [
          { receiptNumber: 'FIS001', date: new Date().toISOString(), cashier: 'Ferhat', customerName: 'Perakende', total: 1250, paymentMethod: 'Nakit' },
          { receiptNumber: 'FIS002', date: new Date().toISOString(), cashier: 'Ferhat', customerName: 'Ahmet Yılmaz', total: 2450, paymentMethod: 'Kart' },
        ];
      }
      if (type === 'stockreports') {
        return products.map(p => ({
          productName: p.name,
          category: p.category,
          currentStock: p.stock,
          unitPrice: p.price,
          totalValue: p.stock * p.price,
          lastMovement: '2026-01-25'
        }));
      }
      return [
        { id: 1, name: 'Örnek Kayıt 1', date: '2026-01-25', total: 1000, status: 'Tamamlandı' },
        { id: 2, name: 'Örnek Kayıt 2', date: '2026-01-25', total: 2500, status: 'Beklemede' },
      ];
    };

    console.log('?? Render edilen ekran:', currentScreen);
    try {
      switch (currentScreen) {
        case 'dashboard':
          return <DashboardModule
            products={products}
            customers={customers}
            sales={sales}
            setCurrentScreen={(s: any) => setCurrentScreen(s)}
            menuMode={hiddenModules.length > 5 ? 1 : 2}
          />;
        // Material Management - Products
        case 'products':
        case 'materials': // Potential ID for "Malzemeler"
        case 'material-list':
        case 'malzemeler': // JSON ID
          return <ProductManagement products={products} setProducts={setProducts} />;


        // Material Management - Master Records
        case 'material-classes':
        case 'MalzemeSiniflari': // JSON ID
          return <MaterialMasterRecords viewType='material-classes' />;
        case 'unit-sets':
        case 'Birimsetleri': // JSON ID
          return <MaterialMasterRecords viewType='unit-sets' />;
        case 'variants':
        case 'varyant': // JSON ID
          return <MaterialMasterRecords viewType='variants' />;
        case 'group-codes':
        case 'groupkodları': // JSON ID
          return <MaterialMasterRecords viewType='group-codes' />;
        case 'product-categories':
          return <MaterialMasterRecords viewType='product-categories' />;
        case 'special-codes': // New JSON ID
        case 'ozelkodlar': // Old JSON ID
          return <MaterialMasterRecords viewType='special-codes' />;
        case 'brand-definitions': // New JSON ID
        case 'markatanim': // Old JSON ID
          return <MaterialMasterRecords viewType='brand-definitions' />;

        case 'suppliers_def':
        case 'suppliers':
          return <SupplierModule />;

        case 'barcode':
          return <BarcodeDefinitionsModule />;

        case 'seriallot':
          return <SerialLotModule />;

        case 'scale':
          return <MaterialMasterRecords viewType="scale" />;

        case 'warehousetransfer_def':
        case 'warehouse-definitions':
          return <WarehouseDefinitionsModule />;

        // Material Management - Transactions (Movements)
        case 'stock-dashboard':
        case 'stock': // Fallback shorthand
          return <StockModule products={products} setProducts={setProducts} />;

        case 'stockmovements':
        case 'warehousetransfer_mv':
        case 'storetransfer_mv':
        case 'MYFisleri': // JSON ID - Assuming stock movements
        case 'hareketler': // JSON ID - Main menu but if clicked
          return <StockMovementsModule />;

        case 'stockmovements-deficit':
          return <StockMovementsModule defaultFilter="shortage" />;

        case 'stockmovements-surplus':
          return <StockMovementsModule defaultFilter="surplus" />;

        // Material Management - Counting
        case 'stockcount':
        case 'mobile-inventory-count':
        case 'stockcount_store':
        case 'stockcounting':
        case 'stockcounting-mobile':
          return <WMSStockCountModule darkMode={darkMode} onBack={() => setCurrentScreen('dashboard')} />;

        // Material Management - Transfers (Virman)
        case 'warehousetransfer_v':
        case 'storetransfer_v':
        case 'virman':
        case 'material-transfers':
          return <VirmanModule />;

        // Material Management - Reports
        case 'stockreports_bal':
          return <MaterialAdvancedReports viewType='stockreports_bal' />;
        case 'stockreports_tr':
          return <MaterialAdvancedReports viewType='stockreports_tr' />;
        case 'stockreports_list':
          return <MaterialAdvancedReports viewType='stockreports_list' />;
        case 'stockreports_sum':
          return <MaterialAdvancedReports viewType='stockreports_sum' />;
        case 'stockreports_trans':
          return <MaterialAdvancedReports viewType='stockreports_trans' />;

        // New Explicit Report Routes
        case 'report-material-extract':
          return <MaterialAdvancedReports viewType='report-material-extract' />;
        case 'report-material-value':
          return <MaterialAdvancedReports viewType='report-material-value' />;
        case 'inventory':
          return <MaterialAdvancedReports viewType='inventory' />;
        case 'cost':
          return <MaterialAdvancedReports viewType='cost' />;
        case 'report-in-out-totals':
          return <MaterialAdvancedReports viewType='report-in-out-totals' />;
        case 'report-warehouse-status':
          return <MaterialAdvancedReports viewType='report-warehouse-status' />;
        case 'report-transaction-breakdown':
          return <MaterialAdvancedReports viewType='report-transaction-breakdown' />;
        case 'report-slip-list':
          return <MaterialAdvancedReports viewType='report-slip-list' />;
        case 'report-min-max':
          return <MaterialAdvancedReports viewType='report-min-max' />;

        // JSON Report IDs
        case 'MMSR': // Min Max
          return <MaterialAdvancedReports viewType='report-min-max' />;
        case 'MLR': // Cost
          return <MaterialAdvancedReports viewType='cost' />;
        case 'Enr': // Inventory
          return <MaterialAdvancedReports viewType='inventory' />;
        case 'GCTR': // In Out Totals
          return <MaterialAdvancedReports viewType='report-in-out-totals' />;
        case 'FLR': // Slip List
          return <MaterialAdvancedReports viewType='report-slip-list' />;
        case 'MLADR': // Warehouse Status
          return <MaterialAdvancedReports viewType='report-warehouse-status' />;
        case 'MDR': // Material Value
          return <MaterialAdvancedReports viewType='report-material-value' />;
        case 'MER': // Material Extract
          return <MaterialAdvancedReports viewType='report-material-extract' />;
        case 'HDRR': // Transaction Breakdown
          return <MaterialAdvancedReports viewType='report-transaction-breakdown' />;

        case 'stockreports': // JSON generic ID fallback
          return <MaterialAdvancedReports viewType='stockreports_bal' />;

        case 'customers':
          return <CustomerManagementModule sales={sales} customers={customers} setCustomers={setCustomers} />;
        case 'cashbank':
          return <CashRegisterManagement
            initialTab="sessions"
            onEnterKasa={(id) => {
              setSelectedKasaId(id);
              setCurrentScreen('kasalar');
            }}
          />;
        case 'cash-slips':
          return <CashRegisterManagement
            initialTab="transactions"
            onEnterKasa={(id) => {
              setSelectedKasaId(id);
              setCurrentScreen('kasalar');
            }}
          />;
        case 'kasalar':
          return <KasalarModule
            initialKasaId={selectedKasaId}
            onBack={() => {
              setSelectedKasaId(null);
              setCurrentScreen('cashbank');
            }}
          />;
        case 'banks':
          return <BankRegisterManagement />;
        case 'service-cards':
          return <ServiceManagement />;
        case 'discounts':
          return <DiscountManagement />;
        case 'finance':
        case 'checkpromissory':
        case 'collectionpayment':
          return <FinanceModule sales={sales} />;
        case 'purchaserequest':
          return <PurchaseRequestModule products={products} />;
        case 'purchase':
          return <PurchaseModule products={products} />;
        case 'salesorder':
        case 'salesquote':
          return <SalesOrderModule customers={customers} products={products} />;
        case 'revenueexpense':
          return <ExpenseManagement />;
        case 'accounting':
        case 'currentaccounts':
          return <AccountingModule />;
        case 'mizan':
          return <GeneralLedgerMizan />;
        case 'reconciliation':
          return <ReconciliationDashboard />;
        case 'material-extract':
          return <MaterialExtractReport />;
        case 'universal-report-hub':
          return <UniversalReportHub onNavigate={(s) => setCurrentScreen(s as ExtendedScreen)} />;
        case 'customer-extract':
          return <CariHesapEkstresi />;
        case 'store-performance':
          return <StorePerformanceAnalysis />;
        case 'inventory-aging':
          return <InventoryAgingReport />;
        case 'nebim-migration':
          return <NebimMigrationWizard />;
        case 'supabase-migration':
          return <SupabaseMigrationModule />;
        case 'virtual-pbx-caller-id':
          return (
            <div className="h-full min-h-0 overflow-auto bg-slate-50">
              <RestaurantCallerIdSettings />
            </div>
          );
        case 'income-statement':
          return <IncomeStatementReport />;
        case 'balance-sheet':
          return <BalanceSheetReport />;
        case 'pricing':
        case 'pricelists':
        case 'promotions':
          return <PriceManagementModule products={products} />;
        case 'crm':
          return <CRMModule customers={customers} />;
        case 'hr':
        case 'personnel':
        case 'attendance':
        case 'payroll':
        case 'performance':
        case 'training':
          return <HRModule />;
        case 'logistics':
        case 'shipping':
        case 'cargotrack':
        case 'waybillops':
        case 'routeplan':
          return <LogisticsModule />;
        case 'salesinvoice':
        case 'sales-invoice-view': // Generic view
          return <InvoiceListModule products={products} defaultCategory="Satis" title={t.salesInvoicesTitle} description={t.salesInvoicesDesc} />;
        case 'sales-invoice-standard':
          return <InvoiceListModule products={products} defaultCategory="Satis" defaultInvoiceTypeFilter="8" title={t.salesInvoicesTitle} description={t.salesInvoicesDesc} />;
        case 'sales-invoice-retail':
          return <InvoiceListModule products={products} defaultCategory="Satis" defaultInvoiceTypeFilter="7" title={t.retailSalesTitle} description={t.retailSalesDesc} />;
        case 'sales-invoice-wholesale':
          return <InvoiceListModule products={products} defaultCategory="Satis" defaultInvoiceTypeFilter="8" title={t.wholesaleSales} description={t.wholesaleSales} />;
        case 'sales-invoice-consignment':
          return <InvoiceListModule products={products} defaultCategory="Satis" defaultInvoiceTypeFilter="8" title={t.salesInvoicesTitle} description={t.salesInvoicesDesc} />;
        case 'sales-invoice-return':
          return <InvoiceListModule products={products} defaultCategory="Iade" defaultInvoiceTypeFilter="3" title={t.salesReturnTitle} description={t.salesReturnDesc} />;
        case 'purchaseinvoice':
          return <InvoiceListModule products={products} defaultCategory="Alis" title={t.purchaseInvoicesTitle} description={t.purchaseInvoicesDesc} />;
        case 'purchase-invoice-standard':
          return <InvoiceListModule products={products} defaultCategory="Alis" defaultInvoiceTypeFilter="1" title={t.purchaseInvoicesTitle} description={t.purchaseInvoicesDesc} />;
        case 'purchase-invoice-return':
          return <InvoiceListModule products={products} defaultCategory="Iade" defaultInvoiceTypeFilter="6" title={t.purchaseReturnTitle} description={t.purchaseReturnDesc} />;
        case 'serviceinvoice':
          return <InvoiceListModule products={products} defaultCategory="Hizmet" title={t.serviceInvoices} description={t.serviceInvoices} />;
        case 'serviceinvoice-received':
          return <InvoiceListModule products={products} defaultCategory="Hizmet" defaultInvoiceTypeFilter="4" title={t.receivedServiceInvoicesTitle} description={t.receivedServiceInvoicesDesc} />;
        case 'serviceinvoice-given':
          return <InvoiceListModule products={products} defaultCategory="Hizmet" defaultInvoiceTypeFilter="9" title={t.issuedServiceInvoicesTitle} description={t.issuedServiceInvoicesDesc} />;
        case 'proforma':
          return <UnifiedInvoiceModule customers={customers} products={products} />;
        case 'waybill-sales':
          return <UnifiedInvoiceModule customers={customers} products={products} defaultCategory="Irsaliye" defaultInvoiceTypeCode={10} />;
        case 'waybill-purchase':
          return <UnifiedInvoiceModule customers={customers} products={products} defaultCategory="Irsaliye" defaultInvoiceTypeCode={11} />;
        case 'waybill-transfer':
          return <UnifiedInvoiceModule customers={customers} products={products} defaultCategory="Irsaliye" defaultInvoiceTypeCode={12} />;
        case 'waybill-fire':
          return <UnifiedInvoiceModule customers={customers} products={products} defaultCategory="Irsaliye" defaultInvoiceTypeCode={13} />;
        case 'einvoice':
        case 'ewaybill':
        case 'roleauth':
        case 'roles':
        case 'role_management':
        case 'authorization':
        case 'roles_mgmt':
          return <RoleManagement />;
        case 'eledger':
        case 'etransform':
          return <ETransformModule />;
        case 'return':
          return <ReturnModule />;
        case 'production':
        case 'productionrecipe':
        case 'capacityplan':
          return <ProductionModule />;
        case 'wave-picking':
          return <WavePickingModule />;
        case 'ai-stock-prediction':
          return <AIStockPredictionModule />;
        case 'assets':
        case 'fixedasset':
        case 'depreciation':
        case 'maintplan':
          return <AssetManagementModule />;
        case 'budget':
          return <BudgetModule />;
        case 'contracts':
          return <ContractModule />;
        case 'quality':
          return <QualityModule />;
        case 'service':
        case 'servicemaint':
        case 'warranty':
        case 'financereports':
        case 'customeranalysis':
        case 'graphanalysis':
        case 'reports':
        case 'customreports':
          return <ReportsModule sales={sales} products={products} />;
        case 'profit-dashboard':
          return <ProfitDashboard />;
        case 'category-group-profit-report':
          return <CategoryGroupSalesProfitReport />;
        case 'settings':
        case 'generalsettings':
        case 'definitions':
        case 'backuprestore':
        case 'systemhealth':
        case 'smsmanage':
        case 'emailcamp':
          return <SystemManagementModule />;
        case 'excel':
          return <ExcelModule />;
        case 'multistore':
          return <MultiStoreManagement />;
        case 'regional':
          return <RegionalManagement />;
        case 'storeconfig':
          return <StoreConfigModule />;
        case 'campaigns_mgmt':
          return <CampaignManagement campaigns={campaigns} setCampaigns={setCampaigns} products={products} />;

        case 'loyalty':
          return <LoyaltyProgramModule />;
        case 'giftcard':
          return <GiftCardModule />;
        case 'notifications':
          return <NotificationCenterModule />;
        case 'multicurrency':
          return <CurrencyManagement />;
        case 'commission':
          return <CommissionModule />;
        case 'usermanagement':
          return <UserManagementModule />;
        case 'logaudit':
          return <AuditTrailModule />;
        case 'whatsapp':
          return <WhatsAppIntegrationModule />;
        case 'restaurant':
          return <RestaurantMain
            products={products}
            sales={sales}
            customers={customers}
            campaigns={campaigns}
            currentUser={user as any}
            onSaleComplete={() => { }}
            setActiveModule={() => { }}
          />;
        case 'beauty':
          return <BeautyMain />;
        case 'appointment':
          return <AppointmentModule />;
        case 'bi-dashboard':
          return <BIDashboardModule />;
        case 'ecommerce':
          return <EcommerceModule />;
        case 'cargo':
          return <CargoIntegrationModule />;
        case 'marketplace':
          return <MarketplaceIntegrationModule />;
        case 'integrations':
          return <IntegrationsModule products={products} setProducts={setProducts} customers={customers} setCustomers={setCustomers} />;
        case 'payment':
          return <PaymentSystemsModule />;
        case 'accounting-integration':
          return <AccountingIntegrationModule />;
        case 'databroadcast':
          return <EnterpriseCentralDataManagement />;
        case 'modulemanagement':
          return <ModuleManagement />;
        case 'menumanagement':
          return <MenuManagementPanel />;
        case 'onlineorders':
        case 'productsync':
          return <ProductManagement products={products} setProducts={setProducts} />;
        case 'interstore-transfer':
        case 'storetransfer':
          return <StoreTransferModule />;
        case 'price-change-vouchers':
          return <PriceChangeVouchersModule products={products} />;
        case 'new-modules':
          return <NewModulesDashboard />;
        case 'accounting-mgmt':
          return <AccountingDashboard />;
        case 'workflow-automation':
          return <WorkflowBuilder />;
        case 'voice-assistant':
          return <VoiceAssistantWeb />;
        case 'product-analytics':
          return <ProductAnalyticsDashboard onBack={() => setCurrentScreen('dashboard')} />;
        case 'cashier-scale':
          return <CashierScale onBack={() => setCurrentScreen('dashboard')} />;
        case 'db-migrations':
          return <DatabaseMigrations onBack={() => setCurrentScreen('dashboard')} />;
        case 'store-management':
          return <StoreManagementDashboard />;
        case 'demo-data':
          return <DemoDataManager />;
        case 'firm-period-definitions':
          return <CompanySetup />;

        case 'payment-plans':
          return <PaymentPlansModule />;
        case 'cost-centers':
          return <CostCenterManagement />;
        case 'bank-payment-plans':
          return <BankPaymentPlansModule />;
        case 'security-modules':
          return <SecurityModulesWeb />;
        case 'report-designer':
        case 'label-designer':
          return <ReportDesignerModule />;
        default:
          return <DashboardModule
            products={products}
            customers={customers}
            sales={sales}
            setCurrentScreen={(s: any) => setCurrentScreen(s)}
            menuMode={0}
          />;
      }
    } catch (error) {
      console.error(`? Error rendering screen \"${currentScreen}\":`, error);
      return (
        <div className={`flex items-center justify-center h-full ${darkMode ? 'bg-red-900/20' : 'bg-red-50'}`}>
          <div className={`text-center p-8 rounded-xl shadow-lg max-w-md ${darkMode ? 'bg-gray-800 text-white' : 'bg-white'
            }`}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${darkMode ? 'bg-red-900/30' : 'bg-red-100'
              }`}>
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h3 className={`text-lg mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>{t.moduleLoadError}</h3>
            <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {t.moduleLoadErrorMessage.replace('{screenName}', currentScreen)}
            </p>
            <button
              onClick={() => setCurrentScreen('dashboard')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t.backToDashboard}
            </button>
          </div>
        </div>
      );
    }
  };

  return (
    <div className={`h-full min-h-0 flex relative ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
      {/* Mobile Overlay - Sidebar açıkken arka planı karart */}
      {isMobile && effectiveSidebarOpen && (
        <div
          className="fixed inset-0 bg-transparent"
          style={{ zIndex: Z_INDEX.MOBILE_OVERLAY }}
          onClick={() => effectiveSetSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div
        className={isMobile
          ? `fixed inset-y-0 left-0 w-80 transition-transform duration-300 ease-in-out ${effectiveSidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none invisible opacity-0'}`
          : `transition-all duration-300 ease-in-out ${effectiveSidebarOpen ? 'w-64 md:w-80' : 'w-0 overflow-hidden'} flex-shrink-0 relative`}
        style={isMobile ? { zIndex: Z_INDEX.SIDEBAR } : {}}
      >
        <div className={`h-full transition-opacity duration-300 ${!isMobile && !effectiveSidebarOpen ? 'opacity-0' : 'opacity-100'}`}>
          <ModernSidebar
            menuSections={menuSections}
            currentScreen={currentScreen}
            setCurrentScreen={setCurrentScreen}
            menuSearchQuery={menuSearchQuery}
            setMenuSearchQuery={setMenuSearchQuery}
            searchResults={searchResults}
            handleSearchItemClick={handleSearchItemClick}
            expandedSections={expandedSections}
            toggleSection={toggleSection}
            currentLanguage={currentLanguage}
            setCurrentLanguage={setLanguage}
            showLanguageMenu={showLanguageMenu}
            setShowLanguageMenu={setShowLanguageMenu}
            languages={languages}
            APP_VERSION={APP_VERSION}
            t={t}
            menuSource={'static'}
          />
        </div>
      </div>

      {/* Mobile Menu Button - REMOVED: Managed by MainLayout Header */}

      {/* Main Content */}
      <div className={`flex-1 min-h-0 min-w-0 h-full overflow-hidden transition-all duration-300 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} ${isMobile ? 'w-full' : ''}`}>
        <Suspense fallback={
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>{t.loading}</p>
            </div>
          </div>
        }>
          {renderContent()}
        </Suspense>
      </div>

      {/* Language Selection Modal */}
      {showLanguageMenu && (
        <LanguageSelectionModal
          onClose={() => setShowLanguageMenu(false)}
          rtlMode={rtlMode}
          setRtlMode={setRtlMode}
        />
      )}
    </div>
  );
}

function PlaceholderModule({ screenName, onBack, t }: { screenName: string; onBack: () => void; t: any }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-slate-50">
      <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
        <Layers className="w-10 h-10 text-blue-600" />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        {t.preparingModule.replace('{screenName}', screenName)}
      </h2>
      <p className="text-slate-500 text-center max-w-md mb-8">
        {t.moduleUnderDevelopment}
      </p>
      <button
        onClick={onBack}
        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        {t.backToDashboard}
      </button>
    </div>
  );
}


