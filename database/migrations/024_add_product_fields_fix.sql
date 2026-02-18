DO $$
DECLARE
    r RECORD;
    v_table_name TEXT;
BEGIN
    FOR r IN SELECT firm_nr FROM firms LOOP
        v_table_name := lower('rex_' || r.firm_nr || '_products');

        -- Check if table exists
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = v_table_name) THEN
            
            -- Image & Description
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='image_url') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN image_url TEXT';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='description') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN description TEXT';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='description_tr') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN description_tr TEXT';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='description_en') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN description_en TEXT';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='description_ar') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN description_ar TEXT';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='description_ku') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN description_ku TEXT';
            END IF;

            -- Stock fields (snake_case)
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='min_stock') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN min_stock DECIMAL(15,2) DEFAULT 0';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='max_stock') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN max_stock DECIMAL(15,2) DEFAULT 0';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='critical_stock') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN critical_stock DECIMAL(15,2) DEFAULT 0';
            END IF;

            -- Codes (snake_case)
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='category_code') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN category_code VARCHAR(50)';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='group_code') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN group_code VARCHAR(50)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='sub_group_code') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN sub_group_code VARCHAR(50)';
            END IF;

            -- Details
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='brand') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN brand VARCHAR(100)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='model') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN model VARCHAR(100)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='manufacturer') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN manufacturer VARCHAR(100)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='supplier') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN supplier VARCHAR(100)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='origin') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN origin VARCHAR(50)';
            END IF;

            -- Special Codes (formatted snake_case)
            FOR i IN 1..6 LOOP
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='special_code_' || i) THEN
                    EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN special_code_' || i || ' VARCHAR(50)';
                END IF;
                 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='price_list_' || i) THEN
                    EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN price_list_' || i || ' DECIMAL(15,2)';
                END IF;
            END LOOP;

            -- Extra Details
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='material_type') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN material_type VARCHAR(50)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='unit2') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN unit2 VARCHAR(20)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='unit3') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN unit3 VARCHAR(20)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='tax_type') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN tax_type VARCHAR(20)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='withholding_rate') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN withholding_rate DECIMAL(5,2)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='currency') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN currency VARCHAR(10)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='shelf_location') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN shelf_location VARCHAR(50)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='warehouse_code') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN warehouse_code VARCHAR(50)';
            END IF;

            -- ----------------------------------------------------------------------------------
            -- CAMELCASE COMPATIBILITY COLUMNS (Lowercase in DB)
            -- ----------------------------------------------------------------------------------
            
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='categorycode') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN categorycode VARCHAR(50)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='groupcode') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN groupcode VARCHAR(50)';
            END IF;
             IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='subgroupcode') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN subgroupcode VARCHAR(50)';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='materialtype') THEN
                EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN materialtype VARCHAR(50)';
            END IF;
            
             FOR i IN 1..6 LOOP
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='specialcode' || i) THEN
                    EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN specialcode' || i || ' VARCHAR(50)';
                END IF;
                 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name=v_table_name AND column_name='pricelist' || i) THEN
                    EXECUTE 'ALTER TABLE ' || quote_ident(v_table_name) || ' ADD COLUMN pricelist' || i || ' DECIMAL(15,2)';
                END IF;
            END LOOP;

        END IF;
    END LOOP;
END $$;

-- Update the function definition for future firms uses the same definition as we just patched
CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- Products Table (Firm Specific) (UPDATED)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF
            code VARCHAR(100) UNIQUE,
            barcode VARCHAR(100),
            name VARCHAR(255) NOT NULL,
            name2 VARCHAR(255),
            category_id UUID REFERENCES categories(id),
            unit_id UUID REFERENCES units(id),
            vat_rate DECIMAL(5,2) DEFAULT 20,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            
            -- Extended Fields (Migration 024)
            min_stock DECIMAL(15,2) DEFAULT 0,
            max_stock DECIMAL(15,2) DEFAULT 0,
            critical_stock DECIMAL(15,2) DEFAULT 0,
            image_url TEXT,
            description TEXT,
            description_tr TEXT,
            description_en TEXT,
            description_ar TEXT,
            description_ku TEXT,
            
            category_code VARCHAR(50),
            group_code VARCHAR(50),
            sub_group_code VARCHAR(50),
            brand VARCHAR(100),
            model VARCHAR(100),
            manufacturer VARCHAR(100),
            supplier VARCHAR(100),
            origin VARCHAR(50),
            
            special_code_1 VARCHAR(50),
            special_code_2 VARCHAR(50),
            special_code_3 VARCHAR(50),
            special_code_4 VARCHAR(50),
            special_code_5 VARCHAR(50),
            special_code_6 VARCHAR(50),
            
            price_list_1 DECIMAL(15,2),
            price_list_2 DECIMAL(15,2),
            price_list_3 DECIMAL(15,2),
            price_list_4 DECIMAL(15,2),
            price_list_5 DECIMAL(15,2),
            price_list_6 DECIMAL(15,2),
            
            material_type VARCHAR(50),
            unit2 VARCHAR(20),
            unit3 VARCHAR(20),
            tax_type VARCHAR(20),
            withholding_rate DECIMAL(5,2),
            currency VARCHAR(10),
            
            shelf_location VARCHAR(50),
            warehouse_code VARCHAR(50),
            
            -- CamelCase compatibility aliases 
            categorycode VARCHAR(50),
            groupcode VARCHAR(50),
            subgroupcode VARCHAR(50),
            specialcode1 VARCHAR(50),
            specialcode2 VARCHAR(50),
            specialcode3 VARCHAR(50),
            specialcode4 VARCHAR(50),
            specialcode5 VARCHAR(50),
            specialcode6 VARCHAR(50),
            pricelist1 DECIMAL(15,2),
            pricelist2 DECIMAL(15,2),
            pricelist3 DECIMAL(15,2),
            pricelist4 DECIMAL(15,2),
            pricelist5 DECIMAL(15,2),
            pricelist6 DECIMAL(15,2),
            materialtype VARCHAR(50),

            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_products');

    -- Customers Table (Firm Specific) (UNCHANGED)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(255),
            tax_nr VARCHAR(50),
            tax_office VARCHAR(100),
            address TEXT,
            city VARCHAR(100),
            latitude DECIMAL(10,8),
            longitude DECIMAL(11,8),
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_customers');

    -- Sales Reps Table (Firm Specific) (UNCHANGED)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            phone VARCHAR(50),
            password_hash VARCHAR(255),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_sales_reps');

    -- Cash Registers Table (Firm Specific) (UNCHANGED)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF (KSCARD)
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            currency_code VARCHAR(10),
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_cash_registers');

    -- Indexes for Sync Performance
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_products_ref_id', v_prefix || '_products');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_customers_ref_id', v_prefix || '_customers');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_sales_reps_ref_id', v_prefix || '_sales_reps');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (ref_id);', 'idx_' || v_prefix || '_cash_registers_ref_id', v_prefix || '_cash_registers');
    
    -- Sync Trigger for Products
    EXECUTE format('
        CREATE OR REPLACE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I 
        FOR EACH ROW EXECUTE FUNCTION enqueue_sync_event();
    ', 'sync_' || v_prefix || '_products', v_prefix || '_products');
END;
$$ LANGUAGE plpgsql;
