-- Migration: 021_add_firm_nr_column.sql
-- Description: Adds firm_nr column to existing firm-specific tables
-- This migration fixes the missing firm_nr column that causes sync failures

-- Add firm_nr column to all existing rex_*_products tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'rex_%_products'
    LOOP
        -- Extract firm number from table name (e.g., rex_009_products -> 009)
        DECLARE
            firm_nr VARCHAR(10);
        BEGIN
            firm_nr := substring(r.tablename from 'rex_([0-9]+)_products');
            
            -- Add column if it doesn't exist
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = r.tablename 
                AND column_name = 'firm_nr'
            ) THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN firm_nr VARCHAR(10) NOT NULL DEFAULT %L', 
                    r.tablename, firm_nr);
                RAISE NOTICE 'Added firm_nr column to %', r.tablename;
            END IF;
        END;
    END LOOP;
END $$;

-- Add firm_nr column to all existing rex_*_customers tables
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
        -- Extract firm number from table name (e.g., rex_009_customers -> 009)
        DECLARE
            firm_nr VARCHAR(10);
        BEGIN
            firm_nr := substring(r.tablename from 'rex_([0-9]+)_customers');
            
            -- Add column if it doesn't exist
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = r.tablename 
                AND column_name = 'firm_nr'
            ) THEN
                EXECUTE format('ALTER TABLE public.%I ADD COLUMN firm_nr VARCHAR(10) NOT NULL DEFAULT %L', 
                    r.tablename, firm_nr);
                RAISE NOTICE 'Added firm_nr column to %', r.tablename;
            END IF;
        END;
    END LOOP;
END $$;

-- Remove UNIQUE constraint from barcode columns (allows NULL duplicates)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'rex_%_products'
    LOOP
        -- Drop UNIQUE constraint on barcode if it exists
        DECLARE
            constraint_name TEXT;
        BEGIN
            SELECT conname INTO constraint_name
            FROM pg_constraint
            WHERE conrelid = ('public.' || r.tablename)::regclass
            AND contype = 'u'
            AND conkey = ARRAY[(
                SELECT attnum FROM pg_attribute 
                WHERE attrelid = ('public.' || r.tablename)::regclass 
                AND attname = 'barcode'
            )];
            
            IF constraint_name IS NOT NULL THEN
                EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.tablename, constraint_name);
                RAISE NOTICE 'Removed UNIQUE constraint on barcode from %', r.tablename;
            END IF;
        END;
    END LOOP;
END $$;
