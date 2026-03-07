-- Migration: 019_cash_management.sql
-- Description: Creates tables for Cash Registers and Cash Transactions

-- 19.1 Centralized Cash Registers
CREATE TABLE IF NOT EXISTS logic.cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    currency_code VARCHAR(10) DEFAULT 'IQD',
    balance NUMERIC(18, 4) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 19.2 Cash Transaction Lines
CREATE TABLE IF NOT EXISTS logic.cash_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    register_id UUID REFERENCES logic.cash_registers(id) ON DELETE CASCADE,
    fiche_no VARCHAR(50),
    date TIMESTAMPTZ DEFAULT NOW(),
    amount NUMERIC(18, 4) NOT NULL,
    sign INTEGER NOT NULL DEFAULT 1, -- 1 for Inflow, -1 for Outflow
    is_active BOOLEAN DEFAULT true,
    definition TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    transaction_type VARCHAR(50) -- CH_TAHSILAT, CH_ODEME, KASA_GIRIS, KASA_CIKIS, etc.
);

-- 19.3 Function to create firm-specific cash tables
CREATE OR REPLACE FUNCTION public.CREATE_FIRM_CASH_TABLES(p_firm_id VARCHAR)
RETURNS void AS $$
BEGIN
    -- Firm-specific cash registers
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.rex_' || p_firm_id || '_cash_registers (
        LIKE logic.cash_registers INCLUDING ALL
    )';

    -- Firm-specific cash lines
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.rex_' || p_firm_id || '_cash_lines (
        LIKE logic.cash_lines INCLUDING ALL
    )';
END;
$$ LANGUAGE plpgsql;

-- 19.4 Seed or Audit entry
-- Note: app_audit_logs table doesn't exist yet, commenting out for now
-- INSERT INTO public.app_audit_logs (event_type, description, user_id)
-- VALUES ('DB_MIGRATION', 'Migration 019: Cash Management tables created', '00000000-0000-0000-0000-000000000000')
-- ON CONFLICT DO NOTHING;
