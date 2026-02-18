-- ============================================================================
-- RetailEX MIGRATION SCRIPT: LEGACY DATA MIGRATION ONLY
-- ----------------------------------------------------------------------------
-- Purpose: Migrate data from legacy schema to new RetailEX structure
-- Prerequisite: 001_schema.sql, 002_logic.sql, 003_seed.sql must run FIRST
-- This script ONLY migrates data, does NOT create tables
-- ============================================================================

-- ============================================================================
-- 1. INITIALIZE DEFAULT FIRM AND PERIOD (If not exists)
-- ============================================================================

-- Create default firm '001' if not exists
INSERT INTO firms (firm_nr, name, title, is_active)
VALUES ('001_01', 'Merkez Firma', 'Merkez Firma', true)
ON CONFLICT (firm_nr) DO NOTHING;

-- Create default period '01' for firm '001'
INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active)
SELECT id, 1, '2026-01-01', '2026-12-31', true 
FROM firms WHERE firm_nr = '001_01'
ON CONFLICT (firm_id, nr) DO NOTHING;

-- Create default store
INSERT INTO stores (code, name, firm_nr, is_main, is_active)
VALUES ('MERKEZ', 'Merkez Mağaza', '001_01', true, true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. CREATE DYNAMIC TABLES FOR FIRM 001 / PERIOD 01
-- ============================================================================

-- Create firm-specific tables (ITEMS, CLCARD)
DO $$
BEGIN
    -- Check if function exists (from 002_logic.sql)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_firm_tables') THEN
        PERFORM create_firm_tables('001_01');
    END IF;
END $$;

-- Create period-specific tables (INVOICE, STLINE, KSLINES)
DO $$
BEGIN
    -- Check if function exists (from 002_logic.sql)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_period_tables') THEN
        PERFORM create_period_tables('001_01', '01');
    END IF;
END $$;

-- ============================================================================
-- 3. MIGRATE DATA FROM LEGACY SCHEMA (If exists)
-- ============================================================================

-- 3.1 Migrate Users (Check auth.users or public.users)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_source_table TEXT;
BEGIN
    -- Check for auth.users first
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users') THEN
        INSERT INTO users (username, email, full_name, role, firm_nr, auth_user_id, is_active)
        SELECT 
            COALESCE(email, id::text) as username,
            email,
            COALESCE(raw_user_meta_data->>'full_name', email, 'User') as full_name,
            'admin',
            '001_01',
            id,
            true
        FROM auth.users
        WHERE email IS NOT NULL
        ON CONFLICT (username) DO NOTHING;
        RAISE NOTICE 'Migrated users from auth.users';
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
         -- Attempt to migrate from public.users if compatible columns exist
         -- This is risky if public.users is the NEW table, so we must be careful.
         -- If public.users already has data (from 001_schema), we skip.
         -- We assumes this block runs to populate EMPTY public.users from unexpected source.
         -- Actually, safe to skip if auth.users is missing, user can manually create admin.
         RAISE NOTICE 'auth.users not found. Checking if public.users has data...';
    END IF;
END $$;

-- 3.2 Migrate Categories (from public or legacy)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_source_schema TEXT;
BEGIN
    -- Determine source schema
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'categories') THEN
        -- BEWARE: public.categories is the TARGET table too. 
        -- If we insert from public.categories into public.categories, it does nothing or duplicates.
        -- We only migrate if source is DIFFERENT or if we are mapping from a backup table named 'categories' 
        -- but assumed to be in 'legacy'.
        -- If backup restored to 'public', we might already HAVE the data in 'categories'.
        -- So we skip if source is 'public' and target is 'public' (same table).
        RAISE NOTICE 'public.categories exists. Assuming data is already there or restored.';
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'legacy' AND tablename = 'categories') THEN
        INSERT INTO categories (code, name, parent_id, is_active)
        SELECT 
            code,
            name,
            parent_id,
            COALESCE(is_active, true)
        FROM legacy.categories
        ON CONFLICT (code) DO NOTHING;
        RAISE NOTICE 'Migrated categories from legacy.categories';
    END IF;
END $$;

-- 3.3 Migrate Products to REX_001_PRODUCTS (from public or legacy)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_source_schema TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products') THEN
        v_source_schema := 'public';
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'legacy' AND tablename = 'products') THEN
        v_source_schema := 'legacy';
    ELSE 
        v_source_schema := NULL;
    END IF;

    IF v_source_schema IS NOT NULL THEN
        -- Check if REX_001_01_PRODUCTS table exists (Target)
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rex_001_01_products') THEN
            EXECUTE format('
                INSERT INTO rex_001_01_products (code, name, name2, category_id, price, stock, is_active)
                SELECT 
                    p.code,
                    p.name,
                    p.description,
                    c.id,
                    COALESCE(p.sales_price, 0),
                    COALESCE(p.stock_quantity, 0),
                    COALESCE(p.is_active, true)
                FROM %I.products p
                LEFT JOIN categories c ON c.code = p.category_code
                ON CONFLICT (code) DO NOTHING', v_source_schema);
            RAISE NOTICE 'Migrated products from %.products', v_source_schema;
        END IF;
    END IF;
END $$;

-- 3.4 Migrate Customers to REX_001_CUSTOMERS (from public or legacy)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_source_schema TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers') THEN
        v_source_schema := 'public';
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'legacy' AND tablename = 'customers') THEN
        v_source_schema := 'legacy';
    ELSE
        v_source_schema := NULL;
    END IF;

    IF v_source_schema IS NOT NULL THEN
        -- Check if REX_001_01_CUSTOMERS table exists
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rex_001_01_customers') THEN
            EXECUTE format('
                INSERT INTO rex_001_01_customers (code, name, tax_nr, tax_office, phone, email, balance, is_active)
                SELECT 
                    code,
                    name,
                    tax_number,
                    tax_office,
                    phone,
                    email,
                    COALESCE(balance, 0),
                    COALESCE(is_active, true)
                FROM %I.customers
                ON CONFLICT (code) DO NOTHING', v_source_schema);
            RAISE NOTICE 'Migrated customers from %.customers', v_source_schema;
        END IF;
    END IF;
END $$;

-- 3.5 Migrate Invoices to LOGIC.INVOICES (If exists in public or legacy)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_source_schema TEXT;
    v_rows_migrated INTEGER;
BEGIN
    -- Determine source schema (prefer public, then legacy)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
        v_source_schema := 'public';
    ELSIF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'legacy' AND tablename = 'invoices') THEN
        v_source_schema := 'legacy';
    ELSE
        v_source_schema := NULL;
    END IF;

    IF v_source_schema IS NOT NULL THEN
        RAISE NOTICE 'Migrating invoices from schema: %', v_source_schema;

        -- Migrate Invoices Header
        EXECUTE format('
            INSERT INTO logic.invoices (firm_nr, period_nr, invoice_no, invoice_date, invoice_type, total_amount, net_amount, status, created_at)
            SELECT 
                '001_01', 
                '01', 
                invoice_no, 
                invoice_date, 
                CASE 
                    WHEN invoice_type ILIKE '%sales%' THEN 'sales' 
                    WHEN invoice_type ILIKE '%purchase%' THEN 'purchase' 
                    ELSE 'sales' -- Default fallback
                END,
                COALESCE(total_amount, 0), 
                COALESCE(net_amount, 0), 
                'approved',
                COALESCE(created_at, NOW())
            FROM %I.invoices
            ON CONFLICT (firm_nr, invoice_no) DO NOTHING', v_source_schema);
            
        GET DIAGNOSTICS v_rows_migrated = ROW_COUNT;
        RAISE NOTICE 'Migrated % invoices.', v_rows_migrated;

        -- Migrate Invoice Items (Lines)
        -- Check if table exists first
        PERFORM 1 FROM pg_tables WHERE schemaname = v_source_schema AND tablename = 'invoice_items';
        IF FOUND THEN
             EXECUTE format('
                INSERT INTO logic.invoice_items (invoice_id, firm_nr, item_type, item_code, quantity, unit_price, total_amount, net_amount)
                SELECT 
                    li.id,
                    ''001_01'',
                    ''product'',
                    ii.item_code,
                    COALESCE(ii.quantity, 1),
                    COALESCE(ii.price, 0),
                    COALESCE(ii.total, 0),
                    COALESCE(ii.net_total, 0)
                FROM %I.invoice_items ii
                JOIN logic.invoices li ON li.invoice_no = ii.invoice_no AND li.firm_nr = ''001_01''
                ON CONFLICT DO NOTHING', v_source_schema);
             
             GET DIAGNOSTICS v_rows_migrated = ROW_COUNT;
             RAISE NOTICE 'Migrated % invoice items.', v_rows_migrated;
        ELSE
             RAISE NOTICE 'Source table invoice_items not found in %, skipping items.', v_source_schema;
        END IF;

    ELSE
        RAISE NOTICE 'No source invoices found in public or legacy schemas.';
    END IF;
END $$;
-- ============================================================================
-- 4. POST-MIGRATION VERIFICATION
-- ============================================================================

-- Log migration results
DO $$
DECLARE
    v_firms_count INTEGER;
    v_periods_count INTEGER;
    v_stores_count INTEGER;
    v_users_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_firms_count FROM firms;
    SELECT COUNT(*) INTO v_periods_count FROM periods;
    SELECT COUNT(*) INTO v_stores_count FROM stores;
    SELECT COUNT(*) INTO v_users_count FROM users;
    
    RAISE NOTICE '=== Migration Complete ===';
    RAISE NOTICE 'Firms: %', v_firms_count;
    RAISE NOTICE 'Periods: %', v_periods_count;
    RAISE NOTICE 'Stores: %', v_stores_count;
    RAISE NOTICE 'Users: %', v_users_count;
END $$;

-- ============================================================================
-- 5. OPTIONAL: CLEANUP LEGACY SCHEMA
-- ============================================================================
-- Uncomment the following line to drop legacy schema after successful migration
-- WARNING: This will permanently delete all legacy data!
-- DROP SCHEMA IF EXISTS legacy CASCADE;
