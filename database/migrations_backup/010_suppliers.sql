-- Migration: 010_suppliers.sql
-- Description: Add suppliers table and logic

-- 1. Create Suppliers Table Function (Idempotent)
CREATE OR REPLACE FUNCTION create_suppliers_table(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
    v_table_name text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);
    v_table_name := v_prefix || '_suppliers';

    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            phone2 VARCHAR(50),
            email VARCHAR(255),
            address TEXT,
            district VARCHAR(100),
            city VARCHAR(100),
            postal_code VARCHAR(20),
            country VARCHAR(100),
            contact_person VARCHAR(100),
            contact_person_phone VARCHAR(50),
            payment_terms INTEGER DEFAULT 30,
            credit_limit DECIMAL(15,2) DEFAULT 0,
            balance DECIMAL(15,2) DEFAULT 0,
            tax_number VARCHAR(50),
            tax_office VARCHAR(100),
            is_active BOOLEAN DEFAULT true,
            notes TEXT,
            firma_id VARCHAR(50), -- Legacy field support
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_table_name);
    
    -- Add indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_name ON %I(name)', v_table_name, v_table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_code ON %I(code)', v_table_name, v_table_name);
END;
$$ LANGUAGE plpgsql;

-- 2. Apply to existing firms (e.g. 001, 009)
SELECT create_suppliers_table('001');
SELECT create_suppliers_table('009');

-- 3. Insert Demo Data for Firm 001
INSERT INTO rex_001_suppliers (code, name, phone, email, city, is_active)
VALUES 
('TED-001', 'Örnek Tedarikçi A.Ş.', '05551112233', 'info@ornektedarik.com', 'İstanbul', true),
('TED-002', 'Global Dağıtım Ltd.', '02123334455', 'satis@globaldagitim.com', 'Ankara', true)
ON CONFLICT (code) DO NOTHING;

-- 4. Insert Demo Data for Firm 009 (Common Test Firm)
INSERT INTO rex_009_suppliers (code, name, phone, email, city, is_active)
VALUES 
('TED-001', 'Baghdad Trading Co.', '+964 750 111 2233', 'info@baghdadtrading.com', 'Baghdad', true),
('TED-002', 'Erbil Wholesale Ltd.', '+964 770 222 3344', 'contact@erbilwholesale.com', 'Erbil', true)
ON CONFLICT (code) DO NOTHING;
