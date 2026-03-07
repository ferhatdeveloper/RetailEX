-- Migration: 033_sync_architecture_optimization.sql
-- Description: Optimizes the sync architecture by ensuring all tables have sync triggers, 
-- improving sync logging with store context, and strengthening relational integrity.

-- 1. Update sync_logs table to include store context
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS store_code VARCHAR(50);
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS detail JSONB;

-- 2. Improved Trigger Coverage Function
-- This function will be called during firm/period initialization to ensure ALL tables are tracked.
CREATE OR REPLACE FUNCTION public.APPLY_SYNC_TRIGGERS(p_table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP TRIGGER IF EXISTS %I ON %I;
        CREATE TRIGGER %I 
        AFTER INSERT OR UPDATE OR DELETE ON %I 
        FOR EACH ROW EXECUTE FUNCTION public.enqueue_sync_event();
    ', 'sync_trg_' || p_table_name, p_table_name, 'sync_trg_' || p_table_name, p_table_name);
END;
$$ LANGUAGE plpgsql;

-- 3. Redefine Schema Generators with Full Trigger Coverage
CREATE OR REPLACE FUNCTION public.CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- Products Table
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(100) UNIQUE, barcode VARCHAR(100), name VARCHAR(255) NOT NULL, price DECIMAL(15,2) DEFAULT 0, cost DECIMAL(15,2) DEFAULT 0, stock DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_products');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_products');

    -- Customers Table
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_customers');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_customers');

    -- Cash Registers (Kasa Kartları)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, balance DECIMAL(15,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_cash_registers');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_cash_registers');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr || '_' || p_period_nr);

    -- Sales
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), fiche_no VARCHAR(100) UNIQUE, customer_id UUID, store_id UUID REFERENCES stores(id), total_net DECIMAL(15,2) DEFAULT 0, total_gross DECIMAL(15,2) DEFAULT 0, date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_sales');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_sales');

    -- Cash Movements (Kasa Hareketleri)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), fiche_no VARCHAR(100), amount DECIMAL(15,2) DEFAULT 0, date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_cash_lines');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_cash_lines');
END;
$$ LANGUAGE plpgsql;

-- 4. Retroactively Apply to Existing Tables
DO $$
DECLARE
    r RECORD;
    p RECORD;
BEGIN
    FOR r IN SELECT firm_nr FROM firms LOOP
        PERFORM public.CREATE_FIRM_TABLES(r.firm_nr);
        FOR p IN SELECT LPAD(nr::text, 2, '0') as p_nr FROM periods JOIN firms f ON f.id = periods.firm_id WHERE f.firm_nr = r.firm_nr LOOP
            PERFORM public.CREATE_PERIOD_TABLES(r.firm_nr, p.p_nr);
        END LOOP;
    END LOOP;
END $$;
