-- ============================================================================
-- Migration 006: Invoice Currency Support + Unit Multiplier (Packaging Hierarchy)
-- ----------------------------------------------------------------------------
-- Adds to sale_items:
--   unit_multiplier  : conv_fact1 of the selected unit line (e.g. 24 for KOLI)
--   base_quantity    : quantity × unit_multiplier → used for stock updates
--   unit_price_fc    : original price in the invoice currency (before IQD conversion)
--   currency         : invoice line currency (mirrors header)
--
-- Fixes unitsetl schema:
--   Adds name, code, main_unit, conv_fact2 columns (the API expects these)
--   Populates name/code from existing item_code for all existing rows
-- ============================================================================

DO $$
DECLARE
    tbl RECORD;
BEGIN
    -- 1. Add new columns to all rex_*_*_sale_items tables
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'rex_%_%_sale_items'
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit_multiplier DECIMAL(15,6) DEFAULT 1', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS base_quantity DECIMAL(15,3)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit_price_fc DECIMAL(15,4) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT ''IQD''', tbl.table_name);
        RAISE NOTICE 'Migration 006 sale_items applied to: %', tbl.table_name;
    END LOOP;

    -- 2. Fix unitsetl tables: add missing columns (API expects name, code, main_unit, conv_fact2)
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'rex_%_unitsetl'
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS name VARCHAR(100)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS code VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS main_unit BOOLEAN DEFAULT false', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS conv_fact2 DECIMAL(15,6) DEFAULT 1', tbl.table_name);
        -- Backfill name/code from item_code for existing rows
        EXECUTE format('UPDATE %I SET name = item_code, code = item_code WHERE name IS NULL OR name = ''''', tbl.table_name);
        RAISE NOTICE 'Migration 006 unitsetl applied to: %', tbl.table_name;
    END LOOP;

    -- 3. Fix unitsets tables: add is_active column if missing
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name LIKE 'rex_%_unitsets'
          AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true', tbl.table_name);
        RAISE NOTICE 'Migration 006 unitsets applied to: %', tbl.table_name;
    END LOOP;
END $$;
