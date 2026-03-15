-- Migration: Add has_variants column to products table
-- Supporting dynamic firm-specific tables

DO $$ 
DECLARE 
    r RECORD;
BEGIN 
    -- Add to rex_001_products (default firm)
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rex_001_products') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'rex_001_products' AND column_name = 'has_variants') THEN
            ALTER TABLE rex_001_products ADD COLUMN has_variants BOOLEAN DEFAULT false;
        END IF;
    END IF;

    -- Loop through all potential product tables and add the column if missing
    FOR r IN (SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'rex_%_products') LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false', r.table_name);
    END LOOP;
END $$;
