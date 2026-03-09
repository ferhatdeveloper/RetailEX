-- ============================================================================
-- Migration 074: Add balance column to existing customers & suppliers tables
-- Fresh installs: already handled by CREATE_PERIOD_TABLES in 002_core_logic.sql
-- This migration handles EXISTING databases that already have these tables.
-- ============================================================================

DO $$
DECLARE
    r RECORD;
    v_cust_table TEXT;
    v_supp_table TEXT;
BEGIN
    -- Find all existing firm combinations from customers tables
    FOR r IN
        SELECT split_part(table_name, '_', 2) AS firm_nr
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name ~ '^rex_[0-9]+_customers$'
    LOOP
        v_cust_table := 'rex_' || r.firm_nr || '_customers';
        v_supp_table := 'rex_' || r.firm_nr || '_suppliers';

        -- Add balance to customers if missing
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS balance DECIMAL(15,2) DEFAULT 0',
            v_cust_table
        );

        -- Add balance to suppliers if missing
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS balance DECIMAL(15,2) DEFAULT 0',
            v_supp_table
        );

        RAISE NOTICE 'Balance column ensured for firm: %', r.firm_nr;
    END LOOP;
END $$;
