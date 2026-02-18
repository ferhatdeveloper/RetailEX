-- Ensure Firm Tables Exist (Idempotent function call)
SELECT CREATE_FIRM_TABLES('001');

-- Ensure Period Tables Exist
SELECT CREATE_PERIOD_TABLES('001', '01');

-- Seed Default Cash Register if not exists
INSERT INTO public.rex_001_cash_registers (code, name, currency_code, balance, is_active)
SELECT 'MERKEZ', 'Merkez Kasa', 'IQD', 0, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.rex_001_cash_registers WHERE code = 'MERKEZ'
);

-- Seed Default Cash Register (USD)
INSERT INTO public.rex_001_cash_registers (code, name, currency_code, balance, is_active)
SELECT 'MERKEZ_USD', 'Merkez Kasa (USD)', 'USD', 0, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.rex_001_cash_registers WHERE code = 'MERKEZ_USD'
);
