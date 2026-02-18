-- Migration: 038_security_audit_trail.sql
-- Description: Implements a global, database-level audit trail system.
-- Automatically logs INSERT, UPDATE, and DELETE operations for all ERP tables.

-- 1. Enhance Audit Logs Table
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_name VARCHAR(100);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS client_info JSONB;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS app_version VARCHAR(20);

-- 2. Create Global Audit Trigger Function
CREATE OR REPLACE FUNCTION public.log_row_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_user_id UUID;
    v_user_name TEXT;
    v_firm_nr VARCHAR(10);
BEGIN
    -- Capture operation type and data
    IF (TG_OP = 'UPDATE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
    ELSIF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
    ELSIF (TG_OP = 'INSERT') THEN
        v_new_data := to_jsonb(NEW);
    END IF;

    -- Attempt to get firm_nr from the record if it exists
    BEGIN
        v_firm_nr := NEW.firm_nr;
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            v_firm_nr := OLD.firm_nr;
        EXCEPTION WHEN OTHERS THEN
            v_firm_nr := 'SYSTEM';
        END;
    END;

    -- Note: real user session info can be set in PostgreSQL GUC (Global User Context) 
    -- by the application service (e.g., SET app.current_user_id = '...')
    v_user_id := current_setting('app.current_user_id', true)::UUID;
    v_user_name := current_setting('app.current_user_name', true);

    INSERT INTO public.audit_logs (
        user_id,
        user_name,
        firm_nr,
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        client_info
    ) VALUES (
        v_user_id,
        v_user_name,
        COALESCE(v_firm_nr, 'SYSTEM'),
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        v_old_data,
        v_new_data,
        jsonb_build_object(
            'ip', inet_client_addr(),
            'port', inet_client_port(),
            'backend_pid', pg_backend_pid()
        )
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Helper to attach trigger
CREATE OR REPLACE FUNCTION public.ATTACH_AUDIT_LOG(p_table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trigger ON %I', p_table_name);
    EXECUTE format('CREATE TRIGGER audit_trigger AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.log_row_change()', p_table_name);
END;
$$ LANGUAGE plpgsql;

-- 4. Update Dynamic Schema Logic to include Audit Logs
-- We need to patch the functions from 036 (latest version)
CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- Products Table
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, ref_id INTEGER UNIQUE, code VARCHAR(100) UNIQUE, barcode VARCHAR(100), name VARCHAR(255) NOT NULL, price DECIMAL(15,2) DEFAULT 0, cost DECIMAL(15,2) DEFAULT 0, stock DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_products');
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_products');

    -- Customers Table
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_customers');
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_customers');

    -- Add other firm-level tables as needed (Categories, etc.)
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_categories');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr || '_' || p_period_nr);

    -- Sales
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, period_nr VARCHAR(10) NOT NULL, fiche_no VARCHAR(100) UNIQUE, customer_name VARCHAR(255), total_net DECIMAL(15,2) DEFAULT 0, total_vat DECIMAL(15,2) DEFAULT 0, total_gross DECIMAL(15,2) DEFAULT 0, date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, logo_sync_status VARCHAR(20) DEFAULT ''pending'');', v_prefix || '_sales');
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_sales');

    -- Sale Items
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), invoice_id UUID, item_code VARCHAR(100), quantity DECIMAL(15,2) DEFAULT 0, price DECIMAL(15,2) DEFAULT 0);', v_prefix || '_sale_items');
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_sale_items');
    
    -- Cash Lines
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), fiche_no VARCHAR(100), amount DECIMAL(15,2) DEFAULT 0, date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_cash_lines');
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_cash_lines');
END;
$$ LANGUAGE plpgsql;

-- 5. Attach Audit Logs to existing critical tables
DO $$
BEGIN
    PERFORM public.ATTACH_AUDIT_LOG('firms');
    PERFORM public.ATTACH_AUDIT_LOG('stores');
    PERFORM public.ATTACH_AUDIT_LOG('users');
    PERFORM public.ATTACH_AUDIT_LOG('exchange_rates');
END $$;
