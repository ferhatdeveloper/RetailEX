/**
 * Web `staticMenuConfig.ts` + ManagementModule (POS / WMS / Restoran / Güzellik)
 * ile aynı bilgi mimarisi — native ekran id’leri.
 */

export type MenuItem = {
  id: string;
  label: string;
  screen: string;
  badge?: string;
  children?: MenuItem[];
};

export type MenuSection = {
  id: string;
  title: string;
  items: MenuItem[];
};

/** Hızlı erişim — web DashboardModule kısayolları */
export const QUICK_ACCESS: { id: string; label: string; screen: string; gradient: [string, string] }[] = [
  { id: 'newsale', label: 'Satış (POS)', screen: 'pos', gradient: ['#3b82f6', '#2563eb'] },
  { id: 'products', label: 'Ürünler', screen: 'products', gradient: ['#4ade80', '#22c55e'] },
  { id: 'customers', label: 'Cariler', screen: 'suppliers', gradient: ['#c084fc', '#a855f7'] },
  { id: 'invoices', label: 'Faturalar', screen: 'salesinvoice', gradient: ['#ec4899', '#db2777'] },
  { id: 'reports', label: 'Raporlar', screen: 'customreports', gradient: ['#6366f1', '#4f46e5'] },
  { id: 'stock', label: 'Stok / WMS', screen: 'wms-hub', gradient: ['#16a34a', '#15803d'] },
];

export const MENU_SECTIONS: MenuSection[] = [
  {
    id: 'main-menu',
    title: 'Ana Menü',
    items: [
      { id: 'dashboard', label: 'Dashboard', screen: 'dashboard' },
      {
        id: 'store-mgmt',
        label: 'Mağaza Yönetimi',
        screen: 'store-management-group',
        badge: 'Yeni',
        children: [
          { id: 'store-panel', label: 'Mağaza Paneli', screen: 'store-management' },
          { id: 'hybrid-sync', label: 'Şube Veri Senkronu', screen: 'hybrid-sync' },
          { id: 'interstore', label: 'Mağaza Transferi', screen: 'interstore-transfer' },
          { id: 'multistore', label: 'Çoklu Mağaza Yönetimi', screen: 'multistore' },
          { id: 'regional', label: 'Bölgesel Bayilik Yönetimi', screen: 'regional' },
          { id: 'storeconfig', label: 'Mağaza Yapılandırması', screen: 'storeconfig' },
        ],
      },
      { id: 'databroadcast', label: 'Bilgi Gönder/Al', screen: 'databroadcast' },
      { id: 'integrations', label: 'Entegrasyonlar', screen: 'integrations' },
    ],
  },
  {
    id: 'retail-pos',
    title: 'Perakende / POS',
    items: [
      { id: 'pos', label: 'Satış (POS)', screen: 'pos' },
      { id: 'cashier-scale', label: 'Terazi & Tartılı Satış', screen: 'cashier-scale', badge: 'Yeni' },
      { id: 'scale-mgmt', label: 'Terazi Yönetimi (Rongta)', screen: 'scale-management' },
      { id: 'pricing', label: 'Fiyat & Kampanya', screen: 'pricing' },
    ],
  },
  {
    id: 'material-management',
    title: 'Malzeme Yönetimi',
    items: [
      {
        id: 'material-def',
        label: 'Ana Kayıtlar',
        screen: 'material-definitions',
        children: [
          { id: 'material-classes', label: 'Malzeme Sınıfları', screen: 'material-classes' },
          { id: 'products', label: 'Malzemeler', screen: 'products' },
          { id: 'unit-sets', label: 'Birim Setleri', screen: 'unit-sets' },
          { id: 'variants', label: 'Varyantlar', screen: 'variants' },
          { id: 'special-codes', label: 'Özel Kodlar', screen: 'special-codes' },
          { id: 'brands', label: 'Marka Tanımları', screen: 'brand-definitions' },
          { id: 'scale-def', label: 'Terazi Tanımları', screen: 'scale' },
          { id: 'group-codes', label: 'Grup Kodları', screen: 'group-codes' },
          { id: 'product-cats', label: 'Ürün Kategorileri', screen: 'product-categories' },
          { id: 'service-cards', label: 'Hizmet Kartları', screen: 'service-cards' },
        ],
      },
      {
        id: 'material-mov',
        label: 'Hareketler',
        screen: 'material-movements',
        children: [
          { id: 'stockmovements', label: 'Malzeme Yönetim Fişleri', screen: 'stockmovements' },
          { id: 'stok-devir', label: 'Stok Devir Fişi', screen: 'stok-devir' },
          { id: 'stock-price', label: 'Stok Fiyat Değişim Fişleri', screen: 'stock-price-change-slips' },
        ],
      },
      {
        id: 'inventory-count',
        label: 'Sayım İşlemleri',
        screen: 'inventory-count-ops',
        children: [
          { id: 'mobile-count', label: 'Mobil Sayım / Fiş Oluştur', screen: 'mobile-inventory-count' },
          { id: 'deficit', label: 'Sayım Eksiği Fişleri', screen: 'stockmovements-deficit' },
          { id: 'surplus', label: 'Sayım Fazlası Fişleri', screen: 'stockmovements-surplus' },
        ],
      },
      {
        id: 'material-reports',
        label: 'Raporlar',
        screen: 'material-reports',
        children: [
          { id: 'mat-extract', label: 'Malzeme Ekstresi', screen: 'report-material-extract' },
          { id: 'mat-value', label: 'Malzeme Değer', screen: 'report-material-value' },
          { id: 'inventory', label: 'Envanter', screen: 'inventory' },
          { id: 'purchase-expiry', label: 'Alış / SKT Raporu', screen: 'purchase-expiry-report' },
          { id: 'cost', label: 'Maliyet', screen: 'cost' },
          { id: 'in-out', label: 'Giriş Çıkış Toplamları', screen: 'report-in-out-totals' },
          { id: 'wh-status', label: 'Malzeme Ambar Durum', screen: 'report-warehouse-status' },
          { id: 'txn-break', label: 'Hareket Dökümü', screen: 'report-transaction-breakdown' },
          { id: 'slip-list', label: 'Fiş Listesi', screen: 'report-slip-list' },
          { id: 'min-max', label: 'Minimum Maksimum Stok', screen: 'report-min-max' },
        ],
      },
      { id: 'excel', label: 'Excel İşlemleri', screen: 'excel' },
      { id: 'smart-add', label: 'Akıllı malzeme ekleme', screen: 'smart-material-add' },
      { id: 'production', label: 'Üretim Reçeteleri', screen: 'production' },
      { id: 'butcher', label: 'Kasap Üretim', screen: 'butcher-production' },
    ],
  },
  {
    id: 'invoices',
    title: 'Faturalar',
    items: [
      {
        id: 'sales-inv',
        label: 'Satış Faturaları',
        screen: 'salesinvoice',
        children: [
          { id: 'sales-std', label: 'Toptan Satış Faturası', screen: 'sales-invoice-standard' },
          { id: 'sales-retail', label: 'Perakende Satış', screen: 'sales-invoice-retail' },
          { id: 'sales-wholesale', label: 'Toptan Satış', screen: 'sales-invoice-wholesale' },
          { id: 'sales-consign', label: 'Konsinye Satış', screen: 'sales-invoice-consignment' },
          { id: 'sales-return', label: 'Satış İade', screen: 'sales-invoice-return' },
        ],
      },
      {
        id: 'purchasing',
        label: 'Satın Alma',
        screen: 'purchaseinvoice',
        children: [
          { id: 'purchaserequest', label: 'Talep Fişleri', screen: 'purchaserequest' },
          { id: 'purchase', label: 'Satınalma Siparişleri', screen: 'purchase' },
          { id: 'purchase-std', label: 'Alış Faturası', screen: 'purchase-invoice-standard' },
          { id: 'purchase-return', label: 'Alış İade', screen: 'purchase-invoice-return' },
          { id: 'service-recv', label: 'Alınan Hizmet', screen: 'serviceinvoice-received' },
        ],
      },
      {
        id: 'service-inv',
        label: 'Hizmet Faturaları',
        screen: 'serviceinvoice',
        children: [
          { id: 'service-given', label: 'Verilen Hizmet Faturası', screen: 'serviceinvoice-given' },
          { id: 'service-recv2', label: 'Alınan Hizmet Faturası', screen: 'serviceinvoice-received' },
        ],
      },
      { id: 'etransform', label: 'E-Dönüşüm (GİB)', screen: 'etransform' },
      {
        id: 'document-scan',
        label: 'Belge Tara → Fatura',
        screen: 'document-scan',
        badge: 'Yeni',
      },
      {
        id: 'waybills',
        label: 'İrsaliyeler',
        screen: 'waybill',
        children: [
          { id: 'waybill-sales', label: 'Satış İrsaliyesi', screen: 'waybill-sales' },
          { id: 'waybill-purchase', label: 'Alış İrsaliyesi', screen: 'waybill-purchase' },
          { id: 'waybill-transfer', label: 'Depo Transfer İrsaliyesi', screen: 'waybill-transfer' },
          { id: 'waybill-fire', label: 'Fire İrsaliyesi', screen: 'waybill-fire' },
        ],
      },
      {
        id: 'orders',
        label: 'Siparişler',
        screen: 'Siparişler',
        children: [
          { id: 'salesorder', label: 'Satış Siparişi', screen: 'salesorder' },
          { id: 'purchase-ord', label: 'Satınalma Siparişleri', screen: 'purchase' },
        ],
      },
      { id: 'offers', label: 'Teklifler', screen: 'Teklifler' },
    ],
  },
  {
    id: 'delivery-management',
    title: 'Teslimat Yönetimi',
    items: [
      { id: 'logistics', label: 'Teslimatlar', screen: 'logistics' },
      { id: 'delivery-live', label: 'Canlı Konum', screen: 'delivery-live' },
      { id: 'couriers', label: 'Kurye Listesi', screen: 'couriers' },
    ],
  },
  {
    id: 'finance-management',
    title: 'Finans Yönetimi',
    items: [
      {
        id: 'finance-def',
        label: 'Tanımlar',
        screen: 'finance-definitions',
        children: [
          { id: 'payment-plans', label: 'Ödeme Planları', screen: 'payment-plans' },
          { id: 'cost-centers', label: 'Masraf Merkezleri', screen: 'cost-centers' },
        ],
      },
      {
        id: 'finance-cards',
        label: 'Kartlar',
        screen: 'finance-cards',
        children: [
          { id: 'suppliers', label: 'Cari Hesaplar', screen: 'suppliers' },
          { id: 'call-plan', label: 'Müşteri Arama Planı', screen: 'customer-call-plan' },
          { id: 'cashbank', label: 'Kasa Kartları', screen: 'cashbank' },
        ],
      },
      {
        id: 'finance-mov',
        label: 'Hareketler',
        screen: 'finance-movements',
        children: [
          { id: 'cari-devir', label: 'Cari Devir Fişi', screen: 'cari-devir' },
          { id: 'kasalar', label: 'Kasa İşlemleri', screen: 'kasalar' },
          { id: 'cash-slips', label: 'Kasa Fişleri', screen: 'cash-slips' },
          { id: 'virman', label: 'Kasa Virman', screen: 'virman' },
          { id: 'bank-virman', label: 'Banka Virman', screen: 'bank-virman' },
          { id: 'bank-havale', label: 'Banka Havale', screen: 'bank-havale' },
        ],
      },
      {
        id: 'finance-reports',
        label: 'Raporlar',
        screen: 'finance-reports',
        children: [
          { id: 'financereports', label: 'Cari Hesap Raporları', screen: 'financereports' },
          { id: 'cash-reports', label: 'Kasa Raporları', screen: 'financereports-cash' },
          { id: 'bank-reports', label: 'Banka Raporları', screen: 'financereports-bank' },
          { id: 'customer-extract', label: 'Cari Ekstre', screen: 'customer-extract' },
          { id: 'mizan', label: 'Cari Bakiye Özeti', screen: 'mizan' },
          { id: 'aging', label: 'Cari Yaşlandırma', screen: 'aging' },
        ],
      },
      {
        id: 'finance-other',
        label: 'Diğer',
        screen: 'finance-other',
        children: [
          { id: 'revenueexpense', label: 'Gider Yönetimi', screen: 'revenueexpense' },
          { id: 'multicurrency', label: 'Çoklu Para Birimi', screen: 'multicurrency' },
        ],
      },
    ],
  },
  {
    id: 'wms',
    title: 'WMS / Depo',
    items: [
      { id: 'wms-hub', label: 'WMS Ana Panel', screen: 'wms-hub' },
      { id: 'stockcounting', label: 'Stok Sayım', screen: 'stockcounting' },
      { id: 'wave-picking', label: 'Dalga Toplama', screen: 'wave-picking' },
      { id: 'mobile-inv', label: 'Mobil Sayım', screen: 'mobile-inventory-count' },
    ],
  },
  {
    id: 'restaurant',
    title: 'Restoran',
    items: [
      { id: 'restaurant', label: 'Restoran Ana Ekran', screen: 'restaurant' },
      { id: 'rest-tables', label: 'Masalar', screen: 'restaurant-tables' },
      { id: 'rest-orders', label: 'Açık Adisyonlar', screen: 'restaurant-orders' },
      { id: 'rest-schedule', label: 'Bugünkü Akış', screen: 'restaurant-schedule' },
      { id: 'rest-kitchen', label: 'Mutfak Ekranı', screen: 'restaurant-kitchen' },
    ],
  },
  {
    id: 'beauty',
    title: 'Güzellik Merkezi',
    items: [
      { id: 'beauty', label: 'Güzellik Ana Ekran', screen: 'beauty' },
      { id: 'appointment', label: 'Randevular', screen: 'appointment' },
      { id: 'beauty-services', label: 'Hizmetler', screen: 'beauty-services' },
      { id: 'beauty-specialists', label: 'Uzmanlar', screen: 'beauty-specialists' },
      { id: 'beauty-sales', label: 'Güzellik Satış POS', screen: 'beauty-sales' },
    ],
  },
  {
    id: 'communication-notifications',
    title: 'İletişim & Bildirimler',
    items: [
      { id: 'whatsapp', label: 'WhatsApp Entegrasyonu', screen: 'whatsapp' },
      { id: 'mesaj', label: 'Mesaj / Bildirim', screen: 'mesaj-bildirim' },
      { id: 'notifications', label: 'Bildirim Merkezi', screen: 'notifications' },
      { id: 'sms', label: 'SMS Yönetimi', screen: 'smsmanage' },
      { id: 'email', label: 'E-posta Kampanyaları', screen: 'emailcamp' },
    ],
  },
  {
    id: 'reports-analysis',
    title: 'Raporlar & Analiz',
    items: [
      {
        id: 'analytics',
        label: 'Dashboard',
        screen: 'analytics-dashboard-group',
        children: [
          { id: 'product-analytics', label: 'AI Ürün Analitiği', screen: 'product-analytics', badge: 'AI' },
          { id: 'profit-dashboard', label: 'Karlılık Analizi', screen: 'profit-dashboard' },
          { id: 'bi-dashboard', label: 'BI Dashboard & AI', screen: 'bi-dashboard' },
        ],
      },
      { id: 'customreports', label: 'Genel Rapor', screen: 'customreports' },
      { id: 'cat-profit', label: 'Kategori grubu satış ve kar', screen: 'category-group-profit-report' },
      { id: 'report-sales-summary', label: 'Günlük Satış Özeti', screen: 'report-sales-summary' },
      { id: 'report-critical-stock', label: 'Kritik Stok Raporu', screen: 'report-critical-stock' },
      { id: 'financereports', label: 'Cari Hesap Raporları', screen: 'financereports' },
      { id: 'customer-extract', label: 'Cari Ekstre', screen: 'customer-extract' },
      { id: 'mizan', label: 'Cari Bakiye Özeti', screen: 'mizan' },
      { id: 'aging', label: 'Cari Yaşlandırma', screen: 'aging' },
    ],
  },
  {
    id: 'system-management',
    title: 'Sistem Yönetimi',
    items: [
      { id: 'firm-period', label: 'Firma/Dönem Tanımları', screen: 'firm-period-definitions' },
      { id: 'usermanagement', label: 'Kullanıcı Yönetimi', screen: 'usermanagement' },
      { id: 'invoice-label', label: 'Fatura Etiket Tasarımı', screen: 'invoice-label-designer' },
      { id: 'roleauth', label: 'Rol & Yetkilendirme', screen: 'roleauth' },
      { id: 'menumanagement', label: 'Menü Yönetimi', screen: 'menumanagement' },
      { id: 'virtual-pbx', label: 'Sanal santral (Caller ID)', screen: 'virtual-pbx-caller-id' },
      { id: 'pendingpos', label: 'Kasa Cihazları', screen: 'pendingposdevices' },
      { id: 'supabase-mig', label: 'Supabase Veri Aktarımı', screen: 'supabase-migration' },
      { id: 'backup', label: 'Yedekleme', screen: 'backuprestore' },
      { id: 'logaudit', label: 'Log/Denetim', screen: 'logaudit' },
    ],
  },
];

/** Canlı (API bağlı) native route eşlemesi */
export type LiveRoute =
  | 'Products'
  | 'Customers'
  | 'Invoices'
  | 'POS'
  | 'Reports'
  | 'ReportSales'
  | 'ReportStock'
  | 'StockMovements'
  | 'ReportMizan'
  | 'ReportAging'
  | 'ReportCariExtract'
  | 'ReportProductSales'
  | 'ReportCash'
  | 'Beauty'
  | 'Wms'
  | 'WmsCount'
  | 'WmsTransfer'
  | 'WmsWavePicking'
  | 'Restaurant'
  | 'Delivery'
  | 'Finance'
  | 'FinanceDefinitions'
  | 'MaterialDefinitions'
  | 'ProductionOps'
  | 'MultiCurrency'
  | 'ExcelOps'
  | 'SystemExtras'
  | 'CashCollection'
  | 'CariDevir'
  | 'Organization'
  | 'System'
  | 'Pricing'
  | 'Campaigns'
  | 'Communications'
  | 'Notifications'
  | 'PrinterSettings'
  | 'ScaleManagement'
  | 'ScaleSale'
  | 'StoreManagement'
  | 'ETransform'
  | 'DocumentScan'
  | 'MaterialLabelScan'
  | 'Module';

const LIVE_MAP: Record<string, LiveRoute> = {
  'firm-period-definitions': 'Organization',
  organization: 'Organization',
  'change-organization': 'Organization',
  'store-management': 'StoreManagement',
  multistore: 'StoreManagement',
  regional: 'StoreManagement',
  storeconfig: 'Organization',
  'hybrid-sync': 'System',
  databroadcast: 'Communications',
  integrations: 'Communications',
  etransform: 'ETransform',
  'document-scan': 'DocumentScan',
  usermanagement: 'System',
  roleauth: 'System',
  menumanagement: 'System',
  logaudit: 'System',
  pendingposdevices: 'System',
  'printer-settings': 'PrinterSettings',
  backuprestore: 'System',
  'supabase-migration': 'System',
  products: 'Products',
  materials: 'Products',
  'material-definitions': 'Products',
  'material-classes': 'MaterialDefinitions',
  'unit-sets': 'MaterialDefinitions',
  'brand-definitions': 'MaterialDefinitions',
  'product-categories': 'MaterialDefinitions',
  variants: 'MaterialDefinitions',
  'special-codes': 'MaterialDefinitions',
  'group-codes': 'MaterialDefinitions',
  production: 'ProductionOps',
  'butcher-production': 'ProductionOps',
  multicurrency: 'MultiCurrency',
  excel: 'ExcelOps',
  'smart-material-add': 'MaterialLabelScan',
  'invoice-label-designer': 'SystemExtras',
  'virtual-pbx-caller-id': 'SystemExtras',
  'service-cards': 'Products',
  suppliers: 'Customers',
  customers: 'Customers',
  'finance-cards': 'Customers',
  'payment-plans': 'FinanceDefinitions',
  'cost-centers': 'FinanceDefinitions',
  'customer-call-plan': 'FinanceDefinitions',
  revenueexpense: 'FinanceDefinitions',
  'finance-definitions': 'FinanceDefinitions',
  'finance-other': 'FinanceDefinitions',
  'cari-devir': 'CariDevir',
  cashbank: 'Finance',
  kasalar: 'Finance',
  'cash-slips': 'Finance',
  virman: 'Finance',
  'bank-virman': 'Finance',
  'bank-havale': 'Finance',
  havale: 'Finance',
  collectionpayment: 'CashCollection',
  finance: 'CashCollection',
  banks: 'Finance',
  'bank-accounts': 'Finance',
  'bank-vouchers': 'Finance',
  'customer-extract': 'ReportCariExtract',
  salesinvoice: 'Invoices',
  'sales-invoice-standard': 'Invoices',
  'sales-invoice-retail': 'Invoices',
  'sales-invoice-wholesale': 'Invoices',
  'sales-invoice-consignment': 'Invoices',
  'sales-invoice-return': 'Invoices',
  purchaseinvoice: 'Invoices',
  'purchase-invoice-standard': 'Invoices',
  'purchase-invoice-return': 'Invoices',
  serviceinvoice: 'Invoices',
  'serviceinvoice-given': 'Invoices',
  'serviceinvoice-received': 'Invoices',
  salesorder: 'Invoices',
  purchase: 'Invoices',
  purchaserequest: 'Invoices',
  Teklifler: 'Invoices',
  'waybill-sales': 'Invoices',
  'waybill-purchase': 'Invoices',
  'waybill-fire': 'Invoices',
  pos: 'POS',
  newsale: 'POS',
  'cashier-scale': 'ScaleSale',
  'scale-management': 'ScaleManagement',
  scale: 'ScaleManagement',
  pricing: 'Pricing',
  pricelists: 'Pricing',
  promotions: 'Pricing',
  campaigns_mgmt: 'Campaigns',
  customreports: 'Reports',
  'report-sales-summary': 'ReportSales',
  'product-analytics': 'ReportProductSales',
  'profit-dashboard': 'ReportProductSales',
  'bi-dashboard': 'ReportSales',
  'category-group-profit-report': 'ReportProductSales',
  // web: financereports → ReportsModule (hub); mizan = cari bakiye özeti (GL değil)
  financereports: 'Reports',
  'financereports-cash': 'ReportCash',
  'financereports-bank': 'Finance',
  mizan: 'ReportMizan',
  aging: 'ReportAging',
  'cari-aging': 'ReportAging',
  yaslandirma: 'ReportAging',
  'report-in-out-totals': 'ReportStock',
  'report-slip-list': 'ReportStock',
  'report-critical-stock': 'ReportStock',
  inventory: 'ReportStock',
  'report-min-max': 'ReportStock',
  'report-material-value': 'ReportStock',
  'report-warehouse-status': 'ReportStock',
  'report-material-extract': 'ReportStock',
  'report-transaction-breakdown': 'ReportStock',
  'purchase-expiry-report': 'ReportStock',
  cost: 'ReportStock',
  'material-reports': 'ReportStock',
  beauty: 'Beauty',
  appointment: 'Beauty',
  'beauty-services': 'Beauty',
  'beauty-specialists': 'Beauty',
  'beauty-sales': 'Beauty',
  'wms-hub': 'Wms',
  stockcounting: 'WmsCount',
  'wave-picking': 'WmsWavePicking',
  'mobile-inventory-count': 'WmsCount',
  'interstore-transfer': 'WmsTransfer',
  'waybill-transfer': 'WmsTransfer',
  stockmovements: 'StockMovements',
  'stockmovements-deficit': 'StockMovements',
  'stockmovements-surplus': 'StockMovements',
  'stok-devir': 'StockMovements',
  'stock-price-change-slips': 'StockMovements',
  restaurant: 'Restaurant',
  'restaurant-tables': 'Restaurant',
  'restaurant-orders': 'Restaurant',
  'restaurant-schedule': 'Restaurant',
  logistics: 'Delivery',
  'delivery-live': 'Delivery',
  couriers: 'Delivery',
  'delivery-management': 'Delivery',
  notifications: 'Notifications',
  whatsapp: 'Communications',
  'mesaj-bildirim': 'Communications',
  smsmanage: 'Communications',
  emailcamp: 'Communications',
};

export function resolveLiveRoute(screen: string): LiveRoute {
  return LIVE_MAP[screen] ?? 'Module';
}

export function findMenuItem(screen: string): MenuItem | undefined {
  const walk = (items: MenuItem[]): MenuItem | undefined => {
    for (const it of items) {
      if (it.screen === screen) return it;
      if (it.children) {
        const c = walk(it.children);
        if (c) return c;
      }
    }
    return undefined;
  };
  for (const sec of MENU_SECTIONS) {
    const found = walk(sec.items);
    if (found) return found;
  }
  return undefined;
}

/** Yaprak + grup öğe sayısı (dashboard sayacı) */
export function countMenuItems(): { sections: number; items: number; leaves: number } {
  let items = 0;
  let leaves = 0;
  const walk = (list: MenuItem[]) => {
    for (const it of list) {
      items += 1;
      if (it.children?.length) walk(it.children);
      else leaves += 1;
    }
  };
  for (const s of MENU_SECTIONS) walk(s.items);
  return { sections: MENU_SECTIONS.length, items, leaves };
}
