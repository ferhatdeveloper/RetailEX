-- Migration: 036_accounting_reconciliation.sql
-- Description: Adds Logo synchronization status columns to sales and items for reconciliation.
-- Also enhances sync_logs with store_code for better observability.

-- 1. Enhance sync_logs
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS store_code VARCHAR(50);
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS detail JSONB;

-- 2. Update CREATE_PERIOD_TABLES to include reconciliation columns
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
            salesman_ref INTEGER,

            -- Logo Synchronization (New in Phase 3)
            logo_sync_status VARCHAR(20) DEFAULT ''pending'',
            logo_sync_date TIMESTAMPTZ,
            logo_sync_error TEXT,
            logo_logicalref INTEGER
        );
    ', v_prefix || '_sales');

    -- Sale Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            
            -- References
            invoice_id UUID REFERENCES %I(id) ON DELETE CASCADE,
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
            product_ref INTEGER,

            -- Logo Synchronization (New in Phase 3)
            logo_logicalref INTEGER
        );
    ', v_prefix || '_sale_items', v_prefix || '_sales');

    -- Cash Lines (Ensured)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            cash_ref INTEGER,
            fiche_no VARCHAR(100),
            register_id UUID,
            transaction_type VARCHAR(50),
            trcode INTEGER,
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            amount DECIMAL(15,2) DEFAULT 0,
            sign INTEGER DEFAULT 0, 
            customer_ref INTEGER,
            definition TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            
            -- Logo Synchronization (Optional but good for consistency)
            logo_sync_status VARCHAR(20) DEFAULT ''pending'',
            logo_sync_date TIMESTAMPTZ,
            logo_sync_error TEXT,
            logo_logicalref INTEGER
        );
    ', v_prefix || '_cash_lines');

    -- Stock Movements (Ensured)
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
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            
            -- Logo Synchronization
            logo_sync_status VARCHAR(20) DEFAULT ''pending'',
            logo_sync_date TIMESTAMPTZ,
            logo_sync_error TEXT,
            logo_logicalref INTEGER
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
            created_at TIMESTAMPTZ DEFAULT NOW(),
            logo_logicalref INTEGER
        );
    ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');

END;
$$ LANGUAGE plpgsql;

-- 3. Patch existing tables
DO $$
DECLARE
    r RECORD;
    p RECORD;
    v_table_name TEXT;
BEGIN
    FOR r IN SELECT firm_nr, id FROM public.firms LOOP
        FOR p IN SELECT nr FROM public.periods WHERE firm_id = r.id LOOP
            -- Sales
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_sales');
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT ''pending''';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_sync_date TIMESTAMPTZ';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_sync_error TEXT';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_logicalref INTEGER';
            END IF;

            -- Sale Items
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_sale_items');
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_logicalref INTEGER';
            END IF;

            -- Cash Lines
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_cash_lines');
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT ''pending''';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_sync_date TIMESTAMPTZ';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_sync_error TEXT';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_logicalref INTEGER';
            END IF;

            -- Stock Movements
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_stock_movements');
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_sync_status VARCHAR(20) DEFAULT ''pending''';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_sync_date TIMESTAMPTZ';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_sync_error TEXT';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_logicalref INTEGER';
            END IF;

            -- Stock Movement Items
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_stock_movement_items');
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS logo_logicalref INTEGER';
            END IF;
        END LOOP;
    END LOOP;
END $$;
