-- Migration: 029_lot_serial_tracking.sql
-- Description: Add tracking_type to products and serial/lot fields to transaction tables

-- 1. Update CREATE_FIRM_TABLES to include tracking_type in products
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
            ref_id INTEGER UNIQUE,
            code VARCHAR(100) UNIQUE,
            barcode VARCHAR(100) UNIQUE,
            name VARCHAR(255) NOT NULL,
            name2 VARCHAR(255),
            category_id UUID REFERENCES categories(id),
            unit_id UUID REFERENCES units(id),
            vat_rate DECIMAL(5,2) DEFAULT 20,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            tracking_type VARCHAR(20) DEFAULT ''none'', -- none, lot, serial
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_products');

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

    -- Customers Table
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
            currency_code VARCHAR(10),
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_cash_registers');
    
    -- Sync Trigger for Products
    EXECUTE format('
        CREATE OR REPLACE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I 
        FOR EACH ROW EXECUTE FUNCTION enqueue_sync_event();
    ', 'sync_' || v_prefix || '_products', v_prefix || '_products');
END;
$$ LANGUAGE plpgsql;

-- 2. Update CREATE_PERIOD_TABLES to include serial/lot fields in invoice items
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
            
            description TEXT,
            unit VARCHAR(20) DEFAULT ''Adet'',

            -- Tracking Info
            serial_no VARCHAR(100),
            lot_no VARCHAR(100),
            expiration_date DATE,
            
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

    -- Stock Movement Items
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

END;
$$ LANGUAGE plpgsql;

-- 3. Apply changes to existing tables
DO $$
DECLARE
    r RECORD;
    v_table_name TEXT;
BEGIN
    -- Update Products Tables
    FOR r IN SELECT firm_nr FROM firms LOOP
        v_table_name := lower('rex_' || r.firm_nr || '_products');
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS tracking_type VARCHAR(20) DEFAULT ''none''';
        END IF;
    END LOOP;

    -- Update Period Tables (Sale Items & Stock Movement Items)
    FOR r IN 
        SELECT f.firm_nr, LPAD(p.nr::text, 2, '0') as period_nr 
        FROM periods p
        JOIN firms f ON p.firm_id = f.id
    LOOP
        -- SALE ITEMS
        v_table_name := lower('rex_' || r.firm_nr || '_' || r.period_nr || '_sale_items');
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS serial_no VARCHAR(100)';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS lot_no VARCHAR(100)';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS expiration_date DATE';
        END IF;

        -- STOCK MOVEMENT ITEMS
        v_table_name := lower('rex_' || r.firm_nr || '_' || r.period_nr || '_stock_movement_items');
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS serial_no VARCHAR(100)';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS lot_no VARCHAR(100)';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS expiration_date DATE';
        END IF;
    END LOOP;
END $$;
