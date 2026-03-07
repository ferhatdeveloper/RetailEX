-- ============================================================================
-- RetailEx - SCHEMA SYNCHRONIZATION PATCH (v0.1.35)
-- ----------------------------------------------------------------------------
-- Purpose: Adds missing columns to existing firm/period specific tables 
-- and ensures future tables are created with the correct columns.
-- ============================================================================

DO $$ 
DECLARE 
    r_firm RECORD;
    r_period RECORD;
    v_prefix TEXT;
    v_sql TEXT;
BEGIN
    RAISE NOTICE 'Starting Schema Synchronization Patch v0.1.35...';

    -- 1. Iterate through all firms
    FOR r_firm IN SELECT firm_nr FROM firms LOOP
        v_prefix := 'rex_' || r_firm.firm_nr;
        
        RAISE NOTICE 'Patching Product Tables for Firm %...', r_firm.firm_nr;
        
        -- Patch Products Table
        v_sql := format('
            ALTER TABLE %I 
            ADD COLUMN IF NOT EXISTS name2 VARCHAR(255),
            ADD COLUMN IF NOT EXISTS description_tr TEXT,
            ADD COLUMN IF NOT EXISTS description_en TEXT,
            ADD COLUMN IF NOT EXISTS description_ar TEXT,
            ADD COLUMN IF NOT EXISTS description_ku TEXT,
            ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT ''Adet'',
            ADD COLUMN IF NOT EXISTS material_type VARCHAR(50),
            ADD COLUMN IF NOT EXISTS category_code VARCHAR(50),
            ADD COLUMN IF NOT EXISTS group_code VARCHAR(50),
            ADD COLUMN IF NOT EXISTS sub_group_code VARCHAR(50),
            ADD COLUMN IF NOT EXISTS brand VARCHAR(100),
            ADD COLUMN IF NOT EXISTS model VARCHAR(100),
            ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100),
            ADD COLUMN IF NOT EXISTS supplier VARCHAR(100),
            ADD COLUMN IF NOT EXISTS origin VARCHAR(50),
            ADD COLUMN IF NOT EXISTS special_code_1 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS special_code_2 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS special_code_3 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS special_code_4 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS special_code_5 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS special_code_6 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS price_list_1 DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS price_list_2 DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS price_list_3 DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS price_list_4 DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS price_list_5 DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS price_list_6 DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2) DEFAULT 0,
            -- CamelCase Aliases
            ADD COLUMN IF NOT EXISTS categorycode VARCHAR(50),
            ADD COLUMN IF NOT EXISTS groupcode VARCHAR(50),
            ADD COLUMN IF NOT EXISTS subgroupcode VARCHAR(50),
            ADD COLUMN IF NOT EXISTS specialcode1 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS specialcode2 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS specialcode3 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS specialcode4 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS specialcode5 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS specialcode6 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS pricelist1 DECIMAL(15,2),
            ADD COLUMN IF NOT EXISTS pricelist2 DECIMAL(15,2),
            ADD COLUMN IF NOT EXISTS pricelist3 DECIMAL(15,2),
            ADD COLUMN IF NOT EXISTS pricelist4 DECIMAL(15,2),
            ADD COLUMN IF NOT EXISTS pricelist5 DECIMAL(15,2),
            ADD COLUMN IF NOT EXISTS pricelist6 DECIMAL(15,2),
            ADD COLUMN IF NOT EXISTS materialtype VARCHAR(50)
        ', v_prefix || '_products');
        
        BEGIN
            EXECUTE v_sql;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not patch product table %: %', v_prefix || '_products', SQLERRM;
        END;

        -- 2. Iterate through all periods for this firm
        FOR r_period IN SELECT nr FROM periods WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = r_firm.firm_nr) LOOP
            v_prefix := 'rex_' || r_firm.firm_nr || '_' || LPAD(r_period.nr::text, 2, '0');
            
            RAISE NOTICE 'Patching Sales/Invoice Tables for Firm % Period %...', r_firm.firm_nr, r_period.nr;

            -- Patch Sales Header
            v_sql := format('
                ALTER TABLE %I 
                ADD COLUMN IF NOT EXISTS fiche_type VARCHAR(50),
                ADD COLUMN IF NOT EXISTS trcode INTEGER,
                ADD COLUMN IF NOT EXISTS customer_id UUID,
                ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
                ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT ''IQD'',
                ADD COLUMN IF NOT EXISTS currency_rate DECIMAL(15,6) DEFAULT 1,
                ADD COLUMN IF NOT EXISTS notes TEXT,
                ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
                ADD COLUMN IF NOT EXISTS cashier VARCHAR(100)
            ', v_prefix || '_sales');
            
            BEGIN
                EXECUTE v_sql;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not patch sales table %: %', v_prefix || '_sales', SQLERRM;
            END;

            -- Patch Sale Items
            v_sql := format('
                ALTER TABLE %I 
                ADD COLUMN IF NOT EXISTS invoice_id UUID,
                ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10),
                ADD COLUMN IF NOT EXISTS item_code VARCHAR(100),
                ADD COLUMN IF NOT EXISTS item_name VARCHAR(255),
                ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0
            ', v_prefix || '_sale_items');
            
            BEGIN
                EXECUTE v_sql;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not patch sale_items table %: %', v_prefix || '_sale_items', SQLERRM;
            END;

        END LOOP;
    END LOOP;

    RAISE NOTICE 'Schema Synchronization Patch v0.1.35 Completed Successfully.';
END $$;
