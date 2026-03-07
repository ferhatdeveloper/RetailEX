-- ============================================================================
-- Migration 060: Fix Products Table Missing Columns
-- Adds min_stock, max_stock, critical_stock and other extended fields to
-- all existing rex_XXX_products tables that were created before these columns
-- were added to the CREATE_FIRM_TABLES function.
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
        -- Add image_url if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'image_url'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN image_url TEXT', tbl.table_name);
            RAISE NOTICE 'Added image_url to %', tbl.table_name;
        END IF;

        -- Add description if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'description'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN description TEXT', tbl.table_name);
            RAISE NOTICE 'Added description to %', tbl.table_name;
        END IF;

        -- Add min_stock if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'min_stock'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN min_stock DECIMAL(15,2) DEFAULT 0', tbl.table_name);
            RAISE NOTICE 'Added min_stock to %', tbl.table_name;
        END IF;

        -- Add max_stock if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'max_stock'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN max_stock DECIMAL(15,2) DEFAULT 0', tbl.table_name);
            RAISE NOTICE 'Added max_stock to %', tbl.table_name;
        END IF;

        -- Add critical_stock if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'critical_stock'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN critical_stock DECIMAL(15,2) DEFAULT 0', tbl.table_name);
            RAISE NOTICE 'Added critical_stock to %', tbl.table_name;
        END IF;

        -- Add description_tr if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'description_tr'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN description_tr TEXT', tbl.table_name);
        END IF;

        -- Add description_en if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'description_en'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN description_en TEXT', tbl.table_name);
        END IF;

        -- Add description_ar if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'description_ar'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN description_ar TEXT', tbl.table_name);
        END IF;

        -- Add description_ku if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'description_ku'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN description_ku TEXT', tbl.table_name);
        END IF;

        -- Add category_code if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'category_code'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN category_code VARCHAR(50)', tbl.table_name);
        END IF;

        -- Add group_code if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'group_code'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN group_code VARCHAR(50)', tbl.table_name);
        END IF;

        -- Add sub_group_code if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'sub_group_code'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN sub_group_code VARCHAR(50)', tbl.table_name);
        END IF;

        -- Add brand if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'brand'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN brand VARCHAR(100)', tbl.table_name);
        END IF;

        -- Add model if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'model'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN model VARCHAR(100)', tbl.table_name);
        END IF;

        -- Add manufacturer if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'manufacturer'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN manufacturer VARCHAR(100)', tbl.table_name);
        END IF;

        -- Add supplier if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'supplier'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN supplier VARCHAR(100)', tbl.table_name);
        END IF;

        -- Add origin if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'origin'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN origin VARCHAR(50)', tbl.table_name);
        END IF;

        -- Add material_type if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'material_type'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN material_type VARCHAR(50)', tbl.table_name);
        END IF;

        -- Add special_code_1..6 if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'special_code_1'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN special_code_1 VARCHAR(50)', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN special_code_2 VARCHAR(50)', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN special_code_3 VARCHAR(50)', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN special_code_4 VARCHAR(50)', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN special_code_5 VARCHAR(50)', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN special_code_6 VARCHAR(50)', tbl.table_name);
        END IF;

        -- Add price_list_1..6 if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'price_list_1'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN price_list_1 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN price_list_2 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN price_list_3 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN price_list_4 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN price_list_5 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
            EXECUTE format('ALTER TABLE %I ADD COLUMN price_list_6 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        END IF;

        -- Add unit column if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = tbl.table_name AND column_name = 'unit'
        ) THEN
            EXECUTE format('ALTER TABLE %I ADD COLUMN unit VARCHAR(50) DEFAULT ''Adet''', tbl.table_name);
        END IF;

    END LOOP;
END $$;
