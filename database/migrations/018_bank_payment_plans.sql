-- Migration: 018_bank_payment_plans.sql
-- Description: Creates tables for POS installment plans and bank commissions

-- 18.1 Centralized Bank Payment Plans
CREATE TABLE IF NOT EXISTS logic.bank_pay_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    bank_name VARCHAR(100), -- Can be linked to a banks table in the future
    card_brand VARCHAR(50), -- Visa, Mastercard, Troy, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18.2 Installment Lines for Bank Payment Plans
CREATE TABLE IF NOT EXISTS logic.bank_pay_plan_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID REFERENCES logic.bank_pay_plans(id) ON DELETE CASCADE,
    installment_count INTEGER NOT NULL CHECK (installment_count >= 1 AND installment_count <= 12),
    commission_rate NUMERIC(10, 4) DEFAULT 0, -- Percentage (e.g. 1.25)
    delay_days INTEGER DEFAULT 0, -- Days until payout
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(plan_id, installment_count)
);

-- 18.3 Function to create firm-specific bank payment plans
CREATE OR REPLACE FUNCTION public.CREATE_FIRM_BANK_PAY_PLAN_TABLES(p_firm_id VARCHAR)
RETURNS void AS $$
BEGIN
    -- Firm-specific bank pay plans
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.rex_' || p_firm_id || '_bank_pay_plans (
        LIKE logic.bank_pay_plans INCLUDING ALL
    )';

    -- Firm-specific bank pay plan lines
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.rex_' || p_firm_id || '_bank_pay_plan_lines (
        LIKE logic.bank_pay_plan_lines INCLUDING ALL
    )';
END;
$$ LANGUAGE plpgsql;

-- 18.4 Update existing CREATE_FIRM_TABLES function to include bank payment plans
-- Note: We fetch the current definition of CREATE_FIRM_TABLES first or just append this call
-- For now, let's just make sure it's available for script-based calls

-- 18.5 Seed or Audit entry
-- Note: app_audit_logs table doesn't exist yet, commenting out for now
-- INSERT INTO public.app_audit_logs (event_type, description, user_id)
-- VALUES ('DB_MIGRATION', 'Migration 018: Bank Payment Plans tables created', '00000000-0000-0000-0000-000000000000')
-- ON CONFLICT DO NOTHING;
