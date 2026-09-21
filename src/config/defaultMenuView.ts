/**
 * Fabrika varsayılan menü görünümü (RetailEX «guzel» profili).
 * Tüm firmalarda başlangıç: sade görünüm; istenirse gizli modüller açılır.
 */

export const FACTORY_MENU_PRESET_ID = 'retailex-factory-default';

export const FACTORY_MENU_PRESET_NAME = 'Varsayılan';

/** Başlangıçta gizli tutulan screen_id / bölüm kimlikleri */
export const DEFAULT_MENU_HIDDEN_MODULES: readonly string[] = [
  'databroadcast',
  'integrations',
  'human-resources',
  'hr',
  'attendance',
  'payroll',
  'performance',
  'production-recipe',
  'butcher-production',
  'material-classes',
  'unit-sets',
  'variants',
  'special-codes',
  'brand-definitions',
  'scale',
  'group-codes',
  'product-categories',
  'smart-material-add',
  'purchaserequest',
  'purchase',
  'sales-invoice-standard',
  'sales-invoice-wholesale',
  'sales-invoice-consignment',
  'etransform',
  'waybill',
  'Siparişler',
  'Teklifler',
  'delivery-management',
  'logistics',
  'delivery-live',
  'couriers',
  'retail',
  'pricing',
  'cashier-scale',
  'scale-management',
  'notifications',
  'smsmanage',
  'emailcamp',
  'print-options',
  'pendingposdevices',
  'supabase-migration',
  'logaudit',
  // Finans → Tanımlar: varsayılan kapalı; Menü Yönetimi’nden açılır
  'payment-plans',
  'cost-centers',
] as const;

/**
 * Eski DB/localStorage preset’lerine bir kerelik eklenen gizlemeler.
 * `MENU_HIDDEN_UPGRADE_VERSION` artınca sync tüm preset’lere yeni maddeleri ekler;
 * sonra Menü Yönetimi’nden tekrar açılabilir (sürekli zorlama yok).
 */
export const MENU_HIDDEN_UPGRADE_VERSION = 1;

export const MENU_HIDDEN_UPGRADE_ADDITIONS: Readonly<Record<number, readonly string[]>> = {
  1: ['payment-plans', 'cost-centers'],
};

/** `fromVersion` (hariç) → `toVersion` (dahil) arası eklenen screen_id’ler */
export function hiddenModulesForUpgradeVersion(fromVersion: number, toVersion: number): string[] {
  const from = Number.isFinite(fromVersion) ? Math.max(0, Math.floor(fromVersion)) : 0;
  const to = Number.isFinite(toVersion) ? Math.max(0, Math.floor(toVersion)) : 0;
  if (to <= from) return [];
  const out: string[] = [];
  for (let v = from + 1; v <= to; v++) {
    const add = MENU_HIDDEN_UPGRADE_ADDITIONS[v];
    if (add?.length) out.push(...add);
  }
  return out;
}

/** Statik menü sıra (screen_id → display_order) */
export const DEFAULT_MENU_ITEM_ORDERS: Readonly<Record<string, number>> = {
  hr: 12,
  cost: 38,
  excel: 44,
  mizan: 82,
  scale: 26,
  retail: 97,
  kasalar: 92,
  payroll: 14,
  pricing: 98,
  waybill: 63,
  cashbank: 89,
  couriers: 75,
  invoices: 46,
  logaudit: 127,
  products: 21,
  purchase: 70,
  regional: 7,
  roleauth: 121,
  variants: 23,
  whatsapp: 102,
  Teklifler: 71,
  dashboard: 1,
  emailcamp: 106,
  inventory: 36,
  logistics: 73,
  'main-menu': 0,
  smsmanage: 105,
  suppliers: 87,
  'unit-sets': 22,
  attendance: 13,
  'cari-devir': 91,
  'cash-slips': 93,
  etransform: 62,
  multistore: 6,
  salesorder: 69,
  Siparişler: 68,
  'group-codes': 27,
  'hybrid-sync': 4,
  performance: 15,
  storeconfig: 8,
  'bi-dashboard': 112,
  'cost-centers': 85,
  integrations: 10,
  salesinvoice: 53,
  'waybill-fire': 67,
  backuprestore: 126,
  'cashier-scale': 99,
  customreports: 113,
  databroadcast: 9,
  'delivery-live': 74,
  'finance-cards': 86,
  'finance-other': 94,
  multicurrency: 96,
  notifications: 104,
  'payment-plans': 84,
  'print-options': 117,
  'service-cards': 29,
  'special-codes': 24,
  'waybill-sales': 64,
  financereports: 80,
  menumanagement: 122,
  'mesaj-bildirim': 103,
  'report-min-max': 43,
  revenueexpense: 95,
  serviceinvoice: 59,
  stockmovements: 31,
  usermanagement: 119,
  'finance-reports': 77,
  generalsettings: 116,
  'human-resources': 11,
  purchaseinvoice: 47,
  purchaserequest: 48,
  'customer-extract': 81,
  'material-classes': 20,
  'material-reports': 33,
  'profit-dashboard': 111,
  'report-slip-list': 42,
  'reports-analysis': 107,
  'scale-management': 100,
  'store-management': 3,
  'waybill-purchase': 65,
  'waybill-transfer': 66,
  'brand-definitions': 25,
  'finance-movements': 90,
  pendingposdevices: 124,
  'product-analytics': 110,
  'production-recipe': 17,
  'system-management': 115,
  'butcher-production': 18,
  'customer-call-plan': 88,
  'finance-management': 76,
  'material-movements': 30,
  'product-categories': 28,
  'smart-material-add': 45,
  'supabase-migration': 125,
  'delivery-management': 72,
  'finance-definitions': 83,
  'interstore-transfer': 5,
  'material-management': 16,
  'material-definitions': 19,
  'report-in-out-totals': 39,
  'sales-invoice-retail': 55,
  'sales-invoice-return': 58,
  'serviceinvoice-given': 60,
  'report-material-value': 35,
  'virtual-pbx-caller-id': 123,
  'grafana-report-builder': 108,
  'invoice-label-designer': 120,
  'purchase-expiry-report': 37,
  'sales-invoice-standard': 54,
  'store-management-group': 2,
  'firm-period-definitions': 118,
  'purchase-invoice-return': 50,
  'report-material-extract': 34,
  'report-warehouse-status': 40,
  'sales-invoice-wholesale': 56,
  'serviceinvoice-received': 61,
  'stock-price-change-slips': 32,
  'analytics-dashboard-group': 109,
  'purchase-invoice-standard': 49,
  'sales-invoice-consignment': 57,
  'communication-notifications': 101,
  'category-group-profit-report': 114,
  'report-transaction-breakdown': 41,
};

export function buildFactoryMenuPreferences(): {
  hidden_modules: string[];
  item_orders: Record<string, number>;
} {
  return {
    hidden_modules: [...DEFAULT_MENU_HIDDEN_MODULES],
    item_orders: { ...DEFAULT_MENU_ITEM_ORDERS },
  };
}
