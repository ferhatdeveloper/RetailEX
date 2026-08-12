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
    Radio, ArrowRightLeft, MoreVertical, Menu, Sparkles, Banknote, Mic
} from 'lucide-react';
import { Translations } from '../locales/translations';

// Function to get menu sections with translations
export const getStaticMenuSections = (t: Translations) => [
    {
        title: 'Malzeme Yönetimi', // 'Malzeme Yönetimi'
        items: [
            {
                label: 'Ana Kayıtlar', // 'Ana Kayıtlar'
                screen: 'material-definitions',
                icon: Settings,
                children: [
                    { label: 'Malzeme Sınıfları', screen: 'material-classes', icon: Tag },
                    { label: 'Malzemeler', screen: 'products', icon: Package },
                    { label: 'Birim Setleri', screen: 'unit-sets', icon: Scale },
                    { label: 'Varyantlar', screen: 'variants', icon: Tag },
                    { label: 'Özel Kodlar', screen: 'special-codes', icon: Tag },
                    { label: 'Marka Tanımları', screen: 'brand-definitions', icon: Tag },
                    { label: 'Grup Kodları', screen: 'group-codes', icon: Tag },
                    { label: 'Ürün Kategorileri', screen: 'product-categories', icon: Tag }
                ]
            },
            {
                label: 'Hareketler',
                screen: 'material-movements',
                icon: TrendingDown,
                children: [
                    { label: 'Stok Yönetim Paneli', screen: 'stock-dashboard', icon: PieChart },
                    { label: 'Malzeme Yönetim Fişleri', screen: 'stockmovements', icon: TrendingDown }
                ]
            },
            {
                label: 'Raporlar',
                screen: 'material-reports',
                icon: BarChart3,
                children: [
                    { label: 'Malzeme Ekstresi', screen: 'report-material-extract', icon: BarChart3 },
                    { label: 'Malzeme Değer', screen: 'report-material-value', icon: BarChart3 },
                    { label: 'Envanter', screen: 'inventory', icon: BarChart3 },
                    { label: 'Maliyet', screen: 'cost', icon: BarChart3 },
                    { label: 'Giriş Çıkış Toplamları', screen: 'report-in-out-totals', icon: BarChart3 },
                    { label: 'Malzeme Ambar Durum', screen: 'report-warehouse-status', icon: BarChart3 },
                    { label: 'Hareket Dökümü', screen: 'report-transaction-breakdown', icon: BarChart3 },
                    { label: 'Fiş Listesi', screen: 'report-slip-list', icon: FileText },
                    { label: 'Minimum Maksimum Stok', screen: 'report-min-max', icon: BarChart3 }
                ]
            }
        ]
    },
    {
        title: 'Ana Menü',
        items: [
            { label: 'Dashboard', screen: 'Dashboard', icon: PieChart },
            {
                label: 'Mağaza Yönetimi',
                screen: 'store-management-group',
                icon: Store,
                badge: 'YENİ',
                children: [
                    { label: 'Mağaza Paneli', screen: 'store-management', icon: Store },
                    { label: 'Mağaza Transferi', screen: 'interstore-transfer', icon: ArrowRightLeft },
                    { label: 'Çoklu Mağaza Yönetimi', screen: 'multistore', icon: Store },
                    { label: 'Bölgesel Bayilik Yönetimi', screen: 'regional', icon: Map },
                    { label: 'Mağaza Yapılandırması', screen: 'storeconfig', icon: Settings }
                ]
            },
            { label: 'Bilgi Gönder/Al', screen: 'databroadcast', icon: Radio },
            { label: 'Entegrasyonlar', screen: 'integrations', icon: Zap },
            { label: 'Excel İşlemleri', screen: 'excel', icon: FileSpreadsheet }
        ]
    },
    {
        title: 'Faturalar',
        items: [
            {
                label: 'Satış Faturaları',
                screen: 'salesinvoice',
                icon: FileText,
                children: [
                    { label: 'Satış Faturası', screen: 'sales-invoice-standard', icon: FileText },
                    { label: 'Perakende Satış', screen: 'sales-invoice-retail', icon: FileText },
                    { label: 'Toptan Satış', screen: 'sales-invoice-wholesale', icon: FileText },
                    { label: 'Konsinye Satış', screen: 'sales-invoice-consignment', icon: FileText },
                    { label: 'Satış İade', screen: 'sales-invoice-return', icon: FileMinus }
                ]
            },
            {
                label: 'Satın Alma',
                screen: 'purchaseinvoice',
                icon: FileCheck,
                children: [
                    { label: 'Talep Fişleri', screen: 'purchaserequest', icon: ClipboardList },
                    { label: 'Satınalma Siparişleri', screen: 'purchase', icon: ShoppingBag },
                    { label: 'Alış Faturası', screen: 'purchase-invoice-standard', icon: FileCheck },
                    { label: 'Alış İade', screen: 'purchase-invoice-return', icon: FileMinus },
                    { label: 'Alınan Hizmet', screen: 'serviceinvoice-received', icon: FileText }
                ]
            },
            {
                label: 'Hizmet Faturaları',
                screen: 'serviceinvoice',
                icon: FileText,
                children: [
                    { label: 'Tedarikçi Kartları', screen: 'suppliers', icon: Truck },
                    { label: 'Verilen Hizmet Faturası', screen: 'serviceinvoice-given', icon: FileText },
                    { label: 'Alınan Hizmet Faturası', screen: 'serviceinvoice-received', icon: FileCheck }
                ]
            },
            {
                label: 'İrsaliyeler',
                screen: 'waybill',
                icon: Truck,
                children: [
                    { label: 'Satış İrsaliyesi', screen: 'waybill-sales', icon: Truck },
                    { label: 'Alış İrsaliyesi', screen: 'waybill-purchase', icon: Truck },
                    { label: 'Depo Transfer İrsaliyesi', screen: 'waybill-transfer', icon: Truck },
                    { label: 'Fire İrsaliyesi', screen: 'waybill-fire', icon: Truck }
                ]
            },
            {
                label: 'Siparişler',
                screen: 'Siparişler',
                icon: ShoppingBag,
                children: [
                    { label: 'Satış Siparişi', screen: 'sales-order', icon: ShoppingBag }
                ]
            },
            {
                label: 'Teklifler',
                screen: 'Teklifler',
                icon: FileSignature
            }
        ]
    },
    {
        title: 'Finans Yönetimi',
        items: [
            {
                label: 'Tanımlar',
                screen: 'finance-definitions',
                icon: Settings,
                children: [
                    { label: 'Ödeme Planları', screen: 'payment-plans', icon: Calendar },
                    { label: 'Banka Ödeme Planları', screen: 'bank-payment-plans', icon: Calendar },
                    { label: 'Kampanya Tanımları', screen: 'campaigndefs', icon: Percent }
                ]
            },
            {
                label: 'Kartlar',
                screen: 'finance-cards',
                icon: FileText,
                children: [
                    { label: 'Cari Hesaplar', screen: 'suppliers', icon: Building },
                    { label: 'Kasa Hesapları', screen: 'cashbank', icon: Wallet },
                    { label: 'Bankalar', screen: 'banks', icon: Building },
                    { label: 'Banka Hesapları', screen: 'bank-accounts', icon: CreditCard }
                ]
            },
            {
                label: 'Hareketler',
                screen: 'finance-movements',
                icon: TrendingDown,
                children: [
                    { label: 'Cari Hesap Fişleri', screen: 'currentaccounts', icon: Receipt },
                    { label: 'Kasa İşlemleri', screen: 'kasalar', icon: Wallet },
                    { label: 'Kasa Fişleri', screen: 'cashbank', icon: Receipt },
                    { label: 'Banka Fişleri', screen: 'bank-vouchers', icon: Receipt },
                    { label: 'Kredi Kartı Pos Fişleri', screen: 'payment', icon: CreditCard },
                    { label: 'Yevmiye Defteri & Fişler', screen: 'accounting', icon: FileSpreadsheet }
                ]
            },
            {
                label: 'Raporlar',
                screen: 'finance-reports',
                icon: BarChart3,
                children: [
                    { label: 'Cari Hesap Raporları', screen: 'financereports', icon: BarChart3 },
                    { label: 'Kasa Raporları', screen: 'financereports', icon: BarChart3 },
                    { label: 'Banka Raporları', screen: 'financereports', icon: BarChart3 },
                    { label: 'Mizan Raporu', screen: 'mizan', icon: BarChart3 }
                ]
            },
            {
                label: 'Diğer',
                screen: 'finance-other',
                icon: MoreVertical,
                children: [
                    { label: 'Muhasebe Yönetimi', screen: 'accounting-mgmt', icon: Banknote, badge: 'YENİ' },
                    { label: 'Gider Yönetimi', screen: 'revenueexpense', icon: Receipt },
                    { label: 'Çek/Senet', screen: 'checkpromissory', icon: Receipt },
                    { label: 'Tahsilat/Ödeme', screen: 'collectionpayment', icon: CreditCard },
                    { label: 'Çoklu Para Birimi', screen: 'multicurrency', icon: Globe },
                    { label: 'Muhasebe Fişleri', screen: 'accounting', icon: FileSpreadsheet }
                ]
            }
        ]
    },
    {
        title: 'Retail',
        items: [
            {
                label: 'Fiyat & Kampanya',
                screen: 'pricing'
            },
            { label: 'Terazi & Tartılı Satış', screen: 'cashier-scale', icon: Scale, badge: 'YENİ' }
        ]
    },
    {
        title: 'İletişim & Bildirimler',
        items: [
            { label: 'WhatsApp Entegrasyonu', screen: 'whatsapp', icon: Phone },
            { label: 'Bildirim Merkezi', screen: 'notifications', icon: Bell },
            { label: 'SMS Yönetimi', screen: 'smsmanage', icon: Smartphone },
            { label: 'E-posta Kampanyaları', screen: 'emailcamp', icon: Mail }
        ]
    },
    {
        title: 'Raporlar & Analiz',
        items: [
            {
                label: 'Analitik Raporlar',
                screen: 'analytics-group',
                icon: BarChart3,
                badge: 'AI',
                children: [
                    { label: 'AI Ürün Analitiği', screen: 'product-analytics', icon: BarChart3 },
                    { label: 'Karlılık Analizi Dashboard', screen: 'profit-dashboard', icon: TrendingUp },
                    { label: 'Grafiksel Analiz', screen: 'graphanalysis', icon: TrendingUp },
                    { label: 'BI Dashboard & AI', screen: 'bi-dashboard', icon: PieChart }
                ]
            },
            {
                label: 'Satış & Stok Raporları',
                screen: 'sales-stock-group',
                icon: ShoppingCart,
                children: [
                    { label: 'Satış Raporları', screen: 'salesreports', icon: BarChart3 },
                    { label: 'Stok Raporları', screen: 'stockreports', icon: Package },
                    { label: 'Müşteri Analizi', screen: 'customeranalysis', icon: Users }
                ]
            },
            {
                label: 'Finansal Raporlar',
                screen: 'finance-reps-group',
                icon: Banknote,
                children: [
                    { label: 'Mizan (Trial Balance)', screen: 'mizan', icon: FileSpreadsheet },
                    { label: 'Gelir Tablosu (Income Statement)', screen: 'income-statement', icon: TrendingUp },
                    { label: 'Bilanço (Balance Sheet)', screen: 'balance-sheet', icon: Scale }
                ]
            },
            {
                label: 'Özel & Gelişmiş',
                screen: 'advanced-reps-group',
                icon: FileText,
                children: [
                    { label: 'Gelişmiş Raporlar (100+)', screen: 'advanced-reports', icon: FileText },
                    { label: 'Özel Raporlar', screen: 'customreports', icon: FileSpreadsheet }
                ]
            }
        ]
    },
    {
        title: 'Sistem Yönetimi',
        items: [

            { label: 'Firma/Dönem Tanımları', screen: 'firm-period-definitions', icon: Building },
            { label: 'Workflow Otomasyonu', screen: 'workflow-automation', icon: Zap, badge: 'AI' },
            { label: 'Demo Veri Yönetimi', screen: 'demo-data', icon: Database, badge: 'TEST' },
            { label: 'ExSecureGate (Güvenlik)', screen: 'security-modules', icon: Shield, badge: 'BETA' },
            { label: 'Genel Ayarlar', screen: 'generalsettings', icon: Settings },
            { label: 'Kullanıcı Yönetimi', screen: 'usermanagement', icon: UserCheck },
            { label: 'Rol & Yetkilendirme', screen: 'roleauth', icon: Shield },
            { label: 'Menü Yönetimi', screen: 'menumanagement', icon: Menu },
            { label: 'Tanımlar/Parametreler', screen: 'Tanımlar', icon: Database },
            { label: 'Yedekleme/Geri Yükleme', screen: 'backuprestore', icon: Layers },
            { label: 'Log/Denetim', screen: 'logaudit', icon: Clock },
            { label: 'Sistem Sağlığı', screen: 'systemhealth', icon: AlertCircle }
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
        communicationNotifications: 'İletişim & Bildirimler',
        reportsAnalysis: 'Raporlar & Analiz',
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
    }
} as any);

