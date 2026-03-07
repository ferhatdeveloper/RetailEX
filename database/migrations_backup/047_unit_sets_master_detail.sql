-- Migration: 047_unit_sets_master_detail.sql
-- Description: Adds master-detail unit set support for Logo ERP integration.

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
            unitset_id UUID, -- Link to new unitsets table
            category VARCHAR(255),
            unit VARCHAR(50),      
            vat_rate DECIMAL(5,2) DEFAULT 20,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_products');

    -- Customers
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10), ref_id INTEGER UNIQUE, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_customers');

    -- Suppliers
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), ref_id INTEGER UNIQUE, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_suppliers');

    -- Unit Sets (Master)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_unitsets');

    -- Unit Set Lines (Detail)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            unitset_id UUID NOT NULL,
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF (UNITSETL)
            code VARCHAR(20) NOT NULL,
            name VARCHAR(100),
            main_unit BOOLEAN DEFAULT false,
            conv_fact1 DECIMAL(15,6) DEFAULT 1,
            conv_fact2 DECIMAL(15,6) DEFAULT 1,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_unitsetl');

    -- Existing Lookups
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, parent_id UUID, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_categories');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_brands');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_units');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, rate DECIMAL(5,2), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_tax_rates');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(10) UNIQUE, name VARCHAR(255) NOT NULL, currency_symbol VARCHAR(10), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_currencies');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, module_type VARCHAR(50), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_special_codes');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_cash_registers');

    -- Apply Sync Triggers
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_unitsets');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_unitsetl');
END;
$$ LANGUAGE plpgsql;

-- 2. Loop through all existing firms and patch/create their unit set tables
DO $$
DECLARE
    r RECORD;
    v_prefix TEXT;
    v_table TEXT;
BEGIN
    FOR r IN SELECT firm_nr FROM firms LOOP
        v_prefix := lower('rex_' || r.firm_nr);
        
        -- Create Unitsets
        v_table := v_prefix || '_unitsets';
        EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), ref_id INTEGER UNIQUE, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_table);
        PERFORM public.APPLY_SYNC_TRIGGERS(v_table);

        -- Create Unitsetl
        v_table := v_prefix || '_unitsetl';
        EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), unitset_id UUID NOT NULL, ref_id INTEGER UNIQUE, code VARCHAR(20) NOT NULL, name VARCHAR(100), main_unit BOOLEAN DEFAULT false, conv_fact1 DECIMAL(15,6) DEFAULT 1, conv_fact2 DECIMAL(15,6) DEFAULT 1, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_table);
        PERFORM public.APPLY_SYNC_TRIGGERS(v_table);

        -- Patch Products Table
        v_table := v_prefix || '_products';
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table) THEN
            EXECUTE 'ALTER TABLE ' || quote_ident(v_table) || ' ADD COLUMN IF NOT EXISTS unitset_id UUID';
        END IF;

    END LOOP;
END $$;
