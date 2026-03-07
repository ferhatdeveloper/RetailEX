-- Migration: 022_default_period_2026.sql
-- Description: Creates default period 01 for year 2026 for all existing firms
-- This ensures every firm has at least one active period during initial setup

-- Function to create default 2026 period for a firm
CREATE OR REPLACE FUNCTION public.CREATE_DEFAULT_PERIOD_2026(p_firm_id UUID)
RETURNS void AS $$
DECLARE
    v_existing_period_id UUID;
    v_period_nr INTEGER := 1;
    v_beg_date DATE := '2026-01-01';
    v_end_date DATE := '2026-12-31';
BEGIN
    -- Check if period already exists
    SELECT id INTO v_existing_period_id
    FROM periods
    WHERE firm_id = p_firm_id AND nr = v_period_nr;
    
    IF v_existing_period_id IS NULL THEN
        -- Create new period
        INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active, "default")
        VALUES (p_firm_id, v_period_nr, v_beg_date, v_end_date, true, true);
        
        RAISE NOTICE 'Default period 01/2026 created for firm ID: %', p_firm_id;
    ELSE
        -- Update existing period to ensure it's active and default
        UPDATE periods
        SET 
            beg_date = v_beg_date,
            end_date = v_end_date,
            is_active = true,
            "default" = true
        WHERE id = v_existing_period_id;
        
        RAISE NOTICE 'Default period 01/2026 updated for firm ID: %', p_firm_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create default period for all existing firms
DO $$
DECLARE
    firm_record RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR firm_record IN SELECT id, firm_nr, name FROM firms WHERE is_active = true
    LOOP
        PERFORM public.CREATE_DEFAULT_PERIOD_2026(firm_record.id);
        v_count := v_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Default period 01/2026 processed for % firm(s)', v_count;
END $$;

-- Add comment for documentation
COMMENT ON FUNCTION public.CREATE_DEFAULT_PERIOD_2026(UUID) IS 
'Creates or updates default period 01 for year 2026 for the specified firm. Used during initial setup to ensure every firm has an active period.';
