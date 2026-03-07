-- Migration: 029_ensure_firm_periods.sql
-- Description: Ensures all active firms have at least one period. 
-- Useful for repairs where firms were created without periods.

DO $$
DECLARE
    firm_rec RECORD;
    v_period_count INTEGER;
BEGIN
    FOR firm_rec IN SELECT id, firm_nr, name FROM firms WHERE is_active = true
    LOOP
        -- Count periods for this firm
        SELECT COUNT(*) INTO v_period_count FROM periods WHERE firm_id = firm_rec.id;
        
        IF v_period_count = 0 THEN
            RAISE NOTICE 'Firm % (%) has no periods. Creating default 01/2026.', firm_rec.name, firm_rec.firm_nr;
            
            INSERT INTO periods (firm_id, nr, beg_date, end_date, is_active, "default")
            VALUES (firm_rec.id, 1, '2026-01-01', '2026-12-31', true, true);
        END IF;
    END LOOP;
END $$;
