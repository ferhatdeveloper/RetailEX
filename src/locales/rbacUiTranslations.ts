/**
 * RBAC katalog + rol listesi + DataTable ortak metinleri.
 * module-translations.ts sonunda Object.assign ile birleştirilir.
 */
import type { Language } from './module-translations';

type Entry = Record<Language, string>;

export const rbacUiTranslations: Record<string, Entry> = {
  dataTableSearchPlaceholder: {
    tr: 'Tabloda ara…',
    en: 'Search in table…',
    ar: 'ابحث في الجدول…',
    ku: 'لە خشتە بگەڕێ…',
  },
  dataTableColumns: { tr: 'Sütunlar', en: 'Columns', ar: 'الأعمدة', ku: 'ستوونەکان' },
  dataTableColumnVisibility: {
    tr: 'Sütun görünürlüğü',
    en: 'Column visibility',
    ar: 'ظهور الأعمدة',
    ku: 'دیاربوونی ستوون',
  },
  dataTableLoading: { tr: 'Yükleniyor…', en: 'Loading…', ar: 'جاري التحميل…', ku: 'بارکردن…' },
  dataTableFooterTotal: {
    tr: 'Toplam {n} kayıt',
    en: 'Total {n} records',
    ar: 'إجمالي {n} سجل',
    ku: 'کۆی {n} تۆمار',
  },
  dataTableFooterFiltered: {
    tr: '({total} kayıttan filtrelendi)',
    en: '(filtered from {total} records)',
    ar: '(مُصفّى من {total} سجلًا)',
    ku: '(پاڵاوت لە {total} تۆمار)',
  },
  dataTableSelectedCount: { tr: '{n} seçili', en: '{n} selected', ar: '{n} محدد', ku: '{n} هەڵبژێردراو' },
  dataTableExport: { tr: 'Dışa aktar', en: 'Export', ar: 'تصدير', ku: 'هەناردن' },

  roleMgmtTitle: { tr: 'Rol & yetkiler', en: 'Roles & permissions', ar: 'الأدوار والصلاحيات', ku: 'ڕۆڵ و مۆڵەت' },
  roleMgmtSubtitle: {
    tr: 'Kullanıcı yetki profillerini düzenleyin ve güvenliği yönetin.',
    en: 'Edit user permission profiles and manage security.',
    ar: 'حرّر ملفات صلاحيات المستخدمين وأدر الأمان.',
    ku: 'پڕۆفایلی مۆڵەتی بەکارهێنەر دەستکاری بکە و ئاسایش بەڕێوەبەرە.',
  },
  roleMgmtAddRole: { tr: 'Yeni rol ekle', en: 'Add new role', ar: 'إضافة دور', ku: 'ڕۆڵی نوێ' },
  roleMgmtColRoleName: { tr: 'Rol adı', en: 'Role name', ar: 'اسم الدور', ku: 'ناوی ڕۆڵ' },
  roleMgmtColPermissions: { tr: 'Yetki detayı', en: 'Permission detail', ar: 'تفاصيل الصلاحية', ku: 'وردەکاری مۆڵەت' },
  roleMgmtColActions: { tr: 'İşlemler', en: 'Actions', ar: 'إجراءات', ku: 'کردارەکان' },
  roleMgmtSystemGroup: { tr: 'Sistem grubu', en: 'System group', ar: 'مجموعة النظام', ku: 'گرووپی سیستەم' },
  roleMgmtServiceCount: {
    tr: '{n} hizmet',
    en: '{n} modules',
    ar: '{n} خدمة',
    ku: '{n} مۆدیول',
  },
  roleMgmtEditTitle: { tr: 'Düzenle', en: 'Edit', ar: 'تحرير', ku: 'دەستکاری' },
  roleMgmtDeleteTitle: { tr: 'Sil', en: 'Delete', ar: 'حذف', ku: 'سڕینەوە' },
  roleMgmtDeleteDisabled: {
    tr: 'Sistem rolü silinemez',
    en: 'System role cannot be deleted',
    ar: 'لا يمكن حذف دور النظام',
    ku: 'ڕۆڵی سیستەم ناسڕدرێتەوە',
  },
  roleMgmtConfirmDelete: {
    tr: 'Bu rolü silmek istediğinizden emin misiniz?',
    en: 'Are you sure you want to delete this role?',
    ar: 'هل أنت متأكد أنك تريد حذف هذا الدور؟',
    ku: 'دڵنیای لە سڕینەوەی ئەم ڕۆڵە؟',
  },
  roleMgmtSystemDeleteBlocked: {
    tr: 'Sistem rolleri silinemez.',
    en: 'System roles cannot be deleted.',
    ar: 'لا يمكن حذف أدوار النظام.',
    ku: 'ڕۆڵەکانی سیستەم ناسڕدرێنەوە.',
  },
  roleMgmtEmpty: {
    tr: 'Sistemde henüz bir rol tanımlı değil.',
    en: 'No roles are defined yet.',
    ar: 'لا توجد أدوار معرّفة بعد.',
    ku: 'هێشتا هیچ ڕۆڵێک دیارینەکراوە.',
  },
  roleMgmtModalPermCount: {
    tr: '{n} işlem yetkisi',
    en: '{n} action grants',
    ar: '{n} صلاحية إجراء',
    ku: '{n} مۆڵەتی کردار',
  },
  roleMgmtModalDefaultDesc: {
    tr: 'Detaylı yetki profili dökümü',
    en: 'Detailed permission profile',
    ar: 'ملف صلاحيات تفصيلي',
    ku: 'پڕۆفایلی وردی مۆڵەت',
  },

  rbacActionRead: { tr: 'Görüntüle', en: 'View', ar: 'عرض', ku: 'بینین' },
  rbacActionCreate: { tr: 'Oluştur', en: 'Create', ar: 'إنشاء', ku: 'دروستکردن' },
  rbacActionUpdate: { tr: 'Güncelle', en: 'Update', ar: 'تحديث', ku: 'نوێکردنەوە' },
  rbacActionDelete: { tr: 'Sil', en: 'Delete', ar: 'حذف', ku: 'سڕینەوە' },
  rbacActionExecute: { tr: 'İşle / Onayla', en: 'Execute / Approve', ar: 'تنفيذ / اعتماد', ku: 'جێبەجێکردن / پەسەند' },

  rbacGroupRest: {
    tr: 'Restoran ve Ağırlama',
    en: 'Restaurant & hospitality',
    ar: 'المطاعم والضيافة',
    ku: 'چێشتخانە و میوانداری',
  },
  rbacGroupRetail: {
    tr: 'Market ve Perakende Satış',
    en: 'Market & retail',
    ar: 'السوق والبيع بالتجزئة',
    ku: 'مارکێت و فرۆشتن',
  },
  rbacGroupWms: {
    tr: 'Stok ve Depo Yönetimi (WMS)',
    en: 'Inventory & warehouse (WMS)',
    ar: 'المخزون والمستودعات',
    ku: 'کۆگا و کۆگاخانە',
  },
  rbacGroupFinance: {
    tr: 'Finans ve Muhasebe',
    en: 'Finance & accounting',
    ar: 'المالية والمحاسبة',
    ku: 'دارایی و ژمێریاری',
  },
  rbacGroupAdmin: {
    tr: 'Yönetim ve Sistem Kuruluşu',
    en: 'Administration & system',
    ar: 'الإدارة والنظام',
    ku: 'بەڕێوەبردن و سیستەم',
  },
};

function M(tr: string, en: string, ar: string, ku?: string): Entry {
  return { tr, en, ar, ku: ku ?? en };
}

const mods: Record<string, { n: Entry }> = {
  'restaurant.pos': {
    n: M('Masa Servis (POS)', 'Table service (POS)', 'خدمة الطاولات (نقطة البيع)'),
  },
  'restaurant.delivery': {
    n: M('Paket Servis', 'Delivery / takeaway', 'التوصيل'),
  },
  'restaurant.takeaway': {
    n: M('Gel-Al Servis', 'Pickup service', 'الاستلام من الفرع'),
  },
  'restaurant.kds': {
    n: M('Mutfak Paneli (KDS)', 'Kitchen display (KDS)', 'شاشة المطبخ'),
  },
  'restaurant.recipes': {
    n: M('Reçete ve Maliyet', 'Recipes & cost', 'الوصفات والتكلفة'),
  },
  'restaurant.reservations': {
    n: M('Rezervasyon Yönetimi', 'Reservations', 'الحجوزات'),
  },
  'restaurant.reports': {
    n: M('Restoran Analizleri', 'Restaurant analytics', 'تحليلات المطعم'),
  },
  'restaurant.settings': {
    n: M('Restoran Parametreleri', 'Restaurant settings', 'إعدادات المطعم'),
  },
  pos: { n: M('Market POS', 'Retail POS', 'نقطة بيع السوق') },
  'sales-returns': { n: M('İade ve Değişim', 'Returns & exchanges', 'المرتجعات') },
  campaigns: { n: M('Kampanya Yönetimi', 'Campaigns', 'العروض') },
  loyalty: { n: M('Sadakat Sistemi', 'Loyalty', 'الولاء') },
  'gift-cards': { n: M('Hediye Çekleri', 'Gift cards', 'بطاقات الهدايا') },
  products: { n: M('Ürün ve Malzeme Kartları', 'Product master data', 'بطاقات المنتجات') },
  stock: { n: M('Envanter Hareketleri', 'Inventory movements', 'حركات المخزون') },
  'store-transfer': { n: M('Depolar Arası Sevk', 'Inter-store transfer', 'النقل بين المستودعات') },
  purchase: { n: M('Satınalma Yönetimi', 'Purchasing', 'المشتريات') },
  'inventory-check': { n: M('Sayım ve Kontrol', 'Stock counts', 'الجرد') },
  'finance.cash': { n: M('Kasa Yönetimi', 'Cash management', 'إدارة الصندوق') },
  'finance.bank': { n: M('Banka İşlemleri', 'Banking', 'العمليات البنكية') },
  accounting: { n: M('Genel Muhasebe', 'General ledger', 'المحاسبة العامة') },
  customers: { n: M('Müşteri (Cari) Hesapları', 'Customer accounts', 'حسابات العملاء') },
  suppliers: { n: M('Tedarikçi Hesapları', 'Supplier accounts', 'حسابات الموردين') },
  invoices: { n: M('Fatura Yönetimi', 'Invoicing', 'الفواتير') },
  mizan: { n: M('Mali Tablolar', 'Financial statements', 'القوائم المالية') },
  dashboard: { n: M('Yönetici Dashboard', 'Executive dashboard', 'لوحة المدير') },
  management: { n: M('Backoffice Ana Giriş', 'Backoffice home', 'الواجهة الإدارية') },
  'users.roles': { n: M('Kullanıcı ve Yetki', 'Users & access', 'المستخدمون والصلاحيات') },
  'reports.advanced': { n: M('Gelişmiş Raporlama', 'Advanced reporting', 'التقارير المتقدمة') },
  'settings.system': { n: M('Sistem Yapılandırması', 'System configuration', 'إعدادات النظام') },
  crm: { n: M('Müşteri İlişkileri (CRM)', 'CRM', 'إدارة علاقات العملاء') },
};

const descs: Record<string, Entry> = {
  'restaurant.pos': M('Masa yönetimi, sipariş alımı ve adisyon', 'Table management, orders and tickets', 'إدارة الطاولات والطلبات'),
  'restaurant.delivery': M('Çağrı merkezi ve kurye takibi', 'Call center & courier tracking', 'المركز الهاتفي والتوصيل'),
  'restaurant.takeaway': M('Hızlı öde-geç işlemleri', 'Quick pickup checkout', 'دفع وسحب سريع'),
  'restaurant.kds': M('Mutfak hazırlık ve bildirim ekranı', 'Kitchen prep & notifications', 'تجهيز المطبخ والإشعارات'),
  'restaurant.recipes': M('Ürün içerikleri, reçeteler ve maliyet analizi', 'BOM, recipes and costing', 'الوصفات والتكلفة'),
  'restaurant.reservations': M('Masa rezervasyonu ve müşteri yerleşimi', 'Reservations & seating', 'الحجوزات والجلوس'),
  'restaurant.reports': M('Restoran bazlı ciro ve verimlilik raporları', 'Restaurant KPI reports', 'تقارير الأداء'),
  'restaurant.settings': M('Bölge, masa ve yazıcı tanımları', 'Areas, tables & printers', 'المناطق والطاولات والطابعات'),
  pos: M('Hızlı barkodlu satış arayüzü', 'Fast barcode POS', 'واجهة البيع السريع'),
  'sales-returns': M('Satış iade fişleri ve müşteri iadeleri', 'Return slips', 'إرجاع المبيعات'),
  campaigns: M('Promosyon, indirim ve kampanya kurguları', 'Promotions', 'العروض الترويجية'),
  loyalty: M('Müşteri puanları ve sadakat programları', 'Loyalty points', 'نقاط الولاء'),
  'gift-cards': M('Sanal ve fiziksel hediye çeki yönetimi', 'Gift card management', 'بطاقات الهدايا'),
  products: M('Malzeme, hizmet ve ticari mal tanımları', 'Items & services master', 'تعريف الأصناف'),
  stock: M('Giriş, çıkış, sarf ve fire fişleri', 'Receipts, issues, adjustments', 'حركات المخزون'),
  'store-transfer': M('Şubeler arası transfer ve onay süreci', 'Transfers between stores', 'النقل بين الفروع'),
  purchase: M('Tedarikçi siparişleri ve alım süreci', 'Purchase orders', 'أوامر الشراء'),
  'inventory-check': M('Periyodik ve anlık envanter sayımları', 'Cycle counts', 'الجرد الدوري'),
  'finance.cash': M('Nakit giriş/çıkış ve kasa bakiyeleri', 'Cash in/out & balances', 'حركة الصندوق'),
  'finance.bank': M('Banka havale, eft ve pos işlemleri', 'Bank & POS movements', 'العمليات البنكية'),
  accounting: M('Yevmiye fişleri ve hesap planı', 'Journal entries & chart of accounts', 'القيود والدفتر'),
  customers: M('Müşteri bakiyeleri ve ekstreleri', 'Customer balances & statements', 'أرصدة العملاء'),
  suppliers: M('Tedarikçi borç takibi ve ödemeler', 'Supplier AP', 'موردون'),
  invoices: M('E-Fatura, E-Arşiv ve kağıt fatura takibi', 'E-invoice tracking', 'الفوترة الإلكترونية'),
  mizan: M('Mizan, bilanço ve kâr-zarar raporları', 'Trial balance & P&L', 'التقارير المالية'),
  dashboard: M('KPI göstergeleri ve canlı istatistikler', 'KPIs & live stats', 'مؤشرات الأداء'),
  management: M('Yönetim modülüne genel erişim', 'Backoffice access', 'الوصول الإداري'),
  'users.roles': M('Kullanıcı tanımları ve RBAC yetkilendirme', 'Users & RBAC', 'المستخدمون والصلاحيات'),
  'reports.advanced': M('Dashboard ve dinamik rapor tasarlayıcı', 'Advanced analytics', 'التقارير الديناميكية'),
  'settings.system': M('Şirket ayarları ve cihaz tanımları', 'Company & device settings', 'إعدادات الشركة'),
  crm: M('Aday müşteri ve satış fırsatı takibi', 'Leads & opportunities', 'العملاء المحتملون'),
};

for (const [id, { n }] of Object.entries(mods)) {
  const safe = id.replace(/\./g, '_');
  rbacUiTranslations[`rbac_nm_${safe}`] = n;
  rbacUiTranslations[`rbac_ds_${safe}`] = descs[id] ?? n;
}

export const restPrinterUiTranslations: Record<string, Entry> = {
  restPrintTitle: { tr: 'Yazıcı yönetimi', en: 'Printer management', ar: 'إدارة الطابعات', ku: 'بەڕێوەبردنی چاپکەر' },
  restPrintSubtitle: {
    tr: 'Mutfak, bar ve kasa — profiller ve kategori rotaları veritabanında (firma bazlı) saklanır.',
    en: 'Kitchen, bar & POS — profiles and category routes are stored per company.',
    ar: 'المطبخ والبار والصندوق — تُحفظ الملفات ومسارات الفئات لكل شركة.',
    ku: 'چێشتخانە و بار و POS — پاشەکەوتکراوە.',
  },
  restPrintAdd: { tr: 'Yeni yazıcı ekle', en: 'Add printer', ar: 'إضافة طابعة', ku: 'چاپکەر زیاد بکە' },
  restPrintListTitle: { tr: 'Yazıcı listesi', en: 'Printer list', ar: 'قائمة الطابعات', ku: 'لیستی چاپکەر' },
  restPrintEmpty: {
    tr: 'Tanımlı yazıcı bulunamadı',
    en: 'No printers configured',
    ar: 'لا توجد طابعات معرّفة',
    ku: 'چاپکەر دیارینەکراوە',
  },
  restPrintCommonTitle: { tr: 'Ortak yazıcı', en: 'Shared printer', ar: 'طابعة مشتركة', ku: 'چاپکەری هاوبەش' },
  restPrintCommonHint: {
    tr: 'Hesap fişi ve varsayılan çıktı için bu profili seçin (tercihen Sistem yazıcısı). Mutfakta kategori rotası yoksa yedek olarak da kullanılır.',
    en: 'Pick this profile for receipts and default output (prefer System printer). Used as fallback when no kitchen route exists.',
    ar: 'اختر هذا الملف للإيصالات والمخرجات الافتراضية (يفضّل طابعة النظام). يُستخدم احتياطيًا عند غيار مسار المطبخ.',
    ku: 'بۆ پسوڵە و چاپی بنەڕەت هەڵیبژێرە.',
  },
  restPrintProfileSelect: { tr: 'Profil seçimi', en: 'Profile', ar: 'اختيار الملف', ku: 'هەڵبژاردنی پڕۆفایل' },
  restPrintCommonDisabledOpt: {
    tr: 'Devre dışı (yalnızca genel fiş yazıcısı — Yönetim / Yazıcı Ayarları)',
    en: 'Disabled (global receipt printer only — Management / Printer settings)',
    ar: 'معطّل (طابعة الإيصال العامة فقط — الإدارة / إعدادات الطابعة)',
    ku: 'ناچالاک',
  },
  restPrintCommonWarn: {
    tr: 'Önce «Yeni yazıcı ekle» ile en az bir profil oluşturun; liste burada görünür.',
    en: 'Create at least one profile with “Add printer”; it will appear here.',
    ar: 'أنشئ ملفًا واحدًا على الأقل بـ «إضافة طابعة» لتظهر القائمة هنا.',
    ku: 'پڕۆفایل دروست بکە.',
  },
  restPrintRouteTitle: { tr: 'Kategori rotalama', en: 'Category routing', ar: 'توجيه الفئات', ku: 'ڕێڕەوی هاوپۆل' },
  restPrintRouteHint: {
    tr: 'Her ürün kategorisi için mutfak çıktısının gideceği yazıcı profilini seçin. Liste, ürün stoğundaki kategori alanlarından oluşur.',
    en: 'Choose the printer profile for each category. The list is built from product categories in stock.',
    ar: 'اختر ملف الطابعة لكل فئة للمطبخ. تُبنى القائمة من فئات المنتجات.',
    ku: 'بۆ هەر هاوپۆلێک چاپکەر هەڵبژێرە.',
  },
  restPrintNoCategoriesTitle: { tr: 'Henüz kategori yok', en: 'No categories yet', ar: 'لا فئات بعد', ku: 'هاوپۆل نییە' },
  restPrintNoCategoriesBody: {
    tr: 'Ürünler yüklenmediyse veya tüm ürünlerde kategori alanı boşsa bu liste görünmez. Stokta kategorisi olan ürünler yüklendikten sonra burada satırlar belirir.',
    en: 'If products are not loaded or categories are empty, this list stays empty.',
    ar: 'إذا لم تُحمَّل المنتجات أو كانت الفئات فارغة، تبقى القائمة فارغة.',
    ku: 'ئەگەر بەرهەم نەبێت لیست بەتاڵە.',
  },
  restPrintReloadMenu: {
    tr: 'Ürün menüsünü yeniden yükle',
    en: 'Reload product menu',
    ar: 'إعادة تحميل قائمة المنتجات',
    ku: 'دووبارەی بارکردنی مێنو',
  },
  restPrintStationPlaceholder: {
    tr: 'İstasyon seçin…',
    en: 'Select station…',
    ar: 'اختر المحطة…',
    ku: 'وەستگە هەڵبژێرە…',
  },
  restPrintModalTitle: { tr: 'Yazıcı düzenle', en: 'Edit printer', ar: 'تحرير الطابعة', ku: 'دەستکاری چاپکەر' },
  restPrintNameLabel: { tr: 'Yazıcı adı', en: 'Printer name', ar: 'اسم الطابعة', ku: 'ناوی چاپکەر' },
  restPrintNamePh: { tr: 'Örn: Mutfak-1', en: 'e.g. Kitchen-1', ar: 'مثال: مطبخ-1', ku: 'نموونە' },
  restPrintConnLabel: { tr: 'Bağlantı', en: 'Connection', ar: 'الاتصال', ku: 'پەیوەندی' },
  restPrintTypeLabel: { tr: 'Tür', en: 'Type', ar: 'النوع', ku: 'جۆر' },
  restPrintConnNetwork: { tr: 'Network (IP)', en: 'Network (IP)', ar: 'شبكة (IP)', ku: 'تۆڕ' },
  restPrintConnUsb: { tr: 'USB', en: 'USB', ar: 'USB', ku: 'USB' },
  restPrintConnSystem: { tr: 'Sistem yazıcısı', en: 'System printer', ar: 'طابعة النظام', ku: 'سیستەم' },
  restPrintTypeThermal: { tr: 'Thermal (80mm)', en: 'Thermal (80mm)', ar: 'حراري (80مم)', ku: 'Thermal' },
  restPrintTypeStandard: { tr: 'Standard (A4)', en: 'Standard (A4)', ar: 'قياسي (A4)', ku: 'A4' },
  restPrintWinList: { tr: 'Windows yazıcı listesi', en: 'Windows printer list', ar: 'قائمة طابعات ويندوز', ku: 'لیستی Windows' },
  restPrintWinPick: { tr: 'Yazıcı seçin…', en: 'Choose printer…', ar: 'اختر الطابعة…', ku: 'هەڵبژێرە…' },
  restPrintIpLabel: { tr: 'IP adresi', en: 'IP address', ar: 'عنوان IP', ku: 'ناونیشانی IP' },
  restPrintCancel: { tr: 'İptal', en: 'Cancel', ar: 'إلغاء', ku: 'هەڵوەشاندنەوە' },
  restPrintSave: { tr: 'Kaydet', en: 'Save', ar: 'حفظ', ku: 'پاشەکەوت' },
};

export const restCallerUiTranslations: Record<string, Entry> = {
  restCallerTitle: { tr: 'Arayan numara (Caller ID)', en: 'Caller ID', ar: 'معرّف المتصل', ku: 'پەیوەندی هاتوو' },
  restCallerSubtitle: {
    tr: 'Sanal santral webhook, yerel HTTP köprüsü veya DeskApp seri port',
    en: 'Virtual PBX webhook, local HTTP bridge, or DeskApp serial',
    ar: 'ويب هوك للمقسم الافتراضي، جسر HTTP محلي، أو منفذ تسلسلي',
    ku: 'Webhook یان پۆرت',
  },
  restCallerInfo1: {
    tr: 'Tarayıcı doğrudan santralden çağrı alamaz. Sanal santralde webhook adresi olarak pg_bridge sunucunuza POST verilir; uygulama periyodik olarak son arayanı okur.',
    en: 'Browsers cannot receive calls from the PBX directly. The PBX POSTs to your pg_bridge URL; the app polls the last caller.',
    ar: 'لا يستقبل المتصفح المكالمات مباشرة. يُرسل المقسم POST إلى pg_bridge وتقرأ التطبيقات آخر متصل دوريًا.',
    ku: 'POST بۆ pg_bridge',
  },
  restCallerInfo2: {
    tr: 'USB/RS232 Caller ID kutusu için DeskApp içinde «Seri port (DeskApp)» modunu seçin; uygulama satırları okuyup numarayı çıkarır.',
    en: 'For USB/RS232 boxes, choose “Serial (DeskApp)” in DeskApp; it parses lines for the number.',
    ar: 'لأجهزة USB/RS232 اختر «تسلسلي (DeskApp)» في تطبيق سطح المكتب.',
    ku: 'DeskApp بەکاربهێنە',
  },
  restCallerModeOffT: { tr: 'Kapalı', en: 'Off', ar: 'إيقاف', ku: 'کوژاوە' },
  restCallerModeOffD: { tr: 'Caller ID devre dışı', en: 'Caller ID disabled', ar: 'معرّف المتصل معطّل', ku: 'ناچالاک' },
  restCallerModeVirtT: { tr: 'Sanal santral', en: 'Virtual PBX', ar: 'مقسم افتراضي', ku: 'سەنترالی ڤێرتشوەڵ' },
  restCallerModeVirtD: {
    tr: 'Webhook → pg_bridge push, uygulama poll',
    en: 'Webhook → pg_bridge push, app polls',
    ar: 'ويب هوك → pg_bridge، التطبيق يستعلم',
    ku: 'Webhook + poll',
  },
  restCallerModePhysT: { tr: 'Fiziksel cihaz / yerel köprü', en: 'Local device / bridge', ar: 'جهاز محلي / جسر', ku: 'ئامێری ناوخۆیی' },
  restCallerModePhysD: {
    tr: 'Kendi GET endpoint veya cihaz yazılımı URL adresi',
    en: 'Your GET endpoint or device software URL',
    ar: 'عنوان GET الخاص أو برنامج الجهاز',
    ku: 'GET URL',
  },
  restCallerModeSerT: { tr: 'Seri port (DeskApp)', en: 'Serial (DeskApp)', ar: 'منفذ تسلسلي (DeskApp)', ku: 'پۆرت' },
  restCallerModeSerD: {
    tr: 'COM port üzerinden doğrudan okuma — yalnız masaüstü uygulamasında',
    en: 'Direct COM read — desktop app only',
    ar: 'قراءة مباشرة من COM — تطبيق سطح المكتب فقط',
    ku: 'تەنها Desktop',
  },
  restCallerSerialOnlyWeb: {
    tr: 'Bu mod yalnızca RetailEX masaüstü (Tauri) kurulumunda çalışır. Web sürümünde «Fiziksel cihaz / yerel köprü» ile küçük bir yerel HTTP servisi kullanın.',
    en: 'This mode works only in the RetailEX desktop (Tauri) build. On web, use “Local device / bridge”.',
    ar: 'يعمل هذا الوضع فقط في تطبيق سطح المكتب. على الويب استخدم «جهاز محلي / جسر».',
    ku: 'تەنها Tauri',
  },
  restCallerComLabel: { tr: 'COM portu', en: 'COM port', ar: 'منفذ COM', ku: 'COM' },
  restCallerRefresh: { tr: 'Yenile', en: 'Refresh', ar: 'تحديث', ku: 'نوێکردنەوە' },
  restCallerPortPlaceholder: { tr: 'Port seçin…', en: 'Select port…', ar: 'اختر المنفذ…', ku: 'پۆرت…' },
  restCallerBaudLabel: { tr: 'Baud hızı', en: 'Baud rate', ar: 'سرعة البود', ku: 'Baud' },
  restCallerSerialHelp: {
    tr: 'Satır bazlı okuma yapılır; NMBR= veya en az 10 haneli numara içeren metin desteklenir. Cihaz protokolü farklıysa üretici yazılımı ile köprü kullanın.',
    en: 'Line-based read; supports NMBR= or 10+ digit numbers. Use vendor bridge for other protocols.',
    ar: 'قراءة سطرية؛ يدعم NMBR= أو أرقامًا من 10 خانات فأكثر.',
    ku: 'خوێندنەوەی هێڵ',
  },
  restCallerPollUrl: {
    tr: 'Özel poll URL (isteğe bağlı — sanal modda boş = köprü son kayıt)',
    en: 'Custom poll URL (optional — empty = last record from bridge)',
    ar: 'رابط استعلام مخصص (اختياري — فارغ = آخر سجل)',
    ku: 'Poll URL',
  },
  restCallerPollMs: { tr: 'Poll aralığı (ms)', en: 'Poll interval (ms)', ar: 'فترة الاستعلام (ملي ث)', ku: 'Poll ms' },
  restCallerApiToken: {
    tr: 'API token (pg_bridge CALLER_ID_PUSH_TOKEN ile aynı)',
    en: 'API token (same as pg_bridge CALLER_ID_PUSH_TOKEN)',
    ar: 'رمز API (مثل CALLER_ID_PUSH_TOKEN)',
    ku: 'API token',
  },
  restCallerTokenPh: {
    tr: 'Üretimde zorunlu önerilir',
    en: 'Recommended in production',
    ar: 'يُنصح به في الإنتاج',
    ku: 'پێشنیار',
  },
  restCallerWebhookTitle: { tr: 'Webhook (POST)', en: 'Webhook (POST)', ar: 'ويب هوك (POST)', ku: 'Webhook' },
  restCallerWebhookBody: {
    tr: 'Gövde örneği:',
    en: 'Body example:',
    ar: 'مثال للجسم:',
    ku: 'نموونە',
  },
  restCallerWebhookTokenHint: {
    tr: ' — token alanı veya Authorization: Bearer …',
    en: ' — token field or Authorization: Bearer …',
    ar: ' — حقل الرمز أو Authorization: Bearer …',
    ku: ' — token',
  },
  restCallerBridgeEnv: {
    tr: 'Köprüyü çalıştırmadan önce ortamda CALLER_ID_PUSH_TOKEN tanımlayabilirsiniz (PowerShell: $env:CALLER_ID_PUSH_TOKEN="gizli").',
    en: 'Before running the bridge you can set CALLER_ID_PUSH_TOKEN (PowerShell: $env:CALLER_ID_PUSH_TOKEN="secret").',
    ar: 'قبل تشغيل الجسر عيّن CALLER_ID_PUSH_TOKEN (PowerShell: $env:CALLER_ID_PUSH_TOKEN="secret").',
    ku: 'CALLER_ID_PUSH_TOKEN دابمەزرێنە.',
  },
  restCallerAutoSave: {
    tr: 'Ayarlar bu cihazda otomatik kaydedilir',
    en: 'Settings auto-save on this device',
    ar: 'تُحفظ الإعدادات تلقائيًا على هذا الجهاز',
    ku: 'پاشەکەوت خۆکار',
  },
};
