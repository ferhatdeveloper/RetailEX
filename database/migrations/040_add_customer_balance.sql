-- Migration: 040_add_customer_balance.sql
-- Description: Adds balance column to existing customer tables

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'rex_%_customers'
    LOOP
        -- Add column if it doesn't exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = r.tablename 
            AND column_name = 'balance'
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ADD COLUMN balance NUMERIC(15, 2) DEFAULT 0', r.tablename);
            RAISE NOTICE 'Added balance column to %', r.tablename;
        END IF;
    END LOOP;
END $$;
