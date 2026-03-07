-- ============================================================================
-- RetailEx - MASTER INTEGRITY & CONSOLIDATION PATCH (v0.1.37)
-- ----------------------------------------------------------------------------
-- Purpose: Ensures ALL existing firm/period tables are synchronized with the 
-- latest master architecture defined in 002_logic.sql.
-- ============================================================================

DO $$ 
DECLARE 
    r_firm RECORD;
    r_period RECORD;
    v_prefix_firm TEXT;
    v_prefix_period TEXT;
    v_sql TEXT;
BEGIN
    RAISE NOTICE 'Starting Master Integrity Patch v0.1.37...';

    -- 1. Iterate through all firms
    FOR r_firm IN SELECT firm_nr FROM firms LOOP
        v_prefix_firm := 'rex_' || r_firm.firm_nr;
        
        RAISE NOTICE 'Syncing Schema for Firm %...', r_firm.firm_nr;
        
        -- A. Sync Products Table
        v_sql := format('
            ALTER TABLE %I 
            ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
            ADD COLUMN IF NOT EXISTS name2 VARCHAR(255),
            ADD COLUMN IF NOT EXISTS image_url TEXT,
            ADD COLUMN IF NOT EXISTS description TEXT,
            ADD COLUMN IF NOT EXISTS description_tr TEXT,
            ADD COLUMN IF NOT EXISTS description_en TEXT,
            ADD COLUMN IF NOT EXISTS description_ar TEXT,
            ADD COLUMN IF NOT EXISTS description_ku TEXT,
            ADD COLUMN IF NOT EXISTS min_stock DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS max_stock DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS critical_stock DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT %L,
            ADD COLUMN IF NOT EXISTS material_type VARCHAR(50),
            ADD COLUMN IF NOT EXISTS category_code VARCHAR(50),
            ADD COLUMN IF NOT EXISTS group_code VARCHAR(50),
            ADD COLUMN IF NOT EXISTS sub_group_code VARCHAR(50),
            ADD COLUMN IF NOT EXISTS brand VARCHAR(100),
            ADD COLUMN IF NOT EXISTS model VARCHAR(100),
            ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100),
            ADD COLUMN IF NOT EXISTS supplier VARCHAR(100),
            ADD COLUMN IF NOT EXISTS origin VARCHAR(50),
            ADD COLUMN IF NOT EXISTS tax_type VARCHAR(20),
            ADD COLUMN IF NOT EXISTS withholding_rate DECIMAL(5,2),
            ADD COLUMN IF NOT EXISTS currency VARCHAR(10),
            ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(50),
            ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50),
            -- CamelCase Compat
            ADD COLUMN IF NOT EXISTS categorycode VARCHAR(50),
            ADD COLUMN IF NOT EXISTS groupcode VARCHAR(50),
            ADD COLUMN IF NOT EXISTS subgroupcode VARCHAR(50),
            ADD COLUMN IF NOT EXISTS materialtype VARCHAR(50),
            ADD COLUMN IF NOT EXISTS pricelist1 DECIMAL(15,2),
            ADD COLUMN IF NOT EXISTS pricelist2 DECIMAL(15,2)
        ', v_prefix_firm || '_products', 'Adet');
        EXECUTE v_sql;

        -- B. Sync Customers Table
        v_sql := format('
            ALTER TABLE %I 
            ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
            ADD COLUMN IF NOT EXISTS email VARCHAR(255),
            ADD COLUMN IF NOT EXISTS address TEXT,
            ADD COLUMN IF NOT EXISTS taxi_nr VARCHAR(50),
            ADD COLUMN IF NOT EXISTS tax_office VARCHAR(100),
            ADD COLUMN IF NOT EXISTS city VARCHAR(100),
            ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100),
            ADD COLUMN IF NOT EXISTS district VARCHAR(100),
            ADD COLUMN IF NOT EXISTS balance DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS points DECIMAL(15,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_spent DECIMAL(15,2) DEFAULT 0
        ', v_prefix_firm || '_customers');
        EXECUTE v_sql;

        -- C. Initialize Vertical Modules (Safe Call)
        BEGIN
            PERFORM INIT_RESTAURANT_FIRM_TABLES(r_firm.firm_nr);
            PERFORM INIT_BEAUTY_FIRM_TABLES(r_firm.firm_nr);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Module init skipped for firm % (Function may not exist yet)', r_firm.firm_nr;
        END;

        -- 2. Iterate through all periods for this firm
        FOR r_period IN SELECT nr FROM periods WHERE firm_id = (SELECT id FROM firms WHERE firm_nr = r_firm.firm_nr) LOOP
            v_prefix_period := 'rex_' || r_firm.firm_nr || '_' || LPAD(r_period.nr::text, 2, '0');
            
            RAISE NOTICE 'Syncing Transactions for Firm % Period %...', r_firm.firm_nr, r_period.nr;

            -- D. Sync Sales Header
            v_sql := format('
                ALTER TABLE %I 
                ADD COLUMN IF NOT EXISTS document_no VARCHAR(100),
                ADD COLUMN IF NOT EXISTS fiche_type VARCHAR(50),
                ADD COLUMN IF NOT EXISTS trcode INTEGER,
                ADD COLUMN IF NOT EXISTS customer_id UUID,
                ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
                ADD COLUMN IF NOT EXISTS notes TEXT,
                ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
                ADD COLUMN IF NOT EXISTS cashier VARCHAR(100),
                ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(15,2) DEFAULT 0,
                ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT %L,
                ADD COLUMN IF NOT EXISTS currency_rate DECIMAL(15,6) DEFAULT 1
            ', v_prefix_period || '_sales', 'IQD');
            EXECUTE v_sql;

            -- E. Sync Sale Items
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
            ', v_prefix_period || '_sale_items');
            EXECUTE v_sql;

            -- F. Initialize Period Vertical Modules
            BEGIN
                PERFORM INIT_RESTAURANT_PERIOD_TABLES(r_firm.firm_nr, LPAD(r_period.nr::text, 2, '0'));
                PERFORM INIT_BEAUTY_PERIOD_TABLES(r_firm.firm_nr, LPAD(r_period.nr::text, 2, '0'));
            EXCEPTION WHEN OTHERS THEN NULL;
            END;

        END LOOP;
    END LOOP;

    RAISE NOTICE 'Master Integrity Patch v0.1.37 Completed Successfully.';
END $$;
