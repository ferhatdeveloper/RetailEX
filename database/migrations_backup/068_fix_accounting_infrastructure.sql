-- 068_fix_accounting_infrastructure.sql
-- Re-runs firm and period initialization to ensure missing cash/bank/registry tables exist.

DO $$ 
DECLARE 
    f RECORD;
    p RECORD;
BEGIN
    -- 1. Refresh the initialization functions (They were updated in 002_core_logic.sql, 
    -- but for safety we can just call them here if we assume the user's DB has the new 002 code applied)
    
    -- 2. Call CREATE_FIRM_TABLES for all existing firms
    FOR f IN SELECT firm_nr FROM firms LOOP
        RAISE NOTICE 'Fixing accounting infrastructure for firm: %', f.firm_nr;
        PERFORM CREATE_FIRM_TABLES(f.firm_nr);
        
        -- 3. Call CREATE_PERIOD_TABLES for all periods of this firm
        FOR p IN SELECT nr FROM periods WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = f.firm_nr) LOOP
            RAISE NOTICE 'Fixing accounting infrastructure for firm: %, period: %', f.firm_nr, p.nr;
            PERFORM CREATE_PERIOD_TABLES(f.firm_nr, p.nr::varchar);
        END LOOP;
    END LOOP;
END $$;
