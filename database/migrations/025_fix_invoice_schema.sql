-- Migration: 025_fix_invoice_schema.sql
-- Description: Align schema with Frontend/API expectations (Modern Standalone Mode)
-- Adding columns that are used in INSERT statements in invoices.ts and sales.ts

-- 1. Redefine CREATE_PERIOD_TABLES with ALL required columns
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
            receipt_number VARCHAR(100), -- specific to sales.ts usage if any
            
            -- References
            customer_id UUID, -- Modern UUID reference
            store_id UUID REFERENCES stores(id),
            cashier VARCHAR(100), -- Stored as name/string in API
            
            -- Financials
            total_net DECIMAL(15,2) DEFAULT 0,
            total_vat DECIMAL(15,2) DEFAULT 0,
            total_gross DECIMAL(15,2) DEFAULT 0,
            total_discount DECIMAL(15,2) DEFAULT 0,
            net_amount DECIMAL(15,2) DEFAULT 0, -- Used in API (Grand Total)
            
            -- Meta
            trcode INTEGER,
            fiche_type VARCHAR(50), -- sales_invoice, purchase_invoice, etc.
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
            invoice_id UUID, -- Code uses this name
            sale_ref UUID,   -- Legacy/Schema name (keep for compatibility)
            firm_nr VARCHAR(10),
            
            -- Item Details
            item_code VARCHAR(100), -- Code uses this
            item_name VARCHAR(255), -- Code uses this
            product_id UUID,        -- If available
            
            -- Values
            quantity DECIMAL(15,2) NOT NULL DEFAULT 0,
            price DECIMAL(15,2) DEFAULT 0,
            unit_price DECIMAL(15,2) DEFAULT 0, -- Code uses this
            
            vat_rate DECIMAL(5,2) DEFAULT 20,
            discount_rate DECIMAL(5,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            
            total_amount DECIMAL(15,2) DEFAULT 0, -- Gross? Code uses this
            net_amount DECIMAL(15,2) DEFAULT 0,   -- Net? Code uses this
            total_net DECIMAL(15,2) DEFAULT 0,
            total_vat DECIMAL(15,2) DEFAULT 0,
            total_gross DECIMAL(15,2) DEFAULT 0,
            
            description TEXT,
            unit VARCHAR(20) DEFAULT ''Adet'',
            
            -- Legacy
            ref_id INTEGER UNIQUE,
            product_ref INTEGER
        );
    ', v_prefix || '_sale_items');
    
    -- Sync Trigger (Optional, if we want to sync sales)
    -- We'll skip adding trigger here to avoid complexity, usually defined separately.
    
    -- Cash Lines (Keep existing structure but ensure it exists)
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

    -- Stock Movements (Header) - Ensure columns match API if needed
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

-- 2. Apply changes to existing tables
DO $$
DECLARE
    r RECORD;
    v_table_name TEXT;
BEGIN
    FOR r IN 
        SELECT f.firm_nr, LPAD(p.nr::text, 2, '0') as period_nr 
        FROM periods p
        JOIN firms f ON p.firm_id = f.id
    LOOP
        -- SALES HEADER
        v_table_name := lower('rex_' || r.firm_nr || '_' || r.period_nr || '_sales');

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS customer_id UUID';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS notes TEXT';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS cashier VARCHAR(100)';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS fiche_type VARCHAR(50)';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10)';
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS period_nr VARCHAR(10)';
            
            -- Fill default firm/period if missing (assuming 009/01 for now or skip)
            -- We won't backfill data here to avoid errors.
        END IF;

        -- SALES ITEMS
        v_table_name := lower('rex_' || r.firm_nr || '_' || r.period_nr || '_sale_items');

        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
           EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS invoice_id UUID';
           EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS item_code VARCHAR(100)';
           EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS item_name VARCHAR(255)';
           EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2) DEFAULT 0';
           EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0';
           EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0';
           EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10)';
        END IF;

    END LOOP;
END $$;
