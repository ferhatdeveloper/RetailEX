-- Phase 3: Waiter Management & Staff Tables

-- 1. Create staff table for the main schema (for lookup/management if needed)
CREATE TABLE IF NOT EXISTS rest.staff_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    permissions JSONB DEFAULT '{}'
);

INSERT INTO rest.staff_roles (name) VALUES ('Manager'), ('Waiter'), ('Chef'), ('Cashier') ON CONFLICT DO NOTHING;

-- 2. Update INIT_RESTAURANT_FIRM_TABLES to include staff
-- This will be handled in the base 003_vertical_and_enterprise.sql for zero-setup

-- 3. Migration for existing firms (001)
DO $$ 
DECLARE 
    r RECORD;
    v_prefix TEXT;
BEGIN
    FOR r IN SELECT firm_nr FROM public.firms LOOP
        v_prefix := lower('rex_' || r.firm_nr);
        
        -- Create staff table in 'rest' schema
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS rest.%I (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                role VARCHAR(50) DEFAULT ''Waiter'',
                pin VARCHAR(10) NOT NULL UNIQUE,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        ', v_prefix || '_rest_staff');

        -- Seed initial staff for firm 001 if empty
        IF r.firm_nr = '001' THEN
            EXECUTE format('
                INSERT INTO rest.%I (name, pin, role)
                SELECT ''Ahmet'', ''1234'', ''Waiter''
                WHERE NOT EXISTS (SELECT 1 FROM rest.%I)
            ', v_prefix || '_rest_staff', v_prefix || '_rest_staff');
            
            EXECUTE format('
                INSERT INTO rest.%I (name, pin, role)
                SELECT ''Mehmet'', ''4321'', ''Waiter''
                WHERE NOT EXISTS (SELECT 1 FROM rest.%I WHERE name = ''Mehmet'')
            ', v_prefix || '_rest_staff', v_prefix || '_rest_staff');
        END IF;
    END LOOP;
END $$;
