-- Migration: 013_sales_store_id.sql
-- Description: Add store_id to Sales tables for Store performance reporting

-- 1. Redefine CREATE_PERIOD_TABLES to include store_id in Sales
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
            customer_ref INTEGER,
            salesman_ref INTEGER,
            store_id UUID REFERENCES stores(id), -- Added store_id
            total_net DECIMAL(15,2) DEFAULT 0,
            total_vat DECIMAL(15,2) DEFAULT 0,
            total_gross DECIMAL(15,2) DEFAULT 0,
            trcode INTEGER,
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            is_cancelled BOOLEAN DEFAULT false,
            status VARCHAR(20) DEFAULT ''completed''
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
            total_net DECIMAL(15,2) NOT NULL,
            total_vat DECIMAL(15,2) NOT NULL,
            total_gross DECIMAL(15,2) NOT NULL
        );
    ', v_prefix || '_sale_items', v_prefix || '_sales');

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
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');

END;
$$ LANGUAGE plpgsql;

-- 2. Add store_id to existing sales tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE tablename LIKE 'rex_%_sales' LOOP
        EXECUTE 'ALTER TABLE ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id)';
        EXECUTE 'ALTER TABLE ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || ' ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT ''completed''';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_' || r.tablename || '_store_id ON ' || quote_ident(r.schemaname) || '.' || quote_ident(r.tablename) || '(store_id)';
    END LOOP;
END$$;
