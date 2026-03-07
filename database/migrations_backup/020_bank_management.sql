-- Migration: 020_bank_management.sql
-- Description: Creates tables for Bank Registers and Bank Transactions

-- 20.1 Centralized Bank Registers
CREATE TABLE IF NOT EXISTS logic.bank_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    bank_name VARCHAR(100) NOT NULL,
    branch_name VARCHAR(100),
    account_no VARCHAR(50),
    iban VARCHAR(50),
    currency_code VARCHAR(10) DEFAULT 'IQD',
    balance NUMERIC(18, 4) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20.2 Bank Transaction Lines
CREATE TABLE IF NOT EXISTS logic.bank_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    register_id UUID REFERENCES logic.bank_registers(id) ON DELETE CASCADE,
    fiche_no VARCHAR(50),
    date TIMESTAMPTZ DEFAULT NOW(),
    amount NUMERIC(18, 4) NOT NULL,
    sign INTEGER NOT NULL DEFAULT 1, -- 1 for Inflow, -1 for Outflow
    is_active BOOLEAN DEFAULT true,
    definition TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    transaction_type VARCHAR(50) -- CH_TAHSILAT, CH_ODEME, BANKA_GIRIS, BANKA_CIKIS, HAVALE, EFT, etc.
);

-- 20.3 Function to create firm-specific bank tables
CREATE OR REPLACE FUNCTION public.CREATE_FIRM_BANK_TABLES(p_firm_id VARCHAR)
RETURNS void AS $$
BEGIN
    -- Firm-specific bank registers
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.rex_' || p_firm_id || '_bank_registers (
        LIKE logic.bank_registers INCLUDING ALL
    )';

    -- Firm-specific bank lines
    EXECUTE 'CREATE TABLE IF NOT EXISTS public.rex_' || p_firm_id || '_bank_lines (
        LIKE logic.bank_lines INCLUDING ALL
    )';
END;
$$ LANGUAGE plpgsql;

-- 20.4 Audit entry
-- Note: app_audit_logs table doesn't exist yet, commenting out for now
-- INSERT INTO public.app_audit_logs (event_type, description, user_id)
-- VALUES ('DB_MIGRATION', 'Migration 020: Bank Management tables created', '00000000-0000-0000-0000-000000000000')
-- ON CONFLICT DO NOTHING;
