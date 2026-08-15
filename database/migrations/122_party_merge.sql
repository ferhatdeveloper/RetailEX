-- ============================================================================
-- 122: parties — cari birleştirme (merge) desteği
-- ============================================================================
-- Amaç:
--   * `parties` kartına `merged_into_id` + `merged_at` kolonları eklemek.
--   * Eski kart pasif (is_active=false) yapılarak hedef kartın altına "archive"
--     edilir. Audit trail tam korunur; geri al (unmerge) ileride eklenebilir.
--   * Tüm `rex_<firm>_parties` tablolarına idempotent ALTER.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- Tauri uyumu: DO $$ içinde pg_tables loop + ALTER … IF NOT EXISTS.
-- ============================================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_parties$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS merged_into_id UUID', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS merged_by TEXT', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS merge_notes TEXT', r.tablename);

    -- merged_into_id → aynı tablo (audit chain)
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (merged_into_id) WHERE merged_into_id IS NOT NULL',
      r.tablename || '_merged_into_idx', r.tablename);

    -- merged olan kartlar liste dışı kalmalı; ama UI "Mükerrer / Birleştirilmiş"
    -- görünümü için is_active = true OLAN merged kartlara partial index.
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, merged_into_id) WHERE merged_into_id IS NOT NULL',
      r.tablename || '_firm_merged_into_idx', r.tablename);
  END LOOP;
END $$;

-- 002 firma için default tablo yaratılmışsa oraya da ekle (idempotent)
CREATE TABLE IF NOT EXISTS public.rex_002_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_nr VARCHAR(10) NOT NULL DEFAULT '002',
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
  merged_into_id UUID,
  merged_at TIMESTAMPTZ,
  merged_by TEXT,
  merge_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rex_002_parties_firm_code_uniq
  ON public.rex_002_parties (firm_nr, code) WHERE code IS NOT NULL;

ALTER TABLE public.rex_002_parties
  DROP CONSTRAINT IF EXISTS rex_parties_card_type_chk;
ALTER TABLE public.rex_002_parties
  ADD CONSTRAINT rex_parties_card_type_chk
  CHECK (card_type IN ('customer','supplier','employee','partner'));

CREATE INDEX IF NOT EXISTS rex_002_parties_firm_card_type_idx
  ON public.rex_002_parties (firm_nr, card_type);
CREATE INDEX IF NOT EXISTS rex_002_parties_firm_active_idx
  ON public.rex_002_parties (firm_nr, is_active);
CREATE INDEX IF NOT EXISTS rex_002_parties_merged_into_idx
  ON public.rex_002_parties (merged_into_id) WHERE merged_into_id IS NOT NULL;
