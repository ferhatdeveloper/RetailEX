-- ============================================================================
-- RetailEx - Migration 008: Add Description to Master Data
-- ----------------------------------------------------------------------------
-- Adding description column to common master data tables for better UI
-- ============================================================================

DO $$
BEGIN
    -- Add description to brands
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='brands' AND column_name='description') THEN
        ALTER TABLE brands ADD COLUMN description TEXT;
    END IF;

    -- Add description to product_groups
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='product_groups' AND column_name='description') THEN
        ALTER TABLE product_groups ADD COLUMN description TEXT;
    END IF;

    -- Add description to units
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='units' AND column_name='description') THEN
        ALTER TABLE units ADD COLUMN description TEXT;
    END IF;

    -- Add description to categories
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='description') THEN
        ALTER TABLE categories ADD COLUMN description TEXT;
    END IF;

END $$;
