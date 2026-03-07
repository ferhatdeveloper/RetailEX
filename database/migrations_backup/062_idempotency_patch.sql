-- ============================================================================
-- Migration: 062_idempotency_patch.sql
-- Description: Final patch to ensure all dynamic SQL triggers are idempotent.
-- This redefines core functions to use CREATE OR REPLACE TRIGGER (PG 14+).
-- ============================================================================

-- 1. Redefine CREATE_FIRM_TABLES with OR REPLACE TRIGGER
CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- Products Table (Firm Specific)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF
            code VARCHAR(100) UNIQUE,
            barcode VARCHAR(100),
            name VARCHAR(255) NOT NULL,
            name2 VARCHAR(255),
            category_id UUID REFERENCES categories(id),
            unit_id UUID REFERENCES units(id),
            vat_rate DECIMAL(5,2) DEFAULT 20,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            tracking_type VARCHAR(20) DEFAULT ''none'', -- none, lot, serial
            
            -- Extended Fields (Migration 024-034+)
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
            
            price_list_1 DECIMAL(15,2) DEFAULT 0,
            price_list_2 DECIMAL(15,2) DEFAULT 0,
            price_list_3 DECIMAL(15,2) DEFAULT 0,
            price_list_4 DECIMAL(15,2) DEFAULT 0,
            price_list_5 DECIMAL(15,2) DEFAULT 0,
            price_list_6 DECIMAL(15,2) DEFAULT 0,
            
            unit VARCHAR(50) DEFAULT %L,
            material_type VARCHAR(50),
            unit2 VARCHAR(20),
            unit3 VARCHAR(20),
            tax_type VARCHAR(20),
            withholding_rate DECIMAL(5,2),
            currency VARCHAR(10),
            
            shelf_location VARCHAR(50),
            warehouse_code VARCHAR(50),
            
            -- Lowercase CamelCase aliases (Postgres lowers unquoted identifiers)
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
    ', v_prefix || '_products', 'Adet');

    -- Product Variants Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            product_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            variant_name VARCHAR(255),
            sku VARCHAR(100),
            barcode VARCHAR(100) UNIQUE,
            attributes JSONB,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            min_stock DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_product_variants', v_prefix || '_products');

    -- Lots Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            product_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            variant_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            lot_no VARCHAR(100) NOT NULL,
            serial_no VARCHAR(100),
            expiration_date DATE,
            production_date DATE,
            quantity DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_lots', v_prefix || '_products', v_prefix || '_product_variants');

    -- Customers Table (Firm Specific)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF
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
            latitude DECIMAL(10,8),
            longitude DECIMAL(11,8),
            balance DECIMAL(15,2) DEFAULT 0,
            points DECIMAL(15,2) DEFAULT 0,
            total_spent DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_customers');

    -- Sales Reps Table (Firm Specific)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            phone VARCHAR(50),
            password_hash VARCHAR(255),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_sales_reps');

    -- Cash Registers Table (Firm Specific)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF (KSCARD)
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            currency_code VARCHAR(10),
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_cash_registers');

    -- Indexes for Sync Performance
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_products_ref_id', v_prefix || '_products');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_customers_ref_id', v_prefix || '_customers');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_sales_reps_ref_id', v_prefix || '_sales_reps');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_cash_registers_ref_id', v_prefix || '_cash_registers');
    
    -- SYNC TRIGGER (Idempotent v0.1.36+)
    EXECUTE format('
        CREATE OR REPLACE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I 
        FOR EACH ROW EXECUTE FUNCTION enqueue_sync_event();
    ', 'sync_' || v_prefix || '_products', v_prefix || '_products');

    -- INITIALIZE VERTICAL MODULES (RESTAURANT & BEAUTY)
    BEGIN
        PERFORM INIT_RESTAURANT_FIRM_TABLES(p_firm_nr);
    EXCEPTION WHEN OTHERS THEN 
        RAISE NOTICE ''Could not initialize restaurant firm tables for %'', p_firm_nr;
    END;

    BEGIN
        PERFORM INIT_BEAUTY_FIRM_TABLES(p_firm_nr);
    EXCEPTION WHEN OTHERS THEN 
        RAISE NOTICE ''Could not initialize beauty firm tables for %'', p_firm_nr;
    END;

END;
$$ LANGUAGE plpgsql;

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
            ref_id INTEGER UNIQUE,
            fiche_no VARCHAR(100) UNIQUE,
            document_no VARCHAR(100),
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            fiche_type VARCHAR(50),
            trcode INTEGER,
            
            customer_id UUID,
            customer_ref INTEGER,
            customer_name VARCHAR(255),
            salesman_ref INTEGER,
            store_id UUID REFERENCES stores(id),
            
            total_net DECIMAL(15,2) DEFAULT 0,
            total_vat DECIMAL(15,2) DEFAULT 0,
            total_gross DECIMAL(15,2) DEFAULT 0,
            total_discount DECIMAL(15,2) DEFAULT 0,
            net_amount DECIMAL(15,2) DEFAULT 0,
            
            total_cost DECIMAL(15,2) DEFAULT 0,
            gross_profit DECIMAL(15,2) DEFAULT 0,
            profit_margin DECIMAL(15,2) DEFAULT 0,
            
            currency VARCHAR(10) DEFAULT ''IQD'',
            currency_rate DECIMAL(15,6) DEFAULT 1,
            
            due_date TIMESTAMPTZ,
            delivery_date TIMESTAMPTZ,
            description TEXT,
            notes TEXT,
            payment_method VARCHAR(50),
            cashier VARCHAR(100),
            
            -- Waybill
            waybill_no VARCHAR(100),
            shipment_agent VARCHAR(100),
            driver_name VARCHAR(100),
            vehicle_plate VARCHAR(50),
            shipping_address TEXT,
            
            -- E-Invoice
            is_e_invoice BOOLEAN DEFAULT false,
            e_invoice_status VARCHAR(50),
            e_invoice_uuid UUID,
            
            status VARCHAR(20) DEFAULT %L,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            is_cancelled BOOLEAN DEFAULT false
        );
    ', v_prefix || '_sales', 'completed');

    -- Sale Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            sale_ref UUID REFERENCES %I(id) ON DELETE CASCADE,
            invoice_id UUID, -- Frontend alias
            firm_nr VARCHAR(10),
            product_ref INTEGER,
            item_code VARCHAR(100),
            item_name VARCHAR(255),
            
            quantity DECIMAL(15,3) NOT NULL DEFAULT 0,
            amount DECIMAL(15,2) NOT NULL DEFAULT 0,
            price DECIMAL(15,2) NOT NULL DEFAULT 0,
            unit_price DECIMAL(15,2) NOT NULL DEFAULT 0,
            vat_rate DECIMAL(5,2) DEFAULT 0,
            
            discount_rate DECIMAL(5,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            
            total_net DECIMAL(15,2) NOT NULL DEFAULT 0,
            total_vat DECIMAL(15,2) NOT NULL DEFAULT 0,
            total_gross DECIMAL(15,2) NOT NULL DEFAULT 0,
            net_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
            
            unit_cost DECIMAL(15,2) DEFAULT 0,
            total_cost DECIMAL(15,2) DEFAULT 0,
            gross_profit DECIMAL(15,2) DEFAULT 0,
            
            description TEXT,
            unit VARCHAR(20) DEFAULT %L,

            -- Tracking Info
            serial_no VARCHAR(100),
            lot_no VARCHAR(100),
            expiration_date DATE
        );
    ', v_prefix || '_sale_items', v_prefix || '_sales', 'Adet');

    -- Cash Transactions
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            cash_ref INTEGER,
            fiche_no VARCHAR(100),
            trcode INTEGER,
            date TIMESTAMPTZ,
            amount DECIMAL(15,2),
            sign INTEGER, 
            customer_ref INTEGER,
            definition TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_cash_lines');

    -- Stock Movements (Header)
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

    -- Stock Movement Items (Lines)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            movement_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            product_id UUID,
            quantity DECIMAL(15,2) DEFAULT 0,
            unit_price DECIMAL(15,2) DEFAULT 0,
            notes TEXT,
            
            -- Tracking Info
            serial_no VARCHAR(100),
            lot_no VARCHAR(100),
            expiration_date DATE,

            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');

    -- INITIALIZE VERTICAL MODULES (PERIOD TRANSACTIONS)
    BEGIN
        PERFORM INIT_RESTAURANT_PERIOD_TABLES(p_firm_nr, p_period_nr);
    EXCEPTION WHEN OTHERS THEN 
        RAISE NOTICE ''Could not initialize restaurant period tables for %_%'', p_firm_nr, p_period_nr;
    END;

    BEGIN
        PERFORM INIT_BEAUTY_PERIOD_TABLES(p_firm_nr, p_period_nr);
    EXCEPTION WHEN OTHERS THEN 
        RAISE NOTICE ''Could not initialize beauty period tables for %_%'', p_firm_nr, p_period_nr;
    END;

END;
$$ LANGUAGE plpgsql;

-- 3. Mark the most critical old migrations as 'done' for new firms if needed, 
-- but here we just ensure functions are correct.
SELECT 'Idempotency patch applied successfully' as result;
