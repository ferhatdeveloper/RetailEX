-- ============================================================================
-- RetailEx - BEAUTY SCHEMA MIGRATION (v6.0)
-- ----------------------------------------------------------------------------
-- Move existing beauty-related dynamic tables to the 'beauty' schema.
-- ============================================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    -- Ensure the beauty schema exists
    CREATE SCHEMA IF NOT EXISTS beauty;

    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name LIKE 'rex_%_beauty_%'
    LOOP
        RAISE NOTICE 'Moving table public.% to beauty schema', r.table_name;
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA beauty', r.table_name);
    END LOOP;
END $$;
