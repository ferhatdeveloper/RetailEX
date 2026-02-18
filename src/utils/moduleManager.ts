import { LucideIcon } from 'lucide-react';

export interface ModuleDefinition {
  id: string;
  name: string;
  nameEn: string;
  nameAr: string;
  category: ModuleCategory;
  icon: string; // Icon name as string
  description: string;
  descriptionEn: string;
  descriptionAr: string;
  isCore?: boolean; // Core modules cannot be disabled
  isEnabled: boolean;
  route?: string;
  badge?: string;
  isPremium?: boolean;
}

export type ModuleCategory = 
  | 'pos' // POS & Satış
  | 'inventory' // Stok & Envanter
  | 'finance' // Finans & Muhasebe
  | 'crm' // CRM & Müşteri İlişkileri
  | 'hr' // İnsan Kaynakları
  | 'reporting' // Raporlama & BI
  | 'ecommerce' // E-Ticaret
  | 'system' // Sistem Yönetimi
  | 'logistics' // Lojistik & Tedarik
  | 'production' // Üretim & İmalat
  | 'restaurant' // Restoran & Cafe
  | 'other'; // Diğer

// 100+ Professional Module Definitions
export const ALL_MODULES: ModuleDefinition[] = [
  // === POS & SATIŞ MODÜLLERI ===
  {
    id: 'market-pos',
    name: 'Market POS',
    nameEn: 'Market POS',
    nameAr: 'نقاط البيع للسوق',
    category: 'pos',
    icon: 'ShoppingCart',
    description: 'Tam özellikli market satış noktası',
    descriptionEn: 'Full-featured market point of sale',
    descriptionAr: 'نقطة بيع السوق كامل المميزات',
    isCore: true,
    isEnabled: true,
    route: '/pos'
  },
  {
    id: 'restaurant-pos',
    name: 'Restoran POS',
    nameEn: 'Restaurant POS',
    nameAr: 'نقاط البيع للمطعم',
    category: 'restaurant',
    icon: 'Utensils',
    description: 'Restoran ve cafe satış sistemi',
    descriptionEn: 'Restaurant and cafe sales system',
    descriptionAr: 'نظام مبيعات المطاعم والمقاهي',
    isEnabled: false,
    route: '/restaurant'
  },
  {
    id: 'quick-sale',
    name: 'Hızlı Satış',
    nameEn: 'Quick Sale',
    nameAr: 'بيع سريع',
    category: 'pos',
    icon: 'Zap',
    description: 'Hızlı satış terminali',
    descriptionEn: 'Quick sale terminal',
    descriptionAr: 'محطة البيع السريع',
    isEnabled: true
  },
  {
    id: 'barcode-scanner',
    name: 'Barkod Okuyucu',
    nameEn: 'Barcode Scanner',
    nameAr: 'قارئ الباركود',
    category: 'pos',
    icon: 'Scan',
    description: 'Barkod okuma ve etiketleme',
    descriptionEn: 'Barcode scanning and labeling',
    descriptionAr: 'مسح ووضع العلامات الباركود',
    isEnabled: true
  },
  {
    id: 'mobile-pos',
    name: 'Mobil POS',
    nameEn: 'Mobile POS',
    nameAr: 'نقاط البيع المتنقلة',
    category: 'pos',
    icon: 'Smartphone',
    description: 'Mobil satış terminali',
    descriptionEn: 'Mobile sales terminal',
    descriptionAr: 'محطة المبيعات المحمولة',
    isEnabled: false
  },

  // === STOK & ENVANTER ===
  {
    id: 'inventory',
    name: 'Stok Yönetimi',
    nameEn: 'Inventory Management',
    nameAr: 'إدارة المخزون',
    category: 'inventory',
    icon: 'Package',
    description: 'Kapsamlı stok ve envanter yönetimi',
    descriptionEn: 'Comprehensive stock and inventory management',
    descriptionAr: 'إدارة المخزون والمخزون الشاملة',
    isCore: true,
    isEnabled: true
  },
  {
    id: 'stock-counting',
    name: 'Sayım Yönetimi',
    nameEn: 'Stock Counting',
    nameAr: 'عد المخزون',
    category: 'inventory',
    icon: 'ClipboardList',
    description: 'Stok sayım ve kontrol',
    descriptionEn: 'Stock counting and control',
    descriptionAr: 'عد ومراقبة المخزون',
    isEnabled: true
  },
  {
    id: 'stock-transfer',
    name: 'Stok Transfer',
    nameEn: 'Stock Transfer',
    nameAr: 'نقل المخزون',
    category: 'inventory',
    icon: 'ArrowRightLeft',
    description: 'Depolar arası stok transferi',
    descriptionEn: 'Inter-warehouse stock transfer',
    descriptionAr: 'نقل المخزون بين المستودعات',
    isEnabled: true
  },
  {
    id: 'lot-tracking',
    name: 'Lot/Seri Takibi',
    nameEn: 'Lot/Serial Tracking',
    nameAr: 'تتبع الدفعة/السلسلة',
    category: 'inventory',
    icon: 'Hash',
    description: 'Lot ve seri numarası takibi',
    descriptionEn: 'Lot and serial number tracking',
    descriptionAr: 'تتبع رقم الدفعة والسلسلة',
    isEnabled: false
  },
  {
    id: 'expiry-management',
    name: 'SKT Yönetimi',
    nameEn: 'Expiry Management',
    nameAr: 'إدارة انتهاء الصلاحية',
    category: 'inventory',
    icon: 'Calendar',
    description: 'Son kullanma tarihi takibi',
    descriptionEn: 'Expiry date tracking',
    descriptionAr: 'تتبع تاريخ انتهاء الصلاحية',
    isEnabled: true
  },

  // === FİNANS & MUHASEBE ===
  {
    id: 'accounting',
    name: 'Muhasebe',
    nameEn: 'Accounting',
    nameAr: 'المحاسبة',
    category: 'finance',
    icon: 'Calculator',
    description: 'Genel muhasebe sistemi',
    descriptionEn: 'General accounting system',
    descriptionAr: 'نظام المحاسبة العامة',
    isEnabled: true
  },
  {
    id: 'cashier',
    name: 'Kasa Yönetimi',
    nameEn: 'Cash Management',
    nameAr: 'إدارة النقد',
    category: 'finance',
    icon: 'Wallet',
    description: 'Kasa ve nakit yönetimi',
    descriptionEn: 'Cash and safe management',
    descriptionAr: 'إدارة النقد والخزائن',
    isCore: true,
    isEnabled: true
  },
  {
    id: 'invoicing',
    name: 'Faturalama',
    nameEn: 'Invoicing',
    nameAr: 'الفوترة',
    category: 'finance',
    icon: 'FileText',
    description: 'Fatura oluşturma ve yönetimi',
    descriptionEn: 'Invoice creation and management',
    descriptionAr: 'إنشاء وإدارة الفواتير',
    isEnabled: true
  },
  {
    id: 'e-invoice',
    name: 'E-Fatura',
    nameEn: 'E-Invoice',
    nameAr: 'الفاتورة الإلكترونية',
    category: 'finance',
    icon: 'Receipt',
    description: 'Elektronik fatura entegrasyonu',
    descriptionEn: 'Electronic invoice integration',
    descriptionAr: 'تكامل الفاتورة الإلكترونية',
    isEnabled: false,
    isPremium: true
  },
  {
    id: 'payments',
    name: 'Ödeme Yönetimi',
    nameEn: 'Payment Management',
    nameAr: 'إدارة المدفوعات',
    category: 'finance',
    icon: 'CreditCard',
    description: 'Ödeme takibi ve yönetimi',
    descriptionEn: 'Payment tracking and management',
    descriptionAr: 'تتبع وإدارة المدفوعات',
    isEnabled: true
  },
  {
    id: 'bank-integration',
    name: 'Banka Entegrasyonu',
    nameEn: 'Bank Integration',
    nameAr: 'تكامل البنك',
    category: 'finance',
    icon: 'Building',
    description: 'Banka hesap takibi',
    descriptionEn: 'Bank account tracking',
    descriptionAr: 'تتبع الحساب المصرفي',
    isEnabled: false
  },
  {
    id: 'currency',
    name: 'Döviz Yönetimi',
    nameEn: 'Currency Management',
    nameAr: 'إدارة العملات',
    category: 'finance',
    icon: 'DollarSign',
    description: 'Çoklu para birimi desteği',
    descriptionEn: 'Multi-currency support',
    descriptionAr: 'دعم متعدد العملات',
    isEnabled: true
  },
  {
    id: 'budget',
    name: 'Bütçe Yönetimi',
    nameEn: 'Budget Management',
    nameAr: 'إدارة الميزانية',
    category: 'finance',
    icon: 'PiggyBank',
    description: 'Bütçe planlama ve takibi',
    descriptionEn: 'Budget planning and tracking',
    descriptionAr: 'تخطيط وتتبع الميزانية',
    isEnabled: false
  },

  // === CRM & MÜŞTERİ İLİŞKİLERİ ===
  {
    id: 'customers',
    name: 'Müşteri Yönetimi',
    nameEn: 'Customer Management',
    nameAr: 'إدارة العملاء',
    category: 'crm',
    icon: 'Users',
    description: 'Müşteri veritabanı yönetimi',
    descriptionEn: 'Customer database management',
    descriptionAr: 'إدارة قاعدة بيانات العملاء',
    isCore: true,
    isEnabled: true
  },
  {
    id: 'loyalty',
    name: 'Sadakat Programı',
    nameEn: 'Loyalty Program',
    nameAr: 'برنامج الولاء',
    category: 'crm',
    icon: 'Award',
    description: 'Müşteri sadakat ve puan sistemi',
    descriptionEn: 'Customer loyalty and points system',
    descriptionAr: 'نظام ولاء ونقاط العملاء',
    isEnabled: true
  },
  {
    id: 'campaigns',
    name: 'Kampanya Yönetimi',
    nameEn: 'Campaign Management',
    nameAr: 'إدارة الحملات',
    category: 'crm',
    icon: 'Megaphone',
    description: 'Kampanya oluşturma ve yönetimi',
    descriptionEn: 'Campaign creation and management',
    descriptionAr: 'إنشاء وإدارة الحملات',
    isEnabled: true
  },
  {
    id: 'sms-marketing',
    name: 'SMS Pazarlama',
    nameEn: 'SMS Marketing',
    nameAr: 'التسويق عبر الرسائل القصيرة',
    category: 'crm',
    icon: 'MessageSquare',
    description: 'Toplu SMS gönderimi',
    descriptionEn: 'Bulk SMS sending',
    descriptionAr: 'إرسال الرسائل القصيرة بالجملة',
    isEnabled: false,
    isPremium: true
  },
  {
    id: 'email-marketing',
    name: 'E-posta Pazarlama',
    nameEn: 'Email Marketing',
    nameAr: 'التسويق عبر البريد الإلكتروني',
    category: 'crm',
    icon: 'Mail',
    description: 'E-posta kampanyaları',
    descriptionEn: 'Email campaigns',
    descriptionAr: 'حملات البريد الإلكتروني',
    isEnabled: false
  },
  {
    id: 'customer-feedback',
    name: 'Müşteri Geri Bildirim',
    nameEn: 'Customer Feedback',
    nameAr: 'ملاحظات العملاء',
    category: 'crm',
    icon: 'MessageCircle',
    description: 'Müşteri anket ve geri bildirim',
    descriptionEn: 'Customer surveys and feedback',
    descriptionAr: 'استطلاعات وملاحظات العملاء',
    isEnabled: false
  },

  // === İNSAN KAYNAKLARI ===
  {
    id: 'hr-management',
    name: 'İK Yönetimi',
    nameEn: 'HR Management',
    nameAr: 'إدارة الموارد البشرية',
    category: 'hr',
    icon: 'UserCog',
    description: 'Personel yönetimi',
    descriptionEn: 'Staff management',
    descriptionAr: 'إدارة الموظفين',
    isEnabled: true
  },
  {
    id: 'attendance',
    name: 'Puantaj Sistemi',
    nameEn: 'Attendance System',
    nameAr: 'نظام الحضور',
    category: 'hr',
    icon: 'Clock',
    description: 'Personel devam takibi',
    descriptionEn: 'Staff attendance tracking',
    descriptionAr: 'تتبع حضور الموظفين',
    isEnabled: false
  },
  {
    id: 'payroll',
    name: 'Bordro Sistemi',
    nameEn: 'Payroll System',
    nameAr: 'نظام كشوف المرتبات',
    category: 'hr',
    icon: 'Banknote',
    description: 'Maaş ve bordro yönetimi',
    descriptionEn: 'Salary and payroll management',
    descriptionAr: 'إدارة الرواتب وكشوف المرتبات',
    isEnabled: false
  },
  {
    id: 'shift-management',
    name: 'Vardiya Yönetimi',
    nameEn: 'Shift Management',
    nameAr: 'إدارة الورديات',
    category: 'hr',
    icon: 'CalendarClock',
    description: 'Vardiya planlama',
    descriptionEn: 'Shift planning',
    descriptionAr: 'تخطيط الورديات',
    isEnabled: true
  },
  {
    id: 'leave-management',
    name: 'İzin Yönetimi',
    nameEn: 'Leave Management',
    nameAr: 'إدارة الإجازات',
    category: 'hr',
    icon: 'Palmtree',
    description: 'Personel izin takibi',
    descriptionEn: 'Staff leave tracking',
    descriptionAr: 'تتبع إجازات الموظفين',
    isEnabled: false
  },

  // === RAPORLAMA & BI ===
  {
    id: 'reports',
    name: 'Raporlar',
    nameEn: 'Reports',
    nameAr: 'التقارير',
    category: 'reporting',
    icon: 'BarChart',
    description: 'Kapsamlı raporlama sistemi',
    descriptionEn: 'Comprehensive reporting system',
    descriptionAr: 'نظام التقارير الشامل',
    isCore: true,
    isEnabled: true
  },
  {
    id: 'dashboard',
    name: 'Gösterge Paneli',
    nameEn: 'Dashboard',
    nameAr: 'لوحة القيادة',
    category: 'reporting',
    icon: 'LayoutDashboard',
    description: 'Canlı gösterge paneli',
    descriptionEn: 'Live dashboard',
    descriptionAr: 'لوحة القيادة المباشرة',
    isCore: true,
    isEnabled: true
  },
  {
    id: 'analytics',
    name: 'Analitik',
    nameEn: 'Analytics',
    nameAr: 'التحليلات',
    category: 'reporting',
    icon: 'TrendingUp',
    description: 'İş zekası ve analitik',
    descriptionEn: 'Business intelligence and analytics',
    descriptionAr: 'ذكاء الأعمال والتحليلات',
    isEnabled: true
  },
  {
    id: 'sales-reports',
    name: 'Satış Raporları',
    nameEn: 'Sales Reports',
    nameAr: 'تقارير المبيعات',
    category: 'reporting',
    icon: 'LineChart',
    description: 'Detaylı satış raporları',
    descriptionEn: 'Detailed sales reports',
    descriptionAr: 'تقارير المبيعات التفصيلية',
    isEnabled: true
  },
  {
    id: 'inventory-reports',
    name: 'Stok Raporları',
    nameEn: 'Inventory Reports',
    nameAr: 'تقارير المخزون',
    category: 'reporting',
    icon: 'PackageSearch',
    description: 'Stok durum raporları',
    descriptionEn: 'Inventory status reports',
    descriptionAr: 'تقارير حالة المخزون',
    isEnabled: true
  },
  {
    id: 'financial-reports',
    name: 'Finansal Raporlar',
    nameEn: 'Financial Reports',
    nameAr: 'التقارير المالية',
    category: 'reporting',
    icon: 'PieChart',
    description: 'Mali tablolar ve raporlar',
    descriptionEn: 'Financial statements and reports',
    descriptionAr: 'البيانات والتقارير المالية',
    isEnabled: true
  },

  // === E-TİCARET ===
  {
    id: 'ecommerce',
    name: 'E-Ticaret',
    nameEn: 'E-Commerce',
    nameAr: 'التجارة الإلكترونية',
    category: 'ecommerce',
    icon: 'Globe',
    description: 'Online mağaza yönetimi',
    descriptionEn: 'Online store management',
    descriptionAr: 'إدارة المتجر عبر الإنترنت',
    isEnabled: false,
    isPremium: true
  },
  {
    id: 'marketplace',
    name: 'Pazar Yeri Entegrasyonu',
    nameEn: 'Marketplace Integration',
    nameAr: 'تكامل السوق',
    category: 'ecommerce',
    icon: 'ShoppingBag',
    description: 'Trendyol, Hepsiburada vb.',
    descriptionEn: 'Trendyol, Hepsiburada etc.',
    descriptionAr: 'ترينديول، هيبسي بورادا إلخ',
    isEnabled: false,
    isPremium: true
  },
  {
    id: 'shipping',
    name: 'Kargo Entegrasyonu',
    nameEn: 'Shipping Integration',
    nameAr: 'تكامل الشحن',
    category: 'ecommerce',
    icon: 'Truck',
    description: 'Kargo firması entegrasyonu',
    descriptionEn: 'Courier company integration',
    descriptionAr: 'تكامل شركة البريد السريع',
    isEnabled: false
  },

  // === SİSTEM YÖNETİMİ ===
  {
    id: 'settings',
    name: 'Ayarlar',
    nameEn: 'Settings',
    nameAr: 'الإعدادات',
    category: 'system',
    icon: 'Settings',
    description: 'Sistem ayarları',
    descriptionEn: 'System settings',
    descriptionAr: 'إعدادات النظام',
    isCore: true,
    isEnabled: true
  },
  {
    id: 'user-management',
    name: 'Kullanıcı Yönetimi',
    nameEn: 'User Management',
    nameAr: 'إدارة المستخدمين',
    category: 'system',
    icon: 'UserPlus',
    description: 'Kullanıcı ve yetki yönetimi',
    descriptionEn: 'User and permission management',
    descriptionAr: 'إدارة المستخدم والإذن',
    isEnabled: true
  },
  {
    id: 'branch-management',
    name: 'Şube Yönetimi',
    nameEn: 'Branch Management',
    nameAr: 'إدارة الفروع',
    category: 'system',
    icon: 'Building2',
    description: 'Çoklu şube yönetimi',
    descriptionEn: 'Multi-branch management',
    descriptionAr: 'إدارة الفروع المتعددة',
    isEnabled: true
  },
  {
    id: 'integrations',
    name: 'Entegrasyonlar',
    nameEn: 'Integrations',
    nameAr: 'التكاملات',
    category: 'system',
    icon: 'Plug',
    description: 'Üçüncü taraf entegrasyonlar',
    descriptionEn: 'Third-party integrations',
    descriptionAr: 'التكاملات الطرف الثالث',
    isEnabled: true
  },
  {
    id: 'backup',
    name: 'Yedekleme',
    nameEn: 'Backup',
    nameAr: 'النسخ الاحتياطي',
    category: 'system',
    icon: 'Database',
    description: 'Veri yedekleme',
    descriptionEn: 'Data backup',
    descriptionAr: 'النسخ الاحتياطي للبيانات',
    isEnabled: true
  },
  {
    id: 'audit-log',
    name: 'Denetim Günlüğü',
    nameEn: 'Audit Log',
    nameAr: 'سجل التدقيق',
    category: 'system',
    icon: 'FileSearch',
    description: 'Sistem aktivite kaydı',
    descriptionEn: 'System activity log',
    descriptionAr: 'سجل نشاط النظام',
    isEnabled: false
  },
  {
    id: 'data-broadcast',
    name: 'Veri Yayını',
    nameEn: 'Data Broadcast',
    nameAr: 'بث البيانات',
    category: 'system',
    icon: 'Radio',
    description: 'Merkezi veri yönetimi',
    descriptionEn: 'Central data management',
    descriptionAr: 'إدارة البيانات المركزية',
    isEnabled: true
  },

  // === LOJİSTİK & TEDARİK ===
  {
    id: 'suppliers',
    name: 'Tedarikçi Yönetimi',
    nameEn: 'Supplier Management',
    nameAr: 'إدارة الموردين',
    category: 'logistics',
    icon: 'Factory',
    description: 'Tedarikçi takibi',
    descriptionEn: 'Supplier tracking',
    descriptionAr: 'تتبع الموردين',
    isEnabled: true
  },
  {
    id: 'purchase-orders',
    name: 'Satın Alma Siparişleri',
    nameEn: 'Purchase Orders',
    nameAr: 'أوامر الشراء',
    category: 'logistics',
    icon: 'ShoppingBasket',
    description: 'Satın alma yönetimi',
    descriptionEn: 'Purchase management',
    descriptionAr: 'إدارة المشتريات',
    isEnabled: true
  },
  {
    id: 'receiving',
    name: 'Mal Kabul',
    nameEn: 'Goods Receiving',
    nameAr: 'استلام البضائع',
    category: 'logistics',
    icon: 'PackageCheck',
    description: 'Mal kabul ve kontrol',
    descriptionEn: 'Goods receiving and inspection',
    descriptionAr: 'استلام وتفتيش البضائع',
    isEnabled: true
  },

  // === RESTORAN & CAFE ===
  {
    id: 'table-management',
    name: 'Masa Yönetimi',
    nameEn: 'Table Management',
    nameAr: 'إدارة الطاولات',
    category: 'restaurant',
    icon: 'Grid3x3',
    description: 'Masa düzeni ve rezervasyon',
    descriptionEn: 'Table layout and reservation',
    descriptionAr: 'تخطيط الطاولة والحجز',
    isEnabled: false
  },
  {
    id: 'kitchen-display',
    name: 'Mutfak Ekranı',
    nameEn: 'Kitchen Display',
    nameAr: 'عرض المطبخ',
    category: 'restaurant',
    icon: 'Monitor',
    description: 'Mutfak sipariş ekranı',
    descriptionEn: 'Kitchen order display',
    descriptionAr: 'عرض طلب المطبخ',
    isEnabled: false
  },
  {
    id: 'recipe-management',
    name: 'Reçete Yönetimi',
    nameEn: 'Recipe Management',
    nameAr: 'إدارة الوصفات',
    category: 'restaurant',
    icon: 'BookOpen',
    description: 'Yemek reçeteleri',
    descriptionEn: 'Food recipes',
    descriptionAr: 'وصفات الطعام',
    isEnabled: false
  },

  // === DİĞER MODÜLLER ===
  {
    id: 'qr-menu',
    name: 'QR Menü',
    nameEn: 'QR Menu',
    nameAr: 'قائمة QR',
    category: 'other',
    icon: 'QrCode',
    description: 'QR kodlu dijital menü',
    descriptionEn: 'QR code digital menu',
    descriptionAr: 'قائمة رقمية برمز الاستجابة السريعة',
    isEnabled: false
  },
  {
    id: 'gift-card',
    name: 'Hediye Kartı',
    nameEn: 'Gift Card',
    nameAr: 'بطاقة هدية',
    category: 'other',
    icon: 'Gift',
    description: 'Hediye kartı yönetimi',
    descriptionEn: 'Gift card management',
    descriptionAr: 'إدارة بطاقة الهدايا',
    isEnabled: false
  },
  {
    id: 'appointments',
    name: 'Randevu Sistemi',
    nameEn: 'Appointment System',
    nameAr: 'نظام المواعيد',
    category: 'other',
    icon: 'CalendarCheck',
    description: 'Randevu ve rezervasyon',
    descriptionEn: 'Appointments and reservations',
    descriptionAr: 'المواعيد والحجوزات',
    isEnabled: false
  }
];

const STORAGE_KEY = 'retailos_active_modules';

class ModuleManager {
  private activeModules: Set<string>;

  constructor() {
    this.activeModules = this.loadActiveModules();
  }

  private loadActiveModules(): Set<string> {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading active modules:', error);
    }
    
    // Default: Enable all core modules and initially enabled modules
    return new Set(
      ALL_MODULES
        .filter(m => m.isCore || m.isEnabled)
        .map(m => m.id)
    );
  }

  private saveActiveModules(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.activeModules]));
    } catch (error) {
      console.error('Error saving active modules:', error);
    }
  }

  getActiveModules(): ModuleDefinition[] {
    return ALL_MODULES.filter(m => this.activeModules.has(m.id));
  }

  getAllModules(): ModuleDefinition[] {
    return ALL_MODULES.map(m => ({
      ...m,
      isEnabled: this.activeModules.has(m.id)
    }));
  }

  isModuleActive(moduleId: string): boolean {
    return this.activeModules.has(moduleId);
  }

  toggleModule(moduleId: string): boolean {
    const module = ALL_MODULES.find(m => m.id === moduleId);
    
    // Core modules cannot be disabled
    if (module?.isCore) {
      return false;
    }

    if (this.activeModules.has(moduleId)) {
      this.activeModules.delete(moduleId);
    } else {
      this.activeModules.add(moduleId);
    }

    this.saveActiveModules();
    return true;
  }

  enableModule(moduleId: string): void {
    this.activeModules.add(moduleId);
    this.saveActiveModules();
  }

  disableModule(moduleId: string): boolean {
    const module = ALL_MODULES.find(m => m.id === moduleId);
    
    // Core modules cannot be disabled
    if (module?.isCore) {
      return false;
    }

    this.activeModules.delete(moduleId);
    this.saveActiveModules();
    return true;
  }

  enableMultiple(moduleIds: string[]): void {
    moduleIds.forEach(id => this.activeModules.add(id));
    this.saveActiveModules();
  }

  disableMultiple(moduleIds: string[]): void {
    moduleIds.forEach(id => {
      const module = ALL_MODULES.find(m => m.id === id);
      if (!module?.isCore) {
        this.activeModules.delete(id);
      }
    });
    this.saveActiveModules();
  }

  getModulesByCategory(category: ModuleCategory): ModuleDefinition[] {
    return this.getAllModules().filter(m => m.category === category);
  }

  searchModules(query: string): ModuleDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllModules().filter(m =>
      m.name.toLowerCase().includes(lowerQuery) ||
      m.nameEn.toLowerCase().includes(lowerQuery) ||
      m.description.toLowerCase().includes(lowerQuery)
    );
  }

  resetToDefaults(): void {
    this.activeModules = new Set(
      ALL_MODULES
        .filter(m => m.isCore || m.isEnabled)
        .map(m => m.id)
    );
    this.saveActiveModules();
  }

  enableAll(): void {
    this.activeModules = new Set(ALL_MODULES.map(m => m.id));
    this.saveActiveModules();
  }

  disableAll(): void {
    // Keep only core modules
    this.activeModules = new Set(
      ALL_MODULES
        .filter(m => m.isCore)
        .map(m => m.id)
    );
    this.saveActiveModules();
  }

  getStats() {
    const all = this.getAllModules();
    return {
      total: all.length,
      active: all.filter(m => m.isEnabled).length,
      core: all.filter(m => m.isCore).length,
      premium: all.filter(m => m.isPremium).length
    };
  }
}

export const moduleManager = new ModuleManager();

