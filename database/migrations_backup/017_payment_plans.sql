-- Migration: 017_payment_plans.sql
-- Description: Create payment plans and installments tables

-- 1. Create Pay Plans & Lines in LOGIC schema
CREATE TABLE IF NOT EXISTS logic.pay_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_nr VARCHAR(10) NOT NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(firm_nr, code)
);

CREATE TABLE IF NOT EXISTS logic.pay_plan_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id UUID REFERENCES logic.pay_plans(id) ON DELETE CASCADE,
    line_no INTEGER NOT NULL,
    day_offset INTEGER DEFAULT 0, -- Days from invoice date
    percent DECIMAL(5,2), -- Percentage of total (e.g., 50.00)
    amount DECIMAL(15,2), -- Fixed amount (optional)
    payment_type VARCHAR(20) DEFAULT 'cash', -- cash, credit_card
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Update CREATE_FIRM_TABLES to include payment plans (Firm-specific tables for Logo compatibility)
-- Note: While enterprise schemas are preferred, some systems might expect rex_FFF_PAYPLANS
CREATE OR REPLACE FUNCTION CREATE_FIRM_PAYMENT_PLAN_TABLES(p_firm_nr VARCHAR)
RETURNS void AS $$
DECLARE
    v_prefix text;
BEGIN
    v_prefix := lower('rex_' || p_firm_nr);

    -- Payment Plans (Firm Specific)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            ref_id INTEGER UNIQUE, -- Logo LOGICALREF
            code VARCHAR(50) UNIQUE,
            name VARCHAR(255) NOT NULL,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_pay_plans');

    -- Payment Plan Lines (Firm Specific)
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            plan_ref UUID REFERENCES %I(id) ON DELETE CASCADE,
            line_no INTEGER,
            day_offset INTEGER,
            percent DECIMAL(15,2),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    ', v_prefix || '_pay_plan_lines', v_prefix || '_pay_plans');
END;
$$ LANGUAGE plpgsql;

-- 3. Execute for existing firm 001
SELECT CREATE_FIRM_PAYMENT_PLAN_TABLES('001');

-- Audit Log
INSERT INTO public.audit_logs (firm_nr, table_name, record_id, action, new_data)
VALUES ('000', 'system', '00000000-0000-0000-0000-000000000000', 'MIGRATION_017', '{"status": "completed", "feature": "payment_plans"}'::JSONB)
ON CONFLICT DO NOTHING;
