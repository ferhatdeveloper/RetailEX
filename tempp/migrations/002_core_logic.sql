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
    v_unitset_id UUID;
BEGIN
    -- 1. Products Super-Template
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
            description TEXT,
            description_tr TEXT,
            description_en TEXT,
            description_ar TEXT,
            description_ku TEXT,
            category_id UUID,
            category_code VARCHAR(50),
            group_code VARCHAR(50),
            sub_group_code VARCHAR(50),
            brand VARCHAR(100),
            model VARCHAR(100),
            manufacturer VARCHAR(100),
            supplier VARCHAR(100),
            origin VARCHAR(50),
            material_type VARCHAR(50),
            unit VARCHAR(50) DEFAULT ''Adet'',
            unit_id UUID,
            unitset_id UUID,
            unit2 VARCHAR(20),
            unit3 VARCHAR(20),
            vat_rate DECIMAL(5,2) DEFAULT 20,
            tax_type VARCHAR(20),
            withholding_rate DECIMAL(5,2),
            currency VARCHAR(10),
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            min_stock DECIMAL(15,2) DEFAULT 0,
            max_stock DECIMAL(15,2) DEFAULT 0,
            critical_stock DECIMAL(15,2) DEFAULT 0,
            shelf_location VARCHAR(50),
            warehouse_code VARCHAR(50),
            price_list_1 DECIMAL(15,2) DEFAULT 0,
            price_list_2 DECIMAL(15,2) DEFAULT 0,
            price_list_3 DECIMAL(15,2) DEFAULT 0,
            price_list_4 DECIMAL(15,2) DEFAULT 0,
            price_list_5 DECIMAL(15,2) DEFAULT 0,
            price_list_6 DECIMAL(15,2) DEFAULT 0,
            special_code_1 VARCHAR(50),
            special_code_2 VARCHAR(50),
            special_code_3 VARCHAR(50),
            special_code_4 VARCHAR(50),
            special_code_5 VARCHAR(50),
            special_code_6 VARCHAR(50),
            tracking_type VARCHAR(20) DEFAULT ''none'',
            -- CamelCase compat aliases (v5.6)
            categorycode VARCHAR(50),
            groupcode VARCHAR(50),
            subgroupcode VARCHAR(50),
            materialtype VARCHAR(50),
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
            purchase_price_usd DECIMAL(15,2) DEFAULT 0,
            purchase_price_eur DECIMAL(15,2) DEFAULT 0,
            sale_price_usd DECIMAL(15,2) DEFAULT 0,
            sale_price_eur DECIMAL(15,2) DEFAULT 0,
            preparation_time INTEGER DEFAULT 5,
            has_variants BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_tbl_products);

    -- 2. Customers Super-Template
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            email VARCHAR(255),
            tax_nr VARCHAR(50),
            taxi_nr VARCHAR(50),
            tax_office VARCHAR(100),
            address TEXT,
            city VARCHAR(100),
            neighborhood VARCHAR(100),
            district VARCHAR(100),
            balance DECIMAL(15,2) DEFAULT 0,
            points DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_tbl_customers);

    -- 2.3.5 Suppliers
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

    -- 3. Definitions (Categories, Brands, Units)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), 
            code VARCHAR(50) UNIQUE, 
            name VARCHAR(255) NOT NULL, 
            description TEXT, 
            parent_id UUID,
            is_restaurant BOOLEAN DEFAULT false,
            icon VARCHAR(100),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_categories');

    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_brands');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(20) UNIQUE, name VARCHAR(100) NOT NULL, description TEXT, is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);', v_prefix || '_units');

    -- 4. Unit Sets & Variants
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), code VARCHAR(50) UNIQUE, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT true);', v_prefix || '_unitsets');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), unitset_id UUID, item_code VARCHAR(20) NOT NULL, code VARCHAR(50), name VARCHAR(100), main_unit BOOLEAN DEFAULT false, conv_fact1 DECIMAL(15,6) DEFAULT 1, conv_fact2 DECIMAL(15,6) DEFAULT 1, CONSTRAINT %I UNIQUE(unitset_id, item_code));', v_prefix || '_unitsetl', v_prefix || '_unitsetl_unique');
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), product_id UUID, sku VARCHAR(100) UNIQUE, attributes JSONB);', v_prefix || '_product_variants');
    
    -- 5. Campaigns (086)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            type VARCHAR(50) NOT NULL,
            discount_type VARCHAR(50) NOT NULL,
            discount_value DECIMAL(15,2) DEFAULT 0,
            start_date TIMESTAMPTZ,
            end_date TIMESTAMPTZ,
            is_active BOOLEAN DEFAULT true,
            min_purchase_amount DECIMAL(15,2) DEFAULT 0,
            max_discount_amount DECIMAL(15,2),
            applicable_categories VARCHAR(255),
            applicable_products JSONB DEFAULT ''[]'',
            priority INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_campaigns');

    -- 6. Registry & Finance
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
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_categories');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_brands');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_units');
    PERFORM public.APPLY_SYNC_TRIGGERS(v_prefix || '_campaigns');

    -- Standard Unit Sets Seeding
    v_unitset_id := uuid_generate_v4();
    EXECUTE format('INSERT INTO %I (id, code, name) VALUES (%L, ''01-ADET'', ''Adet Varsayılan'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets', v_unitset_id);
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''ADET'', 1 FROM %I WHERE code = ''01-ADET'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

    v_unitset_id := uuid_generate_v4();
    EXECUTE format('INSERT INTO %I (id, code, name) VALUES (%L, ''02-KG'', ''Kilogram/Gram'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets', v_unitset_id);
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''KG'', 1 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''GRAM'', 1000 FROM %I WHERE code = ''02-KG'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

    v_unitset_id := uuid_generate_v4();
    EXECUTE format('INSERT INTO %I (id, code, name) VALUES (%L, ''03-LT'', ''Litre/Militre'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets', v_unitset_id);
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''LT'', 1 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''ML'', 1000 FROM %I WHERE code = ''03-LT'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

    v_unitset_id := uuid_generate_v4();
    EXECUTE format('INSERT INTO %I (id, code, name) VALUES (%L, ''04-KOLI24'', ''Koli (24 Adet)'') ON CONFLICT (code) DO NOTHING;', v_prefix || '_unitsets', v_unitset_id);
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''KOLI'', 1 FROM %I WHERE code = ''04-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');
    EXECUTE format('INSERT INTO %I (unitset_id, item_code, conv_fact1) SELECT id, ''ADET'', 24 FROM %I WHERE code = ''04-KOLI24'' ON CONFLICT DO NOTHING;', v_prefix || '_unitsetl', v_prefix || '_unitsets');

    -- Default Seeding
    EXECUTE format('INSERT INTO %I (id, firm_nr, code, name, is_active) VALUES (''00000000-0000-0000-0000-000000000001'', %L, ''KASA.001'', ''MERKEZ KASA'', true) ON CONFLICT DO NOTHING;', v_prefix || '_cash_registers', p_firm_nr);
END;
$$ LANGUAGE plpgsql;

-- 3.0 PRODUCTION SYSTEM (083 Consolidated)
CREATE OR REPLACE FUNCTION public.INIT_PRODUCTION_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE v_prefix TEXT := lower('rex_' || p_firm_nr);
BEGIN
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS public.%I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            product_id UUID NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            total_cost DECIMAL(15,2) DEFAULT 0,
            wastage_percent DECIMAL(5,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_production_recipes');

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS public.%I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            recipe_id UUID NOT NULL,
            material_id UUID NOT NULL,
            quantity DECIMAL(15,3) NOT NULL,
            unit VARCHAR(20),
            cost DECIMAL(15,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_production_recipe_ingredients');

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS public.%I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firm_nr VARCHAR(10) NOT NULL,
            order_no VARCHAR(50) UNIQUE,
            recipe_id UUID NOT NULL,
            product_id UUID NOT NULL,
            planned_qty DECIMAL(15,3) NOT NULL,
            produced_qty DECIMAL(15,3) DEFAULT 0,
            status VARCHAR(20) DEFAULT ''draft'',
            start_date DATE,
            end_date DATE,
            completed_at TIMESTAMPTZ,
            note TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_production_orders');

    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipes');
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_recipe_ingredients');
    PERFORM public.ATTACH_AUDIT_LOG(v_prefix || '_production_orders');
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
            is_cancelled BOOLEAN DEFAULT false,
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
            unit VARCHAR(20) DEFAULT ''Adet'',
            unit_multiplier DECIMAL(15,6) DEFAULT 1,
            base_quantity DECIMAL(15,3),
            unit_price_fc DECIMAL(15,4) DEFAULT 0,
            currency VARCHAR(10) DEFAULT ''IQD''
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
