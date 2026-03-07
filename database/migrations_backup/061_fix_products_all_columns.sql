-- ============================================================================
-- Migration 061: Add ALL missing extended columns to existing rex_xxx_products tables
-- Fixes installations where the firm schema was created before migration 024/060
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
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS image_url TEXT', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS description TEXT', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS description_tr TEXT', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS description_en TEXT', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS description_ar TEXT', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS description_ku TEXT', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS min_stock DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS max_stock DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS critical_stock DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT ''Adet''', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit2 VARCHAR(20)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS unit3 VARCHAR(20)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS category_code VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS group_code VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS sub_group_code VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS brand VARCHAR(100)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS model VARCHAR(100)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS supplier VARCHAR(100)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS origin VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS material_type VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_1 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_2 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_3 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_4 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_5 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS special_code_6 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price_list_1 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price_list_2 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price_list_3 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price_list_4 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price_list_5 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS price_list_6 DECIMAL(15,2) DEFAULT 0', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS withholding_rate DECIMAL(5,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS currency VARCHAR(10)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50)', tbl.table_name);
        -- CamelCase compat aliases
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS categorycode VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS groupcode VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS subgroupcode VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS materialtype VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode1 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode2 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode3 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode4 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode5 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS specialcode6 VARCHAR(50)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist1 DECIMAL(15,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist2 DECIMAL(15,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist3 DECIMAL(15,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist4 DECIMAL(15,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist5 DECIMAL(15,2)', tbl.table_name);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pricelist6 DECIMAL(15,2)', tbl.table_name);

        RAISE NOTICE 'Column fix applied to: %', tbl.table_name;
    END LOOP;
END $$;
