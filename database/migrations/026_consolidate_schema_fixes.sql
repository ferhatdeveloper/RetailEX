-- Migration: 026_consolidate_schema_fixes.sql
-- Description: Consolidates fixes from 021, 022, 024, 025, 027 into a stable schema definition.
-- Ensures CREATE_FIRM_TABLES and CREATE_PERIOD_TABLES generate the correct modern schema.
-- This script also patches existing tables to ensure consistency.

-- ============================================================================
-- 1. Redefine CREATE_FIRM_TABLES (Consolidated from 001, 024, 026)
-- ============================================================================
CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
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
            
            -- CamelCase Support (Optional but harmless)
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

    -- Customers Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            ref_id INTEGER UNIQUE,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(255),
            tax_nr VARCHAR(50),
            tax_office VARCHAR(100),
            address TEXT,
            city VARCHAR(100),
            latitude DECIMAL(10,8),
            longitude DECIMAL(11,8),
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_customers');

    -- Sales Reps Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            phone VARCHAR(50),
            password_hash VARCHAR(255),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_sales_reps');

    -- Cash Registers Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            currency_code VARCHAR(10) DEFAULT ''IQD'',
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_cash_registers');

    -- Suppliers Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(255),
            tax_nr VARCHAR(50),
            tax_office VARCHAR(100),
            address TEXT,
            city VARCHAR(100),
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_suppliers');

    -- Campaigns Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10),
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            campaign_type VARCHAR(50),
            discount_value DECIMAL(15,2),
            start_date TIMESTAMPTZ,
            end_date TIMESTAMPTZ,
            priority INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_campaigns');

    -- Standard Lookups (Categories, Brands, Units, etc.)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL);', v_prefix || '_categories');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL);', v_prefix || '_brands');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL);', v_prefix || '_units');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, rate DECIMAL(5,2));', v_prefix || '_tax_rates');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, currency_symbol VARCHAR(10));', v_prefix || '_currencies');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, group_nr INTEGER);', v_prefix || '_special_codes');

    -- Product Variants Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            product_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            code VARCHAR(100) UNIQUE,
            barcode VARCHAR(100),
            name VARCHAR(255),
            color VARCHAR(50),
            size VARCHAR(50),
            price DECIMAL(15,2),
            cost DECIMAL(15,2),
            stock DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_product_variants', v_prefix || '_products');

    -- Lots Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            product_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            lot_no VARCHAR(100) NOT NULL,
            exp_date DATE,
            stock DECIMAL(15,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_lots', v_prefix || '_products');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_products_ref_id', v_prefix || '_products');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_customers_ref_id', v_prefix || '_customers');
    EXECUTE format('CREATE OR REPLACE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enqueue_sync_event();', 'sync_' || v_prefix || '_products', v_prefix || '_products');
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 2. Redefine CREATE_PERIOD_TABLES (Consolidated from 001, 022, 025)
-- ============================================================================
CREATE OR REPLACE FUNCTION CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr || '_' || p_period_nr);

    -- Sales Header
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            period_nr VARCHAR(10) NOT NULL,
            
            -- Identification
            fiche_no VARCHAR(100) UNIQUE,
            document_no VARCHAR(100),
            receipt_number VARCHAR(100),
            
            -- References
            customer_id UUID,
            store_id UUID REFERENCES stores(id),
            cashier VARCHAR(100),
            
            -- Financials
            total_net DECIMAL(15,2) DEFAULT 0,
            total_vat DECIMAL(15,2) DEFAULT 0,
            total_gross DECIMAL(15,2) DEFAULT 0,
            total_discount DECIMAL(15,2) DEFAULT 0,
            net_amount DECIMAL(15,2) DEFAULT 0,
            
            -- Meta
            trcode INTEGER,
            fiche_type VARCHAR(50),
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            
            -- Status & Details
            status VARCHAR(20) DEFAULT ''completed'',
            notes TEXT,
            description TEXT,
            payment_method VARCHAR(50),
            
            -- Analysis & Currency
            customer_name VARCHAR(255),
            total_cost DECIMAL(15,2) DEFAULT 0,
            gross_profit DECIMAL(15,2) DEFAULT 0,
            profit_margin DECIMAL(15,2) DEFAULT 0,
            currency VARCHAR(10) DEFAULT ''IQD'',
            currency_rate DECIMAL(15,8) DEFAULT 1,
            
            -- Logistics
            waybill_no VARCHAR(100),
            shipment_agent VARCHAR(100),
            driver_name VARCHAR(100),
            vehicle_plate VARCHAR(50),
            shipping_address TEXT,
            due_date TIMESTAMPTZ,
            delivery_date TIMESTAMPTZ,
            
            -- E-Invoice
            is_e_invoice BOOLEAN DEFAULT false,
            e_invoice_status VARCHAR(50),
            e_invoice_uuid UUID,
            is_cancelled BOOLEAN DEFAULT false,
            
            -- Legacy/Compatibility
            ref_id INTEGER UNIQUE,
            customer_ref INTEGER,
            salesman_ref INTEGER
        );
    ', v_prefix || '_sales');

    -- Sale Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            
            -- References
            invoice_id UUID,
            sale_ref UUID,
            firm_nr VARCHAR(10),
            
            -- Item Details
            item_code VARCHAR(100),
            item_name VARCHAR(255),
            product_id UUID,
            
            -- Values
            quantity DECIMAL(15,2) NOT NULL DEFAULT 0,
            price DECIMAL(15,2) DEFAULT 0,
            unit_price DECIMAL(15,2) DEFAULT 0,
            
            vat_rate DECIMAL(5,2) DEFAULT 20,
            discount_rate DECIMAL(5,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            
            total_amount DECIMAL(15,2) DEFAULT 0,
            net_amount DECIMAL(15,2) DEFAULT 0,
            total_net DECIMAL(15,2) DEFAULT 0,
            total_vat DECIMAL(15,2) DEFAULT 0,
            total_gross DECIMAL(15,2) DEFAULT 0,
            
            -- Analysis & Cost
            unit_cost DECIMAL(15,2) DEFAULT 0,
            total_cost DECIMAL(15,2) DEFAULT 0,
            gross_profit DECIMAL(15,2) DEFAULT 0,
            
            description TEXT,
            unit VARCHAR(20) DEFAULT ''Adet'',
            
            -- Legacy
            ref_id INTEGER UNIQUE,
            product_ref INTEGER
        );
    ', v_prefix || '_sale_items');

    -- Cash Lines
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            cash_ref INTEGER,
            fiche_no VARCHAR(100),
            
            -- Modern Metadata
            register_id UUID,
            transaction_type VARCHAR(50),
            
            trcode INTEGER,
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            amount DECIMAL(15,2) DEFAULT 0,
            sign INTEGER DEFAULT 0, 
            customer_ref INTEGER,
            definition TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_cash_lines');

    -- Stock Movements
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            document_no VARCHAR(50) UNIQUE,
            movement_type VARCHAR(20),
            warehouse_id UUID REFERENCES stores(id),
            movement_date TIMESTAMPTZ DEFAULT NOW(),
            description TEXT,
            status VARCHAR(20) DEFAULT ''completed'',
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ', v_prefix || '_stock_movements');

    -- Stock Movement Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            movement_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            product_id UUID,
            quantity DECIMAL(15,2) DEFAULT 0,
            unit_price DECIMAL(15,2) DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');

END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 3. Run Consolidation & Fixes on Existing Data
-- ============================================================================
DO $$
DECLARE
    r RECORD;
    p RECORD;
    v_table_name TEXT;
    v_constraint_name TEXT;
BEGIN
    -- 3.1 Loop Firms
    FOR r IN SELECT id, firm_nr FROM firms
    LOOP
        -- Proactively ensure firm tables exist (includes product fields fix)
        PERFORM public.CREATE_FIRM_TABLES(r.firm_nr);

        -- Rename varsayilan to "default" (from 027)
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'firms' AND column_name = 'varsayilan') THEN
            ALTER TABLE firms RENAME COLUMN varsayilan TO "default";
        ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'firms' AND column_name = 'default') THEN
            ALTER TABLE firms ADD COLUMN "default" BOOLEAN DEFAULT false;
        END IF;

        -- 3.2 Loop Periods
        FOR p IN SELECT id, nr FROM periods WHERE firm_id = r.id
        LOOP
            -- Proactively ensure period tables exist (Crucial for missing _sales tables)
            PERFORM public.CREATE_PERIOD_TABLES(r.firm_nr, LPAD(p.nr::text, 2, '0'));

            -- Rename varsayilan to "default" (from 027)
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'periods' AND column_name = 'varsayilan') THEN
                ALTER TABLE periods RENAME COLUMN varsayilan TO "default";
            ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'periods' AND column_name = 'default') THEN
                ALTER TABLE periods ADD COLUMN "default" BOOLEAN DEFAULT false;
            END IF;

            -- Patch existing Sales tables if needed (ensure columns added by latest version exist)
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_sales');
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS customer_id UUID';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS cashier VARCHAR(100)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_net DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_vat DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_discount DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS trcode INTEGER';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS fiche_type VARCHAR(50)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS notes TEXT';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10) DEFAULT ' || quote_literal(r.firm_nr);
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS period_nr VARCHAR(10) DEFAULT ' || quote_literal(LPAD(p.nr::text, 2, '0'));
                
                -- Analysis & Currency
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT ''IQD''';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS currency_rate DECIMAL(15,8) DEFAULT 1';
                
                -- UI/UX (from sales.ts)
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS cashier VARCHAR(100)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS store_id UUID';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS document_no VARCHAR(100)';
            END IF;

            -- Patch existing Sale Items tables
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_sale_items');
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS invoice_id UUID';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS item_code VARCHAR(100)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS item_name VARCHAR(255)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS quantity DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS discount_rate DECIMAL(5,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0';
                
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0';
            END IF;

            -- Patch Cash Lines (from 022 fix)
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_cash_lines');
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS register_id UUID';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50)';
            END IF;
        END LOOP;
        
    END LOOP;

    -- Extra: Stores (Rename varsayilan to "default")
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'varsayilan') THEN
        ALTER TABLE stores RENAME COLUMN varsayilan TO "default";
    ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stores' AND column_name = 'default') THEN
        ALTER TABLE stores ADD COLUMN "default" BOOLEAN DEFAULT false;
    END IF;
END $$;
