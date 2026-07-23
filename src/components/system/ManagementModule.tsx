import React, { useState, useEffect, useLayoutEffect, Suspense, useMemo, useCallback } from 'react';
import {
  PieChart, Store as StoreIcon, Map as MapIcon, Settings, Zap, FileSpreadsheet,
  FileText, FileCheck, RefreshCw, FileMinus, Send, Truck, Archive,
  ShoppingCart, FileSignature, Users, Target, ShoppingBag, ClipboardList,
  Package, Warehouse, TrendingDown, Boxes, QrCode, Tag, Scale,
  Briefcase, GitBranch, Calendar, Award, Wallet, CreditCard, Database,
  Globe, Receipt, Building, Calculator, TrendingUpDown, Gift, Percent,
  PackageSearch, Wrench, Shield, UserCog, UtensilsCrossed, Phone, Bell,
  Smartphone, Mail, BarChart3, TrendingUp, UserCheck, Layers, Clock, AlertCircle,
  Search, X, Languages, Radio, ArrowRightLeft, MoreVertical, Printer, Menu, ChevronLeft, Loader2
} from 'lucide-react';

/** Dinamik menüde `icon_name` çözümü — her menü satırında yeni nesne oluşturulmaz */
const DYNAMIC_MENU_ICON_MAP: Record<string, any> = {
  PieChart,
  Store: StoreIcon,
  Map: MapIcon,
  StoreIcon,
  MapIcon,
  Settings,
  Zap,
  FileSpreadsheet,
  FileText, FileCheck, RefreshCw, FileMinus, Send, Truck, Archive,
  ShoppingCart, FileSignature, Users, Target, ShoppingBag, ClipboardList,
  Package, Warehouse, TrendingDown, Boxes, QrCode, Tag, Scale,
  Briefcase, GitBranch, Calendar, Award, Wallet, CreditCard, Database,
  Globe, Receipt, Building, Calculator, TrendingUpDown, Gift, Percent,
  PackageSearch, Wrench, Shield, UserCog, UtensilsCrossed, Phone, Bell,
  Smartphone, Mail, BarChart3, TrendingUp, UserCheck, Layers, Clock, AlertCircle,
  Search, X, Languages, Radio, ArrowRightLeft, MoreVertical, Printer, Menu, ChevronLeft,
};

import { lazyWithChunkRecovery } from '../../utils/chunkLoadRecovery';

const RestaurantMainLazy = lazyWithChunkRecovery(() => import('../restaurant/index'));
const BeautyMainLazy = lazyWithChunkRecovery(() => import('../beauty/index'));
import { APP_VERSION } from '../../core/version';
import { useLanguage } from '../../contexts/LanguageContext';
import { LanguageSelectionModal } from './LanguageSelectionModal';

// Lazy-loaded modules — code-split for performance
const DashboardModule = lazyWithChunkRecovery(() => import('./DashboardModule').then(m => ({ default: m.DashboardModule })));
const ProductManagement = lazyWithChunkRecovery(() => import('../inventory/products/ProductManagement').then(m => ({ default: m.ProductManagement })));
const StockModule = lazyWithChunkRecovery(() => import('../inventory/stock/StockModule').then(m => ({ default: m.StockModule })));
const ServiceManagement = lazyWithChunkRecovery(() => import('../inventory/services/ServiceManagement').then(m => ({ default: m.ServiceManagement })));
const CustomerManagementModule = lazyWithChunkRecovery(() => import('../trading/contacts/CustomerManagementModule').then(m => ({ default: m.CustomerManagementModule })));
const FinanceModule = lazyWithChunkRecovery(() => import('../accounting/finance/FinanceModule').then(m => ({ default: m.FinanceModule })));
const PurchaseModule = lazyWithChunkRecovery(() => import('../trading/purchase/PurchaseModule').then(m => ({ default: m.PurchaseModule })));
const PurchaseRequestModule = lazyWithChunkRecovery(() => import('../trading/purchase/PurchaseRequestModule').then(m => ({ default: m.PurchaseRequestModule })));
const SalesOrderModule = lazyWithChunkRecovery(() => import('../trading/sales/SalesOrderModule').then(m => ({ default: m.SalesOrderModule })));
const AccountingModule = lazyWithChunkRecovery(() => import('../accounting/reports/AccountingModule').then(m => ({ default: m.AccountingModule })));
const MizanReportModule = lazyWithChunkRecovery(() => import('../accounting/reports/MizanReportModule').then(m => ({ default: m.MizanReportModule })));
const IncomeStatementReport = lazyWithChunkRecovery(() => import('../accounting/reports/IncomeStatementReport').then(m => ({ default: m.IncomeStatementReport })));
const BalanceSheetReport = lazyWithChunkRecovery(() => import('../accounting/reports/BalanceSheetReport').then(m => ({ default: m.BalanceSheetReport })));
const SupplierModule = lazyWithChunkRecovery(() => import('../trading/contacts/SupplierModule').then(m => ({ default: m.SupplierModule })));
const CariDevirFisiModule = lazyWithChunkRecovery(() => import('../trading/contacts/CariDevirFisiModule').then(m => ({ default: m.CariDevirFisiModule })));
const StokDevirFisiModule = lazyWithChunkRecovery(() => import('../inventory/stock/StokDevirFisiModule').then(m => ({ default: m.StokDevirFisiModule })));
const CustomerCallPlanModule = lazyWithChunkRecovery(() => import('../trading/contacts/CustomerCallPlanModule').then(m => ({ default: m.CustomerCallPlanModule })));
const PurchaseExpiryReport = lazyWithChunkRecovery(() => import('../reports/PurchaseExpiryReport').then(m => ({ default: m.PurchaseExpiryReport })));
const PriceManagementModule = lazyWithChunkRecovery(() => import('../trading/invoices/PriceManagementModule').then(m => ({ default: m.PriceManagementModule })));
const CRMModule = lazyWithChunkRecovery(() => import('../modules/CRMModule').then(m => ({ default: m.CRMModule })));
const HRModule = lazyWithChunkRecovery(() => import('../modules/HRModule').then(m => ({ default: m.HRModule })));
const LogisticsModule = lazyWithChunkRecovery(() => import('../modules/LogisticsModule').then(m => ({ default: m.LogisticsModule })));
const SalesInvoiceModule = lazyWithChunkRecovery(() => import('../trading/sales/SalesInvoiceModule').then(m => ({ default: m.SalesInvoiceModule })));
const PurchaseInvoiceModule = lazyWithChunkRecovery(() => import('../trading/purchase/PurchaseInvoiceModule').then(m => ({ default: m.PurchaseInvoiceModule })));
const UnifiedInvoiceModule = lazyWithChunkRecovery(() => import('../trading/invoices/UnifiedInvoiceModule').then(m => ({ default: m.UnifiedInvoiceModule })));
const InvoiceListModule = lazyWithChunkRecovery(() => import('../trading/invoices/InvoiceListModule').then(m => ({ default: m.InvoiceListModule })));
const ETransformModule = lazyWithChunkRecovery(() => import('../modules/ETransformModule').then(m => ({ default: m.ETransformModule })));
const ReturnModule = lazyWithChunkRecovery(() => import('../trading/invoices/ReturnModule').then(m => ({ default: m.ReturnModule })));
const ProductionModule = lazyWithChunkRecovery(() => import('../modules/ProductionModule').then(m => ({ default: m.ProductionModule })));
const ButcherProductionModule = lazyWithChunkRecovery(() => import('../modules/butcher/ButcherProductionModule').then(m => ({ default: m.ButcherProductionModule })));
const AssetManagementModule = lazyWithChunkRecovery(() => import('../modules/AssetManagementModule').then(m => ({ default: m.AssetManagementModule })));
const BudgetModule = lazyWithChunkRecovery(() => import('../modules/BudgetModule').then(m => ({ default: m.BudgetModule })));
const ContractModule = lazyWithChunkRecovery(() => import('../modules/ContractModule').then(m => ({ default: m.ContractModule })));
const QualityModule = lazyWithChunkRecovery(() => import('../modules/QualityModule').then(m => ({ default: m.QualityModule })));
const ServiceModule = lazyWithChunkRecovery(() => import('../modules/ServiceModule').then(m => ({ default: m.ServiceModule })));
const ProjectModule = lazyWithChunkRecovery(() => import('../modules/ProjectModule').then(m => ({ default: m.ProjectModule })));
const IntegrationsModule = lazyWithChunkRecovery(() => import('../modules/IntegrationsModule').then(m => ({ default: m.IntegrationsModule })));
const ReportsModule = lazyWithChunkRecovery(() => import('../reports/ReportsModule'));
const CategoryGroupSalesProfitReport = lazyWithChunkRecovery(() => import('../reports/CategoryGroupSalesProfitReport').then(m => ({ default: m.CategoryGroupSalesProfitReport })));
const ProfitDashboard = lazyWithChunkRecovery(() => import('../reports/ProfitDashboard').then(m => ({ default: m.ProfitDashboard })));
const SettingsPanel = lazyWithChunkRecovery(() => import('./SettingsPanel').then(m => ({ default: m.SettingsPanel })));
const ExcelModule = lazyWithChunkRecovery(() => import('../modules/ExcelModule').then(m => ({ default: m.ExcelModule })));

import type { CountPurchaseDraftPrefill, PosSalesReturnPrefill } from '../trading/invoices/InvoiceListModule';
const ScaleManagementWrapper = lazyWithChunkRecovery(() => import('../scale/ScaleManagementWrapper').then(m => ({ default: m.ScaleManagementWrapper })));
const MultiStoreManagement = lazyWithChunkRecovery(() => import('./MultiStoreManagement').then(m => ({ default: m.MultiStoreManagement })));
const RegionalManagement = lazyWithChunkRecovery(() => import('../inventory/warehouse/RegionalManagement').then(m => ({ default: m.RegionalManagement })));
const StoreConfigModule = lazyWithChunkRecovery(() => import('./StoreConfigModule').then(m => ({ default: m.StoreConfigModule })));
const CampaignManagement = lazyWithChunkRecovery(() => import('../management/CampaignManagement').then(m => ({ default: m.CampaignManagement })));
const RoleManagement = lazyWithChunkRecovery(() => import('./RoleManagement').then(m => ({ default: m.RoleManagement })));
const LoyaltyProgramModule = lazyWithChunkRecovery(() => import('../modules/LoyaltyProgramModule').then(m => ({ default: m.LoyaltyProgramModule })));
const GiftCardModule = lazyWithChunkRecovery(() => import('../modules/GiftCardModule').then(m => ({ default: m.GiftCardModule })));
const NotificationCenterModule = lazyWithChunkRecovery(() => import('../modules/NotificationCenterModule').then(m => ({ default: m.NotificationCenterModule })));
const CurrencyManagement = lazyWithChunkRecovery(() => import('../accounting/finance/CurrencyManagement').then(m => ({ default: m.CurrencyManagement })));
const CommissionModule = lazyWithChunkRecovery(() => import('../modules/CommissionModule').then(m => ({ default: m.CommissionModule })));
const UserManagementModule = lazyWithChunkRecovery(() => import('./UserManagementModule').then(m => ({ default: m.UserManagementModule })));
const WhatsAppIntegrationModule = lazyWithChunkRecovery(() => import('../modules/WhatsAppIntegrationModule').then(m => ({ default: m.WhatsAppIntegrationModule })));
const MesajBildirimModule = lazyWithChunkRecovery(() => import('../modules/MesajBildirimModule').then(m => ({ default: m.MesajBildirimModule })));
const AppointmentModule = lazyWithChunkRecovery(() => import('../modules/AppointmentModule').then(m => ({ default: m.AppointmentModule })));
const BIDashboardModule = lazyWithChunkRecovery(() => import('../modules/BIDashboardModule').then(m => ({ default: m.BIDashboardModule })));
const EcommerceModule = lazyWithChunkRecovery(() => import('../modules/EcommerceModule').then(m => ({ default: m.EcommerceModule })));
const CargoIntegrationModule = lazyWithChunkRecovery(() => import('../modules/CargoIntegrationModule').then(m => ({ default: m.CargoIntegrationModule })));
const MarketplaceIntegrationModule = lazyWithChunkRecovery(() => import('../modules/MarketplaceIntegrationModule').then(m => ({ default: m.MarketplaceIntegrationModule })));
const PaymentSystemsModule = lazyWithChunkRecovery(() => import('../modules/PaymentSystemsModule').then(m => ({ default: m.PaymentSystemsModule })));
const AccountingIntegrationModule = lazyWithChunkRecovery(() => import('../accounting/reports/AccountingIntegrationModule').then(m => ({ default: m.AccountingIntegrationModule })));
const CentralDataBroadcastPanel = lazyWithChunkRecovery(() => import('../modules/CentralDataBroadcastPanel').then(m => ({ default: m.CentralDataBroadcastPanel })));
const EnterpriseCentralDataManagement = lazyWithChunkRecovery(() => import('../modules/EnterpriseCentralDataManagement').then(m => ({ default: m.EnterpriseCentralDataManagement })));
const ModuleManagement = lazyWithChunkRecovery(() => import('./ModuleManagement').then(m => ({ default: m.ModuleManagement })));
const SystemManagementModule = lazyWithChunkRecovery(() => import('./SystemManagementModule').then(m => ({ default: m.SystemManagementModule })));
const RestaurantCallerIdSettings = lazyWithChunkRecovery(() => import('../restaurant/components/RestaurantCallerIdSettings').then(m => ({ default: m.RestaurantCallerIdSettings })));
const MenuManagementPanel = lazyWithChunkRecovery(() =>
  import('./MenuManagementPanel').then((m) => {
    const Comp = m.MenuManagementPanel ?? m.default;
    if (!Comp) throw new Error('MenuManagementPanel export bulunamadı');
    return { default: Comp };
  }),
);
const ExpenseManagement = lazyWithChunkRecovery(() => import('../accounting/reports/ExpenseManagement').then(m => ({ default: m.ExpenseManagement })));
const CompanySetup = lazyWithChunkRecovery(() => import('./CompanySetup').then(m => ({ default: m.CompanySetup })));
const DiscountManagement = lazyWithChunkRecovery(() => import('../trading/invoices/DiscountManagement').then(m => ({ default: m.DiscountManagement })));
const CashRegisterManagement = lazyWithChunkRecovery(() => import('../accounting/cash-ops/CashRegisterManagement').then(m => ({ default: m.CashRegisterManagement })));
const KasalarModule = lazyWithChunkRecovery(() => import('../accounting/cash-ops/KasalarModule').then(m => ({ default: m.KasalarModule })));
const BankRegisterManagement = lazyWithChunkRecovery(() => import('../accounting/cash-ops/BankRegisterManagement').then(m => ({ default: m.BankRegisterManagement })));
const StoreTransferModule = lazyWithChunkRecovery(() => import('../inventory/warehouse/StoreTransferModule').then(m => ({ default: m.StoreTransferModule })));
const MobileInventoryCountModule = lazyWithChunkRecovery(() => import('../inventory/stock/MobileInventoryCountModule').then(m => ({ default: m.MobileInventoryCountModule })));
const InterStoreTransfersView = lazyWithChunkRecovery(() => import('../inventory/warehouse/InterStoreTransfersView'));
import { ModernSidebar } from './ModernSidebar';
const PriceChangeVouchersModule = lazyWithChunkRecovery(() => import('../trading/invoices/PriceChangeVouchersModule').then(m => ({ default: m.PriceChangeVouchersModule })));
const BarcodeDefinitionsModule = lazyWithChunkRecovery(() => import('../inventory/stock/BarcodeDefinitionsModule').then(m => ({ default: m.BarcodeDefinitionsModule })));
const SerialLotModule = lazyWithChunkRecovery(() => import('../inventory/stock/SerialLotModule').then(m => ({ default: m.SerialLotModule })));
const WarehouseDefinitionsModule = lazyWithChunkRecovery(() => import('../inventory/warehouse/WarehouseDefinitionsModule').then(m => ({ default: m.WarehouseDefinitionsModule })));
const ServiceCardsModule = lazyWithChunkRecovery(() => import('../modules/ServiceCardsModule').then(m => ({ default: m.ServiceCardsModule })));
const StockMovementsModule = lazyWithChunkRecovery(() => import('../inventory/stock/StockMovementsModule').then(m => ({ default: m.StockMovementsModule })));
const StockPriceChangeSlipsModule = lazyWithChunkRecovery(() => import('../inventory/stock/StockPriceChangeSlipsModule').then(m => ({ default: m.StockPriceChangeSlipsModule })));
const WarehouseTransferModule = lazyWithChunkRecovery(() => import('../inventory/warehouse/WarehouseTransferModule').then(m => ({ default: m.WarehouseTransferModule })));
const WMSStockCountModule = lazyWithChunkRecovery(() => import('../wms/components/StockCountModule').then(m => ({ default: m.StockCountModule })));
const MaterialReportsModule = lazyWithChunkRecovery(() => import('../inventory/products/MaterialReportsModule').then(m => ({ default: m.MaterialReportsModule })));
const VirmanModule = lazyWithChunkRecovery(() => import('../accounting/reports/VirmanModule').then(m => ({ default: m.VirmanModule })));
const PaymentPlansModule = lazyWithChunkRecovery(() => import('../accounting/finance/PaymentPlansModule').then(m => ({ default: m.PaymentPlansModule })));
const BankPaymentPlansModule = lazyWithChunkRecovery(() => import('../accounting/finance/BankPaymentPlansModule').then(m => ({ default: m.BankPaymentPlansModule })));
const MaterialMasterRecords = lazyWithChunkRecovery(() => import('../inventory/products/MaterialMasterRecords').then(m => ({ default: m.MaterialMasterRecords })));
const MaterialsIntakeModule = lazyWithChunkRecovery(() => import('../management/MaterialsIntakeModule').then(m => ({ default: m.MaterialsIntakeModule })));
const CostCenterManagement = lazyWithChunkRecovery(() => import('../accounting/finance/CostCenterManagement').then(m => ({ default: m.CostCenterManagement })));
const MaterialExtractReport = lazyWithChunkRecovery(() => import('../inventory/reports/MaterialExtractReport').then(m => ({ default: m.MaterialExtractReport })));
const MaterialAdvancedReports = lazyWithChunkRecovery(() => import('../inventory/products/MaterialAdvancedReports').then(m => ({ default: m.MaterialAdvancedReports })));
const NewModulesDashboard = lazyWithChunkRecovery(() => import('./NewModulesDashboard').then(m => ({ default: m.NewModulesDashboard })));
const AccountingDashboard = lazyWithChunkRecovery(() => import('../accounting/reports/AccountingDashboard').then(m => ({ default: m.AccountingDashboard })));
const WorkflowBuilder = lazyWithChunkRecovery(() => import('../modules/WorkflowBuilder').then(m => ({ default: m.WorkflowBuilder })));
const VoiceAssistantWeb = lazyWithChunkRecovery(() => import('../modules/VoiceAssistantWeb').then(m => ({ default: m.VoiceAssistantWeb })));
const ProductAnalyticsDashboard = lazyWithChunkRecovery(() => import('../inventory/products/ProductAnalyticsDashboard').then(m => ({ default: m.ProductAnalyticsDashboard })));
const CashierScale = lazyWithChunkRecovery(() => import('../scale/CashierScale').then(m => ({ default: m.CashierScale })));
const DatabaseMigrations = lazyWithChunkRecovery(() => import('./DatabaseMigrations').then(m => ({ default: m.DatabaseMigrations })));
const HybridSyncModule = lazyWithChunkRecovery(() => import('./HybridSyncPanel').then(m => ({ default: m.HybridSyncModule })));
const SupabaseMigrationModule = lazyWithChunkRecovery(() => import('./SupabaseMigrationModule'));
const StoreManagementDashboard = lazyWithChunkRecovery(() => import('./StoreManagementDashboard').then(m => ({ default: m.StoreManagementDashboard })));
const SecurityModulesWeb = lazyWithChunkRecovery(() => import('./SecurityModulesWeb').then(m => ({ default: m.SecurityModulesWeb })));
const ReportDetailFullPage = lazyWithChunkRecovery(() => import('../reports/ReportDetailFullPage').then(m => ({ default: m.ReportDetailFullPage })));
const DemoDataManager = lazyWithChunkRecovery(() => import('./DemoDataManager').then(m => ({ default: m.DemoDataManager })));
const AuditTrailModule = lazyWithChunkRecovery(() => import('../modules/AuditTrailModule'));
const WavePickingModule = lazyWithChunkRecovery(() => import('../wms/WavePickingModule').then(m => ({ default: m.WavePickingModule })));
const ReconciliationDashboard = lazyWithChunkRecovery(() => import('../accounting/reports/ReconciliationDashboard').then(m => ({ default: m.ReconciliationDashboard })));
const AIStockPredictionModule = lazyWithChunkRecovery(() => import('../inventory/ai/AIStockPredictionModule').then(m => ({ default: m.AIStockPredictionModule })));
const GeneralLedgerMizan = lazyWithChunkRecovery(() => import('../accounting/reports/GeneralLedgerMizan').then(m => ({ default: m.GeneralLedgerMizan })));
const CariExtractReport = lazyWithChunkRecovery(() => import('../reports/ErpCoreReports').then(m => ({ default: m.CariExtractReport })));
const StorePerformanceAnalysis = lazyWithChunkRecovery(() => import('../sales/reports/StorePerformanceAnalysis').then(m => ({ default: m.StorePerformanceAnalysis })));
const InventoryAgingReport = lazyWithChunkRecovery(() => import('../inventory/reports/InventoryAgingReport').then(m => ({ default: m.InventoryAgingReport })));
const UniversalReportHub = lazyWithChunkRecovery(() => import('../analytics/UniversalReportHub').then(m => ({ default: m.UniversalReportHub })));
const NebimMigrationWizard = lazyWithChunkRecovery(() => import('./NebimMigrationWizard').then(m => ({ default: m.NebimMigrationWizard })));
import type { MasterRecordType } from '../inventory/products/MaterialMasterRecords';
import type { ReportViewType } from '../inventory/products/MaterialAdvancedReports';

// Import optimized translation system (reduces bundle size by ~170 lines)
import type { Language } from '../../locales/module-translations';
import type { Product, Customer, Sale, Campaign } from '../../core/types';
import type { ManagementScreen } from '../../App';
import { useTheme } from '../../contexts/ThemeContext';
import { useResponsive } from '../../hooks/useResponsive';
import { usePermission } from '../../shared/hooks/usePermission';
import { getStaticMenuSections } from '../../config/staticMenuConfig';
import { remapLegacyStaticHiddenModules, subscribeRuntimeHiddenModules } from '../../services/menuPreferencesRuntime';
import { syncMenuPreferences } from '../../services/menuPreferencesService';

// Custom z-index constants to ensure consistent layering
const Z_INDEX = {
  HEADER: 60,
  MOBILE_OVERLAY: 70,
  /** Drawer açıkken üstte; kapalıyken 0 — içerik üstte kalsın (hayalet tıklamaları önler) */
  SIDEBAR: 80,
  SIDEBAR_MOBILE_CLOSED: 0,
  MAIN_MOBILE: 10,
  MOBILE_MENU_BTN: 90,
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
  'multistore' | 'regional' | 'storeconfig' | 'campaigns_mgmt' | 'roles_mgmt' | 'loyalty' | 'giftcard' | 'notifications' | 'multicurrency' | 'commission' | 'usermanagement' | 'whatsapp' | 'mesaj-bildirim' | 'restaurant' | 'appointment' | 'bi-dashboard' | 'ecommerce' | 'cargo' | 'marketplace' | 'payment' | 'accounting-integration' | 'proforma' | 'einvoice' | 'ewaybill' | 'eledger' |
  'salesquote' | 'purchaserequest' | 'stockmovements' | 'stock-dashboard' | 'warehousetransfer' | 'stockcount' | 'barcode' | 'seriallot' | 'warehouse-definitions' | 'service-cards' | 'virman' | 'firm-period-definitions' | 'payment-plans' | 'bank-payment-plans' |
  'productionrecipe' | 'capacityplan' | 'butcher-production' | 'cashbank' | 'banks' | 'checkpromissory' | 'collectionpayment' | 'currentaccounts' | 'revenueexpense' | 'customer-call-plan' |
  'storetransfer' | 'mobile-inventory-count' | 'interstore-transfer' | 'store-controlled-count' |
  'pricelists' | 'discounts' | 'promotions' | 'shipping' | 'cargotrack' | 'waybillops' | 'routeplan' | 'delivery-management' | 'delivery' |
  'servicemaint' | 'warranty' | 'fieldservice' | 'fixedasset' | 'depreciation' | 'maintplan' |
  'MalzemeSiniflari' | 'Birimsetleri' | 'varyant' | 'ozelkodlar' | 'markatanim' | 'groupkodları' |
  'malzemeler' | 'materials-intake' | 'smart-material-add' | 'hareketler' | 'material-list' | 'material-definitions' | 'material-classes' | 'unit-sets' | 'variants' | 'group-codes' | 'product-categories' | 'special-codes' | 'brand-definitions' |
  'suppliers_def' | 'warehousetransfer_def' | 'warehousetransfer_mv' | 'warehousetransfer_v' | 'storetransfer_mv' | 'storetransfer_v' | 'stockcount_store' | 'material-transfers' |
  'stockreports_bal' | 'stockreports_tr' | 'stockreports_list' | 'stockreports_sum' | 'stockreports_trans' |
  'report-material-extract' | 'report-material-value' | 'inventory' | 'purchase-expiry-report' | 'cost' | 'report-in-out-totals' | 'report-warehouse-status' | 'report-transaction-breakdown' | 'report-slip-list' | 'report-min-max' |
  'MMSR' | 'MLR' | 'Enr' | 'GCTR' | 'FLR' | 'MLADR' | 'MDR' | 'MER' | 'HDRR' |
  'personnel' | 'attendance' | 'payroll' | 'performance' | 'training' |
  'waybill-sales' | 'waybill-purchase' | 'waybill-transfer' | 'waybill-fire' |
  'roleauth' | 'roles' | 'role_management' | 'authorization' |
  'financereports' | 'generalsettings' | 'definitions' | 'backuprestore' | 'systemhealth' | 'pendingposdevices' | 'smsmanage' | 'emailcamp' | 'logaudit' | 'databroadcast' |
  'modulemanagement' | 'menumanagement' | 'onlineorders' | 'productsync' | 'price-change-vouchers' | 'new-modules' | 'accounting-mgmt' | 'workflow-automation' | 'voice-assistant' | 'cashier-scale' | 'scale-management' | 'db-migrations' | 'hybrid-sync' | 'store-management' | 'security-modules' | 'demo-data' |
  'product-analytics' | 'profit-dashboard' | 'graphanalysis' | 'reconciliation' | 'wave-picking' | 'ai-stock-prediction' | 'material-extract' | 'cost-centers' |
  'universal-report-hub' | 'customer-extract' | 'store-performance' | 'inventory-aging' | 'nebim-migration' |
  'cash-slips' | 'bank-slips' | 'pos-slips' | 'current-slips' | 'cari-devir' | 'stok-devir' | 'stockcounting' | 'stockcounting-mobile' |
  'salesreports' | 'stockreports' | 'customeranalysis' | 'mizan' | 'income-statement' | 'balance-sheet' | 'advanced-reports' | 'reports' | 'customreports' | 'category-group-profit-report' | 'materials' | 'MYFisleri' |
  'stockmovements-deficit' | 'stockmovements-surplus' | 'stock-price-change-slips' |
  'inventory-count-ops' |
  'analytics-group' | 'sales-stock-group' | 'finance-reps-group' | 'advanced-reps-group' |
  'report-designer' | 'label-designer' | 'invoice-label-designer' | 'print-options' |
  'supabase-migration' |
  'virtual-pbx-caller-id' |
  'restaurant' | 'beauty';

import { useAuth } from '../../contexts/AuthContext';
import { useFirmaDonem } from '../../contexts/FirmaDonemContext';
import { GIB_EDOCUMENT_SCREEN_IDS, isGibEdocumentUiEnabled } from '../../config/eInvoice.config';
import { isIntegrationsAccessGranted } from '../../utils/integrationsAccess';
import { shouldAutoHideManagementSidebar } from '../../utils/managementSidebarAutoHide';

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
  const { selectedFirm } = useFirmaDonem();
  /** Firma yüklenene kadar menüyü daraltma; yüklendiyse yalnızca TR'de GİB. */
  const gibEdocumentMenuEnabled =
    selectedFirm == null ? true : isGibEdocumentUiEnabled(selectedFirm.regulatory_region);
  const { hasPermission, isAdmin } = usePermission();
  const isTauri = !!(window as any).__TAURI_INTERNALS__;

  // Sidebar state — managed internally; prop overrides are optional.
  // Desktop toggle tercihi localStorage'da tutulur — yenilemede korunur.
  const SIDEBAR_PREF_KEY = 'retailex-management-sidebar-open';
  const [_sidebarOpen, _setSidebarOpenRaw] = useState(() => {
    if (sidebarOpen !== undefined) return sidebarOpen;
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(SIDEBAR_PREF_KEY);
    return saved === null ? true : saved === '1';
  });
  const effectiveSidebarOpen = sidebarOpen !== undefined ? sidebarOpen : _sidebarOpen;
  const _setSidebarOpen = useCallback((next: boolean) => {
    _setSidebarOpenRaw(next);
    try {
      localStorage.setItem(SIDEBAR_PREF_KEY, next ? '1' : '0');
    } catch {
      /* sessizce yoksay */
    }
  }, []);
  const effectiveSetSidebarOpen = setSidebarOpen ?? _setSidebarOpen;

  useEffect(() => {
    const openSidebar = () => effectiveSetSidebarOpen(true);
    const toggleSidebar = () => effectiveSetSidebarOpen(!effectiveSidebarOpen);
    window.addEventListener('retailex-open-management-sidebar', openSidebar as EventListener);
    window.addEventListener('retailex-toggle-management-sidebar', toggleSidebar as EventListener);
    return () => {
      window.removeEventListener('retailex-open-management-sidebar', openSidebar as EventListener);
      window.removeEventListener('retailex-toggle-management-sidebar', toggleSidebar as EventListener);
    };
  }, [effectiveSidebarOpen, effectiveSetSidebarOpen]);

  // Sidebar durum değişimini dış dünyaya (MainLayout üst bar butonu vb.) bildir.
  useEffect(() => {
    try {
      (window as any).__retailexManagementSidebarOpen = effectiveSidebarOpen;
      window.dispatchEvent(
        new CustomEvent('retailex-management-sidebar-state', { detail: { open: effectiveSidebarOpen } })
      );
    } catch {
      /* sessizce yoksay */
    }
  }, [effectiveSidebarOpen]);

  // Klavye kısayolu: Ctrl/Cmd + B → sidebar aç/kapa (VS Code/Linear stili).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        const target = e.target as HTMLElement | null;
        const isEditable = !!target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          (target as HTMLElement).isContentEditable
        );
        if (isEditable) return;
        e.preventDefault();
        effectiveSetSidebarOpen(!effectiveSidebarOpen);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [effectiveSidebarOpen, effectiveSetSidebarOpen]);

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
        if (savedScreen === 'Dashboard') return 'dashboard';
        return savedScreen as ExtendedScreen;
      }

      // Eğer kayıtlı yoksa role göre varsayılan döndür
      return getDefaultScreenForRole(user?.role_ids);
    } catch (e) {
      return 'dashboard';
    }
  };

  const [currentScreen, setCurrentScreen] = useState<ExtendedScreen>(getInitialScreen);
  const [countPurchaseDraftPrefill, setCountPurchaseDraftPrefill] = useState<CountPurchaseDraftPrefill | null>(null);
  const clearCountPurchaseDraftPrefill = useCallback(() => {
    setCountPurchaseDraftPrefill(null);
  }, []);
  const [posSalesReturnPrefill, setPosSalesReturnPrefill] = useState<PosSalesReturnPrefill | null>(null);
  const clearPosSalesReturnPrefill = useCallback(() => {
    setPosSalesReturnPrefill(null);
  }, []);
  const [invoiceSearchPrefill, setInvoiceSearchPrefill] = useState<string | null>(null);
  const clearInvoiceSearchPrefill = useCallback(() => {
    setInvoiceSearchPrefill(null);
  }, []);
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
    if (currentScreen === 'inventory-count-ops') setCurrentScreen('mobile-inventory-count');
  }, [currentScreen]);
  const [rtlMode, setRtlMode] = useState(() => {
    return localStorage.getItem('retailos_rtl_mode') === 'true';
  });
  const [hiddenModules, setHiddenModules] = useState<string[]>([]);

  useEffect(() => {
    return subscribeRuntimeHiddenModules(setHiddenModules);
  }, []);


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

  // Mobilde sidebar kapalı; rapor / genel rapor ekranlarında masaüstünde de gizle
  useEffect(() => {
    if (isMobile) {
      effectiveSetSidebarOpen(false);
    }
  }, [isMobile, effectiveSetSidebarOpen]);

  useLayoutEffect(() => {
    if (shouldAutoHideManagementSidebar(currentScreen)) {
      _setSidebarOpenRaw(false);
      return;
    }
    if (!isMobile && sidebarOpen === undefined) {
      try {
        const saved = localStorage.getItem(SIDEBAR_PREF_KEY);
        _setSidebarOpenRaw(saved !== '0');
      } catch {
        _setSidebarOpenRaw(true);
      }
    }
  }, [currentScreen, isMobile, sidebarOpen]);

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
    console.log('🗑ï¸ Menü cache temizlendi');
  }, []);

  // Listen for navigation events from other components
  useEffect(() => {
    const handleNavigateToScreen = (e: CustomEvent) => {
      const d = e.detail as unknown;
      let screenId: ExtendedScreen;
      if (d && typeof d === 'object' && d !== null && 'screen' in (d as Record<string, unknown>)) {
        const o = d as {
          screen: ExtendedScreen;
          countPurchaseDraft?: { editData: Record<string, unknown>; skipProductStockUpdate?: boolean };
          posSalesReturn?: { editData: Record<string, unknown>; openForm?: boolean };
          invoiceSearch?: string;
        };
        screenId = o.screen;
        if (o.invoiceSearch?.trim()) {
          setInvoiceSearchPrefill(o.invoiceSearch.trim());
        } else {
          setInvoiceSearchPrefill(null);
        }
        if (o.countPurchaseDraft?.editData) {
          setCountPurchaseDraftPrefill({
            editData: o.countPurchaseDraft.editData,
            skipProductStockUpdate: !!o.countPurchaseDraft.skipProductStockUpdate,
          });
        } else {
          setCountPurchaseDraftPrefill(null);
        }
        if (o.posSalesReturn?.editData) {
          setPosSalesReturnPrefill({
            editData: o.posSalesReturn.editData,
            openForm: o.posSalesReturn.openForm !== false,
          });
        } else {
          setPosSalesReturnPrefill(null);
        }
      } else {
        screenId = d as ExtendedScreen;
        setCountPurchaseDraftPrefill(null);
        setPosSalesReturnPrefill(null);
      }
      if (
        selectedFirm != null &&
        !isGibEdocumentUiEnabled(selectedFirm.regulatory_region) &&
        GIB_EDOCUMENT_SCREEN_IDS.has(String(screenId))
      ) {
        screenId = 'dashboard';
        setCountPurchaseDraftPrefill(null);
        setPosSalesReturnPrefill(null);
      }
      setCurrentScreen(screenId);
      if (isMobile) effectiveSetSidebarOpen(false);

      // Update storage immediately to prevent remount race conditions
      try {
        const userKey = user ? `last_screen_${user.username}` : 'last_screen_guest';
        localStorage.setItem(userKey, String(screenId));
      } catch (e) {
        console.warn('Failed to save screen state');
      }
    };
    window.addEventListener('navigateToScreen', handleNavigateToScreen as EventListener);
    return () => window.removeEventListener('navigateToScreen', handleNavigateToScreen as EventListener);
  }, [user, isMobile, effectiveSetSidebarOpen, selectedFirm]);

  // Convert API menu items to menuSections format (önce tanımlanmalı)
  const convertMenuItemsToSections = useCallback((items: any[]): any[] => {
    return items.map((item: any) => {
      // Get icon component from icon_name
      // Get icon component from icon_name
      let IconComponent: any = null;

      if (item.icon_name) {
        IconComponent = DYNAMIC_MENU_ICON_MAP[item.icon_name] || null;
        if (!IconComponent) {
          console.warn(`Icon ${item.icon_name} not found in DYNAMIC_MENU_ICON_MAP`);
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

  // Fetch hidden_modules: PG → localStorage senkron (tarayıcı geçmişi silinse bile geri yüklenir)
  const fetchHiddenModules = useCallback(async () => {
    try {
      const username = user?.username || user?.full_name || 'kullanici';
      const prefs = await syncMenuPreferences(username);
      setHiddenModules(prefs.hidden_modules ?? []);
    } catch (err) {
      console.error('Failed to fetch hidden_modules:', err);
    }
  }, [user?.username, user?.full_name]);

  useEffect(() => {
    void fetchHiddenModules();
  }, [fetchHiddenModules]);

  const languages = [
    { code: 'tr' as const, name: 'Türkçe', flag: '🇹🇷' },
    { code: 'en' as const, name: 'English', flag: '????' },
    { code: 'ar' as const, name: '???????', flag: '????' },
    { code: 'ku' as const, name: '????? (??????)', flag: '??????', expenseAnalysis: '?????? ??????????', reporting: '??????????' }
  ];

  const toggleSection = useCallback((title: string) => {
    setExpandedSections((prev) =>
      prev.includes(title) ? prev.filter((s) => s !== title) : [...prev, title]
    );
  }, []);

  const handleSearchItemClick = useCallback((item: any) => {
    if (item?.id == null || item.id === '') return;
    if (
      selectedFirm != null &&
      !isGibEdocumentUiEnabled(selectedFirm.regulatory_region) &&
      GIB_EDOCUMENT_SCREEN_IDS.has(String(item.id))
    ) {
      return;
    }
    const rawId = String(item.id).trim();
    setCurrentScreen(rawId === 'Dashboard' ? 'dashboard' : item.id);
    if (isMobile || shouldAutoHideManagementSidebar(rawId === 'Dashboard' ? 'dashboard' : item.id)) {
      _setSidebarOpenRaw(false);
    }
    setMenuSearchQuery('');
    setSearchResults([]);
  }, [isMobile, effectiveSetSidebarOpen, selectedFirm]);

  /** Mobilde menüden ekran seçilince drawer kapanır; kapalı drawer z-index ile içeriğin altında kalmalıdır. */
  const setScreenFromSidebar = useCallback(
    (s: any) => {
      if (
        selectedFirm != null &&
        !isGibEdocumentUiEnabled(selectedFirm.regulatory_region) &&
        GIB_EDOCUMENT_SCREEN_IDS.has(String(s))
      ) {
        return;
      }
      const id = String(s ?? '').trim();
      // Eski menü / dışa aktarım: "Dashboard" ile "dashboard" aynı ekran
      const normalized = id === 'Dashboard' ? 'dashboard' : s;
      setCurrentScreen(normalized);
      if (isMobile || shouldAutoHideManagementSidebar(String(normalized))) {
        _setSidebarOpenRaw(false);
      }
    },
    [isMobile, effectiveSetSidebarOpen, selectedFirm]
  );

  /** IQ vb.: son ekran GİB modülü kaldıysa panele dön. */
  useEffect(() => {
    if (selectedFirm == null) return;
    if (isGibEdocumentUiEnabled(selectedFirm.regulatory_region)) return;
    if (GIB_EDOCUMENT_SCREEN_IDS.has(String(currentScreen))) {
      setCurrentScreen('dashboard');
    }
  }, [selectedFirm, currentScreen]);



  const effectiveHiddenModules = useMemo(
    () => [...new Set(remapLegacyStaticHiddenModules(hiddenModules))],
    [hiddenModules],
  );

  // Use dynamic menu if available, otherwise use static menu
  const menuSections = useMemo(() => {
    const isDynamic = dynamicMenuSections && dynamicMenuSections.length > 0;
    const baseSections = isDynamic ? dynamicMenuSections! : staticMenuSections;

    const filterHidden = (items: any[]): any[] => {
      return items
        .filter(item => {
          if (!gibEdocumentMenuEnabled && item.id != null && GIB_EDOCUMENT_SCREEN_IDS.has(String(item.id))) {
            return false;
          }

          const isIntegrationsItem = item.id === 'integrations';

          // 1. Check hidden_modules from config (DeskApp: Entegrasyonlar menüde kalsın)
          if (effectiveHiddenModules.includes(item.id)) {
            if (!(isIntegrationsItem && isTauri)) return false;
          }

          // 2. Check RBAC permissions
          if (!isAdmin()) {
            if (isIntegrationsItem && (isTauri || isIntegrationsAccessGranted())) {
              return true;
            }
            const hasModuleAccess = hasPermission(item.id, 'READ');
            if (!hasModuleAccess) {
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

    return filterHidden(baseSections).filter((section) => {
      const items = section.items ?? section.children ?? [];
      return items.length > 0;
    });
  }, [dynamicMenuSections, staticMenuSections, effectiveHiddenModules, hasPermission, isAdmin, gibEdocumentMenuEnabled, isTauri]);

  // Menü güncellemelerini dinle - useCallback ile sarmalanmış
  const handleMenuUpdate = useCallback((e?: CustomEvent) => {
    console.log('🔄 Menü güncelleme eventi alındı', e?.detail);
    clearMenuCache();
    const forceReload = e?.detail?.forceReload !== false;
    console.log('🔄 Menü yeniden yükleniyor, forceReload:', forceReload);
    const previewHidden = Array.isArray(e?.detail?.hidden_modules)
      ? remapLegacyStaticHiddenModules(e.detail.hidden_modules.map((m: unknown) => String(m)))
      : null;
    if (previewHidden) {
      setHiddenModules(previewHidden);
    } else {
      void fetchHiddenModules();
    }
    loadMenuStructure(forceReload);
  }, [clearMenuCache, loadMenuStructure, fetchHiddenModules]);

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
        id: section.id,
        screen_id: section.id,
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

    try {
      switch (currentScreen) {
        case 'Dashboard':
        case 'dashboard':
          return <DashboardModule
            products={products}
            customers={customers}
            sales={sales}
            setCurrentScreen={setScreenFromSidebar}
            menuMode={hiddenModules.length > 5 ? 1 : 2}
          />;
        // Material Management - Products
        case 'products':
        case 'materials': // Potential ID for "Malzemeler"
        case 'material-list':
        case 'malzemeler': // JSON ID
        case 'material-definitions': // Menü/arama yanlış ebeveyn id ile gelirse malzeme listesi
          return <ProductManagement products={products} setProducts={setProducts} />;

        case 'materials-intake':
          return (
            <MaterialsIntakeModule
              onOpenPurchaseInvoice={() => setCurrentScreen('purchase-invoice-standard')}
            />
          );

        case 'smart-material-add':
          return (
            <MaterialsIntakeModule
              variant="smart"
              onOpenPurchaseInvoice={() => setCurrentScreen('purchase-invoice-standard')}
            />
          );

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
          return <SupplierModule key="suppliers" />;
        case 'cari-devir':
          return <CariDevirFisiModule />;
        case 'stok-devir':
          return <StokDevirFisiModule />;
        case 'customer-call-plan':
          return <CustomerCallPlanModule />;

        case 'barcode':
          return <BarcodeDefinitionsModule />;

        case 'seriallot':
          return <SerialLotModule />;

        case 'scale':
          return <ScaleManagementWrapper products={products} />;

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

        case 'stock-price-change-slips':
          return <StockPriceChangeSlipsModule />;

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
        case 'purchase-expiry-report':
          return <PurchaseExpiryReport />;
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
          return <CariExtractReport />;
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
        case 'delivery-management':
        case 'delivery':
        case 'delivery-live':
        case 'couriers':
          return <LogisticsModule />;
        case 'salesinvoice':
        case 'sales-invoice-view': // Generic view — satış + müşteri iade faturaları
          return (
            <InvoiceListModule
              products={products}
              defaultCategory="Satis"
              includeCategories={['Iade']}
              defaultInvoiceTypeFilter="all"
              title={t.salesInvoicesTitle}
              description={t.salesInvoicesDesc}
              initialSearchQuery={invoiceSearchPrefill}
              onInitialSearchConsumed={clearInvoiceSearchPrefill}
            />
          );
        case 'sales-invoice-standard':
          return <InvoiceListModule products={products} defaultCategory="Satis" defaultInvoiceTypeFilter="8" title={t.salesInvoicesTitle} description={t.salesInvoicesDesc} />;
        case 'sales-invoice-retail':
          return <InvoiceListModule products={products} defaultCategory="Satis" defaultInvoiceTypeFilter="7" title={t.retailSalesTitle} description={t.retailSalesDesc} />;
        case 'sales-invoice-wholesale':
          return <InvoiceListModule products={products} defaultCategory="Satis" defaultInvoiceTypeFilter="8" title={t.wholesaleSales} description={t.wholesaleSales} />;
        case 'sales-invoice-consignment':
          return <InvoiceListModule products={products} defaultCategory="Satis" defaultInvoiceTypeFilter="8" title={t.salesInvoicesTitle} description={t.salesInvoicesDesc} />;
        case 'sales-invoice-return':
          return (
            <InvoiceListModule
              products={products}
              defaultCategory="Iade"
              defaultInvoiceTypeFilter="3"
              title={t.salesReturnTitle}
              description={t.salesReturnDesc}
              initialSearchQuery={invoiceSearchPrefill}
              onInitialSearchConsumed={clearInvoiceSearchPrefill}
              posSalesReturnPrefill={posSalesReturnPrefill}
              onPosSalesReturnPrefillConsumed={clearPosSalesReturnPrefill}
            />
          );
        case 'purchaseinvoice':
          return (
            <InvoiceListModule
              products={products}
              defaultCategory="Alis"
              includeCategories={['Iade']}
              title={t.purchaseInvoicesTitle}
              description={t.purchaseInvoicesDesc}
              countPurchaseDraftPrefill={countPurchaseDraftPrefill}
              onCountPurchaseDraftPrefillConsumed={clearCountPurchaseDraftPrefill}
              initialSearchQuery={invoiceSearchPrefill}
              onInitialSearchConsumed={clearInvoiceSearchPrefill}
            />
          );
        case 'purchase-invoice-standard':
          return (
            <InvoiceListModule
              products={products}
              defaultCategory="Alis"
              includeCategories={['Iade']}
              defaultInvoiceTypeFilter="1"
              title={t.purchaseInvoicesTitle}
              description={t.purchaseInvoicesDesc}
              countPurchaseDraftPrefill={countPurchaseDraftPrefill}
              onCountPurchaseDraftPrefillConsumed={clearCountPurchaseDraftPrefill}
              initialSearchQuery={invoiceSearchPrefill}
              onInitialSearchConsumed={clearInvoiceSearchPrefill}
            />
          );
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
        case 'butcher-production':
          return <ButcherProductionModule />;
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
        case 'pendingposdevices':
        case 'smsmanage':
        case 'emailcamp':
        case 'invoice-label-designer':
        case 'print-options':
          return <SystemManagementModule routeHint={currentScreen} />;
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
          return (
            <div className="h-full min-h-0 overflow-hidden">
              <WhatsAppIntegrationModule />
            </div>
          );
        case 'mesaj-bildirim':
          return (
            <div className="h-full min-h-0 overflow-hidden">
              <MesajBildirimModule />
            </div>
          );
        case 'restaurant':
          return (
            <Suspense
              fallback={
                <div className="flex h-[50vh] items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  <span>Restoran modülü yükleniyor…</span>
                </div>
              }
            >
              <RestaurantMainLazy
                products={products}
                sales={sales}
                customers={customers}
                campaigns={campaigns}
                currentUser={user as any}
                onSaleComplete={() => { }}
                setActiveModule={() => { }}
              />
            </Suspense>
          );
        case 'beauty':
          return (
            <Suspense
              fallback={
                <div className="flex h-[50vh] items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  <span>Güzellik modülü yükleniyor…</span>
                </div>
              }
            >
              <BeautyMainLazy />
            </Suspense>
          );
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
        case 'scale-management':
          return <ScaleManagementWrapper products={products} />;
        case 'db-migrations':
          return <DatabaseMigrations onBack={() => setCurrentScreen('dashboard')} />;
        case 'hybrid-sync':
          return <HybridSyncModule onBack={() => setCurrentScreen('dashboard')} />;
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
          return <SystemManagementModule routeHint={currentScreen} />;
        default:
          return <DashboardModule
            products={products}
            customers={customers}
            sales={sales}
            setCurrentScreen={setScreenFromSidebar}
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
              className="px-4 py-2 bg-[var(--asin-accent,#1FA8A0)] text-white rounded-lg hover:bg-[#178f88]"
            >
              {t.backToDashboard}
            </button>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="asin-shell-frame h-full min-h-0 relative">
      {/* Mobile Overlay - Sidebar açıkken arka planı karart */}
      {isMobile && effectiveSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/45"
          style={{ zIndex: Z_INDEX.MOBILE_OVERLAY }}
          onClick={() => effectiveSetSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar Container.
          - Mobil: fixed overlay; closed iken transform ile dışarı kayar (DOM'da kalır).
          - Desktop: closed iken DOM'dan tamamen kaldırılır, böylece hiç yer kaplamaz.
          - Açık iken inline style ile width + transition uygulanır. */}
      {isMobile ? (
        <div
          className={`fixed inset-y-0 left-0 w-80 max-w-[min(100vw,20rem)] transition-transform duration-300 ease-in-out ${effectiveSidebarOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none invisible opacity-0'}`}
          style={{ zIndex: effectiveSidebarOpen ? Z_INDEX.SIDEBAR : Z_INDEX.SIDEBAR_MOBILE_CLOSED }}
          aria-hidden={!effectiveSidebarOpen}
        >
          <div className={`h-full ${!effectiveSidebarOpen ? 'pointer-events-none' : ''}`}>
            <ModernSidebar
              menuSections={menuSections}
              currentScreen={currentScreen}
              setCurrentScreen={setScreenFromSidebar}
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
            />
          </div>
        </div>
      ) : effectiveSidebarOpen ? (
        <div className="w-64 md:w-72 flex-shrink-0 h-full">
          <ModernSidebar
            menuSections={menuSections}
            currentScreen={currentScreen}
            setCurrentScreen={setScreenFromSidebar}
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
          />
        </div>
      ) : null}

      {/* Main Content */}
      <div
        className={`asin-shell-content ${isMobile ? 'relative w-full z-[10] touch-manipulation' : ''}`}
      >
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
      <div className="w-20 h-20 bg-[var(--asin-accent-muted,#D5F0EE)] rounded-2xl flex items-center justify-center mb-6">
        <Layers className="w-10 h-10 text-[var(--asin-accent,#1FA8A0)]" />
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        {t.preparingModule.replace('{screenName}', screenName)}
      </h2>
      <p className="text-slate-500 text-center max-w-md mb-8">
        {t.moduleUnderDevelopment}
      </p>
      <button
        onClick={onBack}
        className="px-6 py-2 bg-[var(--asin-accent,#1FA8A0)] text-white rounded-lg hover:bg-[#178f88] transition-colors font-medium"
      >
        {t.backToDashboard}
      </button>
    </div>
  );
}


