-- Migration 015: Documentation Alignment
-- Aligning schemas with High Priority recommendations in docs/TEDARIKCI_MUSTERI_ALANLARI.md
-- Added: 2026-01-03

-- 1. Add Multi-Company Support (firma_id)
DO $$ BEGIN
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS firma_id UUID;
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS firma_id UUID;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS firma_id UUID;
    ALTER TABLE stores ADD COLUMN IF NOT EXISTS firma_id UUID;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 2. Enhance Customer Table with Documented Fields
DO $$ BEGIN
    -- Address Details
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS district TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Iraq';
    
    -- Communication
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone2 TEXT;
    
    -- Integration (Logo/Nebim)
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS logo_code TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS nebim_code TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 3. Enhance Suppliers Table with Documented Fields
DO $$ BEGIN
    -- Address Details
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS district TEXT;
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS postal_code TEXT;
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Iraq';
    
    -- Communication
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone2 TEXT;
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person TEXT;
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person_phone TEXT;
    
    -- Integration (Logo/Nebim)
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS logo_code TEXT;
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS nebim_code TEXT;
EXCEPTION WHEN duplicate_column THEN null; END $$;

-- 4. Create Indexes for Alignment Fields
CREATE INDEX IF NOT EXISTS idx_customers_firma ON customers(firma_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_firma ON suppliers(firma_id);
CREATE INDEX IF NOT EXISTS idx_products_firma ON products(firma_id);
CREATE INDEX IF NOT EXISTS idx_stores_firma ON stores(firma_id);

