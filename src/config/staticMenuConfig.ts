// Statik Menü Yapısı - Otomatik Oluşturuldu
// Bu dosya MenuManagementPanel'den dışa aktarılmıştır

import {
    PieChart, Store, Map, Settings, Zap, FileSpreadsheet,
    FileText, FileCheck, FileMinus, Truck, Archive,
    ShoppingCart, FileSignature, Users, Target, ShoppingBag, ClipboardList,
    Package, Warehouse, TrendingDown, Boxes, QrCode, Tag, Scale,
    Briefcase, GitBranch, Calendar, Award, Wallet, CreditCard, Database,
    Globe, Receipt, Building, Calculator, TrendingUpDown, Gift, Percent,
    PackageSearch, Wrench, Shield, UserCog, UtensilsCrossed, Phone, Bell,
    Smartphone, Mail, BarChart3, TrendingUp, UserCheck, Layers, Clock, AlertCircle,
    Radio, ArrowRightLeft, MoreVertical, Menu, Sparkles, DollarSign, Mic, Landmark, Layout
} from 'lucide-react';
import { Translations } from '../locales/translations';

// Function to get menu sections with translations
export const getStaticMenuSections = (t: Translations) => [
    {
        id: 'main-menu',
        title: t.menu.mainMenu,
        items: [
            { label: t.menu.homepage, screen: 'dashboard', icon: Sparkles },
            { label: t.menu.dashboard, screen: 'Dashboard', icon: PieChart },
            {
                label: t.menu.storeManagement,
                screen: 'store-management-group',
                icon: Store,
                badge: 'YENİ',
                children: [
                    { label: t.menu.storePanel, screen: 'store-management', icon: Store },
                    { label: t.menu.storeTransfer, screen: 'interstore-transfer', icon: ArrowRightLeft },
                    { label: t.menu.multiStoreManagement, screen: 'multistore', icon: Store },
                    { label: t.menu.regionalFranchiseManagement, screen: 'regional', icon: Map },
                    { label: t.menu.storeConfiguration, screen: 'storeconfig', icon: Settings }
                ]
            },
            { label: t.menu.dataBroadcast, screen: 'databroadcast', icon: Radio },
            { label: t.menu.integrations, screen: 'integrations', icon: Zap },
            { label: t.menu.excelOperations, screen: 'excel', icon: FileSpreadsheet }
        ]
    },
    {
        id: 'material-management',
        title: t.menu.materialManagement,
        screen: 'products',
        items: [
            {
                label: t.menu.masterRecords,
                screen: 'material-definitions',
                icon: Settings,
                children: [
                    { label: t.menu.materialClasses, screen: 'material-classes', icon: Tag },
                    { label: t.menu.materials, screen: 'products', icon: Package },
                    { label: t.menu.unitSets, screen: 'unit-sets', icon: Scale },
                    { label: t.menu.variants, screen: 'variants', icon: Tag },
                    { label: t.menu.specialCodes, screen: 'special-codes', icon: Tag },
                    { label: t.menu.brandDefinitions, screen: 'brand-definitions', icon: Tag },
                    { label: t.menu.groupCodes, screen: 'group-codes', icon: Tag },
                    { label: t.menu.productCategories, screen: 'product-categories', icon: Tag }
                ]
            },
            {
                label: t.menu.movements,
                screen: 'material-movements',
                icon: TrendingDown,
                children: [

                    { label: t.menu.materialManagementSlips, screen: 'stockmovements', icon: TrendingDown }
                ]
            },
            {
                label: t.menu.reports,
                screen: 'material-reports',
                icon: BarChart3,
                children: [
                    { label: t.menu.materialExtract, screen: 'report-material-extract', icon: BarChart3 },
                    { label: t.menu.materialValue, screen: 'report-material-value', icon: BarChart3 },
                    { label: t.menu.inventory, screen: 'inventory', icon: BarChart3 },
                    { label: t.menu.cost, screen: 'cost', icon: BarChart3 },
                    { label: t.menu.inOutTotals, screen: 'report-in-out-totals', icon: BarChart3 },
                    { label: t.menu.materialWarehouseStatus, screen: 'report-warehouse-status', icon: BarChart3 },
                    { label: t.menu.transactionBreakdown, screen: 'report-transaction-breakdown', icon: BarChart3 },
                    { label: t.menu.slipList, screen: 'report-slip-list', icon: FileText },
                    { label: t.menu.minMaxStock, screen: 'report-min-max', icon: BarChart3 }
                ]
            }
        ]
    },
    {
        id: 'invoices',
        title: t.menu.invoices,
        screen: 'salesinvoice',
        items: [
            {
                label: t.menu.salesInvoices,
                screen: 'salesinvoice',
                icon: FileText,
                children: [
                    { label: t.menu.salesInvoice, screen: 'sales-invoice-standard', icon: FileText },
                    { label: t.menu.retailSales, screen: 'sales-invoice-retail', icon: FileText },
                    { label: t.menu.wholesaleSales, screen: 'sales-invoice-wholesale', icon: FileText },
                    { label: t.menu.consignmentSales, screen: 'sales-invoice-consignment', icon: FileText },
                    { label: t.menu.salesReturn, screen: 'sales-invoice-return', icon: FileMinus }
                ]
            },
            {
                label: t.menu.purchasing,
                screen: 'purchaseinvoice',
                icon: FileCheck,
                children: [
                    { label: t.menu.requestSlips, screen: 'purchaserequest', icon: ClipboardList },
                    { label: t.menu.purchaseOrders, screen: 'purchase', icon: ShoppingBag },
                    { label: t.menu.purchaseInvoice, screen: 'purchase-invoice-standard', icon: FileCheck },
                    { label: t.menu.purchaseReturn, screen: 'purchase-invoice-return', icon: FileMinus },
                    { label: t.menu.receivedService, screen: 'serviceinvoice-received', icon: FileText }
                ]
            },
            {
                label: t.menu.serviceInvoices,
                screen: 'serviceinvoice',
                icon: FileText,
                children: [

                    { label: t.menu.serviceInvoiceIssued, screen: 'serviceinvoice-given', icon: FileText },
                    { label: t.menu.serviceInvoiceReceived, screen: 'serviceinvoice-received', icon: FileCheck }
                ]
            },
            {
                label: t.menu.waybills,
                screen: 'waybill',
                icon: Truck,
                children: [
                    { label: t.menu.salesWaybill, screen: 'waybill-sales', icon: Truck },
                    { label: t.menu.purchaseWaybill, screen: 'waybill-purchase', icon: Truck },
                    { label: t.menu.warehouseTransferWaybill, screen: 'waybill-transfer', icon: Truck },
                    { label: t.menu.wasteWaybill, screen: 'waybill-fire', icon: Truck }
                ]
            },
            {
                label: t.menu.orders,
                screen: 'Siparişler',
                icon: ShoppingBag,
                children: [
                    { label: t.menu.salesOrder, screen: 'salesorder', icon: ShoppingBag },
                    { label: t.menu.purchaseOrders, screen: 'purchase', icon: ShoppingBag }
                ]
            },
            {
                label: t.menu.offers,
                screen: 'Teklifler',
                icon: FileSignature
            }
        ]
    },
    {
        id: 'finance-management',
        title: t.menu.financeManagement,
        items: [
            {
                label: t.menu.definitions,
                screen: 'finance-definitions',
                icon: Settings,
                children: [
                    { label: t.menu.paymentPlans, screen: 'payment-plans', icon: Calendar },
                    // { label: t.menu.bankPaymentPlans, screen: 'bank-payment-plans', icon: Calendar },
                    // { label: t.menu.campaignDefinitions, screen: 'campaigndefs', icon: Percent }
                ]
            },
            {
                label: t.menu.cards,
                screen: 'finance-cards',
                icon: FileText,
                children: [
                    { label: t.menu.currentAccounts, screen: 'suppliers', icon: Building },
                    { label: 'Kasa Kartları', screen: 'cashbank', icon: Wallet },
                    // { label: 'Banka Kartları', screen: 'banks', icon: Landmark },
                    // { label: t.menu.bankAccounts, screen: 'bank-accounts', icon: CreditCard }
                ]
            },
            {
                label: t.menu.movements,
                screen: 'finance-movements',
                icon: TrendingDown,
                children: [
                    // { label: t.menu.currentAccountSlips, screen: 'currentaccounts', icon: Receipt },
                    { label: t.menu.cashOperations, screen: 'kasalar', icon: Wallet },
                    // { label: 'Banka İşlemleri', screen: 'banks', icon: Landmark },
                    { label: t.menu.cashSlips, screen: 'cash-slips', icon: Receipt },
                    // { label: t.menu.bankSlips, screen: 'bank-vouchers', icon: Receipt },
                    // { label: t.menu.creditCardPosSlips, screen: 'payment', icon: CreditCard },
                    // { label: t.menu.journalAndSlips, screen: 'accounting', icon: FileSpreadsheet }
                ]
            },
            /* {
                label: t.menu.reports,
                screen: 'finance-reports',
                icon: BarChart3,
                children: [
                    { label: t.menu.currentAccountReports, screen: 'financereports', icon: BarChart3 },
                    { label: t.menu.cashReports, screen: 'financereports', icon: BarChart3 },
                    { label: t.menu.bankReports, screen: 'financereports', icon: BarChart3 },
                    { label: t.menu.trialBalanceReport, screen: 'mizan', icon: BarChart3 }
                ]
            }, */
            {
                label: t.menu.other,
                screen: 'finance-other',
                icon: MoreVertical,
                children: [
                    // { label: t.menu.accountingManagement, screen: 'accounting-mgmt', icon: DollarSign, badge: 'YENİ' },
                    // { label: t.menu.expenseManagement, screen: 'revenueexpense', icon: Receipt },
                    // { label: t.menu.checkPromissory, screen: 'checkpromissory', icon: Receipt },
                    // { label: t.menu.collectionPayment, screen: 'collectionpayment', icon: CreditCard },
                    { label: t.menu.multiCurrency, screen: 'multicurrency', icon: Globe },
                    // { label: t.menu.accountingVouchers, screen: 'accounting', icon: FileSpreadsheet }
                ]
            }
        ]
    },
    {
        id: 'retail',
        title: t.menu.retail,
        items: [
            {
                label: t.menu.priceAndCampaign,
                screen: 'pricing'
            },
            { label: t.menu.scaleAndWeighedSales, screen: 'cashier-scale', icon: Scale, badge: 'YENİ' }
        ]
    },
    {
        id: 'communication-notifications',
        title: t.menu.communicationAndNotifications,
        items: [
            { label: t.menu.whatsappIntegration, screen: 'whatsapp', icon: Phone },
            { label: t.menu.notificationCenter, screen: 'notifications', icon: Bell },
            { label: t.menu.smsManagement, screen: 'smsmanage', icon: Smartphone },
            { label: t.menu.emailCampaigns, screen: 'emailcamp', icon: Mail }
        ]
    },
    {
        id: 'reports-analysis',
        title: t.menu.reportsAndAnalysis,
        screen: 'customreports',
        items: [
            {
                label: t.menu.dashboard,
                screen: 'analytics-dashboard-group',
                icon: PieChart,
                children: [
                    { label: t.menu.aiProductAnalytics, screen: 'product-analytics', icon: BarChart3, badge: 'AI' },
                    { label: t.menu.profitabilityAnalyticsDashboard, screen: 'profit-dashboard', icon: TrendingUp },
                    { label: t.menu.biDashboardAi, screen: 'bi-dashboard', icon: PieChart }
                ]
            },
            {
                label: 'Genel Rapor', // Updated per user request
                screen: 'customreports',
                icon: FileSpreadsheet
            },
            {
                label: t.menu.advancedReports100,
                screen: 'advanced-reports',
                icon: FileText
            },
            {
                label: 'Dizayn Merkezi',
                screen: 'report-designer',
                icon: Layout,
                badge: 'YENİ'
            },
            {
                label: 'Etiket Tasarımcı',
                screen: 'label-designer',
                icon: Tag
            }
        ]
    },
    {
        id: 'system-management',
        title: t.menu.systemManagement,
        items: [
            { label: t.menu.firmPeriodDefinitions, screen: 'firm-period-definitions', icon: Building },
            { label: t.menu.workflowAutomation, screen: 'workflow-automation', icon: Zap, badge: 'AI' },
            { label: t.menu.demoDataManagement, screen: 'demo-data', icon: Database, badge: 'TEST' },
            { label: t.menu.databaseInfrastructure, screen: 'database-settings', icon: Database, badge: 'YENİ' },
            { label: t.menu.exSecureGateSecurity, screen: 'security-modules', icon: Shield, badge: 'BETA' },
            { label: t.menu.generalSettings, screen: 'generalsettings', icon: Settings },
            { label: t.menu.userManagement, screen: 'usermanagement', icon: UserCheck },
            { label: t.menu.roleAndAuthorization, screen: 'roleauth', icon: Shield },
            { label: t.menu.menuManagement, screen: 'menumanagement', icon: Menu },
            { label: t.menu.definitionsParameters, screen: 'Tanımlar', icon: Database },
            { label: t.menu.backupRestore, screen: 'backuprestore', icon: Layers },
            { label: t.menu.logAudit, screen: 'logaudit', icon: Clock },
            { label: t.menu.systemHealth, screen: 'systemhealth', icon: AlertCircle }
        ]
    }
];

// Keep the old export for backward compatibility (will use Turkish by default)
// This will be removed once ManagementModule is updated
export const staticMenuSections = getStaticMenuSections({
    menu: {
        materialManagement: 'Malzeme Yönetimi',
        mainMenu: 'Ana Menü',
        invoices: 'Faturalar',
        financeManagement: 'Finans Yönetimi',
        retail: 'Retail',
        communicationAndNotifications: 'İletişim & Bildirimler',
        reportsAndAnalysis: 'Raporlar & Analiz',
        systemManagement: 'Sistem Yönetimi',
        masterRecords: 'Ana Kayıtlar',
        movements: 'Hareketler',
        reports: 'Raporlar',
        definitions: 'Tanımlar',
        cards: 'Kartlar',
        other: 'Diğer',
        dashboard: 'Dashboard',
        storeManagement: 'Mağaza Yönetimi',
        salesInvoices: 'Satış Faturaları',
        purchasing: 'Satın Alma',
        serviceInvoices: 'Hizmet Faturaları',
        waybills: 'İrsaliyeler',
        orders: 'Siparişler',
        offers: 'Teklifler',
        materialClasses: 'Malzeme Sınıfları',
        materials: 'Malzemeler',
        unitSets: 'Birim Setleri',
        variants: 'Varyantlar',
        specialCodes: 'Özel Kodlar',
        brandDefinitions: 'Marka Tanımları',
        groupCodes: 'Grup Kodları',
        productCategories: 'Ürün Kategorileri',
        stockManagementPanel: 'Stok Yönetim Paneli',
        materialManagementSlips: 'Malzeme Yönetim Fişleri',
        materialExtract: 'Malzeme Ekstresi',
        materialValue: 'Malzeme Değer',
        inventory: 'Envanter',
        cost: 'Maliyet',
        inOutTotals: 'Giriş Çıkış Toplamları',
        materialWarehouseStatus: 'Malzeme Ambar Durum',
        transactionBreakdown: 'Hareket Dökümü',
        slipList: 'Fiş Listesi',
        minMaxStock: 'Minimum Maksimum Stok',
        homepage: 'Anasayfa',
        storePanel: 'Mağaza Paneli',
        storeTransfer: 'Mağaza Transferi',
        multiStoreManagement: 'Çoklu Mağaza Yönetimi',
        regionalFranchiseManagement: 'Bölgesel Bayilik Yönetimi',
        storeConfiguration: 'Mağaza Yapılandırması',
        dataBroadcast: 'Bilgi Gönder/Al',
        integrations: 'Entegrasyonlar',
        excelOperations: 'Excel İşlemleri',
        salesInvoice: 'Toptan Satış Faturası',
        retailSales: 'Perakende Satış',
        wholesaleSales: 'Toptan Satış',
        consignmentSales: 'Konsinye Satış',
        salesReturn: 'Satış İade',
        requestSlips: 'Talep Fişleri',
        purchaseOrders: 'Satınalma Siparişleri',
        purchaseInvoice: 'Alış Faturası',
        purchaseReturn: 'Alış İade',
        receivedService: 'Alınan Hizmet',
        supplierCards: 'Tedarikçi Kartları',
        serviceInvoiceIssued: 'Verilen Hizmet Faturası',
        serviceInvoiceReceived: 'Alınan Hizmet Faturası',
        salesWaybill: 'Satış İrsaliyesi',
        purchaseWaybill: 'Alış İrsaliyesi',
        warehouseTransferWaybill: 'Depo Transfer İrsaliyesi',
        wasteWaybill: 'Fire İrsaliyesi',
        salesOrder: 'Satış Siparişi',
        paymentPlans: 'Ödeme Planları',
        bankPaymentPlans: 'Banka Ödeme Planları',
        campaignDefinitions: 'Kampanya Tanımları',
        currentAccounts: 'Cari Hesaplar',
        cashAccounts: 'Kasa Hesapları',
        banks: 'Bankalar',
        bankAccounts: 'Banka Hesapları',
        currentAccountSlips: 'Cari Hesap Fişleri',
        cashOperations: 'Kasa İşlemleri',
        cashSlips: 'Kasa Fişleri',
        bankSlips: 'Banka Fişleri',
        creditCardPosSlips: 'Kredi Kartı Pos Fişleri',
        journalAndSlips: 'Yevmiye Defteri & Fişler',
        currentAccountReports: 'Cari Hesap Raporları',
        cashReports: 'Kasa Raporları',
        bankReports: 'Banka Raporları',
        trialBalanceReport: 'Mizan Raporu',
        accountingManagement: 'Muhasebe Yönetimi',
        expenseManagement: 'Gider Yönetimi',
        checkPromissory: 'Çek/Senet',
        collectionPayment: 'Tahsilat/Ödeme',
        multiCurrency: 'Çoklu Para Birimi',
        accountingVouchers: 'Muhasebe Fişleri',
        priceAndCampaign: 'Fiyat & Kampanya',
        scaleAndWeighedSales: 'Terazi & Tartılı Satış',
        whatsappIntegration: 'WhatsApp Entegrasyonu',
        notificationCenter: 'Bildirim Merkezi',
        smsManagement: 'SMS Yönetimi',
        emailCampaigns: 'E-posta Kampanyaları',
        aiProductAnalytics: 'AI Ürün Analitiği',
        profitabilityAnalyticsDashboard: '💰 Karlılık Analizi',
        graphicalAnalysis: 'Grafiksel Analiz',
        biDashboardAi: 'BI Dashboard & AI',
        trialBalance: 'Mizan (Trial Balance)',
        incomeStatement: 'Gelir Tablosu',
        balanceSheet: 'Bilanço (Balance Sheet)',
        salesReports: 'Satış Raporları',
        stockReports: 'Stok Raporları',
        customerAnalysis: 'Müşteri Analizi',
        advancedReports100: '⭐ Gelişmiş Raporlar (100+)',
        customReports: 'Özel Raporlar',
        firmPeriodDefinitions: 'Firma/Dönem Tanımları',
        workflowAutomation: 'Workflow Otomasyonu',
        demoDataManagement: 'Demo Veri Yönetimi',
        databaseInfrastructure: 'Database Altyapısı',
        exSecureGateSecurity: 'ExSecureGate (Güvenlik)',
        generalSettings: 'Genel Ayarlar',
        userManagement: 'Kullanıcı Yönetimi',
        roleAndAuthorization: 'Rol & Yetkilendirme',
        menuManagement: 'Menü Yönetimi',
        definitionsParameters: 'Tanımlar/Parametreler',
        backupRestore: 'Yedekleme/Geri Yükleme',
        logAudit: 'Log/Denetim',
        systemHealth: 'Sistem Sağlığı'
    }
} as any);

