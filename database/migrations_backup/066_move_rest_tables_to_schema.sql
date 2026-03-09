-- ============================================================================
-- RetailEx - RESTAURANT SCHEMA MIGRATION (v6.0)
-- ----------------------------------------------------------------------------
-- Move existing restaurant-related dynamic tables to the 'rest' schema.
-- ============================================================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    -- Ensure the rest schema exists
    CREATE SCHEMA IF NOT EXISTS rest;

    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND (
            table_name LIKE 'rex_%_rest_tables' OR 
            table_name LIKE 'rex_%_rest_recipes' OR 
            table_name LIKE 'rex_%_rest_recipe_ingredients' OR 
            table_name LIKE 'rex_%_rest_orders' OR 
            table_name LIKE 'rex_%_rest_order_items' OR 
            table_name LIKE 'rex_%_rest_kitchen_orders' OR 
            table_name LIKE 'rex_%_rest_kitchen_items'
        )
    LOOP
        RAISE NOTICE 'Moving table public.% to rest schema', r.table_name;
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA rest', r.table_name);
    END LOOP;
END $$;
