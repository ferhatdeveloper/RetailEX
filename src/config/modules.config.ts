// ═══════════════════════════════════════════════════════════════════════════════
// ExRetailOS - MODULE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════
// Tüm modül metadata'sını buradan yönetiyoruz (performans optimizasyonu)

import type { LucideIcon } from 'lucide-react';

export type ModuleId = 
  | 'dashboard' | 'unlimitedDashboard' | 'profitDashboard'
  | 'products' | 'stock' | 'customers' | 'suppliers'
  | 'finance' | 'accounting' | 'mizan' | 'income-statement' | 'balance-sheet'
  | 'purchase' | 'sales-orders' | 'sales-invoices' | 'purchase-invoices'
  | 'etransform' | 'returns' | 'production' | 'assets' | 'budget'
  | 'contracts' | 'quality' | 'service' | 'projects'
  | 'integrations' | 'reports' | 'excel' | 'scale'
  | 'multi-store' | 'regional' | 'store-config'
  | 'campaigns' | 'roles' | 'loyalty' | 'gift-cards'
  | 'notifications' | 'multi-currency' | 'commission'
  | 'users' | 'whatsapp' | 'restaurant' | 'appointments'
  | 'bi-dashboard' | 'ecommerce' | 'cargo' | 'marketplace'
  | 'payment-integration' | 'accounting-integration'
  | 'central-broadcast' | 'enterprise-data' | 'module-management'
  | 'system-management' | 'store-transfer' | 'mobile-inventory'
  | 'inter-store-transfers' | 'advanced-reporting'
  | 'crm' | 'hr' | 'logistics' | 'price-management';

export interface ModuleConfig {
  id: ModuleId;
  translationKey: string;
  badge?: string | null;
  isActive: boolean;
  category: 'core' | 'finance' | 'operations' | 'analytics' | 'integrations' | 'settings' | 'advanced';
}

// Module yapılandırması - sadece metadata, UI render ManagementModule'de
export const modulesConfig: ModuleConfig[] = [
  // Core Modules
  { id: 'dashboard', translationKey: 'dashboard', badge: null, isActive: true, category: 'core' },
  { id: 'unlimitedDashboard', translationKey: 'centralDashboard', badge: 'NEW', isActive: true, category: 'core' },
  { id: 'profitDashboard', translationKey: 'profitLossReports', badge: null, isActive: true, category: 'core' },
  
  // Product & Stock
  { id: 'products', translationKey: 'productCards', badge: null, isActive: true, category: 'operations' },
  { id: 'stock', translationKey: 'stockManagement', badge: null, isActive: true, category: 'operations' },
  
  // Customer & Supplier
  { id: 'customers', translationKey: 'customerCards', badge: null, isActive: true, category: 'operations' },
  { id: 'suppliers', translationKey: 'supplierCards', badge: null, isActive: true, category: 'operations' },
  
  // Finance & Accounting
  { id: 'finance', translationKey: 'cashBank', badge: null, isActive: true, category: 'finance' },
  { id: 'accounting', translationKey: 'accountingVouchers', badge: null, isActive: true, category: 'finance' },
  { id: 'mizan', translationKey: 'mizan', badge: null, isActive: true, category: 'finance' },
  { id: 'income-statement', translationKey: 'incomeStatement', badge: null, isActive: true, category: 'finance' },
  { id: 'balance-sheet', translationKey: 'balanceSheet', badge: null, isActive: true, category: 'finance' },
  
  // Sales & Purchase
  { id: 'purchase', translationKey: 'purchaseOrders', badge: null, isActive: true, category: 'operations' },
  { id: 'sales-orders', translationKey: 'salesOrders', badge: null, isActive: true, category: 'operations' },
  { id: 'sales-invoices', translationKey: 'salesInvoices', badge: null, isActive: true, category: 'operations' },
  { id: 'purchase-invoices', translationKey: 'purchaseInvoices', badge: null, isActive: true, category: 'operations' },
  
  // Advanced Operations
  { id: 'etransform', translationKey: 'eInvoiceArchive', badge: null, isActive: true, category: 'operations' },
  { id: 'returns', translationKey: 'returnInvoices', badge: null, isActive: true, category: 'operations' },
  { id: 'production', translationKey: 'production', badge: null, isActive: true, category: 'operations' },
  { id: 'assets', translationKey: 'assetManagement', badge: null, isActive: false, category: 'operations' },
  { id: 'budget', translationKey: 'budgetCost', badge: null, isActive: true, category: 'finance' },
  { id: 'contracts', translationKey: 'contractManagement', badge: null, isActive: true, category: 'operations' },
  { id: 'quality', translationKey: 'qualityControl', badge: null, isActive: true, category: 'operations' },
  { id: 'service', translationKey: 'service', badge: null, isActive: true, category: 'operations' },
  { id: 'projects', translationKey: 'projectManagement', badge: null, isActive: true, category: 'operations' },
  
  // Integrations & Tools
  { id: 'integrations', translationKey: 'integrations', badge: null, isActive: true, category: 'integrations' },
  { id: 'reports', translationKey: 'analyticsReports', badge: null, isActive: true, category: 'analytics' },
  { id: 'excel', translationKey: 'export', badge: null, isActive: true, category: 'analytics' },
  { id: 'scale', translationKey: 'scaleManagement', badge: null, isActive: true, category: 'operations' },
  
  // Multi-Store
  { id: 'multi-store', translationKey: 'storeManagement', badge: null, isActive: true, category: 'advanced' },
  { id: 'regional', translationKey: 'regionalManagement', badge: null, isActive: true, category: 'advanced' },
  { id: 'store-config', translationKey: 'storeLevelConfig', badge: null, isActive: true, category: 'advanced' },
  
  // Marketing & Loyalty
  { id: 'campaigns', translationKey: 'campaigns', badge: null, isActive: true, category: 'operations' },
  { id: 'loyalty', translationKey: 'loyalty', badge: null, isActive: true, category: 'operations' },
  { id: 'gift-cards', translationKey: 'giftCard', badge: null, isActive: true, category: 'operations' },
  
  // System Settings
  { id: 'users', translationKey: 'userManagement', badge: null, isActive: true, category: 'settings' },
  { id: 'roles', translationKey: 'rolePermissions', badge: null, isActive: true, category: 'settings' },
  { id: 'multi-currency', translationKey: 'multiCurrency', badge: 'HOT', isActive: true, category: 'settings' },
  { id: 'notifications', translationKey: 'notifications', badge: null, isActive: true, category: 'settings' },
  { id: 'module-management', translationKey: 'moduleManagement', badge: null, isActive: true, category: 'settings' },
  { id: 'system-management', translationKey: 'systemSettings', badge: null, isActive: true, category: 'settings' },
  
  // Additional Features
  { id: 'commission', translationKey: 'commission', badge: null, isActive: true, category: 'finance' },
  { id: 'whatsapp', translationKey: 'whatsappIntegration', badge: null, isActive: true, category: 'integrations' },
  { id: 'restaurant', translationKey: 'restaurant', badge: null, isActive: true, category: 'operations' },
  { id: 'appointments', translationKey: 'appointment', badge: null, isActive: true, category: 'operations' },
  { id: 'bi-dashboard', translationKey: 'advancedBI', badge: 'BETA', isActive: true, category: 'analytics' },
  { id: 'ecommerce', translationKey: 'ecommerce', badge: null, isActive: true, category: 'integrations' },
  { id: 'cargo', translationKey: 'cargoIntegration', badge: null, isActive: true, category: 'integrations' },
  { id: 'marketplace', translationKey: 'marketplaces', badge: null, isActive: true, category: 'integrations' },
  { id: 'payment-integration', translationKey: 'paymentProviders', badge: null, isActive: true, category: 'integrations' },
  { id: 'accounting-integration', translationKey: 'accountingIntegration', badge: null, isActive: true, category: 'integrations' },
  
  // Enterprise Features
  { id: 'central-broadcast', translationKey: 'dataBroadcast', badge: 'PRO', isActive: true, category: 'advanced' },
  { id: 'enterprise-data', translationKey: 'enterpriseData', badge: 'PRO', isActive: true, category: 'advanced' },
  { id: 'store-transfer', translationKey: 'storeTransfer', badge: null, isActive: true, category: 'operations' },
  { id: 'mobile-inventory', translationKey: 'mobileInventoryCount', badge: null, isActive: true, category: 'operations' },
  { id: 'inter-store-transfers', translationKey: 'interStoreTransfers', badge: null, isActive: true, category: 'operations' },
  { id: 'advanced-reporting', translationKey: 'advancedReporting', badge: 'NEW', isActive: true, category: 'analytics' },
  
  // Additional modules
  { id: 'crm', translationKey: 'crmOpportunities', badge: null, isActive: true, category: 'operations' },
  { id: 'hr', translationKey: 'humanResources', badge: null, isActive: false, category: 'operations' },
  { id: 'logistics', translationKey: 'logisticsShipping', badge: null, isActive: false, category: 'operations' },
  { id: 'price-management', translationKey: 'priceLists', badge: null, isActive: true, category: 'operations' },
];

// Helper functions
export function getModuleById(id: ModuleId): ModuleConfig | undefined {
  return modulesConfig.find(m => m.id === id);
}

export function getModulesByCategory(category: ModuleConfig['category']): ModuleConfig[] {
  return modulesConfig.filter(m => m.category === category && m.isActive);
}

export function getActiveModules(): ModuleConfig[] {
  return modulesConfig.filter(m => m.isActive);
}

