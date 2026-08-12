-- ============================================================================
-- 120: Gider (expenses) tablosuna status alanı ve onay/iptal audit sütunları
-- ============================================================================
-- Amaç:
--   * Mevcut `rex_{firmNr}_expenses` tablosuna `status` alanı eklemek
--     (draft / approved / cancelled state machine).
--   * Onay/iptal audit bilgileri (approved_by, approved_at, cancelled_by,
--     cancelled_at, cancelled_reason, last_edited_by, last_edited_at).
--   * `expense_closed_period` view yokluğunda dönem kontrolü için satır
--     başına `period_locked` işareti yerine `updated_at` ile audit sağlanır;
--     dönem kontrolü uygulama tarafında `PeriodControl` servisi ile yapılır.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS` (PostgreSQL 9.6+).
-- Tauri uyumu: DDL ayrı ALTER satırlarına bölünmüştür; DO $$ blokları yalnız
-- `pg_tables` üzerinden tüm firmaları gezmek için kullanılır.
-- ============================================================================

-- 1) Mevcut tüm `public.rex_<firmNr>_expenses` tablolarına yeni sütunları ekle.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_expenses$'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT ''draft''', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS approved_by UUID', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cancelled_by UUID', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cancelled_reason TEXT', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS last_edited_by UUID', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reopened_by UUID', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ', r.tablename);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS reopen_reason TEXT', r.tablename);

    -- Status check constraint idempotent olarak yeniden oluşturulur
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS rex_expenses_status_chk', r.tablename);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT rex_expenses_status_chk CHECK (status IN (''draft'',''approved'',''cancelled''))',
      r.tablename
    );

    -- Index'ler
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (status)', r.tablename || '_status_idx', r.tablename);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (firm_nr, status)', r.tablename || '_firm_status_idx', r.tablename);
  END LOOP;
END $$;

-- 2) Default firma 001 için son kez garanti (yeni kurulumlar)
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft';
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS approved_by UUID;
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS last_edited_by UUID;
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS reopened_by UUID;
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;
ALTER TABLE public.rex_001_expenses ADD COLUMN IF NOT EXISTS reopen_reason TEXT;

ALTER TABLE public.rex_001_expenses DROP CONSTRAINT IF EXISTS rex_expenses_status_chk;
ALTER TABLE public.rex_001_expenses
  ADD CONSTRAINT rex_expenses_status_chk
  CHECK (status IN ('draft','approved','cancelled'));

CREATE INDEX IF NOT EXISTS rex_001_expenses_status_idx ON public.rex_001_expenses (status);
CREATE INDEX IF NOT EXISTS rex_001_expenses_firm_status_idx ON public.rex_001_expenses (firm_nr, status);

-- ============================================================================
-- 119b: Mevcut satırları geriye dönük uyumlu hale getir.
--   * `status` sütunu yeni eklendi ve default 'draft'. Ancak eski onaylanmış
--     kayıtlar için 'draft' yanlış olur. created_at'i olan ve cash_line_id
--     bağlı kayıtları 'approved' kabul ediyoruz (geriye dönük audit).
-- ============================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename ~ '^rex_[0-9]+_expenses$'
  LOOP
    -- Cash_line bağlı tüm giderler geriye dönük olarak "approved" sayılır.
    EXECUTE format(
      'UPDATE public.%I SET status = ''approved'', approved_at = COALESCE(approved_at, created_at) WHERE cash_line_id IS NOT NULL AND status = ''draft''',
      r.tablename
    );
  END LOOP;
END $$;
