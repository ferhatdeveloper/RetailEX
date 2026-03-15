-- ============================================================================
-- Migration 005: Add ALL missing extended columns to existing rex_xxx_products tables
-- Fixes installations where the firm schema was created before migration 002 update
-- ran, leaving the products table with only core columns.
-- ============================================================================

DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'rex_%_products'
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit2 VARCHAR(20)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit3 VARCHAR(20)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS withholding_rate DECIMAL(5,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS currency VARCHAR(10)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_1 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_2 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_3 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_4 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_5 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_6 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price_list_4 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price_list_5 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price_list_6 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        
        -- CamelCase compat aliases
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS subgroupcode VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS materialtype VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode1 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode2 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode3 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode4 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode5 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode6 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist3 DECIMAL(15,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist4 DECIMAL(15,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist5 DECIMAL(15,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist6 DECIMAL(15,2)', tbl.table_name);
        
        -- Additional camelCase and fallback columns for zero-installation errors
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "categoryCode" VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS categorycode VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "vatRate" DECIMAL(5,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS vatrate DECIMAL(5,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "hasVariants" BOOLEAN DEFAULT false', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS hasvariants BOOLEAN DEFAULT false', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "groupCode" VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS groupcode VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "subGroupCode" VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS subgroupcode VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unitset_id UUID', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unitsetid UUID', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "unitsetId" UUID', tbl.table_name);

        RAISE NOTICE 'Column fix applied to: %', tbl.table_name;
    END LOOP;

    -- Fix Sales Tables (is_cancelled)
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'rex_%_%_sales'
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT false', tbl.table_name);
        RAISE NOTICE 'Sales column fix applied to: %', tbl.table_name;
    END LOOP;

    -- Fix Variants Tables (SKU Unique)
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'rex_%_product_variants'
          AND table_type = 'BASE TABLE'
    LOOP
        -- Check if unique constraint exists, if not add it
        BEGIN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I UNIQUE (sku)', tbl.table_name, tbl.table_name || '_sku_unique');
        EXCEPTION WHEN duplicate_table OR duplicate_object THEN
            NULL; -- Already exists
        WHEN OTHERS THEN
            RAISE NOTICE 'Could not add unique constraint to %, might need manual cleanup of duplicate SKUs', tbl.table_name;
        END;
        RAISE NOTICE 'Variants fix applied to: %', tbl.table_name;
    END LOOP;
END $$;
