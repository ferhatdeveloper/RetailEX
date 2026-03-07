-- Migration: 034_logo_bridge_infrastructure.sql
-- Description: Adds infrastructure for background Logo ERP integration, 
-- including store mapping and targeted sync routing.

-- 1. Enhance stores for Logo Mapping
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_warehouse_id INTEGER; -- Ambar No
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_division_id INTEGER;  -- İşyeri No
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS logo_firm_id INTEGER;      -- Logo Firma No

-- 2. Enhance sync_queue for targeted distribution and source tracking
ALTER TABLE public.sync_queue ADD COLUMN IF NOT EXISTS target_store_id UUID REFERENCES public.stores(id);
ALTER TABLE public.sync_queue ADD COLUMN IF NOT EXISTS source_system VARCHAR(50) DEFAULT 'RetailEX'; -- 'RetailEX' or 'Logo'

-- 3. Function to resolve RetailEX Store from Logo Context
CREATE OR REPLACE FUNCTION public.RESOLVE_STORE_FROM_LOGO(
    p_logo_firm_id INTEGER,
    p_logo_warehouse_id INTEGER,
    p_logo_division_id INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_store_id UUID;
BEGIN
    -- Try specific mapping first (Warehouse + Division)
    SELECT id INTO v_store_id 
    FROM public.stores 
    WHERE logo_firm_id = p_logo_firm_id 
      AND logo_warehouse_id = p_logo_warehouse_id
      AND (p_logo_division_id IS NULL OR logo_division_id = p_logo_division_id)
    LIMIT 1;

    -- Fallback to just Warehouse if Division didn't match
    IF v_store_id IS NULL THEN
        SELECT id INTO v_store_id 
        FROM public.stores 
        WHERE logo_firm_id = p_logo_firm_id 
          AND logo_warehouse_id = p_logo_warehouse_id
        LIMIT 1;
    END IF;

    RETURN v_store_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Helper to enqueue Logo-originated changes
-- This will be called by the background "Bridge Service" or FDW.
CREATE OR REPLACE FUNCTION public.ENQUEUE_LOGO_CHANGE(
    p_table_name VARCHAR,
    p_logo_ref INTEGER, -- LogicalRef in Logo
    p_action VARCHAR,
    p_firm_nr VARCHAR,
    p_data JSONB,
    p_logo_warehouse_id INTEGER DEFAULT NULL,
    p_logo_division_id INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_target_store_id UUID;
BEGIN
    -- Resolve which store should get this update
    IF p_logo_warehouse_id IS NOT NULL THEN
        v_target_store_id := public.RESOLVE_STORE_FROM_LOGO(p_firm_nr::INTEGER, p_logo_warehouse_id, p_logo_division_id);
    END IF;

    -- Insert into sync_queue
    -- Note: record_id for Logo changes should be mapped or we use a temporary UUID
    -- In this architecture, Logo changes are usually "Upserts" on the terminal side.
    
    INSERT INTO public.sync_queue (
        table_name, 
        record_id, 
        action, 
        firm_nr, 
        data, 
        target_store_id, 
        source_system
    )
    VALUES (
        p_table_name, 
        uuid_generate_v4(), -- We generate a fresh ID for the sync mission
        p_action, 
        p_firm_nr, 
        p_data, 
        v_target_store_id, 
        'Logo'
    );
END;
$$ LANGUAGE plpgsql;
