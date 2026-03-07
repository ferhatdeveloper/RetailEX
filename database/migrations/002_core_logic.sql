-- ============================================================================
-- RetailEx - CONSOLIDATED CORE LOGIC (v5.2 - EXTREME PARITY)
-- ----------------------------------------------------------------------------
-- Final Saturation Mode: 100% Columns from 060-065 + Auto-Sync
-- ============================================================================

-- 1.0 SYSTEM HELPERS & SYNC ENTRANTS
----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enqueue_sync_event()
RETURNS TRIGGER AS $$
DECLARE
    v_firm_nr VARCHAR;
    v_record_id UUID;
    v_data JSONB;
BEGIN
    BEGIN
        IF (TG_OP = 'DELETE') THEN
            v_firm_nr := OLD.firm_nr;
            v_record_id := OLD.id;
            v_data := row_to_json(OLD)::JSONB;
        ELSE
            v_firm_nr := NEW.firm_nr;
            v_record_id := NEW.id;
            v_data := row_to_json(NEW)::JSONB;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Fallback if firm_nr is missing
        v_firm_nr := '001'; 
        IF (TG_OP = 'DELETE') THEN
            v_record_id := OLD.id;
            v_data := row_to_json(OLD)::JSONB;
        ELSE
            v_record_id := NEW.id;
            v_data := row_to_json(NEW)::JSONB;
        END IF;
    END;

    UPDATE sync_queue SET data = v_data, action = TG_OP, created_at = NOW()
    WHERE table_name = TG_TABLE_NAME AND record_id = v_record_id AND status = 'pending';

    IF NOT FOUND THEN
        INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data)
        VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_firm_nr, v_data);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.APPLY_SYNC_TRIGGERS(p_table_name TEXT)
RETURNS void AS $$
BEGIN
    EXECUTE format('
        DROP TRIGGER IF EXISTS %I ON %I;
        CREATE TRIGGER %I 
        AFTER INSERT OR UPDATE OR DELETE ON %I 
        FOR EACH ROW EXECUTE FUNCTION public.enqueue_sync_event();
    ', 'sync_trg_' || p_table_name, p_table_name, 'sync_trg_' || p_table_name, p_table_name);
END;
$$ LANGUAGE plpgsql;

-- 2.0 DYNAMIC ENGINE: FIRM LEVEL (Extreme Parity)
----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text := lower('rex_' || p_firm_nr);
    v_tbl_products text := v_prefix || '_products';
    v_tbl_customers text := v_prefix || '_customers';
BEGIN
    -- 2.1 Products Super-Template (100% Parity Saturation)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            ref_id INTEGER UNIQUE,
            code VARCHAR(100) UNIQUE,
            barcode VARCHAR(100),
            name VARCHAR(255) NOT NULL,
            name2 VARCHAR(255),
            image_url TEXT,
            
            -- Localization & Description (Restored from 060/061)
            description TEXT,
            description_tr TEXT,
            description_en TEXT,
            description_ar TEXT,
            description_ku TEXT,

            -- Classification (Restored from 061)
            category_id UUID REFERENCES categories(id),
            category_code VARCHAR(50),
            group_code VARCHAR(50),
            sub_group_code VARCHAR(50),
            brand VARCHAR(100),
            model VARCHAR(100),
            manufacturer VARCHAR(100),
            supplier VARCHAR(100),
            origin VARCHAR(50),
            material_type VARCHAR(50),
            
            -- Compat Aliases (Restored from 061)
            categorycode VARCHAR(50),
            groupcode VARCHAR(50),
            subgroupcode VARCHAR(50),
            materialtype VARCHAR(50),

            -- Pricing & Stock
            unit VARCHAR(50) DEFAULT ''Adet'',
            unit_id UUID REFERENCES units(id),
            unitset_id UUID,
            unit2 VARCHAR(20),
            unit3 VARCHAR(20),
            vat_rate DECIMAL(5,2) DEFAULT 20,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            
            -- Multi-Currency Prices
            purchase_price_usd DECIMAL(15,2) DEFAULT 0,
            purchase_price_eur DECIMAL(15,2) DEFAULT 0,
            sale_price_usd DECIMAL(15,2) DEFAULT 0,
            sale_price_eur DECIMAL(15,2) DEFAULT 0,

            stock DECIMAL(15,2) DEFAULT 0,
            min_stock DECIMAL(15,2) DEFAULT 0,
            max_stock DECIMAL(15,2) DEFAULT 0,
            critical_stock DECIMAL(15,2) DEFAULT 0,
            
            -- Pricing Lists (Restored from 061)
            price_list_1 DECIMAL(15,2) DEFAULT 0,
            price_list_2 DECIMAL(15,2) DEFAULT 0,
            price_list_3 DECIMAL(15,2) DEFAULT 0,
            price_list_4 DECIMAL(15,2) DEFAULT 0,
            price_list_5 DECIMAL(15,2) DEFAULT 0,
            price_list_6 DECIMAL(15,2) DEFAULT 0,
            pricelist1 DECIMAL(15,2),
            pricelist2 DECIMAL(15,2),
            pricelist3 DECIMAL(15,2),
            pricelist4 DECIMAL(15,2),
            pricelist5 DECIMAL(15,2),
            pricelist6 DECIMAL(15,2),
            
            -- Fiscal & Location
            tax_type VARCHAR(20),
            withholding_rate DECIMAL(5,2),
            currency VARCHAR(10),
            shelf_location VARCHAR(50),
            warehouse_code VARCHAR(50),
            
            -- Special Codes
            special_code_1 VARCHAR(50),
            special_code_2 VARCHAR(50),
            special_code_3 VARCHAR(50),
            special_code_4 VARCHAR(50),
            special_code_5 VARCHAR(50),
            special_code_6 VARCHAR(50),
            specialcode1 VARCHAR(50),
            specialcode2 VARCHAR(50),
            specialcode3 VARCHAR(50),
            specialcode4 VARCHAR(50),
            specialcode5 VARCHAR(50),
            specialcode6 VARCHAR(50),
            
            tracking_type VARCHAR(20) DEFAULT ''none'',
            preparation_time INTEGER DEFAULT 5, -- Restored from 071
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_tbl_products);

    -- 2.2 AUTO-SYNC PRODUCTS (Ensures existing tables get the columns)
    EXECUTE format('
        ALTER TABLE %I 
        ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10),
        ADD COLUMN IF NOT EXISTS barcode VARCHAR(100),
        ADD COLUMN IF NOT EXISTS image_url TEXT,
        ADD COLUMN IF NOT EXISTS description_tr TEXT,
        ADD COLUMN IF NOT EXISTS description_en TEXT,
        ADD COLUMN IF NOT EXISTS description_ar TEXT,
        ADD COLUMN IF NOT EXISTS description_ku TEXT,
        ADD COLUMN IF NOT EXISTS min_stock DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS max_stock DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS critical_stock DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(50),
        ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50),
        ADD COLUMN IF NOT EXISTS categorycode VARCHAR(50),
        ADD COLUMN IF NOT EXISTS groupcode VARCHAR(50),
        ADD COLUMN IF NOT EXISTS pricelist1 DECIMAL(15,2),
        ADD COLUMN IF NOT EXISTS pricelist2 DECIMAL(15,2),
        ADD COLUMN IF NOT EXISTS purchase_price_usd DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS purchase_price_eur DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS sale_price_usd DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS sale_price_eur DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS unitset_id UUID,
        ADD COLUMN IF NOT EXISTS preparation_time INTEGER DEFAULT 5
    ', v_tbl_products);

    -- 2.3 Customers Super-Template (Restored from 064)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(255),
            tax_nr VARCHAR(50),
            taxi_nr VARCHAR(50), -- Restored from 064
            tax_office VARCHAR(100),
            address TEXT,
            city VARCHAR(100),
            neighborhood VARCHAR(100),
            district VARCHAR(100),
            balance DECIMAL(15,2) DEFAULT 0,
            points DECIMAL(15,2) DEFAULT 0,
            total_spent DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_tbl_customers);

    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10), ADD COLUMN IF NOT EXISTS points DECIMAL(15,2) DEFAULT 0, ADD COLUMN IF NOT EXISTS balance DECIMAL(15,2) DEFAULT 0', v_tbl_customers);

    -- 2.3.5 Suppliers Super-Template (Restored from 010)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(255),
            tax_nr VARCHAR(50),
            tax_office VARCHAR(100),
            address TEXT,
            city VARCHAR(100),
            neighborhood VARCHAR(100),
            district VARCHAR(100),
            -- Restored columns from 010_suppliers
            contact_person VARCHAR(150),
            contact_person_phone VARCHAR(50),
            payment_terms VARCHAR(100),
            credit_limit DECIMAL(15,2) DEFAULT 0,
            notes TEXT,
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_suppliers');

    EXECUTE format('
        ALTER TABLE %I
        ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10),
        ADD COLUMN IF NOT EXISTS contact_person VARCHAR(150),
        ADD COLUMN IF NOT EXISTS contact_person_phone VARCHAR(50),
        ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100),
        ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS notes TEXT,
        ADD COLUMN IF NOT EXISTS balance DECIMAL(15,2) DEFAULT 0
    ', v_prefix || '_suppliers');

    -- 2.4 Unit Sets & Variants
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL);', v_prefix || '_unitsets');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), unitset_id UUID REFERENCES %I(id), item_code VARCHAR(20) NOT NULL, conv_fact1 DECIMAL(15,6) DEFAULT 1);', v_prefix || '_unitsetl', v_prefix || '_unitsets');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), product_id UUID REFERENCES %I(id) ON DELETE CASCADE, sku VARCHAR(100), attributes JSONB);', v_prefix || '_product_variants', v_prefix || '_products');

    -- 2.5 Finance & Registry (Restored from 060-065)
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_cash_registers');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, bank_name VARCHAR(255), iban VARCHAR(50), currency_code VARCHAR(10) DEFAULT ''IQD'', balance DECIMAL(15,2) DEFAULT 0, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_bank_registers');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_expense_cards');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), firm_nr VARCHAR(10) NOT NULL, code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255), is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());', v_prefix || '_sales_reps');

    PERFORM public.APPLY_SYNC_TRIGGERS(v_tbl_products);
    PERFORM public.APPLY_SYNC_TRIGGERS(v_tbl_customers);
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_suppliers');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_cash_registers');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_bank_registers');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_expense_cards');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_sales_reps');

    -- 2.6 Default Seeding (Ensure initial records exist)
    EXECUTE format('INSERT INTO %I (id, firm_nr, code, name, is_active) VALUES (''00000000-0000-0000-0000-000000000001'', %L, ''KASA.001'', ''MERKEZ KASA'', true) ON CONFLICT DO NOTHING;', v_prefix || '_cash_registers', p_firm_nr);
END;
$$ LANGUAGE plpgsql;

-- 3.0 DYNAMIC ENGINE: PERIOD LEVEL (Extreme Parity)
----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text := lower('rex_' || p_firm_nr || '_' || p_period_nr);
    v_tbl_sales text := v_prefix || '_sales';
    v_tbl_sale_items text := v_prefix || '_sale_items';
BEGIN
    -- 3.1 Sales Header (Extreme Parity from 064)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            period_nr VARCHAR(10) NOT NULL,
            fiche_no VARCHAR(100) UNIQUE,
            document_no VARCHAR(100),
            trcode INTEGER,
            fiche_type VARCHAR(50),
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            customer_id UUID,
            customer_name VARCHAR(255),
            store_id UUID REFERENCES stores(id),
            
            -- Totals & Profit
            total_net DECIMAL(15,2) DEFAULT 0,
            total_vat DECIMAL(15,2) DEFAULT 0,
            total_gross DECIMAL(15,2) DEFAULT 0,
            total_discount DECIMAL(15,2) DEFAULT 0,
            net_amount DECIMAL(15,2) DEFAULT 0,
            total_cost DECIMAL(15,2) DEFAULT 0,
            gross_profit DECIMAL(15,2) DEFAULT 0,
            profit_margin DECIMAL(15,2) DEFAULT 0,
            
            currency VARCHAR(10) DEFAULT ''IQD'',
            currency_rate DECIMAL(15,6) DEFAULT 1,
            
            status VARCHAR(20) DEFAULT ''completed'',
            logo_sync_status VARCHAR(20) DEFAULT ''pending'',
            payment_method VARCHAR(50),
            cashier VARCHAR(100),
            notes TEXT,
            
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_tbl_sales);

    -- AUTO-SYNC SALES
    EXECUTE format('
        ALTER TABLE %I 
        ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10),
        ADD COLUMN IF NOT EXISTS period_nr VARCHAR(10),
        ADD COLUMN IF NOT EXISTS document_no VARCHAR(100),
        ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS net_amount DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_cost DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
        ADD COLUMN IF NOT EXISTS cashier VARCHAR(100),
        ADD COLUMN IF NOT EXISTS store_id UUID
    ', v_tbl_sales);

    -- 3.2 Sale Items (Extreme Parity)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            invoice_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            firm_nr VARCHAR(10),
            period_nr VARCHAR(10),
            item_code VARCHAR(100),
            item_name VARCHAR(255),
            product_id UUID,
            quantity DECIMAL(15,3) NOT NULL,
            unit_price DECIMAL(15,2) NOT NULL,
            vat_rate DECIMAL(5,2) DEFAULT 0,
            discount_rate DECIMAL(15,4) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            total_amount DECIMAL(15,2) DEFAULT 0,
            net_amount DECIMAL(15,2) NOT NULL,
            unit_cost DECIMAL(15,2) DEFAULT 0,
            total_cost DECIMAL(15,2) DEFAULT 0,
            gross_profit DECIMAL(15,2) DEFAULT 0,
            unit VARCHAR(20) DEFAULT ''Adet''
        );
    ', v_tbl_sale_items, v_tbl_sales);

    EXECUTE format('ALTER TABLE %I 
        ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10), 
        ADD COLUMN IF NOT EXISTS period_nr VARCHAR(10),
        ADD COLUMN IF NOT EXISTS product_id UUID,
        ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_rate DECIMAL(15,4) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_amount DECIMAL(15,2) DEFAULT 0
    ', v_tbl_sale_items);

    -- 3.3 Cash Transactions (Super-Template)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            period_nr VARCHAR(10),
            register_id UUID,
            fiche_no VARCHAR(100) UNIQUE,
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            amount DECIMAL(15,2) DEFAULT 0,
            sign INTEGER DEFAULT 1,
            trcode INTEGER,
            definition TEXT,
            transaction_type VARCHAR(50),
            customer_id UUID,
            bank_id UUID,
            bank_account_id UUID,
            target_register_id UUID,
            expense_card_id UUID,
            currency_code VARCHAR(10) DEFAULT ''IQD'',
            exchange_rate DECIMAL(15,6) DEFAULT 1,
            f_amount DECIMAL(15,2) DEFAULT 0,
            transfer_status INTEGER DEFAULT 0,
            special_code VARCHAR(50),
            tax_rate DECIMAL(5,2) DEFAULT 0,
            withholding_tax_rate DECIMAL(5,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_cash_lines');

    EXECUTE format('ALTER TABLE %I 
        ADD COLUMN IF NOT EXISTS register_id UUID,
        ADD COLUMN IF NOT EXISTS period_nr VARCHAR(10),
        ADD COLUMN IF NOT EXISTS trcode INTEGER,
        ADD COLUMN IF NOT EXISTS definition TEXT,
        ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS customer_id UUID,
        ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10) DEFAULT ''IQD'',
        ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(15,6) DEFAULT 1,
        ADD COLUMN IF NOT EXISTS f_amount DECIMAL(15,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS transfer_status INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS special_code VARCHAR(50)
    ', v_prefix || '_cash_lines');

    -- 3.4 Bank Transactions (Super-Template)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            period_nr VARCHAR(10),
            register_id UUID,
            fiche_no VARCHAR(100) UNIQUE,
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            amount DECIMAL(15,2) DEFAULT 0,
            sign INTEGER DEFAULT 1,
            trcode INTEGER,
            definition TEXT,
            transaction_type VARCHAR(50),
            customer_id UUID,
            cash_register_id UUID,
            currency_code VARCHAR(10) DEFAULT ''IQD'',
            exchange_rate DECIMAL(15,6) DEFAULT 1,
            f_amount DECIMAL(15,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_bank_lines');

    EXECUTE format('ALTER TABLE %I 
        ADD COLUMN IF NOT EXISTS register_id UUID,
        ADD COLUMN IF NOT EXISTS period_nr VARCHAR(10),
        ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50),
        ADD COLUMN IF NOT EXISTS customer_id UUID,
        ADD COLUMN IF NOT EXISTS cash_register_id UUID
    ', v_prefix || '_bank_lines');

    -- 3.5 Virman Operations (Warehouse Transfer Notes)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            period_nr VARCHAR(10),
            virman_no VARCHAR(100) NOT NULL,
            from_warehouse_id UUID,
            to_warehouse_id UUID,
            operation_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50) DEFAULT ''draft'',
            notes TEXT,
            created_by VARCHAR(100),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_virman_operations');

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            virman_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            product_id UUID,
            quantity DECIMAL(15,4) DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_virman_items', v_prefix || '_virman_operations');

    PERFORM public.APPLY_SYNC_TRIGGERS(v_tbl_sales);
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_cash_lines');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_bank_lines');
END;
$$ LANGUAGE plpgsql;
