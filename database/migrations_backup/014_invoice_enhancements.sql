-- Migration: 014_invoice_enhancements.sql
-- Description: Add fields to sales tables for Universal Invoice (Waybill, E-Invoice, etc.)

-- 1. Redefine CREATE_PERIOD_TABLES to include new fields
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
            document_no VARCHAR(100), -- User entered document number
            
            customer_ref INTEGER,
            salesman_ref INTEGER,
            store_id UUID REFERENCES stores(id),
            
            total_net DECIMAL(15,2) DEFAULT 0,
            total_vat DECIMAL(15,2) DEFAULT 0,
            total_gross DECIMAL(15,2) DEFAULT 0,
            total_discount DECIMAL(15,2) DEFAULT 0,
            
            trcode INTEGER,
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            due_date TIMESTAMPTZ, -- Vade tarihi
            delivery_date TIMESTAMPTZ, -- Teslim tarihi
            
            description TEXT, -- Notes
            payment_method VARCHAR(50), -- Cash, Credit Card, Open Account
            
            -- Logistics / Waybill
            waybill_no VARCHAR(100),
            shipment_agent VARCHAR(100),
            driver_name VARCHAR(100),
            vehicle_plate VARCHAR(50),
            shipping_address TEXT,
            
            -- E-Invoice / E-Archive
            is_e_invoice BOOLEAN DEFAULT false,
            e_invoice_status VARCHAR(50), -- Pending, Sent, Approved, Rejected
            e_invoice_uuid UUID,
            
            status VARCHAR(20) DEFAULT ''completed'',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            is_cancelled BOOLEAN DEFAULT false
        );
    ', v_prefix || '_sales');

    -- Sale Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            sale_ref UUID REFERENCES %I(id) ON DELETE CASCADE,
            product_ref INTEGER,
            
            amount DECIMAL(15,2) NOT NULL,
            price DECIMAL(15,2) NOT NULL,
            vat_rate DECIMAL(5,2) DEFAULT 20,
            
            discount_rate DECIMAL(5,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            
            total_net DECIMAL(15,2) NOT NULL,
            total_vat DECIMAL(15,2) NOT NULL,
            total_gross DECIMAL(15,2) NOT NULL,
            
            description TEXT,
            unit VARCHAR(20) DEFAULT ''Adet''
        );
    ', v_prefix || '_sale_items', v_prefix || '_sales');

    -- Cash Transactions (No Change)
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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');

END;
$$ LANGUAGE plpgsql;

-- 2. Add new columns to existing sales tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE tablename LIKE 'rex_%_sales' LOOP
        -- Basic Info
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS document_no VARCHAR(100)';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS total_discount DECIMAL(15,2) DEFAULT 0';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS description TEXT';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)';
        
        -- Dates
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS delivery_date TIMESTAMPTZ';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()';
        
        -- Logistics
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS waybill_no VARCHAR(100)';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS shipment_agent VARCHAR(100)';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS driver_name VARCHAR(100)';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS vehicle_plate VARCHAR(50)';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS shipping_address TEXT';
        
        -- E-Invoice
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS is_e_invoice BOOLEAN DEFAULT false';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS e_invoice_status VARCHAR(50)';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS e_invoice_uuid UUID';
    END LOOP;
END$$;

-- 3. Add new columns to sale items
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE tablename LIKE 'rex_%_sale_items' LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS discount_rate DECIMAL(5,2) DEFAULT 0';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(15,2) DEFAULT 0';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS description TEXT';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS unit VARCHAR(20) DEFAULT ''Adet''';
    END LOOP;
END$$;
