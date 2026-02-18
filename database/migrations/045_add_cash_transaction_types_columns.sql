-- RETAIL EX - ADD COLUMNS FOR ALL CASH TRANSACTION TYPES
-- Adds bank_id, target_register_id, expense_card_id to cash_lines tables

DO $$
DECLARE
    r RECORD;
    p RECORD;
    v_table_name TEXT;
BEGIN
    FOR r IN SELECT firm_nr, id FROM firms
    LOOP
        FOR p IN SELECT nr FROM periods WHERE firm_id = r.id
        LOOP
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_cash_lines');
            
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                RAISE NOTICE 'Patching table: %', v_table_name;
                
                -- Bank Transactions (Deposit/Withdraw)
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS bank_id UUID';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS bank_account_id UUID';
                
                -- Virman (Transfer between registers)
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS target_register_id UUID';
                
                -- Expenses (Gider Pusulası)
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS expense_card_id UUID';
                
                -- Producers (Müstahsil) / Self-Employment (Serbest Meslek)
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS withholding_tax_rate DECIMAL(5,2) DEFAULT 0';
            END IF;
        END LOOP;
    END LOOP;
END $$;
