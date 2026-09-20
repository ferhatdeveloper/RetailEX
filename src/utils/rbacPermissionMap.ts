/**
 * Menü screen_id ↔ RBAC katalog modül id eşlemesi.
 * ManagementModule `hasPermission(item.id, 'READ')` kullanır; RoleForm ise
 * katalog id’leri kaydeder. Bu tablo iki tarafı birleştirir.
 */

/** İstenen modül için kontrol edilecek tüm aday id’ler (kendisi dahil). */
export function expandRbacModuleIds(moduleId: string): string[] {
  const id = String(moduleId || '').trim();
  if (!id) return [];

  const map: Record<string, string[]> = {
    // Faturalar
    invoices: ['invoices', 'salesinvoice', 'purchaseinvoice', 'serviceinvoice'],
    salesinvoice: ['salesinvoice', 'invoices'],
    purchaseinvoice: ['purchaseinvoice', 'invoices', 'purchase'],
    serviceinvoice: ['serviceinvoice', 'invoices'],
    salesreturn: ['salesreturn', 'sales-returns', 'invoices'],
    purchasereturn: ['purchasereturn', 'sales-returns', 'invoices'],
    'sales-returns': ['sales-returns', 'salesreturn', 'purchasereturn'],
    // Sipariş / teklif / irsaliye
    salesorder: ['salesorder', 'invoices'],
    purchaseorder: ['purchaseorder', 'purchase', 'invoices'],
    salesquote: ['salesquote', 'invoices'],
    waybill: ['waybill', 'invoices'],
    // Finans
    'finance.cash': ['finance.cash', 'kasalar', 'cash'],
    kasalar: ['kasalar', 'finance.cash'],
    cash: ['cash', 'finance.cash', 'kasalar'],
    'finance.bank': ['finance.bank', 'banks', 'bank'],
    banks: ['banks', 'finance.bank'],
    bank: ['bank', 'finance.bank', 'banks'],
    // Stok / WMS
    stock: ['stock', 'stockmovements', 'materials'],
    stockmovements: ['stockmovements', 'stock'],
    'store-transfer': ['store-transfer', 'warehousetransfer', 'material-transfers'],
    warehousetransfer: ['warehousetransfer', 'store-transfer'],
    'inventory-check': ['inventory-check', 'stockcount', 'stockcount_store'],
    stockcount: ['stockcount', 'inventory-check'],
    'warehouse-definitions': ['warehouse-definitions', 'stock'],
    // Cari
    suppliers: ['suppliers', 'suppliers_def', 'cari-yonetimi'],
    suppliers_def: ['suppliers_def', 'suppliers'],
    'cari-yonetimi': ['cari-yonetimi', 'suppliers', 'customers'],
    customers: ['customers', 'cari-yonetimi'],
    // Rapor / sistem
    reports: ['reports', 'reports.advanced'],
    'reports.advanced': ['reports.advanced', 'reports'],
    'users.roles': ['users.roles', 'users', 'roles'],
    users: ['users', 'users.roles'],
    'settings.system': ['settings.system', 'settings', 'system'],
  };

  const extras = map[id] || [id];
  return Array.from(new Set([id, ...extras]));
}

/** Üst modülün alt granüler yetkiyi kapsayıp kapsamadığı (pos → pos.discount). */
export function isRbacParentModule(parent: string, child: string): boolean {
  const p = String(parent || '').trim();
  const c = String(child || '').trim();
  if (!p || !c || p === c) return false;
  return c.startsWith(`${p}.`);
}

/** POS özel aksiyonları — EXECUTE’a ezilmeden ayrı modül olarak tutulur. */
export const RBAC_POS_GRANULAR_ACTIONS = new Set([
  'discount',
  'refund',
  'cancel_sale',
  'change_price',
  'open_drawer',
  'void',
]);
