-- Migration: 015_variants_and_lots.sql
-- Description: Add product_variants and lots tables to firm schema

-- 1. Redefine CREATE_FIRM_TABLES to include product_variants and lots
CREATE OR REPLACE FUNCTION CREATE_FIRM_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- Products Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            code VARCHAR(100) UNIQUE,
            barcode VARCHAR(100) UNIQUE,
            name VARCHAR(255) NOT NULL,
            name2 VARCHAR(255),
            category_id UUID REFERENCES categories(id),
            unit_id UUID REFERENCES units(id),
            vat_rate DECIMAL(5,2) DEFAULT 20,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_products');

    -- Product Variants Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            product_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            variant_name VARCHAR(255),
            sku VARCHAR(100),
            barcode VARCHAR(100) UNIQUE,
            attributes JSONB,
            price DECIMAL(15,2) DEFAULT 0,
            cost DECIMAL(15,2) DEFAULT 0,
            stock DECIMAL(15,2) DEFAULT 0,
            min_stock DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_product_variants', v_prefix || '_products');

    -- Lots Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            product_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            variant_id UUID REFERENCES %I(id) ON DELETE CASCADE,
            lot_no VARCHAR(100) NOT NULL,
            serial_no VARCHAR(100),
            expiration_date DATE,
            production_date DATE,
            quantity DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_lots', v_prefix || '_products', v_prefix || '_product_variants');

    -- Customers Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
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

    -- Sales Reps Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            phone VARCHAR(50),
            password_hash VARCHAR(255),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_sales_reps');

    -- Cash Registers Table
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE,
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            currency_code VARCHAR(10),
            balance DECIMAL(15,2) DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_cash_registers');
    
    -- Sync Trigger for Products
    EXECUTE format('
        CREATE OR REPLACE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I 
        FOR EACH ROW EXECUTE FUNCTION enqueue_sync_event();
    ', 'sync_' || v_prefix || '_products', v_prefix || '_products');
END;
$$ LANGUAGE plpgsql;

-- 2. Apply to existing firms
SELECT CREATE_FIRM_TABLES('001');
SELECT CREATE_FIRM_TABLES('009');
