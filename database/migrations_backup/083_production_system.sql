-- 083_production_system.sql

-- ============================================================================
-- RetailEx - PRODUCTION & RECIPE (BOM) SYSTEM
-- ----------------------------------------------------------------------------
-- General manufacturing recipes and production orders
-- ============================================================================

CREATE OR REPLACE FUNCTION public.INIT_PRODUCTION_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
    -- 1.0 Production Recipes (BOM Headers)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS public.%I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr         VARCHAR(10) NOT NULL,
            product_id      UUID NOT NULL, -- Finished Product
            name            VARCHAR(255) NOT NULL,
            description     TEXT,
            total_cost      DECIMAL(15,2) DEFAULT 0,
            wastage_percent DECIMAL(5,2) DEFAULT 0,
            is_active       BOOLEAN DEFAULT true,
            created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_production_recipes');

    -- 2.0 Production Recipe Ingredients (BOM Lines)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS public.%I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            recipe_id       UUID NOT NULL,
            material_id     UUID NOT NULL, -- Raw Material / Component
            quantity        DECIMAL(15,3) NOT NULL,
            unit            VARCHAR(20),
            cost            DECIMAL(15,2) DEFAULT 0,
            created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_production_recipe_ingredients');

    -- 3.0 Production Orders
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS public.%I (
            id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr         VARCHAR(10) NOT NULL,
            order_no        VARCHAR(50) UNIQUE,
            recipe_id       UUID NOT NULL,
            product_id      UUID NOT NULL,
            planned_qty     DECIMAL(15,3) NOT NULL,
            produced_qty    DECIMAL(15,3) DEFAULT 0,
            status          VARCHAR(20) DEFAULT ''draft'', -- draft, in_progress, completed, cancelled
            start_date      DATE,
            end_date        DATE,
            completed_at    TIMESTAMPTZ,
            note            TEXT,
            created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_production_orders');

    -- 4.0 Add to audit logs
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipes');
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipe_ingredients');
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_orders');

END;
$$ LANGUAGE plpgsql;

-- Execute for initial firm
SELECT public.INIT_PRODUCTION_TABLES('001');
