-- ============================================================================
-- RetailEx - CONSOLIDATED DATABASE LOGIC (v3.1)
-- ----------------------------------------------------------------------------
-- Standard Functions, Triggers, and Stored Procedures
-- ============================================================================

-- Extensions (Already in 01_schema.sql, but keeping for idempotency)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- SECTION 1: SYSTEM TRIGGERS
-- ============================================================================

-- 1.2 Hybrid Sync Queue Trigger
CREATE OR REPLACE FUNCTION enqueue_sync_event()
RETURNS TRIGGER AS $$
DECLARE
    v_firm_nr VARCHAR;
    v_record_id UUID;
    v_data JSONB;
BEGIN
    -- Determine firm_nr
    IF (TG_OP = 'DELETE') THEN
        v_firm_nr := OLD.firm_nr;
        v_record_id := OLD.id;
        v_data := row_to_json(OLD)::JSONB;
    ELSE
        v_firm_nr := NEW.firm_nr;
        v_record_id := NEW.id;
        v_data := row_to_json(NEW)::JSONB;
    END IF;

    -- Insert into sync_queue (Duplicate Prevention Strategy)
    -- If a pending record already exists for this table/id, update it with new data 
    -- instead of creating a new row. This reduces network load and processing time.
    
    INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data, status, created_at)
    VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_firm_nr, v_data, 'pending', NOW())
    ON CONFLICT DO NOTHING; -- We can't use ON CONFLICT because (table, record_id) isn't unique (status changes).
    
    -- Better approach for PostgreSQL < 15 without MERGE:
    -- Update existing PENDING record if exists
    UPDATE sync_queue 
    SET data = v_data, action = TG_OP, created_at = NOW(), firm_nr = v_firm_nr
    WHERE table_name = TG_TABLE_NAME 
      AND record_id = v_record_id 
      AND status = 'pending';

    -- If no row updated, insert new
    IF NOT FOUND THEN
        INSERT INTO sync_queue (table_name, record_id, action, firm_nr, data)
        VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_firm_nr, v_data);
    END IF;

    RETURN NULL; -- Result is ignored since this is an AFTER trigger
END;
$$ LANGUAGE plpgsql;

-- 1.1 Auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers (Check existence first to avoid errors)
DO $$
BEGIN
    -- Stores
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_stores_updated_at') THEN
        CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

END $$;

-- ============================================================================
-- SECTION 2: ERP LOGIC
-- ============================================================================

-- 2.1 Stock Management (Atomic Operations)
CREATE OR REPLACE FUNCTION decrease_stock(p_product_id UUID, p_firm_nr VARCHAR, p_quantity DECIMAL(15,2))
RETURNS VOID AS $$
BEGIN
  UPDATE products SET stock = stock - p_quantity, updated_at = NOW() 
  WHERE id = p_product_id AND firm_nr = p_firm_nr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increase_stock(p_product_id UUID, p_firm_nr VARCHAR, p_quantity DECIMAL(15,2))
RETURNS VOID AS $$
BEGIN
  UPDATE products SET stock = stock + p_quantity, updated_at = NOW() 
  WHERE id = p_product_id AND firm_nr = p_firm_nr;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2 Currency & Exchange (Standard IQD/USD logic)
CREATE OR REPLACE FUNCTION convert_currency(
  p_amount DECIMAL(15,2),
  p_from_rate DECIMAL(18,6),
  p_to_rate DECIMAL(18,6)
)
RETURNS DECIMAL(15,2) AS $$
BEGIN
  IF p_from_rate = p_to_rate THEN RETURN p_amount; END IF;
  RETURN (p_amount * p_from_rate / p_to_rate)::DECIMAL(15,2);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECTION 3: ENTERPRISE MULTI-TENANCY MANAGEMENT
-- ============================================================================

-- 3.1 Create Firm-specific tables (Cards like Products, Customers)
-- FFF: Firm Number (e.g., 001)
CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- Products Table (Firm Specific)
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
            
            -- CamelCase compatibility aliases (generated columns or just handle in query)
            -- For now we rely on query keys matching these or being mapped.
            -- NOTE: The frontend sends camelCase (categoryCode). Postgres lowers it to categorycode.
            -- So we should use snake_case for "clean" SQL but if frontend sends camelCase unquoted, 
            -- we might need to match that "structure" or update frontend mapping.
            -- Given the update query logging showed "categoryCode", it expects "categorycode".
            -- I will add "categorycode" etc as well if they differ from snake_case.
            
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

    -- Customers Table (Firm Specific)
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

    -- Sales Reps Table (Firm Specific)
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

    -- Cash Registers Table (Firm Specific)
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

-- 3.2 Create Period-specific tables (Transactions like Sales, Movements)
-- FFF: Firm Number, PP: Period Number (e.g., 01)
CREATE OR REPLACE FUNCTION CREATE_PERIOD_TABLES(p_firm_nr VARCHAR, p_period_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr || '_' || p_period_nr);

    -- Sales Header
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            fiche_no VARCHAR(100) UNIQUE,
            document_no VARCHAR(100), -- User entered document number
            
            customer_ref INTEGER,
            salesman_ref INTEGER,
            store_id UUID REFERENCES stores(id), -- Added store_id
            
            total_net DECIMAL(15,2) DEFAULT 0,
            total_vat DECIMAL(15,2) DEFAULT 0,
            total_gross DECIMAL(15,2) DEFAULT 0,
            total_discount DECIMAL(15,2) DEFAULT 0,
            
            trcode INTEGER,
            date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            due_date TIMESTAMPTZ, -- Vade tarihi
            delivery_date TIMESTAMPTZ, -- Teslim tarihi
            
            description TEXT, -- Notes
            payment_method VARCHAR(50), -- Cash, Credit Card, Open Account
            
            -- Logistics / Waybill
            waybill_no VARCHAR(100),
            shipment_agent VARCHAR(100),
            driver_name VARCHAR(100),
            vehicle_plate VARCHAR(50),
            shipping_address TEXT,
            
            -- E-Invoice / E-Archive
            is_e_invoice BOOLEAN DEFAULT false,
            e_invoice_status VARCHAR(50), -- Pending, Sent, Approved, Rejected
            e_invoice_uuid UUID,
            
            status VARCHAR(20) DEFAULT ''completed'',
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            is_cancelled BOOLEAN DEFAULT false
        );
    ', v_prefix || '_sales');

    -- Sale Items
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            sale_ref UUID REFERENCES %I(id) ON DELETE CASCADE,
            product_ref INTEGER,
            
            amount DECIMAL(15,2) NOT NULL,
            price DECIMAL(15,2) NOT NULL,
            vat_rate DECIMAL(5,2) DEFAULT 20,
            
            discount_rate DECIMAL(5,2) DEFAULT 0,
            discount_amount DECIMAL(15,2) DEFAULT 0,
            
            total_net DECIMAL(15,2) NOT NULL,
            total_vat DECIMAL(15,2) NOT NULL,
            total_gross DECIMAL(15,2) NOT NULL,
            
            description TEXT,
            unit VARCHAR(20) DEFAULT ''Adet''
        );
    ', v_prefix || '_sale_items', v_prefix || '_sales');

    -- Cash Transactions
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            cash_ref INTEGER,
            fiche_no VARCHAR(100),
            trcode INTEGER,
            date TIMESTAMPTZ,
            amount DECIMAL(15,2),
            sign INTEGER, 
            customer_ref INTEGER,
            definition TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_cash_lines');

    -- Stock Movements (Header)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            document_no VARCHAR(50) UNIQUE,
            movement_type VARCHAR(20),
            warehouse_id UUID REFERENCES stores(id),
            movement_date TIMESTAMPTZ DEFAULT NOW(),
            description TEXT,
            status VARCHAR(20) DEFAULT ''completed'',
            created_by UUID,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    ', v_prefix || '_stock_movements');

    -- Stock Movement Items (Lines)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            movement_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            product_id UUID,
            quantity DECIMAL(15,2) DEFAULT 0,
            unit_price DECIMAL(15,2) DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    ', v_prefix || '_stock_movement_items', v_prefix || '_stock_movements');

END;
$$ LANGUAGE plpgsql;
