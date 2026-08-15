-- ============================================================================
-- 121: parties (cari polymorphism) — Personel ve Şirket Ortağı tipleri
-- ============================================================================
-- Amaç:
--   * Mevcut `rex_<firm>_customers` ve `rex_<firm>_suppliers` tabloları dokunulmaz.
--   * Yeni ortak tablo `rex_<firm>_parties` 4 tipi polimorfik olarak taşır:
--     customer, supplier, employee, partner.
--   * Personel ve ortağa özel alanlar (salary_base, share_pct vb.) müşteri/
--     tedarikçi şemasını kirletmez.
--   * Period-düzey party_ledger_movements (maaş, avans, kâr/zarar dağıtımı).
--   * partner_settings + partner_distributions (dağıtım geçmişi).
--
-- Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
-- Tauri uyumu: DDL ayrı ALTER satırlarına bölünmüştür; DO $$ blokları yalnız
-- `pg_tables` üzerinden tüm firmaları gezmek için kullanılır.
-- ============================================================================

-- 1) parties kart tablosu — mevcut tüm firmalar (rex_<firm>_parties)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_parties$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS firm_nr VARCHAR(10) NOT NULL DEFAULT ''001''', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS code VARCHAR(50)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT ''''', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS card_type VARCHAR(20) NOT NULL DEFAULT ''customer''', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS phone VARCHAR(50)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS email VARCHAR(255)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS address TEXT', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tax_nr VARCHAR(50)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tax_office VARCHAR(100)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS balance DECIMAL(15,2) NOT NULL DEFAULT 0', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS notes TEXT', r.tablename);
    -- employee-specific
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS salary_base DECIMAL(15,2) NOT NULL DEFAULT 0', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS hire_date DATE', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS department VARCHAR(100)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS position VARCHAR(100)', r.tablename);
    -- partner-specific
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS share_pct NUMERIC(5,2) NOT NULL DEFAULT 0', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS capital_contribution DECIMAL(15,2) NOT NULL DEFAULT 0', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS partner_role VARCHAR(50)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS partner_since DATE', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS iban VARCHAR(50)', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()', r.tablename);

    -- Unique code (firm + code)
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, code) WHERE code IS NOT NULL',
      r.tablename || '_firm_code_uniq', r.tablename);

    -- card_type CHECK
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      r.tablename, 'rex_parties_card_type_chk');
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (card_type IN (''customer'',''supplier'',''employee'',''partner''))',
      r.tablename, 'rex_parties_card_type_chk');

    -- Indexes
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, card_type)',
      r.tablename || '_firm_card_type_idx', r.tablename);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, is_active)',
      r.tablename || '_firm_active_idx', r.tablename);
  END LOOP;
END $$;

-- 2) Default firma 001 — yeni kurulumlar için garanti
CREATE TABLE IF NOT EXISTS public.rex_001_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL DEFAULT '001',
  code VARCHAR(50),
  name VARCHAR(255) NOT NULL DEFAULT '',
  card_type VARCHAR(20) NOT NULL DEFAULT 'customer',
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  tax_nr VARCHAR(50),
  tax_office VARCHAR(100),
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  salary_base DECIMAL(15,2) NOT NULL DEFAULT 0,
  hire_date DATE,
  department VARCHAR(100),
  position VARCHAR(100),
  share_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  capital_contribution DECIMAL(15,2) NOT NULL DEFAULT 0,
  partner_role VARCHAR(50),
  partner_since DATE,
  iban VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rex_001_parties_firm_code_uniq
  ON public.rex_001_parties (firm_nr, code) WHERE code IS NOT NULL;

ALTER TABLE public.rex_001_parties DROP CONSTRAINT IF EXISTS rex_parties_card_type_chk;
ALTER TABLE public.rex_001_parties
  ADD CONSTRAINT rex_parties_card_type_chk
  CHECK (card_type IN ('customer','supplier','employee','partner'));

CREATE INDEX IF NOT EXISTS rex_001_parties_firm_card_type_idx
  ON public.rex_001_parties (firm_nr, card_type);
CREATE INDEX IF NOT EXISTS rex_001_parties_firm_active_idx
  ON public.rex_001_parties (firm_nr, is_active);

-- 3) party_ledger_movements (period-düzey) — kontrol amaçlı
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_party_ledger_movements$'
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, period_nr, party_id, date)',
      r.tablename || '_firm_period_party_date_idx', r.tablename);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (transaction_type)',
      r.tablename || '_trtype_idx', r.tablename);
  END LOOP;
END $$;

-- 4) partner_settings (firma-düzey)
CREATE TABLE IF NOT EXISTS public.rex_001_partner_settings (
  firm_nr VARCHAR(10) PRIMARY KEY,
  distribution_mode VARCHAR(20) NOT NULL DEFAULT 'manual', -- daily|period|manual
  distribution_base VARCHAR(20) NOT NULL DEFAULT 'manual', -- net_profit|cash_net|manual
  expense_share_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rex_001_partner_settings
  DROP CONSTRAINT IF EXISTS rex_partner_settings_mode_chk;
ALTER TABLE public.rex_001_partner_settings
  ADD CONSTRAINT rex_partner_settings_mode_chk
  CHECK (distribution_mode IN ('daily','period','manual'));

ALTER TABLE public.rex_001_partner_settings
  DROP CONSTRAINT IF EXISTS rex_partner_settings_base_chk;
ALTER TABLE public.rex_001_partner_settings
  ADD CONSTRAINT rex_partner_settings_base_chk
  CHECK (distribution_base IN ('net_profit','cash_net','manual'));

-- 5) Default partner_settings row
INSERT INTO public.rex_001_partner_settings (firm_nr, distribution_mode, distribution_base, expense_share_enabled)
VALUES ('001', 'manual', 'manual', false)
ON CONFLICT (firm_nr) DO NOTHING;

-- 6) partner_distributions + partner_distribution_items (period-düzey)
-- Bu tablolar migration loop'unda otomatik oluşturulur; aşağıda index'ler tanımlıdır.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_partner_distributions$'
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (distribution_date)',
      r.tablename || '_date_idx', r.tablename);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, trigger_type)',
      r.tablename || '_firm_trigger_idx', r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_partner_distribution_items$'
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (distribution_id)',
      r.tablename || '_dist_idx', r.tablename);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (partner_id)',
      r.tablename || '_partner_idx', r.tablename);
  END LOOP;
END $$;

-- 7) cash_lines tablosuna party_id (nullable) — maaş/avans/ortak için polymorphic ref
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_[0-9]+_cash_lines$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS party_id UUID', r.tablename);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (party_id)',
      r.tablename || '_party_id_idx', r.tablename);
  END LOOP;
END $$;
