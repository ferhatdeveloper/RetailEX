-- ============================================================================
-- RetailEx - ENTERPRISE SCHEMAS & TABLES (v3.1)
-- ----------------------------------------------------------------------------
-- Populating logic and wms schemas with professional ERP/WMS tables
-- ============================================================================

-- 0. SUPABASE COMPATIBILITY SCHEMAS & EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS logic;
CREATE SCHEMA IF NOT EXISTS wms;

-- MINIMAL AUTH SCHEMA (For system stability and migrations)
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    encrypted_password VARCHAR(255),
    raw_user_meta_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 1: LOGIC SCHEMA (Core ERP Business Logic)
-- ============================================================================

-- 1.1 Bank Accounts (Banka Hesapları)
CREATE TABLE IF NOT EXISTS logic.bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    bank_name VARCHAR(255),
    iban VARCHAR(50),
    currency_code VARCHAR(10),
    balance DECIMAL(15,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, code)
);

-- 1.2 Campaigns (Kampanyalar)
CREATE TABLE IF NOT EXISTS logic.campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    campaign_type VARCHAR(50) NOT NULL, -- percentage, fixed_amount, buy_x_get_y
    discount_value DECIMAL(15,2),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    conditions JSONB, -- Advanced rules
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, code)
);

-- 1.3 Chart of Accounts (Hesap Planı)
CREATE TABLE IF NOT EXISTS logic.chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    parent_code VARCHAR(50),
    account_type VARCHAR(50), -- asset, liability, equity, income, expense
    level INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, code)
);

-- 1.4 Expenses (Giderler)
CREATE TABLE IF NOT EXISTS logic.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    expense_nr VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    amount DECIMAL(15,2) NOT NULL,
    currency_code VARCHAR(10),
    date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, expense_nr)
);

-- 1.5 Cash Registers (Kasalar)
CREATE TABLE IF NOT EXISTS logic.cash_registers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    store_id UUID REFERENCES public.stores(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    balance DECIMAL(15,2) DEFAULT 0,
    currency_code VARCHAR(10) DEFAULT 'IQD',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, code)
);

-- 1.6 Invoices (Faturalar - Global Header)
CREATE TABLE IF NOT EXISTS logic.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    period_nr VARCHAR(10) NOT NULL,
    invoice_no VARCHAR(50) NOT NULL,
    invoice_date TIMESTAMPTZ DEFAULT NOW(),
    invoice_type VARCHAR(20) NOT NULL, -- purchase, sales, return
    customer_id UUID, -- Reference to dynamic customer id if applicable
    total_amount DECIMAL(15,2) DEFAULT 0,
    tax_amount DECIMAL(15,2) DEFAULT 0,
    discount_amount DECIMAL(15,2) DEFAULT 0,
    net_amount DECIMAL(15,2) DEFAULT 0,
    currency_code VARCHAR(10) DEFAULT 'IQD',
    status VARCHAR(20) DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, invoice_no)
);

-- 1.7 Invoice Items (Fatura Satırları)
CREATE TABLE IF NOT EXISTS logic.invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES logic.invoices(id) ON DELETE CASCADE,
    firm_nr VARCHAR(10) NOT NULL,
    item_type VARCHAR(20) DEFAULT 'product', -- product, service, expense
    item_code VARCHAR(50),
    item_name VARCHAR(255),
    quantity DECIMAL(15,3) DEFAULT 1,
    unit_price DECIMAL(15,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    discount_rate DECIMAL(5,2) DEFAULT 0,
    total_amount DECIMAL(15,2) DEFAULT 0,
    net_amount DECIMAL(15,2) DEFAULT 0,
    currency_code VARCHAR(10) DEFAULT 'IQD',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 2: WMS SCHEMA (Warehouse Management System)
-- ============================================================================

-- 2.0 Warehouse Personnel (WMS Personeli)
CREATE TABLE IF NOT EXISTS wms.personnel (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    store_id UUID REFERENCES public.stores(id),
    role VARCHAR(50), -- manager, picker, checker
    is_active BOOLEAN DEFAULT true
);

-- 2.1 Warehouse Bins / Locations (Raf Tanımları)
CREATE TABLE IF NOT EXISTS wms.bins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES public.stores(id),
    code VARCHAR(50) NOT NULL,
    zone VARCHAR(50),
    aisle VARCHAR(50),
    shelf VARCHAR(50),
    bin VARCHAR(50),
    capacity_m3 DECIMAL(15,3),
    max_weight DECIMAL(15,2),
    is_active BOOLEAN DEFAULT true,
    UNIQUE(store_id, code)
);

-- 2.2 Counting Slips (Sayım Fişleri)
CREATE TABLE IF NOT EXISTS wms.counting_slips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    store_id UUID NOT NULL,
    fiche_no VARCHAR(50) NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'draft', -- draft, completed, cancelled
    description TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, fiche_no)
);

-- 2.3 Counting Lines (Sayım Satırları)
CREATE TABLE IF NOT EXISTS wms.counting_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slip_id UUID REFERENCES wms.counting_slips(id) ON DELETE CASCADE,
    product_ref INTEGER, -- Reference to rex_fff_products.logicalref (Legacy)
    product_id UUID, -- New product ID reference
    bin_id UUID REFERENCES wms.bins(id),
    expected_qty DECIMAL(15,2),
    counted_qty DECIMAL(15,2),
    variance DECIMAL(15,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_counting_lines_slip_id ON wms.counting_lines(slip_id);

-- 2.4 Transfer Orders (Depo Arası Transfer)
CREATE TABLE IF NOT EXISTS wms.transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    fiche_no VARCHAR(50) NOT NULL,
    source_store_id UUID NOT NULL,
    target_store_id UUID NOT NULL,
    date TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'pending', -- pending, shipped, received
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, fiche_no)
);

-- 2.5 Transfer Items (Transfer Satırları)
CREATE TABLE IF NOT EXISTS wms.transfer_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transfer_id UUID REFERENCES wms.transfers(id) ON DELETE CASCADE,
    product_id UUID,
    quantity DECIMAL(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SECTION 3: PUBLIC SCHEMA EXTENSIONS
-- ============================================================================

-- 3.1 Menu Items (UI Menüleri - from backup)
CREATE TABLE IF NOT EXISTS public.menu_items (
    id SERIAL PRIMARY KEY,
    menu_type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    label VARCHAR(255) NOT NULL,
    label_tr VARCHAR(255),
    label_en VARCHAR(255),
    label_ar VARCHAR(255),
    parent_id INTEGER,
    section_id INTEGER,
    screen_id VARCHAR(100),
    icon_name VARCHAR(100),
    badge VARCHAR(50),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_visible BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SECTION 4: SYSTEM UPDATES
-- ============================================================================

-- Log the enterprise schema installation
INSERT INTO public.audit_logs (firm_nr, table_name, record_id, action, new_data)
VALUES ('000', 'system', '00000000-0000-0000-0000-000000000000', 'ENTERPRISE_INIT', '{"status": "completed", "schemas": ["logic", "wms", "auth"]}'::JSONB)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 5: INITIAL DATA SEEDING (MENU SYSTEM)
-- ============================================================================

-- Clean existing menu items to prevent duplicates during consolidated rerun
-- DELETE FROM public.menu_items;

-- 5.1 MALZEME YÖNETİMİ SECTION
INSERT INTO public.menu_items (menu_type, label, label_tr, icon_name, display_order)
VALUES ('sidebar', 'Malzeme Yönetimi', 'Malzeme Yönetimi', 'Settings', 10)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_material_mgmt_id INTEGER;
    v_ana_kayitlar_id INTEGER;
    v_hareketler_id INTEGER;
    v_raporlar_id INTEGER;
BEGIN
    SELECT id INTO v_material_mgmt_id FROM public.menu_items WHERE label = 'Malzeme Yönetimi' AND parent_id IS NULL;

    IF v_material_mgmt_id IS NOT NULL THEN
        -- Ana Kayıtlar
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Ana Kayıtlar', 'Ana Kayıtlar', 'material-definitions', 'Settings', v_material_mgmt_id, 10)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_ana_kayitlar_id;

        IF v_ana_kayitlar_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Malzeme Sınıfları', 'Malzeme Sınıfları', 'material-classes', 'Tag', v_ana_kayitlar_id, 10),
            ('sidebar', 'Malzemeler', 'Malzemeler', 'products', 'Package', v_ana_kayitlar_id, 20),
            ('sidebar', 'Birim Setleri', 'Birim Setleri', 'unit-sets', 'Scale', v_ana_kayitlar_id, 30),
            ('sidebar', 'Varyantlar', 'Varyantlar', 'variants', 'Tag', v_ana_kayitlar_id, 40),
            ('sidebar', 'Özel Kodlar', 'Özel Kodlar', 'special-codes', 'Tag', v_ana_kayitlar_id, 50),
            ('sidebar', 'Marka Tanımları', 'Marka Tanımları', 'brand-definitions', 'Tag', v_ana_kayitlar_id, 60),
            ('sidebar', 'Grup Kodları', 'Grup Kodları', 'group-codes', 'Tag', v_ana_kayitlar_id, 70),
            ('sidebar', 'Ürün Kategorileri', 'Ürün Kategorileri', 'product-categories', 'Tag', v_ana_kayitlar_id, 80)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Hareketler
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Hareketler', 'Hareketler', 'material-movements', 'TrendingDown', v_material_mgmt_id, 20)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_hareketler_id;

        IF v_hareketler_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Stok Yönetim Paneli', 'Stok Yönetim Paneli', 'stock-dashboard', 'PieChart', v_hareketler_id, 10),
            ('sidebar', 'Malzeme Yönetim Fişleri', 'Malzeme Yönetim Fişleri', 'stockmovements', 'TrendingDown', v_hareketler_id, 20)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Raporlar
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Raporlar', 'Raporlar', 'material-reports', 'BarChart3', v_material_mgmt_id, 30)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_raporlar_id;

        IF v_raporlar_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Malzeme Ekstresi', 'Malzeme Ekstresi', 'report-material-extract', 'BarChart3', v_raporlar_id, 10),
            ('sidebar', 'Malzeme Değer', 'Malzeme Değer', 'report-material-value', 'BarChart3', v_raporlar_id, 20),
            ('sidebar', 'Envanter', 'Envanter', 'inventory', 'BarChart3', v_raporlar_id, 30),
            ('sidebar', 'Maliyet', 'Maliyet', 'cost', 'BarChart3', v_raporlar_id, 40),
            ('sidebar', 'Giriş Çıkış Toplamları', 'Giriş Çıkış Toplamları', 'report-in-out-totals', 'BarChart3', v_raporlar_id, 50),
            ('sidebar', 'Malzeme Ambar Durum', 'Malzeme Ambar Durum', 'report-warehouse-status', 'BarChart3', v_raporlar_id, 60),
            ('sidebar', 'Hareket Dökümü', 'Hareket Dökümü', 'report-transaction-breakdown', 'BarChart3', v_raporlar_id, 70),
            ('sidebar', 'Fiş Listesi', 'Fiş Listesi', 'report-slip-list', 'FileText', v_raporlar_id, 80),
            ('sidebar', 'Minimum Maksimum Stok', 'Minimum Maksimum Stok', 'report-min-max', 'BarChart3', v_raporlar_id, 90)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END $$;

-- 5.2 ANA MENÜ SECTION
INSERT INTO public.menu_items (menu_type, label, label_tr, icon_name, display_order)
VALUES ('sidebar', 'Ana Menü', 'Ana Menü', 'Menu', 20)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_main_menu_id INTEGER;
    v_store_mgmt_id INTEGER;
BEGIN
    SELECT id INTO v_main_menu_id FROM public.menu_items WHERE label = 'Ana Menü' AND parent_id IS NULL;

    IF v_main_menu_id IS NOT NULL THEN
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Dashboard', 'Dashboard', 'Dashboard', 'PieChart', v_main_menu_id, 10)
        ON CONFLICT DO NOTHING;

        -- Mağaza Yönetimi
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, badge, parent_id, display_order)
        VALUES ('sidebar', 'Mağaza Yönetimi', 'Mağaza Yönetimi', 'store-management-group', 'Store', 'YENİ', v_main_menu_id, 20)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_store_mgmt_id;

        IF v_store_mgmt_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Mağaza Paneli', 'Mağaza Paneli', 'store-management', 'Store', v_store_mgmt_id, 10),
            ('sidebar', 'Mağaza Transferi', 'Mağaza Transferi', 'interstore-transfer', 'ArrowRightLeft', v_store_mgmt_id, 20),
            ('sidebar', 'Çoklu Mağaza Yönetimi', 'Çoklu Mağaza Yönetimi', 'multistore', 'Store', v_store_mgmt_id, 30),
            ('sidebar', 'Bölgesel Bayilik Yönetimi', 'Bölgesel Bayilik Yönetimi', 'regional', 'Map', v_store_mgmt_id, 40),
            ('sidebar', 'Mağaza Yapılandırması', 'Mağaza Yapılandırması', 'storeconfig', 'Settings', v_store_mgmt_id, 50)
            ON CONFLICT DO NOTHING;
        END IF;

        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
        ('sidebar', 'Bilgi Gönder/Al', 'Bilgi Gönder/Al', 'databroadcast', 'Radio', v_main_menu_id, 30),
        ('sidebar', 'Entegrasyonlar', 'Entegrasyonlar', 'integrations', 'Zap', v_main_menu_id, 40),
        ('sidebar', 'Excel İşlemleri', 'Excel İşlemleri', 'excel', 'FileSpreadsheet', v_main_menu_id, 50)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 5.3 FATURALAR SECTION
INSERT INTO public.menu_items (menu_type, label, label_tr, icon_name, display_order)
VALUES ('sidebar', 'Faturalar', 'Faturalar', 'FileText', 30)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_invoices_id INTEGER;
    v_sales_id INTEGER;
    v_purchase_id INTEGER;
    v_service_id INTEGER;
    v_waybill_id INTEGER;
    v_order_id INTEGER;
BEGIN
    SELECT id INTO v_invoices_id FROM public.menu_items WHERE label = 'Faturalar' AND parent_id IS NULL;

    IF v_invoices_id IS NOT NULL THEN
        -- Satış Faturaları
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Satış Faturaları', 'Satış Faturaları', 'salesinvoice', 'FileText', v_invoices_id, 10)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_sales_id;

        IF v_sales_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Satış Faturası', 'Satış Faturası', 'sales-invoice-standard', 'FileText', v_sales_id, 10),
            ('sidebar', 'Perakende Satış', 'Perakende Satış', 'sales-invoice-retail', 'FileText', v_sales_id, 20),
            ('sidebar', 'Toptan Satış', 'Toptan Satış', 'sales-invoice-wholesale', 'FileText', v_sales_id, 30),
            ('sidebar', 'Konsinye Satış', 'Konsinye Satış', 'sales-invoice-consignment', 'FileText', v_sales_id, 40),
            ('sidebar', 'Satış İade', 'Satış İade', 'sales-invoice-return', 'FileMinus', v_sales_id, 50)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Satın Alma
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Satın Alma', 'Satın Alma', 'purchaseinvoice', 'FileCheck', v_invoices_id, 20)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_purchase_id;

        IF v_purchase_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Talep Fişleri', 'Talep Fişleri', 'purchaserequest', 'ClipboardList', v_purchase_id, 10),
            ('sidebar', 'Satınalma Siparişleri', 'Satınalma Siparişleri', 'purchase', 'ShoppingBag', v_purchase_id, 20),
            ('sidebar', 'Alış Faturası', 'Alış Faturası', 'purchase-invoice-standard', 'FileCheck', v_purchase_id, 30),
            ('sidebar', 'Alış İade', 'Alış İade', 'purchase-invoice-return', 'FileMinus', v_purchase_id, 40),
            ('sidebar', 'Alınan Hizmet', 'Alınan Hizmet', 'serviceinvoice-received', 'FileText', v_purchase_id, 50)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Hizmet Faturaları
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Hizmet Faturaları', 'Hizmet Faturaları', 'serviceinvoice', 'FileText', v_invoices_id, 30)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_service_id;

        IF v_service_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Tedarikçi Kartları', 'Tedarikçi Kartları', 'suppliers', 'Truck', v_service_id, 10),
            ('sidebar', 'Verilen Hizmet Faturası', 'Verilen Hizmet Faturası', 'serviceinvoice-given', 'FileText', v_service_id, 20),
            ('sidebar', 'Alınan Hizmet Faturası', 'Alınan Hizmet Faturası', 'serviceinvoice-received', 'FileCheck', v_service_id, 30)
            ON CONFLICT DO NOTHING;
        END IF;

        -- İrsaliyeler
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'İrsaliyeler', 'İrsaliyeler', 'waybill', 'Truck', v_invoices_id, 40)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_waybill_id;

        IF v_waybill_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Satış İrsaliyesi', 'Satış İrsaliyesi', 'waybill-sales', 'Truck', v_waybill_id, 10),
            ('sidebar', 'Alış İrsaliyesi', 'Alış İrsaliyesi', 'waybill-purchase', 'Truck', v_waybill_id, 20),
            ('sidebar', 'Depo Transfer İrsaliyesi', 'Depo Transfer İrsaliyesi', 'waybill-transfer', 'Truck', v_waybill_id, 30),
            ('sidebar', 'Fire İrsaliyesi', 'Fire İrsaliyesi', 'waybill-fire', 'Truck', v_waybill_id, 40)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Siparişler
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Siparişler', 'Siparişler', 'Siparişler', 'ShoppingBag', v_invoices_id, 50)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_order_id;

        IF v_order_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Satış Siparişi', 'Satış Siparişi', 'sales-order', 'ShoppingBag', v_order_id, 10)
            ON CONFLICT DO NOTHING;
        END IF;

        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Teklifler', 'Teklifler', 'Teklifler', 'FileSignature', v_invoices_id, 60)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 5.4 FİNANS YÖNETİMİ SECTION
INSERT INTO public.menu_items (menu_type, label, label_tr, icon_name, display_order)
VALUES ('sidebar', 'Finans Yönetimi', 'Finans Yönetimi', 'Wallet', 40)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_finance_id INTEGER;
    v_defs_id INTEGER;
    v_cards_id INTEGER;
    v_moves_id INTEGER;
    v_reps_id INTEGER;
    v_other_id INTEGER;
BEGIN
    SELECT id INTO v_finance_id FROM public.menu_items WHERE label = 'Finans Yönetimi' AND parent_id IS NULL;

    IF v_finance_id IS NOT NULL THEN
        -- Tanımlar
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Tanımlar', 'Tanımlar', 'finance-definitions', 'Settings', v_finance_id, 10)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_defs_id;

        IF v_defs_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Ödeme Planları', 'Ödeme Planları', 'payment-plans', 'Calendar', v_defs_id, 10),
            ('sidebar', 'Banka Ödeme Planları', 'Banka Ödeme Planları', 'bank-payment-plans', 'Calendar', v_defs_id, 20),
            ('sidebar', 'Kampanya Tanımları', 'Kampanya Tanımları', 'campaigndefs', 'Percent', v_defs_id, 30)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Kartlar
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Kartlar', 'Kartlar', 'finance-cards', 'FileText', v_finance_id, 20)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_cards_id;

        IF v_cards_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Cari Hesaplar', 'Cari Hesaplar', 'suppliers', 'Building', v_cards_id, 10),
            ('sidebar', 'Kasa Hesapları', 'Kasa Hesapları', 'cashbank', 'Wallet', v_cards_id, 20),
            ('sidebar', 'Bankalar', 'Bankalar', 'banks', 'Building', v_cards_id, 30),
            ('sidebar', 'Banka Hesapları', 'Banka Hesapları', 'bank-accounts', 'CreditCard', v_cards_id, 40)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Hareketler
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Hareketler', 'Hareketler', 'finance-movements', 'TrendingDown', v_finance_id, 30)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_moves_id;

        IF v_moves_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Cari Hesap Fişleri', 'Cari Hesap Fişleri', 'currentaccounts', 'Receipt', v_moves_id, 10),
            ('sidebar', 'Kasa İşlemleri', 'Kasa İşlemleri', 'kasalar', 'Wallet', v_moves_id, 20),
            ('sidebar', 'Kasa Fişleri', 'Kasa Fişleri', 'cashbank', 'Receipt', v_moves_id, 30),
            ('sidebar', 'Banka Fişleri', 'Banka Fişleri', 'bank-vouchers', 'Receipt', v_moves_id, 40),
            ('sidebar', 'Kredi Kartı Pos Fişleri', 'Kredi Kartı Pos Fişleri', 'payment', 'CreditCard', v_moves_id, 50),
            ('sidebar', 'Yevmiye Defteri & Fişler', 'Yevmiye Defteri & Fişler', 'accounting', 'FileSpreadsheet', v_moves_id, 60)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Raporlar
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Raporlar', 'Raporlar', 'finance-reports', 'BarChart3', v_finance_id, 40)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_reps_id;

        IF v_reps_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Cari Hesap Raporları', 'Cari Hesap Raporları', 'financereports', 'BarChart3', v_reps_id, 10),
            ('sidebar', 'Kasa Raporları', 'Kasa Raporları', 'financereports', 'BarChart3', v_reps_id, 20),
            ('sidebar', 'Banka Raporları', 'Banka Raporları', 'financereports', 'BarChart3', v_reps_id, 30),
            ('sidebar', 'Mizan Raporu', 'Mizan Raporu', 'mizan', 'BarChart3', v_reps_id, 40)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Diğer
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Diğer', 'Diğer', 'finance-other', 'MoreVertical', v_finance_id, 50)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_other_id;

        IF v_other_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, badge, parent_id, display_order)
            VALUES ('sidebar', 'Muhasebe Yönetimi', 'Muhasebe Yönetimi', 'accounting-mgmt', 'DollarSign', 'YENİ', v_other_id, 10)
            ON CONFLICT DO NOTHING;

            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Gider Yönetimi', 'Gider Yönetimi', 'revenueexpense', 'Receipt', v_other_id, 20),
            ('sidebar', 'Çek/Senet', 'Çek/Senet', 'checkpromissory', 'Receipt', v_other_id, 30),
            ('sidebar', 'Tahsilat/Ödeme', 'Tahsilat/Ödeme', 'collectionpayment', 'CreditCard', v_other_id, 40),
            ('sidebar', 'Çoklu Para Birimi', 'Çoklu Para Birimi', 'multicurrency', 'Globe', v_other_id, 50),
            ('sidebar', 'Muhasebe Fişleri', 'Muhasebe Fişleri', 'accounting', 'FileSpreadsheet', v_other_id, 60)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END $$;

-- 5.5 RETAIL SECTION
INSERT INTO public.menu_items (menu_type, label, label_tr, icon_name, display_order)
VALUES ('sidebar', 'Retail', 'Retail', 'ShoppingCart', 50)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_retail_id INTEGER;
BEGIN
    SELECT id INTO v_retail_id FROM public.menu_items WHERE label = 'Retail' AND parent_id IS NULL;

    IF v_retail_id IS NOT NULL THEN
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Fiyat & Kampanya', 'Fiyat & Kampanya', 'pricing', 'Tag', v_retail_id, 10)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, badge, parent_id, display_order)
        VALUES ('sidebar', 'Terazi & Tartılı Satış', 'Terazi & Tartılı Satış', 'cashier-scale', 'Scale', 'YENİ', v_retail_id, 20)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 5.6 İLETİŞİM & BİLDİRİMLER SECTION
INSERT INTO public.menu_items (menu_type, label, label_tr, icon_name, display_order)
VALUES ('sidebar', 'İletişim & Bildirimler', 'İletişim & Bildirimler', 'Bell', 60)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_comm_id INTEGER;
BEGIN
    SELECT id INTO v_comm_id FROM public.menu_items WHERE label = 'İletişim & Bildirimler' AND parent_id IS NULL;

    IF v_comm_id IS NOT NULL THEN
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
        ('sidebar', 'WhatsApp Entegrasyonu', 'WhatsApp Entegrasyonu', 'whatsapp', 'Phone', v_comm_id, 10),
        ('sidebar', 'Bildirim Merkezi', 'Bildirim Merkezi', 'notifications', 'Bell', v_comm_id, 20),
        ('sidebar', 'SMS Yönetimi', 'SMS Yönetimi', 'smsmanage', 'Smartphone', v_comm_id, 30),
        ('sidebar', 'E-posta Kampanyaları', 'E-posta Kampanyaları', 'emailcamp', 'Mail', v_comm_id, 40)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 5.7 RAPORLAR & ANALİZ SECTION
INSERT INTO public.menu_items (menu_type, label, label_tr, icon_name, display_order)
VALUES ('sidebar', 'Raporlar & Analiz', 'Raporlar & Analiz', 'BarChart3', 70)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_reps_id INTEGER;
    v_analytic_id INTEGER;
    v_sales_stok_id INTEGER;
    v_fin_reps_id INTEGER;
    v_adv_reps_id INTEGER;
BEGIN
    SELECT id INTO v_reps_id FROM public.menu_items WHERE label = 'Raporlar & Analiz' AND parent_id IS NULL;

    IF v_reps_id IS NOT NULL THEN
        -- Analitik Raporlar
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, badge, parent_id, display_order)
        VALUES ('sidebar', 'Analitik Raporlar', 'Analitik Raporlar', 'analytics-group', 'BarChart3', 'AI', v_reps_id, 10)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_analytic_id;

        IF v_analytic_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'AI Ürün Analitiği', 'AI Ürün Analitiği', 'product-analytics', 'BarChart3', v_analytic_id, 10),
            ('sidebar', 'Karlılık Analizi Dashboard', 'Karlılık Analizi Dashboard', 'profit-dashboard', 'TrendingUp', v_analytic_id, 20),
            ('sidebar', 'Grafiksel Analiz', 'Grafiksel Analiz', 'graphanalysis', 'TrendingUp', v_analytic_id, 30),
            ('sidebar', 'BI Dashboard & AI', 'BI Dashboard & AI', 'bi-dashboard', 'PieChart', v_analytic_id, 40)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Satış & Stok Raporları
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Satış & Stok Raporları', 'Satış & Stok Raporları', 'sales-stock-group', 'ShoppingCart', v_reps_id, 20)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_sales_stok_id;

        IF v_sales_stok_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Satış Raporları', 'Satış Raporları', 'salesreports', 'BarChart3', v_sales_stok_id, 10),
            ('sidebar', 'Stok Raporları', 'Stok Raporları', 'stockreports', 'Package', v_sales_stok_id, 20),
            ('sidebar', 'Müşteri Analizi', 'Müşteri Analizi', 'customeranalysis', 'Users', v_sales_stok_id, 30)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Finansal Raporlar
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Finansal Raporlar', 'Finansal Raporlar', 'finance-reps-group', 'DollarSign', v_reps_id, 30)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_fin_reps_id;

        IF v_fin_reps_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Mizan (Trial Balance)', 'Mizan (Trial Balance)', 'mizan', 'FileSpreadsheet', v_fin_reps_id, 10),
            ('sidebar', 'Gelir Tablosu (Income Statement)', 'Gelir Tablosu (Income Statement)', 'income-statement', 'TrendingUp', v_fin_reps_id, 20),
            ('sidebar', 'Bilanço (Balance Sheet)', 'Bilanço (Balance Sheet)', 'balance-sheet', 'Scale', v_fin_reps_id, 30)
            ON CONFLICT DO NOTHING;
        END IF;

        -- Özel & Gelişmiş
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order)
        VALUES ('sidebar', 'Özel & Gelişmiş', 'Özel & Gelişmiş', 'advanced-reps-group', 'FileText', v_reps_id, 40)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_adv_reps_id;

        IF v_adv_reps_id IS NOT NULL THEN
            INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
            ('sidebar', 'Gelişmiş Raporlar (100+)', 'Gelişmiş Raporlar (100+)', 'advanced-reports', 'FileText', v_adv_reps_id, 10),
            ('sidebar', 'Özel Raporlar', 'Özel Raporlar', 'customreports', 'FileSpreadsheet', v_adv_reps_id, 20)
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
END $$;

-- 5.8 SİSTEM YÖNETİMİ SECTION
INSERT INTO public.menu_items (menu_type, label, label_tr, icon_name, display_order)
VALUES ('sidebar', 'Sistem Yönetimi', 'Sistem Yönetimi', 'Settings', 80)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    v_sys_id INTEGER;
BEGIN
    SELECT id INTO v_sys_id FROM public.menu_items WHERE label = 'Sistem Yönetimi' AND parent_id IS NULL;

    IF v_sys_id IS NOT NULL THEN
        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
        ('sidebar', 'Firma/Dönem Tanımları', 'Firma/Dönem Tanımları', 'firm-period-definitions', 'Building', v_sys_id, 10)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, badge, parent_id, display_order)
        VALUES ('sidebar', 'Workflow Otomasyonu', 'Workflow Otomasyonu', 'workflow-automation', 'Zap', 'AI', v_sys_id, 20)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, badge, parent_id, display_order)
        VALUES ('sidebar', 'Demo Veri Yönetimi', 'Demo Veri Yönetimi', 'demo-data', 'Database', 'TEST', v_sys_id, 30)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, badge, parent_id, display_order)
        VALUES ('sidebar', 'Database Altyapısı', 'Database Altyapısı', 'database-settings', 'Database', 'YENİ', v_sys_id, 40)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, badge, parent_id, display_order)
        VALUES ('sidebar', 'ExSecureGate (Güvenlik)', 'ExSecureGate (Güvenlik)', 'security-modules', 'Shield', 'BETA', v_sys_id, 50)
        ON CONFLICT DO NOTHING;

        INSERT INTO public.menu_items (menu_type, label, label_tr, screen_id, icon_name, parent_id, display_order) VALUES
        ('sidebar', 'Genel Ayarlar', 'Genel Ayarlar', 'generalsettings', 'Settings', v_sys_id, 60),
        ('sidebar', 'Kullanıcı Yönetimi', 'Kullanıcı Yönetimi', 'usermanagement', 'UserCheck', v_sys_id, 70),
        ('sidebar', 'Rol & Yetkilendirme', 'Rol & Yetkilendirme', 'roleauth', 'Shield', v_sys_id, 80),
        ('sidebar', 'Menü Yönetimi', 'Menü Yönetimi', 'menumanagement', 'Menu', v_sys_id, 90),
        ('sidebar', 'Tanımlar/Parametreler', 'Tanımlar/Parametreler', 'Tanımlar', 'Database', v_sys_id, 100),
        ('sidebar', 'Yedekleme/Geri Yükleme', 'Yedekleme/Geri Yükleme', 'backuprestore', 'Layers', v_sys_id, 110),
        ('sidebar', 'Log/Denetim', 'Log/Denetim', 'logaudit', 'Clock', v_sys_id, 120),
        ('sidebar', 'Sistem Sağlığı', 'Sistem Sağlığı', 'systemhealth', 'AlertCircle', v_sys_id, 130)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
