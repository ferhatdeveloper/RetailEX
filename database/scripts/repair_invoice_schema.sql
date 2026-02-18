-- RETAIL EX - INVOICE SCHEMA REPAIR SCRIPT
-- RUN THIS IN POSTGRESQL TERMINAL (PGADMIN OR PSQL)
-- This script adds missing columns to ALL firm/period sales tables.

DO $$
DECLARE
    r RECORD;
    p RECORD;
    v_table_name TEXT;
BEGIN
    RAISE NOTICE 'Starting Schema Repair...';

    FOR r IN SELECT firm_nr, id FROM firms
    LOOP
        FOR p IN SELECT nr FROM periods WHERE firm_id = r.id
        LOOP
            -- 1. Patch SALES tables (rex_fff_pp_sales)
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_sales');
            
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                RAISE NOTICE 'Patching table: %', v_table_name;
                
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS customer_id UUID';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS document_no VARCHAR(100)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS fiche_type VARCHAR(50)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS trcode INTEGER';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS period_nr VARCHAR(10)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS notes TEXT';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT ''approved''';
                
                -- Totals
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_net DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_vat DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_discount DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0';
                
                -- Analysis & Currency
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT ''IQD''';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS currency_rate DECIMAL(15,8) DEFAULT 1';
                
                -- UI/UX (from sales.ts)
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS cashier VARCHAR(100)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS store_id UUID';
            END IF;

            -- 1.1 Patch CASH LINES tables (rex_fff_pp_cash_lines) - NEW FIX
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_cash_lines');
            
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                RAISE NOTICE 'Patching table: %', v_table_name;
                
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS register_id UUID';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS customer_id UUID';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(15,8) DEFAULT 1';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS f_amount DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS transfer_status INTEGER DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS special_code VARCHAR(50)';
            END IF;

            -- 2. Patch SALE ITEMS tables (rex_fff_pp_sale_items)
            v_table_name := lower('rex_' || r.firm_nr || '_' || LPAD(p.nr::text, 2, '0') || '_sale_items');
            
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
                RAISE NOTICE 'Patching table: %', v_table_name;
                
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS invoice_id UUID';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS item_code VARCHAR(100)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS item_name VARCHAR(255)';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS quantity DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS discount_rate DECIMAL(5,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0';
                
                -- Analysis & Cost
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT 0';
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0';
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Schema Repair Completed Successfully.';
END $$;
