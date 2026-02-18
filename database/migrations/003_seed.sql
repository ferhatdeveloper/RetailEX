-- ============================================================================
-- RetailEx - BASELINE SEED DATA (v3.1)
-- ----------------------------------------------------------------------------
-- Standard System Definitions
-- ============================================================================

-- 1. STORES
INSERT INTO stores (id, code, name, city, region, is_main, firm_nr) VALUES
  ('11111111-1111-4111-a111-111111111111', 'RE-HO-001', 'RetailEx Head Office', 'Baghdad', 'Baghdad', true, '001'),
  ('22222222-2222-4222-a222-222222222222', 'RE-BR-001', 'RetailEx Branch 01', 'Erbil', 'Kurdistan', false, '001')
ON CONFLICT (id) DO NOTHING;

-- 2. CURRENCIES
INSERT INTO currencies (id, code, name, symbol, is_base_currency, sort_order) VALUES
  ('a1111111-1111-4111-b111-111111111111', 'IQD', 'Iraqi Dinar', 'د.ع', true, 1),
  ('a2222222-2222-4222-b222-222222222222', 'USD', 'US Dollar', '$', false, 2),
  ('a3333333-3333-4333-b333-333333333333', 'TRY', 'Turkish Lira', '₺', false, 3)
ON CONFLICT (id) DO NOTHING;

-- 3. TAX RATES
INSERT INTO tax_rates (id, rate, description) VALUES
  ('c1111111-1111-4111-c111-111111111111', 0.00, 'Tax Free / Exempt'),
  ('c2222222-2222-4222-c222-222222222222', 15.00, 'Standard Rate (15%)')
ON CONFLICT (id) DO NOTHING;

-- 4. ADMIN USER (Now handled dynamically in SetupWizard per firm)
-- Default Password: 'admin123'

-- 4. UNITS
INSERT INTO units (code, name) VALUES
  ('ADET', 'Adet'),
  ('KG', 'Kilogram'),
  ('MT', 'Metre'),
  ('PKT', 'Paket')
ON CONFLICT (code) DO NOTHING;
