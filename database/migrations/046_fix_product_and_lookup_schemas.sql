-- Migration: 046_fix_product_and_lookup_schemas.sql
-- Description: Fixes missing columns in product and lookup tables for all firms.
-- Ensures that categories, units, brands, etc. have is_active and parent_id,
-- and that products table has text columns for category and unit.

-- 1. Update CREATE_FIRM_TABLES function for future firms
CREATE OR REPLACE FUNCTION public.CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- Products Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            ref_id INTEGER UNIQUE,
            code VARCHAR(100) UNIQUE,
            barcode VARCHAR(100),
            name VARCHAR(255) NOT NULL,
            name2 VARCHAR(255),
            category_id UUID,
            unit_id UUID,
            category VARCHAR(255), -- Text category for API compatibility
            unit VARCHAR(50),      -- Text unit for API compatibility
            vat_rate DECIMAL(5,2) DEFAULT 20,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            
            -- Extended Fields
            min_stock DECIMAL(15,2) DEFAULT 0,
            max_stock DECIMAL(15,2) DEFAULT 0,
            critical_stock DECIMAL(15,2) DEFAULT 0,
            image_url TEXT,
            description TEXT,
            description_tr TEXT,
            description_en TEXT,
            description_ar TEXT,
            description_ku TEXT,
            
            category_code VARCHAR(50),
            group_code VARCHAR(50),
            sub_group_code VARCHAR(50),
            brand VARCHAR(100),
            model VARCHAR(100),
            manufacturer VARCHAR(100),
            supplier VARCHAR(100),
            origin VARCHAR(50),
            
            special_code_1 VARCHAR(50),
            special_code_2 VARCHAR(50),
            special_code_3 VARCHAR(50),
            special_code_4 VARCHAR(50),
            special_code_5 VARCHAR(50),
            special_code_6 VARCHAR(50),
            
            price_list_1 DECIMAL(15,2),
            price_list_2 DECIMAL(15,2),
            price_list_3 DECIMAL(15,2),
            price_list_4 DECIMAL(15,2),
            price_list_5 DECIMAL(15,2),
            price_list_6 DECIMAL(15,2),
            
            material_type VARCHAR(50),
            unit2 VARCHAR(20),
            unit3 VARCHAR(20),
            tax_type VARCHAR(20),
            withholding_rate DECIMAL(5,2),
            currency VARCHAR(10),
            
            shelf_location VARCHAR(50),
            warehouse_code VARCHAR(50),
            
            -- CamelCase Support
            categorycode VARCHAR(50),
            groupcode VARCHAR(50),
            subgroupcode VARCHAR(50),
            specialcode1 VARCHAR(50),
            specialcode2 VARCHAR(50),
            specialcode3 VARCHAR(50),
            specialcode4 VARCHAR(50),
            specialcode5 VARCHAR(50),
            specialcode6 VARCHAR(50),
            pricelist1 DECIMAL(15,2),
            pricelist2 DECIMAL(15,2),
            pricelist3 DECIMAL(15,2),
            pricelist4 DECIMAL(15,2),
            pricelist5 DECIMAL(15,2),
            pricelist6 DECIMAL(15,2),
            materialtype VARCHAR(50),

            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_products');

    -- Customers
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10), ref_id INTEGER UNIQUE, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_customers');

    -- Suppliers
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), ref_id INTEGER UNIQUE, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_suppliers');

    -- Standard Lookups (Corrected with is_active and parent_id)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, parent_id UUID, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_categories');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_brands');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_units');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, rate DECIMAL(5,2), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_tax_rates');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(10) UNIQUE, name VARCHAR(255) NOT NULL, currency_symbol VARCHAR(10), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_currencies');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, module_type VARCHAR(50), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_special_codes');

    -- Other tables (Campaigns, Cash Registers, etc.)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_cash_registers');
END;
$$ LANGUAGE plpgsql;

-- 2. Loop through all existing firms and patch their tables
DO $$
DECLARE
    r RECORD;
    v_prefix TEXT;
    v_table TEXT;
BEGIN
    FOR r IN SELECT firm_nr FROM firms LOOP
        v_prefix := lower('rex_' || r.firm_nr);
        
        -- Patch Products Table
        v_table := v_prefix || '_products';
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS category VARCHAR(255)';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS unit VARCHAR(50)';
        END IF;

        -- Patch Categories
        v_table := v_prefix || '_categories';
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS parent_id UUID';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP';
        END IF;

        -- Patch Units
        v_table := v_prefix || '_units';
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP';
        END IF;

        -- Patch Brands
        v_table := v_prefix || '_brands';
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP';
        END IF;

        -- Patch Tax Rates
        v_table := v_prefix || '_tax_rates';
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP';
        END IF;

        -- Patch Currencies
        v_table := v_prefix || '_currencies';
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP';
        END IF;

        -- Patch Special Codes
        v_table := v_prefix || '_special_codes';
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS module_type VARCHAR(50)';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP';
        END IF;

    END LOOP;
END $$;
