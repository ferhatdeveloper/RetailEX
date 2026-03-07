-- ============================================================================
-- RetailEx - PRODUCTS TABLE: ADD unit COLUMN (Migration 059)
-- ----------------------------------------------------------------------------
-- Problem:
--   productAPI.create() saves product.unit (e.g. 'Adet', 'Kg') but the
--   products table has no plain `unit VARCHAR` column — only `unit_id UUID`
--   (FK) and `unit2/unit3 VARCHAR` for secondary units.
--   This caused "column 'unit' does not exist" on every product save.
--
-- Fix:
--   Add `unit VARCHAR(50) DEFAULT 'Adet'` to all existing rex_*_products
--   tables. Also 002_logic.sql CREATE_FIRM_TABLES was updated to include
--   this column for new installations.
-- ============================================================================

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE '%_products'
          AND table_name NOT LIKE '%_product_variants'
          AND table_name NOT LIKE '%_product_barcodes'
          AND table_name NOT LIKE '%_product_lots'
          AND table_name NOT LIKE '%_product_units'
    LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT ''Adet''',
                tbl
            );
            RAISE NOTICE 'Added unit column to %', tbl;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not alter %: %', tbl, SQLERRM;
        END;
    END LOOP;
END $$;
