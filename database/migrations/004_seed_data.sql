-- ============================================================================
-- RetailEx - MASTER SEED & INITIALIZATION (v5.1 - ABSOLUTE PARITY)
-- ----------------------------------------------------------------------------
-- Standard reference data and initial bootstrap
-- ============================================================================

-- HOTFIX: Re-ensure CREATE_FIRM_TABLES is the correct version (no restaurant tables).
-- Old 002_logic.sql (stale build artifact) incorrectly created rex_NNN_rest_tables
-- in the public schema with REFERENCES rest_floors(id) instead of rest.floors(id).
-- This definition here guarantees the correct version is active before any calls below.
CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text := lower('rex_' || p_firm_nr);
    v_tbl_products text := v_prefix || '_products';
    v_tbl_customers text := v_prefix || '_customers';
    v_unitset_id UUID;
BEGIN
    -- 1. Products Super-Template
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            ref_id INTEGER UNIQUE,
            code VARCHAR(100) UNIQUE,
            barcode VARCHAR(100),
            name VARCHAR(255) NOT NULL,
            name2 VARCHAR(255),
            image_url TEXT,
            description TEXT,
            description_tr TEXT,
            description_en TEXT,
            description_ar TEXT,
            description_ku TEXT,
            category_id UUID,
            category_code VARCHAR(50),
            group_code VARCHAR(50),
            sub_group_code VARCHAR(50),
            brand VARCHAR(100),
            model VARCHAR(100),
            manufacturer VARCHAR(100),
            supplier VARCHAR(100),
            origin VARCHAR(50),
            material_type VARCHAR(50),
            unit VARCHAR(50) DEFAULT ''Adet'',
            unit_id UUID,
            unitset_id UUID,
            vat_rate DECIMAL(5,2) DEFAULT 20,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            min_stock DECIMAL(15,2) DEFAULT 0,
            max_stock DECIMAL(15,2) DEFAULT 0,
            price_list_1 DECIMAL(15,2) DEFAULT 0,
            price_list_2 DECIMAL(15,2) DEFAULT 0,
            price_list_3 DECIMAL(15,2) DEFAULT 0,
            tracking_type VARCHAR(20) DEFAULT ''none'',
            critical_stock DECIMAL(15,2) DEFAULT 0,
            shelf_location VARCHAR(50),
            warehouse_code VARCHAR(50),
            categorycode VARCHAR(50),
            groupcode VARCHAR(50),
            pricelist1 DECIMAL(15,2),
            pricelist2 DECIMAL(15,2),
            purchase_price_usd DECIMAL(15,2) DEFAULT 0,
            purchase_price_eur DECIMAL(15,2) DEFAULT 0,
            sale_price_usd DECIMAL(15,2) DEFAULT 0,
            sale_price_eur DECIMAL(15,2) DEFAULT 0,
            preparation_time INTEGER DEFAULT 5,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_tbl_products);

    -- 2. Customers Super-Template
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(255),
            tax_nr VARCHAR(50),
            taxi_nr VARCHAR(50),
            tax_office VARCHAR(100),
            address TEXT,
            city VARCHAR(100),
            neighborhood VARCHAR(100),
            district VARCHAR(100),
            balance DECIMAL(15,2) DEFAULT 0,
            points DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_tbl_customers);

    -- 2.3.5 Suppliers
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(255),
            tax_nr VARCHAR(50),
            tax_office VARCHAR(100),
            address TEXT,
            city VARCHAR(100),
            neighborhood VARCHAR(100),
            district VARCHAR(100),
            contact_person VARCHAR(150),
            contact_person_phone VARCHAR(50),
            payment_terms VARCHAR(100),
            credit_limit DECIMAL(15,2) DEFAULT 0,
            notes TEXT,
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_suppliers');

    -- 3. Definitions (Categories, Brands, Units)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            parent_id UUID,
            is_restaurant BOOLEAN DEFAULT false,
            icon VARCHAR(100),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_categories');

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_brands');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(20) UNIQUE, name VARCHAR(100) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_units');

    -- 4. Unit Sets & Variants
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL);', v_prefix || '_unitsets');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), unitset_id UUID, item_code VARCHAR(20) NOT NULL, conv_fact1 DECIMAL(15,6) DEFAULT 1, CONSTRAINT %I UNIQUE(unitset_id, item_code));', v_prefix || '_unitsetl', v_prefix || '_unitsetl_unique');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), product_id UUID, sku VARCHAR(100), attributes JSONB);', v_prefix || '_product_variants');

    -- 5. Campaigns
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            type VARCHAR(50) NOT NULL,
            discount_type VARCHAR(50) NOT NULL,
            discount_value DECIMAL(15,2) DEFAULT 0,
            start_date TIMESTAMPTZ,
            end_date TIMESTAMPTZ,
            is_active BOOLEAN DEFAULT true,
            min_purchase_amount DECIMAL(15,2) DEFAULT 0,
            max_discount_amount DECIMAL(15,2),
            applicable_categories VARCHAR(255),
            applicable_products JSONB DEFAULT ''[]'',
            priority INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_campaigns');

    -- 6. Registry & Finance
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_cash_registers');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, bank_name VARCHAR(255), iban VARCHAR(50), currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_bank_registers');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_expense_cards');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_sales_reps');

    PERFORM public.APPLY_SYNC_TRIGGERS(v_tbl_products);
    PERFORM public.APPLY_SYNC_TRIGGERS(v_tbl_customers);
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_suppliers');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_cash_registers');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_bank_registers');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_expense_cards');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_sales_reps');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_categories');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_brands');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_units');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_campaigns');

    -- Standard Unit Sets Seeding
    v_unitset_id := uuid_generate_v4();
    EXECUTE format('INSERT INTO %I (id, code, name) VALUES (%L, ''01-ADET'', ''Adet Varsayılan'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets', v_unitset_id);
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''ADET'', 1 FROM %I WHERE code = ''01-ADET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

    v_unitset_id := uuid_generate_v4();
    EXECUTE format('INSERT INTO %I (id, code, name) VALUES (%L, ''02-KG'', ''Kilogram/Gram'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets', v_unitset_id);
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''KG'', 1 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''GRAM'', 1000 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

    v_unitset_id := uuid_generate_v4();
    EXECUTE format('INSERT INTO %I (id, code, name) VALUES (%L, ''03-LT'', ''Litre/Militre'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets', v_unitset_id);
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''LT'', 1 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''ML'', 1000 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

    v_unitset_id := uuid_generate_v4();
    EXECUTE format('INSERT INTO %I (id, code, name) VALUES (%L, ''04-KOLI24'', ''Koli (24 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets', v_unitset_id);
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''KOLI'', 1 FROM %I WHERE code = ''04-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''ADET'', 24 FROM %I WHERE code = ''04-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

    -- Default Seeding
    EXECUTE format('INSERT INTO %I (id, firm_nr, code, name, is_active) VALUES (''00000000-0000-0000-0000-000000000001'', %L, ''KASA.001'', ''MERKEZ KASA'', true) ON CONFLICT DO NOTHING;', v_prefix || '_cash_registers', p_firm_nr);
END;
$$ LANGUAGE plpgsql;

-- 1.0 CURRENCIES
INSERT INTO currencies (code, name, symbol, is_base_currency, sort_order) VALUES
('IQD', 'Iraqi Dinar', 'د.ع', true, 1),
('USD', 'US Dollar', '$', false, 2),
('TRY', 'Turkish Lira', '₺', false, 3),
('EUR', 'Euro', '€', false, 4)
ON CONFLICT (code) DO NOTHING;

-- 1. UNITS SEED (082 Consolidated)
INSERT INTO units (code, name) VALUES 
('ADET', 'Adet'),
('GRAM', 'Gram'),
('ML', 'Militre'),
('KG', 'Kilogram'),
('LT', 'Litre'),
('KOLI', 'Koli'),
('PKT', 'Paket')
ON CONFLICT (code) DO NOTHING;

-- 2. RBAC ROLES SEED (085 Consolidated)
INSERT INTO public.roles (id, name, description, is_system_role, color, permissions) VALUES
('00000000-0000-0000-0000-000000000001', 'admin', 'Tam yetkili sistem yöneticisi', true, '#9333ea', '["*"]'),
('00000000-0000-0000-0000-000000000002', 'manager', 'Mağaza Müdürü', true, '#3B82F6', '["pos.*", "management.*", "reports.*"]'),
('00000000-0000-0000-0000-000000000003', 'cashier', 'Kasiyer - Satış Yetkisi', true, '#10B981', '["pos.view", "pos.sell"]'),
('00000000-0000-0000-0000-000000000004', 'stock', 'Stok ve Depo Sorumlusu', true, '#F59E0B', '["management.products", "reports.inventory"]')
ON CONFLICT (name) DO NOTHING;

-- 3. ADMIN USER SEED
INSERT INTO public.users (id, firm_nr, username, password_hash, full_name, email, role, role_id, is_active)
VALUES (
    '10000000-0000-4000-a000-000000000001', 
    '001', 
    'admin', 
    crypt('admin', gen_salt('bf')), 
    'System Administrator', 
    'admin@retailex.com', 
    'admin',
    '00000000-0000-0000-0000-000000000001',
    true
) ON CONFLICT (username) DO UPDATE SET 
    role_id = EXCLUDED.role_id,
    role = EXCLUDED.role;

-- 3.0 CATEGORIES (Default)
INSERT INTO categories (code, name) VALUES
('GENEL', 'Genel Ürünler'),
('HIZMET', 'Hizmetler')
ON CONFLICT (code) DO NOTHING;

-- 4.0 REPORT TEMPLATES (Standard Modern Designs from 028)
INSERT INTO public.report_templates (name, description, category, content, is_default)
VALUES 
(
    'Modern Satış Faturası', 
    'Logo ERP standartlarında modern ve temiz bir fatura tasarımı.', 
    'fatura', 
    '{"pageSize": {"width": 210, "height": 297}, "components": []}', 
    true
),
(
    'Standart Ürün Etiketi (40x20mm)', 
    'Raf ve ürünler için standart barkodlu etiket.', 
    'etiket', 
    '{"pageSize": {"width": 40, "height": 20}, "components": []}', 
    true
) ON CONFLICT DO NOTHING;

-- 5.0 INITIAL FIRM BOOTSTRAP
----------------------------------------------------------------------------
-- This ensures the dynamic tables for the primary firm are created immediately.

SELECT CREATE_FIRM_TABLES('001');
SELECT CREATE_PERIOD_TABLES('001', '01');

-- Vertical Inits
SELECT INIT_RESTAURANT_FIRM_TABLES('001');
SELECT INIT_BEAUTY_FIRM_TABLES('001');
SELECT INIT_RESTAURANT_PERIOD_TABLES('001', '01');
SELECT INIT_BEAUTY_PERIOD_TABLES('001', '01');

-- Default Restaurant Prep Times (firm001)
DO $$
BEGIN
    UPDATE rex_001_products SET preparation_time = 15 WHERE category ilike '%Ana Yemek%' OR category ilike '%Main%';
    UPDATE rex_001_products SET preparation_time = 20 WHERE category ilike '%Izgara%' OR category ilike '%Grill%';
    UPDATE rex_001_products SET preparation_time = 7 WHERE category ilike '%Ara Sıcak%' OR category ilike '%Starter%';
    UPDATE rex_001_products SET preparation_time = 3 WHERE category ilike '%İçecek%' OR category ilike '%Drink%';
EXCEPTION WHEN undefined_table THEN
    -- rex_001_products tablosu henüz oluşturulmamış, atlanıyor
    NULL;
END;
$$;

-- Success log
INSERT INTO public.audit_logs (firm_nr, table_name, record_id, action, new_data)
VALUES ('000', 'system', '00000000-0000-0000-0000-000000000000', 'CONSOLIDATION_V5', '{"status": "completed", "version": "5.1", "parity": "100%"}'::JSONB)
ON CONFLICT DO NOTHING;
