// src/config/voiceCommandDefinitions.ts

export interface CommandDefinition {
    intent: string;
    category: 'navigation' | 'search' | 'create' | 'transaction';
    examples: {
        tr: string[];
        en: string[];
        ar: string[];
        ckb: string[];
    };
    description: {
        tr: string;
        en: string;
        ar: string;
        ckb: string;
    };
    parameters?: string[];
}

export const VOICE_COMMAND_DEFINITIONS: CommandDefinition[] = [
    // Navigation Commands
    {
        intent: 'open_sales_invoice',
        category: 'navigation',
        examples: {
            tr: ['Satış faturası aç', 'Satış faturasını göster', 'Fatura ekranına git', 'Aç satış faturasını', 'Fatura listesini getir'],
            en: ['Open sales invoice', 'Show sales invoice', 'Go to invoice screen', 'Show me the sales invoices'],
            ar: ['فتح فاتورة مبيعات', 'عرض فاتورة المبيعات', 'الذهاب الى قائمة الفواتير'],
            ckb: ['کردنەوەی پسوڵەی فرۆشتن', 'پیشاندانی پسوڵەی فرۆشتن', 'بڕۆ بۆ لیستی پسوڵەکان'],
        },
        description: {
            tr: 'Satış faturası ekranını açar',
            en: 'Opens the sales invoice screen',
            ar: 'يفتح شاشة فاتورة المبيعات',
            ckb: 'شاشەی پسوڵەی فرۆشتن دەکاتەوە',
        },
    },
    {
        intent: 'open_purchase_invoice',
        category: 'navigation',
        examples: {
            tr: ['Alış faturası aç', 'Alış faturasını göster', 'Purchase invoice aç', 'Aç alış faturasını'],
            en: ['Open purchase invoice', 'Show purchase invoice'],
            ar: ['فتح فاتورة مشتريات', 'عرض فاتورة المشتريات'],
            ckb: ['کردنەوەی پسوڵەی کڕین', 'پیشاندانی پسوڵەی کڕین'],
        },
        description: {
            tr: 'Alış faturası ekranını açar',
            en: 'Opens the purchase invoice screen',
            ar: 'يفتح شاشة فاتورة المشتريات',
            ckb: 'شاشەی پسوڵەی کڕین دەکاتەوە',
        },
    },
    {
        intent: 'open_products',
        category: 'navigation',
        examples: {
            tr: ['Ürünleri göster', 'Malzemeleri aç', 'Ürün listesi', 'Product listesi', 'Göster ürünleri', 'Aç ürün listesini'],
            en: ['Show products', 'Open products', 'Product list'],
            ar: ['عرض المنتجات', 'قائمة المنتجات', 'فتح قائمة المواد'],
            ckb: ['لیستی کاڵاکان', 'پیشاندانی کاڵاکان', 'کردنەوەی لیستی مواد'],
        },
        description: {
            tr: 'Ürün listesini açar',
            en: 'Opens the product list',
            ar: 'يفتح قائمة المنتجات',
            ckb: 'لیستی کاڵاکان دەکاتەوە',
        },
    },
    {
        intent: 'open_customers',
        category: 'navigation',
        examples: {
            tr: ['Müşteri listesi', 'Müşterileri göster', 'Cari listesi', 'Customer ekranı', 'Listele müşterileri', 'Aç müşteri ekranını'],
            en: ['Customer list', 'Show customers', 'Open customers'],
            ar: ['قائمة العملاء', 'عرض العملاء', 'الحسابات الجارية'],
            ckb: ['لیستی کریاران', 'پیشاندانی کریاران', 'ژمिryaryekan'],
        },
        description: {
            tr: 'Müşteri listesini açar',
            en: 'Opens the customer list',
            ar: 'يفتح قائمة العملاء',
            ckb: 'لیستی کریاران دەکاتەوە',
        },
    },
    {
        intent: 'open_stock',
        category: 'navigation',
        examples: {
            tr: ['Stok yönetimi', 'Stok ekranı', 'Envanter göster', 'Aç stok yönetimini', 'Göster stoğu'],
            en: ['Stock management', 'Show inventory', 'Open stock'],
            ar: ['إدارة المخزون', 'شاشة المخزون', 'عرض الجرد'],
            ckb: ['بەڕێوەبردنی کۆگا', 'شاشەی کۆگا', 'پیشاندانی کۆگا'],
        },
        description: {
            tr: 'Stok yönetimi ekranını açar',
            en: 'Opens the stock management screen',
            ar: 'يفتح شاشة إدارة المخزون',
            ckb: 'شاشەی بەڕێوەبردنی کۆگا دەکاتەوە',
        },
    },
    {
        intent: 'open_reports',
        category: 'navigation',
        examples: {
            tr: ['Raporları göster', 'Rapor ekranı', 'Raporlar', 'Aç raporları', 'Göster rapor ekranını'],
            en: ['Show reports', 'Reports screen', 'Open reports'],
            ar: ['عرض التقارير', 'شاشة التقارير', 'التقارير'],
            ckb: ['پیشاندانی ڕاپۆرتەکان', 'شاشەی ڕاپۆرت', 'ڕاپۆرتەکان'],
        },
        description: {
            tr: 'Raporlar ekranını açar',
            en: 'Opens the reports screen',
            ar: 'يفتح شاشة التقارير',
            ckb: 'شاشەی ڕاپۆرتەکان دەکاتەوە',
        },
    },
    {
        intent: 'open_dashboard',
        category: 'navigation',
        examples: {
            tr: ['Ana ekran', 'Dashboard aç', 'Panel göster', 'Ana sayfaya git', 'Aç ana ekranı', 'Göster paneli'],
            en: ['Dashboard', 'Open dashboard', 'Main screen', 'Go to home'],
            ar: ['لوحة التحكم', 'الشاشة الرئيسية', 'الذهاب للرئيسية'],
            ckb: ['داشبۆرد', 'شاشەی سەرەکی', 'بڕۆ بۆ سەرەکی'],
        },
        description: {
            tr: 'Ana kontrol panelini açar',
            en: 'Opens the main dashboard',
            ar: 'يفتح لوحة التحكم الرئيسية',
            ckb: 'داشبۆردی سەرەکی دەکاتەوە',
        },
    },

    // Search Commands
    {
        intent: 'search_customer',
        category: 'search',
        examples: {
            tr: [
                'Ahmet Yılmaz müşterisini bul',
                'Müşteri ara: Ali Demir',
                'Cari bul: Mehmet Kaya',
            ],
            en: [
                'Find customer John Doe',
                'Search customer: Jane Smith',
            ],
            ar: [
                'البحث عن العميل احمد',
                'ابحث عن عميل: علي',
            ],
            ckb: [
                'دۆزینەوەی کریار ئەحمەد',
                'گەڕان بۆ کریار: عەلی',
            ],
        },
        description: {
            tr: 'Belirtilen müşteriyi arar',
            en: 'Searches for the specified customer',
            ar: 'يبحث عن العميل المحدد',
            ckb: 'بەدوای کریاری دیاریکراودا دەگەڕێت',
        },
        parameters: ['name'],
    },
    {
        intent: 'search_product',
        category: 'search',
        examples: {
            tr: [
                'Çikolata ürününü bul',
                'Ürün ara: Süt',
                'Malzeme bul: Ekmek',
            ],
            en: [
                'Find product Chocolate',
                'Search product: Milk',
            ],
            ar: [
                'البحث عن منتج شاي',
                'ابحث عن منتج: حليب',
            ],
            ckb: [
                'دۆزینەوەی کاڵای چا',
                'گەڕان بۆ کاڵا: شیر',
            ],
        },
        description: {
            tr: 'Belirtilen ürünü arar',
            en: 'Searches for the specified product',
            ar: 'يبحث عن المنتج المحدد',
            ckb: 'بەدوای کاڵای دیاریکراودا دەگەڕێت',
        },
        parameters: ['name'],
    },
    {
        intent: 'check_stock',
        category: 'search',
        examples: {
            tr: [
                'Çikolata stokta var mı?',
                'Süt stok durumu',
                'Ekmek stoğu kontrol et',
            ],
            en: [
                'Is Chocolate in stock?',
                'Check Milk stock',
            ],
            ar: [
                'هل الشاي متوفر؟',
                'فحص مخزون الحليب',
            ],
            ckb: [
                'ئایا چا لە کۆگا هەیە؟',
                'پشکنینی کۆگای شیر',
            ],
        },
        description: {
            tr: 'Ürünün stok durumunu kontrol eder',
            en: 'Checks the stock status of a product',
            ar: 'يتحقق من حالة مخزون المنتج',
            ckb: 'پشکنینی دۆخی کۆگای کاڵا دەکات',
        },
        parameters: ['product'],
    },
    {
        intent: 'show_today_sales',
        category: 'search',
        examples: {
            tr: [
                'Bugünkü satışları göster',
                'Bugün satışlar',
                'Today sales',
            ],
            en: [
                'Show today\'s sales',
                'Today sales',
            ],
            ar: [
                'عرض مبيعات اليوم',
                'مبيعات اليوم',
            ],
            ckb: [
                'پیشاندانی فرۆشتنی ئەمڕۆ',
                'فرۆشتنەکانی ئەمڕۆ',
            ],
        },
        description: {
            tr: 'Bugünkü satışları gösterir',
            en: 'Shows today\'s sales',
            ar: 'يعرض مبيعات اليوم',
            ckb: 'فرۆشتنەکانی ئەمڕۆ پیشان دەدات',
        },
    },
    {
        intent: 'query_price',
        category: 'search',
        examples: {
            tr: [
                'Çikolata fiyatı ne kadar?',
                'Süt fiyatını söyle',
                'Price of Ekmek',
            ],
            en: [
                'What is the price of Chocolate?',
                'Tell me the price of Milk',
            ],
            ar: [
                'كم سعر الشاي؟',
                'ما هو سعر الحليب؟',
            ],
            ckb: [
                'نرخی چا چەندە؟',
                'نرخی شیرم پێ بڵێ',
            ],
        },
        description: {
            tr: 'Ürün fiyatını sorgular',
            en: 'Queries the product price',
            ar: 'يستعلم عن سعر المنتج',
            ckb: 'پرسیار لە نرخی کاڵا دەکات',
        },
        parameters: ['product'],
    },

    // Create Commands
    {
        intent: 'add_product',
        category: 'create',
        examples: {
            tr: [
                'Yeni ürün ekle',
                'Yeni malzeme ekle: Çikolata',
                'Yeni ürün ekle: Süt, fiyat 15 lira, stok 100',
            ],
            en: [
                'Add new product',
                'Add new product: Chocolate, price 15',
            ],
            ar: [
                'إضافة منتج جديد',
                'أضف منتج: شاي',
            ],
            ckb: [
                'زیادکردنی کاڵای نوێ',
                'کاڵای نوێ زیاد بکە: چا',
            ],
        },
        description: {
            tr: 'Yeni ürün ekler veya ürün ekleme formunu açar',
            en: 'Adds a new product or opens the product form',
            ar: 'يضيف منتجًا جديدًا أو يفتح نموذج المنتج',
            ckb: 'کاڵای نوێ زیاد دەکات یان فۆرمی کاڵا دەکاتەوە',
        },
        parameters: ['name', 'price', 'stock'],
    },
    {
        intent: 'add_customer',
        category: 'create',
        examples: {
            tr: [
                'Yeni müşteri ekle',
                'Yeni müşteri kaydet: Ali Demir',
                'Yeni cari ekle: Mehmet Kaya, telefon 555-1234',
            ],
            en: [
                'Add new customer',
                'Add customer: John Doe, phone 555-1234',
            ],
            ar: [
                'إضافة عميل جديد',
                'أضف عميل: أحمد',
            ],
            ckb: [
                'زیادکردنی کریاری نوێ',
                'کریار زیاد بکە: ئەحمەد',
            ],
        },
        description: {
            tr: 'Yeni müşteri ekler veya müşteri ekleme formunu açar',
            en: 'Adds a new customer or opens the customer form',
            ar: 'يضيف عميلًا جديدًا أو يفتح نموذج العميل',
            ckb: 'کریاری نوێ زیاد دەکات یان فۆرمی کریار دەکاتەوە',
        },
        parameters: ['name', 'phone'],
    },
    {
        intent: 'create_invoice',
        category: 'create',
        examples: {
            tr: [
                'Yeni fatura oluştur',
                'Yeni fatura ekle',
                'Create new invoice',
            ],
            en: [
                'Create new invoice',
                'Add new invoice',
            ],
            ar: [
                'إنشاء فاتورة جديدة',
                'أضف فاتورة جديدة',
            ],
            ckb: [
                'درستکردنی پسوڵەی نوێ',
                'لیستی نوێ زیاد بکە',
            ],
        },
        description: {
            tr: 'Yeni fatura oluşturur',
            en: 'Creates a new invoice',
            ar: 'ينشئ فاتورة جديدة',
            ckb: 'پسوڵەیەکی نوێ دروست دەکات',
        },
    },

    // Transaction Commands
    {
        intent: 'process_payment',
        category: 'transaction',
        examples: {
            tr: [
                'Ödeme al',
                'Tahsilat yap',
                'Process payment',
            ],
            en: [
                'Process payment',
                'Take payment',
            ],
            ar: [
                'معالجة الدفع',
                'استلام دفعة',
            ],
            ckb: [
                'پرۆسەی پارەدان',
                'وەرگرتنی پارە',
            ],
        },
        description: {
            tr: 'Ödeme işlemi başlatır',
            en: 'Initiates payment processing',
            ar: 'يبدأ عملية الدفع',
            ckb: 'دەست بە پرۆسەی پارەدان دەکات',
        },
    },
    {
        intent: 'print_document',
        category: 'transaction',
        examples: {
            tr: [
                'Fatura yazdır',
                'Fiş bas',
                'Print invoice',
            ],
            en: [
                'Print invoice',
                'Print receipt',
            ],
        },
        description: {
            tr: 'Belge yazdırır',
            en: 'Prints the document',
            ar: 'يطبع المستند',
            ckb: 'بەڵگەنامەکە چاپ دەکات',
        },
    },
];

/**
 * Supported types definition
 */
export type SupportedLanguage = 'tr' | 'en' | 'ar' | 'ckb';

/**
 * Get command examples by category
 */
export function getCommandsByCategory(category: CommandDefinition['category'], language: SupportedLanguage = 'tr'): string[] {
    return VOICE_COMMAND_DEFINITIONS
        .filter(cmd => cmd.category === category)
        .flatMap(cmd => cmd.examples[language]?.slice(0, 1) || cmd.examples['en'].slice(0, 1)); // Create fallback
}

/**
 * Get all command examples for a specific language
 */
export function getAllCommandExamples(language: SupportedLanguage = 'tr'): string[] {
    return VOICE_COMMAND_DEFINITIONS
        .flatMap(cmd => cmd.examples[language]?.slice(0, 1) || cmd.examples['en'].slice(0, 1));
}

/**
 * Get popular/frequently used commands
 */
export function getPopularCommands(language: SupportedLanguage = 'tr'): string[] {
    const popularIntents = [
        'open_sales_invoice',
        'open_products',
        'open_customers',
        'show_today_sales',
        'add_product',
        'search_customer',
    ];

    return VOICE_COMMAND_DEFINITIONS
        .filter(cmd => popularIntents.includes(cmd.intent))
        .map(cmd => cmd.examples[language][0]);
}

/**
 * Get command definition by intent
 */
export function getCommandDefinition(intent: string): CommandDefinition | undefined {
    return VOICE_COMMAND_DEFINITIONS.find(cmd => cmd.intent === intent);
}

/**
 * Search commands by keyword
 */
export function searchCommands(keyword: string, language: SupportedLanguage = 'tr'): CommandDefinition[] {
    const lowerKeyword = keyword.toLowerCase();

    return VOICE_COMMAND_DEFINITIONS.filter(cmd => {
        const examples = cmd.examples[language].join(' ').toLowerCase();
        const description = cmd.description[language].toLowerCase();
        return examples.includes(lowerKeyword) || description.includes(lowerKeyword);
    });
}

