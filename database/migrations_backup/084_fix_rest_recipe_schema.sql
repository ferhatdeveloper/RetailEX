-- 084_fix_rest_recipe_schema.sql

-- ============================================================================
-- RetailEx - RESTAURANT RECIPE SCHEMA FIX
-- ----------------------------------------------------------------------------
-- Adding missing columns to rest_recipes and rest_recipe_ingredients
-- ============================================================================

CREATE OR REPLACE FUNCTION public.FIX_RESTAURANT_RECIPE_SCHEMA(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
    -- 1.0 Fix rest_recipes
    EXECUTE format('
        ALTER TABLE rest.%I 
        ADD COLUMN IF NOT EXISTS wastage_percent DECIMAL(5,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    ', v_prefix || '_rest_recipes');

    -- 2.0 Fix rest_recipe_ingredients
    EXECUTE format('
        ALTER TABLE rest.%I 
        ADD COLUMN IF NOT EXISTS cost DECIMAL(15,2) DEFAULT 0;
    ', v_prefix || '_rest_recipe_ingredients');
    
    -- Ensure audit logs are attached (good practice)
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_rest_recipes');

END;
$$ LANGUAGE plpgsql;

-- Execute for initial firm
SELECT public.FIX_RESTAURANT_RECIPE_SCHEMA('001');

-- Update the initializer function as well so new firms get the correct schema
-- We will not modify 003_vertical_and_enterprise.sql directly to maintain history 
-- but we update the function in the DB.
