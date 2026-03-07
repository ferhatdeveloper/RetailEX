-- Migration: Ensure Cash Registers Tables and Default Data
-- Created: 2026-02-14

-- 1. Ensure Firm Tables Exist (Idempotent)
SELECT CREATE_FIRM_TABLES('001');

-- 2. Ensure Period Tables Exist (Idempotent)
SELECT CREATE_PERIOD_TABLES('001', '01');

-- 3. Seed Default Cash Registers if missing
INSERT INTO public.rex_001_cash_registers (code, name, currency_code, balance, is_active)
SELECT 'MERKEZ', 'Merkez Kasa', 'IQD', 0, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.rex_001_cash_registers WHERE code = 'MERKEZ'
);

INSERT INTO public.rex_001_cash_registers (code, name, currency_code, balance, is_active)
SELECT 'MERKEZ_USD', 'Merkez Kasa (USD)', 'USD', 0, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.rex_001_cash_registers WHERE code = 'MERKEZ_USD'
);
