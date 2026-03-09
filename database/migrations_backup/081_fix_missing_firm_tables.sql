-- 081_fix_missing_firm_tables.sql
-- Update CREATE_FIRM_TABLES to include categories, brands, and units
-- and ensure they exist for firm 001

CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text := lower('rex_' || p_firm_nr);
    v_tbl_products text := v_prefix || '_products';
    v_tbl_customers text := v_prefix || '_customers';
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
            categorycode VARCHAR(50),
            groupcode VARCHAR(50),
            subgroupcode VARCHAR(50),
            materialtype VARCHAR(50),
            unit VARCHAR(50) DEFAULT ''Adet'',
            unit_id UUID,
            unitset_id UUID,
            unit2 VARCHAR(20),
            unit3 VARCHAR(20),
            vat_rate DECIMAL(5,2) DEFAULT 20,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            purchase_price_usd DECIMAL(15,2) DEFAULT 0,
            purchase_price_eur DECIMAL(15,2) DEFAULT 0,
            sale_price_usd DECIMAL(15,2) DEFAULT 0,
            sale_price_eur DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            min_stock DECIMAL(15,2) DEFAULT 0,
            max_stock DECIMAL(15,2) DEFAULT 0,
            critical_stock DECIMAL(15,2) DEFAULT 0,
            price_list_1 DECIMAL(15,2) DEFAULT 0,
            price_list_2 DECIMAL(15,2) DEFAULT 0,
            price_list_3 DECIMAL(15,2) DEFAULT 0,
            price_list_4 DECIMAL(15,2) DEFAULT 0,
            price_list_5 DECIMAL(15,2) DEFAULT 0,
            price_list_6 DECIMAL(15,2) DEFAULT 0,
            pricelist1 DECIMAL(15,2),
            pricelist2 DECIMAL(15,2),
            pricelist3 DECIMAL(15,2),
            pricelist4 DECIMAL(15,2),
            pricelist5 DECIMAL(15,2),
            pricelist6 DECIMAL(15,2),
            tax_type VARCHAR(20),
            withholding_rate DECIMAL(5,2),
            currency VARCHAR(10),
            shelf_location VARCHAR(50),
            warehouse_code VARCHAR(50),
            special_code_1 VARCHAR(50),
            special_code_2 VARCHAR(50),
            special_code_3 VARCHAR(50),
            special_code_4 VARCHAR(50),
            special_code_5 VARCHAR(50),
            special_code_6 VARCHAR(50),
            specialcode1 VARCHAR(50),
            specialcode2 VARCHAR(50),
            specialcode3 VARCHAR(50),
            specialcode4 VARCHAR(50),
            specialcode5 VARCHAR(50),
            specialcode6 VARCHAR(50),
            tracking_type VARCHAR(20) DEFAULT ''none'',
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
            total_spent DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_tbl_customers);

    -- 3. Suppliers
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

    -- 4. Definitions (Categories, Brands, Units)
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

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_brands');

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            code VARCHAR(20) UNIQUE,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_units');

    -- Auto-Sync current columns for existing tables
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_restaurant BOOLEAN DEFAULT false, ADD COLUMN IF NOT EXISTS icon VARCHAR(100)', v_prefix || '_categories');

    -- 5. Unit Sets & Variants
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL);', v_prefix || '_unitsets');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), unitset_id UUID, item_code VARCHAR(20) NOT NULL, conv_fact1 DECIMAL(15,6) DEFAULT 1);', v_prefix || '_unitsetl');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), product_id UUID, sku VARCHAR(100), attributes JSONB);', v_prefix || '_product_variants');

    -- 6. Finance & Registry
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

    -- Default Seeding
    EXECUTE format('INSERT INTO %I (id, firm_nr, code, name, is_active) VALUES (''00000000-0000-0000-0000-000000000001'', %L, ''KASA.001'', ''MERKEZ KASA'', true) ON CONFLICT DO NOTHING;', v_prefix || '_cash_registers', p_firm_nr);
END;
$$ LANGUAGE plpgsql;

-- Apply for firm 001 immediately
SELECT CREATE_FIRM_TABLES('001');
